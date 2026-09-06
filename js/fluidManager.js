// js/fluidManager.js
import { CHUNK_SIZE, WORLD_DEPTH, WORLD_HEIGHT } from './constants.js';
import {
    WATER_MOVING_ID,
    WATER_STILL_ID,
    LAVA_MOVING_ID,
    LAVA_STILL_ID,
    isWaterId,
    isLavaId,
    isFluidId,
    fluidKindFromId,
    movingIdForKind,
    stillIdForKind
} from './fluidIds.js';
import { isObsidianId, isReedId, isTorchId } from './blocks.js';

function randInt(bound) {
    return Math.floor(Math.random() * bound);
}

export class FluidManager {
    constructor(chunkManager, updateBlockCallback) {
        this.chunkManager = chunkManager;
        this.updateBlock = updateBlockCallback;

        this.waterTimer = 0;
        this.waterTickRate = 0.15;
        this.lavaTimer = 0;
        this.lavaTickRate = 1.0;
        this.simTime = 0;
        this.scheduledFluidTicks = new Map();

        this.numAdjacentSources = 0;
        this.flowCost = [1000, 1000, 1000, 1000];
        this.optimalFlowDir = [false, false, false, false];
        this.directions = [
            { x: -1, z: 0 },
            { x: 1, z: 0 },
            { x: 0, z: -1 },
            { x: 0, z: 1 }
        ];
    }

    update(dt, playerPos) {
        this.simTime += dt;
        this.waterTimer += dt;
        this.lavaTimer += dt;

        let processWater = false;
        let processLava = false;

        if (this.waterTimer >= this.waterTickRate) {
            this.waterTimer = 0;
            processWater = true;
        }
        if (this.lavaTimer >= this.lavaTickRate) {
            this.lavaTimer = 0;
            processLava = true;
        }

        if (processWater || processLava) {
            this.tick(playerPos, processWater, processLava);
        }
    }

    chunkHasAllNeighborsLoaded(cx, cy, cz) {
        const deltas = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (const [dx, dy, dz] of deltas) {
            const c = this.chunkManager.getChunk(cx + dx, cy + dy, cz + dz);
            if (!c || !c.isGenerated) return false;
        }
        return true;
    }

    getFluidDelay(kind) {
        return kind === 'water' ? this.waterTickRate : this.lavaTickRate;
    }

    makeKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    parseKey(key) {
        const [x, y, z] = key.split(',').map((v) => Number.parseInt(v, 10));
        return { x, y, z };
    }

    scheduleFluidTick(x, y, z, kind, delay = this.getFluidDelay(kind)) {
        const key = this.makeKey(x, y, z);
        const due = this.simTime + Math.max(0, delay);
        const prev = this.scheduledFluidTicks.get(key);
        if (!prev || due < prev.due) {
            this.scheduledFluidTicks.set(key, { due, kind });
        }
    }

