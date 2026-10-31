// js/betaSpawnRules.js
// Beta 1.7.3 block rules, lighting and pathfinding used by mob spawning.
// Sources (MCP names): Block, Material, World.isBlockNormalCube, World.getBlockLightValue_do,
// Chunk.generateSkylightMap, MetadataChunkBlock, Pathfinder, Path, BlockBed.
//
// Coordinates: block indices match Beta exactly. Entity positions in MindBlock are
// Beta positions minus 0.5 on every axis (MindBlock blocks span [n-0.5, n+0.5]).
import { CHUNK_SIZE } from './constants.js';

// Runtime block id -> Beta block id. Built from the runtime registry in blocks.js
// (toBetaCompatibleBlockId is a save alias table and is not complete for this).
const RUNTIME_TO_BETA_PAIRS = [
    [0, 0], [1, 2], [2, 3], [3, 1], [4, 17], [5, 18], [103, 6], [6, 8], [70, 9], [7, 21],
    [8, 7], [9, 12], [10, 16], [11, 14], [12, 15], [13, 56], [21, 21], [14, 5], [15, 4],
    [48, 48], [16, 58], [17, 61], [18, 62], [58, 58], [61, 61], [62, 62], [19, 20], [20, 20],
    [22, 22], [23, 23], [24, 66], [34, 84], [35, 80], [36, 57], [27, 27], [28, 28], [25, 25],
    [26, 26], [31, 31], [32, 32], [29, 29], [30, 30], [33, 33], [43, 43], [44, 44], [45, 45],
    [46, 46], [47, 47], [49, 49], [50, 50], [75, 75], [76, 76], [77, 77], [96, 96], [253, 65],
    [254, 63], [255, 68], [83, 64], [86, 71], [112, 0], [97, 0], [98, 0], [99, 0], [111, 69],
    [100, 69], [72, 72], [101, 70], [51, 11], [71, 10], [52, 52], [53, 54], [54, 54], [95, 95],
    [37, 37], [38, 38], [39, 39], [40, 40], [41, 41], [42, 42], [66, 39], [67, 40], [68, 83],
    [69, 86], [55, 55], [56, 81], [57, 13], [81, 81], [82, 82], [84, 35], [85, 85], [73, 73],
    [74, 74], [88, 88], [89, 89], [59, 59], [60, 60], [63, 51], [64, 2], [65, 24], [78, 78],
    [79, 79], [80, 87], [87, 87], [90, 90], [91, 46], [92, 92], [93, 93], [94, 94], [252, 49]
];
const RUNTIME_TO_BETA = new Int16Array(256).fill(1); // unknown ids behave like stone
for (const [rid, bid] of RUNTIME_TO_BETA_PAIRS) RUNTIME_TO_BETA[rid] = bid;

export function betaIdOfRuntime(runtimeId) {
    return RUNTIME_TO_BETA[runtimeId & 255];
}

// World.isBlockNormalCube: material opaque && renderAsNormalBlock().
const NOT_NORMAL_CUBE = [
    0, 6, 8, 9, 10, 11, 18, 20, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 44, 46,
    50, 51, 53, 55, 59, 60, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 75, 76, 77, 78, 79, 81, 83,
    85, 90, 92, 93, 94, 96
];
const NORMAL_CUBE = new Uint8Array(256).fill(1);
for (const id of NOT_NORMAL_CUBE) NORMAL_CUBE[id] = 0;

// Block.lightOpacity: 255 for opaque cubes, 0 otherwise, plus explicit setLightOpacity values.
const ZERO_OPACITY = [
    0, 6, 20, 26, 27, 28, 29, 31, 32, 33, 34, 36, 37, 38, 39, 40, 50, 51, 52, 55, 59, 63, 64, 65,
    66, 68, 69, 70, 71, 72, 75, 76, 77, 78, 81, 83, 85, 90, 92, 93, 94, 96
];
const OPACITY = new Uint8Array(256).fill(255);
for (const id of ZERO_OPACITY) OPACITY[id] = 0;
OPACITY[8] = 3; OPACITY[9] = 3; OPACITY[18] = 1; OPACITY[30] = 1; OPACITY[79] = 3;

