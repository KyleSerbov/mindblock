import * as THREE from 'three';
import { BLOCKS, getFireAnimationCanvas } from './world.js';
import { isBlockOpaque, isNetherrackId } from './blocks.js';
import {
    WOOL_WHITE_ITEM_ID,
    EGG_ITEM_ID,
    WHEAT_ITEM_ID,
    RAW_PORKCHOP_ITEM_ID,
    COOKED_PORKCHOP_ITEM_ID,
    RAW_FISH_ITEM_ID,
    COOKED_FISH_ITEM_ID,
    RAW_CHICKEN_ITEM_ID,
    COOKED_CHICKEN_ITEM_ID,
    SEEDS_ITEM_ID,
    LEATHER_ITEM_ID,
    INK_SAC_ITEM_ID,
    SLIMEBALL_ITEM_ID,
} from './inventory.js';
import { CHUNK_SIZE, WORLD_DEPTH, WORLD_HEIGHT } from './constants.js';
import { isWaterId, isLavaId } from './fluidIds.js';
import { FIRE_PLANE_HEIGHT, FIRE_PLANE_WIDTH } from './flatEntityRenderConfig.js';
import {
    BetaLightCache,
    betaIdOfRuntime,
    isBetaNormalCube,
    isBetaLiquid,
    isBetaWater,
    appendBetaCollisionBoxes,
    aabbIntersects,
    findBetaPath,
    BETA_GRASS_ID,
    OVERWORLD_BRIGHTNESS,
    NETHER_BRIGHTNESS
} from './betaSpawnRules.js';

const PIG_MAX_COUNT = 10;
const MIN_PLAYER_SPAWN_DIST = 24;
// Beta 1.7.3 natural spawning (SpawnerAnimals, EnumCreatureType, BiomeGenBase spawn lists).
const BETA_SPAWN_CHUNK_RADIUS = 8; // 17x17 chunks around the player
const BETA_CREATURE_KINDS = ['monster', 'creature', 'water'];
const BETA_KIND_CAPS = { monster: 70, creature: 15, water: 5 };
const BETA_MONSTERS = [['spider', 10], ['zombie', 10], ['skeleton', 10], ['creeper', 10], ['slime', 10]];
const BETA_CREATURES = [['sheep', 12], ['pig', 10], ['chicken', 10], ['cow', 8]];
const BETA_FOREST_CREATURES = [...BETA_CREATURES, ['wolf', 2]]; // Forest and Taiga
const BETA_WATER_CREATURES = [['squid', 10]];
const BETA_HELL_MONSTERS = [['ghast', 10], ['zombie_pigman', 10]];
const BETA_NIGHT_SPAWN_TYPES = ['spider', 'zombie', 'skeleton'];
// Entity.setSize(width, height) per mob.
const BETA_ENTITY_SIZE = {
    pig: [0.9, 0.9], sheep: [0.9, 1.3], cow: [0.9, 1.3], chicken: [0.3, 0.4], wolf: [0.8, 0.8],
    squid: [0.95, 0.95], creeper: [0.6, 1.8], zombie: [0.6, 1.8], skeleton: [0.6, 1.8],
    spider: [1.4, 0.9], zombie_pigman: [0.6, 1.8], ghast: [4.0, 4.0], giant: [3.6, 10.8]
};
const BETA_ENTITY_MOB_TYPES = new Set(['creeper', 'zombie', 'spider', 'skeleton', 'zombie_pigman']);
const BETA_NON_AGING_TYPES = new Set(['squid', 'slime', 'ghast']);
// Spawner metadata holds WorldGenDungeons.pickMobSpawner + 1; 0 is TileEntityMobSpawner's default "Pig".
const BETA_SPAWNER_MOB_BY_META = [null, 'skeleton', 'zombie', 'zombie', 'spider'];
const BETA_BED_HEAD_OFFSETS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const BETA_LIGHT_NEIGHBOURS = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const BETA_SPIDER_MOUNTED_Y_OFFSET = 0.9 * 0.75 - 0.5; // EntitySpider.getMountedYOffset
const MOB_SPAWNER_BLOCK_ID = 52;
const PIG_SPEED = 1.0;
const PIG_RADIUS = 0.45;
const PIG_HEIGHT = 0.9;
const PIG_VISUAL_SCALE = 1.03;
const PIG_AI_DECISION_MIN = 2.4;
const PIG_AI_DECISION_MAX = 4.8;
const PIG_TURN_RATE = 1.55;
const PIG_TURN_BLOCKED = 1.1;
const PIG_LEG_PHASE_RATE = 6.8;
const PIG_LEG_SWING_AMP = 0.52;
const PIG_HEAD_IDLE_AMP = 0.04;
const CHICKEN_MAX_COUNT = 12;
const CHICKEN_SPEED = 0.85;
const CHICKEN_RADIUS = 0.28;
const CHICKEN_HEIGHT = 0.75;
const CHICKEN_AI_DECISION_MIN = 1.8;
const CHICKEN_AI_DECISION_MAX = 3.8;
const CHICKEN_TURN_RATE = 2.0;
const CHICKEN_TURN_BLOCKED = 0.95;
const CHICKEN_LEG_PHASE_RATE = 8.2;
const CHICKEN_LEG_SWING_AMP = 0.35;
const CHICKEN_WING_BASE_RATE = 4.8;
const CHICKEN_WING_MOVE_RATE = 5.0;
const CHICKEN_WING_SWING_AMP = 0.22;
const CHICKEN_HEAD_IDLE_AMP = 0.055;
const CHICKEN_EGG_MIN_TICKS = 6000;
const CHICKEN_EGG_RANGE_TICKS = 6000;
const CHICKEN_BABY_AGE_TICKS = -24000;
const CHICKEN_BABY_SCALE = 0.5;
const PASSIVE_BABY_SCALE = 0.5;
const PASSIVE_BABY_AGE_TICKS = -24000;
const CHICKEN_LOVE_DURATION_TICKS = 600;
const CHICKEN_BREED_COOLDOWN_TICKS = 6000;
const TICKS_PER_SECOND = 20;
const SHEEP_MAX_COUNT = 10;
const SHEEP_SPEED = 0.92;
const SQUID_MAX_COUNT = 8;
const SQUID_SPEED = 0.7;
const WOLF_MAX_COUNT = 8;
const WOLF_SPEED = 0.98;
const COW_MAX_COUNT = 8;
const COW_SPEED = 0.95;
const CREEPER_MAX_COUNT = 8;
const CREEPER_SPEED = 0.95;
const CREEPER_FUSE_SECONDS = 1.5;
const CREEPER_TRIGGER_DIST = 3.0;
const CREEPER_CHASE_STOP_DIST = 2.0;
const CREEPER_DEESCALATE_DIST = 7.0;
const CREEPER_BLAST_RADIUS = 3.0;
const ZOMBIE_MAX_COUNT = 10;
const ZOMBIE_SPEED = 0.95;
const ZOMBIE_RADIUS = 0.30;
const ZOMBIE_HEIGHT = 1.8;
const GIANT_RADIUS = ZOMBIE_RADIUS * 6.0;
const GIANT_HEIGHT = ZOMBIE_HEIGHT * 6.0;
const GIANT_SCALE = 6.0;
const GIANT_HEALTH = 200;
const GIANT_ATTACK_DAMAGE = 50;
const GIANT_MOVE_MULT = 0.6;
const ZOMBIE_AI_DECISION_MIN = 1.8;
const ZOMBIE_AI_DECISION_MAX = 3.8;
const ZOMBIE_TURN_RATE = 1.7;
const ZOMBIE_TURN_BLOCKED = 1.0;
const ZOMBIE_LEG_PHASE_RATE = 6.8;
const ZOMBIE_LEG_SWING_AMP = 0.52;
const SPIDER_MAX_COUNT = 8;
const SPIDER_SPEED = 1.05;
const SPIDER_RADIUS = 0.7;
const SPIDER_HEIGHT = 0.9;
const SPIDER_AI_DECISION_MIN = 1.4;
const SPIDER_AI_DECISION_MAX = 3.0;
const SPIDER_TURN_RATE = 1.95;
const SPIDER_TURN_BLOCKED = 1.2;
const SPIDER_LEG_PHASE_RATE = 8.5;
const SPIDER_LEG_SWING_AMP = 0.35;
const SKELETON_MAX_COUNT = 10;
const SKELETON_SPEED = 0.93;
const SKELETON_RADIUS = 0.3;
const SKELETON_HEIGHT = 1.8;
const SKELETON_AI_DECISION_MIN = 1.8;
const SKELETON_AI_DECISION_MAX = 3.6;
const SKELETON_TURN_RATE = 1.8;
const SKELETON_TURN_BLOCKED = 1.0;
const SKELETON_LEG_PHASE_RATE = 6.8;
const SKELETON_LEG_SWING_AMP = 0.52;
const ARROW_GRAVITY_PER_TICK = 0.03;
const ARROW_DRAG_AIR_PER_TICK = 0.99;
const ARROW_DRAG_WATER_PER_TICK = 0.8;
const SNOWBALL_GRAVITY_PER_TICK = 0.03;
const SNOWBALL_DRAG_AIR_PER_TICK = 0.99;
const PLAYER_SNOWBALL_LIFETIME = 8.0;
const SKELETON_ARROW_LIFETIME = 20.0;
const SKELETON_ARROW_PLAYER_HIT_RADIUS = 0.95;
const ZOMBIE_PIGMAN_MAX_COUNT = 35;
const ZOMBIE_PIGMAN_SPEED_CALM = 0.5;
const ZOMBIE_PIGMAN_SPEED_ANGRY = 0.95;
const ZOMBIE_PIGMAN_RADIUS = 0.30;
const ZOMBIE_PIGMAN_HEIGHT = 1.8;
const ZOMBIE_PIGMAN_AI_DECISION_MIN = 1.8;
const ZOMBIE_PIGMAN_AI_DECISION_MAX = 3.8;
const ZOMBIE_PIGMAN_TURN_RATE = 1.7;
const ZOMBIE_PIGMAN_TURN_BLOCKED = 1.0;
const ZOMBIE_PIGMAN_LEG_PHASE_RATE = 6.8;
const ZOMBIE_PIGMAN_LEG_SWING_AMP = 0.52;
const ZOMBIE_PIGMAN_ANGER_MIN = 20.0; // 400 ticks
const ZOMBIE_PIGMAN_ANGER_MAX = 40.0; // 800 ticks
const ZOMBIE_PIGMAN_PACK_AGGRO_RADIUS = 32.0;
const SLIME_MAX_COUNT = 8;
const SLIME_SPEED = 0.8;
const SLIME_TURN_RATE = 1.4;
const SLIME_TURN_BLOCKED = 1.0;
const SLIME_JUMP_MIN = 0.7;
const SLIME_JUMP_MAX = 1.6;
const GHAST_MAX_COUNT = 4;
const GHAST_SPEED = 2.4;
const GHAST_RADIUS = 2.0;
const GHAST_HEIGHT = 4.0;
const GHAST_AI_DECISION_MIN = 1.2;
const GHAST_AI_DECISION_MAX = 2.8;
const GHAST_FIREBALL_SPEED = 16.0;
const GHAST_FIREBALL_LIFETIME = 5.0;
const GHAST_FIREBALL_PLAYER_HIT_RADIUS = 0.95;
const GHAST_FIREBALL_BLAST_RADIUS = 1.2;
const PLAYER_MELEE_FEET_OFFSET = 1.62;
const PLAYER_MELEE_HITBOX_HEIGHT = 1.8;
const MOB_STEP_HEIGHT = 0.5;
const SHEEP_RADIUS = 0.45; // Jacobo EntitySheep width = 0.9F
const SHEEP_HEIGHT = 1.3;  // Jacobo EntitySheep height = 1.3F
const SHEEP_VISUAL_SCALE = 1.45;
const COW_RADIUS = 0.45;
const COW_HEIGHT = 1.3;
const COW_VISUAL_SCALE = 1.0;
const SHEEP_AI_DECISION_MIN = 2.6;
const SHEEP_AI_DECISION_MAX = 5.0;
const SHEEP_TURN_RATE = 1.45;
const SHEEP_TURN_BLOCKED = 1.0;
const SHEEP_LEG_PHASE_RATE = 6.6;
const SHEEP_LEG_SWING_AMP = 0.5;
const SHEEP_HEAD_IDLE_AMP = 0.04;
const SHEEP_WOLF_THREAT_RADIUS = 9.0;
const SHEEP_WOLF_THREAT_Y_RANGE = 2.5;
const SHEEP_WOLF_FLEE_TIMER_MIN = 1.4;
const COW_AI_DECISION_MIN = 2.5;
const COW_AI_DECISION_MAX = 4.8;
const COW_TURN_RATE = 1.5;
const COW_TURN_BLOCKED = 1.0;
const COW_LEG_PHASE_RATE = 6.4;
const COW_LEG_SWING_AMP = 0.48;
const COW_HEAD_IDLE_AMP = 0.035;
const CREEPER_RADIUS = 0.35;
const CREEPER_HEIGHT = 1.7;
const CREEPER_AI_DECISION_MIN = 1.8;
const CREEPER_AI_DECISION_MAX = 3.8;
const CREEPER_TURN_RATE = 1.65;
const CREEPER_TURN_BLOCKED = 1.0;
const CREEPER_LEG_PHASE_RATE = 6.8;
const CREEPER_LEG_SWING_AMP = 0.5;
const PASSIVE_PANIC_TIMER_SECONDS = 1.8;
const SQUID_RADIUS = 0.45;
const SQUID_HEIGHT = 0.8;
const SQUID_AI_DECISION_MIN = 2.0;
const SQUID_AI_DECISION_MAX = 4.5;
const SQUID_TENTACLE_RATE = 7.5;
const SQUID_TENTACLE_SWING_AMP = 0.55;
const WOLF_RADIUS = 0.4;
const WOLF_HEIGHT = 0.8;
const WOLF_HEALTH_WILD = 8;
const WOLF_HEALTH_TAMED = 20;
const WOLF_AI_DECISION_MIN = 2.0;
const WOLF_AI_DECISION_MAX = 4.2;
const WOLF_TURN_RATE = 1.8;
const WOLF_TURN_BLOCKED = 1.1;
const PLAYER_OWNER_ID = 'player';
const WOLF_LEG_PHASE_RATE = 7.2;
const WOLF_LEG_SWING_AMP = 0.52;
const WOLF_HEAD_IDLE_AMP = 0.04;
const MOB_FULL_BLOCK_JUMP_VEL = 7.6;
const FIRE_BURN_TIME_SECONDS = 15.0;   // Jacobo fire sets fire ticks ~300
const LAVA_BURN_TIME_SECONDS = 30.0;   // Jacobo lava sets fire ticks ~600
const BURN_DAMAGE_INTERVAL = 1.0;      // Jacobo: 1 damage each 20 ticks
const GRAVITY = 24.0;
const PLAYER_FIRE_ALPHA_BASE = 0.9;
const PLAYER_FIRE_PLANE_COUNT = 42;
const SHEEP_FLEECE_COLORS = [
    [1.0, 1.0, 1.0],     // white
    [0.95, 0.7, 0.2],    // orange
    [0.9, 0.5, 0.85],    // magenta
    [0.6, 0.7, 0.95],    // light blue
    [0.9, 0.9, 0.2],     // yellow
    [0.5, 0.8, 0.1],     // lime
    [0.95, 0.7, 0.8],    // pink
    [0.3, 0.3, 0.3],     // gray
    [0.6, 0.6, 0.6],     // light gray
    [0.3, 0.6, 0.7],     // cyan
    [0.7, 0.4, 0.9],     // purple
    [0.2, 0.4, 0.8],     // blue
    [0.5, 0.4, 0.3],     // brown
    [0.4, 0.5, 0.2],     // green
    [0.8, 0.3, 0.3],     // red
    [0.1, 0.1, 0.1]      // black
];
const PIG_FIRE_SURFACE_PARTS = [
    { cx: 0.0, cy: 0.95, cz: -0.55, hx: 0.24, hy: 0.2, hz: 0.24 }, // head
    { cx: 0.0, cy: 0.95, cz: 0.0, hx: 0.32, hy: 0.22, hz: 0.5 },    // body
    { cx: -0.19, cy: 0.35, cz: 0.34, hx: 0.09, hy: 0.18, hz: 0.09 },// leg
    { cx: 0.19, cy: 0.35, cz: 0.34, hx: 0.09, hy: 0.18, hz: 0.09 }, // leg
    { cx: -0.19, cy: 0.35, cz: -0.34, hx: 0.09, hy: 0.18, hz: 0.09 },// leg
    { cx: 0.19, cy: 0.35, cz: -0.34, hx: 0.09, hy: 0.18, hz: 0.09 } // leg
];
const CHICKEN_FIRE_SURFACE_PARTS = [
    { cx: 0.0, cy: 1.0, cz: -0.28, hx: 0.13, hy: 0.18, hz: 0.1 },   // head
    { cx: 0.0, cy: 0.62, cz: 0.0, hx: 0.19, hy: 0.25, hz: 0.19 },   // body
    { cx: -0.08, cy: 0.25, cz: 0.0, hx: 0.06, hy: 0.14, hz: 0.06 }, // leg
    { cx: 0.08, cy: 0.25, cz: 0.0, hx: 0.06, hy: 0.14, hz: 0.06 },  // leg
    { cx: -0.22, cy: 0.62, cz: 0.0, hx: 0.05, hy: 0.12, hz: 0.17 }, // wing
    { cx: 0.22, cy: 0.62, cz: 0.0, hx: 0.05, hy: 0.12, hz: 0.17 }   // wing
];
const SHEEP_FIRE_SURFACE_PARTS = [
    { cx: 0.0, cy: 1.05, cz: -0.58, hx: 0.24, hy: 0.2, hz: 0.24 }, // head
    { cx: 0.0, cy: 0.95, cz: 0.0, hx: 0.33, hy: 0.23, hz: 0.46 },  // body
    { cx: -0.19, cy: 0.36, cz: 0.34, hx: 0.1, hy: 0.2, hz: 0.1 },  // leg
    { cx: 0.19, cy: 0.36, cz: 0.34, hx: 0.1, hy: 0.2, hz: 0.1 },   // leg
    { cx: -0.19, cy: 0.36, cz: -0.34, hx: 0.1, hy: 0.2, hz: 0.1 }, // leg
    { cx: 0.19, cy: 0.36, cz: -0.34, hx: 0.1, hy: 0.2, hz: 0.1 }   // leg
];
const COW_FIRE_SURFACE_PARTS = [
    { cx: 0.0, cy: 1.0, cz: -0.58, hx: 0.24, hy: 0.2, hz: 0.22 }, // head
    { cx: 0.0, cy: 1.0, cz: 0.02, hx: 0.38, hy: 0.24, hz: 0.56 }, // body
    { cx: -0.22, cy: 0.4, cz: 0.38, hx: 0.1, hy: 0.24, hz: 0.1 }, // leg
    { cx: 0.22, cy: 0.4, cz: 0.38, hx: 0.1, hy: 0.24, hz: 0.1 },  // leg
    { cx: -0.22, cy: 0.4, cz: -0.34, hx: 0.1, hy: 0.24, hz: 0.1 },// leg
    { cx: 0.22, cy: 0.4, cz: -0.34, hx: 0.1, hy: 0.24, hz: 0.1 }  // leg
];
const CREEPER_FIRE_SURFACE_PARTS = [
    { cx: 0.0, cy: 1.35, cz: 0.0, hx: 0.24, hy: 0.24, hz: 0.24 }, // head
    { cx: 0.0, cy: 0.85, cz: 0.0, hx: 0.24, hy: 0.36, hz: 0.14 }, // body
    { cx: -0.12, cy: 0.25, cz: 0.12, hx: 0.08, hy: 0.18, hz: 0.08 }, // leg
    { cx: 0.12, cy: 0.25, cz: 0.12, hx: 0.08, hy: 0.18, hz: 0.08 },  // leg
    { cx: -0.12, cy: 0.25, cz: -0.12, hx: 0.08, hy: 0.18, hz: 0.08 },// leg
    { cx: 0.12, cy: 0.25, cz: -0.12, hx: 0.08, hy: 0.18, hz: 0.08 }  // leg
];
const SQUID_FIRE_SURFACE_PARTS = [
    { cx: 0.0, cy: 0.8, cz: 0.0, hx: 0.32, hy: 0.24, hz: 0.32 },
    { cx: -0.18, cy: 0.2, cz: -0.18, hx: 0.07, hy: 0.2, hz: 0.07 },
    { cx: 0.18, cy: 0.2, cz: -0.18, hx: 0.07, hy: 0.2, hz: 0.07 },
    { cx: -0.18, cy: 0.2, cz: 0.18, hx: 0.07, hy: 0.2, hz: 0.07 },
    { cx: 0.18, cy: 0.2, cz: 0.18, hx: 0.07, hy: 0.2, hz: 0.07 }
];
const WOLF_FIRE_SURFACE_PARTS = [
    { cx: 0.0, cy: 0.65, cz: -0.46, hx: 0.2, hy: 0.16, hz: 0.2 },
    { cx: 0.0, cy: 0.62, cz: 0.05, hx: 0.28, hy: 0.18, hz: 0.45 },
    { cx: -0.16, cy: 0.2, cz: 0.3, hx: 0.08, hy: 0.18, hz: 0.08 },
    { cx: 0.16, cy: 0.2, cz: 0.3, hx: 0.08, hy: 0.18, hz: 0.08 },
    { cx: -0.16, cy: 0.2, cz: -0.22, hx: 0.08, hy: 0.18, hz: 0.08 },
    { cx: 0.16, cy: 0.2, cz: -0.22, hx: 0.08, hy: 0.18, hz: 0.08 }
];

function randInt(n) {
    return Math.floor(Math.random() * n);
}

function distSq3(ax, ay, az, bx, by, bz) {
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
}

// SpawnerAnimals: weighted pick from a biome spawn list.
function pickBetaSpawnEntry(list) {
    let total = 0;
    for (const [, w] of list) total += w;
    let roll = randInt(total);
    for (const [type, w] of list) {
        roll -= w;
        if (roll < 0) return type;
    }
    return list[0][0];
}

function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
}

function yawDelta(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    const twoPi = Math.PI * 2;
    let d = (b - a) % twoPi;
    if (d > Math.PI) d -= twoPi;
    if (d < -Math.PI) d += twoPi;
    return Number.isFinite(d) ? d : 0;
}

function randomGaussian() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function createJacoboArrowVelocity(dx, dy, dz, speedPerTick, inaccuracy) {
    const len = Math.hypot(dx, dy, dz) || 1.0;
    let x = dx / len;
    let y = dy / len;
    let z = dz / len;
    const spread = 0.007499999832361937 * inaccuracy;
    x += randomGaussian() * spread;
    y += randomGaussian() * spread;
    z += randomGaussian() * spread;
    return new THREE.Vector3(x * speedPerTick, y * speedPerTick, z * speedPerTick);
}

function buildArrowPlaneGeometryFromPixels(width, height, pxU0, pxV0Top, pxU1, pxV1Top, texW = 32, texH = 32) {
    const u0 = pxU0 / texW;
    const u1 = pxU1 / texW;
    // Convert top-origin pixel rect to Three.js UV space (v=0 at bottom).
    const v0 = 1 - (pxV1Top / texH);
    const v1 = 1 - (pxV0Top / texH);
    const g = new THREE.PlaneGeometry(width, height);
    const uv = g.attributes.uv;
    // PlaneGeometry order: bl, br, tl, tr for default orientation.
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    return g;
}

function distancePointToSegmentSq(px, py, pz, ax, ay, az, bx, by, bz) {
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const apx = px - ax;
    const apy = py - ay;
    const apz = pz - az;
    const abLenSq = abx * abx + aby * aby + abz * abz;
    if (abLenSq < 1e-8) {
        const dx = px - ax;
        const dy = py - ay;
        const dz = pz - az;
        return dx * dx + dy * dy + dz * dz;
    }
    let t = (apx * abx + apy * aby + apz * abz) / abLenSq;
    t = clamp(t, 0, 1);
    const qx = ax + abx * t;
    const qy = ay + aby * t;
    const qz = az + abz * t;
    const dx = px - qx;
    const dy = py - qy;
    const dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
}

function segmentIntersectsAabb(ax, ay, az, bx, by, bz, minX, minY, minZ, maxX, maxY, maxZ) {
    let tMin = 0.0;
    let tMax = 1.0;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const slab = (p, d, minB, maxB) => {
        if (Math.abs(d) < 1e-9) return p >= minB && p <= maxB;
        const inv = 1.0 / d;
        let t0 = (minB - p) * inv;
        let t1 = (maxB - p) * inv;
        if (t0 > t1) {
            const tmp = t0;
            t0 = t1;
            t1 = tmp;
        }
        tMin = Math.max(tMin, t0);
        tMax = Math.min(tMax, t1);
        return tMax >= tMin;
    };
    if (!slab(ax, dx, minX, maxX)) return false;
    if (!slab(ay, dy, minY, maxY)) return false;
    if (!slab(az, dz, minZ, maxZ)) return false;
    return true;
}

function getArrowBlockCollisionAabb(blockId, bx, by, bz) {
    if (!blockId || blockId === 0) return null;
    if (isWaterId(blockId) || isLavaId(blockId) || blockId === 90) return null;
    // Snow layer in Beta is 1/8 block tall.
    if (blockId === 78) {
        return {
            minX: bx - 0.5,
            minY: by - 0.5,
            minZ: bz - 0.5,
            maxX: bx + 0.5,
            maxY: by - 0.5 + 0.125,
            maxZ: bz + 0.5
        };
    }
    const hitsSolidLike = !isWaterId(blockId) && !isLavaId(blockId) && blockId !== 90;
    if (!(hitsSolidLike || isBlockOpaque(blockId))) return null;
    return {
        minX: bx - 0.5,
        minY: by - 0.5,
        minZ: bz - 0.5,
        maxX: bx + 0.5,
        maxY: by + 0.5,
        maxZ: bz + 0.5
    };
}

function worldToBlock(v) {
    return Math.floor(v + 0.5);
}

function getRandomFleeceColor() {
    // Jacobo EntitySheep.getRandomFleeceColor parity.
    const r = Math.floor(Math.random() * 100);
    if (r < 5) return 15;
    if (r < 10) return 7;
    if (r < 15) return 8;
    if (r < 18) return 12;
    return (Math.floor(Math.random() * 500) === 0) ? 6 : 0;
}

function randomChickenEggTicks() {
    // Jacobo EntityChicken: rand.nextInt(6000) + 6000
    return CHICKEN_EGG_MIN_TICKS + Math.floor(Math.random() * CHICKEN_EGG_RANGE_TICKS);
}

const BLOCK_DEF_BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));

function isSolidBlock(id) {
    if (!id || id === 0) return false;
    const def = BLOCK_DEF_BY_ID.get(id);
    if (!def) return false;
    if (def.type === 'cross' || def.type === 'torch' || def.type === 'fire') return false;
    if (def.transparent) return false;
    return isBlockOpaque(id);
}

function makeSkinnedBoxGeometry(width, height, depth, faces, texW = 64, texH = 32) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const uv = geometry.attributes.uv;
    const setFace = (faceIndex, rect) => {
        if (!rect) return;
        let [u0, v0, u1, v1] = rect;
        // Small texel-safe inset to prevent edge bleeding without collapsing tiny UV islands.
        const du = Math.abs(u1 - u0);
        const dv = Math.abs(v1 - v0);
        const insetU = Math.min(0.05, du * 0.25);
        const insetV = Math.min(0.05, dv * 0.25);
        if (u1 > u0) { u0 += insetU; u1 -= insetU; } else { u0 -= insetU; u1 += insetU; }
        if (v1 > v0) { v0 += insetV; v1 -= insetV; } else { v0 -= insetV; v1 += insetV; }
        const x0 = u0 / texW;
        const y0 = 1 - (v0 / texH);
        const x1 = u1 / texW;
        const y1 = 1 - (v1 / texH);
        const o = faceIndex * 8;
        uv.array[o + 0] = x1; uv.array[o + 1] = y0;
        uv.array[o + 2] = x0; uv.array[o + 3] = y0;
        uv.array[o + 4] = x1; uv.array[o + 5] = y1;
        uv.array[o + 6] = x0; uv.array[o + 7] = y1;
    };
    // +X, -X, +Y, -Y, +Z, -Z ; front maps to -Z for our local orientation.
    setFace(0, faces.right);
    setFace(1, faces.left);
    setFace(2, faces.top);
    setFace(3, faces.bottom);
    setFace(4, faces.back);
    setFace(5, faces.front);
    uv.needsUpdate = true;
    return geometry;
}

function makeMcBoxGeometry(pxW, pxH, pxD, texU, texV, texW = 64, texH = 32, inflatePx = 0) {
    const d = pxD;
    const w = pxW;
    const h = pxH;
    const left = [texU, texV + d, texU + d, texV + d + h];
    const front = [texU + d, texV + d, texU + d + w, texV + d + h];
    const right = [texU + d + w, texV + d, texU + d + w + d, texV + d + h];
    const back = [texU + d + w + d, texV + d, texU + d + w + d + w, texV + d + h];
    const top = [texU + d, texV, texU + d + w, texV + d];
    const bottom = [texU + d + w, texV, texU + d + w + w, texV + d];

    const iw = (pxW + inflatePx * 2) / 16;
    const ih = (pxH + inflatePx * 2) / 16;
    const id = (pxD + inflatePx * 2) / 16;
    return makeSkinnedBoxGeometry(iw, ih, id, { right, left, top, bottom, front, back }, texW, texH);
}

export class MobManager {
    constructor(scene, chunkManager, options = {}) {
        this.scene = scene;
        this.chunkManager = chunkManager;
        this.spawnDrop = typeof options.spawnDrop === 'function' ? options.spawnDrop : null;
        this.setBlock = typeof options.setBlock === 'function' ? options.setBlock : null;
        this.explodeAt = typeof options.explodeAt === 'function' ? options.explodeAt : null;
        this.isChunkRenderable = typeof options.isChunkRenderable === 'function' ? options.isChunkRenderable : null;
        this.getDaylightFactor = typeof options.getDaylightFactor === 'function' ? options.getDaylightFactor : null;
        this.getDimension = typeof options.getDimension === 'function' ? options.getDimension : null;
        this.getBiomeAt = typeof options.getBiomeAt === 'function' ? options.getBiomeAt : null;
        this.isSlimeChunk = typeof options.isSlimeChunk === 'function' ? options.isSlimeChunk : null;
        this.damagePlayer = typeof options.damagePlayer === 'function' ? options.damagePlayer : null;
        this.addItemToInventory = typeof options.addItemToInventory === 'function' ? options.addItemToInventory : null;
        this.playBowSound = typeof options.playBowSound === 'function' ? options.playBowSound : null;
        this.getSkylightSubtracted = typeof options.getSkylightSubtracted === 'function' ? options.getSkylightSubtracted : null;
        this.getIsThundering = typeof options.getIsThundering === 'function' ? options.getIsThundering : null;
        this.getDifficulty = typeof options.getDifficulty === 'function' ? options.getDifficulty : null;
        this.getWorldSpawnPoint = typeof options.getWorldSpawnPoint === 'function' ? options.getWorldSpawnPoint : null;
        this.betaLight = new BetaLightCache(chunkManager);
        this.betaChunkCache = new Map();
        this.betaBiomeCache = new Map();
        this.betaSpawners = new Map();
        this.betaSpawnerScan = new WeakMap();
        this.betaTicksThisUpdate = 0;
        this.pigs = [];
        this.chickens = [];
        this.sheep = [];
        this.cows = [];
        this.creepers = [];
        this.zombies = [];
        this.spiders = [];
        this.skeletons = [];
        this.zombiePigmen = [];
        this.slimes = [];
        this.ghasts = [];
        this.skeletonArrows = [];
        this.playerSnowballs = [];
        this.playerEggs = [];
        this.ghastFireballs = [];
        this.squids = [];
        this.wolves = [];
        this.spawnTickAccumulator = 0;
        this.tmpVec = new THREE.Vector3();
        this.tmpAxisY = new THREE.Vector3(0, 1, 0);
        this.tmpSurfaceNormal = new THREE.Vector3();
        this.tmpFireQuat = new THREE.Quaternion();
        this.tmpFireAxis = new THREE.Vector3();
        this.tmpCandidate = new THREE.Vector3();
        this.tmpBestCandidate = new THREE.Vector3();
        this.tmpArrowDir = new THREE.Vector3();
        this.tmpArrowQuat = new THREE.Quaternion();
        this.tmpArrowShakeQuat = new THREE.Quaternion();
        this.tmpArrowForwardAxis = new THREE.Vector3(1, 0, 0);
        this.tmpArrowRenderPos = new THREE.Vector3();
        this.lastPlayerPos = null;
        this.mobFireMaterial = null;
        this.pigTexture = new THREE.TextureLoader().load('assets/textures/mob/pig.png');
        this.pigTexture.colorSpace = THREE.SRGBColorSpace;
        this.pigTexture.magFilter = THREE.NearestFilter;
        this.pigTexture.minFilter = THREE.NearestFilter;
        this.pigTexture.generateMipmaps = false;
        this.pigMaterial = new THREE.MeshLambertMaterial({ map: this.pigTexture });
        this.chickenTexture = new THREE.TextureLoader().load('assets/textures/mob/chicken.png');
        this.chickenTexture.colorSpace = THREE.SRGBColorSpace;
        this.chickenTexture.magFilter = THREE.NearestFilter;
        this.chickenTexture.minFilter = THREE.NearestFilter;
        this.chickenTexture.generateMipmaps = false;
        this.chickenMaterial = new THREE.MeshLambertMaterial({
            map: this.chickenTexture,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        this.sheepTexture = new THREE.TextureLoader().load('assets/textures/mob/sheep.png');
        this.sheepTexture.colorSpace = THREE.SRGBColorSpace;
        this.sheepTexture.magFilter = THREE.NearestFilter;
        this.sheepTexture.minFilter = THREE.NearestFilter;
        this.sheepTexture.generateMipmaps = false;
        this.sheepMaterial = new THREE.MeshLambertMaterial({ map: this.sheepTexture });
        this.sheepFurTexture = new THREE.TextureLoader().load('assets/textures/mob/sheep_fur.png');
        this.sheepFurTexture.colorSpace = THREE.SRGBColorSpace;
        this.sheepFurTexture.magFilter = THREE.NearestFilter;
        this.sheepFurTexture.minFilter = THREE.NearestFilter;
        this.sheepFurTexture.generateMipmaps = false;
        this.sheepFurMaterial = new THREE.MeshLambertMaterial({ map: this.sheepFurTexture });
        this.cowTexture = new THREE.TextureLoader().load('assets/textures/mob/cow.png');
        this.cowTexture.colorSpace = THREE.SRGBColorSpace;
        this.cowTexture.magFilter = THREE.NearestFilter;
        this.cowTexture.minFilter = THREE.NearestFilter;
        this.cowTexture.generateMipmaps = false;
        this.cowMaterial = new THREE.MeshLambertMaterial({
            map: this.cowTexture,
            transparent: true,
            alphaTest: 0.1
        });
        this.creeperTexture = new THREE.TextureLoader().load('assets/textures/mob/creeper.png');
        this.creeperTexture.colorSpace = THREE.SRGBColorSpace;
        this.creeperTexture.magFilter = THREE.NearestFilter;
        this.creeperTexture.minFilter = THREE.NearestFilter;
        this.creeperTexture.generateMipmaps = false;
        this.creeperMaterial = new THREE.MeshLambertMaterial({ map: this.creeperTexture });
        this.zombieTexture = new THREE.TextureLoader().load('assets/textures/mob/zombie.png');
        this.zombieTexture.colorSpace = THREE.SRGBColorSpace;
        this.zombieTexture.magFilter = THREE.NearestFilter;
        this.zombieTexture.minFilter = THREE.NearestFilter;
        this.zombieTexture.generateMipmaps = false;
        this.zombieMaterial = new THREE.MeshLambertMaterial({
            map: this.zombieTexture,
            transparent: true,
            alphaTest: 0.1
        });
        this.spiderTexture = new THREE.TextureLoader().load('assets/textures/mob/spider.png');
        this.spiderTexture.colorSpace = THREE.SRGBColorSpace;
        this.spiderTexture.magFilter = THREE.NearestFilter;
        this.spiderTexture.minFilter = THREE.NearestFilter;
        this.spiderTexture.generateMipmaps = false;
        this.spiderMaterial = new THREE.MeshLambertMaterial({ map: this.spiderTexture, transparent: true, alphaTest: 0.1 });
        this.spiderEyesTexture = new THREE.TextureLoader().load('assets/textures/mob/spider_eyes.png');
        this.spiderEyesTexture.colorSpace = THREE.SRGBColorSpace;
        this.spiderEyesTexture.magFilter = THREE.NearestFilter;
        this.spiderEyesTexture.minFilter = THREE.NearestFilter;
        this.spiderEyesTexture.generateMipmaps = false;
        this.spiderEyesMaterial = new THREE.MeshBasicMaterial({
            map: this.spiderEyesTexture,
            transparent: true,
            alphaTest: 0.1,
            depthWrite: false
        });
        this.skeletonTexture = new THREE.TextureLoader().load('assets/textures/mob/skeleton.png');
        this.skeletonTexture.colorSpace = THREE.SRGBColorSpace;
        this.skeletonTexture.magFilter = THREE.NearestFilter;
        this.skeletonTexture.minFilter = THREE.NearestFilter;
        this.skeletonTexture.generateMipmaps = false;
        this.skeletonMaterial = new THREE.MeshLambertMaterial({
            map: this.skeletonTexture,
            transparent: true,
            alphaTest: 0.1
        });
        this.pigZombieTexture = new THREE.TextureLoader().load('assets/textures/mob/pigzombie.png');
        this.pigZombieTexture.colorSpace = THREE.SRGBColorSpace;
        this.pigZombieTexture.magFilter = THREE.NearestFilter;
        this.pigZombieTexture.minFilter = THREE.NearestFilter;
        this.pigZombieTexture.generateMipmaps = false;
        this.pigZombieMaterial = new THREE.MeshLambertMaterial({
            map: this.pigZombieTexture,
            transparent: true,
            alphaTest: 0.1
        });
        this.arrowTexture = new THREE.TextureLoader().load('assets/textures/item/arrows.png');
        this.arrowTexture.colorSpace = THREE.SRGBColorSpace;
        this.arrowTexture.magFilter = THREE.NearestFilter;
        this.arrowTexture.minFilter = THREE.NearestFilter;
        this.arrowTexture.generateMipmaps = false;
        this.skeletonArrowMaterial = new THREE.MeshBasicMaterial({
            map: this.arrowTexture,
            transparent: true,
            alphaTest: 0.01,
            side: THREE.DoubleSide
        });
        this.snowballTexture = new THREE.TextureLoader().load('assets/textures/snow.png');
        this.snowballTexture.colorSpace = THREE.SRGBColorSpace;
        this.snowballTexture.magFilter = THREE.NearestFilter;
        this.snowballTexture.minFilter = THREE.NearestFilter;
        this.snowballTexture.generateMipmaps = false;
        this.snowballMaterial = new THREE.MeshBasicMaterial({
            map: this.snowballTexture,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide
        });
        this.snowballGeometry = new THREE.PlaneGeometry(0.25, 0.25);
        this.eggTexture = new THREE.TextureLoader().load('assets/textures/egg.png');
        this.eggTexture.colorSpace = THREE.SRGBColorSpace;
        this.eggTexture.magFilter = THREE.NearestFilter;
        this.eggTexture.minFilter = THREE.NearestFilter;
        this.eggTexture.generateMipmaps = false;
        this.eggMaterial = new THREE.MeshBasicMaterial({
            map: this.eggTexture,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        this.eggGeometry = new THREE.PlaneGeometry(0.25, 0.25);
        // RenderArrow UV regions from Jacobo /item/arrows.png (32x32), specified in top-origin pixels.
        // Shaft strip rect: [u0=0, v0=0, u1=16, v1=5]
        // Head/fletch rect:  [u0=0, v0=5, u1=5,  v1=10]
        this.skeletonArrowShaftGeometry = buildArrowPlaneGeometryFromPixels(0.9, 0.225, 0, 0, 16, 5, 32, 32);
        this.skeletonArrowHeadGeometry = buildArrowPlaneGeometryFromPixels(0.225, 0.225, 0, 5, 5, 10, 32, 32);
        this.slimeTexture = new THREE.TextureLoader().load('assets/textures/mob/slime.png');
        this.slimeTexture.colorSpace = THREE.SRGBColorSpace;
        this.slimeTexture.magFilter = THREE.NearestFilter;
        this.slimeTexture.minFilter = THREE.NearestFilter;
        this.slimeTexture.generateMipmaps = false;
        this.slimeInnerMaterial = new THREE.MeshLambertMaterial({ map: this.slimeTexture, transparent: true, alphaTest: 0.05 });
        this.slimeOuterMaterial = new THREE.MeshLambertMaterial({
            map: this.slimeTexture,
            transparent: true,
            opacity: 1,
            depthWrite: false
        });
        this.ghastTexture = new THREE.TextureLoader().load('assets/textures/mob/ghast.png');
        this.ghastTexture.colorSpace = THREE.SRGBColorSpace;
        this.ghastTexture.magFilter = THREE.NearestFilter;
        this.ghastTexture.minFilter = THREE.NearestFilter;
        this.ghastTexture.generateMipmaps = false;
        this.ghastMaterial = new THREE.MeshLambertMaterial({ map: this.ghastTexture, transparent: true, alphaTest: 0.1 });
        this.ghastFireTexture = new THREE.TextureLoader().load('assets/textures/mob/ghast_fire.png');
        this.ghastFireTexture.colorSpace = THREE.SRGBColorSpace;
        this.ghastFireTexture.magFilter = THREE.NearestFilter;
        this.ghastFireTexture.minFilter = THREE.NearestFilter;
        this.ghastFireTexture.generateMipmaps = false;
        this.ghastChargeMaterial = new THREE.MeshLambertMaterial({ map: this.ghastFireTexture, transparent: true, alphaTest: 0.1 });
        this.ghastFireballGeometry = new THREE.BoxGeometry(0.65, 0.65, 0.65);
        this.ghastFireballMaterial = new THREE.MeshLambertMaterial({
            map: this.ghastFireTexture,
            transparent: true,
            alphaTest: 0.1
        });
        this.squidTexture = new THREE.TextureLoader().load('assets/textures/mob/squid.png');
        this.squidTexture.colorSpace = THREE.SRGBColorSpace;
        this.squidTexture.magFilter = THREE.NearestFilter;
        this.squidTexture.minFilter = THREE.NearestFilter;
        this.squidTexture.generateMipmaps = false;
        this.squidMaterial = new THREE.MeshLambertMaterial({ map: this.squidTexture, transparent: true, alphaTest: 0.1 });
        this.wolfTexture = new THREE.TextureLoader().load('assets/textures/mob/wolf.png');
        this.wolfTexture.colorSpace = THREE.SRGBColorSpace;
        this.wolfTexture.magFilter = THREE.NearestFilter;
        this.wolfTexture.minFilter = THREE.NearestFilter;
        this.wolfTexture.generateMipmaps = false;
        this.wolfMaterial = new THREE.MeshLambertMaterial({ map: this.wolfTexture, transparent: true, alphaTest: 0.1 });
        this.wolfTameTexture = new THREE.TextureLoader().load('assets/textures/mob/wolf_tame.png');
        this.wolfTameTexture.colorSpace = THREE.SRGBColorSpace;
        this.wolfTameTexture.magFilter = THREE.NearestFilter;
        this.wolfTameTexture.minFilter = THREE.NearestFilter;
        this.wolfTameTexture.generateMipmaps = false;
        this.wolfTameMaterial = new THREE.MeshLambertMaterial({ map: this.wolfTameTexture, transparent: true, alphaTest: 0.1 });
        this.wolfAngryTexture = new THREE.TextureLoader().load('assets/textures/mob/wolf_angry.png');
        this.wolfAngryTexture.colorSpace = THREE.SRGBColorSpace;
        this.wolfAngryTexture.magFilter = THREE.NearestFilter;
        this.wolfAngryTexture.minFilter = THREE.NearestFilter;
        this.wolfAngryTexture.generateMipmaps = false;
        this.wolfAngryMaterial = new THREE.MeshLambertMaterial({ map: this.wolfAngryTexture, transparent: true, alphaTest: 0.1 });
        this.initMobFireMaterial();
    }

    isMobChunkRenderable(pos) {
        const cx = Math.floor(pos.x / CHUNK_SIZE);
        const cy = Math.floor(pos.y / CHUNK_SIZE);
        const cz = Math.floor(pos.z / CHUNK_SIZE);
        if (this.isChunkRenderable) return !!this.isChunkRenderable(cx, cy, cz);
        return this.chunkManager.hasChunk(cx, cy, cz);
    }

    initMobFireMaterial() {
        const fireTex = new THREE.CanvasTexture(getFireAnimationCanvas());
        fireTex.colorSpace = THREE.SRGBColorSpace;
        fireTex.magFilter = THREE.NearestFilter;
        fireTex.minFilter = THREE.NearestFilter;
        fireTex.generateMipmaps = false;
        fireTex.wrapS = THREE.ClampToEdgeWrapping;
        fireTex.wrapT = THREE.ClampToEdgeWrapping;
        this.mobFireMaterial = new THREE.MeshBasicMaterial({
            map: fireTex,
            transparent: true,
            alphaTest: 0.02,
            depthWrite: false,
            side: THREE.FrontSide,
            opacity: PLAYER_FIRE_ALPHA_BASE
        });
    }

    _getNearestSurfacePointOnAabb(px, py, pz, minX, minY, minZ, maxX, maxY, maxZ, outPoint, outNormal) {
        const dPosX = Math.abs(maxX - px);
        const dNegX = Math.abs(px - minX);
        const dPosY = Math.abs(maxY - py);
        const dNegY = Math.abs(py - minY);
        const dPosZ = Math.abs(maxZ - pz);
        const dNegZ = Math.abs(pz - minZ);

        let face = 0;
        let minD = dPosX;
        if (dNegX < minD) { minD = dNegX; face = 1; }
        if (dPosY < minD) { minD = dPosY; face = 2; }
        if (dNegY < minD) { minD = dNegY; face = 3; }
        if (dPosZ < minD) { minD = dPosZ; face = 4; }
        if (dNegZ < minD) { face = 5; }

        const cy = Math.max(minY, Math.min(maxY, py));
        const cx = Math.max(minX, Math.min(maxX, px));
        const cz = Math.max(minZ, Math.min(maxZ, pz));

        if (face === 0) { outPoint.set(maxX, cy, cz); outNormal.set(1, 0, 0); }
        else if (face === 1) { outPoint.set(minX, cy, cz); outNormal.set(-1, 0, 0); }
        else if (face === 2) { outPoint.set(cx, maxY, cz); outNormal.set(0, 1, 0); }
        else if (face === 3) { outPoint.set(cx, minY, cz); outNormal.set(0, -1, 0); }
        else if (face === 4) { outPoint.set(cx, cy, maxZ); outNormal.set(0, 0, 1); }
        else { outPoint.set(cx, cy, minZ); outNormal.set(0, 0, -1); }
    }

    _alignFlameToPartSurface(flame, part, padding = 0.03) {
        const p = flame.position;
        const minX = part.cx - part.hx;
        const minY = part.cy - part.hy;
        const minZ = part.cz - part.hz;
        const maxX = part.cx + part.hx;
        const maxY = part.cy + part.hy;
        const maxZ = part.cz + part.hz;
        this._getNearestSurfacePointOnAabb(
            p.x, p.y, p.z,
            minX, minY, minZ, maxX, maxY, maxZ,
            this.tmpBestCandidate, this.tmpSurfaceNormal
        );
        const halfHeight = 0.5 * FIRE_PLANE_HEIGHT * Math.max(0.0001, flame.scale.y);
        p.copy(this.tmpBestCandidate).addScaledVector(this.tmpSurfaceNormal, halfHeight + padding);
        this.tmpFireQuat.setFromUnitVectors(this.tmpAxisY, this.tmpSurfaceNormal);
        flame.quaternion.copy(this.tmpFireQuat);
        return this.tmpSurfaceNormal;
    }

    attachMobFireEffect(root, surfaceParts) {
        if (!this.mobFireMaterial) return { fireGroup: null, firePlanes: [] };
        const fireGroup = new THREE.Group();
        fireGroup.visible = false;
        fireGroup.position.set(0, 0, 0);
        const firePlaneGeom = new THREE.PlaneGeometry(FIRE_PLANE_WIDTH, FIRE_PLANE_HEIGHT);
        const planes = [];
        for (let i = 0; i < PLAYER_FIRE_PLANE_COUNT; i++) {
            const flame = new THREE.Mesh(firePlaneGeom, this.mobFireMaterial);
            const partIndex = i % surfaceParts.length;
            const part = surfaceParts[partIndex];
            const a = (i / PLAYER_FIRE_PLANE_COUNT) * Math.PI * 2.0 + (((i * 7) % 11) - 5) * 0.07;
            const r = 0.1 + ((i * 37) % 13) * 0.006;
            const h = part.cy + (((i * 17) % 9) - 4) * 0.04;
            flame.position.set(part.cx + Math.cos(a) * r, h, part.cz + Math.sin(a) * r);
            const rx = (((i * 23) % 15) - 7) * 0.08;
            const ry = a + (((i * 11) % 13) - 6) * 0.12;
            const rz = (((i * 29) % 17) - 8) * 0.05;
            flame.rotation.set(rx, ry, rz);
            const s = 0.58 + ((i * 19) % 10) * 0.045;
            flame.scale.set(s, s, s);
            flame.userData.firePhase = i * 0.47;
            flame.userData.baseY = h;
            flame.userData.baseRadius = r;
            flame.userData.angle = a;
            flame.userData.partIndex = partIndex;
            flame.userData.jx = (((i * 13) % 11) - 5) * 0.004;
            flame.userData.jy = (((i * 17) % 11) - 5) * 0.0035;
            flame.userData.jz = (((i * 19) % 11) - 5) * 0.004;
            flame.userData.rollBase = (((i * 47) % 37) - 18) * 0.12;
            flame.userData.rollAmp = 0.15 + ((i * 5) % 9) * 0.03;
            flame.userData.rollSpeed = 0.4 + ((i * 5) % 11) * 0.08;
            flame.renderOrder = 100;
            fireGroup.add(flame);
            planes.push(flame);
        }
        root.add(fireGroup);
        return { fireGroup, firePlanes: planes };
    }

    updateMobFireEffect(entity, surfaceParts, burning) {
        if (!entity.fireGroup || !entity.firePlanes) return;
        entity.fireGroup.visible = !!burning;
        if (!burning) return;
        const t = performance.now() * 0.01;
        if (this.mobFireMaterial) {
            this.mobFireMaterial.opacity = PLAYER_FIRE_ALPHA_BASE + Math.sin(t) * 0.08;
            if (this.mobFireMaterial.map) this.mobFireMaterial.map.needsUpdate = true;
        }
        const t2 = performance.now() * 0.004;
        for (let i = 0; i < entity.firePlanes.length; i++) {
            const p = entity.firePlanes[i];
            const part = surfaceParts[(p.userData.partIndex || 0) % surfaceParts.length];
            const noise = 0.014;
            p.userData.jx = (p.userData.jx || 0) * 0.92 + (Math.random() * 2 - 1) * noise;
            p.userData.jy = (p.userData.jy || 0) * 0.90 + (Math.random() * 2 - 1) * (noise * 0.7);
            p.userData.jz = (p.userData.jz || 0) * 0.92 + (Math.random() * 2 - 1) * noise;
            p.position.x += p.userData.jx;
            p.position.y += p.userData.jy;
            p.position.z += p.userData.jz;
            p.position.x = Math.max(part.cx - part.hx - 0.08, Math.min(part.cx + part.hx + 0.08, p.position.x));
            p.position.y = Math.max(part.cy - part.hy - 0.08, Math.min(part.cy + part.hy + 0.08, p.position.y));
            p.position.z = Math.max(part.cz - part.hz - 0.08, Math.min(part.cz + part.hz + 0.08, p.position.z));
            this._alignFlameToPartSurface(p, part, 0.03);
        }
    }

    clear() {
        for (const p of this.pigs) {
            this.scene.remove(p.root);
            p.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.pigs.length = 0;
        for (const c of this.chickens) {
            this.scene.remove(c.root);
            c.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.chickens.length = 0;
        for (const s of this.sheep) {
            this.scene.remove(s.root);
            s.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.sheep.length = 0;
        for (const c of this.cows) {
            this.scene.remove(c.root);
            c.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.cows.length = 0;
        for (const c of this.creepers) {
            this.scene.remove(c.root);
            c.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.creepers.length = 0;
        for (const z of this.zombies) {
            this.scene.remove(z.root);
            z.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.zombies.length = 0;
        for (const s of this.spiders) {
            this.scene.remove(s.root);
            s.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.spiders.length = 0;
        for (const s of this.skeletons) {
            this.scene.remove(s.root);
            s.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.skeletons.length = 0;
        for (const z of this.zombiePigmen) {
            this.scene.remove(z.root);
            z.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.zombiePigmen.length = 0;
        for (const s of this.slimes) {
            this.scene.remove(s.root);
            s.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.slimes.length = 0;
        for (const g of this.ghasts) {
            this.scene.remove(g.root);
            g.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.ghasts.length = 0;
        for (const a of this.skeletonArrows) {
            if (a && a.mesh) this.scene.remove(a.mesh);
        }
        this.skeletonArrows.length = 0;
        for (const s of this.playerSnowballs) {
            if (s && s.mesh) this.scene.remove(s.mesh);
        }
        this.playerSnowballs.length = 0;
        for (const e of this.playerEggs) {
            if (e && e.mesh) this.scene.remove(e.mesh);
        }
        this.playerEggs.length = 0;
        for (const f of this.ghastFireballs) {
            if (f && f.mesh) this.scene.remove(f.mesh);
        }
        this.ghastFireballs.length = 0;
        for (const s of this.squids) {
            this.scene.remove(s.root);
            s.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.squids.length = 0;
        for (const w of this.wolves) {
            this.scene.remove(w.root);
            w.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        this.wolves.length = 0;
        this.spawnTickAccumulator = 0;
        this.betaLight.clear();
        this.betaChunkCache.clear();
        this.betaBiomeCache.clear();
        this.betaSpawners.clear();
        this.lastPlayerPos = null;
    }

    createSkeletonArrowMesh() {
        const root = new THREE.Group();
        root.renderOrder = 3;
        // Shaft: four crossed quads (RenderArrow-like silhouette).
        for (let i = 0; i < 4; i++) {
            const plane = new THREE.Mesh(this.skeletonArrowShaftGeometry, this.skeletonArrowMaterial);
            plane.rotation.x = i * (Math.PI * 0.5);
            plane.frustumCulled = false;
            root.add(plane);
        }
        // Head/fletch cap planes.
        const headA = new THREE.Mesh(this.skeletonArrowHeadGeometry, this.skeletonArrowMaterial);
        headA.position.x = -0.39;
        headA.frustumCulled = false;
        root.add(headA);
        const headB = new THREE.Mesh(this.skeletonArrowHeadGeometry, this.skeletonArrowMaterial);
        headB.position.x = -0.39;
        headB.rotation.y = Math.PI;
        headB.frustumCulled = false;
        root.add(headB);
        return root;
    }

    spawnSkeletonArrow(fromPos, velocity, attacker = null) {
        const mesh = this.createSkeletonArrowMesh();
        mesh.position.copy(fromPos);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.scene.add(mesh);
        const arrow = {
            pos: fromPos.clone(),
            prevPos: fromPos.clone(),
            vel: velocity.clone(),
            life: SKELETON_ARROW_LIFETIME,
            attacker,
            playerAlreadyDamaged: false,
            inGround: false,
            xTile: 0,
            yTile: 0,
            zTile: 0,
            inTile: 0,
            inData: 0,
            arrowShake: 0,
            ticksInGround: 0,
            ticksInAir: 0,
            belongsToPlayer: !!(attacker && attacker.mobType === 'player'),
            mesh
        };
        this.skeletonArrows.push(arrow);
        return arrow;
    }

    firePlayerArrow(fromPos, lookDir, drawCharge01 = 1.0) {
        if (!fromPos || !lookDir) return false;
        const t = clamp(Number(drawCharge01) || 0, 0, 1);
        const force = (t * t + t * 2.0) / 3.0;
        if (force < 0.1) return false;
        const speedPerTick = force * 1.5;
        const vel = createJacoboArrowVelocity(lookDir.x, lookDir.y, lookDir.z, speedPerTick, 1.0);
        const dir = vel.clone().normalize();
        const spawnPos = new THREE.Vector3(fromPos.x, fromPos.y - 0.1, fromPos.z).addScaledVector(dir, 0.16);
        this.spawnSkeletonArrow(spawnPos, vel, { mobType: 'player', pos: { x: fromPos.x, y: fromPos.y, z: fromPos.z } });
        if (this.playBowSound) {
            this.playBowSound(1.0 / (Math.random() * 0.4 + 0.8));
        }
        return true;
    }

    firePlayerSnowball(fromPos, lookDir) {
        if (!fromPos || !lookDir) return false;
        const vel = createJacoboArrowVelocity(lookDir.x, lookDir.y, lookDir.z, 1.5, 1.0);
        const dir = vel.clone().normalize();
        const spawnPos = new THREE.Vector3(fromPos.x, fromPos.y - 0.1, fromPos.z).addScaledVector(dir, 0.18);
        const mesh = new THREE.Mesh(this.snowballGeometry, this.snowballMaterial);
        mesh.position.copy(spawnPos);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.scene.add(mesh);
        this.playerSnowballs.push({
            pos: spawnPos.clone(),
            prevPos: spawnPos.clone(),
            vel,
            life: PLAYER_SNOWBALL_LIFETIME,
            tickAccumulator: 0,
            mesh
        });
        return true;
    }

    firePlayerEgg(fromPos, lookDir) {
        if (!fromPos || !lookDir) return false;
        const vel = createJacoboArrowVelocity(lookDir.x, lookDir.y, lookDir.z, 1.5, 1.0);
        const dir = vel.clone().normalize();
        const spawnPos = new THREE.Vector3(fromPos.x, fromPos.y - 0.1, fromPos.z).addScaledVector(dir, 0.18);
        const mesh = new THREE.Mesh(this.eggGeometry, this.eggMaterial);
        mesh.position.copy(spawnPos);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.scene.add(mesh);
        this.playerEggs.push({
            pos: spawnPos.clone(),
            prevPos: spawnPos.clone(),
            vel,
            life: PLAYER_SNOWBALL_LIFETIME,
            tickAccumulator: 0,
            mesh
        });
        return true;
    }

    onEggImpact(x, y, z) {
        if (Math.random() >= 0.125) return;
        // EntityEgg: Beta 1.7.3 has no baby mobs, so hatched chickens are adults.
        const hatchCount = Math.random() < 0.03125 ? 4 : 1;
        for (let i = 0; i < hatchCount; i++) {
            this.spawnChicken(
                x + (Math.random() * 0.4 - 0.2),
                y + 0.1,
                z + (Math.random() * 0.4 - 0.2)
            );
        }
    }

    trySkeletonArrowHitMobs(arrow, prevX, prevY, prevZ, nextX, nextY, nextZ) {
        if (!arrow) return false;
        const testTarget = (mob) => {
            if (!mob || mob._dead) return false;
            const attacker = arrow.attacker || null;
            const attackerPos = (attacker && attacker.pos &&
                Number.isFinite(attacker.pos.x) &&
                Number.isFinite(attacker.pos.y) &&
                Number.isFinite(attacker.pos.z))
                ? attacker.pos
                : null;
            if (attacker && mob === attacker) return false;
            const centerY = mob.pos.y + this.getMobCollisionHeight(mob) * 0.5;
            const radius = this.getMobCollisionRadius(mob) + 0.14;
            const hitDistSq = distancePointToSegmentSq(
                mob.pos.x, centerY, mob.pos.z,
                prevX, prevY, prevZ,
                nextX, nextY, nextZ
            );
            if (hitDistSq > radius * radius) return false;
            mob.health = (mob.health ?? 1) - 4;
            mob.hurtTimer = 0.25;
            mob.hurtCooldown = Math.max(mob.hurtCooldown || 0, 0.25);
            const vx = Number.isFinite(arrow.vel?.x) ? arrow.vel.x : 0;
            const vz = Number.isFinite(arrow.vel?.z) ? arrow.vel.z : 0;
            const horiz = Math.hypot(vx, vz) || 1;
            mob.vel.x += (vx / horiz) * 2.1;
            mob.vel.z += (vz / horiz) * 2.1;
            mob.vel.y = Math.max(mob.vel.y || 0, 2.0);
            mob.lastDamageSource = 'skeleton_arrow';
            mob.lastDamageAttackerType = (attacker && attacker.mobType) ? attacker.mobType : 'skeleton';
            mob.lastDamageAtMs = Date.now();
            if (mob.mobType === 'sheep') {
                mob.fleeTimer = Math.max(mob.fleeTimer || 0, 2.0);
                mob.fleeFromX = prevX;
                mob.fleeFromZ = prevZ;
                mob.wanderTarget = null;
                mob.aiTimer = 0;
            } else if (mob.mobType === 'pig' || mob.mobType === 'chicken' || mob.mobType === 'cow') {
                mob.panicTimer = Math.max(mob.panicTimer || 0, PASSIVE_PANIC_TIMER_SECONDS);
                mob.panicFromX = prevX;
                mob.panicFromZ = prevZ;
                mob.wanderTarget = null;
                mob.aiTimer = 0;
            } else if (mob.mobType === 'spider') {
                mob.aggroTimer = Math.max(mob.aggroTimer || 0, 10.0);
                const aggroRadiusSq = 16 * 16;
                for (const sp of this.spiders) {
                    if (!sp || sp._dead) continue;
                    const dxs = sp.pos.x - mob.pos.x;
                    const dzs = sp.pos.z - mob.pos.z;
                    if ((dxs * dxs + dzs * dzs) > aggroRadiusSq) continue;
                    sp.aggroTimer = Math.max(sp.aggroTimer || 0, 10.0);
                }
            } else if (mob.mobType === 'wolf' && !mob.tamed && attackerPos) {
                mob.angry = true;
                mob.angryTimer = Math.max(mob.angryTimer || 0, 20.0);
                this.setMobTargetFromPlayer(mob, { x: attackerPos.x, y: attackerPos.y, z: attackerPos.z });
                mob.aiTimer = 0;
                this.updateWolfAppearance(mob);
                const aggroRadiusSq = 16 * 16;
                for (const w of this.wolves) {
                    if (!w || w._dead || w.tamed) continue;
                    const dxw = w.pos.x - mob.pos.x;
                    const dzw = w.pos.z - mob.pos.z;
                    if ((dxw * dxw + dzw * dzw) > aggroRadiusSq) continue;
                    w.angry = true;
                    w.angryTimer = Math.max(w.angryTimer || 0, 20.0);
                    this.setMobTargetFromPlayer(w, { x: attackerPos.x, y: attackerPos.y, z: attackerPos.z });
                    w.aiTimer = 0;
                    this.updateWolfAppearance(w);
                }
            }
            if (mob.mobType === 'zombie_pigman' && attackerPos && attacker && attacker.mobType === 'player') {
                const source = { x: attackerPos.x, y: attackerPos.y, z: attackerPos.z };
                this.setZombiePigmanAngry(mob, source);
                const aggroRadiusSq = ZOMBIE_PIGMAN_PACK_AGGRO_RADIUS * ZOMBIE_PIGMAN_PACK_AGGRO_RADIUS;
                for (const zp of this.zombiePigmen) {
                    if (!zp || zp._dead) continue;
                    const dx = zp.pos.x - mob.pos.x;
                    const dy = zp.pos.y - mob.pos.y;
                    const dz = zp.pos.z - mob.pos.z;
                    if ((dx * dx + dy * dy + dz * dz) > aggroRadiusSq) continue;
                    this.setZombiePigmanAngry(zp, source);
                }
            }
            if (attackerPos && (mob.mobType === 'creeper' || mob.mobType === 'zombie' || mob.mobType === 'giant' || mob.mobType === 'spider' || mob.mobType === 'skeleton' || (mob.mobType === 'zombie_pigman' && attacker && attacker.mobType === 'player'))) {
                mob.target = { x: attackerPos.x, y: attackerPos.y, z: attackerPos.z };
                mob.aiTimer = 0;
                const dx = attackerPos.x - mob.pos.x;
                const dz = attackerPos.z - mob.pos.z;
                if (dx * dx + dz * dz > 1e-6) {
                    mob.targetYaw = Math.atan2(dz, dx);
                }
            }
            if (mob.health <= 0 && !mob._dead) {
                mob._dead = true;
                mob.deathTimer = 1.0;
                mob.walkSpeed = 0;
                mob.vel.x *= 0.2;
                mob.vel.z *= 0.2;
            }
            return true;
        };

        const buckets = [
            this.pigs, this.chickens, this.sheep, this.cows,
            this.creepers, this.zombies, this.spiders, this.skeletons,
            this.zombiePigmen, this.slimes, this.ghasts, this.squids, this.wolves
        ];
        for (const bucket of buckets) {
            if (!Array.isArray(bucket)) continue;
            for (let i = 0; i < bucket.length; i++) {
                if (testTarget(bucket[i])) return true;
            }
        }
        return false;
    }

    trySnowballHitMobs(prevX, prevY, prevZ, nextX, nextY, nextZ) {
        const testTarget = (mob) => {
            if (!mob || mob._dead) return false;
            const centerY = mob.pos.y + this.getMobCollisionHeight(mob) * 0.5;
            const radius = this.getMobCollisionRadius(mob) + 0.12;
            const hitDistSq = distancePointToSegmentSq(
                mob.pos.x, centerY, mob.pos.z,
                prevX, prevY, prevZ,
                nextX, nextY, nextZ
            );
            if (hitDistSq > radius * radius) return false;
            mob.hurtTimer = Math.max(mob.hurtTimer || 0, 0.08);
            if (mob.mobType === 'sheep') {
                mob.fleeTimer = Math.max(mob.fleeTimer || 0, 1.25);
                mob.fleeFromX = prevX;
                mob.fleeFromZ = prevZ;
                mob.wanderTarget = null;
                mob.aiTimer = 0;
            } else if (mob.mobType === 'pig' || mob.mobType === 'chicken' || mob.mobType === 'cow') {
                mob.panicTimer = Math.max(mob.panicTimer || 0, 1.25);
                mob.panicFromX = prevX;
                mob.panicFromZ = prevZ;
                mob.wanderTarget = null;
                mob.aiTimer = 0;
            }
            return true;
        };
        const buckets = [
            this.pigs, this.chickens, this.sheep, this.cows,
            this.creepers, this.zombies, this.spiders, this.skeletons,
            this.zombiePigmen, this.slimes, this.ghasts, this.squids, this.wolves
        ];
        for (const bucket of buckets) {
            if (!Array.isArray(bucket)) continue;
            for (let i = 0; i < bucket.length; i++) {
                if (testTarget(bucket[i])) return true;
            }
        }
        return false;
    }

    tryEggHitMobs(prevX, prevY, prevZ, nextX, nextY, nextZ) {
        const testTarget = (mob) => {
            if (!mob || mob._dead) return false;
            const centerY = mob.pos.y + this.getMobCollisionHeight(mob) * 0.5;
            const radius = this.getMobCollisionRadius(mob) + 0.12;
            const hitDistSq = distancePointToSegmentSq(
                mob.pos.x, centerY, mob.pos.z,
                prevX, prevY, prevZ,
                nextX, nextY, nextZ
            );
            return hitDistSq <= radius * radius;
        };
        const buckets = [
            this.pigs, this.chickens, this.sheep, this.cows,
            this.creepers, this.zombies, this.spiders, this.skeletons,
            this.zombiePigmen, this.slimes, this.ghasts, this.squids, this.wolves
        ];
        for (const bucket of buckets) {
            if (!Array.isArray(bucket)) continue;
            for (let i = 0; i < bucket.length; i++) {
                if (testTarget(bucket[i])) return true;
            }
        }
        return false;
    }

    updateSkeletonArrows(dt, playerPos) {
        for (let i = this.skeletonArrows.length - 1; i >= 0; i--) {
            const a = this.skeletonArrows[i];
            a.life -= dt;
            if (a.life <= 0) {
                if (a.mesh) this.scene.remove(a.mesh);
                this.skeletonArrows.splice(i, 1);
                continue;
            }
            a.tickAccumulator = (a.tickAccumulator || 0) + dt * TICKS_PER_SECOND;
            let tickBudget = Math.min(12, Math.floor(a.tickAccumulator));
            if (tickBudget > 0) a.tickAccumulator -= tickBudget;
            let removed = false;
            while (tickBudget-- > 0) {
                if ((a.arrowShake || 0) > 0) a.arrowShake -= 1;
                if (a.inGround) {
                    const tileId = this.chunkManager.getBlock(a.xTile, a.yTile, a.zTile);
                    const tileMeta = this.chunkManager.getMetadata(a.xTile, a.yTile, a.zTile) & 15;
                    if (tileId === a.inTile && tileMeta === a.inData) {
                        a.ticksInGround = (a.ticksInGround || 0) + 1;
                        if (a.ticksInGround >= 1200) {
                            if (a.mesh) this.scene.remove(a.mesh);
                            this.skeletonArrows.splice(i, 1);
                            removed = true;
                            break;
                        }
                        if (playerPos && (a.arrowShake || 0) <= 0 && this.addItemToInventory) {
                            const pickupDelayPassed = (a.ticksInGround || 0) >= 20; // 1 second at 20 TPS
                            if (!pickupDelayPassed) continue;
                            const dx = a.pos.x - playerPos.x;
                            const dy = a.pos.y - playerPos.y;
                            const dz = a.pos.z - playerPos.z;
                            if ((dx * dx + dy * dy + dz * dz) <= (1.5 * 1.5)) {
                                if (this.addItemToInventory(6, 1, 0, 'item')) {
                                    if (a.mesh) this.scene.remove(a.mesh);
                                    this.skeletonArrows.splice(i, 1);
                                    removed = true;
                                    break;
                                }
                            }
                        }
                        continue;
                    }
                    a.inGround = false;
                    a.vel.x *= (Math.random() * 0.2);
                    a.vel.y *= (Math.random() * 0.2);
                    a.vel.z *= (Math.random() * 0.2);
                    a.ticksInGround = 0;
                    a.ticksInAir = 0;
                }

                const prevX = a.pos.x;
                const prevY = a.pos.y;
                const prevZ = a.pos.z;
                a.prevPos.set(prevX, prevY, prevZ);
                const nx = prevX + a.vel.x;
                const ny = prevY + a.vel.y;
                const nz = prevZ + a.vel.z;
                if (!this.chunkManager.hasChunk(Math.floor(nx / CHUNK_SIZE), Math.floor(ny / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE))) {
                    if (a.mesh) this.scene.remove(a.mesh);
                    this.skeletonArrows.splice(i, 1);
                    removed = true;
                    break;
                }
                const segDx = nx - prevX;
                const segDy = ny - prevY;
                const segDz = nz - prevZ;
                const segLen = Math.hypot(segDx, segDy, segDz);
                const steps = Math.max(1, Math.ceil(segLen / 0.25));
                let collided = false;
                let sampledWater = false;
                let hitPrevT = 0;
                let hitAabb = null;
                let hitBx = 0;
                let hitBy = 0;
                let hitBz = 0;
                for (let step = 1; step <= steps; step++) {
                    const t = step / steps;
                    const sx = prevX + segDx * t;
                    const sy = prevY + segDy * t;
                    const sz = prevZ + segDz * t;
                    const bx = worldToBlock(sx);
                    const by = worldToBlock(sy);
                    const bz = worldToBlock(sz);
                    const hitId = this.chunkManager.getBlock(bx, by, bz);
                    if (isWaterId(hitId)) sampledWater = true;
                    const aabb = getArrowBlockCollisionAabb(hitId, bx, by, bz);
                    if (aabb && segmentIntersectsAabb(
                        prevX, prevY, prevZ,
                        nx, ny, nz,
                        aabb.minX, aabb.minY, aabb.minZ,
                        aabb.maxX, aabb.maxY, aabb.maxZ
                    )) {
                        collided = true;
                        hitPrevT = (step - 1) / steps;
                        hitAabb = aabb;
                        hitBx = bx;
                        hitBy = by;
                        hitBz = bz;
                        break;
                    }
                }
                if (collided) {
                    const hitLen = Math.hypot(segDx, segDy, segDz) || 1.0;
                    const hitX = prevX + segDx * hitPrevT;
                    const hitY = prevY + segDy * hitPrevT;
                    const hitZ = prevZ + segDz * hitPrevT;
                    const dirX = segDx / hitLen;
                    const dirY = segDy / hitLen;
                    const dirZ = segDz / hitLen;
                    const speed = Math.hypot(a.vel.x, a.vel.y, a.vel.z);
                    const normalizedSpeed = clamp(speed / 1.5, 0, 1);
                    let penetration = 0.02 + normalizedSpeed * 0.18;
                    if (hitAabb) {
                        const sizeX = Math.max(0.001, hitAabb.maxX - hitAabb.minX);
                        const sizeY = Math.max(0.001, hitAabb.maxY - hitAabb.minY);
                        const sizeZ = Math.max(0.001, hitAabb.maxZ - hitAabb.minZ);
                        const axisDepth = Math.abs(dirX) * sizeX + Math.abs(dirY) * sizeY + Math.abs(dirZ) * sizeZ;
                        penetration = Math.min(penetration, axisDepth * 0.45);
                    }
                    a.pos.x = hitX + dirX * penetration;
                    a.pos.y = hitY + dirY * penetration;
                    a.pos.z = hitZ + dirZ * penetration;
                    a.prevPos.copy(a.pos);
                    // Keep in-ground reference tied to the actual collided block cell
                    // so pickup/despawn timers remain stable even with visual penetration offset.
                    a.xTile = hitBx;
                    a.yTile = hitBy;
                    a.zTile = hitBz;
                    a.inTile = this.chunkManager.getBlock(hitBx, hitBy, hitBz);
                    a.inData = this.chunkManager.getMetadata(hitBx, hitBy, hitBz) & 15;
                    a.inGround = true;
                    a.arrowShake = 7;
                    a.vel.set(0, 0, 0);
                    continue;
                }

                a.ticksInAir = (a.ticksInAir || 0) + 1;
                a.pos.set(nx, ny, nz);
                if (this.trySkeletonArrowHitMobs(a, prevX, prevY, prevZ, a.pos.x, a.pos.y, a.pos.z)) {
                    if (a.mesh) this.scene.remove(a.mesh);
                    this.skeletonArrows.splice(i, 1);
                    removed = true;
                    break;
                }
                if (playerPos && this.damagePlayer && !a.playerAlreadyDamaged && (a.attacker?.mobType !== 'player')) {
                    const playerFeetY = playerPos.y - PLAYER_MELEE_FEET_OFFSET;
                    const half = SKELETON_ARROW_PLAYER_HIT_RADIUS * 0.5;
                    const hitPlayer = segmentIntersectsAabb(
                        prevX, prevY, prevZ,
                        a.pos.x, a.pos.y, a.pos.z,
                        playerPos.x - half, playerFeetY, playerPos.z - half,
                        playerPos.x + half, playerFeetY + PLAYER_MELEE_HITBOX_HEIGHT, playerPos.z + half
                    );
                    if (hitPlayer) {
                        this.damagePlayer(4, {
                            source: 'skeleton_arrow',
                            attacker: { pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z } }
                        });
                        if (a.mesh) this.scene.remove(a.mesh);
                        this.skeletonArrows.splice(i, 1);
                        removed = true;
                        break;
                    }
                }

                const drag = sampledWater ? ARROW_DRAG_WATER_PER_TICK : ARROW_DRAG_AIR_PER_TICK;
                a.vel.x *= drag;
                a.vel.y *= drag;
                a.vel.z *= drag;
                a.vel.y -= ARROW_GRAVITY_PER_TICK;
            }
            if (removed) continue;

            if (a.mesh) {
                const alpha = clamp(a.tickAccumulator || 0, 0, 1);
                if (a.inGround) {
                    this.tmpArrowRenderPos.copy(a.pos);
                } else {
                    this.tmpArrowRenderPos.lerpVectors(a.prevPos, a.pos, alpha);
                }
                a.mesh.position.copy(this.tmpArrowRenderPos);
                this.tmpArrowDir.set(a.vel.x, a.vel.y, a.vel.z);
                if (this.tmpArrowDir.lengthSq() > 1e-8) {
                    this.tmpArrowDir.normalize();
                    this.tmpArrowQuat.setFromUnitVectors(this.tmpArrowForwardAxis, this.tmpArrowDir);
                    a.mesh.quaternion.copy(this.tmpArrowQuat);
                } else {
                    this.tmpArrowDir.copy(this.tmpArrowForwardAxis);
                }
                if ((a.arrowShake || 0) > 0) {
                    const shake = -Math.sin((a.arrowShake || 0) * 3.0) * (a.arrowShake || 0) * (Math.PI / 180.0);
                    this.tmpArrowShakeQuat.setFromAxisAngle(this.tmpArrowDir, shake);
                    a.mesh.quaternion.multiply(this.tmpArrowShakeQuat);
                }
                a.mesh.visible = true;
            }
        }
    }

    updatePlayerSnowballs(dt, playerPos) {
        for (let i = this.playerSnowballs.length - 1; i >= 0; i--) {
            const s = this.playerSnowballs[i];
            s.life -= dt;
            if (s.life <= 0) {
                if (s.mesh) this.scene.remove(s.mesh);
                this.playerSnowballs.splice(i, 1);
                continue;
            }
            s.tickAccumulator = (s.tickAccumulator || 0) + dt * TICKS_PER_SECOND;
            let tickBudget = Math.min(12, Math.floor(s.tickAccumulator));
            if (tickBudget > 0) s.tickAccumulator -= tickBudget;
            let removed = false;
            while (tickBudget-- > 0) {
                const prevX = s.pos.x;
                const prevY = s.pos.y;
                const prevZ = s.pos.z;
                s.prevPos.set(prevX, prevY, prevZ);
                const nx = prevX + s.vel.x;
                const ny = prevY + s.vel.y;
                const nz = prevZ + s.vel.z;
                if (!this.chunkManager.hasChunk(Math.floor(nx / CHUNK_SIZE), Math.floor(ny / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE))) {
                    if (s.mesh) this.scene.remove(s.mesh);
                    this.playerSnowballs.splice(i, 1);
                    removed = true;
                    break;
                }
                const segDx = nx - prevX;
                const segDy = ny - prevY;
                const segDz = nz - prevZ;
                const segLen = Math.hypot(segDx, segDy, segDz);
                const steps = Math.max(1, Math.ceil(segLen / 0.25));
                let collided = false;
                let sampledWater = false;
                for (let step = 1; step <= steps; step++) {
                    const t = step / steps;
                    const sx = prevX + segDx * t;
                    const sy = prevY + segDy * t;
                    const sz = prevZ + segDz * t;
                    const bx = worldToBlock(sx);
                    const by = worldToBlock(sy);
                    const bz = worldToBlock(sz);
                    const hitId = this.chunkManager.getBlock(bx, by, bz);
                    if (isWaterId(hitId)) sampledWater = true;
                    const aabb = getArrowBlockCollisionAabb(hitId, bx, by, bz);
                    if (aabb && segmentIntersectsAabb(
                        prevX, prevY, prevZ,
                        nx, ny, nz,
                        aabb.minX, aabb.minY, aabb.minZ,
                        aabb.maxX, aabb.maxY, aabb.maxZ
                    )) {
                        collided = true;
                        break;
                    }
                }
                if (collided) {
                    if (s.mesh) this.scene.remove(s.mesh);
                    this.playerSnowballs.splice(i, 1);
                    removed = true;
                    break;
                }
                s.pos.set(nx, ny, nz);
                if (this.trySnowballHitMobs(prevX, prevY, prevZ, s.pos.x, s.pos.y, s.pos.z)) {
                    if (s.mesh) this.scene.remove(s.mesh);
                    this.playerSnowballs.splice(i, 1);
                    removed = true;
                    break;
                }
                const drag = sampledWater ? ARROW_DRAG_WATER_PER_TICK : SNOWBALL_DRAG_AIR_PER_TICK;
                s.vel.x *= drag;
                s.vel.y *= drag;
                s.vel.z *= drag;
                s.vel.y -= SNOWBALL_GRAVITY_PER_TICK;
            }
            if (removed) continue;
            if (s.mesh) {
                const alpha = clamp(s.tickAccumulator || 0, 0, 1);
                this.tmpArrowRenderPos.lerpVectors(s.prevPos, s.pos, alpha);
                s.mesh.position.copy(this.tmpArrowRenderPos);
                if (playerPos) s.mesh.lookAt(playerPos.x, playerPos.y, playerPos.z);
                s.mesh.visible = true;
            }
        }
    }

    updatePlayerEggs(dt, playerPos) {
        for (let i = this.playerEggs.length - 1; i >= 0; i--) {
            const e = this.playerEggs[i];
            e.life -= dt;
            if (e.life <= 0) {
                if (e.mesh) this.scene.remove(e.mesh);
                this.playerEggs.splice(i, 1);
                continue;
            }
            e.tickAccumulator = (e.tickAccumulator || 0) + dt * TICKS_PER_SECOND;
            let tickBudget = Math.min(12, Math.floor(e.tickAccumulator));
            if (tickBudget > 0) e.tickAccumulator -= tickBudget;
            let removed = false;
            while (tickBudget-- > 0) {
                const prevX = e.pos.x;
                const prevY = e.pos.y;
                const prevZ = e.pos.z;
                e.prevPos.set(prevX, prevY, prevZ);
                const nx = prevX + e.vel.x;
                const ny = prevY + e.vel.y;
                const nz = prevZ + e.vel.z;
                if (!this.chunkManager.hasChunk(Math.floor(nx / CHUNK_SIZE), Math.floor(ny / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE))) {
                    if (e.mesh) this.scene.remove(e.mesh);
                    this.playerEggs.splice(i, 1);
                    removed = true;
                    break;
                }
                const segDx = nx - prevX;
                const segDy = ny - prevY;
                const segDz = nz - prevZ;
                const segLen = Math.hypot(segDx, segDy, segDz);
                const steps = Math.max(1, Math.ceil(segLen / 0.25));
                let collided = false;
                let sampledWater = false;
                for (let step = 1; step <= steps; step++) {
                    const t = step / steps;
                    const sx = prevX + segDx * t;
                    const sy = prevY + segDy * t;
                    const sz = prevZ + segDz * t;
                    const bx = worldToBlock(sx);
                    const by = worldToBlock(sy);
                    const bz = worldToBlock(sz);
                    const hitId = this.chunkManager.getBlock(bx, by, bz);
                    if (isWaterId(hitId)) sampledWater = true;
                    const aabb = getArrowBlockCollisionAabb(hitId, bx, by, bz);
                    if (aabb && segmentIntersectsAabb(
                        prevX, prevY, prevZ,
                        nx, ny, nz,
                        aabb.minX, aabb.minY, aabb.minZ,
                        aabb.maxX, aabb.maxY, aabb.maxZ
                    )) {
                        collided = true;
                        break;
                    }
                }
                if (collided) {
                    this.onEggImpact(nx, ny, nz);
                    if (e.mesh) this.scene.remove(e.mesh);
                    this.playerEggs.splice(i, 1);
                    removed = true;
                    break;
                }
                e.pos.set(nx, ny, nz);
                if (this.tryEggHitMobs(prevX, prevY, prevZ, e.pos.x, e.pos.y, e.pos.z)) {
                    this.onEggImpact(e.pos.x, e.pos.y, e.pos.z);
                    if (e.mesh) this.scene.remove(e.mesh);
                    this.playerEggs.splice(i, 1);
                    removed = true;
                    break;
                }
                const drag = sampledWater ? ARROW_DRAG_WATER_PER_TICK : SNOWBALL_DRAG_AIR_PER_TICK;
                e.vel.x *= drag;
                e.vel.y *= drag;
                e.vel.z *= drag;
                e.vel.y -= SNOWBALL_GRAVITY_PER_TICK;
            }
            if (removed) continue;
            if (e.mesh) {
                const alpha = clamp(e.tickAccumulator || 0, 0, 1);
                this.tmpArrowRenderPos.lerpVectors(e.prevPos, e.pos, alpha);
                e.mesh.position.copy(this.tmpArrowRenderPos);
                if (playerPos) e.mesh.lookAt(playerPos.x, playerPos.y, playerPos.z);
                e.mesh.visible = true;
            }
        }
    }

    spawnGhastFireball(fromPos, velocity, attacker = null) {
        const mesh = new THREE.Mesh(this.ghastFireballGeometry, this.ghastFireballMaterial);
        mesh.position.copy(fromPos);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.scene.add(mesh);
        this.ghastFireballs.push({
            pos: fromPos.clone(),
            vel: velocity.clone(),
            life: GHAST_FIREBALL_LIFETIME,
            attacker,
            mesh
        });
    }

    explodeGhastFireballAt(pos) {
        if (!pos) return;
        if (this.explodeAt) {
            this.explodeAt(pos.x, pos.y, pos.z, GHAST_FIREBALL_BLAST_RADIUS);
        }
    }

    updateGhastFireballs(dt, playerPos) {
        for (let i = this.ghastFireballs.length - 1; i >= 0; i--) {
            const f = this.ghastFireballs[i];
            if (!f || !f.mesh) {
                this.ghastFireballs.splice(i, 1);
                continue;
            }
            const prevX = f.pos.x;
            const prevY = f.pos.y;
            const prevZ = f.pos.z;
            f.pos.addScaledVector(f.vel, dt);
            f.life -= dt;
            f.mesh.position.copy(f.pos);
            f.mesh.rotation.x += dt * 2.1;
            f.mesh.rotation.y += dt * 2.8;
            f.mesh.rotation.z += dt * 2.4;

            let hit = false;
            const segDx = f.pos.x - prevX;
            const segDy = f.pos.y - prevY;
            const segDz = f.pos.z - prevZ;
            const segDist = Math.hypot(segDx, segDy, segDz);
            const steps = Math.max(1, Math.ceil(segDist / 0.35));
            for (let s = 1; s <= steps; s++) {
                const t = s / steps;
                const sx = prevX + segDx * t;
                const sy = prevY + segDy * t;
                const sz = prevZ + segDz * t;
                const id = this.chunkManager.getBlock(worldToBlock(sx), worldToBlock(sy), worldToBlock(sz));
                if (isSolidBlock(id)) {
                    hit = true;
                    f.pos.set(sx, sy, sz);
                    break;
                }
            }

            if (!hit && playerPos) {
                const pFeetY = playerPos.y - PLAYER_MELEE_FEET_OFFSET;
                const pCenterY = pFeetY + PLAYER_MELEE_HITBOX_HEIGHT * 0.5;
                const hitRadiusSq = GHAST_FIREBALL_PLAYER_HIT_RADIUS * GHAST_FIREBALL_PLAYER_HIT_RADIUS;
                const d2 = distancePointToSegmentSq(
                    playerPos.x, pCenterY, playerPos.z,
                    prevX, prevY, prevZ,
                    f.pos.x, f.pos.y, f.pos.z
                );
                if (d2 <= hitRadiusSq) {
                    hit = true;
                    f.pos.set(playerPos.x, pCenterY, playerPos.z);
                    if (this.damagePlayer) {
                        this.damagePlayer(6, {
                            source: 'ghast_fireball',
                            attacker: { pos: { x: f.pos.x, y: f.pos.y, z: f.pos.z } }
                        });
                    }
                }
            }

            if (hit || f.life <= 0 || f.pos.y < WORLD_DEPTH - 20 || f.pos.y > WORLD_HEIGHT + 20) {
                this.explodeGhastFireballAt(f.pos);
                this.scene.remove(f.mesh);
                this.ghastFireballs.splice(i, 1);
            }
        }
    }

    createPigModel() {
        const root = new THREE.Group();
        const mat = this.pigMaterial;

        // Beta quadruped-style pig body:
        // Model box is 10x16x8 and rotated around X by 90 degrees.
        const body = new THREE.Mesh(makeSkinnedBoxGeometry(10 / 16, 16 / 16, 8 / 16, {
            right: [28, 16, 36, 32],
            left: [46, 16, 54, 32],
            top: [36, 8, 46, 16],
            bottom: [46, 8, 56, 16],
            front: [36, 16, 46, 32],
            back: [54, 16, 64, 32]
        }), mat);
        // Align body underside with leg tops (ModelPig/ModelQuadruped contact).
        body.position.set(0, 10 / 16, 2 / 16);
        body.rotation.x = -Math.PI * 0.5;
        root.add(body);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 9 / 16, -7 / 16);
        root.add(headPivot);
        const head = new THREE.Mesh(makeSkinnedBoxGeometry(8 / 16, 8 / 16, 8 / 16, {
            right: [0, 8, 8, 16],
            left: [16, 8, 24, 16],
            top: [8, 0, 16, 8],
            bottom: [16, 0, 24, 8],
            front: [8, 8, 16, 16],
            back: [24, 8, 32, 16]
        }), mat);
        head.position.set(0, 0, 0);
        headPivot.add(head);

        const legFaces = {
            right: [0, 20, 4, 26],
            left: [8, 20, 12, 26],
            top: [4, 16, 8, 20],
            bottom: [8, 16, 12, 20],
            front: [4, 20, 8, 26],
            back: [12, 20, 16, 26]
        };
        const makeLeg = () => new THREE.Mesh(makeSkinnedBoxGeometry(4 / 16, 6 / 16, 4 / 16, legFaces), mat);

        const legPivots = [];
        const legOffsets = [
            [-3 / 16, 6 / 16, 7 / 16],
            [3 / 16, 6 / 16, 7 / 16],
            [-3 / 16, 6 / 16, -5 / 16],
            [3 / 16, 6 / 16, -5 / 16]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg();
            leg.position.set(0, -3 / 16, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            // Avoid shadow-map acne on tiny mob cubes causing black blotches.
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        root.scale.setScalar(PIG_VISUAL_SCALE);

        return { root, headPivot, legPivots };
    }

    spawnPig(x, y, z, options = null) {
        const ageTicksOpt = options && Number.isFinite(Number(options.ageTicks)) ? Math.floor(Number(options.ageTicks)) : 0;
        const babyOpt = !!(options && options.isBaby);
        const isBaby = babyOpt || ageTicksOpt < 0;
        const model = this.createPigModel();
        const fx = this.attachMobFireEffect(model.root, PIG_FIRE_SURFACE_PARTS);
        model.root.scale.setScalar(PIG_VISUAL_SCALE * (isBaby ? PASSIVE_BABY_SCALE : 1.0));
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const pig = {
            ...model,
            fireGroup: fx.fireGroup,
            firePlanes: fx.firePlanes,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'pig',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            ageTicks: isBaby ? (ageTicksOpt || PASSIVE_BABY_AGE_TICKS) : 0,
            isBaby,
            health: 10,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            loveTicks: 0,
            breedCooldownTicks: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false
        };
        this.pigs.push(pig);
    }

    createChickenModel() {
        const root = new THREE.Group();
        const mat = this.chickenMaterial;

        // Jacobo ModelChicken: body(0,9, 6x8x6), head(0,0, 4x6x3), bill(14,0, 4x2x2), chin(14,4,2x2x2)
        const body = new THREE.Mesh(makeMcBoxGeometry(6, 8, 6, 0, 9), mat);
        body.position.set(0, 9 / 16, 0);
        root.add(body);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 12 / 16, -4 / 16);
        root.add(headPivot);

        const head = new THREE.Mesh(makeMcBoxGeometry(4, 6, 3, 0, 0), mat);
        head.position.set(0, 0, 0);
        headPivot.add(head);

        const beak = new THREE.Mesh(makeMcBoxGeometry(4, 2, 2, 14, 0), mat);
        // Jacobo ModelChicken parity:
        // bill center matches head center in Y; forward by 2.5px in Z.
        beak.rotation.x = 0;
        beak.rotation.y = Math.PI;
        beak.position.set(0, 0, -2.5 / 16);
        headPivot.add(beak);
        const chin = new THREE.Mesh(makeMcBoxGeometry(2, 2, 2, 14, 4), mat);
        // Chin is 2px lower than bill center and slightly less forward.
        chin.rotation.x = 0;
        chin.rotation.y = Math.PI;
        chin.position.set(0, -2 / 16, -1.5 / 16);
        headPivot.add(chin);

        const rightWingPivot = new THREE.Group();
        rightWingPivot.position.set(-3.5 / 16, 9 / 16, 0);
        const rightWing = new THREE.Mesh(makeMcBoxGeometry(1, 4, 6, 24, 13), mat);
        rightWing.position.set(0, 0, 0);
        rightWingPivot.add(rightWing);
        root.add(rightWingPivot);

        const leftWingPivot = new THREE.Group();
        leftWingPivot.position.set(3.5 / 16, 9 / 16, 0);
        const leftWing = new THREE.Mesh(makeMcBoxGeometry(1, 4, 6, 24, 13), mat);
        leftWing.position.set(0, 0, 0);
        leftWingPivot.add(leftWing);
        root.add(leftWingPivot);

        const makeLeg = () => new THREE.Mesh(makeMcBoxGeometry(3, 5, 3, 26, 0), mat);
        const legPivots = [];
        const legOffsets = [
            [-2 / 16, 5 / 16, 0 / 16],
            [1 / 16, 5 / 16, 0 / 16]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg();
            leg.position.set(0, -2.5 / 16, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });

        return { root, headPivot, rightWingPivot, leftWingPivot, legPivots };
    }

    spawnChicken(x, y, z, options = null) {
        const ageTicksOpt = options && Number.isFinite(Number(options.ageTicks)) ? Math.floor(Number(options.ageTicks)) : 0;
        const babyOpt = !!(options && options.isBaby);
        const isBaby = babyOpt || ageTicksOpt < 0;
        const model = this.createChickenModel();
        const fx = this.attachMobFireEffect(model.root, CHICKEN_FIRE_SURFACE_PARTS);
        model.root.scale.setScalar(isBaby ? CHICKEN_BABY_SCALE : 1.0);
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const chicken = {
            ...model,
            fireGroup: fx.fireGroup,
            firePlanes: fx.firePlanes,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'chicken',
            aiTimer: 0,
            flapPhase: Math.random() * Math.PI * 2,
            limbPhase: Math.random() * Math.PI * 2,
            eggTimerTicks: randomChickenEggTicks(),
            eggTickAccumulator: 0,
            ageTicks: isBaby ? (ageTicksOpt || CHICKEN_BABY_AGE_TICKS) : 0,
            isBaby,
            loveTicks: 0,
            breedCooldownTicks: 0,
            jumpCooldown: 0,
            health: 4,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            panicTimer: 0,
            panicFromX: x,
            panicFromZ: z,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false
        };
        this.chickens.push(chicken);
    }

    createSheepModel() {
        const root = new THREE.Group();
        // Jacobo ModelSheep: head(0,0, 6x6x8), body(28,8, 8x16x6 rotated), legs(0,16, 4x6x4)
        const body = new THREE.Mesh(makeMcBoxGeometry(8, 16, 6, 28, 8), this.sheepMaterial);
        // Align sheared body with leg tops (fix disconnected legs).
        body.position.set(0, 9 / 16, 2 / 16);
        body.rotation.x = -Math.PI * 0.5;
        root.add(body);

        const furBody = new THREE.Mesh(makeMcBoxGeometry(8, 16, 6, 28, 8, 64, 32, 1.75), this.sheepFurMaterial);
        furBody.position.copy(body.position);
        furBody.rotation.copy(body.rotation);
        root.add(furBody);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 11 / 16, -8 / 16);
        root.add(headPivot);
        const head = new THREE.Mesh(makeMcBoxGeometry(6, 6, 8, 0, 0), this.sheepMaterial);
        head.position.set(0, 0, 0);
        headPivot.add(head);

        const furHead = new THREE.Mesh(makeMcBoxGeometry(6, 6, 6, 0, 0, 64, 32, 0.6), this.sheepFurMaterial);
        furHead.position.copy(head.position);
        headPivot.add(furHead);

        const makeLeg = (mat, inflate = 0) => new THREE.Mesh(makeMcBoxGeometry(4, 6, 4, 0, 16, 64, 32, inflate), mat);
        const legPivots = [];
        const furLegMeshes = [];
        const legOffsets = [
            [-3 / 16, 6 / 16, 7 / 16],
            [3 / 16, 6 / 16, 7 / 16],
            [-3 / 16, 6 / 16, -5 / 16],
            [3 / 16, 6 / 16, -5 / 16]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg(this.sheepMaterial, 0);
            leg.position.set(0, -3 / 16, 0);
            lp.add(leg);
            const furLeg = makeLeg(this.sheepFurMaterial, 0.5);
            furLeg.position.copy(leg.position);
            lp.add(furLeg);
            root.add(lp);
            legPivots.push(lp);
            furLegMeshes.push(furLeg);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        root.scale.setScalar(SHEEP_VISUAL_SCALE);

        return { root, headPivot, legPivots, furMeshes: [furBody, furHead, ...furLegMeshes] };
    }

    spawnSheep(x, y, z, options = null) {
        const ageTicksOpt = options && Number.isFinite(Number(options.ageTicks)) ? Math.floor(Number(options.ageTicks)) : 0;
        const babyOpt = !!(options && options.isBaby);
        const isBaby = babyOpt || ageTicksOpt < 0;
        const model = this.createSheepModel();
        const fx = this.attachMobFireEffect(model.root, SHEEP_FIRE_SURFACE_PARTS);
        model.root.scale.setScalar(SHEEP_VISUAL_SCALE * (isBaby ? PASSIVE_BABY_SCALE : 1.0));
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const fleeceColor = getRandomFleeceColor();
        const tint = SHEEP_FLEECE_COLORS[fleeceColor] || SHEEP_FLEECE_COLORS[0];
        for (const mesh of model.furMeshes) {
            if (!mesh || !mesh.material) continue;
            mesh.material = mesh.material.clone();
            mesh.material.color.setRGB(tint[0], tint[1], tint[2]);
        }
        const sheep = {
            ...model,
            fireGroup: fx.fireGroup,
            firePlanes: fx.firePlanes,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'sheep',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            sheared: false,
            fleeceColor,
            regrowCheckTimer: 0,
            grazingTimer: 0,
            grazingCooldown: 25.0 + Math.random() * 20.0,
            fleeTimer: 0,
            fleeFromX: x,
            fleeFromZ: z,
            jumpCooldown: 0,
            ageTicks: isBaby ? (ageTicksOpt || PASSIVE_BABY_AGE_TICKS) : 0,
            isBaby,
            health: 10,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            loveTicks: 0,
            breedCooldownTicks: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false
        };
        this.sheep.push(sheep);
    }

    createCowModel() {
        const root = new THREE.Group();
        const mat = this.cowMaterial;

        // Jacobo ModelCow:
        // body 12x18x10 @ (18,4), head 8x8x6 @ (0,0), horns 1x3x1 @ (22,0), udder 4x6x2 @ (52,0)
        // Cow body uses explicit face UVs so front/back are vertically aligned with Jacobo.
        const body = new THREE.Mesh(makeSkinnedBoxGeometry(12 / 16, 18 / 16, 10 / 16, {
            // Base unwrap from texU=18, texV=4, w=12, h=18, d=10:
            // left  [18,14]-[28,32]
            // front [28,14]-[40,32]
            // right [40,14]-[50,32]
            // back  [50,14]-[62,32]
            // top   [28, 4]-[40,14]
            // bottom[40, 4]-[52,14]
            right: [40, 14, 50, 32],
            left: [18, 14, 28, 32],
            // After body X-rotation, these map to the rear/front end-caps in world space.
            top: [28, 14, 40, 4],
            bottom: [40, 14, 52, 4],
            front: [28, 14, 40, 32],
            back: [50, 14, 62, 32]
        }), mat);
        // Move torso forward by 1 texel for parity.
        body.position.set(0, 1.0, 1 / 16);
        body.rotation.x = -Math.PI * 0.5;
        root.add(body);

        const headPivot = new THREE.Group();
        // Raise head attachment above prior value so neck joins upper torso seam.
        headPivot.position.set(0, 18 / 16, -8 / 16);
        root.add(headPivot);
        const head = new THREE.Mesh(makeMcBoxGeometry(8, 8, 6, 0, 0), mat);
        // ModelRenderer addBox(-4,-4,-6, 8,8,6): center is at z=-3.
        head.position.set(0, 0, -3 / 16);
        headPivot.add(head);

        // Jacobo horns are independent ModelRenderers with rotationPoint(0,3,-7) and addBox(+-4,-5,-4,1,3,1).
        // Relative to headPivot(0,4,-8), that is offset (0,-1,+1), then local horn center at (+/-3.5,-3.5,-3.5).
        const leftHornPivot = new THREE.Group();
        // Convert Jacobo Y-down offsets to our Y-up mesh space.
        leftHornPivot.position.set(0, 1 / 16, 1 / 16);
        const leftHorn = new THREE.Mesh(makeMcBoxGeometry(1, 3, 1, 22, 0), mat);
        leftHorn.position.set(-3.5 / 16, 3.5 / 16, -3.5 / 16);
        leftHornPivot.add(leftHorn);
        headPivot.add(leftHornPivot);
        const rightHornPivot = new THREE.Group();
        rightHornPivot.position.set(0, 1 / 16, 1 / 16);
        const rightHorn = new THREE.Mesh(makeMcBoxGeometry(1, 3, 1, 22, 0), mat);
        rightHorn.position.set(3.5 / 16, 3.5 / 16, -3.5 / 16);
        rightHornPivot.add(rightHorn);
        headPivot.add(rightHornPivot);

        const udderPivot = new THREE.Group();
        udderPivot.position.set(0, 14 / 16, 6 / 16);
        udderPivot.rotation.x = Math.PI * 0.5;
        const udder = new THREE.Mesh(makeMcBoxGeometry(4, 6, 2, 52, 0), mat);
        udder.position.set(0, 0, 1 / 16);
        udderPivot.add(udder);
        root.add(udderPivot);

        const makeLeg = () => new THREE.Mesh(makeMcBoxGeometry(4, 12, 4, 0, 16), mat);
        const legPivots = [];
        const legOffsets = [
            [-4 / 16, 12 / 16, 7 / 16],
            [4 / 16, 12 / 16, 7 / 16],
            [-4 / 16, 12 / 16, -5 / 16],
            [4 / 16, 12 / 16, -5 / 16]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg();
            leg.position.set(0, -6 / 16, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        root.scale.setScalar(COW_VISUAL_SCALE);
        return { root, headPivot, legPivots };
    }

    spawnCow(x, y, z, options = null) {
        const ageTicksOpt = options && Number.isFinite(Number(options.ageTicks)) ? Math.floor(Number(options.ageTicks)) : 0;
        const babyOpt = !!(options && options.isBaby);
        const isBaby = babyOpt || ageTicksOpt < 0;
        const model = this.createCowModel();
        const fx = this.attachMobFireEffect(model.root, COW_FIRE_SURFACE_PARTS);
        model.root.scale.setScalar(COW_VISUAL_SCALE * (isBaby ? PASSIVE_BABY_SCALE : 1.0));
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const cow = {
            ...model,
            fireGroup: fx.fireGroup,
            firePlanes: fx.firePlanes,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'cow',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            ageTicks: isBaby ? (ageTicksOpt || PASSIVE_BABY_AGE_TICKS) : 0,
            isBaby,
            health: 10,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            loveTicks: 0,
            breedCooldownTicks: 0,
            panicTimer: 0,
            panicFromX: x,
            panicFromZ: z,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false
        };
        this.cows.push(cow);
    }

    spawnCowNear(x, z) {
        const y = this.findSpawnY(x, z);
        if (y == null) return false;
        if (this.getLightAt(x, y + 1, z) <= 8) return false;
        if (this.entityIntersectsSolid(x, y, z, COW_RADIUS, COW_HEIGHT)) return false;
        this.spawnCow(x, y, z);
        return true;
    }

    createCreeperModel() {
        const root = new THREE.Group();
        const mat = this.creeperMaterial;
        const body = new THREE.Mesh(makeMcBoxGeometry(8, 12, 4, 16, 16), mat);
        body.position.set(0, 12 / 16, 0);
        root.add(body);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 22 / 16, 0);
        root.add(headPivot);
        const head = new THREE.Mesh(makeMcBoxGeometry(8, 8, 8, 0, 0), mat);
        head.position.set(0, 0, 0);
        headPivot.add(head);

        const legPivots = [];
        const makeLeg = () => new THREE.Mesh(makeMcBoxGeometry(4, 6, 4, 0, 16), mat);
        const legOffsets = [
            [-2 / 16, 6 / 16, 2 / 16],
            [2 / 16, 6 / 16, 2 / 16],
            [-2 / 16, 6 / 16, -2 / 16],
            [2 / 16, 6 / 16, -2 / 16]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg();
            leg.position.set(0, -3 / 16, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, headPivot, legPivots };
    }

    spawnCreeper(x, y, z) {
        const model = this.createCreeperModel();
        const fx = this.attachMobFireEffect(model.root, CREEPER_FIRE_SURFACE_PARTS);
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const creeper = {
            ...model,
            fireGroup: fx.fireGroup,
            firePlanes: fx.firePlanes,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'creeper',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            health: 20,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false,
            fuseTimer: 0,
            swelling: false,
            exploded: false,
            target: null
        };
        this.creepers.push(creeper);
    }

    spawnCreeperNear(x, z) {
        const y = this.findMonsterSpawnY(x, z);
        if (y == null) return false;
        if (this.entityIntersectsSolid(x, y, z, CREEPER_RADIUS, CREEPER_HEIGHT)) return false;
        this.spawnCreeper(x, y, z);
        return true;
    }

    createZombieModel() {
        const root = new THREE.Group();
        const mat = this.zombieMaterial;
        const body = new THREE.Mesh(makeMcBoxGeometry(8, 12, 4, 16, 16, 64, 32), mat);
        body.position.set(0, 18 / 16, 0);
        root.add(body);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 28 / 16, 0);
        root.add(headPivot);
        const head = new THREE.Mesh(makeMcBoxGeometry(8, 8, 8, 0, 0, 64, 32), mat);
        head.position.set(0, 0, 0);
        headPivot.add(head);

        const leftArm = new THREE.Group();
        leftArm.position.set(6 / 16, 24 / 16, 0);
        const leftArmMesh = new THREE.Mesh(makeMcBoxGeometry(4, 12, 4, 40, 16, 64, 32), mat);
        leftArmMesh.position.set(0, -6 / 16, 0);
        leftArm.add(leftArmMesh);
        root.add(leftArm);

        const rightArm = new THREE.Group();
        rightArm.position.set(-6 / 16, 24 / 16, 0);
        const rightArmMesh = new THREE.Mesh(makeMcBoxGeometry(4, 12, 4, 40, 16, 64, 32), mat);
        rightArmMesh.position.set(0, -6 / 16, 0);
        rightArm.add(rightArmMesh);
        root.add(rightArm);

        const legPivots = [];
        const makeLeg = () => new THREE.Mesh(makeMcBoxGeometry(4, 12, 4, 0, 16, 64, 32), mat);
        const legOffsets = [
            [-2 / 16, 12 / 16, 0],
            [2 / 16, 12 / 16, 0]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg();
            leg.position.set(0, -6 / 16, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, headPivot, leftArm, rightArm, legPivots };
    }

    spawnZombie(x, y, z, opts = null) {
        const giant = !!opts?.giant;
        const model = this.createZombieModel();
        if (giant) model.root.scale.setScalar(GIANT_SCALE);
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const zombie = {
            ...model,
            pos: new THREE.Vector3(x, y, z),
            radius: giant ? GIANT_RADIUS : ZOMBIE_RADIUS,
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: giant ? 'giant' : 'zombie',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            health: giant ? GIANT_HEALTH : 20,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false,
            attackCooldown: 0,
            giant,
            target: null
        };
        this.zombies.push(zombie);
    }

    spawnZombieNear(x, z) {
        const y = this.findMonsterSpawnY(x, z);
        if (y == null) return false;
        if (this.entityIntersectsSolid(x, y, z, ZOMBIE_RADIUS, ZOMBIE_HEIGHT)) return false;
        this.spawnZombie(x, y, z);
        return true;
    }

    createSpiderModel() {
        const root = new THREE.Group();
        const mat = this.spiderMaterial;
        const bodyFront = new THREE.Mesh(makeMcBoxGeometry(8, 8, 8, 32, 4, 64, 32), mat);
        bodyFront.position.set(0, 9 / 16, -5 / 16);
        root.add(bodyFront);
        const eyeOverlay = new THREE.Mesh(makeMcBoxGeometry(8, 8, 8, 32, 4, 64, 32), this.spiderEyesMaterial);
        eyeOverlay.position.set(0, 9 / 16, -5 / 16);
        root.add(eyeOverlay);
        const bodyRear = new THREE.Mesh(makeMcBoxGeometry(10, 8, 12, 0, 12, 64, 32), mat);
        bodyRear.position.set(0, 9 / 16, 4 / 16);
        root.add(bodyRear);

        const legPivots = [];
        const makeLeg = () => new THREE.Mesh(makeMcBoxGeometry(16, 2, 2, 18, 0, 64, 32), mat);
        const legDefs = [
            { x: -4 / 16, z: -4 / 16, yaw: 0.70, roll: 0.45 },
            { x: 4 / 16, z: -4 / 16, yaw: -0.70, roll: -0.45 },
            { x: -4 / 16, z: -1 / 16, yaw: 0.42, roll: 0.24 },
            { x: 4 / 16, z: -1 / 16, yaw: -0.42, roll: -0.24 },
            { x: -4 / 16, z: 2 / 16, yaw: -0.42, roll: 0.24 },
            { x: 4 / 16, z: 2 / 16, yaw: 0.42, roll: -0.24 },
            { x: -4 / 16, z: 5 / 16, yaw: -0.70, roll: 0.45 },
            { x: 4 / 16, z: 5 / 16, yaw: 0.70, roll: -0.45 }
        ];
        for (const def of legDefs) {
            const lp = new THREE.Group();
            lp.position.set(def.x, 8 / 16, def.z);
            lp.rotation.y = def.yaw;
            lp.rotation.z = def.roll;
            const leg = makeLeg();
            leg.position.set(def.x < 0 ? -8 / 16 : 8 / 16, 0, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, legPivots };
    }

    spawnSpider(x, y, z) {
        const model = this.createSpiderModel();
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const spider = {
            ...model,
            pos: new THREE.Vector3(x, y, z),
            radius: SPIDER_RADIUS,
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'spider',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            health: 16,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false,
            pounceCooldown: 0,
            aggroTimer: 0,
            target: null
        };
        this.spiders.push(spider);
    }

    spawnSpiderNear(x, z) {
        const y = this.findMonsterSpawnY(x, z);
        if (y == null) return false;
        if (this.entityIntersectsSolid(x, y, z, SPIDER_RADIUS, SPIDER_HEIGHT)) return false;
        this.spawnSpider(x, y, z);
        return true;
    }

    createSkeletonModel() {
        const root = new THREE.Group();
        const mat = this.skeletonMaterial;
        const body = new THREE.Mesh(makeMcBoxGeometry(8, 12, 4, 16, 16, 64, 32), mat);
        body.position.set(0, 18 / 16, 0);
        root.add(body);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 28 / 16, 0);
        root.add(headPivot);
        const head = new THREE.Mesh(makeMcBoxGeometry(8, 8, 8, 0, 0, 64, 32), mat);
        head.position.set(0, 0, 0);
        headPivot.add(head);

        const leftArm = new THREE.Group();
        leftArm.position.set(5 / 16, 24 / 16, 0);
        const leftArmMesh = new THREE.Mesh(makeMcBoxGeometry(2, 12, 2, 40, 16, 64, 32), mat);
        leftArmMesh.position.set(0, -6 / 16, 0);
        leftArm.add(leftArmMesh);
        root.add(leftArm);

        const rightArm = new THREE.Group();
        rightArm.position.set(-5 / 16, 24 / 16, 0);
        const rightArmMesh = new THREE.Mesh(makeMcBoxGeometry(2, 12, 2, 40, 16, 64, 32), mat);
        rightArmMesh.position.set(0, -6 / 16, 0);
        rightArm.add(rightArmMesh);
        root.add(rightArm);

        const legPivots = [];
        const makeLeg = () => new THREE.Mesh(makeMcBoxGeometry(2, 12, 2, 0, 16, 64, 32), mat);
        const legOffsets = [
            [-2 / 16, 12 / 16, 0],
            [2 / 16, 12 / 16, 0]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg();
            leg.position.set(0, -6 / 16, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, headPivot, leftArm, rightArm, legPivots };
    }

    spawnSkeleton(x, y, z) {
        const model = this.createSkeletonModel();
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const sk = {
            ...model,
            pos: new THREE.Vector3(x, y, z),
            radius: SKELETON_RADIUS,
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'skeleton',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            health: 20,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false,
            attackCooldown: 0,
            isAiming: false,
            target: null
        };
        this.skeletons.push(sk);
    }

    setMobTargetFromPlayer(entity, playerPos) {
        if (!entity || !playerPos) return;
        if (!entity.target) entity.target = { x: 0, y: 0, z: 0 };
        entity.target.x = playerPos.x;
        entity.target.y = playerPos.y;
        entity.target.z = playerPos.z;
    }

    clearMobTarget(entity) {
        if (!entity) return;
        entity.target = null;
    }

    onPlayerDamaged(ctx = null) {
        const attacker = ctx && ctx.attacker ? ctx.attacker : null;
        if (!attacker || attacker._dead || !attacker.mobType) return;
        const ownerPos = this.lastPlayerPos;
        if (!ownerPos) return;
        const aggroRadiusSq = 24 * 24;
        for (const w of this.wolves) {
            if (!w || w._dead || !w.tamed || w.sitting || w.ownerId !== PLAYER_OWNER_ID) continue;
            const dx = w.pos.x - ownerPos.x;
            const dy = w.pos.y - ownerPos.y;
            const dz = w.pos.z - ownerPos.z;
            if ((dx * dx + dy * dy + dz * dz) > aggroRadiusSq) continue;
            w.ownerTarget = attacker;
            w.aiTimer = 0;
        }
    }

    spawnSkeletonNear(x, z) {
        const y = this.findMonsterSpawnY(x, z);
        if (y == null) return false;
        if (this.entityIntersectsSolid(x, y, z, SKELETON_RADIUS, SKELETON_HEIGHT)) return false;
        this.spawnSkeleton(x, y, z);
        return true;
    }

    createZombiePigmanModel() {
        const root = new THREE.Group();
        const mat = this.pigZombieMaterial;
        const body = new THREE.Mesh(makeMcBoxGeometry(8, 12, 4, 16, 16, 64, 32), mat);
        body.position.set(0, 18 / 16, 0);
        root.add(body);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 28 / 16, 0);
        root.add(headPivot);
        const head = new THREE.Mesh(makeMcBoxGeometry(8, 8, 8, 0, 0, 64, 32), mat);
        head.position.set(0, 0, 0);
        headPivot.add(head);

        const leftArm = new THREE.Group();
        leftArm.position.set(6 / 16, 24 / 16, 0);
        const leftArmMesh = new THREE.Mesh(makeMcBoxGeometry(4, 12, 4, 40, 16, 64, 32), mat);
        leftArmMesh.position.set(0, -6 / 16, 0);
        leftArm.add(leftArmMesh);
        root.add(leftArm);

        const rightArm = new THREE.Group();
        rightArm.position.set(-6 / 16, 24 / 16, 0);
        const rightArmMesh = new THREE.Mesh(makeMcBoxGeometry(4, 12, 4, 40, 16, 64, 32), mat);
        rightArmMesh.position.set(0, -6 / 16, 0);
        rightArm.add(rightArmMesh);
        // Visual parity baseline: zombie pigmen hold a gold sword.
        const swordMat = new THREE.MeshLambertMaterial({ color: 0xd9b33b });
        const swordBlade = new THREE.Mesh(new THREE.BoxGeometry(2 / 16, 11 / 16, 1 / 16), swordMat);
        swordBlade.position.set(-2 / 16, -10 / 16, -1 / 16);
        const swordGuard = new THREE.Mesh(new THREE.BoxGeometry(4 / 16, 1 / 16, 1 / 16), swordMat);
        swordGuard.position.set(-2 / 16, -4 / 16, -1 / 16);
        rightArm.add(swordBlade);
        rightArm.add(swordGuard);
        root.add(rightArm);

        const legPivots = [];
        const makeLeg = () => new THREE.Mesh(makeMcBoxGeometry(4, 12, 4, 0, 16, 64, 32), mat);
        const legOffsets = [
            [-2 / 16, 12 / 16, 0],
            [2 / 16, 12 / 16, 0]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg();
            leg.position.set(0, -6 / 16, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, headPivot, leftArm, rightArm, legPivots };
    }

    spawnZombiePigman(x, y, z) {
        const model = this.createZombiePigmanModel();
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const pigman = {
            ...model,
            pos: new THREE.Vector3(x, y, z),
            radius: ZOMBIE_PIGMAN_RADIUS,
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'zombie_pigman',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            health: 20,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false,
            attackCooldown: 0,
            angry: false,
            angryTimer: 0,
            target: null
        };
        this.zombiePigmen.push(pigman);
    }

    spawnZombiePigmanNear(x, z) {
        if (this.getDimension && this.getDimension() !== 'NETHER') return false;
        const y = this.findPigmanSpawnY(x, z);
        if (y == null) return false;
        if (this.lastPlayerPos) {
            const dx = x - this.lastPlayerPos.x;
            const dz = z - this.lastPlayerPos.z;
            const dy = y - (Number.isFinite(this.lastPlayerPos.y) ? this.lastPlayerPos.y : y);
            if ((dx * dx + dy * dy + dz * dz) < (MIN_PLAYER_SPAWN_DIST * MIN_PLAYER_SPAWN_DIST)) return false;
        }
        const supportId = this.chunkManager.getBlock(x, y - 1, z);
        if (!(isNetherrackId(supportId) || supportId === 88)) return false;
        if (this.entityIntersectsSolid(x, y, z, ZOMBIE_PIGMAN_RADIUS, ZOMBIE_PIGMAN_HEIGHT)) return false;
        if (this.entityVolumeHasLiquid(x, y, z, ZOMBIE_PIGMAN_RADIUS, ZOMBIE_PIGMAN_HEIGHT)) return false;
        this.spawnZombiePigman(x, y, z);
        return true;
    }

    getSlimeRadiusForSize(size = 2) {
        return Math.max(0.25, 0.26 * Number(size || 1));
    }

    getSlimeHeightForSize(size = 2) {
        return Math.max(0.5, 0.52 * Number(size || 1));
    }

    getSlimeHealthForSize(size = 2) {
        const s = Math.max(1, Number(size || 1));
        return s * s;
    }

    createSlimeModel(size = 2) {
        const s = Math.max(1, Number(size || 1));
        const root = new THREE.Group();
        const visualRoot = new THREE.Group();
        root.add(visualRoot);

        const outerBody = new THREE.Mesh(makeMcBoxGeometry(8, 8, 8, 0, 16, 64, 32), this.slimeOuterMaterial);
        outerBody.position.set(0, 4 / 16, 0);
        outerBody.renderOrder = 2;
        visualRoot.add(outerBody);

        const innerBody = new THREE.Mesh(makeMcBoxGeometry(6, 6, 6, 0, 0, 64, 32), this.slimeInnerMaterial);
        innerBody.position.set(0, 4 / 16, 0);
        innerBody.renderOrder = 1;
        visualRoot.add(innerBody);

        const rightEye = new THREE.Mesh(makeMcBoxGeometry(2, 2, 2, 32, 0, 64, 32), this.slimeInnerMaterial);
        rightEye.position.set(2.25 / 16, 41 / 128, -2.5 / 16);
        rightEye.renderOrder = 1;
        visualRoot.add(rightEye);

        const leftEye = new THREE.Mesh(makeMcBoxGeometry(2, 2, 2, 32, 4, 64, 32), this.slimeInnerMaterial);
        leftEye.position.set(-2.25 / 16, 41 / 128, -2.5 / 16);
        leftEye.renderOrder = 1;
        visualRoot.add(leftEye);

        const mouth = new THREE.Mesh(makeMcBoxGeometry(1, 1, 1, 32, 8, 64, 32), this.slimeInnerMaterial);
        mouth.position.set(-1 / 32, 21 / 128, -3 / 16);
        mouth.renderOrder = 1;
        visualRoot.add(mouth);

        visualRoot.scale.setScalar(s);

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, visualRoot };
    }

    spawnSlime(x, y, z, size = 2) {
        const s = Math.max(1, Math.min(4, Number(size || 2) | 0));
        const model = this.createSlimeModel(s);
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const slime = {
            ...model,
            size: s,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'slime',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            health: this.getSlimeHealthForSize(s),
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false,
            attackCooldown: 0,
            wasGrounded: false,
            squish: 0,
            squishVel: 0
        };
        this.slimes.push(slime);
    }

    spawnSlimeNear(x, z) {
        if (this.getDimension && this.getDimension() !== 'OVERWORLD') return false;
        const y = this.findMonsterSpawnY(x, z);
        if (y == null) return false;
        if (y > 40) return false;
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        if (this.isSlimeChunk && !this.isSlimeChunk(cx, cz)) return false;
        const size = 2;
        const radius = this.getSlimeRadiusForSize(size);
        const height = this.getSlimeHeightForSize(size);
        if (this.entityIntersectsSolid(x, y, z, radius, height)) return false;
        if (this.entityVolumeHasLiquid(x, y, z, radius, height)) return false;
        this.spawnSlime(x, y, z, size);
        return true;
    }

    createGhastModel() {
        const root = new THREE.Group();
        const mat = this.ghastMaterial;
        const body = new THREE.Mesh(makeMcBoxGeometry(16, 16, 16, 0, 0, 64, 32), mat);
        body.position.set(0, 1.45, 0);
        root.add(body);
        const tentacles = [];
        const meshes = [body];
        for (let i = 0; i < 9; i++) {
            const tx = ((i % 3) - 1) * 0.62;
            const tz = (Math.floor(i / 3) - 1) * 0.62;
            const len = 8 + Math.floor(Math.random() * 7); // 8..14
            const pivot = new THREE.Group();
            pivot.position.set(tx, 0.75, tz);
            const tentacle = new THREE.Mesh(makeMcBoxGeometry(2, len, 2, 0, 16, 64, 32), mat);
            tentacle.position.set(0, -(len / 32), 0);
            pivot.add(tentacle);
            root.add(pivot);
            tentacles.push(pivot);
            meshes.push(tentacle);
        }
        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, tentacles, meshes };
    }

    spawnGhast(x, y, z) {
        const model = this.createGhastModel();
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const g = {
            ...model,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'ghast',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            health: 10,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false,
            attackCounter: 0,
            prevAttackCounter: 0,
            attackTickAccumulator: 0,
            isCharging: false,
            courseChangeCooldown: 0,
            target: null,
            _hoverTargetX: x,
            _hoverTargetY: y,
            _hoverTargetZ: z,
            _bobPhase: Math.random() * Math.PI * 2
        };
        this.ghasts.push(g);
    }

    updateGhastAppearance(g) {
        if (!g || !Array.isArray(g.meshes)) return;
        const charging = (Number(g.attackCounter) || 0) > 10;
        if (g._chargingVisual === charging) return;
        g._chargingVisual = charging;
        const mat = charging ? this.ghastChargeMaterial : this.ghastMaterial;
        for (const m of g.meshes) {
            if (!m || !m.isMesh) continue;
            m.material = mat;
        }
    }

    spawnGhastNear(x, z) {
        if (this.getDimension && this.getDimension() !== 'NETHER') return false;
        if (Math.floor(Math.random() * 20) !== 0) return false;
        const gcx = Math.floor(x / CHUNK_SIZE);
        const gcz = Math.floor(z / CHUNK_SIZE);
        for (const g of this.ghasts) {
            if (!g || g._dead) continue;
            if (Math.floor(g.pos.x / CHUNK_SIZE) === gcx && Math.floor(g.pos.z / CHUNK_SIZE) === gcz) return false;
        }
        const y = Math.floor((WORLD_DEPTH + 4) + Math.random() * Math.max(1, (WORLD_HEIGHT - WORLD_DEPTH - 8)));
        if (!this.canSpawnGhastAt(x, y, z, null)) return false;
        this.spawnGhast(x, y, z);
        return true;
    }

    canSpawnGhastAt(x, y, z, playerPos = null) {
        if (this.getDimension && this.getDimension() !== 'NETHER') return false;
        const gcx = Math.floor(x / CHUNK_SIZE);
        const gcz = Math.floor(z / CHUNK_SIZE);
        let ghastsInChunk = 0;
        for (const g of this.ghasts) {
            if (!g || g._dead) continue;
            if (Math.floor(g.pos.x / CHUNK_SIZE) === gcx && Math.floor(g.pos.z / CHUNK_SIZE) === gcz) {
                ghastsInChunk++;
                if (ghastsInChunk >= 1) return false;
            }
        }
        if (playerPos) {
            const dx = x - playerPos.x;
            const dz = z - playerPos.z;
            const dy = y - (Number.isFinite(playerPos.y) ? playerPos.y : y);
            const d2 = dx * dx + dz * dz + dy * dy;
            if (d2 < MIN_PLAYER_SPAWN_DIST * MIN_PLAYER_SPAWN_DIST) return false;
        }
        if (this.entityIntersectsSolid(x, y, z, GHAST_RADIUS, GHAST_HEIGHT)) return false;
        if (this.entityVolumeHasLiquid(x, y, z, GHAST_RADIUS, GHAST_HEIGHT)) return false;
        return true;
    }

    createSquidModel() {
        const root = new THREE.Group();
        const mat = this.squidMaterial;
        const body = new THREE.Mesh(makeMcBoxGeometry(12, 16, 12, 0, 0, 64, 32), mat);
        body.position.set(0, 0.8, 0);
        root.add(body);
        const tentacles = [];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const tp = new THREE.Group();
            tp.position.set(Math.cos(a) * (5 / 16), 0.3, Math.sin(a) * (5 / 16));
            const t = new THREE.Mesh(makeMcBoxGeometry(2, 18, 2, 48, 0, 64, 32), mat);
            t.position.set(0, -9 / 16, 0);
            tp.add(t);
            root.add(tp);
            tentacles.push(tp);
        }
        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, tentacles };
    }

    spawnSquid(x, y, z) {
        const model = this.createSquidModel();
        const fx = this.attachMobFireEffect(model.root, SQUID_FIRE_SURFACE_PARTS);
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const rotationVelocity = 1.0 / (Math.random() + 1.0) * 0.2;
        const angle = Math.random() * Math.PI * 2;
        const squid = {
            ...model,
            fireGroup: fx.fireGroup,
            firePlanes: fx.firePlanes,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            pitch: 0,
            targetYaw: Math.random() * Math.PI * 2,
            targetPitch: 0,
            walkSpeed: 0,
            mobType: 'squid',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            squidRotation: 0,
            prevSquidRotation: 0,
            tentacleAngle: 0,
            lastTentacleAngle: 0,
            randomMotionSpeed: 0,
            rotateSpeed: 0,
            rotationVelocity,
            randomMotionVecX: Math.cos(angle) * 0.2,
            randomMotionVecY: -0.1 + Math.random() * 0.2,
            randomMotionVecZ: Math.sin(angle) * 0.2,
            motionUpdateTicks: 50,
            health: 10,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            panicTimer: 0,
            panicFromX: x,
            panicFromZ: z,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false
        };
        this.squids.push(squid);
    }

    randomizeSquidMotionVector(sq) {
        const angle = Math.random() * Math.PI * 2;
        sq.randomMotionVecX = Math.cos(angle) * 0.2;
        sq.randomMotionVecY = -0.1 + Math.random() * 0.2;
        sq.randomMotionVecZ = Math.sin(angle) * 0.2;
        sq.motionUpdateTicks = 50;
    }

    findWaterSpawnY(x, z) {
        const bx = worldToBlock(x);
        const bz = worldToBlock(z);
        for (let y = WORLD_HEIGHT - 4; y >= WORLD_DEPTH + 4; y--) {
            const id = this.chunkManager.getBlock(bx, y, bz);
            if (!isWaterId(id)) continue;
            if (isWaterId(this.chunkManager.getBlock(bx, y - 1, bz)) && isWaterId(this.chunkManager.getBlock(bx, y + 1, bz))) {
                return y + 0.1;
            }
        }
        return null;
    }

    spawnSquidNear(x, z) {
        if (this.getDimension && this.getDimension() !== 'OVERWORLD') return false;
        const y = this.findWaterSpawnY(x, z);
        if (y == null) return false;
        const by = worldToBlock(y);
        // Jacobo squid spawn band baseline: around sea-level water depths.
        if (by < 45 || by > 63) return false;
        if (!isWaterId(this.chunkManager.getBlock(worldToBlock(x), by, worldToBlock(z)))) return false;
        if (this.entityIntersectsSolid(x, y, z, SQUID_RADIUS, SQUID_HEIGHT)) return false;
        if (!this.entitySampledVolumeIsWater(x, y, z, SQUID_RADIUS, SQUID_HEIGHT)) return false;
        this.spawnSquid(x, y, z);
        return true;
    }

    createWolfModel() {
        const root = new THREE.Group();
        const mat = this.wolfMaterial;

        const body = new THREE.Mesh(makeMcBoxGeometry(6, 9, 6, 18, 14), mat);
        body.position.set(0, 8 / 16, 2 / 16);
        body.rotation.x = -Math.PI * 0.5;
        root.add(body);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 8 / 16, -7 / 16);
        root.add(headPivot);
        const head = new THREE.Mesh(makeMcBoxGeometry(6, 6, 4, 0, 0), mat);
        head.position.set(0, 0, 0);
        headPivot.add(head);

        const tailPivot = new THREE.Group();
        tailPivot.position.set(0, 8 / 16, 7 / 16);
        const tail = new THREE.Mesh(makeMcBoxGeometry(2, 8, 2, 9, 18), mat);
        tail.position.set(0, -4 / 16, 0);
        tailPivot.add(tail);
        root.add(tailPivot);

        const makeLeg = () => new THREE.Mesh(makeMcBoxGeometry(2, 8, 2, 0, 18), mat);
        const legPivots = [];
        const legOffsets = [
            [-2 / 16, 4 / 16, 4 / 16],
            [2 / 16, 4 / 16, 4 / 16],
            [-2 / 16, 4 / 16, -2 / 16],
            [2 / 16, 4 / 16, -2 / 16]
        ];
        for (const o of legOffsets) {
            const lp = new THREE.Group();
            lp.position.set(o[0], o[1], o[2]);
            const leg = makeLeg();
            leg.position.set(0, -4 / 16, 0);
            lp.add(leg);
            root.add(lp);
            legPivots.push(lp);
        }

        root.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
        });
        return { root, headPivot, tailPivot, legPivots };
    }

    spawnWolf(x, y, z) {
        const model = this.createWolfModel();
        const fx = this.attachMobFireEffect(model.root, WOLF_FIRE_SURFACE_PARTS);
        const wolfMeshes = [];
        model.root.traverse((obj) => {
            if (!obj || !obj.isMesh) return;
            wolfMeshes.push(obj);
        });
        model.root.position.set(x, y, z);
        this.scene.add(model.root);
        const wolf = {
            ...model,
            meshes: wolfMeshes,
            fireGroup: fx.fireGroup,
            firePlanes: fx.firePlanes,
            pos: new THREE.Vector3(x, y, z),
            radius: WOLF_RADIUS,
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.random() * Math.PI * 2,
            targetYaw: Math.random() * Math.PI * 2,
            walkSpeed: 0,
            mobType: 'wolf',
            aiTimer: 0,
            limbPhase: Math.random() * Math.PI * 2,
            jumpCooldown: 0,
            health: WOLF_HEALTH_WILD,
            hurtTimer: 0,
            hurtCooldown: 0,
            deathTimer: 0,
            burnTimer: 0,
            burnDamageTimer: 0,
            wasInLava: false,
            tamed: false,
            sitting: false,
            angry: false,
            angryTimer: 0,
            ownerId: null,
            ownerTarget: null,
            sheepAttackCooldown: 0,
            followTeleportCooldown: 0,
            attackCooldown: 0
        };
        this.updateWolfAppearance(wolf);
        this.wolves.push(wolf);
    }

    updateWolfAppearance(wolf) {
        if (!wolf) return;
        const mat = wolf.angry
            ? this.wolfAngryMaterial
            : (wolf.tamed ? this.wolfTameMaterial : this.wolfMaterial);
        if (Array.isArray(wolf.meshes) && wolf.meshes.length > 0) {
            for (const mesh of wolf.meshes) {
                if (!mesh || !mesh.isMesh) continue;
                mesh.material = mat;
            }
        }
    }

    spawnWolfNear(x, z) {
        const y = this.findSpawnY(x, z);
        if (y == null) return false;
        if (this.getLightAt(x, y + 1, z) <= 8) return false;
        if (this.entityIntersectsSolid(x, y, z, WOLF_RADIUS, WOLF_HEIGHT)) return false;
        this.spawnWolf(x, y, z);
        return true;
    }

    spawnPigNear(x, z) {
        const y = this.findSpawnY(x, z);
        if (y == null) return false;
        if (this.getLightAt(x, y + 1, z) <= 8) return false;
        if (this.entityIntersectsSolid(x, y, z, PIG_RADIUS, PIG_HEIGHT)) return false;
        this.spawnPig(x, y, z);
        return true;
    }

    spawnChickenNear(x, z) {
        const y = this.findSpawnY(x, z);
        if (y == null) return false;
        if (this.getLightAt(x, y + 1, z) <= 8) return false;
        if (this.entityIntersectsSolid(x, y, z, CHICKEN_RADIUS, CHICKEN_HEIGHT)) return false;
        this.spawnChicken(x, y, z);
        return true;
    }

    spawnSheepNear(x, z) {
        const y = this.findSpawnY(x, z);
        if (y == null) return false;
        if (this.getLightAt(x, y + 1, z) <= 8) return false;
        if (this.entityIntersectsSolid(x, y, z, SHEEP_RADIUS, SHEEP_HEIGHT)) return false;
        this.spawnSheep(x, y, z);
        return true;
    }

    spawnMobNear(type, x, z, y = null, force = false) {
        const t = String(type || '').toLowerCase();
        const markLastSpawnedPersistent = (bucket) => {
            if (!Array.isArray(bucket) || bucket.length <= 0) return;
            const ent = bucket[bucket.length - 1];
            if (!ent) return;
            ent._persistenceRequired = true;
            ent._despawnAgeTicks = 0;
            ent._forceDespawn = false;
        };
        if (t === 'pig') {
            if (force && Number.isFinite(y)) {
                this.spawnPig(x, y, z);
                markLastSpawnedPersistent(this.pigs);
                return { ok: true, msg: 'Spawned pig.' };
            }
            const ok = this.spawnPigNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned pig.' }
                : { ok: false, msg: 'Failed to find valid pig spawn spot here.' };
        }
        if (t === 'chicken') {
            if (force && Number.isFinite(y)) {
                this.spawnChicken(x, y, z);
                markLastSpawnedPersistent(this.chickens);
                return { ok: true, msg: 'Spawned chicken.' };
            }
            const ok = this.spawnChickenNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned chicken.' }
                : { ok: false, msg: 'Failed to find valid chicken spawn spot here.' };
        }
        if (t === 'sheep') {
            if (force && Number.isFinite(y)) {
                this.spawnSheep(x, y, z);
                markLastSpawnedPersistent(this.sheep);
                return { ok: true, msg: 'Spawned sheep.' };
            }
            const ok = this.spawnSheepNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned sheep.' }
                : { ok: false, msg: 'Failed to find valid sheep spawn spot here.' };
        }
        if (t === 'cow') {
            if (force && Number.isFinite(y)) {
                this.spawnCow(x, y, z);
                markLastSpawnedPersistent(this.cows);
                return { ok: true, msg: 'Spawned cow.' };
            }
            const ok = this.spawnCowNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned cow.' }
                : { ok: false, msg: 'Failed to find valid cow spawn spot here.' };
        }
        if (t === 'squid') {
            if (force && Number.isFinite(y)) {
                this.spawnSquid(x, y, z);
                markLastSpawnedPersistent(this.squids);
                return { ok: true, msg: 'Spawned squid.' };
            }
            const ok = this.spawnSquidNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned squid.' }
                : { ok: false, msg: 'Failed to find valid squid spawn spot here.' };
        }
        if (t === 'wolf') {
            if (force && Number.isFinite(y)) {
                this.spawnWolf(x, y, z);
                markLastSpawnedPersistent(this.wolves);
                return { ok: true, msg: 'Spawned wolf.' };
            }
            const ok = this.spawnWolfNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned wolf.' }
                : { ok: false, msg: 'Failed to find valid wolf spawn spot here.' };
        }
        if (t === 'creeper') {
            if (force && Number.isFinite(y)) {
                this.spawnCreeper(x, y, z);
                markLastSpawnedPersistent(this.creepers);
                return { ok: true, msg: 'Spawned creeper.' };
            }
            const ok = this.spawnCreeperNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned creeper.' }
                : { ok: false, msg: 'Failed to find valid creeper spawn spot here.' };
        }
        if (t === 'zombie') {
            if (force && Number.isFinite(y)) {
                this.spawnZombie(x, y, z);
                markLastSpawnedPersistent(this.zombies);
                return { ok: true, msg: 'Spawned zombie.' };
            }
            const ok = this.spawnZombieNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned zombie.' }
                : { ok: false, msg: 'Failed to find valid zombie spawn spot here.' };
        }
        if (t === 'giant' || t === 'giant_zombie' || t === 'giantzombie') {
            if (force && Number.isFinite(y)) {
                this.spawnZombie(x, y, z, { giant: true });
                markLastSpawnedPersistent(this.zombies);
                return { ok: true, msg: 'Spawned giant zombie.' };
            }
            const yg = this.findSpawnY(x, z);
            if (yg == null) return { ok: false, msg: 'Failed to find valid giant zombie spawn spot here.' };
            if (this.entityIntersectsSolid(x, yg, z, GIANT_RADIUS, GIANT_HEIGHT)) {
                return { ok: false, msg: 'Failed to find valid giant zombie spawn spot here.' };
            }
            this.spawnZombie(x, yg, z, { giant: true });
            return { ok: true, msg: 'Spawned giant zombie.' };
        }
        if (t === 'spider') {
            if (force && Number.isFinite(y)) {
                this.spawnSpider(x, y, z);
                markLastSpawnedPersistent(this.spiders);
                return { ok: true, msg: 'Spawned spider.' };
            }
            const ok = this.spawnSpiderNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned spider.' }
                : { ok: false, msg: 'Failed to find valid spider spawn spot here.' };
        }
        if (t === 'skeleton') {
            if (force && Number.isFinite(y)) {
                this.spawnSkeleton(x, y, z);
                markLastSpawnedPersistent(this.skeletons);
                return { ok: true, msg: 'Spawned skeleton.' };
            }
            const ok = this.spawnSkeletonNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned skeleton.' }
                : { ok: false, msg: 'Failed to find valid skeleton spawn spot here.' };
        }
        if (t === 'slime') {
            if (force && Number.isFinite(y)) {
                this.spawnSlime(x, y, z, 2);
                markLastSpawnedPersistent(this.slimes);
                return { ok: true, msg: 'Spawned slime.' };
            }
            const ok = this.spawnSlimeNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned slime.' }
                : { ok: false, msg: 'Failed to find valid slime spawn spot here.' };
        }
        if (t === 'ghast') {
            if (force && Number.isFinite(y)) {
                this.spawnGhast(x, y, z);
                markLastSpawnedPersistent(this.ghasts);
                return { ok: true, msg: 'Spawned ghast.' };
            }
            const ok = this.spawnGhastNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned ghast.' }
                : { ok: false, msg: 'Failed to find valid ghast spawn spot here.' };
        }
        if (t === 'zombie_pigman' || t === 'zombiepigman' || t === 'pigman' || t === 'pig zombie') {
            if (force && Number.isFinite(y)) {
                this.spawnZombiePigman(x, y, z);
                markLastSpawnedPersistent(this.zombiePigmen);
                return { ok: true, msg: 'Spawned zombie pigman.' };
            }
            const ok = this.spawnZombiePigmanNear(x, z);
            return ok
                ? { ok: true, msg: 'Spawned zombie pigman.' }
                : { ok: false, msg: 'Failed to find valid zombie pigman spawn spot here.' };
        }
        return { ok: false, msg: `Unknown mob '${type}'. Use pig, chicken, sheep, cow, squid, wolf, creeper, zombie, giant, spider, skeleton, slime, ghast, or pigman.` };
    }

    isChunkLoadedAtBlock(bx, by, bz) {
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(by / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        return this.chunkManager.hasChunk(cx, cy, cz);
    }

    entityIntersectsSolid(x, y, z, radius, height) {
        // Match world's block-center grid (block extents are [n-0.5, n+0.5]).
        const minX = x - radius;
        const maxX = x + radius;
        const minY = y;
        const maxY = y + height;
        const minZ = z - radius;
        const maxZ = z + radius;

        const bx0 = Math.floor(minX + 0.5 + 1e-4);
        const by0 = Math.floor(minY + 0.5 + 1e-4);
        const bz0 = Math.floor(minZ + 0.5 + 1e-4);
        const bx1 = Math.floor(maxX + 0.5 - 1e-4);
        const by1 = Math.floor(maxY + 0.5 - 1e-4);
        const bz1 = Math.floor(maxZ + 0.5 - 1e-4);

        for (let bx = bx0; bx <= bx1; bx++) {
            for (let by = by0; by <= by1; by++) {
                for (let bz = bz0; bz <= bz1; bz++) {
                    // Match player boundary behavior: unloaded chunks behave like solid walls.
                    if (!this.isChunkLoadedAtBlock(bx, by, bz)) return true;
                    if (isSolidBlock(this.chunkManager.getBlock(bx, by, bz))) return true;
                }
            }
        }
        return false;
    }

    entityHasGround(x, y, z, radius) {
        const minX = worldToBlock(x - radius + 1e-4);
        const maxX = worldToBlock(x + radius - 1e-4);
        const minZ = worldToBlock(z - radius + 1e-4);
        const maxZ = worldToBlock(z + radius - 1e-4);
        const by = worldToBlock(y - 0.5 - 1e-4);
        for (let bx = minX; bx <= maxX; bx++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                if (!this.isChunkLoadedAtBlock(bx, by, bz)) return true;
                if (isSolidBlock(this.chunkManager.getBlock(bx, by, bz))) return true;
            }
        }
        return false;
    }

    findSpawnY(x, z) {
        const bx = worldToBlock(x);
        const bz = worldToBlock(z);
        for (let y = WORLD_HEIGHT - 2; y >= WORLD_DEPTH + 2; y--) {
            const id = this.chunkManager.getBlock(bx, y, bz);
            if (id === 1) {
                const a1 = this.chunkManager.getBlock(bx, y + 1, bz);
                const a2 = this.chunkManager.getBlock(bx, y + 2, bz);
                if (a1 === 0 && a2 === 0) return y + 0.5;
                return null;
            }
        }
        return null;
    }

    findMonsterSpawnY(x, z) {
        const bx = worldToBlock(x);
        const bz = worldToBlock(z);
        for (let y = WORLD_HEIGHT - 2; y >= WORLD_DEPTH + 2; y--) {
            const floorId = this.chunkManager.getBlock(bx, y, bz);
            if (!isSolidBlock(floorId)) continue;
            const a1 = this.chunkManager.getBlock(bx, y + 1, bz);
            const a2 = this.chunkManager.getBlock(bx, y + 2, bz);
            if (a1 === 0 && a2 === 0) return y + 0.5;
        }
        return null;
    }


    findPigmanSpawnY(x, z) {
        const bx = worldToBlock(x);
        const bz = worldToBlock(z);
        for (let y = WORLD_HEIGHT - 2; y >= WORLD_DEPTH + 2; y--) {
            const floorId = this.chunkManager.getBlock(bx, y, bz);
            if (!(isNetherrackId(floorId) || floorId === 88)) continue;
            const a1 = this.chunkManager.getBlock(bx, y + 1, bz);
            const a2 = this.chunkManager.getBlock(bx, y + 2, bz);
            if (a1 === 0 && a2 === 0) return y + 0.5;
        }
        return null;
    }

    getLightAt(x, y, z) {
        const bx = worldToBlock(x);
        const by = worldToBlock(y);
        const bz = worldToBlock(z);
        if (!this.isChunkLoadedAtBlock(bx, by, bz)) return 0;
        const raw = this.chunkManager.getLight(bx, by, bz);
        let v = Number.isFinite(raw) ? raw : 0;
        // Night-time spawn parity: runtime combined light can retain day-level skylight.
        // Clamp sky-exposed positions to current day/night skylight ceiling.
        const top = this.chunkManager.getHighestBlockY(bx, bz);
        if (Number.isFinite(top) && by > top) {
            const daylight = this.getDaylight01();
            const skyCap = Math.max(4, Math.min(15, Math.round(4 + daylight * 11)));
            v = Math.min(v, skyCap);
        }
        return v;
    }

    getBlockPathWeight(x, y, z) {
        const bx = worldToBlock(x);
        const by = worldToBlock(y);
        const bz = worldToBlock(z);
        const below = this.chunkManager.getBlock(bx, by - 1, bz);
        if (below === 1) return 10.0;
        return (this.getLightAt(bx, by, bz) / 15.0) - 0.5;
    }

    updateWanderTarget(entity) {
        let best = null;
        let bestWeight = -99999.0;
        for (let i = 0; i < 10; i++) {
            const tx = entity.pos.x + (Math.random() * 12 - 6);
            const tz = entity.pos.z + (Math.random() * 12 - 6);
            const ty = this.findSpawnY(tx, tz);
            if (ty == null) continue;
            const w = this.getBlockPathWeight(tx, ty, tz);
            if (w > bestWeight) {
                bestWeight = w;
                best = { x: tx, y: ty, z: tz };
            }
        }
        entity.wanderTarget = best;
    }

    updateGiantWanderTarget(entity) {
        let best = null;
        let bestWeight = -99999.0;
        for (let i = 0; i < 10; i++) {
            const tx = entity.pos.x + (Math.random() * 12 - 6);
            const tz = entity.pos.z + (Math.random() * 12 - 6);
            const ty = this.findSpawnY(tx, tz);
            if (ty == null) continue;
            // Jacobo EntityGiantZombie#getBlockPathWeight:
            // world brightness - 0.5F (no grass preference term).
            const w = (this.getLightAt(tx, ty, tz) / 15.0) - 0.5;
            if (w > bestWeight) {
                bestWeight = w;
                best = { x: tx, y: ty, z: tz };
            }
        }
        entity.wanderTarget = best;
    }

    updateStuckState(entity, dt) {
        const px = Number.isFinite(entity._prevPosX) ? entity._prevPosX : entity.pos.x;
        const pz = Number.isFinite(entity._prevPosZ) ? entity._prevPosZ : entity.pos.z;
        const moved = Math.hypot(entity.pos.x - px, entity.pos.z - pz);
        entity._prevPosX = entity.pos.x;
        entity._prevPosZ = entity.pos.z;
        if (entity.walkSpeed > 0.2 && moved < 0.008) {
            entity._stuckTimer = (entity._stuckTimer || 0) + dt;
        } else {
            entity._stuckTimer = Math.max(0, (entity._stuckTimer || 0) - dt * 0.5);
        }
        if ((entity._stuckTimer || 0) > 0.8) {
            entity._stuckTimer = 0;
            entity.aiTimer = Math.min(entity.aiTimer || 0, 0.15);
            this.updateWanderTarget(entity);
            entity.targetYaw += (Math.random() - 0.5) * Math.PI;
            return true;
        }
        return false;
    }

    isEntityInWaterOrLava(entity, radius = 0.35) {
        const minX = worldToBlock(entity.pos.x - radius);
        const maxX = worldToBlock(entity.pos.x + radius);
        const minZ = worldToBlock(entity.pos.z - radius);
        const maxZ = worldToBlock(entity.pos.z + radius);
        const feetY = worldToBlock(entity.pos.y);
        const bodyY = worldToBlock(entity.pos.y + 0.4);
        for (let bx = minX; bx <= maxX; bx++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                const id0 = this.chunkManager.getBlock(bx, feetY, bz);
                const id1 = this.chunkManager.getBlock(bx, bodyY, bz);
                if (isWaterId(id0) || isLavaId(id0) || isWaterId(id1) || isLavaId(id1)) return true;
            }
        }
        return false;
    }

    getEntityFluidFireContact(entity, radius = 0.35) {
        const minX = worldToBlock(entity.pos.x - radius);
        const maxX = worldToBlock(entity.pos.x + radius);
        const minZ = worldToBlock(entity.pos.z - radius);
        const maxZ = worldToBlock(entity.pos.z + radius);
        // Water/lava contact: only count when the entity body center is actually inside fluid.
        const cx = worldToBlock(entity.pos.x);
        const cz = worldToBlock(entity.pos.z);
        const cFeetY = worldToBlock(entity.pos.y);
        const cBodyY = worldToBlock(entity.pos.y + 0.45);
        const idFeet = this.chunkManager.getBlock(cx, cFeetY, cz);
        const idBody = this.chunkManager.getBlock(cx, cBodyY, cz);
        let water = isWaterId(idFeet) || isWaterId(idBody);
        let lava = isLavaId(idFeet) || isLavaId(idBody);

        // Fire contact: sample broader volume so standing on/inside fire at feet level always ignites.
        const minY = worldToBlock(entity.pos.y - 0.55);
        const maxY = worldToBlock(entity.pos.y + 1.15);
        let fire = false;
        for (let bx = minX; bx <= maxX; bx++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                for (let by = minY; by <= maxY; by++) {
                    const id = this.chunkManager.getBlock(bx, by, bz);
                    if (id === 63) fire = true;
                }
            }
        }
        return { water, lava, fire };
    }

    isEntityInFireOrLava(entity, radius = 0.35) {
        const c = this.getEntityFluidFireContact(entity, radius);
        return c.fire || c.lava;
    }

    applyEntityBurnDamage(entity, dt) {
        if (entity._dead) return;
        if ((entity.burnTimer || 0) <= 0) {
            entity.burnDamageTimer = 0;
            return;
        }
        entity.burnDamageTimer = (entity.burnDamageTimer || 0) + dt;
        while (entity.burnDamageTimer >= BURN_DAMAGE_INTERVAL) {
            entity.burnDamageTimer -= BURN_DAMAGE_INTERVAL;
            entity.health = (entity.health ?? 1) - 1;
            entity.hurtTimer = 0.2;
            if (entity.health <= 0) {
                entity._dead = true;
                entity.deathTimer = 1.0;
                entity.walkSpeed = 0;
                break;
            }
        }
    }

    applyLavaEntryDamage(entity, inLava) {
        if (entity._dead) return;
        const was = !!entity.wasInLava;
        if (inLava && !was) {
            // Jacobo setOnFireFromLava parity: immediate 4 damage on lava entry.
            entity.health = (entity.health ?? 1) - 4;
            entity.hurtTimer = 0.25;
            if (entity.health <= 0) {
                entity._dead = true;
                entity.deathTimer = 1.0;
                entity.walkSpeed = 0;
            }
        }
        entity.wasInLava = !!inLava;
    }

    shouldIgniteUndeadInDaylight(entity, dt, daylight) {
        if (!entity || entity._dead || dt <= 0) return false;
        const b = Number(daylight);
        if (!Number.isFinite(b) || b <= 0.5) return false;
        if (!this.isExposedToSky(entity.pos)) return false;
        // Jacobo parity:
        // if (rand.nextFloat() * 30.0F < (brightness - 0.4F) * 2.0F) ignite.
        // Convert 20tps tick chance to per-second probability for variable dt.
        const perTickChance = Math.max(0, (b - 0.4) * 2.0) / 30.0;
        const chancePerSecond = perTickChance * TICKS_PER_SECOND;
        return Math.random() < (dt * chancePerSecond);
    }

    getDaylight01() {
        const raw = this.getDaylightFactor ? Number(this.getDaylightFactor()) : 1;
        if (!Number.isFinite(raw)) return 1;
        return clamp(raw, 0, 1);
    }

    trySpawnNearPlayer(playerPos) {
        if (this.pigs.length >= PIG_MAX_COUNT) return;
        const angle = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 32;
        const x = playerPos.x + Math.cos(angle) * dist;
        const z = playerPos.z + Math.sin(angle) * dist;
        const y = this.findSpawnY(x, z);
        if (y == null) return;
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor((y + 1) / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        if (!this.chunkManager.hasChunk(cx, cy, cz)) return;
        if (this.entityIntersectsSolid(x, y, z, PIG_RADIUS, PIG_HEIGHT)) return;
        this.spawnPig(x, y, z);
    }

    normalizeBiomeName(name) {
        return String(name || 'plains').toLowerCase().replace(/\s+/g, '_');
    }

    getBiomeAtWorldXZ(x, z) {
        if (typeof this.getBiomeAt !== 'function') return 'plains';
        const biome = this.getBiomeAt(Math.floor(x), Math.floor(z));
        return this.normalizeBiomeName(biome);
    }

    entityVolumeHasLiquid(x, y, z, radius, height) {
        const minX = x - radius;
        const maxX = x + radius;
        const minY = y;
        const maxY = y + height;
        const minZ = z - radius;
        const maxZ = z + radius;

        const bx0 = Math.floor(minX + 0.5 + 1e-4);
        const by0 = Math.floor(minY + 0.5 + 1e-4);
        const bz0 = Math.floor(minZ + 0.5 + 1e-4);
        const bx1 = Math.floor(maxX + 0.5 - 1e-4);
        const by1 = Math.floor(maxY + 0.5 - 1e-4);
        const bz1 = Math.floor(maxZ + 0.5 - 1e-4);

        for (let bx = bx0; bx <= bx1; bx++) {
            for (let by = by0; by <= by1; by++) {
                for (let bz = bz0; bz <= bz1; bz++) {
                    if (!this.isChunkLoadedAtBlock(bx, by, bz)) continue;
                    const id = this.chunkManager.getBlock(bx, by, bz);
                    if (isWaterId(id) || isLavaId(id)) return true;
                }
            }
        }
        return false;
    }

    entitySampledVolumeIsWater(x, y, z, radius, height) {
        const samplePoints = [
            [0, 0.1, 0],
            [0, Math.max(0.1, height * 0.5), 0],
            [0, Math.max(0.1, height - 0.1), 0],
            [radius * 0.7, Math.max(0.1, height * 0.5), 0],
            [-radius * 0.7, Math.max(0.1, height * 0.5), 0],
            [0, Math.max(0.1, height * 0.5), radius * 0.7],
            [0, Math.max(0.1, height * 0.5), -radius * 0.7]
        ];
        for (const [ox, oy, oz] of samplePoints) {
            const bx = worldToBlock(x + ox);
            const by = worldToBlock(y + oy);
            const bz = worldToBlock(z + oz);
            if (!this.isChunkLoadedAtBlock(bx, by, bz)) return false;
            if (!isWaterId(this.chunkManager.getBlock(bx, by, bz))) return false;
        }
        return true;
    }

    // ---- Beta 1.7.3 natural spawning (SpawnerAnimals.performSpawning) ----
    // Positions inside this section are Beta coordinates (MindBlock position + 0.5).

    getBetaChunk(cx, cy, cz) {
        const key = ((cx + 32768) * 65536 + (cz + 32768)) * 8 + cy;
        let chunk = this.betaChunkCache.get(key);
        if (chunk === undefined) {
            chunk = this.chunkManager.getChunk(cx, cy, cz) || null;
            this.betaChunkCache.set(key, chunk);
        }
        return chunk;
    }

    // Beta block id; 0 outside the world's height, -1 when that chunk slice isn't loaded here.
    betaBlockAt(x, y, z) {
        if (y < 0 || y >= 128) return 0;
        const chunk = this.getBetaChunk(Math.floor(x / CHUNK_SIZE), y >> 4, Math.floor(z / CHUNK_SIZE));
        if (!chunk) return -1;
        return betaIdOfRuntime(chunk.data[(x & 15) + ((y & 15) << 4) + ((z & 15) << 8)]);
    }

    betaMetaAt(x, y, z) {
        if (y < 0 || y >= 128) return 0;
        const chunk = this.getBetaChunk(Math.floor(x / CHUNK_SIZE), y >> 4, Math.floor(z / CHUNK_SIZE));
        return chunk ? chunk.metadata[(x & 15) + ((y & 15) << 4) + ((z & 15) << 8)] : 0;
    }

    isBetaNormalCubeAt(x, y, z) {
        const id = this.betaBlockAt(x, y, z);
        return id < 0 || isBetaNormalCube(id);
    }

    // SpawnerAnimals.canCreatureTypeSpawnAtLocation
    canBetaCreatureTypeSpawnAt(kind, x, y, z) {
        const here = this.betaBlockAt(x, y, z);
        const above = this.betaBlockAt(x, y + 1, z);
        if (here < 0 || above < 0) return false;
        if (kind === 'water') return isBetaLiquid(here) && !isBetaNormalCube(above);
        const below = this.betaBlockAt(x, y - 1, z);
        if (below < 0) return false;
        return isBetaNormalCube(below) && !isBetaNormalCube(here) && !isBetaLiquid(here) && !isBetaNormalCube(above);
    }

    getBetaSkylightSubtracted() {
        const v = this.getSkylightSubtracted ? Number(this.getSkylightSubtracted()) : 0;
        return Number.isFinite(v) ? v : 0;
    }

    getBetaDifficulty() {
        const v = this.getDifficulty ? Number(this.getDifficulty()) : 2;
        return Number.isFinite(v) ? v : 2;
    }

    // World.getSavedLightValue(EnumSkyBlock.Sky); -1 while the column's light isn't computed.
    betaSkyLight(x, y, z) {
        const packed = this.betaLight.getPacked(x, Math.max(0, Math.min(127, y)), z);
        return packed < 0 ? -1 : packed >> 4;
    }

    // World.getBlockLightValue_do
    betaBlockLightValue(x, y, z, sub, neighbours = true) {
        if (neighbours) {
            const id = this.betaBlockAt(x, y, z);
            if (id === 44 || id === 60 || id === 67 || id === 53) {
                let best = 0;
                for (const [dx, dy, dz] of BETA_LIGHT_NEIGHBOURS) {
                    const v = this.betaBlockLightValue(x + dx, y + dy, z + dz, sub, false);
                    if (v < 0) return -1;
                    if (v > best) best = v;
                }
                return best;
            }
        }
        if (y < 0) return 0;
        if (y >= 128) return Math.max(0, 15 - sub);
        const packed = this.betaLight.getPacked(x, y, z);
        if (packed < 0) return -1;
        return Math.max((packed >> 4) - sub, packed & 15);
    }

    // World.getFullBlockLightValue (ignores time of day)
    betaFullBlockLight(x, y, z) {
        if (y < 0) return 0;
        const packed = this.betaLight.getPacked(x, Math.min(127, y), z);
        return packed < 0 ? -1 : Math.max(packed >> 4, packed & 15);
    }

    betaBrightness(lightValue) {
        const table = (this.getDimension && this.getDimension() === 'NETHER') ? NETHER_BRIGHTNESS : OVERWORLD_BRIGHTNESS;
        return table[Math.max(0, Math.min(15, lightValue))];
    }

    // Entity.getEntityBrightness
    getBetaEntityBrightness(entity, type) {
        const [, h] = this.getBetaEntitySize(type, entity);
        const x = Math.floor(entity.pos.x + 0.5);
        const y = Math.floor(entity.pos.y + 0.5 + h * 0.66);
        const z = Math.floor(entity.pos.z + 0.5);
        const lv = this.betaBlockLightValue(x, y, z, this.getBetaSkylightSubtracted());
        return lv < 0 ? 0 : this.betaBrightness(lv);
    }

    getBetaEntitySize(type, entity = null) {
        if (type === 'slime') {
            const s = entity ? (entity.size || 1) : 1;
            return [0.6 * s, 0.6 * s];
        }
        if (type === 'zombie' && entity && entity.mobType === 'giant') return BETA_ENTITY_SIZE.giant;
        return BETA_ENTITY_SIZE[type] || [0.6, 1.8];
    }

    getBetaMobGroups() {
        return [
            [this.pigs, 'pig'], [this.chickens, 'chicken'], [this.sheep, 'sheep'], [this.cows, 'cow'],
            [this.wolves, 'wolf'], [this.squids, 'squid'], [this.creepers, 'creeper'], [this.zombies, 'zombie'],
            [this.spiders, 'spider'], [this.skeletons, 'skeleton'], [this.slimes, 'slime'], [this.ghasts, 'ghast'],
            [this.zombiePigmen, 'zombie_pigman']
        ];
    }

    getBetaListForType(type) {
        switch (type) {
            case 'pig': return this.pigs;
            case 'chicken': return this.chickens;
            case 'sheep': return this.sheep;
            case 'cow': return this.cows;
            case 'wolf': return this.wolves;
            case 'squid': return this.squids;
            case 'creeper': return this.creepers;
            case 'zombie': return this.zombies;
            case 'spider': return this.spiders;
            case 'skeleton': return this.skeletons;
            case 'slime': return this.slimes;
            case 'ghast': return this.ghasts;
            case 'zombie_pigman': return this.zombiePigmen;
            default: return null;
        }
    }

    getBetaEntityBox(type, entity) {
        const [w, h] = this.getBetaEntitySize(type, entity);
        const x = entity.pos.x + 0.5, y = entity.pos.y + 0.5, z = entity.pos.z + 0.5;
        return [x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2];
    }

    // Beta player eye position (posY includes the 1.62 yOffset). The camera sits 1.5 above the feet.
    toBetaPlayerPos(playerPos) {
        return { x: playerPos.x + 0.5, y: playerPos.y + 0.62, z: playerPos.z + 0.5 };
    }

    // World.checkIfAABBIsClear
    isBetaBoxClearOfEntities(box) {
        for (const [list, type] of this.getBetaMobGroups()) {
            for (const e of list) {
                if (e && aabbIntersects(box, this.getBetaEntityBox(type, e))) return false;
            }
        }
        const p = this.lastPlayerPos;
        if (p) {
            const feet = p.y - 1.0;
            const px = p.x + 0.5, pz = p.z + 0.5;
            if (aabbIntersects(box, [px - 0.3, feet, pz - 0.3, px + 0.3, feet + 1.8, pz + 0.3])) return false;
        }
        return true;
    }

    // World.getCollidingBoundingBoxes (block part); unloaded blocks count as blocking.
    betaBoxHitsBlocks(box) {
        const x0 = Math.floor(box[0]), x1 = Math.floor(box[3] + 1);
        const y0 = Math.floor(box[1]) - 1, y1 = Math.floor(box[4] + 1);
        const z0 = Math.floor(box[2]), z1 = Math.floor(box[5] + 1);
        const boxes = [];
        for (let x = x0; x < x1; x++) {
            for (let z = z0; z < z1; z++) {
                for (let y = y0; y < y1; y++) {
                    const id = this.betaBlockAt(x, y, z);
                    if (id < 0) return true;
                    if (id === 0) continue;
                    boxes.length = 0;
                    appendBetaCollisionBoxes(id, this.betaMetaAt(x, y, z), x, y, z, boxes);
                    for (const b of boxes) {
                        if (aabbIntersects(box, b)) return true;
                    }
                }
            }
        }
        return false;
    }

    // World.getIsAnyLiquid
    betaBoxHasLiquid(box) {
        let x0 = Math.floor(box[0]), y0 = Math.floor(box[1]), z0 = Math.floor(box[2]);
        const x1 = Math.floor(box[3] + 1), y1 = Math.floor(box[4] + 1), z1 = Math.floor(box[5] + 1);
        if (box[0] < 0) x0--;
        if (box[1] < 0) y0--;
        if (box[2] < 0) z0--;
        for (let x = x0; x < x1; x++) {
            for (let y = y0; y < y1; y++) {
                for (let z = z0; z < z1; z++) {
                    if (isBetaLiquid(this.betaBlockAt(x, y, z))) return true;
                }
            }
        }
        return false;
    }

    // getCanSpawnHere for each mob class, at Beta position (x, y, z).
    canBetaEntitySpawnHere(type, x, y, z, size = 1) {
        const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
        const [w, h] = type === 'slime' ? [0.6 * size, 0.6 * size] : this.getBetaEntitySize(type);
        const box = [x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2];
        const difficulty = this.getBetaDifficulty();
        // EntityLiving.getCanSpawnHere
        const livingOk = () => this.isBetaBoxClearOfEntities(box) && !this.betaBoxHitsBlocks(box) && !this.betaBoxHasLiquid(box);
        switch (type) {
            case 'squid':
                return this.isBetaBoxClearOfEntities(box);
            case 'slime': {
                const slimeChunk = this.isSlimeChunk ? !!this.isSlimeChunk(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE)) : false;
                return (size === 1 || difficulty > 0) && randInt(10) === 0 && slimeChunk && y < 16;
            }
            case 'ghast':
                return randInt(20) === 0 && livingOk() && difficulty > 0;
            case 'zombie_pigman':
                return difficulty > 0 && livingOk();
            case 'pig': case 'sheep': case 'cow': case 'chicken': case 'wolf':
                // EntityAnimal: grass below, full light > 8; path weight on grass is always 10.
                if (this.betaBlockAt(bx, by - 1, bz) !== BETA_GRASS_ID) return false;
                if (this.betaFullBlockLight(bx, by, bz) <= 8) return false;
                return livingOk();
            default: {
                // EntityMob (zombie, skeleton, creeper, spider)
                const sky = this.betaSkyLight(bx, by, bz);
                if (sky < 0 || sky > randInt(32)) return false;
                const sub = this.getBetaSkylightSubtracted();
                const lv = this.betaBlockLightValue(bx, by, bz, (this.getIsThundering && this.getIsThundering()) ? 10 : sub);
                if (lv < 0 || lv > randInt(8)) return false;
                if (!livingOk()) return false;
                // EntityCreature: getBlockPathWeight = 0.5 - brightness >= 0
                return 0.5 - this.betaBrightness(this.betaBlockLightValue(bx, by, bz, sub)) >= 0;
            }
        }
    }

    // Creates the mob at a Beta position and returns it.
    spawnBetaEntity(type, x, y, z, size = 1) {
        const mx = x - 0.5, my = y - 0.5, mz = z - 0.5;
        switch (type) {
            case 'pig': this.spawnPig(mx, my, mz); break;
            case 'chicken': this.spawnChicken(mx, my, mz); break;
            case 'sheep': this.spawnSheep(mx, my, mz); break;
            case 'cow': this.spawnCow(mx, my, mz); break;
            case 'wolf': this.spawnWolf(mx, my, mz); break;
            case 'squid': this.spawnSquid(mx, my, mz); break;
            case 'creeper': this.spawnCreeper(mx, my, mz); break;
            case 'zombie': this.spawnZombie(mx, my, mz); break;
            case 'spider': this.spawnSpider(mx, my, mz); break;
            case 'skeleton': this.spawnSkeleton(mx, my, mz); break;
            case 'slime': this.spawnSlime(mx, my, mz, size); break;
            case 'ghast': this.spawnGhast(mx, my, mz); break;
            case 'zombie_pigman': this.spawnZombiePigman(mx, my, mz); break;
            default: return null;
        }
        const list = this.getBetaListForType(type);
        const ent = list && list.length ? list[list.length - 1] : null;
        if (ent) {
            ent._despawnAgeTicks = 0;
            ent._betaLastHealth = Number(ent.health);
        }
        return ent;
    }

    // SpawnerAnimals.creatureSpecificInit (sheep colour is already randomised by spawnSheep).
    betaCreatureSpecificInit(type, ent, x, y, z) {
        if (type === 'spider' && randInt(100) === 0) {
            const rider = this.spawnBetaEntity('skeleton', x, y, z);
            if (rider) {
                rider.yaw = ent.yaw;
                rider.ridingEntity = ent;
                ent.riddenByEntity = rider;
            }
        }
    }

    // Keeps a spider jockey's skeleton on its spider (Entity.updateRidden).
    updateBetaRider(rider) {
        const mount = rider.ridingEntity;
        if (!mount) return;
        if (mount._dead || mount._forceDespawn || !this.spiders.includes(mount)) {
            rider.ridingEntity = null;
            if (mount.riddenByEntity === rider) mount.riddenByEntity = null;
            return;
        }
        rider.pos.set(mount.pos.x, mount.pos.y + BETA_SPIDER_MOUNTED_Y_OFFSET, mount.pos.z);
        if (rider.vel) rider.vel.set(0, 0, 0);
    }

    countBetaKind(kind) {
        if (kind === 'monster') {
            return this.creepers.length + this.zombies.length + this.spiders.length + this.skeletons.length +
                this.slimes.length + this.ghasts.length + this.zombiePigmen.length;
        }
        if (kind === 'creature') return this.pigs.length + this.chickens.length + this.sheep.length + this.cows.length + this.wolves.length;
        return this.squids.length;
    }

    getBetaChunkBiome(cx, cz) {
        const dim = this.getDimension ? this.getDimension() : 'OVERWORLD';
        const key = `${dim}:${cx},${cz}`;
        let biome = this.betaBiomeCache.get(key);
        if (biome === undefined) {
            // WorldChunkManager.getBiomeGenAtChunkCoord samples the chunk's corner block.
            biome = this.getBiomeAtWorldXZ(cx * CHUNK_SIZE, cz * CHUNK_SIZE);
            this.betaBiomeCache.set(key, biome);
        }
        return biome;
    }

    // BiomeGenBase.getSpawnableList
    getBetaSpawnList(kind, biome) {
        if (biome === 'hell') return kind === 'monster' ? BETA_HELL_MONSTERS : null;
        if (kind === 'monster') return BETA_MONSTERS;
        if (kind === 'water') return BETA_WATER_CREATURES;
        return (biome === 'forest' || biome === 'taiga') ? BETA_FOREST_CREATURES : BETA_CREATURES;
    }

    performBetaSpawning(playerPos) {
        const player = this.toBetaPlayerPos(playerPos);
        const pcx = Math.floor(player.x / CHUNK_SIZE);
        const pcz = Math.floor(player.z / CHUNK_SIZE);
        const radius = BETA_SPAWN_CHUNK_RADIUS;
        const eligibleCount = (radius * 2 + 1) * (radius * 2 + 1);
        const spawn = this.getWorldSpawnPoint ? this.getWorldSpawnPoint() : null;
        this.betaLight.pruneOutside(pcx - radius - 1, pcx + radius + 1, pcz - radius - 1, pcz + radius + 1);

        for (const kind of BETA_CREATURE_KINDS) {
            if (this.countBetaKind(kind) > Math.floor(BETA_KIND_CAPS[kind] * eligibleCount / 256)) continue;
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const cx = pcx + dx, cz = pcz + dz;
                    const list = this.getBetaSpawnList(kind, this.getBetaChunkBiome(cx, cz));
                    if (!list || list.length === 0) continue;
                    const type = pickBetaSpawnEntry(list);
                    const x = cx * CHUNK_SIZE + randInt(16);
                    const y = randInt(128);
                    const z = cz * CHUNK_SIZE + randInt(16);
                    const origin = this.betaBlockAt(x, y, z);
                    if (origin < 0 || isBetaNormalCube(origin)) continue;
                    if (kind === 'water' ? !isBetaWater(origin) : origin !== 0) continue;
                    this.spawnBetaPack(kind, type, x, y, z, player, spawn);
                }
            }
        }
    }

    // Three packs of four random-walk steps around the origin; Y never changes.
    spawnBetaPack(kind, type, x, y, z, player, spawn) {
        const maxInChunk = type === 'wolf' ? 8 : (type === 'ghast' ? 1 : 4);
        let spawned = 0;
        for (let pack = 0; pack < 3; pack++) {
            let px = x, pz = z;
            for (let step = 0; step < 4; step++) {
                px += randInt(6) - randInt(6);
                pz += randInt(6) - randInt(6);
                if (!this.canBetaCreatureTypeSpawnAt(kind, px, y, pz)) continue;
                const fx = px + 0.5, fy = y, fz = pz + 0.5;
                if (distSq3(player.x, player.y, player.z, fx, fy, fz) < 576) continue;
                if (spawn && distSq3(spawn.x, spawn.y, spawn.z, fx, fy, fz) < 576) continue;
                const size = type === 'slime' ? (1 << randInt(3)) : 1;
                if (!this.canBetaEntitySpawnHere(type, fx, fy, fz, size)) continue;
                const ent = this.spawnBetaEntity(type, fx, fy, fz, size);
                if (!ent) continue;
                spawned++;
                this.betaCreatureSpecificInit(type, ent, fx, fy, fz);
                if (spawned >= maxInChunk) return;
            }
        }
    }

    // SpawnerAnimals.performSleepSpawning for a player asleep in the bed whose head block is
    // (x, y, z) with bed metadata `meta`. Returns true when a monster woke the player.
    performBetaSleepSpawning(x, y, z, meta) {
        this.betaChunkCache.clear();
        const dir = meta & 3;
        let ox = 0.5, oz = 0.5;
        if (dir === 0) oz = 0.9;
        else if (dir === 1) ox = 0.1;
        else if (dir === 2) oz = 0.1;
        else ox = 0.9;
        // EntityPlayer.sleepInBedAt: size 0.2, yOffset 0.2.
        const player = { x: x + ox, y: y + 0.9375, z: z + oz, minY: y + 0.9375 - 0.2 };
        // Light for the area around the bed is needed right now.
        const pcx = Math.floor(player.x / CHUNK_SIZE), pcz = Math.floor(player.z / CHUNK_SIZE);
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                if (!this.betaLight.getColumn(pcx + dx, pcz + dz) && this.chunkManager.hasChunk(pcx + dx, 7, pcz + dz)) {
                    this.betaLight.computeColumn(pcx + dx, pcz + dz);
                }
            }
        }
        const pathWorld = {
            betaId: (bx, by, bz) => { const id = this.betaBlockAt(bx, by, bz); return id < 0 ? 1 : id; },
            meta: (bx, by, bz) => this.betaMetaAt(bx, by, bz)
        };
        for (let attempt = 0; attempt < 20; attempt++) {
            const sx = Math.floor(player.x) + randInt(32) - randInt(32);
            const sz = Math.floor(player.z) + randInt(32) - randInt(32);
            let startY = Math.floor(player.y) + randInt(16) - randInt(16);
            if (startY < 1) startY = 1;
            else if (startY > 128) startY = 128;
            const type = BETA_NIGHT_SPAWN_TYPES[randInt(BETA_NIGHT_SPAWN_TYPES.length)];
            let sy = startY;
            while (sy > 2 && !this.isBetaNormalCubeAt(sx, sy - 1, sz)) sy--;
            while (!this.canBetaCreatureTypeSpawnAt('monster', sx, sy, sz) && sy < startY + 16 && sy < 128) sy++;
            if (!(sy < startY + 16 && sy < 128)) continue;
            const fx = sx + 0.5, fz = sz + 0.5;
            if (!this.canBetaEntitySpawnHere(type, fx, sy, fz)) continue;
            const [w, h] = this.getBetaEntitySize(type);
            const path = findBetaPath(pathWorld, { minX: fx - w / 2, minY: sy, minZ: fz - w / 2, width: w, height: h }, player.x, player.minY, player.z, 32);
            if (!path || path.length <= 1) continue;
            const last = path[path.length - 1];
            if (Math.abs(last.x - player.x) >= 1.5 || Math.abs(last.z - player.z) >= 1.5 || Math.abs(last.y - player.y) >= 1.5) continue;
            const spot = this.getBetaBedEscapeSpot(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z), dir, 1)
                || { x: sx, y: sy + 1, z: sz };
            const ent = this.spawnBetaEntity(type, spot.x + 0.5, spot.y, spot.z + 0.5);
            if (ent) this.betaCreatureSpecificInit(type, ent, spot.x + 0.5, spot.y, spot.z + 0.5);
            return true;
        }
        return false;
    }

    // BlockBed.getNearestEmptyChunkCoordinates
    getBetaBedEscapeSpot(x, y, z, dir, skip) {
        const [hx, hz] = BETA_BED_HEAD_OFFSETS[dir];
        for (let i = 0; i <= 1; i++) {
            const x0 = x - hx * i - 1;
            const z0 = z - hz * i - 1;
            for (let ix = x0; ix <= x0 + 2; ix++) {
                for (let iz = z0; iz <= z0 + 2; iz++) {
                    const below = this.betaBlockAt(ix, y - 1, iz);
                    if (below >= 0 && isBetaNormalCube(below) && this.betaBlockAt(ix, y, iz) === 0 && this.betaBlockAt(ix, y + 1, iz) === 0) {
                        if (skip <= 0) return { x: ix, y, z: iz };
                        skip--;
                    }
                }
            }
        }
        return null;
    }

    // TileEntityMobSpawner.updateEntity for every spawner near the player.
    updateBetaMobSpawners(playerPos) {
        const player = this.toBetaPlayerPos(playerPos);
        const x0 = Math.floor((player.x - 17) / CHUNK_SIZE), x1 = Math.floor((player.x + 17) / CHUNK_SIZE);
        const z0 = Math.floor((player.z - 17) / CHUNK_SIZE), z1 = Math.floor((player.z + 17) / CHUNK_SIZE);
        const y0 = Math.max(0, Math.floor((player.y - 17) / CHUNK_SIZE)), y1 = Math.min(7, Math.floor((player.y + 17) / CHUNK_SIZE));
        for (let cx = x0; cx <= x1; cx++) {
            for (let cz = z0; cz <= z1; cz++) {
                for (let cy = y0; cy <= y1; cy++) {
                    const chunk = this.getBetaChunk(cx, cy, cz);
                    if (!chunk) continue;
                    for (const idx of this.getBetaSpawnerIndices(chunk, cx, cz)) {
                        const x = cx * CHUNK_SIZE + (idx & 15);
                        const y = cy * CHUNK_SIZE + ((idx >> 4) & 15);
                        const z = cz * CHUNK_SIZE + (idx >> 8);
                        this.tickBetaMobSpawner(x, y, z, player);
                    }
                }
            }
        }
    }

    getBetaSpawnerIndices(chunk, cx, cz) {
        const rev = this.chunkManager.getColumnRevision ? this.chunkManager.getColumnRevision(cx, cz) : 0;
        let cached = this.betaSpawnerScan.get(chunk);
        if (!cached || cached.rev !== rev) {
            const list = [];
            const data = chunk.data;
            for (let i = 0; i < data.length; i++) {
                if (data[i] === MOB_SPAWNER_BLOCK_ID) list.push(i);
            }
            cached = { rev, list };
            this.betaSpawnerScan.set(chunk, cached);
        }
        return cached.list;
    }

    tickBetaMobSpawner(x, y, z, player) {
        if (distSq3(player.x, player.y, player.z, x + 0.5, y + 0.5, z + 0.5) >= 256) return;
        const key = `${x},${y},${z}`;
        let state = this.betaSpawners.get(key);
        if (!state) {
            state = { delay: 20 };
            this.betaSpawners.set(key, state);
        }
        if (state.delay === -1) state.delay = 200 + randInt(600);
        if (state.delay > 0) {
            state.delay--;
            return;
        }
        const type = BETA_SPAWNER_MOB_BY_META[this.betaMetaAt(x, y, z)] || 'pig';
        const near = [x - 8, y - 4, z - 8, x + 9, y + 5, z + 9];
        for (let i = 0; i < 4; i++) {
            if (this.countBetaSpawnerKin(type, near) >= 6) {
                state.delay = 200 + randInt(600);
                return;
            }
            const ex = x + (Math.random() - Math.random()) * 4;
            const ey = y + randInt(3) - 1;
            const ez = z + (Math.random() - Math.random()) * 4;
            if (this.canBetaEntitySpawnHere(type, ex, ey, ez)) {
                this.spawnBetaEntity(type, ex, ey, ez);
                state.delay = 200 + randInt(600);
            }
        }
    }

    // World.getEntitiesWithinAABB(entity class) — EntityPigZombie is a subclass of EntityZombie.
    countBetaSpawnerKin(type, box) {
        let count = 0;
        const groups = type === 'zombie' ? [[this.zombies, 'zombie'], [this.zombiePigmen, 'zombie_pigman']] : [[this.getBetaListForType(type) || [], type]];
        for (const [list, t] of groups) {
            for (const e of list) {
                if (t === 'zombie' && e.mobType === 'giant') continue;
                if (aabbIntersects(box, this.getBetaEntityBox(t, e))) count++;
            }
        }
        return count;
    }

    // EntityLiving.despawnEntity plus entityAge bookkeeping, once per game tick.
    applyBetaDespawnState(entity, type, playerPos) {
        for (let t = 0; t < this.betaTicksThisUpdate; t++) this.betaDespawnTick(entity, type, playerPos);
    }

    betaDespawnTick(entity, type, playerPos) {
        if (!entity || entity._forceDespawn) return;
        const health = Number(entity.health);
        // attackEntityFrom resets entityAge.
        if (Number.isFinite(entity._betaLastHealth) && health < entity._betaLastHealth) entity._despawnAgeTicks = 0;
        entity._betaLastHealth = health;
        if (entity._dead) return;
        const age = entity._despawnAgeTicks || 0;
        if (BETA_ENTITY_MOB_TYPES.has(type)) {
            // EntityMob.onLivingUpdate ages mobs faster in bright light.
            entity._despawnAgeTicks = age + (this.getBetaEntityBrightness(entity, type) > 0.5 ? 2 : 0);
        }
        if (BETA_NON_AGING_TYPES.has(type)) {
            // Squid, slime and ghast call despawnEntity without ageing.
            this.betaDespawnEntity(entity, playerPos);
            return;
        }
        // EntityCreature only falls back to EntityLiving's AI (age + despawn) without a path.
        const hasPath = !!entity.target || (entity.walkSpeed || 0) > 0.01;
        if (hasPath && randInt(100) !== 0) return;
        entity._despawnAgeTicks = (entity._despawnAgeTicks || 0) + 1;
        this.betaDespawnEntity(entity, playerPos);
    }

    betaDespawnEntity(entity, playerPos) {
        if (!playerPos || entity._persistenceRequired || entity.tamed) return;
        const dx = playerPos.x - entity.pos.x;
        const dy = (playerPos.y + 0.12) - entity.pos.y; // Beta player posY (eye) minus mob feet
        const dz = playerPos.z - entity.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 16384) entity._forceDespawn = true;
        if ((entity._despawnAgeTicks || 0) > 600 && randInt(800) === 0) {
            if (d2 < 1024) entity._despawnAgeTicks = 0;
            else entity._forceDespawn = true;
        }
    }

    getSpawnParitySnapshot(playerPos = this.lastPlayerPos) {
        const eligibleCount = (BETA_SPAWN_CHUNK_RADIUS * 2 + 1) ** 2;
        const caps = {};
        const counts = {};
        for (const kind of BETA_CREATURE_KINDS) {
            caps[kind] = Math.floor(BETA_KIND_CAPS[kind] * eligibleCount / 256);
            counts[kind] = this.countBetaKind(kind);
        }
        return {
            eligibleCount,
            caps,
            counts,
            lightColumns: this.betaLight.columns.size,
            lightPending: this.betaLight.pending.size,
            hasPlayer: !!playerPos
        };
    }

    // Test hook: runs the Beta getCanSpawnHere rules for `type` at MindBlock position (x, y, z).
    debugCanBetaSpawnAt(type, x, y, z, size = 1) {
        this.betaChunkCache.clear();
        return this.canBetaEntitySpawnHere(String(type || ''), Number(x) + 0.5, Number(y) + 0.5, Number(z) + 0.5, size);
    }

    // Test hook: Beta sky/block light at a block position (null until computed).
    debugGetBetaLight(x, y, z) {
        const packed = this.betaLight.getPacked(Math.floor(x), Math.floor(y), Math.floor(z));
        if (packed < 0) {
            this.betaLight.processPending(1000);
            const again = this.betaLight.getPacked(Math.floor(x), Math.floor(y), Math.floor(z));
            if (again < 0) return null;
            return { sky: again >> 4, block: again & 15 };
        }
        return { sky: packed >> 4, block: packed & 15 };
    }

    updatePigAI(pig, dt) {
        this.updateStuckState(pig, dt);
        if ((pig.panicTimer || 0) > 0) {
            pig.panicTimer = Math.max(0, pig.panicTimer - dt);
            const dx = pig.pos.x - (Number.isFinite(pig.panicFromX) ? pig.panicFromX : pig.pos.x);
            const dz = pig.pos.z - (Number.isFinite(pig.panicFromZ) ? pig.panicFromZ : pig.pos.z);
            if (dx * dx + dz * dz > 1e-5) pig.targetYaw = Math.atan2(dz, dx);
            pig.walkSpeed = 1.0;
            return;
        }
        pig.aiTimer -= dt;
        if (!pig.wanderTarget || pig.aiTimer <= 0) {
            pig.aiTimer = PIG_AI_DECISION_MIN + Math.random() * (PIG_AI_DECISION_MAX - PIG_AI_DECISION_MIN);
            this.updateWanderTarget(pig);
            pig.walkSpeed = Math.random() < 0.74 ? (0.35 + Math.random() * 0.55) : 0;
        }
        if (pig.wanderTarget) {
            const dx = pig.wanderTarget.x - pig.pos.x;
            const dz = pig.wanderTarget.z - pig.pos.z;
            const dy = pig.wanderTarget.y - pig.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.8 * 0.8) this.updateWanderTarget(pig);
            else pig.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(pig.pos.x, pig.pos.y, pig.pos.z, PIG_RADIUS);
            if (dy > 0.15 && onGround && (pig.jumpCooldown || 0) <= 0) {
                pig.vel.y = Math.max(pig.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                pig.jumpCooldown = 0.45;
            }
        }
        if (this.isEntityInWaterOrLava(pig, PIG_RADIUS) && Math.random() < 0.8) {
            pig.vel.y = Math.max(pig.vel.y, 5.3);
        }
        const yd = yawDelta(pig.yaw, pig.targetYaw);
        pig.yaw += clamp(yd, -dt * PIG_TURN_RATE, dt * PIG_TURN_RATE);
    }

    moveEntityHorizontalWithStep(entity, dt, radius, height, speed, turnRate = 1.2) {
        const nextX = entity.pos.x + Math.cos(entity.yaw) * speed * dt;
        const nextZ = entity.pos.z + Math.sin(entity.yaw) * speed * dt;
        let movedX = false;
        let movedZ = false;

        if (!this.entityIntersectsSolid(nextX, entity.pos.y, entity.pos.z, radius, height)) {
            entity.pos.x = nextX;
            movedX = true;
        } else if (
            this.entityHasGround(entity.pos.x, entity.pos.y, entity.pos.z, radius) &&
            !this.entityIntersectsSolid(nextX, entity.pos.y + MOB_STEP_HEIGHT, entity.pos.z, radius, height) &&
            this.entityHasGround(nextX, entity.pos.y + MOB_STEP_HEIGHT, entity.pos.z, radius)
        ) {
            entity.pos.x = nextX;
            entity.pos.y += MOB_STEP_HEIGHT;
            movedX = true;
        }

        if (!this.entityIntersectsSolid(entity.pos.x, entity.pos.y, nextZ, radius, height)) {
            entity.pos.z = nextZ;
            movedZ = true;
        } else if (
            this.entityHasGround(entity.pos.x, entity.pos.y, entity.pos.z, radius) &&
            !this.entityIntersectsSolid(entity.pos.x, entity.pos.y + MOB_STEP_HEIGHT, nextZ, radius, height) &&
            this.entityHasGround(entity.pos.x, entity.pos.y + MOB_STEP_HEIGHT, nextZ, radius)
        ) {
            entity.pos.z = nextZ;
            entity.pos.y += MOB_STEP_HEIGHT;
            movedZ = true;
        }

        const blockedX = !movedX;
        const blockedZ = !movedZ;
        if (blockedX) entity.targetYaw += (Math.random() * turnRate + 0.6);
        if (blockedZ) entity.targetYaw -= (Math.random() * turnRate + 0.6);
        return { blockedX, blockedZ };
    }

    tryJumpObstacle(entity, radius, height) {
        if (!this.entityHasGround(entity.pos.x, entity.pos.y, entity.pos.z, radius)) return;
        if ((entity.jumpCooldown || 0) > 0) return;
        const nx = entity.pos.x + Math.cos(entity.yaw) * radius * 0.9;
        const nz = entity.pos.z + Math.sin(entity.yaw) * radius * 0.9;
        const blockedAhead = this.entityIntersectsSolid(nx, entity.pos.y, nz, radius, height);
        const headroomAbove = !this.entityIntersectsSolid(entity.pos.x, entity.pos.y + 1.0, entity.pos.z, radius, height);
        if (blockedAhead && headroomAbove) {
            entity.vel.y = Math.max(entity.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
            entity.jumpCooldown = 0.7;
        }
    }

    updatePigPhysics(pig, dt) {
        const pigRadius = this.getMobCollisionRadius(pig);
        const pigHeight = this.getMobCollisionHeight(pig);
        pig.burnTimer = Math.max(0, (pig.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(pig, pigRadius);
        if (contact.water && !contact.lava) {
            pig.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(pig, true);
            pig.burnTimer = Math.max(pig.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            pig.burnTimer = Math.max(pig.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(pig, false);
        } else {
            this.applyLavaEntryDamage(pig, false);
        }
        this.applyEntityBurnDamage(pig, dt);
        this.updatePigAI(pig, dt);
        pig.jumpCooldown = Math.max(0, (pig.jumpCooldown || 0) - dt);
        const move = pig.walkSpeed * PIG_SPEED;
        pig.vel.x = Math.cos(pig.yaw) * move;
        pig.vel.z = Math.sin(pig.yaw) * move;
        pig.vel.y -= GRAVITY * dt;
        pig.vel.y = clamp(pig.vel.y, -14, 8);

        const blocked = this.moveEntityHorizontalWithStep(pig, dt, pigRadius, pigHeight, move, PIG_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && pig.walkSpeed > 0.15) {
            this.tryJumpObstacle(pig, pigRadius, pigHeight);
        }

        const nextY = pig.pos.y + pig.vel.y * dt;
        if (!this.entityIntersectsSolid(pig.pos.x, nextY, pig.pos.z, pigRadius, pigHeight)) {
            pig.pos.y = nextY;
        } else {
            pig.vel.y = 0;
            // Keep current feet height when vertical move would intersect.
            // Ground snap below will place to exact block-top level.
        }

        if (pig.vel.y <= 0 && this.entityHasGround(pig.pos.x, pig.pos.y, pig.pos.z, pigRadius)) {
            pig.vel.y = 0;
            // Blocks are centered on integers => top surface is blockY + 0.5.
            const supportY = Math.floor(pig.pos.y - 0.05);
            pig.pos.y = supportY + 0.501;
        }
    }

    updatePigVisual(pig, dt, playerPos) {
        pig.hurtTimer = Math.max(0, (pig.hurtTimer || 0) - dt);
        pig.hurtCooldown = Math.max(0, (pig.hurtCooldown || 0) - dt);
        if ((pig.deathTimer || 0) > 0) pig.deathTimer = Math.max(0, pig.deathTimer - dt);
        if (!pig._dead && (pig.ageTicks || 0) < 0) {
            pig.ageTicks = Math.min(0, (pig.ageTicks || 0) + dt * TICKS_PER_SECOND);
            pig.isBaby = pig.ageTicks < 0;
        } else {
            pig.isBaby = false;
        }
        pig.root.scale.setScalar(PIG_VISUAL_SCALE * (pig.isBaby ? PASSIVE_BABY_SCALE : 1.0));
        pig.root.position.copy(pig.pos);
        pig.root.visible = this.isMobChunkRenderable(pig.pos);
        pig.root.rotation.set(0, -pig.yaw - Math.PI * 0.5, 0);
        pig.limbPhase += pig.walkSpeed * dt * PIG_LEG_PHASE_RATE;
        const swing = Math.cos(pig.limbPhase) * pig.walkSpeed * PIG_LEG_SWING_AMP;
        pig.legPivots[0].rotation.x = swing;
        pig.legPivots[1].rotation.x = -swing;
        pig.legPivots[2].rotation.x = -swing;
        pig.legPivots[3].rotation.x = swing;
        pig.headPivot.rotation.x = Math.sin(performance.now() * 0.001 + pig.limbPhase) * PIG_HEAD_IDLE_AMP;
        this.updateMobFireEffect(pig, PIG_FIRE_SURFACE_PARTS, (pig.burnTimer || 0) > 0);
    }

    updateChickenAI(ch, dt) {
        this.updateStuckState(ch, dt);
        if ((ch.panicTimer || 0) > 0) {
            ch.panicTimer = Math.max(0, ch.panicTimer - dt);
            const dx = ch.pos.x - (Number.isFinite(ch.panicFromX) ? ch.panicFromX : ch.pos.x);
            const dz = ch.pos.z - (Number.isFinite(ch.panicFromZ) ? ch.panicFromZ : ch.pos.z);
            if (dx * dx + dz * dz > 1e-5) ch.targetYaw = Math.atan2(dz, dx);
            ch.walkSpeed = 1.0;
            return;
        }
        ch.aiTimer -= dt;
        if (!ch.wanderTarget || ch.aiTimer <= 0) {
            ch.aiTimer = CHICKEN_AI_DECISION_MIN + Math.random() * (CHICKEN_AI_DECISION_MAX - CHICKEN_AI_DECISION_MIN);
            this.updateWanderTarget(ch);
            ch.walkSpeed = Math.random() < 0.82 ? (0.28 + Math.random() * 0.58) : 0;
        }
        if (ch.wanderTarget) {
            const dx = ch.wanderTarget.x - ch.pos.x;
            const dz = ch.wanderTarget.z - ch.pos.z;
            const dy = ch.wanderTarget.y - ch.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.8 * 0.8) this.updateWanderTarget(ch);
            else ch.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(ch.pos.x, ch.pos.y, ch.pos.z, CHICKEN_RADIUS);
            if (dy > 0.12 && onGround && (ch.jumpCooldown || 0) <= 0) {
                ch.vel.y = Math.max(ch.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                ch.jumpCooldown = 0.35;
            }
        }
        if (this.isEntityInWaterOrLava(ch, CHICKEN_RADIUS) && Math.random() < 0.8) {
            ch.vel.y = Math.max(ch.vel.y, 5.0);
        }
        const yd = yawDelta(ch.yaw, ch.targetYaw);
        ch.yaw += clamp(yd, -dt * CHICKEN_TURN_RATE, dt * CHICKEN_TURN_RATE);
    }

    updateSheepAI(s, dt) {
        this.updateStuckState(s, dt);
        const threatRadiusSq = SHEEP_WOLF_THREAT_RADIUS * SHEEP_WOLF_THREAT_RADIUS;
        let nearestThreat = null;
        let nearestThreatDistSq = Infinity;
        for (const w of this.wolves) {
            if (!w || w._dead || w.tamed || w.sitting) continue;
            if (Math.abs((w.pos.y || 0) - (s.pos.y || 0)) > SHEEP_WOLF_THREAT_Y_RANGE) continue;
            const dx = s.pos.x - w.pos.x;
            const dz = s.pos.z - w.pos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq > threatRadiusSq || distSq >= nearestThreatDistSq) continue;
            nearestThreatDistSq = distSq;
            nearestThreat = w;
        }
        if (nearestThreat) {
            s.fleeTimer = Math.max(s.fleeTimer || 0, SHEEP_WOLF_FLEE_TIMER_MIN);
            s.fleeFromX = nearestThreat.pos.x;
            s.fleeFromZ = nearestThreat.pos.z;
            s.wanderTarget = null;
            s.aiTimer = 0;
        }
        if ((s.fleeTimer || 0) > 0) {
            s.fleeTimer = Math.max(0, s.fleeTimer - dt);
            const dx = s.pos.x - (Number.isFinite(s.fleeFromX) ? s.fleeFromX : s.pos.x);
            const dz = s.pos.z - (Number.isFinite(s.fleeFromZ) ? s.fleeFromZ : s.pos.z);
            if (dx * dx + dz * dz > 1e-5) {
                s.targetYaw = Math.atan2(dz, dx);
            }
            s.walkSpeed = 1.0;
            return;
        }
        s.aiTimer -= dt;
        if (!s.wanderTarget || s.aiTimer <= 0) {
            s.aiTimer = SHEEP_AI_DECISION_MIN + Math.random() * (SHEEP_AI_DECISION_MAX - SHEEP_AI_DECISION_MIN);
            this.updateWanderTarget(s);
            s.walkSpeed = Math.random() < 0.72 ? (0.32 + Math.random() * 0.5) : 0;
        }
        if (s.wanderTarget) {
            const dx = s.wanderTarget.x - s.pos.x;
            const dz = s.wanderTarget.z - s.pos.z;
            const dy = s.wanderTarget.y - s.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.85 * 0.85) this.updateWanderTarget(s);
            else s.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, SHEEP_RADIUS);
            if (dy > 0.15 && onGround && (s.jumpCooldown || 0) <= 0) {
                s.vel.y = Math.max(s.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                s.jumpCooldown = 0.48;
            }
        }
        if (this.isEntityInWaterOrLava(s, SHEEP_RADIUS) && Math.random() < 0.8) {
            s.vel.y = Math.max(s.vel.y, 5.2);
        }
        const yd = yawDelta(s.yaw, s.targetYaw);
        s.yaw += clamp(yd, -dt * SHEEP_TURN_RATE, dt * SHEEP_TURN_RATE);
    }

    updateCowAI(c, dt) {
        this.updateStuckState(c, dt);
        if ((c.panicTimer || 0) > 0) {
            c.panicTimer = Math.max(0, c.panicTimer - dt);
            const dx = c.pos.x - (Number.isFinite(c.panicFromX) ? c.panicFromX : c.pos.x);
            const dz = c.pos.z - (Number.isFinite(c.panicFromZ) ? c.panicFromZ : c.pos.z);
            if (dx * dx + dz * dz > 1e-5) c.targetYaw = Math.atan2(dz, dx);
            c.walkSpeed = 1.0;
            return;
        }
        c.aiTimer -= dt;
        if (!c.wanderTarget || c.aiTimer <= 0) {
            c.aiTimer = COW_AI_DECISION_MIN + Math.random() * (COW_AI_DECISION_MAX - COW_AI_DECISION_MIN);
            this.updateWanderTarget(c);
            c.walkSpeed = Math.random() < 0.7 ? (0.32 + Math.random() * 0.52) : 0;
        }
        if (c.wanderTarget) {
            const dx = c.wanderTarget.x - c.pos.x;
            const dz = c.wanderTarget.z - c.pos.z;
            const dy = c.wanderTarget.y - c.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.85 * 0.85) this.updateWanderTarget(c);
            else c.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(c.pos.x, c.pos.y, c.pos.z, COW_RADIUS);
            if (dy > 0.15 && onGround && (c.jumpCooldown || 0) <= 0) {
                c.vel.y = Math.max(c.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                c.jumpCooldown = 0.45;
            }
        }
        if (this.isEntityInWaterOrLava(c, COW_RADIUS) && Math.random() < 0.8) {
            c.vel.y = Math.max(c.vel.y, 5.1);
        }
        const yd = yawDelta(c.yaw, c.targetYaw);
        c.yaw += clamp(yd, -dt * COW_TURN_RATE, dt * COW_TURN_RATE);
    }

    updateCowPhysics(c, dt) {
        const cowRadius = this.getMobCollisionRadius(c);
        const cowHeight = this.getMobCollisionHeight(c);
        c.burnTimer = Math.max(0, (c.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(c, cowRadius);
        if (contact.water && !contact.lava) {
            c.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(c, true);
            c.burnTimer = Math.max(c.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            c.burnTimer = Math.max(c.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(c, false);
        } else {
            this.applyLavaEntryDamage(c, false);
        }
        this.applyEntityBurnDamage(c, dt);
        this.updateCowAI(c, dt);
        c.jumpCooldown = Math.max(0, (c.jumpCooldown || 0) - dt);
        const move = c.walkSpeed * COW_SPEED;
        c.vel.x = Math.cos(c.yaw) * move;
        c.vel.z = Math.sin(c.yaw) * move;
        c.vel.y -= GRAVITY * dt;
        c.vel.y = clamp(c.vel.y, -14, 8);

        const blocked = this.moveEntityHorizontalWithStep(c, dt, cowRadius, cowHeight, move, COW_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && c.walkSpeed > 0.15) {
            this.tryJumpObstacle(c, cowRadius, cowHeight);
        }

        const nextY = c.pos.y + c.vel.y * dt;
        if (!this.entityIntersectsSolid(c.pos.x, nextY, c.pos.z, cowRadius, cowHeight)) {
            c.pos.y = nextY;
        } else {
            c.vel.y = 0;
        }

        if (c.vel.y <= 0 && this.entityHasGround(c.pos.x, c.pos.y, c.pos.z, cowRadius)) {
            c.vel.y = 0;
            const supportY = Math.floor(c.pos.y - 0.05);
            c.pos.y = supportY + 0.501;
        }
    }

    updateCowVisual(c, dt) {
        c.hurtTimer = Math.max(0, (c.hurtTimer || 0) - dt);
        c.hurtCooldown = Math.max(0, (c.hurtCooldown || 0) - dt);
        if ((c.deathTimer || 0) > 0) c.deathTimer = Math.max(0, c.deathTimer - dt);
        if (!c._dead && (c.ageTicks || 0) < 0) {
            c.ageTicks = Math.min(0, (c.ageTicks || 0) + dt * TICKS_PER_SECOND);
            c.isBaby = c.ageTicks < 0;
        } else {
            c.isBaby = false;
        }
        c.root.scale.setScalar(COW_VISUAL_SCALE * (c.isBaby ? PASSIVE_BABY_SCALE : 1.0));
        c.root.position.copy(c.pos);
        c.root.visible = this.isMobChunkRenderable(c.pos);
        c.root.rotation.set(0, -c.yaw - Math.PI * 0.5, 0);
        c.limbPhase += c.walkSpeed * dt * COW_LEG_PHASE_RATE;
        const swing = Math.cos(c.limbPhase) * c.walkSpeed * COW_LEG_SWING_AMP;
        c.legPivots[0].rotation.x = swing;
        c.legPivots[1].rotation.x = -swing;
        c.legPivots[2].rotation.x = -swing;
        c.legPivots[3].rotation.x = swing;
        c.headPivot.rotation.x = Math.sin(performance.now() * 0.001 + c.limbPhase) * COW_HEAD_IDLE_AMP;
        this.updateMobFireEffect(c, COW_FIRE_SURFACE_PARTS, (c.burnTimer || 0) > 0);
    }

    updateCreeperAI(c, dt, playerPos) {
        this.updateStuckState(c, dt);
        const aggroRadius = 16;
        c.swelling = false;
        if (playerPos) {
            const dxp = playerPos.x - c.pos.x;
            const dyp = playerPos.y - c.pos.y;
            const dzp = playerPos.z - c.pos.z;
            const distSqP = dxp * dxp + dyp * dyp + dzp * dzp;
            if (distSqP <= aggroRadius * aggroRadius && Math.abs(dyp) <= 4.0) {
                const dist2D = Math.sqrt(dxp * dxp + dzp * dzp);
                const hasLOS = this.hasLineOfSight(
                    { x: c.pos.x, y: c.pos.y + CREEPER_HEIGHT * 0.8, z: c.pos.z },
                    { x: playerPos.x, y: playerPos.y + 1.0, z: playerPos.z },
                    0.45
                );
                c.targetYaw = Math.atan2(dzp, dxp);
                c.walkSpeed = dist2D > CREEPER_CHASE_STOP_DIST ? 1.0 : 0;
                this.setMobTargetFromPlayer(c, playerPos);
                const ydAggro = yawDelta(c.yaw, c.targetYaw);
                c.yaw += clamp(ydAggro, -dt * CREEPER_TURN_RATE, dt * CREEPER_TURN_RATE);
                if (hasLOS && Math.abs(dyp) <= 3.5 && dist2D <= CREEPER_TRIGGER_DIST) {
                    c.swelling = true;
                } else if (dist2D >= CREEPER_DEESCALATE_DIST) {
                    c.fuseTimer = 0;
                }
                return;
            }
        }
        this.clearMobTarget(c);
        c.fuseTimer = Math.max(0, (c.fuseTimer || 0) - dt * 2.0);
        c.aiTimer -= dt;
        if (!c.wanderTarget || c.aiTimer <= 0) {
            c.aiTimer = CREEPER_AI_DECISION_MIN + Math.random() * (CREEPER_AI_DECISION_MAX - CREEPER_AI_DECISION_MIN);
            this.updateWanderTarget(c);
            c.walkSpeed = Math.random() < 0.75 ? (0.32 + Math.random() * 0.52) : 0;
        }
        if (c.wanderTarget) {
            const dx = c.wanderTarget.x - c.pos.x;
            const dz = c.wanderTarget.z - c.pos.z;
            const dy = c.wanderTarget.y - c.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.85 * 0.85) this.updateWanderTarget(c);
            else c.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(c.pos.x, c.pos.y, c.pos.z, CREEPER_RADIUS);
            if (dy > 0.15 && onGround && (c.jumpCooldown || 0) <= 0) {
                c.vel.y = Math.max(c.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                c.jumpCooldown = 0.45;
            }
        }
        const yd = yawDelta(c.yaw, c.targetYaw);
        c.yaw += clamp(yd, -dt * CREEPER_TURN_RATE, dt * CREEPER_TURN_RATE);
    }

    triggerCreeperExplosion(c) {
        if (!c || c._dead || c.exploded) return;
        if (this.explodeAt) {
            this.explodeAt(c.pos.x, c.pos.y, c.pos.z, CREEPER_BLAST_RADIUS);
        }
        c.exploded = true;
        c._dead = true;
        c.deathTimer = 0;
        c.walkSpeed = 0;
        c.vel.set(0, 0, 0);
    }

    updateCreeperPhysics(c, dt) {
        c.burnTimer = Math.max(0, (c.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(c, CREEPER_RADIUS);
        if (contact.water && !contact.lava) {
            c.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(c, true);
            c.burnTimer = Math.max(c.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            c.burnTimer = Math.max(c.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(c, false);
        } else {
            this.applyLavaEntryDamage(c, false);
        }
        this.applyEntityBurnDamage(c, dt);
        this.updateCreeperAI(c, dt, this.lastPlayerPos);
        if (!c._dead) {
            if (c.swelling) c.fuseTimer = Math.min(CREEPER_FUSE_SECONDS + 0.25, (c.fuseTimer || 0) + dt);
            else c.fuseTimer = Math.max(0, (c.fuseTimer || 0) - dt * 2.0);
            if (c.fuseTimer >= CREEPER_FUSE_SECONDS) {
                this.triggerCreeperExplosion(c);
                return;
            }
        }
        c.jumpCooldown = Math.max(0, (c.jumpCooldown || 0) - dt);
        const move = c.walkSpeed * CREEPER_SPEED;
        c.vel.x = Math.cos(c.yaw) * move;
        c.vel.z = Math.sin(c.yaw) * move;
        c.vel.y -= GRAVITY * dt;
        c.vel.y = clamp(c.vel.y, -14, 8);

        const blocked = this.moveEntityHorizontalWithStep(c, dt, CREEPER_RADIUS, CREEPER_HEIGHT, move, CREEPER_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && c.walkSpeed > 0.15) {
            this.tryJumpObstacle(c, CREEPER_RADIUS, CREEPER_HEIGHT);
        }

        const nextY = c.pos.y + c.vel.y * dt;
        if (!this.entityIntersectsSolid(c.pos.x, nextY, c.pos.z, CREEPER_RADIUS, CREEPER_HEIGHT)) {
            c.pos.y = nextY;
        } else {
            c.vel.y = 0;
        }

        if (c.vel.y <= 0 && this.entityHasGround(c.pos.x, c.pos.y, c.pos.z, CREEPER_RADIUS)) {
            c.vel.y = 0;
            const supportY = Math.floor(c.pos.y - 0.05);
            c.pos.y = supportY + 0.501;
        }
    }

    updateCreeperVisual(c, dt) {
        c.hurtTimer = Math.max(0, (c.hurtTimer || 0) - dt);
        c.hurtCooldown = Math.max(0, (c.hurtCooldown || 0) - dt);
        if ((c.deathTimer || 0) > 0) c.deathTimer = Math.max(0, c.deathTimer - dt);
        c.root.position.copy(c.pos);
        c.root.visible = this.isMobChunkRenderable(c.pos);
        const fuseRatio = clamp((c.fuseTimer || 0) / CREEPER_FUSE_SECONDS, 0, 1);
        const pulse = Math.sin(performance.now() * 0.03) * fuseRatio * 0.08;
        const swell = 1 + (fuseRatio * 0.18) + pulse;
        c.root.scale.set(swell, swell, swell);
        c.root.rotation.set(0, -c.yaw - Math.PI * 0.5, 0);
        c.limbPhase += c.walkSpeed * dt * CREEPER_LEG_PHASE_RATE;
        const swing = Math.cos(c.limbPhase) * c.walkSpeed * CREEPER_LEG_SWING_AMP;
        c.legPivots[0].rotation.x = swing;
        c.legPivots[1].rotation.x = -swing;
        c.legPivots[2].rotation.x = -swing;
        c.legPivots[3].rotation.x = swing;
        this.updateMobFireEffect(c, CREEPER_FIRE_SURFACE_PARTS, (c.burnTimer || 0) > 0);
    }

    isExposedToSky(pos) {
        if (!pos) return false;
        const bx = worldToBlock(pos.x);
        const bz = worldToBlock(pos.z);
        const top = this.chunkManager.getHighestBlockY(bx, bz);
        return Number.isFinite(top) && top <= Math.floor(pos.y + 0.1);
    }

    updateZombieAI(z, dt, playerPos) {
        const radius = Number.isFinite(z?.radius) ? z.radius : ZOMBIE_RADIUS;
        this.updateStuckState(z, dt);
        const aggroRadius = 24;
        if (playerPos) {
            const dxp = playerPos.x - z.pos.x;
            const dyp = playerPos.y - z.pos.y;
            const dzp = playerPos.z - z.pos.z;
            const distSq2D = dxp * dxp + dzp * dzp;
            if (distSq2D <= aggroRadius * aggroRadius && Math.abs(dyp) <= 8.0) {
                z.targetYaw = Math.atan2(dzp, dxp);
                z.walkSpeed = 1.0;
                this.setMobTargetFromPlayer(z, playerPos);
                const ydAggro = yawDelta(z.yaw, z.targetYaw);
                z.yaw += clamp(ydAggro, -dt * ZOMBIE_TURN_RATE, dt * ZOMBIE_TURN_RATE);
                return;
            }
        }
        this.clearMobTarget(z);
        z.aiTimer -= dt;
        if (!z.wanderTarget || z.aiTimer <= 0) {
            z.aiTimer = ZOMBIE_AI_DECISION_MIN + Math.random() * (ZOMBIE_AI_DECISION_MAX - ZOMBIE_AI_DECISION_MIN);
            if (z.mobType === 'giant') this.updateGiantWanderTarget(z);
            else this.updateWanderTarget(z);
            z.walkSpeed = Math.random() < 0.8 ? (0.32 + Math.random() * 0.50) : 0;
        }
        if (z.wanderTarget) {
            const dx = z.wanderTarget.x - z.pos.x;
            const dz = z.wanderTarget.z - z.pos.z;
            const dy = z.wanderTarget.y - z.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.85 * 0.85) this.updateWanderTarget(z);
            else z.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(z.pos.x, z.pos.y, z.pos.z, radius);
            if (dy > 0.15 && onGround && (z.jumpCooldown || 0) <= 0) {
                z.vel.y = Math.max(z.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                z.jumpCooldown = 0.45;
            }
        }
        const yd = yawDelta(z.yaw, z.targetYaw);
        z.yaw += clamp(yd, -dt * ZOMBIE_TURN_RATE, dt * ZOMBIE_TURN_RATE);
    }

    updateZombiePhysics(z, dt) {
        const radius = Number.isFinite(z?.radius) ? z.radius : ZOMBIE_RADIUS;
        const height = z?.mobType === 'giant' ? GIANT_HEIGHT : ZOMBIE_HEIGHT;
        z.burnTimer = Math.max(0, (z.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(z, radius);
        if (contact.water && !contact.lava) {
            z.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(z, true);
            z.burnTimer = Math.max(z.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            z.burnTimer = Math.max(z.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(z, false);
        } else {
            this.applyLavaEntryDamage(z, false);
        }

        if (z.mobType !== 'giant') {
            const daylight = this.getDaylight01();
            if (!contact.water && this.shouldIgniteUndeadInDaylight(z, dt, daylight)) {
                z.burnTimer = Math.max(z.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            }
        }

        this.applyEntityBurnDamage(z, dt);
        this.updateZombieAI(z, dt, this.lastPlayerPos);
        z.jumpCooldown = Math.max(0, (z.jumpCooldown || 0) - dt);
        z.attackCooldown = Math.max(0, (z.attackCooldown || 0) - dt);
        if (z.mobType === 'giant') {
            this.tryMobMeleePlayer(z, 3.6, GIANT_ATTACK_DAMAGE, 1.0, true);
        } else {
            this.tryMobMeleePlayer(z, 1.35, 2.0, 1.0, false);
        }

        const move = z.walkSpeed * ZOMBIE_SPEED * (z.mobType === 'giant' ? GIANT_MOVE_MULT : 1.0);
        if (z.target) {
            const dx = z.target.x - z.pos.x;
            const dz = z.target.z - z.pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 1e-4) {
                z.vel.x = (dx / dist) * move;
                z.vel.z = (dz / dist) * move;
            } else {
                z.vel.x = 0;
                z.vel.z = 0;
            }
        } else {
            z.vel.x = Math.cos(z.yaw) * move;
            z.vel.z = Math.sin(z.yaw) * move;
        }
        z.vel.y -= GRAVITY * dt;
        z.vel.y = clamp(z.vel.y, -14, 8);

        const blocked = this.moveEntityHorizontalWithStep(z, dt, radius, height, move, ZOMBIE_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && z.walkSpeed > 0.15) {
            this.tryJumpObstacle(z, radius, height);
        }

        const nextY = z.pos.y + z.vel.y * dt;
        if (!this.entityIntersectsSolid(z.pos.x, nextY, z.pos.z, radius, height)) {
            z.pos.y = nextY;
        } else {
            z.vel.y = 0;
        }

        if (z.vel.y <= 0 && this.entityHasGround(z.pos.x, z.pos.y, z.pos.z, radius)) {
            z.vel.y = 0;
            const supportY = Math.floor(z.pos.y - 0.05);
            z.pos.y = supportY + 0.501;
        }
    }

    updateZombieVisual(z, dt) {
        z.hurtTimer = Math.max(0, (z.hurtTimer || 0) - dt);
        z.hurtCooldown = Math.max(0, (z.hurtCooldown || 0) - dt);
        if ((z.deathTimer || 0) > 0) z.deathTimer = Math.max(0, z.deathTimer - dt);
        z.root.position.copy(z.pos);
        z.root.visible = this.isMobChunkRenderable(z.pos);
        z.root.rotation.set(0, -z.yaw - Math.PI * 0.5, 0);
        z.limbPhase += z.walkSpeed * dt * ZOMBIE_LEG_PHASE_RATE;
        const legSwing = Math.cos(z.limbPhase) * z.walkSpeed * ZOMBIE_LEG_SWING_AMP;
        z.legPivots[0].rotation.x = legSwing;
        z.legPivots[1].rotation.x = -legSwing;
        const armSwing = Math.cos(z.limbPhase + Math.PI) * z.walkSpeed * (ZOMBIE_LEG_SWING_AMP * 0.7);
        z.leftArm.rotation.x = armSwing;
        z.rightArm.rotation.x = -armSwing;
    }

    updateSpiderAI(s, dt, playerPos) {
        this.updateStuckState(s, dt);
        const aggroRadius = 16;
        const localBrightness = this.getLightAt(s.pos.x, s.pos.y + 1, s.pos.z) / 15.0;
        s.aggroTimer = Math.max(0, (s.aggroTimer || 0) - dt);
        s.pounceCooldown = Math.max(0, (s.pounceCooldown || 0) - dt);
        let provoked = (s.aggroTimer || 0) > 0;
        if (provoked && localBrightness > 0.5 && Math.random() < dt * 0.2) {
            // Jacobo baseline: daytime spiders can lose hostility in bright light.
            s.aggroTimer = 0;
            provoked = false;
        }
        if (playerPos && (localBrightness < 0.5 || provoked)) {
            const dxp = playerPos.x - s.pos.x;
            const dyp = playerPos.y - s.pos.y;
            const dzp = playerPos.z - s.pos.z;
            const distSq2D = dxp * dxp + dzp * dzp;
            if (distSq2D <= aggroRadius * aggroRadius && Math.abs(dyp) <= 8.0) {
                s.targetYaw = Math.atan2(dzp, dxp);
                s.walkSpeed = 1.0;
                this.setMobTargetFromPlayer(s, playerPos);
                const ydAggro = yawDelta(s.yaw, s.targetYaw);
                s.yaw += clamp(ydAggro, -dt * SPIDER_TURN_RATE, dt * SPIDER_TURN_RATE);
                const dist2D = Math.hypot(dxp, dzp);
                const onGround = this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, SPIDER_RADIUS);
                const hasPounceLOS = this.hasLineOfSight(
                    { x: s.pos.x, y: s.pos.y + 0.55, z: s.pos.z },
                    { x: playerPos.x, y: playerPos.y + 0.7, z: playerPos.z },
                    0.45
                );
                if (hasPounceLOS && Math.abs(dyp) < 2.5 && onGround && dist2D > 2.0 && dist2D < 6.0 && (s.jumpCooldown || 0) <= 0 && (s.pounceCooldown || 0) <= 0 && Math.random() < 0.12) {
                    // Beta-like spider pounce baseline while aggroed.
                    s.vel.y = Math.max(s.vel.y, MOB_FULL_BLOCK_JUMP_VEL * 0.95);
                    s.jumpCooldown = 0.5;
                    s.pounceCooldown = 1.5 + Math.random() * 0.8;
                }
                return;
            }
        }
        this.clearMobTarget(s);
        s.aiTimer -= dt;
        if (!s.wanderTarget || s.aiTimer <= 0) {
            s.aiTimer = SPIDER_AI_DECISION_MIN + Math.random() * (SPIDER_AI_DECISION_MAX - SPIDER_AI_DECISION_MIN);
            this.updateWanderTarget(s);
            s.walkSpeed = Math.random() < 0.84 ? (0.34 + Math.random() * 0.56) : 0;
        }
        if (s.wanderTarget) {
            const dx = s.wanderTarget.x - s.pos.x;
            const dz = s.wanderTarget.z - s.pos.z;
            const dy = s.wanderTarget.y - s.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.7 * 0.7) this.updateWanderTarget(s);
            else s.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, SPIDER_RADIUS);
            if (dy > 0.1 && onGround && (s.jumpCooldown || 0) <= 0) {
                s.vel.y = Math.max(s.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                s.jumpCooldown = 0.35;
            }
        }
        const yd = yawDelta(s.yaw, s.targetYaw);
        s.yaw += clamp(yd, -dt * SPIDER_TURN_RATE, dt * SPIDER_TURN_RATE);
    }

    updateSpiderPhysics(s, dt) {
        s.burnTimer = Math.max(0, (s.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(s, SPIDER_RADIUS);
        if (contact.water && !contact.lava) {
            s.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(s, true);
            s.burnTimer = Math.max(s.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            s.burnTimer = Math.max(s.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(s, false);
        } else {
            this.applyLavaEntryDamage(s, false);
        }
        this.applyEntityBurnDamage(s, dt);
        this.updateSpiderAI(s, dt, this.lastPlayerPos);
        s.jumpCooldown = Math.max(0, (s.jumpCooldown || 0) - dt);
        s.attackCooldown = Math.max(0, (s.attackCooldown || 0) - dt);
        this.tryMobMeleePlayer(s, 1.55, 2.0, 1.0, false);
        const move = s.walkSpeed * SPIDER_SPEED;
        if (s.target) {
            const dx = s.target.x - s.pos.x;
            const dz = s.target.z - s.pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 1e-4) {
                s.vel.x = (dx / dist) * move;
                s.vel.z = (dz / dist) * move;
            } else {
                s.vel.x = 0;
                s.vel.z = 0;
            }
        } else {
            s.vel.x = Math.cos(s.yaw) * move;
            s.vel.z = Math.sin(s.yaw) * move;
        }
        s.vel.y -= GRAVITY * dt;
        s.vel.y = clamp(s.vel.y, -14, 8);

        const blocked = this.moveEntityHorizontalWithStep(s, dt, SPIDER_RADIUS, SPIDER_HEIGHT, move, SPIDER_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && s.walkSpeed > 0.15) {
            // Spider baseline climb behavior: aggressively hop into blocked faces.
            if ((s.jumpCooldown || 0) <= 0) {
                s.vel.y = Math.max(s.vel.y, MOB_FULL_BLOCK_JUMP_VEL * 1.05);
                s.jumpCooldown = 0.22;
            } else {
                this.tryJumpObstacle(s, SPIDER_RADIUS, SPIDER_HEIGHT);
            }
            // Tighten climb baseline: maintain upward motion while pressing into wall faces.
            const onGround = this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, SPIDER_RADIUS);
            if (!onGround && s.vel.y < 1.8) {
                s.vel.y = Math.max(s.vel.y, 1.8);
            }
        }

        const nextY = s.pos.y + s.vel.y * dt;
        if (!this.entityIntersectsSolid(s.pos.x, nextY, s.pos.z, SPIDER_RADIUS, SPIDER_HEIGHT)) {
            s.pos.y = nextY;
        } else {
            s.vel.y = 0;
        }

        if (s.vel.y <= 0 && this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, SPIDER_RADIUS)) {
            s.vel.y = 0;
            const supportY = Math.floor(s.pos.y - 0.05);
            s.pos.y = supportY + 0.501;
        }
    }

    updateSpiderVisual(s, dt) {
        s.hurtTimer = Math.max(0, (s.hurtTimer || 0) - dt);
        s.hurtCooldown = Math.max(0, (s.hurtCooldown || 0) - dt);
        if ((s.deathTimer || 0) > 0) s.deathTimer = Math.max(0, s.deathTimer - dt);
        s.root.position.copy(s.pos);
        s.root.visible = this.isMobChunkRenderable(s.pos);
        s.root.rotation.set(0, -s.yaw - Math.PI * 0.5, 0);
        s.limbPhase += s.walkSpeed * dt * SPIDER_LEG_PHASE_RATE;
        const legSwing = Math.cos(s.limbPhase) * s.walkSpeed * SPIDER_LEG_SWING_AMP;
        for (let i = 0; i < s.legPivots.length; i++) {
            const dir = (i % 2 === 0) ? 1 : -1;
            s.legPivots[i].rotation.y += legSwing * 0.03 * dir;
            s.legPivots[i].rotation.x = legSwing * 0.25 * dir;
        }
    }

    updateSkeletonAI(s, dt, playerPos) {
        this.updateStuckState(s, dt);
        const aggroRadius = 24;
        if (playerPos) {
            const dxp = playerPos.x - s.pos.x;
            const dyp = playerPos.y - s.pos.y;
            const dzp = playerPos.z - s.pos.z;
            const distSq2D = dxp * dxp + dzp * dzp;
            if (distSq2D <= aggroRadius * aggroRadius && Math.abs(dyp) <= 8.0) {
                s.targetYaw = Math.atan2(dzp, dxp);
                const dist2D = Math.hypot(dxp, dzp);
                // Keep skeletons mobile so they can close/adjust distance and pressure the player.
                s.walkSpeed = dist2D > 9.0 ? 1.0 : (dist2D < 4.0 ? 0.45 : 0.25);
                this.setMobTargetFromPlayer(s, playerPos);
                const ydAggro = yawDelta(s.yaw, s.targetYaw);
                s.yaw += clamp(ydAggro, -dt * SKELETON_TURN_RATE, dt * SKELETON_TURN_RATE);
                return;
            }
        }
        this.clearMobTarget(s);
        s.aiTimer -= dt;
        if (!s.wanderTarget || s.aiTimer <= 0) {
            s.aiTimer = SKELETON_AI_DECISION_MIN + Math.random() * (SKELETON_AI_DECISION_MAX - SKELETON_AI_DECISION_MIN);
            this.updateWanderTarget(s);
            s.walkSpeed = Math.random() < 0.78 ? (0.28 + Math.random() * 0.52) : 0;
        }
        if (s.wanderTarget) {
            const dx = s.wanderTarget.x - s.pos.x;
            const dz = s.wanderTarget.z - s.pos.z;
            const dy = s.wanderTarget.y - s.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.8 * 0.8) this.updateWanderTarget(s);
            else s.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, SKELETON_RADIUS);
            if (dy > 0.15 && onGround && (s.jumpCooldown || 0) <= 0) {
                s.vel.y = Math.max(s.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                s.jumpCooldown = 0.45;
            }
        }
        const yd = yawDelta(s.yaw, s.targetYaw);
        s.yaw += clamp(yd, -dt * SKELETON_TURN_RATE, dt * SKELETON_TURN_RATE);
    }

    updateSkeletonPhysics(s, dt) {
        s.burnTimer = Math.max(0, (s.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(s, SKELETON_RADIUS);
        if (contact.water && !contact.lava) {
            s.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(s, true);
            s.burnTimer = Math.max(s.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            s.burnTimer = Math.max(s.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(s, false);
        } else {
            this.applyLavaEntryDamage(s, false);
        }
        const daylight = this.getDaylight01();
        if (!contact.water && this.shouldIgniteUndeadInDaylight(s, dt, daylight)) {
            s.burnTimer = Math.max(s.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
        }
        this.applyEntityBurnDamage(s, dt);
        this.updateSkeletonAI(s, dt, this.lastPlayerPos);
        s.jumpCooldown = Math.max(0, (s.jumpCooldown || 0) - dt);
        s.attackCooldown = Math.max(0, (s.attackCooldown || 0) - dt);
        const attacked = this.trySkeletonRangedAttack(s);
        if (this.lastPlayerPos) {
            const dx = this.lastPlayerPos.x - s.pos.x;
            const dz = this.lastPlayerPos.z - s.pos.z;
            const inRange = (dx * dx + dz * dz) <= (10.0 * 10.0);
            s.isAiming = attacked || (inRange && this.hasLineOfSight(
                { x: s.pos.x, y: s.pos.y + 1.4, z: s.pos.z },
                { x: this.lastPlayerPos.x, y: this.lastPlayerPos.y + 1.0, z: this.lastPlayerPos.z },
                0.45
            ));
        } else {
            s.isAiming = false;
        }

        const move = s.walkSpeed * SKELETON_SPEED;
        if (s.target) {
            const dx = s.target.x - s.pos.x;
            const dz = s.target.z - s.pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 1e-4) {
                s.vel.x = (dx / dist) * move;
                s.vel.z = (dz / dist) * move;
            } else {
                s.vel.x = 0;
                s.vel.z = 0;
            }
        } else {
            s.vel.x = Math.cos(s.yaw) * move;
            s.vel.z = Math.sin(s.yaw) * move;
        }
        s.vel.y -= GRAVITY * dt;
        s.vel.y = clamp(s.vel.y, -14, 8);

        const blocked = this.moveEntityHorizontalWithStep(s, dt, SKELETON_RADIUS, SKELETON_HEIGHT, move, SKELETON_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && s.walkSpeed > 0.15) {
            this.tryJumpObstacle(s, SKELETON_RADIUS, SKELETON_HEIGHT);
        }

        const nextY = s.pos.y + s.vel.y * dt;
        if (!this.entityIntersectsSolid(s.pos.x, nextY, s.pos.z, SKELETON_RADIUS, SKELETON_HEIGHT)) {
            s.pos.y = nextY;
        } else {
            s.vel.y = 0;
        }

        if (s.vel.y <= 0 && this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, SKELETON_RADIUS)) {
            s.vel.y = 0;
            const supportY = Math.floor(s.pos.y - 0.05);
            s.pos.y = supportY + 0.501;
        }
    }

    updateSkeletonVisual(s, dt) {
        s.hurtTimer = Math.max(0, (s.hurtTimer || 0) - dt);
        s.hurtCooldown = Math.max(0, (s.hurtCooldown || 0) - dt);
        if ((s.deathTimer || 0) > 0) s.deathTimer = Math.max(0, s.deathTimer - dt);
        s.root.position.copy(s.pos);
        s.root.visible = this.isMobChunkRenderable(s.pos);
        s.root.rotation.set(0, -s.yaw - Math.PI * 0.5, 0);
        s.limbPhase += s.walkSpeed * dt * SKELETON_LEG_PHASE_RATE;
        const legSwing = Math.cos(s.limbPhase) * s.walkSpeed * SKELETON_LEG_SWING_AMP;
        s.legPivots[0].rotation.x = legSwing;
        s.legPivots[1].rotation.x = -legSwing;
        const armSwing = Math.cos(s.limbPhase + Math.PI) * s.walkSpeed * (SKELETON_LEG_SWING_AMP * 0.65);
        if (s.isAiming) {
            // Forward aim pose (Jacobo-like): arms raise in front of the torso.
            s.leftArm.rotation.x = -1.05;
            s.rightArm.rotation.x = -1.25;
            s.leftArm.rotation.y = 0.10;
            s.rightArm.rotation.y = -0.10;
        } else {
            s.leftArm.rotation.x = -armSwing;
            s.rightArm.rotation.x = armSwing;
            s.leftArm.rotation.y = 0;
            s.rightArm.rotation.y = 0;
        }
    }

    hasLineOfSight(fromPos, toPos, step = 0.5) {
        if (!fromPos || !toPos) return false;
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (!Number.isFinite(dist) || dist > 256) return false;
        if (dist < 1e-4) return true;
        const inv = 1 / dist;
        const sx = dx * inv;
        const sy = dy * inv;
        const sz = dz * inv;
        const maxSteps = Math.min(512, Math.ceil(dist / Math.max(0.1, step)));
        for (let i = 1; i < maxSteps; i++) {
            const t = i * step;
            if (t >= dist) break;
            const x = fromPos.x + sx * t;
            const y = fromPos.y + sy * t;
            const z = fromPos.z + sz * t;
            const id = this.chunkManager.getBlock(worldToBlock(x), worldToBlock(y), worldToBlock(z));
            if (isSolidBlock(id)) return false;
        }
        return true;
    }

    getMobCollisionHeight(entity) {
        if (!entity) return 1.8;
        switch (entity.mobType) {
            case 'pig': return entity.isBaby ? (PIG_HEIGHT * PASSIVE_BABY_SCALE) : PIG_HEIGHT;
            case 'chicken': return entity.isBaby ? (CHICKEN_HEIGHT * CHICKEN_BABY_SCALE) : CHICKEN_HEIGHT;
            case 'sheep': return entity.isBaby ? (SHEEP_HEIGHT * PASSIVE_BABY_SCALE) : SHEEP_HEIGHT;
            case 'cow': return entity.isBaby ? (COW_HEIGHT * PASSIVE_BABY_SCALE) : COW_HEIGHT;
            case 'wolf': return WOLF_HEIGHT;
            case 'squid': return SQUID_HEIGHT;
            case 'creeper': return CREEPER_HEIGHT;
            case 'spider': return SPIDER_HEIGHT;
            case 'zombie': return ZOMBIE_HEIGHT;
            case 'giant': return GIANT_HEIGHT;
            case 'skeleton': return SKELETON_HEIGHT;
            case 'zombie_pigman': return ZOMBIE_PIGMAN_HEIGHT;
            case 'slime': return this.getSlimeHeightForSize(entity.size);
            case 'ghast': return GHAST_HEIGHT;
            default: return 1.8;
        }
    }

    getMobCollisionRadius(entity) {
        if (!entity) return 0.3;
        switch (entity.mobType) {
            case 'pig': return entity.isBaby ? (PIG_RADIUS * PASSIVE_BABY_SCALE) : PIG_RADIUS;
            case 'chicken': return entity.isBaby ? (CHICKEN_RADIUS * CHICKEN_BABY_SCALE) : CHICKEN_RADIUS;
            case 'sheep': return entity.isBaby ? (SHEEP_RADIUS * PASSIVE_BABY_SCALE) : SHEEP_RADIUS;
            case 'cow': return entity.isBaby ? (COW_RADIUS * PASSIVE_BABY_SCALE) : COW_RADIUS;
            case 'wolf': return WOLF_RADIUS;
            case 'squid': return SQUID_RADIUS;
            case 'creeper': return CREEPER_RADIUS;
            case 'spider': return SPIDER_RADIUS;
            case 'zombie': return ZOMBIE_RADIUS;
            case 'giant': return GIANT_RADIUS;
            case 'skeleton': return SKELETON_RADIUS;
            case 'zombie_pigman': return ZOMBIE_PIGMAN_RADIUS;
            case 'slime': return this.getSlimeRadiusForSize(entity.size);
            case 'ghast': return GHAST_RADIUS;
            default: return 0.3;
        }
    }

    tryMobMeleePlayer(entity, range = 1.4, damage = 2, cooldown = 1.0, requireLOS = false) {
        if (!this.damagePlayer || !this.lastPlayerPos || !entity || entity._dead) return false;
        if ((entity.attackCooldown || 0) > 0) return false;
        const dx = this.lastPlayerPos.x - entity.pos.x;
        const dz = this.lastPlayerPos.z - entity.pos.z;
        const playerFeetY = this.lastPlayerPos.y - PLAYER_MELEE_FEET_OFFSET;
        const playerMinY = playerFeetY;
        const playerMaxY = playerFeetY + PLAYER_MELEE_HITBOX_HEIGHT;
        const entityMinY = entity.pos.y;
        const entityMaxY = entity.pos.y + this.getMobCollisionHeight(entity);
        if (Math.min(playerMaxY, entityMaxY) <= Math.max(playerMinY, entityMinY)) return false;
        const distSq = dx * dx + dz * dz;
        if (distSq > range * range) return false;
        if (requireLOS) {
            const entityEyeY = entity.pos.y + Math.max(0.4, this.getMobCollisionHeight(entity) * 0.85);
            const playerBodyY = playerFeetY + 1.0;
            const from = { x: entity.pos.x, y: entityEyeY, z: entity.pos.z };
            const to = { x: this.lastPlayerPos.x, y: playerBodyY, z: this.lastPlayerPos.z };
            if (!this.hasLineOfSight(from, to, 0.45)) return false;
        }
        const hit = this.damagePlayer(Math.max(1, Math.floor(damage)), {
            source: 'mob',
            mobType: entity === null || entity === void 0 ? void 0 : entity.mobType
        });
        if (hit) {
            entity.attackCooldown = cooldown;
            return true;
        }
        return false;
    }

    tryMobMeleeEntity(attacker, target, range = 1.3, damage = 3, cooldown = 0.7, requireLOS = true) {
        if (!attacker || !target || attacker._dead || target._dead) return false;
        if ((attacker.attackCooldown || 0) > 0) return false;
        const dx = target.pos.x - attacker.pos.x;
        const dz = target.pos.z - attacker.pos.z;
        const attackerMinY = attacker.pos.y;
        const attackerMaxY = attacker.pos.y + this.getMobCollisionHeight(attacker);
        const targetMinY = target.pos.y;
        const targetMaxY = target.pos.y + this.getMobCollisionHeight(target);
        if (Math.min(attackerMaxY, targetMaxY) <= Math.max(attackerMinY, targetMinY)) return false;
        const distSq = dx * dx + dz * dz;
        if (distSq > range * range) return false;
        if (requireLOS) {
            const from = {
                x: attacker.pos.x,
                y: attacker.pos.y + Math.max(0.4, this.getMobCollisionHeight(attacker) * 0.85),
                z: attacker.pos.z
            };
            const to = {
                x: target.pos.x,
                y: target.pos.y + Math.max(0.4, this.getMobCollisionHeight(target) * 0.65),
                z: target.pos.z
            };
            if (!this.hasLineOfSight(from, to, 0.45)) return false;
        }
        target.health = (target.health ?? 1) - Math.max(1, Math.floor(damage));
        target.hurtTimer = Math.max(target.hurtTimer || 0, 0.25);
        target.hurtCooldown = Math.max(target.hurtCooldown || 0, 0.5);
        const horiz = Math.hypot(dx, dz) || 1;
        target.vel.x += (dx / horiz) * 2.6;
        target.vel.z += (dz / horiz) * 2.6;
        target.vel.y = Math.max(target.vel.y || 0, 3.0);
        target.lastDamageSource = 'wolf_melee';
        target.lastDamageAttackerType = attacker.mobType || 'wolf';
        target.lastDamageAtMs = Date.now();
        attacker.attackCooldown = cooldown;
        attacker.targetYaw = Math.atan2(dz, dx);
        attacker.walkSpeed = 1.0;
        if (target.health <= 0 && !target._dead) {
            target._dead = true;
            target.deathTimer = 1.0;
            target.walkSpeed = 0;
        }
        return true;
    }

    trySkeletonRangedAttack(entity) {
        if (!this.damagePlayer || !this.lastPlayerPos || !entity || entity._dead) return false;
        if ((entity.attackCooldown || 0) > 0) return false;
        const from = { x: entity.pos.x, y: entity.pos.y + 1.45, z: entity.pos.z };
        // Jacobo parity: target vertical lead is based on player eye height minus 0.7.
        // Our lastPlayerPos.y is already eye height, so do not add another eye offset.
        const to = { x: this.lastPlayerPos.x, y: this.lastPlayerPos.y - 0.7, z: this.lastPlayerPos.z };
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const dist2D = Math.hypot(dx, dz);
        const dist3D = Math.hypot(dx, dy, dz);
        if (dist3D > 10.0) return false;
        if (!this.hasLineOfSight(from, to, 0.45)) return false;
        // Jacobo skeleton attack parity: dy + horizontalDist*0.2, speed 0.6, inaccuracy 12.
        const vel = createJacoboArrowVelocity(dx, dy + dist2D * 0.2, dz, 0.6, 12.0);
        const dir = vel.clone().normalize();
        const spawnPos = new THREE.Vector3(from.x, from.y, from.z).addScaledVector(dir, 0.16);
        this.spawnSkeletonArrow(spawnPos, vel, entity);
        if (this.playBowSound) {
            this.playBowSound(1.0 / (Math.random() * 0.4 + 0.8));
        }
        // Beta baseline cadence: 30 ticks between ranged shots.
        entity.attackCooldown = 30 / TICKS_PER_SECOND;
        return true;
    }

    tryGhastRangedAttack(entity, playerPos, dt = 0) {
        if (!entity || entity._dead || !playerPos) return false;
        entity.attackTickAccumulator = (entity.attackTickAccumulator || 0) + Math.max(0, dt * TICKS_PER_SECOND);
        const stepTicks = Math.max(1, Math.floor(entity.attackTickAccumulator || 0));
        if (stepTicks > 0) {
            entity.attackTickAccumulator -= stepTicks;
        }
        const from = { x: entity.pos.x, y: entity.pos.y + 1.2, z: entity.pos.z };
        const to = { x: playerPos.x, y: playerPos.y + 1.0, z: playerPos.z };
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 64.0 || !this.hasLineOfSight(from, to, 0.55)) {
            if ((entity.attackCounter || 0) > 0) {
                entity.attackCounter = Math.max(0, (entity.attackCounter || 0) - stepTicks);
            }
            entity.isCharging = (entity.attackCounter || 0) > 10;
            return false;
        }
        entity.attackCounter = (entity.attackCounter || 0) + stepTicks;
        entity.isCharging = entity.attackCounter > 10;
        if (entity.attackCounter < 20) {
            return false;
        }
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        dir.x += (Math.random() - 0.5) * 0.03;
        dir.y += (Math.random() - 0.5) * 0.03;
        dir.z += (Math.random() - 0.5) * 0.03;
        dir.normalize();
        const spawnPos = new THREE.Vector3(from.x, from.y, from.z).addScaledVector(dir, 4.0);
        const vel = dir.multiplyScalar(GHAST_FIREBALL_SPEED);
        this.spawnGhastFireball(spawnPos, vel, entity);
        entity.attackCounter = -40;
        entity.isCharging = false;
        return true;
    }

    tryTeleportWolfNearPlayer(w, playerPos) {
        const baseY = Math.floor(playerPos.y);
        for (let a = 0; a < 10; a++) {
            const x = playerPos.x + (Math.random() * 6 - 3);
            const z = playerPos.z + (Math.random() * 6 - 3);
            const offsets = [0, -1, 1, -2, 2];
            for (const oy of offsets) {
                const y = baseY + oy;
                if (this.entityIntersectsSolid(x, y, z, WOLF_RADIUS, WOLF_HEIGHT)) continue;
                if (!this.entityHasGround(x, y, z, WOLF_RADIUS)) continue;
                w.pos.set(x, y, z);
                w.vel.set(0, 0, 0);
                w.walkSpeed = 0;
                return true;
            }
        }
        return false;
    }

    findNearestLivingSheep(pos, maxDist = 10) {
        let best = null;
        let bestDistSq = maxDist * maxDist;
        for (const s of this.sheep) {
            if (!s || s._dead) continue;
            const dx = s.pos.x - pos.x;
            const dy = (s.pos.y + 0.4) - (pos.y + 0.4);
            const dz = s.pos.z - pos.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= bestDistSq) continue;
            bestDistSq = d2;
            best = s;
        }
        return best;
    }

    tryWolfAttackNearbySheep(w) {
        if (!w || w._dead) return;
        if (w.sitting || w.tamed) return;
        if ((w.sheepAttackCooldown || 0) > 0) return;
        const target = this.findNearestLivingSheep(w.pos, 1.35);
        if (!target) return;
        target.health = (target.health ?? 1) - 2;
        target.hurtTimer = 0.25;
        target.hurtCooldown = 0.5;
        const kx = target.pos.x - w.pos.x;
        const kz = target.pos.z - w.pos.z;
        const km = Math.hypot(kx, kz) || 1;
        target.vel.x += (kx / km) * 2.4;
        target.vel.z += (kz / km) * 2.4;
        target.vel.y = Math.max(target.vel.y, 3.8);
        target.fleeTimer = 2.5;
        target.fleeFromX = w.pos.x;
        target.fleeFromZ = w.pos.z;
        target.aiTimer = 0;
        target.wanderTarget = null;
        if (target.health <= 0) {
            target._dead = true;
            target.deathTimer = 1.0;
            target.walkSpeed = 0;
        }
        w.sheepAttackCooldown = 0.8;
    }

    updateWolfAI(w, dt, playerPos) {
        if (w.sitting) {
            this.clearMobTarget(w);
            w.ownerTarget = null;
            w.walkSpeed = 0;
            w.aiTimer = 0;
            return;
        }
        if (w.angry && !w.tamed && playerPos) {
            const dxp = playerPos.x - w.pos.x;
            const dyp = playerPos.y - w.pos.y;
            const dzp = playerPos.z - w.pos.z;
            const distSqP = dxp * dxp + dyp * dyp + dzp * dzp;
            if (distSqP > 1.8 * 1.8) {
                w.targetYaw = Math.atan2(dzp, dxp);
                w.walkSpeed = 1.0;
            } else {
                w.walkSpeed = 0.25;
            }
            this.setMobTargetFromPlayer(w, playerPos);
            return;
        }
        if (w.tamed && w.ownerId === PLAYER_OWNER_ID && w.ownerTarget && !w.ownerTarget._dead) {
            const tx = w.ownerTarget.pos.x - w.pos.x;
            const ty = w.ownerTarget.pos.y - w.pos.y;
            const tz = w.ownerTarget.pos.z - w.pos.z;
            const tDistSq = tx * tx + ty * ty + tz * tz;
            if (tDistSq <= 20 * 20) {
                w.targetYaw = Math.atan2(tz, tx);
                w.walkSpeed = tDistSq > 1.7 * 1.7 ? 1.0 : 0.2;
                this.setMobTargetFromPlayer(w, w.ownerTarget.pos);
                return;
            }
            w.ownerTarget = null;
        } else if (w.ownerTarget && w.ownerTarget._dead) {
            w.ownerTarget = null;
        }
        this.clearMobTarget(w);
        if (!w.tamed) {
            const prey = this.findNearestLivingSheep(w.pos, 10);
            if (prey) {
                const dx = prey.pos.x - w.pos.x;
                const dz = prey.pos.z - w.pos.z;
                w.targetYaw = Math.atan2(dz, dx);
                w.walkSpeed = 1.0;
                return;
            }
        }
        if (w.tamed && w.ownerId === PLAYER_OWNER_ID && playerPos) {
            const dxp = playerPos.x - w.pos.x;
            const dyp = playerPos.y - w.pos.y;
            const dzp = playerPos.z - w.pos.z;
            const distSqP = dxp * dxp + dyp * dyp + dzp * dzp;
            if (distSqP > 12 * 12 && (w.followTeleportCooldown || 0) <= 0) {
                if (this.tryTeleportWolfNearPlayer(w, playerPos)) {
                    w.followTeleportCooldown = 2.0;
                }
            }
            if (distSqP > 3.0 * 3.0) {
                w.targetYaw = Math.atan2(dzp, dxp);
                const dist = Math.sqrt(distSqP);
                const t = clamp((dist - 3.0) / 10.0, 0, 1);
                w.walkSpeed = 0.55 + t * 0.45;
                return;
            }
            w.walkSpeed = 0;
            return;
        }
        this.updateStuckState(w, dt);
        w.aiTimer -= dt;
        if (!w.wanderTarget || w.aiTimer <= 0) {
            w.aiTimer = WOLF_AI_DECISION_MIN + Math.random() * (WOLF_AI_DECISION_MAX - WOLF_AI_DECISION_MIN);
            this.updateWanderTarget(w);
            w.walkSpeed = Math.random() < 0.78 ? (0.35 + Math.random() * 0.55) : 0;
        }
        if (w.wanderTarget) {
            const dx = w.wanderTarget.x - w.pos.x;
            const dz = w.wanderTarget.z - w.pos.z;
            const dy = w.wanderTarget.y - w.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.8 * 0.8) this.updateWanderTarget(w);
            else w.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(w.pos.x, w.pos.y, w.pos.z, WOLF_RADIUS);
            if (dy > 0.12 && onGround && (w.jumpCooldown || 0) <= 0) {
                w.vel.y = Math.max(w.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                w.jumpCooldown = 0.35;
            }
        }
        if (this.isEntityInWaterOrLava(w, WOLF_RADIUS) && Math.random() < 0.8) {
            w.vel.y = Math.max(w.vel.y, 5.1);
        }
        const yd = yawDelta(w.yaw, w.targetYaw);
        w.yaw += clamp(yd, -dt * WOLF_TURN_RATE, dt * WOLF_TURN_RATE);
    }

    updateWolfPhysics(w, dt) {
        if (w.tamed && w.angry) {
            w.angry = false;
            w.angryTimer = 0;
            this.updateWolfAppearance(w);
        }
        w.sheepAttackCooldown = Math.max(0, (w.sheepAttackCooldown || 0) - dt);
        w.followTeleportCooldown = Math.max(0, (w.followTeleportCooldown || 0) - dt);
        if (w.angryTimer > 0) {
            w.angryTimer = Math.max(0, w.angryTimer - dt);
            if (w.angryTimer <= 0 && w.angry) {
                w.angry = false;
                this.updateWolfAppearance(w);
            }
        }
        w.burnTimer = Math.max(0, (w.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(w, WOLF_RADIUS);
        if (contact.water && !contact.lava) {
            w.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(w, true);
            w.burnTimer = Math.max(w.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            w.burnTimer = Math.max(w.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(w, false);
        } else {
            this.applyLavaEntryDamage(w, false);
        }
        this.applyEntityBurnDamage(w, dt);
        this.updateWolfAI(w, dt, this.lastPlayerPos);
        w.attackCooldown = Math.max(0, (w.attackCooldown || 0) - dt);
        if (w.angry && !w.tamed) {
            this.tryMobMeleePlayer(w, 1.35, 2.0, 1.0, true);
        } else if (w.tamed && w.ownerTarget && !w.sitting) {
            if (w.ownerTarget._dead) {
                w.ownerTarget = null;
            } else {
                this.tryMobMeleeEntity(w, w.ownerTarget, 1.35, 4, 0.7, true);
            }
        }
        w.jumpCooldown = Math.max(0, (w.jumpCooldown || 0) - dt);
        const move = w.walkSpeed * WOLF_SPEED;
        w.vel.x = Math.cos(w.yaw) * move;
        w.vel.z = Math.sin(w.yaw) * move;
        w.vel.y -= GRAVITY * dt;
        w.vel.y = clamp(w.vel.y, -14, 8);

        const blocked = this.moveEntityHorizontalWithStep(w, dt, WOLF_RADIUS, WOLF_HEIGHT, move, WOLF_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && w.walkSpeed > 0.15) {
            this.tryJumpObstacle(w, WOLF_RADIUS, WOLF_HEIGHT);
        }

        const nextY = w.pos.y + w.vel.y * dt;
        if (!this.entityIntersectsSolid(w.pos.x, nextY, w.pos.z, WOLF_RADIUS, WOLF_HEIGHT)) {
            w.pos.y = nextY;
        } else {
            w.vel.y = 0;
        }

        if (w.vel.y <= 0 && this.entityHasGround(w.pos.x, w.pos.y, w.pos.z, WOLF_RADIUS)) {
            w.vel.y = 0;
            const supportY = Math.floor(w.pos.y - 0.05);
            w.pos.y = supportY + 0.501;
        }
    }

    updateWolfVisual(w, dt) {
        w.hurtTimer = Math.max(0, (w.hurtTimer || 0) - dt);
        w.hurtCooldown = Math.max(0, (w.hurtCooldown || 0) - dt);
        if ((w.deathTimer || 0) > 0) w.deathTimer = Math.max(0, w.deathTimer - dt);
        w.root.position.copy(w.pos);
        w.root.visible = this.isMobChunkRenderable(w.pos);
        w.root.rotation.set(0, -w.yaw - Math.PI * 0.5, 0);
        w.limbPhase += w.walkSpeed * dt * WOLF_LEG_PHASE_RATE;
        const swing = Math.cos(w.limbPhase) * w.walkSpeed * WOLF_LEG_SWING_AMP;
        if (w.sitting) {
            // Sitting pose parity baseline: fold hind legs and lower tail/head motion.
            w.legPivots[0].rotation.x = 0.25;
            w.legPivots[1].rotation.x = 0.25;
            w.legPivots[2].rotation.x = -1.05;
            w.legPivots[3].rotation.x = -1.05;
            w.headPivot.rotation.x = 0.08 + Math.sin(performance.now() * 0.0012) * (WOLF_HEAD_IDLE_AMP * 0.45);
            if (w.tamed) {
                const hp = Math.max(0, Math.min(1, (w.health || 0) / WOLF_HEALTH_TAMED));
                w.tailPivot.rotation.x = -0.8 + hp * 1.1;
            } else {
                w.tailPivot.rotation.x = -0.25;
            }
        } else {
            w.legPivots[0].rotation.x = swing;
            w.legPivots[1].rotation.x = -swing;
            w.legPivots[2].rotation.x = -swing;
            w.legPivots[3].rotation.x = swing;
            w.headPivot.rotation.x = Math.sin(performance.now() * 0.0012 + w.limbPhase) * WOLF_HEAD_IDLE_AMP;
            if (w.tamed) {
                const hp = Math.max(0, Math.min(1, (w.health || 0) / WOLF_HEALTH_TAMED));
                const base = -0.65 + hp * 1.2;
                w.tailPivot.rotation.x = base + Math.sin(performance.now() * 0.0018 + w.limbPhase * 0.45) * 0.08;
            } else {
                w.tailPivot.rotation.x = 0.3 + Math.sin(performance.now() * 0.002 + w.limbPhase * 0.5) * 0.16;
            }
        }
        this.updateMobFireEffect(w, WOLF_FIRE_SURFACE_PARTS, (w.burnTimer || 0) > 0);
    }

    updateSlimeAI(s, dt, playerPos) {
        s.aiTimer = Math.max(0, (s.aiTimer || 0) - dt);
        s.jumpCooldown = Math.max(0, (s.jumpCooldown || 0) - dt);
        const canSeePlayer = !!playerPos;
        if (canSeePlayer) {
            const dx = playerPos.x - s.pos.x;
            const dz = playerPos.z - s.pos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < 14 * 14) {
                s.targetYaw = Math.atan2(dz, dx);
            }
        }
        const onGround = this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, this.getSlimeRadiusForSize(s.size));
        if (onGround && s.jumpCooldown <= 0) {
            const base = 5.4 + Math.min(1.6, s.size * 0.6);
            s.vel.y = Math.max(s.vel.y, base);
            s.walkSpeed = 0.55 + Math.random() * 0.45;
            const cadenceScale = s.size >= 4 ? 0.55 : (s.size >= 2 ? 0.8 : 1.1);
            s.jumpCooldown = (SLIME_JUMP_MIN + Math.random() * (SLIME_JUMP_MAX - SLIME_JUMP_MIN)) * cadenceScale;
        } else if (!onGround) {
            s.walkSpeed = Math.max(0.1, s.walkSpeed * 0.96);
        } else {
            s.walkSpeed = Math.max(0, s.walkSpeed * 0.82);
        }
        if (s.aiTimer <= 0) {
            s.aiTimer = 0.5 + Math.random() * 1.4;
            if (!canSeePlayer || Math.random() < 0.35) {
                s.targetYaw += (Math.random() - 0.5) * 1.8;
            }
        }
        const yd = yawDelta(s.yaw, s.targetYaw);
        s.yaw += clamp(yd, -dt * SLIME_TURN_RATE, dt * SLIME_TURN_RATE);
    }

    updateSlimePhysics(s, dt, playerPos) {
        s.burnTimer = Math.max(0, (s.burnTimer || 0) - dt);
        const radius = this.getSlimeRadiusForSize(s.size);
        const height = this.getSlimeHeightForSize(s.size);
        const contact = this.getEntityFluidFireContact(s, radius);
        if (contact.water && !contact.lava) {
            s.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(s, true);
            s.burnTimer = Math.max(s.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            s.burnTimer = Math.max(s.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(s, false);
        } else {
            this.applyLavaEntryDamage(s, false);
        }
        this.applyEntityBurnDamage(s, dt);
        this.updateSlimeAI(s, dt, playerPos);
        s.attackCooldown = Math.max(0, (s.attackCooldown || 0) - dt);
        if (s.size > 1) {
            this.tryMobMeleePlayer(s, 1.1 + s.size * 0.2, Math.max(1, s.size - 1), 1.0, false);
        }
        const move = s.walkSpeed * SLIME_SPEED;
        s.vel.x = Math.cos(s.yaw) * move;
        s.vel.z = Math.sin(s.yaw) * move;
        s.vel.y -= GRAVITY * dt;
        s.vel.y = clamp(s.vel.y, -14, 10);

        const blocked = this.moveEntityHorizontalWithStep(s, dt, radius, height, move, SLIME_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && s.walkSpeed > 0.2) {
            this.tryJumpObstacle(s, radius, height);
        }

        const nextY = s.pos.y + s.vel.y * dt;
        if (!this.entityIntersectsSolid(s.pos.x, nextY, s.pos.z, radius, height)) {
            s.pos.y = nextY;
        } else {
            s.vel.y = 0;
        }
        if (s.vel.y <= 0 && this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, radius)) {
            s.vel.y = 0;
            const supportY = Math.floor(s.pos.y - 0.05);
            s.pos.y = supportY + 0.501;
        }
        const grounded = this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, radius);
        if (grounded && !s.wasGrounded) {
            s.squishVel = Math.max(s.squishVel || 0, 2.2);
        } else if (!grounded && s.wasGrounded) {
            s.squishVel = Math.min(s.squishVel || 0, -1.7);
        }
        s.wasGrounded = grounded;
    }

    updateSlimeVisual(s, dt) {
        s.hurtTimer = Math.max(0, (s.hurtTimer || 0) - dt);
        s.hurtCooldown = Math.max(0, (s.hurtCooldown || 0) - dt);
        if ((s.deathTimer || 0) > 0) s.deathTimer = Math.max(0, s.deathTimer - dt);
        s.squishVel = (s.squishVel || 0) * Math.pow(0.25, dt * 6.0);
        s.squish = (s.squish || 0) + (s.squishVel || 0) * dt;
        s.squish *= Math.pow(0.35, dt * 4.0);
        const q = clamp(s.squish || 0, -0.45, 0.45);
        const sy = 1 - q * 0.28;
        const sxz = 1 + q * 0.16;
        const baseScale = Math.max(1, Number(s.size || 1));
        const visualRoot = s.visualRoot || s.root;
        visualRoot.scale.set(baseScale * sxz, baseScale * sy, baseScale * sxz);
        s.root.position.copy(s.pos);
        s.root.visible = this.isMobChunkRenderable(s.pos);
        s.root.rotation.set(0, -s.yaw - Math.PI * 0.5, 0);
    }

    updateSquidAI(sq, dt) {
        const inWater = this.isEntityInWaterOrLava(sq, SQUID_RADIUS) && !this.isEntityInFireOrLava(sq, SQUID_RADIUS);
        sq.motionUpdateTicks = (sq.motionUpdateTicks || 0) - dt * TICKS_PER_SECOND;
        const zeroVec = (Math.abs(sq.randomMotionVecX) + Math.abs(sq.randomMotionVecY) + Math.abs(sq.randomMotionVecZ)) < 1e-6;
        if (sq.motionUpdateTicks <= 0 || !inWater || zeroVec) {
            this.randomizeSquidMotionVector(sq);
        }
    }

    updateSquidPhysics(sq, dt) {
        sq.burnTimer = Math.max(0, (sq.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(sq, SQUID_RADIUS);
        if (contact.water && !contact.lava) {
            sq.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(sq, true);
            sq.burnTimer = Math.max(sq.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            sq.burnTimer = Math.max(sq.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(sq, false);
        } else {
            this.applyLavaEntryDamage(sq, false);
        }
        this.applyEntityBurnDamage(sq, dt);
        this.updateSquidAI(sq, dt);
        const inWater = this.isEntityInWaterOrLava(sq, SQUID_RADIUS);
        const ticks = dt * TICKS_PER_SECOND;
        sq.prevSquidRotation = sq.squidRotation || 0;
        sq.lastTentacleAngle = sq.tentacleAngle || 0;
        sq.squidRotation = (sq.squidRotation || 0) + (sq.rotationVelocity || 0) * ticks;
        if (sq.squidRotation > Math.PI * 2) {
            sq.squidRotation -= Math.PI * 2;
            if (Math.random() < 0.1) {
                sq.rotationVelocity = 1.0 / (Math.random() + 1.0) * 0.2;
            }
        }
        if (inWater) {
            if (sq.squidRotation < Math.PI) {
                const phase = sq.squidRotation / Math.PI;
                sq.tentacleAngle = Math.sin(phase * phase * Math.PI) * Math.PI * 0.25;
                if (phase > 0.75) {
                    sq.randomMotionSpeed = 1.0;
                    sq.rotateSpeed = 1.0;
                } else {
                    sq.rotateSpeed *= 0.8;
                }
            } else {
                sq.tentacleAngle = 0.0;
                sq.randomMotionSpeed *= 0.9;
                sq.rotateSpeed *= 0.99;
            }

            sq.vel.x = (sq.randomMotionVecX || 0) * (sq.randomMotionSpeed || 0) * SQUID_SPEED;
            sq.vel.y = (sq.randomMotionVecY || 0) * (sq.randomMotionSpeed || 0) * SQUID_SPEED;
            sq.vel.z = (sq.randomMotionVecZ || 0) * (sq.randomMotionSpeed || 0) * SQUID_SPEED;

            const nx = sq.pos.x + sq.vel.x * ticks;
            const ny = sq.pos.y + sq.vel.y * ticks;
            const nz = sq.pos.z + sq.vel.z * ticks;
            if (!this.entityIntersectsSolid(nx, ny, nz, SQUID_RADIUS, SQUID_HEIGHT)) {
                sq.pos.x = nx;
                sq.pos.y = ny;
                sq.pos.z = nz;
            } else {
                // Collided while swimming: zero momentum and pick a new random swim vector.
                sq.vel.set(0, 0, 0);
                this.randomizeSquidMotionVector(sq);
                sq.randomMotionSpeed = 0.6;
            }

            const horiz = Math.hypot(sq.vel.x, sq.vel.z);
            const desiredYaw = Math.atan2(sq.vel.z, sq.vel.x);
            sq.yaw += yawDelta(sq.yaw, desiredYaw) * Math.min(1, 0.1 * ticks);
            const desiredPitch = -Math.atan2(horiz, sq.vel.y || 1e-6);
            sq.pitch += (desiredPitch - sq.pitch) * Math.min(1, 0.1 * ticks);
            sq.walkSpeed = clamp(horiz * 8.0, 0, 1);
        } else {
            sq.tentacleAngle = Math.abs(Math.sin(sq.squidRotation || 0)) * Math.PI * 0.25;
            sq.vel.x = 0;
            sq.vel.z = 0;
            sq.vel.y -= GRAVITY * dt * 0.65;
            sq.vel.y = clamp(sq.vel.y, -9, 6);
            const ny = sq.pos.y + sq.vel.y * dt;
            if (!this.entityIntersectsSolid(sq.pos.x, ny, sq.pos.z, SQUID_RADIUS, SQUID_HEIGHT)) {
                sq.pos.y = ny;
            } else {
                sq.vel.y = 0;
            }
            sq.pitch += ((-Math.PI * 0.5) - sq.pitch) * Math.min(1, 0.4 * dt * TICKS_PER_SECOND);
            sq.walkSpeed = 0;
        }
    }

    updateSquidVisual(sq, dt) {
        sq.hurtTimer = Math.max(0, (sq.hurtTimer || 0) - dt);
        sq.hurtCooldown = Math.max(0, (sq.hurtCooldown || 0) - dt);
        if ((sq.deathTimer || 0) > 0) sq.deathTimer = Math.max(0, sq.deathTimer - dt);
        sq.root.position.copy(sq.pos);
        sq.root.visible = this.isMobChunkRenderable(sq.pos);
        sq.root.rotation.set(sq.pitch || 0, -sq.yaw - Math.PI * 0.5, 0);
        sq.limbPhase += dt * SQUID_TENTACLE_RATE * (0.3 + sq.walkSpeed);
        const swing = (sq.tentacleAngle || 0) * SQUID_TENTACLE_SWING_AMP;
        for (let i = 0; i < sq.tentacles.length; i++) {
            sq.tentacles[i].rotation.x = 0.3 + swing;
        }
        this.updateMobFireEffect(sq, SQUID_FIRE_SURFACE_PARTS, (sq.burnTimer || 0) > 0);
    }

    updateChickenPhysics(ch, dt) {
        const chickenRadius = this.getMobCollisionRadius(ch);
        const chickenHeight = this.getMobCollisionHeight(ch);
        ch.burnTimer = Math.max(0, (ch.burnTimer || 0) - dt);
        const contact = this.getEntityFluidFireContact(ch, chickenRadius);
        if (contact.water && !contact.lava) {
            ch.burnTimer = 0;
        } else if (contact.lava) {
            this.applyLavaEntryDamage(ch, true);
            ch.burnTimer = Math.max(ch.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
        } else if (contact.fire) {
            ch.burnTimer = Math.max(ch.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
            this.applyLavaEntryDamage(ch, false);
        } else {
            this.applyLavaEntryDamage(ch, false);
        }
        this.applyEntityBurnDamage(ch, dt);
        this.updateChickenAI(ch, dt);
        ch.jumpCooldown = Math.max(0, (ch.jumpCooldown || 0) - dt);
        const move = ch.walkSpeed * CHICKEN_SPEED;
        ch.vel.x = Math.cos(ch.yaw) * move;
        ch.vel.z = Math.sin(ch.yaw) * move;
        ch.vel.y -= GRAVITY * dt * 0.72;
        const hasGroundNow = this.entityHasGround(ch.pos.x, ch.pos.y, ch.pos.z, chickenRadius);
        if (!hasGroundNow && ch.vel.y < 0) {
            // Beta parity: chickens damp downward velocity while airborne.
            ch.vel.y *= 0.6;
        }
        ch.vel.y = clamp(ch.vel.y, -10, 8);

        const blocked = this.moveEntityHorizontalWithStep(ch, dt, chickenRadius, chickenHeight, move, CHICKEN_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && ch.walkSpeed > 0.15) {
            this.tryJumpObstacle(ch, chickenRadius, chickenHeight);
        }

        const nextY = ch.pos.y + ch.vel.y * dt;
        if (!this.entityIntersectsSolid(ch.pos.x, nextY, ch.pos.z, chickenRadius, chickenHeight)) {
            ch.pos.y = nextY;
        } else {
            ch.vel.y = 0;
            // Keep current feet height when vertical move would intersect.
            // Ground snap below will place to exact block-top level.
        }

        if (ch.vel.y <= 0 && this.entityHasGround(ch.pos.x, ch.pos.y, ch.pos.z, chickenRadius)) {
            ch.vel.y = 0;
            const supportY = Math.floor(ch.pos.y - 0.05);
            ch.pos.y = supportY + 0.501;
        }
    }

    updateChickenVisual(ch, dt, playerPos) {
        ch.hurtTimer = Math.max(0, (ch.hurtTimer || 0) - dt);
        ch.hurtCooldown = Math.max(0, (ch.hurtCooldown || 0) - dt);
        if ((ch.deathTimer || 0) > 0) ch.deathTimer = Math.max(0, ch.deathTimer - dt);
        if (!ch._dead && (ch.ageTicks || 0) < 0) {
            ch.ageTicks = Math.min(0, (ch.ageTicks || 0) + dt * TICKS_PER_SECOND);
            ch.isBaby = ch.ageTicks < 0;
        } else {
            ch.isBaby = false;
        }
        ch.root.scale.setScalar(ch.isBaby ? CHICKEN_BABY_SCALE : 1.0);
        ch.root.position.copy(ch.pos);
        ch.root.visible = this.isMobChunkRenderable(ch.pos);
        ch.root.rotation.set(0, -ch.yaw - Math.PI * 0.5, 0);
        ch.limbPhase += ch.walkSpeed * dt * CHICKEN_LEG_PHASE_RATE;
        const legSwing = Math.cos(ch.limbPhase) * ch.walkSpeed * CHICKEN_LEG_SWING_AMP;
        ch.legPivots[0].rotation.x = legSwing;
        ch.legPivots[1].rotation.x = -legSwing;
        ch.flapPhase += dt * (CHICKEN_WING_BASE_RATE + ch.walkSpeed * CHICKEN_WING_MOVE_RATE);
        const fallingBoost = ch.vel.y < -0.05 ? clamp((-ch.vel.y) * 0.2, 0, 0.85) : 0;
        const flap = Math.sin(ch.flapPhase) * CHICKEN_WING_SWING_AMP * (0.35 + ch.walkSpeed + fallingBoost);
        ch.rightWingPivot.rotation.z = flap;
        ch.leftWingPivot.rotation.z = -flap;
        ch.headPivot.rotation.x = Math.sin(performance.now() * 0.0014 + ch.limbPhase) * CHICKEN_HEAD_IDLE_AMP;
        this.updateMobFireEffect(ch, CHICKEN_FIRE_SURFACE_PARTS, (ch.burnTimer || 0) > 0);

        // Jacobo parity: integer tick countdown (20 tps), one egg per expiry.
        if (!ch._dead && !ch.isBaby) {
            ch.eggTickAccumulator = (ch.eggTickAccumulator || 0) + dt * TICKS_PER_SECOND;
            const wholeTicks = Math.floor(ch.eggTickAccumulator);
            if (wholeTicks > 0) {
                ch.eggTickAccumulator -= wholeTicks;
                ch.loveTicks = Math.max(0, (ch.loveTicks || 0) - wholeTicks);
                ch.breedCooldownTicks = Math.max(0, (ch.breedCooldownTicks || 0) - wholeTicks);
                ch.eggTimerTicks -= wholeTicks;
                if (ch.eggTimerTicks <= 0) {
                    ch.eggTimerTicks = randomChickenEggTicks();
                    if (this.spawnDrop) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.05 + Math.random() * 0.08, (Math.random() - 0.5) * 0.08);
                        this.spawnDrop(ch.pos.x, ch.pos.y + 0.2, ch.pos.z, EGG_ITEM_ID, vel, 0.5, null, {
                            autoMagnet: false,
                            kind: 'item'
                        });
                    }
                }
            }
        }
    }

    updateGhastPhysics(g, dt, playerPos) {
        // Beta parity: ghasts are fire-immune.
        g.burnTimer = 0;
        g.burnDamageTimer = 0;
        g.prevAttackCounter = g.attackCounter || 0;
        g.aiTimer -= dt;
        if (g.aiTimer <= 0 || !Number.isFinite(g._hoverTargetX) || !Number.isFinite(g._hoverTargetY) || !Number.isFinite(g._hoverTargetZ)) {
            g.aiTimer = GHAST_AI_DECISION_MIN + Math.random() * (GHAST_AI_DECISION_MAX - GHAST_AI_DECISION_MIN);
            g._hoverTargetX = g.pos.x + (Math.random() * 2 - 1) * 16;
            g._hoverTargetY = clamp(g.pos.y + (Math.random() * 2 - 1) * 8, WORLD_DEPTH + 8, WORLD_HEIGHT - 8);
            g._hoverTargetZ = g.pos.z + (Math.random() * 2 - 1) * 16;
        }

        const tx = g._hoverTargetX - g.pos.x;
        const ty = g._hoverTargetY - g.pos.y;
        const tz = g._hoverTargetZ - g.pos.z;
        const dist = Math.hypot(tx, ty, tz);
        if (dist < 1.0 || dist > 60.0) {
            g.aiTimer = 0;
        } else {
            const dtTicks = Math.max(1, Math.round(dt * TICKS_PER_SECOND));
            g.courseChangeCooldown = (g.courseChangeCooldown || 0) - dtTicks;
            if (g.courseChangeCooldown <= 0) {
                g.courseChangeCooldown += (2 + Math.floor(Math.random() * 5)); // 2..6 ticks
                const inv = 1 / Math.max(1e-6, dist);
                const sx = tx * inv;
                const sy = ty * inv;
                const sz = tz * inv;
                let traversable = true;
                const steps = Math.max(1, Math.floor(dist));
                for (let step = 1; step <= steps; step++) {
                    const px = g.pos.x + sx * step;
                    const py = g.pos.y + sy * step;
                    const pz = g.pos.z + sz * step;
                    if (this.entityIntersectsSolid(px, py, pz, GHAST_RADIUS, GHAST_HEIGHT)) {
                        traversable = false;
                        break;
                    }
                }
                if (traversable) {
                    g.vel.x += sx * 0.1;
                    g.vel.y += sy * 0.1;
                    g.vel.z += sz * 0.1;
                } else {
                    g._hoverTargetX = g.pos.x;
                    g._hoverTargetY = g.pos.y;
                    g._hoverTargetZ = g.pos.z;
                }
            }
        }

        const nx = g.pos.x + g.vel.x * dt;
        const ny = clamp(g.pos.y + g.vel.y * dt, WORLD_DEPTH + 6, WORLD_HEIGHT - 6);
        const nz = g.pos.z + g.vel.z * dt;
        if (!this.entityIntersectsSolid(nx, ny, nz, GHAST_RADIUS, GHAST_HEIGHT)) {
            g.pos.set(nx, ny, nz);
        } else {
            g.vel.multiplyScalar(0.35);
            g.aiTimer = 0;
        }

        const txPlayer = Number(playerPos?.x) - g.pos.x;
        const tzPlayer = Number(playerPos?.z) - g.pos.z;
        if (Number.isFinite(txPlayer) && Number.isFinite(tzPlayer) && (txPlayer * txPlayer + tzPlayer * tzPlayer) > 1e-6) {
            g.targetYaw = Math.atan2(tzPlayer, txPlayer);
        } else {
            const velXZ = Math.hypot(g.vel.x, g.vel.z);
            if (velXZ > 0.06) {
                g.targetYaw = Math.atan2(g.vel.z, g.vel.x);
            }
        }
        const yd = yawDelta(g.yaw, g.targetYaw);
        g.yaw += clamp(yd, -dt * 1.8, dt * 1.8);

        this.tryGhastRangedAttack(g, playerPos, dt);
        this.updateGhastAppearance(g);

        if (this.getEntityFluidFireContact(g, GHAST_RADIUS).water) g.burnTimer = 0;
    }

    updateGhastVisual(g, dt) {
        g.root.position.copy(g.pos);
        g.root.visible = this.isMobChunkRenderable(g.pos);
        g.root.rotation.set(0, -g.yaw - Math.PI * 0.5, 0);
        g._bobPhase = (g._bobPhase || 0) + dt * 1.2;
        g.root.position.y += Math.sin(g._bobPhase) * 0.12;
        for (let i = 0; i < g.tentacles.length; i++) {
            const t = g.tentacles[i];
            t.rotation.x = Math.sin(g._bobPhase * 1.7 + i * 0.45) * 0.16;
        }
        g.hurtTimer = Math.max(0, (g.hurtTimer || 0) - dt);
        g.hurtCooldown = Math.max(0, (g.hurtCooldown || 0) - dt);
        if ((g.deathTimer || 0) > 0) g.deathTimer = Math.max(0, g.deathTimer - dt);
    }

    updateZombiePigmanAI(z, dt, playerPos) {
        z.angryTimer = Math.max(0, Number.isFinite(z.angryTimer) ? z.angryTimer - dt : 0);
        if (z.angry && z.angryTimer <= 0) {
            z.angry = false;
            this.clearMobTarget(z);
        }
        z.aiTimer -= dt;
        if (playerPos && z.angry) {
            const dxp = playerPos.x - z.pos.x;
            const dyp = playerPos.y - z.pos.y;
            const dzp = playerPos.z - z.pos.z;
            const aggroRadius = ZOMBIE_PIGMAN_PACK_AGGRO_RADIUS;
            const distSq2D = dxp * dxp + dzp * dzp;
            if (distSq2D <= aggroRadius * aggroRadius && Math.abs(dyp) <= 8.0) {
                z.targetYaw = Math.atan2(dzp, dxp);
                z.walkSpeed = 1.0;
                this.setMobTargetFromPlayer(z, playerPos);
                const ydAggro = yawDelta(z.yaw, z.targetYaw);
                z.yaw += clamp(ydAggro, -dt * ZOMBIE_PIGMAN_TURN_RATE, dt * ZOMBIE_PIGMAN_TURN_RATE);
                return;
            }
        }
        this.clearMobTarget(z);
        if (!z.wanderTarget || z.aiTimer <= 0) {
            z.aiTimer = ZOMBIE_PIGMAN_AI_DECISION_MIN + Math.random() * (ZOMBIE_PIGMAN_AI_DECISION_MAX - ZOMBIE_PIGMAN_AI_DECISION_MIN);
            this.updateWanderTarget(z);
            z.walkSpeed = Math.random() < 0.75 ? (0.32 + Math.random() * 0.52) : 0;
        }
        if (z.wanderTarget) {
            const dx = z.wanderTarget.x - z.pos.x;
            const dz = z.wanderTarget.z - z.pos.z;
            const dy = z.wanderTarget.y - z.pos.y;
            const distSq = dx * dx + dz * dz;
            if (distSq < 0.85 * 0.85) this.updateWanderTarget(z);
            else z.targetYaw = Math.atan2(dz, dx);
            const onGround = this.entityHasGround(z.pos.x, z.pos.y, z.pos.z, ZOMBIE_PIGMAN_RADIUS);
            if (dy > 0.15 && onGround && (z.jumpCooldown || 0) <= 0) {
                z.vel.y = Math.max(z.vel.y, MOB_FULL_BLOCK_JUMP_VEL);
                z.jumpCooldown = 0.45;
            }
        }
        const yd = yawDelta(z.yaw, z.targetYaw);
        z.yaw += clamp(yd, -dt * ZOMBIE_PIGMAN_TURN_RATE, dt * ZOMBIE_PIGMAN_TURN_RATE);
    }

    getZombiePigmanAngerDuration() {
        return ZOMBIE_PIGMAN_ANGER_MIN + Math.random() * (ZOMBIE_PIGMAN_ANGER_MAX - ZOMBIE_PIGMAN_ANGER_MIN);
    }

    setZombiePigmanAngry(zp, playerPos = null) {
        if (!zp || zp._dead) return;
        zp.angry = true;
        zp.angryTimer = Math.max(Number(zp.angryTimer) || 0, this.getZombiePigmanAngerDuration());
        if (playerPos) this.setMobTargetFromPlayer(zp, playerPos);
        zp.aiTimer = 0;
    }

    updateZombiePigmanPhysics(z, dt) {
        // Beta parity: Zombie Pigmen are immune to fire and lava burn damage.
        z.burnTimer = 0;
        z.burnDamageTimer = 0;
        this.updateZombiePigmanAI(z, dt, this.lastPlayerPos);
        z.jumpCooldown = Math.max(0, (z.jumpCooldown || 0) - dt);
        z.attackCooldown = Math.max(0, (z.attackCooldown || 0) - dt);
        this.tryMobMeleePlayer(z, 1.35, 5.0, 1.0, false);

        const speedMul = z.target ? ZOMBIE_PIGMAN_SPEED_ANGRY : ZOMBIE_PIGMAN_SPEED_CALM;
        const move = z.walkSpeed * speedMul;
        if (z.target) {
            const dx = z.target.x - z.pos.x;
            const dz = z.target.z - z.pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 1e-4) {
                z.vel.x = (dx / dist) * move;
                z.vel.z = (dz / dist) * move;
            } else {
                z.vel.x = 0;
                z.vel.z = 0;
            }
        } else {
            z.vel.x = Math.cos(z.yaw) * move;
            z.vel.z = Math.sin(z.yaw) * move;
        }
        z.vel.y -= GRAVITY * dt;
        z.vel.y = clamp(z.vel.y, -14, 8);

        const blocked = this.moveEntityHorizontalWithStep(z, dt, ZOMBIE_PIGMAN_RADIUS, ZOMBIE_PIGMAN_HEIGHT, move, ZOMBIE_PIGMAN_TURN_BLOCKED);
        if ((blocked.blockedX || blocked.blockedZ) && z.walkSpeed > 0.15) {
            this.tryJumpObstacle(z, ZOMBIE_PIGMAN_RADIUS, ZOMBIE_PIGMAN_HEIGHT);
        }
        const ny = z.pos.y + z.vel.y * dt;
        if (!this.entityIntersectsSolid(z.pos.x, ny, z.pos.z, ZOMBIE_PIGMAN_RADIUS, ZOMBIE_PIGMAN_HEIGHT)) z.pos.y = ny;
        else z.vel.y = 0;
        if (z.vel.y <= 0 && this.entityHasGround(z.pos.x, z.pos.y, z.pos.z, ZOMBIE_PIGMAN_RADIUS)) {
            z.vel.y = 0;
            const supportY = Math.floor(z.pos.y - 0.05);
            z.pos.y = supportY + 0.501;
        }
    }

    updateZombiePigmanVisual(z, dt) {
        z.hurtTimer = Math.max(0, (z.hurtTimer || 0) - dt);
        z.hurtCooldown = Math.max(0, (z.hurtCooldown || 0) - dt);
        if ((z.deathTimer || 0) > 0) z.deathTimer = Math.max(0, z.deathTimer - dt);
        z.root.position.copy(z.pos);
        z.root.visible = this.isMobChunkRenderable(z.pos);
        z.root.rotation.set(0, -z.yaw - Math.PI * 0.5, 0);
        z.limbPhase += z.walkSpeed * dt * ZOMBIE_PIGMAN_LEG_PHASE_RATE;
        const legSwing = Math.cos(z.limbPhase) * z.walkSpeed * ZOMBIE_PIGMAN_LEG_SWING_AMP;
        z.legPivots[0].rotation.x = legSwing;
        z.legPivots[1].rotation.x = -legSwing;
        if (z.angry) {
            // Jacobo-like aggressive zombie-arm pose when pigman is provoked.
            z.leftArm.rotation.x = -1.15;
            z.rightArm.rotation.x = -1.25;
        } else {
            const armSwing = Math.cos(z.limbPhase + Math.PI) * z.walkSpeed * (ZOMBIE_PIGMAN_LEG_SWING_AMP * 0.65);
            z.leftArm.rotation.x = armSwing;
            z.rightArm.rotation.x = -armSwing;
        }
    }

    update(dt, playerPos) {
        this.lastPlayerPos = playerPos || null;
        this.betaChunkCache.clear();
        this.spawnTickAccumulator += dt * TICKS_PER_SECOND;
        let tickBudget = Math.max(0, Math.floor(this.spawnTickAccumulator));
        if (tickBudget > 4) tickBudget = 4; // clamp catch-up burst
        if (tickBudget > 0) {
            this.spawnTickAccumulator -= tickBudget;
        }
        this.betaTicksThisUpdate = tickBudget;
        if (playerPos) {
            for (let i = 0; i < tickBudget; i++) {
                this.performBetaSpawning(playerPos);
                this.updateBetaMobSpawners(playerPos);
            }
            this.betaLight.processPending(4);
        }

        this.updateSkeletonArrows(dt, playerPos);
        this.updatePlayerSnowballs(dt, playerPos);
        this.updatePlayerEggs(dt, playerPos);
        this.updateGhastFireballs(dt, playerPos);

        for (let i = this.pigs.length - 1; i >= 0; i--) {
            const pig = this.pigs[i];
            this.applyBetaDespawnState(pig, 'pig', playerPos);
            const wholeTicks = Math.max(0, Math.floor(dt * TICKS_PER_SECOND));
            if (wholeTicks > 0) {
                pig.loveTicks = Math.max(0, (pig.loveTicks || 0) - wholeTicks);
                pig.breedCooldownTicks = Math.max(0, (pig.breedCooldownTicks || 0) - wholeTicks);
            }
            if (!pig._dead) this.updatePigPhysics(pig, dt);
            else pig.walkSpeed = 0;
            this.updatePigVisual(pig, dt, playerPos);
            if (pig._forceDespawn || ((pig._dead && (pig.deathTimer || 0) <= 0) || pig.pos.y < WORLD_DEPTH - 20)) {
                if (pig._dead && this.spawnDrop) {
                    const cooked = (pig.burnTimer || 0) > 0 || this.isEntityInFireOrLava(pig, PIG_RADIUS);
                    const dropId = cooked ? COOKED_PORKCHOP_ITEM_ID : RAW_PORKCHOP_ITEM_ID;
                    const dropCount = 1 + Math.floor(Math.random() * 3); // Beta parity: 1..3 porkchops.
                    for (let d = 0; d < dropCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(pig.pos.x, pig.pos.y + 0.35, pig.pos.z, dropId, vel, 0.1, null, {
                            autoMagnet: true,
                            kind: 'item'
                        });
                    }
                }
                this.scene.remove(pig.root);
                pig.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.pigs.splice(i, 1);
            }
        }
        for (let i = 0; i < this.pigs.length; i++) {
            const a = this.pigs[i];
            if (!a || a._dead || (a.loveTicks || 0) <= 0 || (a.breedCooldownTicks || 0) > 0) continue;
            for (let j = i + 1; j < this.pigs.length; j++) {
                const b = this.pigs[j];
                if (!b || b._dead || (b.loveTicks || 0) <= 0 || (b.breedCooldownTicks || 0) > 0) continue;
                const dx = a.pos.x - b.pos.x;
                const dy = a.pos.y - b.pos.y;
                const dz = a.pos.z - b.pos.z;
                if ((dx * dx + dy * dy + dz * dz) > (3.0 * 3.0)) continue;
                this.spawnPig((a.pos.x + b.pos.x) * 0.5, Math.max(a.pos.y, b.pos.y) + 0.1, (a.pos.z + b.pos.z) * 0.5, { isBaby: true, ageTicks: PASSIVE_BABY_AGE_TICKS });
                a.loveTicks = 0;
                b.loveTicks = 0;
                a.breedCooldownTicks = CHICKEN_BREED_COOLDOWN_TICKS;
                b.breedCooldownTicks = CHICKEN_BREED_COOLDOWN_TICKS;
                break;
            }
        }

        for (let i = this.chickens.length - 1; i >= 0; i--) {
            const ch = this.chickens[i];
            this.applyBetaDespawnState(ch, 'chicken', playerPos);
            if (!ch._dead) this.updateChickenPhysics(ch, dt);
            else ch.walkSpeed = 0;
            this.updateChickenVisual(ch, dt, playerPos);
            if (ch._forceDespawn || ((ch._dead && (ch.deathTimer || 0) <= 0) || ch.pos.y < WORLD_DEPTH - 20)) {
                if (ch._dead && this.spawnDrop) {
                    const cooked = (ch.burnTimer || 0) > 0 || this.isEntityInFireOrLava(ch, CHICKEN_RADIUS);
                    const dropId = cooked ? COOKED_CHICKEN_ITEM_ID : RAW_CHICKEN_ITEM_ID;
                    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                    this.spawnDrop(ch.pos.x, ch.pos.y + 0.25, ch.pos.z, dropId, vel, 0.1, null, {
                        autoMagnet: true,
                        kind: 'item'
                    });
                }
                this.scene.remove(ch.root);
                ch.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.chickens.splice(i, 1);
            }
        }
        // Chicken breeding parity baseline: adults in love mode nearby produce one baby.
        for (let i = 0; i < this.chickens.length; i++) {
            const a = this.chickens[i];
            if (!a || a._dead || a.isBaby || (a.ageTicks || 0) < 0) continue;
            if ((a.loveTicks || 0) <= 0 || (a.breedCooldownTicks || 0) > 0) continue;
            for (let j = i + 1; j < this.chickens.length; j++) {
                const b = this.chickens[j];
                if (!b || b._dead || b.isBaby || (b.ageTicks || 0) < 0) continue;
                if ((b.loveTicks || 0) <= 0 || (b.breedCooldownTicks || 0) > 0) continue;
                const dx = a.pos.x - b.pos.x;
                const dy = a.pos.y - b.pos.y;
                const dz = a.pos.z - b.pos.z;
                if ((dx * dx + dy * dy + dz * dz) > (3.0 * 3.0)) continue;
                const hx = (a.pos.x + b.pos.x) * 0.5;
                const hy = Math.max(a.pos.y, b.pos.y) + 0.1;
                const hz = (a.pos.z + b.pos.z) * 0.5;
                this.spawnChicken(hx, hy, hz, { isBaby: true, ageTicks: CHICKEN_BABY_AGE_TICKS });
                a.loveTicks = 0;
                b.loveTicks = 0;
                a.breedCooldownTicks = CHICKEN_BREED_COOLDOWN_TICKS;
                b.breedCooldownTicks = CHICKEN_BREED_COOLDOWN_TICKS;
                break;
            }
        }

        for (let i = this.sheep.length - 1; i >= 0; i--) {
            const s = this.sheep[i];
            this.applyBetaDespawnState(s, 'sheep', playerPos);
            if (!s._dead && (s.ageTicks || 0) < 0) {
                s.ageTicks = Math.min(0, (s.ageTicks || 0) + dt * TICKS_PER_SECOND);
                s.isBaby = s.ageTicks < 0;
            } else {
                s.isBaby = false;
            }
            s.root.scale.setScalar(SHEEP_VISUAL_SCALE * (s.isBaby ? PASSIVE_BABY_SCALE : 1.0));
            const sheepRadius = this.getMobCollisionRadius(s);
            const sheepHeight = this.getMobCollisionHeight(s);
            const wholeTicks = Math.max(0, Math.floor(dt * TICKS_PER_SECOND));
            if (wholeTicks > 0) {
                s.loveTicks = Math.max(0, (s.loveTicks || 0) - wholeTicks);
                s.breedCooldownTicks = Math.max(0, (s.breedCooldownTicks || 0) - wholeTicks);
            }
            s.burnTimer = Math.max(0, (s.burnTimer || 0) - dt);
            const sContact = this.getEntityFluidFireContact(s, sheepRadius);
            if (sContact.water && !sContact.lava) {
                s.burnTimer = 0;
            } else if (sContact.lava) {
                this.applyLavaEntryDamage(s, true);
                s.burnTimer = Math.max(s.burnTimer || 0, LAVA_BURN_TIME_SECONDS);
            } else if (sContact.fire) {
                s.burnTimer = Math.max(s.burnTimer || 0, FIRE_BURN_TIME_SECONDS);
                this.applyLavaEntryDamage(s, false);
            } else {
                this.applyLavaEntryDamage(s, false);
            }
            this.applyEntityBurnDamage(s, dt);
            s.grazingTimer = Math.max(0, (s.grazingTimer || 0) - dt);
            s.grazingCooldown = Math.max(0, (s.grazingCooldown || 0) - dt);
            const sheepFleeing = (s.fleeTimer || 0) > 0;
            // Sheep use species-tuned passive wandering.
            if (!s._dead && ((s.grazingTimer || 0) <= 0 || sheepFleeing)) this.updateSheepAI(s, dt);
            let move = 0;
            if (!s._dead) {
                if ((s.grazingTimer || 0) > 0 && !sheepFleeing) s.walkSpeed = 0;
                move = s.walkSpeed * SHEEP_SPEED;
                s.vel.x = Math.cos(s.yaw) * move;
                s.vel.z = Math.sin(s.yaw) * move;
                s.vel.y -= GRAVITY * dt;
                s.vel.y = clamp(s.vel.y, -14, 8);
            } else {
                s.walkSpeed = 0;
            }

            s.jumpCooldown = Math.max(0, (s.jumpCooldown || 0) - dt);
            if (!s._dead) {
                const blocked = this.moveEntityHorizontalWithStep(s, dt, sheepRadius, sheepHeight, move, SHEEP_TURN_BLOCKED);
                if ((blocked.blockedX || blocked.blockedZ) && s.walkSpeed > 0.15) {
                    this.tryJumpObstacle(s, sheepRadius, sheepHeight);
                }
            }

            const ny = s.pos.y + s.vel.y * dt;
            if (!this.entityIntersectsSolid(s.pos.x, ny, s.pos.z, sheepRadius, sheepHeight)) {
                s.pos.y = ny;
            } else {
                s.vel.y = 0;
            }
            if (s.vel.y <= 0 && this.entityHasGround(s.pos.x, s.pos.y, s.pos.z, sheepRadius)) {
                s.vel.y = 0;
                const supportY = Math.floor(s.pos.y - 0.05);
                s.pos.y = supportY + 0.501;
            }

            // Grazing-based regrow parity pass: sheared sheep graze on grass then regrow.
            if (s.sheared) {
                const bx = worldToBlock(s.pos.x);
                const by = worldToBlock(s.pos.y - 0.5 - 1e-4);
                const bz = worldToBlock(s.pos.z);
                const below = this.chunkManager.getBlock(bx, by, bz);
                if ((s.grazingTimer || 0) <= 0 && (s.grazingCooldown || 0) <= 0 && below === 1) {
                    if (Math.random() < dt * 0.06) {
                        s.grazingTimer = 2.0 + Math.random() * 1.2;
                        s.grazingCooldown = 20.0 + Math.random() * 20.0;
                        s.walkSpeed = 0;
                    }
                }
                if ((s.grazingTimer || 0) > 0) {
                    s.walkSpeed = 0;
                    if (below === 1 && s.grazingTimer <= 0.05) {
                        if (this.setBlock) this.setBlock(bx, by, bz, 2, 0);
                        else this.chunkManager.setBlock(bx, by, bz, 2);
                        s.sheared = false;
                    }
                }
            }

            s.root.position.copy(s.pos);
            s.root.visible = this.isMobChunkRenderable(s.pos);
            s.root.rotation.set(0, -s.yaw - Math.PI * 0.5, 0);
            s.limbPhase += s.walkSpeed * dt * SHEEP_LEG_PHASE_RATE;
            const swing = Math.cos(s.limbPhase) * s.walkSpeed * SHEEP_LEG_SWING_AMP;
            s.legPivots[0].rotation.x = swing;
            s.legPivots[1].rotation.x = -swing;
            s.legPivots[2].rotation.x = -swing;
            s.legPivots[3].rotation.x = swing;
            const grazePitch = (s.sheared && (s.grazingTimer || 0) > 0) ? 0.9 : 0;
            s.headPivot.rotation.x = grazePitch + Math.sin(performance.now() * 0.001 + s.limbPhase) * (grazePitch > 0 ? 0.01 : SHEEP_HEAD_IDLE_AMP);
            this.updateMobFireEffect(s, SHEEP_FIRE_SURFACE_PARTS, (s.burnTimer || 0) > 0);
            for (const f of s.furMeshes) f.visible = !s.sheared;
            s.hurtTimer = Math.max(0, (s.hurtTimer || 0) - dt);
            s.hurtCooldown = Math.max(0, (s.hurtCooldown || 0) - dt);
            if ((s.deathTimer || 0) > 0) s.deathTimer = Math.max(0, s.deathTimer - dt);

            if (s._forceDespawn || ((s._dead && (s.deathTimer || 0) <= 0) || s.pos.y < WORLD_DEPTH - 20)) {
                if (s._dead && !s.sheared && this.spawnDrop) {
                    // Beta parity: unsheared sheep drop one wool block on death.
                    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                    this.spawnDrop(s.pos.x, s.pos.y + 0.35, s.pos.z, WOOL_WHITE_ITEM_ID, vel, 0.1, null, {
                        autoMagnet: true,
                        kind: 'block',
                        metadata: Number.isFinite(s.fleeceColor) ? (s.fleeceColor & 15) : 0
                    });
                }
                this.scene.remove(s.root);
                s.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.sheep.splice(i, 1);
            }
        }
        for (let i = 0; i < this.sheep.length; i++) {
            const a = this.sheep[i];
            if (!a || a._dead || (a.loveTicks || 0) <= 0 || (a.breedCooldownTicks || 0) > 0) continue;
            for (let j = i + 1; j < this.sheep.length; j++) {
                const b = this.sheep[j];
                if (!b || b._dead || (b.loveTicks || 0) <= 0 || (b.breedCooldownTicks || 0) > 0) continue;
                const dx = a.pos.x - b.pos.x;
                const dy = a.pos.y - b.pos.y;
                const dz = a.pos.z - b.pos.z;
                if ((dx * dx + dy * dy + dz * dz) > (3.0 * 3.0)) continue;
                this.spawnSheep((a.pos.x + b.pos.x) * 0.5, Math.max(a.pos.y, b.pos.y) + 0.1, (a.pos.z + b.pos.z) * 0.5, { isBaby: true, ageTicks: PASSIVE_BABY_AGE_TICKS });
                a.loveTicks = 0;
                b.loveTicks = 0;
                a.breedCooldownTicks = CHICKEN_BREED_COOLDOWN_TICKS;
                b.breedCooldownTicks = CHICKEN_BREED_COOLDOWN_TICKS;
                break;
            }
        }

        for (let i = this.cows.length - 1; i >= 0; i--) {
            const c = this.cows[i];
            this.applyBetaDespawnState(c, 'cow', playerPos);
            const wholeTicks = Math.max(0, Math.floor(dt * TICKS_PER_SECOND));
            if (wholeTicks > 0) {
                c.loveTicks = Math.max(0, (c.loveTicks || 0) - wholeTicks);
                c.breedCooldownTicks = Math.max(0, (c.breedCooldownTicks || 0) - wholeTicks);
            }
            if (!c._dead) this.updateCowPhysics(c, dt);
            else c.walkSpeed = 0;
            this.updateCowVisual(c, dt);
            if (c._forceDespawn || ((c._dead && (c.deathTimer || 0) <= 0) || c.pos.y < WORLD_DEPTH - 20)) {
                if (c._dead && this.spawnDrop) {
                    // Jacobo EntityLiving dropFewItems parity: rand.nextInt(3) -> 0..2 leather.
                    const dropCount = Math.floor(Math.random() * 3);
                    for (let d = 0; d < dropCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(c.pos.x, c.pos.y + 0.35, c.pos.z, LEATHER_ITEM_ID, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                }
                this.scene.remove(c.root);
                c.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.cows.splice(i, 1);
            }
        }
        for (let i = 0; i < this.cows.length; i++) {
            const a = this.cows[i];
            if (!a || a._dead || (a.loveTicks || 0) <= 0 || (a.breedCooldownTicks || 0) > 0) continue;
            for (let j = i + 1; j < this.cows.length; j++) {
                const b = this.cows[j];
                if (!b || b._dead || (b.loveTicks || 0) <= 0 || (b.breedCooldownTicks || 0) > 0) continue;
                const dx = a.pos.x - b.pos.x;
                const dy = a.pos.y - b.pos.y;
                const dz = a.pos.z - b.pos.z;
                if ((dx * dx + dy * dy + dz * dz) > (3.0 * 3.0)) continue;
                this.spawnCow((a.pos.x + b.pos.x) * 0.5, Math.max(a.pos.y, b.pos.y) + 0.1, (a.pos.z + b.pos.z) * 0.5, { isBaby: true, ageTicks: PASSIVE_BABY_AGE_TICKS });
                a.loveTicks = 0;
                b.loveTicks = 0;
                a.breedCooldownTicks = CHICKEN_BREED_COOLDOWN_TICKS;
                b.breedCooldownTicks = CHICKEN_BREED_COOLDOWN_TICKS;
                break;
            }
        }

        for (let i = this.creepers.length - 1; i >= 0; i--) {
            const c = this.creepers[i];
            this.applyBetaDespawnState(c, 'creeper', playerPos);
            if (!c._dead) this.updateCreeperPhysics(c, dt);
            else c.walkSpeed = 0;
            this.updateCreeperVisual(c, dt);
            if (c._forceDespawn || ((c._dead && (c.deathTimer || 0) <= 0) || c.pos.y < WORLD_DEPTH - 20)) {
                if (c._dead && !c.exploded && this.spawnDrop) {
                    const dropCount = Math.floor(Math.random() * 3); // Jacobo baseline: 0..2 gunpowder
                    for (let d = 0; d < dropCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(c.pos.x, c.pos.y + 0.3, c.pos.z, 92, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                    const recentSkeletonKill = (
                        c.lastDamageSource === 'skeleton_arrow' &&
                        c.lastDamageAttackerType === 'skeleton' &&
                        Number.isFinite(c.lastDamageAtMs) &&
                        (Date.now() - c.lastDamageAtMs) <= 5000
                    );
                    if (recentSkeletonKill) {
                        const discId = (Math.random() < 0.5) ? 2000 : 2001;
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.1 + Math.random() * 0.12, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(c.pos.x, c.pos.y + 0.35, c.pos.z, discId, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                }
                this.scene.remove(c.root);
                c.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.creepers.splice(i, 1);
            }
        }

        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const z = this.zombies[i];
            this.applyBetaDespawnState(z, 'zombie', playerPos);
            if (!z._dead) this.updateZombiePhysics(z, dt);
            else z.walkSpeed = 0;
            this.updateZombieVisual(z, dt);
            if (z._forceDespawn || ((z._dead && (z.deathTimer || 0) <= 0) || z.pos.y < WORLD_DEPTH - 20)) {
                if (z._dead && this.spawnDrop && z.mobType !== 'giant') {
                    // Beta baseline: zombies drop feathers (0..2).
                    const dropCount = Math.floor(Math.random() * 3);
                    for (let d = 0; d < dropCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(z.pos.x, z.pos.y + 0.3, z.pos.z, 32, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                }
                this.scene.remove(z.root);
                z.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.zombies.splice(i, 1);
            }
        }

        for (let i = this.spiders.length - 1; i >= 0; i--) {
            const s = this.spiders[i];
            this.applyBetaDespawnState(s, 'spider', playerPos);
            if (!s._dead) this.updateSpiderPhysics(s, dt);
            else s.walkSpeed = 0;
            this.updateSpiderVisual(s, dt);
            if (s._forceDespawn || ((s._dead && (s.deathTimer || 0) <= 0) || s.pos.y < WORLD_DEPTH - 20)) {
                if (s._dead && this.spawnDrop) {
                    // Beta baseline: spider string drop count in 0..2 range.
                    const dropCount = Math.floor(Math.random() * 3);
                    for (let d = 0; d < dropCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(s.pos.x, s.pos.y + 0.25, s.pos.z, 31, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                }
                this.scene.remove(s.root);
                s.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.spiders.splice(i, 1);
            }
        }

        for (let i = this.skeletons.length - 1; i >= 0; i--) {
            const s = this.skeletons[i];
            this.applyBetaDespawnState(s, 'skeleton', playerPos);
            if (!s._dead) this.updateSkeletonPhysics(s, dt);
            else s.walkSpeed = 0;
            this.updateBetaRider(s);
            this.updateSkeletonVisual(s, dt);
            if (s._forceDespawn || ((s._dead && (s.deathTimer || 0) <= 0) || s.pos.y < WORLD_DEPTH - 20)) {
                if (s._dead && this.spawnDrop) {
                    const arrowCount = Math.floor(Math.random() * 3); // 0..2 arrows
                    const boneCount = Math.floor(Math.random() * 3);  // 0..2 bones
                    for (let d = 0; d < arrowCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(s.pos.x, s.pos.y + 0.28, s.pos.z, 6, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                    for (let d = 0; d < boneCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(s.pos.x, s.pos.y + 0.28, s.pos.z, 96, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                }
                this.scene.remove(s.root);
                s.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.skeletons.splice(i, 1);
            }
        }

        for (let i = this.slimes.length - 1; i >= 0; i--) {
            const s = this.slimes[i];
            this.applyBetaDespawnState(s, 'slime', playerPos);
            if (!s._dead) this.updateSlimePhysics(s, dt, playerPos);
            else s.walkSpeed = 0;
            this.updateSlimeVisual(s, dt);
            if (s._forceDespawn || ((s._dead && (s.deathTimer || 0) <= 0) || s.pos.y < WORLD_DEPTH - 20)) {
                if (s._dead) {
                    const childSize = Math.floor((s.size || 1) / 2);
                    if (childSize >= 1) {
                        // EntitySlime.setEntityDead: four children, only when health is exactly 0.
                        if (Number(s.health) === 0) {
                            const size = s.size || 1;
                            for (let n = 0; n < 4; n++) {
                                const ox = ((n % 2) - 0.5) * size / 4;
                                const oz = ((n >> 1) - 0.5) * size / 4;
                                this.spawnSlime(s.pos.x + ox, s.pos.y + 0.5, s.pos.z + oz, childSize);
                            }
                        }
                    } else if (this.spawnDrop) {
                        const dropCount = Math.floor(Math.random() * 3); // 0..2
                        for (let d = 0; d < dropCount; d++) {
                            const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                            this.spawnDrop(s.pos.x, s.pos.y + 0.22, s.pos.z, SLIMEBALL_ITEM_ID, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                        }
                    }
                }
                this.scene.remove(s.root);
                s.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.slimes.splice(i, 1);
            }
        }

        for (let i = this.ghasts.length - 1; i >= 0; i--) {
            const g = this.ghasts[i];
            this.applyBetaDespawnState(g, 'ghast', playerPos);
            if (!g._dead) this.updateGhastPhysics(g, dt, playerPos);
            else g.walkSpeed = 0;
            this.updateGhastVisual(g, dt);
            if (g._forceDespawn || ((g._dead && (g.deathTimer || 0) <= 0) || g.pos.y < WORLD_DEPTH - 20)) {
                if (g._dead && this.spawnDrop) {
                    const dropCount = Math.floor(Math.random() * 3); // gunpowder: 0..2
                    for (let d = 0; d < dropCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(g.pos.x, g.pos.y + 0.35, g.pos.z, 92, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                }
                this.scene.remove(g.root);
                g.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.ghasts.splice(i, 1);
            }
        }

        for (let i = this.zombiePigmen.length - 1; i >= 0; i--) {
            const z = this.zombiePigmen[i];
            this.applyBetaDespawnState(z, 'zombie_pigman', playerPos);
            if (!z._dead) this.updateZombiePigmanPhysics(z, dt);
            else z.walkSpeed = 0;
            this.updateZombiePigmanVisual(z, dt);
            if (z._forceDespawn || ((z._dead && (z.deathTimer || 0) <= 0) || z.pos.y < WORLD_DEPTH - 20)) {
                if (z._dead && this.spawnDrop) {
                    const dropCount = Math.floor(Math.random() * 3); // baseline 0..2 cooked porkchops
                    for (let d = 0; d < dropCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(z.pos.x, z.pos.y + 0.3, z.pos.z, COOKED_PORKCHOP_ITEM_ID, vel, 0.1, null, { autoMagnet: true, kind: 'item' });
                    }
                }
                this.scene.remove(z.root);
                z.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.zombiePigmen.splice(i, 1);
            }
        }

        for (let i = this.wolves.length - 1; i >= 0; i--) {
            const w = this.wolves[i];
            this.applyBetaDespawnState(w, 'wolf', playerPos);
            if (!w._dead) {
                this.updateWolfPhysics(w, dt);
                this.tryWolfAttackNearbySheep(w);
            }
            else w.walkSpeed = 0;
            this.updateWolfVisual(w, dt);
            if (w._forceDespawn || ((w._dead && (w.deathTimer || 0) <= 0) || w.pos.y < WORLD_DEPTH - 20)) {
                this.scene.remove(w.root);
                w.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.wolves.splice(i, 1);
            }
        }
        for (let i = this.squids.length - 1; i >= 0; i--) {
            const sq = this.squids[i];
            this.applyBetaDespawnState(sq, 'squid', playerPos);
            if (!sq._dead) this.updateSquidPhysics(sq, dt);
            else sq.walkSpeed = 0;
            this.updateSquidVisual(sq, dt);
            if (sq._forceDespawn || ((sq._dead && (sq.deathTimer || 0) <= 0) || sq.pos.y < WORLD_DEPTH - 20)) {
                if (sq._dead && this.spawnDrop) {
                    // Jacobo EntitySquid.dropFewItems parity: 1..3 ink sacs.
                    const dropCount = 1 + Math.floor(Math.random() * 3);
                    for (let d = 0; d < dropCount; d++) {
                        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12);
                        this.spawnDrop(sq.pos.x, sq.pos.y + 0.25, sq.pos.z, INK_SAC_ITEM_ID, vel, 0.1, null, {
                            autoMagnet: true,
                            kind: 'item',
                            metadata: 0
                        });
                    }
                }
                this.scene.remove(sq.root);
                sq.root.traverse((obj) => {
                    if (!obj.isMesh) return;
                    if (obj.geometry) obj.geometry.dispose();
                });
                this.squids.splice(i, 1);
            }
        }
    }

    tryShearNearestSheep(camera, maxDist = 4.5) {
        let best = null;
        let bestT = Infinity;
        camera.getWorldDirection(this.tmpVec);
        const ox = camera.position.x;
        const oy = camera.position.y;
        const oz = camera.position.z;
        const dx = this.tmpVec.x;
        const dy = this.tmpVec.y;
        const dz = this.tmpVec.z;

        for (const s of this.sheep) {
            if (s.sheared) continue;
            const cx = s.pos.x;
            const cy = s.pos.y + 0.6;
            const cz = s.pos.z;
            const r = 0.9;
            const lx = cx - ox;
            const ly = cy - oy;
            const lz = cz - oz;
            const tca = lx * dx + ly * dy + lz * dz;
            if (tca < 0 || tca > maxDist) continue;
            const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
            if (d2 > r * r) continue;
            if (tca < bestT) {
                bestT = tca;
                best = s;
            }
        }
        if (!best) return { ok: false, msg: 'No sheep in range to shear.' };
        best.sheared = true;
        best.regrowCheckTimer = 0;
        best.grazingTimer = 0;
        best.grazingCooldown = 25.0 + Math.random() * 20.0;
        const dropCount = 2 + Math.floor(Math.random() * 3); // Jacobo EntitySheep: 2..4 wool
        if (this.spawnDrop) {
            for (let i = 0; i < dropCount; i++) {
                const vel = new THREE.Vector3((Math.random() - 0.5) * 1.2, 2.0 + Math.random() * 1.0, (Math.random() - 0.5) * 1.2);
                this.spawnDrop(best.pos.x, best.pos.y + 0.7, best.pos.z, WOOL_WHITE_ITEM_ID, vel, 0.1, null, {
                    autoMagnet: true,
                    kind: 'block',
                    metadata: Number.isFinite(best.fleeceColor) ? (best.fleeceColor & 15) : 0
                });
            }
        }
        return { ok: true, msg: `Sheared sheep and dropped ${dropCount} wool.` };
    }

    tryAttackNearestMob(camera, maxDist = 4.5, damage = 1) {
        let best = null;
        let bestT = Infinity;
        camera.getWorldDirection(this.tmpVec);
        const ox = camera.position.x;
        const oy = camera.position.y;
        const oz = camera.position.z;
        const dx = this.tmpVec.x;
        const dy = this.tmpVec.y;
        const dz = this.tmpVec.z;

        const testMob = (mob, radius, type) => {
            const cx = mob.pos.x;
            const cy = mob.pos.y + 0.6;
            const cz = mob.pos.z;
            const lx = cx - ox;
            const ly = cy - oy;
            const lz = cz - oz;
            const tca = lx * dx + ly * dy + lz * dz;
            if (tca < 0 || tca > maxDist) return;
            const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
            if (d2 > radius * radius) return;
            if (tca < bestT) {
                bestT = tca;
                best = { mob, type };
            }
        };

        for (const p of this.pigs) testMob(p, 0.9, 'pig');
        for (const c of this.chickens) testMob(c, 0.6, 'chicken');
        for (const s of this.sheep) testMob(s, 0.95, 'sheep');
        for (const c of this.cows) testMob(c, 0.95, 'cow');
        for (const c of this.creepers) testMob(c, 0.9, 'creeper');
        for (const z of this.zombies) testMob(z, (z?.mobType === 'giant') ? 2.8 : 0.9, (z?.mobType === 'giant') ? 'giant' : 'zombie');
        for (const s of this.spiders) testMob(s, 0.95, 'spider');
        for (const s of this.skeletons) testMob(s, 0.9, 'skeleton');
        for (const z of this.zombiePigmen) testMob(z, 0.9, 'zombie_pigman');
        for (const s of this.slimes) testMob(s, 0.5 + this.getSlimeRadiusForSize(s.size), 'slime');
        for (const g of this.ghasts) testMob(g, 2.1, 'ghast');
        for (const w of this.wolves) testMob(w, 0.85, 'wolf');
        for (const sq of this.squids) testMob(sq, 0.9, 'squid');

        if (!best) return { ok: false, msg: 'No mob in range.' };
        const target = best.mob;
        if ((target.deathTimer || 0) > 0) return { ok: false, msg: 'Mob already dying.' };
        if ((target.hurtCooldown || 0) > 0) return { ok: false, msg: 'Mob is recovering.' };
        target.health = (target.health ?? 1) - Math.max(1, Math.floor(damage));
        target.hurtTimer = 0.25;
        target.hurtCooldown = 0.5;
        target.lastDamageSource = 'player_melee';
        target.lastDamageAttackerType = 'player';
        target.lastDamageAtMs = Date.now();

        const kx = target.pos.x - ox;
        const kz = target.pos.z - oz;
        const km = Math.hypot(kx, kz) || 1;
        const nx = kx / km;
        const nz = kz / km;
        target.vel.x += nx * 3.2;
        target.vel.z += nz * 3.2;
        target.vel.y = Math.max(target.vel.y, 4.8);
        target.targetYaw = Math.atan2(nz, nx);
        target.walkSpeed = 1.0;
        target.aiTimer = 0.2;
        if (best.type === 'sheep') {
            target.fleeTimer = Math.max(target.fleeTimer || 0, 2.0);
            target.fleeFromX = ox;
            target.fleeFromZ = oz;
            target.wanderTarget = null;
            target.aiTimer = 0;
        } else if (best.type === 'pig' || best.type === 'chicken' || best.type === 'cow') {
            target.panicTimer = Math.max(target.panicTimer || 0, PASSIVE_PANIC_TIMER_SECONDS);
            target.panicFromX = ox;
            target.panicFromZ = oz;
            target.wanderTarget = null;
            target.aiTimer = 0;
        } else if (best.type === 'spider') {
            // Spider parity baseline: provoked spiders stay hostile for a while, even in daylight.
            target.aggroTimer = Math.max(target.aggroTimer || 0, 15.0);
            const aggroRadiusSq = 16 * 16;
            for (const sp of this.spiders) {
                if (!sp || sp._dead) continue;
                const dxs = sp.pos.x - target.pos.x;
                const dzs = sp.pos.z - target.pos.z;
                if ((dxs * dxs + dzs * dzs) > aggroRadiusSq) continue;
                sp.aggroTimer = Math.max(sp.aggroTimer || 0, 10.0);
            }
        }
        if (best.type === 'wolf' && !target.tamed) {
            const aggroRadiusSq = 16 * 16;
            for (const w of this.wolves) {
                if (!w || w._dead || w.tamed) continue;
                const dxw = w.pos.x - target.pos.x;
                const dzw = w.pos.z - target.pos.z;
                if ((dxw * dxw + dzw * dzw) > aggroRadiusSq) continue;
                w.angry = true;
                w.angryTimer = 20.0;
                this.setMobTargetFromPlayer(w, { x: ox, y: oy, z: oz });
                w.aiTimer = 0;
                this.updateWolfAppearance(w);
            }
        }
        if (best.type === 'zombie_pigman') {
            const aggroRadiusSq = ZOMBIE_PIGMAN_PACK_AGGRO_RADIUS * ZOMBIE_PIGMAN_PACK_AGGRO_RADIUS;
            const playerSnapshot = { x: ox, y: oy, z: oz };
            for (const zp of this.zombiePigmen) {
                if (!zp || zp._dead) continue;
                const dxz = zp.pos.x - target.pos.x;
                const dyz = zp.pos.y - target.pos.y;
                const dzz = zp.pos.z - target.pos.z;
                if ((dxz * dxz + dyz * dyz + dzz * dzz) > aggroRadiusSq) continue;
                this.setZombiePigmanAngry(zp, playerSnapshot);
            }
        }
        if (best.type === 'creeper' || best.type === 'zombie' || best.type === 'giant' || best.type === 'spider' || best.type === 'skeleton' || best.type === 'zombie_pigman') {
            this.setMobTargetFromPlayer(target, { x: ox, y: oy, z: oz });
            target.aiTimer = 0;
        }

        if (target.health <= 0) {
            target._dead = true;
            target.deathTimer = 1.0; // Approx Beta death window before removal.
            target.walkSpeed = 0;
            return { ok: true, msg: `Killed ${best.type}.` };
        }
        return { ok: true, msg: `Hit ${best.type}.` };
    }

    tryMilkNearestCow(camera, maxDist = 4.5) {
        let best = null;
        let bestT = Infinity;
        camera.getWorldDirection(this.tmpVec);
        const ox = camera.position.x;
        const oy = camera.position.y;
        const oz = camera.position.z;
        const dx = this.tmpVec.x;
        const dy = this.tmpVec.y;
        const dz = this.tmpVec.z;

        for (const c of this.cows) {
            if (!c || c._dead) continue;
            const cx = c.pos.x;
            const cy = c.pos.y + 0.7;
            const cz = c.pos.z;
            const r = 0.95;
            const lx = cx - ox;
            const ly = cy - oy;
            const lz = cz - oz;
            const tca = lx * dx + ly * dy + lz * dz;
            if (tca < 0 || tca > maxDist) continue;
            const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
            if (d2 > r * r) continue;
            if (tca < bestT) {
                bestT = tca;
                best = c;
            }
        }
        if (!best) return { ok: false, msg: 'No cow in range to milk.' };
        return { ok: true, msg: 'Filled bucket with milk.' };
    }

    tryBreedNearestChicken(camera, itemId, maxDist = 4.5) {
        if (itemId !== SEEDS_ITEM_ID) return { ok: false, consumed: false, msg: '' };
        let best = null;
        let bestT = Infinity;
        camera.getWorldDirection(this.tmpVec);
        const ox = camera.position.x;
        const oy = camera.position.y;
        const oz = camera.position.z;
        const dx = this.tmpVec.x;
        const dy = this.tmpVec.y;
        const dz = this.tmpVec.z;

        for (const ch of this.chickens) {
            if (!ch || ch._dead || ch.isBaby || (ch.ageTicks || 0) < 0) continue;
            if ((ch.breedCooldownTicks || 0) > 0) continue;
            const cx = ch.pos.x;
            const cy = ch.pos.y + 0.55;
            const cz = ch.pos.z;
            const r = 0.8;
            const lx = cx - ox;
            const ly = cy - oy;
            const lz = cz - oz;
            const tca = lx * dx + ly * dy + lz * dz;
            if (tca < 0 || tca > maxDist) continue;
            const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
            if (d2 > r * r) continue;
            if (tca < bestT) {
                bestT = tca;
                best = ch;
            }
        }
        if (!best) return { ok: false, consumed: false, msg: 'No adult chicken in range.' };
        best.loveTicks = Math.max(best.loveTicks || 0, CHICKEN_LOVE_DURATION_TICKS);
        return { ok: true, consumed: true, msg: 'Chicken is in love mode.' };
    }

    tryBreedNearestAnimal(camera, itemId, maxDist = 4.5) {
        const chickenRes = this.tryBreedNearestChicken(camera, itemId, maxDist);
        if (chickenRes && (chickenRes.consumed || chickenRes.msg)) return chickenRes;
        if (itemId !== WHEAT_ITEM_ID) return { ok: false, consumed: false, msg: '' };

        let best = null;
        let bestT = Infinity;
        let bestType = '';
        camera.getWorldDirection(this.tmpVec);
        const ox = camera.position.x;
        const oy = camera.position.y;
        const oz = camera.position.z;
        const dx = this.tmpVec.x;
        const dy = this.tmpVec.y;
        const dz = this.tmpVec.z;

        const test = (mob, type, cyOffset, radius) => {
            if (!mob || mob._dead) return;
            if (mob.isBaby || (mob.ageTicks || 0) < 0) return;
            if ((mob.breedCooldownTicks || 0) > 0) return;
            const cx = mob.pos.x;
            const cy = mob.pos.y + cyOffset;
            const cz = mob.pos.z;
            const lx = cx - ox;
            const ly = cy - oy;
            const lz = cz - oz;
            const tca = lx * dx + ly * dy + lz * dz;
            if (tca < 0 || tca > maxDist) return;
            const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
            if (d2 > radius * radius) return;
            if (tca < bestT) {
                bestT = tca;
                best = mob;
                bestType = type;
            }
        };
        for (const p of this.pigs) test(p, 'pig', 0.55, 0.9);
        for (const s of this.sheep) test(s, 'sheep', 0.6, 0.95);
        for (const c of this.cows) test(c, 'cow', 0.7, 0.95);

        if (!best) return { ok: false, consumed: false, msg: 'No breedable animal in range.' };
        best.loveTicks = Math.max(best.loveTicks || 0, CHICKEN_LOVE_DURATION_TICKS);
        return { ok: true, consumed: true, msg: `${bestType} is in love mode.` };
    }

    findNearestWolfInView(camera, maxDist = 4.5, opts = {}) {
        const {
            includeTamed = true,
            includeUntamed = true,
            ownerId = null,
            hitRadius = 0.85
        } = opts || {};
        let best = null;
        let bestT = Infinity;
        camera.getWorldDirection(this.tmpVec);
        const ox = camera.position.x;
        const oy = camera.position.y;
        const oz = camera.position.z;
        const dx = this.tmpVec.x;
        const dy = this.tmpVec.y;
        const dz = this.tmpVec.z;

        for (const w of this.wolves) {
            if (!w || w._dead) continue;
            if (w.tamed && !includeTamed) continue;
            if (!w.tamed && !includeUntamed) continue;
            if (ownerId !== null && (w.ownerId || null) !== ownerId) continue;
            const cx = w.pos.x;
            const cy = w.pos.y + 0.55;
            const cz = w.pos.z;
            const r = Math.max(0.1, Number(hitRadius) || 0.85);
            const lx = cx - ox;
            const ly = cy - oy;
            const lz = cz - oz;
            const tca = lx * dx + ly * dy + lz * dz;
            if (tca < 0 || tca > maxDist) continue;
            const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
            if (d2 > r * r) continue;
            if (tca < bestT) {
                bestT = tca;
                best = w;
            }
        }
        return best;
    }

    tryTameNearestWolf(camera, maxDist = 4.5) {
        const wolf = this.findNearestWolfInView(camera, maxDist, { includeTamed: false, includeUntamed: true });
        if (!wolf) return { ok: false, consumed: false, msg: 'No wolf in range to tame.' };
        const success = Math.random() < (1 / 3);
        if (success) {
            wolf.tamed = true;
            wolf.sitting = true;
            wolf.angry = false;
            wolf.angryTimer = 0;
            wolf.ownerId = PLAYER_OWNER_ID;
            wolf.health = Math.max(wolf.health || 0, WOLF_HEALTH_TAMED);
            wolf._despawnAgeTicks = 0;
            wolf.walkSpeed = 0;
            wolf.vel.x = 0;
            wolf.vel.z = 0;
            wolf.wanderTarget = null;
            wolf.aiTimer = 0;
            this.updateWolfAppearance(wolf);
            return { ok: true, consumed: true, msg: 'Wolf tamed.' };
        }
        return { ok: true, consumed: true, msg: 'Wolf resisted taming.' };
    }

    tryToggleNearestWolfSit(camera, maxDist = 4.5) {
        const wolf = this.findNearestWolfInView(camera, maxDist, { includeTamed: true, includeUntamed: false, ownerId: PLAYER_OWNER_ID });
        if (!wolf) return { ok: false, msg: 'No tamed wolf in range.' };
        wolf.sitting = !wolf.sitting;
        if (wolf.sitting) {
            wolf.walkSpeed = 0;
            wolf.vel.x = 0;
            wolf.vel.y = 0;
            wolf.vel.z = 0;
            wolf.wanderTarget = null;
            wolf.aiTimer = 0;
        } else {
            wolf.vel.y = 0;
            wolf.aiTimer = 0;
            wolf.wanderTarget = null;
        }
        wolf._despawnAgeTicks = 0;
        return { ok: true, msg: wolf.sitting ? 'Wolf sits.' : 'Wolf stands.' };
    }

    tryFeedNearestOwnedWolf(camera, itemId, maxDist = 4.5) {
        const wolf = this.findNearestWolfInView(camera, maxDist, {
            includeTamed: true,
            includeUntamed: false,
            ownerId: PLAYER_OWNER_ID,
            hitRadius: 0.35
        });
        if (!wolf || wolf._dead) return { ok: false, consumed: false, msg: '' };
        const id = Number(itemId);
        let heal = 0;
        if (id === RAW_PORKCHOP_ITEM_ID) heal = 3;
        else if (id === COOKED_PORKCHOP_ITEM_ID) heal = 8;
        else return { ok: false, consumed: false, msg: '' };

        const maxHealth = WOLF_HEALTH_TAMED;
        const cur = Number.isFinite(wolf.health) ? wolf.health : maxHealth;
        if (cur >= maxHealth) return { ok: false, consumed: false, msg: 'Wolf is already at full health.' };
        wolf.health = Math.min(maxHealth, cur + heal);
        wolf._despawnAgeTicks = 0;
        return { ok: true, consumed: true, msg: 'Fed wolf.' };
    }

    serializeState() {
        const pigs = this.pigs.map((p) => ({
            x: p.pos.x, y: p.pos.y, z: p.pos.z,
            velX: p.vel.x, velY: p.vel.y, velZ: p.vel.z,
            yaw: p.yaw, targetYaw: p.targetYaw, walkSpeed: p.walkSpeed,
            aiTimer: p.aiTimer, limbPhase: p.limbPhase, jumpCooldown: p.jumpCooldown,
            ageTicks: Number.isFinite(p.ageTicks) ? p.ageTicks : 0,
            health: p.health,
            hurtCooldown: p.hurtCooldown,
            deathTimer: p.deathTimer,
            panicTimer: p.panicTimer,
            panicFromX: p.panicFromX,
            panicFromZ: p.panicFromZ,
            loveTicks: Number.isFinite(p.loveTicks) ? p.loveTicks : 0,
            breedCooldownTicks: Number.isFinite(p.breedCooldownTicks) ? p.breedCooldownTicks : 0,
            despawnAgeTicks: p._despawnAgeTicks,
            persistenceRequired: !!p._persistenceRequired,
            burnTimer: p.burnTimer,
            burnDamageTimer: p.burnDamageTimer,
            lastDamageSource: p.lastDamageSource || null,
            lastDamageAttackerType: p.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(p.lastDamageAtMs) ? p.lastDamageAtMs : null
        }));
        const chickens = this.chickens.map((c) => ({
            x: c.pos.x, y: c.pos.y, z: c.pos.z,
            velX: c.vel.x, velY: c.vel.y, velZ: c.vel.z,
            yaw: c.yaw, targetYaw: c.targetYaw, walkSpeed: c.walkSpeed,
            aiTimer: c.aiTimer, limbPhase: c.limbPhase, jumpCooldown: c.jumpCooldown,
            flapPhase: c.flapPhase, eggTimerTicks: c.eggTimerTicks, eggTickAccumulator: c.eggTickAccumulator,
            ageTicks: Number.isFinite(c.ageTicks) ? c.ageTicks : 0,
            loveTicks: Number.isFinite(c.loveTicks) ? c.loveTicks : 0,
            breedCooldownTicks: Number.isFinite(c.breedCooldownTicks) ? c.breedCooldownTicks : 0,
            despawnAgeTicks: c._despawnAgeTicks,
            persistenceRequired: !!c._persistenceRequired,
            health: c.health,
            hurtCooldown: c.hurtCooldown,
            deathTimer: c.deathTimer,
            panicTimer: c.panicTimer,
            panicFromX: c.panicFromX,
            panicFromZ: c.panicFromZ,
            burnTimer: c.burnTimer,
            burnDamageTimer: c.burnDamageTimer,
            lastDamageSource: c.lastDamageSource || null,
            lastDamageAttackerType: c.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(c.lastDamageAtMs) ? c.lastDamageAtMs : null
        }));
        const sheep = this.sheep.map((s) => ({
            x: s.pos.x, y: s.pos.y, z: s.pos.z,
            velX: s.vel.x, velY: s.vel.y, velZ: s.vel.z,
            yaw: s.yaw, targetYaw: s.targetYaw, walkSpeed: s.walkSpeed,
            aiTimer: s.aiTimer, limbPhase: s.limbPhase, jumpCooldown: s.jumpCooldown,
            ageTicks: Number.isFinite(s.ageTicks) ? s.ageTicks : 0,
            sheared: !!s.sheared, regrowCheckTimer: s.regrowCheckTimer,
            grazingTimer: s.grazingTimer, grazingCooldown: s.grazingCooldown,
            fleeTimer: s.fleeTimer,
            fleeFromX: s.fleeFromX,
            fleeFromZ: s.fleeFromZ,
            loveTicks: Number.isFinite(s.loveTicks) ? s.loveTicks : 0,
            breedCooldownTicks: Number.isFinite(s.breedCooldownTicks) ? s.breedCooldownTicks : 0,
            despawnAgeTicks: s._despawnAgeTicks,
            persistenceRequired: !!s._persistenceRequired,
            fleeceColor: Number.isFinite(s.fleeceColor) ? s.fleeceColor : 0,
            health: s.health,
            hurtCooldown: s.hurtCooldown,
            deathTimer: s.deathTimer,
            burnTimer: s.burnTimer,
            burnDamageTimer: s.burnDamageTimer,
            lastDamageSource: s.lastDamageSource || null,
            lastDamageAttackerType: s.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(s.lastDamageAtMs) ? s.lastDamageAtMs : null
        }));
        const cows = this.cows.map((c) => ({
            x: c.pos.x, y: c.pos.y, z: c.pos.z,
            velX: c.vel.x, velY: c.vel.y, velZ: c.vel.z,
            yaw: c.yaw, targetYaw: c.targetYaw, walkSpeed: c.walkSpeed,
            aiTimer: c.aiTimer, limbPhase: c.limbPhase, jumpCooldown: c.jumpCooldown,
            ageTicks: Number.isFinite(c.ageTicks) ? c.ageTicks : 0,
            health: c.health,
            hurtCooldown: c.hurtCooldown,
            deathTimer: c.deathTimer,
            panicTimer: c.panicTimer,
            panicFromX: c.panicFromX,
            panicFromZ: c.panicFromZ,
            loveTicks: Number.isFinite(c.loveTicks) ? c.loveTicks : 0,
            breedCooldownTicks: Number.isFinite(c.breedCooldownTicks) ? c.breedCooldownTicks : 0,
            despawnAgeTicks: c._despawnAgeTicks,
            persistenceRequired: !!c._persistenceRequired,
            burnTimer: c.burnTimer,
            burnDamageTimer: c.burnDamageTimer,
            lastDamageSource: c.lastDamageSource || null,
            lastDamageAttackerType: c.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(c.lastDamageAtMs) ? c.lastDamageAtMs : null
        }));
        const creepers = this.creepers.map((c) => ({
            x: c.pos.x, y: c.pos.y, z: c.pos.z,
            velX: c.vel.x, velY: c.vel.y, velZ: c.vel.z,
            yaw: c.yaw, targetYaw: c.targetYaw, walkSpeed: c.walkSpeed,
            aiTimer: c.aiTimer, limbPhase: c.limbPhase, jumpCooldown: c.jumpCooldown,
            health: c.health,
            hurtCooldown: c.hurtCooldown,
            deathTimer: c.deathTimer,
            burnTimer: c.burnTimer,
            burnDamageTimer: c.burnDamageTimer,
            fuseTimer: c.fuseTimer,
            swelling: !!c.swelling,
            exploded: !!c.exploded,
            targetX: (!c._dead && Number.isFinite(c.target?.x)) ? c.target.x : null,
            targetY: (!c._dead && Number.isFinite(c.target?.y)) ? c.target.y : null,
            targetZ: (!c._dead && Number.isFinite(c.target?.z)) ? c.target.z : null,
            despawnAgeTicks: c._despawnAgeTicks,
            persistenceRequired: !!c._persistenceRequired,
            lastDamageSource: c.lastDamageSource || null,
            lastDamageAttackerType: c.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(c.lastDamageAtMs) ? c.lastDamageAtMs : null
        }));
        const zombies = this.zombies.map((z) => ({
            x: z.pos.x, y: z.pos.y, z: z.pos.z,
            velX: z.vel.x, velY: z.vel.y, velZ: z.vel.z,
            yaw: z.yaw, targetYaw: z.targetYaw, walkSpeed: z.walkSpeed,
            aiTimer: z.aiTimer, limbPhase: z.limbPhase, jumpCooldown: z.jumpCooldown,
            health: z.health,
            hurtCooldown: z.hurtCooldown,
            deathTimer: z.deathTimer,
            burnTimer: z.burnTimer,
            burnDamageTimer: z.burnDamageTimer,
            attackCooldown: z.attackCooldown,
            giant: !!z.giant,
            targetX: (!z._dead && Number.isFinite(z.target?.x)) ? z.target.x : null,
            targetY: (!z._dead && Number.isFinite(z.target?.y)) ? z.target.y : null,
            targetZ: (!z._dead && Number.isFinite(z.target?.z)) ? z.target.z : null,
            despawnAgeTicks: z._despawnAgeTicks,
            persistenceRequired: !!z._persistenceRequired,
            lastDamageSource: z.lastDamageSource || null,
            lastDamageAttackerType: z.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(z.lastDamageAtMs) ? z.lastDamageAtMs : null
        }));
        const spiders = this.spiders.map((s) => ({
            x: s.pos.x, y: s.pos.y, z: s.pos.z,
            velX: s.vel.x, velY: s.vel.y, velZ: s.vel.z,
            yaw: s.yaw, targetYaw: s.targetYaw, walkSpeed: s.walkSpeed,
            aiTimer: s.aiTimer, limbPhase: s.limbPhase, jumpCooldown: s.jumpCooldown,
            health: s.health,
            hurtCooldown: s.hurtCooldown,
            deathTimer: s.deathTimer,
            burnTimer: s.burnTimer,
            burnDamageTimer: s.burnDamageTimer,
            attackCooldown: s.attackCooldown,
            pounceCooldown: s.pounceCooldown,
            aggroTimer: s.aggroTimer,
            targetX: (!s._dead && Number.isFinite(s.target?.x)) ? s.target.x : null,
            targetY: (!s._dead && Number.isFinite(s.target?.y)) ? s.target.y : null,
            targetZ: (!s._dead && Number.isFinite(s.target?.z)) ? s.target.z : null,
            despawnAgeTicks: s._despawnAgeTicks,
            persistenceRequired: !!s._persistenceRequired,
            lastDamageSource: s.lastDamageSource || null,
            lastDamageAttackerType: s.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(s.lastDamageAtMs) ? s.lastDamageAtMs : null
        }));
        const skeletons = this.skeletons.map((s) => ({
            x: s.pos.x, y: s.pos.y, z: s.pos.z,
            velX: s.vel.x, velY: s.vel.y, velZ: s.vel.z,
            yaw: s.yaw, targetYaw: s.targetYaw, walkSpeed: s.walkSpeed,
            aiTimer: s.aiTimer, limbPhase: s.limbPhase, jumpCooldown: s.jumpCooldown,
            health: s.health,
            hurtCooldown: s.hurtCooldown,
            deathTimer: s.deathTimer,
            burnTimer: s.burnTimer,
            burnDamageTimer: s.burnDamageTimer,
            attackCooldown: s.attackCooldown,
            targetX: (!s._dead && Number.isFinite(s.target?.x)) ? s.target.x : null,
            targetY: (!s._dead && Number.isFinite(s.target?.y)) ? s.target.y : null,
            targetZ: (!s._dead && Number.isFinite(s.target?.z)) ? s.target.z : null,
            despawnAgeTicks: s._despawnAgeTicks,
            persistenceRequired: !!s._persistenceRequired,
            lastDamageSource: s.lastDamageSource || null,
            lastDamageAttackerType: s.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(s.lastDamageAtMs) ? s.lastDamageAtMs : null
        }));
        const zombiePigmen = this.zombiePigmen.map((z) => ({
            x: z.pos.x, y: z.pos.y, z: z.pos.z,
            velX: z.vel.x, velY: z.vel.y, velZ: z.vel.z,
            yaw: z.yaw, targetYaw: z.targetYaw, walkSpeed: z.walkSpeed,
            aiTimer: z.aiTimer, limbPhase: z.limbPhase, jumpCooldown: z.jumpCooldown,
            health: z.health,
            hurtCooldown: z.hurtCooldown,
            deathTimer: z.deathTimer,
            burnTimer: z.burnTimer,
            burnDamageTimer: z.burnDamageTimer,
            attackCooldown: z.attackCooldown,
            angry: !!z.angry,
            angryTimer: Number.isFinite(z.angryTimer) ? z.angryTimer : 0,
            targetX: (!z._dead && Number.isFinite(z.target?.x)) ? z.target.x : null,
            targetY: (!z._dead && Number.isFinite(z.target?.y)) ? z.target.y : null,
            targetZ: (!z._dead && Number.isFinite(z.target?.z)) ? z.target.z : null,
            despawnAgeTicks: z._despawnAgeTicks,
            persistenceRequired: !!z._persistenceRequired,
            lastDamageSource: z.lastDamageSource || null,
            lastDamageAttackerType: z.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(z.lastDamageAtMs) ? z.lastDamageAtMs : null
        }));
        const slimes = this.slimes.map((s) => ({
            x: s.pos.x, y: s.pos.y, z: s.pos.z,
            velX: s.vel.x, velY: s.vel.y, velZ: s.vel.z,
            yaw: s.yaw, targetYaw: s.targetYaw, walkSpeed: s.walkSpeed,
            aiTimer: s.aiTimer, limbPhase: s.limbPhase, jumpCooldown: s.jumpCooldown,
            size: s.size,
            health: s.health,
            hurtCooldown: s.hurtCooldown,
            deathTimer: s.deathTimer,
            burnTimer: s.burnTimer,
            burnDamageTimer: s.burnDamageTimer,
            attackCooldown: s.attackCooldown,
            despawnAgeTicks: s._despawnAgeTicks,
            persistenceRequired: !!s._persistenceRequired,
            lastDamageSource: s.lastDamageSource || null,
            lastDamageAttackerType: s.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(s.lastDamageAtMs) ? s.lastDamageAtMs : null
        }));
        const ghasts = this.ghasts.map((g) => ({
            x: g.pos.x, y: g.pos.y, z: g.pos.z,
            velX: g.vel.x, velY: g.vel.y, velZ: g.vel.z,
            yaw: g.yaw, targetYaw: g.targetYaw, walkSpeed: g.walkSpeed,
            aiTimer: g.aiTimer, limbPhase: g.limbPhase,
            health: g.health,
            hurtCooldown: g.hurtCooldown,
            deathTimer: g.deathTimer,
            burnTimer: g.burnTimer,
            burnDamageTimer: g.burnDamageTimer,
            attackCounter: g.attackCounter,
            prevAttackCounter: g.prevAttackCounter,
            attackTickAccumulator: Number.isFinite(g.attackTickAccumulator) ? g.attackTickAccumulator : 0,
            courseChangeCooldown: Number.isFinite(g.courseChangeCooldown) ? g.courseChangeCooldown : 0,
            targetX: (!g._dead && Number.isFinite(g.target?.x)) ? g.target.x : null,
            targetY: (!g._dead && Number.isFinite(g.target?.y)) ? g.target.y : null,
            targetZ: (!g._dead && Number.isFinite(g.target?.z)) ? g.target.z : null,
            hoverTargetX: Number.isFinite(g._hoverTargetX) ? g._hoverTargetX : null,
            hoverTargetY: Number.isFinite(g._hoverTargetY) ? g._hoverTargetY : null,
            hoverTargetZ: Number.isFinite(g._hoverTargetZ) ? g._hoverTargetZ : null,
            bobPhase: Number.isFinite(g._bobPhase) ? g._bobPhase : null,
            despawnAgeTicks: g._despawnAgeTicks,
            persistenceRequired: !!g._persistenceRequired,
            lastDamageSource: g.lastDamageSource || null,
            lastDamageAttackerType: g.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(g.lastDamageAtMs) ? g.lastDamageAtMs : null
        }));
        const squids = this.squids.map((sq) => ({
            x: sq.pos.x, y: sq.pos.y, z: sq.pos.z,
            velX: sq.vel.x, velY: sq.vel.y, velZ: sq.vel.z,
            yaw: sq.yaw, pitch: sq.pitch, targetYaw: sq.targetYaw, targetPitch: sq.targetPitch,
            walkSpeed: sq.walkSpeed, aiTimer: sq.aiTimer, limbPhase: sq.limbPhase,
            squidRotation: sq.squidRotation,
            prevSquidRotation: sq.prevSquidRotation,
            tentacleAngle: sq.tentacleAngle,
            lastTentacleAngle: sq.lastTentacleAngle,
            randomMotionSpeed: sq.randomMotionSpeed,
            rotateSpeed: sq.rotateSpeed,
            rotationVelocity: sq.rotationVelocity,
            randomMotionVecX: sq.randomMotionVecX,
            randomMotionVecY: sq.randomMotionVecY,
            randomMotionVecZ: sq.randomMotionVecZ,
            motionUpdateTicks: sq.motionUpdateTicks,
            despawnAgeTicks: sq._despawnAgeTicks,
            persistenceRequired: !!sq._persistenceRequired,
            health: sq.health,
            hurtCooldown: sq.hurtCooldown,
            deathTimer: sq.deathTimer,
            burnTimer: sq.burnTimer,
            burnDamageTimer: sq.burnDamageTimer,
            lastDamageSource: sq.lastDamageSource || null,
            lastDamageAttackerType: sq.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(sq.lastDamageAtMs) ? sq.lastDamageAtMs : null
        }));
        const wolves = this.wolves.map((w) => ({
            x: w.pos.x, y: w.pos.y, z: w.pos.z,
            velX: w.vel.x, velY: w.vel.y, velZ: w.vel.z,
            yaw: w.yaw, targetYaw: w.targetYaw, walkSpeed: w.walkSpeed,
            aiTimer: w.aiTimer, limbPhase: w.limbPhase, jumpCooldown: w.jumpCooldown,
            despawnAgeTicks: w._despawnAgeTicks,
            persistenceRequired: !!w._persistenceRequired,
            tamed: !!w.tamed,
            sitting: !!w.sitting,
            angry: !!w.angry,
            angryTimer: w.angryTimer,
            ownerId: w.ownerId || null,
            sheepAttackCooldown: w.sheepAttackCooldown,
            followTeleportCooldown: w.followTeleportCooldown,
            attackCooldown: w.attackCooldown,
            targetX: (!w._dead && Number.isFinite(w.target?.x)) ? w.target.x : null,
            targetY: (!w._dead && Number.isFinite(w.target?.y)) ? w.target.y : null,
            targetZ: (!w._dead && Number.isFinite(w.target?.z)) ? w.target.z : null,
            health: w.health,
            hurtCooldown: w.hurtCooldown,
            deathTimer: w.deathTimer,
            burnTimer: w.burnTimer,
            burnDamageTimer: w.burnDamageTimer,
            lastDamageSource: w.lastDamageSource || null,
            lastDamageAttackerType: w.lastDamageAttackerType || null,
            lastDamageAtMs: Number.isFinite(w.lastDamageAtMs) ? w.lastDamageAtMs : null
        }));
        return { pigs, chickens, sheep, cows, creepers, zombies, spiders, skeletons, zombiePigmen, slimes, ghasts, squids, wolves };
    }

    loadState(state) {
        this.clear();
        if (!state || typeof state !== 'object') return;
        const pigs = Array.isArray(state.pigs) ? state.pigs : [];
        const chickens = Array.isArray(state.chickens) ? state.chickens : [];
        const sheep = Array.isArray(state.sheep) ? state.sheep : [];
        const cows = Array.isArray(state.cows) ? state.cows : [];
        const creepers = Array.isArray(state.creepers) ? state.creepers : [];
        const zombies = Array.isArray(state.zombies) ? state.zombies : [];
        const spiders = Array.isArray(state.spiders) ? state.spiders : [];
        const skeletons = Array.isArray(state.skeletons) ? state.skeletons : [];
        const zombiePigmen = Array.isArray(state.zombiePigmen)
            ? state.zombiePigmen
            : (Array.isArray(state.zombie_pigmen) ? state.zombie_pigmen : []);
        const slimes = Array.isArray(state.slimes) ? state.slimes : [];
        const ghasts = Array.isArray(state.ghasts) ? state.ghasts : [];
        const squids = Array.isArray(state.squids) ? state.squids : [];
        const wolves = Array.isArray(state.wolves) ? state.wolves : [];

        for (const p of pigs) {
            if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || !Number.isFinite(p?.z)) continue;
            const ageTicks = Number.isFinite(p.ageTicks) ? Math.floor(p.ageTicks) : 0;
            this.spawnPig(p.x, p.y, p.z, { ageTicks, isBaby: ageTicks < 0 });
            const ent = this.pigs[this.pigs.length - 1];
            ent.yaw = Number.isFinite(p.yaw) ? p.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(p.targetYaw) ? p.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(p.velX) ? p.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(p.velY) ? p.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(p.velZ) ? p.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(p.walkSpeed) ? p.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(p.aiTimer) ? p.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(p.limbPhase) ? p.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(p.jumpCooldown) ? p.jumpCooldown : ent.jumpCooldown;
            ent.ageTicks = ageTicks;
            ent.isBaby = ageTicks < 0;
            ent.health = Number.isFinite(p.health) ? p.health : ent.health;
            ent.hurtCooldown = Number.isFinite(p.hurtCooldown) ? p.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(p.deathTimer) ? p.deathTimer : ent.deathTimer;
            ent.panicTimer = Number.isFinite(p.panicTimer) ? p.panicTimer : 0;
            ent.panicFromX = Number.isFinite(p.panicFromX) ? p.panicFromX : ent.pos.x;
            ent.panicFromZ = Number.isFinite(p.panicFromZ) ? p.panicFromZ : ent.pos.z;
            ent.loveTicks = Number.isFinite(p.loveTicks) ? p.loveTicks : 0;
            ent.breedCooldownTicks = Number.isFinite(p.breedCooldownTicks) ? p.breedCooldownTicks : 0;
            ent._despawnAgeTicks = Number.isFinite(p.despawnAgeTicks) ? p.despawnAgeTicks : 0;
            ent._persistenceRequired = !!p.persistenceRequired;
            ent.burnTimer = Number.isFinite(p.burnTimer) ? p.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(p.burnDamageTimer) ? p.burnDamageTimer : ent.burnDamageTimer;
            ent.lastDamageSource = typeof p.lastDamageSource === 'string' ? p.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof p.lastDamageAttackerType === 'string' ? p.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(p.lastDamageAtMs) ? p.lastDamageAtMs : null;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const c of chickens) {
            if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y) || !Number.isFinite(c?.z)) continue;
            const ageTicks = Number.isFinite(c.ageTicks) ? Math.floor(c.ageTicks) : 0;
            this.spawnChicken(c.x, c.y, c.z, { ageTicks, isBaby: ageTicks < 0 });
            const ent = this.chickens[this.chickens.length - 1];
            ent.yaw = Number.isFinite(c.yaw) ? c.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(c.targetYaw) ? c.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(c.velX) ? c.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(c.velY) ? c.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(c.velZ) ? c.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(c.walkSpeed) ? c.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(c.aiTimer) ? c.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(c.limbPhase) ? c.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(c.jumpCooldown) ? c.jumpCooldown : ent.jumpCooldown;
            ent.flapPhase = Number.isFinite(c.flapPhase) ? c.flapPhase : ent.flapPhase;
            if (Number.isFinite(c.eggTimerTicks)) {
                ent.eggTimerTicks = Math.max(1, Math.floor(c.eggTimerTicks));
            } else if (Number.isFinite(c.eggTimer)) {
                // Backward compatibility: old saves used seconds.
                ent.eggTimerTicks = Math.max(1, Math.floor(c.eggTimer * TICKS_PER_SECOND));
            }
            ent.eggTickAccumulator = Number.isFinite(c.eggTickAccumulator) ? c.eggTickAccumulator : 0;
            ent.ageTicks = ageTicks;
            ent.isBaby = ageTicks < 0;
            ent.loveTicks = Number.isFinite(c.loveTicks) ? c.loveTicks : 0;
            ent.breedCooldownTicks = Number.isFinite(c.breedCooldownTicks) ? c.breedCooldownTicks : 0;
            ent._despawnAgeTicks = Number.isFinite(c.despawnAgeTicks) ? c.despawnAgeTicks : 0;
            ent._persistenceRequired = !!c.persistenceRequired;
            ent.health = Number.isFinite(c.health) ? c.health : ent.health;
            ent.hurtCooldown = Number.isFinite(c.hurtCooldown) ? c.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(c.deathTimer) ? c.deathTimer : ent.deathTimer;
            ent.panicTimer = Number.isFinite(c.panicTimer) ? c.panicTimer : 0;
            ent.panicFromX = Number.isFinite(c.panicFromX) ? c.panicFromX : ent.pos.x;
            ent.panicFromZ = Number.isFinite(c.panicFromZ) ? c.panicFromZ : ent.pos.z;
            ent.burnTimer = Number.isFinite(c.burnTimer) ? c.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(c.burnDamageTimer) ? c.burnDamageTimer : ent.burnDamageTimer;
            ent.lastDamageSource = typeof c.lastDamageSource === 'string' ? c.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof c.lastDamageAttackerType === 'string' ? c.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(c.lastDamageAtMs) ? c.lastDamageAtMs : null;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const s of sheep) {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y) || !Number.isFinite(s?.z)) continue;
            const ageTicks = Number.isFinite(s.ageTicks) ? Math.floor(s.ageTicks) : 0;
            this.spawnSheep(s.x, s.y, s.z, { ageTicks, isBaby: ageTicks < 0 });
            const ent = this.sheep[this.sheep.length - 1];
            ent.yaw = Number.isFinite(s.yaw) ? s.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(s.targetYaw) ? s.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(s.velX) ? s.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(s.velY) ? s.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(s.velZ) ? s.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(s.walkSpeed) ? s.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(s.aiTimer) ? s.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(s.limbPhase) ? s.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(s.jumpCooldown) ? s.jumpCooldown : ent.jumpCooldown;
            ent.ageTicks = ageTicks;
            ent.isBaby = ageTicks < 0;
            ent.sheared = !!s.sheared;
            ent.regrowCheckTimer = Number.isFinite(s.regrowCheckTimer) ? s.regrowCheckTimer : ent.regrowCheckTimer;
            ent.grazingTimer = Number.isFinite(s.grazingTimer) ? s.grazingTimer : ent.grazingTimer;
            ent.grazingCooldown = Number.isFinite(s.grazingCooldown) ? s.grazingCooldown : ent.grazingCooldown;
            ent.fleeTimer = Number.isFinite(s.fleeTimer) ? s.fleeTimer : 0;
            ent.fleeFromX = Number.isFinite(s.fleeFromX) ? s.fleeFromX : ent.pos.x;
            ent.fleeFromZ = Number.isFinite(s.fleeFromZ) ? s.fleeFromZ : ent.pos.z;
            ent.loveTicks = Number.isFinite(s.loveTicks) ? s.loveTicks : 0;
            ent.breedCooldownTicks = Number.isFinite(s.breedCooldownTicks) ? s.breedCooldownTicks : 0;
            ent._despawnAgeTicks = Number.isFinite(s.despawnAgeTicks) ? s.despawnAgeTicks : 0;
            ent._persistenceRequired = !!s.persistenceRequired;
            ent.health = Number.isFinite(s.health) ? s.health : ent.health;
            ent.hurtCooldown = Number.isFinite(s.hurtCooldown) ? s.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(s.deathTimer) ? s.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(s.burnTimer) ? s.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(s.burnDamageTimer) ? s.burnDamageTimer : ent.burnDamageTimer;
            ent.lastDamageSource = typeof s.lastDamageSource === 'string' ? s.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof s.lastDamageAttackerType === 'string' ? s.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(s.lastDamageAtMs) ? s.lastDamageAtMs : null;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
            const colorIdx = Number.isFinite(s.fleeceColor) ? Math.max(0, Math.min(15, Math.floor(s.fleeceColor))) : 0;
            ent.fleeceColor = colorIdx;
            const tint = SHEEP_FLEECE_COLORS[colorIdx] || SHEEP_FLEECE_COLORS[0];
            for (const mesh of ent.furMeshes) {
                if (!mesh || !mesh.material) continue;
                mesh.material.color.setRGB(tint[0], tint[1], tint[2]);
            }
        }

        for (const c of cows) {
            if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y) || !Number.isFinite(c?.z)) continue;
            const ageTicks = Number.isFinite(c.ageTicks) ? Math.floor(c.ageTicks) : 0;
            this.spawnCow(c.x, c.y, c.z, { ageTicks, isBaby: ageTicks < 0 });
            const ent = this.cows[this.cows.length - 1];
            ent.yaw = Number.isFinite(c.yaw) ? c.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(c.targetYaw) ? c.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(c.velX) ? c.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(c.velY) ? c.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(c.velZ) ? c.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(c.walkSpeed) ? c.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(c.aiTimer) ? c.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(c.limbPhase) ? c.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(c.jumpCooldown) ? c.jumpCooldown : ent.jumpCooldown;
            ent.ageTicks = ageTicks;
            ent.isBaby = ageTicks < 0;
            ent.health = Number.isFinite(c.health) ? c.health : ent.health;
            ent.hurtCooldown = Number.isFinite(c.hurtCooldown) ? c.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(c.deathTimer) ? c.deathTimer : ent.deathTimer;
            ent.panicTimer = Number.isFinite(c.panicTimer) ? c.panicTimer : 0;
            ent.panicFromX = Number.isFinite(c.panicFromX) ? c.panicFromX : ent.pos.x;
            ent.panicFromZ = Number.isFinite(c.panicFromZ) ? c.panicFromZ : ent.pos.z;
            ent.loveTicks = Number.isFinite(c.loveTicks) ? c.loveTicks : 0;
            ent.breedCooldownTicks = Number.isFinite(c.breedCooldownTicks) ? c.breedCooldownTicks : 0;
            ent._despawnAgeTicks = Number.isFinite(c.despawnAgeTicks) ? c.despawnAgeTicks : 0;
            ent._persistenceRequired = !!c.persistenceRequired;
            ent.burnTimer = Number.isFinite(c.burnTimer) ? c.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(c.burnDamageTimer) ? c.burnDamageTimer : ent.burnDamageTimer;
            ent.lastDamageSource = typeof c.lastDamageSource === 'string' ? c.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof c.lastDamageAttackerType === 'string' ? c.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(c.lastDamageAtMs) ? c.lastDamageAtMs : null;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const c of creepers) {
            if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y) || !Number.isFinite(c?.z)) continue;
            this.spawnCreeper(c.x, c.y, c.z);
            const ent = this.creepers[this.creepers.length - 1];
            ent.yaw = Number.isFinite(c.yaw) ? c.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(c.targetYaw) ? c.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(c.velX) ? c.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(c.velY) ? c.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(c.velZ) ? c.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(c.walkSpeed) ? c.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(c.aiTimer) ? c.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(c.limbPhase) ? c.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(c.jumpCooldown) ? c.jumpCooldown : ent.jumpCooldown;
            ent.health = Number.isFinite(c.health) ? c.health : ent.health;
            ent.hurtCooldown = Number.isFinite(c.hurtCooldown) ? c.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(c.deathTimer) ? c.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(c.burnTimer) ? c.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(c.burnDamageTimer) ? c.burnDamageTimer : ent.burnDamageTimer;
            ent.fuseTimer = Number.isFinite(c.fuseTimer) ? c.fuseTimer : ent.fuseTimer;
            ent.swelling = !!c.swelling;
            ent.exploded = !!c.exploded;
            if (Number.isFinite(c.targetX) && Number.isFinite(c.targetY) && Number.isFinite(c.targetZ)) {
                ent.target = { x: c.targetX, y: c.targetY, z: c.targetZ };
                ent.aiTimer = 0;
            } else {
                ent.target = null;
            }
            ent._despawnAgeTicks = Number.isFinite(c.despawnAgeTicks) ? c.despawnAgeTicks : 0;
            ent._persistenceRequired = !!c.persistenceRequired;
            ent.lastDamageSource = typeof c.lastDamageSource === 'string' ? c.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof c.lastDamageAttackerType === 'string' ? c.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(c.lastDamageAtMs) ? c.lastDamageAtMs : null;
            ent._forceDespawn = false;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const z of zombies) {
            if (!Number.isFinite(z?.x) || !Number.isFinite(z?.y) || !Number.isFinite(z?.z)) continue;
            this.spawnZombie(z.x, z.y, z.z, { giant: !!z.giant });
            const ent = this.zombies[this.zombies.length - 1];
            ent.yaw = Number.isFinite(z.yaw) ? z.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(z.targetYaw) ? z.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(z.velX) ? z.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(z.velY) ? z.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(z.velZ) ? z.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(z.walkSpeed) ? z.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(z.aiTimer) ? z.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(z.limbPhase) ? z.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(z.jumpCooldown) ? z.jumpCooldown : ent.jumpCooldown;
            ent.health = Number.isFinite(z.health) ? z.health : ent.health;
            ent.hurtCooldown = Number.isFinite(z.hurtCooldown) ? z.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(z.deathTimer) ? z.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(z.burnTimer) ? z.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(z.burnDamageTimer) ? z.burnDamageTimer : ent.burnDamageTimer;
            ent.attackCooldown = Number.isFinite(z.attackCooldown) ? z.attackCooldown : ent.attackCooldown;
            ent.angry = !!z.angry;
            ent.angryTimer = Number.isFinite(z.angryTimer) ? z.angryTimer : 0;
            if (Number.isFinite(z.targetX) && Number.isFinite(z.targetY) && Number.isFinite(z.targetZ)) {
                ent.target = { x: z.targetX, y: z.targetY, z: z.targetZ };
                ent.aiTimer = 0;
            } else {
                ent.target = null;
            }
            ent._despawnAgeTicks = Number.isFinite(z.despawnAgeTicks) ? z.despawnAgeTicks : 0;
            ent._persistenceRequired = !!z.persistenceRequired;
            ent.lastDamageSource = typeof z.lastDamageSource === 'string' ? z.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof z.lastDamageAttackerType === 'string' ? z.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(z.lastDamageAtMs) ? z.lastDamageAtMs : null;
            ent._forceDespawn = false;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const s of spiders) {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y) || !Number.isFinite(s?.z)) continue;
            this.spawnSpider(s.x, s.y, s.z);
            const ent = this.spiders[this.spiders.length - 1];
            ent.yaw = Number.isFinite(s.yaw) ? s.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(s.targetYaw) ? s.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(s.velX) ? s.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(s.velY) ? s.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(s.velZ) ? s.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(s.walkSpeed) ? s.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(s.aiTimer) ? s.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(s.limbPhase) ? s.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(s.jumpCooldown) ? s.jumpCooldown : ent.jumpCooldown;
            ent.health = Number.isFinite(s.health) ? s.health : ent.health;
            ent.hurtCooldown = Number.isFinite(s.hurtCooldown) ? s.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(s.deathTimer) ? s.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(s.burnTimer) ? s.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(s.burnDamageTimer) ? s.burnDamageTimer : ent.burnDamageTimer;
            ent.attackCooldown = Number.isFinite(s.attackCooldown) ? s.attackCooldown : ent.attackCooldown;
            ent.pounceCooldown = Number.isFinite(s.pounceCooldown) ? s.pounceCooldown : 0;
            ent.aggroTimer = Number.isFinite(s.aggroTimer) ? s.aggroTimer : 0;
            if (Number.isFinite(s.targetX) && Number.isFinite(s.targetY) && Number.isFinite(s.targetZ)) {
                ent.target = { x: s.targetX, y: s.targetY, z: s.targetZ };
                ent.aiTimer = 0;
            } else {
                ent.target = null;
            }
            ent._despawnAgeTicks = Number.isFinite(s.despawnAgeTicks) ? s.despawnAgeTicks : 0;
            ent._persistenceRequired = !!s.persistenceRequired;
            ent.lastDamageSource = typeof s.lastDamageSource === 'string' ? s.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof s.lastDamageAttackerType === 'string' ? s.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(s.lastDamageAtMs) ? s.lastDamageAtMs : null;
            ent._forceDespawn = false;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const s of skeletons) {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y) || !Number.isFinite(s?.z)) continue;
            this.spawnSkeleton(s.x, s.y, s.z);
            const ent = this.skeletons[this.skeletons.length - 1];
            ent.yaw = Number.isFinite(s.yaw) ? s.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(s.targetYaw) ? s.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(s.velX) ? s.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(s.velY) ? s.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(s.velZ) ? s.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(s.walkSpeed) ? s.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(s.aiTimer) ? s.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(s.limbPhase) ? s.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(s.jumpCooldown) ? s.jumpCooldown : ent.jumpCooldown;
            ent.health = Number.isFinite(s.health) ? s.health : ent.health;
            ent.hurtCooldown = Number.isFinite(s.hurtCooldown) ? s.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(s.deathTimer) ? s.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(s.burnTimer) ? s.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(s.burnDamageTimer) ? s.burnDamageTimer : ent.burnDamageTimer;
            ent.attackCooldown = Number.isFinite(s.attackCooldown) ? s.attackCooldown : ent.attackCooldown;
            if (Number.isFinite(s.targetX) && Number.isFinite(s.targetY) && Number.isFinite(s.targetZ)) {
                ent.target = { x: s.targetX, y: s.targetY, z: s.targetZ };
                ent.aiTimer = 0;
            } else {
                ent.target = null;
            }
            ent._despawnAgeTicks = Number.isFinite(s.despawnAgeTicks) ? s.despawnAgeTicks : 0;
            ent._persistenceRequired = !!s.persistenceRequired;
            ent.lastDamageSource = typeof s.lastDamageSource === 'string' ? s.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof s.lastDamageAttackerType === 'string' ? s.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(s.lastDamageAtMs) ? s.lastDamageAtMs : null;
            ent._forceDespawn = false;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const z of zombiePigmen) {
            if (!Number.isFinite(z?.x) || !Number.isFinite(z?.y) || !Number.isFinite(z?.z)) continue;
            this.spawnZombiePigman(z.x, z.y, z.z);
            const ent = this.zombiePigmen[this.zombiePigmen.length - 1];
            ent.yaw = Number.isFinite(z.yaw) ? z.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(z.targetYaw) ? z.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(z.velX) ? z.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(z.velY) ? z.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(z.velZ) ? z.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(z.walkSpeed) ? z.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(z.aiTimer) ? z.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(z.limbPhase) ? z.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(z.jumpCooldown) ? z.jumpCooldown : ent.jumpCooldown;
            ent.health = Number.isFinite(z.health) ? z.health : ent.health;
            ent.hurtCooldown = Number.isFinite(z.hurtCooldown) ? z.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(z.deathTimer) ? z.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(z.burnTimer) ? z.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(z.burnDamageTimer) ? z.burnDamageTimer : ent.burnDamageTimer;
            ent.attackCooldown = Number.isFinite(z.attackCooldown) ? z.attackCooldown : ent.attackCooldown;
            if (Number.isFinite(z.targetX) && Number.isFinite(z.targetY) && Number.isFinite(z.targetZ)) {
                ent.target = { x: z.targetX, y: z.targetY, z: z.targetZ };
                ent.aiTimer = 0;
            } else {
                ent.target = null;
            }
            ent._despawnAgeTicks = Number.isFinite(z.despawnAgeTicks) ? z.despawnAgeTicks : 0;
            ent._persistenceRequired = !!z.persistenceRequired;
            ent.lastDamageSource = typeof z.lastDamageSource === 'string' ? z.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof z.lastDamageAttackerType === 'string' ? z.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(z.lastDamageAtMs) ? z.lastDamageAtMs : null;
            ent._forceDespawn = false;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const s of slimes) {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y) || !Number.isFinite(s?.z)) continue;
            const size = Number.isFinite(s.size) ? Math.max(1, Math.min(4, Math.floor(s.size))) : 2;
            this.spawnSlime(s.x, s.y, s.z, size);
            const ent = this.slimes[this.slimes.length - 1];
            ent.yaw = Number.isFinite(s.yaw) ? s.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(s.targetYaw) ? s.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(s.velX) ? s.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(s.velY) ? s.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(s.velZ) ? s.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(s.walkSpeed) ? s.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(s.aiTimer) ? s.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(s.limbPhase) ? s.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(s.jumpCooldown) ? s.jumpCooldown : ent.jumpCooldown;
            ent.health = Number.isFinite(s.health) ? s.health : ent.health;
            ent.hurtCooldown = Number.isFinite(s.hurtCooldown) ? s.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(s.deathTimer) ? s.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(s.burnTimer) ? s.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(s.burnDamageTimer) ? s.burnDamageTimer : ent.burnDamageTimer;
            ent.attackCooldown = Number.isFinite(s.attackCooldown) ? s.attackCooldown : ent.attackCooldown;
            ent._despawnAgeTicks = Number.isFinite(s.despawnAgeTicks) ? s.despawnAgeTicks : 0;
            ent._persistenceRequired = !!s.persistenceRequired;
            ent.lastDamageSource = typeof s.lastDamageSource === 'string' ? s.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof s.lastDamageAttackerType === 'string' ? s.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(s.lastDamageAtMs) ? s.lastDamageAtMs : null;
            ent._forceDespawn = false;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const g of ghasts) {
            if (!Number.isFinite(g?.x) || !Number.isFinite(g?.y) || !Number.isFinite(g?.z)) continue;
            this.spawnGhast(g.x, g.y, g.z);
            const ent = this.ghasts[this.ghasts.length - 1];
            ent.yaw = Number.isFinite(g.yaw) ? g.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(g.targetYaw) ? g.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(g.velX) ? g.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(g.velY) ? g.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(g.velZ) ? g.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(g.walkSpeed) ? g.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(g.aiTimer) ? g.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(g.limbPhase) ? g.limbPhase : ent.limbPhase;
            ent.health = Number.isFinite(g.health) ? g.health : ent.health;
            ent.hurtCooldown = Number.isFinite(g.hurtCooldown) ? g.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(g.deathTimer) ? g.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(g.burnTimer) ? g.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(g.burnDamageTimer) ? g.burnDamageTimer : ent.burnDamageTimer;
            ent.attackCounter = Number.isFinite(g.attackCounter) ? g.attackCounter : ent.attackCounter;
            ent.prevAttackCounter = Number.isFinite(g.prevAttackCounter) ? g.prevAttackCounter : ent.prevAttackCounter;
            ent.attackTickAccumulator = Number.isFinite(g.attackTickAccumulator) ? g.attackTickAccumulator : 0;
            ent.courseChangeCooldown = Number.isFinite(g.courseChangeCooldown) ? g.courseChangeCooldown : ent.courseChangeCooldown;
            ent.isCharging = false;
            if (Number.isFinite(g.targetX) && Number.isFinite(g.targetY) && Number.isFinite(g.targetZ)) {
                ent.target = { x: g.targetX, y: g.targetY, z: g.targetZ };
                ent.aiTimer = 0;
            } else {
                ent.target = null;
            }
            ent._hoverTargetX = Number.isFinite(g.hoverTargetX) ? g.hoverTargetX : ent._hoverTargetX;
            ent._hoverTargetY = Number.isFinite(g.hoverTargetY) ? g.hoverTargetY : ent._hoverTargetY;
            ent._hoverTargetZ = Number.isFinite(g.hoverTargetZ) ? g.hoverTargetZ : ent._hoverTargetZ;
            ent._bobPhase = Number.isFinite(g.bobPhase) ? g.bobPhase : ent._bobPhase;
            ent._despawnAgeTicks = Number.isFinite(g.despawnAgeTicks) ? g.despawnAgeTicks : 0;
            ent._persistenceRequired = !!g.persistenceRequired;
            ent.lastDamageSource = typeof g.lastDamageSource === 'string' ? g.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof g.lastDamageAttackerType === 'string' ? g.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(g.lastDamageAtMs) ? g.lastDamageAtMs : null;
            ent._forceDespawn = false;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const sq of squids) {
            if (!Number.isFinite(sq?.x) || !Number.isFinite(sq?.y) || !Number.isFinite(sq?.z)) continue;
            this.spawnSquid(sq.x, sq.y, sq.z);
            const ent = this.squids[this.squids.length - 1];
            ent.yaw = Number.isFinite(sq.yaw) ? sq.yaw : ent.yaw;
            ent.pitch = Number.isFinite(sq.pitch) ? sq.pitch : ent.pitch;
            ent.targetYaw = Number.isFinite(sq.targetYaw) ? sq.targetYaw : ent.targetYaw;
            ent.targetPitch = Number.isFinite(sq.targetPitch) ? sq.targetPitch : ent.targetPitch;
            ent.vel.x = Number.isFinite(sq.velX) ? sq.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(sq.velY) ? sq.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(sq.velZ) ? sq.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(sq.walkSpeed) ? sq.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(sq.aiTimer) ? sq.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(sq.limbPhase) ? sq.limbPhase : ent.limbPhase;
            ent.squidRotation = Number.isFinite(sq.squidRotation) ? sq.squidRotation : ent.squidRotation;
            ent.prevSquidRotation = Number.isFinite(sq.prevSquidRotation) ? sq.prevSquidRotation : ent.prevSquidRotation;
            ent.tentacleAngle = Number.isFinite(sq.tentacleAngle) ? sq.tentacleAngle : ent.tentacleAngle;
            ent.lastTentacleAngle = Number.isFinite(sq.lastTentacleAngle) ? sq.lastTentacleAngle : ent.lastTentacleAngle;
            ent.randomMotionSpeed = Number.isFinite(sq.randomMotionSpeed) ? sq.randomMotionSpeed : ent.randomMotionSpeed;
            ent.rotateSpeed = Number.isFinite(sq.rotateSpeed) ? sq.rotateSpeed : ent.rotateSpeed;
            ent.rotationVelocity = Number.isFinite(sq.rotationVelocity) ? sq.rotationVelocity : ent.rotationVelocity;
            ent.randomMotionVecX = Number.isFinite(sq.randomMotionVecX) ? sq.randomMotionVecX : ent.randomMotionVecX;
            ent.randomMotionVecY = Number.isFinite(sq.randomMotionVecY) ? sq.randomMotionVecY : ent.randomMotionVecY;
            ent.randomMotionVecZ = Number.isFinite(sq.randomMotionVecZ) ? sq.randomMotionVecZ : ent.randomMotionVecZ;
            ent.motionUpdateTicks = Number.isFinite(sq.motionUpdateTicks) ? sq.motionUpdateTicks : ent.motionUpdateTicks;
            ent._despawnAgeTicks = Number.isFinite(sq.despawnAgeTicks) ? sq.despawnAgeTicks : 0;
            ent._persistenceRequired = !!sq.persistenceRequired;
            ent.health = Number.isFinite(sq.health) ? sq.health : ent.health;
            ent.hurtCooldown = Number.isFinite(sq.hurtCooldown) ? sq.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(sq.deathTimer) ? sq.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(sq.burnTimer) ? sq.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(sq.burnDamageTimer) ? sq.burnDamageTimer : ent.burnDamageTimer;
            ent.lastDamageSource = typeof sq.lastDamageSource === 'string' ? sq.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof sq.lastDamageAttackerType === 'string' ? sq.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(sq.lastDamageAtMs) ? sq.lastDamageAtMs : null;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }

        for (const w of wolves) {
            if (!Number.isFinite(w?.x) || !Number.isFinite(w?.y) || !Number.isFinite(w?.z)) continue;
            this.spawnWolf(w.x, w.y, w.z);
            const ent = this.wolves[this.wolves.length - 1];
            ent.yaw = Number.isFinite(w.yaw) ? w.yaw : ent.yaw;
            ent.targetYaw = Number.isFinite(w.targetYaw) ? w.targetYaw : ent.targetYaw;
            ent.vel.x = Number.isFinite(w.velX) ? w.velX : ent.vel.x;
            ent.vel.y = Number.isFinite(w.velY) ? w.velY : ent.vel.y;
            ent.vel.z = Number.isFinite(w.velZ) ? w.velZ : ent.vel.z;
            ent.walkSpeed = Number.isFinite(w.walkSpeed) ? w.walkSpeed : ent.walkSpeed;
            ent.aiTimer = Number.isFinite(w.aiTimer) ? w.aiTimer : ent.aiTimer;
            ent.limbPhase = Number.isFinite(w.limbPhase) ? w.limbPhase : ent.limbPhase;
            ent.jumpCooldown = Number.isFinite(w.jumpCooldown) ? w.jumpCooldown : ent.jumpCooldown;
            ent._despawnAgeTicks = Number.isFinite(w.despawnAgeTicks) ? w.despawnAgeTicks : 0;
            ent._persistenceRequired = !!w.persistenceRequired;
            ent.tamed = !!w.tamed;
            ent.sitting = !!w.sitting;
            ent.angry = !!w.angry;
            ent.angryTimer = Number.isFinite(w.angryTimer) ? w.angryTimer : 0;
            ent.ownerId = typeof w.ownerId === 'string' ? w.ownerId : (ent.tamed ? PLAYER_OWNER_ID : null);
            ent.sheepAttackCooldown = Number.isFinite(w.sheepAttackCooldown) ? w.sheepAttackCooldown : 0;
            ent.followTeleportCooldown = Number.isFinite(w.followTeleportCooldown) ? w.followTeleportCooldown : 0;
            ent.attackCooldown = Number.isFinite(w.attackCooldown) ? w.attackCooldown : 0;
            if (Number.isFinite(w.targetX) && Number.isFinite(w.targetY) && Number.isFinite(w.targetZ)) {
                ent.target = { x: w.targetX, y: w.targetY, z: w.targetZ };
                ent.aiTimer = 0;
            } else {
                ent.target = null;
            }
            this.updateWolfAppearance(ent);
            ent.health = Number.isFinite(w.health) ? w.health : (ent.tamed ? WOLF_HEALTH_TAMED : ent.health);
            ent.hurtCooldown = Number.isFinite(w.hurtCooldown) ? w.hurtCooldown : ent.hurtCooldown;
            ent.deathTimer = Number.isFinite(w.deathTimer) ? w.deathTimer : ent.deathTimer;
            ent.burnTimer = Number.isFinite(w.burnTimer) ? w.burnTimer : ent.burnTimer;
            ent.burnDamageTimer = Number.isFinite(w.burnDamageTimer) ? w.burnDamageTimer : ent.burnDamageTimer;
            ent.lastDamageSource = typeof w.lastDamageSource === 'string' ? w.lastDamageSource : null;
            ent.lastDamageAttackerType = typeof w.lastDamageAttackerType === 'string' ? w.lastDamageAttackerType : null;
            ent.lastDamageAtMs = Number.isFinite(w.lastDamageAtMs) ? w.lastDamageAtMs : null;
            ent._dead = !!(ent.health <= 0 && ent.deathTimer > 0);
        }
    }
}

