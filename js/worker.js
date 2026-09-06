// js/worker.js
import { CHUNK_SIZE, WORLD_DEPTH, WORLD_HEIGHT, MAX_LIGHT } from './constants.js';
import { getChunkKey } from './utils.js';
import { ChunkManager } from './chunkManager.js';
import { isBlockOpaque, BLOCKS, getRuntimeBlockDef, isBedBlockId, isBoatBlockId, isButtonId, isCakeBlockId, isChestId, isCropId, isDeadBushId, isDispenserId, isDoorId, isFarmlandId, isFenceId, isFlowerId, isGlassId, isLadderId, isLeverId, isMinecartBlockId, isMushroomId, isPaintingId, isPressurePlateId, isPumpkinId, isRailId, isRepeaterId, isSignId, isSignPostId, isSlabId, isTallGrassId, isTorchId, isTrapdoorId, isWallSignId, isWoolId, isCraftingTableId, isFurnaceId, isPistonId } from './blocks.js';
import { isFluidId, isWaterId, fluidKindFromId, LAVA_STILL_ID } from './fluidIds.js';
import { initTerrain, getTerrainData } from './terrain.js';
import { BETA_SEA_LEVEL, getChunkPopulationSeed } from './worldgen/betaTerrain.js';
import { JavaRandom, parseMinecraftSeed, toSigned64 } from './worldgen/javaRandom.js';
import { NoiseOctaves } from './worldgen/betaNoise.js';
import { BetaParityHarness } from './worldgen/betaGenerator.js';
import { getGrassColor, getFoliageColor, unpackRgb } from './colorizers.js';
import { PISTON_UV_ROTATION_BY_META } from './generated/pistonUvTemplate.js';
import { SOUTH_BED_FACES_BY_PART } from './generated/bedUvTemplate.js';
import { SOUTH_LEVER_FACES_BY_BLOCK_ID } from './generated/leverUvTemplate.js';
import { SOUTH_REPEATER_FACES_BY_BLOCK_ID } from './generated/repeaterUvTemplate.js';

const WATER_LEVEL = BETA_SEA_LEVEL;
const chunkManager = new ChunkManager();
let currentSeedVal = 0n;
let dimension = 'OVERWORLD'; // Added dimension state
let caveNoiseA = null;
let caveNoiseB = null;
let gravelNoise = null;
let parityHarness = null;
const parityTerrainColumns = new Set();
const parityPopulatedColumns = new Set();
const parityPopulateCheckedColumns = new Set();
const PINE_LEAF_TINT = { r: 0x61 / 255, g: 0x99 / 255, b: 0x61 / 255 };   // 0x619961
const BIRCH_LEAF_TINT = { r: 0x80 / 255, g: 0xA7 / 255, b: 0x55 / 255 };  // 0x80A755

// --- Batching State ---
const dirtyLighting = new Set(); // Stores keys of chunks needing light updates
const dirtyMeshing = new Set();  // Stores keys of chunks needing mesh regeneration
let updateTimeout = null;

// --- Load Chunk Queue (worker internal): pick next chunk by current distance to player
const loadChunkQueue = [];
const loadChunkQueuedKeys = new Set();
let loadChunkQueueScheduled = false;
const setBlockImmediateQueue = [];
const setBlockNormalQueue = [];
let setBlockSequence = 1;
let workLoopScheduled = false;
let playerPosition = null;
let lastWorkerStatsPost = 0;
const JACOBO_CHUNK_CACHE_RADIUS = 15;
let chunkTraceEnabled = false;

function emitChunkTrace(event, cx, cy, cz, extra = null) {
    if (!chunkTraceEnabled) return;
    self.postMessage({
        type: 'chunkTrace',
        data: { event, cx, cy, cz, extra }
    });
}

// Fixed max speed: not tied to FPS
const CHUNKS_PER_TICK = 56;
const MAX_MS_PER_TICK = 34;
const SETBLOCKS_PER_TICK = 96;
const SETBLOCKS_IMMEDIATE_PER_TICK = 96;
const TURBO_CHUNKS_PER_TICK = 96;
const TURBO_MAX_MS_PER_TICK = 56;
const SEND_LIGHT_IN_CHUNKDATA = false;

function getChunksPerTick() {
    const hasBlockPressure = setBlockImmediateQueue.length > 0 || setBlockNormalQueue.length > 24;
    const hasLoadBacklog = loadChunkQueue.length > 48;
    return (hasLoadBacklog && !hasBlockPressure) ? TURBO_CHUNKS_PER_TICK : CHUNKS_PER_TICK;
}

function getMaxMsPerTick() {
    const hasBlockPressure = setBlockImmediateQueue.length > 0 || setBlockNormalQueue.length > 24;
    const hasLoadBacklog = loadChunkQueue.length > 48;
    return (hasLoadBacklog && !hasBlockPressure) ? TURBO_MAX_MS_PER_TICK : MAX_MS_PER_TICK;
}

// Modifications (e.g. block breaks) that arrived via setBlock before the chunk load was processed.
// When we process loadChunk for a chunk, we apply these so the load doesn't overwrite user changes.
const pendingChunkModifications = new Map();
const persistedChunkModifications = new Map();
const dataSyncNeededChunks = new Set();
const chunkDataSentChunks = new Set();
const WORLD_MIN_CHUNK_Y = Math.ceil(WORLD_DEPTH / CHUNK_SIZE);
const WORLD_MAX_CHUNK_Y = Math.floor((WORLD_HEIGHT - 1) / CHUNK_SIZE);

const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], matIdx: 0, uv: [0, 0, 1, 0, 1, 1, 0, 1] },
    { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], matIdx: 1, uv: [0, 0, 1, 0, 1, 1, 0, 1] },
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], matIdx: 2, uv: [0, 0, 1, 0, 1, 1, 0, 1] },
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], matIdx: 3, uv: [0, 0, 1, 0, 1, 1, 0, 1] },
    { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], matIdx: 4, uv: [0, 0, 1, 0, 1, 1, 0, 1] },
    { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], matIdx: 5, uv: [0, 0, 1, 0, 1, 1, 0, 1] }
];

// --- Batching Functions ---

function scheduleChunkUpdates() {
    if (updateTimeout) return;
    updateTimeout = setTimeout(processDirtyChunks, 0);
}

function scheduleProcessLoadQueue() {
    if (workLoopScheduled) return;
    workLoopScheduled = true;
    setTimeout(() => {
        workLoopScheduled = false;
        runWorkerWorkLoop();
    }, 0);
}

function runWorkerWorkLoop() {
    loadChunkQueueScheduled = false;
    let immediateProcessed = 0;
    while (setBlockImmediateQueue.length > 0 && immediateProcessed < SETBLOCKS_IMMEDIATE_PER_TICK) {
        applySetBlock(setBlockImmediateQueue.shift());
        immediateProcessed++;
    }

    // Always allow chunk generation to run every work loop iteration so load streaming
    // cannot be starved by large fluid/setBlock bursts.
    processNextLoadChunk();

    let normalProcessed = 0;
    while (setBlockNormalQueue.length > 0 && normalProcessed < SETBLOCKS_PER_TICK) {
        applySetBlock(setBlockNormalQueue.shift());
        normalProcessed++;
    }

    maybePostWorkerStats();
    if (loadChunkQueue.length > 0 || setBlockImmediateQueue.length > 0 || setBlockNormalQueue.length > 0) {
        scheduleProcessLoadQueue();
    }
}

function maybePostWorkerStats() {
    const now = Date.now();
    if (now - lastWorkerStatsPost < 250) return;
    lastWorkerStatsPost = now;
    let oldestLoadMs = 0;
    for (let i = 0; i < loadChunkQueue.length; i++) {
        const age = now - (loadChunkQueue[i].enqueuedAt || now);
        if (age > oldestLoadMs) oldestLoadMs = age;
    }
    self.postMessage({
        type: 'workerStats',
        data: {
            loadQueue: loadChunkQueue.length,
            setBlockImmediate: setBlockImmediateQueue.length,
            setBlockNormal: setBlockNormalQueue.length,
            dirtyLighting: dirtyLighting.size,
            dirtyMeshing: dirtyMeshing.size,
            oldestLoadMs
        }
    });
}

function getNextLoadItem() {
    while (loadChunkQueue.length > 0) {
        const next = loadChunkQueue.shift();
        if (!next) break;
        loadChunkQueuedKeys.delete(`${next.cx},${next.cy},${next.cz}`);
        if (playerPosition) {
            const pcx = Math.floor(playerPosition.x / CHUNK_SIZE);
            const pcz = Math.floor(playerPosition.z / CHUNK_SIZE);
            if (
                next.cx < pcx - JACOBO_CHUNK_CACHE_RADIUS ||
                next.cx > pcx + JACOBO_CHUNK_CACHE_RADIUS ||
                next.cz < pcz - JACOBO_CHUNK_CACHE_RADIUS ||
                next.cz > pcz + JACOBO_CHUNK_CACHE_RADIUS
            ) {
                // Drop stale out-of-range queue entries to avoid starving nearby chunks.
                continue;
            }
        }
        return next;
    }
    return null;
}

function mergeModifications(existingMods, incomingMods) {
    if (!Array.isArray(incomingMods) || incomingMods.length === 0) {
        return Array.isArray(existingMods) ? existingMods : [];
    }
    if (!Array.isArray(existingMods) || existingMods.length === 0) {
        return incomingMods.slice();
    }
    const merged = existingMods.slice();
    const indexByPos = new Map();
    for (let i = 0; i < merged.length; i++) {
        const m = merged[i];
        if (!m) continue;
        indexByPos.set(`${m.x},${m.y},${m.z}`, i);
    }
    for (let i = 0; i < incomingMods.length; i++) {
        const m = incomingMods[i];
        if (!m) continue;
        const key = `${m.x},${m.y},${m.z}`;
        const idx = indexByPos.get(key);
        if (idx === undefined) {
            indexByPos.set(key, merged.length);
            merged.push(m);
        } else {
            merged[idx] = m;
        }
    }
    return merged;
}

function rebuildPersistedChunkModifications(mods) {
    persistedChunkModifications.clear();
    if (!Array.isArray(mods) || mods.length === 0) return;
    for (let i = 0; i < mods.length; i++) {
        const m = mods[i];
        if (!m) continue;
        const cx = Math.floor(m.x / CHUNK_SIZE);
        const cy = Math.floor(m.y / CHUNK_SIZE);
        const cz = Math.floor(m.z / CHUNK_SIZE);
        const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        const existing = persistedChunkModifications.get(key);
        if (!existing) persistedChunkModifications.set(key, [m]);
        else existing.push(m);
    }
}

function recordPersistedModification(mod) {
    if (!mod) return;
    const cx = Math.floor(mod.x / CHUNK_SIZE);
    const cy = Math.floor(mod.y / CHUNK_SIZE);
    const cz = Math.floor(mod.z / CHUNK_SIZE);
    const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
    let list = persistedChunkModifications.get(key);
    if (!list) {
        persistedChunkModifications.set(key, [mod]);
        return;
    }
    const posKey = `${mod.x},${mod.y},${mod.z}`;
    for (let i = 0; i < list.length; i++) {
        const existing = list[i];
        if (!existing) continue;
        if (`${existing.x},${existing.y},${existing.z}` === posKey) {
            list[i] = mod;
            return;
        }
    }
    list.push(mod);
}

function applyPersistedModsToLoadedChunk(cx, cy, cz) {
    const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
    const mods = persistedChunkModifications.get(key);
    if (!mods || mods.length === 0) return;
    for (let i = 0; i < mods.length; i++) {
        const mod = mods[i];
        if (!mod) continue;
        chunkManager.setBlock(mod.x, mod.y, mod.z, mod.id);
        if (mod.metadata !== undefined) {
            chunkManager.setMetadata(mod.x, mod.y, mod.z, mod.metadata);
        }
    }
}

function processNextLoadChunk() {
    const start = Date.now();
    let processed = 0;
    const chunksPerTick = getChunksPerTick();
    const maxMsPerTick = getMaxMsPerTick();
    const chunksToSend = new Set(); // Track chunk-coord keys to send chunkData after generation

    while (loadChunkQueue.length > 0 && processed < chunksPerTick && (Date.now() - start) < maxMsPerTick) {
        const item = getNextLoadItem();
        if (!item) break;
        const { cx, cy, cz, modifications } = item;
        const chunkKey = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        const persistedMods = persistedChunkModifications.get(chunkKey) || [];

        try {
            let chunk = chunkManager.getChunk(cx, cy, cz);
            let justGenerated = false;
            
            if (!chunk || !chunk.isGenerated) {
                generateChunk(cx, cy, cz);
                chunk = chunkManager.getChunk(cx, cy, cz);
                justGenerated = true;
            }

            if (dimension !== 'NETHER' && !justGenerated) {
                // A column may already exist as prerequisite terrain from a neighbor request.
                // Re-run populate readiness checks for the explicitly requested column so
                // decorations are never missed due request order.
                ensureParityTerrainNeighborhood3x3(cx, cz);
                runJacoboParityPopulateChecksCached(cx, cz);
            }

            // Always apply persisted modifications for this chunk. This covers cases
            // where a chunk was first loaded without mods and later re-requested.
            const combinedMods = mergeModifications(modifications || [], persistedMods);
            if (combinedMods.length > 0) {
                combinedMods.forEach(mod => {
                    chunkManager.setBlock(mod.x, mod.y, mod.z, mod.id);
                    if (mod.metadata !== undefined) chunkManager.setMetadata(mod.x, mod.y, mod.z, mod.metadata);
                });
            }

            // Alpha 0.94-style contract: main thread decides which chunk Y to request.
            // Worker returns exactly the requested chunk.
            chunksToSend.add(`${cx},${cy},${cz}`);

            const pending = pendingChunkModifications.get(chunkKey);
            if (pending && pending.length > 0) {
                pending.forEach(mod => {
                    chunkManager.setBlock(mod.x, mod.y, mod.z, mod.id);
                    if (mod.metadata !== undefined) chunkManager.setMetadata(mod.x, mod.y, mod.z, mod.metadata);
                });
                pendingChunkModifications.delete(chunkKey);
            }

            const hasIncomingMods = (modifications && modifications.length > 0) || persistedMods.length > 0;
            const hasPendingMods = !!(pending && pending.length > 0);
            const needsRelight = justGenerated || !chunk.lightReady || (dimension === 'NETHER') || hasIncomingMods || hasPendingMods;
            const affectedChunks = new Set();
            if (needsRelight) {
                updateChunkLighting(cx, cy, cz, affectedChunks);
                if (chunkManager.hasChunk(cx, cy - 1, cz)) {
                    updateChunkLighting(cx, cy - 1, cz, affectedChunks);
                }
                // When a new chunk appears, already-loaded neighbors must be relit too or border seams can remain stale.
                if (justGenerated) {
                    relightLoadedChunkRadius(cx, cy, cz, 1, 0, affectedChunks);
                }
            }

            const markLateralNeighborsDirtyIfLoaded = (tx, ty, tz) => {
                const lateral = [
                    [tx + 1, ty, tz],
                    [tx - 1, ty, tz],
                    [tx, ty, tz + 1],
                    [tx, ty, tz - 1]
                ];
                for (const [nx, ny, nz] of lateral) {
                    if (chunkManager.hasChunk(nx, ny, nz)) {
                        const nKey = getChunkKey(nx * CHUNK_SIZE, ny * CHUNK_SIZE, nz * CHUNK_SIZE);
                        dirtyMeshing.add(nKey);
                    }
                }
            };

            meshChunk(cx, cy, cz);
            // Reconcile border seams immediately for already-loaded neighboring chunks
            // (including diagonals for AO consistency at chunk corners).
            relightAndRemeshLoadedNeighborhood3x3(cx, cy, cz, affectedChunks);
            // Keep dirty fallback as additional safety for any queued mesh work.
            markLateralNeighborsDirtyIfLoaded(cx, cy, cz);
            if (needsRelight) {
                affectedChunks.delete(getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE));
                affectedChunks.forEach(key => dirtyMeshing.add(key));
                if (affectedChunks.size > 0 || dirtyMeshing.size > 0) scheduleChunkUpdates();
            }
            processed++;
        } catch (chunkErr) {
            console.error(`Error loading chunk ${cx},${cy},${cz}:`, chunkErr);
            self.postMessage({ type: 'chunkError', key: chunkKey });
        }
    }

    // Send all chunks that were generated/processed
    for (const key of chunksToSend) {
        const parts = key.split(',');
        sendChunkDataToMain(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10));
    }

    if (loadChunkQueue.length > 0) {
        scheduleProcessLoadQueue();
    }
}

function sendChunkDataToMain(cx, cy, cz) {
    const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
    applyPersistedModsToLoadedChunk(cx, cy, cz);
    const sendChunk = chunkManager.getChunk(cx, cy, cz);
    if (!sendChunk || !sendChunk.data || !sendChunk.metadata || !sendChunk.light) return;

    const dataCopy = sendChunk.data.slice(0);
    const metaCopy = sendChunk.metadata.slice(0);
    const lightCopy = SEND_LIGHT_IN_CHUNKDATA ? sendChunk.light.slice(0) : null;
    const transferables = [dataCopy.buffer, metaCopy.buffer];
    if (lightCopy) transferables.push(lightCopy.buffer);
    self.postMessage({
        type: 'chunkData',
        key,
        cx, cy, cz,
        data: dataCopy,
        metadata: metaCopy,
        light: lightCopy
    }, transferables);
    emitChunkTrace('chunkdata_sent', cx, cy, cz);
    chunkDataSentChunks.add(key);
}

function flushChunkDataSyncIfNeeded(cx, cy, cz) {
    const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
    if (!dataSyncNeededChunks.has(key)) return;
    sendChunkDataToMain(cx, cy, cz);
    dataSyncNeededChunks.delete(key);
}

const DIRTY_MS_BUDGET = 4;  // Prioritize fresh chunk generation throughput.
const DIRTY_MESH_PER_RUN = 2;

function processDirtyChunks() {
    updateTimeout = null;
    const start = Date.now();

    const lightingKeys = Array.from(dirtyLighting);
    dirtyLighting.clear();
    let lightingDone = false;
    for (const key of lightingKeys) {
        if (lightingDone || (Date.now() - start) >= DIRTY_MS_BUDGET) {
            dirtyLighting.add(key);
            if (!lightingDone) lightingDone = true;
        } else {
            const parts = key.split(',');
            const cx = parseInt(parts[0], 10);
            const cy = parseInt(parts[1], 10);
            const cz = parseInt(parts[2], 10);
            updateChunkLighting(cx, cy, cz, dirtyMeshing);
        }
    }

    let meshed = 0;
    const meshKeys = Array.from(dirtyMeshing);
    dirtyMeshing.clear();
    for (const key of meshKeys) {
        if ((Date.now() - start) >= DIRTY_MS_BUDGET || meshed >= DIRTY_MESH_PER_RUN) {
            dirtyMeshing.add(key);
        } else {
            const parts = key.split(',');
            const cx = parseInt(parts[0], 10);
            const cy = parseInt(parts[1], 10);
            const cz = parseInt(parts[2], 10);
            applyPersistedModsToLoadedChunk(cx, cy, cz);
            meshChunk(cx, cy, cz);
            if (dataSyncNeededChunks.has(key)) {
                sendChunkDataToMain(cx, cy, cz);
                dataSyncNeededChunks.delete(key);
            }
            meshed++;
        }
    }

    if (dirtyLighting.size > 0 || dirtyMeshing.size > 0) {
        scheduleChunkUpdates();
    }
}

function toLocalChunkCoord(v) {
    let m = v % CHUNK_SIZE;
    if (m < 0) m += CHUNK_SIZE;
    return m;
}

