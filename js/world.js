// js/world.js
import * as THREE from 'three';
import { CHUNK_SIZE } from './constants.js';
import { BLOCKS, TEXTURE_PATH, getItemDef, normalizeLegacyRuntimeItemId, toLegacyItemId, isBedBlockId, isButtonId, isCakeBlockId, isCraftingTableId, isCropId, isDispenserId, isDoorId, isFarmlandId, isFenceId, isFurnaceId, isLadderId, isPaintingId, isPistonId, isPressurePlateId, isPumpkinId, isRepeaterId, isSignId, isTorchId, isTrapdoorId, isSlabId, isVehicleBlockId, isWoolId, isGlassId, isLeverId } from './blocks.js';
import {
    SHEARS_ITEM_ID,
    EGG_ITEM_ID,
    RAW_PORKCHOP_ITEM_ID,
    COOKED_PORKCHOP_ITEM_ID,
    MILK_BUCKET_ITEM_ID,
    LEATHER_ITEM_ID,
    BOWL_ITEM_ID,
    MUSHROOM_STEW_ITEM_ID,
    RAW_FISH_ITEM_ID,
    COOKED_FISH_ITEM_ID,
} from './inventory.js';
import { isFluidId } from './fluidIds.js';

// Re-export blocks for UI
export { BLOCKS };

// --- Texture Loader Setup ---
export const textureLoader = new THREE.TextureLoader();
const ATLAS_GRID_SIZE = 16;
const TERRAIN_ATLAS_PATH = `${TEXTURE_PATH}terrain_atlas_beta173.png`;
const ITEMS_ATLAS_PATH = `${TEXTURE_PATH}items_atlas_beta173.png`;
const TEXTURE_CACHE = new Map();
const ITEM_SPECIAL_TEXTURES = new Map([
    [normalizeLegacyRuntimeItemId(6), `${TEXTURE_PATH}item/arrows.png`],
    [normalizeLegacyRuntimeItemId(7), `${TEXTURE_PATH}coal.png`],
    [normalizeLegacyRuntimeItemId(8), `${TEXTURE_PATH}diamond.png`],
    [normalizeLegacyRuntimeItemId(9), `${TEXTURE_PATH}iron.png`],
    [normalizeLegacyRuntimeItemId(10), `${TEXTURE_PATH}iron.png`],
    [normalizeLegacyRuntimeItemId(23), `${TEXTURE_PATH}stick.png`],
    [normalizeLegacyRuntimeItemId(58), `${TEXTURE_PATH}flint.png`],
    [normalizeLegacyRuntimeItemId(59), `${TEXTURE_PATH}flint_and_steel.png`],
    [normalizeLegacyRuntimeItemId(60), `${TEXTURE_PATH}bucket_empty.png`],
    [normalizeLegacyRuntimeItemId(61), `${TEXTURE_PATH}bucket_water.png`],
    [normalizeLegacyRuntimeItemId(62), `${TEXTURE_PATH}bucket_lava.png`],
    [normalizeLegacyRuntimeItemId(79), `${TEXTURE_PATH}bucket_water.png`],
    [normalizeLegacyRuntimeItemId(97), `${TEXTURE_PATH}sugar.png`],
    [normalizeLegacyRuntimeItemId(98), `${TEXTURE_PATH}cake.png`],
    [normalizeLegacyRuntimeItemId(100), `${TEXTURE_PATH}repeater.png`],
    [normalizeLegacyRuntimeItemId(101), `${TEXTURE_PATH}cookie.png`],
    [normalizeLegacyRuntimeItemId(297), `${TEXTURE_PATH}stick.png`],
    [normalizeLegacyRuntimeItemId(92), `${TEXTURE_PATH}gunpowder.png`],
    [normalizeLegacyRuntimeItemId(76), `${TEXTURE_PATH}snow.png`],
    [normalizeLegacyRuntimeItemId(83), `${TEXTURE_PATH}shears.png`],
    [normalizeLegacyRuntimeItemId(85), `${TEXTURE_PATH}egg.png`],
    [normalizeLegacyRuntimeItemId(86), `${TEXTURE_PATH}porkchop_raw.png`],
    [normalizeLegacyRuntimeItemId(87), `${TEXTURE_PATH}porkchop_cooked.png`],
    [normalizeLegacyRuntimeItemId(88), `${TEXTURE_PATH}chicken_raw.png`],
    [normalizeLegacyRuntimeItemId(89), `${TEXTURE_PATH}chicken_cooked.png`]
]);

function loadBlockTexture(path) {
    const cached = TEXTURE_CACHE.get(path);
    if (cached) return cached;
    const tex = textureLoader.load(path);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    TEXTURE_CACHE.set(path, tex);
    return tex;
}

const terrainAtlasTexture = loadBlockTexture(TERRAIN_ATLAS_PATH);
const itemsAtlasTexture = loadBlockTexture(ITEMS_ATLAS_PATH);
const opaqueTerrainAtlasMaterial = new THREE.MeshLambertMaterial({
    map: terrainAtlasTexture,
    vertexColors: true,
    side: THREE.FrontSide
});
const transparentTerrainAtlasMaterial = new THREE.MeshLambertMaterial({
    map: terrainAtlasTexture,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide
});

function cloneAtlasTileTexture(baseTexture, tileIndex) {
    const tex = baseTexture.clone();
    const tileX = tileIndex % ATLAS_GRID_SIZE;
    const tileY = Math.floor(tileIndex / ATLAS_GRID_SIZE);
    tex.repeat.set(1 / ATLAS_GRID_SIZE, 1 / ATLAS_GRID_SIZE);
    tex.offset.set(tileX / ATLAS_GRID_SIZE, 1 - ((tileY + 1) / ATLAS_GRID_SIZE));
    tex.needsUpdate = true;
    return tex;
}