    scheduleFluidNeighbors(x, y, z) {
        const deltas = [
            [0, 0, 0],
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];
        for (const [dx, dy, dz] of deltas) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            const kind = fluidKindFromId(this.chunkManager.getBlock(nx, ny, nz));
            if (kind) this.scheduleFluidTick(nx, ny, nz, kind);
        }
    }

    activateAdjacentStationaryFluids(x, y, z) {
        const deltas = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];

        for (const [dx, dy, dz] of deltas) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            const id = this.chunkManager.getBlock(nx, ny, nz);
            const kind = fluidKindFromId(id);
            if (!kind) continue;
            if (id !== stillIdForKind(kind)) continue;
            if (!this.shouldStationaryBecomeFlowing(kind, nx, ny, nz)) continue;

            const meta = this.chunkManager.getMetadata(nx, ny, nz) || 0;
            this.updateBlock(nx, ny, nz, movingIdForKind(kind), meta);
            this.scheduleFluidTick(nx, ny, nz, kind, 0);
        }
    }

    seedScheduledTicksInRegion(cx, cy, cz, processWater, processLava) {
        const minChunkY = Math.floor(WORLD_DEPTH / CHUNK_SIZE);
        const maxChunkY = Math.min(Math.floor(WORLD_HEIGHT / CHUNK_SIZE), cy + 2);

        for (let x = cx - 2; x <= cx + 2; x++) {
            for (let z = cz - 2; z <= cz + 2; z++) {
                for (let y = minChunkY; y <= maxChunkY; y++) {
                    const chunk = this.chunkManager.getChunk(x, y, z);
                    if (!chunk || !chunk.isGenerated) continue;
                    if (!this.chunkHasAllNeighborsLoaded(x, y, z)) continue;

                    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                                const id = chunk.getBlock(lx, ly, lz);
                                const kind = fluidKindFromId(id);
                                if (!kind) continue;
                                if (kind === 'water' && !processWater) continue;
                                if (kind === 'lava' && !processLava) continue;
                                const wx = x * CHUNK_SIZE + lx;
                                const wy = y * CHUNK_SIZE + ly;
                                const wz = z * CHUNK_SIZE + lz;
                                const key = this.makeKey(wx, wy, wz);
                                if (!this.scheduledFluidTicks.has(key)) {
                                    this.scheduleFluidTick(wx, wy, wz, kind, this.getFluidDelay(kind) * 6);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    tick(playerPos, processWater, processLava) {
        const cx = Math.floor(playerPos.x / CHUNK_SIZE);
        const cz = Math.floor(playerPos.z / CHUNK_SIZE);
        const cy = Math.floor(playerPos.y / CHUNK_SIZE);
        const updates = new Map();
        this.seedScheduledTicksInRegion(cx, cy, cz, processWater, processLava);

        const due = [];
        this.scheduledFluidTicks.forEach((entry, key) => {
            if (entry.due > this.simTime) return;
            if (entry.kind === 'water' && !processWater) return;
            if (entry.kind === 'lava' && !processLava) return;
            const { x, y, z } = this.parseKey(key);
            const dcx = Math.floor(x / CHUNK_SIZE);
            const dcy = Math.floor(y / CHUNK_SIZE);
            const dcz = Math.floor(z / CHUNK_SIZE);
            if (Math.abs(dcx - cx) > 2 || Math.abs(dcz - cz) > 2 || dcy < Math.floor(WORLD_DEPTH / CHUNK_SIZE) || dcy > Math.min(Math.floor(WORLD_HEIGHT / CHUNK_SIZE), cy + 2)) {
                return;
            }
            const chunk = this.chunkManager.getChunk(dcx, dcy, dcz);
            if (!chunk || !chunk.isGenerated) return;
            if (!this.chunkHasAllNeighborsLoaded(dcx, dcy, dcz)) return;
            due.push({ key, x, y, z, kind: entry.kind });
        });

        for (const cell of due) {
            this.scheduledFluidTicks.delete(cell.key);
            const id = this.chunkManager.getBlock(cell.x, cell.y, cell.z);
            const kind = fluidKindFromId(id);
            if (!kind || kind !== cell.kind) continue;
            this.processFluidCell(cell.x, cell.y, cell.z, id, updates);
        }

        updates.forEach((u) => {
            this.updateBlock(u.x, u.y, u.z, u.id, u.meta);
            this.scheduleFluidNeighbors(u.x, u.y, u.z);
            this.activateAdjacentStationaryFluids(u.x, u.y, u.z);
        });
    }

    processFluidCell(x, y, z, id, updates) {
        if (y <= WORLD_DEPTH || y > WORLD_HEIGHT) return;
        const kind = fluidKindFromId(id);
        if (!kind) return;

        // BlockFluid.checkForHarden parity (lava touching water).
        if (kind === 'lava') {
            const meta = this.chunkManager.getMetadata(x, y, z);
            if (this.isWaterNeighborPresent(x, y, z)) {
                if (meta === 0) {
                    this.queueUpdate(updates, x, y, z, 49, 0); // obsidian
                } else if (meta <= 4) {
                    this.queueUpdate(updates, x, y, z, 15, 0); // cobble
                }
                return;
            }
        }

        if (id === stillIdForKind(kind)) {
            // Stationary converts to moving when it can flow.
            if (this.shouldStationaryBecomeFlowing(kind, x, y, z)) {
                const meta = this.chunkManager.getMetadata(x, y, z);
                this.queueUpdate(updates, x, y, z, movingIdForKind(kind), meta);
                this.updateFlowing(kind, x, y, z, meta, updates);
            }
            return;
        }

        const meta = this.chunkManager.getMetadata(x, y, z);
        this.updateFlowing(kind, x, y, z, meta, updates);
    }

    shouldStationaryBecomeFlowing(kind, x, y, z) {
        if (this.canFlowInto(kind, x, y - 1, z)) return true;
        for (const d of this.directions) {
            if (this.canFlowInto(kind, x + d.x, y, z + d.z)) return true;
        }
        return false;
    }

    isWaterNeighborPresent(x, y, z) {
        return (
            isWaterId(this.chunkManager.getBlock(x, y, z - 1)) ||
            isWaterId(this.chunkManager.getBlock(x, y, z + 1)) ||
            isWaterId(this.chunkManager.getBlock(x - 1, y, z)) ||
            isWaterId(this.chunkManager.getBlock(x + 1, y, z)) ||
            isWaterId(this.chunkManager.getBlock(x, y + 1, z))
        );
    }

    updateFlowing(kind, x, y, z, currentMeta, updates) {
        const movingId = movingIdForKind(kind);
        const stillId = stillIdForKind(kind);
        const step = kind === 'lava' ? 2 : 1;
        let sameLevel = true;
        let level = currentMeta;

        if (level > 0) {
            this.numAdjacentSources = 0;
            let smallest = -100;
            smallest = this.getSmallestFlowDecay(kind, x - 1, y, z, smallest);
            smallest = this.getSmallestFlowDecay(kind, x + 1, y, z, smallest);
            smallest = this.getSmallestFlowDecay(kind, x, y, z - 1, smallest);
            smallest = this.getSmallestFlowDecay(kind, x, y, z + 1, smallest);

            let nextLevel = smallest + step;
            if (nextLevel >= 8 || smallest < 0) nextLevel = -1;

            const aboveDecay = this.getFlowDecay(kind, x, y + 1, z);
            if (aboveDecay >= 0) {
                nextLevel = aboveDecay >= 8 ? aboveDecay : (aboveDecay + 8);
            }

            if (this.numAdjacentSources >= 2 && kind === 'water') {
                const belowId = this.chunkManager.getBlock(x, y - 1, z);
                if (this.isFlowBlocked(belowId)) {
                    nextLevel = 0;
                } else if (isWaterId(belowId) && this.chunkManager.getMetadata(x, y, z) === 0) {
                    nextLevel = 0;
                }
            }

            if (kind === 'lava' && level < 8 && nextLevel < 8 && nextLevel > level && randInt(4) !== 0) {
                nextLevel = level;
                sameLevel = false;
            }

            if (nextLevel !== level) {
                level = nextLevel;
                if (nextLevel < 0) {
                    this.queueUpdate(updates, x, y, z, 0, 0);
                } else {
                    const outId = nextLevel === 0 ? stillId : movingId;
                    this.queueUpdate(updates, x, y, z, outId, nextLevel);
                }
            } else if (sameLevel) {
                // Only source-level liquid should settle as stationary.
                // Non-zero decay must remain flowing so it can retract when unsupported.
                if (level === 0) this.queueUpdate(updates, x, y, z, stillId, level);
                else this.queueUpdate(updates, x, y, z, movingId, level);
            }
        } else {
            if (this.shouldStationaryBecomeFlowing(kind, x, y, z)) {
                this.queueUpdate(updates, x, y, z, movingId, level);
            } else {
                this.queueUpdate(updates, x, y, z, stillId, level);
            }
        }

        if (this.canFlowInto(kind, x, y - 1, z)) {
            if (level >= 8) {
                this.flowIntoBlock(kind, x, y - 1, z, level, updates);
            } else {
                this.flowIntoBlock(kind, x, y - 1, z, level + 8, updates);
            }
        } else if (level >= 0 && (level === 0 || this.isFlowBlocked(this.chunkManager.getBlock(x, y - 1, z)))) {
            const dirs = this.getOptimalFlowDirections(kind, x, y, z);
            let sideLevel = level + step;
            if (level >= 8) sideLevel = 1;
            if (sideLevel < 8) {
                if (dirs[0]) this.flowIntoBlock(kind, x - 1, y, z, sideLevel, updates);
                if (dirs[1]) this.flowIntoBlock(kind, x + 1, y, z, sideLevel, updates);
                if (dirs[2]) this.flowIntoBlock(kind, x, y, z - 1, sideLevel, updates);
                if (dirs[3]) this.flowIntoBlock(kind, x, y, z + 1, sideLevel, updates);
            }
        }
    }

    flowIntoBlock(kind, x, y, z, meta, updates) {
        if (!this.canFlowInto(kind, x, y, z)) return;
        this.queueUpdate(updates, x, y, z, movingIdForKind(kind), meta);
    }

    getFlowDecay(kind, x, y, z) {
        const id = this.chunkManager.getBlock(x, y, z);
        if (fluidKindFromId(id) !== kind) return -1;
        return this.chunkManager.getMetadata(x, y, z);
    }

    getSmallestFlowDecay(kind, x, y, z, currentBest) {
        let d = this.getFlowDecay(kind, x, y, z);
        if (d < 0) return currentBest;
        if (d === 0) this.numAdjacentSources++;
        if (d >= 8) d = 0;
        return (currentBest >= 0 && d >= currentBest) ? currentBest : d;
    }

    getOptimalFlowDirections(kind, x, y, z) {
        for (let i = 0; i < 4; i++) {
            this.flowCost[i] = 1000;
            const d = this.directions[i];
            const nx = x + d.x;
            const nz = z + d.z;
            const nid = this.chunkManager.getBlock(nx, y, nz);

            if (!this.isFlowBlocked(nid) && !(fluidKindFromId(nid) === kind && this.chunkManager.getMetadata(nx, y, nz) === 0)) {
                if (!this.isFlowBlocked(this.chunkManager.getBlock(nx, y - 1, nz))) {
                    this.flowCost[i] = 0;
                } else {
                    this.flowCost[i] = this.calculateFlowCost(kind, nx, y, nz, 1, i);
                }
            }
        }

        let min = this.flowCost[0];
        for (let i = 1; i < 4; i++) {
            if (this.flowCost[i] < min) min = this.flowCost[i];
        }
        for (let i = 0; i < 4; i++) {
            this.optimalFlowDir[i] = this.flowCost[i] === min;
        }
        return this.optimalFlowDir;
    }

    calculateFlowCost(kind, x, y, z, depth, fromDir) {
        let best = 1000;
        for (let i = 0; i < 4; i++) {
            if ((i === 0 && fromDir === 1) || (i === 1 && fromDir === 0) || (i === 2 && fromDir === 3) || (i === 3 && fromDir === 2)) {
                continue;
            }

            const d = this.directions[i];
            const nx = x + d.x;
            const nz = z + d.z;
            const nid = this.chunkManager.getBlock(nx, y, nz);

            if (!this.isFlowBlocked(nid) && !(fluidKindFromId(nid) === kind && this.chunkManager.getMetadata(nx, y, nz) === 0)) {
                if (!this.isFlowBlocked(this.chunkManager.getBlock(nx, y - 1, nz))) {
                    return depth;
                }
                if (depth < 4) {
                    const c = this.calculateFlowCost(kind, nx, y, nz, depth + 1, i);
                    if (c < best) best = c;
                }
            }
        }
        return best;
    }

    canFlowInto(kind, x, y, z) {
        const id = this.chunkManager.getBlock(x, y, z);
        const targetKind = fluidKindFromId(id);
        if (targetKind === kind) return false;
        if (isLavaId(id)) return false;
        return !this.isFlowBlocked(id);
    }

    isFlowBlocked(id) {
        // Equivalent to BlockFlowing.func_309_k for IDs present in MindBlock.
        if (id === 0) return false;
        if (isFluidId(id)) return false;
        if (id === 63 || isReedId(id) || id === 78 || id === 90) return true;
        return !isTorchId(id) && id !== 55;
    }

    queueUpdate(updates, x, y, z, id, meta) {
        const key = `${x},${y},${z}`;
        if (!updates.has(key)) {
            updates.set(key, { x, y, z, id, meta });
            return;
        }

        const prev = updates.get(key);
        const prevKind = fluidKindFromId(prev.id);
        const nextKind = fluidKindFromId(id);

        if (prev.id === 0 && id !== 0) {
            updates.set(key, { x, y, z, id, meta });
            return;
        }
        if (prev.id !== 0 && id === 0) {
            // In Beta scheduling, retraction does not always override same-tick support writes.
            // Keep existing queued fluid update; air can still win on later ticks.
            if (!isFluidId(prev.id)) updates.set(key, { x, y, z, id, meta });
            return;
        }

        if (prevKind && nextKind && prevKind === nextKind) {
            // Keep stronger fluid update (lower effective level).
            const prevEff = prev.meta >= 8 ? 0 : prev.meta;
            const nextEff = meta >= 8 ? 0 : meta;
            if (
                nextEff < prevEff
            ) {
                updates.set(key, { x, y, z, id, meta });
            }
            return;
        }

        updates.set(key, { x, y, z, id, meta });
    }
}