function remeshImmediateBorderNeighbors(wx, wy, wz, cx, cy, cz, affectedChunks) {
    const lx = toLocalChunkCoord(wx);
    const ly = toLocalChunkCoord(wy);
    const lz = toLocalChunkCoord(wz);
    const neighbors = [];
    if (lx === 0) neighbors.push([cx - 1, cy, cz]);
    if (lx === CHUNK_SIZE - 1) neighbors.push([cx + 1, cy, cz]);
    if (ly === 0) neighbors.push([cx, cy - 1, cz]);
    if (ly === CHUNK_SIZE - 1) neighbors.push([cx, cy + 1, cz]);
    if (lz === 0) neighbors.push([cx, cy, cz - 1]);
    if (lz === CHUNK_SIZE - 1) neighbors.push([cx, cy, cz + 1]);

    const seen = new Set();
    for (const [ncx, ncy, ncz] of neighbors) {
        const nKey = getChunkKey(ncx * CHUNK_SIZE, ncy * CHUNK_SIZE, ncz * CHUNK_SIZE);
        if (seen.has(nKey)) continue;
        seen.add(nKey);
        if (!chunkManager.hasChunk(ncx, ncy, ncz)) continue;
        dirtyLighting.delete(nKey);
        dirtyMeshing.delete(nKey);
        updateChunkLighting(ncx, ncy, ncz, affectedChunks);
        meshChunk(ncx, ncy, ncz);
    }
}

function getBlockLightEmission(id) {
    if (!id) return 0;
    const def = getRuntimeBlockDef(id);
    if (!def) return 0;
    if (def.glow) return MAX_LIGHT;
    return def.light || 0;
}

function queueAffectedChunkMeshes(affectedChunks, skipKey = null) {
    if (!affectedChunks || affectedChunks.size === 0) return;
    affectedChunks.forEach((key) => {
        if (key === skipKey) return;
        // Lighting for these chunks was already recalculated in this pass.
        dirtyLighting.delete(key);
        dirtyMeshing.add(key);
    });
}

function relightLoadedChunkRadius(centerCx, centerCy, centerCz, radiusXZ, radiusY, affectedChunks) {
    for (let dx = -radiusXZ; dx <= radiusXZ; dx++) {
        for (let dz = -radiusXZ; dz <= radiusXZ; dz++) {
            for (let dy = -radiusY; dy <= radiusY; dy++) {
                const cx = centerCx + dx;
                const cy = centerCy + dy;
                const cz = centerCz + dz;
                if (!chunkManager.hasChunk(cx, cy, cz)) continue;
                updateChunkLighting(cx, cy, cz, affectedChunks);
            }
        }
    }
}

function relightAndRemeshLoadedNeighborhood3x3(cx, cy, cz, affectedChunks) {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const nx = cx + dx;
            const nz = cz + dz;
            if (!chunkManager.hasChunk(nx, cy, nz)) continue;
            updateChunkLighting(nx, cy, nz, affectedChunks);
            meshChunk(nx, cy, nz);
        }
    }
}

function applySetBlock(data) {
    const cx = Math.floor(data.x / CHUNK_SIZE);
    const cy = Math.floor(data.y / CHUNK_SIZE);
    const cz = Math.floor(data.z / CHUNK_SIZE);
    const chunkKey = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
    
    // CRITICAL: Process ALL pending setBlock messages for this chunk first
    // This ensures we always mesh with the absolute latest state, preventing visual lag
    const pendingForChunk = [];
    for (let i = setBlockNormalQueue.length - 1; i >= 0; i--) {
        const pending = setBlockNormalQueue[i];
        const pcx = Math.floor(pending.x / CHUNK_SIZE);
        const pcy = Math.floor(pending.y / CHUNK_SIZE);
        const pcz = Math.floor(pending.z / CHUNK_SIZE);
        const pKey = getChunkKey(pcx * CHUNK_SIZE, pcy * CHUNK_SIZE, pcz * CHUNK_SIZE);
        if (pKey === chunkKey) {
            pendingForChunk.push(setBlockNormalQueue.splice(i, 1)[0]);
        }
    }
    
    // Preserve original enqueue order (oldest -> newest). We collect from the tail for O(n)
    // removals, so we must re-sort here before applying.
    pendingForChunk.sort((a, b) => (a.__seq || 0) - (b.__seq || 0));

    // Apply all pending updates for this chunk first (in enqueue order), then current update.
    let lightSourceChanged = false;
    for (const msg of pendingForChunk) {
        const oldId = chunkManager.getBlock(msg.x, msg.y, msg.z);
        if (getBlockLightEmission(oldId) !== getBlockLightEmission(msg.id)) {
            lightSourceChanged = true;
        }
        chunkManager.setBlock(msg.x, msg.y, msg.z, msg.id);
        if (msg.metadata !== undefined) chunkManager.setMetadata(msg.x, msg.y, msg.z, msg.metadata);
    }
    
    // Now apply the current update
    const oldCurrentId = chunkManager.getBlock(data.x, data.y, data.z);
    if (getBlockLightEmission(oldCurrentId) !== getBlockLightEmission(data.id)) {
        lightSourceChanged = true;
    }
    chunkManager.setBlock(data.x, data.y, data.z, data.id);
    if (data.metadata !== undefined) chunkManager.setMetadata(data.x, data.y, data.z, data.metadata);

    // Record all modifications (pending + current) for this chunk
    if (!pendingChunkModifications.has(chunkKey)) pendingChunkModifications.set(chunkKey, []);
    for (const msg of pendingForChunk) {
        const mod = {
            x: msg.x, y: msg.y, z: msg.z,
            id: msg.id,
            metadata: msg.metadata !== undefined ? msg.metadata : 0
        };
        pendingChunkModifications.get(chunkKey).push(mod);
        recordPersistedModification(mod);
    }
    const currentMod = {
        x: data.x, y: data.y, z: data.z,
        id: data.id,
        metadata: data.metadata !== undefined ? data.metadata : 0
    };
    pendingChunkModifications.get(chunkKey).push(currentMod);
    recordPersistedModification(currentMod);

    const neighbors = getChunkNeighbors(data.x, data.y, data.z);
    neighbors.forEach(n => {
        if ((n.cx === cx && n.cy === cy && n.cz === cz)) return;
        if (chunkManager.hasChunk(n.cx, n.cy, n.cz)) {
            const nKey = getChunkKey(n.cx * CHUNK_SIZE, n.cy * CHUNK_SIZE, n.cz * CHUNK_SIZE);
            dirtyLighting.add(nKey);
            dirtyMeshing.add(nKey);
        }
    });

    // Ensure chunk exists before meshing (setBlock creates it, but double-check)
    if (!chunkManager.hasChunk(cx, cy, cz)) {
        chunkManager.addChunk(cx, cy, cz);
    }

    const editSet = new Set();
    updateChunkLighting(cx, cy, cz, editSet);
    // Torch/lamp add/remove must clear/propagate across nearby loaded chunks, not only the edited chunk.
    if (lightSourceChanged) {
        relightLoadedChunkRadius(cx, cy, cz, 2, 1, editSet);
    }
    // Always mesh the edited chunk - meshChunk will send geometry
    meshChunk(cx, cy, cz);
    // If edit is on chunk border, immediately remesh touched neighbor chunks too.
    remeshImmediateBorderNeighbors(data.x, data.y, data.z, cx, cy, cz, editSet);
    queueAffectedChunkMeshes(editSet, chunkKey);

    if (dirtyLighting.size > 0 || dirtyMeshing.size > 0) {
        if (updateTimeout) clearTimeout(updateTimeout);
        scheduleChunkUpdates();
    }
}

self.onmessage = function(e) {
    try {
        const { type, data } = e.data;

        if (type === 'chunkTraceControl') {
            chunkTraceEnabled = !!(data && data.enabled);
            return;
        }

        // CRITICAL: Process setBlockBatch FIRST (water updates) to ensure they're handled immediately
        // This prevents visual lag by processing water updates before any other messages
        if (type === 'setBlockBatch') {
            // Process batch of updates (used for water updates to prevent visual lag)
            // Group by chunk and process all updates for each chunk together
            const byChunk = new Map();
            const normalizedUpdates = data.updates.map((update) => ({
                ...update,
                id: Number(update.id) || 0
            }));
            for (const update of normalizedUpdates) {
                const cx = Math.floor(update.x / CHUNK_SIZE);
                const cy = Math.floor(update.y / CHUNK_SIZE);
                const cz = Math.floor(update.z / CHUNK_SIZE);
                const chunkKey = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
                if (!byChunk.has(chunkKey)) byChunk.set(chunkKey, []);
                byChunk.get(chunkKey).push(update);
            }
            
            // Process each chunk's updates together
            for (const [chunkKey, updates] of byChunk) {
                const firstUpdate = updates[0];
                const cx = Math.floor(firstUpdate.x / CHUNK_SIZE);
                const cy = Math.floor(firstUpdate.y / CHUNK_SIZE);
                const cz = Math.floor(firstUpdate.z / CHUNK_SIZE);
                let lightSourceChanged = false;
                
                // Apply all updates for this chunk
                for (const update of updates) {
                    const oldId = chunkManager.getBlock(update.x, update.y, update.z);
                    if (getBlockLightEmission(oldId) !== getBlockLightEmission(update.id)) {
                        lightSourceChanged = true;
                    }
                    chunkManager.setBlock(update.x, update.y, update.z, update.id);
                    if (update.metadata !== undefined) {
                        chunkManager.setMetadata(update.x, update.y, update.z, update.metadata);
                    }
                }
                
                // Record modifications
                if (!pendingChunkModifications.has(chunkKey)) {
                    pendingChunkModifications.set(chunkKey, []);
                }
                for (const update of updates) {
                    const mod = {
                        x: update.x, y: update.y, z: update.z,
                        id: update.id,
                        metadata: update.metadata !== undefined ? update.metadata : 0
                    };
                    pendingChunkModifications.get(chunkKey).push(mod);
                    recordPersistedModification(mod);
                }
                
                // Update neighbors
                const editSet = new Set();
                for (const update of updates) {
                    const neighbors = getChunkNeighbors(update.x, update.y, update.z);
                    neighbors.forEach(n => {
                        if ((n.cx === cx && n.cy === cy && n.cz === cz)) return;
                        if (chunkManager.hasChunk(n.cx, n.cy, n.cz)) {
                            const nKey = getChunkKey(n.cx * CHUNK_SIZE, n.cy * CHUNK_SIZE, n.cz * CHUNK_SIZE);
                            dirtyLighting.add(nKey);
                            dirtyMeshing.add(nKey);
                        }
                    });
                }
                
                // Ensure chunk exists
                if (!chunkManager.hasChunk(cx, cy, cz)) {
                    chunkManager.addChunk(cx, cy, cz);
                }
                
                // Update lighting and mesh once with all updates applied
                updateChunkLighting(cx, cy, cz, editSet);
                if (lightSourceChanged) {
                    relightLoadedChunkRadius(cx, cy, cz, 2, 1, editSet);
                }
                meshChunk(cx, cy, cz);
                queueAffectedChunkMeshes(editSet, chunkKey);
                // Defer non-edited chunk meshing to dirty queues so edited chunk updates instantly.
            }
            
            // Don't schedule dirty chunk updates for batch - they're already processed synchronously
            // This ensures water visuals update immediately without any setTimeout delays
            return; // Exit early to skip other message processing
        }

        if (type === 'init') {
            currentSeedVal = parseMinecraftSeed(data.seed);
            if (data.dimension) dimension = data.dimension; // Set dimension if provided
            
            initTerrain(currentSeedVal);

            caveNoiseA = new NoiseOctaves(toSigned64(currentSeedVal + 3405691582n), 4);
            caveNoiseB = new NoiseOctaves(toSigned64(currentSeedVal + 2654435761n), 4);
            gravelNoise = new NoiseOctaves(toSigned64(currentSeedVal + 1597334677n), 3);
            parityHarness = new BetaParityHarness(currentSeedVal);
            parityTerrainColumns.clear();
            parityPopulatedColumns.clear();
            parityPopulateCheckedColumns.clear();

            chunkManager.clear();
            rebuildPersistedChunkModifications(data.modifiedBlocks || []);
            pendingChunkModifications.clear();
            dataSyncNeededChunks.clear();
            chunkDataSentChunks.clear();
            loadChunkQueue.length = 0;
            loadChunkQueuedKeys.clear();
            dirtyLighting.clear();
            dirtyMeshing.clear();
            setBlockImmediateQueue.length = 0;
            setBlockNormalQueue.length = 0;
        } else if (type === 'setBlock') {
                const normalizedData = {
                    ...data,
                    id: Number(data.id) || 0,
                    __seq: setBlockSequence++
                };
            // IMMEDIATE messages (player actions and water updates) bypass queue and process synchronously
            if (normalizedData.immediate) {
                const cx = Math.floor(normalizedData.x / CHUNK_SIZE);
                const cy = Math.floor(normalizedData.y / CHUNK_SIZE);
                const cz = Math.floor(normalizedData.z / CHUNK_SIZE);
                const chunkKey = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
                let lightSourceChanged = false;
                
                // Collect this message and any other immediate messages for the same chunk
                // that might already be in the queue (from rapid water updates)
                const messagesForChunk = [normalizedData];
                for (let i = setBlockImmediateQueue.length - 1; i >= 0; i--) {
                    const pending = setBlockImmediateQueue[i];
                    const pcx = Math.floor(pending.x / CHUNK_SIZE);
                    const pcy = Math.floor(pending.y / CHUNK_SIZE);
                    const pcz = Math.floor(pending.z / CHUNK_SIZE);
                    const pKey = getChunkKey(pcx * CHUNK_SIZE, pcy * CHUNK_SIZE, pcz * CHUNK_SIZE);
                    if (pKey === chunkKey) {
                        messagesForChunk.push(setBlockImmediateQueue.splice(i, 1)[0]);
                    }
                }

                // Preserve enqueue order (oldest -> newest) to avoid stale overwrite.
                messagesForChunk.sort((a, b) => (a.__seq || 0) - (b.__seq || 0));
                
                // Apply all updates for this chunk together, then mesh once
                // This ensures we always mesh with the absolute latest state
                for (const msg of messagesForChunk) {
                    const oldId = chunkManager.getBlock(msg.x, msg.y, msg.z);
                    if (getBlockLightEmission(oldId) !== getBlockLightEmission(msg.id)) {
                        lightSourceChanged = true;
                    }
                    chunkManager.setBlock(msg.x, msg.y, msg.z, msg.id);
                    if (msg.metadata !== undefined) chunkManager.setMetadata(msg.x, msg.y, msg.z, msg.metadata);
                }
                
                // Record modifications
                if (!pendingChunkModifications.has(chunkKey)) pendingChunkModifications.set(chunkKey, []);
                for (const msg of messagesForChunk) {
                    const mod = {
                        x: msg.x, y: msg.y, z: msg.z,
                        id: msg.id,
                        metadata: msg.metadata !== undefined ? msg.metadata : 0
                    };
                    pendingChunkModifications.get(chunkKey).push(mod);
                    recordPersistedModification(mod);
                }
                
                // Update neighbors
                const neighbors = getChunkNeighbors(normalizedData.x, normalizedData.y, normalizedData.z);
                neighbors.forEach(n => {
                    if ((n.cx === cx && n.cy === cy && n.cz === cz)) return;
                    if (chunkManager.hasChunk(n.cx, n.cy, n.cz)) {
                        const nKey = getChunkKey(n.cx * CHUNK_SIZE, n.cy * CHUNK_SIZE, n.cz * CHUNK_SIZE);
                        dirtyLighting.add(nKey);
                        dirtyMeshing.add(nKey);
                    }
                });
                
                // Ensure chunk exists
                if (!chunkManager.hasChunk(cx, cy, cz)) {
                    chunkManager.addChunk(cx, cy, cz);
                }
                
                // Update lighting and mesh once with all updates applied
                const editSet = new Set();
                updateChunkLighting(cx, cy, cz, editSet);
                if (lightSourceChanged) {
                    relightLoadedChunkRadius(cx, cy, cz, 2, 1, editSet);
                }
                meshChunk(cx, cy, cz);
                // If edit is on chunk border, immediately remesh touched neighbor chunks too.
                remeshImmediateBorderNeighbors(normalizedData.x, normalizedData.y, normalizedData.z, cx, cy, cz, editSet);
                queueAffectedChunkMeshes(editSet, chunkKey);
                
                if (dirtyLighting.size > 0 || dirtyMeshing.size > 0) {
                    if (updateTimeout) clearTimeout(updateTimeout);
                    scheduleChunkUpdates();
                }
            } else {
                // Normal messages go to queue
                setBlockNormalQueue.push(normalizedData);
            }
            
            scheduleProcessLoadQueue();

        } else if (type === 'playerPosition') {
            playerPosition = data && typeof data.x === 'number' ? { x: data.x, y: data.y, z: data.z } : null;

        } else if (type === 'loadChunk') {
            if (data && data.player && typeof data.player.x === 'number' && typeof data.player.y === 'number' && typeof data.player.z === 'number') {
                playerPosition = { x: data.player.x, y: data.player.y, z: data.player.z };
            }
            if (playerPosition) {
                const pcx = Math.floor(playerPosition.x / CHUNK_SIZE);
                const pcz = Math.floor(playerPosition.z / CHUNK_SIZE);
                if (
                    data.cx < pcx - JACOBO_CHUNK_CACHE_RADIUS ||
                    data.cx > pcx + JACOBO_CHUNK_CACHE_RADIUS ||
                    data.cz < pcz - JACOBO_CHUNK_CACHE_RADIUS ||
                    data.cz > pcz + JACOBO_CHUNK_CACHE_RADIUS
                ) {
                    return;
                }
            }
            const key = `${data.cx},${data.cy},${data.cz}`;
            if (!loadChunkQueuedKeys.has(key)) {
                loadChunkQueue.push({
                    cx: data.cx,
                    cy: data.cy,
                    cz: data.cz,
                    modifications: data.modifications || [],
                    enqueuedAt: Date.now()
                });
                loadChunkQueuedKeys.add(key);
            } else if (data.modifications && data.modifications.length > 0) {
                for (let i = loadChunkQueue.length - 1; i >= 0; i--) {
                    const q = loadChunkQueue[i];
                    if (q.cx === data.cx && q.cy === data.cy && q.cz === data.cz) {
                        q.modifications = mergeModifications(q.modifications, data.modifications);
                        break;
                    }
                }
            }
            scheduleProcessLoadQueue();
        } else if (type === 'loadChunkBatch') {
            if (data && data.player && typeof data.player.x === 'number' && typeof data.player.y === 'number' && typeof data.player.z === 'number') {
                playerPosition = { x: data.player.x, y: data.player.y, z: data.player.z };
            }
            const chunks = (data && Array.isArray(data.chunks)) ? data.chunks : [];
            let pcx = 0;
            let pcz = 0;
            let hasPlayerPos = false;
            if (playerPosition) {
                pcx = Math.floor(playerPosition.x / CHUNK_SIZE);
                pcz = Math.floor(playerPosition.z / CHUNK_SIZE);
                hasPlayerPos = true;
            }
            for (let i = 0; i < chunks.length; i++) {
                const c = chunks[i];
                if (!c) continue;
                if (
                    hasPlayerPos &&
                    (c.cx < pcx - JACOBO_CHUNK_CACHE_RADIUS ||
                     c.cx > pcx + JACOBO_CHUNK_CACHE_RADIUS ||
                     c.cz < pcz - JACOBO_CHUNK_CACHE_RADIUS ||
                     c.cz > pcz + JACOBO_CHUNK_CACHE_RADIUS)
                ) {
                    continue;
                }
                const key = `${c.cx},${c.cy},${c.cz}`;
                if (!loadChunkQueuedKeys.has(key)) {
                    loadChunkQueue.push({
                        cx: c.cx,
                        cy: c.cy,
                        cz: c.cz,
                        modifications: c.modifications || [],
                        enqueuedAt: Date.now()
                    });
                    loadChunkQueuedKeys.add(key);
                } else if (c.modifications && c.modifications.length > 0) {
                    for (let j = loadChunkQueue.length - 1; j >= 0; j--) {
                        const q = loadChunkQueue[j];
                        if (q.cx === c.cx && q.cy === c.cy && q.cz === c.cz) {
                            q.modifications = mergeModifications(q.modifications, c.modifications);
                            break;
                        }
                    }
                }
            }
            scheduleProcessLoadQueue();

        } else if (type === 'cancelChunk') {
            const { cx, cy, cz } = data;
            for (let i = loadChunkQueue.length - 1; i >= 0; i--) {
                const item = loadChunkQueue[i];
                if (item.cx === cx && item.cy === cy && item.cz === cz) {
                    loadChunkQueue.splice(i, 1);
                    loadChunkQueuedKeys.delete(`${cx},${cy},${cz}`);
                }
            }

        } else if (type === 'freeChunk') {
            const { cx, cy, cz } = data;
            chunkManager.removeChunk(cx, cy, cz);
            const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
            dataSyncNeededChunks.delete(key);
            chunkDataSentChunks.delete(key);
            if (dimension !== 'NETHER') {
                evictParityColumnIfUnused(cx, cz);
            }
        } else if (type === 'requestChunkGeometry') {
            const { cx, cy, cz } = data;
            // Process any pending setBlock messages first to ensure we have latest state
            while (setBlockImmediateQueue.length > 0) {
                const pendingData = setBlockImmediateQueue.shift();
                applySetBlock(pendingData);
            }
            while (setBlockNormalQueue.length > 0) {
                const pendingData = setBlockNormalQueue.shift();
                applySetBlock(pendingData);
            }
            // Always mesh if chunk exists, or create empty chunk and mesh if it doesn't
            if (!chunkManager.hasChunk(cx, cy, cz)) {
                chunkManager.addChunk(cx, cy, cz);
            }
            applyPersistedModsToLoadedChunk(cx, cy, cz);
            const litChunk = chunkManager.getChunk(cx, cy, cz);
            const editSet = new Set();
            if (!litChunk || !litChunk.lightReady) {
                updateChunkLighting(cx, cy, cz, editSet);
            }
            meshChunk(cx, cy, cz);
            const syncKey = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
            if (dataSyncNeededChunks.has(syncKey)) {
                sendChunkDataToMain(cx, cy, cz);
                dataSyncNeededChunks.delete(syncKey);
            }
        } else if (type === 'sampleLight') {
            const x = Math.floor(data.x);
            const y = Math.floor(data.y);
            const z = Math.floor(data.z);
            const cx = Math.floor(x / CHUNK_SIZE);
            const cy = Math.floor(y / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);
            let c = chunkManager.getChunk(cx, cy, cz);
            if (!c || !c.isGenerated) {
                generateChunk(cx, cy, cz);
                c = chunkManager.getChunk(cx, cy, cz);
            }
            // For parity probes we want settled current light, including cross-chunk influences.
            if (c) {
                const touched = new Set();
                updateChunkLighting(cx, cy, cz, touched);
                const nd = [
                    [1, 0, 0], [-1, 0, 0],
                    [0, 1, 0], [0, -1, 0],
                    [0, 0, 1], [0, 0, -1]
                ];
                for (const [dx, dy, dz] of nd) {
                    const ncx = cx + dx;
                    const ncy = cy + dy;
                    const ncz = cz + dz;
                    const n = chunkManager.getChunk(ncx, ncy, ncz);
                    if (n) updateChunkLighting(ncx, ncy, ncz, touched);
                }
                updateChunkLighting(cx, cy, cz, touched);
            }
            const sample = {
                x,
                y,
                z,
                id: chunkManager.getBlock(x, y, z),
                light: chunkManager.getLight(x, y, z)
            };
            self.postMessage({
                type: 'sampleLightResponse',
                requestId: data.requestId,
                sample
            });
        }
    } catch (err) {
        console.error("Worker Critical Error:", err);
    }
};