const TERRAIN_TILE_MAP = {
    1: { top: 0, side: 3, bottom: 2, snowSide: 68 },
    2: { single: 2 },
    3: { single: 1 },
    4: { top: 21, side: 20, bottom: 21 },
    5: { single: 52 },
    103: { single: 15 },
    6: { single: 206 },
    8: { single: 17 },
    9: { single: 18 },
    10: { single: 34 },
    11: { single: 32 },
    12: { single: 33 },
    13: { single: 50 },
    14: { single: 4 },
    15: { single: 16 },
    16: { top: 43, bottom: 4, side: 59, side2: 60 },
    17: { top: 62, bottom: 62, side: 45, front: 44 },
    18: { top: 62, bottom: 62, side: 45, front: 61 },
    58: { top: 43, bottom: 4, side: 59, side2: 60 },
    59: { single: 88 },
    60: { top: 87, bottom: 2, side: 2 },
    61: { top: 62, bottom: 62, side: 45, front: 44 },
    62: { top: 62, bottom: 62, side: 45, front: 61 },
    19: { single: 49 },
    20: { single: 49 },
    22: { single: 144 },
    23: { top: 62, bottom: 62, side: 45, front: 46 },
    24: { single: 128 }, // runtime canonical rail id (legacy 263)
    25: { single: 74 },
    26: { single: 134 },
    263: { single: 128 },
    264: { single: 74 },
    265: { single: 66 },
    266: { single: 24 },
    27: { single: 179 },
    28: { single: 195 },
    // Piston atlas parity: only the true front face uses the wooden head tile.
    // Top/bottom/side use body tiles so we don't duplicate the wooden face.
    29: { top: 108, bottom: 109, side: 108, front: 106 },
    31: { single: 39 },
    32: { single: 55 },
    33: { top: 108, bottom: 109, side: 108, front: 107 },
    39: { single: 29 },
    40: { single: 28 },
    41: { single: 23 },
    42: { single: 22 },
    43: { top: 6, bottom: 6, side: 5 },
    35: { single: 64 },
    44: { top: 6, bottom: 6, side: 5 },
    45: { single: 7 },
    46: { top: 9, side: 8, bottom: 10 },
    47: { single: 35 },
    49: { single: 37 },
    37: { single: 13 },
    38: { single: 12 },
    55: { single: 164 },
    48: { single: 36 },
    50: { single: 80 },
    75: { single: 115 },
    76: { single: 99 },
    77: { single: 1 },
    111: { single: 96 },
    261: { single: 96 },
    262: { single: 1 },
    96: { single: 84 },
    51: { single: 238 },
    52: { single: 65 },
    56: { top: 69, side: 70, bottom: 71 },
    57: { single: 19 },
    64: { top: 66, side: 68, bottom: 2, snowSide: 68 },
    65: { top: 176, side: 192, bottom: 208 },
    66: { single: 29 },
    67: { single: 28 },
    68: { single: 73 },
    69: { top: 102, bottom: 102, side: 118, front: 119 },
    72: { single: 4 },
    83: { single: 73 },
    86: { top: 102, bottom: 102, side: 118, front: 119 },
    70: { single: 206 },
    71: { single: 238 },
    73: { single: 51 },
    74: { single: 51 },
    78: { single: 66 },
    79: { single: 67 },
    80: { single: 103 },
    87: { single: 103 },
    88: { single: 104 },
    89: { single: 105 },
    81: { top: 69, side: 70, bottom: 71 },
    82: { single: 72 },
    84: { single: 64 },
    85: { single: 4 },
    91: { top: 9, side: 8, bottom: 10 },
    92: { top: 121, bottom: 124, side: 122 },
    93: { top: 131, bottom: 115, side: 5 },
    94: { top: 147, bottom: 99, side: 5 },
    252: { single: 37 }
};

const ITEM_TILE_MAP = {
    0: 82,
    4: 10,
    5: 21,
    6: 37,
    1: 98,
    2: 114,
    3: 5,
    11: 66,
    12: 64,
    13: 80,
    14: 96,
    15: 112,
    16: 65,
    17: 81,
    18: 97,
    19: 113,
    21: 83,
    7: 7,
    8: 55,
    9: 23,
    10: 39,
    37: 131,
    38: 128,
    63: 87,
    64: 88,
    69: 74,
    70: 75,
    71: 76,
    20: 7,
    201: 23,
    22: 55,
    23: 53,
    24: 64,
    25: 96,
    26: 112,
    27: 80,
    28: 128,
    29: 65,
    30: 97,
    31: 8,
    32: 24,
    33: 129,
    34: 66,
    35: 98,
    36: 114,
    39: 9,
    40: 25,
    41: 115,
    42: 83,
    43: 131,
    44: 32,
    45: 48,
    46: 1,
    47: 17,
    48: 33,
    49: 49,
    50: 2,
    51: 18,
    52: 34,
    53: 50,
    54: 3,
    55: 19,
    56: 35,
    57: 51,
    58: 6,
    59: 5,
    60: 74,
    61: 75,
    62: 76,
    [MILK_BUCKET_ITEM_ID]: 77,
    [LEATHER_ITEM_ID]: 103,
    [SHEARS_ITEM_ID]: 93,
    [EGG_ITEM_ID]: 12,
    [RAW_PORKCHOP_ITEM_ID]: 87,
    [COOKED_PORKCHOP_ITEM_ID]: 88,
    [RAW_FISH_ITEM_ID]: 89,
    [COOKED_FISH_ITEM_ID]: 90,
    [BOWL_ITEM_ID]: 71,
    [MUSHROOM_STEW_ITEM_ID]: 72,
    65: 26,
    66: 11,
    67: 42,
    68: 43,
    72: 135,
    73: 104,
    74: 44,
    75: 56,
    76: 14,
    77: 136,
    78: 103,
    79: 77,
    80: 22,
    81: 57,
    83: 93,
    82: 27,
    84: 59,
    85: 12,
    86: 87,
    87: 88,
    88: 240,
    89: 241,
    90: 69,
    91: 70,
    349: 54,
    350: 60,
    92: 40,
    93: 89,
    94: 90,
    280: 71,
    281: 72,
    297: 41,
    339: 58,
    341: 30,
    370: 73,
    342: 0,
    343: 16,
    344: 4,
    345: 20,
    346: 36,
    347: 52,
    348: 73,
    96: 28,
    102: 83,
    97: 13,
    98: 29,
    99: 45,
    100: 86,
    101: 92,
    283: 68,
    284: 84,
    285: 100,
    286: 116,
    294: 132,
    231: 113,
    232: 81,
    237: 82,
    238: 130,
    239: 67,
    240: 99,
    2000: 240,
    2001: 241
};

function getTerrainAtlasTile(id, part = 'single', metadata = 0) {
    const numId = Number(id);
    const meta = Number.isFinite(Number(metadata)) ? (Number(metadata) & 15) : 0;
    // Sapling metadata parity (Beta 1.7.3):
    // 0 oak, 1 spruce, 2 birch. Runtime sapling ids are 103 (plus legacy alias paths).
    if ((numId === 103 || numId === 6) && part === 'single') {
        if ((meta & 3) === 1) return 63; // spruce sapling
        if ((meta & 3) === 2) return 79; // birch sapling
        return 15; // oak sapling
    }
    // Log metadata variant parity (Beta 1.7.3):
    // 0=o ak, 1=spruce, 2=birch. Top/bottom are shared; side face varies.
    if (numId === 4 && part === 'side') {
        const variant = meta & 3;
        if (variant === 1) return 116; // spruce log side
        if (variant === 2) return 117; // birch log side
        return 20; // oak log side
    }
    if (numId === 4 && (part === 'top' || part === 'bottom')) {
        return 21; // shared log top/bottom
    }
    // Leaf metadata variant parity (Beta 1.7.3):
    // 0 = oak, 1 = spruce, 2 = birch (all in the terrain atlas).
    if (numId === 5 && part === 'single') {
        const variant = meta & 3;
        if (variant === 1) return 132; // spruce leaves
        if (variant === 2) return 133; // birch leaves
        return 52; // oak leaves
    }
    // Tall grass metadata variant parity:
    // 1 = tall grass (tile 39), 2 = fern (tile 56). Keep default at tall-grass tile.
    if (numId === 31 && part === 'single') {
        if ((meta & 3) === 2) return 56;
        return 39;
    }
    // Crop growth-stage parity (Beta 1.7.3):
    // wheat/crops use 8 icon stages across metadata 0..7.
    if (numId === 59 && part === 'single') {
        const stage = Math.max(0, Math.min(7, meta));
        return 88 + stage;
    }
    const def = TERRAIN_TILE_MAP[id];
    if (!def) return null;
    return def[part] ?? def.single ?? null;
}

