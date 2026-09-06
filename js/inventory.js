// js/inventory.js
import {
    BLOCKS,
    getInventoryDef,
    getItemDef,
    getPlaceableBlockDef,
    normalizeLegacyRuntimeBlockId,
    normalizeLegacyRuntimeItemId,
    fromBetaCompatibleBlockId,
    toBetaCompatibleBlockId
} from './blocks.js';

export const SHEARS_ITEM_ID = normalizeLegacyRuntimeItemId(83);
export const WOOL_WHITE_ITEM_ID = 84;
export const EGG_ITEM_ID = normalizeLegacyRuntimeItemId(85);
export const RAW_PORKCHOP_ITEM_ID = normalizeLegacyRuntimeItemId(86);
export const COOKED_PORKCHOP_ITEM_ID = normalizeLegacyRuntimeItemId(87);
export const RAW_CHICKEN_ITEM_ID = normalizeLegacyRuntimeItemId(88);
export const COOKED_CHICKEN_ITEM_ID = normalizeLegacyRuntimeItemId(89);
export const RAW_FISH_ITEM_ID = normalizeLegacyRuntimeItemId(93);
export const COOKED_FISH_ITEM_ID = normalizeLegacyRuntimeItemId(94);
export const BONE_ITEM_ID = normalizeLegacyRuntimeItemId(96);
export const SEEDS_ITEM_ID = normalizeLegacyRuntimeItemId(39);
export const PAPER_ITEM_ID = 339;
export const SLIMEBALL_ITEM_ID = 341;
export const BOWL_ITEM_ID = 280;
export const MUSHROOM_STEW_ITEM_ID = 281;
export const DIAMOND_PICKAXE_ITEM_ID = 240;
export const FLINT_AND_STEEL_ITEM_ID = normalizeLegacyRuntimeItemId(59);
export const EMPTY_BUCKET_ITEM_ID = normalizeLegacyRuntimeItemId(60);
export const WATER_BUCKET_ITEM_ID = normalizeLegacyRuntimeItemId(61);
export const LAVA_BUCKET_ITEM_ID = normalizeLegacyRuntimeItemId(62);
export const MILK_BUCKET_ITEM_ID = normalizeLegacyRuntimeItemId(79);
export const LEATHER_ITEM_ID = normalizeLegacyRuntimeItemId(78);
export const DYE_POWDER_ITEM_ID = normalizeLegacyRuntimeItemId(95);
export const INK_SAC_ITEM_ID = normalizeLegacyRuntimeItemId(95);
export const GLOWSTONE_DUST_ITEM_ID = 348;
export const REDSTONE_REPEATER_ITEM_ID = normalizeLegacyRuntimeItemId(100);
export const BED_ITEM_ID = normalizeLegacyRuntimeItemId(99);
export const CAKE_ITEM_ID = normalizeLegacyRuntimeItemId(98);
export const WHEAT_ITEM_ID = normalizeLegacyRuntimeItemId(40);
export const SUGAR_ITEM_ID = 97;
export const ITEM_STACK_KIND_ITEM = 'item';
export const ITEM_STACK_KIND_BLOCK = 'block';
const LEGACY_AMBIGUOUS_PREF_ITEM_IDS = new Set([27, 28, 29, 30, 33, 41, 42, 43, 59, 60, 61, 62]);
const LEGACY_AMBIGUOUS_PREF_BLOCK_IDS = new Set([85, 88, 89, 92]);
const BETA_ALIAS_SUFFIX_RE = /\s*\(beta id\)\s*$/i;

function normalizeItemMetadata(metadata) {
    const n = Number(metadata);
    return Number.isFinite(n) ? (n & 15) : 0;
}

function inferStackKind(id, kind = null) {
    if (kind === ITEM_STACK_KIND_BLOCK) return ITEM_STACK_KIND_BLOCK;
    if (kind === ITEM_STACK_KIND_ITEM) return ITEM_STACK_KIND_ITEM;
    const runtimeId = Number(id);
    const itemDef = getItemDef(runtimeId);
    const blockDef = getPlaceableBlockDef(runtimeId);
    if (blockDef && !itemDef) return ITEM_STACK_KIND_BLOCK;
    if (itemDef && !blockDef) return ITEM_STACK_KIND_ITEM;
    if (blockDef && itemDef) {
        // Runtime de-collision policy: ambiguous byte-range ids default to blocks.
        if (runtimeId >= 0 && runtimeId <= 255) return ITEM_STACK_KIND_BLOCK;
        return ITEM_STACK_KIND_ITEM;
    }
    return ITEM_STACK_KIND_ITEM;
}

function inferSavedEntryKind(id, entryKind, durability) {
    if (entryKind === ITEM_STACK_KIND_BLOCK || entryKind === ITEM_STACK_KIND_ITEM) return entryKind;
    const runtimeId = Number(id);
    const itemDef = getItemDef(runtimeId);
    const blockDef = getPlaceableBlockDef(runtimeId);
    if (itemDef && blockDef) {
        if (durability !== null && durability !== undefined) return ITEM_STACK_KIND_ITEM;
        if (LEGACY_AMBIGUOUS_PREF_ITEM_IDS.has(runtimeId)) return ITEM_STACK_KIND_ITEM;
        if (LEGACY_AMBIGUOUS_PREF_BLOCK_IDS.has(runtimeId)) return ITEM_STACK_KIND_BLOCK;
        // Legacy save compatibility: for ambiguous IDs where the item side is only a
        // canonical "Beta ID" alias entry, default missing-kind stacks to block.
        if (typeof itemDef.name === 'string' && BETA_ALIAS_SUFFIX_RE.test(itemDef.name)) {
            return ITEM_STACK_KIND_BLOCK;
        }
    }
    return inferStackKind(runtimeId, entryKind);
}

export function getItemStackKind(id, kind = null) {
    return inferStackKind(id, kind);
}

function normalizeComparableIdForKind(id, kind = null) {
    const numId = Number(id) || 0;
    const effectiveKind = inferStackKind(numId, kind);
    if (effectiveKind === ITEM_STACK_KIND_ITEM) return normalizeLegacyRuntimeItemId(numId);
    if (effectiveKind === ITEM_STACK_KIND_BLOCK) return fromBetaCompatibleBlockId(numId);
    return numId;
}

function itemStacksMatch(a, id, metadata = 0, kind = null) {
    if (!a) return false;
    return (
        a.id === id &&
        inferStackKind(a.id, a.kind) === inferStackKind(id, kind) &&
        normalizeItemMetadata(a.metadata) === normalizeItemMetadata(metadata)
    );
}

export class ItemStack {
    constructor(id, count, durability = null, metadata = 0, kind = null) {
        const runtimeId = Number(id);
        const normalizedItemId = normalizeLegacyRuntimeItemId(runtimeId);
        const normalizedBlockId = normalizeLegacyRuntimeBlockId(runtimeId);
        this.kind = inferStackKind(runtimeId, kind);
        if (this.kind === ITEM_STACK_KIND_BLOCK) {
            this.id = Number.isFinite(normalizedBlockId) ? normalizedBlockId : runtimeId;
        } else {
            const itemDef = getItemDef(normalizedItemId);
            this.id = itemDef ? normalizedItemId : runtimeId;
            this.kind = inferStackKind(this.id, this.kind);
        }
        this.count = count;
        const normalizedMetadata = normalizeItemMetadata(metadata);
        if (normalizedMetadata !== 0) {
            this.metadata = normalizedMetadata;
        }
        if (durability !== null) {
            this.durability = durability;
        } else {
            const def = getInventoryDef(this.id, this.kind);
            if (def && def.maxDurability) {
                this.durability = def.maxDurability;
            }
        }
    }
}