// Block.lightValue = (int)(15 * setLightValue(f)).
const EMISSION = new Uint8Array(256);
EMISSION[10] = 15; EMISSION[11] = 15; EMISSION[39] = 1; EMISSION[50] = 14; EMISSION[51] = 15;
EMISSION[62] = 13; EMISSION[74] = 9; EMISSION[76] = 7; EMISSION[89] = 15; EMISSION[90] = 11;
EMISSION[91] = 15; EMISSION[94] = 9; EMISSION[95] = 15;

// Material.getIsSolid() == false (air, liquids, plants, circuits, fire, snow layer, portal).
const NON_SOLID_MATERIAL = [
    0, 6, 8, 9, 10, 11, 27, 28, 31, 32, 37, 38, 39, 40, 50, 51, 55, 59, 65, 66, 69, 75, 76, 77,
    78, 83, 90, 93, 94
];
const SOLID_MATERIAL = new Uint8Array(256).fill(1);
for (const id of NON_SOLID_MATERIAL) SOLID_MATERIAL[id] = 0;

export const BETA_GRASS_ID = 2;
export const BETA_SLAB_ID = 44;

export function isBetaNormalCube(betaId) { return NORMAL_CUBE[betaId] === 1; }
export function isBetaWater(betaId) { return betaId === 8 || betaId === 9; }
export function isBetaLava(betaId) { return betaId === 10 || betaId === 11; }
export function isBetaLiquid(betaId) { return betaId >= 8 && betaId <= 11; }
export function isBetaSolidMaterial(betaId) { return SOLID_MATERIAL[betaId] === 1; }
export function getBetaLightOpacity(betaId) { return OPACITY[betaId]; }

// WorldProvider.generateLightBrightnessTable (overworld 0.05, nether 0.1).
function makeBrightnessTable(floor) {
    const t = new Float32Array(16);
    for (let i = 0; i <= 15; i++) {
        const f = Math.fround(1 - i / 15);
        t[i] = Math.fround((1 - f) / (f * 3 + 1) * (1 - floor) + floor);
    }
    return t;
}
export const OVERWORLD_BRIGHTNESS = makeBrightnessTable(0.05);
export const NETHER_BRIGHTNESS = makeBrightnessTable(0.1);