function getItemAtlasTile(id, metadata = 0) {
    const runtimeId = Number(id);
    const legacyId = toLegacyItemId(runtimeId);
    const meta = Number.isFinite(Number(metadata)) ? (Number(metadata) & 15) : 0;
    // Jacobo Beta 1.7.3 ItemDye.getIconFromDamage:
    // icon = base + (damage % 8) * 16 + (damage / 8), with base at setIconCoord(14,4) -> 78.
    if (legacyId === 95) return 78 + ((meta % 8) * 16) + Math.floor(meta / 8);
    return ITEM_TILE_MAP[legacyId] ?? null;
}

export function getItemAtlasTileById(id, metadata = 0) {
    return getItemAtlasTile(id, metadata);
}

export function getTerrainAtlasTileById(id, part = 'single', metadata = 0) {
    return getTerrainAtlasTile(id, part, metadata);
}

function getWoolTerrainTileForMetadata(meta) {
    const m = meta & 15;
    if (m === 0) return 64;
    const inverted = (~m) & 15;
    return 113 + ((inverted & 8) >> 3) + ((inverted & 7) * 16);
}

export function createWoolDisplayMaterial(metadata = 0) {
    const material = new THREE.MeshLambertMaterial({
        map: cloneAtlasTileTexture(terrainAtlasTexture, getWoolTerrainTileForMetadata(metadata)),
        vertexColors: false
    });
    patchMaterialForRadialFog(material);
    return material;
}

function parseRenderBucketKey(key) {
    const str = String(key);
    const colon = str.indexOf(':');
    if (colon === -1) {
        const numId = Number.parseInt(str, 10);
        return { numId, metaVariant: null };
    }
    const numId = Number.parseInt(str.slice(0, colon), 10);
    const metaVariant = Number.parseInt(str.slice(colon + 1), 10);
    return {
        numId,
        metaVariant: Number.isFinite(metaVariant) ? metaVariant : null
    };
}

function getTerrainTextureForPart(id, part, fallbackPath) {
    // Fluid safety: avoid atlas-index drift on colliding runtime IDs.
    // Force direct texture assets for flowing/still fluids.
    if (id === 6 || id === 70) {
        return loadBlockTexture(TEXTURE_PATH + 'water.png');
    }
    if (id === 51 || id === 71) {
        return loadBlockTexture(TEXTURE_PATH + 'lava.png');
    }
    const tile = getTerrainAtlasTile(id, part);
    if (tile == null) return loadBlockTexture(fallbackPath);
    return cloneAtlasTileTexture(terrainAtlasTexture, tile);
}

function getItemTextureForId(id, fallbackPath) {
    const tile = getItemAtlasTile(id, 0);
    if (tile == null) return loadBlockTexture(fallbackPath);
    return cloneAtlasTileTexture(itemsAtlasTexture, tile);
}

export function createItemDisplayMaterial(id, metadata = 0) {
    const specialPath = ITEM_SPECIAL_TEXTURES.get(Number(id));
    if (specialPath) {
        const material = new THREE.MeshLambertMaterial({
            map: loadBlockTexture(specialPath),
            transparent: true,
            alphaTest: 0.5,
            vertexColors: false
        });
        patchMaterialForRadialFog(material);
        return material;
    }
    const tile = getItemAtlasTile(id, metadata);
    const mapTexture = tile != null ? cloneAtlasTileTexture(itemsAtlasTexture, tile) : null;
    if (!mapTexture) return null;
    const material = new THREE.MeshLambertMaterial({
        map: mapTexture,
        transparent: true,
        alphaTest: 0.5,
        vertexColors: false
    });
    patchMaterialForRadialFog(material);
    return material;
}

function getOpaqueAtlasTileForGroup(id, matIndex = 0, metaVariant = null) {
    const def = TERRAIN_TILE_MAP[id];
    if (!def) return null;
    if (isWoolId(id)) {
        return getWoolTerrainTileForMetadata(metaVariant ?? 0);
    }
    if (isRepeaterId(id)) {
        const map = [def.top, def.bottom, def.side];
        return map[matIndex] ?? null;
    }
    if (isSlabId(id)) {
        const map = [def.top, def.bottom, def.side];
        return map[matIndex] ?? null;
    }
    if (isBedBlockId(id)) {
        return def.single ?? null;
    }
    if (isCakeBlockId(id)) {
        return def.single ?? null;
    }
    if (def.single != null) return def.single;
    if (isCraftingTableId(id)) {
        const map = [def.side, def.side, def.top, def.bottom, def.side2, def.side2];
        return map[matIndex] ?? null;
    }
    if (isPistonId(id)) {
        const map = [def.side, def.side, def.top, def.bottom, def.side, def.front, 110];
        return map[matIndex] ?? null;
    }
    if (isFurnaceId(id) || isDispenserId(id) || isPumpkinId(id)) {
        const map = [def.side, def.side, def.top, def.bottom, def.side, def.front];
        return map[matIndex] ?? null;
    }
    if (id === 1) {
        const map = [def.side, def.side, def.top, def.bottom, def.side, def.side, def.snowSide];
        return map[matIndex] ?? null;
    }
    const map = [def.side, def.side, def.top, def.bottom, def.side, def.side];
    return map[matIndex] ?? null;
}

function remapUvToAtlasTile(u, v, tileIndex) {
    const tileX = tileIndex % ATLAS_GRID_SIZE;
    const tileY = Math.floor(tileIndex / ATLAS_GRID_SIZE);
    const scale = 1 / ATLAS_GRID_SIZE;
    return {
        u: (tileX + u) * scale,
        v: 1 - ((tileY + 1 - v) * scale)
    };
}

function isMaterialTransparentLike(mat) {
    if (!mat) return false;
    if (Array.isArray(mat)) return mat.some((m) => !!m && (m.transparent || (m.alphaTest && m.alphaTest > 0)));
    return !!(mat.transparent || (mat.alphaTest && mat.alphaTest > 0));
}