export function createItemStackFromSaved(entry) {
    if (!entry || typeof entry !== 'object') return null;
    let id = Math.floor(Number(entry.id));
    const count = Math.floor(Number(entry.count));
    if (!Number.isFinite(id) || !Number.isFinite(count) || count <= 0) return null;
    const kind = typeof entry.kind === 'string' ? entry.kind : null;
    const durability = entry.durability !== undefined && Number.isFinite(Number(entry.durability))
        ? Number(entry.durability)
        : null;
    const savedKind = inferSavedEntryKind(id, kind, durability);
    if (savedKind === ITEM_STACK_KIND_ITEM) {
        id = normalizeLegacyRuntimeItemId(id);
    }
    const metadata = entry.metadata !== undefined ? normalizeItemMetadata(entry.metadata) : 0;
    return new ItemStack(id, count, durability, metadata, savedKind);
}

export function serializeItemStackForSave(stack) {
    if (!stack || typeof stack !== 'object') return null;
    const count = Math.floor(Number(stack.count));
    if (!Number.isFinite(count) || count <= 0) return null;
    const kind = inferStackKind(stack.id, stack.kind);
    const itemDef = kind === ITEM_STACK_KIND_ITEM ? getItemDef(stack.id) : null;
    const out = {
        // Save exact runtime IDs. Beta remapping is lossy and causes collisions.
        id: kind === ITEM_STACK_KIND_ITEM ? normalizeLegacyRuntimeItemId(stack.id) : Number(stack.id),
        count
    };
    out.kind = kind;
    if (stack.durability !== undefined && Number.isFinite(Number(stack.durability))) {
        out.durability = Number(stack.durability);
    }
    const metadata = normalizeItemMetadata(stack.metadata);
    if (metadata !== 0) out.metadata = metadata;
    return out;
}

// Helper to create tool recipes for a material
function createToolRecipes(matId, swordId, pickId, axeId, shovelId, hoeId) {
    const mat = { id: matId, kind: inferStackKind(matId) };
    const stick = { id: 23, kind: ITEM_STACK_KIND_ITEM };
    return [
        // Sword
        { 
            grid: [
                0, mat, 0,
                0, mat, 0,
                0, stick, 0
            ], width: 3, result: { id: swordId, count: 1, kind: ITEM_STACK_KIND_ITEM } 
        },
        // Pickaxe
        { 
            grid: [
                mat, mat, mat,
                0, stick, 0,
                0, stick, 0
            ], width: 3, result: { id: pickId, count: 1, kind: ITEM_STACK_KIND_ITEM } 
        },
        // Axe
        { 
            grid: [
                mat, mat, 0,
                mat, stick, 0,
                0, stick, 0
            ], width: 3, result: { id: axeId, count: 1, kind: ITEM_STACK_KIND_ITEM } 
        },
        // Axe (Mirrored)
        { 
            grid: [
                0, mat, mat,
                0, stick, mat,
                0, stick, 0
            ], width: 3, result: { id: axeId, count: 1, kind: ITEM_STACK_KIND_ITEM } 
        },
        // Shovel
        { 
            grid: [
                0, mat, 0,
                0, stick, 0,
                0, stick, 0
            ], width: 3, result: { id: shovelId, count: 1, kind: ITEM_STACK_KIND_ITEM } 
        },
        // Hoe
        { 
            grid: [
                mat, mat, 0,
                0, stick, 0,
                0, stick, 0
            ], width: 3, result: { id: hoeId, count: 1, kind: ITEM_STACK_KIND_ITEM } 
        },
        // Hoe (Mirrored)
        { 
            grid: [
                0, mat, mat,
                0, stick, 0,
                0, stick, 0
            ], width: 3, result: { id: hoeId, count: 1, kind: ITEM_STACK_KIND_ITEM } 
        }
    ];
}

function createArmorRecipes(matId, helmetId, chestplateId, leggingsId, bootsId) {
    const mat = { id: matId, kind: inferStackKind(matId) };
    return [
        // Helmet
        {
            grid: [
                mat, mat, mat,
                mat, 0, mat,
                0, 0, 0
            ],
            width: 3,
            result: { id: helmetId, count: 1, kind: ITEM_STACK_KIND_ITEM }
        },
        // Chestplate
        {
            grid: [
                mat, 0, mat,
                mat, mat, mat,
                mat, mat, mat
            ],
            width: 3,
            result: { id: chestplateId, count: 1, kind: ITEM_STACK_KIND_ITEM }
        },
        // Leggings
        {
            grid: [
                mat, mat, mat,
                mat, 0, mat,
                mat, 0, mat
            ],
            width: 3,
            result: { id: leggingsId, count: 1, kind: ITEM_STACK_KIND_ITEM }
        },
        // Boots
        {
            grid: [
                0, 0, 0,
                mat, 0, mat,
                mat, 0, mat
            ],
            width: 3,
            result: { id: bootsId, count: 1, kind: ITEM_STACK_KIND_ITEM }
        }
    ];
}