function getChunkNeighbors(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const set = new Set([`${cx},${cy},${cz}`]);
    const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    
    if (lx === 0) set.add(`${cx-1},${cy},${cz}`);
    if (lx === CHUNK_SIZE-1) set.add(`${cx+1},${cy},${cz}`);
    if (ly === 0) set.add(`${cx},${cy-1},${cz}`);
    if (ly === CHUNK_SIZE-1) set.add(`${cx},${cy+1},${cz}`);
    if (lz === 0) set.add(`${cx},${cy},${cz-1}`);
    if (lz === CHUNK_SIZE-1) set.add(`${cx},${cy},${cz+1}`);

    return Array.from(set).map(k => {
        const p = k.split(',').map(Number);
        return { cx: p[0], cy: p[1], cz: p[2] };
    });
}

function updateChunkLighting(cx, cy, cz, affectedChunks) {
    const chunk = chunkManager.getChunk(cx, cy, cz);
    if (!chunk) return;
    if (chunk._lightingInProgress) return;
    chunk._lightingInProgress = true;

    try {
        const chunkKey = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        affectedChunks.add(chunkKey);

        const oldBottomLight = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        for(let x=0; x<CHUNK_SIZE; x++) {
            for(let z=0; z<CHUNK_SIZE; z++) {
                oldBottomLight[x + z*CHUNK_SIZE] = chunk.getLight(x, 0, z);
            }
        }

        chunk.light.fill(0);
        const lightQueue = [];

        const enqueue = (lx, ly, lz, val) => {
            const current = chunk.getLight(lx, ly, lz);
            if (val > current) {
                chunk.setLight(lx, ly, lz, val);
                lightQueue.push({x: lx, y: ly, z: lz, val});
            }
        };

        let chunkAbove = chunkManager.getChunk(cx, cy + 1, cz);
        if (chunkAbove && !chunkAbove.lightReady && !chunkAbove._lightingInProgress) {
            updateChunkLighting(cx, cy + 1, cz, affectedChunks);
            chunkAbove = chunkManager.getChunk(cx, cy + 1, cz);
        }
    
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                let incomingLight = 0;
                if (chunkAbove) {
                    incomingLight = chunkAbove.getLight(lx, 0, lz);
                } else {
                    incomingLight = (cy >= 0) ? MAX_LIGHT : 0;
                }

                let currentColumnLight = incomingLight;
            
                for (let ly = CHUNK_SIZE - 1; ly >= 0; ly--) {
                    const id = chunk.getBlock(lx, ly, lz);
                    const opaque = isBlockOpaque(id);

                    if (opaque) {
                        currentColumnLight = 0; 
                    } else {
                        if (isFluidId(id)) {
                            currentColumnLight = Math.max(0, currentColumnLight - 3);
                        } else if (id === 5) {
                            currentColumnLight = Math.max(0, currentColumnLight - 1);
                        }
                    
                        if (currentColumnLight > 0) {
                            enqueue(lx, ly, lz, currentColumnLight);
                        }
                    }
                }
            }
        }

        const checkNeighbor = (ncx, ncy, ncz, iterX, iterY, iterZ, getNeighborCoords, getMyCoords, applyHorizontalSeamTweak = false) => {
        const neighbor = chunkManager.getChunk(ncx, ncy, ncz);
        if (!neighbor) return;

        const minX = iterX ? 0 : 0, maxX = iterX ? CHUNK_SIZE : 1;
        const minY = iterY ? 0 : 0, maxY = iterY ? CHUNK_SIZE : 1;
        const minZ = iterZ ? 0 : 0, maxZ = iterZ ? CHUNK_SIZE : 1;

        for(let x=minX; x<maxX; x++) {
            for(let y=minY; y<maxY; y++) {
                for(let z=minZ; z<maxZ; z++) {
                    const nc = getNeighborCoords(x, y, z);
                    const mc = getMyCoords(x, y, z);

                    const nVal = neighbor.getLight(nc.x, nc.y, nc.z);
                    if (nVal > 1) {
                        const myId = chunk.getBlock(mc.x, mc.y, mc.z);
                        if (!isBlockOpaque(myId)) {
                            let decay = 1;
                            if (isFluidId(myId) || myId === 79) decay = 3;
                            // Horizontal seam tweak: avoid +1 over-bright seams for low block-light values.
                            if (applyHorizontalSeamTweak && nVal <= 12) decay = Math.max(decay, 2);
                            enqueue(mc.x, mc.y, mc.z, nVal - decay);
                        }
                    }
                }
            }
        }
        };

        checkNeighbor(cx-1, cy, cz, false, true, true, (x,y,z) => ({x: 15, y, z}), (x,y,z) => ({x: 0, y, z}), true);
        checkNeighbor(cx+1, cy, cz, false, true, true, (x,y,z) => ({x: 0, y, z}), (x,y,z) => ({x: 15, y, z}), true);
        checkNeighbor(cx, cy, cz-1, true, true, false, (x,y,z) => ({x, y, z: 15}), (x,y,z) => ({x, y, z: 0}), true);
        checkNeighbor(cx, cy, cz+1, true, true, false, (x,y,z) => ({x, y, z: 0}), (x,y,z) => ({x, y, z: 15}), true);
        checkNeighbor(cx, cy-1, cz, true, false, true, (x,y,z) => ({x, y: 15, z}), (x,y,z) => ({x, y: 0, z}), false);
        checkNeighbor(cx, cy+1, cz, true, false, true, (x,y,z) => ({x, y: 0, z}), (x,y,z) => ({x, y: 15, z}), false);

        for(let x=0; x<CHUNK_SIZE; x++) {
            for(let y=0; y<CHUNK_SIZE; y++) {
                for(let z=0; z<CHUNK_SIZE; z++) {
                    const id = chunk.getBlock(x, y, z);
                    if (id !== 0) {
                        const def = getRuntimeBlockDef(id);
                        if (def && (def.light || def.glow)) {
                            enqueue(x, y, z, def.light || MAX_LIGHT);
                        }
                    }
                }
            }
        }

    const dirs = [
        {x:1,y:0,z:0}, {x:-1,y:0,z:0},
        {x:0,y:1,z:0}, {x:0,y:-1,z:0},
        {x:0,y:0,z:1}, {x:0,y:0,z:-1}
    ];

        let head = 0;
        while(head < lightQueue.length) {
            const {x, y, z, val} = lightQueue[head++];
        
        if (val <= 1) continue; 

        for(const dir of dirs) {
            const nx = x + dir.x;
            const ny = y + dir.y;
            const nz = z + dir.z;

            if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
                const nId = chunk.getBlock(nx, ny, nz);
                if (!isBlockOpaque(nId)) {
                    const decay = isFluidId(nId) ? 3 : 1; 
                    const nextVal = Math.max(0, val - decay);
                    if (nextVal > chunk.getLight(nx, ny, nz)) {
                        chunk.setLight(nx, ny, nz, nextVal);
                        lightQueue.push({x: nx, y: ny, z: nz, val: nextVal});
                    }
                }
            } else {
                const ncx = cx + (nx < 0 ? -1 : (nx >= CHUNK_SIZE ? 1 : 0));
                const ncy = cy + (ny < 0 ? -1 : (ny >= CHUNK_SIZE ? 1 : 0));
                const ncz = cz + (nz < 0 ? -1 : (nz >= CHUNK_SIZE ? 1 : 0));
                
                const neighbor = chunkManager.getChunk(ncx, ncy, ncz);
                if (neighbor) {
                    const lnx = (nx + CHUNK_SIZE) % CHUNK_SIZE;
                    const lny = (ny + CHUNK_SIZE) % CHUNK_SIZE;
                    const lnz = (nz + CHUNK_SIZE) % CHUNK_SIZE;
                    
                    const nVal = neighbor.getLight(lnx, lny, lnz);
                    const proposed = val - 1; 
                    
                    if (proposed > nVal) {
                        const nKey = getChunkKey(ncx * CHUNK_SIZE, ncy * CHUNK_SIZE, ncz * CHUNK_SIZE);
                        if (!affectedChunks.has(nKey)) {
                            updateChunkLighting(ncx, ncy, ncz, affectedChunks);
                        }
                    }
                }
            }
        }
        }

        let bottomChanged = false;
        for(let x=0; x<CHUNK_SIZE; x++) {
            for(let z=0; z<CHUNK_SIZE; z++) {
                if (chunk.getLight(x, 0, z) !== oldBottomLight[x + z*CHUNK_SIZE]) {
                    bottomChanged = true;
                    break;
                }
            }
            if (bottomChanged) break;
        }

        if (bottomChanged) {
            updateChunkLighting(cx, cy - 1, cz, affectedChunks);
        }
        chunk.lightReady = true;
    } finally {
        chunk._lightingInProgress = false;
    }
}

function getChunkAndLocal(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    let chunk = chunkManager.getChunk(cx, cy, cz);
    if (!chunk) {
        chunk = chunkManager.addChunk(cx, cy, cz);
        if (!chunk.modifiedIndices) chunk.modifiedIndices = new Set();
    }
    const lx = (wx % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = (wy % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = (wz % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const idx = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
    return { chunk, lx, ly, lz, idx };
}

function setGeneratedBlock(wx, wy, wz, id, overwrite = false) {
    if (wy < WORLD_DEPTH || wy > WORLD_HEIGHT) return;
    const t = getChunkAndLocal(wx, wy, wz);
    if (t.chunk.modifiedIndices.has(t.idx)) return;
    if (!overwrite && t.chunk.data[t.idx] !== 0) return;
    t.chunk.data[t.idx] = id;
}

function copyColumnFromParity(cx, cz) {
    for (let cy = 0; cy < 8; cy++) {
        const src = parityHarness.chunkManager.getChunk(cx, cy, cz);
        let dst = chunkManager.getChunk(cx, cy, cz);
        if (!dst) dst = chunkManager.addChunk(cx, cy, cz);

        if (!src) {
            dst.isGenerated = true;
            dst.lightReady = false;
            continue;
        }

        dst.data.set(src.data);
        if (src.metadata) dst.metadata.set(src.metadata);
        if (src.light) dst.light.set(src.light);
        dst.isGenerated = true;
        dst.lightReady = false;
        // Runtime modifiedIndices tracks player edits; parity source write-tracking is not needed here.
        if (!dst.modifiedIndices) dst.modifiedIndices = new Set();
        else dst.modifiedIndices.clear();
    }
}

function syncLoadedChunksFromParityColumn(cx, cz) {
    for (let cy = WORLD_MIN_CHUNK_Y; cy <= WORLD_MAX_CHUNK_Y; cy++) {
        if (!chunkManager.hasChunk(cx, cy, cz)) continue;
        copyChunkFromParity(cx, cy, cz);
    }
}

function copyChunkFromParity(cx, cy, cz) {
    const src = parityHarness.chunkManager.getChunk(cx, cy, cz);
    let dst = chunkManager.getChunk(cx, cy, cz);
    if (!dst) dst = chunkManager.addChunk(cx, cy, cz);

    if (!src) {
        dst.data.fill(0);
        dst.metadata.fill(0);
        dst.light.fill(0);
        dst.isGenerated = true;
        dst.lightReady = false;
        if (!dst.modifiedIndices) dst.modifiedIndices = new Set();
        return;
    }

    dst.data.set(src.data);
    if (src.metadata) dst.metadata.set(src.metadata);
    if (src.light) dst.light.set(src.light);
    dst.isGenerated = true;
    dst.lightReady = false;
    // Runtime modifiedIndices tracks player edits; parity source write-tracking is not needed here.
    if (!dst.modifiedIndices) dst.modifiedIndices = new Set();
    else dst.modifiedIndices.clear();
}

function ensureParityTerrainColumnGenerated(cx, cz) {
    if (!parityHarness) parityHarness = new BetaParityHarness(currentSeedVal);
    const key = `${cx},${cz}`;
    if (parityTerrainColumns.has(key)) return false;
    if (!parityHarness._loadedChunkColumns) parityHarness._loadedChunkColumns = new Set();
    parityHarness._loadedChunkColumns.add(key);
    parityHarness.generateBaseTerrainColumn(cx, cz);
    parityHarness.replaceBlocksForBiome(cx, cz);
    parityHarness.carveCavesColumn(cx, cz);
    parityTerrainColumns.add(key);
    emitChunkTrace('terrain_generated', cx, null, cz);
    return true;
}

function parityTerrainExists(cx, cz) {
    return parityTerrainColumns.has(`${cx},${cz}`);
}

function maybePopulateParityColumn(cx, cz) {
    if (!parityHarness) return false;
    const key = `${cx},${cz}`;
    if (parityPopulatedColumns.has(key)) return false;
    if (!parityTerrainExists(cx, cz)) return false;
    // Jacobo populate prerequisite in ChunkProvider[LoadOrGenerate]:
    // current + east + south + southeast columns must exist.
    if (!parityTerrainExists(cx + 1, cz)) return false;
    if (!parityTerrainExists(cx, cz + 1)) return false;
    if (!parityTerrainExists(cx + 1, cz + 1)) return false;
    parityHarness.populateChunk(cx, cz);
    const hadLoadedChunks = hasAnyLoadedChunkInColumn(cx, cz);
    if (hadLoadedChunks) {
        syncLoadedChunksFromParityColumn(cx, cz);
    }
    for (let cy = WORLD_MIN_CHUNK_Y; cy <= WORLD_MAX_CHUNK_Y; cy++) {
        const chunkKey = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        if (chunkDataSentChunks.has(chunkKey)) {
            dataSyncNeededChunks.add(chunkKey);
        }
    }
    if (hadLoadedChunks) {
        relightGeneratedColumn(cx, cz);
        scheduleChunkUpdates();
    }
    parityPopulatedColumns.add(key);
    emitChunkTrace('populated', cx, null, cz);
    return true;
}

function runJacoboParityPopulateChecks(cx, cz) {
    // Jacobo/provider populate order: nw, w, n, c.
    // Needed so cross-chunk decorations (e.g. tree spillover) match vanilla layout.
    maybePopulateParityColumn(cx - 1, cz - 1);
    maybePopulateParityColumn(cx - 1, cz);
    maybePopulateParityColumn(cx, cz - 1);
    maybePopulateParityColumn(cx, cz);
}

function runJacoboParityPopulateChecksCached(cx, cz) {
    const key = `${cx},${cz}`;
    if (parityPopulateCheckedColumns.has(key)) return;
    runJacoboParityPopulateChecks(cx, cz);
    parityPopulateCheckedColumns.add(key);
}

function ensureParityTerrainNeighborhood3x3(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
            const tx = cx + dx;
            const tz = cz + dz;
            if (ensureParityTerrainColumnGenerated(tx, tz)) {
                tryPopulateReadyColumnsAround(tx, tz);
            }
        }
    }
}

function tryPopulateReadyColumnsAround(cx, cz) {
    // If terrain at (cx,cz) just became available, these are the only columns
    // whose prerequisite set (self,east,south,southeast) could now be satisfied.
    maybePopulateParityColumn(cx, cz);
    maybePopulateParityColumn(cx - 1, cz);
    maybePopulateParityColumn(cx, cz - 1);
    maybePopulateParityColumn(cx - 1, cz - 1);
}

function hasAnyLoadedChunkInColumn(cx, cz) {
    for (let cy = WORLD_MIN_CHUNK_Y; cy <= WORLD_MAX_CHUNK_Y; cy++) {
        if (chunkManager.hasChunk(cx, cy, cz)) return true;
    }
    return false;
}

function evictParityColumnIfUnused(cx, cz) {
    if (hasAnyLoadedChunkInColumn(cx, cz)) return;
    const key = `${cx},${cz}`;
    parityTerrainColumns.delete(key);
    parityPopulatedColumns.delete(key);
    parityPopulateCheckedColumns.delete(key);
    if (!parityHarness || !parityHarness.chunkManager) return;
    for (let cy = WORLD_MIN_CHUNK_Y; cy <= WORLD_MAX_CHUNK_Y; cy++) {
        parityHarness.chunkManager.removeChunk(cx, cy, cz);
    }
}

function relightGeneratedColumn(cx, cz) {
    const affected = new Set();
    for (let cy = 7; cy >= 0; cy--) {
        if (chunkManager.hasChunk(cx, cy, cz)) {
            updateChunkLighting(cx, cy, cz, affected);
        }
    }
    for (const key of affected) {
        dirtyMeshing.add(key);
    }
}

function placeSimpleTree(wx, wy, wz) {
    for (let h = 1; h <= 4; h++) {
        setGeneratedBlock(wx, wy + h, wz, 4);
    }
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            for (let dy = 3; dy <= 5; dy++) {
                if (Math.abs(dx) + Math.abs(dz) > 3) continue;
                if (dx === 0 && dz === 0 && dy < 5) continue;
                setGeneratedBlock(wx + dx, wy + dy, wz + dz, 5);
            }
        }
    }
}