// Block collision boxes in Beta block space, appended to `out` as [minX,minY,minZ,maxX,maxY,maxZ].
export function appendBetaCollisionBoxes(betaId, meta, x, y, z, out) {
    const box = (x0, y0, z0, x1, y1, z1) => out.push([x + x0, y + y0, z + z0, x + x1, y + y1, z + z1]);
    switch (betaId) {
        case 0: case 6: case 8: case 9: case 10: case 11: case 27: case 28: case 30: case 31:
        case 32: case 37: case 38: case 39: case 40: case 50: case 51: case 55: case 59: case 63:
        case 66: case 68: case 69: case 70: case 72: case 75: case 76: case 77: case 83: case 90:
            return;
        case 78:
            if ((meta & 7) >= 3) box(0, 0, 0, 1, 0.5, 1);
            return;
        case 26: box(0, 0, 0, 1, 0.5625, 1); return;
        case 44: box(0, 0, 0, 1, 0.5, 1); return;
        case 93: case 94: box(0, 0, 0, 1, 0.125, 1); return;
        case 85: box(0, 0, 0, 1, 1.5, 1); return;
        case 88: box(0, 0, 0, 1, 0.875, 1); return;
        case 81: box(0.0625, 0, 0.0625, 0.9375, 0.9375, 0.9375); return;
        case 92: box((1 + (meta & 7) * 2) / 16, 0, 0.0625, 0.9375, 0.4375, 0.9375); return;
        case 53: case 67: {
            const m = meta & 3;
            if (m === 0) { box(0, 0, 0, 0.5, 0.5, 1); box(0.5, 0, 0, 1, 1, 1); }
            else if (m === 1) { box(0, 0, 0, 0.5, 1, 1); box(0.5, 0, 0, 1, 0.5, 1); }
            else if (m === 2) { box(0, 0, 0, 1, 0.5, 0.5); box(0, 0, 0.5, 1, 1, 1); }
            else { box(0, 0, 0, 1, 1, 0.5); box(0, 0, 0.5, 1, 0.5, 1); }
            return;
        }
        case 65: {
            const f = 0.125;
            if (meta === 2) box(0, 0, 1 - f, 1, 1, 1);
            else if (meta === 3) box(0, 0, 0, 1, 1, f);
            else if (meta === 4) box(1 - f, 0, 0, 1, 1, 1);
            else if (meta === 5) box(0, 0, 0, f, 1, 1);
            else box(0, 0, 0, 1, 1, 1);
            return;
        }
        case 96: {
            const f = 0.1875;
            if ((meta & 4) === 0) { box(0, 0, 0, 1, f, 1); return; }
            const d = meta & 3;
            if (d === 0) box(0, 0, 1 - f, 1, 1, 1);
            else if (d === 1) box(0, 0, 0, 1, 1, f);
            else if (d === 2) box(1 - f, 0, 0, 1, 1, 1);
            else box(0, 0, 0, f, 1, 1);
            return;
        }
        case 64: case 71: {
            const f = 0.1875;
            const state = (meta & 4) === 0 ? ((meta - 1) & 3) : (meta & 3);
            if (state === 0) box(0, 0, 0, 1, 1, f);
            else if (state === 1) box(1 - f, 0, 0, 1, 1, 1);
            else if (state === 2) box(0, 0, 1 - f, 1, 1, 1);
            else box(0, 0, 0, f, 1, 1);
            return;
        }
        default:
            box(0, 0, 0, 1, 1, 1);
    }
}

// AxisAlignedBB.intersectsWith (strict on every axis).
export function aabbIntersects(a, b) {
    return b[3] > a[0] && b[0] < a[3] && b[4] > a[1] && b[1] < a[4] && b[5] > a[2] && b[2] < a[5];
}

const SLICES = 8; // 128 / CHUNK_SIZE
const REGION = CHUNK_SIZE * 3;
const HEIGHT = CHUNK_SIZE * SLICES;
const REGION_CELLS = REGION * REGION * HEIGHT;
const STRIDE_Z = REGION;
const STRIDE_Y = REGION * REGION;

// Separate sky and block light, computed like Beta (column skylight map, then flood fill
// where each step costs max(1, lightOpacity)). A column's values depend only on its 3x3
// chunk neighbourhood because light travels at most 15 blocks.
export class BetaLightCache {
    constructor(chunkManager) {
        this.chunkManager = chunkManager;
        this.columns = new Map();
        this.pending = new Set();
        this.opac = new Uint8Array(REGION_CELLS);
        this.sky = new Uint8Array(REGION_CELLS);
        this.blk = new Uint8Array(REGION_CELLS);
        this.buckets = Array.from({ length: 16 }, () => []);
    }

    clear() {
        this.columns.clear();
        this.pending.clear();
    }