function canMergeIntoOpaqueAtlas(id, matDef, geomDef) {
    if (id === 1) return false;
    if (isRepeaterId(id) || isPistonId(id)) return false;
    if (!matDef || isMaterialTransparentLike(matDef)) return false;
    if (!geomDef || !geomDef.groups || geomDef.groups.length === 0) return false;
    if (!TERRAIN_TILE_MAP[id]) return false;
    for (const g of geomDef.groups) {
        if (getOpaqueAtlasTileForGroup(id, g.matIndex) == null) return false;
    }
    return true;
}

function canMergeGroupIntoOpaqueAtlas(id, matDef, matIndex = 0) {
    if (id === 1) return false;
    if (isRepeaterId(id) || isPistonId(id)) return false;
    if (!matDef) return false;
    if (Array.isArray(matDef)) {
        const subMat = matDef[matIndex];
        if (!subMat || isMaterialTransparentLike(subMat)) return false;
    } else if (isMaterialTransparentLike(matDef)) {
        return false;
    }
    return getOpaqueAtlasTileForGroup(id, matIndex) != null;
}

function compactGeometryGroups(groups) {
    if (!Array.isArray(groups) || groups.length === 0) return [];
    const compacted = [];
    let current = { ...groups[0] };
    for (let i = 1; i < groups.length; i++) {
        const next = groups[i];
        const currentEnd = current.start + current.count;
        if (next && next.matIndex === current.matIndex && next.start === currentEnd) {
            current.count += next.count;
            continue;
        }
        compacted.push(current);
        current = { ...next };
    }
    compacted.push(current);
    return compacted;
}

function buildGroupedGeometrySubset(d, selectedGroups) {
    const subset = {
        vertices: [],
        uvs: [],
        colors: [],
        indices: [],
        groups: []
    };
    let vertexBase = 0;
    for (const g of selectedGroups) {
        if (!g || g.count <= 0) continue;
        const touched = [];
        const remap = new Map();
        for (let i = g.start; i < g.start + g.count; i++) {
            const srcIndex = d.indices[i];
            if (!remap.has(srcIndex)) {
                remap.set(srcIndex, vertexBase + touched.length);
                touched.push(srcIndex);
                const posIdx = srcIndex * 3;
                subset.vertices.push(d.vertices[posIdx], d.vertices[posIdx + 1], d.vertices[posIdx + 2]);
                const uvIdx = srcIndex * 2;
                subset.uvs.push(d.uvs[uvIdx], d.uvs[uvIdx + 1]);
                if (d.colors && d.colors.length > 0) {
                    subset.colors.push(d.colors[posIdx], d.colors[posIdx + 1], d.colors[posIdx + 2]);
                }
            }
        }
        const groupStart = subset.indices.length;
        for (let i = g.start; i < g.start + g.count; i++) {
            subset.indices.push(remap.get(d.indices[i]));
        }
        subset.groups.push({ start: groupStart, count: g.count, matIndex: g.matIndex });
        vertexBase += touched.length;
    }
    return subset;
}

// --- PROCEDURAL FIRE LOGIC (8-Bit Canvas) ---
const FIRE_WIDTH = 64; // 4 slots of 16px side-by-side
const FIRE_HEIGHT = 16;
let fireCanvas, fireCtx, fireTexture;
let firePixels;
let fireAccumulator = 0;

// Custom palette focused on Deep Red -> Orange -> Yellow -> White
const firePalette = [
    {r:0,g:0,b:0},        {r:45,g:4,b:4},       {r:65,g:5,b:5},       {r:85,g:6,b:6},
    {r:105,g:7,b:7},      {r:135,g:10,b:5},     {r:165,g:15,b:5},     {r:195,g:20,b:5},
    {r:215,g:30,b:5},     {r:235,g:40,b:5},     {r:255,g:60,b:5},     {r:255,g:80,b:5},
    {r:255,g:100,b:5},    {r:255,g:120,b:5},    {r:255,g:140,b:5},    {r:255,g:160,b:5},
    {r:255,g:170,b:5},    {r:255,g:180,b:5},    {r:255,g:190,b:15},   {r:255,g:200,b:25},
    {r:255,g:210,b:35},   {r:255,g:220,b:45},   {r:255,g:230,b:55},   {r:255,g:235,b:65},
    {r:255,g:240,b:75},   {r:255,g:245,b:95},   {r:255,g:250,b:115},  {r:255,g:250,b:135},
    {r:255,g:255,b:155},  {r:255,g:255,b:175},  {r:255,g:255,b:195},  {r:255,g:255,b:215},
    {r:255,g:255,b:235},  {r:255,g:255,b:255},  {r:255,g:255,b:255},  {r:255,g:255,b:255}
];

function initFireTexture() {
    fireCanvas = document.createElement('canvas');
    fireCanvas.width = FIRE_WIDTH;
    fireCanvas.height = FIRE_HEIGHT;
    fireCtx = fireCanvas.getContext('2d');
    
    // Initialize heat array
    firePixels = new Array(FIRE_WIDTH * FIRE_HEIGHT).fill(0);
    
    fireTexture = new THREE.CanvasTexture(fireCanvas);
    fireTexture.magFilter = THREE.NearestFilter;
    fireTexture.minFilter = THREE.NearestFilter;
    fireTexture.colorSpace = THREE.SRGBColorSpace;
    return fireTexture;
}

function updateFirePhysics() {
    if (!firePixels) return;

    // 1. Set the bottom row to maximum intensity (Source)
    for (let x = 0; x < FIRE_WIDTH; x++) {
        firePixels[(FIRE_HEIGHT - 1) * FIRE_WIDTH + x] = 35;
    }

    // 2. Calculate propagation
    for (let x = 0; x < FIRE_WIDTH; x++) {
        for (let y = 1; y < FIRE_HEIGHT; y++) {
            const srcIndex = (y * FIRE_WIDTH) + x;
            
            // Random decay factor
            const decay = Math.floor(Math.random() * 3);
            const srcHeat = firePixels[srcIndex];
            
            // Increase cooling rate to keep flames lower (from previous request)
            let newHeat = srcHeat - (decay + 2); 
            if (newHeat < 0) newHeat = 0;

            // Handle horizontal spread while keeping slots isolated
            // Each slot is 16px wide: 0-15, 16-31, 32-47, 48-63
            const slotIndex = Math.floor(x / 16);
            const slotMin = slotIndex * 16;
            const slotMax = slotMin + 15;

            const targetX = x - decay + 1; // Slight shift logic
            
            if (targetX >= slotMin && targetX <= slotMax) {
                const dstIndex = (y - 1) * FIRE_WIDTH + targetX;
                firePixels[dstIndex] = newHeat;
            }
        }
    }

    // 3. Render to Canvas
    const imgData = fireCtx.getImageData(0, 0, FIRE_WIDTH, FIRE_HEIGHT);
    const data = imgData.data;

    for (let i = 0; i < firePixels.length; i++) {
        const heat = firePixels[i];
        const colorIndex = Math.min(firePalette.length - 1, Math.max(0, heat));
        const color = firePalette[colorIndex];
        
        const idx = i * 4;
        data[idx] = color.r;     // R
        data[idx + 1] = color.g; // G
        data[idx + 2] = color.b; // B
        data[idx + 3] = (heat === 0) ? 0 : 255; // Alpha (Transparent if black/cold)
    }
    
    fireCtx.putImageData(imgData, 0, 0);
    fireTexture.needsUpdate = true;
}