function generateOreVeinAt(wx, wy, wz, oreId, size, rng) {
    for (let i = 0; i < size; i++) {
        const ox = wx + rng.nextInt(3) - 1;
        const oy = wy + rng.nextInt(3) - 1;
        const oz = wz + rng.nextInt(3) - 1;
        if (oy < WORLD_DEPTH + 1 || oy > WORLD_HEIGHT - 1) continue;
        const current = chunkManager.getBlock(ox, oy, oz);
        if (current === 3 || current === 2) {
            setGeneratedBlock(ox, oy, oz, oreId, true);
        }
    }
}

function runOrePass(cx, cz, rng, oreId, count, size, minY, maxY, triangular = false) {
    for (let i = 0; i < count; i++) {
        const wx = cx * CHUNK_SIZE + rng.nextInt(CHUNK_SIZE);
        const wz = cz * CHUNK_SIZE + rng.nextInt(CHUNK_SIZE);
        let wy;
        if (triangular) {
            const spread = maxY - minY + 1;
            wy = minY + Math.floor((rng.nextInt(spread) + rng.nextInt(spread)) * 0.5);
        } else {
            wy = minY + rng.nextInt(maxY - minY + 1);
        }
        generateOreVeinAt(wx, wy, wz, oreId, size, rng);
    }
}

function placeLake(cx, cz, rng, fluidId) {
    const wx = cx * CHUNK_SIZE + rng.nextInt(CHUNK_SIZE);
    const wz = cz * CHUNK_SIZE + rng.nextInt(CHUNK_SIZE);
    const surface = getTerrainData(wx, wz).y;
    const wy = Math.max(6, Math.min(surface - 2, 112));
    if (wy <= WORLD_DEPTH + 2) return;

    for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
            for (let dy = -2; dy <= 2; dy++) {
                const dist = (dx * dx) / 9 + (dz * dz) / 9 + (dy * dy) / 4;
                if (dist > 1) continue;
                const tx = wx + dx;
                const ty = wy + dy;
                const tz = wz + dz;
                if (dy <= 0) setGeneratedBlock(tx, ty, tz, fluidId, true);
                else setGeneratedBlock(tx, ty, tz, 0, true);
            }
        }
    }
}

function populateChunk(cx, cz) {
    const seed = getChunkPopulationSeed(currentSeedVal, cx, cz);
    const rng = new JavaRandom(seed);

    runOrePass(cx, cz, rng, 10, 20, 16, 0, 127, false); // Coal
    runOrePass(cx, cz, rng, 12, 20, 8, 0, 63, false);   // Iron
    runOrePass(cx, cz, rng, 13, 1, 7, 0, 15, false);    // Diamond
    runOrePass(cx, cz, rng, 11, 1, 6, 0, 31, true);     // URL as lapis replacement

    if (rng.nextInt(4) === 0) placeLake(cx, cz, rng, 6);
    if (rng.nextInt(8) === 0) placeLake(cx, cz, rng, 51);

    const treeAttempts = 2 + rng.nextInt(6);
    for (let i = 0; i < treeAttempts; i++) {
        const wx = cx * CHUNK_SIZE + rng.nextInt(CHUNK_SIZE);
        const wz = cz * CHUNK_SIZE + rng.nextInt(CHUNK_SIZE);
        const t = getTerrainData(wx, wz);
        if (t.isDesert || t.y <= WATER_LEVEL + 1) continue;
        const treeChance = t.vegetationDensity > 0.7 ? 0.7 : (t.vegetationDensity > 0.4 ? 0.35 : 0.12);
        if (rng.nextDouble() < treeChance) placeSimpleTree(wx, t.y, wz);
    }

    const flowerAttempts = 2 + rng.nextInt(3);
    for (let i = 0; i < flowerAttempts; i++) {
        const wx = cx * CHUNK_SIZE + rng.nextInt(CHUNK_SIZE);
        const wz = cz * CHUNK_SIZE + rng.nextInt(CHUNK_SIZE);
        const t = getTerrainData(wx, wz);
        if (t.isDesert || t.y <= WATER_LEVEL) continue;
        const aboveId = chunkManager.getBlock(wx, t.y + 1, wz);
        const ground = chunkManager.getBlock(wx, t.y, wz);
        if (aboveId !== 0 || (ground !== 1 && ground !== 64)) continue;
        setGeneratedBlock(wx, t.y + 1, wz, rng.nextBoolean() ? 54 : 55, true);
    }
}

function buildBedrockMaskBeta(cx, cz) {
    const seed = BigInt(cx) * 341873128712n + BigInt(cz) * 132897987541n;
    const rand = new JavaRandom(seed);
    const mask = new Uint8Array(32768);

    // Match Beta replaceBlocksForBiome random consumption order.
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let y = WORLD_HEIGHT; y >= WORLD_DEPTH; y--) {
                if (y <= rand.nextInt(5)) {
                    mask[y + lz * 128 + lx * 128 * CHUNK_SIZE] = 1;
                }
            }
        }
    }
    return mask;
}

function generateChunk(cx, cy, cz) {
    const existingBefore = chunkManager.getChunk(cx, cy, cz);
    const wasGenerated = !!(existingBefore && existingBefore.isGenerated);
    // Authoritative runtime path: all non-NETHER dimensions use the parity pipeline.
    if (dimension !== 'NETHER') {
        if (!parityTerrainExists(cx, cz)) {
            ensureParityTerrainNeighborhood3x3(cx, cz);
        }
        runJacoboParityPopulateChecksCached(cx, cz);

        let generated = chunkManager.getChunk(cx, cy, cz);
        // If the column was generated before but this specific chunk was freed,
        // restore it from the parity cache instead of creating an empty chunk.
        if (!generated || !generated.isGenerated) {
            copyChunkFromParity(cx, cy, cz);
            generated = chunkManager.getChunk(cx, cy, cz);
        }
        if (!generated) generated = chunkManager.addChunk(cx, cy, cz);
        if (!generated.modifiedIndices) generated.modifiedIndices = new Set();
        generated.isGenerated = true;
        generated.lightReady = false;
        if (!wasGenerated) emitChunkTrace('generated', cx, cy, cz);
        return;
    }

    let chunk = chunkManager.getChunk(cx, cy, cz);
    if (!chunk) chunk = chunkManager.addChunk(cx, cy, cz);
    if (!chunk.modifiedIndices) chunk.modifiedIndices = new Set();
    chunk.isGenerated = true;
    chunk.lightReady = false;

    const chunkMinY = cy * CHUNK_SIZE;
    const chunkMaxY = chunkMinY + CHUNK_SIZE - 1;
    if (chunkMaxY < WORLD_DEPTH || chunkMinY > WORLD_HEIGHT) return;

    const bedrockMask = buildBedrockMaskBeta(cx, cz);

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;
            const terrain = getTerrainData(wx, wz);
            const surfaceY = terrain.y;

            for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                const wy = chunkMinY + ly;
                if (wy < WORLD_DEPTH || wy > WORLD_HEIGHT) continue;
                const index = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
                if (chunk.modifiedIndices.has(index)) continue;
                if (chunk.data[index] !== 0) continue;

                let type = 0;
                if (bedrockMask[wy + lz * 128 + lx * 128 * CHUNK_SIZE] === 1) {
                    type = 8;
                } else if (wy <= surfaceY) {
                    const depth = surfaceY - wy;
                    if (depth === 0) type = terrain.isDesert ? 9 : (terrain.isSnow ? 64 : 1);
                    else if (depth < 4) type = terrain.isDesert ? 9 : 2;
                    else type = 3;
                } else if (wy <= WATER_LEVEL) {
                    type = 6;
                }

                if (type === 3 && gravelNoise && gravelNoise.noise(wx / 32, wy / 32, wz / 32) > 0.62) {
                    type = 57;
                }

                if (dimension === 'NETHER') {
                    if (type === 1 || type === 2 || type === 3 || type === 9 || type === 64) type = 80;
                    if (isWaterId(type)) type = LAVA_STILL_ID;
                }

                if (type !== 0) chunk.data[index] = type;
            }
        }
    }

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            const wy = chunkMinY + ly;
            if (wy <= WORLD_DEPTH || wy >= WORLD_HEIGHT) continue;
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const wx = cx * CHUNK_SIZE + lx;
                const wz = cz * CHUNK_SIZE + lz;
                const index = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
                const block = chunk.data[index];
                if (block === 0 || block === 8) continue;
                const surfaceY = getTerrainData(wx, wz).y;
                if (wy >= surfaceY - 1) continue;
                const nA = caveNoiseA ? caveNoiseA.noise(wx / 48, wy / 32, wz / 48) : 0;
                const nB = caveNoiseB ? caveNoiseB.noise(wx / 24, wy / 24, wz / 24) : 0;
                if (nA + (nB * 0.5) > 0.88) {
                    chunk.data[index] = (wy < 10 && dimension !== 'NETHER') ? 51 : 0;
                }
            }
        }
    }

    // Legacy local populate path is intentionally retired for OVERWORLD;
    // non-NETHER generation returns early via parity pipeline above.
    if (!wasGenerated) emitChunkTrace('generated', cx, cy, cz);
}

// --- AO & SMOOTH LIGHTING HELPERS ---
function vertexAO(side1, side2, corner) {
    if (side1 && side2) return 3; // Fully cornered
    return (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0);
}

// Helper to calculate smooth water height for a specific corner
function getWaterBlockHeight(wx, wy, wz) {
    const id = chunkManager.getBlock(wx, wy, wz);
    if (!isFluidId(id)) return -1;
    
    // Check if fluid is directly above
    const aboveId = chunkManager.getBlock(wx, wy + 1, wz);
    if (fluidKindFromId(aboveId) === fluidKindFromId(id)) return 1.0;
    
    const meta = chunkManager.getMetadata(wx, wy, wz);
    // Source (0) = 0.875 (7/8ths)
    // Decreases by 0.125 (1/8th) per level
    return Math.max(0.125, 0.875 - (meta * 0.125));
}