const RECIPES = [
    // Basic Crafting (Originally 2x2 compatible)
    { grid: [{ id: 4, kind: ITEM_STACK_KIND_BLOCK },0,0,0], width: 2, result: { id: 14, count: 4, kind: ITEM_STACK_KIND_BLOCK } }, // Wood -> 4 Planks
    { grid: [{ id: 14, kind: ITEM_STACK_KIND_BLOCK },{ id: 14, kind: ITEM_STACK_KIND_BLOCK },{ id: 14, kind: ITEM_STACK_KIND_BLOCK },{ id: 14, kind: ITEM_STACK_KIND_BLOCK }], width: 2, result: { id: 16, count: 1, kind: ITEM_STACK_KIND_BLOCK } }, // 4 Planks -> Crafting Table
    { grid: [{ id: 14, kind: ITEM_STACK_KIND_BLOCK },0,{ id: 14, kind: ITEM_STACK_KIND_BLOCK },0], width: 2, result: { id: 23, count: 4, kind: ITEM_STACK_KIND_ITEM } }, // 2 Planks (vertical) -> 4 Sticks
    
    // Torch Recipe
    { grid: [{ id: 20, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }], width: 1, result: { id: 50, count: 4, kind: ITEM_STACK_KIND_BLOCK } }, // Coal + Stick -> 4 Torches

    // Piston Recipe (Beta 33)
    {
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 15, kind: ITEM_STACK_KIND_BLOCK },
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 15, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 33, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    // Sticky Piston Recipe (Beta 29)
    {
        grid: [
            { id: SLIMEBALL_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: 33, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 1,
        result: { id: 29, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    // Powered Rail Recipe (Beta 27): 6 output
    {
        grid: [
            { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM },
            { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM },
            { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 27, count: 6, kind: ITEM_STACK_KIND_BLOCK }
    },
    // Rail Recipe (runtime-safe parity): 16 output.
    {
        grid: [
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 201, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 24, count: 16, kind: ITEM_STACK_KIND_BLOCK }
    },
    // Stone pressure plate (runtime-safe parity): 2 stone -> 1 plate block.
    {
        grid: [
            { id: 3, kind: ITEM_STACK_KIND_BLOCK },
            { id: 3, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 2,
        result: { id: 262, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    // Detector Rail Recipe (Beta parity): 6 output.
    {
        grid: [
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 262, kind: ITEM_STACK_KIND_BLOCK }, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 28, count: 6, kind: ITEM_STACK_KIND_BLOCK }
    },

    // Bucket (21 = Iron Ingot → 201)
    {
        grid: [
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            0, { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0,
            0, 0, 0
        ],
        width: 3,
        result: { id: 60, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },

    // Chest Recipe (Beta 54)
    {
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, 0, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 54, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },

    // Flint and Steel (Beta parity): diagonal 2x2 (flint + iron ingot).
    {
        grid: [
            { id: 58, kind: ITEM_STACK_KIND_ITEM }, 0,
            0, { id: 201, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 2,
        result: { id: 59, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Flint and Steel mirrored diagonal.
        grid: [
            0, { id: 58, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0
        ],
        width: 2,
        result: { id: 59, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    // Shears (Beta parity): 2 iron ingots in a diagonal.
    {
        grid: [
            0, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0
        ],
        width: 2,
        result: { id: 83, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Shears mirrored diagonal.
        grid: [
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0,
            0, { id: 201, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 2,
        result: { id: 83, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Bone -> Bone meal
        shapeless: true,
        ingredients: [{ id: 96, kind: ITEM_STACK_KIND_ITEM }],
        result: { id: DYE_POWDER_ITEM_ID, count: 3, metadata: 15, kind: ITEM_STACK_KIND_ITEM }
    },
    // Bowl recipe (Beta): 3 planks in a V-shape -> 4 bowls
    {
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, 0, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            0, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, 0,
            0, 0, 0
        ],
        width: 3,
        result: { id: BOWL_ITEM_ID, count: 4, kind: ITEM_STACK_KIND_ITEM }
    },
    // Mushroom stew (Jacobo parity): 1x3 vertical recipe in either mushroom order.
    { grid: [{ id: 39, kind: ITEM_STACK_KIND_BLOCK }, { id: 40, kind: ITEM_STACK_KIND_BLOCK }, { id: BOWL_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }], width: 1, result: { id: MUSHROOM_STEW_ITEM_ID, count: 1, kind: ITEM_STACK_KIND_ITEM } },
    { grid: [{ id: 40, kind: ITEM_STACK_KIND_BLOCK }, { id: 39, kind: ITEM_STACK_KIND_BLOCK }, { id: BOWL_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }], width: 1, result: { id: MUSHROOM_STEW_ITEM_ID, count: 1, kind: ITEM_STACK_KIND_ITEM } },
    {
        // Red rose -> Rose red
        shapeless: true,
        ingredients: [{ id: 38, kind: ITEM_STACK_KIND_BLOCK }],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Dandelion -> Dandelion yellow
        shapeless: true,
        ingredients: [{ id: 37, kind: ITEM_STACK_KIND_BLOCK }],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 11, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Bone -> Bone meal (Beta parity): 1 bone -> 3 dye powder metadata 15.
        shapeless: true,
        ingredients: [{ id: 96, kind: ITEM_STACK_KIND_ITEM }],
        result: { id: DYE_POWDER_ITEM_ID, count: 3, metadata: 15, kind: ITEM_STACK_KIND_ITEM }
    },
    // Dye combine recipes (Beta-style metadata outputs)
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 1 }, // rose red
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 4 }  // lapis lazuli
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 5, kind: ITEM_STACK_KIND_ITEM } // purple
    },
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 2 }, // cactus green
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 4 }  // lapis lazuli
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 6, kind: ITEM_STACK_KIND_ITEM } // cyan
    },
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 0 },  // ink sac
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 15 }  // bone meal
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 8, kind: ITEM_STACK_KIND_ITEM } // gray
    },
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 0 },  // ink sac
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 15 }, // bone meal
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 15 }  // bone meal
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 3, metadata: 7, kind: ITEM_STACK_KIND_ITEM } // light gray
    },
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 1 },  // rose red
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 15 }  // bone meal
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 9, kind: ITEM_STACK_KIND_ITEM } // pink
    },
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 2 },  // cactus green
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 15 }  // bone meal
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 10, kind: ITEM_STACK_KIND_ITEM } // lime
    },
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 4 },  // lapis lazuli
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 15 }  // bone meal
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 12, kind: ITEM_STACK_KIND_ITEM } // light blue
    },
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 5 }, // purple
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 9 }  // pink
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 13, kind: ITEM_STACK_KIND_ITEM } // magenta
    },
    {
        shapeless: true,
        ingredients: [
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 1 },  // rose red
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 11 }  // dandelion yellow
        ],
        result: { id: DYE_POWDER_ITEM_ID, count: 2, metadata: 14, kind: ITEM_STACK_KIND_ITEM } // orange
    },
    {
        // Cookie (Beta parity): wheat + cocoa beans + wheat -> 8 cookies.
        grid: [
            { id: WHEAT_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 3 },
            { id: WHEAT_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 101, count: 8, kind: ITEM_STACK_KIND_ITEM }
    },

    // Advanced Crafting (Originally 3x3)
    {
        grid: [
            { id: 92, kind: ITEM_STACK_KIND_ITEM }, { id: 9, kind: ITEM_STACK_KIND_BLOCK }, { id: 92, kind: ITEM_STACK_KIND_ITEM },
            { id: 9, kind: ITEM_STACK_KIND_BLOCK }, { id: 92, kind: ITEM_STACK_KIND_ITEM }, { id: 9, kind: ITEM_STACK_KIND_BLOCK },
            { id: 92, kind: ITEM_STACK_KIND_ITEM }, { id: 9, kind: ITEM_STACK_KIND_BLOCK }, { id: 92, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 46, count: 1, kind: ITEM_STACK_KIND_BLOCK } // TNT
    },
    {
        // Sandstone: 2x2 sand
        grid: [
            { id: 9, kind: ITEM_STACK_KIND_BLOCK }, { id: 9, kind: ITEM_STACK_KIND_BLOCK },
            { id: 9, kind: ITEM_STACK_KIND_BLOCK }, { id: 9, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 2,
        result: { id: 65, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Glowstone block: 2x2 glowstone dust.
        grid: [
            { id: GLOWSTONE_DUST_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, { id: GLOWSTONE_DUST_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: GLOWSTONE_DUST_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, { id: GLOWSTONE_DUST_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 2,
        result: { id: 89, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Brick block: 2x2 brick items.
        grid: [
            { id: 80, kind: ITEM_STACK_KIND_ITEM }, { id: 80, kind: ITEM_STACK_KIND_ITEM },
            { id: 80, kind: ITEM_STACK_KIND_ITEM }, { id: 80, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 2,
        result: { id: 45, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Clay block (Beta parity): 2x2 clay balls.
        grid: [
            { id: 81, kind: ITEM_STACK_KIND_ITEM }, { id: 81, kind: ITEM_STACK_KIND_ITEM },
            { id: 81, kind: ITEM_STACK_KIND_ITEM }, { id: 81, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 2,
        result: { id: 82, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Snow block (Beta parity): 2x2 snowballs.
        grid: [
            { id: 76, kind: ITEM_STACK_KIND_ITEM }, { id: 76, kind: ITEM_STACK_KIND_ITEM },
            { id: 76, kind: ITEM_STACK_KIND_ITEM }, { id: 76, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 2,
        result: { id: 265, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Jukebox (Beta parity): 8 planks around 1 diamond.
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 22, kind: ITEM_STACK_KIND_ITEM }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 264, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Gold block compression (Beta parity): 9 gold ingots -> 1 gold block.
        grid: [
            { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM },
            { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM },
            { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 41, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Iron block compression (Beta parity): 9 iron ingots -> 1 iron block.
        grid: [
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 42, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Diamond block compression (runtime-safe parity): 9 diamonds -> 1 diamond block.
        grid: [
            { id: 22, kind: ITEM_STACK_KIND_ITEM }, { id: 22, kind: ITEM_STACK_KIND_ITEM }, { id: 22, kind: ITEM_STACK_KIND_ITEM },
            { id: 22, kind: ITEM_STACK_KIND_ITEM }, { id: 22, kind: ITEM_STACK_KIND_ITEM }, { id: 22, kind: ITEM_STACK_KIND_ITEM },
            { id: 22, kind: ITEM_STACK_KIND_ITEM }, { id: 22, kind: ITEM_STACK_KIND_ITEM }, { id: 22, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 266, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Gold block decompression (Beta parity): 1 gold block -> 9 gold ingots.
        shapeless: true,
        ingredients: [{ id: 41, kind: ITEM_STACK_KIND_BLOCK }],
        result: { id: 10, count: 9, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Iron block decompression (Beta parity): 1 iron block -> 9 iron ingots.
        shapeless: true,
        ingredients: [{ id: 42, kind: ITEM_STACK_KIND_BLOCK }],
        result: { id: 201, count: 9, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Diamond block decompression (runtime-safe parity): 1 diamond block -> 9 diamonds.
        shapeless: true,
        ingredients: [{ id: 266, kind: ITEM_STACK_KIND_BLOCK }],
        result: { id: 22, count: 9, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Note Block (Beta parity): 8 planks around 1 redstone dust.
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 25, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Dispenser (Beta parity): 7 cobblestone + bow + redstone dust.
        grid: [
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 15, kind: ITEM_STACK_KIND_BLOCK },
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 5, kind: ITEM_STACK_KIND_ITEM }, { id: 15, kind: ITEM_STACK_KIND_BLOCK },
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 15, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 23, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Stone slab: 3 stone -> 3 slabs
        grid: [
            { id: 3, kind: ITEM_STACK_KIND_BLOCK }, { id: 3, kind: ITEM_STACK_KIND_BLOCK }, { id: 3, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 44, count: 3, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Fence (Beta-era sticks recipe): 6 sticks -> 2 fences
        grid: [
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            0, 0, 0
        ],
        width: 3,
        result: { id: 85, count: 2, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Wooden door
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, 0,
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, 0,
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, 0
        ],
        width: 3,
        result: { id: 68, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Iron door
        grid: [
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0,
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0,
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0
        ],
        width: 3,
        result: { id: 74, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Trapdoor (Beta parity): 6 planks -> 2 trapdoors.
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            0, 0, 0
        ],
        width: 3,
        result: { id: 96, count: 2, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Sign
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            0, { id: 23, kind: ITEM_STACK_KIND_ITEM }, 0
        ],
        width: 3,
        result: { id: 67, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Ladder (Beta parity): 7 sticks in H-shape -> 2 ladders.
        grid: [
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 23, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 102, count: 2, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Sugar from reeds
        grid: [{ id: 82, kind: ITEM_STACK_KIND_ITEM }],
        width: 1,
        result: { id: 97, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Pumpkin seeds parity: pumpkin block -> 4 seeds.
        // In this runtime, seeds share the stable item id 39.
        shapeless: true,
        ingredients: [{ id: 69, kind: ITEM_STACK_KIND_BLOCK }],
        result: { id: 39, count: 4, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Paper (Beta parity): 3 reeds in a row -> 3 paper.
        grid: [
            { id: 82, kind: ITEM_STACK_KIND_ITEM },
            { id: 82, kind: ITEM_STACK_KIND_ITEM },
            { id: 82, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: PAPER_ITEM_ID, count: 3, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Bread (Beta parity): 3 wheat in a row -> 1 bread.
        grid: [
            { id: WHEAT_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: WHEAT_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: WHEAT_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 297, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Wool (Beta parity): 4 string in a 2x2 -> 1 white wool block.
        grid: [
            { id: 31, kind: ITEM_STACK_KIND_ITEM }, { id: 31, kind: ITEM_STACK_KIND_ITEM },
            { id: 31, kind: ITEM_STACK_KIND_ITEM }, { id: 31, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 2,
        result: { id: WOOL_WHITE_ITEM_ID, count: 1, kind: ITEM_STACK_KIND_BLOCK, metadata: 0 }
    },
    {
        // Golden Apple (Beta 1.7.3 parity): 8 gold blocks around apple.
        grid: [
            { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 41, kind: ITEM_STACK_KIND_BLOCK },
            { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 4, kind: ITEM_STACK_KIND_ITEM },   { id: 41, kind: ITEM_STACK_KIND_BLOCK },
            { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 41, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 66, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Book (Beta parity): 3 paper vertical -> 1 book.
        grid: [
            { id: PAPER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: PAPER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: PAPER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 1,
        result: { id: 84, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Cake (Beta parity): 3 milk buckets + sugar/egg/sugar + 3 wheat.
        grid: [
            { id: MILK_BUCKET_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, { id: MILK_BUCKET_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, { id: MILK_BUCKET_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: SUGAR_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, { id: EGG_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, { id: SUGAR_ITEM_ID, kind: ITEM_STACK_KIND_ITEM },
            { id: WHEAT_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, { id: WHEAT_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, { id: WHEAT_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: CAKE_ITEM_ID, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Bookshelf
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 84, kind: ITEM_STACK_KIND_ITEM }, { id: 84, kind: ITEM_STACK_KIND_ITEM }, { id: 84, kind: ITEM_STACK_KIND_ITEM },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 47, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Redstone Torch (Beta parity): redstone dust over stick.
        grid: [
            { id: 75, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 1,
        result: { id: 76, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Repeater (Beta parity): torches + redstone over a 3-stone base.
        grid: [
            0, 0, 0,
            { id: 76, kind: ITEM_STACK_KIND_BLOCK }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 76, kind: ITEM_STACK_KIND_BLOCK },
            { id: 3, kind: ITEM_STACK_KIND_BLOCK }, { id: 3, kind: ITEM_STACK_KIND_BLOCK }, { id: 3, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 100, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Lever (Beta parity): stick over cobblestone.
        grid: [
            { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 1,
        result: { id: 111, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Stone button (Beta parity): 2 stone vertical -> 1 button block.
        grid: [
            { id: 3, kind: ITEM_STACK_KIND_BLOCK },
            { id: 3, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 1,
        result: { id: 77, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Wood pressure plate (Beta parity): 2 planks row -> 1 pressure plate block.
        grid: [
            { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 2,
        result: { id: 72, count: 1, kind: ITEM_STACK_KIND_BLOCK }
    },
    {
        // Bow
        grid: [
            0, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 31, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 31, kind: ITEM_STACK_KIND_ITEM },
            0, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 31, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 5, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Arrow
        grid: [
            { id: 58, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 32, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 1,
        result: { id: 6, count: 4, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Minecart
        grid: [
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            0, 0, 0
        ],
        width: 3,
        result: { id: 72, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Boat
        grid: [
            0, 0, 0,
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, 0, { id: 14, kind: ITEM_STACK_KIND_BLOCK },
            { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }, { id: 14, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 77, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Fishing rod
        grid: [
            0, 0, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            0, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 31, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 31, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 90, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Painting
        grid: [
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 84, kind: ITEM_STACK_KIND_BLOCK }, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 65, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Clock
        grid: [
            0, { id: 10, kind: ITEM_STACK_KIND_ITEM }, 0,
            { id: 10, kind: ITEM_STACK_KIND_ITEM }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 10, kind: ITEM_STACK_KIND_ITEM },
            0, { id: 10, kind: ITEM_STACK_KIND_ITEM }, 0
        ],
        width: 3,
        result: { id: 91, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Compass (Beta parity): iron around redstone.
        grid: [
            0, { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0,
            { id: 201, kind: ITEM_STACK_KIND_ITEM }, { id: 75, kind: ITEM_STACK_KIND_ITEM }, { id: 201, kind: ITEM_STACK_KIND_ITEM },
            0, { id: 201, kind: ITEM_STACK_KIND_ITEM }, 0
        ],
        width: 3,
        result: { id: 349, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Map (Beta parity): paper ring around compass.
        grid: [
            { id: 339, kind: ITEM_STACK_KIND_ITEM }, { id: 339, kind: ITEM_STACK_KIND_ITEM }, { id: 339, kind: ITEM_STACK_KIND_ITEM },
            { id: 339, kind: ITEM_STACK_KIND_ITEM }, { id: 349, kind: ITEM_STACK_KIND_ITEM }, { id: 339, kind: ITEM_STACK_KIND_ITEM },
            { id: 339, kind: ITEM_STACK_KIND_ITEM }, { id: 339, kind: ITEM_STACK_KIND_ITEM }, { id: 339, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 350, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Golden Apple (Beta parity): 8 gold blocks around 1 red apple.
        grid: [
            { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 41, kind: ITEM_STACK_KIND_BLOCK },
            { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 4, kind: ITEM_STACK_KIND_ITEM }, { id: 41, kind: ITEM_STACK_KIND_BLOCK },
            { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 41, kind: ITEM_STACK_KIND_BLOCK }, { id: 41, kind: ITEM_STACK_KIND_BLOCK }
        ],
        width: 3,
        result: { id: 66, count: 1, kind: ITEM_STACK_KIND_ITEM }
    },
    {
        // Ladder
        grid: [
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM }, { id: 23, kind: ITEM_STACK_KIND_ITEM },
            { id: 23, kind: ITEM_STACK_KIND_ITEM }, 0, { id: 23, kind: ITEM_STACK_KIND_ITEM }
        ],
        width: 3,
        result: { id: 102, count: 2, kind: ITEM_STACK_KIND_ITEM }
    },
    { 
        grid: [
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 15, kind: ITEM_STACK_KIND_BLOCK },
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }, 0, { id: 15, kind: ITEM_STACK_KIND_BLOCK },
            { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 15, kind: ITEM_STACK_KIND_BLOCK }, { id: 15, kind: ITEM_STACK_KIND_BLOCK }
        ], 
        width: 3,
        result: { id: 17, count: 1, kind: ITEM_STACK_KIND_BLOCK } // Furnace
    },
    ...createToolRecipes(14, 24, 25, 26, 27, 28), // Wood
    ...createToolRecipes(15, 29, 30, 231, 232, 33), // Stone (Cobblestone)
    ...createToolRecipes(201, 34, 35, 36, 0, 238), // Iron
    ...createToolRecipes(22, 239, 240, 41, 42, 43),  // Diamond
    ...createToolRecipes(10, 283, 285, 286, 284, 294), // Gold
    ...createArmorRecipes(LEATHER_ITEM_ID, 342, 343, 44, 45), // Leather armor (runtime-safe IDs for helm/chest)
    ...createArmorRecipes(201, 50, 51, 52, 53), // Iron armor
    ...createArmorRecipes(22, 54, 55, 56, 57), // Diamond armor
    ...createArmorRecipes(10, 344, 345, 346, 347) // Gold armor (runtime-safe IDs)
];

export const SMELTING_RECIPES = [
    { in: { id: 11, kind: ITEM_STACK_KIND_BLOCK }, out: { id: 10, kind: ITEM_STACK_KIND_ITEM, metadata: 0 } }, // Gold Ore (alias) -> Gold Ingot (alias)
    { in: { id: 12, kind: ITEM_STACK_KIND_BLOCK }, out: { id: 201, kind: ITEM_STACK_KIND_ITEM, metadata: 0 } }, // Iron Ore -> Iron Ingot
    { in: { id: 9, kind: ITEM_STACK_KIND_BLOCK }, out: { id: 19, kind: ITEM_STACK_KIND_BLOCK, metadata: 0 } }, // Sand -> Glass
    { in: { id: 15, kind: ITEM_STACK_KIND_BLOCK }, out: { id: 3, kind: ITEM_STACK_KIND_BLOCK, metadata: 0 } }, // Cobble -> Stone
    { in: { id: 4, kind: ITEM_STACK_KIND_BLOCK }, out: { id: 20, kind: ITEM_STACK_KIND_ITEM, metadata: 1 } }, // Log -> Charcoal (coal metadata 1)
    { in: { id: 81, kind: ITEM_STACK_KIND_BLOCK }, out: { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 2 } }, // Cactus (runtime alias) -> Cactus Green
    { in: { id: 56, kind: ITEM_STACK_KIND_BLOCK }, out: { id: DYE_POWDER_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 2 } }, // Cactus (legacy runtime id) -> Cactus Green
    { in: { id: 81, kind: ITEM_STACK_KIND_ITEM }, out: { id: 80, kind: ITEM_STACK_KIND_ITEM, metadata: 0 } }, // Clay Ball -> Brick item
    { in: { id: 63, kind: ITEM_STACK_KIND_ITEM }, out: { id: 64, kind: ITEM_STACK_KIND_ITEM, metadata: 0 } }, // Raw Porkchop (alias) -> Cooked Porkchop (alias)
    { in: { id: RAW_FISH_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, out: { id: COOKED_FISH_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 0 } }, // Raw Fish -> Cooked Fish
    { in: { id: RAW_PORKCHOP_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, out: { id: COOKED_PORKCHOP_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 0 } }, // Raw Porkchop -> Cooked Porkchop
    { in: { id: RAW_CHICKEN_ITEM_ID, kind: ITEM_STACK_KIND_ITEM }, out: { id: COOKED_CHICKEN_ITEM_ID, kind: ITEM_STACK_KIND_ITEM, metadata: 0 } } // Raw Chicken -> Cooked Chicken
];

export function getSmeltingResultForInput(inputStack) {
    if (!inputStack) return null;
    const inputId = Number(inputStack.id);
    const inputKind = inferStackKind(inputId, inputStack.kind);
    const normalizedInputId = normalizeComparableIdForKind(inputId, inputKind);
    const inputMeta = normalizeItemMetadata(inputStack.metadata);

    for (const recipe of SMELTING_RECIPES) {
        if (!recipe || !recipe.in || !recipe.out) continue;
        const recipeInKind = recipe.in.kind || inputKind;
        const normalizedRecipeInId = normalizeComparableIdForKind(recipe.in.id, recipeInKind);
        if (normalizedRecipeInId !== normalizedInputId) continue;
        if (recipe.in.kind && recipe.in.kind !== inputKind) continue;
        if (recipe.in.metadata !== undefined && normalizeItemMetadata(recipe.in.metadata) !== inputMeta) continue;
        return {
            id: Number(recipe.out.id) || 0,
            kind: recipe.out.kind === ITEM_STACK_KIND_BLOCK ? ITEM_STACK_KIND_BLOCK : ITEM_STACK_KIND_ITEM,
            metadata: normalizeItemMetadata(recipe.out.metadata)
        };
    }
    return null;
}

export const FUEL_RECIPES = [
    { id: 7, kind: ITEM_STACK_KIND_ITEM, value: 80 },    // Coal (Beta alias)
    { id: 20, kind: ITEM_STACK_KIND_ITEM, value: 80 },   // Coal (runtime alias)
    { id: 71, kind: ITEM_STACK_KIND_ITEM, value: 1000 }, // Lava bucket (Beta alias)
    { id: 62, kind: ITEM_STACK_KIND_ITEM, value: 1000 }, // Lava bucket (runtime item)
    { id: 23, kind: ITEM_STACK_KIND_ITEM, value: 5 },    // Stick
    { id: 24, kind: ITEM_STACK_KIND_ITEM, value: 10 },   // Wood sword
    { id: 25, kind: ITEM_STACK_KIND_ITEM, value: 10 },   // Wood pickaxe
    { id: 26, kind: ITEM_STACK_KIND_ITEM, value: 10 },   // Wood axe
    { id: 27, kind: ITEM_STACK_KIND_ITEM, value: 10 },   // Wood shovel
    { id: 28, kind: ITEM_STACK_KIND_ITEM, value: 10 },   // Wood hoe
    { id: 67, kind: ITEM_STACK_KIND_ITEM, value: 10 },   // Sign
    { id: 68, kind: ITEM_STACK_KIND_ITEM, value: 20 },   // Wooden door
    { id: 77, kind: ITEM_STACK_KIND_ITEM, value: 20 },   // Boat
    { id: 102, kind: ITEM_STACK_KIND_ITEM, value: 15 },  // Ladder item
    { id: 280, kind: ITEM_STACK_KIND_ITEM, value: 10 },  // Bowl
    { id: 14, kind: ITEM_STACK_KIND_BLOCK, value: 10 },  // Planks block-item
    { id: 4, kind: ITEM_STACK_KIND_BLOCK, value: 15 },   // Log block-item
    { id: 5, kind: ITEM_STACK_KIND_BLOCK, value: 5 },    // Leaves block-item
    { id: 103, kind: ITEM_STACK_KIND_BLOCK, value: 5 },  // Sapling block-item
    { id: 47, kind: ITEM_STACK_KIND_BLOCK, value: 15 },  // Bookshelf block-item
    { id: 84, kind: ITEM_STACK_KIND_BLOCK, value: 5 },   // Wool block-item (runtime)
    { id: 35, kind: ITEM_STACK_KIND_BLOCK, value: 5 },   // Wool block-item (canonical Beta ID compatibility)
    { id: 53, kind: ITEM_STACK_KIND_BLOCK, value: 15 },  // Chest (legacy block id)
    { id: 54, kind: ITEM_STACK_KIND_BLOCK, value: 15 },  // Chest (beta block id)
    { id: 58, kind: ITEM_STACK_KIND_BLOCK, value: 15 },  // Crafting table (legacy block id)
    { id: 16, kind: ITEM_STACK_KIND_BLOCK, value: 15 },  // Crafting table block-item
    { id: 25, kind: ITEM_STACK_KIND_BLOCK, value: 15 },  // Note block
    { id: 72, kind: ITEM_STACK_KIND_BLOCK, value: 15 },  // Wood pressure plate block-item
    { id: 85, kind: ITEM_STACK_KIND_BLOCK, value: 15 },  // Fence block-item
    { id: 96, kind: ITEM_STACK_KIND_BLOCK, value: 15 }   // Trapdoor block-item
];

export function getFuelValueForInputStack(inputStack) {
    if (!inputStack) return 0;
    const inputId = Number(inputStack.id);
    const inputKind = inferStackKind(inputId, inputStack.kind);
    const normalizedInputId = normalizeComparableIdForKind(inputId, inputKind);
    for (const recipe of FUEL_RECIPES) {
        if (!recipe) continue;
        const recipeKind = recipe.kind || inputKind;
        const normalizedRecipeId = normalizeComparableIdForKind(recipe.id, recipeKind);
        if (normalizedRecipeId !== normalizedInputId) continue;
        if (recipe.kind && recipe.kind !== inputKind) continue;
        return Number(recipe.value) || 0;
    }
    return 0;
}

export class Inventory {
    constructor() {
        this.slots = new Array(40).fill(null);
        this.activeContainerType = 'INVENTORY';
        this.activeTileEntity = null;
        this.crafting2x2 = new Array(4).fill(null);
        this.craftingOutput = null;
        this.crafting3x3 = new Array(9).fill(null);
        this.cursorItem = null;
    }

    getItemStackRules(id, kind = null) {
        const stackKind = inferStackKind(id, kind);
        const def = stackKind === ITEM_STACK_KIND_BLOCK ? getPlaceableBlockDef(id) : getItemDef(id) || getInventoryDef(id, ITEM_STACK_KIND_ITEM);
        const stackable = def ? (def.stackable !== false) : true;

        let maxStack = 64;
        if (def) {
            if (def.maxStack !== undefined) {
                maxStack = def.maxStack;
            } else if (!stackable) {
                maxStack = 1;
            }
        }

        return { def, stackable, maxStack };
    }

    canFitItem(id, count, durability = null, metadata = 0, kind = null) {
        if (count <= 0) return true;
        const stackKind = inferStackKind(id, kind);
        const { stackable, maxStack } = this.getItemStackRules(id, stackKind);
        const normalizedMetadata = normalizeItemMetadata(metadata);
        let remaining = count;

        if (stackable) {
            for (let i = 0; i < this.slots.length; i++) {
                const slot = this.slots[i];
                if (!itemStacksMatch(slot, id, normalizedMetadata, stackKind) || slot.count >= maxStack) continue;
                const space = maxStack - slot.count;
                remaining -= Math.min(space, remaining);
                if (remaining <= 0) return true;
            }
        }

        for (let i = 0; i < this.slots.length; i++) {
            if (this.slots[i]) continue;
            remaining -= Math.min(remaining, maxStack);
            if (remaining <= 0) return true;
        }

        return false;
    }

    addItem(id, count, durability = null, metadata = 0, kind = null) {
        const stackKind = inferStackKind(id, kind);
        const { stackable, maxStack } = this.getItemStackRules(id, stackKind);
        const normalizedMetadata = normalizeItemMetadata(metadata);

        // 1. Try to fill existing stacks first (if the item allows stacking)
        if (stackable) {
            for (let i = 0; i < this.slots.length; i++) {
                if (itemStacksMatch(this.slots[i], id, normalizedMetadata, stackKind) && this.slots[i].count < maxStack) {
                    const space = maxStack - this.slots[i].count;
                    const add = Math.min(space, count);
                    this.slots[i].count += add;
                    count -= add;
                    if (count === 0) return true;
                }
            }
        }

        // 2. Fill empty slots with new stacks
        // We loop until all items are placed or inventory is full
        while (count > 0) {
            let emptyIndex = -1;
            for (let i = 0; i < this.slots.length; i++) {
                if (!this.slots[i]) {
                    emptyIndex = i;
                    break;
                }
            }

            if (emptyIndex !== -1) {
                // How many can we put in this new slot?
                const add = Math.min(count, maxStack);
                this.slots[emptyIndex] = new ItemStack(id, add, durability, normalizedMetadata, stackKind);
                count -= add;
            } else {
                // No more empty slots, inventory is full
                return false; 
            }
        }
        
        return true; 
    }

    consumeItem(slotIndex, amount = 1) {
        if (this.slots[slotIndex]) {
            this.slots[slotIndex].count -= amount;
            if (this.slots[slotIndex].count <= 0) {
                this.slots[slotIndex] = null;
            }
        }
    }

    clickSlot(index, isRightClick) {
        this.handleSlotClick(this.slots, index, isRightClick);
    }

    clickCraftingSlot(index, isRightClick) {
        if (this.activeContainerType === 'CRAFTING_TABLE') {
            this.handleSlotClick(this.crafting3x3, index, isRightClick);
        } else {
            this.handleSlotClick(this.crafting2x2, index, isRightClick);
        }
        this.updateCraftingResult();
    }
    
    clickFurnaceSlot(slotName, isRightClick) {
        if (!this.activeTileEntity) return;
        let idx = -1;
        if (slotName === 'input') idx = 0;
        if (slotName === 'fuel') idx = 1;
        if (slotName === 'output') idx = 2;
        
        if (idx === -1) return;
        
        if (idx === 2) {
             const clickedItem = this.activeTileEntity.inventory[idx];
             if (clickedItem && !this.cursorItem) {
                 this.cursorItem = clickedItem;
                 this.activeTileEntity.inventory[idx] = null;
             } else if (clickedItem && this.cursorItem && itemStacksMatch(clickedItem, this.cursorItem.id, this.cursorItem.metadata, this.cursorItem.kind)) {
                 const def = clickedItem.kind === ITEM_STACK_KIND_BLOCK
                     ? getPlaceableBlockDef(clickedItem.id)
                     : getItemDef(clickedItem.id) || getInventoryDef(clickedItem.id, ITEM_STACK_KIND_ITEM);
                 const maxStack = (def && def.maxStack) ? def.maxStack : 64;
                 if (this.cursorItem.count + clickedItem.count <= maxStack) {
                     this.cursorItem.count += clickedItem.count;
                     this.activeTileEntity.inventory[idx] = null;
                 }
             }
        } else {
            this.handleSlotClick(this.activeTileEntity.inventory, idx, isRightClick);
        }
    }

    handleSlotClick(array, index, isRightClick) {
        const clickedItem = array[index];

        if (!this.cursorItem) {
            if (clickedItem) {
                if (isRightClick) {
                    const half = Math.ceil(clickedItem.count / 2);
                    const def = clickedItem.kind === ITEM_STACK_KIND_BLOCK
                        ? getPlaceableBlockDef(clickedItem.id)
                        : getItemDef(clickedItem.id) || getInventoryDef(clickedItem.id, ITEM_STACK_KIND_ITEM);
                    if (def && def.stackable === false) {
                        // Cannot split non-stackable items
                        this.cursorItem = clickedItem;
                        array[index] = null;
                    } else {
                        this.cursorItem = new ItemStack(clickedItem.id, half, clickedItem.durability ?? null, clickedItem.metadata, clickedItem.kind);
                        clickedItem.count -= half;
                        if (clickedItem.count === 0) array[index] = null;
                    }
                } else {
                    this.cursorItem = clickedItem;
                    array[index] = null;
                }
            }
        } else {
            if (!clickedItem) {
                if (isRightClick) {
                    array[index] = new ItemStack(this.cursorItem.id, 1, this.cursorItem.durability, this.cursorItem.metadata, this.cursorItem.kind);
                    this.cursorItem.count--;
                    if (this.cursorItem.count === 0) this.cursorItem = null;
                } else {
                    array[index] = this.cursorItem;
                    this.cursorItem = null;
                }
            } else if (itemStacksMatch(clickedItem, this.cursorItem.id, this.cursorItem.metadata, this.cursorItem.kind)) {
                const def = clickedItem.kind === ITEM_STACK_KIND_BLOCK
                    ? getPlaceableBlockDef(clickedItem.id)
                    : getItemDef(clickedItem.id) || getInventoryDef(clickedItem.id, ITEM_STACK_KIND_ITEM);
                const stackable = def ? (def.stackable !== false) : true;
                const maxStack = (def && def.maxStack) ? def.maxStack : 64;
                
                if (stackable) {
                    const space = maxStack - clickedItem.count;
                    if (space > 0) {
                        const toAdd = isRightClick ? 1 : Math.min(space, this.cursorItem.count);
                        clickedItem.count += toAdd;
                        this.cursorItem.count -= toAdd;
                        if (this.cursorItem.count === 0) this.cursorItem = null;
                    }
                } else {
                    // Swap if not stackable
                    if (!isRightClick) {
                        array[index] = this.cursorItem;
                        this.cursorItem = clickedItem;
                    }
                }
            } else {
                if (!isRightClick) {
                    array[index] = this.cursorItem;
                    this.cursorItem = clickedItem;
                }
            }
        }
    }

    clickCraftingOutput() {
        if (!this.craftingOutput) return;

        if (!this.cursorItem) {
            this.cursorItem = new ItemStack(
                this.craftingOutput.id,
                this.craftingOutput.count,
                this.craftingOutput.durability ?? null,
                this.craftingOutput.metadata,
                this.craftingOutput.kind
            );
            this.consumeIngredients();
            this.updateCraftingResult(); 
        } 
        else if (itemStacksMatch(this.cursorItem, this.craftingOutput.id, this.craftingOutput.metadata, this.craftingOutput.kind)) {
            const def = this.cursorItem.kind === ITEM_STACK_KIND_BLOCK
                ? getPlaceableBlockDef(this.cursorItem.id)
                : getItemDef(this.cursorItem.id) || getInventoryDef(this.cursorItem.id, ITEM_STACK_KIND_ITEM);
            const stackable = def ? (def.stackable !== false) : true;
            const maxStack = (def && def.maxStack) ? def.maxStack : 64;
            
            if (stackable) {
                if (this.cursorItem.count + this.craftingOutput.count <= maxStack) {
                    this.cursorItem.count += this.craftingOutput.count;
                    this.consumeIngredients();
                    this.updateCraftingResult();
                }
            }
        }
    }

    consumeIngredients() {
        const grid = (this.activeContainerType === 'CRAFTING_TABLE') ? this.crafting3x3 : this.crafting2x2;
        for(let i=0; i<grid.length; i++) {
            const stack = grid[i];
            if (stack) {
                const slotKind = inferStackKind(stack.id, stack.kind);
                const isMilkBucket = slotKind === ITEM_STACK_KIND_ITEM && stack.id === MILK_BUCKET_ITEM_ID;
                stack.count--;
                if (stack.count <= 0) {
                    if (isMilkBucket) {
                        // Beta-style container return: milk bucket crafts leave empty bucket in-slot.
                        grid[i] = new ItemStack(EMPTY_BUCKET_ITEM_ID, 1, null, 0, ITEM_STACK_KIND_ITEM);
                    } else {
                        grid[i] = null;
                    }
                }
            }
        }
        this.craftingOutput = null;
    }

    updateCraftingResult() {
        const isTable = (this.activeContainerType === 'CRAFTING_TABLE');
        const grid = isTable ? this.crafting3x3 : this.crafting2x2;
        const width = isTable ? 3 : 2;

        const currentIds = grid.map(s => s ? s.id : 0);
        const currentStacks = grid.map((s) => {
            if (!s) return null;
            return {
                id: s.id,
                kind: inferStackKind(s.id, s.kind),
                metadata: normalizeItemMetadata(s.metadata)
            };
        });
        let match = null;

        // Dynamic Beta wool dyeing parity: one wool + one dye powder -> dyed wool.
        const presentStacks = grid.filter((s) => !!s && s.id !== 0);
        if (presentStacks.length === 2) {
            const woolStack = presentStacks.find((s) => {
                if (inferStackKind(s.id, s.kind) !== ITEM_STACK_KIND_BLOCK) return false;
                const sid = Number(s.id);
                return sid === WOOL_WHITE_ITEM_ID || sid === 35;
            });
            const dyeStack = presentStacks.find((s) =>
                inferStackKind(s.id, s.kind) === ITEM_STACK_KIND_ITEM && s.id === DYE_POWDER_ITEM_ID
            );
            if (woolStack && dyeStack) {
                const dyeMeta = normalizeItemMetadata(dyeStack.metadata);
                const woolMeta = (~dyeMeta) & 15;
                match = new ItemStack(WOOL_WHITE_ITEM_ID, 1, null, woolMeta, ITEM_STACK_KIND_BLOCK);
                this.craftingOutput = match;
                return;
            }
        }
        
        // Loop through all recipes
        for (const recipe of RECIPES) {
            if (recipe.shapeless) {
                // Shapeless Matching Logic
                const currentItems = grid
                    .filter((s) => !!s && s.id !== 0)
                    .map((s) => ({
                        id: s.id,
                        kind: inferStackKind(s.id, s.kind),
                        metadata: normalizeItemMetadata(s.metadata)
                    }));
                const requiredItems = (recipe.ingredients || []).map((ing) => {
                    if (ing && typeof ing === 'object') {
                        return {
                            id: Number(ing.id) || 0,
                            kind: ing.kind === ITEM_STACK_KIND_BLOCK || ing.kind === ITEM_STACK_KIND_ITEM ? ing.kind : null,
                            metadata: ing.metadata !== undefined ? normalizeItemMetadata(ing.metadata) : null
                        };
                    }
                    return { id: Number(ing) || 0, kind: null, metadata: null };
                });

                if (currentItems.length === requiredItems.length && this.matchesShapeless(currentItems, requiredItems)) {
                    match = new ItemStack(
                        recipe.result.id,
                        recipe.result.count,
                        recipe.result.durability ?? null,
                        recipe.result.metadata ?? 0,
                        recipe.result.kind ?? null
                    );
                    break;
                }
            } else {
                // Standard Shaped Logic
                const recipeUsesCells = Array.isArray(recipe.grid) && recipe.grid.some((cell) => cell && typeof cell === 'object');
                const shapedMatched = recipeUsesCells
                    ? this.matchesRecipeStacks(currentStacks, width, recipe.grid, recipe.width)
                    : this.matchesRecipe(currentIds, width, recipe.grid, recipe.width);
                if (shapedMatched) {
                    match = new ItemStack(
                        recipe.result.id,
                        recipe.result.count,
                        recipe.result.durability ?? null,
                        recipe.result.metadata ?? 0,
                        recipe.result.kind ?? null
                    );
                    break;
                }
            }
        }

        this.craftingOutput = match;
    }

    // New Recipe Logic: Extracts the bounding box of items and matches shape
    matchesRecipe(inputGrid, inputW, recipeGrid, recipeW) {
        const inputShape = this.extractShape(inputGrid, inputW);
        const recipeShape = this.extractShape(recipeGrid, recipeW);
        
        if (inputShape.rows !== recipeShape.rows || inputShape.cols !== recipeShape.cols) return false;
        const sameOrientation = this.shapedArraysEqual(inputShape.data, recipeShape.data);
        if (sameOrientation) return true;
        const mirrored = this.mirrorShapedArray(recipeShape.data, recipeShape.cols);
        return this.shapedArraysEqual(inputShape.data, mirrored);
    }

    matchesShapeless(currentItems, requiredItems) {
        const used = new Array(currentItems.length).fill(false);
        for (const req of requiredItems) {
            let found = -1;
            for (let i = 0; i < currentItems.length; i++) {
                if (used[i]) continue;
                const cur = currentItems[i];
                const effectiveKind = req.kind || cur.kind || null;
                const curId = this.normalizeComparableIdByKind(cur.id, effectiveKind);
                const reqId = this.normalizeComparableIdByKind(req.id, effectiveKind);
                if (curId !== reqId) continue;
                if (req.kind && cur.kind !== req.kind) continue;
                if (req.metadata !== null && cur.metadata !== req.metadata) continue;
                found = i;
                break;
            }
            if (found === -1) return false;
            used[found] = true;
        }
        return true;
    }

    normalizeRecipeCell(cell) {
        if (!cell || cell === 0) return null;
        if (typeof cell === 'object') {
            return {
                id: Number(cell.id) || 0,
                kind: cell.kind === ITEM_STACK_KIND_BLOCK || cell.kind === ITEM_STACK_KIND_ITEM ? cell.kind : null,
                metadata: cell.metadata !== undefined ? normalizeItemMetadata(cell.metadata) : null
            };
        }
        return { id: Number(cell) || 0, kind: null, metadata: null };
    }

    normalizeComparableIdByKind(id, kind) {
        const numId = Number(id) || 0;
        if (kind === ITEM_STACK_KIND_ITEM) return normalizeLegacyRuntimeItemId(numId);
        if (kind === ITEM_STACK_KIND_BLOCK) return fromBetaCompatibleBlockId(numId);
        return numId;
    }

    stackMatchesRecipeCell(stack, req) {
        if (!stack && !req) return true;
        if (!stack || !req) return false;
        const effectiveKind = req.kind || stack.kind || null;
        const stackId = this.normalizeComparableIdByKind(stack.id, effectiveKind);
        const reqId = this.normalizeComparableIdByKind(req.id, effectiveKind);
        if (stackId !== reqId) return false;
        if (req.kind && stack.kind !== req.kind) return false;
        if (req.metadata !== null && stack.metadata !== req.metadata) return false;
        return true;
    }

    matchesRecipeStacks(inputGrid, inputW, recipeGrid, recipeW) {
        const inputShape = this.extractShape(inputGrid, inputW);
        const recipeShape = this.extractShape(recipeGrid, recipeW);
        if (inputShape.rows !== recipeShape.rows || inputShape.cols !== recipeShape.cols) return false;
        const matchesWith = (candidate) => {
            for (let i = 0; i < inputShape.data.length; i++) {
                const stack = inputShape.data[i]
                    ? { id: inputShape.data[i].id, kind: inputShape.data[i].kind, metadata: normalizeItemMetadata(inputShape.data[i].metadata) }
                    : null;
                const req = this.normalizeRecipeCell(candidate[i]);
                if (!this.stackMatchesRecipeCell(stack, req)) return false;
            }
            return true;
        };
        if (matchesWith(recipeShape.data)) return true;
        const mirrored = this.mirrorShapedArray(recipeShape.data, recipeShape.cols);
        return matchesWith(mirrored);
    }

    shapedArraysEqual(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    mirrorShapedArray(data, cols) {
        if (!Array.isArray(data) || cols <= 0) return [];
        const rows = Math.floor(data.length / cols);
        const out = new Array(data.length);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const src = y * cols + x;
                const dst = y * cols + (cols - 1 - x);
                out[dst] = data[src];
            }
        }
        return out;
    }

    extractShape(grid, w) {
        const h = grid.length / w;
        let minX = w, maxX = -1, minY = h, maxY = -1;
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (grid[y * w + x] !== 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        
        if (maxX === -1) return { rows: 0, cols: 0, data: [] }; // Empty
        
        const rows = maxY - minY + 1;
        const cols = maxX - minX + 1;
        const data = [];
        
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                data.push(grid[y * w + x]);
            }
        }
        
        return { rows, cols, data };
    }
    
    closeContainer() {
        const grid = (this.activeContainerType === 'CRAFTING_TABLE') ? this.crafting3x3 : this.crafting2x2;
        for (let i=0; i<grid.length; i++) {
            if (grid[i]) {
                this.addItem(grid[i].id, grid[i].count, grid[i].durability, grid[i].metadata, grid[i].kind);
                grid[i] = null;
            }
        }
        this.craftingOutput = null;
        this.activeContainerType = 'INVENTORY';
        this.activeTileEntity = null;
    }
}

export const inventory = new Inventory();