export function updateFireAnimation(dt) {
    if (!fireTexture) return;
    fireAccumulator += dt;
    // Animate at approx 20 FPS (0.05s) for a nice retro feel
    if (fireAccumulator >= 0.05) {
        fireAccumulator = 0;
        updateFirePhysics();
    }
}

export function getFireAnimationCanvas() {
    if (!fireCanvas) initFireTexture();
    return fireCanvas;
}

// --- PORTAL ANIMATION LOGIC ---
const PORTAL_SIZE = 16;
let portalCanvas, portalCtx, portalTexture;
let portalData;
let portalTime = 0;
let portalAccumulator = 0;

// Dark Purple & Pulse Colors
const portalDeep = { r: 30, g: 0, b: 60, a: 255 };
const portalPulse = { r: 160, g: 80, b: 200, a: 255 };

function initPortalTexture() {
    portalCanvas = document.createElement('canvas');
    portalCanvas.width = PORTAL_SIZE;
    portalCanvas.height = PORTAL_SIZE;
    portalCtx = portalCanvas.getContext('2d');
    portalData = portalCtx.createImageData(PORTAL_SIZE, PORTAL_SIZE);
    
    portalTexture = new THREE.CanvasTexture(portalCanvas);
    portalTexture.magFilter = THREE.NearestFilter;
    portalTexture.minFilter = THREE.NearestFilter;
    portalTexture.colorSpace = THREE.SRGBColorSpace;
    return portalTexture;
}

function updatePortalPhysics() {
    if (!portalData) return;
    const data = portalData.data;
    
    portalTime += 0.12; 

    const cx = PORTAL_SIZE / 2;
    const cy = PORTAL_SIZE / 2;

    for (let x = 0; x < PORTAL_SIZE; x++) {
        for (let y = 0; y < PORTAL_SIZE; y++) {
            const dx = x - cx + 0.5;
            const dy = y - cy + 0.5;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const angle = Math.atan2(dy, dx);

            // 3 Spiral Arms
            const arms = 3;
            const tightness = 1.2;
            const spiralVal = (dist * tightness) + (angle * arms) - portalTime;

            const rawPulse = Math.sin(spiralVal);
            const t = (rawPulse + 1) / 2;

            const r = portalDeep.r + (portalPulse.r - portalDeep.r) * t;
            const g = portalDeep.g + (portalPulse.g - portalDeep.g) * t;
            const b = portalDeep.b + (portalPulse.b - portalDeep.b) * t;
            const a = portalDeep.a + (portalPulse.a - portalDeep.a) * t;

            const index = (y * PORTAL_SIZE + x) * 4;
            data[index] = r;
            data[index + 1] = g;
            data[index + 2] = b;
            data[index + 3] = a;
        }
    }
    portalCtx.putImageData(portalData, 0, 0);
    portalTexture.needsUpdate = true;
}

export function updatePortalAnimation(dt) {
    if (!portalTexture) return;
    portalAccumulator += dt;
    if (portalAccumulator >= 0.05) { // ~20 FPS
        portalAccumulator = 0;
        updatePortalPhysics();
    }
}

// Pre-load breaking animation textures
export const breakingTextures = [];
for (let i = 0; i < 10; i++) {
    const tex = loadBlockTexture(`${TEXTURE_PATH}breaking_block_${i}.png`);
    breakingTextures.push(tex);
}

export const materials = {};

// --- Radial fog: fog uses distance from camera (circular), not view-plane depth ---
const RADIAL_FOG_EXPR = 'length((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition)';

// 1) Patch Three.js fog chunk at source if available (affects all materials globally)
if (THREE.ShaderChunk && THREE.ShaderChunk.fog_vertex) {
    THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex
        .replace(/\bvFogDepth\s*=\s*-\s*mvPosition\.z\s*;/g, `vFogDepth = ${RADIAL_FOG_EXPR};`)
        .replace(/\bfogDepth\s*=\s*-\s*mvPosition\.z\s*;/g, `fogDepth = ${RADIAL_FOG_EXPR};`);
}