function meshChunk(cx, cy, cz) {
    const chunk = chunkManager.getChunk(cx, cy, cz);
    if (!chunk) return;

    const geometryData = {};
    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;
    const startZ = cz * CHUNK_SIZE;
    const climateCache = new Map();

    // Retrieve block solidity
    const isSolid = (x, y, z) => {
        const id = chunkManager.getBlock(x, y, z);
        return isBlockOpaque(id) && id !== 0; 
    };
    
    // Retrieve Light Level (0-15) safely
    const getL = (x, y, z) => {
        return chunkManager.getLight(x, y, z);
    };

    const getColumnTint = (wx, wz, foliage = false) => {
        const key = `${wx},${wz},${foliage ? 'f' : 'g'}`;
        const cached = climateCache.get(key);
        if (cached) return cached;
        const terrain = getTerrainData(wx, wz);
        const temp = Number.isFinite(terrain?.temperature) ? terrain.temperature : terrain?.temp;
        const humidity = Number.isFinite(terrain?.humidity) ? terrain.humidity : 1;
        const rgb = foliage
            ? getFoliageColor(Number.isFinite(temp) ? temp : 0.5, humidity)
            : getGrassColor(Number.isFinite(temp) ? temp : 0.5, humidity);
        const tint = unpackRgb(rgb);
        climateCache.set(key, tint);
        return tint;
    };

    const getRepeaterForward = (meta = 0) => {
        switch (meta & 3) {
            case 0: return { x: 0, z: -1 };  // north
            case 1: return { x: 1, z: 0 };   // east
            case 2: return { x: 0, z: 1 };   // south
            case 3: return { x: -1, z: 0 };  // west
            default: return { x: 0, z: -1 };
        }
    };

    const canWireConnectToNeighbor = (fromX, fromY, fromZ, dirX, dirZ) => {
        const nx = fromX + dirX;
        const nz = fromZ + dirZ;
        const sameY = fromY;
        const neighborId = chunkManager.getBlock(nx, sameY, nz);
        if (neighborId === 55) return true;
        if (neighborId === 75 || neighborId === 76) return true; // redstone torch off/on
        if (isRepeaterId(neighborId)) {
            const neighborMeta = chunkManager.getMetadata(nx, sameY, nz) & 15;
            const forward = getRepeaterForward(neighborMeta);
            // Repeater can connect via input or output side.
            return (
                (forward.x === dirX && forward.z === dirZ) ||
                (forward.x === -dirX && forward.z === -dirZ)
            );
        }
        return false;
    };
    
    // CHEST MESH LOGIC
    // Rotates the chest geometry based on metadata 0-3
    // Checks for neighbors to form double chests
    const buildChestMesh = (data, wx, wy, wz, meta, lightVal) => {
        // Meta: Bits 0-1 = Rotation (0-3), Bits 2-3 = Shape (0=Single, 4=Right, 8=Left)
        const rot = meta & 3;
        const shape = meta & 12;
        
        let myHalf = 'single'; 
        if (shape === 8) myHalf = 'left';
        if (shape === 4) myHalf = 'right';

        const P = 1/16;
        let xMin = P, xMax = 1-P;
        let zMin = P, zMax = 1-P;
        let yMin = 0, yMax = 14*P; // Chests are 14px high

        let connectLeft = (shape === 4); // I am Right half -> Connect Left
        let connectRight = (shape === 8); // I am Left half -> Connect Right
        
        if (rot === 0) { // South (Z+) -> Left is East(X+), Right is West(X-)
            if (connectLeft) xMax = 1; 
            if (connectRight) xMin = 0;
        } else if (rot === 1) { // North (Z-) -> Left is West(X-), Right is East(X+)
            if (connectLeft) xMin = 0;
            if (connectRight) xMax = 1;
        } else if (rot === 2) { // East (X+) -> Left is North(Z-), Right is South(Z+)
            if (connectLeft) zMin = 0;
            if (connectRight) zMax = 1;
        } else if (rot === 3) { // West (X-) -> Left is South(Z+), Right is North(Z-)
            if (connectLeft) zMax = 1;
            if (connectRight) zMin = 0;
        }

        const baseIndex = data.vertices.length / 3;
        let idxOffset = 0;

        const faces = [
            { pos: [xMin, yMax, zMax,  xMax, yMax, zMax,  xMax, yMax, zMin,  xMin, yMax, zMin], dir: 'top' },
            { pos: [xMin, yMin, zMin,  xMax, yMin, zMin,  xMax, yMin, zMax,  xMin, yMin, zMax], dir: 'bottom' },
            { pos: [xMax, yMin, zMin,  xMin, yMin, zMin,  xMin, yMax, zMin,  xMax, yMax, zMin], dir: 'north' },
            { pos: [xMin, yMin, zMax,  xMax, yMin, zMax,  xMax, yMax, zMax,  xMin, yMax, zMax], dir: 'south' },
            { pos: [xMax, yMin, zMax,  xMax, yMin, zMin,  xMax, yMax, zMin,  xMax, yMax, zMax], dir: 'east' },
            { pos: [xMin, yMin, zMin,  xMin, yMin, zMax,  xMin, yMax, zMax,  xMin, yMax, zMin], dir: 'west' }
        ];

        for (const f of faces) {
            let u1=0, v1=0, u2=1, v2=1;
            
            let faceName = '';
            if (f.dir === 'top') faceName = 'top';
            else if (f.dir === 'bottom') faceName = 'bottom';
            else {
                if (rot === 0) { // South
                    if (f.dir === 'south') faceName = 'front';
                    else if (f.dir === 'north') faceName = 'back';
                    else faceName = 'side';
                } else if (rot === 1) { // North
                    if (f.dir === 'north') faceName = 'front';
                    else if (f.dir === 'south') faceName = 'back';
                    else faceName = 'side';
                } else if (rot === 2) { // East
                    if (f.dir === 'east') faceName = 'front';
                    else if (f.dir === 'west') faceName = 'back';
                    else faceName = 'side';
                } else if (rot === 3) { // West
                    if (f.dir === 'west') faceName = 'front';
                    else if (f.dir === 'east') faceName = 'back';
                    else faceName = 'side';
                }
            }
            
            if (myHalf === 'single') {
                 u1 = 0; u2 = 1; v1 = 0; v2 = 1;
            } else {
                 if (faceName === 'front') {
                     if (myHalf === 'left') { u1 = 0.5; u2 = 1.0; }
                     else { u1 = 0; u2 = 0.5; }
                 } else if (faceName === 'back') {
                     if (myHalf === 'left') { u1 = 0; u2 = 0.5; }
                     else { u1 = 0.5; u2 = 1.0; }
                 } else {
                     u1 = 0; u2 = 1; 
                 }
            }

            let matIndex = 1; // Side
            if (faceName === 'top') matIndex = 2;
            else if (faceName === 'bottom') matIndex = 3;
            else if (faceName === 'front') {
                matIndex = (myHalf === 'single') ? 0 : 3;
            } else if (faceName === 'back') {
                matIndex = (myHalf === 'single') ? 1 : 4;
            }
            
            for (let i = 0; i < 12; i+=3) {
                data.vertices.push(wx + f.pos[i] - 0.5, wy + f.pos[i+1] - 0.5, wz + f.pos[i+2] - 0.5);
                data.colors.push(lightVal, lightVal, lightVal);
            }
            
            data.uvs.push(u1, v1, u2, v1, u2, v2, u1, v2); 
            data.indices.push(baseIndex + idxOffset, baseIndex + idxOffset + 1, baseIndex + idxOffset + 2, baseIndex + idxOffset + 2, baseIndex + idxOffset + 3, baseIndex + idxOffset);
            data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: matIndex });
            idxOffset += 4;
        }
    };

    const getPistonFrontDir = (meta = 0) => {
        const m = meta & 7;
        if (m === 0) return 'south';
        if (m === 1) return 'west';
        if (m === 2) return 'north';
        if (m === 3) return 'east';
        if (m === 4) return 'top';
        if (m === 5) return 'bottom';
        return 'south';
    };

    const getPistonFaceUvRotation = (blockId = 33, meta = 0, faceDir = 'north') => {
        if (blockId === 33 || blockId === 29) {
            const m = meta & 7;
            const byFace = PISTON_UV_ROTATION_BY_META?.[String(m)] || PISTON_UV_ROTATION_BY_META?.[m];
            const jsonUvRot = byFace?.[faceDir];
            if (Number.isFinite(jsonUvRot)) return jsonUvRot & 3;
        }
        // Jacobo parity from RenderBlocks.func_31074_b (non-moving branch).
        // Map our meta to Jacobo orientation id:
        // meta 0:south -> 3, 1:west -> 4, 2:north -> 2, 3:east -> 5, 4:up -> 1, 5:down -> 0
        const m = meta & 7;
        const orient =
            m === 0 ? 3 :
            m === 1 ? 4 :
            m === 2 ? 2 :
            m === 3 ? 5 :
            m === 4 ? 1 :
            m === 5 ? 0 : 3;

        let g = 0, h = 0, i = 0, j = 0, k = 0, l = 0;
        switch (orient) {
            case 0: g = 3; h = 3; i = 3; j = 3; break;
            case 1: break;
            case 2: i = 1; j = 2; break;
            case 3: i = 2; j = 1; k = 3; l = 3; break;
            case 4: g = 1; h = 2; k = 2; l = 1; break;
            case 5: g = 2; h = 1; k = 1; l = 2; break;
            default: break;
        }

        if (faceDir === 'north') return g;
        if (faceDir === 'south') return h;
        if (faceDir === 'east') return i;
        if (faceDir === 'west') return j;
        if (faceDir === 'top') return k;
        if (faceDir === 'bottom') return l;
        return 0;
    };

    const getOppositeFaceDir = (dir) => {
        if (dir === 'north') return 'south';
        if (dir === 'south') return 'north';
        if (dir === 'east') return 'west';
        if (dir === 'west') return 'east';
        if (dir === 'top') return 'bottom';
        if (dir === 'bottom') return 'top';
        return null;
    };

    const PISTON_ATLAS_GRID = 16;
    const ATLAS_TILE_TEXEL_INSET = 0.5 / 16;
    const UV_CORNER_ROT = [
        [0, 1, 2, 3],
        [1, 2, 3, 0],
        [2, 3, 0, 1],
        [3, 0, 1, 2]
    ];
    const SOUTH_EXTENDED_PISTON_FACES = {
        body_north: { tile: 109, rotation: 0, uOffset: 0, vOffset: 0 },
        body_south: { tile: 109, rotation: 0, uOffset: 0, vOffset: 0 },
        body_east: { tile: 108, rotation: 3, uOffset: 0, vOffset: 0 },
        body_west: { tile: 108, rotation: 1, uOffset: 0, vOffset: 0 },
        body_top: { tile: 108, rotation: 2, uOffset: 0, vOffset: 0 },
        body_bottom: { tile: 108, rotation: 0, uOffset: 0, vOffset: 0 },
        rod_north: { tile: 107, rotation: 0, uOffset: 0, vOffset: 0 },
        rod_south: { tile: 108, rotation: 0, uOffset: 0, vOffset: 0 },
        rod_east: { tile: 108, rotation: 0, uOffset: 0, vOffset: 1 },
        rod_west: { tile: 108, rotation: 2, uOffset: 0, vOffset: 1 },
        rod_top: { tile: 108, rotation: 1, uOffset: 0, vOffset: 1 },
        rod_bottom: { tile: 108, rotation: 3, uOffset: 0, vOffset: 1 },
        head_north: { tile: 107, rotation: 0, uOffset: 0, vOffset: 0 },
        head_south: { tile: 107, rotation: 0, uOffset: 0, vOffset: 0 },
        head_east: { tile: 108, rotation: 3, uOffset: 0, vOffset: 1 },
        head_west: { tile: 108, rotation: 1, uOffset: 0, vOffset: 1 },
        head_top: { tile: 108, rotation: 2, uOffset: 0, vOffset: 1 },
        head_bottom: { tile: 108, rotation: 0, uOffset: 0, vOffset: 1 }
    };
    const SOUTH_EXTENDED_STICKY_PISTON_FACES = {
        body_north: { tile: 109, rotation: 0, uOffset: 0, vOffset: 0 },
        body_south: { tile: 109, rotation: 0, uOffset: 0, vOffset: 0 },
        body_east: { tile: 108, rotation: 3, uOffset: 0, vOffset: 0 },
        body_west: { tile: 108, rotation: 1, uOffset: 0, vOffset: 0 },
        body_top: { tile: 108, rotation: 2, uOffset: 0, vOffset: 0 },
        body_bottom: { tile: 108, rotation: 0, uOffset: 0, vOffset: 0 },
        rod_north: { tile: 107, rotation: 0, uOffset: 0, vOffset: 0 },
        rod_south: { tile: 108, rotation: 0, uOffset: 0, vOffset: 0 },
        rod_east: { tile: 108, rotation: 0, uOffset: 0, vOffset: 1 },
        rod_west: { tile: 108, rotation: 2, uOffset: 0, vOffset: 1 },
        rod_top: { tile: 108, rotation: 1, uOffset: 0, vOffset: 1 },
        rod_bottom: { tile: 108, rotation: 3, uOffset: 0, vOffset: 1 },
        head_north: { tile: 107, rotation: 0, uOffset: 0, vOffset: 0 },
        head_south: { tile: 106, rotation: 0, uOffset: 0, vOffset: 0 },
        head_east: { tile: 108, rotation: 3, uOffset: 0, vOffset: 1 },
        head_west: { tile: 108, rotation: 1, uOffset: 0, vOffset: 1 },
        head_top: { tile: 108, rotation: 2, uOffset: 0, vOffset: 1 },
        head_bottom: { tile: 108, rotation: 0, uOffset: 0, vOffset: 1 }
    };

    const rotateSouthVertexToFacing = (x, y, z, facing) => {
        if (facing === 'south') return [x, y, z];
        if (facing === 'north') return [-x, y, -z];
        if (facing === 'east') return [z, y, -x];
        if (facing === 'west') return [-z, y, x];
        if (facing === 'top') return [x, z, -y];
        if (facing === 'bottom') return [x, -z, y];
        return [x, y, z];
    };

    const pushPistonBox = (data, wx, wy, wz, lightVal, bounds, frontDir = null, hideFront = false, pistonMeta = 0, pistonBlockId = 33, defaultMatIndex = 0, extensionHeadMode = false, skipFaceDirs = null) => {
        const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
        const baseIndex = data.vertices.length / 3;
        const uvRot0 = [0, 0, 1, 0, 1, 1, 0, 1];
        const uvRot90 = [1, 0, 1, 1, 0, 1, 0, 0];
        const uvRot180 = [1, 1, 0, 1, 0, 0, 1, 0];
        const uvRot270 = [0, 1, 0, 0, 1, 0, 1, 1];
        const faces = [
            // Winding must face outward for FrontSide materials.
            { dir: 'top', pos: [minX, maxY, maxZ, maxX, maxY, maxZ, maxX, maxY, minZ, minX, maxY, minZ] },
            { dir: 'bottom', pos: [minX, minY, minZ, maxX, minY, minZ, maxX, minY, maxZ, minX, minY, maxZ] },
            { dir: 'north', pos: [maxX, minY, minZ, minX, minY, minZ, minX, maxY, minZ, maxX, maxY, minZ] },
            { dir: 'south', pos: [minX, minY, maxZ, maxX, minY, maxZ, maxX, maxY, maxZ, minX, maxY, maxZ] },
            { dir: 'east', pos: [maxX, minY, maxZ, maxX, minY, minZ, maxX, maxY, minZ, maxX, maxY, maxZ] },
            { dir: 'west', pos: [minX, minY, minZ, minX, minY, maxZ, minX, maxY, maxZ, minX, maxY, minZ] }
        ];

        let idxOffset = 0;
        for (const f of faces) {
            if (hideFront && frontDir && f.dir === frontDir) continue;
            if (skipFaceDirs && skipFaceDirs.has(f.dir)) continue;
            for (let i = 0; i < 12; i += 3) {
                data.vertices.push(wx + f.pos[i] - 0.5, wy + f.pos[i + 1] - 0.5, wz + f.pos[i + 2] - 0.5);
                data.colors.push(lightVal, lightVal, lightVal);
            }
            const oppositeDir = getOppositeFaceDir(frontDir);

            const uvRot = getPistonFaceUvRotation(pistonBlockId, pistonMeta, f.dir);
            const faceUv = uvRot === 1 ? uvRot90 : (uvRot === 2 ? uvRot180 : (uvRot === 3 ? uvRot270 : uvRot0));
            data.uvs.push(...faceUv);
            data.indices.push(baseIndex + idxOffset, baseIndex + idxOffset + 1, baseIndex + idxOffset + 2, baseIndex + idxOffset + 2, baseIndex + idxOffset + 3, baseIndex + idxOffset);

            let matIndex = defaultMatIndex;
            if (frontDir) {
                if (f.dir === frontDir) {
                    matIndex = 5; // piston face (wooden front)
                } else if (f.dir === oppositeDir) {
                    matIndex = extensionHeadMode ? 6 : 3; // extension back uses extension side tile
                } else {
                    matIndex = extensionHeadMode ? 6 : defaultMatIndex;
                }
            }
            data.groups.push({ start: data.indices.length - 6, count: 6, matIndex });
            idxOffset += 4;
        }
    };

    const pushAtlasQuad = (data, wx, wy, wz, lightVal, verts, faceCfg) => {
        const baseIndex = data.vertices.length / 3;
        const tile = Number(faceCfg?.tile) | 0;
        const rotation = Number(faceCfg?.rotation) & 3;
        const uOffset = Number(faceCfg?.uOffset) || 0;
        const vOffset = Number(faceCfg?.vOffset) || 0;
        const flipH = !!faceCfg?.flipH;
        const flipV = !!faceCfg?.flipV;
        const tx = tile % PISTON_ATLAS_GRID;
        const ty = Math.floor(tile / PISTON_ATLAS_GRID);
        const scale = 1 / PISTON_ATLAS_GRID;
        const cornerMap = UV_CORNER_ROT[rotation];
        const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
        const v0 = verts[0], v1 = verts[1], v2 = verts[2];
        const lenU = Math.sqrt(Math.pow(v1[0] - v0[0], 2) + Math.pow(v1[1] - v0[1], 2) + Math.pow(v1[2] - v0[2], 2));
        const lenV = Math.sqrt(Math.pow(v2[0] - v1[0], 2) + Math.pow(v2[1] - v1[1], 2) + Math.pow(v2[2] - v1[2], 2));
        const isQuarterTurn = (rotation & 1) === 1;
        const spanU = Math.max(0, Math.min(1, isQuarterTurn ? lenV : lenU));
        const spanV = Math.max(0, Math.min(1, isQuarterTurn ? lenU : lenV));
        const insetU = Math.min(ATLAS_TILE_TEXEL_INSET, spanU * 0.5);
        const insetV = Math.min(ATLAS_TILE_TEXEL_INSET, spanV * 0.5);
        const maxU0 = Math.max(0, 1 - spanU);
        const maxV0 = Math.max(0, 1 - spanV);
        const u0 = clamp(uOffset, 0, maxU0);
        const v0t = clamp(vOffset, 0, maxV0);
        const u1 = u0 + spanU;
        const v1t = v0t + spanV;
        const left = u0 + insetU;
        const right = u1 - insetU;
        const top = v0t + insetV;
        const bottom = v1t - insetV;
        const uvCorners = [
            [flipH ? right : left, flipV ? bottom : top],
            [flipH ? left : right, flipV ? bottom : top],
            [flipH ? left : right, flipV ? top : bottom],
            [flipH ? right : left, flipV ? top : bottom]
        ];
        for (let i = 0; i < 4; i++) {
            const p = verts[i];
            data.vertices.push(wx + p[0] - 0.5, wy + p[1] - 0.5, wz + p[2] - 0.5);
            data.colors.push(lightVal, lightVal, lightVal);
            const uv = uvCorners[cornerMap[i]];
            data.uvs.push((tx + uv[0]) * scale, 1 - ((ty + 1 - uv[1]) * scale));
        }
        data.indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex);
        data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 0 });
        data.forceAtlas = true;
    };

    const getBoxFaceVerts = (bounds, face) => {
        const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
        if (face === 'east') return [[ maxX,minY, maxZ],[ maxX,minY,minZ],[ maxX,maxY,minZ],[ maxX,maxY, maxZ]];
        if (face === 'west') return [[minX,minY,minZ],[minX,minY, maxZ],[minX,maxY, maxZ],[minX,maxY,minZ]];
        if (face === 'top') return [[minX,maxY, maxZ],[ maxX,maxY, maxZ],[ maxX,maxY,minZ],[minX,maxY,minZ]];
        if (face === 'bottom') return [[minX,minY,minZ],[ maxX,minY,minZ],[ maxX,minY, maxZ],[minX,minY, maxZ]];
        if (face === 'south') return [[minX,minY, maxZ],[ maxX,minY, maxZ],[ maxX,maxY, maxZ],[minX,maxY, maxZ]];
        return [[ maxX,minY,minZ],[minX,minY,minZ],[minX,maxY,minZ],[ maxX,maxY,minZ]];
    };

    const pushSouthAuthoredExtendedPiston = (data, wx, wy, wz, lightVal, facing, blockId = 33, includeBody = true, includeRod = true, includeHead = true) => {
        const faceTable = Number(blockId) === 29 ? SOUTH_EXTENDED_STICKY_PISTON_FACES : SOUTH_EXTENDED_PISTON_FACES;
        const transform = (pt) => rotateSouthVertexToFacing(pt[0] - 0.5, pt[1] - 0.5, pt[2] - 0.5, facing).map((n) => n + 0.5);
        const pushPart = (partName, bounds) => {
            for (const face of ['north', 'south', 'east', 'west', 'top', 'bottom']) {
                const cfg = faceTable[`${partName}_${face}`];
                const verts = getBoxFaceVerts(bounds, face).map(transform);
                pushAtlasQuad(data, wx, wy, wz, lightVal, verts, cfg);
            }
        };
        if (includeBody) pushPart('body', { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 0.75 });
        // Match the block editor's centered bounds exactly:
        // rod  0.25 -> 1.25 centered  => 0.75 -> 1.75 local
        // head 1.25 -> 1.5  centered  => 1.75 -> 2.0  local
        if (includeRod) pushPart('rod', { minX: 0.375, maxX: 0.625, minY: 0.375, maxY: 0.625, minZ: 0.75, maxZ: 1.75 });
        if (includeHead) pushPart('head', { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 1.75, maxZ: 2.0 });
    };
    const pushSouthAuthoredRepeater = (data, wx, wy, wz, lightVal, facing, delay, blockId = 93) => {
        const faceTable = SOUTH_REPEATER_FACES_BY_BLOCK_ID[Number(blockId)] || SOUTH_REPEATER_FACES_BY_BLOCK_ID[93];
        const transform = (pt) => rotateSouthVertexToFacing(pt[0] - 0.5, pt[1] - 0.5, pt[2] - 0.5, facing).map((n) => n + 0.5);
        const pushPart = (partName, bounds) => {
            for (const face of ['north', 'south', 'east', 'west', 'top', 'bottom']) {
                const cfg = faceTable[`${partName}_${face}`] || faceTable[face];
                const verts = getBoxFaceVerts(bounds, face).map(transform);
                pushAtlasQuad(data, wx, wy, wz, lightVal, verts, cfg);
            }
        };
        pushPart('base', { minX: 0, maxX: 1, minY: 0, maxY: 1 / 8, minZ: 0, maxZ: 1 });
        const pushTorch = (partName, cx, cz, h = 3 / 16) => {
            const half = 1 / 16;
            pushPart(partName, {
                minX: cx - half,
                maxX: cx + half,
                minY: 1 / 8,
                maxY: 1 / 8 + h,
                minZ: cz - half,
                maxZ: cz + half
            });
        };
        pushTorch('torch_front', 0.5, 0.28);
        pushTorch('torch_back', 0.5, 0.72 - delay * 0.08);
    };
    const getBedFacingFromMeta = (meta) => {
        const orient = meta & 3;
        if (orient === 0) return 'south';
        if (orient === 1) return 'west';
        if (orient === 2) return 'north';
        return 'east';
    };
    const pushSouthAuthoredBed = (data, wx, wy, wz, lightVal, meta) => {
        const facing = getBedFacingFromMeta(meta);
        const isHeadPart = (meta & 8) !== 0;
        const faceTable = isHeadPart ? SOUTH_BED_FACES_BY_PART.head : SOUTH_BED_FACES_BY_PART.foot;
        const hiddenFace = isHeadPart ? 'north' : 'south';
        data.transparentAtlas = true;
        const transform = (pt) => rotateSouthVertexToFacing(pt[0] - 0.5, pt[1] - 0.5, pt[2] - 0.5, facing).map((n) => n + 0.5);
        const bounds = { minX: 0, maxX: 1, minY: 0, maxY: 9 / 16, minZ: 0, maxZ: 1 };
        for (const face of ['north', 'south', 'east', 'west', 'top', 'bottom']) {
            if (face === hiddenFace || face === 'bottom') continue;
            const cfg = faceTable[face];
            const verts = getBoxFaceVerts(bounds, face).map(transform);
            pushAtlasQuad(data, wx, wy, wz, lightVal, verts, cfg);
        }
    };
    const getLeverFacingFromMeta = (orient) => {
        if (orient === 1) return 'west';
        if (orient === 2) return 'east';
        if (orient === 3) return 'north';
        if (orient === 4) return 'south';
        if (orient === 0 || orient === 7) return 'top';
        return 'bottom';
    };
    const pushSouthAuthoredLever = (data, wx, wy, wz, lightVal, orient, powered, blockId = 111) => {
        const faceTable = SOUTH_LEVER_FACES_BY_BLOCK_ID[Number(blockId)] || SOUTH_LEVER_FACES_BY_BLOCK_ID[111];
        const facing = getLeverFacingFromMeta(orient);
        data.transparentAtlas = true;
        const transform = (pt) => rotateSouthVertexToFacing(pt[0] - 0.5, pt[1] - 0.5, pt[2] - 0.5, facing).map((n) => n + 0.5);
        const rotateXPoint = (pt, angle) => {
            const x = Number(pt[0]) || 0;
            const y = Number(pt[1]) || 0;
            const z = Number(pt[2]) || 0;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return [x, y * cos - z * sin, y * sin + z * cos];
        };
        const handleTransform = (pt) => {
            let p = [pt[0] - 0.5, pt[1] - 0.5, pt[2] - 0.5];
            p[2] += powered ? -(1 / 32) : (1 / 32);
            p = rotateXPoint(p, powered ? 0.69813174 : -0.69813174);
            p[1] -= 0.375;
            p = rotateXPoint(p, -Math.PI / 2);
            return rotateSouthVertexToFacing(p[0], p[1], p[2], facing).map((n) => n + 0.5);
        };
        const pushPart = (partName, bounds, partTransform = transform) => {
            for (const face of ['north', 'south', 'east', 'west', 'top', 'bottom']) {
                const cfg = faceTable[`${partName}_${face}`] || faceTable[face];
                const verts = getBoxFaceVerts(bounds, face).map(partTransform);
                pushAtlasQuad(data, wx, wy, wz, lightVal, verts, cfg);
            }
        };
        pushPart('base', { minX: 0.3125, maxX: 0.6875, minY: 0.25, maxY: 0.75, minZ: 0.8125, maxZ: 1.0 });
        pushPart('handle', { minX: 0.4375, maxX: 0.5625, minY: 0.5, maxY: 1.125, minZ: 0.4375, maxZ: 0.5625 }, handleTransform);
    };

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const type = chunk.getBlock(lx, ly, lz);
                if (type === 0) continue; 
                
                const meta = chunk.getMetadata(lx, ly, lz);
                const renderKey = isWoolId(type)
                    ? `${type}:${meta & 15}`
                    : (isPistonId(type) ? `${type}:${meta & 15}` : String(type));
                if (!geometryData[renderKey]) geometryData[renderKey] = { vertices: [], uvs: [], colors: [], indices: [], count: 0, groups: [] };
                const data = geometryData[renderKey];

                const wx = startX + lx;
                const wy = startY + ly;
                const wz = startZ + lz;

                // --- 1. Custom Geometry: Cross-plane plants (flowers / mushrooms / tall grass / dead bush) ---
                if (isFlowerId(type) || isMushroomId(type) || isTallGrassId(type) || isDeadBushId(type) || isCropId(type)) {
                    const baseIndex = data.vertices.length / 3;
                    const min = 0.15, max = 0.85;
                    
                    const p1 = [
                        [min, 1, min], [max, 1, max], [max, 0, max], [min, 0, min] // Diag 1
                    ];
                    const p2 = [
                        [min, 1, max], [max, 1, min], [max, 0, min], [min, 0, max] // Diag 2
                    ];
                    
                    const planes = [
                        { pts: p1, uv: [0, 1, 1, 1, 1, 0, 0, 0] },
                        { pts: [p1[1], p1[0], p1[3], p1[2]], uv: [1, 1, 0, 1, 0, 0, 1, 0] },
                        { pts: p2, uv: [0, 1, 1, 1, 1, 0, 0, 0] },
                        { pts: [p2[1], p2[0], p2[3], p2[2]], uv: [1, 1, 0, 1, 0, 0, 1, 0] }
                    ];
                    
                    const lightAvg = getL(wx, wy, wz);
                    const lightIntensity = Math.pow(lightAvg / 15.0, 1.6);
                    const val = Math.max(0.05, lightIntensity);
                    // Tall grass should be biome grass-tinted.
                    const tint = isTallGrassId(type) ? getColumnTint(wx, wz, false) : null;
                    
                    let idxOffset = 0;
                    for (const plane of planes) {
                        for (let i = 0; i < 4; i++) {
                            const pt = plane.pts[i];
                            data.vertices.push(wx + pt[0] - 0.5, wy + pt[1] - 0.5, wz + pt[2] - 0.5);
                            if (tint) {
                                data.colors.push(
                                    Math.max(0.05, val * tint.r),
                                    Math.max(0.05, val * tint.g),
                                    Math.max(0.05, val * tint.b)
                                );
                            } else {
                                data.colors.push(val, val, val);
                            }
                        }
                        data.uvs.push(...plane.uv);
                        data.indices.push(baseIndex + idxOffset, baseIndex + idxOffset + 1, baseIndex + idxOffset + 2, baseIndex + idxOffset + 2, baseIndex + idxOffset + 3, baseIndex + idxOffset);
                        idxOffset += 4;
                    }
                    data.groups.push({ start: data.indices.length - 24, count: 24, matIndex: 0 });
                    continue;
                }

                // --- 2. Custom Geometry: Fire (63) ---
                if (type === 63) {
                    // Fire Rendering based on Meta
                    // Meta 0: Floor (Cross/Random hash)
                    // Meta 1: North Wall (Z=0 plane)
                    // Meta 2: South Wall (Z=1 plane)
                    // Meta 3: East Wall (X=1 plane)
                    // Meta 4: West Wall (X=0 plane)
                    
                    const baseIndex = data.vertices.length / 3;
                    let planes = [];
                    
                    if (meta === 0) { // Floor
                        // Cross shape similar to flowers but varying height 
                        // and randomized slightly to look dynamic
                        // Use random hash based on position for static randomization
                        let h = Math.imul(wx, 0x1b873593) ^ Math.imul(wy, 0x3b976543) ^ Math.imul(wz, 0x51739b12);
                        const rH = ((h >>> 0) / 4294967296);
                        
                        const height = 0.6 + (rH * 0.3); // 0.6 to 0.9
                        const offX = (rH - 0.5) * 0.2;
                        const offZ = ((1-rH) - 0.5) * 0.2;
                        
                        const min=0.1 + offX, max=0.9 + offX;
                        const minZ=0.1 + offZ, maxZ=0.9 + offZ;

                        const p1 = [[min, height, minZ], [max, height, maxZ], [max, 0, maxZ], [min, 0, minZ]];
                        const p2 = [[min, height, maxZ], [max, height, minZ], [max, 0, minZ], [min, 0, maxZ]];
                        
                        planes = [
                            { pts: p1 }, { pts: [p1[1], p1[0], p1[3], p1[2]] },
                            { pts: p2 }, { pts: [p2[1], p2[0], p2[3], p2[2]] }
                        ];
                    } else {
                        // Wall Fire
                        const p = 0.05; // Offset from wall
                        let pts = [];
                        if (meta === 1) { // North Wall (Z=0)
                            pts = [[0, 1, p], [1, 1, p], [1, 0, p], [0, 0, p]]; 
                        } else if (meta === 2) { // South Wall (Z=1)
                            pts = [[1, 1, 1-p], [0, 1, 1-p], [0, 0, 1-p], [1, 0, 1-p]];
                        } else if (meta === 3) { // East Wall (X=1)
                            pts = [[1-p, 1, 0], [1-p, 1, 1], [1-p, 0, 1], [1-p, 0, 0]];
                        } else if (meta === 4) { // West Wall (X=0)
                            pts = [[p, 1, 1], [p, 1, 0], [p, 0, 0], [p, 0, 1]];
                        }
                        // Add double sided
                        if (pts.length > 0) {
                            planes = [{ pts: pts }, { pts: [pts[1], pts[0], pts[3], pts[2]] }];
                        }
                    }
                    
                    // --- NEW UV LOGIC FOR RANDOMIZED FIRE ---
                    // Select one of 4 fire variations based on spatial hash
                    let h = Math.imul(wx, 0x1b873593) ^ Math.imul(wy, 0x3b976543) ^ Math.imul(wz, 0x51739b12);
                    const variation = Math.abs(h) % 4;
                    const uStart = variation * 0.25;
                    const uEnd = uStart + 0.25;

                    let idxOffset = 0;
                    for (const plane of planes) {
                        for (let i = 0; i < 4; i++) {
                            const pt = plane.pts[i];
                            data.vertices.push(wx + pt[0] - 0.5, wy + pt[1] - 0.5, wz + pt[2] - 0.5);
                            // Removed Vertex Colors for Fire (using texture now)
                        }
                        
                        // Map UVs to the specific 1/4th frame selected by the hash
                        // Top-Left (uStart, 1), Top-Right (uEnd, 1), Bottom-Right (uEnd, 0), Bottom-Left (uStart, 0)
                        data.uvs.push(uStart, 1, uEnd, 1, uEnd, 0, uStart, 0);
                        
                        data.indices.push(baseIndex + idxOffset, baseIndex + idxOffset + 1, baseIndex + idxOffset + 2, baseIndex + idxOffset + 2, baseIndex + idxOffset + 3, baseIndex + idxOffset);
                        idxOffset += 4;
                    }
                    
                    if (planes.length > 0) {
                        data.groups.push({ start: data.indices.length - (planes.length * 6), count: planes.length * 6, matIndex: 0 });
                    }
                    continue;
                }

                if (isChestId(type)) {
                    const lightAvg = getL(wx, wy, wz); 
                    const lightIntensity = Math.pow(lightAvg / 15.0, 1.6);
                    const val = Math.max(0.05, lightIntensity);
                    
                    buildChestMesh(data, wx, wy, wz, meta, val);
                    continue;
                }

                if (isTorchId(type)) {
                     // TORCH MESH GENERATION
                     let faces = [];
                     const u1 = 7/16, u2 = 9/16;
                     const vBottom = 0, vTopSide = 10/16;
                     const vTopCap1 = 8/16, vTopCap2 = 10/16;
                     const vBotCap1 = 0, vBotCap2 = 2/16;
                     const lightVal = 1.0; 

                     if (meta === 5 || meta === 0) {
                         const r = 1/16; const h = 10/16;
                         const minX = 0.5 - r, maxX = 0.5 + r;
                         const minZ = 0.5 - r, maxZ = 0.5 + r;
                         const minY = 0, maxY = h;
                         
                         faces = [
                            { pos: [minX, maxY, minZ,  maxX, maxY, minZ,  maxX, maxY, maxZ,  minX, maxY, maxZ], uv: [u1, vTopCap1, u2, vTopCap1, u2, vTopCap2, u1, vTopCap2] }, 
                            { pos: [minX, minY, maxZ,  maxX, minY, maxZ,  maxX, minY, minZ,  minX, minY, minZ], uv: [u1, vBotCap2, u2, vBotCap2, u2, vBotCap1, u1, vBotCap1] }, 
                            { pos: [maxX, minY, minZ,  maxX, maxY, minZ,  minX, maxY, minZ,  minX, minY, minZ], uv: [u1, vBottom, u1, vTopSide, u2, vTopSide, u2, vBottom] }, 
                            { pos: [minX, minY, maxZ,  minX, maxY, maxZ,  maxX, maxY, maxZ,  maxX, minY, maxZ], uv: [u1, vBottom, u1, vTopSide, u2, vTopSide, u2, vBottom] }, 
                            { pos: [maxX, minY, maxZ,  maxX, maxY, maxZ,  maxX, maxY, minZ,  maxX, minY, minZ], uv: [u1, vBottom, u1, vTopSide, u2, vTopSide, u2, vBottom] }, 
                            { pos: [minX, minY, minZ,  minX, maxY, minZ,  minX, maxY, maxZ,  minX, minY, maxZ], uv: [u1, vBottom, u1, vTopSide, u2, vTopSide, u2, vBottom] }  
                         ];
                     } else {
                         const w = 2/16; const h = 10/16; const d = 2/16;
                         const x1 = -w/2, x2 = w/2;
                         const y1 = -h/2, y2 = h/2;
                         const z1 = -d/2, z2 = d/2;

                         const rawFaces = [
                             { pos: [x1, y2, z1,  x2, y2, z1,  x2, y2, z2,  x1, y2, z2], uv: [u1, vTopCap1, u2, vTopCap1, u2, vTopCap2, u1, vTopCap2] }, 
                             { pos: [x1, y1, z2,  x2, y1, z2,  x2, y1, z1,  x1, y1, z1], uv: [u1, vBotCap2, u2, vBotCap2, u2, vBotCap1, u1, vBotCap1] }, 
                             { pos: [x2, y1, z1,  x2, y2, z1,  x1, y2, z1,  x1, y1, z1], uv: [u1, vBottom, u1, vTopSide, u2, vTopSide, u2, vBottom] },   
                             { pos: [x1, y1, z2,  x1, y2, z2,  x2, y2, z2,  x2, y1, z2], uv: [u1, vBottom, u1, vTopSide, u2, vTopSide, u2, vBottom] },   
                             { pos: [x2, y1, z2,  x2, y2, z2,  x2, y2, z1,  x2, y1, z1], uv: [u1, vBottom, u1, vTopSide, u2, vTopSide, u2, vBottom] },   
                             { pos: [x1, y1, z1,  x1, y2, z1,  x1, y2, z2,  x1, y1, z2], uv: [u1, vBottom, u1, vTopSide, u2, vTopSide, u2, vBottom] }    
                         ];

                         const rotX = (x, y, z, angle) => {
                             const c = Math.cos(angle);
                             const s = Math.sin(angle);
                             return [x, y*c - z*s, y*s + z*c];
                         };

                         const rotY = (x, y, z, angle) => {
                             const c = Math.cos(angle);
                             const s = Math.sin(angle);
                             return [x*c - z*s, y, x*s + z*c];
                         };

                         let metaRot = 0;
                         if (meta === 1) metaRot = Math.PI;       
                         if (meta === 2) metaRot = 0;             
                         if (meta === 3) metaRot = -Math.PI / 2;  
                         if (meta === 4) metaRot = Math.PI / 2;   

                         faces = [];
                         for(const rf of rawFaces) {
                             const transformedPos = [];
                             for(let i=0; i<12; i+=3) {
                                 let tx = rf.pos[i];
                                 let ty = rf.pos[i+1];
                                 let tz = rf.pos[i+2];

                                 [tx, ty, tz] = rotX(tx, ty, tz, Math.PI / 4);
                                 ty += 0.1;
                                 tz -= 0.35;
                                 [tx, ty, tz] = rotY(tx, ty, tz, metaRot);

                                 transformedPos.push(tx + 0.5, ty + 0.5, tz + 0.5);
                             }
                             faces.push({ pos: transformedPos, uv: rf.uv });
                         }
                     }

                     const baseIndex = data.vertices.length / 3;
                     let idxOffset = 0;
                     for (const f of faces) {
                         for (let i = 0; i < 12; i+=3) {
                             data.vertices.push(wx + f.pos[i] - 0.5, wy + f.pos[i+1] - 0.5, wz + f.pos[i+2] - 0.5);
                             data.colors.push(lightVal, lightVal, lightVal);
                         }
                         data.uvs.push(...f.uv);
                         data.indices.push(baseIndex + idxOffset, baseIndex + idxOffset + 1, baseIndex + idxOffset + 2, baseIndex + idxOffset + 2, baseIndex + idxOffset + 3, baseIndex + idxOffset);
                         idxOffset += 4;
                     }
                     data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                     continue; 
                }

                if (isButtonId(type)) {
                    const orient = meta & 7;
                    const pressed = (meta & 8) !== 0;
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const yMin = 6 / 16;
                    const yMax = 10 / 16;
                    const halfSpan = 3 / 16;
                    const depth = pressed ? (1 / 16) : (2 / 16);
                    let minX = 0.5 - halfSpan;
                    let maxX = 0.5 + halfSpan;
                    let minZ = 0.5 - halfSpan;
                    let maxZ = 0.5 + halfSpan;
                    if (orient === 1) {
                        minX = 0;
                        maxX = depth;
                    } else if (orient === 2) {
                        minX = 1 - depth;
                        maxX = 1;
                    } else if (orient === 3) {
                        minZ = 0;
                        maxZ = depth;
                    } else {
                        minZ = 1 - depth;
                        maxZ = 1;
                    }
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts, uv) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                    };
                    const fullUv = [0, 0, 1, 0, 1, 1, 0, 1];
                    pushFace([minX, yMax, minZ, maxX, yMax, minZ, maxX, yMax, maxZ, minX, yMax, maxZ], fullUv);
                    pushFace([minX, yMin, maxZ, maxX, yMin, maxZ, maxX, yMin, minZ, minX, yMin, minZ], fullUv);
                    pushFace([maxX, yMin, minZ, maxX, yMax, minZ, minX, yMax, minZ, minX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, maxZ, minX, yMax, maxZ, maxX, yMax, maxZ, maxX, yMin, maxZ], fullUv);
                    pushFace([maxX, yMin, maxZ, maxX, yMax, maxZ, maxX, yMax, minZ, maxX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, minZ, minX, yMax, minZ, minX, yMax, maxZ, minX, yMin, maxZ], fullUv);
                    for (let i = 0; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    continue;
                }

                if (isPistonId(type)) {
                    // Piston custom mesh should shade like surrounding opaque blocks.
                    // Sampling only the piston cell can be much darker than neighbors.
                    const localLight = Math.max(
                        getL(wx, wy, wz),
                        getL(wx + 1, wy, wz),
                        getL(wx - 1, wy, wz),
                        getL(wx, wy + 1, wz),
                        getL(wx, wy - 1, wz),
                        getL(wx, wy, wz + 1),
                        getL(wx, wy, wz - 1)
                    );
                    const lightVal = Math.max(0.05, Math.pow(localLight / 15.0, 1.6));
                    const frontDir = getPistonFrontDir(meta);
                    const isExtendedBase = (type === 33 || type === 29) && ((meta & 8) !== 0);

                    if (type === 34) {
                        pushSouthAuthoredExtendedPiston(data, wx, wy, wz, lightVal, frontDir, type, true, true, true);
                    } else if (!isExtendedBase) {
                        pushPistonBox(
                            data,
                            wx, wy, wz,
                            lightVal,
                            { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
                            frontDir,
                            false,
                            meta,
                            type,
                            0,
                            false,
                            null
                        );
                    } else {
                        pushSouthAuthoredExtendedPiston(data, wx, wy, wz, lightVal, frontDir, type, true, true, true);
                    }
                    continue;
                }

                if (isLeverId(type)) {
                    const orient = meta & 7;
                    const powered = (meta & 8) !== 0;
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    pushSouthAuthoredLever(data, wx, wy, wz, lightVal, orient, powered, type);
                    continue;
                }

                if (isPressurePlateId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const inset = 1 / 16;
                    const yMin = 0;
                    const yMax = (meta & 1) ? (0.5 / 16) : (1 / 16);
                    const minX = inset;
                    const maxX = 1 - inset;
                    const minZ = inset;
                    const maxZ = 1 - inset;
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts, uv) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                    };
                    const fullUv = [0, 0, 1, 0, 1, 1, 0, 1];
                    pushFace([minX, yMax, minZ, maxX, yMax, minZ, maxX, yMax, maxZ, minX, yMax, maxZ], fullUv);
                    pushFace([minX, yMin, maxZ, maxX, yMin, maxZ, maxX, yMin, minZ, minX, yMin, minZ], fullUv);
                    pushFace([maxX, yMin, minZ, maxX, yMax, minZ, minX, yMax, minZ, minX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, maxZ, minX, yMax, maxZ, maxX, yMax, maxZ, maxX, yMin, maxZ], fullUv);
                    pushFace([maxX, yMin, maxZ, maxX, yMax, maxZ, maxX, yMax, minZ, maxX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, minZ, minX, yMax, minZ, minX, yMax, maxZ, minX, yMin, maxZ], fullUv);
                    for (let i = 0; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    continue;
                }

                if (isRailId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const yLow = 1 / 16;
                    const yHigh = 1 + (1 / 32);
                    // Powered and detector rails store power/trigger state in bit 3.
                    // Rendering must use only the shape bits or the rail appears to
                    // rotate when a redstone torch toggles nearby.
                    const railMeta = (type === 27 || type === 28) ? (meta & 7) : (meta & 15);
                    const uvRot0 = [0, 0, 1, 0, 1, 1, 0, 1];
                    const uvRot90 = [1, 0, 1, 1, 0, 1, 0, 0];
                    const uvRot180 = [1, 1, 0, 1, 0, 0, 1, 0];
                    const uvRot270 = [0, 1, 0, 0, 1, 0, 1, 1];
                    const pushTopQuad = (minX, maxX, minZ, maxZ, uv = uvRot0, matIndex = 0) => {
                        const baseIndex = data.vertices.length / 3;
                        const pts = [minX, yLow, minZ, maxX, yLow, minZ, maxX, yLow, maxZ, minX, yLow, maxZ];
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                        data.indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
                        data.groups.push({ start: data.indices.length - 6, count: 6, matIndex });
                    };
                    const pushSlopeQuad = (minX, maxX, minZ, maxZ, y0, y1, y2, y3, uv = uvRot0, matIndex = 0) => {
                        const baseIndex = data.vertices.length / 3;
                        const pts = [minX, y0, minZ, maxX, y1, minZ, maxX, y2, maxZ, minX, y3, maxZ];
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                        data.indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
                        data.groups.push({ start: data.indices.length - 6, count: 6, matIndex });
                    };
                    const poweredMatIndex = (type === 27 || type === 28) && ((meta & 8) !== 0) ? 1 : 0;
                    const cornerMatIndex = (type === 24 || type === 263) ? 1 : poweredMatIndex;
                    if (railMeta === 1) {
                        // East-West
                        pushTopQuad(0, 1, 0, 1, uvRot90, poweredMatIndex);
                    } else if (railMeta === 2) {
                        // Ascending East
                        pushSlopeQuad(0, 1, 0, 1, yLow, yHigh, yHigh, yLow, uvRot90, poweredMatIndex);
                    } else if (railMeta === 3) {
                        // Ascending West
                        pushSlopeQuad(0, 1, 0, 1, yHigh, yLow, yLow, yHigh, uvRot90, poweredMatIndex);
                    } else if (railMeta === 4) {
                        // Ascending North
                        pushSlopeQuad(0, 1, 0, 1, yHigh, yHigh, yLow, yLow, uvRot0, poweredMatIndex);
                    } else if (railMeta === 5) {
                        // Ascending South
                        pushSlopeQuad(0, 1, 0, 1, yLow, yLow, yHigh, yHigh, uvRot0, poweredMatIndex);
                    } else if (railMeta === 6) {
                        // South-East corner
                        pushTopQuad(0, 1, 0, 1, uvRot270, cornerMatIndex);
                    } else if (railMeta === 7) {
                        // South-West corner
                        pushTopQuad(0, 1, 0, 1, uvRot180, cornerMatIndex);
                    } else if (railMeta === 8) {
                        // North-West corner
                        pushTopQuad(0, 1, 0, 1, uvRot90, cornerMatIndex);
                    } else if (railMeta === 9) {
                        // North-East corner
                        pushTopQuad(0, 1, 0, 1, uvRot0, cornerMatIndex);
                    } else {
                        // Default North-South
                        pushTopQuad(0, 1, 0, 1, uvRot0, poweredMatIndex);
                    }
                    continue;
                }

                if (type === 55) {
                    // Redstone wire visual mesh parity:
                    // flat top quad with Jacobo-style stateful UV selection/trim
                    // (cross for dots/corners/tees/endpoints, line for straights) and
                    // power-driven tint/intensity from metadata (0..15).
                    const skyLit = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const power = Math.max(0, Math.min(15, meta & 15));
                    const p = power / 15;
                    const r = Math.max(0.06, skyLit * (0.32 + p * 0.90));
                    const g = Math.max(0.02, skyLit * (0.05 + p * 0.28));
                    const b = Math.max(0.02, skyLit * (0.05 + p * 0.28));
                    const y = 1 / 64;

                    const connN = canWireConnectToNeighbor(wx, wy, wz, 0, -1);
                    const connS = canWireConnectToNeighbor(wx, wy, wz, 0, 1);
                    const connW = canWireConnectToNeighbor(wx, wy, wz, -1, 0);
                    const connE = canWireConnectToNeighbor(wx, wy, wz, 1, 0);
                    const isStraightNS = connN && connS && !connW && !connE;
                    const isStraightEW = connW && connE && !connN && !connS;
                    const baseIndex = data.vertices.length / 3;
                    let minX = 0;
                    let maxX = 1;
                    let minZ = 0;
                    let maxZ = 1;
                    let matIndex = 0;
                    let uv = [0, 1, 1, 1, 1, 0, 0, 0];

                    if (isStraightEW) {
                        matIndex = 1;
                    } else if (isStraightNS) {
                        matIndex = 1;
                        uv = [1, 1, 1, 0, 0, 0, 0, 1];
                    } else if (connN || connS || connW || connE) {
                        if (!connW) minX = 0.3125;
                        if (!connE) maxX = 0.6875;
                        if (!connN) minZ = 0.3125;
                        if (!connS) maxZ = 0.6875;
                        const u0 = connW ? 0 : 0.3125;
                        const u1 = connE ? 1 : 0.6875;
                        const v0 = connN ? 0 : 0.3125;
                        const v1 = connS ? 1 : 0.6875;
                        uv = [u0, v1, u1, v1, u1, v0, u0, v0];
                    } else {
                        minX = 0.3125;
                        maxX = 0.6875;
                        minZ = 0.3125;
                        maxZ = 0.6875;
                        uv = [0.3125, 0.6875, 0.6875, 0.6875, 0.6875, 0.3125, 0.3125, 0.3125];
                    }

                    const pts = [minX, y, maxZ, maxX, y, maxZ, maxX, y, minZ, minX, y, minZ];
                    for (let i = 0; i < 12; i += 3) {
                        data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                        data.colors.push(r, g, b);
                    }
                    data.uvs.push(...uv);
                    data.indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
                    data.groups.push({ start: data.indices.length - 6, count: 6, matIndex });
                    const colorBase = data.colors.length - 12;
                    for (let i = 0; i < 4; i++) {
                        data.colors[colorBase + i * 3 + 0] = r;
                        data.colors[colorBase + i * 3 + 1] = g;
                        data.colors[colorBase + i * 3 + 2] = b;
                    }
                    continue;
                }

                if (isSlabId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const yMin = 0;
                    const yMax = 0.5;
                    const minX = 0;
                    const maxX = 1;
                    const minZ = 0;
                    const maxZ = 1;
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts, uv) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                    };
                    const fullUv = [0, 0, 1, 0, 1, 1, 0, 1];
                    pushFace([minX, yMax, minZ, maxX, yMax, minZ, maxX, yMax, maxZ, minX, yMax, maxZ], fullUv);
                    pushFace([minX, yMin, maxZ, maxX, yMin, maxZ, maxX, yMin, minZ, minX, yMin, minZ], fullUv);
                    pushFace([maxX, yMin, minZ, maxX, yMax, minZ, minX, yMax, minZ, minX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, maxZ, minX, yMax, maxZ, maxX, yMax, maxZ, maxX, yMin, maxZ], fullUv);
                    pushFace([maxX, yMin, maxZ, maxX, yMax, maxZ, maxX, yMax, minZ, maxX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, minZ, minX, yMax, minZ, minX, yMax, maxZ, minX, yMin, maxZ], fullUv);
                    // top
                    data.indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
                    data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 0 });
                    // bottom
                    data.indices.push(baseIndex + 4, baseIndex + 5, baseIndex + 6, baseIndex + 6, baseIndex + 7, baseIndex + 4);
                    data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 1 });
                    // sides
                    for (let i = 2; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 24, count: 24, matIndex: 2 });
                    continue;
                }

                if (isRepeaterId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const orient = meta & 3;
                    const delay = (meta >> 2) & 3;
                    const facing = orient === 0 ? 'north' : (orient === 1 ? 'east' : (orient === 2 ? 'south' : 'west'));
                    if (type === 93 || type === 94) {
                        pushSouthAuthoredRepeater(data, wx, wy, wz, lightVal, facing, delay, type);
                    } else {
                        const yMin = 0;
                        const yMax = 1 / 8;
                        const minX = 0;
                        const maxX = 1;
                        const minZ = 0;
                        const maxZ = 1;
                        const baseIndex = data.vertices.length / 3;
                        const rotateXZ = (x, z) => {
                            const dx = x - 0.5;
                            const dz = z - 0.5;
                            if (orient === 0) return [0.5 + dx, 0.5 + dz];
                            if (orient === 1) return [0.5 - dx, 0.5 - dz];
                            if (orient === 2) return [0.5 + dz, 0.5 - dx];
                            return [0.5 - dz, 0.5 + dx];
                        };
                        const pushFace = (pts, uv) => {
                            for (let i = 0; i < 12; i += 3) {
                                data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                                data.colors.push(lightVal, lightVal, lightVal);
                            }
                            data.uvs.push(...uv);
                        };
                        const fullUv = [0, 0, 1, 0, 1, 1, 0, 1];
                        pushFace([minX, yMax, minZ, maxX, yMax, minZ, maxX, yMax, maxZ, minX, yMax, maxZ], fullUv);
                        pushFace([minX, yMin, maxZ, maxX, yMin, maxZ, maxX, yMin, minZ, minX, yMin, minZ], fullUv);
                        pushFace([maxX, yMin, minZ, maxX, yMax, minZ, minX, yMax, minZ, minX, yMin, minZ], fullUv);
                        pushFace([minX, yMin, maxZ, minX, yMax, maxZ, maxX, yMax, maxZ, maxX, yMin, maxZ], fullUv);
                        pushFace([maxX, yMin, maxZ, maxX, yMax, maxZ, maxX, yMax, minZ, maxX, yMin, minZ], fullUv);
                        pushFace([minX, yMin, minZ, minX, yMax, minZ, minX, yMax, maxZ, minX, yMin, maxZ], fullUv);
                        data.indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
                        data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 0 });
                        data.indices.push(baseIndex + 4, baseIndex + 5, baseIndex + 6, baseIndex + 6, baseIndex + 7, baseIndex + 4);
                        data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 1 });
                        for (let i = 2; i < 6; i++) {
                            const o = baseIndex + i * 4;
                            data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                        }
                        data.groups.push({ start: data.indices.length - 24, count: 24, matIndex: 2 });

                        const pushTorch = (cx, cz, h = 3 / 16) => {
                            const [rx, rz] = rotateXZ(cx, cz);
                            const half = 1 / 16;
                            const tx1 = rx - half, tx2 = rx + half;
                            const tz1 = rz - half, tz2 = rz + half;
                            const ty1 = yMax;
                            const ty2 = yMax + h;
                            const tBase = data.vertices.length / 3;
                            pushFace([tx1, ty2, tz1, tx2, ty2, tz1, tx2, ty2, tz2, tx1, ty2, tz2], fullUv);
                            pushFace([tx1, ty1, tz2, tx2, ty1, tz2, tx2, ty1, tz1, tx1, ty1, tz1], fullUv);
                            pushFace([tx2, ty1, tz1, tx2, ty2, tz1, tx1, ty2, tz1, tx1, ty1, tz1], fullUv);
                            pushFace([tx1, ty1, tz2, tx1, ty2, tz2, tx2, ty2, tz2, tx2, ty1, tz2], fullUv);
                            pushFace([tx2, ty1, tz2, tx2, ty2, tz2, tx2, ty2, tz1, tx2, ty1, tz1], fullUv);
                            pushFace([tx1, ty1, tz1, tx1, ty2, tz1, tx1, ty2, tz2, tx1, ty1, tz2], fullUv);
                            for (let i = 0; i < 6; i++) {
                                const o = tBase + i * 4;
                                data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                            }
                            data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                        };
                        pushTorch(0.5, 0.28);
                        pushTorch(0.5, 0.72 - delay * 0.08);
                    }
                    continue;
                }

                if (isTrapdoorId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const dir = meta & 3;
                    const isOpen = (meta & 4) !== 0;
                    const isTopHalf = (meta & 8) !== 0;
                    const thickness = 3 / 16;
                    let minX = 0;
                    let maxX = 1;
                    let minY = 0;
                    let maxY = thickness;
                    let minZ = 0;
                    let maxZ = 1;
                    if (!isOpen) {
                        if (isTopHalf) {
                            minY = 1 - thickness;
                            maxY = 1;
                        }
                    } else if (dir === 0) { // south support
                        minZ = 1 - thickness;
                        maxZ = 1;
                        minY = 0;
                        maxY = 1;
                    } else if (dir === 1) { // north support
                        minZ = 0;
                        maxZ = thickness;
                        minY = 0;
                        maxY = 1;
                    } else if (dir === 2) { // east support
                        minX = 1 - thickness;
                        maxX = 1;
                        minY = 0;
                        maxY = 1;
                    } else { // west support
                        minX = 0;
                        maxX = thickness;
                        minY = 0;
                        maxY = 1;
                    }
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts, uv) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                    };
                    const fullUv = [0, 0, 1, 0, 1, 1, 0, 1];
                    pushFace([minX, maxY, minZ, maxX, maxY, minZ, maxX, maxY, maxZ, minX, maxY, maxZ], fullUv);
                    pushFace([minX, minY, maxZ, maxX, minY, maxZ, maxX, minY, minZ, minX, minY, minZ], fullUv);
                    pushFace([maxX, minY, minZ, maxX, maxY, minZ, minX, maxY, minZ, minX, minY, minZ], fullUv);
                    pushFace([minX, minY, maxZ, minX, maxY, maxZ, maxX, maxY, maxZ, maxX, minY, maxZ], fullUv);
                    pushFace([maxX, minY, maxZ, maxX, maxY, maxZ, maxX, maxY, minZ, maxX, minY, minZ], fullUv);
                    pushFace([minX, minY, minZ, minX, maxY, minZ, minX, maxY, maxZ, minX, minY, maxZ], fullUv);
                    for (let i = 0; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    continue;
                }

                if (isLadderId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const m = meta & 7;
                    const inset = 1 / 32;
                    let x1 = 0, x2 = 1, z1 = 0, z2 = 1;
                    if (m === 2) { z1 = 1 - inset; z2 = 1 - inset; }
                    else if (m === 3) { z1 = inset; z2 = inset; }
                    else if (m === 4) { x1 = 1 - inset; x2 = 1 - inset; }
                    else { x1 = inset; x2 = inset; }
                    const baseIndex = data.vertices.length / 3;
                    const pts = [x1, 0, z1, x2, 0, z2, x2, 1, z2, x1, 1, z1];
                    for (let i = 0; i < 12; i += 3) {
                        data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                        data.colors.push(lightVal, lightVal, lightVal);
                    }
                    data.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
                    data.indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
                    data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 0 });
                    continue;
                }

                if (isSignPostId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const pushBox = (minX, maxX, minY, maxY, minZ, maxZ) => {
                        const baseIndex = data.vertices.length / 3;
                        const pushFace = (pts) => {
                            for (let i = 0; i < 12; i += 3) {
                                data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                                data.colors.push(lightVal, lightVal, lightVal);
                            }
                            data.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
                        };
                        pushFace([minX, maxY, minZ, maxX, maxY, minZ, maxX, maxY, maxZ, minX, maxY, maxZ]);
                        pushFace([minX, minY, maxZ, maxX, minY, maxZ, maxX, minY, minZ, minX, minY, minZ]);
                        pushFace([maxX, minY, minZ, maxX, maxY, minZ, minX, maxY, minZ, minX, minY, minZ]);
                        pushFace([minX, minY, maxZ, minX, maxY, maxZ, maxX, maxY, maxZ, maxX, minY, maxZ]);
                        pushFace([maxX, minY, maxZ, maxX, maxY, maxZ, maxX, maxY, minZ, maxX, minY, minZ]);
                        pushFace([minX, minY, minZ, minX, maxY, minZ, minX, maxY, maxZ, minX, minY, maxZ]);
                        for (let i = 0; i < 6; i++) {
                            const o = baseIndex + i * 4;
                            data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                        }
                        data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    };
                    // board
                    pushBox(3 / 16, 13 / 16, 8 / 16, 14 / 16, 6 / 16, 10 / 16);
                    // post
                    pushBox(7 / 16, 9 / 16, 0, 8 / 16, 7 / 16, 9 / 16);
                    continue;
                }

                if (isWallSignId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const m = meta & 15;
                    let minX = 3 / 16, maxX = 13 / 16, minY = 4 / 16, maxY = 12 / 16, minZ = 0, maxZ = 1;
                    const t = 1 / 16;
                    if (m === 2) { minZ = 1 - t; maxZ = 1; minX = 3 / 16; maxX = 13 / 16; }
                    else if (m === 3) { minZ = 0; maxZ = t; minX = 3 / 16; maxX = 13 / 16; }
                    else if (m === 4) { minX = 1 - t; maxX = 1; minZ = 3 / 16; maxZ = 13 / 16; }
                    else { minX = 0; maxX = t; minZ = 3 / 16; maxZ = 13 / 16; }
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
                    };
                    pushFace([minX, maxY, minZ, maxX, maxY, minZ, maxX, maxY, maxZ, minX, maxY, maxZ]);
                    pushFace([minX, minY, maxZ, maxX, minY, maxZ, maxX, minY, minZ, minX, minY, minZ]);
                    pushFace([maxX, minY, minZ, maxX, maxY, minZ, minX, maxY, minZ, minX, minY, minZ]);
                    pushFace([minX, minY, maxZ, minX, maxY, maxZ, maxX, maxY, maxZ, maxX, minY, maxZ]);
                    pushFace([maxX, minY, maxZ, maxX, maxY, maxZ, maxX, maxY, minZ, maxX, minY, minZ]);
                    pushFace([minX, minY, minZ, minX, maxY, minZ, minX, maxY, maxZ, minX, minY, maxZ]);
                    for (let i = 0; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    continue;
                }

                if (isDoorId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    let renderMeta = meta & 15;
                    if ((renderMeta & 8) !== 0) {
                        const belowId = getB(wx, wy - 1, wz);
                        if (isDoorId(belowId)) {
                            renderMeta = (renderMeta & 8) | (getM(wx, wy - 1, wz) & 7);
                        }
                    }
                    const m = renderMeta & 3;
                    const isOpen = (renderMeta & 4) !== 0;
                    const thickness = 3 / 16;
                    let minX = 0, maxX = 1, minZ = 0, maxZ = 1;
                    const nsPlane = (!isOpen && (m === 0 || m === 2)) || (isOpen && (m === 1 || m === 3));
                    if (nsPlane) {
                        minZ = 0.5 - thickness / 2;
                        maxZ = 0.5 + thickness / 2;
                    } else {
                        minX = 0.5 - thickness / 2;
                        maxX = 0.5 + thickness / 2;
                    }
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
                    };
                    pushFace([minX, 1, minZ, maxX, 1, minZ, maxX, 1, maxZ, minX, 1, maxZ]);
                    pushFace([minX, 0, maxZ, maxX, 0, maxZ, maxX, 0, minZ, minX, 0, minZ]);
                    pushFace([maxX, 0, minZ, maxX, 1, minZ, minX, 1, minZ, minX, 0, minZ]);
                    pushFace([minX, 0, maxZ, minX, 1, maxZ, maxX, 1, maxZ, maxX, 0, maxZ]);
                    pushFace([maxX, 0, maxZ, maxX, 1, maxZ, maxX, 1, minZ, maxX, 0, minZ]);
                    pushFace([minX, 0, minZ, minX, 1, minZ, minX, 1, maxZ, minX, 0, maxZ]);
                    for (let i = 0; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    continue;
                }

                if (isPaintingId(type)) {
                    // Placeholder painting mesh removed: paintings are handled by runtime parity path.
                    continue;
                }

                if (isBoatBlockId(type) || isMinecartBlockId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const isBoat = isBoatBlockId(type);
                    const minX = isBoat ? (1 / 16) : (2 / 16);
                    const maxX = 1 - minX;
                    const minZ = isBoat ? (1 / 16) : (2 / 16);
                    const maxZ = 1 - minZ;
                    const yMin = 0;
                    const yMax = isBoat ? (4 / 16) : (5 / 16);
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts, uv) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                    };
                    const fullUv = [0, 0, 1, 0, 1, 1, 0, 1];
                    pushFace([minX, yMax, minZ, maxX, yMax, minZ, maxX, yMax, maxZ, minX, yMax, maxZ], fullUv);
                    pushFace([minX, yMin, maxZ, maxX, yMin, maxZ, maxX, yMin, minZ, minX, yMin, minZ], fullUv);
                    pushFace([maxX, yMin, minZ, maxX, yMax, minZ, minX, yMax, minZ, minX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, maxZ, minX, yMax, maxZ, maxX, yMax, maxZ, maxX, yMin, maxZ], fullUv);
                    pushFace([maxX, yMin, maxZ, maxX, yMax, maxZ, maxX, yMax, minZ, maxX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, minZ, minX, yMax, minZ, minX, yMax, maxZ, minX, yMin, maxZ], fullUv);
                    for (let i = 0; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    continue;
                }

                if (isBedBlockId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    pushSouthAuthoredBed(data, wx, wy, wz, lightVal, meta);
                    continue;
                }

                if (isCakeBlockId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const bites = Math.max(0, Math.min(6, meta & 7));
                    const inset = 1 / 16;
                    const height = 8 / 16;
                    const yMin = 0;
                    const yMax = height;
                    const minX = Math.min(1 - inset, inset + bites * (2 / 16));
                    const maxX = 1 - inset;
                    const minZ = inset;
                    const maxZ = 1 - inset;
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts, uv) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                    };
                    const fullUv = [0, 0, 1, 0, 1, 1, 0, 1];
                    pushFace([minX, yMax, minZ, maxX, yMax, minZ, maxX, yMax, maxZ, minX, yMax, maxZ], fullUv);
                    pushFace([minX, yMin, maxZ, maxX, yMin, maxZ, maxX, yMin, minZ, minX, yMin, minZ], fullUv);
                    pushFace([maxX, yMin, minZ, maxX, yMax, minZ, minX, yMax, minZ, minX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, maxZ, minX, yMax, maxZ, maxX, yMax, maxZ, maxX, yMin, maxZ], fullUv);
                    pushFace([maxX, yMin, maxZ, maxX, yMax, maxZ, maxX, yMax, minZ, maxX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, minZ, minX, yMax, minZ, minX, yMax, maxZ, minX, yMin, maxZ], fullUv);
                    for (let i = 0; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    continue;
                }

                if (isFenceId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const canFenceConnect = (tx, ty, tz) => {
                        const nid = chunkManager.getBlock(tx, ty, tz);
                        if (nid === 0 || isFluidId(nid) || isTorchId(nid) || isFlowerId(nid) || isMushroomId(nid) || isCropId(nid)) return false;
                        if (isFenceId(nid)) return true;
                        return isBlockOpaque(nid);
                    };

                    const connectN = canFenceConnect(wx, wy, wz - 1);
                    const connectS = canFenceConnect(wx, wy, wz + 1);
                    const connectW = canFenceConnect(wx - 1, wy, wz);
                    const connectE = canFenceConnect(wx + 1, wy, wz);

                    const boxes = [{ minX: 6 / 16, maxX: 10 / 16, minY: 0, maxY: 1, minZ: 6 / 16, maxZ: 10 / 16 }];
                    const addRails = (minX, maxX, minZ, maxZ) => {
                        boxes.push({ minX, maxX, minY: 6 / 16, maxY: 9 / 16, minZ, maxZ });
                        boxes.push({ minX, maxX, minY: 12 / 16, maxY: 15 / 16, minZ, maxZ });
                    };
                    if (connectN) addRails(7 / 16, 9 / 16, 0 / 16, 8 / 16);
                    if (connectS) addRails(7 / 16, 9 / 16, 8 / 16, 16 / 16);
                    if (connectW) addRails(0 / 16, 8 / 16, 7 / 16, 9 / 16);
                    if (connectE) addRails(8 / 16, 16 / 16, 7 / 16, 9 / 16);
                    const pushBox = (box) => {
                        const baseIndex = data.vertices.length / 3;
                        const { minX, maxX, minY, maxY, minZ, maxZ } = box;
                        const pushFace = (pts) => {
                            for (let i = 0; i < 12; i += 3) {
                                data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                                data.colors.push(lightVal, lightVal, lightVal);
                            }
                            data.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
                        };
                        pushFace([minX, maxY, minZ, maxX, maxY, minZ, maxX, maxY, maxZ, minX, maxY, maxZ]);
                        pushFace([minX, minY, maxZ, maxX, minY, maxZ, maxX, minY, minZ, minX, minY, minZ]);
                        pushFace([maxX, minY, minZ, maxX, maxY, minZ, minX, maxY, minZ, minX, minY, minZ]);
                        pushFace([minX, minY, maxZ, minX, maxY, maxZ, maxX, maxY, maxZ, maxX, minY, maxZ]);
                        pushFace([maxX, minY, maxZ, maxX, maxY, maxZ, maxX, maxY, minZ, maxX, minY, minZ]);
                        pushFace([minX, minY, minZ, minX, maxY, minZ, minX, maxY, maxZ, minX, minY, maxZ]);
                        for (let i = 0; i < 6; i++) {
                            const o = baseIndex + i * 4;
                            data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                        }
                        data.groups.push({ start: data.indices.length - 36, count: 36, matIndex: 0 });
                    };
                    for (const box of boxes) pushBox(box);
                    continue;
                }

                if (isFarmlandId(type)) {
                    const lightVal = Math.max(0.05, Math.pow(getL(wx, wy, wz) / 15.0, 1.6));
                    const yMin = 0;
                    const yMax = 15 / 16;
                    const minX = 0;
                    const maxX = 1;
                    const minZ = 0;
                    const maxZ = 1;
                    const baseIndex = data.vertices.length / 3;
                    const pushFace = (pts, uv) => {
                        for (let i = 0; i < 12; i += 3) {
                            data.vertices.push(wx + pts[i] - 0.5, wy + pts[i + 1] - 0.5, wz + pts[i + 2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                    };
                    const fullUv = [0, 0, 1, 0, 1, 1, 0, 1];
                    pushFace([minX, yMax, minZ, maxX, yMax, minZ, maxX, yMax, maxZ, minX, yMax, maxZ], fullUv);
                    pushFace([minX, yMin, maxZ, maxX, yMin, maxZ, maxX, yMin, minZ, minX, yMin, minZ], fullUv);
                    pushFace([maxX, yMin, minZ, maxX, yMax, minZ, minX, yMax, minZ, minX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, maxZ, minX, yMax, maxZ, maxX, yMax, maxZ, maxX, yMin, maxZ], fullUv);
                    pushFace([maxX, yMin, maxZ, maxX, yMax, maxZ, maxX, yMax, minZ, maxX, yMin, minZ], fullUv);
                    pushFace([minX, yMin, minZ, minX, yMax, minZ, minX, yMax, maxZ, minX, yMin, maxZ], fullUv);
                    data.indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
                    data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 0 });
                    data.indices.push(baseIndex + 4, baseIndex + 5, baseIndex + 6, baseIndex + 6, baseIndex + 7, baseIndex + 4);
                    data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 1 });
                    for (let i = 2; i < 6; i++) {
                        const o = baseIndex + i * 4;
                        data.indices.push(o, o + 1, o + 2, o + 2, o + 3, o);
                    }
                    data.groups.push({ start: data.indices.length - 24, count: 24, matIndex: 2 });
                    continue;
                }

                // --- Snow layer (78): 1/8 block height, top + 4 sides (sides use bottom 2 px of texture) ---
                if (type === 78) {
                    const h = 1 / 8; // 0.125
                    // Bottom 2 pixels of a 16px texture in 0-1 UV
                    const vLo = 14 / 16, vHi = 16 / 16;
                    const pushQuad = (corners, uv, lightVal) => {
                        const baseIndex = data.vertices.length / 3;
                        for (const pt of corners) {
                            data.vertices.push(wx + pt[0] - 0.5, wy + pt[1] - 0.5, wz + pt[2] - 0.5);
                            data.colors.push(lightVal, lightVal, lightVal);
                        }
                        data.uvs.push(...uv);
                        data.indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex);
                    };
                    const topLight = Math.max(0.05, Math.pow(getL(wx, wy + 1, wz) / 15.0, 1.6));
                    const lN = Math.max(0.05, Math.pow(getL(wx, wy, wz - 1) / 15.0, 1.6));
                    const lS = Math.max(0.05, Math.pow(getL(wx, wy, wz + 1) / 15.0, 1.6));
                    const lE = Math.max(0.05, Math.pow(getL(wx + 1, wy, wz) / 15.0, 1.6));
                    const lW = Math.max(0.05, Math.pow(getL(wx - 1, wy, wz) / 15.0, 1.6));
                    // Top (normal up)
                    pushQuad(
                        [[0, h, 0], [0, h, 1], [1, h, 1], [1, h, 0]],
                        [0, 0, 0, 1, 1, 1, 1, 0],
                        topLight
                    );
                    // South (+Z), North (-Z), East (+X), West (-X) — sides show bottom 2 pixels of texture
                    pushQuad([[0, 0, 1], [1, 0, 1], [1, h, 1], [0, h, 1]], [0, vLo, 1, vLo, 1, vHi, 0, vHi], lS);
                    pushQuad([[1, 0, 0], [0, 0, 0], [0, h, 0], [1, h, 0]], [0, vLo, 1, vLo, 1, vHi, 0, vHi], lN);
                    // X-side winding must face outward for FrontSide atlas batches.
                    pushQuad([[1, 0, 1], [1, 0, 0], [1, h, 0], [1, h, 1]], [0, vLo, 1, vLo, 1, vHi, 0, vHi], lE);
                    pushQuad([[0, 0, 0], [0, 0, 1], [0, h, 1], [0, h, 0]], [0, vLo, 1, vLo, 1, vHi, 0, vHi], lW);
                    data.groups.push({ start: data.indices.length - 30, count: 30, matIndex: 0 });
                    continue;
                }

                for (const face of FACES) {
                    const nx = wx + face.dir[0];
                    const ny = wy + face.dir[1];
                    const nz = wz + face.dir[2];

                    const nType = chunkManager.getBlock(nx, ny, nz);
                    let occluded = false;

                    // For fluids and ice at chunk edge: hide side faces facing an unloaded
                    // chunk (avoids visible border walls until neighbor loads).
                    if (isFluidId(type) || type === 79) {
                        const ncx = Math.floor(nx / CHUNK_SIZE);
                        const ncy = Math.floor(ny / CHUNK_SIZE);
                        const ncz = Math.floor(nz / CHUNK_SIZE);
                        const isSideFace = face.dir[1] === 0;
                        if (isSideFace && (ncx !== cx || ncy !== cy || ncz !== cz)) {
                            const neighborChunk = chunkManager.getChunk(ncx, ncy, ncz);
                            if (!neighborChunk || !neighborChunk.isGenerated) {
                                occluded = true;
                            }
                        }
                    }
                    // GLASS FAMILY & PORTAL LOGIC
                    if (isGlassId(type) || type === 90) {
                        if (nType === type) occluded = true; // Hide face if neighbor is same type
                        else occluded = isBlockOpaque(nType); // Normal occlusion otherwise
                    }
                    else if (type === 79) {
                        // Ice: use water-like seam logic (same-type cull + opaque neighbor cull).
                        if (nType === type) occluded = true;
                        else if (!occluded) occluded = isBlockOpaque(nType);
                    }
                    else if (type === 5) {
                        // LEAVES (ID 5): Show all faces even when touching other leaves
                        // Only occlude if neighbor is opaque (not leaves or other transparent blocks)
                        occluded = isBlockOpaque(nType) && !isFluidId(nType);
                    }
                    else if (isFluidId(type)) { 
                        // Hide seams between still<->flowing of the same fluid kind.
                        const thisKind = fluidKindFromId(type);
                        const neighborKind = fluidKindFromId(nType);
                        if (thisKind !== null && thisKind === neighborKind) occluded = true;
                        else if (!occluded) occluded = isBlockOpaque(nType);
                    } else {
                        // Standard blocks: hide face when covered by another surface (improves FPS).
                        // Snow (78) never occludes: it's a thin layer so blocks next to it keep their side faces visible.
                        const neighborActsAsFullOccluder =
                            isBlockOpaque(nType) &&
                            !isFluidId(nType) &&
                            nType !== 78 &&
                            !isPistonId(nType);
                        occluded = neighborActsAsFullOccluder || (nType === type);
                    }

                    if (!occluded) {
                        const baseIndex = data.vertices.length / 3;
                        const dx = face.dir[0], dy = face.dir[1], dz = face.dir[2];
                        let grassSideIsSnowy = false;
                        let grassOverlayTint = null;

                        let tint = null;
                        if (type === 1 && face.matIdx === 2) {
                            tint = getColumnTint(wx, wz, false);
                        } else if (type === 1 && face.matIdx !== 2 && face.matIdx !== 3) {
                            const aboveId = chunkManager.getBlock(wx, wy + 1, wz);
                            grassSideIsSnowy = (aboveId === 78);
                            if (!grassSideIsSnowy) {
                                grassOverlayTint = getColumnTint(wx, wz, false);
                            }
                        } else if (type === 5) {
                            // Beta leaf-color parity:
                            // meta 1 = pine constant tint, meta 2 = birch constant tint, else biome foliage tint.
                            const leafVariant = meta & 3;
                            if (leafVariant === 1) tint = PINE_LEAF_TINT;
                            else if (leafVariant === 2) tint = BIRCH_LEAF_TINT;
                            else tint = getColumnTint(wx, wz, true);
                        }

                        for (const corner of face.corners) {
                            const cx = corner[0] * 2 - 1; 
                            const cy = corner[1] * 2 - 1; 
                            const cz = corner[2] * 2 - 1; 

                            let ox1=0, oy1=0, oz1=0; 
                            let ox2=0, oy2=0, oz2=0; 
                            let oxc=0, oyc=0, ozc=0; 
                            
                            let oxp=dx, oyp=dy, ozp=dz;

                            if (face.dir[0] !== 0) { 
                                ox1 = dx; oy1 = cy; oz1 = 0;
                                ox2 = dx; oy2 = 0; oz2 = cz;
                                oxc = dx; oyc = cy; ozc = cz;
                            } else if (face.dir[1] !== 0) { 
                                ox1 = cx; oy1 = dy; oz1 = 0;
                                ox2 = 0;  oy2 = dy; oz2 = cz;
                                oxc = cx; oyc = dy; ozc = cz;
                            } else { 
                                ox1 = cx; oy1 = 0; oz1 = dz;
                                ox2 = 0;  oy2 = cy; oz2 = dz;
                                oxc = cx; oyc = cy; ozc = dz;
                            }
                            
                            let aoVal = 0;
                            let lightAvg = 0;

                            if (!isFluidId(type)) {
                                const s1 = isSolid(wx + ox1, wy + oy1, wz + oz1);
                                const s2 = isSolid(wx + ox2, wy + oy2, wz + oz2);
                                const c  = isSolid(wx + oxc, wy + oyc, wz + ozc);
                                aoVal = vertexAO(s1, s2, c);

                                const l_p  = getL(wx + oxp, wy + oyp, wz + ozp);
                                const l_s1 = getL(wx + ox1, wy + oy1, wz + oz1);
                                const l_s2 = getL(wx + ox2, wy + oy2, wz + oz2);
                                const l_c  = getL(wx + oxc, wy + oyc, wz + ozc);
                                lightAvg = (l_p + l_s1 + l_s2 + l_c) / 4.0;
                            } else {
                                // Fallback for fluids
                                lightAvg = getL(nx, ny, nz);
                            }

                            // --- Final Color Calculation ---
                            // 1. Gamma Curve
                            const lightIntensity = Math.pow(lightAvg / 15.0, 1.6); 
                            const minLight = 0.05; 
                            let val = Math.max(minLight, lightIntensity);

                            // 2. Apply AO Factor
                            const aoFactor = 1.0 - (aoVal * 0.2);
                            val *= aoFactor;

                            // Push Vertex Data
                            let waterY = corner[1];
                            
                            // Fluid Vertex Height Logic
                            if (isFluidId(type) && corner[1] === 1) {
                                const ox = (corner[0] === 0) ? -1 : 0;
                                const oz = (corner[2] === 0) ? -1 : 0;
                                
                                const h1 = getWaterBlockHeight(wx + ox, wy, wz + oz);
                                const h2 = getWaterBlockHeight(wx + ox + 1, wy, wz + oz);
                                const h3 = getWaterBlockHeight(wx + ox, wy, wz + oz + 1);
                                const h4 = getWaterBlockHeight(wx + ox + 1, wy, wz + oz + 1);
                                
                                let maxH = 0.125;
                                
                                if (corner[0] === 0 && corner[2] === 0) {
                                     maxH = Math.max(h4, h2, h3);
                                     if (h2 > 0 || h3 > 0) maxH = Math.max(maxH, h1);
                                } else if (corner[0] === 1 && corner[2] === 0) {
                                     maxH = Math.max(h3, h1, h4);
                                     if (h1 > 0 || h4 > 0) maxH = Math.max(maxH, h2);
                                } else if (corner[0] === 0 && corner[2] === 1) {
                                     maxH = Math.max(h2, h1, h4);
                                     if (h1 > 0 || h4 > 0) maxH = Math.max(maxH, h3);
                                } else { 
                                     maxH = Math.max(h1, h2, h3);
                                     if (h2 > 0 || h3 > 0) maxH = Math.max(maxH, h4);
                                }
                                
                                if (maxH !== -1) {
                                    waterY = maxH;
                                } else {
                                    waterY = 0.125; 
                                }
                            }
                            
                            // For leaves (ID 5) touching other leaves, add small offset to prevent z-fighting
                            let offsetX = 0, offsetY = 0, offsetZ = 0;
                            if (type === 5 && nType === 5) {
                                // Add tiny offset along face normal to prevent z-fighting
                                // Offset is very small (0.001) so it's barely noticeable but prevents glitching
                                offsetX = dx * 0.001;
                                offsetY = dy * 0.001;
                                offsetZ = dz * 0.001;
                            }
                            
                            data.vertices.push(
                                wx + corner[0] - 0.5 + offsetX, 
                                wy + (isFluidId(type) ? waterY : corner[1]) - 0.5 + offsetY, 
                                wz + corner[2] - 0.5 + offsetZ
                            );
                            if (tint) {
                                data.colors.push(val * tint.r, val * tint.g, val * tint.b);
                            } else {
                                data.colors.push(val, val, val);
                            }
                        }
                        
                        data.uvs.push(...face.uv);
                        data.indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex);
                        
                        let matIdx = face.matIdx;
                        // Beta grass rendering rule: side becomes snowy when snow layer sits above.
                        // Keep block id as grass; only override side-face material index.
                        if (type === 1 && matIdx !== 2 && matIdx !== 3) {
                            if (grassSideIsSnowy) {
                                matIdx = 6; // world.js grass material slot: snowy side
                            }
                        }
                        if (isFurnaceId(type) || isDispenserId(type) || isPumpkinId(type)) {
                            const FACE_E = 0, FACE_W = 1, FACE_T = 2, FACE_B = 3, FACE_S = 4, FACE_N = 5;
                            const MAT_FRONT = 5, MAT_SIDE = 0; 
                            if (matIdx !== 2 && matIdx !== 3) { 
                                matIdx = MAT_SIDE; 
                                if (meta === 0 && face.matIdx === FACE_S) matIdx = MAT_FRONT;
                                if (meta === 1 && face.matIdx === FACE_W) matIdx = MAT_FRONT;
                                if (meta === 2 && face.matIdx === FACE_N) matIdx = MAT_FRONT;
                                if (meta === 3 && face.matIdx === FACE_E) matIdx = MAT_FRONT;
                            }
                        }
                        data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: matIdx });

                        if (type === 1 && grassOverlayTint && matIdx !== 6) {
                            const overlayBaseIndex = data.vertices.length / 3;

                            for (const corner of face.corners) {
                                const cx = corner[0] * 2 - 1;
                                const cy = corner[1] * 2 - 1;
                                const cz = corner[2] * 2 - 1;

                                let ox1=0, oy1=0, oz1=0;
                                let ox2=0, oy2=0, oz2=0;
                                let oxc=0, oyc=0, ozc=0;
                                let oxp=dx, oyp=dy, ozp=dz;

                                if (face.dir[0] !== 0) {
                                    ox1 = dx; oy1 = cy; oz1 = 0;
                                    ox2 = dx; oy2 = 0; oz2 = cz;
                                    oxc = dx; oyc = cy; ozc = cz;
                                } else if (face.dir[1] !== 0) {
                                    ox1 = cx; oy1 = dy; oz1 = 0;
                                    ox2 = 0; oy2 = dy; oz2 = cz;
                                    oxc = cx; oyc = dy; ozc = cz;
                                } else {
                                    ox1 = cx; oy1 = 0; oz1 = dz;
                                    ox2 = 0; oy2 = cy; oz2 = dz;
                                    oxc = cx; oyc = cy; ozc = dz;
                                }

                                const s1 = isSolid(wx + ox1, wy + oy1, wz + oz1);
                                const s2 = isSolid(wx + ox2, wy + oy2, wz + oz2);
                                const c = isSolid(wx + oxc, wy + oyc, wz + ozc);
                                const aoVal = vertexAO(s1, s2, c);

                                const l_p = getL(wx + oxp, wy + oyp, wz + ozp);
                                const l_s1 = getL(wx + ox1, wy + oy1, wz + oz1);
                                const l_s2 = getL(wx + ox2, wy + oy2, wz + oz2);
                                const l_c = getL(wx + oxc, wy + oyc, wz + ozc);
                                const lightAvg = (l_p + l_s1 + l_s2 + l_c) / 4.0;

                                const lightIntensity = Math.pow(lightAvg / 15.0, 1.6);
                                const minLight = 0.05;
                                let val = Math.max(minLight, lightIntensity);
                                const aoFactor = 1.0 - (aoVal * 0.2);
                                val *= aoFactor;

                                data.vertices.push(
                                    wx + corner[0] - 0.5,
                                    wy + corner[1] - 0.5,
                                    wz + corner[2] - 0.5
                                );
                                data.colors.push(
                                    val * grassOverlayTint.r,
                                    val * grassOverlayTint.g,
                                    val * grassOverlayTint.b
                                );
                            }

                            data.uvs.push(...face.uv);
                            data.indices.push(
                                overlayBaseIndex,
                                overlayBaseIndex + 1,
                                overlayBaseIndex + 2,
                                overlayBaseIndex + 2,
                                overlayBaseIndex + 3,
                                overlayBaseIndex
                            );
                            data.groups.push({ start: data.indices.length - 6, count: 6, matIndex: 7 });
                        }
                    }
                }
            }
        }
    }

    const transferables = [];
    const payload = {};

    for (const id in geometryData) {
        const d = geometryData[id];
        if (d.vertices.length === 0) continue;
        const vArray = new Float32Array(d.vertices);
        const uArray = new Float32Array(d.uvs);
        
        // Only transfer color buffer if it has data
        const cArray = (d.colors && d.colors.length > 0) ? new Float32Array(d.colors) : null;
        
        const iArray = new Uint32Array(d.indices);
        
        transferables.push(vArray.buffer, uArray.buffer, iArray.buffer);
        if (cArray) transferables.push(cArray.buffer);
        
        payload[id] = {
            vertices: vArray,
            uvs: uArray,
            colors: cArray,
            indices: iArray,
            groups: d.groups,
            forceAtlas: !!d.forceAtlas,
            transparentAtlas: !!d.transparentAtlas
        };
    }

    // Keep collision data in sync when late population mutates already-streamed chunks.
    flushChunkDataSyncIfNeeded(cx, cy, cz);

    // Always send geometry message, even if payload is empty (chunk is now empty)
    self.postMessage({
        type: 'geometry',
        key: getChunkKey(startX, startY, startZ),
        geometry: payload
    }, transferables);
    emitChunkTrace('meshed', cx, cy, cz);
}