    columnSignature(cx, cz) {
        const cm = this.chunkManager;
        const sig = [cm.columnEpoch || 0];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) sig.push(cm.getColumnRevision ? cm.getColumnRevision(cx + dx, cz + dz) : 0);
        }
        return sig;
    }

    getColumn(cx, cz) {
        const key = `${cx},${cz}`;
        const entry = this.columns.get(key);
        if (entry) {
            const sig = this.columnSignature(cx, cz);
            let same = sig.length === entry.sig.length;
            for (let i = 0; same && i < sig.length; i++) same = sig[i] === entry.sig[i];
            if (same) return entry;
        }
        this.pending.add(key);
        return null;
    }

    // Packed light (sky << 4 | block) or -1 when the column has not been computed yet.
    getPacked(x, y, z) {
        if (y < 0 || y >= HEIGHT) return -1;
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const col = this.getColumn(cx, cz);
        if (!col) return -1;
        const lx = x - cx * CHUNK_SIZE;
        const lz = z - cz * CHUNK_SIZE;
        return col.light[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
    }

    processPending(budgetMs = 3) {
        const start = performance.now();
        for (const key of this.pending) {
            this.pending.delete(key);
            const [cx, cz] = key.split(',').map(Number);
            if (!this.chunkManager.hasChunk(cx, SLICES - 1, cz)) continue;
            this.computeColumn(cx, cz);
            if (performance.now() - start >= budgetMs) break;
        }
    }

    pruneOutside(minCx, maxCx, minCz, maxCz) {
        for (const key of this.columns.keys()) {
            const [cx, cz] = key.split(',').map(Number);
            if (cx < minCx || cx > maxCx || cz < minCz || cz > maxCz) this.columns.delete(key);
        }
        for (const key of this.pending) {
            const [cx, cz] = key.split(',').map(Number);
            if (cx < minCx || cx > maxCx || cz < minCz || cz > maxCz) this.pending.delete(key);
        }
    }

    computeColumn(cx, cz) {
        const { opac, sky, blk, buckets } = this;
        const cm = this.chunkManager;
        opac.fill(255);
        sky.fill(0);
        blk.fill(0);
        for (const b of buckets) b.length = 0;
        let maxTop = 0;

        for (let rx = 0; rx < 3; rx++) {
            for (let rz = 0; rz < 3; rz++) {
                for (let cy = 0; cy < SLICES; cy++) {
                    const chunk = cm.getChunk(cx + rx - 1, cy, cz + rz - 1);
                    if (!chunk) continue; // unloaded slices stay opaque
                    const data = chunk.data;
                    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                        const y = cy * CHUNK_SIZE + ly;
                        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                            const z = rz * CHUNK_SIZE + lz;
                            const src = ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE; // chunk layout: lx + ly*16 + lz*256
                            let dst = y * STRIDE_Y + z * STRIDE_Z + rx * CHUNK_SIZE;
                            for (let lx = 0; lx < CHUNK_SIZE; lx++, dst++) {
                                const bid = RUNTIME_TO_BETA[data[src + lx]];
                                const o = OPACITY[bid];
                                opac[dst] = o;
                                if (o !== 0 && y > maxTop) maxTop = y;
                                const e = EMISSION[bid];
                                if (e > 0) {
                                    blk[dst] = e;
                                    buckets[e].push(dst);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Chunk.generateSkylightMap: straight down from the top, minus each block's opacity.
        for (let z = 0; z < REGION; z++) {
            for (let x = 0; x < REGION; x++) {
                let v = 15;
                for (let y = HEIGHT - 1; y > 0; y--) {
                    const i = y * STRIDE_Y + z * STRIDE_Z + x;
                    v -= opac[i];
                    if (v <= 0) break;
                    sky[i] = v;
                }
            }
        }
        this.flood(blk);

        // Seed sky spreading only where a neighbour can still be raised.
        const yLimit = Math.min(HEIGHT - 1, maxTop + 1);
        for (const b of buckets) b.length = 0;
        for (let y = 0; y <= yLimit; y++) {
            for (let z = 0; z < REGION; z++) {
                for (let x = 0; x < REGION; x++) {
                    const i = y * STRIDE_Y + z * STRIDE_Z + x;
                    const v = sky[i];
                    if (v <= 1) continue;
                    if ((x > 0 && sky[i - 1] < v - 1) || (x < REGION - 1 && sky[i + 1] < v - 1) ||
                        (z > 0 && sky[i - STRIDE_Z] < v - 1) || (z < REGION - 1 && sky[i + STRIDE_Z] < v - 1) ||
                        (y > 0 && sky[i - STRIDE_Y] < v - 1) || (y < HEIGHT - 1 && sky[i + STRIDE_Y] < v - 1)) {
                        buckets[v].push(i);
                    }
                }
            }
        }
        this.flood(sky);

        const light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * HEIGHT);
        for (let y = 0; y < HEIGHT; y++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    const i = y * STRIDE_Y + (lz + CHUNK_SIZE) * STRIDE_Z + (lx + CHUNK_SIZE);
                    light[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = (sky[i] << 4) | blk[i];
                }
            }
        }
        this.columns.set(`${cx},${cz}`, { sig: this.columnSignature(cx, cz), light });
    }

    flood(level) {
        const { opac, buckets } = this;
        for (let v = 15; v >= 2; v--) {
            const bucket = buckets[v];
            for (let n = 0; n < bucket.length; n++) {
                const i = bucket[n];
                if (level[i] !== v) continue;
                const x = i % REGION;
                const z = Math.floor(i / STRIDE_Z) % REGION;
                const y = Math.floor(i / STRIDE_Y);
                if (x > 0) this.raise(level, i - 1, v);
                if (x < REGION - 1) this.raise(level, i + 1, v);
                if (z > 0) this.raise(level, i - STRIDE_Z, v);
                if (z < REGION - 1) this.raise(level, i + STRIDE_Z, v);
                if (y > 0) this.raise(level, i - STRIDE_Y, v);
                if (y < HEIGHT - 1) this.raise(level, i + STRIDE_Y, v);
            }
            bucket.length = 0;
        }
    }

    raise(level, i, v) {
        const o = this.opac[i];
        const nv = v - (o === 0 ? 1 : o);
        if (nv > level[i]) {
            level[i] = nv;
            this.buckets[nv].push(i);
        }
    }
}

// PathPoint.func_22329_a
function pointHash(x, y, z) {
    return (y & 255) | ((x & 32767) << 8) | ((z & 32767) << 24) | (x < 0 ? -2147483648 : 0) | (z < 0 ? 32768 : 0);
}

class PathPoint {
    constructor(x, y, z) {
        this.x = x; this.y = y; this.z = z;
        this.index = -1;
        this.totalPathDistance = 0;
        this.distanceToNext = 0;
        this.distanceToTarget = 0;
        this.previous = null;
        this.isFirst = false;
    }
    distanceTo(o) {
        const dx = o.x - this.x, dy = o.y - this.y, dz = o.z - this.z;
        return Math.fround(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    isAssigned() { return this.index >= 0; }
}

// Path: binary heap ordered by distanceToTarget.
class PathHeap {
    constructor() { this.points = []; this.count = 0; }
    clear() { this.count = 0; }
    isEmpty() { return this.count === 0; }
    add(p) {
        this.points[this.count] = p;
        p.index = this.count;
        this.sortBack(this.count++);
    }
    dequeue() {
        const p = this.points[0];
        this.points[0] = this.points[--this.count];
        this.points[this.count] = null;
        if (this.count > 0) this.sortForward(0);
        p.index = -1;
        return p;
    }
    changeDistance(p, d) {
        const old = p.distanceToTarget;
        p.distanceToTarget = d;
        if (d < old) this.sortBack(p.index); else this.sortForward(p.index);
    }
    sortBack(i) {
        const p = this.points[i];
        const d = p.distanceToTarget;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            const pp = this.points[parent];
            if (d >= pp.distanceToTarget) break;
            this.points[i] = pp; pp.index = i; i = parent;
        }
        this.points[i] = p; p.index = i;
    }
    sortForward(i) {
        const p = this.points[i];
        const d = p.distanceToTarget;
        for (;;) {
            const l = 1 + (i << 1), r = l + 1;
            if (l >= this.count) break;
            const lp = this.points[l];
            const ld = lp.distanceToTarget;
            const rp = r >= this.count ? null : this.points[r];
            const rd = rp ? rp.distanceToTarget : Infinity;
            if (ld < rd) {
                if (ld >= d) break;
                this.points[i] = lp; lp.index = i; i = l;
            } else {
                if (rd >= d) break;
                this.points[i] = rp; rp.index = i; i = r;
            }
        }
        this.points[i] = p; p.index = i;
    }
}

// Pathfinder.createEntityPathTo. `world` provides betaId(x,y,z) and meta(x,y,z).
// `entity` is { minX, minY, minZ, width, height }. Returns an array of points or null.
export function findBetaPath(world, entity, tx, ty, tz, maxDist) {
    const points = new Map();
    const heap = new PathHeap();
    const open = (x, y, z) => {
        const h = pointHash(x, y, z);
        let list = points.get(h);
        if (!list) { list = []; points.set(h, list); }
        let p = list.find((q) => q.x === x && q.y === y && q.z === z);
        if (!p) { p = new PathPoint(x, y, z); list.push(p); }
        return p;
    };
    const size = new PathPoint(Math.floor(entity.width + 1), Math.floor(entity.height + 1), Math.floor(entity.width + 1));
    const verticalOffset = (x, y, z) => {
        for (let ix = x; ix < x + size.x; ix++) {
            for (let iy = y; iy < y + size.y; iy++) {
                for (let iz = z; iz < z + size.z; iz++) {
                    const id = world.betaId(ix, iy, iz);
                    if (id <= 0) continue;
                    if (id === 64 || id === 71) {
                        if ((world.meta(ix, iy, iz) & 4) === 0) return 0;
                        continue;
                    }
                    if (SOLID_MATERIAL[id]) return 0;
                    if (isBetaWater(id)) return -1;
                    if (isBetaLava(id)) return -2;
                }
            }
        }
        return 1;
    };
    const safePoint = (x, y, z, step) => {
        let p = null;
        if (verticalOffset(x, y, z) === 1) p = open(x, y, z);
        if (!p && step > 0 && verticalOffset(x, y + step, z) === 1) {
            p = open(x, y + step, z);
            y += step;
        }
        if (p) {
            let fall = 0;
            let off = 0;
            while (y > 0 && (off = verticalOffset(x, y - 1, z)) === 1) {
                if (++fall >= 4) return null;
                --y;
                if (y > 0) p = open(x, y, z);
            }
            if (off === -2) return null;
        }
        return p;
    };

    const start = open(Math.floor(entity.minX), Math.floor(entity.minY), Math.floor(entity.minZ));
    const end = open(Math.floor(tx - entity.width / 2), Math.floor(ty), Math.floor(tz - entity.width / 2));
    start.totalPathDistance = 0;
    start.distanceToNext = start.distanceTo(end);
    start.distanceToTarget = start.distanceToNext;
    heap.add(start);
    let closest = start;
    const build = (last) => {
        const out = [];
        for (let p = last; p; p = p.previous) out.unshift(p);
        return out;
    };
    while (!heap.isEmpty()) {
        const cur = heap.dequeue();
        if (cur === end) return build(end);
        if (cur.distanceTo(end) < closest.distanceTo(end)) closest = cur;
        cur.isFirst = true;
        const step = verticalOffset(cur.x, cur.y + 1, cur.z) === 1 ? 1 : 0;
        const options = [
            safePoint(cur.x, cur.y, cur.z + 1, step),
            safePoint(cur.x - 1, cur.y, cur.z, step),
            safePoint(cur.x + 1, cur.y, cur.z, step),
            safePoint(cur.x, cur.y, cur.z - 1, step)
        ];
        for (const opt of options) {
            if (!opt || opt.isFirst || !(opt.distanceTo(end) < maxDist)) continue;
            const d = Math.fround(cur.totalPathDistance + cur.distanceTo(opt));
            if (!opt.isAssigned() || d < opt.totalPathDistance) {
                opt.previous = cur;
                opt.totalPathDistance = d;
                opt.distanceToNext = opt.distanceTo(end);
                if (opt.isAssigned()) {
                    heap.changeDistance(opt, Math.fround(opt.totalPathDistance + opt.distanceToNext));
                } else {
                    opt.distanceToTarget = Math.fround(opt.totalPathDistance + opt.distanceToNext);
                    heap.add(opt);
                }
            }
        }
    }
    return closest === start ? null : build(closest);
}