// 2) Per-material fallback via onBeforeCompile (when chunk is already inlined with different format)
function patchMaterialForRadialFog(material) {
    if (!material || material._radialFogPatched) return;
    material._radialFogPatched = true;
    material.onBeforeCompile = (shader) => {
        const v = shader.vertexShader;
        if (/mvPosition\s*\.\s*z|modelViewMatrix\s*[*\s]*vec4\s*\(\s*position/.test(v)) {
            shader.vertexShader = v
                .replace(/\b(vFogDepth|fogDepth)\s*=\s*[^;]*mvPosition[^;]*\.z[^;]*;/g, `$1 = ${RADIAL_FOG_EXPR};`)
                .replace(/\b(vFogDepth|fogDepth)\s*=\s*-\s*\(\s*modelViewMatrix\s*\*\s*vec4\s*\(\s*position\s*,\s*1\.0\s*\)\s*\)\.z\s*;/g, `$1 = ${RADIAL_FOG_EXPR};`);
        }
    };
}

function patchAllMaterialsForRadialFog() {
    for (const id in materials) {
        const m = materials[id];
        if (Array.isArray(m)) m.forEach(patchMaterialForRadialFog);
        else patchMaterialForRadialFog(m);
    }
}

// --- Initialize Materials ---
BLOCKS.forEach(b => {
    // Prevent item definitions with colliding IDs from overriding terrain block materials.
    // Example: still water block 70 vs water bucket item 70.
    if ((b.isItem || b.type === 'item') && materials[b.id]) return;
    // Common settings for voxel lighting support
    const matSettings = {
        vertexColors: true, // ENABLE VOXEL LIGHTING
    };

    if (b.type === 'multi') {
        const matTop = new THREE.MeshLambertMaterial({ map: getTerrainTextureForPart(b.id, 'top', TEXTURE_PATH + b.top), ...matSettings });
        const matSide = new THREE.MeshLambertMaterial({ map: getTerrainTextureForPart(b.id, 'side', TEXTURE_PATH + b.side), ...matSettings });
        const matBottom = new THREE.MeshLambertMaterial({ map: getTerrainTextureForPart(b.id, 'bottom', TEXTURE_PATH + b.bottom), ...matSettings });
        
        let matSide2, matFront;
        
        if (b.side2) matSide2 = new THREE.MeshLambertMaterial({ map: getTerrainTextureForPart(b.id, 'side2', TEXTURE_PATH + b.side2), ...matSettings });
        if (b.front) matFront = new THREE.MeshLambertMaterial({ map: getTerrainTextureForPart(b.id, 'front', TEXTURE_PATH + b.front), ...matSettings });

        let mats = [];
        
        if (isCraftingTableId(b.id)) { // Crafting Table
            mats = [matSide, matSide, matTop, matBottom, matSide2, matSide2];
        } else if (isPistonId(b.id)) { // Piston / Sticky Piston
            const matExtensionSide = new THREE.MeshLambertMaterial({
                map: cloneAtlasTileTexture(terrainAtlasTexture, 110),
                ...matSettings
            });
            mats = [matSide, matSide, matTop, matBottom, matSide, matFront, matExtensionSide];
        } else if (isFurnaceId(b.id) || isDispenserId(b.id) || isPumpkinId(b.id)) { // Furnace / Dispenser / Pumpkin
            mats = [matSide, matSide, matTop, matBottom, matSide, matFront];
        } else if (b.id === 1) { // Grass: extra material slot for Beta snowy side override on side faces
            const matSnowSide = new THREE.MeshLambertMaterial({ map: getTerrainTextureForPart(b.id, 'snowSide', TEXTURE_PATH + 'grass_snow_side.png'), ...matSettings });
            const matGrassOverlay = new THREE.MeshLambertMaterial({
                map: cloneAtlasTileTexture(terrainAtlasTexture, 38),
                transparent: true,
                alphaTest: 0.1,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -2,
                ...matSettings
            });
            mats = [matSide, matSide, matTop, matBottom, matSide, matSide, matSnowSide, matGrassOverlay];
        } else {
            mats = [matSide, matSide, matTop, matBottom, matSide, matSide];
        }
        
        materials[b.id] = mats;

    } else if (b.type === 'chest') {
        const mSmallFront = new THREE.MeshLambertMaterial({ map: cloneAtlasTileTexture(terrainAtlasTexture, 27), ...matSettings });
        const mSmallSide  = new THREE.MeshLambertMaterial({ map: cloneAtlasTileTexture(terrainAtlasTexture, 26), ...matSettings });
        const mTop        = new THREE.MeshLambertMaterial({ map: cloneAtlasTileTexture(terrainAtlasTexture, 25), ...matSettings });
        const mLargeFront = new THREE.MeshLambertMaterial({ map: cloneAtlasTileTexture(terrainAtlasTexture, 27), ...matSettings });
        const mLargeBack  = new THREE.MeshLambertMaterial({ map: cloneAtlasTileTexture(terrainAtlasTexture, 26), ...matSettings });
        
        materials[b.id] = [mSmallFront, mSmallSide, mTop, mLargeFront, mLargeBack];

    } else if (b.type === 'single') {
        const isGlass = isGlassId(b.id);
        const isIce = (b.id === 79);
        const isLiquidLike = (b.id === 6 || b.id === 70 || b.id === 51 || b.id === 71);
        const useDoubleSide = b.transparent && !isGlass;
        const isSnowLayer = (b.id === 78);
        const disableDepthWrite = isGlass || isIce || isLiquidLike;
        
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
            transparent: b.transparent || false,
            opacity: b.opacity || 1.0,
            side: (useDoubleSide || isSnowLayer) ? THREE.DoubleSide : THREE.FrontSide,
            alphaTest: b.transparent ? 0.1 : 0,
            // Prevent near-camera transparent seam pop between chunked water/ice/glass surfaces.
            depthWrite: !disableDepthWrite,
            ...matSettings
        });

    } else if (b.type === 'item') {
         materials[b.id] = new THREE.MeshLambertMaterial({
            map: getItemTextureForId(b.id, TEXTURE_PATH + b.texture),
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            ...matSettings
         });
    } else if (b.type === 'torch') {
        materials[b.id] = new THREE.MeshBasicMaterial({
            map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            vertexColors: true 
        });
    } else if (b.type === 'button') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            ...matSettings
        });
    } else if (b.type === 'lever') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: cloneAtlasTileTexture(terrainAtlasTexture, 96),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            ...matSettings
        });
    } else if (b.type === 'pressurePlate') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            ...matSettings
        });
    } else if (b.type === 'rail') {
        // Beta rail parity:
        // - normal rail uses straight texture for meta 0..5 and curved texture for meta 6..9
        // - powered/detector rails only use straight family
        if (b.id === 55) {
            const cross = new THREE.MeshLambertMaterial({
                map: cloneAtlasTileTexture(terrainAtlasTexture, 164),
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                ...matSettings
            });
            const line = new THREE.MeshLambertMaterial({
                map: cloneAtlasTileTexture(terrainAtlasTexture, 165),
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                ...matSettings
            });
            materials[b.id] = [cross, line];
        } else if (b.id === 24 || b.id === 263) {
            const straight = new THREE.MeshLambertMaterial({
                map: cloneAtlasTileTexture(terrainAtlasTexture, 128),
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                ...matSettings
            });
            const curved = new THREE.MeshLambertMaterial({
                map: cloneAtlasTileTexture(terrainAtlasTexture, 112),
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                ...matSettings
            });
            materials[b.id] = [straight, curved];
        } else if (b.id === 27 || b.id === 28) {
            const railTile = b.id === 27 ? 179 : 195;
            const off = new THREE.MeshLambertMaterial({
                map: cloneAtlasTileTexture(terrainAtlasTexture, railTile),
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                ...matSettings
            });
            const on = new THREE.MeshLambertMaterial({
                map: cloneAtlasTileTexture(terrainAtlasTexture, railTile),
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                emissive: new THREE.Color(b.id === 27 ? 0x5a2a00 : 0x3b1800),
                emissiveIntensity: 0.6,
                ...matSettings
            });
            materials[b.id] = [off, on];
        } else {
            materials[b.id] = new THREE.MeshLambertMaterial({
                map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide,
                ...matSettings
            });
        }
    } else if (b.type === 'bed') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            ...matSettings
        });
    } else if (b.type === 'cakeBlock') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: getTerrainTextureForPart(b.id, 'side', TEXTURE_PATH + b.texture),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            ...matSettings
        });
    } else if (b.type === 'slab') {
        materials[b.id] = [
            new THREE.MeshLambertMaterial({
                map: getTerrainTextureForPart(b.id, 'top', TEXTURE_PATH + b.texture),
                side: THREE.FrontSide,
                ...matSettings
            }),
            new THREE.MeshLambertMaterial({
                map: getTerrainTextureForPart(b.id, 'bottom', TEXTURE_PATH + b.texture),
                side: THREE.FrontSide,
                ...matSettings
            }),
            new THREE.MeshLambertMaterial({
                map: getTerrainTextureForPart(b.id, 'side', TEXTURE_PATH + b.texture),
                side: THREE.FrontSide,
                ...matSettings
            })
        ];
    } else if (b.type === 'repeater') {
        materials[b.id] = [
            new THREE.MeshLambertMaterial({
                map: getTerrainTextureForPart(b.id, 'top', TEXTURE_PATH + b.texture),
                side: THREE.FrontSide,
                ...matSettings
            }),
            new THREE.MeshLambertMaterial({
                map: getTerrainTextureForPart(b.id, 'bottom', TEXTURE_PATH + b.texture),
                side: THREE.FrontSide,
                ...matSettings
            }),
            new THREE.MeshLambertMaterial({
                map: getTerrainTextureForPart(b.id, 'side', TEXTURE_PATH + b.texture),
                side: THREE.FrontSide,
                ...matSettings
            })
        ];
    } else if (b.type === 'trapdoor') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            ...matSettings
        });
    } else if (b.type === 'fence') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            ...matSettings
        });
    } else if (b.type === 'cross') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            map: getTerrainTextureForPart(b.id, 'single', TEXTURE_PATH + b.texture),
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.5,
            ...matSettings
        });
    } else if (b.id === 63) { // FIRE (Animated)
        if (!fireTexture) initFireTexture();
        materials[b.id] = new THREE.MeshBasicMaterial({
            map: fireTexture,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.1,
            vertexColors: false // Disable vertex colors to use texture
        });
    } else if (b.id === 90) { // PORTAL (Animated)
        if (!portalTexture) initPortalTexture();
        materials[b.id] = new THREE.MeshBasicMaterial({
            map: portalTexture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8, // Make semi-transparent
            vertexColors: false
        });
    } else if (b.type === 'color') {
        materials[b.id] = new THREE.MeshLambertMaterial({
            color: b.color,
            transparent: b.transparent || false,
            opacity: b.opacity || 1.0,
            ...matSettings
        });
    }
});

// Piston extension block id (34) is an internal render block in-world.
// Runtime item/block id collisions can leave 34 without piston materials.
// Force extension to use piston material set so parity probes and rendering
// decode/use the correct atlas tiles.
if (!Array.isArray(materials[34]) && Array.isArray(materials[33])) {
    materials[34] = materials[33];
}
patchAllMaterialsForRadialFog();
patchMaterialForRadialFog(opaqueTerrainAtlasMaterial);
patchMaterialForRadialFog(transparentTerrainAtlasMaterial);

export function getTextureUrl(userUrl) {
    if(!userUrl) return null;
    let ytId = null;
    if (userUrl.includes('youtube.com') || userUrl.includes('youtu.be')) {
        if (userUrl.includes('/shorts/')) ytId = userUrl.split('/shorts/')[1].split(/[?&]/)[0];
        else {
            const match = userUrl.match(/[?&]v=([^&#]*)/);
            if (match) ytId = match[1];
            else if (userUrl.includes('youtu.be/')) ytId = userUrl.split('youtu.be/')[1].split('?')[0];
        }
    }
    if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    try {
        const domain = new URL(userUrl).hostname;
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        return `https://api.allorigins.win/raw?url=${encodeURIComponent(faviconUrl)}`;
    } catch (e) { return null; }
}

// --- RenderChunk Class (Mesh Only) ---
export class RenderChunk {
    constructor(cx, cy, cz, scene) {
        this.cx = cx; this.cy = cy; this.cz = cz;
        this.scene = scene;
        this.meshes = [];
        this.baseVisible = true;
        this.meshCount = 0;
        this.transparentMeshCount = 0;
    }

    updateGeometry(data) {
        // Always dispose old meshes when receiving new geometry
        this.dispose();
        this.meshCount = 0;
        this.transparentMeshCount = 0;
        const mergedOpaque = {
            vertices: [],
            uvs: [],
            colors: [],
            indices: []
        };

        const meshUsesTransparency = (mat) => {
            if (!mat) return false;
            if (Array.isArray(mat)) {
                return mat.some((m) => !!m && (m.transparent || (m.alphaTest && m.alphaTest > 0)));
            }
            return !!(mat.transparent || (mat.alphaTest && mat.alphaTest > 0));
        };

        for (const id in data) {
            const d = data[id];
            if (!d.vertices || d.vertices.length === 0) continue;

            const { numId, metaVariant } = parseRenderBucketKey(id);
            const matDef = materials[id] || materials[numId];
            if (!matDef) continue;

            const canMergeSimpleOpaque =
                !Array.isArray(matDef) &&
                canMergeIntoOpaqueAtlas(numId, matDef, d) &&
                d.groups &&
                d.groups.length > 0 &&
                d.groups.every((g) => g && g.matIndex === d.groups[0].matIndex);

            if (canMergeSimpleOpaque) {
                const tileIndex = getOpaqueAtlasTileForGroup(numId, d.groups[0].matIndex, metaVariant);
                if (tileIndex != null) {
                    const mergedBaseVertex = mergedOpaque.vertices.length / 3;
                    for (let i = 0; i < d.vertices.length; i += 3) {
                        mergedOpaque.vertices.push(d.vertices[i], d.vertices[i + 1], d.vertices[i + 2]);
                        if (d.colors && d.colors.length > 0) {
                            mergedOpaque.colors.push(d.colors[i], d.colors[i + 1], d.colors[i + 2]);
                        }
                    }
                    for (let i = 0; i < d.uvs.length; i += 2) {
                        const remapped = remapUvToAtlasTile(d.uvs[i], d.uvs[i + 1], tileIndex);
                        mergedOpaque.uvs.push(remapped.u, remapped.v);
                    }
                    for (let i = 0; i < d.indices.length; i++) {
                        mergedOpaque.indices.push(mergedBaseVertex + d.indices[i]);
                    }
                    continue;
                }
            }

            if (!d.forceAtlas && Array.isArray(matDef) && d.groups && d.groups.length > 0) {
                const mergeableGroups = [];
                const legacyGroups = [];
                for (const g of d.groups) {
                    if (g && canMergeGroupIntoOpaqueAtlas(numId, matDef, g.matIndex)) mergeableGroups.push(g);
                    else if (g) legacyGroups.push(g);
                }

                if (mergeableGroups.length > 0) {
                    let mergedBaseVertex = mergedOpaque.vertices.length / 3;
                    for (const g of mergeableGroups) {
                        const tileIndex = getOpaqueAtlasTileForGroup(numId, g.matIndex, metaVariant);
                        if (tileIndex == null) continue;
                        const subset = buildGroupedGeometrySubset(d, [g]);
                        for (let i = 0; i < subset.vertices.length; i += 3) {
                            mergedOpaque.vertices.push(subset.vertices[i], subset.vertices[i + 1], subset.vertices[i + 2]);
                            if (subset.colors && subset.colors.length > 0) {
                                mergedOpaque.colors.push(subset.colors[i], subset.colors[i + 1], subset.colors[i + 2]);
                            }
                        }
                        for (let i = 0; i < subset.uvs.length; i += 2) {
                            const remapped = remapUvToAtlasTile(subset.uvs[i], subset.uvs[i + 1], tileIndex);
                            mergedOpaque.uvs.push(remapped.u, remapped.v);
                        }
                        for (let i = 0; i < subset.indices.length; i++) {
                            mergedOpaque.indices.push(mergedBaseVertex + subset.indices[i]);
                        }
                        const addedVerts = subset.vertices.length / 3;
                        mergedBaseVertex += addedVerts;
                    }
                }

                if (legacyGroups.length === 0) {
                    continue;
                }

                const subset = buildGroupedGeometrySubset(d, legacyGroups);
                d.vertices = new Float32Array(subset.vertices);
                d.uvs = new Float32Array(subset.uvs);
                d.colors = subset.colors.length > 0 ? new Float32Array(subset.colors) : null;
                d.indices = new Uint32Array(subset.indices);
                d.groups = compactGeometryGroups(subset.groups);
            }

            if (d.forceAtlas) {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(d.vertices, 3));
                geometry.setAttribute('uv', new THREE.BufferAttribute(d.uvs, 2));

                if (d.colors && d.colors.length > 0) {
                    geometry.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
                }

                geometry.setIndex(new THREE.BufferAttribute(d.indices, 1));
                geometry.addGroup(0, d.indices.length, 0);
                geometry.computeVertexNormals();
                geometry.computeBoundingSphere();

                const mesh = new THREE.Mesh(geometry, d.transparentAtlas ? transparentTerrainAtlasMaterial : opaqueTerrainAtlasMaterial);
                mesh.castShadow = (!isFluidId(numId) && numId !== 19 && numId !== 79 && !isTorchId(numId) && !isButtonId(numId) && !isPressurePlateId(numId) && !isTrapdoorId(numId) && !isRepeaterId(numId) && !isLadderId(numId) && !isSignId(numId) && !isPaintingId(numId) && !isDoorId(numId) && !isBedBlockId(numId) && !isCakeBlockId(numId) && !isVehicleBlockId(numId) && !isLeverId(numId) && numId !== 63 && numId !== 90);
                mesh.receiveShadow = true;
                mesh.visible = this.baseVisible;
                mesh.userData.chunkRenderKind = 'legacy';
                mesh.userData.sourceBlockId = numId;
                mesh.userData.sourceMatIndex = -1;

                this.scene.add(mesh);
                this.meshes.push(mesh);
                this.meshCount++;
            } else if (Array.isArray(matDef)) {
                const groupsByMaterial = new Map();
                const compactedGroups = compactGeometryGroups(d.groups);
                for (const g of compactedGroups) {
                    if (!groupsByMaterial.has(g.matIndex)) groupsByMaterial.set(g.matIndex, []);
                    groupsByMaterial.get(g.matIndex).push(g);
                }

                for (const [matIndex, matGroups] of groupsByMaterial.entries()) {
                    const subMat = matDef[matIndex];
                    if (!subMat) continue;
                    const subset = buildGroupedGeometrySubset(d, matGroups);
                    if (!subset.vertices || subset.vertices.length === 0) continue;

                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(subset.vertices), 3));
                    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(subset.uvs), 2));
                    if (subset.colors && subset.colors.length > 0) {
                        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(subset.colors), 3));
                    }
                    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(subset.indices), 1));
                    geometry.addGroup(0, subset.indices.length, 0);
                    geometry.computeVertexNormals();
                    geometry.computeBoundingSphere();

                    const mesh = new THREE.Mesh(geometry, subMat);
                    mesh.castShadow = (!isFluidId(numId) && numId !== 19 && numId !== 79 && !isTorchId(numId) && !isButtonId(numId) && !isPressurePlateId(numId) && !isTrapdoorId(numId) && !isRepeaterId(numId) && !isLadderId(numId) && !isSignId(numId) && !isPaintingId(numId) && !isDoorId(numId) && !isBedBlockId(numId) && !isCakeBlockId(numId) && !isVehicleBlockId(numId) && !isLeverId(numId) && numId !== 63 && numId !== 90);
                    mesh.receiveShadow = true;
                    if (isFluidId(numId) || numId === 79) mesh.renderOrder = 1;
                    else if (isGlassId(numId) || numId === 63 || numId === 90) mesh.renderOrder = 2;
                    mesh.visible = this.baseVisible;
                    mesh.userData.chunkRenderKind = 'legacy';
                    mesh.userData.sourceBlockId = numId;
                    mesh.userData.sourceMatIndex = matIndex;

                    this.scene.add(mesh);
                    this.meshes.push(mesh);
                    this.meshCount++;
                    if (meshUsesTransparency(subMat)) {
                        this.transparentMeshCount++;
                    }
                }
            } else {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(d.vertices, 3));
                geometry.setAttribute('uv', new THREE.BufferAttribute(d.uvs, 2));

                if (d.colors && d.colors.length > 0) {
                    geometry.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
                }

                geometry.setIndex(new THREE.BufferAttribute(d.indices, 1));
                geometry.addGroup(0, d.indices.length, 0);
                geometry.computeVertexNormals();
                geometry.computeBoundingSphere();

                const mesh = new THREE.Mesh(geometry, matDef);
                mesh.castShadow = (!isFluidId(numId) && numId !== 19 && numId !== 79 && !isTorchId(numId) && !isButtonId(numId) && !isPressurePlateId(numId) && !isTrapdoorId(numId) && !isRepeaterId(numId) && !isLadderId(numId) && !isSignId(numId) && !isPaintingId(numId) && !isDoorId(numId) && !isBedBlockId(numId) && !isCakeBlockId(numId) && !isVehicleBlockId(numId) && !isLeverId(numId) && numId !== 63 && numId !== 90);
                mesh.receiveShadow = true;
                if (isFluidId(numId) || numId === 79) mesh.renderOrder = 1;
                else if (isGlassId(numId) || numId === 63 || numId === 90) mesh.renderOrder = 2;
                mesh.visible = this.baseVisible;
                mesh.userData.chunkRenderKind = 'legacy';
                mesh.userData.sourceBlockId = numId;
                mesh.userData.sourceMatIndex = 0;

                this.scene.add(mesh);
                this.meshes.push(mesh);
                this.meshCount++;
                if (meshUsesTransparency(matDef)) {
                    this.transparentMeshCount++;
                }
            }
        }

        if (mergedOpaque.vertices.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mergedOpaque.vertices), 3));
            geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(mergedOpaque.uvs), 2));
            if (mergedOpaque.colors.length > 0) {
                geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(mergedOpaque.colors), 3));
            }
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mergedOpaque.indices), 1));
            geometry.addGroup(0, mergedOpaque.indices.length, 0);
            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();

            const mesh = new THREE.Mesh(geometry, opaqueTerrainAtlasMaterial);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.visible = this.baseVisible;
            mesh.userData.chunkRenderKind = 'opaqueMerged';
            mesh.userData.sourceBlockId = -1;
            mesh.userData.sourceMatIndex = -1;

            this.scene.add(mesh);
            this.meshes.push(mesh);
            this.meshCount++;
        }
    }

    dispose() {
        for (const mesh of this.meshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.meshes = [];
        this.meshCount = 0;
        this.transparentMeshCount = 0;
    }
}

