// js/main.js
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { saveStore } from './js/saveStore.js';
import { parseKey, getChunkKey, getKey } from './js/utils.js';
import { CHUNK_SIZE, WORLD_DEPTH, WORLD_HEIGHT, JUMP_FORCE, PLAYER_HEIGHT, PLAYER_HEIGHT_CROUCH, PLAYER_EYE_HEIGHT, PLAYER_EYE_HEIGHT_CROUCH, PLAYER_RADIUS } from './js/constants.js';
import { RenderChunk, textureLoader, getTextureUrl, BLOCKS, breakingTextures, updateFireAnimation, updatePortalAnimation, getFireAnimationCanvas } from './js/world.js';
import { getRuntimeBlockDef, getInventoryDef, getPlaceableBlockDef, isBedBlockId, isBlockOpaque, isBoatBlockId, isButtonId, isCakeBlockId, isChestId, isCraftingTableId, isCropId, isDeadBushId, isDispenserId, isDoorId, isFarmlandId, isFenceId, isFlowerId, isFurnaceId, isLadderId, isLeverId, isMinecartBlockId, isMushroomId, isNoteBlockId, isObsidianId, isPaintingId, isPistonId, isPressurePlateId, isPumpkinId, isRailId, isRedstoneWireId, isReedId, isRepeaterId, isSignId, isSignPostId, isSlabId, isTallGrassId, isTntId, isVehicleBlockId, isWallSignId, isWoolId, isCactusId, isTorchId, isTrapdoorId, normalizeLegacyRuntimeBlockId, normalizeLegacyRuntimeItemId, fromBetaCompatibleBlockId, toBetaCompatibleBlockId, getCanonicalStatefulDrop } from './js/blocks.js';
import { updatePhysics, checkCollision, resetPhysicsPose } from './js/physics.js';
import { initUI, setSelectedSlot, getSelectedSlot, bindUIWindowFunctions, toggleInventoryUI, refreshHotbar, toggleChat, addMessage, handleCommand, scrollChat } from './js/ui.js';
import { ChunkManager } from './js/chunkManager.js';
import {
    inventory,
    getSmeltingResultForInput,
    getFuelValueForInputStack,
    ItemStack,
    SHEARS_ITEM_ID,
    BONE_ITEM_ID,
    EGG_ITEM_ID,
    BOWL_ITEM_ID,
    MUSHROOM_STEW_ITEM_ID,
    RAW_PORKCHOP_ITEM_ID,
    COOKED_PORKCHOP_ITEM_ID,
    RAW_CHICKEN_ITEM_ID,
    COOKED_CHICKEN_ITEM_ID,
    RAW_FISH_ITEM_ID,
    COOKED_FISH_ITEM_ID,
    DIAMOND_PICKAXE_ITEM_ID,
    FLINT_AND_STEEL_ITEM_ID,
    EMPTY_BUCKET_ITEM_ID,
    WATER_BUCKET_ITEM_ID,
    LAVA_BUCKET_ITEM_ID,
    MILK_BUCKET_ITEM_ID,
    DYE_POWDER_ITEM_ID,
    REDSTONE_REPEATER_ITEM_ID,
    BED_ITEM_ID,
    CAKE_ITEM_ID,
    ITEM_STACK_KIND_ITEM,
    ITEM_STACK_KIND_BLOCK,
    getItemStackKind,
    createItemStackFromSaved,
    serializeItemStackForSave
} from './js/inventory.js';
import { EntityManager } from './js/entities.js';
import { initTerrain, getTerrainData, getWorldgenSignature } from './js/terrain.js';
import { JavaRandom, parseMinecraftSeed } from './js/worldgen/javaRandom.js';
import { BetaParityHarness, toBetaBlockId } from './js/worldgen/betaParityHarness.js';
import { FluidManager } from './js/fluidManager.js';
import { FireManager } from './js/fireManager.js';
import { isFluidId, isWaterId, isLavaId, WATER_MOVING_ID, LAVA_MOVING_ID } from './js/fluidIds.js';
import { ThirdPersonController } from './js/thirdPerson.js';
import { MobManager } from './js/mobs.js';
import { TNTManager } from './js/tntManager.js';

// --- State Variables ---
let GAME_ACTIVE = false;
let CURRENT_WORLD_ID = null;
let IS_PAUSED = false;
let IS_INVENTORY_OPEN = false;
let IS_CHAT_OPEN = false; // New Chat State
let RENDER_DISTANCE = 2; // Default: Tiny
// Load chunks out to fog so nothing visible is missing (fog.far = (RENDER_DISTANCE + 1) * CHUNK_SIZE)
const LOAD_RADIUS = () => RENDER_DISTANCE + 1;
const ASSET_VERSION = 'beta013-livefix2';
const SURFACE_ONLY_CHUNK_LOADING = true;
const SURFACE_ONLY_MARGIN_BELOW = 1;
const SURFACE_ONLY_MARGIN_ABOVE = 1;
const CHUNK_LOAD_MODE_SURFACE = 'surface';
const CHUNK_LOAD_MODE_LOCAL_3D = 'local3d';
const WARM_CACHE_RADIUS_EXTRA = 1;
const LOCAL_3D_MODE_HOLD_MS = 3000;
const OUTSIDE_CACHE_EVICTION_MS = 2000;
let isMouseDown = false; 
let chunkLoadModeSticky = CHUNK_LOAD_MODE_SURFACE;
let chunkLoadModeHoldUntil = 0;

// --- Dimension State ---
let CURRENT_DIMENSION = 'OVERWORLD'; // 'OVERWORLD' or 'NETHER'
let portalTimer = 0;
let modifiedBlocksOverworld = [];
let modifiedBlocksNether = [];
let mobsOverworld = null;
let mobsNether = null;
let transportsOverworld = null;
let transportsNether = null;
let surfaceColumnCacheOverworld = new Map();
let surfaceColumnCacheNether = new Map();
let originalSurfaceColumnCacheOverworld = new Map();
let originalSurfaceColumnCacheNether = new Map();
let surfaceColumnCache = surfaceColumnCacheOverworld;
let originalSurfaceColumnCache = originalSurfaceColumnCacheOverworld;

const SIMPLE_CONSUMABLE_ITEMS = new Map([
    [normalizeLegacyRuntimeItemId(101), { message: 'You eat the cookie.', heal: 1 }],
    [normalizeLegacyRuntimeItemId(4), { message: 'You eat the apple.', heal: 4 }],
    [normalizeLegacyRuntimeItemId(63), { message: 'You eat the raw porkchop.', heal: 3 }],
    [normalizeLegacyRuntimeItemId(64), { message: 'You eat the cooked porkchop.', heal: 8 }],
    [RAW_PORKCHOP_ITEM_ID, { message: 'You eat the raw porkchop.', heal: 3 }],
    [COOKED_PORKCHOP_ITEM_ID, { message: 'You eat the cooked porkchop.', heal: 8 }],
    [normalizeLegacyRuntimeItemId(66), { message: 'You eat the golden apple.', heal: 42 }],
    // Chicken food is a MindBlock extension, so we preserve the current heal amounts.
    [RAW_CHICKEN_ITEM_ID, { message: 'You eat the raw chicken.', heal: 2 }],
    [COOKED_CHICKEN_ITEM_ID, { message: 'You eat the cooked chicken.', heal: 6 }],
    [normalizeLegacyRuntimeItemId(93), { message: 'You eat the raw fish.', heal: 2 }],
    [normalizeLegacyRuntimeItemId(94), { message: 'You eat the cooked fish.', heal: 5 }],
    [RAW_FISH_ITEM_ID, { message: 'You eat the raw fish.', heal: 2 }],
    [COOKED_FISH_ITEM_ID, { message: 'You eat the cooked fish.', heal: 5 }],
    [normalizeLegacyRuntimeItemId(41), { message: 'You eat the bread.', heal: 5 }],
    [MUSHROOM_STEW_ITEM_ID, { message: 'You eat the mushroom stew.', heal: 10, containerItemId: BOWL_ITEM_ID }],
]);
const UNSUPPORTED_ITEM_USE_ALIASES = new Set([]);
const DEFERRED_ITEM_USE_MESSAGES = new Map();
const LADDER_BLOCK_ID = 253;
const SIGN_POST_BLOCK_ID = 254;
const WALL_SIGN_BLOCK_ID = 255;
const WOOD_DOOR_BLOCK_ID = normalizeLegacyRuntimeBlockId(256);
const IRON_DOOR_BLOCK_ID = normalizeLegacyRuntimeBlockId(257);
const PAINTING_BLOCK_ID = normalizeLegacyRuntimeBlockId(258);
const BOAT_BLOCK_ID = normalizeLegacyRuntimeBlockId(259);
const MINECART_BLOCK_ID = normalizeLegacyRuntimeBlockId(260);
const SEEDS_ITEM_ID = normalizeLegacyRuntimeItemId(39);
const REDSTONE_DUST_ITEM_ID = normalizeLegacyRuntimeItemId(75);
const SIGN_ITEM_ID = normalizeLegacyRuntimeItemId(67);
const WOOD_DOOR_ITEM_ID = normalizeLegacyRuntimeItemId(68);
const IRON_DOOR_ITEM_ID = normalizeLegacyRuntimeItemId(74);
const PAINTING_ITEM_ID = normalizeLegacyRuntimeItemId(65);
const BOAT_ITEM_ID = normalizeLegacyRuntimeItemId(77);
const MINECART_ITEM_ID = normalizeLegacyRuntimeItemId(72);
const LADDER_ITEM_ID = normalizeLegacyRuntimeItemId(102);
const CROP_BLOCK_ID = 59;
const BOW_ITEM_ID = normalizeLegacyRuntimeItemId(5);
const ARROW_ITEM_ID = normalizeLegacyRuntimeItemId(6);
const SNOWBALL_ITEM_ID = normalizeLegacyRuntimeItemId(76);
const FISHING_ROD_ITEM_ID = normalizeLegacyRuntimeItemId(90);
const BETA_FLINT_AND_STEEL_ITEM_ID = normalizeLegacyRuntimeItemId(3);
const BETA_EMPTY_BUCKET_ITEM_ID = normalizeLegacyRuntimeItemId(69);
const BETA_WATER_BUCKET_ITEM_ID = normalizeLegacyRuntimeItemId(70);
const BETA_LAVA_BUCKET_ITEM_ID = normalizeLegacyRuntimeItemId(71);
const FISHING_BOBBER_ITEM_ID = 85; // visual placeholder
const REDSTONE_WIRE_BLOCK_ID = 55;
const REDSTONE_TORCH_OFF_BLOCK_ID = 75;
const REDSTONE_TORCH_ON_BLOCK_ID = 76;
const REDSTONE_REPEATER_OFF_BLOCK_ID = 93;
const REDSTONE_REPEATER_ON_BLOCK_ID = 94;
const PISTON_BLOCK_ID = 33;
const STICKY_PISTON_BLOCK_ID = 29;
const EXPLICIT_ITEM_TO_BLOCK_PLACEMENT = new Map([
    // Phase 0 redstone parity: explicit routing for all redstone placement-capable objects.
    [`${ITEM_STACK_KIND_ITEM}:${REDSTONE_DUST_ITEM_ID}`, REDSTONE_WIRE_BLOCK_ID],
    [`${ITEM_STACK_KIND_ITEM}:${REDSTONE_REPEATER_ITEM_ID}`, REDSTONE_REPEATER_OFF_BLOCK_ID],
    [`${ITEM_STACK_KIND_BLOCK}:${REDSTONE_TORCH_OFF_BLOCK_ID}`, REDSTONE_TORCH_OFF_BLOCK_ID],
    [`${ITEM_STACK_KIND_BLOCK}:${REDSTONE_TORCH_ON_BLOCK_ID}`, REDSTONE_TORCH_ON_BLOCK_ID],
    [`${ITEM_STACK_KIND_BLOCK}:${REDSTONE_REPEATER_OFF_BLOCK_ID}`, REDSTONE_REPEATER_OFF_BLOCK_ID],
    [`${ITEM_STACK_KIND_BLOCK}:${REDSTONE_REPEATER_ON_BLOCK_ID}`, REDSTONE_REPEATER_OFF_BLOCK_ID],
    [`${ITEM_STACK_KIND_BLOCK}:${PISTON_BLOCK_ID}`, PISTON_BLOCK_ID],
    [`${ITEM_STACK_KIND_BLOCK}:${STICKY_PISTON_BLOCK_ID}`, STICKY_PISTON_BLOCK_ID],
    [`${ITEM_STACK_KIND_ITEM}:${BED_ITEM_ID}`, 26],
    [`${ITEM_STACK_KIND_ITEM}:${CAKE_ITEM_ID}`, 92],
]);
const PLANT_GROWTH_INTERVAL_SECONDS = 1.0;
const PLANT_GROWTH_ATTEMPTS_PER_TICK = 48;
const MAX_COLUMN_PLANT_HEIGHT = 3;
let plantGrowthCarry = 0;

function getActionItemId(item) {
    if (!item) return 0;
    const kind = getItemStackKind(item.id, item.kind);
    if (kind === ITEM_STACK_KIND_BLOCK) return item.id;
    const runtimeItemId = normalizeLegacyRuntimeItemId(item.id);
    switch (runtimeItemId) {
        case BETA_FLINT_AND_STEEL_ITEM_ID: return FLINT_AND_STEEL_ITEM_ID;
        case BETA_EMPTY_BUCKET_ITEM_ID: return EMPTY_BUCKET_ITEM_ID;
        case BETA_WATER_BUCKET_ITEM_ID: return WATER_BUCKET_ITEM_ID;
        case BETA_LAVA_BUCKET_ITEM_ID: return LAVA_BUCKET_ITEM_ID;
        default: return runtimeItemId;
    }
}

// Physics State
const moveState = { fwd: false, bwd: false, left: false, right: false, crouch: false, jump: false, descend: false };
const velocity = new THREE.Vector3();
let canJumpRef = { val: false };
let flyEnabled = false;
let isFlying = false;
let flyFastEnabled = false;
let playerHealth = 20;
let playerInvulnTimer = 0;
const PLAYER_MAX_HEALTH = 20;
let deathRespawnQueued = false;
const PLAYER_HIT_INVULN_SECONDS = 0.5;
const PLAYER_BURN_DAMAGE_INTERVAL = 1.0; // 20 ticks parity baseline
const PLAYER_LAVA_ENTRY_DAMAGE = 4;
const PLAYER_FALL_DAMAGE_THRESHOLD_BLOCKS = 3;
const PLAYER_FEET_OFFSET = 1.62;
let playerBurnDamageTimer = 0;
let playerWasInLava = false;
let playerWasGrounded = false;
let playerFallStartEyeY = null;
let bowDrawActive = false;
let bowDrawTicks = 0;
const BOW_MAX_DRAW_TICKS = 20;
let throwableUseCooldownTicks = 0;
const THROWABLE_USE_COOLDOWN_TICKS = 4;
let rightMouseHeld = false;
let lastFlyToggleTapMs = 0;
const FLY_DOUBLE_TAP_MS = 300;
const FLY_MOVE_SPEED = 9.0;
const FLY_VERTICAL_SPEED = 8.0;
const FLY_FAST_MULTIPLIER = 3.0;
let playerEditPriorityUntil = 0;
const PLAYER_EDIT_PRIORITY_MS = 180;
let bowAudioCtx = null;
const flyForward = new THREE.Vector3();
const flyRight = new THREE.Vector3();
const flyMove = new THREE.Vector3();
const FRAME_PROFILER_SMOOTHING = 0.12;
const MAX_FIXED_STEPS_PER_FRAME = 8;
const plannerProfiler = {
    targeting: 0,
    cacheShell: 0,
    queue: 0,
    visibility: 0
};
const frameProfiler = {
    frameMs: 0,
    sections: {
        loading: 0,
        tick: 0,
        planner: 0,
        debug: 0,
        occlusion: 0,
        thirdPerson: 0,
        render: 0
    }
};
const renderCompositionStats = {
    drawCalls: 0,
    triangles: 0,
    points: 0,
    lines: 0
};
const PLANNER_MIN_REBUILD_MS = 180;
let occlusionCullingEnabled = false;
const EMPTY_CHUNK_PLANNER_METRICS = Object.freeze({
    loadMode: CHUNK_LOAD_MODE_SURFACE,
    visibleTargetChunks: 0,
    cacheTargetChunks: 0,
    nearVisibleTargetChunks: 0,
    nearVisibleLoadedChunks: 0,
    nearVisibleMissingChunks: 0,
    visibleColumns: 0,
    avgVisibleYSlicesPerColumn: 0,
    visibleMissingChunks: 0,
    visibleLoadedChunks: 0,
    surfaceCacheColumnsUsed: 0,
    surfaceFallbackColumnsUsed: 0
});
let cachedChunkPlannerMetrics = { ...EMPTY_CHUNK_PLANNER_METRICS };
let plannerStateDirty = true;
let lastPlannerSignature = '';
let lastPlannerRebuildMs = -Infinity;
let activePlannerSurfaceSpanMemo = null;
let forceRenderDistanceTightCull = false;
const PLAYER_BURN_DURATION_SECONDS = 10.0;
let playerBurnTimer = 0.0;
let playerFireOverlayScroll = 0;
const FARLANDS_BORDER_COORD = 12550821;
let deferredSaveTimeout = null;
const FARLANDS_INSET_BLOCKS = CHUNK_SIZE * 2;

function getPlayerFireFluidContact() {
    const pX = camera.position.x;
    const pY = getPlayerColliderTopY(camera.position.y);
    const pZ = camera.position.z;
    const height = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
    const r = PLAYER_RADIUS;

    const minX = Math.floor(pX - r);
    const maxX = Math.floor(pX + r);
    const minY = Math.floor(pY - height);
    const maxY = Math.floor(pY);
    const minZ = Math.floor(pZ - r);
    const maxZ = Math.floor(pZ + r);

    let water = false;
    let lava = false;
    let fire = false;
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const id = chunkManager.getBlock(x, y, z);
                if (id === 63) fire = true;
                else if (isLavaId(id)) lava = true;
                else if (isWaterId(id)) water = true;
            }
        }
    }
    return { water, lava, fire };
}

function tickPlayerBurn(dt) {
    const contact = getPlayerFireFluidContact();
    if (contact.lava) {
        if (!playerWasInLava) {
            damagePlayer(PLAYER_LAVA_ENTRY_DAMAGE, { source: 'lava' });
            playerBurnDamageTimer = 0;
        }
        playerBurnTimer = PLAYER_BURN_DURATION_SECONDS;
    } else if (contact.water) {
        playerBurnTimer = 0;
        playerBurnDamageTimer = 0;
    } else if (contact.fire) {
        playerBurnTimer = PLAYER_BURN_DURATION_SECONDS;
    } else if (playerBurnTimer > 0) {
        playerBurnTimer = Math.max(0, playerBurnTimer - dt);
    }
    playerWasInLava = !!contact.lava;
    if (playerBurnTimer > 0) {
        playerBurnDamageTimer += dt;
        while (playerBurnDamageTimer >= PLAYER_BURN_DAMAGE_INTERVAL) {
            playerBurnDamageTimer -= PLAYER_BURN_DAMAGE_INTERVAL;
            damagePlayer(1, { source: 'burn' });
        }
    } else {
        playerBurnDamageTimer = 0;
    }
}

function updatePlayerBurnVisuals(dt = 1 / 60) {
    const burning = playerBurnTimer > 0;
    const overlay = document.getElementById('player-fire-overlay');
    const overlayCanvas = document.getElementById('player-fire-overlay-canvas');
    if (overlay) {
        const show = burning && GAME_ACTIVE && !IS_PAUSED;
        overlay.style.display = show ? 'block' : 'none';
        overlay.style.opacity = show ? '1' : '0';
        if (show && overlayCanvas) {
            const srcCanvas = getFireAnimationCanvas();
            const rect = overlay.getBoundingClientRect();
            const width = Math.max(1, Math.floor(rect.width));
            const height = Math.max(1, Math.floor(rect.height));
            if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
                overlayCanvas.width = width;
                overlayCanvas.height = height;
            }
                const ctx = overlayCanvas.getContext('2d');
                if (ctx && srcCanvas) {
                    ctx.clearRect(0, 0, width, height);
                    playerFireOverlayScroll = (playerFireOverlayScroll + 60 * dt) % 256;
                    const tileH = height;
                    const tileW = Math.max(1, Math.round(srcCanvas.width * (tileH / srcCanvas.height)));
                    const startX = -Math.floor(playerFireOverlayScroll);
                    for (let x = startX; x < width + tileW; x += tileW) {
                        ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, x, 0, tileW, tileH);
                    }
                const grad = ctx.createLinearGradient(0, 0, 0, height);
                grad.addColorStop(0, 'rgba(255,140,30,0.0)');
                grad.addColorStop(0.55, 'rgba(255,120,15,0.08)');
                grad.addColorStop(1, 'rgba(255,80,0,0.24)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, width, height);
            }
        }
    }
    if (typeof thirdPersonController !== 'undefined' && thirdPersonController) {
        thirdPersonController.setBurning(burning);
    }
}

function updatePlayerHealthHUD() {
    const hud = document.getElementById('health-hud');
    if (!hud) return;
    const show = GAME_ACTIVE && !IS_PAUSED;
    hud.style.display = show ? 'flex' : 'none';
    if (!show) return;

    const hp = Math.max(0, Math.min(PLAYER_MAX_HEALTH, Math.floor(playerHealth)));
    const flash = playerInvulnTimer > 0 && (Math.floor(Date.now() / 110) % 2 === 0);

    // Jacobo gui/icons.png heart tiles (9x9 scaled 2x):
    // empty: (16,0), half: (61,0), full: (52,0), flash-empty: (25,0)
    const HEART_TEX = {
        EMPTY: '-32px 0px',
        FLASH_EMPTY: '-50px 0px',
        HALF: '-122px 0px',
        FULL: '-104px 0px'
    };

    const slots = 10;
    if (hud.childElementCount !== slots) {
        hud.innerHTML = '';
        for (let i = 0; i < slots; i++) {
            const el = document.createElement('div');
            el.className = 'heart-slot';
            hud.appendChild(el);
        }
    }
    for (let i = 0; i < slots; i++) {
        const heartValue = hp - i * 2;
        let pos = HEART_TEX.EMPTY;
        if (heartValue >= 2) pos = HEART_TEX.FULL;
        else if (heartValue === 1) pos = HEART_TEX.HALF;
        else if (flash) pos = HEART_TEX.FLASH_EMPTY;
        hud.children[i].style.backgroundPosition = pos;
    }
}

function updateBowChargeUI() {
    const wrap = document.getElementById('bow-charge-ui');
    const fill = document.getElementById('bow-charge-fill');
    if (!wrap || !fill) return;
    const shouldShow = GAME_ACTIVE && !IS_PAUSED && bowDrawActive;
    if (!shouldShow) {
        wrap.classList.add('hidden');
        fill.style.width = '0%';
        return;
    }
    wrap.classList.remove('hidden');
    const t = Math.max(0, Math.min(1, bowDrawTicks / BOW_MAX_DRAW_TICKS));
    fill.style.width = `${Math.floor(t * 100)}%`;
}

function getPlayerEyeHeight() {
    return moveState.crouch ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT;
}

function getPlayerColliderTopY(eyeY = camera.position.y) {
    const h = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
    const eyeH = getPlayerEyeHeight();
    return eyeY + (h - eyeH);
}

function setFlyingActive(active) {
    const next = !!active && flyEnabled;
    if (isFlying === next) return;
    isFlying = next;
    velocity.set(0, 0, 0);
    canJumpRef.val = false;
    moveState.crouch = false;
    moveState.descend = false;
    if (!isFlying) {
        moveState.jump = false;
    }
}

function toggleFlyMode(mode = null) {
    const normalizedMode = String(mode || '').trim().toLowerCase();
    if (normalizedMode === 'fast') {
        flyFastEnabled = !flyFastEnabled;
        return {
            ok: true,
            msg: flyFastEnabled ? 'Fast fly enabled (3x speed).' : 'Fast fly disabled.'
        };
    }
    flyEnabled = !flyEnabled;
    if (!flyEnabled) {
        setFlyingActive(false);
        return { ok: true, msg: 'Fly disabled.' };
    }
    return {
        ok: true,
        msg: `Fly enabled${flyFastEnabled ? ' (fast mode active)' : ''}. Double-tap Space to start or stop flying.`
    };
}

function toggleOptimiseMode() {
    occlusionCullingEnabled = !occlusionCullingEnabled;
    if (!occlusionCullingEnabled) {
        for (const [, rc] of renderChunks) {
            const visible = rc.baseVisible !== false;
            for (const mesh of rc.meshes) mesh.visible = visible;
        }
    }
    return {
        ok: true,
        msg: occlusionCullingEnabled
            ? 'Optimise mode enabled. Occlusion culling may hide chunks behind terrain.'
            : 'Optimise mode disabled. All planner-visible chunks stay rendered.'
    };
}

function updateFlying(dt) {
    velocity.set(0, 0, 0);
    canJumpRef.val = false;

    const moveX = (moveState.right ? 1 : 0) - (moveState.left ? 1 : 0);
    const moveZ = (moveState.fwd ? 1 : 0) - (moveState.bwd ? 1 : 0);
    flyMove.set(0, 0, 0);

    if (moveX !== 0 || moveZ !== 0) {
        camera.getWorldDirection(flyForward);
        flyForward.y = 0;
        if (flyForward.lengthSq() < 1e-6) {
            flyForward.set(0, 0, -1);
        } else {
            flyForward.normalize();
        }
        flyRight.crossVectors(flyForward, camera.up).normalize();
        if (moveZ !== 0) flyMove.addScaledVector(flyForward, moveZ);
        if (moveX !== 0) flyMove.addScaledVector(flyRight, moveX);
        if (flyMove.lengthSq() > 1e-6) {
            const speedScale = flyFastEnabled ? FLY_FAST_MULTIPLIER : 1;
            flyMove.normalize().multiplyScalar(FLY_MOVE_SPEED * speedScale * dt);
            camera.position.add(flyMove);
        }
    }

    const vertical = (moveState.jump ? 1 : 0) - (moveState.descend ? 1 : 0);
    if (vertical !== 0) {
        const speedScale = flyFastEnabled ? FLY_FAST_MULTIPLIER : 1;
        camera.position.y += vertical * FLY_VERTICAL_SPEED * speedScale * dt;
    }
}

function markPlayerEditPriority(durationMs = PLAYER_EDIT_PRIORITY_MS) {
    playerEditPriorityUntil = Date.now() + Math.max(0, Number(durationMs) || 0);
    markPlannerDirty();
}

function profileSection(name, startedAt, endedAt) {
    const elapsed = Math.max(0, endedAt - startedAt);
    const current = frameProfiler.sections[name] || 0;
    frameProfiler.sections[name] = current * (1 - FRAME_PROFILER_SMOOTHING) + elapsed * FRAME_PROFILER_SMOOTHING;
}

function formatProfilerLine(label, valueMs, totalMs) {
    const pct = totalMs > 0.0001 ? Math.max(0, Math.min(100, (valueMs / totalMs) * 100)) : 0;
    const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
    const bar = '#'.repeat(filled).padEnd(10, '.');
    return `${label}: ${valueMs.toFixed(2)}ms ${pct.toFixed(0).padStart(3, ' ')}% [${bar}]`;
}

function profilePlannerBucket(name, elapsedMs) {
    if (!Object.prototype.hasOwnProperty.call(plannerProfiler, name)) return;
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    const current = plannerProfiler[name] || 0;
    plannerProfiler[name] = current * (1 - FRAME_PROFILER_SMOOTHING) + elapsed * FRAME_PROFILER_SMOOTHING;
}

function buildFrameProfilerText() {
    const total = Math.max(0.0001, frameProfiler.frameMs);
    const renderComp = getRenderCompositionSnapshot();
    return [
        'Profiler:',
        formatProfilerLine('Load', frameProfiler.sections.loading, total),
        formatProfilerLine('Tick', frameProfiler.sections.tick, total),
        formatProfilerLine('Plan', frameProfiler.sections.planner, total),
        formatProfilerLine('Debug', frameProfiler.sections.debug, total),
        formatProfilerLine('Occ', frameProfiler.sections.occlusion, total),
        formatProfilerLine('Third', frameProfiler.sections.thirdPerson, total),
        formatProfilerLine('Render', frameProfiler.sections.render, total),
        `Plan buckets: tgt=${plannerProfiler.targeting.toFixed(1)} cache=${plannerProfiler.cacheShell.toFixed(1)} q=${plannerProfiler.queue.toFixed(1)} vis=${plannerProfiler.visibility.toFixed(1)}`,
        `Surface cache: hit=${cachedChunkPlannerMetrics.surfaceCacheColumnsUsed || 0} miss=${cachedChunkPlannerMetrics.surfaceFallbackColumnsUsed || 0}`,
        `Render info: calls=${renderCompositionStats.drawCalls} tris=${renderCompositionStats.triangles} transp=${renderComp.transparentMeshes} avgMesh=${renderComp.avgMeshesPerVisibleChunk.toFixed(1)} groups=${renderComp.visibleMeshGroups}`,
        `Frame: ${frameProfiler.frameMs.toFixed(2)}ms`
    ].join('\n');
}

function getRenderCompositionSnapshot() {
    let visibleRenderChunks = 0;
    let visibleChunkMeshes = 0;
    let transparentMeshes = 0;
    let transparentWaterMeshes = 0;
    let transparentFoliageMeshes = 0;
    let transparentDecorMeshes = 0;
    let transparentOtherMeshes = 0;
    const transparentOtherBySource = new Map();
    let visibleMergedOpaqueMeshes = 0;
    let visibleLegacyChunkMeshes = 0;
    let visibleMeshGroups = 0;
    let maxMeshesPerVisibleChunk = 0;
    let maxTransparentMeshesPerVisibleChunk = 0;
    for (const [, rc] of renderChunks) {
        if (!rc || !Array.isArray(rc.meshes) || rc.meshes.length === 0) continue;
        let rcHasVisibleMesh = false;
        let visibleMeshesThisChunk = 0;
        let transparentMeshesThisChunk = 0;
        for (const mesh of rc.meshes) {
            if (!mesh || !mesh.visible) continue;
            rcHasVisibleMesh = true;
            visibleChunkMeshes++;
            visibleMeshesThisChunk++;
            const groups = mesh.geometry && Array.isArray(mesh.geometry.groups) ? mesh.geometry.groups.length : 0;
            visibleMeshGroups += Math.max(1, groups);
            if (mesh.userData?.chunkRenderKind === 'opaqueMerged') visibleMergedOpaqueMeshes++;
            else visibleLegacyChunkMeshes++;
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    if (mesh.material.some((m) => !!m && (m.transparent || (m.alphaTest && m.alphaTest > 0)))) {
                        transparentMeshes++;
                        transparentMeshesThisChunk++;
                        const sourceId = mesh.userData?.sourceBlockId;
                        if (sourceId === 6 || sourceId === 70 || sourceId === 51 || sourceId === 71 || sourceId === 79) transparentWaterMeshes++;
                        else if (sourceId === 5) transparentFoliageMeshes++;
                        else if (isFlowerId(sourceId) || isMushroomId(sourceId) || isCropId(sourceId) || isTorchId(sourceId) || isButtonId(sourceId) || isPressurePlateId(sourceId) || isRailId(sourceId) || isRepeaterId(sourceId) || isTrapdoorId(sourceId) || isLadderId(sourceId) || isSignId(sourceId) || isPaintingId(sourceId) || isLeverId(sourceId) || isBedBlockId(sourceId) || isCakeBlockId(sourceId) || isFenceId(sourceId) || sourceId === 63 || sourceId === 90) transparentDecorMeshes++;
                        else if (isCactusId(sourceId)) transparentCactusMeshes++;
                        else {
                            transparentOtherMeshes++;
                            const key = String(sourceId ?? 'unknown');
                            transparentOtherBySource.set(key, (transparentOtherBySource.get(key) || 0) + 1);
                        }
                    }
                } else if (mesh.material.transparent || (mesh.material.alphaTest && mesh.material.alphaTest > 0)) {
                    transparentMeshes++;
                    transparentMeshesThisChunk++;
                    const sourceId = mesh.userData?.sourceBlockId;
                    if (sourceId === 6 || sourceId === 70 || sourceId === 51 || sourceId === 71 || sourceId === 79) transparentWaterMeshes++;
                    else if (sourceId === 5) transparentFoliageMeshes++;
                    else if (isFlowerId(sourceId) || isMushroomId(sourceId) || isCropId(sourceId) || isTorchId(sourceId) || isButtonId(sourceId) || isPressurePlateId(sourceId) || isRailId(sourceId) || isRepeaterId(sourceId) || isTrapdoorId(sourceId) || isLadderId(sourceId) || isSignId(sourceId) || isPaintingId(sourceId) || isLeverId(sourceId) || isBedBlockId(sourceId) || isCakeBlockId(sourceId) || isFenceId(sourceId) || sourceId === 63 || sourceId === 90) transparentDecorMeshes++;
                    else if (isCactusId(sourceId)) transparentCactusMeshes++;
                    else {
                        transparentOtherMeshes++;
                        const key = String(sourceId ?? 'unknown');
                        transparentOtherBySource.set(key, (transparentOtherBySource.get(key) || 0) + 1);
                    }
                }
            }
        }
        if (rcHasVisibleMesh) {
            visibleRenderChunks++;
            if (visibleMeshesThisChunk > maxMeshesPerVisibleChunk) {
                maxMeshesPerVisibleChunk = visibleMeshesThisChunk;
            }
            if (transparentMeshesThisChunk > maxTransparentMeshesPerVisibleChunk) {
                maxTransparentMeshesPerVisibleChunk = transparentMeshesThisChunk;
            }
        }
    }
    const visibleDrops = entityManager?.drops?.filter((d) => d?.mesh?.visible).length || 0;
    const visibleFallingBlocks = entityManager?.fallingBlocks?.filter((f) => f?.mesh?.visible).length || 0;
    const visibleMobs =
        (mobManager?.pigs?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.chickens?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.sheep?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.cows?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.creepers?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.zombies?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.spiders?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.skeletons?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.wolves?.filter((m) => m?.root?.visible).length || 0) +
        (mobManager?.squids?.filter((m) => m?.root?.visible).length || 0);
    const visiblePrimedTnt = tntManager?.primed?.filter((p) => p?.mesh?.visible).length || 0;
    const topTransparentOtherSources = [...transparentOtherBySource.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ id, count }));
    return {
        visibleRenderChunks,
        visibleChunkMeshes,
        transparentMeshes,
        transparentWaterMeshes,
        transparentFoliageMeshes,
        transparentDecorMeshes,
        transparentOtherMeshes,
        topTransparentOtherSources,
        visibleMergedOpaqueMeshes,
        visibleLegacyChunkMeshes,
        visibleMeshGroups,
        avgMeshesPerVisibleChunk: visibleRenderChunks > 0 ? (visibleChunkMeshes / visibleRenderChunks) : 0,
        avgTransparentMeshesPerVisibleChunk: visibleRenderChunks > 0 ? (transparentMeshes / visibleRenderChunks) : 0,
        maxMeshesPerVisibleChunk,
        maxTransparentMeshesPerVisibleChunk,
        visibleDrops,
        visibleFallingBlocks,
        visibleMobs,
        visiblePrimedTnt,
        drawCalls: renderCompositionStats.drawCalls,
        triangles: renderCompositionStats.triangles,
        points: renderCompositionStats.points,
        lines: renderCompositionStats.lines
    };
}

function markPlannerDirty() {
    plannerStateDirty = true;
}

function getPlannerSignature() {
    if (!GAME_ACTIVE) return 'inactive';
    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
    const focusY = getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z);
    const pcy = Math.floor(focusY / CHUNK_SIZE);
    const loadMode = getChunkLoadMode(camera.position.x, camera.position.y, camera.position.z);
    const pendingSig = pendingSurfaceSpawn
        ? `spawn:${pendingSurfaceSpawn.resolved ? 1 : 0}:${pendingSurfaceSpawn.restoreSavedPosition ? 1 : 0}`
        : 'spawn:none';
    return `${pcx},${pcy},${pcz}|${loadMode}|rd:${RENDER_DISTANCE}|wl:${worldLoadingActive ? 1 : 0}|${pendingSig}`;
}

function refreshChunkPlannerIfNeeded(force = false) {
    if (!GAME_ACTIVE) return false;
    const nowPerf = performance.now();
    const nextSignature = getPlannerSignature();
    if (!force && !plannerStateDirty && nextSignature === lastPlannerSignature) {
        return false;
    }
    if (!force && (nowPerf - lastPlannerRebuildMs) < PLANNER_MIN_REBUILD_MS) {
        return false;
    }
    identifyNeededChunks();
    lastPlannerRebuildMs = nowPerf;
    lastPlannerSignature = nextSignature;
    plannerStateDirty = false;
    return true;
}

function isPlayerEnclosedForChunkLoading(posX = camera.position.x, eyeY = camera.position.y, posZ = camera.position.z) {
    const topY = getPlayerColliderTopY(eyeY);
    const sampleY = Math.floor(topY - 0.6);
    const bx = Math.floor(posX);
    const bz = Math.floor(posZ);
    let solidHits = 0;
    const samples = [
        [1, 0, 0], [-1, 0, 0],
        [0, 0, 1], [0, 0, -1],
        [0, 1, 0], [0, 2, 0]
    ];
    for (const [dx, dy, dz] of samples) {
        const sx = bx + dx;
        const sy = sampleY + dy;
        const sz = bz + dz;
        const cx = Math.floor(sx / CHUNK_SIZE);
        const cy = Math.floor(sy / CHUNK_SIZE);
        const cz = Math.floor(sz / CHUNK_SIZE);
        // Treat unloaded nearby samples as blocked/unknown so missing chunks
        // around an underground player still switch us into local 3D loading.
        if (!chunkManager.hasChunk(cx, cy, cz)) {
            solidHits++;
            continue;
        }
        const id = chunkManager.getBlock(sx, sy, sz);
        if (isSolidForSpawn(id)) solidHits++;
    }
    return solidHits >= 3;
}

function isPlayerInOrAboveNearbySurfaceChunks(posX = camera.position.x, eyeY = camera.position.y, posZ = camera.position.z) {
    if (CURRENT_DIMENSION !== 'OVERWORLD') return false;
    const playerTopY = getPlayerColliderTopY(eyeY);
    const playerCy = Math.floor(playerTopY / CHUNK_SIZE);
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const pcx = Math.floor(posX / CHUNK_SIZE);
    const pcz = Math.floor(posZ / CHUNK_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const cx = pcx + dx;
            const cz = pcz + dz;
            const span = getSurfaceChunkYSpanForColumn(cx, cz, worldMinChunkY, worldMaxChunkY);
            if (!Number.isFinite(span?.minCy) || !Number.isFinite(span?.maxCy)) continue;
            // If the player's current vertical chunk is within or above the
            // nearby surface band, treat them as surface-side. This prevents
            // local3d from engaging while still standing on terrain just
            // because walls/trees temporarily look "enclosed".
            if (playerCy >= span.minCy) {
                return true;
            }
        }
    }
    return false;
}

function isPlayerInOrAboveNearbyOriginalSurfaceChunks(posX = camera.position.x, eyeY = camera.position.y, posZ = camera.position.z) {
    if (CURRENT_DIMENSION !== 'OVERWORLD') return false;
    const playerTopY = getPlayerColliderTopY(eyeY);
    const playerCy = Math.floor(playerTopY / CHUNK_SIZE);
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const pcx = Math.floor(posX / CHUNK_SIZE);
    const pcz = Math.floor(posZ / CHUNK_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const cx = pcx + dx;
            const cz = pcz + dz;
            const span = getOriginalSurfaceChunkYSpanForColumn(cx, cz, worldMinChunkY, worldMaxChunkY);
            if (!Number.isFinite(span?.minCy)) continue;
            if (playerCy >= span.minCy) {
                return true;
            }
        }
    }
    return false;
}

function detectChunkLoadMode(posX = camera.position.x, eyeY = camera.position.y, posZ = camera.position.z) {
    if (CURRENT_DIMENSION !== 'OVERWORLD') return CHUNK_LOAD_MODE_LOCAL_3D;
    const playerTopY = getPlayerColliderTopY(eyeY);
    const surfaceY = getNearbyOriginalSurfaceReferenceY(posX, posZ, { sampleRadius: 2 });
    const belowSurface = surfaceY - playerTopY;
    if (isPlayerInOrAboveNearbyOriginalSurfaceChunks(posX, eyeY, posZ)) {
        return CHUNK_LOAD_MODE_SURFACE;
    }
    if (belowSurface <= 4) return CHUNK_LOAD_MODE_SURFACE;
    const enclosed = isPlayerEnclosedForChunkLoading(posX, eyeY, posZ);
    const loadedTop = getTopSolidYFromLoadedColumn(posX, posZ);
    const hasLoadedRoof = Number.isFinite(loadedTop) && loadedTop > playerTopY + 6;
    if (belowSurface >= 10) return CHUNK_LOAD_MODE_LOCAL_3D;
    if (enclosed && belowSurface > 5) return CHUNK_LOAD_MODE_LOCAL_3D;
    if (hasLoadedRoof && belowSurface > 5) return CHUNK_LOAD_MODE_LOCAL_3D;
    return CHUNK_LOAD_MODE_SURFACE;
}

function getChunkLoadMode(posX = camera.position.x, eyeY = camera.position.y, posZ = camera.position.z) {
    const now = Date.now();
    const surfaceAnchored = isPlayerInOrAboveNearbyOriginalSurfaceChunks(posX, eyeY, posZ);
    if (surfaceAnchored) {
        chunkLoadModeSticky = CHUNK_LOAD_MODE_SURFACE;
        chunkLoadModeHoldUntil = 0;
        return CHUNK_LOAD_MODE_SURFACE;
    }
    const detected = detectChunkLoadMode(posX, eyeY, posZ);
    if (detected === CHUNK_LOAD_MODE_LOCAL_3D) {
        chunkLoadModeSticky = CHUNK_LOAD_MODE_LOCAL_3D;
        chunkLoadModeHoldUntil = now + LOCAL_3D_MODE_HOLD_MS;
        return CHUNK_LOAD_MODE_LOCAL_3D;
    }
    if (chunkLoadModeSticky === CHUNK_LOAD_MODE_LOCAL_3D && now < chunkLoadModeHoldUntil) {
        return CHUNK_LOAD_MODE_LOCAL_3D;
    }
    chunkLoadModeSticky = CHUNK_LOAD_MODE_SURFACE;
    return CHUNK_LOAD_MODE_SURFACE;
}

function getChunkLoadFocusY(posX = camera.position.x, eyeY = camera.position.y, posZ = camera.position.z) {
    let focusY = getPlayerColliderTopY(eyeY);
    if (CURRENT_DIMENSION === 'OVERWORLD' && getChunkLoadMode(posX, eyeY, posZ) === CHUNK_LOAD_MODE_SURFACE) {
        const surfaceY = getSurfaceSpawnY(posX, posZ);
        focusY = Math.min(focusY, surfaceY + 8);
    }
    if (!Number.isFinite(focusY)) {
        focusY = getSurfaceSpawnY(posX, posZ);
    }
    return Math.max(WORLD_DEPTH + 2, Math.min(WORLD_HEIGHT - 2, focusY));
}

// Camera smoothing for smooth rendering
const renderCameraPosition = new THREE.Vector3();

// Time Step State
const FIXED_STEP = 1 / 60; 
const GAME_TICKS_PER_SECOND = 20;
let accumulator = 0;

// VSync State
let VSYNC_ENABLED = true;
let animationLoopId = null;

// World time (Beta-style 24000 tick day).
const DAY_TICKS = 24000;
const WAKE_MORNING_TICKS = 0;
const NIGHT_TICKS = 18000;
const BED_SLEEP_START_TICKS = 12541;
const BED_SLEEP_END_TICKS = 23458;
let worldTimeTicks = WAKE_MORNING_TICKS;
let worldTimeCarry = 0;
let tntManager = null;

// World Data
const chunkManager = new ChunkManager();
let modifiedBlocks = []; 
let linkRegistry = new Map();
let furnaceRegistry = new Map();
let chestRegistry = new Map(); // Store chest contents
let dispenserRegistry = new Map();
let signRegistryOverworld = new Map();
let signRegistryNether = new Map();
let signRegistry = signRegistryOverworld; // Active dimension sign registry
let signTextMeshes = new Map();
let bedRespawnPoint = null;
const buttonReleaseTimers = new Map();
const repeaterDirtyKeys = new Set();
const repeaterPendingTransitions = new Map(); // key -> { toOn:boolean, dueTick:number }
let repeaterGameTick = 0;
let repeaterTickAccumulator = 0;
let repeaterFullScanCooldown = 0;
const REPEATER_FULL_SCAN_INTERVAL = 0.75;
const REPEATER_TICK_SECONDS = 0.1; // Beta redstone tick baseline.
const redstoneWireDirtyKeys = new Set();
let redstoneWireFullScanCooldown = 0;
const REDSTONE_WIRE_FULL_SCAN_INTERVAL = 0.75;
const REDSTONE_WIRE_STEP_LIMIT = 4096;
const redstoneTorchDirtyKeys = new Set();
let redstoneTorchFullScanCooldown = 0;
const REDSTONE_TORCH_FULL_SCAN_INTERVAL = 0.75;
const REDSTONE_TORCH_BURNOUT_WINDOW_SECONDS = 5.0;  // 100 ticks
const REDSTONE_TORCH_BURNOUT_TOGGLE_COUNT = 8;
const REDSTONE_TORCH_BURNOUT_COOLDOWN_SECONDS = 8.0; // ~160 ticks
const redstoneTorchToggleTimes = new Map(); // key -> number[] (seconds)
const redstoneTorchBurnoutUntil = new Map(); // key -> seconds
let redstoneTorchClock = 0;
const pistonDirtyKeys = new Set();
let pistonTickAccumulator = 0;
let pistonFullScanCooldown = 0;
let pistonGameTick = 0;
const pistonPendingEvents = new Map(); // key -> { action: 'extend'|'retract', dueTick:number }
const PISTON_TICK_SECONDS = 0.1;
const PISTON_FULL_SCAN_INTERVAL = 0.75;
const PISTON_PUSH_LIMIT = 12;
const PISTON_EVENT_DELAY_TICKS = 1;
let railTickAccumulator = 0;
const RAIL_TICK_SECONDS = 0.1;
const pressedPressurePlateKeys = new Set();
const redstoneActuatorPrevPowered = new Map(); // key -> boolean
let redstoneActuatorTickAccumulator = 0;
const REDSTONE_ACTUATOR_TICK_SECONDS = 0.1;
const redstoneTickChunkFeatureCache = new Map(); // key -> { scannedAt, hasRails, hasActuators, hasWire, hasTorch, hasRepeater, hasPiston }
const REDSTONE_TICK_CHUNK_FEATURE_TTL_MS = 1200;
const REDSTONE_FANOUT_OFFSETS = (() => {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const md = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
                out.push({ dx, dy, dz, md });
            }
        }
    }
    out.sort((a, b) => {
        if (a.md !== b.md) return a.md - b.md;
        // Jacobo-like stable axis order: X, Y, Z
        if (a.dx !== b.dx) return a.dx - b.dx;
        if (a.dy !== b.dy) return a.dy - b.dy;
        return a.dz - b.dz;
    });
    return out.map((o) => [o.dx, o.dy, o.dz]);
})();
let fishingBobberDrop = null;
let renderChunks = new Map();
let linkMeshes = [];
let exposedChunks = new Set();
// Track when geometry was last updated for each chunk to skip stale updates
const geometryUpdateTimestamps = new Map(); 
const pendingGeometryByKey = new Map();

// Worker & Loading State
let chunkWorker;
let workerSampleRequestSeq = 1;
const workerSamplePending = new Map();
const MAX_CHUNK_IN_FLIGHT_BASE = 40;
const MAX_CHUNK_IN_FLIGHT_SURFACE_ONLY = 160;
const MAX_CHUNK_DISPATCH_PER_CALL_BASE = 20;
const MAX_CHUNK_DISPATCH_PER_CALL_SURFACE_ONLY = 64;
const CHUNK_RETRY_MAX = 5;
const CHUNK_DISPATCH_INTERVAL_MS = 2;
const JACOBO_CHUNK_CACHE_RADIUS = 15;
let lastChunkDispatchMs = 0;
const requestedChunks = new Map();
const geometryRefreshRequests = new Map();
let pendingLoadQueue = [];
const pendingLoadQueueKeys = new Set();
let pendingQueueNeedsSort = false;
let lastPendingQueueSortMs = 0;
let lastSortChunkX = Number.NaN;
let lastSortChunkY = Number.NaN;
let lastSortChunkZ = Number.NaN;
const chunkRetryCount = new Map();
let lastWorldgenSignature = '';
const modifiedBlockIndexByPos = new Map(); // "x,y,z" -> index in modifiedBlocks
const modifiedBlocksByChunk = new Map();   // "cx,cy,cz" -> [{x,y,z,id,metadata}, ...]
const EMPTY_MOD_LIST = Object.freeze([]);
const chunkStreamStats = {
    dispatchedTotal: 0,
    completedTotal: 0,
    errorTotal: 0,
    canceledTotal: 0,
    retriedTotal: 0,
    dispatchRate: 0,
    completeRate: 0,
    avgWaitMs: 0,
    workerLoadQueue: 0,
    workerSetBlockQueue: 0,
    dirtyMeshBacklog: 0,
    workerOldestLoadMs: 0,
    pendingPeak: 0,
    inFlightPeak: 0,
    _waitSumMs: 0,
    _waitSamples: 0,
    _lastTime: performance.now(),
    _lastDispatched: 0,
    _lastCompleted: 0
};
const CHUNK_TRACE_MAX_EVENTS = 50000;
let chunkTraceEnabled = false;
let chunkTraceSeq = 0;
const chunkLifecycleTrace = [];
const chunkProvidedTraceSeen = new Set();
const chunkRequestCompletionSeen = new Set();
const generatedSurfaceChunkKeys = new Set();

function getMaxChunkInFlight() {
    if (!SURFACE_ONLY_CHUNK_LOADING) return MAX_CHUNK_IN_FLIGHT_BASE;
    const workerBacklog = Math.max(0, chunkStreamStats.workerLoadQueue || 0);
    const pending = Math.max(0, pendingLoadQueue.length || 0);
    const completeRate = Math.max(0, chunkStreamStats.completeRate || 0);
    let cap = MAX_CHUNK_IN_FLIGHT_SURFACE_ONLY;
    if (workerBacklog >= 640) cap = 48;
    else if (workerBacklog >= 384) cap = 72;
    else if (workerBacklog >= 256) cap = 96;
    else if (workerBacklog >= 160) cap = 128;
    else if (workerBacklog <= 48 && pending > 24) cap = 200;
    if (completeRate < 1.5 && workerBacklog > 180) cap = Math.min(cap, 96);
    return Math.max(40, cap);
}

function getMaxChunkDispatchPerCall() {
    if (!SURFACE_ONLY_CHUNK_LOADING) return MAX_CHUNK_DISPATCH_PER_CALL_BASE;
    const workerBacklog = Math.max(0, chunkStreamStats.workerLoadQueue || 0);
    let budget = MAX_CHUNK_DISPATCH_PER_CALL_SURFACE_ONLY;
    if (workerBacklog >= 640) budget = 6;
    else if (workerBacklog >= 384) budget = 10;
    else if (workerBacklog >= 256) budget = 16;
    else if (workerBacklog >= 160) budget = 24;
    else if (workerBacklog >= 96) budget = 36;
    return Math.max(4, budget);
}

function clearChunkLifecycleTrace() {
    chunkLifecycleTrace.length = 0;
    chunkTraceSeq = 0;
    chunkProvidedTraceSeen.clear();
}

function setChunkTraceEnabled(enabled) {
    chunkTraceEnabled = !!enabled;
    if (chunkWorker) {
        chunkWorker.postMessage({ type: 'chunkTraceControl', data: { enabled: chunkTraceEnabled } });
    }
}

function pushChunkTraceEvent(event, cx, cy, cz, extra = null, source = 'main') {
    if (!chunkTraceEnabled) return;
    const rec = {
        seq: ++chunkTraceSeq,
        t: Date.now(),
        source,
        event,
        cx,
        cy,
        cz
    };
    if (extra && typeof extra === 'object') rec.extra = extra;
    chunkLifecycleTrace.push(rec);
    if (chunkLifecycleTrace.length > CHUNK_TRACE_MAX_EVENTS) {
        chunkLifecycleTrace.splice(0, chunkLifecycleTrace.length - CHUNK_TRACE_MAX_EVENTS);
    }
}

function markChunkProvidedTrace(key, source) {
    if (chunkProvidedTraceSeen.has(key)) return;
    chunkProvidedTraceSeen.add(key);
    const p = parseKey(key);
    pushChunkTraceEvent('provided', p.x, p.y, p.z, null, source);
}

function finalizeChunkRequest(key, sourceTag = 'main') {
    requestedChunks.delete(key);
    geometryRefreshRequests.delete(key);
    chunkRetryCount.delete(key);
    if (!chunkRequestCompletionSeen.has(key)) {
        chunkRequestCompletionSeen.add(key);
        chunkStreamStats.completedTotal++;
    }
    markChunkProvidedTrace(key, sourceTag);
}

function sampleChunkStreamStats() {
    const now = performance.now();
    const dt = (now - chunkStreamStats._lastTime) / 1000;
    if (dt < 0.5) return;
    const dispatchedDelta = chunkStreamStats.dispatchedTotal - chunkStreamStats._lastDispatched;
    const completedDelta = chunkStreamStats.completedTotal - chunkStreamStats._lastCompleted;
    chunkStreamStats.dispatchRate = dispatchedDelta / dt;
    chunkStreamStats.completeRate = completedDelta / dt;
    if (chunkStreamStats._waitSamples > 0) {
        chunkStreamStats.avgWaitMs = chunkStreamStats._waitSumMs / chunkStreamStats._waitSamples;
    }
    chunkStreamStats._lastDispatched = chunkStreamStats.dispatchedTotal;
    chunkStreamStats._lastCompleted = chunkStreamStats.completedTotal;
    chunkStreamStats._lastTime = now;
}

function resetChunkStreamStats() {
    chunkStreamStats.dispatchedTotal = 0;
    chunkStreamStats.completedTotal = 0;
    chunkStreamStats.errorTotal = 0;
    chunkStreamStats.canceledTotal = 0;
    chunkStreamStats.retriedTotal = 0;
    chunkStreamStats.dispatchRate = 0;
    chunkStreamStats.completeRate = 0;
    chunkStreamStats.avgWaitMs = 0;
    chunkStreamStats.workerLoadQueue = 0;
    chunkStreamStats.workerSetBlockQueue = 0;
    chunkStreamStats.dirtyMeshBacklog = 0;
    chunkStreamStats.workerOldestLoadMs = 0;
    chunkStreamStats.pendingPeak = 0;
    chunkStreamStats.inFlightPeak = 0;
    chunkStreamStats._waitSumMs = 0;
    chunkStreamStats._waitSamples = 0;
    chunkStreamStats._lastTime = performance.now();
    chunkStreamStats._lastDispatched = 0;
    chunkStreamStats._lastCompleted = 0;
    chunkProvidedTraceSeen.clear();
    chunkRequestCompletionSeen.clear();
}

function resetModifiedBlockCaches() {
    modifiedBlockIndexByPos.clear();
    modifiedBlocksByChunk.clear();
}

function rebuildModifiedBlockCaches() {
    resetModifiedBlockCaches();

    // Keep latest entry per block position in cache.
    for (let i = 0; i < modifiedBlocks.length; i++) {
        const m = modifiedBlocks[i];
        if (!m) continue;
        modifiedBlockIndexByPos.set(`${m.x},${m.y},${m.z}`, i);
    }

    for (const idx of modifiedBlockIndexByPos.values()) {
        const m = modifiedBlocks[idx];
        const cx = Math.floor(m.x / CHUNK_SIZE);
        const cy = Math.floor(m.y / CHUNK_SIZE);
        const cz = Math.floor(m.z / CHUNK_SIZE);
        const cKey = `${cx},${cy},${cz}`;
        let chunkMods = modifiedBlocksByChunk.get(cKey);
        if (!chunkMods) {
            chunkMods = [];
            modifiedBlocksByChunk.set(cKey, chunkMods);
        }
        chunkMods.push(m);
    }
}

function getChunkModifications(cx, cy, cz) {
    return modifiedBlocksByChunk.get(`${cx},${cy},${cz}`) || EMPTY_MOD_LIST;
}

function getCanonicalModifiedBlocksSnapshot() {
    const out = [];
    for (const idx of modifiedBlockIndexByPos.values()) {
        const m = modifiedBlocks[idx];
        if (!m) continue;
        out.push({ x: m.x, y: m.y, z: m.z, id: m.id, metadata: m.metadata || 0 });
    }
    return out;
}

function getSaveModifiedBlocksSnapshot() {
    const out = [];
    for (const idx of modifiedBlockIndexByPos.values()) {
        const m = modifiedBlocks[idx];
        if (!m) continue;
        // Runtime-canonical save format: keep exact runtime IDs.
        out.push({ x: m.x, y: m.y, z: m.z, id: m.id, metadata: m.metadata || 0 });
    }
    return out;
}

function normalizeRuntimeTerrainId(id) {
    return normalizeLegacyRuntimeBlockId(Number(id) || 0);
}

function getRandomSeedString() {
    const hi = Math.floor(Math.random() * 0x100000000);
    const lo = Math.floor(Math.random() * 0x100000000);
    const asSigned = BigInt.asIntN(64, (BigInt(hi) << 32n) | BigInt(lo));
    return asSigned.toString();
}

function estimateFirstUncoveredBlockForSpawn(x, z, dimension = 'OVERWORLD') {
    const t = getTerrainData(x, z);
    if (t.y <= WORLD_DEPTH) return 0;
    if (t.y < 63) return 9;
    if (dimension === 'NETHER') {
        if (t.y <= 5) return 7;
        return 80;
    }
    return t.isDesert ? 12 : 2;
}

let spawnParitySeed = null;
let spawnParityHarness = null;
const spawnParityGeneratedColumns = new Set();
const surfaceTopParityCache = new Map();

function getSpawnParityHarness(seed) {
    const parsedSeed = parseMinecraftSeed(seed).toString();
    if (!spawnParityHarness || spawnParitySeed !== parsedSeed) {
        spawnParitySeed = parsedSeed;
        spawnParityHarness = new BetaParityHarness(parsedSeed);
        spawnParityGeneratedColumns.clear();
        surfaceTopParityCache.clear();
    }
    return spawnParityHarness;
}

function ensureSpawnParityColumnGenerated(seed, x, z) {
    const h = getSpawnParityHarness(seed);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    if (spawnParityGeneratedColumns.has(key)) return h;
    h.generateWithNeighborPrereq(cx, cz);
    spawnParityGeneratedColumns.add(key);
    return h;
}

function setActiveSurfaceColumnCache() {
    surfaceColumnCache = (CURRENT_DIMENSION === 'OVERWORLD')
        ? surfaceColumnCacheOverworld
        : surfaceColumnCacheNether;
    originalSurfaceColumnCache = (CURRENT_DIMENSION === 'OVERWORLD')
        ? originalSurfaceColumnCacheOverworld
        : originalSurfaceColumnCacheNether;
}

function getSurfaceColumnCacheKey(cx, cz) {
    return `${cx},${cz}`;
}

function parseSurfaceColumnCacheKey(key) {
    const parts = String(key).split(',');
    return {
        x: Math.floor(Number(parts[0])),
        z: Math.floor(Number(parts[1]))
    };
}

function getSurfaceColumnCacheEntry(cx, cz) {
    return surfaceColumnCache.get(getSurfaceColumnCacheKey(cx, cz)) || null;
}

function getOriginalSurfaceColumnCacheEntry(cx, cz) {
    return originalSurfaceColumnCache.get(getSurfaceColumnCacheKey(cx, cz)) || null;
}

function setSurfaceColumnCacheEntry(cx, cz, minTop, maxTop) {
    if (!Number.isFinite(minTop) || !Number.isFinite(maxTop)) return false;
    const next = {
        minTop: Math.floor(Math.min(minTop, maxTop)),
        maxTop: Math.floor(Math.max(minTop, maxTop))
    };
    const key = getSurfaceColumnCacheKey(cx, cz);
    const prev = surfaceColumnCache.get(key);
    if (prev && prev.minTop === next.minTop && prev.maxTop === next.maxTop) {
        return false;
    }
    surfaceColumnCache.set(key, next);
    return true;
}

function setOriginalSurfaceColumnCacheEntry(cx, cz, minTop, maxTop) {
    if (!Number.isFinite(minTop) || !Number.isFinite(maxTop)) return false;
    const next = {
        minTop: Math.floor(Math.min(minTop, maxTop)),
        maxTop: Math.floor(Math.max(minTop, maxTop))
    };
    const key = getSurfaceColumnCacheKey(cx, cz);
    const prev = originalSurfaceColumnCache.get(key);
    if (prev && prev.minTop === next.minTop && prev.maxTop === next.maxTop) {
        return false;
    }
    originalSurfaceColumnCache.set(key, next);
    return true;
}

function serializeSurfaceColumnCache(map) {
    const rows = [];
    for (const [key, entry] of map) {
        if (!entry || !Number.isFinite(entry.minTop) || !Number.isFinite(entry.maxTop)) continue;
        const p = parseKey(key);
        rows.push({ x: p.x, z: p.z, minTop: entry.minTop, maxTop: entry.maxTop });
    }
    return rows;
}

function deserializeSurfaceColumnCache(rows) {
    const map = new Map();
    if (!Array.isArray(rows)) return map;
    for (const row of rows) {
        const cx = Number(row?.x);
        const cz = Number(row?.z);
        const minTop = Number(row?.minTop);
        const maxTop = Number(row?.maxTop);
        if (!Number.isFinite(cx) || !Number.isFinite(cz) || !Number.isFinite(minTop) || !Number.isFinite(maxTop)) continue;
        map.set(getSurfaceColumnCacheKey(Math.floor(cx), Math.floor(cz)), {
            minTop: Math.floor(Math.min(minTop, maxTop)),
            maxTop: Math.floor(Math.max(minTop, maxTop))
        });
    }
    return map;
}

function updateSurfaceColumnCacheForChunkColumn(cx, cz) {
    const wx = cx * CHUNK_SIZE;
    const wz = cz * CHUNK_SIZE;
    const heights = [];
    for (let dx = 0; dx < CHUNK_SIZE; dx++) {
        for (let dz = 0; dz < CHUNK_SIZE; dz++) {
            const sx = wx + dx;
            const sz = wz + dz;
            const loadedTop = getTopSurfaceEnvelopeYFromLoadedColumn(sx, sz);
            const estimatedTop = Number(getTerrainData(sx, sz)?.y);
            let sampleTop = loadedTop;
            if (Number.isFinite(estimatedTop)) {
                sampleTop = Number.isFinite(sampleTop) ? sampleTop : estimatedTop;
            }
            if (!Number.isFinite(sampleTop)) return false;
            heights.push(sampleTop);
        }
    }
    const loadedBaseY = getLastFullSolidLayerYForLoadedChunkColumn(cx, cz);
    const estimatedBaseY = Math.min(...heights);
    const baseY = Number.isFinite(loadedBaseY) ? loadedBaseY : estimatedBaseY;
    const topY = Math.max(...heights);
    const changed = setSurfaceColumnCacheEntry(cx, cz, baseY, topY);
    if (changed) markPlannerDirty();
    return changed;
}

function getLastFullOriginalSolidLayerYForLoadedChunkColumn(cx, cz) {
    const wx = cx * CHUNK_SIZE;
    const wz = cz * CHUNK_SIZE;
    const scanTop = WORLD_HEIGHT - 1;
    const scanBottom = WORLD_DEPTH;
    let sawLoaded = false;
    let lastFullY = null;

    for (let y = scanBottom; y <= scanTop; y++) {
        const cy = Math.floor(y / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) continue;
        sawLoaded = true;
        let full = true;
        for (let dx = 0; dx < CHUNK_SIZE && full; dx++) {
            for (let dz = 0; dz < CHUNK_SIZE; dz++) {
                if (!isSolidForSurfaceEnvelope(chunkManager.getBlock(wx + dx, y, wz + dz))) {
                    full = false;
                    break;
                }
            }
        }
        if (full) lastFullY = y;
    }

    return sawLoaded ? lastFullY : null;
}

function getTopOriginalSurfaceEnvelopeYFromLoadedColumn(x, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const scanTop = WORLD_HEIGHT - 1;
    const scanBottom = WORLD_DEPTH;
    let sawLoaded = false;
    for (let y = scanTop; y >= scanBottom; y--) {
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) continue;
        sawLoaded = true;
        if (isSolidForSurfaceEnvelope(chunkManager.getBlock(bx, y, bz))) return y;
    }
    return sawLoaded ? null : null;
}

function updateOriginalSurfaceColumnCacheForChunkColumn(cx, cz) {
    const wx = cx * CHUNK_SIZE;
    const wz = cz * CHUNK_SIZE;
    const heights = [];
    for (let dx = 0; dx < CHUNK_SIZE; dx++) {
        for (let dz = 0; dz < CHUNK_SIZE; dz++) {
            const sx = wx + dx;
            const sz = wz + dz;
            const loadedTop = getTopOriginalSurfaceEnvelopeYFromLoadedColumn(sx, sz);
            const estimatedTop = Number(getTerrainData(sx, sz)?.y);
            let sampleTop = loadedTop;
            if (Number.isFinite(estimatedTop)) {
                sampleTop = Number.isFinite(sampleTop) ? sampleTop : estimatedTop;
            }
            if (!Number.isFinite(sampleTop)) return false;
            heights.push(sampleTop);
        }
    }
    const loadedBaseY = getLastFullOriginalSolidLayerYForLoadedChunkColumn(cx, cz);
    const estimatedBaseY = Math.min(...heights);
    const baseY = Number.isFinite(loadedBaseY) ? loadedBaseY : estimatedBaseY;
    const topY = Math.max(...heights);
    return setOriginalSurfaceColumnCacheEntry(cx, cz, baseY, topY);
}

function getFirstUncoveredBlockParity(seed, x, z, dimension = 'OVERWORLD') {
    if (dimension === 'NETHER') {
        return estimateFirstUncoveredBlockForSpawn(x, z, dimension);
    }
    const wx = Math.floor(x);
    const wz = Math.floor(z);
    const h = ensureSpawnParityColumnGenerated(seed, wx, wz);

    let y = 63;
    while (y + 1 < 128) {
        const aboveMind = h.chunkManager.getBlock(wx, y + 1, wz);
        if (toBetaBlockId(aboveMind) === 0) break;
        y++;
    }
    const topMind = h.chunkManager.getBlock(wx, y, wz);
    return toBetaBlockId(topMind);
}

function getTopSolidYParity(seed, x, z, dimension = 'OVERWORLD') {
    if (dimension === 'NETHER') {
        return Math.floor(getSurfaceSpawnY(x, z) - 3);
    }
    const wx = Math.floor(x);
    const wz = Math.floor(z);
    const h = ensureSpawnParityColumnGenerated(seed, wx, wz);
    for (let y = WORLD_HEIGHT - 1; y >= WORLD_DEPTH; y--) {
        const id = toBetaBlockId(h.chunkManager.getBlock(wx, y, wz));
        if (id !== 0) return y;
    }
    return null;
}

function getBestKnownSurfaceTopY(x, z, options = {}) {
    const terrain = getTerrainData(x, z);
    const estimatedTop = Number.isFinite(terrain?.y) ? terrain.y : Number.NaN;
    const loadedTop = getTopTerrainYFromLoadedColumn(x, z);
    const cachedSpan = getSurfaceColumnCacheEntry(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    const cachedTop = cachedSpan && Number.isFinite(cachedSpan.maxTop) ? cachedSpan.maxTop : Number.NaN;
    let bestKnownTop = Number.isFinite(loadedTop)
        ? (Number.isFinite(estimatedTop) ? Math.max(estimatedTop, loadedTop) : loadedTop)
        : estimatedTop;
    if (Number.isFinite(cachedTop)) {
        bestKnownTop = Number.isFinite(bestKnownTop) ? Math.max(bestKnownTop, cachedTop) : cachedTop;
    }

    const allowParity = !!options.allowParity;
    if (allowParity && CURRENT_DIMENSION === 'OVERWORLD') {
        const seed = getCurrentWorldSeedString();
        if (seed) {
            const bx = Math.floor(x);
            const bz = Math.floor(z);
            const key = `${bx},${bz}`;
            let parityTop = surfaceTopParityCache.get(key);
            if (parityTop === undefined) {
                parityTop = getTopSolidYParity(seed, bx, bz, CURRENT_DIMENSION);
                surfaceTopParityCache.set(key, parityTop);
            }
            if (Number.isFinite(parityTop)) {
                bestKnownTop = Number.isFinite(bestKnownTop) ? Math.max(bestKnownTop, parityTop) : parityTop;
            }
        }
    }

    return Number.isFinite(bestKnownTop) ? bestKnownTop : (WORLD_DEPTH + 1);
}

function getNearbySurfaceReferenceY(x, z, options = {}) {
    const sampleRadius = Math.max(0, Math.floor(options.sampleRadius ?? 2));
    let bestTop = Number.NaN;
    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        for (let dz = -sampleRadius; dz <= sampleRadius; dz++) {
            const top = getBestKnownSurfaceTopY(x + dx, z + dz, options);
            if (!Number.isFinite(top)) continue;
            bestTop = Number.isFinite(bestTop) ? Math.max(bestTop, top) : top;
        }
    }
    const resolvedTop = Number.isFinite(bestTop) ? bestTop : getBestKnownSurfaceTopY(x, z, options);
    const surfaceY = resolvedTop + 3;
    return Math.min(WORLD_HEIGHT - 2, Math.max(WORLD_DEPTH + 3, surfaceY));
}

function getOriginalSurfaceChunkYSpanForColumn(cx, cz, minY, maxY) {
    const cachedSpan = getOriginalSurfaceColumnCacheEntry(cx, cz);
    if (cachedSpan && Number.isFinite(cachedSpan.minTop) && Number.isFinite(cachedSpan.maxTop)) {
        const cachedMinCy = clampChunkY(Math.floor(cachedSpan.minTop / CHUNK_SIZE), minY, maxY);
        return { minCy: cachedMinCy, maxCy: maxY };
    }
    return getEstimatedSurfaceChunkYSpanForColumn(cx, cz, minY, maxY);
}

function getNearbyOriginalSurfaceReferenceY(x, z, options = {}) {
    const sampleRadius = Math.max(0, Math.floor(options.sampleRadius ?? 2));
    let bestTop = Number.NaN;
    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        for (let dz = -sampleRadius; dz <= sampleRadius; dz++) {
            const sx = x + dx;
            const sz = z + dz;
            const cached = getOriginalSurfaceColumnCacheEntry(Math.floor(sx / CHUNK_SIZE), Math.floor(sz / CHUNK_SIZE));
            const topY = (cached && Number.isFinite(cached.maxTop))
                ? cached.maxTop
                : Number(getTerrainData(sx, sz)?.y);
            bestTop = Number.isFinite(bestTop) ? Math.max(bestTop, topY) : topY;
        }
    }
    const resolvedTop = Number.isFinite(bestTop) ? bestTop : getSurfaceSpawnY(x, z);
    const surfaceY = resolvedTop + 3;
    return Math.min(WORLD_HEIGHT - 2, Math.max(WORLD_DEPTH + 3, surfaceY));
}

function canCoordinateBeSpawnJacobo(seed, x, z, dimension = 'OVERWORLD') {
    const topId = getFirstUncoveredBlockParity(seed, x, z, dimension);
    if (dimension === 'NETHER') {
        return topId !== 0 && topId !== 7;
    }
    // WorldProvider.canCoordinateBeSpawn in Beta 1.7.3 base provider checks for sand.
    return topId === 12;
}

function getJacoboInitialSpawn(seed, dimension = 'OVERWORLD') {
    const rng = new JavaRandom(parseMinecraftSeed(seed));
    let sx = 0;
    let sz = 0;

    // World.getInitialSpawnLocation()
    let tries = 0;
    while (!canCoordinateBeSpawnJacobo(seed, sx, sz, dimension) && tries < 20000) {
        sx += rng.nextInt(64) - rng.nextInt(64);
        sz += rng.nextInt(64) - rng.nextInt(64);
        tries++;
    }

    // World.setSpawnLocation()
    let adjustTries = 0;
    while (getFirstUncoveredBlockParity(seed, sx, sz, dimension) === 0 && adjustTries < 20000) {
        sx += rng.nextInt(8) - rng.nextInt(8);
        sz += rng.nextInt(8) - rng.nextInt(8);
        adjustTries++;
    }

    return { x: sx, y: 64, z: sz, rx: 0, ry: 0 };
}

function getSurfaceSpawnY(x, z) {
    const bestKnownTop = getBestKnownSurfaceTopY(x, z, { allowParity: false });
    const surfaceY = bestKnownTop + 3;
    return Math.min(WORLD_HEIGHT - 2, Math.max(WORLD_DEPTH + 3, surfaceY));
}

function getWorldChunkYBounds() {
    return {
        min: Math.ceil(WORLD_DEPTH / CHUNK_SIZE),
        max: Math.floor((WORLD_HEIGHT - 1) / CHUNK_SIZE)
    };
}

function clampChunkY(cy, minY, maxY) {
    return Math.max(minY, Math.min(maxY, cy));
}

function getEstimatedSurfaceChunkYSpanForColumn(cx, cz, minY, maxY) {
    const wx = cx * CHUNK_SIZE;
    const wz = cz * CHUNK_SIZE;
    const samples = [
        getTerrainData(wx + 0, wz + 0).y,
        getTerrainData(wx + CHUNK_SIZE - 1, wz + 0).y,
        getTerrainData(wx + 0, wz + CHUNK_SIZE - 1).y,
        getTerrainData(wx + CHUNK_SIZE - 1, wz + CHUNK_SIZE - 1).y,
        getTerrainData(wx + CHUNK_SIZE * 0.5, wz + CHUNK_SIZE * 0.5).y
    ];
    const minH = Math.min(...samples);
    return {
        minCy: clampChunkY(Math.floor(minH / CHUNK_SIZE), minY, maxY),
        maxCy: maxY
    };
}

function getBaseSurfaceEnvelopeMinChunkYForColumn(cx, cz, minY, maxY) {
    const cachedSpan = getSurfaceColumnCacheEntry(cx, cz);
    if (cachedSpan && Number.isFinite(cachedSpan.minTop) && Number.isFinite(cachedSpan.maxTop)) {
        return clampChunkY(Math.floor(cachedSpan.minTop / CHUNK_SIZE), minY, maxY);
    }
    return getEstimatedSurfaceChunkYSpanForColumn(cx, cz, minY, maxY).minCy;
}

function chunkSliceHasHorizontalSurfaceExposure(cx, cy, cz) {
    if (!chunkManager.hasChunk(cx, cy, cz)) return false;
    const wx = cx * CHUNK_SIZE;
    const wy = cy * CHUNK_SIZE;
    const wz = cz * CHUNK_SIZE;
    const faces = [
        { dx: 1, dz: 0, x: CHUNK_SIZE - 1, zFor: (i) => i, nx: CHUNK_SIZE, nzFor: (i) => i },
        { dx: -1, dz: 0, x: 0, zFor: (i) => i, nx: -1, nzFor: (i) => i },
        { dx: 0, dz: 1, z: CHUNK_SIZE - 1, xFor: (i) => i, nz: CHUNK_SIZE, nxFor: (i) => i },
        { dx: 0, dz: -1, z: 0, xFor: (i) => i, nz: -1, nxFor: (i) => i }
    ];

    for (const face of faces) {
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            const y = wy + ly;
            for (let i = 0; i < CHUNK_SIZE; i++) {
                let x;
                let z;
                let nx;
                let nz;
                if (face.dx !== 0) {
                    x = wx + face.x;
                    z = wz + face.zFor(i);
                    nx = wx + face.nx;
                    nz = wz + face.nzFor(i);
                } else {
                    x = wx + face.xFor(i);
                    z = wz + face.z;
                    nx = wx + face.nxFor(i);
                    nz = wz + face.nz;
                }
                if (!isSolidForSurfaceEnvelopeAt(x, y, z)) continue;
                if (!isSolidForSurfaceEnvelopeAt(nx, y, nz)) return true;
            }
        }
    }
    return false;
}

function getPromotedSurfaceEnvelopeMinChunkYForColumn(cx, cz, baseMinCy, minY, maxY) {
    let promotedMinCy = baseMinCy;
    for (let cy = baseMinCy - 1; cy >= minY; cy--) {
        if (!chunkManager.hasChunk(cx, cy, cz)) break;
        let adjacentSurfaceAtThisSlice = false;
        const neighbors = [
            [1, 0], [-1, 0],
            [0, 1], [0, -1]
        ];
        for (const [dx, dz] of neighbors) {
            if (!chunkManager.hasChunk(cx + dx, cy, cz + dz)) continue;
            const neighborMinCy = getBaseSurfaceEnvelopeMinChunkYForColumn(cx + dx, cz + dz, minY, maxY);
            if (cy >= neighborMinCy) {
                adjacentSurfaceAtThisSlice = true;
                break;
            }
        }
        if (!adjacentSurfaceAtThisSlice) break;
        if (!chunkSliceHasHorizontalSurfaceExposure(cx, cy, cz)) break;
        promotedMinCy = cy;
    }
    return promotedMinCy;
}

function getSurfaceChunkYSpanForColumn(cx, cz, minY, maxY) {
    const memoKey = activePlannerSurfaceSpanMemo ? `${cx},${cz},${minY},${maxY}` : null;
    if (memoKey && activePlannerSurfaceSpanMemo.has(memoKey)) {
        return activePlannerSurfaceSpanMemo.get(memoKey);
    }
    const baseMinCy = getBaseSurfaceEnvelopeMinChunkYForColumn(cx, cz, minY, maxY);
    const cachedSpan = getSurfaceColumnCacheEntry(cx, cz);
    if (cachedSpan && Number.isFinite(cachedSpan.minTop) && Number.isFinite(cachedSpan.maxTop)) {
        const promotedMinCy = getPromotedSurfaceEnvelopeMinChunkYForColumn(cx, cz, baseMinCy, minY, maxY);
        // Surface-envelope model: once we know the lowest surface-forming slice
        // in a column, that slice and every chunk above it are surface-visible.
        // This is required for oceans / lakes where upper slices can be only
        // water/air and would otherwise be dropped.
        const result = { minCy: promotedMinCy, maxCy: maxY };
        if (memoKey) activePlannerSurfaceSpanMemo.set(memoKey, result);
        return result;
    }
    if (activePlannerSurfaceSpanMemo) {
        const estimatedSpan = getEstimatedSurfaceChunkYSpanForColumn(cx, cz, minY, maxY);
        if (memoKey) activePlannerSurfaceSpanMemo.set(memoKey, estimatedSpan);
        return estimatedSpan;
    }
    // Sample center + corners so steep terrain within a chunk column does not
    // fall outside a single loaded Y slice.
    const wx = cx * CHUNK_SIZE;
    const wz = cz * CHUNK_SIZE;
    const sampleSurfaceTop = (x, z) => getBestKnownSurfaceTopY(x, z, { allowParity: false });
    const h1 = sampleSurfaceTop(wx + 0, wz + 0);
    const h2 = sampleSurfaceTop(wx + CHUNK_SIZE - 1, wz + 0);
    const h3 = sampleSurfaceTop(wx + 0, wz + CHUNK_SIZE - 1);
    const h4 = sampleSurfaceTop(wx + CHUNK_SIZE - 1, wz + CHUNK_SIZE - 1);
    const h5 = sampleSurfaceTop(wx + CHUNK_SIZE * 0.5, wz + CHUNK_SIZE * 0.5);
    const minH = Math.min(h1, h2, h3, h4, h5);
    const estimatedSpan = getEstimatedSurfaceChunkYSpanForColumn(cx, cz, minY, maxY);
    const minCy = Math.min(clampChunkY(Math.floor(minH / CHUNK_SIZE), minY, maxY), estimatedSpan.minCy);
    const maxCy = maxY;
    const result = { minCy, maxCy };
    if (memoKey) activePlannerSurfaceSpanMemo.set(memoKey, result);
    return result;
}

function getMinimalSurfaceChunkYTargetsForColumn(cx, cz, minY, maxY, includeNeighbors = true) {
    const cachedSpan = getSurfaceColumnCacheEntry(cx, cz);
    const hasCachedSpan = !!(cachedSpan && Number.isFinite(cachedSpan.minTop) && Number.isFinite(cachedSpan.maxTop));
    const span = getSurfaceChunkYSpanForColumn(cx, cz, minY, maxY);
    const yTargets = new Set();

    // Load only the exact chunk interval intersecting this column's sampled surface.
    for (let cy = span.minCy; cy <= span.maxCy; cy++) {
        yTargets.add(cy);
    }

    // Only add adjacent slices when terrain shape or neighbor columns can expose
    // visible cliff faces / upper edges at some camera rotation.
    if (includeNeighbors) {
        const neighborOffsets = [
            [1, 0], [-1, 0],
            [0, 1], [0, -1]
        ];
        let needsBelow = false;
        let needsAbove = false;

        for (const [dx, dz] of neighborOffsets) {
            const nSpan = getSurfaceChunkYSpanForColumn(cx + dx, cz + dz, minY, maxY);
            if (nSpan.minCy < span.minCy) needsBelow = true;
            if (nSpan.maxCy > span.maxCy) needsAbove = true;
            if (needsBelow && needsAbove) break;
        }

        // If the local sampled span itself already crosses chunk boundaries,
        // allow one slice above/below to cover steep transitions.
        if (span.maxCy > span.minCy) {
            if (!hasCachedSpan) needsBelow = true;
            needsAbove = true;
        }

        // If we already have a cached surface span for this column, never
        // reintroduce deeper surface-mode slices below that known surface band.
        // The only exception is the separate near-player support bubble handled
        // by the core 3x3 logic in identifyNeededChunks().
        if (!hasCachedSpan && needsBelow) yTargets.add(clampChunkY(span.minCy - 1, minY, maxY));
        if (needsAbove) yTargets.add(clampChunkY(span.maxCy + 1, minY, maxY));
    }

    return Array.from(yTargets).sort((a, b) => a - b);
}

function getLoadYTargetsForColumn(cx, cz, playerCy, minY, maxY, includeNeighbors = true) {
    const span = getSurfaceChunkYSpanForColumn(cx, cz, minY, maxY);
    const surfaceCy = clampChunkY(Math.floor(((span.minCy + span.maxCy) * 0.5)), minY, maxY);
    if (SURFACE_ONLY_CHUNK_LOADING) {
        return getMinimalSurfaceChunkYTargetsForColumn(cx, cz, minY, maxY, includeNeighbors);
    }
    const yTargets = new Set([surfaceCy, playerCy]);
    if (includeNeighbors) {
        yTargets.add(clampChunkY(surfaceCy - 1, minY, maxY));
        yTargets.add(clampChunkY(surfaceCy + 1, minY, maxY));
        yTargets.add(clampChunkY(playerCy - 1, minY, maxY));
        yTargets.add(clampChunkY(playerCy + 1, minY, maxY));
    }
    return Array.from(yTargets, (cy) => clampChunkY(cy, minY, maxY));
}

function getSurfaceYTargetsForVisibleRing(cx, cz, ring, loadRad, minY, maxY, includeNeighbors = false) {
    const base = getMinimalSurfaceChunkYTargetsForColumn(cx, cz, minY, maxY, includeNeighbors);
    // Under the surface-envelope model, reducing far rings to only a few
    // representative slices is incorrect. A column can have only a tiny amount
    // of exposed terrain in a mid envelope slice (for example a single exposed
    // block) and that slice still needs to be requested at distance.
    return base;
}

function getLocal3DChunkYTargets(cx, cz, pcx, pcy, pcz, minY, maxY, includeNeighbors = true) {
    const dx = cx - pcx;
    const dz = cz - pcz;
    const dist2D = dx * dx + dz * dz;
    const surfaceSpan = getSurfaceChunkYSpanForColumn(cx, cz, minY, maxY);
    let verticalRadius = 1;
    if (dist2D <= 1) verticalRadius = 2;
    else if (dist2D <= 4) verticalRadius = 1;
    else verticalRadius = 0;

    const yTargets = new Set();
    const minTarget = clampChunkY(pcy - verticalRadius, minY, maxY);
    const maxTarget = clampChunkY(pcy + verticalRadius, minY, maxY);
    for (let cy = minTarget; cy <= maxTarget; cy++) {
        yTargets.add(cy);
    }

    // In deep shafts/caves, the immediate columns around the player can expose
    // a continuous wall all the way up toward the surface. Bridge that span so
    // vertical holes do not show void while the player is underground.
    if (dist2D <= 1) {
        const bridgeMin = Math.min(minTarget, clampChunkY(surfaceSpan.minCy - 1, minY, maxY));
        const bridgeMax = Math.max(maxTarget, clampChunkY(surfaceSpan.maxCy + 1, minY, maxY));
        for (let cy = bridgeMin; cy <= bridgeMax; cy++) {
            yTargets.add(cy);
        }
    } else if (dist2D <= 4) {
        yTargets.add(clampChunkY(surfaceSpan.minCy, minY, maxY));
        yTargets.add(clampChunkY(surfaceSpan.maxCy, minY, maxY));
    }

    if (includeNeighbors) {
        yTargets.add(clampChunkY(minTarget - 1, minY, maxY));
        yTargets.add(clampChunkY(maxTarget + 1, minY, maxY));
    }
    return Array.from(yTargets).sort((a, b) => a - b);
}

function isSurfaceLayerChunk(cx, cy, cz) {
    const { min, max } = getWorldChunkYBounds();
    const yTargets = getMinimalSurfaceChunkYTargetsForColumn(cx, cz, min, max, true);
    return yTargets.includes(cy);
}

function getLoadedSurfaceChunkCount() {
    let count = 0;
    for (const key of renderChunks.keys()) {
        const p = parseKey(key);
        if (isSurfaceLayerChunk(p.x, p.y, p.z)) count++;
    }
    return count;
}

function getEffectiveWarmCacheExtra(loadMode, nearMissingCount) {
    if (loadMode === CHUNK_LOAD_MODE_LOCAL_3D) return WARM_CACHE_RADIUS_EXTRA;
    return nearMissingCount >= 6 ? 0 : WARM_CACHE_RADIUS_EXTRA;
}

function shouldSuppressBackgroundCoreRender(cx, cy, cz) {
    if (!GAME_ACTIVE) return false;
    if (pendingSurfaceSpawn?.restoreSavedPosition) return false;
    const loadMode = getChunkLoadMode(camera.position.x, camera.position.y, camera.position.z);
    if (loadMode !== CHUNK_LOAD_MODE_SURFACE) return false;
    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
    if (Math.abs(cx - pcx) > 1 || Math.abs(cz - pcz) > 1) return false;
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const chunkLoadFocusY = getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z);
    const pcy = Math.floor(chunkLoadFocusY / CHUNK_SIZE);
    const yTargets = getLoadYTargetsForColumn(cx, cz, pcy, worldMinChunkY, worldMaxChunkY, true);
    return !yTargets.includes(cy);
}

function getChunkPlannerMetrics() {
    if (!GAME_ACTIVE) {
        return EMPTY_CHUNK_PLANNER_METRICS;
    }
    return cachedChunkPlannerMetrics;
}

function teleportPlayerToTopOfWorld(x, z) {
    camera.position.set(x, WORLD_HEIGHT - 2, z);
    renderCameraPosition.copy(camera.position);
    velocity.set(0, 0, 0);
    markPlannerDirty();
    refreshChunkPlannerIfNeeded(true);
    processChunkQueue();
}

function teleportToFarlands(direction) {
    if (!GAME_ACTIVE) return { ok: false, msg: 'Game is not active.' };
    const dir = String(direction || '').toLowerCase();
    const edge = FARLANDS_BORDER_COORD - FARLANDS_INSET_BLOCKS;
    let tx = Math.floor(camera.position.x);
    let tz = Math.floor(camera.position.z);
    if (dir === 'north') tz = -edge;
    else if (dir === 'south') tz = edge;
    else if (dir === 'east') tx = edge;
    else if (dir === 'west') tx = -edge;
    else return { ok: false, msg: 'Usage: /farlands <north|south|east|west>' };

    const eyeY = Math.min(WORLD_HEIGHT - 2, Math.max(WORLD_DEPTH + 3, getSurfaceSpawnY(tx, tz)));
    camera.position.set(tx + 0.5, eyeY, tz + 0.5);
    renderCameraPosition.copy(camera.position);
    velocity.set(0, 0, 0);
    canJumpRef.val = false;
    moveState.jump = false;
    requestedChunks.clear();
    geometryRefreshRequests.clear();
    clearPendingChunkTasks();
    chunkRetryCount.clear();
    markPlannerDirty();
    refreshChunkPlannerIfNeeded(true);
    processChunkQueue();
    return { ok: true, msg: `Teleported near Far Lands (${dir}) at ${tx}, ${tz}.` };
}

function teleportPlayerToEstimatedSurface(x, z, options = {}) {
    const preferUpOnly = !!options.preferUpOnly;
    const centerOnBlock = !!options.centerOnBlock;
    const surfaceOnlyPlacement = !!options.surfaceOnlyPlacement;
    const searchNearbyXZRadius = Math.max(0, Math.floor(options.searchNearbyXZRadius ?? 0));
    const targetX = centerOnBlock ? (Math.floor(x) + 0.5) : x;
    const targetZ = centerOnBlock ? (Math.floor(z) + 0.5) : z;
    const height = PLAYER_HEIGHT;
    const currentY = camera.position.y + (PLAYER_HEIGHT - PLAYER_EYE_HEIGHT);
    const candidatePositions = [{ x: targetX, z: targetZ }];
    if (searchNearbyXZRadius > 0) {
        const baseX = Math.floor(targetX) + 0.5;
        const baseZ = Math.floor(targetZ) + 0.5;
        for (let ring = 1; ring <= searchNearbyXZRadius; ring++) {
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dz = -ring; dz <= ring; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                    candidatePositions.push({ x: baseX + dx, z: baseZ + dz });
                }
            }
        }
    }

    let chosenX = targetX;
    let chosenZ = targetZ;
    let placedY = null;
    let fallbackYEstimate = null;
    let bestSurfaceCandidate = null;

    for (let candidateIndex = 0; candidateIndex < candidatePositions.length; candidateIndex++) {
        const candidate = candidatePositions[candidateIndex];
        const bx = Math.floor(candidate.x);
        const bz = Math.floor(candidate.z);
        const columnFullyLoaded = isEntireColumnLoaded(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE));
        const loadedTopSolidY = getTopSolidYFromLoadedColumn(bx, bz);
        const terrainY = Math.floor(getTerrainData(bx, bz).y);
        const seed = surfaceOnlyPlacement ? getCurrentWorldSeedString() : null;
        const parityTopY = (surfaceOnlyPlacement && seed && CURRENT_DIMENSION === 'OVERWORLD')
            ? getTopSolidYParity(seed, bx, bz, CURRENT_DIMENSION)
            : null;
        // A partially loaded column can report a cave roof as the "top" solid block.
        // Only trust loaded-column height when it is reasonably close to the terrain
        // surface estimate; otherwise prefer the terrain surface so new-world spawn
        // cannot settle inside caves.
        const useLoadedTop =
            Number.isFinite(loadedTopSolidY) &&
            (surfaceOnlyPlacement || columnFullyLoaded || Math.abs(loadedTopSolidY - terrainY) <= 3);
        const surfaceTopY = Number.isFinite(parityTopY)
            ? parityTopY
            : (useLoadedTop ? loadedTopSolidY : terrainY);
        const yEstimate = Math.max(
            WORLD_DEPTH + 4,
            Math.min(WORLD_HEIGHT - 2, surfaceTopY + 0.5 + height + 0.1)
        );
        if (fallbackYEstimate === null) fallbackYEstimate = yEstimate;

        if (surfaceOnlyPlacement && !Number.isFinite(loadedTopSolidY)) {
            continue;
        }

        if (surfaceOnlyPlacement) {
            const candidateY = Math.max(
                WORLD_DEPTH + 4,
                Math.min(WORLD_HEIGHT - 2, surfaceTopY + 0.5 + height + 0.1)
            );
            if (
                hasSolidSupportAt(candidate.x, candidateY, candidate.z) &&
                hasOpenHeadroomAt(candidate.x, candidateY, candidate.z, 4)
            ) {
                if (
                    !bestSurfaceCandidate ||
                    candidateY > bestSurfaceCandidate.y ||
                    (candidateY === bestSurfaceCandidate.y && candidateIndex < bestSurfaceCandidate.index)
                ) {
                    bestSurfaceCandidate = { x: candidate.x, z: candidate.z, y: candidateY, index: candidateIndex };
                }
            }
            continue;
        }

        for (let lift = 0; lift <= 16; lift++) {
            const y = Math.min(WORLD_HEIGHT - 2, yEstimate + lift);
            if (preferUpOnly && y < currentY + 0.25) continue;
            if (!hasSolidSupportAt(candidate.x, y, candidate.z)) continue;
            const spawnColumnClear = hasOpenHeadroomAt(candidate.x, y, candidate.z, 4);
            const fullCollisionClear = !checkCollision(candidate.x, y, candidate.z, chunkManager, height);
            if ((surfaceOnlyPlacement ? spawnColumnClear : (fullCollisionClear && spawnColumnClear))) {
                if (surfaceOnlyPlacement) {
                    if (
                        !bestSurfaceCandidate ||
                        y > bestSurfaceCandidate.y ||
                        (y === bestSurfaceCandidate.y && candidateIndex < bestSurfaceCandidate.index)
                    ) {
                        bestSurfaceCandidate = { x: candidate.x, z: candidate.z, y, index: candidateIndex };
                    }
                } else {
                    chosenX = candidate.x;
                    chosenZ = candidate.z;
                    placedY = y;
                }
                break;
            }
        }
        if (placedY !== null) break;

        for (let drop = 1; drop <= 64; drop++) {
            const y = Math.max(WORLD_DEPTH + 3, yEstimate - drop);
            if (preferUpOnly && y < currentY + 0.25) continue;
            if (!hasSolidSupportAt(candidate.x, y, candidate.z)) continue;
            if (!checkCollision(candidate.x, y, candidate.z, chunkManager, height) && hasOpenHeadroomAt(candidate.x, y, candidate.z, 4)) {
                chosenX = candidate.x;
                chosenZ = candidate.z;
                placedY = y;
                break;
            }
        }
        if (placedY !== null) break;
    }

    if (surfaceOnlyPlacement && bestSurfaceCandidate) {
        chosenX = bestSurfaceCandidate.x;
        chosenZ = bestSurfaceCandidate.z;
        placedY = bestSurfaceCandidate.y;
    }

    if (placedY === null) {
        const yEstimate = fallbackYEstimate ?? Math.max(WORLD_DEPTH + 4, Math.min(WORLD_HEIGHT - 2, getSurfaceSpawnY(targetX, targetZ)));
        placedY = preferUpOnly
            ? Math.min(WORLD_HEIGHT - 2, Math.max(currentY + 1.5, yEstimate))
            : yEstimate;
    }

    const eyeY = placedY - (PLAYER_HEIGHT - PLAYER_EYE_HEIGHT);
    camera.position.set(chosenX, eyeY, chosenZ);
    renderCameraPosition.copy(camera.position);
    velocity.set(0, 0, 0);
    canJumpRef.val = false;
    moveState.jump = false;
    identifyNeededChunks();
    processChunkQueue();
}

// Three.js Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, 65);

// Entities
const entityManager = new EntityManager(scene, {
    placeFallingBlock: (x, y, z, id, metadata = 0) => {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) {
            chunkManager.addChunk(cx, cy, cz);
        }
        chunkManager.setBlock(x, y, z, id);
        chunkManager.setMetadata(x, y, z, metadata);
        updateModBlock(x, y, z, id, metadata);
        if (chunkWorker) {
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata, immediate: true } });
        }
        requestChunkGeometryAt(x, y, z);
        if (typeof fallingBlockManager !== 'undefined' && fallingBlockManager) {
            fallingBlockManager.markDirty(x, y, z);
        }
        return true;
    }
});
const mobManager = new MobManager(scene, chunkManager, {
    spawnDrop: (x, y, z, id, vel = null, pickupDelay = 0.1, durability = null, options = null) => {
        entityManager.spawnDrop(x, y, z, id, vel, pickupDelay, durability, options);
    },
    setBlock: (x, y, z, id, metadata = 0) => {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) {
            chunkManager.addChunk(cx, cy, cz);
        }
        chunkManager.setBlock(x, y, z, id);
        chunkManager.setMetadata(x, y, z, metadata);
        updateModBlock(x, y, z, id, metadata);
        markRepeatersDirtyAround(x, y, z);
        if (typeof chunkWorker !== 'undefined' && chunkWorker) {
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata, immediate: true } });
        }
        requestChunkGeometryAt(x, y, z);
    },
    explodeAt: (x, y, z, radius = 3) => {
        if (!tntManager) return;
        tntManager.explodeAt(x, y, z, radius);
    },
    damagePlayer: (amount = 1, ctx = null) => {
        return damagePlayer(amount, ctx);
    },
    addItemToInventory: (id, count = 1, metadata = 0, kind = ITEM_STACK_KIND_ITEM) => {
        const ok = inventory.addItem(id, count, null, metadata, kind);
        if (ok) {
            refreshHotbar();
            scheduleSaveGame();
        }
        return ok;
    },
    playBowSound: (pitch = 1.0) => {
        playBowSound(pitch);
    },
    getDaylightFactor: () => {
        return getDayBrightness01(worldTimeTicks);
    },
    getDimension: () => CURRENT_DIMENSION,
    getBiomeAt: (x, z) => {
        if (CURRENT_DIMENSION !== 'OVERWORLD') return 'hell';
        const d = getTerrainData(Math.floor(x), Math.floor(z));
        return d?.biome || 'plains';
    },
    isSlimeChunk: (cx, cz) => {
        return isSlimeChunkAt(cx, cz, getCurrentWorldSeedString());
    },
    isChunkRenderable: (cx, cy, cz) => {
        return renderChunks.has(`${cx},${cy},${cz}`);
    }
});

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.rotation.order = 'YXZ';

let renderer = null;
let rendererInitFailed = false;
try {
    renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Keep the game canvas pinned to the viewport regardless of page-flow/CSS load timing.
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.zIndex = '0';
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.error('[WebGL] context lost');
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => {
        console.warn('[WebGL] context restored');
    });
    document.body.appendChild(renderer.domElement);
} catch (err) {
    rendererInitFailed = true;
    console.error('[WebGL] Renderer init failed:', err);
    const msg = document.createElement('div');
    msg.id = 'webgl-error-banner';
    msg.style.position = 'fixed';
    msg.style.left = '12px';
    msg.style.top = '12px';
    msg.style.zIndex = '99999';
    msg.style.background = 'rgba(0,0,0,0.85)';
    msg.style.color = '#fff';
    msg.style.padding = '10px 12px';
    msg.style.fontFamily = 'monospace';
    msg.style.fontSize = '12px';
    msg.textContent = 'WebGL failed to initialize. Close other GPU-heavy tabs/apps and hard-reload.';
    document.body.appendChild(msg);
}
if (renderer && renderer.domElement) {
    renderer.domElement.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Seed copy shortcut is menu-only; never run clipboard flow during gameplay.
        if (GAME_ACTIVE) return;
        const seed = getCurrentWorldSeedString();
        if (!seed) {
            addMessage('No loaded world seed found.');
            return;
        }
        await copySeedToClipboard(seed);
    });
}
// Ensure burn overlay never participates in page flow even if stale CSS is cached in production.
const burnOverlayEl = document.getElementById('player-fire-overlay');
if (burnOverlayEl) {
    burnOverlayEl.style.position = 'absolute';
    burnOverlayEl.style.left = '0';
    burnOverlayEl.style.right = '0';
    burnOverlayEl.style.bottom = '0';
    burnOverlayEl.style.pointerEvents = 'none';
}
const thirdPersonController = new ThirdPersonController(scene, chunkManager, textureLoader);

// --- Lighting Update for Voxels ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

function normalizeWorldTimeTicks(ticks) {
    const t = Math.floor(Number(ticks) || 0);
    return ((t % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
}

function calculateCelestialAngleBeta(worldTime, partialTicks = 1.0) {
    const time = normalizeWorldTimeTicks(worldTime);
    let v = (time + partialTicks) / DAY_TICKS - 0.25;
    if (v < 0) v += 1;
    if (v > 1) v -= 1;
    const original = v;
    v = 1.0 - (Math.cos(v * Math.PI) + 1.0) / 2.0;
    v = original + (v - original) / 3.0;
    return v;
}

function calculateSkylightSubtractedBeta(worldTime) {
    const angle = calculateCelestialAngleBeta(worldTime, 1.0);
    let v = 1.0 - (Math.cos(angle * Math.PI * 2.0) * 2.0 + 0.5);
    if (v < 0.0) v = 0.0;
    if (v > 1.0) v = 1.0;
    v = 1.0 - v;
    v = 1.0 - v;
    return Math.floor(v * 11.0);
}

function getDayBrightness01(ticks) {
    const skySub = calculateSkylightSubtractedBeta(ticks);
    return Math.max(0.0, Math.min(1.0, 1.0 - (skySub / 11.0)));
}

function applyWorldTimeVisuals() {
    if (CURRENT_DIMENSION === 'NETHER') return;

    const b = getDayBrightness01(worldTimeTicks);
    ambientLight.intensity = 0.15 + 0.65 * b;
    dirLight.intensity = 0.05 + 0.95 * b;

    const day = new THREE.Color(0x87CEEB);
    const night = new THREE.Color(0x0b1020);
    const sky = night.clone().lerp(day, b);

    scene.background = sky;
    if (scene.fog) scene.fog.color.copy(sky);
}

function setWorldTimeTicks(ticks) {
    worldTimeTicks = normalizeWorldTimeTicks(ticks);
    worldTimeCarry = 0;
    applyWorldTimeVisuals();
}

let controls;
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0,0);
const tempViewDirA = new THREE.Vector3();
const tempViewDirB = new THREE.Vector3();

// View-dependent occlusion: don't draw chunks entirely behind walls (low-res depth buffer)
const OCCLUSION_GRID_SIZE = 64;
const occlusionDepthBuffer = new Float32Array(OCCLUSION_GRID_SIZE * OCCLUSION_GRID_SIZE);
const occlusionCorners = [
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
];
const occlusionChunkList = [];

function updateChunkOcclusion() {
    if (!occlusionCullingEnabled) {
        for (const [, rc] of renderChunks) {
            const visible = rc.baseVisible !== false;
            for (const mesh of rc.meshes) mesh.visible = visible;
        }
        return;
    }
    // Keep current occlusion state stable while falling blocks are in flight.
    // This avoids transient chunk visibility popping that can hide falling sand/gravel.
    if (entityManager && entityManager.fallingBlocks && entityManager.fallingBlocks.length > 0) {
        return;
    }
    if (renderChunks.size === 0) return;
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    // Steep pitch causes degenerate screen coverage in the coarse occlusion raster pass,
    // which can spike CPU cost and stall frames. Disable occlusion in that case.
    if (Math.abs(viewDir.y) > 0.8) {
        for (const [, rc] of renderChunks) {
            const visible = rc.baseVisible !== false;
            for (const mesh of rc.meshes) mesh.visible = visible;
        }
        return;
    }
    const half = CHUNK_SIZE / 2;
    occlusionChunkList.length = 0;
    const cam = camera.position;
    for (const [key, rc] of renderChunks) {
        const p = parseKey(key);
        const dx = p.x * CHUNK_SIZE + half - cam.x;
        const dy = p.y * CHUNK_SIZE + half - cam.y;
        const dz = p.z * CHUNK_SIZE + half - cam.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        occlusionChunkList.push({ key, rc, dist });
    }
    occlusionChunkList.sort((a, b) => a.dist - b.dist);

    for (let i = 0; i < occlusionDepthBuffer.length; i++) occlusionDepthBuffer[i] = -1;

    for (const { key, rc } of occlusionChunkList) {
        const p = parseKey(key);
        const x0 = p.x * CHUNK_SIZE, y0 = p.y * CHUNK_SIZE, z0 = p.z * CHUNK_SIZE;
        const x1 = x0 + CHUNK_SIZE, y1 = y0 + CHUNK_SIZE, z1 = z0 + CHUNK_SIZE;
        occlusionCorners[0].set(x0, y0, z0); occlusionCorners[1].set(x1, y0, z0);
        occlusionCorners[2].set(x1, y1, z0); occlusionCorners[3].set(x0, y1, z0);
        occlusionCorners[4].set(x0, y0, z1); occlusionCorners[5].set(x1, y0, z1);
        occlusionCorners[6].set(x1, y1, z1); occlusionCorners[7].set(x0, y1, z1);

        let minZ = 1, maxZ = -1;
        let minGx = OCCLUSION_GRID_SIZE, maxGx = -1, minGy = OCCLUSION_GRID_SIZE, maxGy = -1;
        for (let i = 0; i < 8; i++) {
            occlusionCorners[i].project(camera);
            const z = occlusionCorners[i].z;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
            const gx = Math.floor((occlusionCorners[i].x + 1) * 0.5 * OCCLUSION_GRID_SIZE);
            const gy = Math.floor((1 - occlusionCorners[i].y) * 0.5 * OCCLUSION_GRID_SIZE);
            if (gx >= 0 && gx < OCCLUSION_GRID_SIZE && gy >= 0 && gy < OCCLUSION_GRID_SIZE) {
                if (gx < minGx) minGx = gx;
                if (gx > maxGx) maxGx = gx;
                if (gy < minGy) minGy = gy;
                if (gy > maxGy) maxGy = gy;
            }
        }
        minGx = Math.max(0, minGx);
        maxGx = Math.min(OCCLUSION_GRID_SIZE - 1, maxGx);
        minGy = Math.max(0, minGy);
        maxGy = Math.min(OCCLUSION_GRID_SIZE - 1, maxGy);

        let minDepth = 1;
        if (minGx <= maxGx && minGy <= maxGy) {
            for (let gy = minGy; gy <= maxGy; gy++) {
                for (let gx = minGx; gx <= maxGx; gx++) {
                    const d = occlusionDepthBuffer[gy * OCCLUSION_GRID_SIZE + gx];
                    if (d < minDepth) minDepth = d;
                }
            }
        }
        const occluded = (maxZ < minDepth);

        const visible = (rc.baseVisible !== false) && !occluded;
        for (const mesh of rc.meshes) mesh.visible = visible;

        if (visible) {
            for (let gy = minGy; gy <= maxGy; gy++) {
                for (let gx = minGx; gx <= maxGx; gx++) {
                    const idx = gy * OCCLUSION_GRID_SIZE + gx;
                    if (minZ < occlusionDepthBuffer[idx]) occlusionDepthBuffer[idx] = minZ;
                }
            }
        }
    }
}

// --- Selection Wireframe ---
const selectionGeo = new THREE.BoxGeometry(1, 1, 1);
const selectionMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
const selectionWireframe = new THREE.LineSegments(new THREE.EdgesGeometry(selectionGeo), selectionMat);
scene.add(selectionWireframe);
selectionWireframe.visible = false;
let targetBlock = null;

// --- Breaking Animation Overlay ---
const breakingGeo = new THREE.BoxGeometry(1, 1, 1);
const breakingMat = new THREE.MeshBasicMaterial({ 
    map: breakingTextures[0], 
    transparent: true, 
    depthTest: true, 
    depthWrite: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1, 
    polygonOffsetUnits: -1
});
const breakingMesh = new THREE.Mesh(breakingGeo, breakingMat);
breakingMesh.visible = false;
scene.add(breakingMesh);

const miningState = {
    isMining: false,
    progress: 0,
    targetKey: null
};

// --- Fluid Manager ---
// Collect all fluid updates from a tick, then send them all at once
// This ensures all updates are processed together before meshing
let fluidUpdatesThisTick = [];

const FALLING_BLOCK_IDS = new Set([9, 57]); // Sand, Gravel

function isFallingPassThroughId(id) {
    return id === 0 || id === 63 || id === 6 || id === 70 || id === 51 || id === 71;
}

class FallingBlockManager {
    constructor(chunkManager) {
        this.chunkManager = chunkManager;
        this.dirty = new Set();  // "x,y,z"
        this.scanAccum = 0;
        this.scanInterval = 0.25;
    }

    markDirty(x, y, z) {
        const bx = Math.floor(x);
        const by = Math.floor(y);
        const bz = Math.floor(z);
        this.dirty.add(`${bx},${by},${bz}`);
        this.dirty.add(`${bx},${by + 1},${bz}`); // support change can affect block above
    }

    isLoadedAt(x, y, z) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        return this.chunkManager.hasChunk(cx, cy, cz);
    }

    canFallThrough(x, y, z) {
        if (y < WORLD_DEPTH) return false;
        if (!this.isLoadedAt(x, y, z)) return false;
        const id = this.chunkManager.getBlock(x, y, z);
        return isFallingPassThroughId(id);
    }

    applyBlock(x, y, z, id, meta = 0) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        if (!this.chunkManager.hasChunk(cx, cy, cz)) {
            this.chunkManager.addChunk(cx, cy, cz);
        }
        this.chunkManager.setBlock(x, y, z, id);
        this.chunkManager.setMetadata(x, y, z, meta);
        updateModBlock(x, y, z, id, meta);
        if (chunkWorker) {
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: meta, immediate: true } });
        }
    }

    tryActivate(x, y, z) {
        if (y <= WORLD_DEPTH) return;
        if (!this.isLoadedAt(x, y, z) || !this.isLoadedAt(x, y - 1, z)) return;
        const id = this.chunkManager.getBlock(x, y, z);
        if (!FALLING_BLOCK_IDS.has(id)) return;
        if (!this.canFallThrough(x, y - 1, z)) return;
        const meta = this.chunkManager.getMetadata(x, y, z) || 0;
        const aoSnapshot = entityManager.captureFallingAOSnapshot(this.chunkManager, x, y, z);
        // Replace source block with air and spawn true falling entity.
        this.applyBlock(x, y, z, 0, 0);
        entityManager.spawnFallingBlock(x, y, z, id, meta, aoSnapshot);
        this.markDirty(x, y + 1, z);
    }

    processDirty(maxChecks = 192) {
        let checked = 0;
        for (const key of Array.from(this.dirty)) {
            this.dirty.delete(key);
            const p = parseKey(key);
            this.tryActivate(p.x, p.y, p.z);
            if (++checked >= maxChecks) break;
        }
    }

    scanAroundPlayer(pos) {
        const px = Math.floor(pos.x);
        const py = Math.floor(pos.y);
        const pz = Math.floor(pos.z);
        const rx = 3;
        const rz = 3;
        const minY = Math.max(WORLD_DEPTH + 1, py - 18);
        const maxY = Math.min(WORLD_HEIGHT - 2, py + 8);
        for (let x = px - rx; x <= px + rx; x++) {
            for (let z = pz - rz; z <= pz + rz; z++) {
                for (let y = maxY; y >= minY; y--) {
                    this.tryActivate(x, y, z);
                }
            }
        }
    }

    update(dt, cameraPos) {
        this.processDirty();
        this.scanAccum += dt;
        if (this.scanAccum >= this.scanInterval) {
            this.scanAccum = 0;
            this.scanAroundPlayer(cameraPos);
        }
    }
}

const fallingBlockManager = new FallingBlockManager(chunkManager);

const fluidManager = new FluidManager(chunkManager, (x, y, z, id, meta) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    
    if (!chunkManager.hasChunk(cx, cy, cz)) {
        chunkManager.addChunk(cx, cy, cz);
    }

    chunkManager.setBlock(x, y, z, id);
    chunkManager.setMetadata(x, y, z, meta);
    updateModBlock(x, y, z, id, meta);
    fallingBlockManager.markDirty(x, y, z);
    igniteTntForAdjacentIgnition(x, y, z, id);
    
    // Collect update to send in batch
    fluidUpdatesThisTick.push({ x, y, z, id, meta });
});

// --- Fire Manager ---
const fireManager = new FireManager(chunkManager, (x, y, z, id, meta) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    
    if (!chunkManager.hasChunk(cx, cy, cz)) {
        chunkManager.addChunk(cx, cy, cz);
    }

    chunkManager.setBlock(x, y, z, id);
    chunkManager.setMetadata(x, y, z, meta);
    updateModBlock(x, y, z, id, meta);
    fallingBlockManager.markDirty(x, y, z);
    chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: meta } });
    igniteTntForAdjacentIgnition(x, y, z, id);
    // applySetBlock already meshes and sends geometry immediately, so requestChunkGeometry is redundant
    // Removing it prevents race conditions with manual block placement
});

// --- Worker & Chunk Management ---

function requestChunkGeometryAt(x, y, z) {
    if (!chunkWorker) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    chunkWorker.postMessage({ type: 'requestChunkGeometry', data: { cx, cy, cz } });
}

function isTntIgnitionSourceId(id) {
    return id === 63 || isTorchId(id) || isLavaId(id);
}

function igniteTntForAdjacentIgnition(x, y, z, placedId) {
    if (!tntManager) return false;
    if (isTntId(placedId)) {
        const dirs = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];
        for (const [dx, dy, dz] of dirs) {
            const nid = chunkManager.getBlock(x + dx, y + dy, z + dz);
            if (isTntIgnitionSourceId(nid)) {
                return tntManager.igniteAt(x, y, z);
            }
        }
        return false;
    }
    if (isTntIgnitionSourceId(placedId)) {
        return tntManager.igniteNeighbors(x, y, z);
    }
    return false;
}

function queueChunkGeometryRefreshForBlock(x, y, z, chunkKeys) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    chunkKeys.add(`${cx},${cy},${cz}`);

    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (lx === 0) chunkKeys.add(`${cx - 1},${cy},${cz}`);
    if (lx === CHUNK_SIZE - 1) chunkKeys.add(`${cx + 1},${cy},${cz}`);
    if (ly === 0) chunkKeys.add(`${cx},${cy - 1},${cz}`);
    if (ly === CHUNK_SIZE - 1) chunkKeys.add(`${cx},${cy + 1},${cz}`);
    if (lz === 0) chunkKeys.add(`${cx},${cy},${cz - 1}`);
    if (lz === CHUNK_SIZE - 1) chunkKeys.add(`${cx},${cy},${cz + 1}`);
}

function applyBlockChangesAndSync(updates, options = {}) {
    if (!Array.isArray(updates) || updates.length === 0) return;
    const immediate = options.immediate !== false;
    const workerUpdates = [];
    const chunkKeys = new Set();
    const columnKeys = new Set();
    const dependentUpdateKeys = new Set();
    const railChangeByKey = new Map();
    const redstoneSourcesToCheckForTnt = [];

    for (const u of updates) {
        if (!u) continue;
        const x = Math.floor(u.x);
        const y = Math.floor(u.y);
        const z = Math.floor(u.z);
        const id = normalizeRuntimeTerrainId(u.id);
        const metadata = Number(u.metadata) || 0;
        const oldId = chunkManager.getBlock(x, y, z);
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) {
            chunkManager.addChunk(cx, cy, cz);
        }
        chunkManager.setBlock(x, y, z, id);
        chunkManager.setMetadata(x, y, z, metadata);
        updateModBlock(x, y, z, id, metadata);
        fallingBlockManager.markDirty(x, y, z);
        workerUpdates.push({ x, y, z, id, metadata });
        queueChunkGeometryRefreshForBlock(x, y, z, chunkKeys);
        columnKeys.add(getSurfaceColumnCacheKey(cx, cz));
        dependentUpdateKeys.add(`${x},${y},${z}`);
        railChangeByKey.set(`${x},${y},${z}`, { oldId, newId: id });
        // Any direct block change can alter wire/torch/repeater/piston power state.
        // Invalidate the full local redstone neighborhood immediately.
        markRepeatersDirtyAround(x, y, z);
        if (id === 76 || id === 94 || (isRedstoneWireId(id) && metadata > 0)) {
            redstoneSourcesToCheckForTnt.push({ x, y, z });
        }
    }

    if (chunkWorker) {
        if (workerUpdates.length === 1) {
            const u = workerUpdates[0];
            chunkWorker.postMessage({ type: 'setBlock', data: { ...u, immediate } });
        } else {
            chunkWorker.postMessage({ type: 'setBlockBatch', data: { updates: workerUpdates, immediate } });
        }
    }

    for (const key of chunkKeys) {
        const p = parseKey(key);
        requestChunkGeometryAt(p.x * CHUNK_SIZE, p.y * CHUNK_SIZE, p.z * CHUNK_SIZE);
    }
    for (const key of columnKeys) {
        const p = parseSurfaceColumnCacheKey(key);
        if (Number.isFinite(p.x) && Number.isFinite(p.z)) {
            updateSurfaceColumnCacheForChunkColumn(p.x, p.z);
        }
    }
    for (const key of dependentUpdateKeys) {
        const [x, y, z] = key.split(',').map(Number);
        const change = railChangeByKey.get(key);
        if (shouldUpdateRailsForBlockChange(change?.oldId, change?.newId)) {
            updateRailsAround(x, y, z, true);
        }
        updateDependentsAround(x, y, z, true);
    }
    for (const src of redstoneSourcesToCheckForTnt) {
        igniteAdjacentTntFromRedstoneSource(src.x, src.y, src.z);
    }

    if (CURRENT_WORLD_ID) {
        scheduleSaveGame();
    }
}

tntManager = new TNTManager(scene, chunkManager, {
    applyBlockChanges: (updates, options = {}) => applyBlockChangesAndSync(updates, options),
    spawnDrop: (x, y, z, id, vel = null, pickupDelay = 0.1, durability = null, options = null) => {
        entityManager.spawnDrop(x, y, z, id, vel, pickupDelay, durability, options);
    }
});

function updateChunkTaskPriority(task, pcx, pcy, pcz) {
    const dx = task.x - pcx;
    const dz = task.z - pcz;
    task.dist2D = dx * dx + dz * dz;
    task.dyAbs = Math.abs(task.y - pcy);
    task.urgency = Number.isFinite(task.urgency) ? task.urgency : 0;
}

function getChunkTaskKey(x, y, z) {
    return `${x},${y},${z}`;
}

function enqueuePendingChunkTask(task) {
    const key = getChunkTaskKey(task.x, task.y, task.z);
    if (pendingLoadQueueKeys.has(key)) return false;
    pendingLoadQueue.push(task);
    pendingLoadQueueKeys.add(key);
    pendingQueueNeedsSort = true;
    return true;
}

function dequeuePendingChunkTask() {
    const task = pendingLoadQueue.shift();
    if (!task) return null;
    pendingLoadQueueKeys.delete(getChunkTaskKey(task.x, task.y, task.z));
    return task;
}

function clearPendingChunkTasks() {
    pendingLoadQueue.length = 0;
    pendingLoadQueueKeys.clear();
    pendingQueueNeedsSort = false;
}

function rebuildPendingChunkTaskKeys() {
    pendingLoadQueueKeys.clear();
    for (const t of pendingLoadQueue) {
        pendingLoadQueueKeys.add(getChunkTaskKey(t.x, t.y, t.z));
    }
    pendingQueueNeedsSort = true;
}

function sortChunkTasksByPriority(a, b) {
    if (a.urgency !== b.urgency) return b.urgency - a.urgency;
    if (a.dist2D !== b.dist2D) return a.dist2D - b.dist2D;
    if (a.dyAbs !== b.dyAbs) return a.dyAbs - b.dyAbs;
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.z - b.z;
}

function enqueueChunkLoad(cx, cy, cz, urgency = null) {
    const key = getChunkTaskKey(cx, cy, cz);
    const localChunk = chunkManager.getChunk(cx, cy, cz);
    if (localChunk && localChunk.isGenerated) return;
    if (requestedChunks.has(key)) return;
    if (pendingLoadQueueKeys.has(key)) return;
    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcy = Math.floor(getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z) / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
    const task = { x: cx, y: cy, z: cz, dist2D: 0, dyAbs: 0 };
    if (Number.isFinite(Number(urgency))) task.urgency = Number(urgency);
    updateChunkTaskPriority(task, pcx, pcy, pcz);
    enqueuePendingChunkTask(task);
}

function requestChunkGeometryByCoords(cx, cy, cz) {
    if (!chunkWorker) return;
    chunkWorker.postMessage({ type: 'requestChunkGeometry', data: { cx, cy, cz } });
}

function canChunkExistJacobo(cx, cz, curChunkX, curChunkZ) {
    return (
        cx >= curChunkX - JACOBO_CHUNK_CACHE_RADIUS &&
        cz >= curChunkZ - JACOBO_CHUNK_CACHE_RADIUS &&
        cx <= curChunkX + JACOBO_CHUNK_CACHE_RADIUS &&
        cz <= curChunkZ + JACOBO_CHUNK_CACHE_RADIUS
    );
}

function requestColumnLoad(cx, cz) {
    if (!chunkWorker) return;
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const playerCy = Math.floor(getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z) / CHUNK_SIZE);
    const yTargets = getLoadYTargetsForColumn(cx, cz, playerCy, worldMinChunkY, worldMaxChunkY, true);
    for (const cy of yTargets) {
        enqueueChunkLoad(cx, cy, cz);
    }
}

function requestEntireColumnLoad(cx, cz) {
    if (!chunkWorker) return;
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    for (let cy = worldMinChunkY; cy <= worldMaxChunkY; cy++) {
        enqueueChunkLoad(cx, cy, cz);
    }
}

function requestEntireColumnsAround(cx, cz, radius = 1) {
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            requestEntireColumnLoad(cx + dx, cz + dz);
        }
    }
}

function getSpawnYTargetsForColumn(cx, cz) {
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const yTargets = new Set();
    const seed = getCurrentWorldSeedString();
    if (seed && CURRENT_DIMENSION === 'OVERWORLD') {
        const wx = cx * CHUNK_SIZE;
        const wz = cz * CHUNK_SIZE;
        const heights = [
            getTopSolidYParity(seed, wx + 0, wz + 0, CURRENT_DIMENSION),
            getTopSolidYParity(seed, wx + CHUNK_SIZE - 1, wz + 0, CURRENT_DIMENSION),
            getTopSolidYParity(seed, wx + 0, wz + CHUNK_SIZE - 1, CURRENT_DIMENSION),
            getTopSolidYParity(seed, wx + CHUNK_SIZE - 1, wz + CHUNK_SIZE - 1, CURRENT_DIMENSION),
            getTopSolidYParity(seed, wx + Math.floor(CHUNK_SIZE * 0.5), wz + Math.floor(CHUNK_SIZE * 0.5), CURRENT_DIMENSION)
        ].filter((v) => Number.isFinite(v));
        if (heights.length > 0) {
            const minTop = Math.min(...heights);
            const maxTop = Math.max(...heights);
            const minCy = clampChunkY(Math.floor(minTop / CHUNK_SIZE), worldMinChunkY, worldMaxChunkY);
            const maxCy = clampChunkY(Math.floor(maxTop / CHUNK_SIZE), worldMinChunkY, worldMaxChunkY);
            for (let cy = minCy; cy <= maxCy; cy++) {
                yTargets.add(cy);
            }
            yTargets.add(clampChunkY(maxCy + 1, worldMinChunkY, worldMaxChunkY));
            return Array.from(yTargets).sort((a, b) => a - b);
        }
    }

    const playerCy = Math.floor(getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z) / CHUNK_SIZE);
    const fallbackTargets = getLoadYTargetsForColumn(cx, cz, playerCy, worldMinChunkY, worldMaxChunkY, true);
    for (const cy of fallbackTargets) yTargets.add(cy);
    let maxTarget = worldMinChunkY;
    for (const cy of yTargets) {
        if (cy > maxTarget) maxTarget = cy;
    }
    yTargets.add(clampChunkY(maxTarget + 1, worldMinChunkY, worldMaxChunkY));
    return Array.from(yTargets).sort((a, b) => a - b);
}

function requestSpawnColumnLoad(cx, cz, x, z) {
    // Spawn should request the same near-surface slices we actually keep loaded.
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const tcx = cx + dx;
            const tcz = cz + dz;
            const yTargets = getSpawnYTargetsForColumn(tcx, tcz);
            for (const cy of yTargets) {
                enqueueChunkLoad(tcx, cy, tcz);
            }
        }
    }
}

function requestFullColumnsAround(cx, cz, radius = 1) {
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const playerCy = Math.floor(getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z) / CHUNK_SIZE);
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            const tcx = cx + dx;
            const tcz = cz + dz;
            const yTargets = getLoadYTargetsForColumn(tcx, tcz, playerCy, worldMinChunkY, worldMaxChunkY, true);
            for (const cy of yTargets) {
                enqueueChunkLoad(tcx, cy, tcz);
            }
        }
    }
}

function bootstrapLoadAroundPlayerOnce() {
    if (!chunkWorker) return;
    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const playerCy = Math.floor(getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z) / CHUNK_SIZE);
    // Guarantee center column can resolve collisions/spawn checks even in stale saved worlds.
    requestColumnLoad(pcx, pcz);

    const radius = Math.max(4, LOAD_RADIUS() + 2);
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            if (dx * dx + dz * dz > radius * radius) continue;
            const cx = pcx + dx;
            const cz = pcz + dz;
            if (!canChunkExistJacobo(cx, cz, pcx, pcz)) continue;
            const yTargets = getLoadYTargetsForColumn(cx, cz, playerCy, worldMinChunkY, worldMaxChunkY, true);
            for (const cy of yTargets) enqueueChunkLoad(cx, cy, cz);
        }
    }
}

function isColumnLoaded(cx, cz) {
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const playerCy = Math.floor(getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z) / CHUNK_SIZE);
    const yTargets = getLoadYTargetsForColumn(cx, cz, playerCy, worldMinChunkY, worldMaxChunkY, true);
    for (const cy of yTargets) {
        if (!chunkManager.hasChunk(cx, cy, cz)) return false;
    }
    return true;
}

function isEntireColumnLoaded(cx, cz) {
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    for (let cy = worldMinChunkY; cy <= worldMaxChunkY; cy++) {
        if (!chunkManager.hasChunk(cx, cy, cz)) return false;
    }
    return true;
}

function isSpawnColumnReady(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const yTargets = getSpawnYTargetsForColumn(cx + dx, cz + dz);
            for (const cy of yTargets) {
                if (!chunkManager.hasChunk(cx + dx, cy, cz + dz)) return false;
            }
        }
    }
    return true;
}

function getTopSolidYFromLoadedColumn(x, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const scanTop = WORLD_HEIGHT - 1;
    const scanBottom = WORLD_DEPTH;
    let sawLoaded = false;
    for (let y = scanTop; y >= scanBottom; y--) {
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) continue;
        sawLoaded = true;
        const id = chunkManager.getBlock(bx, y, bz);
        if (isSolidForSpawn(id)) return y;
    }
    return null;
}

function isTreeCanopyBlock(id) {
    return id === 17 || id === 18;
}

function getSurfaceClassificationModifiedOverride(x, y, z) {
    const idx = modifiedBlockIndexByPos.get(`${x},${y},${z}`);
    if (idx === undefined) return null;
    const mod = modifiedBlocks[idx];
    if (!mod) return null;
    return mod.id;
}

function isSolidForSurfaceEnvelope(id) {
    if (id === 0) return false;
    if (isFluidId(id)) return false;
    if (id === 20) return false;
    return true;
}

function isSolidForSurfaceEnvelopeAt(x, y, z) {
    const modifiedId = getSurfaceClassificationModifiedOverride(x, y, z);
    if (modifiedId !== null) {
        // Ignore player-placed solids and respect player-broken terrain.
        return false;
    }
    return isSolidForSurfaceEnvelope(chunkManager.getBlock(x, y, z));
}

function getLastFullSolidLayerYForLoadedChunkColumn(cx, cz) {
    const wx = cx * CHUNK_SIZE;
    const wz = cz * CHUNK_SIZE;
    const scanTop = WORLD_HEIGHT - 1;
    const scanBottom = WORLD_DEPTH;
    let sawLoaded = false;
    let lastFullY = null;

    for (let y = scanBottom; y <= scanTop; y++) {
        const cy = Math.floor(y / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) continue;
        sawLoaded = true;
        let full = true;
        for (let dx = 0; dx < CHUNK_SIZE && full; dx++) {
            for (let dz = 0; dz < CHUNK_SIZE; dz++) {
                if (!isSolidForSurfaceEnvelopeAt(wx + dx, y, wz + dz)) {
                    full = false;
                    break;
                }
            }
        }
        if (full) lastFullY = y;
    }

    return sawLoaded ? lastFullY : null;
}

function getTopSurfaceEnvelopeYFromLoadedColumn(x, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const scanTop = WORLD_HEIGHT - 1;
    const scanBottom = WORLD_DEPTH;
    let sawLoaded = false;
    for (let y = scanTop; y >= scanBottom; y--) {
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) continue;
        sawLoaded = true;
        if (isSolidForSurfaceEnvelopeAt(bx, y, bz)) return y;
    }
    return sawLoaded ? null : null;
}

function getTopTerrainYFromLoadedColumn(x, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const scanTop = WORLD_HEIGHT - 1;
    const scanBottom = WORLD_DEPTH;
    let sawLoaded = false;
    let fallbackTop = null;
    for (let y = scanTop; y >= scanBottom; y--) {
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) continue;
        sawLoaded = true;
        const id = chunkManager.getBlock(bx, y, bz);
        if (!isSolidForSpawn(id)) continue;
        if (fallbackTop == null) fallbackTop = y;
        if (isTreeCanopyBlock(id)) continue;
        return y;
    }
    return sawLoaded ? fallbackTop : null;
}

function initWorker(seed) {
    if (chunkWorker) chunkWorker.terminate();
    chunkWorker = new Worker(`./js/worker.js?v=${encodeURIComponent(ASSET_VERSION)}`, { type: 'module' });
    generatedSurfaceChunkKeys.clear();
    const canonicalMods = getCanonicalModifiedBlocksSnapshot();
    
    initTerrain(seed);
    const signature = getWorldgenSignature(seed);
    if (signature !== lastWorldgenSignature) {
        lastWorldgenSignature = signature;
        console.log('[worldgen-signature]', signature);
    }
    
    // UPDATED: Pass dimension state to worker
    chunkWorker.postMessage({
        type: 'init',
        data: { seed: seed, dimension: CURRENT_DIMENSION, modifiedBlocks: canonicalMods }
    });
    chunkWorker.postMessage({ type: 'chunkTraceControl', data: { enabled: chunkTraceEnabled } });

    chunkWorker.onmessage = (e) => {
        const { type, key, geometry, data, metadata, light, cx, cy, cz } = e.data;
        if (type === 'sampleLightResponse') {
            const reqId = e.data.requestId;
            const pending = workerSamplePending.get(reqId);
            if (pending) {
                workerSamplePending.delete(reqId);
                pending.resolve(e.data.sample || null);
            }
            return;
        }
        
        if (type === 'workerStats') {
            chunkStreamStats.workerLoadQueue = e.data.data?.loadQueue || 0;
            chunkStreamStats.workerSetBlockQueue = (e.data.data?.setBlockImmediate || 0) + (e.data.data?.setBlockNormal || 0);
            chunkStreamStats.dirtyMeshBacklog = e.data.data?.dirtyMeshing || 0;
            chunkStreamStats.workerOldestLoadMs = e.data.data?.oldestLoadMs || 0;
            return;
        }
        if (type === 'chunkTrace') {
            const d = e.data.data || {};
            pushChunkTraceEvent(d.event || 'unknown', d.cx, d.cy, d.cz, d.extra || null, 'worker');
            return;
        }

        // CRITICAL: Process geometry messages FIRST to ensure water visuals update immediately
        // This prevents visual lag by handling geometry updates before any other messages
        if (type === 'geometry') {
            const parts = key.split(',');
            const gcx = parseInt(parts[0], 10);
            const gcy = parseInt(parts[1], 10);
            const gcz = parseInt(parts[2], 10);
            const localChunk = chunkManager.getChunk(gcx, gcy, gcz);
            const hasGeneratedData = !!(localChunk && localChunk.isGenerated);

            // Never render geometry for chunks that don't have local chunkData yet.
            // This prevents "visible but non-collidable/unbreakable" blocks.
            if (!hasGeneratedData) {
                // Keep newest geometry and apply it once chunkData for this key arrives.
                // Avoid forcing extra loadChunk requests/remesh pressure.
                pendingGeometryByKey.set(key, geometry);
                return;
            }

            if (!renderChunks.has(key) && shouldSuppressBackgroundCoreRender(gcx, gcy, gcz)) {
                pendingGeometryByKey.delete(key);
                finalizeChunkRequest(key, 'main.geometry.suppressed');
                return;
            }

            if (!renderChunks.has(key)) {
                const rc = new RenderChunk(gcx, gcy, gcz, scene);
                renderChunks.set(key, rc);
            }
            const rc = renderChunks.get(key);
            
            // Always apply geometry immediately - the worker ensures it's the latest state by processing
            // all pending updates for a chunk before meshing, so we can trust it's current
            // Apply synchronously to prevent any visual lag behind hitbox
            rc.updateGeometry(geometry);
            const geometryAppliedAt = Date.now();
            geometryUpdateTimestamps.set(key, geometryAppliedAt);
            renderChunkLastNeededAt.set(key, geometryAppliedAt);
            for (const mesh of rc.meshes) mesh.visible = true;

            // Force immediate visibility update for water/lava to match hitbox
            // This ensures visuals appear instantly when geometry arrives

            // Only finalize on geometry if chunk data is already present locally
            // (e.g. geometry-only refresh). For fresh loads, wait for chunkData
            // so physics/raycast/collision can use populated chunkManager data.
            finalizeChunkRequest(key, 'main.geometry');
            return; // Exit early to skip other message processing
        }
        
        // CHANGED: Handle Explicit Chunk Errors from Worker
        if (type === 'chunkError') {
            const { key } = e.data;
            chunkStreamStats.errorTotal++;
            requestedChunks.delete(key);
            const retries = (chunkRetryCount.get(key) || 0) + 1;
            chunkRetryCount.set(key, retries);
            if (retries <= CHUNK_RETRY_MAX) {
                const p = parseKey(key);
                const alreadyQueued = pendingLoadQueueKeys.has(key);
                if (!alreadyQueued) {
                    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
                    const pcy = Math.floor(getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z) / CHUNK_SIZE);
                    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
                    const closeDx = p.x - pcx;
                    const closeDz = p.z - pcz;
                    const urgent = (closeDx * closeDx + closeDz * closeDz) <= 2 ? 2 : 1;
                    const task = { x: p.x, y: p.y, z: p.z, dist2D: 0, dyAbs: 0, urgency: urgent };
                    updateChunkTaskPriority(task, pcx, pcy, pcz);
                    enqueuePendingChunkTask(task);
                    pendingLoadQueue.sort(sortChunkTasksByPriority);
                    pendingQueueNeedsSort = false;
                }
                chunkStreamStats.retriedTotal++;
            } else {
                chunkRetryCount.delete(key);
            }
            processChunkQueue();
            return;
        }
        
        if (type === 'chunkData') {
            chunkManager.addChunkData(cx, cy, cz, data, metadata, light);
            const activeMods = getChunkModifications(cx, cy, cz);
            const hasActiveMods = activeMods.length > 0;
            if (!hasActiveMods) {
                updateOriginalSurfaceColumnCacheForChunkColumn(cx, cz);
            }
            if (activeMods.length > 0) {
                for (const mod of activeMods) {
                    chunkManager.setBlock(mod.x, mod.y, mod.z, mod.id);
                    if (mod.metadata !== undefined) {
                        chunkManager.setMetadata(mod.x, mod.y, mod.z, mod.metadata);
                    }
                }
            }
            updateSurfaceColumnCacheForChunkColumn(cx, cz);
            if (isSurfaceLayerChunk(cx, cy, cz)) {
                generatedSurfaceChunkKeys.add(key);
            }
            const pendingGeom = pendingGeometryByKey.get(key);
            if (pendingGeom && !hasActiveMods) {
                if (shouldSuppressBackgroundCoreRender(cx, cy, cz) && !renderChunks.has(key)) {
                    pendingGeometryByKey.delete(key);
                } else {
                    pendingGeometryByKey.delete(key);
                    if (!renderChunks.has(key)) {
                        const rc = new RenderChunk(cx, cy, cz, scene);
                        renderChunks.set(key, rc);
                    }
                    const rc = renderChunks.get(key);
                    rc.updateGeometry(pendingGeom);
                    const geometryAppliedAt = Date.now();
                    geometryUpdateTimestamps.set(key, geometryAppliedAt);
                    renderChunkLastNeededAt.set(key, geometryAppliedAt);
                    for (const mesh of rc.meshes) mesh.visible = true;
                }
            } else if (pendingGeom && hasActiveMods) {
                pendingGeometryByKey.delete(key);
                requestChunkGeometryByCoords(cx, cy, cz);
            } else if (hasActiveMods) {
                requestChunkGeometryByCoords(cx, cy, cz);
            }
            
            // Unblock streaming as soon as first response arrives for this request.
            finalizeChunkRequest(key, 'main.chunkData');
            
            processChunkQueue();
        }
    };
}

function requestWorkerLightSample(x, y, z, timeoutMs = 3000) {
    if (!chunkWorker) return Promise.resolve(null);
    const requestId = workerSampleRequestSeq++;
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (!workerSamplePending.has(requestId)) return;
            workerSamplePending.delete(requestId);
            resolve(null);
        }, timeoutMs);
        workerSamplePending.set(requestId, {
            resolve: (sample) => {
                clearTimeout(timer);
                resolve(sample);
            }
        });
        chunkWorker.postMessage({
            type: 'sampleLight',
            data: { requestId, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) }
        });
    });
}

function identifyNeededChunks() {
    if (!GAME_ACTIVE) return;
    const plannerStartedAt = performance.now();
    activePlannerSurfaceSpanMemo = new Map();
    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const chunkLoadFocusY = getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z);
    const pcy = Math.floor(chunkLoadFocusY / CHUNK_SIZE);
    const loadMode = getChunkLoadMode(camera.position.x, camera.position.y, camera.position.z);
    const neededKeys = new Set();
    const cacheKeys = new Set();
    const renderHoldKeys = new Set();
    const coreColumnKeys = new Set();
    const surfaceSupportColumnKeys = new Set();
    const explicitVisibleSurfaceKeys = new Set();
    const priorityKeys = new Set();
    const nearPriorityKeys = new Set();
    const holeNeighborCounts = new Map();
    const surfaceMinTargetByColumn = new Map();
    const getPlannedUrgency = (key) => {
        if (nearPriorityKeys.has(key)) return 3;
        if (priorityKeys.has(key)) return 2;
        return 1;
    };
    const surfaceCacheHitColumns = new Set();
    const surfaceFallbackColumns = new Set();
    const trackSurfaceColumnSource = (x, z) => {
        if (loadMode !== CHUNK_LOAD_MODE_SURFACE) return;
        const key = `${x},${z}`;
        if (surfaceCacheHitColumns.has(key) || surfaceFallbackColumns.has(key)) return;
        if (getSurfaceColumnCacheEntry(x, z)) {
            surfaceCacheHitColumns.add(key);
        } else {
            surfaceFallbackColumns.add(key);
        }
    };
    const rememberSurfaceTargets = (x, z, yTargets) => {
        if (loadMode !== CHUNK_LOAD_MODE_SURFACE) return;
        if (!Array.isArray(yTargets) || yTargets.length === 0) return;
        const key = `${x},${z}`;
        const minTarget = Math.min(...yTargets);
        const prev = surfaceMinTargetByColumn.get(key);
        if (!Number.isFinite(prev) || minTarget < prev) {
            surfaceMinTargetByColumn.set(key, minTarget);
        }
    };
    let plannerBucketMark = plannerStartedAt;

    // Re-request in-flight chunks that appear stuck.
    const now = Date.now();
    const workerQueueBacklog = Math.max(0, chunkStreamStats.workerLoadQueue || 0);
    const dynamicStuckChunkMs = 4000 + Math.min(12000, workerQueueBacklog * 150);
    for (const [key, time] of requestedChunks) {
        if (now - time > dynamicStuckChunkMs) {
            requestedChunks.delete(key);
            const p = parseKey(key);
            const localChunk = chunkManager.getChunk(p.x, p.y, p.z);
            if (localChunk && localChunk.isGenerated) {
                // Jacobo-like provideChunk behavior: if data already exists, only refresh render geometry.
                requestedChunks.set(key, now);
                requestChunkGeometryByCoords(p.x, p.y, p.z);
            } else {
                const alreadyQueued = pendingLoadQueueKeys.has(key);
                if (!alreadyQueued) {
                    const closeDx = p.x - pcx;
                    const closeDz = p.z - pcz;
                    const urgent = (closeDx * closeDx + closeDz * closeDz) <= 2 ? 2 : 1;
                    const task = { x: p.x, y: p.y, z: p.z, dist2D: 0, dyAbs: 0, urgency: urgent };
                    updateChunkTaskPriority(task, pcx, pcy, pcz);
                    enqueuePendingChunkTask(task);
                    chunkStreamStats.retriedTotal++;
                }
            }
        }
    }
    if (pendingLoadQueue.length > 0) pendingLoadQueue.sort(sortChunkTasksByPriority);
    const loadRad = LOAD_RADIUS();

    // Always keep a tight 3x3 core around player at active Y targets.
    // This is the highest-priority visible frontier and is also tracked for
    // starvation prevention logic below.
    for (let x = pcx - 1; x <= pcx + 1; x++) {
        for (let z = pcz - 1; z <= pcz + 1; z++) {
            if (!canChunkExistJacobo(x, z, pcx, pcz)) continue;
            if (loadMode === CHUNK_LOAD_MODE_SURFACE) trackSurfaceColumnSource(x, z);
            const yTargets = (loadMode === CHUNK_LOAD_MODE_LOCAL_3D)
                ? getLocal3DChunkYTargets(x, z, pcx, pcy, pcz, worldMinChunkY, worldMaxChunkY, true)
                : getLoadYTargetsForColumn(x, z, pcy, worldMinChunkY, worldMaxChunkY, true);
            rememberSurfaceTargets(x, z, yTargets);
            if (loadMode !== CHUNK_LOAD_MODE_LOCAL_3D) {
                const maxCoreY = yTargets.length > 0 ? Math.max(...yTargets) : worldMinChunkY;
                for (let y = worldMinChunkY; y <= maxCoreY; y++) {
                    const k = `${x},${y},${z}`;
                    neededKeys.add(k);
                    coreColumnKeys.add(k);
                }
            }
            for (const y of yTargets) {
                const k = `${x},${y},${z}`;
                neededKeys.add(k);
                coreColumnKeys.add(k);
                priorityKeys.add(k);
                nearPriorityKeys.add(k);
                explicitVisibleSurfaceKeys.add(k);
            }
        }
    }

    // In surface mode, keep a wider 7x7 support bubble loaded down to bedrock.
    // These slices exist to support nearby holes/shafts and stable collision,
    // but most of the deeper support slices are hidden unless they are also
    // part of the active visible frontier.
    if (loadMode !== CHUNK_LOAD_MODE_LOCAL_3D) {
        const supportRadius = Math.min(3, loadRad);
        for (let x = pcx - supportRadius; x <= pcx + supportRadius; x++) {
            for (let z = pcz - supportRadius; z <= pcz + supportRadius; z++) {
                if (Math.max(Math.abs(x - pcx), Math.abs(z - pcz)) > supportRadius) continue;
                if (!canChunkExistJacobo(x, z, pcx, pcz)) continue;
                trackSurfaceColumnSource(x, z);
                const yTargets = getLoadYTargetsForColumn(x, z, pcy, worldMinChunkY, worldMaxChunkY, true);
                rememberSurfaceTargets(x, z, yTargets);
                const maxSupportY = yTargets.length > 0 ? Math.max(...yTargets) : worldMinChunkY;
                for (let y = worldMinChunkY; y <= maxSupportY; y++) {
                    const k = `${x},${y},${z}`;
                    neededKeys.add(k);
                    surfaceSupportColumnKeys.add(k);
                }
            }
        }
    }
    let plannerNow = performance.now();
    profilePlannerBucket('targeting', plannerNow - plannerBucketMark);
    plannerBucketMark = plannerNow;
    // Build the visible shell in explicit rings from the player outward.
    // This makes the intended frontier ordering match the planner before queue sort.
    for (let ring = 0; ring <= loadRad; ring++) {
        for (let x = pcx - ring; x <= pcx + ring; x++) {
            for (let z = pcz - ring; z <= pcz + ring; z++) {
                const dx = x - pcx;
                const dz = z - pcz;
                const chebyshev = Math.max(Math.abs(dx), Math.abs(dz));
                if (chebyshev !== ring) continue;
                if (!canChunkExistJacobo(x, z, pcx, pcz)) continue;

                if (loadMode === CHUNK_LOAD_MODE_SURFACE && SURFACE_ONLY_CHUNK_LOADING) {
                    trackSurfaceColumnSource(x, z);
                    const yTargets = getSurfaceYTargetsForVisibleRing(x, z, ring, loadRad, worldMinChunkY, worldMaxChunkY, false);
                    rememberSurfaceTargets(x, z, yTargets);
                    for (const y of yTargets) {
                        const key = `${x},${y},${z}`;
                        neededKeys.add(key);
                        if (ring <= 2) nearPriorityKeys.add(key);
                        explicitVisibleSurfaceKeys.add(key);
                    }
                    continue;
                }

                if (loadMode === CHUNK_LOAD_MODE_LOCAL_3D) {
                    const yTargets = getLocal3DChunkYTargets(x, z, pcx, pcy, pcz, worldMinChunkY, worldMaxChunkY, false);
                    for (const y of yTargets) {
                        const key = `${x},${y},${z}`;
                        neededKeys.add(key);
                        if (ring <= 2) nearPriorityKeys.add(key);
                    }
                } else {
                    const wx1 = x * CHUNK_SIZE;
                    const wz1 = z * CHUNK_SIZE;
                    const h1 = getTerrainData(wx1, wz1).y;
                    const h2 = getTerrainData(wx1 + CHUNK_SIZE, wz1).y;
                    const h3 = getTerrainData(wx1, wz1 + CHUNK_SIZE).y;
                    const h4 = getTerrainData(wx1 + CHUNK_SIZE, wz1 + CHUNK_SIZE).y;
                    const h5 = getTerrainData(wx1 + CHUNK_SIZE / 2, wz1 + CHUNK_SIZE / 2).y;
                    const minH = Math.min(h1, h2, h3, h4, h5);
                    const maxH = Math.max(h1, h2, h3, h4, h5);
                    const minChunkY = Math.max(worldMinChunkY, Math.floor(minH / CHUNK_SIZE) - 1);
                    const maxChunkY = Math.min(pcy + 4, Math.floor(maxH / CHUNK_SIZE) + 2);
                    const MAX_VERTICAL_CHUNKS = 24;
                    const minChunkYCapped = Math.max(minChunkY, maxChunkY - MAX_VERTICAL_CHUNKS);

                    for (let y = minChunkYCapped; y <= maxChunkY; y++) {
                        const key = `${x},${y},${z}`;
                        neededKeys.add(key);
                        if (ring <= 2) nearPriorityKeys.add(key);
                    }
                }
            }
        }
    }

    let nearMissingForCache = 0;
    for (const key of nearPriorityKeys) {
        const p = parseKey(key);
        const c = chunkManager.getChunk(p.x, p.y, p.z);
        if (!c || !c.isGenerated) nearMissingForCache++;
    }
    const cacheRad = loadRad;
    const renderHoldRad = loadRad;

    // Strict fog-shell policy: do not keep or request chunks beyond the fog shell.
    // Cache and render-hold now match the visible shell exactly.
    for (let x = pcx - cacheRad; x <= pcx + cacheRad; x++) {
        for (let z = pcz - cacheRad; z <= pcz + cacheRad; z++) {
            const dx = x - pcx;
            const dz = z - pcz;
            if (Math.max(Math.abs(dx), Math.abs(dz)) > cacheRad) continue;
            if (!canChunkExistJacobo(x, z, pcx, pcz)) continue;
            if (loadMode === CHUNK_LOAD_MODE_SURFACE) trackSurfaceColumnSource(x, z);
            const ring = Math.max(Math.abs(dx), Math.abs(dz));
            const yTargets = (loadMode === CHUNK_LOAD_MODE_LOCAL_3D)
                ? getLocal3DChunkYTargets(x, z, pcx, pcy, pcz, worldMinChunkY, worldMaxChunkY, false)
                : getSurfaceYTargetsForVisibleRing(x, z, ring, cacheRad, worldMinChunkY, worldMaxChunkY, false);
            rememberSurfaceTargets(x, z, yTargets);
            for (const y of yTargets) {
                cacheKeys.add(`${x},${y},${z}`);
            }
        }
    }
    for (const key of neededKeys) cacheKeys.add(key);

    // Strict fog-shell policy: no extra render-only shell beyond visible range.
    if (loadMode === CHUNK_LOAD_MODE_SURFACE && SURFACE_ONLY_CHUNK_LOADING) {
        for (let ring = Math.max(0, loadRad + 1); ring <= renderHoldRad; ring++) {
            for (let x = pcx - ring; x <= pcx + ring; x++) {
                for (let z = pcz - ring; z <= pcz + ring; z++) {
                    const dx = x - pcx;
                    const dz = z - pcz;
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                    if (!canChunkExistJacobo(x, z, pcx, pcz)) continue;
                    trackSurfaceColumnSource(x, z);
                    const yTargets = getSurfaceYTargetsForVisibleRing(x, z, ring, renderHoldRad, worldMinChunkY, worldMaxChunkY, false);
                    for (const y of yTargets) {
                        renderHoldKeys.add(`${x},${y},${z}`);
                    }
                }
            }
        }
    }
    plannerNow = performance.now();
    profilePlannerBucket('cacheShell', plannerNow - plannerBucketMark);
    plannerBucketMark = plannerNow;

    for (const key of exposedChunks) {
        const p = parseKey(key);
        const dx = p.x - pcx;
        const dz = p.z - pcz;
        if (Math.max(Math.abs(dx), Math.abs(dz)) > loadRad) continue;
        if (!canChunkExistJacobo(p.x, p.z, pcx, pcz)) continue;

        if (loadMode === CHUNK_LOAD_MODE_LOCAL_3D) {
            const localYTargets = getLocal3DChunkYTargets(p.x, p.z, pcx, pcy, pcz, worldMinChunkY, worldMaxChunkY, true);
            if (!localYTargets.includes(p.y)) continue;
            neededKeys.add(key);
            continue;
        }

        trackSurfaceColumnSource(p.x, p.z);
        const surfaceYTargets = getLoadYTargetsForColumn(p.x, p.z, pcy, worldMinChunkY, worldMaxChunkY, true);
        rememberSurfaceTargets(p.x, p.z, surfaceYTargets);
        if (!surfaceYTargets.includes(p.y)) continue;
        neededKeys.add(key);
    }
    // While resolving initial spawn, keep the full spawn column requested so
    // surface placement can complete deterministically.
    if (pendingSurfaceSpawn) {
        const scx = Math.floor(pendingSurfaceSpawn.x / CHUNK_SIZE);
        const scz = Math.floor(pendingSurfaceSpawn.z / CHUNK_SIZE);
        if (canChunkExistJacobo(scx, scz, pcx, pcz)) {
            if (pendingSurfaceSpawn.restoreSavedPosition && Number.isFinite(Number(pendingSurfaceSpawn.savedY))) {
                const savedEyeY = Number(pendingSurfaceSpawn.savedY);
                const spcy = Math.floor(getPlayerColliderTopY(savedEyeY) / CHUNK_SIZE);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const cx = scx + dx;
                        const cz = scz + dz;
                        if (!canChunkExistJacobo(cx, cz, scx, scz)) continue;
                        const yTargets = getLocal3DChunkYTargets(cx, cz, scx, spcy, scz, worldMinChunkY, worldMaxChunkY, true);
                        for (const y of yTargets) {
                            const k = `${cx},${y},${cz}`;
                            neededKeys.add(k);
                            cacheKeys.add(k);
                            priorityKeys.add(k);
                            nearPriorityKeys.add(k);
                        }
                    }
                }
            } else {
                if (loadMode === CHUNK_LOAD_MODE_SURFACE) trackSurfaceColumnSource(scx, scz);
                const yTargets = (loadMode === CHUNK_LOAD_MODE_LOCAL_3D)
                    ? getLocal3DChunkYTargets(scx, scz, pcx, pcy, pcz, worldMinChunkY, worldMaxChunkY, true)
                    : getLoadYTargetsForColumn(scx, scz, pcy, worldMinChunkY, worldMaxChunkY, true);
                rememberSurfaceTargets(scx, scz, yTargets);
                for (const y of yTargets) {
                    const k = `${scx},${y},${scz}`;
                    neededKeys.add(k);
                    priorityKeys.add(k);
                }
            }
        }
    }

    // In underground mode, never thrash nearby rendered chunks. Keep a small
    // already-rendered bubble around the player visible/cached so a TNT shaft
    // or cave edge cannot blink while load mode or target sets settle.
    if (loadMode === CHUNK_LOAD_MODE_LOCAL_3D) {
        const keepDistSq = 9; // 3 chunks horizontally
        const keepDy = 3;
        for (const key of renderChunks.keys()) {
            const p = parseKey(key);
            const dx = p.x - pcx;
            const dz = p.z - pcz;
            if (dx * dx + dz * dz > keepDistSq) continue;
            if (Math.abs(p.y - pcy) > keepDy) continue;
            if (!canChunkExistJacobo(p.x, p.z, pcx, pcz)) continue;
            neededKeys.add(key);
            cacheKeys.add(key);
            if (dx * dx + dz * dz <= 2) {
                priorityKeys.add(key);
            }
        }
    }

    // Hole detector: if a missing chunk has at least 2 loaded side-neighbors,
    // force it back into needed set to recover side-by-side gaps.
    const holeDirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
    ];
    for (const key of renderChunks.keys()) {
        const p = parseKey(key);
        for (const [dx, dz] of holeDirs) {
            const nx = p.x + dx;
            const ny = p.y;
            const nz = p.z + dz;
            const nKey = `${nx},${ny},${nz}`;
            if (renderChunks.has(nKey)) continue;
            if (!canChunkExistJacobo(nx, nz, pcx, pcz)) continue;
            const rdx = nx - pcx;
            const rdz = nz - pcz;
            if (Math.max(Math.abs(rdx), Math.abs(rdz)) > loadRad) continue;
            const prev = holeNeighborCounts.get(nKey) || 0;
            holeNeighborCounts.set(nKey, prev + 1);
        }
    }
    for (const [key, count] of holeNeighborCounts) {
        if (count < 2) continue;
        neededKeys.add(key);
        priorityKeys.add(key);
    }

    // Ensure core nearby columns cannot be starved by unrelated in-flight work.
    let missingCoreCount = 0;
    for (const key of coreColumnKeys) {
        const p = parseKey(key);
        const c = chunkManager.getChunk(p.x, p.y, p.z);
        if (!c || !c.isGenerated) missingCoreCount++;
    }
    let missingNearCount = 0;
    for (const key of nearPriorityKeys) {
        const p = parseKey(key);
        const c = chunkManager.getChunk(p.x, p.y, p.z);
        if (!c || !c.isGenerated) missingNearCount++;
    }
    const maxInFlight = getMaxChunkInFlight();
    const nearReclaimThreshold = Math.max(10, Math.min(18, Math.max(12, missingNearCount + 8)));
    if (missingNearCount > 0 && requestedChunks.size >= nearReclaimThreshold) {
        const candidates = [];
        for (const [key, ts] of requestedChunks) {
            if (nearPriorityKeys.has(key)) continue;
            candidates.push({ key, ts });
        }
        candidates.sort((a, b) => a.ts - b.ts);
        const cancelBudget = Math.min(8, candidates.length);
        for (let i = 0; i < cancelBudget; i++) {
            const key = candidates[i].key;
            requestedChunks.delete(key);
            chunkRetryCount.delete(key);
            if (chunkWorker) {
                const p = parseKey(key);
                chunkWorker.postMessage({ type: 'cancelChunk', data: { cx: p.x, cy: p.y, cz: p.z } });
                pushChunkTraceEvent('canceled', p.x, p.y, p.z, { nearFrontier: true }, 'main.nearReclaim');
            }
        }
    }
    if (missingCoreCount > 0 && requestedChunks.size >= Math.max(8, maxInFlight - 2)) {
        const candidates = [];
        for (const [key, ts] of requestedChunks) {
            if (nearPriorityKeys.has(key)) continue;
            candidates.push({ key, ts });
        }
        candidates.sort((a, b) => a.ts - b.ts);
        const cancelBudget = Math.min(6, candidates.length);
        for (let i = 0; i < cancelBudget; i++) {
            const key = candidates[i].key;
            requestedChunks.delete(key);
            chunkRetryCount.delete(key);
            if (chunkWorker) {
                const p = parseKey(key);
                chunkWorker.postMessage({ type: 'cancelChunk', data: { cx: p.x, cy: p.y, cz: p.z } });
                pushChunkTraceEvent('canceled', p.x, p.y, p.z, { corePriority: true }, 'main.coreReclaim');
            }
        }
    }

    // Do NOT aggressively cancel in-flight requests in single-flight mode.
    // But do reclaim stale requests that are no longer needed so nearby columns
    // (including tree layers) cannot be starved indefinitely.
    const nowMs = Date.now();
    const STALE_OUT_OF_RANGE_MS = 3000;
    const OUT_OF_CACHE_RECLAIM_MS = 750;
    const allowStaleReclaim =
        requestedChunks.size > Math.floor(getMaxChunkInFlight() * 0.75) ||
        missingCoreCount > 0 ||
        missingNearCount > 0;
    for (const [key, ts] of requestedChunks) {
        if (!allowStaleReclaim) break;
        if (nearPriorityKeys.has(key)) continue;
        if (neededKeys.has(key)) continue;
        const outsideCache = !cacheKeys.has(key);
        const reclaimAfterMs = outsideCache
            ? OUT_OF_CACHE_RECLAIM_MS
            : (missingNearCount > 0 ? Math.min(STALE_OUT_OF_RANGE_MS, 1500) : STALE_OUT_OF_RANGE_MS);
        if (nowMs - ts < reclaimAfterMs) continue;
        requestedChunks.delete(key);
        chunkRetryCount.delete(key);
        if (chunkWorker) {
            const p = parseKey(key);
            chunkWorker.postMessage({ type: 'cancelChunk', data: { cx: p.x, cy: p.y, cz: p.z } });
            pushChunkTraceEvent('canceled', p.x, p.y, p.z, { stale: !outsideCache, outsideCache, nearPriority: missingNearCount > 0 }, 'main.reclaim');
        }
    }

    pendingLoadQueue = pendingLoadQueue.filter(t => {
        const key = `${t.x},${t.y},${t.z}`;
        return neededKeys.has(key) && !renderChunks.has(key) && !requestedChunks.has(key) && !geometryRefreshRequests.has(key);
    });
    rebuildPendingChunkTaskKeys();

    let pendingNearCount = pendingLoadQueue.reduce((count, t) => count + (((t.urgency || 0) >= 3) ? 1 : 0), 0);
    let pendingOuterCount = Math.max(0, pendingLoadQueue.length - pendingNearCount);
    const maxNearPending = Math.max(8, Math.min(24, missingNearCount + 8));
    const maxOuterPending = missingNearCount > 0 ? 8 : 24;
    const backgroundCoreCapActive = loadMode === CHUNK_LOAD_MODE_SURFACE && missingNearCount === 0;
    const isBackgroundCoreKey = (key) =>
        surfaceSupportColumnKeys.has(key) &&
        !priorityKeys.has(key) &&
        !explicitVisibleSurfaceKeys.has(key);
    let inFlightBackgroundCoreCount = 0;
    for (const key of requestedChunks.keys()) {
        if (isBackgroundCoreKey(key)) inFlightBackgroundCoreCount++;
    }
    let pendingBackgroundCoreCount = 0;
    for (const t of pendingLoadQueue) {
        const key = `${t.x},${t.y},${t.z}`;
        if (isBackgroundCoreKey(key)) pendingBackgroundCoreCount++;
    }
    const maxBackgroundCoreInFlight = 2;
    const maxBackgroundCorePending = 2;

    for (const key of neededKeys) {
        if (renderChunks.has(key)) continue;
        if (requestedChunks.has(key)) continue;
        if (geometryRefreshRequests.has(key)) continue;
        if (pendingLoadQueueKeys.has(key)) continue;
        const backgroundCoreKey = backgroundCoreCapActive && isBackgroundCoreKey(key);
        if (backgroundCoreKey) {
            if (inFlightBackgroundCoreCount >= maxBackgroundCoreInFlight) continue;
            if (pendingBackgroundCoreCount >= maxBackgroundCorePending) continue;
        }
        const p = parseKey(key);
        const existingChunk = chunkManager.getChunk(p.x, p.y, p.z);
        if (existingChunk && existingChunk.isGenerated) {
            if (backgroundCoreKey) {
                continue;
            }
            // Data exists locally: provide chunk by requesting geometry only.
            geometryRefreshRequests.set(key, Date.now());
            requestChunkGeometryByCoords(p.x, p.y, p.z);
            continue;
        }
        const task = {
            x: p.x,
            y: p.y,
            z: p.z,
            dist2D: 0,
            dyAbs: 0,
            urgency: getPlannedUrgency(key)
        };
        if (task.urgency >= 3) {
            if (pendingNearCount >= maxNearPending) continue;
        } else if (pendingOuterCount >= maxOuterPending) {
            continue;
        }
        updateChunkTaskPriority(task, pcx, pcy, pcz);
        enqueuePendingChunkTask(task);
        if (task.urgency >= 3) pendingNearCount++;
        else pendingOuterCount++;
        if (backgroundCoreKey) pendingBackgroundCoreCount++;
    }
    for (const t of pendingLoadQueue) {
        const key = `${t.x},${t.y},${t.z}`;
        t.urgency = getPlannedUrgency(key);
        updateChunkTaskPriority(t, pcx, pcy, pcz);
    }
    pendingLoadQueue.sort(sortChunkTasksByPriority);
    pendingQueueNeedsSort = false;
    lastPendingQueueSortMs = performance.now();
    lastSortChunkX = pcx;
    lastSortChunkY = pcy;
    lastSortChunkZ = pcz;
    if (pendingLoadQueue.length > chunkStreamStats.pendingPeak) {
        chunkStreamStats.pendingPeak = pendingLoadQueue.length;
    }
    plannerNow = performance.now();
    profilePlannerBucket('queue', plannerNow - plannerBucketMark);
    plannerBucketMark = plannerNow;

    // Outside visible set but inside warm cache: keep render geometry resident,
    // just hide it. This avoids immediate geometry churn / +1 -1 loaded oscillation.
    // Outside warm cache: keep a short grace period before fully evicting so
    // crossing chunk boundaries does not immediately drop resident chunk count.
    const hiddenCacheCandidates = [];
    for (const [key, rc] of renderChunks) {
        const p = parseKey(key);
        let keepRenderedForSurfaceShell = false;
        if (loadMode === CHUNK_LOAD_MODE_SURFACE && SURFACE_ONLY_CHUNK_LOADING) {
            const dx = p.x - pcx;
            const dz = p.z - pcz;
            if (Math.max(Math.abs(dx), Math.abs(dz)) <= renderHoldRad && canChunkExistJacobo(p.x, p.z, pcx, pcz)) {
                const surfaceSpan = getSurfaceChunkYSpanForColumn(p.x, p.z, worldMinChunkY, worldMaxChunkY);
                const minKeepCy = Math.max(worldMinChunkY, surfaceSpan.minCy - 1);
                const maxKeepCy = Math.min(worldMaxChunkY, surfaceSpan.maxCy + 1);
                if (p.y >= minKeepCy && p.y <= maxKeepCy) {
                    keepRenderedForSurfaceShell = true;
                }
            }
        }
        if (neededKeys.has(key)) {
            renderChunkLastNeededAt.set(key, nowMs);
            const backgroundSupportVisible = !isBackgroundCoreKey(key);
            rc.baseVisible = backgroundSupportVisible;
            if (rc && rc.meshes) {
                for (const mesh of rc.meshes) mesh.visible = backgroundSupportVisible;
            }
            continue;
        }
        if (keepRenderedForSurfaceShell) {
            renderChunkLastNeededAt.set(key, nowMs);
            rc.baseVisible = true;
            if (rc && rc.meshes) {
                for (const mesh of rc.meshes) mesh.visible = true;
            }
            continue;
        }
        if (cacheKeys.has(key) && !renderHoldKeys.has(key)) {
            renderChunkLastNeededAt.set(key, nowMs);
            rc.baseVisible = false;
            if (rc && rc.meshes) {
                for (const mesh of rc.meshes) mesh.visible = false;
            }
            hiddenCacheCandidates.push([key, rc]);
            continue;
        }
        if (renderHoldKeys.has(key)) {
            renderChunkLastNeededAt.set(key, nowMs);
            rc.baseVisible = true;
            if (rc && rc.meshes) {
                for (const mesh of rc.meshes) mesh.visible = true;
            }
            continue;
        }
        let forceCullDeepSurface = false;
        if (
            loadMode === CHUNK_LOAD_MODE_SURFACE &&
            SURFACE_ONLY_CHUNK_LOADING &&
            (Math.abs(p.x - pcx) > 1 || Math.abs(p.z - pcz) > 1)
        ) {
            const columnKey = `${p.x},${p.z}`;
            let minSurfaceTarget = surfaceMinTargetByColumn.get(columnKey);
            if (!Number.isFinite(minSurfaceTarget)) {
                const fallbackTargets = getLoadYTargetsForColumn(p.x, p.z, pcy, worldMinChunkY, worldMaxChunkY, true);
                rememberSurfaceTargets(p.x, p.z, fallbackTargets);
                minSurfaceTarget = surfaceMinTargetByColumn.get(columnKey);
            }
            if (Number.isFinite(minSurfaceTarget) && p.y < minSurfaceTarget) {
                forceCullDeepSurface = true;
            }
        }
        const lastNeededAt = renderChunkLastNeededAt.get(key) || 0;
        if (!forceCullDeepSurface && (nowMs - lastNeededAt) < OUTSIDE_CACHE_EVICTION_MS && cacheKeys.has(key)) {
            rc.baseVisible = false;
            if (rc && rc.meshes) {
                for (const mesh of rc.meshes) mesh.visible = false;
            }
            continue;
        }
        rc.dispose();
        renderChunks.delete(key);
        renderChunkLastNeededAt.delete(key);
        if (!cacheKeys.has(key)) {
            requestedChunks.delete(key);
            chunkProvidedTraceSeen.delete(key);
            chunkRequestCompletionSeen.delete(key);
            pushChunkTraceEvent('unloaded', p.x, p.y, p.z, { reason: 'outside_cache' }, 'main.unload');
            chunkManager.removeChunk(p.x, p.y, p.z);
            if (chunkWorker) chunkWorker.postMessage({ type: 'freeChunk', data: { cx: p.x, cy: p.y, cz: p.z } });
        } else {
            pushChunkTraceEvent('unloaded', p.x, p.y, p.z, { reason: 'outside_visible_kept_cached' }, 'main.unload');
        }
    }
    forceRenderDistanceTightCull = false;
    let missingVisibleForTrim = 0;
    for (const key of neededKeys) {
        if (!renderChunks.has(key)) missingVisibleForTrim++;
    }
    let missingNearForTrim = 0;
    for (const key of nearPriorityKeys) {
        if (neededKeys.has(key) && !renderChunks.has(key)) missingNearForTrim++;
    }
    const hiddenBudgetBase = Math.max(16, Math.min(48, Math.max(0, cacheKeys.size - neededKeys.size) + 8));
    let hiddenBudget = loadMode === CHUNK_LOAD_MODE_LOCAL_3D ? Math.max(hiddenBudgetBase, 32) : hiddenBudgetBase;
    if (loadMode === CHUNK_LOAD_MODE_SURFACE) {
        if (missingNearForTrim > 0) {
            hiddenBudget = Math.min(hiddenBudget, 24);
        } else if (missingVisibleForTrim === 0) {
            hiddenBudget = Math.min(hiddenBudget, 20);
        }
    }
      if (hiddenCacheCandidates.length > hiddenBudget) {
          hiddenCacheCandidates.sort((a, b) => {
              const aAge = geometryUpdateTimestamps.get(a[0]) || 0;
            const bAge = geometryUpdateTimestamps.get(b[0]) || 0;
            return aAge - bAge;
        });
        const trimCount = hiddenCacheCandidates.length - hiddenBudget;
        for (let i = 0; i < trimCount; i++) {
            const [key, rc] = hiddenCacheCandidates[i];
            if (!renderChunks.has(key)) continue;
            const p = parseKey(key);
            rc.dispose();
            renderChunks.delete(key);
            renderChunkLastNeededAt.delete(key);
              pushChunkTraceEvent('unloaded', p.x, p.y, p.z, { reason: 'cache_render_trim' }, 'main.unload');
          }
      }

      const visibleTargetChunks = neededKeys.size;
      const cacheTargetChunks = cacheKeys.size;
      const nearVisibleTargetChunks = nearPriorityKeys.size;
      const visibleColumns = new Set();
      for (const key of neededKeys) {
          const firstSep = key.indexOf(',');
          const lastSep = key.lastIndexOf(',');
          visibleColumns.add(`${key.slice(0, firstSep)},${key.slice(lastSep + 1)}`);
      }
      const visibleColumnsCount = visibleColumns.size;
      const visibleLoadedChunks = visibleTargetChunks - missingVisibleForTrim;
      const nearVisibleLoadedChunks = nearVisibleTargetChunks - missingNearForTrim;
      cachedChunkPlannerMetrics = {
          loadMode,
          visibleTargetChunks,
          cacheTargetChunks,
          nearVisibleTargetChunks,
          nearVisibleLoadedChunks,
          nearVisibleMissingChunks: missingNearForTrim,
          visibleColumns: visibleColumnsCount,
          avgVisibleYSlicesPerColumn: visibleColumnsCount > 0 ? (visibleTargetChunks / visibleColumnsCount) : 0,
          visibleMissingChunks: missingVisibleForTrim,
          visibleLoadedChunks,
          surfaceCacheColumnsUsed: surfaceCacheHitColumns.size,
          surfaceFallbackColumnsUsed: surfaceFallbackColumns.size
      };
      plannerNow = performance.now();
      profilePlannerBucket('visibility', plannerNow - plannerBucketMark);
      
     scene.fog.near = (RENDER_DISTANCE - 1) * CHUNK_SIZE;
     scene.fog.far = (RENDER_DISTANCE + 1) * CHUNK_SIZE;
     activePlannerSurfaceSpanMemo = null;
}

// Send all pending chunk loads. Worker chooses which to load next by current distance to player.
function processChunkQueue() {
    if (!chunkWorker || pendingLoadQueue.length === 0) return;
    if (Date.now() < playerEditPriorityUntil) return;
    const nowPerf = performance.now();
    if (nowPerf - lastChunkDispatchMs < CHUNK_DISPATCH_INTERVAL_MS) return;
    let maxDispatch = getMaxChunkDispatchPerCall();
    let dispatched = 0;
    const planner = getChunkPlannerMetrics();
    const residentChunkCount = renderChunks.size;
    const residentOverBudget = residentChunkCount - planner.cacheTargetChunks;
    const nearVisiblePressure = planner.nearVisibleMissingChunks;
    const workerBacklog = Math.max(0, chunkStreamStats.workerLoadQueue || 0);
    lastChunkDispatchMs = nowPerf;
    if (nearVisiblePressure > 0) {
        const reserve = Math.min(20, Math.max(6, nearVisiblePressure));
        maxDispatch = Math.max(maxDispatch, reserve);
        if (workerBacklog >= 18) {
            maxDispatch = Math.min(maxDispatch, 2);
        } else if (workerBacklog >= 12) {
            maxDispatch = Math.min(maxDispatch, 4);
        }
    }
    if (residentOverBudget > 8) {
        if (nearVisiblePressure <= 2 && planner.visibleMissingChunks <= 8) {
            maxDispatch = Math.min(maxDispatch, 4);
        } else if (nearVisiblePressure <= 6) {
            maxDispatch = Math.min(maxDispatch, 8);
        }
    }
    if (pendingLoadQueue.length > 1) {
        const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
        const pcy = Math.floor(getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z) / CHUNK_SIZE);
        const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
        const chunkChanged = (pcx !== lastSortChunkX) || (pcy !== lastSortChunkY) || (pcz !== lastSortChunkZ);
        const SORT_THROTTLE_MS = 80;
        const shouldResort = pendingQueueNeedsSort || chunkChanged || (nowPerf - lastPendingQueueSortMs >= SORT_THROTTLE_MS);
        if (shouldResort) {
            for (const t of pendingLoadQueue) {
                updateChunkTaskPriority(t, pcx, pcy, pcz);
            }
            pendingLoadQueue.sort(sortChunkTasksByPriority);
            pendingQueueNeedsSort = false;
            lastPendingQueueSortMs = nowPerf;
            lastSortChunkX = pcx;
            lastSortChunkY = pcy;
            lastSortChunkZ = pcz;
        }
    }
    const nearestTask = pendingLoadQueue[0];
    const frontierDist2D = nearestTask ? nearestTask.dist2D : Infinity;
    const frontierUrgency = nearestTask ? (nearestTask.urgency || 0) : 0;
    if (nearVisiblePressure > 0 && frontierUrgency < 3) {
        maxDispatch = Math.min(maxDispatch, 2);
    }
    // If the active frontier contains urgent visible-gap work, spend more of the
    // current dispatch budget on that exact frontier and avoid mixing lower-priority
    // work into the same cycle.
    if (frontierUrgency >= 2) {
        maxDispatch = Math.max(maxDispatch, Math.min(96, getMaxChunkInFlight()));
    }
    const batchChunks = [];
    const inFlightCap = nearVisiblePressure > 0
        ? Math.min(getMaxChunkInFlight(), Math.max(18, Math.min(24, nearVisiblePressure + 12)))
        : getMaxChunkInFlight();
    while (pendingLoadQueue.length > 0 && dispatched < maxDispatch) {
        if (requestedChunks.size >= inFlightCap) break;
        const nextTask = pendingLoadQueue[0];
        if (!nextTask) break;
        // Single frontier / single batch: only dispatch the nearest currently
        // missing frontier this cycle. The active frontier is defined by both
        // priority and horizontal ring distance. Outer rings and lower-priority
        // work wait until the closer / more urgent frontier has been exhausted.
        if ((nextTask.urgency || 0) !== frontierUrgency) break;
        if (nextTask.dist2D !== frontierDist2D) break;
        const t = dequeuePendingChunkTask();
        if (!t) break;
        const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
        const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
        if (!canChunkExistJacobo(t.x, t.z, pcx, pcz)) continue;
        const key = `${t.x},${t.y},${t.z}`;
        if (requestedChunks.has(key)) continue;

        requestedChunks.set(key, Date.now());
        chunkRequestCompletionSeen.delete(key);
        pushChunkTraceEvent('requested', t.x, t.y, t.z, null, 'main.dispatch');
        const chunkMods = getChunkModifications(t.x, t.y, t.z);
        batchChunks.push({
            cx: t.x,
            cy: t.y,
            cz: t.z,
            modifications: chunkMods
        });
        dispatched++;
    }
    if (batchChunks.length > 0) {
        chunkWorker.postMessage({
            type: 'loadChunkBatch',
            data: {
                chunks: batchChunks,
                player: { x: camera.position.x, y: getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z), z: camera.position.z }
            }
        });
    }
    if (dispatched > 0) chunkStreamStats.dispatchedTotal += dispatched;
    if (requestedChunks.size > chunkStreamStats.inFlightPeak) {
        chunkStreamStats.inFlightPeak = requestedChunks.size;
    }
}

// --- DIMENSION & PORTAL LOGIC ---

function capturePortalStructure(startX, startY, startZ) {
    const structure = [];
    const queue = [];
    const visited = new Set();

    // Find a portal block to start. Check radius 2 around player.
    let root = null;
    const r = 2;
    for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dz = -r; dz <= r; dz++) {
                const tx = startX + dx, ty = startY + dy, tz = startZ + dz;
                if (chunkManager.getBlock(tx, ty, tz) === 90) {
                    root = {x: tx, y: ty, z: tz};
                    break;
                }
            }
            if(root) break;
        }
        if(root) break;
    }

    if (!root) return []; // No portal found

    queue.push(root);
    visited.add(`${root.x},${root.y},${root.z}`);

    // Standard BFS
    while(queue.length > 0) {
        const node = queue.shift();
        const id = chunkManager.getBlock(node.x, node.y, node.z);
        const meta = chunkManager.getMetadata(node.x, node.y, node.z);
        
        structure.push({x: node.x, y: node.y, z: node.z, id, metadata: meta});

        // Check 26 neighbors (3x3x3) to ensure corners are captured
        const neighbors = [];
        for(let dx = -1; dx <= 1; dx++) {
            for(let dy = -1; dy <= 1; dy++) {
                for(let dz = -1; dz <= 1; dz++) {
                    if(dx === 0 && dy === 0 && dz === 0) continue;
                    neighbors.push({x: node.x + dx, y: node.y + dy, z: node.z + dz});
                }
            }
        }

        for (const n of neighbors) {
            const key = `${n.x},${n.y},${n.z}`;
            if (!visited.has(key)) {
                const nid = chunkManager.getBlock(n.x, n.y, n.z);
                if (nid === 90) {
                    // It's a portal block, continue search
                    visited.add(key);
                    queue.push(n);
                } else if (isObsidianId(nid)) {
                    // It's obsidian (frame), add to structure but don't spread
                    visited.add(key);
                    const nMeta = chunkManager.getMetadata(n.x, n.y, n.z);
                    structure.push({x: n.x, y: n.y, z: n.z, id: nid, metadata: nMeta});
                }
            }
        }
    }
    return structure;
}

function switchDimension() {
    // 0. Capture Portal Structure BEFORE state change
    const px = Math.floor(camera.position.x);
    const py = Math.floor(camera.position.y);
    const pz = Math.floor(camera.position.z);
    
    // Attempt to capture the portal the player is currently standing in/near
    let portalStructure = capturePortalStructure(px, py, pz);

    // 1. Save current modifications to the correct array
    if (CURRENT_DIMENSION === 'OVERWORLD') {
        modifiedBlocksOverworld = [...modifiedBlocks];
        surfaceColumnCacheOverworld = new Map(surfaceColumnCache);
        originalSurfaceColumnCacheOverworld = new Map(originalSurfaceColumnCache);
        signRegistryOverworld = new Map(signRegistry);
        mobsOverworld = mobManager.serializeState();
        transportsOverworld = entityManager.serializeTransports();
    } else {
        modifiedBlocksNether = [...modifiedBlocks];
        surfaceColumnCacheNether = new Map(surfaceColumnCache);
        originalSurfaceColumnCacheNether = new Map(originalSurfaceColumnCache);
        signRegistryNether = new Map(signRegistry);
        mobsNether = mobManager.serializeState();
        transportsNether = entityManager.serializeTransports();
    }

    // 2. Toggle Dimension
    CURRENT_DIMENSION = (CURRENT_DIMENSION === 'OVERWORLD') ? 'NETHER' : 'OVERWORLD';

    // 3. Load the new dimension's modifications
    if (CURRENT_DIMENSION === 'OVERWORLD') {
        modifiedBlocks = [...modifiedBlocksOverworld];
        surfaceColumnCache = new Map(surfaceColumnCacheOverworld);
        originalSurfaceColumnCache = new Map(originalSurfaceColumnCacheOverworld);
        signRegistry = new Map(signRegistryOverworld);
        if (!mobsOverworld) mobsOverworld = { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] };
        if (!Array.isArray(transportsOverworld)) transportsOverworld = [];
        scene.background = new THREE.Color(0x87CEEB);
        scene.fog = new THREE.Fog(0x87CEEB, 20, 65);
        applyWorldTimeVisuals();
    } else {
        modifiedBlocks = [...modifiedBlocksNether];
        surfaceColumnCache = new Map(surfaceColumnCacheNether);
        originalSurfaceColumnCache = new Map(originalSurfaceColumnCacheNether);
        signRegistry = new Map(signRegistryNether);
        if (!mobsNether) mobsNether = { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] };
        if (!Array.isArray(transportsNether)) transportsNether = [];
        scene.background = new THREE.Color(0x4a0e0e);
        scene.fog = new THREE.Fog(0x4a0e0e, 20, 65);
    }
    rebuildModifiedBlockCaches();

    // 4. Reset World Data
    chunkManager.clear();
    renderChunks.forEach(rc => rc.dispose());
    renderChunks.clear();
    pendingGeometryByKey.clear();
    requestedChunks.clear();
    geometryRefreshRequests.clear();
    clearPendingChunkTasks();
    chunkRetryCount.clear();
    resetChunkStreamStats();
    exposedChunks.clear();
    entityManager.clear();
    mobManager.clear();
    if (tntManager) tntManager.clear();
    linkMeshes.forEach(m => scene.remove(m));
    linkMeshes = [];
    linkRegistry.clear();
    furnaceRegistry.clear();
    chestRegistry.clear();
    dispenserRegistry.clear();
    signRegistry.clear();
    clearButtonReleaseTimers();
    clearRepeaterRuntimeState();
    pressedPressurePlateKeys.clear();
    clearFishingBobber();
    clearAllSignTextMeshes();
    
    // Stop movement
    velocity.set(0, 0, 0);

    // 5. Notify Worker
    const seed = getSavesIndex().find(s => s.id === CURRENT_WORLD_ID)?.seed || 0;
    const canonicalMods = getCanonicalModifiedBlocksSnapshot();
    chunkWorker.postMessage({
        type: 'init',
        data: { seed: seed, dimension: CURRENT_DIMENSION, modifiedBlocks: canonicalMods }
    });
    mobManager.loadState(CURRENT_DIMENSION === 'OVERWORLD' ? mobsOverworld : mobsNether);
    entityManager.loadTransports(CURRENT_DIMENSION === 'OVERWORLD' ? transportsOverworld : transportsNether);

    // 6. Portal Generation
    // If we captured a structure, replicate it. Otherwise, fallback to generating one.
    if (portalStructure.length > 0) {
        portalStructure.forEach(b => {
            chunkManager.setBlock(b.x, b.y, b.z, b.id);
            if (b.metadata !== undefined) chunkManager.setMetadata(b.x, b.y, b.z, b.metadata);
            updateModBlock(b.x, b.y, b.z, b.id, b.metadata || 0);
            chunkWorker.postMessage({ type: 'setBlock', data: { x: b.x, y: b.y, z: b.z, id: b.id, metadata: b.metadata || 0, immediate: true } });
            requestChunkGeometryAt(b.x, b.y, b.z);
        });
    } else {
        // Fallback if no portal found (e.g. teleport command used)
        generatePortalAt(px, py, pz);
    }

    // 7. Reset Timer & Refresh View
    portalTimer = 0;
    markPlannerDirty();
    refreshChunkPlannerIfNeeded(true);
}

function generatePortalAt(x, y, z) {
    // Generate a standardized Obsidian Frame (4x5) aligned with X-axis (facing Z)
    // Center the air gap at (x, y, z)
    
    // Bottom-Left of the air gap relative to center
    // If we want player at center, let's put air blocks at x-1 and x
    
    const startX = x - 1;
    const bottomY = y;
    const startZ = z; // Frame is flat on Z
    
    const setMod = (mx, my, mz, id) => {
        updateModBlock(mx, my, mz, id, 0);
    };

    // Frame Dimensions: 4 wide, 5 high
    // Air Gap: 2 wide, 3 high
    
    // Bottom Frame
    setMod(startX - 1, bottomY - 1, startZ, 252); // Obsidian
    setMod(startX, bottomY - 1, startZ, 252);
    setMod(startX + 1, bottomY - 1, startZ, 252);
    setMod(startX + 2, bottomY - 1, startZ, 252);

    // Top Frame
    setMod(startX - 1, bottomY + 3, startZ, 252);
    setMod(startX, bottomY + 3, startZ, 252);
    setMod(startX + 1, bottomY + 3, startZ, 252);
    setMod(startX + 2, bottomY + 3, startZ, 252);
    
    // Side Columns
    for (let h = 0; h < 3; h++) {
        setMod(startX - 1, bottomY + h, startZ, 252); // Left Wall
        setMod(startX + 2, bottomY + h, startZ, 252); // Right Wall
        
        // Portal Blocks (Interior)
        setMod(startX, bottomY + h, startZ, 90); 
        setMod(startX + 1, bottomY + h, startZ, 90); 
    }
}

function addLinkBlock(x, y, z, url) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x888888 });
    const imageUrl = getTextureUrl(url);
    if (imageUrl) {
        textureLoader.load(imageUrl, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            material.map = tex;
            material.color.setHex(0xffffff);
            material.needsUpdate = true;
        }, undefined, () => material.color.setHex(0x00FFFF));
    } else { material.color.setHex(0x00FFFF); }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.userData = { isLink: true, url: url, x, y, z };
    scene.add(mesh);
    
    const light = new THREE.PointLight(0x00FFFF, 0.5, 3);
    light.position.set(x, y, z);
    scene.add(light);
    
    linkRegistry.set(getKey(x,y,z), { url, mesh, light });
    linkMeshes.push(mesh);
}

function removeLinkBlock(x, y, z) {
    const key = getKey(x,y,z);
    const entry = linkRegistry.get(key);
    if (entry) {
        scene.remove(entry.mesh);
        scene.remove(entry.light);
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        linkMeshes = linkMeshes.filter(m => m !== entry.mesh);
        linkRegistry.delete(key);
    }
}

// Only raycast against chunks near the camera (within reach + margin) to keep FPS high when many chunks loaded
const RAYCAST_CHUNK_RANGE = 2;  // chunks from player in each axis (covers 8-block reach)

function updateRaycast() {
    if(IS_PAUSED || !GAME_ACTIVE || IS_INVENTORY_OPEN) return;
    raycaster.setFromCamera(center, camera);
    raycaster.near = 0;
    raycaster.far = 8;

    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcy = Math.floor(camera.position.y / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);

    let candidates = [...linkMeshes, ...entityManager.getTransportRaycastMeshes()];
    for (let cx = pcx - RAYCAST_CHUNK_RANGE; cx <= pcx + RAYCAST_CHUNK_RANGE; cx++) {
        for (let cy = pcy - RAYCAST_CHUNK_RANGE; cy <= pcy + RAYCAST_CHUNK_RANGE; cy++) {
            for (let cz = pcz - RAYCAST_CHUNK_RANGE; cz <= pcz + RAYCAST_CHUNK_RANGE; cz++) {
                const key = `${cx},${cy},${cz}`;
                const rc = renderChunks.get(key);
                if (rc && rc.meshes) candidates.push(...rc.meshes);
            }
        }
    }

    const intersects = raycaster.intersectObjects(candidates, false);
    
    if (intersects.length > 0) {
        let hit = null;
        for (let i = 0; i < intersects.length; i++) {
            if (intersects[i].distance >= 8) break;

            const tempHit = intersects[i];
            let tx, ty, tz;
            
            if (tempHit.object.userData.isLink || tempHit.object.userData.isVehicleEntity) {
                hit = tempHit;
                break;
            }

            // --- Updated Geometry Hit Logic ---
            const nudgedPoint = tempHit.point.clone().addScaledVector(tempHit.face.normal, -0.001);
            
            tx = Math.round(nudgedPoint.x);
            ty = Math.round(nudgedPoint.y);
            tz = Math.round(nudgedPoint.z);

            const id = chunkManager.getBlock(tx, ty, tz);
            
            // Ignore fluids (Water AND Lava) for selection
            if (!isFluidId(id) && id !== 0 && id !== 63 && id !== 90) { 
                hit = tempHit;
                hit.blockX = tx; hit.blockY = ty; hit.blockZ = tz;
                break;
            }
            // Allow selecting Portal to break it
            if (id === 90) {
                hit = tempHit;
                hit.blockX = tx; hit.blockY = ty; hit.blockZ = tz;
                break;
            }
        }

        if (hit) {
            let x, y, z;
            if (hit.object.userData.isLink || hit.object.userData.isVehicleEntity) {
                x = hit.object.position.x;
                y = hit.object.position.y;
                z = hit.object.position.z;
                const sel = hit.object.userData.selectionScale || { x: 1.01, y: 1.01, z: 1.01 };
                selectionWireframe.scale.set(sel.x, sel.y, sel.z);
                selectionWireframe.position.set(x, y, z);
                selectionWireframe.rotation.set(0, 0, 0);
            } else {
                x = hit.blockX;
                y = hit.blockY;
                z = hit.blockZ;
                
                const id = chunkManager.getBlock(x, y, z);
                
                if (isTorchId(id)) {
                    const meta = chunkManager.getMetadata(x, y, z);
                    // Reset rotation
                    selectionWireframe.rotation.set(0, 0, 0);
                    // Torch Selection: 2/16 wide, 10/16 high
                    const w = 2/16 + 0.01;
                    const h = 10/16 + 0.01;
                    selectionWireframe.scale.set(w, h, w);
                    
                    if (meta === 5 || meta === 0) {
                        // Floor torch
                        selectionWireframe.position.set(x, y - 0.1875, z);
                    } else {
                        // Wall Torch logic
                        const offset = 0.35; 
                        const vOffset = 0.1; 
                        // Start at center
                        const pos = new THREE.Vector3(x, y + vOffset, z);
                        
                        if (meta === 1) { // North (Z-)
                            pos.z += offset;
                            selectionWireframe.rotation.x = -Math.PI / 4;
                        } else if (meta === 2) { // South (Z+)
                            pos.z -= offset;
                            selectionWireframe.rotation.x = Math.PI / 4;
                        } else if (meta === 3) { // East (X+)
                            pos.x -= offset;
                            selectionWireframe.rotation.z = -Math.PI / 4;
                        } else if (meta === 4) { // West (X-)
                            pos.x += offset;
                            selectionWireframe.rotation.z = Math.PI / 4;
                        }
                        selectionWireframe.position.copy(pos);
                    }
                } else if (isSlabId(id)) {
                    selectionWireframe.scale.set(1.01, 0.51, 1.01);
                    selectionWireframe.position.set(x, y - 0.25, z);
                    selectionWireframe.rotation.set(0, 0, 0);
                } else if (isRailId(id)) {
                    const railH = 1 / 16;
                    selectionWireframe.scale.set(1.01, railH + 0.01, 1.01);
                    selectionWireframe.position.set(x, y - 0.5 + (railH * 0.5), z);
                    selectionWireframe.rotation.set(0, 0, 0);
                } else if (isFarmlandId(id)) {
                    const farmH = 15 / 16;
                    selectionWireframe.scale.set(1.01, farmH + 0.01, 1.01);
                    selectionWireframe.position.set(x, y - 0.5 + (farmH * 0.5), z);
                    selectionWireframe.rotation.set(0, 0, 0);
                } else if (isBedBlockId(id)) {
                    const bedH = 9 / 16;
                    selectionWireframe.scale.set(1.01, bedH + 0.01, 1.01);
                    selectionWireframe.position.set(x, y - 0.5 + (bedH * 0.5), z);
                    selectionWireframe.rotation.set(0, 0, 0);
                } else if (isFenceId(id)) {
                    selectionWireframe.scale.set(0.39, 1.51, 0.39);
                    selectionWireframe.position.set(x, y + 0.25, z);
                    selectionWireframe.rotation.set(0, 0, 0);
                } else if (isLeverId(id)) {
                    selectionWireframe.scale.set(0.39, 0.39, 0.39);
                    selectionWireframe.position.set(x, y, z);
                    selectionWireframe.rotation.set(0, 0, 0);
                } else if (isCakeBlockId(id)) {
                    const cakeH = 8 / 16;
                    const bites = chunkManager.getMetadata(x, y, z) & 7;
                    const baseW = 14 / 16;
                    const biteDx = Math.min(6, bites) * (2 / 16);
                    const w = Math.max(0.02, baseW - biteDx);
                    const centerX = x - (7 / 16) + biteDx + (w * 0.5);
                    selectionWireframe.scale.set(w + 0.01, cakeH + 0.01, 0.89);
                    selectionWireframe.position.set(centerX, y - 0.5 + (cakeH * 0.5), z);
                    selectionWireframe.rotation.set(0, 0, 0);
                } else if (id === 78) {
                    // Snow layer selection: full X/Z footprint, 1/8 block tall, aligned to layer height.
                    const snowH = 0.125;
                    selectionWireframe.scale.set(1.01, snowH + 0.01, 1.01);
                    selectionWireframe.position.set(x, y - 0.5 + (snowH * 0.5), z);
                    selectionWireframe.rotation.set(0, 0, 0);
                } else if (isChestId(id)) {
                     // Chest Selection (slightly smaller than full block)
                     selectionWireframe.scale.set(0.9, 0.9, 0.9);
                     selectionWireframe.position.set(x, y, z);
                     selectionWireframe.rotation.set(0, 0, 0);
                } else {
                    // Standard Block
                    selectionWireframe.scale.set(1.01, 1.01, 1.01);
                    selectionWireframe.position.set(x, y, z);
                    selectionWireframe.rotation.set(0, 0, 0);
                }
            }
            
            targetBlock = { x, y, z, face: hit.face, object: hit.object };
            selectionWireframe.visible = true;
        } else {
            targetBlock = null;
            selectionWireframe.visible = false;
            breakingMesh.visible = false;
        }
    } else {
        targetBlock = null;
        selectionWireframe.visible = false;
        breakingMesh.visible = false;
    }
}

// Special Raycast to detect liquids specifically for Bucket filling
function getLiquidHit() {
    raycaster.setFromCamera(center, camera);
    raycaster.near = 0;
    raycaster.far = 8;
    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcy = Math.floor(camera.position.y / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
    const candidates = [];
    for (let cx = pcx - RAYCAST_CHUNK_RANGE; cx <= pcx + RAYCAST_CHUNK_RANGE; cx++) {
        for (let cy = pcy - RAYCAST_CHUNK_RANGE; cy <= pcy + RAYCAST_CHUNK_RANGE; cy++) {
            for (let cz = pcz - RAYCAST_CHUNK_RANGE; cz <= pcz + RAYCAST_CHUNK_RANGE; cz++) {
                const key = `${cx},${cy},${cz}`;
                const rc = renderChunks.get(key);
                if (rc && rc.meshes) candidates.push(...rc.meshes);
            }
        }
    }
    const intersects = raycaster.intersectObjects(candidates, false);
    if (intersects.length > 0) {
        for (let i = 0; i < intersects.length; i++) {
            if (intersects[i].distance >= 8) break;
            const tempHit = intersects[i];
            
            // Adjust point slightly into block
            const nudgedPoint = tempHit.point.clone().addScaledVector(tempHit.face.normal, -0.001);
            const tx = Math.round(nudgedPoint.x);
            const ty = Math.round(nudgedPoint.y);
            const tz = Math.round(nudgedPoint.z);
            
            const id = chunkManager.getBlock(tx, ty, tz);
            if (isFluidId(id)) {
                return { x: tx, y: ty, z: tz, id };
            }
            // If we hit solid block first, stop
            if (id !== 0 && !isFluidId(id)) {
                return null; 
            }
        }
    }
    return null;
}

function getMiningSpeed(blockId, toolItem) {
    const blockDef = getRuntimeBlockDef(blockId);
    if (!blockDef) return 1;

    let multiplier = 1;
    
    if (toolItem) {
        if (getItemStackKind(toolItem.id, toolItem.kind) !== ITEM_STACK_KIND_ITEM) return multiplier;
        if (Number(blockId) === 5 && getActionItemId(toolItem) === SHEARS_ITEM_ID) {
            // Beta parity: shears mine leaves significantly faster.
            return 8;
        }
        const toolDef = getInventoryDef(toolItem.id, ITEM_STACK_KIND_ITEM);
        if (toolDef && toolDef.tier) {
            if (blockDef.tool === toolDef.toolType) {
                multiplier = toolDef.tier * 2;
            }
        }
    }
    
    return multiplier;
}

function updateMining(dt) {
    if (!isMouseDown || !targetBlock) {
        breakingMesh.visible = false;
        miningState.progress = 0;
        miningState.isMining = false;
        return;
    }

    miningState.isMining = true;
    const { x, y, z } = targetBlock;
    const key = getKey(x, y, z);

    if (miningState.targetKey !== key) {
        miningState.targetKey = key;
        miningState.progress = 0;
    }

    const blockId = chunkManager.getBlock(x, y, z);
    if (blockId === 8 || blockId === 0) { 
        miningState.isMining = false;
        breakingMesh.visible = false;
        return;
    }

    // --- Update Breaking Mesh Scale and Texture Mapping ---
    const percent = miningState.progress / ((getRuntimeBlockDef(blockId)?.hardness) || 1.0);
    const frameIndex = Math.min(9, Math.floor(percent * 10));
    const currentTex = breakingTextures[frameIndex];

    breakingMesh.rotation.set(0,0,0);

    if (isTorchId(blockId)) {
        const meta = chunkManager.getMetadata(x, y, z);
        const w = 2/16; 
        const h = 10/16;
        
        breakingMesh.scale.set(w + 0.02, h + 0.02, w + 0.02);
        
        // Texture cropping for torch
        currentTex.repeat.set(w, h);
        currentTex.offset.set((1 - w) / 2, 0); 

        if (meta === 5 || meta === 0) {
            breakingMesh.position.set(x, y - 0.1875, z);
        } else {
            const offset = 0.35; 
            const vOffset = 0.1;
            const pos = new THREE.Vector3(x, y + vOffset, z);
            
            if (meta === 1) { // North
                pos.z += offset;
                breakingMesh.rotation.x = -Math.PI / 4;
            } else if (meta === 2) { // South
                pos.z -= offset;
                breakingMesh.rotation.x = Math.PI / 4;
            } else if (meta === 3) { // East
                pos.x -= offset;
                breakingMesh.rotation.z = -Math.PI / 4;
            } else if (meta === 4) { // West
                pos.x += offset;
                breakingMesh.rotation.z = Math.PI / 4;
            }
            breakingMesh.position.copy(pos);
        }
    } else if (isSlabId(blockId)) {
        breakingMesh.scale.set(1.02, 0.52, 1.02);
        breakingMesh.position.set(x, y - 0.25, z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else if (isRailId(blockId)) {
        const railH = 1 / 16;
        breakingMesh.scale.set(1.02, railH + 0.02, 1.02);
        breakingMesh.position.set(x, y - 0.5 + (railH * 0.5), z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else if (isFarmlandId(blockId)) {
        const farmH = 15 / 16;
        breakingMesh.scale.set(1.02, farmH + 0.02, 1.02);
        breakingMesh.position.set(x, y - 0.5 + (farmH * 0.5), z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else if (isBedBlockId(blockId)) {
        const bedH = 9 / 16;
        breakingMesh.scale.set(1.02, bedH + 0.02, 1.02);
        breakingMesh.position.set(x, y - 0.5 + (bedH * 0.5), z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else if (isFenceId(blockId)) {
        breakingMesh.scale.set(0.4, 1.52, 0.4);
        breakingMesh.position.set(x, y + 0.25, z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else if (isLeverId(blockId)) {
        breakingMesh.scale.set(0.4, 0.4, 0.4);
        breakingMesh.position.set(x, y, z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else if (isCakeBlockId(blockId)) {
        const cakeH = 8 / 16;
        const bites = chunkManager.getMetadata(x, y, z) & 7;
        const baseW = 14 / 16;
        const biteDx = Math.min(6, bites) * (2 / 16);
        const w = Math.max(0.02, baseW - biteDx);
        const centerX = x - (7 / 16) + biteDx + (w * 0.5);
        breakingMesh.scale.set(w + 0.02, cakeH + 0.02, 0.9);
        breakingMesh.position.set(centerX, y - 0.5 + (cakeH * 0.5), z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else if (blockId === 78) {
        // Snow layer break overlay: full footprint, 1/8 block tall, aligned to snow height.
        const snowH = 0.125;
        breakingMesh.scale.set(1.02, snowH + 0.02, 1.02);
        breakingMesh.position.set(x, y - 0.5 + (snowH * 0.5), z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else if (isChestId(blockId)) {
        // Chest break mesh
        breakingMesh.scale.set(0.9, 0.9, 0.9);
        breakingMesh.position.set(x, y, z);
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else {
        // Standard Block
        breakingMesh.scale.set(1.02, 1.02, 1.02);
        breakingMesh.position.set(x, y, z);

        // Reset Texture
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    }

    const blockDef = getRuntimeBlockDef(blockId);
    const hardness = (blockDef && blockDef.hardness !== undefined) ? blockDef.hardness : 1.0;

    if (hardness < 0) return; 

    const selectedItem = inventory.slots[getSelectedSlot()];
    const speed = getMiningSpeed(blockId, selectedItem);
    
    miningState.progress += dt * speed;

    if (miningState.progress >= hardness) {
        mineBlock();
        miningState.progress = 0;
        breakingMesh.visible = false;
        
        // Safety Reset
        currentTex.repeat.set(1, 1);
        currentTex.offset.set(0, 0);
    } else {
        breakingMesh.visible = true;
        breakingMat.map = currentTex;
        breakingMat.needsUpdate = true;
    }
}

function breakPortalRecursively(x, y, z) {
    if (chunkManager.getBlock(x, y, z) !== 90) return;
    
    // Stack-based flood fill to avoid deep recursion
    const stack = [{x, y, z}];
    const visited = new Set();
    
    while (stack.length > 0) {
        const p = stack.pop();
        const k = getKey(p.x, p.y, p.z);
        if (visited.has(k)) continue;
        visited.add(k);
        
        if (chunkManager.getBlock(p.x, p.y, p.z) === 90) {
            // Remove Block
            chunkManager.setBlock(p.x, p.y, p.z, 0);
            updateModBlock(p.x, p.y, p.z, 0, 0);
            chunkWorker.postMessage({ type: 'setBlock', data: { x: p.x, y: p.y, z: p.z, id: 0, metadata: 0 } });
            requestChunkGeometryAt(p.x, p.y, p.z);
            
            // Check neighbors
            stack.push({x: p.x+1, y: p.y, z: p.z});
            stack.push({x: p.x-1, y: p.y, z: p.z});
            stack.push({x: p.x, y: p.y+1, z: p.z});
            stack.push({x: p.x, y: p.y-1, z: p.z});
            stack.push({x: p.x, y: p.y, z: p.z+1});
            stack.push({x: p.x, y: p.y, z: p.z-1});
        }
    }
}

function mineBlock() {
    if (!targetBlock || IS_PAUSED || IS_INVENTORY_OPEN) return;
    const { x, y, z, object } = targetBlock;
    if (object?.userData?.isVehicleEntity) {
        const vehicle = entityManager.getTransportByMesh(object) || getTargetVehicleEntity(4.5);
        if (vehicle) {
            entityManager.applyTransportDamage(vehicle, 10, 'player');
        }
        scheduleSaveGame();
        return;
    }
    
    const id = chunkManager.getBlock(x, y, z);
    const sourceMeta = chunkManager.getMetadata(x, y, z) & 15;
    if (id === 8) return;
    if (isButtonId(id)) {
        const key = getKey(x, y, z);
        if (buttonReleaseTimers.has(key)) {
            clearTimeout(buttonReleaseTimers.get(key));
            buttonReleaseTimers.delete(key);
        }
    }

    const blockDefForDrop = getRuntimeBlockDef(id);
    if (blockDefForDrop && blockDefForDrop.isItem) {
        // Block id is an item (e.g. 26 = Wood Axe) - should not appear as terrain; drop nothing to avoid axe/etc drops
        chunkManager.setBlock(x, y, z, 0);
        chunkManager.setMetadata(x, y, z, 0);
        updateModBlock(x, y, z, 0, 0);
        markRepeatersDirtyAround(x, y, z);
        markRepeatersDirtyAround(x, y, z);
        fallingBlockManager.markDirty(x, y, z);
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: 0, metadata: 0, immediate: true } });
        return;
    }

    const selectedSlotIndex = getSelectedSlot();
    const toolItem = inventory.slots[selectedSlotIndex];
    const heldPickaxeTier = getPickaxeTierFromHeldItem(toolItem);
    if (toolItem && toolItem.durability !== undefined) {
        toolItem.durability--;
        if (toolItem.durability <= 0) {
            inventory.slots[selectedSlotIndex] = null;
        }
        refreshHotbar();
    }

    if (object.userData.isLink) removeLinkBlock(x,y,z);
    
    let dropId = id;
    let dropMetadata = 0;
    let dropKind = ITEM_STACK_KIND_BLOCK;
    const customDrops = [];
    if (id === 1) dropId = 2; // Grass -> Dirt
    if (id === 64) dropId = 2; // Snow Grass -> Dirt
    if (id === 3) dropId = 15; 
    if (id === 18) dropId = 17; // Legacy furnace-on alias -> furnace-off drop parity.
    if (id === 62) dropId = 61;
    if (id === 4) dropMetadata = sourceMeta & 3; // Log variant parity: preserve oak/spruce/birch metadata on drop.
    if (id === 10) dropId = 20; 
    if (id === 13) dropId = 22; 
    if (id === 19 || id === 20) dropId = 0; // Glass drops nothing in Beta
    if (id === 79) dropId = 0; // Ice drops nothing in Beta
    if (id === 47) dropId = 0; // Bookshelf drops nothing in Beta 1.7.3
    if (isCakeBlockId(id)) dropId = 0; // Cake drops nothing in Beta
    if (isFarmlandId(id)) dropId = 2; // Farmland -> dirt
    
    // Spawner parity: never drops itself.
    if (id === 52) {
        dropId = 0;
    }
    // Obsidian mining drop parity: requires diamond pickaxe.
    if (isObsidianId(id) && heldPickaxeTier < 4) {
        dropId = 0;
    }
    if (id === 52 || isObsidianId(id)) {
        // Break any attached portal blocks
        const neighbors = [
            {dx:1, dy:0, dz:0}, {dx:-1, dy:0, dz:0},
            {dx:0, dy:1, dz:0}, {dx:0, dy:-1, dz:0},
            {dx:0, dy:0, dz:1}, {dx:0, dy:0, dz:-1}
        ];
        neighbors.forEach(n => {
            if (chunkManager.getBlock(x+n.dx, y+n.dy, z+n.dz) === 90) {
                breakPortalRecursively(x+n.dx, y+n.dy, z+n.dz);
            }
        });
    }
    
    // Portal Break Logic
    if (id === 90) {
        breakPortalRecursively(x, y, z);
        return; // Don't spawn drop or do standard break
    }

    // NEW: Gravel Mining Logic
    if (id === 57) { // Gravel
        // Beta parity: ~10% chance for flint.
        dropId = (Math.random() < 0.10) ? 58 : 57;
    }
    if (id === 30) { // Cobweb
        const toolKind = toolItem ? getItemStackKind(toolItem.id, toolItem.kind) : null;
        const usingShears = toolItem && toolKind === ITEM_STACK_KIND_ITEM && getActionItemId(toolItem) === SHEARS_ITEM_ID;
        if (usingShears) {
            // Beta parity: shears harvest cobweb block directly.
            dropId = 30;
            dropKind = ITEM_STACK_KIND_BLOCK;
        } else {
            // Beta parity: cobweb broken normally drops string.
            dropId = 31;
            dropKind = ITEM_STACK_KIND_ITEM;
        }
    }

    if (id === 82) { // Clay block -> clay balls
        dropId = 0;
        for (let i = 0; i < 4; i++) {
            customDrops.push({ id: 81, count: 1, kind: ITEM_STACK_KIND_ITEM });
        }
    }
    if (id === 265) { // Snow block -> 4 snowballs
        dropId = 0;
        for (let i = 0; i < 4; i++) {
            customDrops.push({ id: 76, count: 1, kind: ITEM_STACK_KIND_ITEM });
        }
    }
    if (id === 43) { // Double stone slab -> 2 stone slabs
        dropId = 0;
        customDrops.push({ id: 44, count: 2, kind: ITEM_STACK_KIND_BLOCK });
    }
    if (id === 73 || id === 74) { // Redstone ore -> redstone dust
        dropId = 0;
        const dustCount = 4 + Math.floor(Math.random() * 2); // Beta-style 4-5 baseline
        customDrops.push({ id: 75, count: dustCount, kind: ITEM_STACK_KIND_ITEM });
    }
    if (id === 89) { // Glowstone -> glowstone dust
        dropId = 0;
        const dustCount = 2 + Math.floor(Math.random() * 3); // Beta-style 2-4 baseline
        customDrops.push({ id: 348, count: dustCount, kind: ITEM_STACK_KIND_ITEM });
    }

    // Beta harvest gating parity: many stone/ore families only drop with sufficient pickaxe tier.
    const requiredPickaxeTier = getRequiredPickaxeTierForDrop(id);
    if (requiredPickaxeTier > 0 && heldPickaxeTier < requiredPickaxeTier) {
        dropId = 0;
        customDrops.length = 0;
    }

    // Crop / grass drop parity slice
    if (isCropId(id)) {
        const growth = chunkManager.getMetadata(x, y, z) & 7;
        if (growth >= 7) {
            customDrops.push({ id: 40, count: 1, kind: ITEM_STACK_KIND_ITEM }); // Wheat
            const seeds = Math.floor(Math.random() * 4); // Beta parity: 0..3 seeds
            if (seeds > 0) {
                customDrops.push({ id: 39, count: seeds, kind: ITEM_STACK_KIND_ITEM }); // Seeds
            }
        } else {
            customDrops.push({ id: 39, count: 1, kind: ITEM_STACK_KIND_ITEM });
        }
        dropId = 0;
    }
    if (isTallGrassId(id)) {
        const toolKind = toolItem ? getItemStackKind(toolItem.id, toolItem.kind) : null;
        const usingShears = toolItem && toolKind === ITEM_STACK_KIND_ITEM && getActionItemId(toolItem) === SHEARS_ITEM_ID;
        if (usingShears) {
            // Beta parity: shears harvest tall grass directly.
            customDrops.push({ id: id, count: 1, kind: ITEM_STACK_KIND_BLOCK });
        } else if (Math.random() < 0.125) {
            customDrops.push({ id: 39, count: 1, kind: ITEM_STACK_KIND_ITEM }); // Seeds
        }
        dropId = 0;
    }
    if (isDeadBushId(id)) {
        dropId = 0;
        const toolKind = toolItem ? getItemStackKind(toolItem.id, toolItem.kind) : null;
        const usingShears = toolItem && toolKind === ITEM_STACK_KIND_ITEM && getActionItemId(toolItem) === SHEARS_ITEM_ID;
        if (usingShears) {
            // Beta parity: shears harvest dead bush directly.
            customDrops.push({ id: id, count: 1, kind: ITEM_STACK_KIND_BLOCK });
        } else {
            // Beta parity: dead bushes drop 0..2 sticks.
            const sticks = Math.floor(Math.random() * 3);
            if (sticks > 0) {
                customDrops.push({ id: 23, count: sticks, kind: ITEM_STACK_KIND_ITEM });
            }
        }
    }
    if (isReedId(id)) {
        dropId = 82; // reeds item alias
        dropKind = ITEM_STACK_KIND_ITEM;
    }
    if (id === 78) { // Snow layer -> snowball (Beta parity baseline)
        dropId = 76;
        dropKind = ITEM_STACK_KIND_ITEM;
    }
    if (id === 5) { // Leaves: occasional sapling drop
        const toolKind = toolItem ? getItemStackKind(toolItem.id, toolItem.kind) : null;
        const usingShears = toolItem && toolKind === ITEM_STACK_KIND_ITEM && getActionItemId(toolItem) === SHEARS_ITEM_ID;
        if (usingShears) {
            // Beta parity: shears harvest leaves block directly.
            dropId = 5;
            dropKind = ITEM_STACK_KIND_BLOCK;
            dropMetadata = sourceMeta & 3;
            customDrops.length = 0;
        } else {
            if (Math.random() < 0.0625) {
                customDrops.push({ id: 103, count: 1, kind: ITEM_STACK_KIND_BLOCK, metadata: sourceMeta & 3 });
            }
            // Beta parity: oak leaves have a rare apple drop chance.
            if ((sourceMeta & 3) === 0 && Math.random() < 0.005) {
                customDrops.push({ id: 4, count: 1, kind: ITEM_STACK_KIND_ITEM });
            }
            dropId = 0;
        }
    }
    if (id === 4) {
        // Beta parity: removing logs flags nearby leaves for decay checks.
        markLeavesForDecayNear(x, y, z, 4);
    }

    const fKey = getKey(x,y,z);
    if (furnaceRegistry.has(fKey)) {
        const fe = furnaceRegistry.get(fKey);
        fe.inventory.forEach(item => {
            if(item) entityManager.spawnDrop(x, y, z, item.id, null, 0.5, item.durability, { autoMagnet: true, metadata: item.metadata, kind: getItemStackKind(item.id, item.kind) });
        });
        furnaceRegistry.delete(fKey);
    }
    
    if (chestRegistry.has(fKey)) {
        const chestInv = chestRegistry.get(fKey);
        chestInv.slots.forEach(item => {
            if(item) entityManager.spawnDrop(x, y, z, item.id, null, 0.5, item.durability, { autoMagnet: true, metadata: item.metadata, kind: getItemStackKind(item.id, item.kind) });
        });
        chestRegistry.delete(fKey);
    }
    if (dispenserRegistry.has(fKey)) {
        const dispInv = dispenserRegistry.get(fKey);
        dispInv.slots.forEach(item => {
            if (item) entityManager.spawnDrop(x, y, z, item.id, null, 0.5, item.durability, { autoMagnet: true, metadata: item.metadata, kind: getItemStackKind(item.id, item.kind) });
        });
        dispenserRegistry.delete(fKey);
    }

    // Logic to un-pair Double Chests when one is broken
    if (isChestId(id)) {
        const meta = chunkManager.getMetadata(x, y, z);
        const shape = meta & 12;
        const rot = meta & 3;
        
        if (shape !== 0) {
            let px=x, py=y, pz=z;
            // Offsets to find partner based on rotation
            // If I am LEFT (8), Partner is to my RIGHT.
            // If I am RIGHT (4), Partner is to my LEFT.
            
            let leftOff = {x:0, z:0}, rightOff = {x:0, z:0};
            if (rot === 0) { leftOff={x:1,z:0}; rightOff={x:-1,z:0}; } // South
            else if (rot === 1) { leftOff={x:-1,z:0}; rightOff={x:1,z:0}; } // North
            else if (rot === 2) { leftOff={x:0,z:-1}; rightOff={x:0,z:1}; } // East
            else if (rot === 3) { leftOff={x:0,z:1}; rightOff={x:0,z:-1}; } // West
            
            if (shape === 8) { // I am Left, Partner is Right
                px += rightOff.x; pz += rightOff.z;
            } else if (shape === 4) { // I am Right, Partner is Left
                px += leftOff.x; pz += leftOff.z;
            }
            
            // Check if partner is indeed a chest
            const partnerId = chunkManager.getBlock(px, py, pz);
            if (partnerId === 53 || partnerId === 54) {
                const pMeta = chunkManager.getMetadata(px, py, pz);
                const newPMeta = pMeta & 3; // Keep rotation, clear shape (set to Single)
                
                chunkManager.setMetadata(px, py, pz, newPMeta);
                updateModBlock(px, py, pz, partnerId, newPMeta);
                chunkWorker.postMessage({ type: 'setBlock', data: { x: px, y: py, z: pz, id: partnerId, metadata: newPMeta } });
                requestChunkGeometryAt(px, py, pz);
            }
        }
    }

    if (isWoolId(id) && dropId !== 0) {
        dropMetadata = chunkManager.getMetadata(x, y, z) & 15;
    }
    let suppressBaseBreak = false;
    let replacementBlockId = 0;
    let replacementMetadata = 0;
    if (id === 79) {
        // Beta parity baseline: broken ice turns into water source.
        replacementBlockId = 70;
        replacementMetadata = 0;
    }
    if (isDoorId(id)) {
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        const isTop = (meta & 8) !== 0;
        const baseY = isTop ? y - 1 : y;
        const topY = baseY + 1;
        const lowerId = chunkManager.getBlock(x, baseY, z);
        const upperId = chunkManager.getBlock(x, topY, z);
        if (lowerId === id) {
            chunkManager.setBlock(x, baseY, z, 0);
            chunkManager.setMetadata(x, baseY, z, 0);
            updateModBlock(x, baseY, z, 0, 0);
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y: baseY, z, id: 0, metadata: 0, immediate: true } });
        }
        if (upperId === id) {
            chunkManager.setBlock(x, topY, z, 0);
            chunkManager.setMetadata(x, topY, z, 0);
            updateModBlock(x, topY, z, 0, 0);
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y: topY, z, id: 0, metadata: 0, immediate: true } });
        }
        dropId = id === IRON_DOOR_BLOCK_ID ? 74 : 68;
        dropKind = ITEM_STACK_KIND_ITEM;
        suppressBaseBreak = true;
    } else if (isBedBlockId(id)) {
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        const isHead = (meta & 8) !== 0;
        const off = getBedHeadOffset(meta);
        const footX = isHead ? (x - off.x) : x;
        const footZ = isHead ? (z - off.z) : z;
        const headX = footX + off.x;
        const headZ = footZ + off.z;
        if (chunkManager.getBlock(footX, y, footZ) === id) {
            chunkManager.setBlock(footX, y, footZ, 0);
            chunkManager.setMetadata(footX, y, footZ, 0);
            updateModBlock(footX, y, footZ, 0, 0);
            chunkWorker.postMessage({ type: 'setBlock', data: { x: footX, y, z: footZ, id: 0, metadata: 0, immediate: true } });
        }
        if (chunkManager.getBlock(headX, y, headZ) === id) {
            chunkManager.setBlock(headX, y, headZ, 0);
            chunkManager.setMetadata(headX, y, headZ, 0);
            updateModBlock(headX, y, headZ, 0, 0);
            chunkWorker.postMessage({ type: 'setBlock', data: { x: headX, y, z: headZ, id: 0, metadata: 0, immediate: true } });
        }
        updateSurfaceColumnCacheForChunkColumn(Math.floor(footX / CHUNK_SIZE), Math.floor(footZ / CHUNK_SIZE));
        updateSurfaceColumnCacheForChunkColumn(Math.floor(headX / CHUNK_SIZE), Math.floor(headZ / CHUNK_SIZE));
        fallingBlockManager.markDirty(footX, y, footZ);
        fallingBlockManager.markDirty(headX, y, headZ);
        dropId = BED_ITEM_ID;
        dropKind = ITEM_STACK_KIND_ITEM;
        suppressBaseBreak = true;
    } else if (isSignId(id)) {
        dropId = 67;
        dropKind = ITEM_STACK_KIND_ITEM;
        signRegistry.delete(getKey(x, y, z));
        removeSignTextMeshAt(x, y, z);
    } else if (isPaintingId(id)) {
        dropId = 65;
        dropKind = ITEM_STACK_KIND_ITEM;
    } else if (isLadderId(id)) {
        dropId = 102;
        dropKind = ITEM_STACK_KIND_ITEM;
    } else if (isLeverId(id)) {
        dropId = 111;
        dropKind = ITEM_STACK_KIND_BLOCK;
    } else if (isBoatBlockId(id)) {
        dropId = 77;
        dropKind = ITEM_STACK_KIND_ITEM;
    } else if (isMinecartBlockId(id)) {
        dropId = 72;
        dropKind = ITEM_STACK_KIND_ITEM;
    }

    const canonicalStatefulDrop = getCanonicalStatefulDrop(dropId, dropKind);
    dropId = canonicalStatefulDrop.id;
    dropKind = canonicalStatefulDrop.kind;

    if (dropId !== 0) {
        const metadata = dropKind === ITEM_STACK_KIND_BLOCK ? dropMetadata : 0;
        entityManager.spawnDrop(x, y, z, dropId, null, 0.1, null, { autoMagnet: true, metadata, kind: dropKind }); 
    }
    for (const d of customDrops) {
        for (let i = 0; i < d.count; i++) {
            entityManager.spawnDrop(x, y, z, d.id, null, 0.1, null, {
                autoMagnet: true,
                kind: d.kind,
                metadata: Number.isFinite(Number(d.metadata)) ? (Number(d.metadata) & 15) : 0
            });
        }
    }

    markPlayerEditPriority();
    if (!suppressBaseBreak) {
        chunkManager.setBlock(x, y, z, replacementBlockId);
        chunkManager.setMetadata(x, y, z, replacementMetadata);
        updateModBlock(x, y, z, replacementBlockId, replacementMetadata);
    }
    updateSurfaceColumnCacheForChunkColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    fallingBlockManager.markDirty(x, y, z);
    // Added immediate: true to prioritize player action
    if (!suppressBaseBreak) {
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: replacementBlockId, metadata: replacementMetadata, immediate: true } });
    }
    if (shouldUpdateRailsForBlockChange(id, replacementBlockId)) {
        updateRailsAround(x, y, z, true);
    }
    updateDependentsAround(x, y, z, true);
    // applySetBlock already meshes and sends geometry immediately
    
    if (y % CHUNK_SIZE === 0) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        
        const exposedKey = `${cx},${cy - 1},${cz}`;
        if (!exposedChunks.has(exposedKey)) {
            exposedChunks.add(exposedKey);
            identifyNeededChunks();
        }
    }

    scheduleSaveGame();
    
    breakingMesh.visible = false;
    miningState.progress = 0;
}

function tryIgnitePortal(x, y, z) {
    // Helper to check frame in a specific plane (axis 0 = Z-plane/moves along X, axis 1 = X-plane/moves along Z)
    const checkPlane = (dx, dz) => {
        // 1. Find width bounds
        let minX = 0, maxX = 0;
        
        // Search "Left" (Negative direction)
        let leftObs = null;
        for(let i = 1; i < 22; i++) {
            const id = chunkManager.getBlock(x - dx*i, y, z - dz*i);
            if (id === 52 || isObsidianId(id)) { leftObs = i; break; } // Found wall
            if (id !== 0 && id !== 63) return null; // Obstruction
        }
        
        // Search "Right" (Positive direction)
        let rightObs = null;
        for(let i = 1; i < 22; i++) {
            const id = chunkManager.getBlock(x + dx*i, y, z + dz*i);
            if (id === 52 || isObsidianId(id)) { rightObs = i; break; }
            if (id !== 0 && id !== 63) return null;
        }

        if (!leftObs || !rightObs) return null;
        const width = leftObs + rightObs - 1; 
        if (width < 1) return null; // Changed to Min width 1

        // 2. Find height bounds from the bottom-left-most air block
        const startAirX = x - dx * (leftObs - 1);
        const startAirZ = z - dz * (leftObs - 1);
        
        // Find "Floor" (Obsidian below the bottom row of air)
        let bottomY = y;
        while(true) {
            const below = bottomY - 1;
            const id = chunkManager.getBlock(x, below, z); // Check center column
            if (id === 52 || isObsidianId(id)) break;
            if (id !== 0 && id !== 63) return null;
            bottomY--;
            if (y - bottomY > 21) return null;
        }
        
        // Find "Ceiling"
        let topY = y;
        while(true) {
            const above = topY + 1;
            const id = chunkManager.getBlock(x, above, z);
            if (id === 52 || isObsidianId(id)) break;
            if (id !== 0 && id !== 63) return null;
            topY++;
            if (topY - bottomY > 21) return null;
        }
        
        const height = topY - bottomY + 1;
        if (height < 1) return null; // Changed to Min height 1

        // 3. Verify the Ring
        // Verify Top Row and Bottom Row are Obsidian
        for(let w = 0; w < width; w++) {
            const cx = startAirX + dx*w;
            const cz = startAirZ + dz*w;
            
            // Bottom Frame
            if ((chunkManager.getBlock(cx, bottomY - 1, cz) !== 52 && !isObsidianId(chunkManager.getBlock(cx, bottomY - 1, cz)))) return null;
            // Top Frame
            if ((chunkManager.getBlock(cx, topY + 1, cz) !== 52 && !isObsidianId(chunkManager.getBlock(cx, topY + 1, cz)))) return null;
            
            // Verify Interior is Empty
            for(let h = 0; h < height; h++) {
                const id = chunkManager.getBlock(cx, bottomY + h, cz);
                if (id !== 0 && id !== 63) return null;
            }
        }
        
        // Verify Side Columns
        for(let h = 0; h < height; h++) {
            const cy = bottomY + h;
            // Left Wall
            if ((chunkManager.getBlock(startAirX - dx, cy, startAirZ - dz) !== 52 && !isObsidianId(chunkManager.getBlock(startAirX - dx, cy, startAirZ - dz)))) return null;
            // Right Wall
            if ((chunkManager.getBlock(startAirX + dx*width, cy, startAirZ + dz*width) !== 52 && !isObsidianId(chunkManager.getBlock(startAirX + dx*width, cy, startAirZ + dz*width)))) return null;
        }

        return { startX: startAirX, startZ: startAirZ, bottomY, width, height, dx, dz };
    };

    // Try X-Axis (Portal faces North/South, runs along X) -> dx=1, dz=0
    let result = checkPlane(1, 0);
    if (!result) result = checkPlane(0, 1); // Try Z-Axis

    if (result) {
        // Fill Portal
        const { startX, startZ, bottomY, width, height, dx, dz } = result;
        for(let w = 0; w < width; w++) {
            for(let h = 0; h < height; h++) {
                const px = startX + dx*w;
                const py = bottomY + h;
                const pz = startZ + dz*w;
                
                chunkManager.setBlock(px, py, pz, 90); // Portal ID
                updateModBlock(px, py, pz, 90, 0);
                chunkWorker.postMessage({ type: 'setBlock', data: { x: px, y: py, z: pz, id: 90, metadata: 0, immediate: true } });
                requestChunkGeometryAt(px, py, pz);
            }
        }
        return true;
    }
    return false;
}

function getPickaxeTierFromHeldItem(toolItem) {
    if (!toolItem) return 0;
    if (getItemStackKind(toolItem.id, toolItem.kind) !== ITEM_STACK_KIND_ITEM) return 0;
    const def = getInventoryDef(toolItem.id, ITEM_STACK_KIND_ITEM);
    if (!def || def.toolType !== 'pickaxe') return 0;
    return Number.isFinite(def.tier) ? Math.max(0, Math.floor(def.tier)) : 0;
}

function getRequiredPickaxeTierForDrop(blockId) {
    switch (Number(blockId) || 0) {
        case 3:   // stone
        case 10:  // coal ore
        case 15:  // cobblestone
        case 48:  // mossy cobblestone
        case 17:  // furnace
        case 18:  // furnace lit
        case 61:
        case 62:
        case 23:  // dispenser
        case 41:  // gold block
        case 42:  // iron block
            return 1; // any pickaxe
        case 11:  // gold ore
        case 12:  // iron ore
        case 21:  // link/lapis substitute ore
            return 2; // stone+
        case 13:  // diamond ore
        case 73:  // redstone ore
        case 74:  // glowing redstone ore
            return 3; // iron+
        case 49:  // obsidian
        case 252: // legacy obsidian alias
            return 4; // diamond
        default:
            return 0;
    }
}

function isSolidForRailSupport(id) {
    if (id === 0) return false;
    if (isFluidId(id)) return false;
    if (id === 7) return false;
    if (isTorchId(id) || isButtonId(id) || isPressurePlateId(id) || isRailId(id) || isRepeaterId(id) || isTrapdoorId(id) || isLadderId(id) || isSignId(id) || isPaintingId(id) || isLeverId(id) || isDoorId(id)) return false;
    if (isFlowerId(id) || isMushroomId(id) || isTallGrassId(id) || isDeadBushId(id) || isCropId(id) || id === 103 || id === 63 || id === 78 || id === 90) return false;
    return true;
}

function hasAdjacentWaterAt(x, y, z) {
    const ids = [
        chunkManager.getBlock(x + 1, y, z),
        chunkManager.getBlock(x - 1, y, z),
        chunkManager.getBlock(x, y, z + 1),
        chunkManager.getBlock(x, y, z - 1)
    ];
    return ids.some((id) => isWaterId(id));
}

function isValidCactusAt(x, y, z) {
    const below = chunkManager.getBlock(x, y - 1, z);
    if (!(below === 9 || below === 56 || below === 81)) return false;
    const neighbors = [
        chunkManager.getBlock(x + 1, y, z),
        chunkManager.getBlock(x - 1, y, z),
        chunkManager.getBlock(x, y, z + 1),
        chunkManager.getBlock(x, y, z - 1)
    ];
    return !neighbors.some((id) => isSolidForRailSupport(id));
}

function isValidReedAt(x, y, z) {
    const below = chunkManager.getBlock(x, y - 1, z);
    if (isReedId(below)) return true;
    const validGround = below === 1 || below === 2 || below === 9;
    if (!validGround) return false;
    return hasAdjacentWaterAt(x, y - 1, z);
}

function isRailPresentAt(x, y, z) {
    return isRailId(chunkManager.getBlock(x, y, z));
}

function shouldUpdateRailsForBlockChange(oldId, newId) {
    if (isRailId(oldId) || isRailId(newId)) return true;
    return isSolidForRailSupport(oldId) !== isSolidForRailSupport(newId);
}

function isRailConnectedAt(x, y, z) {
    return (
        isRailPresentAt(x, y, z) ||
        isRailPresentAt(x, y + 1, z) ||
        isRailPresentAt(x, y - 1, z)
    );
}

function isPoweredRailId(id) {
    return (Number(id) || 0) === 27;
}

function isDetectorRailId(id) {
    return (Number(id) || 0) === 28;
}

function isSpecialRailId(id) {
    return isPoweredRailId(id) || isDetectorRailId(id);
}

function normalizeSpecialRailShape(shape) {
    const s = (Number(shape) || 0) & 7;
    if (s >= 0 && s <= 5) return s;
    // Powered/detector rails do not support corner states.
    return (s === 1 || s === 2 || s === 3) ? 1 : 0;
}

function getSpecialRailEndpoints(x, y, z, shape) {
    const s = normalizeSpecialRailShape(shape);
    switch (s) {
        case 0: return [
            { x, y, z: z - 1 },
            { x, y, z: z + 1 }
        ]; // NS
        case 1: return [
            { x: x - 1, y, z },
            { x: x + 1, y, z }
        ]; // EW
        case 2: return [
            { x: x - 1, y, z },
            { x: x + 1, y: y + 1, z }
        ]; // ascending east
        case 3: return [
            { x: x - 1, y: y + 1, z },
            { x: x + 1, y, z }
        ]; // ascending west
        case 4: return [
            { x, y: y + 1, z: z - 1 },
            { x, y, z: z + 1 }
        ]; // ascending north
        case 5: return [
            { x, y, z: z - 1 },
            { x, y: y + 1, z: z + 1 }
        ]; // ascending south
        default: return [];
    }
}

function computeSpecialRailShapeAt(x, y, z, fallbackShape = 0) {
    const north = isRailConnectedAt(x, y, z - 1);
    const south = isRailConnectedAt(x, y, z + 1);
    const west = isRailConnectedAt(x - 1, y, z);
    const east = isRailConnectedAt(x + 1, y, z);

    // Preserve orientation for isolated special rails.
    // Redstone updates (e.g. torch placement) should not "snap" direction when
    // there are no neighboring rails to define a new axis.
    if (!(north || south || west || east)) {
        return normalizeSpecialRailShape(fallbackShape);
    }

    let base = ((east || west) && !(north || south)) ? 1 : 0;
    if (base === 1) {
        if (isRailPresentAt(x + 1, y + 1, z)) return 2;
        if (isRailPresentAt(x - 1, y + 1, z)) return 3;
    } else {
        if (isRailPresentAt(x, y + 1, z - 1)) return 4;
        if (isRailPresentAt(x, y + 1, z + 1)) return 5;
    }
    return base;
}

function computeRailMetadataAt(x, y, z, fallbackMeta = 0) {
    const north = isRailConnectedAt(x, y, z - 1);
    const south = isRailConnectedAt(x, y, z + 1);
    const west = isRailConnectedAt(x - 1, y, z);
    const east = isRailConnectedAt(x + 1, y, z);

    let base = fallbackMeta & 15;
    if ((north || south) && !(west || east)) base = 0; // NS
    else if ((west || east) && !(north || south)) base = 1; // EW
    if (south && east) base = 6;
    else if (south && west) base = 7;
    else if (north && west) base = 8;
    else if (north && east) base = 9;

    // Ascending metadata: 2=east, 3=west, 4=north, 5=south.
    if (base === 1) {
        if (isRailPresentAt(x + 1, y + 1, z)) return 2;
        if (isRailPresentAt(x - 1, y + 1, z)) return 3;
    }
    if (base === 0) {
        if (isRailPresentAt(x, y + 1, z - 1)) return 4;
        if (isRailPresentAt(x, y + 1, z + 1)) return 5;
    }

    return base;
}

function isDetectorRailTriggeredAt(x, y, z) {
    const cx = x + 0.5;
    const cy = y + 0.0625;
    const cz = z + 0.5;
    const radius = 1.2;

    const playerFeetY = camera.position.y - PLAYER_FEET_OFFSET;
    if (
        Math.abs(camera.position.x - cx) <= radius &&
        Math.abs(camera.position.z - cz) <= radius &&
        Math.abs(playerFeetY - cy) <= 3.0
    ) {
        return true;
    }

    if (mobManager) {
        const groups = [
            mobManager.pigs, mobManager.chickens, mobManager.sheep, mobManager.cows, mobManager.wolves, mobManager.squids,
            mobManager.creepers, mobManager.zombies, mobManager.spiders, mobManager.skeletons, mobManager.zombiePigmen, mobManager.slimes, mobManager.ghasts
        ];
        for (const arr of groups) {
            if (!Array.isArray(arr)) continue;
            for (const m of arr) {
                if (!m || m._dead || !m.pos) continue;
                if (Math.abs(m.pos.x - cx) > radius) continue;
                if (Math.abs(m.pos.z - cz) > radius) continue;
                if (m.pos.y < (cy - 1.5) || m.pos.y > (cy + 2.5)) continue;
                return true;
            }
        }
    }

    return false;
}

function isRailDirectPowerAt(x, y, z) {
    const checks = [
        [x, y, z],
        [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1],
        [x, y + 1, z], [x, y - 1, z]
    ];
    for (const [sx, sy, sz] of checks) {
        if (isSourcePoweringTowards(sx, sy, sz, x, y, z)) return true;
    }
    return false;
}

function hasPoweredRailPathToDirectPower(x, y, z, shape, depth = 0, visited = null) {
    if (depth > 8) return false;
    if (isRailDirectPowerAt(x, y, z)) return true;
    const key = `${x},${y},${z}`;
    if (!visited) visited = new Set();
    if (visited.has(key)) return false;
    visited.add(key);

    const endpoints = getSpecialRailEndpoints(x, y, z, shape);
    for (const end of endpoints) {
        const candidates = [
            end,
            { x: end.x, y: end.y - 1, z: end.z },
            { x: end.x, y: end.y + 1, z: end.z }
        ];
        for (const c of candidates) {
            const nid = chunkManager.getBlock(c.x, c.y, c.z);
            if (!isPoweredRailId(nid)) continue;
            const nmeta = chunkManager.getMetadata(c.x, c.y, c.z) & 15;
            const nshape = normalizeSpecialRailShape(nmeta);
            if (hasPoweredRailPathToDirectPower(c.x, c.y, c.z, nshape, depth + 1, visited)) {
                return true;
            }
        }
    }
    return false;
}

function updateSingleRailState(x, y, z, emitDrop = true) {
    const id = chunkManager.getBlock(x, y, z);
    if (!isRailId(id)) return false;

    const belowId = chunkManager.getBlock(x, y - 1, z);
    if (!isSolidForRailSupport(belowId)) {
        markPlayerEditPriority();
        chunkManager.setBlock(x, y, z, 0);
        chunkManager.setMetadata(x, y, z, 0);
        updateModBlock(x, y, z, 0, 0);
        updateSurfaceColumnCacheForChunkColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: 0, metadata: 0, immediate: true } });
        if (emitDrop) {
            entityManager.spawnDrop(x, y, z, id, null, 0.1, null, { autoMagnet: true, kind: ITEM_STACK_KIND_BLOCK });
        }
        return true;
    }

    const currentMeta = chunkManager.getMetadata(x, y, z) & 15;
    let nextMeta = currentMeta;
    let currentShape = currentMeta & 7;
    let nextShape = currentShape;

    if (isSpecialRailId(id)) {
        const shape = computeSpecialRailShapeAt(x, y, z, currentMeta & 7);
        const powered = isPoweredRailId(id)
            ? hasPoweredRailPathToDirectPower(x, y, z, shape, 0, null)
            : isDetectorRailTriggeredAt(x, y, z);
        nextShape = shape & 7;
        nextMeta = nextShape | (powered ? 8 : 0);
    } else {
        nextMeta = computeRailMetadataAt(x, y, z, currentMeta);
        nextShape = nextMeta & 7;
    }

    if (nextMeta !== currentMeta) {
        markPlayerEditPriority();
        chunkManager.setMetadata(x, y, z, nextMeta);
        updateModBlock(x, y, z, id, nextMeta);
        markRepeatersDirtyAround(x, y, z);
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: nextMeta, immediate: true } });
        if (nextShape !== currentShape) {
            updateRailsAround(x, y, z, false);
        }
        return true;
    }
    return false;
}

function updateRailsAround(x, y, z, emitDrops = true) {
    for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
            updateSingleRailState(x + dx, y - 1, z + dz, emitDrops);
            updateSingleRailState(x + dx, y, z + dz, emitDrops);
            updateSingleRailState(x + dx, y + 1, z + dz, emitDrops);
        }
    }
}

function removeSignTextMeshAt(x, y, z) {
    const key = getKey(x, y, z);
    const mesh = signTextMeshes.get(key);
    if (!mesh) return;
    scene.remove(mesh);
    if (mesh.material?.map) mesh.material.map.dispose();
    if (mesh.material) mesh.material.dispose();
    if (mesh.geometry) mesh.geometry.dispose();
    signTextMeshes.delete(key);
}

function clearAllSignTextMeshes() {
    for (const mesh of signTextMeshes.values()) {
        scene.remove(mesh);
        if (mesh.material?.map) mesh.material.map.dispose();
        if (mesh.material) mesh.material.dispose();
        if (mesh.geometry) mesh.geometry.dispose();
    }
    signTextMeshes.clear();
}

function createSignTextMesh(x, y, z, id, meta, text) {
    const safeText = String(text || '').trim();
    if (!safeText) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(245, 245, 245, 0.95)';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = safeText.split('\n').slice(0, 2);
    if (lines.length === 1) {
        ctx.fillText(lines[0].slice(0, 24), canvas.width / 2, canvas.height / 2);
    } else {
        ctx.fillText(lines[0].slice(0, 24), canvas.width / 2, canvas.height * 0.35);
        ctx.fillText(lines[1].slice(0, 24), canvas.width / 2, canvas.height * 0.68);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(0.9, 0.45);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { isSignText: true };
    mesh.raycast = () => {};

    let yaw = 0;
    let px = x, py = y + 0.05, pz = z;
    if (isWallSignId(id)) {
        const m = meta & 15;
        const off = 0.03;
        if (m === 2) { // on south face
            pz = z + 0.5 - off;
            yaw = Math.PI;
        } else if (m === 3) { // on north face
            pz = z - 0.5 + off;
            yaw = 0;
        } else if (m === 4) { // on east face
            px = x + 0.5 - off;
            yaw = -Math.PI / 2;
        } else { // west face
            px = x - 0.5 + off;
            yaw = Math.PI / 2;
        }
    } else {
        const m = meta & 15;
        yaw = ((m / 16) * Math.PI * 2);
        py = y + 0.35;
    }
    mesh.position.set(px, py, pz);
    mesh.rotation.y = yaw;
    return mesh;
}

function refreshSignTextMeshAt(x, y, z) {
    removeSignTextMeshAt(x, y, z);
    const key = getKey(x, y, z);
    const id = chunkManager.getBlock(x, y, z);
    if (!isSignId(id)) return;
    const txt = signRegistry.get(key)?.text || '';
    if (!txt.trim()) return;
    const meta = chunkManager.getMetadata(x, y, z) & 15;
    const mesh = createSignTextMesh(x, y, z, id, meta, txt);
    if (!mesh) return;
    scene.add(mesh);
    signTextMeshes.set(key, mesh);
}

function rebuildSignTextMeshesFromRegistry() {
    clearAllSignTextMeshes();
    signRegistry.forEach((entry, key) => {
        const p = parseKey(key);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
        refreshSignTextMeshAt(p.x, p.y, p.z);
    });
}

let signMeshPruneTimer = 0;
function pruneSignTextMeshes(dt) {
    signMeshPruneTimer += dt;
    if (signMeshPruneTimer < 0.5) return;
    signMeshPruneTimer = 0;
    for (const [key, mesh] of signTextMeshes) {
        const p = parseKey(key);
        const id = chunkManager.getBlock(p.x, p.y, p.z);
        if (!isSignId(id)) {
            scene.remove(mesh);
            if (mesh.material?.map) mesh.material.map.dispose();
            if (mesh.material) mesh.material.dispose();
            if (mesh.geometry) mesh.geometry.dispose();
            signTextMeshes.delete(key);
            continue;
        }
        const cx = Math.floor(p.x / CHUNK_SIZE);
        const cy = Math.floor(p.y / CHUNK_SIZE);
        const cz = Math.floor(p.z / CHUNK_SIZE);
        mesh.visible = renderChunks.has(`${cx},${cy},${cz}`);
    }
}

function clearButtonReleaseTimers() {
    for (const t of buttonReleaseTimers.values()) clearTimeout(t);
    buttonReleaseTimers.clear();
}

function clearRepeaterRuntimeState() {
    repeaterDirtyKeys.clear();
    repeaterPendingTransitions.clear();
    repeaterGameTick = 0;
    repeaterTickAccumulator = 0;
    repeaterFullScanCooldown = 0;
    redstoneWireDirtyKeys.clear();
    redstoneWireFullScanCooldown = 0;
    redstoneTorchDirtyKeys.clear();
    redstoneTorchFullScanCooldown = 0;
    redstoneTorchToggleTimes.clear();
    redstoneTorchBurnoutUntil.clear();
    redstoneTorchClock = 0;
    pistonDirtyKeys.clear();
    pistonPendingEvents.clear();
    pistonTickAccumulator = 0;
    pistonFullScanCooldown = 0;
    pistonGameTick = 0;
    redstoneActuatorPrevPowered.clear();
    redstoneActuatorTickAccumulator = 0;
    redstoneTickChunkFeatureCache.clear();
}

function forEachTickableGeneratedChunk(visitor) {
    if (typeof visitor !== 'function') return;
    for (const key of renderChunks.keys()) {
        const c = chunkManager.chunks.get(key);
        if (!c || !c.isGenerated) continue;
        visitor(c, key);
    }
}

function getChunkKeyFromWorld(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return `${cx},${cy},${cz}`;
}

function invalidateTickChunkFeatureCacheAt(x, y, z) {
    redstoneTickChunkFeatureCache.delete(getChunkKeyFromWorld(x, y, z));
}

function scanTickChunkFeatureFlags(c) {
    let hasRails = false;
    let hasActuators = false;
    let hasWire = false;
    let hasTorch = false;
    let hasRepeater = false;
    let hasPiston = false;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                const id = c.getBlock(lx, ly, lz);
                if (!id) continue;
                if (!hasRails && isRailId(id)) hasRails = true;
                if (!hasActuators && (isDoorLikeId(id) || isTrapdoorId(id) || isDispenserId(id))) hasActuators = true;
                if (!hasWire && isRedstoneWireId(id)) hasWire = true;
                if (!hasTorch && (id === 75 || id === 76)) hasTorch = true;
                if (!hasRepeater && isRepeaterId(id)) hasRepeater = true;
                if (!hasPiston && isPistonId(id)) hasPiston = true;
                if (hasRails && hasActuators && hasWire && hasTorch && hasRepeater && hasPiston) {
                    return { hasRails, hasActuators, hasWire, hasTorch, hasRepeater, hasPiston };
                }
            }
        }
    }
    return { hasRails, hasActuators, hasWire, hasTorch, hasRepeater, hasPiston };
}

function getTickChunkFeatureFlags(c, key = null) {
    const chunkKey = key || `${c.cx},${c.cy},${c.cz}`;
    const now = Date.now();
    const cached = redstoneTickChunkFeatureCache.get(chunkKey);
    if (cached && (now - cached.scannedAt) <= REDSTONE_TICK_CHUNK_FEATURE_TTL_MS) {
        return cached;
    }
    const flags = scanTickChunkFeatureFlags(c);
    const next = { ...flags, scannedAt: now };
    redstoneTickChunkFeatureCache.set(chunkKey, next);
    return next;
}

function clearFishingBobber() {
    if (!fishingBobberDrop) return;
    entityManager.removeDrop(fishingBobberDrop);
    fishingBobberDrop = null;
}

function tickFishingBobberState(dt) {
    if (!fishingBobberDrop) return;
    const bx = Math.floor(fishingBobberDrop.position.x);
    const by = Math.floor(fishingBobberDrop.position.y);
    const bz = Math.floor(fishingBobberDrop.position.z);
    const inWater = isWaterId(chunkManager.getBlock(bx, by, bz)) || isWaterId(chunkManager.getBlock(bx, by - 1, bz));
    const dtTicks = Math.max(1, Math.round(dt * GAME_TICKS_PER_SECOND));
    if (!Number.isFinite(fishingBobberDrop.fishWaitTicks)) {
        fishingBobberDrop.fishWaitTicks = 100 + Math.floor(Math.random() * 801); // 5..45s
    }
    if (!Number.isFinite(fishingBobberDrop.fishCatchableTicks)) {
        fishingBobberDrop.fishCatchableTicks = 0;
    }
    fishingBobberDrop.fishingInWater = !!inWater;
    if (!inWater) {
        fishingBobberDrop.fishCatchableTicks = 0;
        fishingBobberDrop.fishWaitTicks = 100 + Math.floor(Math.random() * 801);
        return;
    }
    if (fishingBobberDrop.fishCatchableTicks > 0) {
        fishingBobberDrop.fishCatchableTicks = Math.max(0, fishingBobberDrop.fishCatchableTicks - dtTicks);
        return;
    }
    fishingBobberDrop.fishWaitTicks = Math.max(0, fishingBobberDrop.fishWaitTicks - dtTicks);
    if (fishingBobberDrop.fishWaitTicks <= 0) {
        fishingBobberDrop.fishCatchableTicks = 10 + Math.floor(Math.random() * 31); // 10..40 ticks
        fishingBobberDrop.fishWaitTicks = 100 + Math.floor(Math.random() * 801);
    }
    if (fishingBobberDrop.hookedDrop) {
        const hd = fishingBobberDrop.hookedDrop;
        if (!entityManager?.drops?.includes(hd) || !hd.mesh?.userData?.physicsPos) {
            fishingBobberDrop.hookedDrop = null;
        }
    }
    if (!fishingBobberDrop.hookedDrop && Array.isArray(entityManager?.drops)) {
        const hx = fishingBobberDrop.position.x;
        const hy = fishingBobberDrop.position.y;
        const hz = fishingBobberDrop.position.z;
        let best = null;
        let bestD2 = 0.75 * 0.75;
        for (const d of entityManager.drops) {
            if (!d || d === fishingBobberDrop || !d.mesh || !d.mesh.userData?.physicsPos) continue;
            const px = d.mesh.userData.physicsPos.x;
            const py = d.mesh.userData.physicsPos.y;
            const pz = d.mesh.userData.physicsPos.z;
            const dx = px - hx;
            const dy = py - hy;
            const dz = pz - hz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) {
                best = d;
                bestD2 = d2;
            }
        }
        if (best) fishingBobberDrop.hookedDrop = best;
    }
}

function tickRails(dt) {
    railTickAccumulator += dt;
    if (railTickAccumulator < RAIL_TICK_SECONDS) return;
    railTickAccumulator = 0;
    forEachTickableGeneratedChunk((c, key) => {
        const flags = getTickChunkFeatureFlags(c, key);
        if (!flags.hasRails) return;
        const baseX = c.cx * CHUNK_SIZE;
        const baseY = c.cy * CHUNK_SIZE;
        const baseZ = c.cz * CHUNK_SIZE;
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    const id = c.getBlock(lx, ly, lz);
                    if (!isRailId(id)) continue;
                    updateSingleRailState(baseX + lx, baseY + ly, baseZ + lz, false);
                }
            }
        }
    });
}

function getRepeaterForward(meta = 0) {
    switch (meta & 3) {
        case 0: return { x: 0, z: -1 };  // north
        case 1: return { x: 1, z: 0 };   // east
        case 2: return { x: 0, z: 1 };   // south
        case 3: return { x: -1, z: 0 };  // west
        default: return { x: 0, z: -1 };
    }
}

function markRepeaterDirtyAt(x, y, z) {
    const id = chunkManager.getBlock(x, y, z);
    if (!isRepeaterId(id)) return;
    repeaterDirtyKeys.add(getKey(x, y, z));
}

function compareWorldKeys(a, b) {
    const pa = parseKey(a);
    const pb = parseKey(b);
    if (!pa && !pb) return String(a).localeCompare(String(b));
    if (!pa) return 1;
    if (!pb) return -1;
    if (pa.x !== pb.x) return pa.x - pb.x;
    if (pa.y !== pb.y) return pa.y - pb.y;
    return pa.z - pb.z;
}

function getDeterministicKeyList(setLike) {
    const list = Array.from(setLike || []);
    list.sort(compareWorldKeys);
    return list;
}

function resolvePlacementBlockIdForStack(stack, kind) {
    const stackId = Number(stack?.id);
    if (!Number.isFinite(stackId)) return 0;
    const key = `${kind}:${stackId}`;
    const mapped = EXPLICIT_ITEM_TO_BLOCK_PLACEMENT.get(key);
    if (Number.isFinite(mapped)) return mapped;
    if (kind === ITEM_STACK_KIND_ITEM) {
        if (stackId === 82) return 68; // Beta reeds item -> reeds block family
        if (stackId === SIGN_ITEM_ID) return SIGN_POST_BLOCK_ID;
        if (stackId === WOOD_DOOR_ITEM_ID) return WOOD_DOOR_BLOCK_ID;
        if (stackId === IRON_DOOR_ITEM_ID) return IRON_DOOR_BLOCK_ID;
        if (stackId === LADDER_ITEM_ID) return LADDER_BLOCK_ID;
        if (stackId === PAINTING_ITEM_ID) return PAINTING_BLOCK_ID;
        if (stackId === BOAT_ITEM_ID) return BOAT_BLOCK_ID;
        if (stackId === MINECART_ITEM_ID) return MINECART_BLOCK_ID;
    }
    return stackId;
}

function resolveBoatAnchorFromCell(x, y, z) {
    const bx = Math.floor(Number(x));
    const by = Math.floor(Number(y));
    const bz = Math.floor(Number(z));
    if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return null;
    if (!isWaterId(chunkManager.getBlock(bx, by, bz))) return null;
    let surfaceY = by;
    while (surfaceY + 1 < WORLD_HEIGHT && isWaterId(chunkManager.getBlock(bx, surfaceY + 1, bz))) {
        surfaceY++;
    }
    if (chunkManager.getBlock(bx, surfaceY + 1, bz) !== 0) return null;
    return { x: bx, y: surfaceY, z: bz };
}

function resolveBoatAnchorFromTargetBlock(tb) {
    if (!tb || !tb.face || !tb.face.normal) return null;
    const x = Math.floor(Number(tb.x));
    const y = Math.floor(Number(tb.y));
    const z = Math.floor(Number(tb.z));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    const nx = x + Math.round(Number(tb.face.normal.x) || 0);
    const ny = y + Math.round(Number(tb.face.normal.y) || 0);
    const nz = z + Math.round(Number(tb.face.normal.z) || 0);
    const candidates = [
        [x, y, z],
        [nx, ny, nz],
        [nx, ny - 1, nz],
        [x, y + 1, z]
    ];
    for (const [cx, cy, cz] of candidates) {
        const anchor = resolveBoatAnchorFromCell(cx, cy, cz);
        if (anchor) return anchor;
    }
    return null;
}

function resolveBoatAnchorFromView(maxDistance = 6.0) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    if (dir.lengthSq() < 1e-9) return null;
    dir.normalize();
    const origin = camera.position.clone();
    const step = 0.15;
    for (let t = 0.4; t <= maxDistance; t += step) {
        const px = origin.x + dir.x * t;
        const py = origin.y + dir.y * t;
        const pz = origin.z + dir.z * t;
        const bx = Math.floor(px);
        const by = Math.floor(py);
        const bz = Math.floor(pz);
        for (let oy = 2; oy >= -4; oy--) {
            const anchor = resolveBoatAnchorFromCell(bx, by + oy, bz);
            if (anchor) return anchor;
        }
    }
    return null;
}

function resolveBoatAnchorFromWaterRay(maxDistance = 6.0) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    if (dir.lengthSq() < 1e-9) return null;
    dir.normalize();
    const origin = camera.position.clone();
    const step = 0.08;
    for (let t = 0.3; t <= maxDistance; t += step) {
        const px = origin.x + dir.x * t;
        const py = origin.y + dir.y * t;
        const pz = origin.z + dir.z * t;
        const bx = Math.floor(px);
        const by = Math.floor(py);
        const bz = Math.floor(pz);
        const id = chunkManager.getBlock(bx, by, bz);
        if (!isWaterId(id)) continue;
        const anchor = resolveBoatAnchorFromCell(bx, by, bz) || resolveBoatAnchorFromCell(bx, by - 1, bz);
        if (anchor) return anchor;
    }
    return null;
}

function resolveBoatAnchorNearPlayer(radius = 3) {
    const cx = Math.floor(camera.position.x);
    const cy = Math.floor(camera.position.y);
    const cz = Math.floor(camera.position.z);
    let best = null;
    let bestD2 = Infinity;
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            const wx = cx + dx;
            const wz = cz + dz;
            for (let oy = 2; oy >= -4; oy--) {
                const anchor = resolveBoatAnchorFromCell(wx, cy + oy, wz);
                if (!anchor) continue;
                const ddx = (anchor.x - camera.position.x);
                const ddz = (anchor.z - camera.position.z);
                const d2 = ddx * ddx + ddz * ddz;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    best = anchor;
                }
            }
        }
    }
    return best;
}

function isTargetingVehicleEntity() {
    return !!(targetBlock && targetBlock.object && targetBlock.object.userData && targetBlock.object.userData.isVehicleEntity);
}

function getTargetVehicleEntity(maxDistance = 4.5) {
    if (!isTargetingVehicleEntity()) return null;
    const vehicle = entityManager.getTransportByMesh(targetBlock.object);
    if (!vehicle || !vehicle.mesh) return null;
    const dx = vehicle.mesh.position.x - camera.position.x;
    const dy = vehicle.mesh.position.y - camera.position.y;
    const dz = vehicle.mesh.position.z - camera.position.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const maxD = Number(maxDistance);
    if (!Number.isFinite(maxD) || maxD <= 0) return vehicle;
    return d2 <= (maxD * maxD) ? vehicle : null;
}

function toggleMountTargetVehicle() {
    if (IS_PAUSED || IS_INVENTORY_OPEN || IS_CHAT_OPEN) return false;
    const vehicle = getTargetVehicleEntity(4.0);
    if (!vehicle) return false;
    const mounted = entityManager.getMountedTransport();
    if (mounted && mounted.id === vehicle.id) return true;
    entityManager.mountTransport(vehicle);
    return true;
}

function removeTargetVehicleEntity(dropItem = true) {
    const vehicle = getTargetVehicleEntity();
    if (!vehicle) return false;
    entityManager.removeTransport(vehicle, dropItem);
    return true;
}

function getPaintingMetaFromNormal(normal) {
    if (!normal) return null;
    const nx = Math.round(Number(normal.x) || 0);
    const ny = Math.round(Number(normal.y) || 0);
    const nz = Math.round(Number(normal.z) || 0);
    if (ny !== 0) return null;
    if (nz === 1) return 3;
    if (nz === -1) return 2;
    if (nx === 1) return 5;
    if (nx === -1) return 4;
    return null;
}

function placePaintingAtTarget(x, y, z, normal) {
    const nx = x + Math.round(Number(normal?.x) || 0);
    const ny = y + Math.round(Number(normal?.y) || 0);
    const nz = z + Math.round(Number(normal?.z) || 0);
    const meta = getPaintingMetaFromNormal(normal);
    if (meta == null) return false;
    if (chunkManager.getBlock(nx, ny, nz) !== 0) return false;
    const supportId = chunkManager.getBlock(x, y, z);
    if (!isSolidForRailSupport(supportId)) return false;

    markPlayerEditPriority();
    chunkManager.setBlock(nx, ny, nz, PAINTING_BLOCK_ID);
    chunkManager.setMetadata(nx, ny, nz, meta);
    updateModBlock(nx, ny, nz, PAINTING_BLOCK_ID, meta);
    updateSurfaceColumnCacheForChunkColumn(Math.floor(nx / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE));
    fallingBlockManager.markDirty(nx, ny, nz);
    if (chunkWorker) {
        chunkWorker.postMessage({ type: 'setBlock', data: { x: nx, y: ny, z: nz, id: PAINTING_BLOCK_ID, metadata: meta, immediate: true } });
    }
    updateDependentsAround(nx, ny, nz, true);
    return true;
}

function markPistonDirtyAt(x, y, z) {
    const id = chunkManager.getBlock(x, y, z);
    if (!isPistonId(id)) return;
    pistonDirtyKeys.add(getKey(x, y, z));
}

function determinePistonPlacementMeta(x, y, z) {
    // Orientation is determined by head/look angle only.
    const lookDir = new THREE.Vector3();
    camera.getWorldDirection(lookDir);
    const verticalLookThreshold = 0.75;
    if (lookDir.y >= verticalLookThreshold) return 5; // looking up -> piston faces down (toward player)
    if (lookDir.y <= -verticalLookThreshold) return 4; // looking down -> piston faces up (toward player)

    // Horizontal mapping from quantized yaw.
    // l=0 -> north, l=1 -> east, l=2 -> south, l=3 -> west
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const yawDeg = ((Math.atan2(-dir.x, dir.z) * 180 / Math.PI) + 360) % 360;
    const l = (Math.floor((yawDeg * 4.0 / 360.0) + 0.5) & 3);
    if (l === 0) return 2; // north
    if (l === 1) return 3; // east
    if (l === 2) return 0; // south
    return 1; // west
}

function markRepeatersDirtyAround(x, y, z) {
    for (const [dx, dy, dz] of REDSTONE_FANOUT_OFFSETS) {
        markRepeaterDirtyAt(x + dx, y + dy, z + dz);
        markPistonDirtyAt(x + dx, y + dy, z + dz);
    }
    markRedstoneWireDirtyAround(x, y, z);
    markRedstoneTorchDirtyAround(x, y, z);
}

function getPistonFacing(meta = 0) {
    const m = meta & 7;
    // Beta orientation parity baseline:
    // 0: +Z, 1: -X, 2: -Z, 3: +X, 4: +Y, 5: -Y
    if (m === 0) return { x: 0, y: 0, z: 1 };
    if (m === 1) return { x: -1, y: 0, z: 0 };
    if (m === 2) return { x: 0, y: 0, z: -1 };
    if (m === 3) return { x: 1, y: 0, z: 0 };
    if (m === 4) return { x: 0, y: 1, z: 0 };
    if (m === 5) return { x: 0, y: -1, z: 0 };
    return { x: 0, y: 0, z: 1 };
}

function isPistonPushableBlock(id, x, y, z) {
    if (id === 0) return true;
    if (id === 8) return false; // bedrock
    if (isObsidianId(id)) return false;
    if (id === 90) return false; // portal
    if (isFluidId(id)) return false;
    if (id === 63) return false; // fire
    if (isChestId(id) || isFurnaceId(id) || isDispenserId(id)) return false;
    if (isDoorId(id) || isBedBlockId(id)) return false;
    if (isSignId(id) || isPaintingId(id) || isLadderId(id)) return false;
    if (isPistonId(id)) {
        const m = chunkManager.getMetadata(x, y, z) & 15;
        if ((m & 8) !== 0) return false; // extended pistons are immovable
    }
    return true;
}

function collectPistonPushChain(baseX, baseY, baseZ, facing) {
    const chain = [];
    let cx = baseX + facing.x;
    let cy = baseY + facing.y;
    let cz = baseZ + facing.z;
    for (let i = 0; i <= PISTON_PUSH_LIMIT; i++) {
        const id = chunkManager.getBlock(cx, cy, cz);
        if (id === 0) {
            return { ok: true, chain };
        }
        if (!isPistonPushableBlock(id, cx, cy, cz)) {
            return { ok: false, chain: [] };
        }
        chain.push({ x: cx, y: cy, z: cz, id, meta: chunkManager.getMetadata(cx, cy, cz) & 15 });
        cx += facing.x;
        cy += facing.y;
        cz += facing.z;
    }
    return { ok: false, chain: [] };
}

function setPistonExtendedState(x, y, z, id, meta, extended) {
    const nextMeta = extended ? ((meta & 7) | 8) : (meta & 7);
    if ((meta & 15) === nextMeta) return;
    markPlayerEditPriority();
    chunkManager.setMetadata(x, y, z, nextMeta);
    updateModBlock(x, y, z, id, nextMeta);
    if (chunkWorker) {
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: nextMeta, immediate: true } });
    }
    requestChunkGeometryAt(x, y, z);
    markRepeatersDirtyAround(x, y, z);
}

function applyPistonBlockMoves(updates) {
    if (!Array.isArray(updates) || updates.length === 0) return;
    applyBlockChangesAndSync(updates, { immediate: true });
    for (const u of updates) {
        if (!u) continue;
        markPistonDirtyAt(u.x, u.y, u.z);
    }
}

function tryExtendPistonAt(x, y, z, id, meta) {
    const facing = getPistonFacing(meta);
    const push = collectPistonPushChain(x, y, z, facing);
    if (!push.ok) return false;
    const updates = [];
    for (let i = push.chain.length - 1; i >= 0; i--) {
        const src = push.chain[i];
        updates.push({
            x: src.x + facing.x,
            y: src.y + facing.y,
            z: src.z + facing.z,
            id: src.id,
            metadata: src.meta
        });
    }
    updates.push({
        x: x + facing.x,
        y: y + facing.y,
        z: z + facing.z,
        id: 0,
        metadata: 0
    });
    applyPistonBlockMoves(updates);
    setPistonExtendedState(x, y, z, id, meta, true);
    markRepeatersDirtyAround(x, y, z);
    markPistonDirtyAt(x + facing.x, y + facing.y, z + facing.z);
    return true;
}

function tryRetractPistonAt(x, y, z, id, meta) {
    const facing = getPistonFacing(meta);
    setPistonExtendedState(x, y, z, id, meta, false);
    if (id !== 29) { // sticky piston only
        return true;
    }
    const frontX = x + facing.x;
    const frontY = y + facing.y;
    const frontZ = z + facing.z;
    if (chunkManager.getBlock(frontX, frontY, frontZ) !== 0) {
        return true;
    }
    const pullX = frontX + facing.x;
    const pullY = frontY + facing.y;
    const pullZ = frontZ + facing.z;
    const pullId = chunkManager.getBlock(pullX, pullY, pullZ);
    if (pullId === 0 || !isPistonPushableBlock(pullId, pullX, pullY, pullZ)) return true;
    const pullMeta = chunkManager.getMetadata(pullX, pullY, pullZ) & 15;
    applyPistonBlockMoves([
        { x: frontX, y: frontY, z: frontZ, id: pullId, metadata: pullMeta },
        { x: pullX, y: pullY, z: pullZ, id: 0, metadata: 0 }
    ]);
    markRepeatersDirtyAround(x, y, z);
    markPistonDirtyAt(frontX, frontY, frontZ);
    return true;
}

function isPistonPoweredAt(x, y, z) {
    const dirs = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];
    for (const [dx, dy, dz] of dirs) {
        const sx = x + dx;
        const sy = y + dy;
        const sz = z + dz;
        if (isSourcePoweringTowards(sx, sy, sz, x, y, z)) return true;
    }
    // Beta quasi-connectivity baseline: pistons can be indirectly powered
    // through the block above even without direct side/back power.
    if (isBlockReceivingPower(x, y + 1, z)) return true;
    return false;
}

function igniteAdjacentTntFromRedstoneSource(x, y, z) {
    if (!tntManager) return false;
    let ignited = false;
    const dirs = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];
    for (const [dx, dy, dz] of dirs) {
        const tx = x + dx;
        const ty = y + dy;
        const tz = z + dz;
        if (!isTntId(chunkManager.getBlock(tx, ty, tz))) continue;
        if (!isSourcePoweringTowards(x, y, z, tx, ty, tz)) continue;
        ignited = tntManager.igniteAt(tx, ty, tz) || ignited;
    }
    return ignited;
}

function isSolidRedstoneConductorId(id) {
    if (!id || id === 0) return false;
    if (isFluidId(id)) return false;
    if (isRedstoneWireId(id) || isTorchId(id) || isRepeaterId(id)) return false;
    if (isButtonId(id) || isPressurePlateId(id) || isLeverId(id)) return false;
    if (isRailId(id) || isTrapdoorId(id) || isDoorId(id) || isSignId(id) || isPaintingId(id)) return false;
    if (isLadderId(id) || isFlowerId(id) || isMushroomId(id) || isTallGrassId(id) || isDeadBushId(id)) return false;
    if (isReedId(id) || isCropId(id) || isCakeBlockId(id) || isBedBlockId(id)) return false;
    return isBlockOpaque(id);
}

function isStrongPowerEmitterTowards(sourceX, sourceY, sourceZ, toX, toY, toZ) {
    const sid = chunkManager.getBlock(sourceX, sourceY, sourceZ);
    if (sid === 0) return false;
    if (isLeverId(sid)) {
        const sm = chunkManager.getMetadata(sourceX, sourceY, sourceZ) & 15;
        return isLeverPoweringTowards(sourceX, sourceY, sourceZ, sm, toX, toY, toZ);
    }
    if (isButtonId(sid)) {
        const sm = chunkManager.getMetadata(sourceX, sourceY, sourceZ) & 15;
        if ((sm & 8) === 0) return false;
        const orient = sm & 7;
        if (orient === 1) return toX === sourceX && toY === sourceY && toZ === sourceZ + 1;
        if (orient === 2) return toX === sourceX && toY === sourceY && toZ === sourceZ - 1;
        if (orient === 3) return toX === sourceX - 1 && toY === sourceY && toZ === sourceZ;
        if (orient === 4) return toX === sourceX + 1 && toY === sourceY && toZ === sourceZ;
        return false;
    }
    if (isPressurePlateId(sid)) {
        const sm = chunkManager.getMetadata(sourceX, sourceY, sourceZ) & 15;
        if ((sm & 1) === 0) return false;
        return toX === sourceX && toY === sourceY - 1 && toZ === sourceZ;
    }
    if (sid === 76) return true; // lit redstone torch
    if (sid === 75) return false;
    if (isRepeaterId(sid)) {
        if (sid !== 94) return false;
        const sm = chunkManager.getMetadata(sourceX, sourceY, sourceZ) & 15;
        const sf = getRepeaterForward(sm);
        return (sourceX + sf.x) === toX && sourceY === toY && (sourceZ + sf.z) === toZ;
    }
    return false;
}

function isSolidBlockStronglyPowered(x, y, z) {
    const sid = chunkManager.getBlock(x, y, z);
    if (!isSolidRedstoneConductorId(sid)) return false;
    const dirs = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];
    for (const [dx, dy, dz] of dirs) {
        const sx = x + dx;
        const sy = y + dy;
        const sz = z + dz;
        if (isStrongPowerEmitterTowards(sx, sy, sz, x, y, z)) return true;
    }
    return false;
}

function isBlockReceivingPower(x, y, z) {
    const dirs = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];
    for (const [dx, dy, dz] of dirs) {
        const sx = x + dx;
        const sy = y + dy;
        const sz = z + dz;
        if (isSourcePoweringTowards(sx, sy, sz, x, y, z)) return true;
    }
    return false;
}

function hasAdjacentPoweredLever(x, y, z) {
    const dirs = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];
    for (const [dx, dy, dz] of dirs) {
        const sx = x + dx;
        const sy = y + dy;
        const sz = z + dz;
        const sid = chunkManager.getBlock(sx, sy, sz);
        if (!isLeverId(sid)) continue;
        const sm = chunkManager.getMetadata(sx, sy, sz) & 15;
        if ((sm & 8) !== 0) return true;
    }
    return false;
}

function isDoorLikeId(id) {
    if (isDoorId(id)) return true;
    const def = getRuntimeBlockDef(id);
    return def?.type === 'door';
}

function getWireNeighborCoords(x, y, z) {
    const out = [];
    const dirs = [
        [1, 0], [-1, 0], [0, 1], [0, -1]
    ];
    for (const [dx, dz] of dirs) {
        const nx = x + dx;
        const nz = z + dz;
        out.push({ x: nx, y, z: nz }); // horizontal
        const sideId = chunkManager.getBlock(nx, y, nz);
        if (isSolidRedstoneConductorId(sideId) && isRedstoneWireId(chunkManager.getBlock(nx, y + 1, nz))) {
            out.push({ x: nx, y: y + 1, z: nz }); // up slope
        } else if (!isSolidRedstoneConductorId(sideId) && isRedstoneWireId(chunkManager.getBlock(nx, y - 1, nz))) {
            out.push({ x: nx, y: y - 1, z: nz }); // down slope
        }
    }
    return out;
}

function markRedstoneWireDirtyAt(x, y, z) {
    if (!isRedstoneWireId(chunkManager.getBlock(x, y, z))) return;
    redstoneWireDirtyKeys.add(getKey(x, y, z));
}

function markRedstoneWireDirtyAround(x, y, z) {
    for (const [dx, dy, dz] of REDSTONE_FANOUT_OFFSETS) {
        markRedstoneWireDirtyAt(x + dx, y + dy, z + dz);
    }
}

function isWireDirectlyPoweredByEmitter(x, y, z) {
    const dirs = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];
    for (const [dx, dy, dz] of dirs) {
        if (isStrongPowerEmitterTowards(x + dx, y + dy, z + dz, x, y, z)) return true;
        if (isSolidBlockStronglyPowered(x + dx, y + dy, z + dz)) return true;
    }
    return false;
}

function computeWireTargetPower(x, y, z) {
    if (!isRedstoneWireId(chunkManager.getBlock(x, y, z))) return 0;
    let best = isWireDirectlyPoweredByEmitter(x, y, z) ? 15 : 0;
    const neighbors = getWireNeighborCoords(x, y, z);
    for (const n of neighbors) {
        if (!isRedstoneWireId(chunkManager.getBlock(n.x, n.y, n.z))) continue;
        const p = chunkManager.getMetadata(n.x, n.y, n.z) & 15;
        if (p > 0) best = Math.max(best, p - 1);
    }
    return Math.max(0, Math.min(15, best));
}

function setWirePowerMeta(x, y, z, power) {
    const id = chunkManager.getBlock(x, y, z);
    if (!isRedstoneWireId(id)) return false;
    const clamped = Math.max(0, Math.min(15, Math.floor(Number(power) || 0)));
    const prev = chunkManager.getMetadata(x, y, z) & 15;
    if (prev === clamped) return false;
    markPlayerEditPriority(90);
    chunkManager.setMetadata(x, y, z, clamped);
    updateModBlock(x, y, z, id, clamped);
    if (chunkWorker) {
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: clamped, immediate: true } });
    }
    requestChunkGeometryAt(x, y, z);
    markRepeatersDirtyAround(x, y, z);
    if (clamped > 0) igniteAdjacentTntFromRedstoneSource(x, y, z);
    return true;
}

function tickRedstoneWires(dt) {
    if (dt <= 0) return;
    redstoneWireFullScanCooldown -= dt;
    if (redstoneWireFullScanCooldown <= 0) {
        redstoneWireFullScanCooldown = REDSTONE_WIRE_FULL_SCAN_INTERVAL;
        forEachTickableGeneratedChunk((c, key) => {
            const flags = getTickChunkFeatureFlags(c, key);
            if (!flags.hasWire) return;
            const baseX = c.cx * CHUNK_SIZE;
            const baseY = c.cy * CHUNK_SIZE;
            const baseZ = c.cz * CHUNK_SIZE;
            for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                        if (!isRedstoneWireId(c.getBlock(lx, ly, lz))) continue;
                        redstoneWireDirtyKeys.add(getKey(baseX + lx, baseY + ly, baseZ + lz));
                    }
                }
            }
        });
    }
    if (redstoneWireDirtyKeys.size === 0) return;
    const networkKeys = new Set();
    const queue = getDeterministicKeyList(redstoneWireDirtyKeys);
    redstoneWireDirtyKeys.clear();
    while (queue.length > 0) {
        const key = queue.pop();
        if (networkKeys.has(key)) continue;
        const p = parseKey(key);
        if (!p) continue;
        const { x, y, z } = p;
        if (!isRedstoneWireId(chunkManager.getBlock(x, y, z))) continue;
        networkKeys.add(key);
        for (const n of getWireNeighborCoords(x, y, z)) {
            if (!isRedstoneWireId(chunkManager.getBlock(n.x, n.y, n.z))) continue;
            const nk = getKey(n.x, n.y, n.z);
            if (!networkKeys.has(nk)) queue.push(nk);
        }
    }
    if (networkKeys.size === 0) return;

    const orderedKeys = getDeterministicKeyList(networkKeys);
    const networkSet = new Set(orderedKeys);
    const nextPower = new Map();
    const bfsQueue = [];

    for (const key of orderedKeys) {
        const p = parseKey(key);
        if (!p) continue;
        const { x, y, z } = p;
        if (!isRedstoneWireId(chunkManager.getBlock(x, y, z))) continue;
        const directPower = isWireDirectlyPoweredByEmitter(x, y, z) ? 15 : 0;
        nextPower.set(key, directPower);
        if (directPower > 0) bfsQueue.push({ key, power: directPower });
    }

    while (bfsQueue.length > 0) {
        const cur = bfsQueue.shift();
        if (!cur || (cur.power | 0) <= 1) continue;
        const p = parseKey(cur.key);
        if (!p) continue;
        const { x, y, z } = p;
        for (const n of getWireNeighborCoords(x, y, z)) {
            const nk = getKey(n.x, n.y, n.z);
            if (!networkSet.has(nk)) continue;
            if (!isRedstoneWireId(chunkManager.getBlock(n.x, n.y, n.z))) continue;
            const candidate = (cur.power | 0) - 1;
            if (candidate <= (nextPower.get(nk) | 0)) continue;
            nextPower.set(nk, candidate);
            bfsQueue.push({ key: nk, power: candidate });
        }
    }

    const pendingUpdates = [];
    for (const key of orderedKeys) {
        const p = parseKey(key);
        if (!p) continue;
        const { x, y, z } = p;
        if (!isRedstoneWireId(chunkManager.getBlock(x, y, z))) continue;
        const target = nextPower.get(key) | 0;
        const current = chunkManager.getMetadata(x, y, z) & 15;
        if (current === target) continue;
        pendingUpdates.push({ x, y, z, id: 55, metadata: target });
        markRedstoneWireDirtyAround(x, y, z);
    }
    if (pendingUpdates.length > 0) {
        applyBlockChangesAndSync(pendingUpdates, { immediate: true });
    }
}

function getTorchAttachedBlockCoord(x, y, z, meta) {
    const m = meta & 7;
    if (m === 5) return { x, y: y - 1, z }; // floor torch
    if (m === 1) return { x, y, z: z + 1 }; // north-facing on block south side
    if (m === 2) return { x, y, z: z - 1 }; // south-facing on block north side
    if (m === 3) return { x: x - 1, y, z }; // east-facing on block west side
    if (m === 4) return { x: x + 1, y, z }; // west-facing on block east side
    return { x, y: y - 1, z };
}

function isBlockPoweredForTorchInversion(blockX, blockY, blockZ, ignoreTorchX = null, ignoreTorchY = null, ignoreTorchZ = null) {
    const dirs = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];
    for (const [dx, dy, dz] of dirs) {
        const sx = blockX + dx;
        const sy = blockY + dy;
        const sz = blockZ + dz;
        if (
            Number.isFinite(ignoreTorchX) &&
            sx === ignoreTorchX && sy === ignoreTorchY && sz === ignoreTorchZ
        ) continue;
        if (isSourcePoweringTowards(sx, sy, sz, blockX, blockY, blockZ)) return true;
    }
    return false;
}

function markRedstoneTorchDirtyAt(x, y, z) {
    const id = chunkManager.getBlock(x, y, z);
    if (id !== 75 && id !== 76) return;
    redstoneTorchDirtyKeys.add(getKey(x, y, z));
}

function markRedstoneTorchDirtyAround(x, y, z) {
    for (const [dx, dy, dz] of REDSTONE_FANOUT_OFFSETS) {
        markRedstoneTorchDirtyAt(x + dx, y + dy, z + dz);
    }
}

function recordTorchToggleAt(key, nowSeconds) {
    let history = redstoneTorchToggleTimes.get(key);
    if (!Array.isArray(history)) history = [];
    history.push(nowSeconds);
    const windowStart = nowSeconds - REDSTONE_TORCH_BURNOUT_WINDOW_SECONDS;
    while (history.length > 0 && history[0] < windowStart) history.shift();
    redstoneTorchToggleTimes.set(key, history);
    return history.length;
}

function setRedstoneTorchBlockState(x, y, z, targetOn, meta) {
    const currentId = chunkManager.getBlock(x, y, z);
    if (currentId !== 75 && currentId !== 76) return false;
    const nextId = targetOn ? 76 : 75;
    if (nextId === currentId) return false;
    markPlayerEditPriority(90);
    chunkManager.setBlock(x, y, z, nextId);
    chunkManager.setMetadata(x, y, z, meta & 15);
    updateModBlock(x, y, z, nextId, meta & 15);
    if (chunkWorker) {
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: nextId, metadata: meta & 15, immediate: true } });
    }
    requestChunkGeometryAt(x, y, z);
    markRedstoneWireDirtyAround(x, y, z);
    markRepeatersDirtyAround(x, y, z);
    if (targetOn) igniteAdjacentTntFromRedstoneSource(x, y, z);
    return true;
}

function tickRedstoneTorches(dt) {
    if (dt <= 0) return;
    redstoneTorchClock += dt;
    redstoneTorchFullScanCooldown -= dt;
    if (redstoneTorchFullScanCooldown <= 0) {
        redstoneTorchFullScanCooldown = REDSTONE_TORCH_FULL_SCAN_INTERVAL;
        forEachTickableGeneratedChunk((c, key) => {
            const flags = getTickChunkFeatureFlags(c, key);
            if (!flags.hasTorch) return;
            const baseX = c.cx * CHUNK_SIZE;
            const baseY = c.cy * CHUNK_SIZE;
            const baseZ = c.cz * CHUNK_SIZE;
            for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                        const id = c.getBlock(lx, ly, lz);
                        if (id !== 75 && id !== 76) continue;
                        redstoneTorchDirtyKeys.add(getKey(baseX + lx, baseY + ly, baseZ + lz));
                    }
                }
            }
        });
    }
    if (redstoneTorchDirtyKeys.size === 0) return;
    const keys = getDeterministicKeyList(redstoneTorchDirtyKeys);
    redstoneTorchDirtyKeys.clear();
    for (const key of keys) {
        const p = parseKey(key);
        if (!p) continue;
        const { x, y, z } = p;
        const id = chunkManager.getBlock(x, y, z);
        if (id !== 75 && id !== 76) continue;
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        const support = getTorchAttachedBlockCoord(x, y, z, meta);
        const shouldBeOff = isBlockPoweredForTorchInversion(support.x, support.y, support.z, x, y, z);
        const burnoutUntil = redstoneTorchBurnoutUntil.get(key) ?? 0;
        const inBurnout = burnoutUntil > redstoneTorchClock;
        const targetOn = !shouldBeOff && !inBurnout;
        const changed = setRedstoneTorchBlockState(x, y, z, targetOn, meta);
        if (!changed) continue;
        if (shouldBeOff) {
            const togglesInWindow = recordTorchToggleAt(key, redstoneTorchClock);
            if (togglesInWindow >= REDSTONE_TORCH_BURNOUT_TOGGLE_COUNT) {
                redstoneTorchBurnoutUntil.set(key, redstoneTorchClock + REDSTONE_TORCH_BURNOUT_COOLDOWN_SECONDS);
                setRedstoneTorchBlockState(x, y, z, false, meta);
            }
        }
        markRedstoneTorchDirtyAround(x, y, z);
    }
}

function tickPistons(dt) {
    pistonTickAccumulator += dt;
    while (pistonTickAccumulator >= PISTON_TICK_SECONDS) {
        pistonTickAccumulator -= PISTON_TICK_SECONDS;
        pistonGameTick++;
        pistonFullScanCooldown -= PISTON_TICK_SECONDS;

        if (pistonFullScanCooldown <= 0) {
            pistonFullScanCooldown = PISTON_FULL_SCAN_INTERVAL;
            forEachTickableGeneratedChunk((c, key) => {
                const flags = getTickChunkFeatureFlags(c, key);
                if (!flags.hasPiston) return;
                const baseX = c.cx * CHUNK_SIZE;
                const baseY = c.cy * CHUNK_SIZE;
                const baseZ = c.cz * CHUNK_SIZE;
                for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                            const id = c.getBlock(lx, ly, lz);
                            if (!isPistonId(id)) continue;
                            pistonDirtyKeys.add(getKey(baseX + lx, baseY + ly, baseZ + lz));
                        }
                    }
                }
            });
        }

        if (pistonDirtyKeys.size > 0) {
            const keys = getDeterministicKeyList(pistonDirtyKeys);
            pistonDirtyKeys.clear();
            for (const key of keys) {
                const p = parseKey(key);
                if (!p) continue;
                const { x, y, z } = p;
                const id = chunkManager.getBlock(x, y, z);
                if (!isPistonId(id)) {
                    pistonPendingEvents.delete(key);
                    continue;
                }
                const meta = chunkManager.getMetadata(x, y, z) & 15;
                const extended = (meta & 8) !== 0;
                const powered = isPistonPoweredAt(x, y, z);
                const desired = powered ? 'extend' : 'retract';
                const alreadySatisfied = (desired === 'extend' && extended) || (desired === 'retract' && !extended);
                if (alreadySatisfied) {
                    pistonPendingEvents.delete(key);
                    continue;
                }
                const dueTick = pistonGameTick + PISTON_EVENT_DELAY_TICKS;
                const existing = pistonPendingEvents.get(key);
                if (!existing || existing.action !== desired || existing.dueTick !== dueTick) {
                    pistonPendingEvents.set(key, { action: desired, dueTick });
                }
            }
        }

        if (pistonPendingEvents.size > 0) {
            const pendingKeys = getDeterministicKeyList(pistonPendingEvents.keys());
            for (const key of pendingKeys) {
                const evt = pistonPendingEvents.get(key);
                if (!evt || evt.dueTick > pistonGameTick) continue;
                pistonPendingEvents.delete(key);
                const p = parseKey(key);
                if (!p) continue;
                const { x, y, z } = p;
                const id = chunkManager.getBlock(x, y, z);
                if (!isPistonId(id)) continue;
                const meta = chunkManager.getMetadata(x, y, z) & 15;
                const extended = (meta & 8) !== 0;
                const powered = isPistonPoweredAt(x, y, z);
                if (evt.action === 'extend') {
                    if (powered && !extended) tryExtendPistonAt(x, y, z, id, meta);
                } else if (evt.action === 'retract') {
                    if (!powered && extended) tryRetractPistonAt(x, y, z, id, meta);
                }
            }
        }
    }
}

function setDoorOpenStateByRedstone(x, y, z, open) {
    const id = chunkManager.getBlock(x, y, z);
    if (!isDoorLikeId(id)) return false;
    const meta = chunkManager.getMetadata(x, y, z) & 15;
    const isTop = (meta & 8) !== 0;
    const baseY = isTop ? y - 1 : y;
    const topY = baseY + 1;
    const lowerId = chunkManager.getBlock(x, baseY, z);
    const upperId = chunkManager.getBlock(x, topY, z);
    if (!isDoorLikeId(lowerId) || !isDoorLikeId(upperId)) return false;

    const lowerMeta = chunkManager.getMetadata(x, baseY, z) & 15;
    const targetLowerMeta = open ? (lowerMeta | 4) : (lowerMeta & ~4);
    if (targetLowerMeta === lowerMeta) return false;

    markPlayerEditPriority(90);
    chunkManager.setMetadata(x, baseY, z, targetLowerMeta);
    updateModBlock(x, baseY, z, lowerId, targetLowerMeta);
    if (chunkWorker) {
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y: baseY, z, id: lowerId, metadata: targetLowerMeta, immediate: true } });
    }
    requestChunkGeometryAt(x, baseY, z);
    scheduleSaveGame();
    return true;
}

function setTrapdoorOpenStateByRedstone(x, y, z, open) {
    const id = chunkManager.getBlock(x, y, z);
    if (!isTrapdoorId(id)) return false;
    const meta = chunkManager.getMetadata(x, y, z) & 15;
    const targetMeta = open ? (meta | 4) : (meta & ~4);
    if (targetMeta === meta) return false;
    if (!isTrapdoorSupportValidAt(x, y, z, targetMeta)) return false;

    markPlayerEditPriority(90);
    chunkManager.setMetadata(x, y, z, targetMeta);
    updateModBlock(x, y, z, id, targetMeta);
    if (chunkWorker) {
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: targetMeta, immediate: true } });
    }
    requestChunkGeometryAt(x, y, z);
    scheduleSaveGame();
    return true;
}

function tickRedstoneActuators(dt) {
    redstoneActuatorTickAccumulator += dt;
    if (redstoneActuatorTickAccumulator < REDSTONE_ACTUATOR_TICK_SECONDS) return;
    redstoneActuatorTickAccumulator = 0;

    const seenDispenserKeys = new Set();

    forEachTickableGeneratedChunk((c, key) => {
        const flags = getTickChunkFeatureFlags(c, key);
        if (!flags.hasActuators) return;
        const baseX = c.cx * CHUNK_SIZE;
        const baseY = c.cy * CHUNK_SIZE;
        const baseZ = c.cz * CHUNK_SIZE;
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    const x = baseX + lx;
                    const y = baseY + ly;
                    const z = baseZ + lz;
                    const id = c.getBlock(lx, ly, lz);
                    if (id === 0) continue;

                    if (isDoorLikeId(id)) {
                        const meta = chunkManager.getMetadata(x, y, z) & 15;
                        if ((meta & 8) !== 0) continue; // lower half drives state
                        const powered = (
                            isBlockReceivingPower(x, y, z) ||
                            isBlockReceivingPower(x, y + 1, z) ||
                            hasAdjacentPoweredLever(x, y, z) ||
                            hasAdjacentPoweredLever(x, y + 1, z)
                        );
                        setDoorOpenStateByRedstone(x, y, z, powered);
                        continue;
                    }

                    if (isTrapdoorId(id)) {
                        const powered = isBlockReceivingPower(x, y, z);
                        setTrapdoorOpenStateByRedstone(x, y, z, powered);
                        continue;
                    }

                    if (isDispenserId(id)) {
                        const key = getKey(x, y, z);
                        seenDispenserKeys.add(key);
                        const powered = isBlockReceivingPower(x, y, z);
                        const prev = redstoneActuatorPrevPowered.get(key) === true;
                        if (powered && !prev) {
                            triggerDispenserAt(x, y, z);
                        }
                        redstoneActuatorPrevPowered.set(key, powered);
                    }
                }
            }
        }
    });

    for (const key of Array.from(redstoneActuatorPrevPowered.keys())) {
        if (!seenDispenserKeys.has(key)) {
            redstoneActuatorPrevPowered.delete(key);
        }
    }
}

function isSourcePoweringTowards(sourceX, sourceY, sourceZ, toX, toY, toZ) {
    const sid = chunkManager.getBlock(sourceX, sourceY, sourceZ);
    if (sid === 0) return false;
    if (isStrongPowerEmitterTowards(sourceX, sourceY, sourceZ, toX, toY, toZ)) return true;
    if (isRedstoneWireId(sid)) {
        const sp = chunkManager.getMetadata(sourceX, sourceY, sourceZ) & 15;
        if (sp <= 0) return false;
        const wireNeighbors = getWireNeighborCoords(sourceX, sourceY, sourceZ);
        for (const n of wireNeighbors) {
            if (n.x === toX && n.y === toY && n.z === toZ) return true;
        }
        return false;
    }
    if (isSolidRedstoneConductorId(sid)) {
        return isSolidBlockStronglyPowered(sourceX, sourceY, sourceZ);
    }
    return false;
}

function isRepeaterInputPowered(x, y, z, meta) {
    const f = getRepeaterForward(meta);
    const bx = x - f.x;
    const by = y;
    const bz = z - f.z;
    return isSourcePoweringTowards(bx, by, bz, x, y, z);
}

function isRepeaterLocked(x, y, z, meta) {
    return false;
}

function setRepeaterBlockState(x, y, z, targetOn, meta) {
    const currentId = chunkManager.getBlock(x, y, z);
    if (!isRepeaterId(currentId)) return false;
    const nextId = targetOn ? 94 : 93;
    if (nextId === currentId) return false;
    markPlayerEditPriority();
    chunkManager.setBlock(x, y, z, nextId);
    chunkManager.setMetadata(x, y, z, meta & 15);
    updateModBlock(x, y, z, nextId, meta & 15);
    chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: nextId, metadata: meta & 15, immediate: true } });
    requestChunkGeometryAt(x, y, z);
    markRepeatersDirtyAround(x, y, z);
    if (targetOn) igniteAdjacentTntFromRedstoneSource(x, y, z);
    scheduleSaveGame();
    return true;
}

function tickRepeaters(dt) {
    if (dt <= 0) return;
    repeaterTickAccumulator += dt;
    let tickSteps = 0;
    while (repeaterTickAccumulator >= REPEATER_TICK_SECONDS) {
        repeaterTickAccumulator -= REPEATER_TICK_SECONDS;
        repeaterGameTick++;
        tickSteps++;
    }
    if (tickSteps === 0 && repeaterPendingTransitions.size === 0) return;
    repeaterFullScanCooldown -= dt;

    if (repeaterFullScanCooldown <= 0) {
        repeaterFullScanCooldown = REPEATER_FULL_SCAN_INTERVAL;
        forEachTickableGeneratedChunk((c, key) => {
            const flags = getTickChunkFeatureFlags(c, key);
            if (!flags.hasRepeater) return;
            const baseX = c.cx * CHUNK_SIZE;
            const baseY = c.cy * CHUNK_SIZE;
            const baseZ = c.cz * CHUNK_SIZE;
            for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                        const id = c.getBlock(lx, ly, lz);
                        if (!isRepeaterId(id)) continue;
                        repeaterDirtyKeys.add(getKey(baseX + lx, baseY + ly, baseZ + lz));
                    }
                }
            }
        });
    }

    if (repeaterDirtyKeys.size === 0 && repeaterPendingTransitions.size === 0) return;

    for (const [key] of repeaterPendingTransitions) repeaterDirtyKeys.add(key);

    const keys = getDeterministicKeyList(repeaterDirtyKeys);
    repeaterDirtyKeys.clear();

    for (const key of keys) {
        const p = parseKey(key);
        if (!p) continue;
        const { x, y, z } = p;
        const id = chunkManager.getBlock(x, y, z);
        if (!isRepeaterId(id)) {
            repeaterPendingTransitions.delete(key);
            continue;
        }
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        const currentOn = id === 94;
        const locked = isRepeaterLocked(x, y, z, meta);
        if (locked) {
            repeaterPendingTransitions.delete(key);
            continue;
        }
        const inputOn = isRepeaterInputPowered(x, y, z, meta);
        if (inputOn === currentOn) {
            repeaterPendingTransitions.delete(key);
            continue;
        }
        const toOn = !!inputOn;
        const delaySteps = ((meta >> 2) & 3) + 1;
        const dueTick = repeaterGameTick + delaySteps;
        const existing = repeaterPendingTransitions.get(key);
        if (!existing || existing.toOn !== toOn) {
            repeaterPendingTransitions.set(key, { toOn, dueTick });
        }
    }

    const pendingEntries = Array.from(repeaterPendingTransitions.entries()).sort((a, b) => {
        const pa = a[1] || { dueTick: 0 };
        const pb = b[1] || { dueTick: 0 };
        if ((pa.dueTick | 0) !== (pb.dueTick | 0)) return (pa.dueTick | 0) - (pb.dueTick | 0);
        return compareWorldKeys(a[0], b[0]);
    });
    for (const [key, pending] of pendingEntries) {
        if (!pending || repeaterGameTick < (pending.dueTick | 0)) continue;
        const p = parseKey(key);
        if (!p) {
            repeaterPendingTransitions.delete(key);
            continue;
        }
        const { x, y, z } = p;
        const id = chunkManager.getBlock(x, y, z);
        if (!isRepeaterId(id)) {
            repeaterPendingTransitions.delete(key);
            continue;
        }
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        if (isRepeaterLocked(x, y, z, meta)) {
            repeaterPendingTransitions.delete(key);
            continue;
        }
        const inputOn = isRepeaterInputPowered(x, y, z, meta);
        if (inputOn !== pending.toOn) {
            repeaterPendingTransitions.delete(key);
            repeaterDirtyKeys.add(key);
            continue;
        }
        setRepeaterBlockState(x, y, z, pending.toOn, meta);
        repeaterPendingTransitions.delete(key);
    }
}

function setPressurePlatePressedState(x, y, z, pressed) {
    const id = chunkManager.getBlock(x, y, z);
    if (!isPressurePlateId(id)) return false;
    const meta = chunkManager.getMetadata(x, y, z) & 15;
    const nextMeta = pressed ? (meta | 1) : (meta & ~1);
    if (nextMeta === meta) return false;
    markPlayerEditPriority(90);
    chunkManager.setMetadata(x, y, z, nextMeta);
    updateModBlock(x, y, z, id, nextMeta);
    markRepeatersDirtyAround(x, y, z);
    chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: nextMeta, immediate: true } });
    requestChunkGeometryAt(x, y, z);
    return true;
}

function updatePressurePlatesForPlayer() {
    const activeNow = new Set();
    const plateAllowsTrigger = (plateId, triggerType) => {
        // Jacobo parity: stone plate -> mobs(EntityLiving), wood plate -> everything.
        const isStonePlate = plateId === 262;
        if (isStonePlate) return triggerType === 'player' || triggerType === 'mob';
        return true;
    };
    const collectPressurePlatesUnder = (px, feetY, pz, radius, triggerType) => {
        const bx0 = Math.floor((px - radius) + 0.5);
        const bx1 = Math.floor((px + radius) + 0.5);
        const bz0 = Math.floor((pz - radius) + 0.5);
        const bz1 = Math.floor((pz + radius) + 0.5);
        const byCenter = Math.floor((feetY - 0.02) + 0.5);
        for (let bx = bx0; bx <= bx1; bx++) {
            for (let bz = bz0; bz <= bz1; bz++) {
                for (let dy = -1; dy <= 0; dy++) {
                    const by = byCenter + dy;
                    const plateId = chunkManager.getBlock(bx, by, bz);
                    if (!isPressurePlateId(plateId)) continue;
                    if (!plateAllowsTrigger(plateId, triggerType)) continue;
                    activeNow.add(getKey(bx, by, bz));
                    break;
                }
            }
        }
    };

    if (!isFlying && canJumpRef.val) {
        const topY = getPlayerColliderTopY(camera.position.y);
        const h = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
        collectPressurePlatesUnder(camera.position.x, topY - h, camera.position.z, PLAYER_RADIUS, 'player');
    }
    // Mob-driven activation parity slice (passive mobs and future species arrays).
    const mobArrays = [
        mobManager?.pigs || [],
        mobManager?.chickens || [],
        mobManager?.sheep || [],
        mobManager?.cows || [],
        mobManager?.creepers || [],
        mobManager?.zombies || [],
        mobManager?.spiders || [],
        mobManager?.skeletons || [],
        mobManager?.zombiePigmen || [],
        mobManager?.slimes || [],
        mobManager?.ghasts || [],
        mobManager?.squids || [],
        mobManager?.wolves || []
    ];
    for (const arr of mobArrays) {
        for (const m of arr) {
            if (!m || !m.pos) continue;
            if (m._dead) continue;
            const radius = typeof m.radius === 'number' ? m.radius : 0.5;
            collectPressurePlatesUnder(m.pos.x, m.pos.y - 0.45, m.pos.z, Math.max(0.2, radius), 'mob');
        }
    }
    // Item entities trigger only wood pressure plates (stone excludes non-living entities in Beta).
    for (const d of entityManager.drops) {
        if (!d || !d.mesh?.userData?.physicsPos) continue;
        const p = d.mesh.userData.physicsPos;
        collectPressurePlatesUnder(p.x, p.y - 0.2, p.z, 0.18, 'item');
    }

    let dirty = false;
    for (const key of activeNow) {
        if (pressedPressurePlateKeys.has(key)) continue;
        const p = parseKey(key);
        if (setPressurePlatePressedState(p.x, p.y, p.z, true)) dirty = true;
        pressedPressurePlateKeys.add(key);
    }
    for (const key of Array.from(pressedPressurePlateKeys)) {
        if (activeNow.has(key)) continue;
        const p = parseKey(key);
        if (setPressurePlatePressedState(p.x, p.y, p.z, false)) dirty = true;
        pressedPressurePlateKeys.delete(key);
    }
    if (dirty) scheduleSaveGame();
}

function hasAnyWallSupportAt(x, y, z) {
    return (
        isSolidForRailSupport(chunkManager.getBlock(x + 1, y, z)) ||
        isSolidForRailSupport(chunkManager.getBlock(x - 1, y, z)) ||
        isSolidForRailSupport(chunkManager.getBlock(x, y, z + 1)) ||
        isSolidForRailSupport(chunkManager.getBlock(x, y, z - 1))
    );
}

function getTrapdoorSupportOffset(meta) {
    const dir = meta & 3;
    if (dir === 0) return { x: 0, z: 1 };
    if (dir === 1) return { x: 0, z: -1 };
    if (dir === 2) return { x: 1, z: 0 };
    return { x: -1, z: 0 };
}

function isTrapdoorSupportValidAt(x, y, z, meta) {
    const off = getTrapdoorSupportOffset(meta);
    return isSolidForRailSupport(chunkManager.getBlock(x + off.x, y, z + off.z));
}

function isLeverSupportValidAt(x, y, z, meta) {
    const orient = meta & 7;
    if (orient === 5 || orient === 6) return isSolidForRailSupport(chunkManager.getBlock(x, y - 1, z)); // floor
    if (orient === 0 || orient === 7) return isSolidForRailSupport(chunkManager.getBlock(x, y + 1, z)); // ceiling
    if (orient === 1) return isSolidForRailSupport(chunkManager.getBlock(x - 1, y, z)); // west support
    if (orient === 2) return isSolidForRailSupport(chunkManager.getBlock(x + 1, y, z)); // east support
    if (orient === 3) return isSolidForRailSupport(chunkManager.getBlock(x, y, z - 1)); // north support
    if (orient === 4) return isSolidForRailSupport(chunkManager.getBlock(x, y, z + 1)); // south support
    return hasAnyWallSupportAt(x, y, z) || isSolidForRailSupport(chunkManager.getBlock(x, y - 1, z)) || isSolidForRailSupport(chunkManager.getBlock(x, y + 1, z));
}

function getLeverSupportOffset(meta) {
    const orient = meta & 7;
    if (orient === 5 || orient === 6) return { x: 0, y: -1, z: 0 }; // floor
    if (orient === 0 || orient === 7) return { x: 0, y: 1, z: 0 };  // ceiling
    if (orient === 1) return { x: -1, y: 0, z: 0 };  // west support
    if (orient === 2) return { x: 1, y: 0, z: 0 };   // east support
    if (orient === 3) return { x: 0, y: 0, z: -1 };  // north support
    if (orient === 4) return { x: 0, y: 0, z: 1 };   // south support
    return { x: 0, y: -1, z: 0 };
}

function isLeverPoweringTowards(sourceX, sourceY, sourceZ, meta, toX, toY, toZ) {
    if ((meta & 8) === 0) return false;
    const dx = toX - sourceX;
    const dy = toY - sourceY;
    const dz = toZ - sourceZ;
    if ((Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) !== 1) return false;
    // Lever parity approximation:
    // - powers the attached support block strongly
    // - weakly powers adjacent neighbors around its own position
    //   (modeled here as any orthogonally adjacent block).
    return true;
}

function getDoorSideOffsets(orientationMeta) {
    const rot = orientationMeta & 3;
    if (rot === 0) return { left: { x: 1, z: 0 }, right: { x: -1, z: 0 } };   // south
    if (rot === 1) return { left: { x: -1, z: 0 }, right: { x: 1, z: 0 } };   // north
    if (rot === 2) return { left: { x: 0, z: -1 }, right: { x: 0, z: 1 } };   // east
    return { left: { x: 0, z: 1 }, right: { x: 0, z: -1 } };                    // west
}

function computeDoorHingeBit(x, y, z, orientationMeta, doorId) {
    const sides = getDoorSideOffsets(orientationMeta);
    const lx = x + sides.left.x, lz = z + sides.left.z;
    const rx = x + sides.right.x, rz = z + sides.right.z;
    const leftSolid = (isSolidForRailSupport(chunkManager.getBlock(lx, y, lz)) ? 1 : 0) +
        (isSolidForRailSupport(chunkManager.getBlock(lx, y + 1, lz)) ? 1 : 0);
    const rightSolid = (isSolidForRailSupport(chunkManager.getBlock(rx, y, rz)) ? 1 : 0) +
        (isSolidForRailSupport(chunkManager.getBlock(rx, y + 1, rz)) ? 1 : 0);

    const leftDoor = chunkManager.getBlock(lx, y, lz) === doorId || chunkManager.getBlock(lx, y + 1, lz) === doorId;
    const rightDoor = chunkManager.getBlock(rx, y, rz) === doorId || chunkManager.getBlock(rx, y + 1, rz) === doorId;

    if (leftDoor && !rightDoor) return 1;
    if (rightDoor && !leftDoor) return 0;
    if (rightSolid > leftSolid) return 1;
    if (leftSolid > rightSolid) return 0;
    return 0;
}

function getBedHeadOffset(meta) {
    const dir = meta & 3;
    if (dir === 0) return { x: 0, z: 1 };
    if (dir === 1) return { x: -1, z: 0 };
    if (dir === 2) return { x: 0, z: -1 };
    return { x: 1, z: 0 };
}

function isSleepTimeForBeds(ticks = worldTimeTicks) {
    const t = normalizeWorldTimeTicks(ticks);
    return t >= BED_SLEEP_START_TICKS && t <= BED_SLEEP_END_TICKS;
}

function getBedRespawnPointFromBlock(x, y, z, meta) {
    const isHead = (meta & 8) !== 0;
    const off = getBedHeadOffset(meta);
    const footX = isHead ? (x - off.x) : x;
    const footZ = isHead ? (z - off.z) : z;
    return {
        dimension: CURRENT_DIMENSION || 'OVERWORLD',
        x: footX + 0.5,
        y: y + (1 / 16) + PLAYER_EYE_HEIGHT,
        z: footZ + 0.5,
        rx: 0,
        ry: camera?.rotation?.y || 0
    };
}

function isDependentBlockStillValid(x, y, z, id, meta) {
    if (isTorchId(id)) {
        const m = meta & 7;
        if (m === 5 || m === 0) return isSolidForRailSupport(chunkManager.getBlock(x, y - 1, z));
        return hasAnyWallSupportAt(x, y, z);
    }
    if (isButtonId(id)) {
        return hasAnyWallSupportAt(x, y, z);
    }
    if (isLeverId(id)) {
        return isLeverSupportValidAt(x, y, z, meta);
    }
    if (isPressurePlateId(id) || isRepeaterId(id) || isRailId(id)) {
        return isSolidForRailSupport(chunkManager.getBlock(x, y - 1, z));
    }
    if (isTrapdoorId(id)) {
        return isTrapdoorSupportValidAt(x, y, z, meta);
    }
    if (isCropId(id)) {
        return isFarmlandId(chunkManager.getBlock(x, y - 1, z));
    }
    if (isFlowerId(id) || isTallGrassId(id)) {
        const below = chunkManager.getBlock(x, y - 1, z);
        return below === 1 || below === 2 || isFarmlandId(below);
    }
    if (isMushroomId(id)) {
        return isSolidForRailSupport(chunkManager.getBlock(x, y - 1, z)) && chunkManager.getLight(x, y, z) <= 12;
    }
    if (isDeadBushId(id)) {
        return chunkManager.getBlock(x, y - 1, z) === 9;
    }
    if (id === 103) { // Sapling support parity
        const below = chunkManager.getBlock(x, y - 1, z);
        return below === 1 || below === 2 || isFarmlandId(below);
    }
    if (isCactusId(id)) {
        return isValidCactusAt(x, y, z);
    }
    if (isReedId(id)) {
        return isValidReedAt(x, y, z);
    }
    if (isLadderId(id)) {
        const m = meta & 7;
        if (m === 2) return isSolidForRailSupport(chunkManager.getBlock(x, y, z + 1)); // north-facing ladder on south support
        if (m === 3) return isSolidForRailSupport(chunkManager.getBlock(x, y, z - 1)); // south-facing ladder on north support
        if (m === 4) return isSolidForRailSupport(chunkManager.getBlock(x + 1, y, z)); // west-facing ladder on east support
        if (m === 5) return isSolidForRailSupport(chunkManager.getBlock(x - 1, y, z)); // east-facing ladder on west support
        return hasAnyWallSupportAt(x, y, z);
    }
    if (isSignPostId(id)) {
        return isSolidForRailSupport(chunkManager.getBlock(x, y - 1, z));
    }
    if (isWallSignId(id)) {
        const m = meta & 15;
        if (m === 2) return isSolidForRailSupport(chunkManager.getBlock(x, y, z + 1));
        if (m === 3) return isSolidForRailSupport(chunkManager.getBlock(x, y, z - 1));
        if (m === 4) return isSolidForRailSupport(chunkManager.getBlock(x + 1, y, z));
        if (m === 5) return isSolidForRailSupport(chunkManager.getBlock(x - 1, y, z));
        return hasAnyWallSupportAt(x, y, z);
    }
    if (isDoorId(id)) {
        const isTop = (meta & 8) !== 0;
        if (isTop) {
            return isDoorId(chunkManager.getBlock(x, y - 1, z));
        }
        return isSolidForRailSupport(chunkManager.getBlock(x, y - 1, z)) && isDoorId(chunkManager.getBlock(x, y + 1, z));
    }
    if (isBedBlockId(id)) {
        const isHead = (meta & 8) !== 0;
        const off = getBedHeadOffset(meta);
        const footX = isHead ? (x - off.x) : x;
        const footZ = isHead ? (z - off.z) : z;
        const headX = footX + off.x;
        const headZ = footZ + off.z;
        const footId = chunkManager.getBlock(footX, y, footZ);
        const headId = chunkManager.getBlock(headX, y, headZ);
        if (!isBedBlockId(footId) || !isBedBlockId(headId)) return false;
        return (
            isSolidForRailSupport(chunkManager.getBlock(footX, y - 1, footZ)) &&
            isSolidForRailSupport(chunkManager.getBlock(headX, y - 1, headZ))
        );
    }
    if (isPaintingId(id)) {
        const m = meta & 15;
        if (m === 2) return isSolidForRailSupport(chunkManager.getBlock(x, y, z + 1));
        if (m === 3) return isSolidForRailSupport(chunkManager.getBlock(x, y, z - 1));
        if (m === 4) return isSolidForRailSupport(chunkManager.getBlock(x + 1, y, z));
        if (m === 5) return isSolidForRailSupport(chunkManager.getBlock(x - 1, y, z));
        return hasAnyWallSupportAt(x, y, z);
    }
    return true;
}

function updateDependentsAround(x, y, z, emitDrops = true) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const bx = x + dx;
                const by = y + dy;
                const bz = z + dz;
                const id = chunkManager.getBlock(bx, by, bz);
                if (
                    !isTorchId(id) &&
                    !isButtonId(id) &&
                    !isPressurePlateId(id) &&
                    !isRailId(id) &&
                    !isRepeaterId(id) &&
                    !isTrapdoorId(id) &&
                    !isCropId(id) &&
                    !isFlowerId(id) &&
                    !isMushroomId(id) &&
                    !isTallGrassId(id) &&
                    !isDeadBushId(id) &&
                    !isReedId(id) &&
                    !isCactusId(id) &&
                    !isLadderId(id) &&
                    !isSignId(id) &&
                    !isPaintingId(id) &&
                    !isLeverId(id) &&
                    !isDoorId(id) &&
                    !isBedBlockId(id)
                ) {
                    continue;
                }
                const meta = chunkManager.getMetadata(bx, by, bz) & 15;
                if (isDependentBlockStillValid(bx, by, bz, id, meta)) continue;
                const isDoorTopHalf = isDoorId(id) && ((meta & 8) !== 0);

                markPlayerEditPriority();
                chunkManager.setBlock(bx, by, bz, 0);
                chunkManager.setMetadata(bx, by, bz, 0);
                updateModBlock(bx, by, bz, 0, 0);
                markRepeatersDirtyAround(bx, by, bz);
                markRedstoneWireDirtyAround(bx, by, bz);
                updateSurfaceColumnCacheForChunkColumn(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE));
                chunkWorker.postMessage({ type: 'setBlock', data: { x: bx, y: by, z: bz, id: 0, metadata: 0, immediate: true } });
                if (emitDrops) {
                    let dropId = id;
                    let dropKind = ITEM_STACK_KIND_BLOCK;
                    if (isSignId(id)) {
                        dropId = 67;
                        dropKind = ITEM_STACK_KIND_ITEM;
                        signRegistry.delete(getKey(bx, by, bz));
                        removeSignTextMeshAt(bx, by, bz);
                    } else if (isPaintingId(id)) {
                        dropId = 65;
                        dropKind = ITEM_STACK_KIND_ITEM;
                    } else if (isLadderId(id)) {
                        dropId = 102;
                        dropKind = ITEM_STACK_KIND_ITEM;
                    } else if (isLeverId(id)) {
                        dropId = 111;
                        dropKind = ITEM_STACK_KIND_BLOCK;
                    } else if (isDoorId(id)) {
                        dropId = id === IRON_DOOR_BLOCK_ID ? 74 : 68;
                        dropKind = ITEM_STACK_KIND_ITEM;
                    } else if (isBedBlockId(id)) {
                        dropId = BED_ITEM_ID;
                        dropKind = ITEM_STACK_KIND_ITEM;
                    }
                    if (!isDoorTopHalf && !isBedBlockId(id)) {
                        entityManager.spawnDrop(bx, by, bz, dropId, null, 0.1, null, { autoMagnet: true, kind: dropKind, metadata: dropKind === ITEM_STACK_KIND_BLOCK ? meta : 0 });
                    }
                    if (isBedBlockId(id)) {
                        const isHead = (meta & 8) !== 0;
                        const off = getBedHeadOffset(meta);
                        const footX = isHead ? (bx - off.x) : bx;
                        const footZ = isHead ? (bz - off.z) : bz;
                        const headX = footX + off.x;
                        const headZ = footZ + off.z;
                        const otherX = isHead ? footX : headX;
                        const otherZ = isHead ? footZ : headZ;
                        if (chunkManager.getBlock(otherX, by, otherZ) === id) {
                            chunkManager.setBlock(otherX, by, otherZ, 0);
                            chunkManager.setMetadata(otherX, by, otherZ, 0);
                            updateModBlock(otherX, by, otherZ, 0, 0);
                            chunkWorker.postMessage({ type: 'setBlock', data: { x: otherX, y: by, z: otherZ, id: 0, metadata: 0, immediate: true } });
                        }
                        if (!isHead) {
                            entityManager.spawnDrop(bx, by, bz, BED_ITEM_ID, null, 0.1, null, { autoMagnet: true, kind: ITEM_STACK_KIND_ITEM, metadata: 0 });
                        }
                    }
                }
            }
        }
    }
}

function queueGrowthUpdate(updateMap, x, y, z, id, metadata = 0) {
    const k = `${x},${y},${z}`;
    updateMap.set(k, { x, y, z, id, metadata });
}

function consumeOneInventoryItem(itemId, requiredKind = ITEM_STACK_KIND_ITEM) {
    for (let i = 0; i < inventory.slots.length; i++) {
        const s = inventory.slots[i];
        if (!s || s.count <= 0) continue;
        if (getItemStackKind(s.id, s.kind) !== requiredKind) continue;
        if (s.id !== itemId) continue;
        inventory.consumeItem(i, 1);
        return true;
    }
    return false;
}

function countColumnHeight(id, x, y, z) {
    let bottom = y;
    while (bottom > WORLD_DEPTH && chunkManager.getBlock(x, bottom - 1, z) === id) {
        bottom--;
    }
    let top = y;
    while (top < WORLD_HEIGHT - 1 && chunkManager.getBlock(x, top + 1, z) === id) {
        top++;
    }
    return top - bottom + 1;
}

function hasFarmlandWaterNearby(x, y, z) {
    for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (isWaterId(chunkManager.getBlock(x + dx, y + dy, z + dz))) {
                    return true;
                }
            }
        }
    }
    return false;
}

function canReplaceForSaplingGrowth(id) {
    return id === 0 ||
        id === 5 ||
        id === 103 ||
        isFlowerId(id) ||
        isMushroomId(id) ||
        isTallGrassId(id) ||
        isDeadBushId(id);
}

function hasLogWithinLeafDecayRadius(x, y, z, radius = 4) {
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > radius + 2) continue;
                const id = chunkManager.getBlock(x + dx, y + dy, z + dz);
                if (id === 4) return true;
            }
        }
    }
    return false;
}

function markLeavesForDecayNear(x, y, z, radius = 4) {
    const updates = [];
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const tx = x + dx;
                const ty = y + dy;
                const tz = z + dz;
                if (chunkManager.getBlock(tx, ty, tz) !== 5) continue;
                const meta = chunkManager.getMetadata(tx, ty, tz) & 15;
                if ((meta & 8) !== 0) continue;
                updates.push({ x: tx, y: ty, z: tz, id: 5, metadata: meta | 8 });
            }
        }
    }
    if (updates.length > 0) {
        applyBlockChangesAndSync(updates, { immediate: true });
    }
}

function isLeafDecayNeighborhoodLoaded(x, y, z, radius = 4) {
    const minCx = Math.floor((x - radius) / CHUNK_SIZE);
    const maxCx = Math.floor((x + radius) / CHUNK_SIZE);
    const minCy = Math.floor((y - radius) / CHUNK_SIZE);
    const maxCy = Math.floor((y + radius) / CHUNK_SIZE);
    const minCz = Math.floor((z - radius) / CHUNK_SIZE);
    const maxCz = Math.floor((z + radius) / CHUNK_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cz = minCz; cz <= maxCz; cz++) {
                if (!chunkManager.hasChunk(cx, cy, cz)) return false;
            }
        }
    }
    return true;
}

function tryQueueSaplingGrowth(updates, x, y, z) {
    const supportId = chunkManager.getBlock(x, y - 1, z);
    if (!(supportId === 1 || supportId === 2 || isFarmlandId(supportId))) return false;
    const saplingMeta = chunkManager.getMetadata(x, y, z) & 15;
    const saplingType = saplingMeta & 3; // 0=oak, 1=spruce, 2=birch
    const leafMeta = saplingType;

    const trunkHeight = saplingType === 1
        ? (6 + ((Math.random() * 3) | 0)) // spruce: 6..8
        : (4 + ((Math.random() * 3) | 0)); // oak/birch: 4..6
    const topY = y + trunkHeight;
    if (topY + 1 >= WORLD_HEIGHT) return false;

    for (let yy = y + 1; yy <= topY + 1; yy++) {
        let radius = 1;
        if (saplingType === 1) {
            if (yy < topY - 3) radius = 0;
            else if (yy < topY - 1) radius = 1;
            else radius = 2;
        } else if (saplingType === 2) {
            if (yy <= y + 1) radius = 0;
            else if (yy >= topY - 1) radius = 1;
            else radius = 2;
        } else {
            if (yy <= y + 1) radius = 0;
            else if (yy >= topY - 1) radius = 2;
        }
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const id = chunkManager.getBlock(x + dx, yy, z + dz);
                if (!canReplaceForSaplingGrowth(id)) return false;
            }
        }
    }

    if (isFarmlandId(supportId)) {
        queueGrowthUpdate(updates, x, y - 1, z, 2, 0);
    }
    queueGrowthUpdate(updates, x, y, z, 0, 0);

    for (let yy = y; yy < y + trunkHeight; yy++) {
        const existing = chunkManager.getBlock(x, yy, z);
        if (canReplaceForSaplingGrowth(existing) || existing === 4) {
            queueGrowthUpdate(updates, x, yy, z, 4, 0);
        }
    }

    if (saplingType === 1) {
        // Spruce-style conical crown.
        let radius = 2;
        for (let yy = topY; yy >= y + 2; yy--) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius > 0 && Math.random() < 0.4) continue;
                    const tx = x + dx;
                    const tz = z + dz;
                    if (tx === x && tz === z && yy < topY) continue;
                    const existing = chunkManager.getBlock(tx, yy, tz);
                    if (canReplaceForSaplingGrowth(existing)) {
                        queueGrowthUpdate(updates, tx, yy, tz, 5, leafMeta);
                    }
                }
            }
            if (yy <= topY - 1 && radius > 1) radius--;
            else if (yy <= topY - 3) radius = 1;
        }
        const capExisting = chunkManager.getBlock(x, topY + 1, z);
        if (canReplaceForSaplingGrowth(capExisting)) {
            queueGrowthUpdate(updates, x, topY + 1, z, 5, leafMeta);
        }
    } else {
        for (let yy = topY - 2; yy <= topY + 1; yy++) {
            const dy = yy - topY;
            const radius = saplingType === 2
                ? (dy >= 0 ? 1 : (dy === -2 ? 2 : 1))
                : (dy >= 0 ? 1 : 2);
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    if (saplingType !== 2 && Math.abs(dx) === radius && Math.abs(dz) === radius && yy < topY && Math.random() < 0.35) continue;
                    const tx = x + dx;
                    const tz = z + dz;
                    if (tx === x && tz === z && yy < y + trunkHeight) continue;
                    const existing = chunkManager.getBlock(tx, yy, tz);
                    if (canReplaceForSaplingGrowth(existing)) {
                        queueGrowthUpdate(updates, tx, yy, tz, 5, leafMeta);
                    }
                }
            }
        }
    }

    return true;
}

function processPlantGrowthTick() {
    if (!GAME_ACTIVE || IS_PAUSED || CURRENT_DIMENSION !== 'OVERWORLD' || renderChunks.size === 0) return;

    const chunkKeys = Array.from(renderChunks.keys());
    if (chunkKeys.length === 0) return;

    const playerChunkX = Math.floor(camera.position.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(camera.position.z / CHUNK_SIZE);
    const activeRadius = LOAD_RADIUS() + 1;
    const updates = new Map();

    for (let i = 0; i < PLANT_GROWTH_ATTEMPTS_PER_TICK; i++) {
        const key = chunkKeys[(Math.random() * chunkKeys.length) | 0];
        const p = parseKey(key);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        if (Math.abs(p.x - playerChunkX) > activeRadius || Math.abs(p.z - playerChunkZ) > activeRadius) continue;

        const x = p.x * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0);
        const y = p.y * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0);
        const z = p.z * CHUNK_SIZE + ((Math.random() * CHUNK_SIZE) | 0);
        if (y <= WORLD_DEPTH || y >= WORLD_HEIGHT - 1) continue;

        const id = chunkManager.getBlock(x, y, z);
        if (id === 0) continue;

        if (isFarmlandId(id)) {
            const moisture = chunkManager.getMetadata(x, y, z) & 7;
            const hasWater = hasFarmlandWaterNearby(x, y, z);
            if (hasWater) {
                if (moisture < 7) queueGrowthUpdate(updates, x, y, z, id, 7);
            } else {
                const aboveId = chunkManager.getBlock(x, y + 1, z);
                if (moisture > 0) {
                    queueGrowthUpdate(updates, x, y, z, id, moisture - 1);
                } else if (!isCropId(aboveId)) {
                    queueGrowthUpdate(updates, x, y, z, 2, 0); // revert to dirt
                }
            }
            continue;
        }

        if (isCropId(id)) {
            if (!isFarmlandId(chunkManager.getBlock(x, y - 1, z))) continue;
            const lightAbove = chunkManager.getLight(x, y + 1, z);
            if (lightAbove < 9) continue;
            const growth = chunkManager.getMetadata(x, y, z) & 7;
            if (growth >= 7) continue;
            if (Math.random() < 0.25) {
                queueGrowthUpdate(updates, x, y, z, CROP_BLOCK_ID, growth + 1);
            }
            continue;
        }

        if (id === 103) {
            const lightAbove = chunkManager.getLight(x, y + 1, z);
            if (lightAbove < 9) continue;
            // Beta-like random sapling tick: infrequent growth checks.
            if (Math.random() < (1 / 30)) {
                tryQueueSaplingGrowth(updates, x, y, z);
            }
            continue;
        }

        if (id === 5) {
            const meta = chunkManager.getMetadata(x, y, z) & 15;
            const playerPlaced = (meta & 4) !== 0;
            if (playerPlaced) continue;
            const checkDecay = (meta & 8) !== 0;
            if (!checkDecay) continue;
            if (!isLeafDecayNeighborhoodLoaded(x, y, z, 4)) continue;
            if (hasLogWithinLeafDecayRadius(x, y, z, 4)) {
                queueGrowthUpdate(updates, x, y, z, 5, meta & ~8);
                continue;
            }
            // Beta-style gradual decay: random checks before leaf removal.
            if (Math.random() >= 0.12) continue;
            queueGrowthUpdate(updates, x, y, z, 0, 0);

            // Beta-style decay drops: saplings occasionally, apples rarely from oak leaves.
            if (Math.random() < 0.0625) {
                entityManager.spawnDrop(x, y, z, 103, null, 0.5, null, {
                    autoMagnet: false,
                    kind: ITEM_STACK_KIND_BLOCK,
                    metadata: (meta & 3)
                });
            }
            if ((meta & 3) === 0 && Math.random() < 0.005) {
                entityManager.spawnDrop(x, y, z, 4, null, 0.5, null, {
                    autoMagnet: false,
                    kind: ITEM_STACK_KIND_ITEM,
                    metadata: 0
                });
            }
            continue;
        }

        if (isMushroomId(id)) {
            if (Math.random() >= (1 / 26)) continue;

            let nearbyCount = 0;
            for (let dx = -4; dx <= 4; dx++) {
                for (let dz = -4; dz <= 4; dz++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (chunkManager.getBlock(x + dx, y + dy, z + dz) === id) {
                            nearbyCount++;
                            if (nearbyCount >= 5) break;
                        }
                    }
                    if (nearbyCount >= 5) break;
                }
                if (nearbyCount >= 5) break;
            }
            if (nearbyCount >= 5) continue;

            let tx = x;
            let ty = y;
            let tz = z;
            for (let attempt = 0; attempt < 4; attempt++) {
                tx = x + (((Math.random() * 3) | 0) - 1);
                ty = y + (((Math.random() * 3) | 0) - 1);
                tz = z + (((Math.random() * 3) | 0) - 1);
                if (ty <= WORLD_DEPTH || ty >= WORLD_HEIGHT - 1) continue;
                if (chunkManager.getBlock(tx, ty, tz) !== 0) continue;
                const supportId = chunkManager.getBlock(tx, ty - 1, tz);
                if (!isSolidForRailSupport(supportId)) continue;
                if (chunkManager.getLight(tx, ty, tz) > 12) continue;
                queueGrowthUpdate(updates, tx, ty, tz, id, 0);
                break;
            }
            continue;
        }

        if (isCactusId(id) || isReedId(id)) {
            // Beta parity tightening: cactus/reeds do not advance every plant tick pass.
            // Apply a low random growth gate before metadata-age progression.
            if (Math.random() >= (1 / 26)) continue;
            const metadata = chunkManager.getMetadata(x, y, z) & 15;
            const aboveId = chunkManager.getBlock(x, y + 1, z);
            if (aboveId !== 0) continue;

            if (metadata < 15) {
                queueGrowthUpdate(updates, x, y, z, id, metadata + 1);
                continue;
            }

            const height = countColumnHeight(id, x, y, z);
            if (height >= MAX_COLUMN_PLANT_HEIGHT) continue;

            const growthY = y + 1;
            const canGrow = isCactusId(id)
                ? isValidCactusAt(x, growthY, z)
                : isValidReedAt(x, growthY, z);
            if (!canGrow) continue;

            queueGrowthUpdate(updates, x, y, z, id, 0);
            queueGrowthUpdate(updates, x, growthY, z, id, 0);
        }
    }

    if (updates.size > 0) {
        markPlayerEditPriority(120);
        applyBlockChangesAndSync(Array.from(updates.values()), { immediate: true });
    }
}

function placeBlock() {
    if (IS_PAUSED || IS_INVENTORY_OPEN) return;
    
    const selectedSlotIndex = getSelectedSlot();
    const selectedItem = inventory.slots[selectedSlotIndex];
    if (!selectedItem || selectedItem.count <= 0) {
        const toggleRes = mobManager.tryToggleNearestWolfSit(camera, 4.5);
        if (toggleRes && toggleRes.ok) {
            if (toggleRes.msg) addMessage(toggleRes.msg);
            scheduleSaveGame();
        }
        return;
    }
    const selectedKind = getItemStackKind(selectedItem.id, selectedItem.kind);
    const actionItemId = getActionItemId(selectedItem);
    const selectedStackDef = getInventoryDef(selectedItem.id, selectedKind);
    const selectedName = String(selectedStackDef?.name || '').toLowerCase();
    const selectedIsBoatStack = (actionItemId === BOAT_ITEM_ID) || isBoatBlockId(selectedItem.id) || selectedName.includes('boat');
    const selectedIsMinecartStack = (actionItemId === MINECART_ITEM_ID) || isMinecartBlockId(selectedItem.id) || selectedName.includes('minecart');
    if (selectedKind === ITEM_STACK_KIND_ITEM && DEFERRED_ITEM_USE_MESSAGES.has(actionItemId)) {
        addMessage(DEFERRED_ITEM_USE_MESSAGES.get(actionItemId));
        return;
    }
    if (selectedKind === ITEM_STACK_KIND_ITEM && UNSUPPORTED_ITEM_USE_ALIASES.has(actionItemId)) {
        addMessage('That item use is not implemented yet.');
        return;
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === MILK_BUCKET_ITEM_ID) {
        inventory.slots[selectedSlotIndex] = new ItemStack(EMPTY_BUCKET_ITEM_ID, 1, null, 0, ITEM_STACK_KIND_ITEM);
        refreshHotbar();
        addMessage('You drink the milk.');
        scheduleSaveGame();
        return;
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM) {
        const breedRes = mobManager.tryBreedNearestAnimal(camera, actionItemId, 4.5);
        if (breedRes && breedRes.consumed) {
            inventory.consumeItem(selectedSlotIndex, 1);
            refreshHotbar();
            if (breedRes.msg) addMessage(breedRes.msg);
            scheduleSaveGame();
            return;
        }
        if (breedRes && breedRes.msg) {
            addMessage(breedRes.msg);
            return;
        }
        const feedRes = mobManager.tryFeedNearestOwnedWolf(camera, actionItemId, 4.5);
        if (feedRes && feedRes.consumed) {
            inventory.consumeItem(selectedSlotIndex, 1);
            refreshHotbar();
            if (feedRes.msg) addMessage(feedRes.msg);
            scheduleSaveGame();
            return;
        }
        if (feedRes && feedRes.msg) {
            addMessage(feedRes.msg);
            return;
        }
    }

    const foodConsumable = selectedKind === ITEM_STACK_KIND_ITEM ? getFoodConsumableDef(actionItemId) : null;
    if (foodConsumable) {
        consumeHeldFoodItem(selectedSlotIndex, foodConsumable);
        return;
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === BOW_ITEM_ID) return;

    if (selectedIsBoatStack) {
        const anchor =
            resolveBoatAnchorFromWaterRay(6.0) ||
            resolveBoatAnchorFromTargetBlock(targetBlock) ||
            resolveBoatAnchorFromView(6.0) ||
            resolveBoatAnchorNearPlayer(3);
        if (!anchor) return;
        const spawned = entityManager.spawnTransport('boat', anchor.x + 0.5, anchor.y + 0.12, anchor.z + 0.5, camera.rotation.y, chunkManager, { anchor });
        if (!spawned) return;
        markPlayerEditPriority();
        inventory.consumeItem(selectedSlotIndex, 1);
        setSelectedSlot(selectedSlotIndex);
        scheduleSaveGame();
        return;
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === SNOWBALL_ITEM_ID) {
        if (throwableUseCooldownTicks > 0) return;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.normalize();
        const fired = !!(mobManager && typeof mobManager.firePlayerSnowball === 'function' && mobManager.firePlayerSnowball(camera.position, dir));
        if (fired) {
            inventory.consumeItem(selectedSlotIndex, 1);
            refreshHotbar();
            throwableUseCooldownTicks = THROWABLE_USE_COOLDOWN_TICKS;
            scheduleSaveGame();
        }
        return;
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === EGG_ITEM_ID) {
        if (throwableUseCooldownTicks > 0) return;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.normalize();
        const fired = !!(mobManager && typeof mobManager.firePlayerEgg === 'function' && mobManager.firePlayerEgg(camera.position, dir));
        if (fired) {
            inventory.consumeItem(selectedSlotIndex, 1);
            refreshHotbar();
            throwableUseCooldownTicks = THROWABLE_USE_COOLDOWN_TICKS;
            scheduleSaveGame();
        }
        return;
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === FISHING_ROD_ITEM_ID) {
        if (fishingBobberDrop) {
            const bx = Math.floor(fishingBobberDrop.position.x);
            const by = Math.floor(fishingBobberDrop.position.y);
            const bz = Math.floor(fishingBobberDrop.position.z);
            const inWater = isWaterId(chunkManager.getBlock(bx, by, bz)) || isWaterId(chunkManager.getBlock(bx, by - 1, bz));
            const inGround = !inWater && chunkManager.getBlock(bx, by, bz) !== 0;
            const catchable = inWater && Number.isFinite(fishingBobberDrop.fishCatchableTicks) && fishingBobberDrop.fishCatchableTicks > 0;
            const hookedDrop = fishingBobberDrop.hookedDrop;
            const hasHookedDrop = !!(hookedDrop && entityManager?.drops?.includes(hookedDrop));
            let fishCaught = false;
            if (catchable && !hasHookedDrop) {
                fishCaught = true;
                const sx = fishingBobberDrop.position.x;
                const sy = fishingBobberDrop.position.y;
                const sz = fishingBobberDrop.position.z;
                const toPlayerX = camera.position.x - sx;
                const toPlayerY = camera.position.y - sy;
                const toPlayerZ = camera.position.z - sz;
                const dist = Math.hypot(toPlayerX, toPlayerY, toPlayerZ) || 1;
                const vel = new THREE.Vector3(
                    (toPlayerX / dist) * 0.8,
                    (toPlayerY / dist) * 0.8 + Math.sqrt(dist) * 0.08,
                    (toPlayerZ / dist) * 0.8
                );
                entityManager.spawnDrop(
                    sx,
                    sy,
                    sz,
                    RAW_FISH_ITEM_ID,
                    vel,
                    0.1,
                    null,
                    { kind: ITEM_STACK_KIND_ITEM, metadata: 0, autoMagnet: false }
                );
                addMessage('You caught a fish.');
            }
            if (!fishCaught && hasHookedDrop) {
                const sx = hookedDrop.mesh.userData.physicsPos.x;
                const sy = hookedDrop.mesh.userData.physicsPos.y;
                const sz = hookedDrop.mesh.userData.physicsPos.z;
                const toPlayerX = camera.position.x - sx;
                const toPlayerY = camera.position.y - sy;
                const toPlayerZ = camera.position.z - sz;
                const dist = Math.hypot(toPlayerX, toPlayerY, toPlayerZ) || 1;
                hookedDrop.velocity.x = (toPlayerX / dist) * 3.0;
                hookedDrop.velocity.y = (toPlayerY / dist) * 3.0 + Math.sqrt(dist) * 0.08;
                hookedDrop.velocity.z = (toPlayerZ / dist) * 3.0;
                fishingBobberDrop.fishCatchableTicks = 0;
                addMessage('You hooked an entity.');
            }
            clearFishingBobber();
            const held = inventory.slots[selectedSlotIndex];
            if (held && held.durability !== undefined) {
                // Jacobo catch result parity:
                // fish=1 durability, in-ground=2, empty retract=0.
                // Hooked entity pull path uses durability 3.
                const rodDamage = hasHookedDrop ? 3 : (fishCaught ? 1 : (inGround ? 2 : 0));
                held.durability -= rodDamage;
                if (held.durability <= 0) inventory.slots[selectedSlotIndex] = null;
            }
            refreshHotbar();
            scheduleSaveGame();
            return;
        }
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.normalize();
        const spawnPos = camera.position.clone().addScaledVector(dir, 0.8);
        spawnPos.y -= 0.2;
        const vel = dir.clone().multiplyScalar(10.0);
        vel.y += 2.2;
        fishingBobberDrop = entityManager.spawnDrop(
            spawnPos.x,
            spawnPos.y,
            spawnPos.z,
            FISHING_BOBBER_ITEM_ID,
            vel,
            9999.0,
            null,
            { kind: ITEM_STACK_KIND_ITEM, metadata: 0 }
        );
        if (fishingBobberDrop) {
            fishingBobberDrop.autoMagnet = false;
            fishingBobberDrop.pickupDelay = 9999.0;
            fishingBobberDrop.fishWaitTicks = 100 + Math.floor(Math.random() * 801); // 5..45s
            fishingBobberDrop.fishCatchableTicks = 0;
            fishingBobberDrop.hookedDrop = null;
        }
        scheduleSaveGame();
        return;
    }

    const selectedDef = selectedKind === ITEM_STACK_KIND_ITEM ? getInventoryDef(selectedItem.id, ITEM_STACK_KIND_ITEM) : null;
    if (selectedKind === ITEM_STACK_KIND_ITEM && selectedDef?.toolType === 'hoe' && targetBlock) {
        const { x, y, z } = targetBlock;
        const targetId = chunkManager.getBlock(x, y, z);
        const aboveId = chunkManager.getBlock(x, y + 1, z);
        if ((targetId === 1 || targetId === 2) && aboveId === 0) {
            markPlayerEditPriority();
            chunkManager.setBlock(x, y, z, 60);
            chunkManager.setMetadata(x, y, z, 0);
            updateModBlock(x, y, z, 60, 0);
            updateSurfaceColumnCacheForChunkColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: 60, metadata: 0, immediate: true } });
            if (inventory.slots[selectedSlotIndex]?.durability !== undefined) {
                inventory.slots[selectedSlotIndex].durability--;
                if (inventory.slots[selectedSlotIndex].durability <= 0) {
                    inventory.slots[selectedSlotIndex] = null;
                }
            }
            refreshHotbar();
            scheduleSaveGame();
            return;
        }
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === SEEDS_ITEM_ID && targetBlock) {
        const { x, y, z } = targetBlock;
        const targetId = chunkManager.getBlock(x, y, z);
        const aboveId = chunkManager.getBlock(x, y + 1, z);
        if (isFarmlandId(targetId) && aboveId === 0) {
            markPlayerEditPriority();
            chunkManager.setBlock(x, y + 1, z, CROP_BLOCK_ID);
            chunkManager.setMetadata(x, y + 1, z, 0);
            updateModBlock(x, y + 1, z, CROP_BLOCK_ID, 0);
            updateSurfaceColumnCacheForChunkColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y: y + 1, z, id: CROP_BLOCK_ID, metadata: 0, immediate: true } });
            updateDependentsAround(x, y + 1, z, true);
            inventory.consumeItem(selectedSlotIndex, 1);
            refreshHotbar();
            scheduleSaveGame();
            return;
        }
        // Seeds are use-only and should not fall through to generic block placement.
        return;
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === DYE_POWDER_ITEM_ID && targetBlock) {
        const dyeMeta = Number.isFinite(Number(selectedItem.metadata)) ? (Number(selectedItem.metadata) & 15) : 0;
        // Bone meal growth parity slice: metadata 15 on crops accelerates growth.
        if (dyeMeta === 15) {
            const { x, y, z } = targetBlock;
            const targetId = chunkManager.getBlock(x, y, z);
            if (isCropId(targetId)) {
                const growth = chunkManager.getMetadata(x, y, z) & 7;
                if (growth < 7) {
                    const delta = 2 + Math.floor(Math.random() * 4); // +2..+5 like broad Beta-style acceleration.
                    const next = Math.min(7, growth + delta);
                    markPlayerEditPriority();
                    chunkManager.setMetadata(x, y, z, next);
                    updateModBlock(x, y, z, targetId, next);
                    chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: targetId, metadata: next, immediate: true } });
                    inventory.consumeItem(selectedSlotIndex, 1);
                    refreshHotbar();
                    scheduleSaveGame();
                }
                return;
            }
            if (targetId === 103) {
                const supportId = chunkManager.getBlock(x, y - 1, z);
                if (supportId === 1 || supportId === 2 || isFarmlandId(supportId)) {
                    const updates = new Map();
                    if (tryQueueSaplingGrowth(updates, x, y, z)) {
                        markPlayerEditPriority();
                        applyBlockChangesAndSync(updates, { immediate: true, updateSurfaceCache: true });
                        inventory.consumeItem(selectedSlotIndex, 1);
                        refreshHotbar();
                        scheduleSaveGame();
                    }
                }
                return;
            }
        }
    }

    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === BONE_ITEM_ID) {
        const sitRes = mobManager.tryToggleNearestWolfSit(camera, 4.5);
        if (sitRes && sitRes.ok) {
            if (sitRes.msg) addMessage(sitRes.msg);
            scheduleSaveGame();
            return;
        }
        const tameRes = mobManager.tryTameNearestWolf(camera, 4.5);
        if (tameRes && tameRes.consumed) {
            inventory.consumeItem(selectedSlotIndex, 1);
            refreshHotbar();
            scheduleSaveGame();
        }
        if (tameRes && tameRes.msg) addMessage(tameRes.msg);
        return;
    }

    // --- SHEARS LOGIC ---
    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === SHEARS_ITEM_ID) {
        const shearRes = mobManager.tryShearNearestSheep(camera, 4.5);
        if (shearRes && shearRes.ok) {
            if (inventory.slots[selectedSlotIndex]?.durability !== undefined) {
                inventory.slots[selectedSlotIndex].durability--;
                if (inventory.slots[selectedSlotIndex].durability <= 0) {
                    inventory.slots[selectedSlotIndex] = null;
                }
            }
            refreshHotbar();
            addMessage(shearRes.msg || 'Sheared sheep.');
            scheduleSaveGame();
        } else if (shearRes && shearRes.msg) {
            addMessage(shearRes.msg);
        }
        return;
    }

    // --- BUCKET LOGIC ---
    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === EMPTY_BUCKET_ITEM_ID) { // Empty Bucket -> Fill
        const milkRes = mobManager.tryMilkNearestCow(camera, 4.5);
        if (milkRes && milkRes.ok) {
            inventory.slots[selectedSlotIndex].count--;
            if (inventory.slots[selectedSlotIndex].count <= 0) {
                inventory.slots[selectedSlotIndex] = new ItemStack(MILK_BUCKET_ITEM_ID, 1, null, 0, ITEM_STACK_KIND_ITEM);
            } else {
                const addedMilk = inventory.addItem(MILK_BUCKET_ITEM_ID, 1, null, 0, ITEM_STACK_KIND_ITEM);
                if (!addedMilk) {
                    entityManager.spawnDrop(
                        camera.position.x, camera.position.y, camera.position.z,
                        MILK_BUCKET_ITEM_ID, null, 0.2, null, { kind: ITEM_STACK_KIND_ITEM }
                    );
                }
            }
            refreshHotbar();
            if (milkRes.msg) addMessage(milkRes.msg);
            scheduleSaveGame();
            return;
        }
        const liquidHit = getLiquidHit();
        if (liquidHit) {
            const { x, y, z, id } = liquidHit;
            const meta = chunkManager.getMetadata(x, y, z);
            
            // Only pickup SOURCE blocks
            if (meta === 0) {
                // Determine filled bucket type
                const filledId = isWaterId(id) ? 61 : 62; 
                
                // Remove liquid from world
                chunkManager.setBlock(x, y, z, 0);
                chunkManager.setMetadata(x, y, z, 0);
                updateModBlock(x, y, z, 0, 0);
                markRepeatersDirtyAround(x, y, z);
                updateSurfaceColumnCacheForChunkColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
                chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: 0, metadata: 0, immediate: true } });
                if (shouldUpdateRailsForBlockChange(id, 0)) {
                    updateRailsAround(x, y, z, true);
                }
                updateDependentsAround(x, y, z, true);
                
                // Update Inventory
                inventory.slots[selectedSlotIndex].count--;
                if (inventory.slots[selectedSlotIndex].count <= 0) {
                    inventory.slots[selectedSlotIndex] = new ItemStack(filledId, 1, null, 0, ITEM_STACK_KIND_ITEM);
                } else {
                    const added = inventory.addItem(filledId, 1, null, 0, ITEM_STACK_KIND_ITEM);
                    if (!added) {
                        entityManager.spawnDrop(camera.position.x, camera.position.y, camera.position.z, filledId, null, 0.2, null, { kind: ITEM_STACK_KIND_ITEM });
                    }
                }
                refreshHotbar();
                scheduleSaveGame();
            }
        }
        return; // Buckets don't place blocks normally
    }
    
    if (selectedKind === ITEM_STACK_KIND_ITEM && (actionItemId === WATER_BUCKET_ITEM_ID || actionItemId === LAVA_BUCKET_ITEM_ID)) { // Filled Bucket -> Empty
        if (!targetBlock) return;
        const { x, y, z, face } = targetBlock;
        const nx = x + Math.round(face.normal.x);
        const ny = y + Math.round(face.normal.y);
        const nz = z + Math.round(face.normal.z);
        
        // Ensure target is clear (Air or replaceable fluid)
        const currentId = chunkManager.getBlock(nx, ny, nz);
        if (currentId !== 0 && !isFluidId(currentId)) return;
        
        const liquidId = (actionItemId === WATER_BUCKET_ITEM_ID) ? WATER_MOVING_ID : LAVA_MOVING_ID;
        
        // Place Liquid Source
        markPlayerEditPriority();
        chunkManager.setBlock(nx, ny, nz, liquidId);
        chunkManager.setMetadata(nx, ny, nz, 0);
        updateModBlock(nx, ny, nz, liquidId, 0);
        updateSurfaceColumnCacheForChunkColumn(Math.floor(nx / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE));
        igniteTntForAdjacentIgnition(nx, ny, nz, liquidId);
        chunkWorker.postMessage({ type: 'setBlock', data: { x: nx, y: ny, z: nz, id: liquidId, metadata: 0, immediate: true } });
        if (shouldUpdateRailsForBlockChange(currentId, liquidId)) {
            updateRailsAround(nx, ny, nz, true);
        }
        updateDependentsAround(nx, ny, nz, true);
        
        // Consume Filled Bucket, give Empty
        inventory.slots[selectedSlotIndex] = new ItemStack(60, 1, null, 0, ITEM_STACK_KIND_ITEM);
        refreshHotbar();
        scheduleSaveGame();
        return;
    }

    // --- FLINT AND STEEL LOGIC ---
    if (selectedKind === ITEM_STACK_KIND_ITEM && actionItemId === FLINT_AND_STEEL_ITEM_ID) {
        if (!targetBlock) return;
        const { x, y, z, face } = targetBlock;

        if (isTntId(chunkManager.getBlock(x, y, z)) && tntManager && tntManager.igniteAt(x, y, z)) {
            if (inventory.slots[selectedSlotIndex].durability !== undefined) {
                inventory.slots[selectedSlotIndex].durability--;
                if (inventory.slots[selectedSlotIndex].durability <= 0) {
                    inventory.slots[selectedSlotIndex] = null;
                }
            }
            refreshHotbar();
            scheduleSaveGame();
            return;
        }

        const nx = x + Math.round(face.normal.x);
        const ny = y + Math.round(face.normal.y);
        const nz = z + Math.round(face.normal.z);

        const currentId = chunkManager.getBlock(nx, ny, nz);
        // Only place in Air, but also ensure it's not overriding something important.
        if (currentId !== 0) return; 

        // 1. Try to Ignite Portal First
        if (tryIgnitePortal(nx, ny, nz)) {
            // Durability
            if (inventory.slots[selectedSlotIndex].durability !== undefined) {
                 inventory.slots[selectedSlotIndex].durability--;
                 if (inventory.slots[selectedSlotIndex].durability <= 0) {
                     inventory.slots[selectedSlotIndex] = null;
                 }
            }
            refreshHotbar();
            scheduleSaveGame();
            return;
        }

        // CALCULATE FIRE METADATA
        let meta = 0; // Default Floor
        const n = face.normal;
        
        if (n.y === 1) { meta = 0; } // Clicked top face -> Floor
        else if (n.z === 1) { meta = 1; } // Clicked South Face -> Fire is on South Side (North Wall) -> Meta 1
        else if (n.z === -1) { meta = 2; } // Clicked North Face -> Fire is on North Side (South Wall) -> Meta 2
        else if (n.x === 1) { meta = 4; } // Clicked East Face -> Fire is on East Side (West Wall) -> Meta 4
        else if (n.x === -1) { meta = 3; } // Clicked West Face -> Fire is on West Side (East Wall) -> Meta 3

        // Place Fire
        markPlayerEditPriority();
        chunkManager.setBlock(nx, ny, nz, 63);
        chunkManager.setMetadata(nx, ny, nz, meta);
        updateModBlock(nx, ny, nz, 63, meta);
        updateSurfaceColumnCacheForChunkColumn(Math.floor(nx / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE));
        igniteTntForAdjacentIgnition(nx, ny, nz, 63);
        chunkWorker.postMessage({ type: 'setBlock', data: { x: nx, y: ny, z: nz, id: 63, metadata: meta, immediate: true } });
        if (shouldUpdateRailsForBlockChange(0, 63)) {
            updateRailsAround(nx, ny, nz, true);
        }
        updateDependentsAround(nx, ny, nz, true);

        // Durability
        if (inventory.slots[selectedSlotIndex].durability !== undefined) {
             inventory.slots[selectedSlotIndex].durability--;
             if (inventory.slots[selectedSlotIndex].durability <= 0) {
                 inventory.slots[selectedSlotIndex] = null;
             }
        }
        refreshHotbar();
        scheduleSaveGame();
        return;
    }

    if (!targetBlock) return;
    
    let placementItemId = resolvePlacementBlockIdForStack(selectedItem, selectedKind);
    // Guard against runtime kind/id collisions: action item id always wins for
    // transport placement routing.
    if (selectedIsBoatStack) {
        placementItemId = BOAT_BLOCK_ID;
    } else if (selectedIsMinecartStack) {
        placementItemId = MINECART_BLOCK_ID;
    }

    const bDef = selectedKind === ITEM_STACK_KIND_BLOCK
        ? getPlaceableBlockDef(selectedItem.id)
        : getPlaceableBlockDef(placementItemId);
    if (!bDef) return;

    const { x, y, z, face } = targetBlock;
    const nx = x + Math.round(face.normal.x);
    const ny = y + Math.round(face.normal.y);
    const nz = z + Math.round(face.normal.z);
    
    let blockId = placementItemId;
    if (selectedKind === ITEM_STACK_KIND_BLOCK) {
        // Block-kind stacks are expected to carry runtime block ids.
        // Only beta-convert legacy ids if this id has no runtime block definition.
        if (!getPlaceableBlockDef(blockId)) {
            blockId = fromBetaCompatibleBlockId(blockId);
        }
    }
    blockId = normalizeRuntimeTerrainId(blockId);
    const allowPlacementInsidePlayer =
        isTorchId(blockId) || // torch family
        isButtonId(blockId) ||
        isLeverId(blockId) ||
        isPressurePlateId(blockId) ||
        isRailId(blockId) ||
        isRepeaterId(blockId) ||
        isTrapdoorId(blockId) ||
        isLadderId(blockId) ||
        isSignId(blockId) ||
        isPaintingId(blockId) ||
        isVehicleBlockId(blockId) ||
        isBedBlockId(blockId) ||
        isCakeBlockId(blockId) ||
        blockId === 63 || // fire block id (if ever directly placeable)
        isFluidId(blockId);

    const pX = camera.position.x;
    const pY = getPlayerColliderTopY(camera.position.y);
    const pZ = camera.position.z;
    const height = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
    const r = PLAYER_RADIUS; 

    const playerMinX = pX - r;
    const playerMaxX = pX + r;
    const playerMinY = pY - height; 
    const playerMaxY = pY;          
    const playerMinZ = pZ - r;
    const playerMaxZ = pZ + r;

    const blockMinX = nx - 0.5;
    const blockMaxX = nx + 0.5;
    const blockMinY = ny - 0.5;
    const blockMaxY = isSlabId(blockId) ? ny : (isBedBlockId(blockId) ? ny + (1 / 16) : (isCakeBlockId(blockId) ? ny : ny + 0.5));
    const blockMinZ = nz - 0.5;
    const blockMaxZ = nz + 0.5;

    const placementOverlapEpsilon = 0.08;
    const overlapX = (playerMinX < blockMaxX - placementOverlapEpsilon && playerMaxX > blockMinX + placementOverlapEpsilon);
    const overlapY = (playerMinY < blockMaxY - placementOverlapEpsilon && playerMaxY > blockMinY + placementOverlapEpsilon);
    const overlapZ = (playerMinZ < blockMaxZ - placementOverlapEpsilon && playerMaxZ > blockMinZ + placementOverlapEpsilon);

    if (!allowPlacementInsidePlayer && overlapX && overlapY && overlapZ) {
        return; 
    }

    let vehicleSpawnAnchor = null;
    const targetId = chunkManager.getBlock(nx, ny, nz);
    if (targetId !== 0 && !isFluidId(targetId) && !isVehicleBlockId(blockId)) return;

    if (isPaintingId(blockId)) {
        const ok = placePaintingAtTarget(x, y, z, face.normal);
        if (!ok) return;
        inventory.consumeItem(selectedSlotIndex);
        setSelectedSlot(selectedSlotIndex);
        scheduleSaveGame();
        return;
    }

    let meta = Number.isFinite(Number(selectedItem.metadata)) ? (Number(selectedItem.metadata) & 15) : 0;
    if (blockId === 5) {
        // Beta parity: player-placed leaves are marked non-decaying.
        meta |= 4;
    }

    if (isPistonId(blockId)) { // Piston supports full 6-axis orientation parity
        meta = determinePistonPlacementMeta(nx, ny, nz);
    } else if (isFurnaceId(blockId) || isDispenserId(blockId) || isChestId(blockId)) { // Furnace / Dispenser / Chest
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        if (Math.abs(dir.x) > Math.abs(dir.z)) {
            if (dir.x > 0) meta = 3; // Looking East -> Block faces West (3)
            else meta = 2;           // Looking West -> Block faces East (2)
        } else {
            if (dir.z > 0) meta = 1; // Looking South -> Block faces North (1)
            else meta = 0;           // Looking North -> Block faces South (0)
        }
    }

    if (isTorchId(blockId)) { // Torch Placement
        const n = face.normal;
        if (n.y === 1) meta = 5;      // Top (Floor)
        else if (n.z === -1) meta = 1; // North
        else if (n.z === 1) meta = 2;  // South
        else if (n.x === 1) meta = 3;  // East
        else if (n.x === -1) meta = 4; // West
        else return; // Cannot place on bottom (ceiling)
    }
    if (isButtonId(blockId)) { // Stone Button placement, wall-only like Beta
        const n = face.normal;
        if (n.z === -1) meta = 1;      // attached to north face
        else if (n.z === 1) meta = 2;  // attached to south face
        else if (n.x === 1) meta = 3;  // attached to east face
        else if (n.x === -1) meta = 4; // attached to west face
        else return;
    }
    if (isLeverId(blockId)) {
        const n = face.normal;
        if (n.y === 1) {
            meta = 6; // floor
        } else if (n.y === -1) {
            meta = 0; // ceiling
        } else if (n.z === -1) meta = 4;
        else if (n.z === 1) meta = 3;
        else if (n.x === 1) meta = 1;
        else if (n.x === -1) meta = 2;
        else return;
        if (!isLeverSupportValidAt(nx, ny, nz, meta)) return;
    }
    if (isPressurePlateId(blockId)) { // Wood pressure plate: top-face placement only
        if (face.normal.y !== 1) return;
        meta = 0;
    }
    if (isRailId(blockId)) { // Rail placement: top-face only
        if (face.normal.y !== 1) return;
        const yaw = camera.rotation.y;
        meta = (Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw))) ? 1 : 0;
        const supportId = chunkManager.getBlock(nx, ny - 1, nz);
        if (!isSolidForRailSupport(supportId)) return;
    }
    if (isRedstoneWireId(blockId)) {
        if (face.normal.y !== 1) return;
        const supportId = chunkManager.getBlock(nx, ny - 1, nz);
        if (!isSolidForRailSupport(supportId)) return;
        meta = 0;
    }
    if (isSlabId(blockId)) { // Minimal slab placement: top-face only, bottom half
        if (face.normal.y !== 1) return;
        meta = 0;
    }
    if (isRepeaterId(blockId)) { // Minimal repeater placement: top-face only, directional by camera yaw
        if (face.normal.y !== 1) return;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        if (Math.abs(dir.x) > Math.abs(dir.z)) {
            meta = dir.x > 0 ? 3 : 1;
        } else {
            meta = dir.z > 0 ? 2 : 0;
        }
    }
    if (isTrapdoorId(blockId)) {
        const n = face.normal;
        if (n.y === 0) {
            const supportId = chunkManager.getBlock(x, y, z);
            if (!isSolidForRailSupport(supportId)) return;
            if (n.z === 1) meta = 0;
            else if (n.z === -1) meta = 1;
            else if (n.x === 1) meta = 2;
            else if (n.x === -1) meta = 3;
            else return;
            const topHalfBit = camera.position.y >= (ny + 0.5) ? 8 : 0;
            meta |= topHalfBit;
        } else if (n.y === 1 || n.y === -1) {
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            if (Math.abs(dir.x) > Math.abs(dir.z)) meta = dir.x > 0 ? 2 : 3;
            else meta = dir.z > 0 ? 0 : 1;
            if (n.y === -1) meta |= 8;
        } else {
            return;
        }
        if (!isTrapdoorSupportValidAt(nx, ny, nz, meta)) return;
    }
    if (isLadderId(blockId)) {
        const n = face.normal;
        if (n.y !== 0) return;
        const supportId = chunkManager.getBlock(x, y, z);
        if (!isSolidForRailSupport(supportId)) return;
        if (n.z === 1) meta = 2;
        else if (n.z === -1) meta = 3;
        else if (n.x === 1) meta = 4;
        else if (n.x === -1) meta = 5;
        else return;
    }
    if (isSignId(blockId)) {
        const n = face.normal;
        if (n.y === 1) {
            blockId = SIGN_POST_BLOCK_ID;
            const yaw = camera.rotation.y;
            meta = ((Math.floor(((yaw * 180 / Math.PI) + 180) * 16 / 360 + 0.5)) & 15);
        } else if (n.y === 0) {
            blockId = WALL_SIGN_BLOCK_ID;
            const supportId = chunkManager.getBlock(x, y, z);
            if (!isSolidForRailSupport(supportId)) return;
            if (n.z === 1) meta = 2;
            else if (n.z === -1) meta = 3;
            else if (n.x === 1) meta = 4;
            else if (n.x === -1) meta = 5;
            else return;
        } else {
            return;
        }
    }
    if (isDoorId(blockId)) {
        if (face.normal.y !== 1) return;
        const aboveId = chunkManager.getBlock(nx, ny + 1, nz);
        if (aboveId !== 0) return;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        if (Math.abs(dir.x) > Math.abs(dir.z)) {
            meta = dir.x > 0 ? 3 : 1;
        } else {
            meta = dir.z > 0 ? 0 : 2;
        }
    }
    if (isFurnaceId(blockId) || isDispenserId(blockId) || isPumpkinId(blockId)) {
        if (face.normal.y !== 1) return;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        if (Math.abs(dir.x) > Math.abs(dir.z)) {
            meta = dir.x > 0 ? 3 : 1;
        } else {
            meta = dir.z > 0 ? 0 : 2;
        }
    }
    if (isPaintingId(blockId)) {
        const n = face.normal;
        if (n.y !== 0) return;
        const supportId = chunkManager.getBlock(x, y, z);
        if (!isSolidForRailSupport(supportId)) return;
        if (n.z === 1) meta = 2;
        else if (n.z === -1) meta = 3;
        else if (n.x === 1) meta = 4;
        else if (n.x === -1) meta = 5;
        else return;
    }
    if (isBoatBlockId(blockId)) {
        const clickedIsWater = isWaterId(chunkManager.getBlock(x, y, z));
        const belowIsWater = isWaterId(chunkManager.getBlock(nx, ny - 1, nz));
        // If target isn't directly water, require top-face placement like Beta.
        if (!clickedIsWater && face.normal.y !== 1) return;
        if (!clickedIsWater && !belowIsWater) return;
        const ax = clickedIsWater ? x : nx;
        const az = clickedIsWater ? z : nz;
        let ay = clickedIsWater ? y : (ny - 1);
        // Snap placement to water surface (topmost contiguous water block).
        while (ay + 1 < WORLD_HEIGHT && isWaterId(chunkManager.getBlock(ax, ay + 1, az))) {
            ay++;
        }
        if (chunkManager.getBlock(ax, ay + 1, az) !== 0) return;
        vehicleSpawnAnchor = { x: ax, y: ay, z: az };
        meta = 0;
    }
    if (isMinecartBlockId(blockId)) {
        const clickedIsRail = isRailId(chunkManager.getBlock(x, y, z));
        const belowIsRail = isRailId(chunkManager.getBlock(nx, ny - 1, nz));
        if (!clickedIsRail && !belowIsRail) return;
        const ax = clickedIsRail ? x : nx;
        const ay = clickedIsRail ? y : (ny - 1);
        const az = clickedIsRail ? z : nz;
        if (chunkManager.getBlock(ax, ay + 1, az) !== 0) return;
        vehicleSpawnAnchor = { x: ax, y: ay, z: az };
        meta = 0;
    }
    if (isCactusId(blockId)) {
        if (face.normal.y !== 1) return;
        if (!isValidCactusAt(nx, ny, nz)) return;
        meta = 0;
    }
    if (isReedId(blockId)) {
        if (face.normal.y !== 1) return;
        if (!isValidReedAt(nx, ny, nz)) return;
        meta = 0;
    }
    if (isFlowerId(blockId) || isTallGrassId(blockId)) {
        if (face.normal.y !== 1) return;
        const supportId = chunkManager.getBlock(nx, ny - 1, nz);
        if (!(supportId === 1 || supportId === 2 || isFarmlandId(supportId))) return;
        meta = 0;
    }
    if (isMushroomId(blockId)) {
        if (face.normal.y !== 1) return;
        const supportId = chunkManager.getBlock(nx, ny - 1, nz);
        if (!isSolidForRailSupport(supportId)) return;
        if (chunkManager.getLight(nx, ny, nz) > 12) return;
        meta = 0;
    }
    if (isDeadBushId(blockId)) {
        if (face.normal.y !== 1) return;
        const supportId = chunkManager.getBlock(nx, ny - 1, nz);
        if (supportId !== 9) return; // sand only
        meta = 0;
    }
    if (blockId === 103) { // Sapling placement parity: only on grass/dirt/farmland.
        if (face.normal.y !== 1) return;
        const supportId = chunkManager.getBlock(nx, ny - 1, nz);
        if (!(supportId === 1 || supportId === 2 || isFarmlandId(supportId))) return;
        meta = 0;
    }
    if (isBedBlockId(blockId)) {
        if (face.normal.y !== 1) return;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        if (Math.abs(dir.x) > Math.abs(dir.z)) {
            meta = dir.x > 0 ? 3 : 1;
        } else {
            meta = dir.z > 0 ? 0 : 2;
        }
        const off = getBedHeadOffset(meta);
        const hx = nx + off.x;
        const hz = nz + off.z;
        if (chunkManager.getBlock(hx, ny, hz) !== 0) return;
        if (!isSolidForRailSupport(chunkManager.getBlock(nx, ny - 1, nz))) return;
        if (!isSolidForRailSupport(chunkManager.getBlock(hx, ny - 1, hz))) return;
    }
    if (isCakeBlockId(blockId)) { // Minimal cake placement: top-face only, inert single-block placeholder
        if (face.normal.y !== 1) return;
        meta = 0;
    }
    
    if (blockId === 7) {
        controls.unlock();
        setTimeout(() => {
            const url = prompt("Enter URL:", "https://youtube.com");
            if (url) {
                const previousId = chunkManager.getBlock(nx, ny, nz);
                markPlayerEditPriority();
                chunkManager.setBlock(nx, ny, nz, 7);
                addLinkBlock(nx, ny, nz, url);
                updateModBlock(nx, ny, nz, 7, 0);
                updateSurfaceColumnCacheForChunkColumn(Math.floor(nx / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE));
                // Added immediate: true to prioritize player action
                chunkWorker.postMessage({ type: 'setBlock', data: { x: nx, y: ny, z: nz, id: 7, metadata: 0, immediate: true } });
                if (shouldUpdateRailsForBlockChange(previousId, 7)) {
                    updateRailsAround(nx, ny, nz, true);
                }
                updateDependentsAround(nx, ny, nz, true);
                inventory.consumeItem(selectedSlotIndex);
                setSelectedSlot(selectedSlotIndex); 
                scheduleSaveGame();
            }
            requestPointerLockSafe(false);
        }, 100);
    } else {
        if (isDoorId(blockId)) {
            markPlayerEditPriority();
            const hingeBit = computeDoorHingeBit(nx, ny, nz, meta & 3, blockId) & 1;
            // Bottom half
            chunkManager.setBlock(nx, ny, nz, blockId);
            chunkManager.setMetadata(nx, ny, nz, meta & 3);
            updateModBlock(nx, ny, nz, blockId, meta & 3);
            // Top half
            chunkManager.setBlock(nx, ny + 1, nz, blockId);
            chunkManager.setMetadata(nx, ny + 1, nz, 8 | hingeBit);
            updateModBlock(nx, ny + 1, nz, blockId, 8 | hingeBit);
            markRepeatersDirtyAround(nx, ny, nz);
            markRepeatersDirtyAround(nx, ny + 1, nz);
            updateSurfaceColumnCacheForChunkColumn(Math.floor(nx / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE));
            fallingBlockManager.markDirty(nx, ny, nz);
            fallingBlockManager.markDirty(nx, ny + 1, nz);
            chunkWorker.postMessage({ type: 'setBlock', data: { x: nx, y: ny, z: nz, id: blockId, metadata: meta & 3, immediate: true } });
            chunkWorker.postMessage({ type: 'setBlock', data: { x: nx, y: ny + 1, z: nz, id: blockId, metadata: 8 | hingeBit, immediate: true } });
            updateDependentsAround(nx, ny, nz, true);
            updateDependentsAround(nx, ny + 1, nz, true);
            inventory.consumeItem(selectedSlotIndex);
            setSelectedSlot(selectedSlotIndex);
            scheduleSaveGame();
            return;
        }
        if (isBedBlockId(blockId)) {
            markPlayerEditPriority();
            const off = getBedHeadOffset(meta);
            const hx = nx + off.x;
            const hz = nz + off.z;
            const footMeta = meta & 3;
            const headMeta = (meta & 3) | 8;
            chunkManager.setBlock(nx, ny, nz, blockId);
            chunkManager.setMetadata(nx, ny, nz, footMeta);
            updateModBlock(nx, ny, nz, blockId, footMeta);
            chunkManager.setBlock(hx, ny, hz, blockId);
            chunkManager.setMetadata(hx, ny, hz, headMeta);
            updateModBlock(hx, ny, hz, blockId, headMeta);
            markRepeatersDirtyAround(nx, ny, nz);
            markRepeatersDirtyAround(hx, ny, hz);
            updateSurfaceColumnCacheForChunkColumn(Math.floor(nx / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE));
            updateSurfaceColumnCacheForChunkColumn(Math.floor(hx / CHUNK_SIZE), Math.floor(hz / CHUNK_SIZE));
            fallingBlockManager.markDirty(nx, ny, nz);
            fallingBlockManager.markDirty(hx, ny, hz);
            chunkWorker.postMessage({ type: 'setBlock', data: { x: nx, y: ny, z: nz, id: blockId, metadata: footMeta, immediate: true } });
            chunkWorker.postMessage({ type: 'setBlock', data: { x: hx, y: ny, z: hz, id: blockId, metadata: headMeta, immediate: true } });
            updateDependentsAround(nx, ny, nz, true);
            updateDependentsAround(hx, ny, hz, true);
            inventory.consumeItem(selectedSlotIndex);
            setSelectedSlot(selectedSlotIndex);
            scheduleSaveGame();
            return;
        }
        if (isBoatBlockId(blockId) || isMinecartBlockId(blockId)) {
            const transportType = isBoatBlockId(blockId) ? 'boat' : 'minecart';
            const anchor = vehicleSpawnAnchor || { x: nx, y: ny, z: nz };
            const spawnY = isBoatBlockId(blockId) ? (anchor.y + 0.12) : (anchor.y + 0.35);
            const spawned = entityManager.spawnTransport(transportType, anchor.x, spawnY, anchor.z, camera.rotation.y, chunkManager, isBoatBlockId(blockId) ? { anchor } : null);
            if (!spawned) return;
            markPlayerEditPriority();
            inventory.consumeItem(selectedSlotIndex);
            setSelectedSlot(selectedSlotIndex);
            scheduleSaveGame();
            return;
        }

        if (isFurnaceId(blockId)) {
            furnaceRegistry.set(getKey(nx, ny, nz), {
                inventory: [null, null, null],
                burnTime: 0,
                cookTime: 0,
                maxCookTime: 200
            });
        } else if (isDispenserId(blockId)) {
            dispenserRegistry.set(getKey(nx, ny, nz), {
                slots: new Array(9).fill(null)
            });
        }
        else if (isChestId(blockId)) {
            // Chest Placement Logic with Explicit Pairing
            const canPairChest = (blockId === 53 || blockId === 54);
            
            // 1. Calculate offsets for Left and Right neighbors relative to chest face
            let leftOff = {x:0, z:0}, rightOff = {x:0, z:0};
            if (meta === 0) { leftOff={x:1,z:0}; rightOff={x:-1,z:0}; }      // South
            else if (meta === 1) { leftOff={x:-1,z:0}; rightOff={x:1,z:0}; } // North
            else if (meta === 2) { leftOff={x:0,z:-1}; rightOff={x:0,z:1}; } // East
            else if (meta === 3) { leftOff={x:0,z:1}; rightOff={x:0,z:-1}; } // West

            const check = (off) => {
                const tx = nx + off.x; const ty = ny; const tz = nz + off.z;
                const tid = chunkManager.getBlock(tx, ty, tz);
                const tmeta = chunkManager.getMetadata(tx, ty, tz);
                // Valid partner: Must be Chest (53), Same Rotation, AND Single (Shape bits 0)
                if ((tid === 53 || tid === 54) && (tmeta & 3) === meta && (tmeta & 12) === 0) {
                    return {x:tx, y:ty, z:tz, originalMeta: tmeta};
                }
                return null;
            }

            const leftNeighbor = canPairChest ? check(leftOff) : null;
            const rightNeighbor = canPairChest ? check(rightOff) : null;

            if (leftNeighbor) {
                // Found a SINGLE chest to my Left.
                // Left Neighbor becomes LEFT half (8). I become RIGHT half (4).
                const leftId = chunkManager.getBlock(leftNeighbor.x, leftNeighbor.y, leftNeighbor.z);
                const nNewMeta = meta | 8; 
                chunkManager.setMetadata(leftNeighbor.x, leftNeighbor.y, leftNeighbor.z, nNewMeta);
                updateModBlock(leftNeighbor.x, leftNeighbor.y, leftNeighbor.z, leftId, nNewMeta);
                chunkWorker.postMessage({ type: 'setBlock', data: { x: leftNeighbor.x, y: leftNeighbor.y, z: leftNeighbor.z, id: leftId, metadata: nNewMeta, immediate: true } });
                
                meta |= 4; // I am Right
            } else if (rightNeighbor) {
                // Found a SINGLE chest to my Right.
                // Right Neighbor becomes RIGHT half (4). I become LEFT half (8).
                const rightId = chunkManager.getBlock(rightNeighbor.x, rightNeighbor.y, rightNeighbor.z);
                const nNewMeta = meta | 4;
                chunkManager.setMetadata(rightNeighbor.x, rightNeighbor.y, rightNeighbor.z, nNewMeta);
                updateModBlock(rightNeighbor.x, rightNeighbor.y, rightNeighbor.z, rightId, nNewMeta);
                chunkWorker.postMessage({ type: 'setBlock', data: { x: rightNeighbor.x, y: rightNeighbor.y, z: rightNeighbor.z, id: rightId, metadata: nNewMeta, immediate: true } });

                meta |= 8; // I am Left
            }
            
            // Locked chests remain single and never pair.
            if (!canPairChest) {
                meta = (meta & 3);
            }
            chestRegistry.set(getKey(nx, ny, nz), {
                slots: new Array(30).fill(null)
            });
        }

        markPlayerEditPriority();
        chunkManager.setBlock(nx, ny, nz, blockId);
        chunkManager.setMetadata(nx, ny, nz, meta);
        updateModBlock(nx, ny, nz, blockId, meta);
        markRepeatersDirtyAround(nx, ny, nz);
        if (isSignId(blockId)) {
            signRegistry.set(getKey(nx, ny, nz), { text: '' });
            refreshSignTextMeshAt(nx, ny, nz);
        }
        updateSurfaceColumnCacheForChunkColumn(Math.floor(nx / CHUNK_SIZE), Math.floor(nz / CHUNK_SIZE));
        fallingBlockManager.markDirty(nx, ny, nz);
        const ignitedImmediately = igniteTntForAdjacentIgnition(nx, ny, nz, blockId);
        // Added immediate: true to prioritize player action. If TNT ignited
        // immediately on placement, do not send the placed TNT block after the
        // ignition path has already removed it.
        if (!(isTntId(blockId) && ignitedImmediately)) {
            chunkWorker.postMessage({ type: 'setBlock', data: { x: nx, y: ny, z: nz, id: blockId, metadata: meta, immediate: true } });
        }
        if (shouldUpdateRailsForBlockChange(targetId, blockId)) {
            updateRailsAround(nx, ny, nz, true);
        }
        updateDependentsAround(nx, ny, nz, true);
        
        inventory.consumeItem(selectedSlotIndex);
        setSelectedSlot(selectedSlotIndex); 
        scheduleSaveGame();
    }
}

function updateModBlock(x, y, z, id, meta = 0) {
    const runtimeId = normalizeRuntimeTerrainId(id);
    invalidateTickChunkFeatureCacheAt(x, y, z);
    const posKey = `${x},${y},${z}`;
    const modIdx = modifiedBlockIndexByPos.get(posKey);
    if (modIdx !== undefined) {
        const existing = modifiedBlocks[modIdx];
        if (existing) {
            existing.id = runtimeId;
            existing.metadata = meta;
            return;
        }
    }

    const mod = { x, y, z, id: runtimeId, metadata: meta };
    modifiedBlocks.push(mod);
    const newIdx = modifiedBlocks.length - 1;
    modifiedBlockIndexByPos.set(posKey, newIdx);

    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunkKey = `${cx},${cy},${cz}`;
    let chunkMods = modifiedBlocksByChunk.get(chunkKey);
    if (!chunkMods) {
        chunkMods = [];
        modifiedBlocksByChunk.set(chunkKey, chunkMods);
    }
    chunkMods.push(mod);
}

function interact() {
    if (!targetBlock || IS_PAUSED || IS_INVENTORY_OPEN) return;
    
    const { x, y, z } = targetBlock;
    const id = chunkManager.getBlock(x, y, z);
    if (isDoorId(id)) {
        toggleDoorAt(x, y, z);
        return;
    }
    if (isCakeBlockId(id)) {
        if (playerHealth >= PLAYER_MAX_HEALTH) return;
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        healPlayerBy(3);
        if (meta < 5) {
            const next = meta + 1;
            markPlayerEditPriority();
            chunkManager.setMetadata(x, y, z, next);
            updateModBlock(x, y, z, id, next);
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: next, immediate: true } });
            requestChunkGeometryAt(x, y, z);
        } else {
            markPlayerEditPriority();
            chunkManager.setBlock(x, y, z, 0);
            chunkManager.setMetadata(x, y, z, 0);
            updateModBlock(x, y, z, 0, 0);
            markRepeatersDirtyAround(x, y, z);
            updateSurfaceColumnCacheForChunkColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id: 0, metadata: 0, immediate: true } });
            updateDependentsAround(x, y, z, true);
        }
        scheduleSaveGame();
        return;
    }
    if (isNoteBlockId(id)) {
        const meta = chunkManager.getMetadata(x, y, z) & 31;
        const next = (meta + 1) % 25;
        markPlayerEditPriority();
        chunkManager.setMetadata(x, y, z, next);
        updateModBlock(x, y, z, id, next);
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: next, immediate: true } });
        requestChunkGeometryAt(x, y, z);
        addMessage(`Note block pitch: ${next}`);
        scheduleSaveGame();
        return;
    }
    if (isButtonId(id)) {
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        if ((meta & 8) === 0) {
            const pressed = meta | 8;
            markPlayerEditPriority();
            chunkManager.setMetadata(x, y, z, pressed);
            updateModBlock(x, y, z, id, pressed);
            markRepeatersDirtyAround(x, y, z);
            chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: pressed, immediate: true } });
            requestChunkGeometryAt(x, y, z);
            const key = getKey(x, y, z);
            if (buttonReleaseTimers.has(key)) clearTimeout(buttonReleaseTimers.get(key));
            const timer = setTimeout(() => {
                if (chunkManager.getBlock(x, y, z) !== id) return;
                const cur = chunkManager.getMetadata(x, y, z) & 15;
                const released = cur & 7;
                chunkManager.setMetadata(x, y, z, released);
                updateModBlock(x, y, z, id, released);
                markRepeatersDirtyAround(x, y, z);
                chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: released, immediate: true } });
                requestChunkGeometryAt(x, y, z);
                buttonReleaseTimers.delete(key);
                scheduleSaveGame();
            }, 900);
            buttonReleaseTimers.set(key, timer);
            scheduleSaveGame();
        }
        return;
    }
    if (isRepeaterId(id)) {
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        const orient = meta & 3;
        const delay = (meta >> 2) & 3;
        const next = orient | (((delay + 1) & 3) << 2);
        markPlayerEditPriority();
        chunkManager.setMetadata(x, y, z, next);
        updateModBlock(x, y, z, id, next);
        markRepeatersDirtyAround(x, y, z);
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: next, immediate: true } });
        requestChunkGeometryAt(x, y, z);
        scheduleSaveGame();
        return;
    }
    if (isLeverId(id)) {
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        const toggled = meta ^ 8;
        if (!isLeverSupportValidAt(x, y, z, toggled)) return;
        markPlayerEditPriority();
        chunkManager.setMetadata(x, y, z, toggled);
        updateModBlock(x, y, z, id, toggled);
        markRepeatersDirtyAround(x, y, z);
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: toggled, immediate: true } });
        requestChunkGeometryAt(x, y, z);
        updateDependentsAround(x, y, z, true);
        scheduleSaveGame();
        return;
    }
    if (isTrapdoorId(id)) {
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        const toggled = meta ^ 4;
        if (!isTrapdoorSupportValidAt(x, y, z, toggled)) return;
        markPlayerEditPriority();
        chunkManager.setMetadata(x, y, z, toggled);
        updateModBlock(x, y, z, id, toggled);
        chunkWorker.postMessage({ type: 'setBlock', data: { x, y, z, id, metadata: toggled, immediate: true } });
        requestChunkGeometryAt(x, y, z);
        scheduleSaveGame();
        return;
    }
    if (isBedBlockId(id)) {
        if (CURRENT_DIMENSION !== 'OVERWORLD' || !isSleepTimeForBeds(worldTimeTicks)) {
            addMessage('You can only sleep at night.');
            return;
        }
        const meta = chunkManager.getMetadata(x, y, z) & 15;
        bedRespawnPoint = getBedRespawnPointFromBlock(x, y, z, meta);
        setWorldTimeTicks(WAKE_MORNING_TICKS);
        scheduleSaveGame();
        addMessage('Sleeping...');
        return;
    }
    if (isSignId(id)) {
        controls.unlock();
        setTimeout(() => {
            const key = getKey(x, y, z);
            const currentText = signRegistry.get(key)?.text || '';
            const nextText = prompt('Sign text:', currentText);
            if (nextText !== null) {
                signRegistry.set(key, { text: String(nextText).slice(0, 120) });
                refreshSignTextMeshAt(x, y, z);
                scheduleSaveGame();
            }
            requestPointerLockSafe(false);
        }, 100);
        return;
    }
    
    if (isCraftingTableId(id)) { 
        IS_INVENTORY_OPEN = true;
        toggleInventoryUI(true, 'CRAFTING_TABLE');
        controls.unlock();
    } else if (isDispenserId(id)) {
        if (moveState.crouch) {
            triggerDispenserAt(x, y, z);
            return;
        }
        const key = getKey(x, y, z);
        let de = dispenserRegistry.get(key);
        if (!de) {
            de = { slots: new Array(9).fill(null) };
            dispenserRegistry.set(key, de);
        }
        inventory.activeTileEntity = {
            inventory: de.slots,
            isDouble: false
        };
        IS_INVENTORY_OPEN = true;
        toggleInventoryUI(true, 'DISPENSER');
        controls.unlock();
    } else if (isFurnaceId(id)) { 
        const key = getKey(x, y, z);
        let fe = furnaceRegistry.get(key);
        if (!fe) {
            fe = { inventory: [null, null, null], burnTime: 0, cookTime: 0, maxCookTime: 200 };
            furnaceRegistry.set(key, fe);
        }
        inventory.activeTileEntity = fe;
        IS_INVENTORY_OPEN = true;
        toggleInventoryUI(true, 'FURNACE');
        controls.unlock();
    } else if (isChestId(id)) {
        if (id === 95) {
            addMessage('The locked chest won\'t open.');
            return;
        }
        openChest(x, y, z);
        controls.unlock();
    }
}

function openChest(x, y, z) {
    const chestId = chunkManager.getBlock(x, y, z);
    if (chestId === 95) {
        addMessage('The locked chest won\'t open.');
        return;
    }
    const key = getKey(x, y, z);
    let chestData = chestRegistry.get(key);
    if (!chestData) {
        chestData = { slots: new Array(30).fill(null) };
        chestRegistry.set(key, chestData);
    }
    
    // Check metadata for connection
    const meta = chunkManager.getMetadata(x, y, z);
    const shape = meta & 12; // Bits 2 & 3
    const rot = meta & 3;    // Bits 0 & 1
    
    let nKey = null;
    let neighborData = null;
    let isFirst = true; 
    
    if (shape !== 0) {
        // Calculate partner position
        let px=x, py=y, pz=z;
        let leftOff = {x:0, z:0}, rightOff = {x:0, z:0};
        
        // Rotation offsets
        if (rot === 0) { leftOff={x:1,z:0}; rightOff={x:-1,z:0}; }      // South
        else if (rot === 1) { leftOff={x:-1,z:0}; rightOff={x:1,z:0}; } // North
        else if (rot === 2) { leftOff={x:0,z:-1}; rightOff={x:0,z:1}; } // East
        else if (rot === 3) { leftOff={x:0,z:1}; rightOff={x:0,z:-1}; } // West

        if (shape === 8) { // I am Left, Partner is Right
            px += rightOff.x; pz += rightOff.z;
            isFirst = true; // Left is primary
        } else if (shape === 4) { // I am Right, Partner is Left
            px += leftOff.x; pz += leftOff.z;
            isFirst = false; // Right is secondary
        }
        
        nKey = getKey(px, py, pz);
    }

    if (nKey) {
        neighborData = chestRegistry.get(nKey);
        if (!neighborData) {
            neighborData = { slots: new Array(30).fill(null) };
            chestRegistry.set(nKey, neighborData);
        }

        // Create a proxy object that makes two arrays look like one
        const combined = {
             inventory: new Proxy({}, {
                 get: (target, prop) => {
                     const idx = Number(prop);
                     if (isNaN(idx)) return undefined;
                     if (idx < 0 || idx >= 60) return undefined;
                     
                     if (isFirst) {
                         return (idx < 30) ? chestData.slots[idx] : neighborData.slots[idx - 30];
                     } else {
                         return (idx < 30) ? neighborData.slots[idx] : chestData.slots[idx - 30];
                     }
                 },
                 set: (target, prop, value) => {
                     const idx = Number(prop);
                     if (isNaN(idx)) return false;
                     
                     if (isFirst) {
                         if (idx < 30) chestData.slots[idx] = value;
                         else neighborData.slots[idx - 30] = value;
                     } else {
                         if (idx < 30) neighborData.slots[idx] = value;
                         else chestData.slots[idx - 30] = value;
                     }
                     return true;
                 }
             }),
             isDouble: true
        };
        
        inventory.activeTileEntity = combined;
    } else {
        // Single chest wrapper
        inventory.activeTileEntity = {
            inventory: chestData.slots,
            isDouble: false
        };
    }
    
    IS_INVENTORY_OPEN = true;
    toggleInventoryUI(true, 'CHEST');
}

function interactWithUrl() {
    if (!targetBlock || IS_PAUSED || IS_INVENTORY_OPEN) return;
    if (targetBlock.object.userData.isLink) {
        window.open(targetBlock.object.userData.url, '_blank');
    }
}

function getDispenserFacing(meta) {
    const m = meta & 3;
    if (m === 0) return { x: 0, y: 0, z: 1 };
    if (m === 1) return { x: -1, y: 0, z: 0 };
    if (m === 2) return { x: 0, y: 0, z: -1 };
    return { x: 1, y: 0, z: 0 };
}

function isAirLikeForDispenser(id) {
    return id === 0 || isFluidId(id);
}

function canDispenserPlaceBlockAt(x, y, z) {
    if (y < WORLD_DEPTH || y >= WORLD_HEIGHT) return false;
    return isAirLikeForDispenser(chunkManager.getBlock(x, y, z));
}

function consumeDispenserSlot(slots, idx, replacementStack = null) {
    const stack = slots[idx];
    if (!stack || stack.count <= 0) return false;
    stack.count--;
    if (stack.count <= 0) {
        slots[idx] = replacementStack;
    }
    return true;
}

function createDispenseVelocity(facing) {
    const vel = new THREE.Vector3(facing.x * 6.0, 1.0, facing.z * 6.0);
    vel.x += (Math.random() - 0.5) * 0.4;
    vel.z += (Math.random() - 0.5) * 0.4;
    return vel;
}

function tryDispenserUseProjectile(stack, origin, dir) {
    const actionId = getActionItemId(stack);
    const firedArrow = actionId === ARROW_ITEM_ID
        && mobManager
        && typeof mobManager.firePlayerArrow === 'function'
        && mobManager.firePlayerArrow(origin, dir, 1.0);
    if (firedArrow) return true;
    const firedSnowball = actionId === SNOWBALL_ITEM_ID
        && mobManager
        && typeof mobManager.firePlayerSnowball === 'function'
        && mobManager.firePlayerSnowball(origin, dir);
    if (firedSnowball) return true;
    const firedEgg = actionId === EGG_ITEM_ID
        && mobManager
        && typeof mobManager.firePlayerEgg === 'function'
        && mobManager.firePlayerEgg(origin, dir);
    if (firedEgg) return true;
    return false;
}

function tryDispenserPlaceFluidBucket(stack, tx, ty, tz) {
    const actionId = getActionItemId(stack);
    if (actionId !== WATER_BUCKET_ITEM_ID && actionId !== LAVA_BUCKET_ITEM_ID) return null;
    if (!canDispenserPlaceBlockAt(tx, ty, tz)) return null;
    const liquidId = actionId === WATER_BUCKET_ITEM_ID ? WATER_MOVING_ID : LAVA_MOVING_ID;
    applyBlockChangesAndSync([{ x: tx, y: ty, z: tz, id: liquidId, metadata: 0 }], { immediate: true, updateSurfaceCache: true });
    igniteTntForAdjacentIgnition(tx, ty, tz, liquidId);
    return new ItemStack(EMPTY_BUCKET_ITEM_ID, 1, null, 0, ITEM_STACK_KIND_ITEM);
}

function tryDispenserPickupFluid(stack, tx, ty, tz) {
    const actionId = getActionItemId(stack);
    if (actionId !== EMPTY_BUCKET_ITEM_ID) return null;
    const id = chunkManager.getBlock(tx, ty, tz);
    const meta = chunkManager.getMetadata(tx, ty, tz);
    if (!isFluidId(id) || meta !== 0) return null;
    const filledId = isWaterId(id) ? WATER_BUCKET_ITEM_ID : LAVA_BUCKET_ITEM_ID;
    applyBlockChangesAndSync([{ x: tx, y: ty, z: tz, id: 0, metadata: 0 }], { immediate: true, updateSurfaceCache: true });
    return new ItemStack(filledId, 1, null, 0, ITEM_STACK_KIND_ITEM);
}

function tryDispenserIgniteFront(stack, tx, ty, tz) {
    const actionId = getActionItemId(stack);
    if (actionId !== FLINT_AND_STEEL_ITEM_ID) return false;
    const frontId = chunkManager.getBlock(tx, ty, tz);
    if (isTntId(frontId) && tntManager && tntManager.igniteAt(tx, ty, tz)) {
        return true;
    }
    if (frontId !== 0) return false;
    const belowId = chunkManager.getBlock(tx, ty - 1, tz);
    if (belowId === 0 || isFluidId(belowId)) return false;
    applyBlockChangesAndSync([{ x: tx, y: ty, z: tz, id: 63, metadata: 0 }], { immediate: true, updateSurfaceCache: true });
    igniteTntForAdjacentIgnition(tx, ty, tz, 63);
    return true;
}

function tryDispenserPlaceBlockItem(stack, tx, ty, tz) {
    const stackKind = getItemStackKind(stack.id, stack.kind);
    if (stackKind !== ITEM_STACK_KIND_BLOCK) return false;
    const def = getPlaceableBlockDef(stack.id);
    if (!def) return false;
    if (!canDispenserPlaceBlockAt(tx, ty, tz)) return false;
    applyBlockChangesAndSync([{ x: tx, y: ty, z: tz, id: stack.id, metadata: stack.metadata || 0 }], { immediate: true, updateSurfaceCache: true });
    igniteTntForAdjacentIgnition(tx, ty, tz, stack.id);
    return true;
}

function triggerDispenserAt(x, y, z) {
    const key = getKey(x, y, z);
    let de = dispenserRegistry.get(key);
    if (!de) {
        de = { slots: new Array(9).fill(null) };
        dispenserRegistry.set(key, de);
    }
    const slots = de.slots;
    const candidates = [];
    for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s && s.count > 0) candidates.push(i);
    }
    if (candidates.length === 0) {
        addMessage('Dispenser is empty.');
        return false;
    }
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    const stack = slots[idx];
    const facing = getDispenserFacing(chunkManager.getMetadata(x, y, z) & 15);
    const tx = x + facing.x;
    const ty = y;
    const tz = z + facing.z;
    const origin = new THREE.Vector3(x + 0.5 + facing.x * 0.6, y + 0.5, z + 0.5 + facing.z * 0.6);
    const dir = new THREE.Vector3(facing.x, 0, facing.z).normalize();

    const replacementFromPickup = tryDispenserPickupFluid(stack, tx, ty, tz);
    if (replacementFromPickup) {
        slots[idx] = replacementFromPickup;
        scheduleSaveGame();
        return true;
    }

    const replacementFromPlaceBucket = tryDispenserPlaceFluidBucket(stack, tx, ty, tz);
    if (replacementFromPlaceBucket) {
        consumeDispenserSlot(slots, idx, replacementFromPlaceBucket);
        scheduleSaveGame();
        return true;
    }

    if (tryDispenserUseProjectile(stack, origin, dir)) {
        consumeDispenserSlot(slots, idx);
        scheduleSaveGame();
        return true;
    }

    if (tryDispenserIgniteFront(stack, tx, ty, tz)) {
        // Flint-and-steel durability parity can be tightened later; for now consume 1 use by stack item semantics.
        consumeDispenserSlot(slots, idx);
        scheduleSaveGame();
        return true;
    }

    if (tryDispenserPlaceBlockItem(stack, tx, ty, tz)) {
        consumeDispenserSlot(slots, idx);
        scheduleSaveGame();
        return true;
    }

    const vel = createDispenseVelocity(facing);
    entityManager.spawnDrop(
        origin.x, origin.y - 0.4, origin.z,
        stack.id,
        vel,
        0.25,
        stack.durability ?? null,
        { metadata: stack.metadata, kind: getItemStackKind(stack.id, stack.kind) }
    );
    consumeDispenserSlot(slots, idx);
    scheduleSaveGame();
    return true;
}

function dropCurrentItem() {
    if (IS_PAUSED || IS_INVENTORY_OPEN) return;
    const idx = getSelectedSlot();
    const item = inventory.slots[idx];
    if (!item) return;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const spawnPos = camera.position.clone().add(dir.clone().multiplyScalar(1.0));
    spawnPos.y -= 0.5;

    const vel = dir.multiplyScalar(4.0); 
    vel.y += 2.0;

    entityManager.spawnDrop(
        spawnPos.x,
        spawnPos.y,
        spawnPos.z,
        item.id,
        vel,
        1.0,
        item.durability,
        { metadata: item.metadata, kind: getItemStackKind(item.id, item.kind) }
    ); 
    
    inventory.consumeItem(idx, 1);
    setSelectedSlot(idx); 
}

function dropCursorItem() {
    if (!inventory.cursorItem) return;

    const item = inventory.cursorItem;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    // Loop through the stack count to spawn each item individually
    for (let i = 0; i < item.count; i++) {
        const spawnPos = camera.position.clone().add(dir.clone().multiplyScalar(1.0));
        spawnPos.y -= 0.5;

        // Apply slight random offset to velocity to scatter items
        const vel = dir.clone().multiplyScalar(4.0);
        vel.y += 2.0;
        vel.x += (Math.random() - 0.5) * 1.0;
        vel.z += (Math.random() - 0.5) * 1.0;

        entityManager.spawnDrop(
            spawnPos.x,
            spawnPos.y,
            spawnPos.z,
            item.id,
            vel,
            1.0,
            item.durability,
            { metadata: item.metadata, kind: getItemStackKind(item.id, item.kind) }
        );
    }
    
    inventory.cursorItem = null;
}

function getPlayerAttackDamage() {
    const slot = getSelectedSlot();
    const item = inventory.slots[slot];
    if (!item) return 1;
    if (getItemStackKind(item.id, item.kind) !== ITEM_STACK_KIND_ITEM) return 1;
    const def = getInventoryDef(item.id, getItemStackKind(item.id, item.kind));
    if (!def) return 1;
    if (def.toolType === 'sword') {
        const tier = Number.isFinite(def.tier) ? def.tier : 1;
        return Math.max(2, 2 + tier);
    }
    if (def.toolType === 'axe') {
        const tier = Number.isFinite(def.tier) ? def.tier : 1;
        return Math.max(1, 1 + tier);
    }
    return 1;
}

function updateFurnaces() {
    const getSmeltingResult = (inputStack) => {
        return getSmeltingResultForInput(inputStack);
    };

    furnaceRegistry.forEach((fe, key) => {
        let isBurning = fe.burnTime > 0;
        let dirty = false;
        
        if (fe.burnTime > 0) {
            fe.burnTime--;
        }
        
        const input = fe.inventory[0];
        const fuel = fe.inventory[1];
        
        const smeltResult = getSmeltingResult(input);
        if (input && smeltResult) {
            const resultId = smeltResult.id;
            const resultKind = smeltResult.kind;
            const resultMeta = Number.isFinite(Number(smeltResult.metadata)) ? (Number(smeltResult.metadata) & 15) : 0;
            
            const output = fe.inventory[2];
            let canSmelt = false;
            const outputDef = resultKind === ITEM_STACK_KIND_BLOCK
                ? getPlaceableBlockDef(resultId)
                : (getInventoryDef(resultId, resultKind) || getRuntimeBlockDef(resultId));
            const outputMaxStack = Math.max(1, Math.floor(Number(outputDef?.maxStack) || 64));
            if (!output) canSmelt = true;
            else if (
                output.id === resultId &&
                getItemStackKind(output.id, output.kind) === resultKind &&
                ((Number(output.metadata) || 0) & 15) === resultMeta &&
                output.count < outputMaxStack
            ) canSmelt = true;
            
            if (canSmelt) {
                const fuelValue = getFuelValueForInputStack(fuel);
                if (fe.burnTime <= 0 && fuel && fuelValue > 0) {
                    fe.burnTime = fuelValue * 20; 
                    const fuelItemId = Number(fuel.id);
                    const isLavaBucketFuel = (fuelItemId === LAVA_BUCKET_ITEM_ID || fuelItemId === 71);
                    if (fuel.count > 0) {
                        fuel.count--;
                        if (fuel.count <= 0) {
                            if (isLavaBucketFuel) fe.inventory[1] = new ItemStack(EMPTY_BUCKET_ITEM_ID, 1, null, 0, ITEM_STACK_KIND_ITEM);
                            else fe.inventory[1] = null;
                        }
                        dirty = true;
                    }
                }
                
                if (fe.burnTime > 0) {
                    fe.cookTime++;
                    if (fe.cookTime >= fe.maxCookTime) {
                        fe.cookTime = 0;
                        input.count--;
                        if (input.count <= 0) fe.inventory[0] = null;
                        
                        if (!fe.inventory[2]) fe.inventory[2] = new ItemStack(resultId, 1, null, resultMeta, resultKind);
                        else fe.inventory[2].count++;
                        
                        dirty = true;
                    }
                } else {
                    fe.cookTime = 0;
                }
            } else {
                fe.cookTime = 0;
            }
        } else {
            fe.cookTime = 0;
        }
        
        const isBurningNow = fe.burnTime > 0;
        if (isBurning !== isBurningNow) {
            const p = parseKey(key);
            const newId = isBurningNow ? 18 : 17;
            const meta = chunkManager.getMetadata(p.x, p.y, p.z);
            chunkManager.setBlock(p.x, p.y, p.z, newId);
            updateModBlock(p.x, p.y, p.z, newId, meta);
            chunkWorker.postMessage({ type: 'setBlock', data: { x: p.x, y: p.y, z: p.z, id: newId, metadata: meta } });
            requestChunkGeometryAt(p.x, p.y, p.z);
        }
    });
}

function updateHover() {
    if (!targetBlock || IS_INVENTORY_OPEN) {
        document.getElementById('link-hover').style.display = 'none';
        return;
    }
    const hover = document.getElementById('link-hover');
    if (targetBlock.object.userData.isLink) {
        hover.innerText = `Middle Click to open: ${targetBlock.object.userData.url}`;
        hover.style.display = 'block';
        return;
    }
    const { x, y, z } = targetBlock;
    const id = chunkManager.getBlock(x, y, z);
    if (isSignId(id)) {
        const txt = signRegistry.get(getKey(x, y, z))?.text || '(empty sign)';
        hover.innerText = `Sign: ${txt}`;
        hover.style.display = 'block';
        return;
    }
    hover.style.display = 'none';
}

function getSavesIndex() {
    try { return JSON.parse(saveStore.getItem('mindblock_saves') || '[]'); } catch(e) { return []; }
}

function toggleDoorAt(x, y, z) {
    const id = chunkManager.getBlock(x, y, z);
    if (!isDoorId(id)) return;
    const meta = chunkManager.getMetadata(x, y, z) & 15;
    const isTop = (meta & 8) !== 0;
    const baseY = isTop ? y - 1 : y;
    const topY = baseY + 1;
    const lowerId = chunkManager.getBlock(x, baseY, z);
    const upperId = chunkManager.getBlock(x, topY, z);
    if (!isDoorId(lowerId) || !isDoorId(upperId)) return;

    const lowerMeta = chunkManager.getMetadata(x, baseY, z) & 15;
    const upperMeta = chunkManager.getMetadata(x, topY, z) & 15;
    const toggledLower = lowerMeta ^ 4;
    const toggledUpper = (upperMeta & 9); // keep top-half bit + hinge bit

    markPlayerEditPriority();
    chunkManager.setMetadata(x, baseY, z, toggledLower);
    updateModBlock(x, baseY, z, lowerId, toggledLower);
    chunkWorker.postMessage({ type: 'setBlock', data: { x, y: baseY, z, id: lowerId, metadata: toggledLower, immediate: true } });

    chunkManager.setMetadata(x, topY, z, toggledUpper);
    updateModBlock(x, topY, z, upperId, toggledUpper);
    chunkWorker.postMessage({ type: 'setBlock', data: { x, y: topY, z, id: upperId, metadata: toggledUpper, immediate: true } });

    requestChunkGeometryAt(x, baseY, z);
    requestChunkGeometryAt(x, topY, z);

    // Paired-door parity: toggle adjacent matching door with opposite hinge.
    const orientation = toggledLower & 3;
    const hinge = upperMeta & 1;
    const sides = getDoorSideOffsets(orientation);
    const candidates = [
        { x: x + sides.left.x, z: z + sides.left.z },
        { x: x + sides.right.x, z: z + sides.right.z }
    ];
    for (const c of candidates) {
        const nLower = chunkManager.getBlock(c.x, baseY, c.z);
        const nUpper = chunkManager.getBlock(c.x, topY, c.z);
        if (!isDoorId(nLower) || !isDoorId(nUpper)) continue;
        const nLowerMeta = chunkManager.getMetadata(c.x, baseY, c.z) & 15;
        const nUpperMeta = chunkManager.getMetadata(c.x, topY, c.z) & 15;
        if ((nLowerMeta & 3) !== orientation) continue;
        if ((nUpperMeta & 1) === hinge) continue;
        const nToggledLower = nLowerMeta ^ 4;
        chunkManager.setMetadata(c.x, baseY, c.z, nToggledLower);
        updateModBlock(c.x, baseY, c.z, nLower, nToggledLower);
        chunkWorker.postMessage({ type: 'setBlock', data: { x: c.x, y: baseY, z: c.z, id: nLower, metadata: nToggledLower, immediate: true } });
        chunkManager.setMetadata(c.x, topY, c.z, (nUpperMeta & 9));
        updateModBlock(c.x, topY, c.z, nUpper, (nUpperMeta & 9));
        chunkWorker.postMessage({ type: 'setBlock', data: { x: c.x, y: topY, z: c.z, id: nUpper, metadata: (nUpperMeta & 9), immediate: true } });
        requestChunkGeometryAt(c.x, baseY, c.z);
        requestChunkGeometryAt(c.x, topY, c.z);
        break;
    }
    scheduleSaveGame();
}

function normalizeSavedModifiedBlocks(list, format = 'runtime_v1') {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue;
        const x = Number(entry.x);
        const y = Number(entry.y);
        const z = Number(entry.z);
        const rawId = Number(entry.id);
        const id = format === 'runtime_v1'
            ? normalizeRuntimeTerrainId(rawId)
            : fromBetaCompatibleBlockId(rawId);
        const metadata = Number.isFinite(Number(entry.metadata)) ? Number(entry.metadata) : 0;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(id)) continue;
        out.push({ x, y, z, id, metadata });
    }
    return out;
}

function normalizeSavedItemStackArray(list, size = null) {
    const source = Array.isArray(list) ? list : [];
    const normalized = source.map((entry) => createItemStackFromSaved(entry));
    if (size == null) return normalized;
    const out = new Array(size).fill(null);
    for (let i = 0; i < size && i < normalized.length; i++) out[i] = normalized[i];
    return out;
}

function normalizeSavedFurnaceData(raw) {
    const inv = normalizeSavedItemStackArray(raw && Array.isArray(raw.inventory) ? raw.inventory : [], 3);
    return {
        inventory: inv,
        burnTime: Number.isFinite(Number(raw?.burnTime)) ? Number(raw.burnTime) : 0,
        cookTime: Number.isFinite(Number(raw?.cookTime)) ? Number(raw.cookTime) : 0,
        maxCookTime: Number.isFinite(Number(raw?.maxCookTime)) ? Number(raw.maxCookTime) : 200
    };
}

function normalizeSavedChestData(raw) {
    const slots = normalizeSavedItemStackArray(raw && Array.isArray(raw.slots) ? raw.slots : [], 30);
    return { slots };
}

function normalizeSavedDispenserData(raw) {
    const slots = normalizeSavedItemStackArray(raw && Array.isArray(raw.slots) ? raw.slots : [], 9);
    return { slots };
}

function serializeItemStackArrayForSave(list) {
    const source = Array.isArray(list) ? list : [];
    return source.map((entry) => serializeItemStackForSave(entry));
}

function serializeFurnaceDataForSave(raw) {
    return {
        inventory: serializeItemStackArrayForSave(raw && Array.isArray(raw.inventory) ? raw.inventory : []),
        burnTime: Number.isFinite(Number(raw?.burnTime)) ? Number(raw.burnTime) : 0,
        cookTime: Number.isFinite(Number(raw?.cookTime)) ? Number(raw.cookTime) : 0,
        maxCookTime: Number.isFinite(Number(raw?.maxCookTime)) ? Number(raw.maxCookTime) : 200
    };
}

function serializeChestDataForSave(raw) {
    return {
        slots: serializeItemStackArrayForSave(raw && Array.isArray(raw.slots) ? raw.slots : [])
    };
}

function serializeDispenserDataForSave(raw) {
    return {
        slots: serializeItemStackArrayForSave(raw && Array.isArray(raw.slots) ? raw.slots : [])
    };
}

function normalizeSavedSignData(raw) {
    return {
        text: typeof raw?.text === 'string' ? raw.text.slice(0, 120) : ''
    };
}

function serializeSignDataForSave(raw) {
    return {
        text: typeof raw?.text === 'string' ? raw.text.slice(0, 120) : ''
    };
}

function saveGame() {
    if (deferredSaveTimeout !== null) {
        clearTimeout(deferredSaveTimeout);
        deferredSaveTimeout = null;
    }
    if (!CURRENT_WORLD_ID) return;
    const furnaceData = [];
    furnaceRegistry.forEach((val, key) => {
        const p = parseKey(key);
        furnaceData.push({ x: p.x, y: p.y, z: p.z, data: serializeFurnaceDataForSave(val) });
    });

    const chestDataArr = [];
    chestRegistry.forEach((val, key) => {
        const p = parseKey(key);
        chestDataArr.push({ x: p.x, y: p.y, z: p.z, data: serializeChestDataForSave(val) });
    });
    const dispenserDataArr = [];
    dispenserRegistry.forEach((val, key) => {
        const p = parseKey(key);
        dispenserDataArr.push({ x: p.x, y: p.y, z: p.z, data: serializeDispenserDataForSave(val) });
    });

    const signDataArr = [];
    signRegistry.forEach((val, key) => {
        const p = parseKey(key);
        signDataArr.push({ x: p.x, y: p.y, z: p.z, data: serializeSignDataForSave(val) });
    });
    if (CURRENT_DIMENSION === 'OVERWORLD') {
        signRegistryOverworld = new Map(signRegistry);
    } else {
        signRegistryNether = new Map(signRegistry);
    }
    const signsOverworld = [];
    signRegistryOverworld.forEach((val, key) => {
        const p = parseKey(key);
        signsOverworld.push({ x: p.x, y: p.y, z: p.z, data: serializeSignDataForSave(val) });
    });
    const signsNether = [];
    signRegistryNether.forEach((val, key) => {
        const p = parseKey(key);
        signsNether.push({ x: p.x, y: p.y, z: p.z, data: serializeSignDataForSave(val) });
    });

    // UPDATED: Save dimension state
    const saveCurrentMods = getSaveModifiedBlocksSnapshot();
    if (CURRENT_DIMENSION === 'OVERWORLD') {
        modifiedBlocksOverworld = saveCurrentMods;
        mobsOverworld = mobManager.serializeState();
        transportsOverworld = entityManager.serializeTransports();
    } else {
        modifiedBlocksNether = saveCurrentMods;
        mobsNether = mobManager.serializeState();
        transportsNether = entityManager.serializeTransports();
    }

    const data = {
        modifiedBlockFormat: 'runtime_v1',
        modified: [], // Legacy field, kept empty or fallback
        modifiedOverworld: modifiedBlocksOverworld,
        modifiedNether: modifiedBlocksNether,
        surfaceColumnsOverworld: serializeSurfaceColumnCache(surfaceColumnCacheOverworld),
        surfaceColumnsNether: serializeSurfaceColumnCache(surfaceColumnCacheNether),
        originalSurfaceColumnsOverworld: serializeSurfaceColumnCache(originalSurfaceColumnCacheOverworld),
        originalSurfaceColumnsNether: serializeSurfaceColumnCache(originalSurfaceColumnCacheNether),
        mobsOverworld: mobsOverworld || { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] },
        mobsNether: mobsNether || { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] },
        transportsOverworld: Array.isArray(transportsOverworld) ? transportsOverworld : [],
        transportsNether: Array.isArray(transportsNether) ? transportsNether : [],
        dimension: CURRENT_DIMENSION,
        links: [],
        furnaces: furnaceData,
        chests: chestDataArr,
        dispensers: dispenserDataArr,
        signs: signDataArr, // legacy/current-dimension compatibility
        signsOverworld,
        signsNether,
        exposedChunks: Array.from(exposedChunks),
        worldTime: worldTimeTicks,
        bedSpawn: bedRespawnPoint ? { ...bedRespawnPoint } : null,
        player: {
            x: camera.position.x, y: camera.position.y, z: camera.position.z,
            yMode: 'eye',
            rx: camera.rotation.x, ry: camera.rotation.y,
            health: playerHealth,
            flyEnabled: flyEnabled,
            isFlying: isFlying,
            flyFastEnabled: flyFastEnabled
        },
        inventory: serializeItemStackArrayForSave(inventory.slots)
    };
    linkRegistry.forEach((val, key) => {
        const {x,y,z} = parseKey(key);
        data.links.push({ x, y, z, url: val.url });
    });
    saveStore.setItem('mindblock_data_' + CURRENT_WORLD_ID, JSON.stringify(data));
    const saveStatus = document.getElementById('save-status');
    if (saveStatus) {
        saveStatus.style.display = 'block';
        setTimeout(() => { if (saveStatus) saveStatus.style.display = 'none'; }, 1000);
    }
}

function generateTitleWorld() {
    chunkManager.clear();
    modifiedBlocks = [];
    modifiedBlocksOverworld = [];
    modifiedBlocksNether = [];
    surfaceColumnCacheOverworld = new Map();
    surfaceColumnCacheNether = new Map();
    originalSurfaceColumnCacheOverworld = new Map();
    originalSurfaceColumnCacheNether = new Map();
    mobsOverworld = null;
    mobsNether = null;
    transportsOverworld = null;
    transportsNether = null;
    signRegistryOverworld = new Map();
    signRegistryNether = new Map();
    signRegistry = signRegistryOverworld;
    bedRespawnPoint = null;
    resetModifiedBlockCaches();
    CURRENT_DIMENSION = 'OVERWORLD';
    setActiveSurfaceColumnCache();
    linkRegistry.clear();
    furnaceRegistry.clear();
    chestRegistry.clear();
    dispenserRegistry.clear();
    signRegistry.clear();
    clearButtonReleaseTimers();
    clearRepeaterRuntimeState();
    pressedPressurePlateKeys.clear();
    clearFishingBobber();
    clearAllSignTextMeshes();
    renderChunks.forEach(rc => rc.dispose());
    renderChunks.clear();
    pendingGeometryByKey.clear();
    requestedChunks.clear();
    geometryRefreshRequests.clear();
    clearPendingChunkTasks();
    chunkRetryCount.clear();
    resetChunkStreamStats();
    clearChunkLifecycleTrace();
    exposedChunks.clear(); 
    entityManager.clear();
    mobManager.clear();
    if (tntManager) tntManager.clear();
    worldLoadingActive = false;
    setWorldLoadingUIVisible(false);
    
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 65);
    setWorldTimeTicks(WAKE_MORNING_TICKS);
    
    initWorker(getRandomSeedString());

    for(let x=-2; x<=2; x++) {
        for(let z=-2; z<=2; z++) {
            for (let y=Math.floor(WORLD_DEPTH/CHUNK_SIZE); y<2; y++) {
                chunkWorker.postMessage({ type: 'loadChunk', data: { cx: x, cy: y, cz: z } });
                requestedChunks.set(`${x},${y},${z}`, Date.now());
            }
        }
    }
}

function loadWorld(id) {
    const saves = getSavesIndex();
    const saveMeta = saves.find(s => s.id === id);
    if (!saveMeta) return;

    CURRENT_WORLD_ID = id;
    pendingSurfaceSpawn = null;
    markPlannerDirty();
    
    chunkManager.clear();
    modifiedBlocks = [];
    modifiedBlocksOverworld = [];
    modifiedBlocksNether = [];
    surfaceColumnCacheOverworld = new Map();
    surfaceColumnCacheNether = new Map();
    originalSurfaceColumnCacheOverworld = new Map();
    originalSurfaceColumnCacheNether = new Map();
    mobsOverworld = null;
    mobsNether = null;
    signRegistryOverworld = new Map();
    signRegistryNether = new Map();
    signRegistry = signRegistryOverworld;
    resetModifiedBlockCaches();
    linkMeshes.forEach(m => scene.remove(m));
    linkMeshes = [];
    linkRegistry.clear();
    furnaceRegistry.clear();
    chestRegistry.clear();
    dispenserRegistry.clear();
    signRegistry.clear();
    clearButtonReleaseTimers();
    clearRepeaterRuntimeState();
    pressedPressurePlateKeys.clear();
    clearFishingBobber();
    clearAllSignTextMeshes();
    renderChunks.forEach(rc => rc.dispose());
    renderChunks.clear();
    pendingGeometryByKey.clear();
    requestedChunks.clear();
    geometryRefreshRequests.clear();
    clearPendingChunkTasks();
    chunkRetryCount.clear();
    resetChunkStreamStats();
    clearChunkLifecycleTrace();
    exposedChunks.clear(); 
    entityManager.clear();
    mobManager.clear();
    if (tntManager) tntManager.clear();

    const rawData = saveStore.getItem('mindblock_data_' + id);
    initTerrain(saveMeta.seed);
    let startPos = { x: 0, y: WORLD_HEIGHT - 2, z: 0, rx: 0, ry: 0, health: PLAYER_MAX_HEALTH, flyEnabled: false, isFlying: false, flyFastEnabled: false };
    let hasSavedPlayer = false;
    bedRespawnPoint = null;
    inventory.slots.fill(null); 

    if (rawData) {
        const data = JSON.parse(rawData);
        
        // UPDATED: Load dimension data
        if (data.dimension) CURRENT_DIMENSION = data.dimension;
        else CURRENT_DIMENSION = 'OVERWORLD';
        if (Number.isFinite(Number(data.worldTime))) {
            worldTimeTicks = normalizeWorldTimeTicks(Number(data.worldTime));
        } else {
            worldTimeTicks = WAKE_MORNING_TICKS;
        }
        if (data.bedSpawn && typeof data.bedSpawn === 'object') {
            const bx = Number(data.bedSpawn.x);
            const by = Number(data.bedSpawn.y);
            const bz = Number(data.bedSpawn.z);
            if (Number.isFinite(bx) && Number.isFinite(by) && Number.isFinite(bz)) {
                bedRespawnPoint = {
                    dimension: String(data.bedSpawn.dimension || 'OVERWORLD'),
                    x: bx,
                    y: by,
                    z: bz,
                    rx: Number.isFinite(Number(data.bedSpawn.rx)) ? Number(data.bedSpawn.rx) : 0,
                    ry: Number.isFinite(Number(data.bedSpawn.ry)) ? Number(data.bedSpawn.ry) : 0
                };
            }
        }

        const modFormat = (typeof data.modifiedBlockFormat === 'string' && data.modifiedBlockFormat.trim())
            ? data.modifiedBlockFormat.trim()
            : 'runtime_v1';
        if (Array.isArray(data.modifiedOverworld)) modifiedBlocksOverworld = normalizeSavedModifiedBlocks(data.modifiedOverworld, modFormat);
        if (Array.isArray(data.modifiedNether)) modifiedBlocksNether = normalizeSavedModifiedBlocks(data.modifiedNether, modFormat);
        surfaceColumnCacheOverworld = deserializeSurfaceColumnCache(data.surfaceColumnsOverworld);
        surfaceColumnCacheNether = deserializeSurfaceColumnCache(data.surfaceColumnsNether);
        originalSurfaceColumnCacheOverworld = deserializeSurfaceColumnCache(data.originalSurfaceColumnsOverworld);
        originalSurfaceColumnCacheNether = deserializeSurfaceColumnCache(data.originalSurfaceColumnsNether);
        if (originalSurfaceColumnCacheOverworld.size === 0 && surfaceColumnCacheOverworld.size > 0) {
            originalSurfaceColumnCacheOverworld = new Map(surfaceColumnCacheOverworld);
        }
        if (originalSurfaceColumnCacheNether.size === 0 && surfaceColumnCacheNether.size > 0) {
            originalSurfaceColumnCacheNether = new Map(surfaceColumnCacheNether);
        }
        if (data.mobsOverworld && typeof data.mobsOverworld === 'object') mobsOverworld = data.mobsOverworld;
        if (data.mobsNether && typeof data.mobsNether === 'object') mobsNether = data.mobsNether;
        if (Array.isArray(data.transportsOverworld)) transportsOverworld = data.transportsOverworld;
        if (Array.isArray(data.transportsNether)) transportsNether = data.transportsNether;
        if (!mobsOverworld) mobsOverworld = { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] };
        if (!mobsNether) mobsNether = { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] };
        if (!Array.isArray(transportsOverworld)) transportsOverworld = [];
        if (!Array.isArray(transportsNether)) transportsNether = [];
        signRegistryOverworld = new Map();
        signRegistryNether = new Map();
        if (Array.isArray(data.signsOverworld)) {
            data.signsOverworld.forEach(s => {
                if (!s) return;
                signRegistryOverworld.set(getKey(s.x, s.y, s.z), normalizeSavedSignData(s.data));
            });
        }
        if (Array.isArray(data.signsNether)) {
            data.signsNether.forEach(s => {
                if (!s) return;
                signRegistryNether.set(getKey(s.x, s.y, s.z), normalizeSavedSignData(s.data));
            });
        }
        // Legacy fallback (single-dimension sign payload).
        if (signRegistryOverworld.size === 0 && signRegistryNether.size === 0 && Array.isArray(data.signs)) {
            data.signs.forEach(s => {
                if (!s) return;
                signRegistryOverworld.set(getKey(s.x, s.y, s.z), normalizeSavedSignData(s.data));
            });
        }

        // Fallback for legacy saves
        if (modifiedBlocksOverworld.length === 0 && Array.isArray(data.modified) && data.modified.length > 0) {
            if (Array.isArray(data.modified[0])) {
                data.modified.forEach(item => {
                    const p = parseKey(item[0]);
                    modifiedBlocksOverworld.push({x:p.x, y:p.y, z:p.z, id:item[1], metadata: item[2]||0});
                });
            } else {
                modifiedBlocksOverworld = normalizeSavedModifiedBlocks(data.modified, modFormat);
            }
        }

        // Set active mods
        if (CURRENT_DIMENSION === 'OVERWORLD') modifiedBlocks = [...modifiedBlocksOverworld];
        else modifiedBlocks = [...modifiedBlocksNether];
        signRegistry = CURRENT_DIMENSION === 'OVERWORLD' ? new Map(signRegistryOverworld) : new Map(signRegistryNether);
        setActiveSurfaceColumnCache();
        rebuildModifiedBlockCaches();

        // Set Visuals
        if (CURRENT_DIMENSION === 'NETHER') {
             scene.background = new THREE.Color(0x4a0e0e);
             scene.fog = new THREE.Fog(0x4a0e0e, 20, 65);
        } else {
             scene.background = new THREE.Color(0x87CEEB);
             scene.fog = new THREE.Fog(0x87CEEB, 20, 65);
             applyWorldTimeVisuals();
        }

        if (data.inventory) inventory.slots = normalizeSavedItemStackArray(data.inventory, 40); 
        
        if (data.furnaces) {
            data.furnaces.forEach(f => {
                furnaceRegistry.set(getKey(f.x, f.y, f.z), normalizeSavedFurnaceData(f.data));
            });
        }

        if (data.chests) {
             data.chests.forEach(c => {
                 chestRegistry.set(getKey(c.x, c.y, c.z), normalizeSavedChestData(c.data));
             });
        }
        if (data.dispensers) {
            data.dispensers.forEach(d => {
                dispenserRegistry.set(getKey(d.x, d.y, d.z), normalizeSavedDispenserData(d.data));
            });
        }
        // sign payload handled above via dimension-aware registries
        
        if (data.exposedChunks && Array.isArray(data.exposedChunks)) {
            exposedChunks = new Set(data.exposedChunks);
        }

        if (Array.isArray(data.links)) {
            data.links.forEach(l => {
                chunkManager.setBlock(l.x, l.y, l.z, 7);
                addLinkBlock(l.x, l.y, l.z, l.url);
            });
        }
        if (data.player) {
            const px = Number(data.player.x);
            const py = Number(data.player.y);
            const pz = Number(data.player.z);
            const prx = Number(data.player.rx);
            const pry = Number(data.player.ry);
            const yMode = typeof data.player.yMode === 'string' ? data.player.yMode : 'top';
            const hasValidXZ = Number.isFinite(px) && Number.isFinite(pz);
            const hasValidY = Number.isFinite(py);
            if (hasValidXZ) {
                const loadedY = hasValidY ? py : (WORLD_HEIGHT - 2);
                const eyeYOffset = (PLAYER_HEIGHT - PLAYER_EYE_HEIGHT);
                const resolvedY = (yMode === 'eye') ? loadedY : (loadedY - eyeYOffset);
                startPos = {
                    x: px,
                    y: resolvedY,
                    z: pz,
                    rx: Number.isFinite(prx) ? prx : 0,
                    ry: Number.isFinite(pry) ? pry : 0,
                    health: Number.isFinite(Number(data.player.health)) ? Math.max(1, Math.min(PLAYER_MAX_HEALTH, Math.floor(Number(data.player.health)))) : PLAYER_MAX_HEALTH,
                    flyEnabled: !!data.player.flyEnabled,
                    isFlying: !!data.player.isFlying,
                    flyFastEnabled: !!data.player.flyFastEnabled
                };
                hasSavedPlayer = true;
            } else {
                console.warn('[loadWorld] invalid saved player position, falling back to spawn', data.player);
            }
        }
    }

    setActiveSurfaceColumnCache();

    initWorker(saveMeta.seed);

    // Reset physics pose state so previous-session crouch/eye offsets cannot leak into this world.
    moveState.crouch = false;
    moveState.jump = false;
    moveState.descend = false;
        flyEnabled = !!startPos.flyEnabled;
        flyFastEnabled = !!startPos.flyFastEnabled;
        isFlying = false;
    resetPhysicsPose(false);

    if(controls) {
        suppressPauseOnUnlockUntil = Date.now() + 1000;
        controls.unlock();
        controls.dispose();
    }
    hasPointerLockSinceWorldLoad = false;
    
    if (!hasSavedPlayer) {
        const jacoboSpawn = getJacoboInitialSpawn(saveMeta.seed, CURRENT_DIMENSION);
        const sx = Number.isFinite(jacoboSpawn.x) ? jacoboSpawn.x : 0;
        const sz = Number.isFinite(jacoboSpawn.z) ? jacoboSpawn.z : 0;
        // New worlds: start safely above terrain, then resolve to generated surface.
        startPos = { ...startPos, x: sx + 0.5, z: sz + 0.5, y: WORLD_HEIGHT - 2 };
        pendingPlayerLoadHealth = PLAYER_MAX_HEALTH;
        worldTimeTicks = WAKE_MORNING_TICKS;
        if (CURRENT_DIMENSION !== 'NETHER') applyWorldTimeVisuals();
        pendingSurfaceSpawn = { x: startPos.x, z: startPos.z, maxRadius: 24, attempts: 0, columnRequested: false, startedAt: Date.now() };
    } else {
        pendingPlayerLoadHealth = Number.isFinite(Number(startPos.health))
            ? Math.max(1, Math.min(PLAYER_MAX_HEALTH, Math.floor(Number(startPos.health))))
            : PLAYER_MAX_HEALTH;
        // Saved worlds: restore around the exact saved eye position.
        // Do not move the camera up to a temporary high Y; that shows the wrong
        // background during loading and can skew planner inputs during restore.
        pendingSurfaceSpawn = {
            x: startPos.x,
            z: startPos.z,
            savedY: startPos.y,
            savedFlying: !!startPos.isFlying,
            restoreSavedPosition: true,
            maxRadius: 24,
            attempts: 0,
            columnRequested: false,
            startedAt: Date.now()
        };
    }

    camera.position.set(startPos.x, startPos.y, startPos.z);
    camera.rotation.set(startPos.rx || 0, startPos.ry || 0, 0);

    controls = new PointerLockControls(camera, document.body);
    
    controls.addEventListener('unlock', () => {
        isMouseDown = false; 
        pointerLockRequestInFlight = false;
        if (pauseRequestedThisFrame || IS_PAUSED) {
            pauseRequestedThisFrame = false;
            setPausedState(true);
            return;
        }
        // Some browsers can unlock pointer lock while RMB is held (context/input edge case).
        // Never enter paused-state on that path; immediately attempt to restore lock.
        if (GAME_ACTIVE && (rightMouseHeld || bowDrawActive) && !IS_INVENTORY_OPEN && !IS_CHAT_OPEN) {
            suppressPauseOnUnlockUntil = Date.now() + 250;
            return;
        }
        // If pointer lock is lost during active gameplay (for example Esc consumed by browser
        // before our key handler), force-open pause menu so user is never left unpaused+unlocked.
        if (
            GAME_ACTIVE &&
            !IS_INVENTORY_OPEN &&
            !IS_CHAT_OPEN &&
            !worldLoadingActive &&
            Date.now() >= suppressPauseOnUnlockUntil
        ) {
            setPausedState(true);
            return;
        }
        return;
    });
    controls.addEventListener('lock', () => {
        pointerLockRequestInFlight = false;
        if (GAME_ACTIVE) {
            hasPointerLockSinceWorldLoad = true;
            if (!worldLoadingActive) {
                setPausedState(false);
            }
        }
    });

    GAME_ACTIVE = true;
    worldLoadStartedMs = Date.now();
    lastChunkProgressMs = worldLoadStartedMs;
    lastChunkProgressCount = 0;
    // Initialize camera smoothing position
    renderCameraPosition.copy(camera.position);
    // Initialize vsync button text
    const vsyncBtn = document.getElementById('btn-vsync');
    if (vsyncBtn) {
        vsyncBtn.textContent = VSYNC_ENABLED ? 'VSync: On' : 'VSync: Off';
    }
    IS_PAUSED = true;
    IS_INVENTORY_OPEN = false;
    IS_CHAT_OPEN = false;
    
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('instructions').style.display = 'block';
    document.getElementById('ui').style.display = 'flex';
    document.getElementById('crosshair').style.display = 'block';
    document.getElementById('debug').style.display = 'none'; // Default closed
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) pauseMenu.classList.add('hidden');
    if (pendingSurfaceSpawn) {
        beginWorldLoading(
            pendingSurfaceSpawn.restoreSavedPosition ? 'Restoring saved position' : 'Preparing surface spawn',
            pendingSurfaceSpawn.restoreSavedPosition ? 18 : null
        );
    } else {
        worldLoadingActive = false;
        setWorldLoadingUIVisible(false);
    }
    
    initUI();
    setSelectedSlot(0);
    if (chunkWorker) {
        camera.getWorldDirection(tempViewDirA);
        chunkWorker.postMessage({
            type: 'playerPosition',
            data: {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
                dirX: tempViewDirA.x,
                dirZ: tempViewDirA.z,
                loadRadius: LOAD_RADIUS()
            }
        });
    }
    mobManager.loadState(CURRENT_DIMENSION === 'OVERWORLD' ? mobsOverworld : mobsNether);
    entityManager.loadTransports(CURRENT_DIMENSION === 'OVERWORLD' ? transportsOverworld : transportsNether);
    bootstrapLoadAroundPlayerOnce();
    if (hasSavedPlayer && CURRENT_DIMENSION === 'OVERWORLD') {
        // Saved-world restore: ensure nearby columns have full block data immediately,
        // preventing "visible but non-collidable/unbreakable" trees right after load.
        const savedCx = Math.floor(startPos.x / CHUNK_SIZE);
        const savedCz = Math.floor(startPos.z / CHUNK_SIZE);
        requestFullColumnsAround(savedCx, savedCz, 1);
    }
    identifyNeededChunks();
    // Send initial chunk load requests immediately.
    processChunkQueue();
    clock.getDelta();
}

// Added Teleport to Top Function
function teleportToTop() {
    teleportPlayerToEstimatedSurface(camera.position.x, camera.position.z, { preferUpOnly: true });
    window.resumeGame();
}

function getCurrentWorldSeedString() {
    if (!CURRENT_WORLD_ID) return null;
    const save = getSavesIndex().find((s) => s.id === CURRENT_WORLD_ID);
    if (!save) return null;
    return String(save.seed ?? '0');
}

function isSlimeChunkAt(cx, cz, seedString = null) {
    const s = seedString ?? getCurrentWorldSeedString();
    if (s == null) return false;
    const worldSeed = parseMinecraftSeed(String(s));
    const x = BigInt(Math.floor(cx));
    const z = BigInt(Math.floor(cz));
    const chunkSeed = (
        worldSeed +
        (x * x * 4987142n) +
        (x * 5947611n) +
        (z * z * 4392871n) +
        (z * 389711n)
    ) ^ 987234911n;
    const rng = new JavaRandom(chunkSeed);
    return rng.nextInt(10) === 0;
}

async function copySeedToClipboard(seed, label = 'Seed copied to clipboard.') {
    const text = String(seed ?? '').trim();
    if (!text) {
        addMessage('No seed available to copy.');
        return { ok: false, msg: 'No seed available to copy.' };
    }
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.pointerEvents = 'none';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        addMessage(label);
        return { ok: true, msg: label };
    } catch (err) {
        console.error('[seed-copy] failed', err);
        addMessage('Failed to copy seed to clipboard.');
        return { ok: false, msg: 'Failed to copy seed to clipboard.' };
    }
}

function beginTeleportToFreshSurfaceSpawn(x, z, label = 'Preparing surface spawn') {
    const targetX = Math.floor(Number(x)) + 0.5;
    const targetZ = Math.floor(Number(z)) + 0.5;
    camera.position.set(targetX, WORLD_HEIGHT - 2, targetZ);
    renderCameraPosition.copy(camera.position);
    velocity.set(0, 0, 0);
    canJumpRef.val = false;
    moveState.jump = false;
    setPausedState(true);
    beginWorldLoading(label);
    pendingSurfaceSpawn = {
        x: targetX,
        z: targetZ,
        maxRadius: 24,
        attempts: 0,
        columnRequested: false,
        startedAt: Date.now()
    };
    identifyNeededChunks();
    processChunkQueue();
}

function beginTeleportToSavedPosition(x, eyeY, z, label = 'Restoring saved position', rotation = null) {
    const targetX = Number(x);
    const targetY = Number(eyeY);
    const targetZ = Number(z);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || !Number.isFinite(targetZ)) return false;
    camera.position.set(targetX, targetY, targetZ);
    if (rotation && Number.isFinite(Number(rotation.rx)) && Number.isFinite(Number(rotation.ry))) {
        camera.rotation.set(Number(rotation.rx), Number(rotation.ry), 0);
    }
    renderCameraPosition.copy(camera.position);
    velocity.set(0, 0, 0);
    canJumpRef.val = false;
    moveState.jump = false;
    setFlyingActive(false);
    setPausedState(true);
    beginWorldLoading(label, 18);
    pendingSurfaceSpawn = {
        x: targetX,
        z: targetZ,
        savedY: targetY,
        savedFlying: false,
        restoreSavedPosition: true,
        maxRadius: 24,
        attempts: 0,
        columnRequested: true,
        startedAt: Date.now()
    };
    requestSavedPositionLoadNeighborhood(targetX, targetY, targetZ);
    processChunkQueue();
    return true;
}

function teleportToWorldSpawn(label = 'Preparing world spawn') {
    if (!GAME_ACTIVE) return { ok: false, msg: 'Game is not active.' };
    clearFishingBobber();
    const seed = getCurrentWorldSeedString();
    if (!seed) return { ok: false, msg: 'No loaded world seed found.' };
    const spawn = getJacoboInitialSpawn(seed, CURRENT_DIMENSION || 'OVERWORLD');
    beginTeleportToFreshSurfaceSpawn(spawn.x, spawn.z, label);
    return { ok: true, msg: `Teleported to world spawn (${spawn.x}, ${spawn.z}).` };
}

function teleportToBedRespawn(label = 'Respawning at bed') {
    if (!GAME_ACTIVE) return { ok: false, msg: 'Game is not active.' };
    if (!bedRespawnPoint) return { ok: false, msg: 'No bed respawn point set.' };
    if ((bedRespawnPoint.dimension || 'OVERWORLD') !== (CURRENT_DIMENSION || 'OVERWORLD')) {
        return { ok: false, msg: 'Bed respawn point is in another dimension.' };
    }
    clearFishingBobber();
    const ok = beginTeleportToSavedPosition(
        bedRespawnPoint.x,
        bedRespawnPoint.y,
        bedRespawnPoint.z,
        label,
        bedRespawnPoint
    );
    return ok
        ? { ok: true, msg: 'Respawning at bed.' }
        : { ok: false, msg: 'Bed respawn failed.' };
}

function killPlayerAndRespawn(options = {}) {
    if (!GAME_ACTIVE) return { ok: false, msg: 'Game is not active.' };
    deathRespawnQueued = false;
    clearFishingBobber();
    const clearInventoryOnRespawn = !!options.clearInventory;
    const healOnRespawn = !!options.heal;
    if (clearInventoryOnRespawn) {
        inventory.slots.fill(null);
        inventory.cursorItem = null;
        refreshHotbar();
    }
    const respawnHealth = healOnRespawn
        ? PLAYER_MAX_HEALTH
        : Math.max(1, Math.min(PLAYER_MAX_HEALTH, Math.floor(Number(playerHealth) || PLAYER_MAX_HEALTH)));
    pendingPlayerLoadHealth = respawnHealth;
    // Show death state before respawn loading completes.
    playerHealth = 0;
    playerInvulnTimer = 0;
    playerBurnTimer = 0;
    playerBurnDamageTimer = 0;
    playerWasInLava = false;
    updatePlayerHealthHUD();
    let res = teleportToBedRespawn('You Died');
    if (!res || !res.ok) {
        res = teleportToWorldSpawn('You Died');
    }
    if (res && res.ok) return { ok: true, msg: 'You died.' };
    return res || { ok: false, msg: 'Kill command failed.' };
}

function queueDeathRespawn(options = {}) {
    if (deathRespawnQueued) return;
    deathRespawnQueued = true;
    // Defer respawn transition by one frame so HUD can paint 0 hearts first.
    requestAnimationFrame(() => {
        if (!GAME_ACTIVE || worldLoadingActive) {
            deathRespawnQueued = false;
            return;
        }
        if (playerHealth > 0) {
            deathRespawnQueued = false;
            return;
        }
        killPlayerAndRespawn(options);
    });
}

function playBowSound(pitch = 1.0) {
    try {
        if (!bowAudioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            bowAudioCtx = new Ctx();
        }
        if (bowAudioCtx.state === 'suspended') {
            bowAudioCtx.resume().catch(() => {});
        }
        const now = bowAudioCtx.currentTime;
        const osc = bowAudioCtx.createOscillator();
        const gain = bowAudioCtx.createGain();
        osc.type = 'triangle';
        const baseHz = 420;
        osc.frequency.setValueAtTime(baseHz * Math.max(0.6, Math.min(1.8, Number(pitch) || 1.0)), now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc.connect(gain);
        gain.connect(bowAudioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
    } catch (_) {}
}

function isBowSelected() {
    const slot = getSelectedSlot();
    const item = inventory.slots[slot];
    if (!item) return false;
    if (getItemStackKind(item.id, item.kind) !== ITEM_STACK_KIND_ITEM) return false;
    return getActionItemId(item) === BOW_ITEM_ID;
}

function cancelBowDraw() {
    bowDrawActive = false;
    bowDrawTicks = 0;
}

function startBowDraw() {
    if (!isBowSelected()) return false;
    bowDrawActive = true;
    bowDrawTicks = 0;
    return true;
}

function releaseBowDraw() {
    if (!bowDrawActive) return false;
    bowDrawActive = false;
    const drawTicks = bowDrawTicks;
    bowDrawTicks = 0;
    if (!isBowSelected()) return false;
    if (!consumeOneInventoryItem(ARROW_ITEM_ID, ITEM_STACK_KIND_ITEM)) {
        addMessage('No arrows.');
        return false;
    }
    const charge01 = Math.max(0, Math.min(1, drawTicks / BOW_MAX_DRAW_TICKS));
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.normalize();
    const fired = !!(mobManager && typeof mobManager.firePlayerArrow === 'function' && mobManager.firePlayerArrow(camera.position, dir, charge01));
    if (!fired) {
        // Arrow was consumed but charge was too low: mimic bow "dry release" behavior.
        // Return the arrow to inventory to avoid eating arrows on invalid draws.
        inventory.addItem(ARROW_ITEM_ID, 1, null, 0, ITEM_STACK_KIND_ITEM);
        refreshHotbar();
        return false;
    }
    const slot = getSelectedSlot();
    const held = inventory.slots[slot];
    if (held && held.durability !== undefined) {
        held.durability--;
        if (held.durability <= 0) inventory.slots[slot] = null;
    }
    refreshHotbar();
    scheduleSaveGame();
    return true;
}

function tickPlayerFallDamage() {
    if (!GAME_ACTIVE || IS_PAUSED || flyEnabled) {
        playerWasGrounded = canJumpRef.val;
        if (playerWasGrounded) playerFallStartEyeY = null;
        return;
    }
    const grounded = !!canJumpRef.val;
    if (!grounded && playerWasGrounded) {
        playerFallStartEyeY = camera.position.y;
    }
    if (!grounded && playerFallStartEyeY == null) {
        playerFallStartEyeY = camera.position.y;
    }
    if (grounded && !playerWasGrounded && playerFallStartEyeY != null) {
        const contact = getPlayerFireFluidContact();
        if (!contact.water && !contact.lava) {
            const dropBlocks = Math.max(0, playerFallStartEyeY - camera.position.y);
            const dmg = Math.floor(dropBlocks - PLAYER_FALL_DAMAGE_THRESHOLD_BLOCKS);
            if (dmg > 0) {
                damagePlayer(dmg, { source: 'fall' });
            }
        }
        playerFallStartEyeY = null;
    }
    playerWasGrounded = grounded;
}

function damagePlayer(amount = 1, ctx = null) {
    if (!GAME_ACTIVE || IS_PAUSED) return false;
    const dmg = Math.max(1, Math.floor(Number(amount) || 0));
    if (dmg <= 0) return false;
    if (playerInvulnTimer > 0) return false;
    playerHealth = Math.max(0, playerHealth - dmg);
    playerInvulnTimer = PLAYER_HIT_INVULN_SECONDS;
    if (ctx && ctx.attacker && velocity) {
        const ax = Number(ctx.attacker?.pos?.x);
        const az = Number(ctx.attacker?.pos?.z);
        if (Number.isFinite(ax) && Number.isFinite(az)) {
            const dx = camera.position.x - ax;
            const dz = camera.position.z - az;
            const len = Math.hypot(dx, dz) || 1;
            const nx = dx / len;
            const nz = dz / len;
            // Beta-like hurt knockback baseline.
            velocity.x += nx * 4.0;
            velocity.z += nz * 4.0;
            velocity.y = Math.max(velocity.y, 2.8);
            canJumpRef.val = false;
        }
    }
    if (ctx && mobManager && typeof mobManager.onPlayerDamaged === 'function') {
        mobManager.onPlayerDamaged(ctx);
    }
    if (playerHealth <= 0) {
        playerHealth = 0;
        playerInvulnTimer = 0;
        playerBurnTimer = 0;
        playerBurnDamageTimer = 0;
        playerWasInLava = false;
        playerFallStartEyeY = null;
        updatePlayerHealthHUD();
        queueDeathRespawn({ clearInventory: false, heal: true });
    }
    return true;
}

function healPlayerBy(amount = 0) {
    if (!GAME_ACTIVE) return 0;
    const val = Math.max(0, Math.floor(Number(amount) || 0));
    if (val <= 0) return 0;
    const before = playerHealth;
    playerHealth = Math.max(0, Math.min(PLAYER_MAX_HEALTH, before + val));
    return Math.max(0, playerHealth - before);
}

function getFoodConsumableDef(itemId) {
    if (!Number.isFinite(Number(itemId))) return null;
    const direct = SIMPLE_CONSUMABLE_ITEMS.get(Number(itemId));
    if (direct) return direct;
    return SIMPLE_CONSUMABLE_ITEMS.get(normalizeLegacyRuntimeItemId(itemId)) || null;
}

function consumeHeldFoodItem(slotIndex, foodDef) {
    if (!foodDef) return false;
    const held = inventory.slots[slotIndex];
    if (!held || held.kind !== ITEM_STACK_KIND_ITEM || held.count <= 0) return false;
    const containerItemId = Number(foodDef.containerItemId);
    if (Number.isFinite(containerItemId)) {
        held.count--;
        if (held.count <= 0) {
            inventory.slots[slotIndex] = new ItemStack(containerItemId, 1, null, 0, ITEM_STACK_KIND_ITEM);
        } else {
            const addedContainer = inventory.addItem(containerItemId, 1, null, 0, ITEM_STACK_KIND_ITEM);
            if (!addedContainer) {
                entityManager.spawnDrop(
                    camera.position.x,
                    camera.position.y,
                    camera.position.z,
                    containerItemId,
                    null,
                    0.2,
                    null,
                    { kind: ITEM_STACK_KIND_ITEM, metadata: 0 }
                );
            }
        }
    } else {
        inventory.consumeItem(slotIndex, 1);
    }
    healPlayerBy(foodDef.heal ?? 0);
    refreshHotbar();
    if (foodDef.message) addMessage(foodDef.message);
    scheduleSaveGame();
    return true;
}

function healPlayer() {
    if (!GAME_ACTIVE) return { ok: false, msg: 'Game is not active.' };
    playerHealth = PLAYER_MAX_HEALTH;
    pendingPlayerLoadHealth = PLAYER_MAX_HEALTH;
    playerInvulnTimer = 0;
    playerBurnTimer = 0;
    playerBurnDamageTimer = 0;
    playerWasInLava = false;
    return { ok: true, msg: 'Healed to full health.' };
}

bindUIWindowFunctions({
    onShowTitle: () => {
        GAME_ACTIVE = false;
        worldLoadingActive = false;
        setWorldLoadingUIVisible(false);
        camera.position.set(0, 40, 0);
        camera.rotation.set(-Math.PI/4, 0, 0);
        generateTitleWorld();
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById('title-screen').classList.remove('hidden');
        document.getElementById('ui').style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
        toggleChat(false); // Ensure chat is closed
    },
    getSaves: getSavesIndex,
    loadWorld: loadWorld,
    windowShowWorldList: () => {
         document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
         document.getElementById('world-select-screen').classList.remove('hidden');
         const list = document.getElementById('world-list-container');
         list.innerHTML = '';
         const saves = getSavesIndex();
         if (saves.length === 0) list.innerHTML = '<div style="text-align:center; color:#666;">No saved worlds.</div>';
         else {
             saves.forEach(save => {
                 const el = document.createElement('div');
                 el.className = 'world-item';
                 el.innerHTML = `<div class="world-info"><b>${save.name}</b><small>Seed: ${save.seed}</small></div><button class="danger" style="width:auto; padding:5px 10px; font-size:0.8rem;" onclick="window.deleteWorld('${save.id}', event)">Del</button>`;
                 el.onclick = (e) => { if(e.target.tagName !== 'BUTTON') loadWorld(save.id); };
                 el.oncontextmenu = async (e) => {
                     e.preventDefault();
                     e.stopPropagation();
                     await copySeedToClipboard(save.seed);
                 };
                 list.appendChild(el);
             });
         }
    },
    windowShowCreateScreen: () => {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById('create-screen').classList.remove('hidden');
    },
    windowCreateWorldAction: (name, seed) => {
        const nameVal = document.getElementById('new-world-name').value || "New World";
        const seedVal = document.getElementById('new-world-seed').value;
        const parsedSeed = seedVal.trim().length > 0 ? parseMinecraftSeed(seedVal) : BigInt(getRandomSeedString());
        const s = BigInt.asIntN(64, parsedSeed).toString();
        const id = 'w_' + Date.now();
        const newSave = { id, name: nameVal, seed: s, lastPlayed: Date.now() };
        const saves = getSavesIndex();
        saves.push(newSave);
        saveStore.setItem('mindblock_saves', JSON.stringify(saves));
        initTerrain(s);
        const initialData = {
            modified: [],
            links: [],
            mobsOverworld: { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] },
            mobsNether: { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] }
        };
        saveStore.setItem('mindblock_data_' + id, JSON.stringify(initialData));
        loadWorld(id);
    },
    windowDeleteWorld: (id) => {
        let saves = getSavesIndex();
        saves = saves.filter(s => s.id !== id);
        saveStore.setItem('mindblock_saves', JSON.stringify(saves));
        saveStore.removeItem('mindblock_data_' + id);
        window.showWorldList();
    },
    saveAndQuit: () => {
        saveGame();
        GAME_ACTIVE = false;
        IS_PAUSED = true;
        worldLoadingActive = false;
        setWorldLoadingUIVisible(false);
        if (controls) controls.unlock();
        document.getElementById('instructions').style.display = 'none';
        document.getElementById('ui').style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
        document.getElementById('debug').style.display = 'none';
        document.getElementById('pause-menu').classList.add('hidden');
        window.showTitleScreen();
    },
    resumeGame: () => {
        suppressPauseOnUnlockUntil = Date.now() + 500;
        pauseRequestedThisFrame = false;
        // Always hide pause menu immediately on user Resume click.
        // If pointer lock fails, we restore paused state below.
        setPausedState(false);
        if (controls) {
            pointerLockRequestInFlight = false;
            pointerLockRetryAfterMs = 0;
            if (controls.isLocked) return;
            requestPointerLockSafe(true);
            setTimeout(() => {
                if (!GAME_ACTIVE || worldLoadingActive || IS_INVENTORY_OPEN || IS_CHAT_OPEN) return;
                if (!controls.isLocked) setPausedState(true);
            }, 220);
            return;
        }
    },
    setRenderDistance: (d) => {
        const prevRenderDistance = RENDER_DISTANCE;
        RENDER_DISTANCE = d;
        const btn = document.getElementById('btn-render-distance');
        if (btn) {
            // Update button text based on render distance
            if (d === 2) btn.textContent = 'Tiny';
            else if (d === 4) btn.textContent = 'Low';
            else if (d === 8) btn.textContent = 'Med';
            else if (d === 16) btn.textContent = 'Far';
        }
        
        if (d < prevRenderDistance) {
            forceRenderDistanceTightCull = true;
        }
        
        requestedChunks.clear();
        geometryRefreshRequests.clear();
        clearPendingChunkTasks();
        chunkRetryCount.clear();
        markPlannerDirty();
        refreshChunkPlannerIfNeeded(true);
    },
    cycleRenderDistance: () => {
        // Cycle through: Tiny (2) -> Low (4) -> Med (8) -> Far (16) -> Tiny (2)
        const distances = [2, 4, 8, 16];
        const currentIndex = distances.indexOf(RENDER_DISTANCE);
        const nextIndex = (currentIndex + 1) % distances.length;
        window.setRenderDistance(distances[nextIndex]);
    },
    toggleVSync: () => {
        VSYNC_ENABLED = !VSYNC_ENABLED;
        const btn = document.getElementById('btn-vsync');
        if (btn) {
            btn.textContent = VSYNC_ENABLED ? 'VSync: On' : 'VSync: Off';
        }
    },
    setDayTime: () => {
        setWorldTimeTicks(WAKE_MORNING_TICKS);
    },
    setNightTime: () => {
        setWorldTimeTicks(NIGHT_TICKS);
    },
    setWorldTime: (ticks) => {
        setWorldTimeTicks(ticks);
    },
    getWorldTime: () => worldTimeTicks,
    clearDroppedEntities: () => {
        const removed = entityManager.clearDrops();
        return { ok: true, msg: `Cleared ${removed} dropped item${removed === 1 ? '' : 's'}.` };
    },
    clearInventory: () => {
        inventory.slots.fill(null);
        inventory.cursorItem = null;
        refreshHotbar();
        return { ok: true, msg: 'Cleared inventory.' };
    },
    toggleFly: (mode) => toggleFlyMode(mode),
    toggleOptimise: () => toggleOptimiseMode(),
    spawnMob: (type) => {
        if (!GAME_ACTIVE) {
            return { ok: false, msg: 'Game is not active.' };
        }
        try {
            const p = camera.position;
            const h = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
            const feetY = getPlayerColliderTopY(p.y) - h;
            return mobManager.spawnMobNear(type, p.x, p.z, feetY, true);
        } catch (err) {
            console.error('[spawnMob] failed', err);
            return { ok: false, msg: 'Spawn failed due to runtime error. Check console.' };
        }
    },
    teleportToSpawn: () => teleportToWorldSpawn(),
    killMobs: () => {
        if (!GAME_ACTIVE) {
            return { ok: false, msg: 'Game is not active.' };
        }
        const before = (
            mobManager.pigs.length +
            mobManager.chickens.length +
            mobManager.sheep.length +
            mobManager.cows.length +
            mobManager.creepers.length +
            mobManager.zombies.length +
            mobManager.spiders.length +
            mobManager.skeletons.length +
            mobManager.zombiePigmen.length +
            mobManager.slimes.length +
            mobManager.ghasts.length +
            mobManager.squids.length +
            mobManager.wolves.length
        );
        const projectileCount = (
            mobManager.skeletonArrows.length +
            mobManager.playerSnowballs.length +
            mobManager.playerEggs.length +
            mobManager.ghastFireballs.length
        );
        mobManager.clear();
        scheduleSaveGame();
        return {
            ok: true,
            msg: `Killed ${before} mob${before === 1 ? '' : 's'} and cleared ${projectileCount} mob projectile${projectileCount === 1 ? '' : 's'}.`
        };
    },
    killPlayer: () => killPlayerAndRespawn({ clearInventory: true, heal: true }),
    healPlayer: () => healPlayer(),
    teleportToFarlands: (direction) => teleportToFarlands(direction),
    teleportToTop: teleportToTop,
});

document.addEventListener('wheel', (e) => {
    if(IS_PAUSED || IS_INVENTORY_OPEN) return;
    let selectedSlotIndex = getSelectedSlot();
    if(e.deltaY > 0) selectedSlotIndex = (selectedSlotIndex + 1) % 10;
    else selectedSlotIndex = (selectedSlotIndex - 1 + 10) % 10;
    setSelectedSlot(selectedSlotIndex);
});

document.addEventListener('keydown', (e) => {
    if(!GAME_ACTIVE) return;
    
    // --- F3 Debug Toggle ---
    if (e.code === 'F3') {
        e.preventDefault(); 
        const debugEl = document.getElementById('debug');
        if (debugEl) {
            debugEl.style.display = (debugEl.style.display === 'none') ? 'block' : 'none';
        }
        return;
    }

    if (e.code === 'F5' && !IS_CHAT_OPEN) {
        e.preventDefault();
        thirdPersonController.cycleMode();
        return;
    }

    // --- Chat Toggle ---
    if (e.code === 'KeyT' && !IS_CHAT_OPEN && !IS_INVENTORY_OPEN && !IS_PAUSED) {
        IS_CHAT_OPEN = true;
        toggleChat(true);
        // Unlock pointer to allow using cursor for links
        if (controls) controls.unlock();
        e.preventDefault();
        return;
    }

    // --- Chat Logic when Open ---
    if (IS_CHAT_OPEN) {
        // Close Chat
        if (e.code === 'Escape') {
            IS_CHAT_OPEN = false;
            toggleChat(false);
            requestPointerLockSafe(true);
            return;
        }
        // Send Message
        if (e.code === 'Enter') {
            const input = document.getElementById('chat-input');
            const text = input.value.trim();
            if (text.length > 0) {
                if (text.startsWith('/')) handleCommand(text);
                else addMessage(text); // Regular chat
            }
            input.value = '';
            IS_CHAT_OPEN = false;
            toggleChat(false);
            requestPointerLockSafe(true);
            return;
        }
        // Scrolling
        if (e.code === 'PageUp') {
            scrollChat(-50);
            e.preventDefault();
        }
        if (e.code === 'PageDown') {
            scrollChat(50);
            e.preventDefault();
        }
        
        // Stop game movement from WASD etc
        e.stopPropagation();
        // NOTE: We do NOT e.preventDefault() here so typing and pasting works
        return; 
    }
    
    if (e.code === 'KeyE') {
        if (IS_INVENTORY_OPEN) {
            IS_INVENTORY_OPEN = false;
            toggleInventoryUI(false);
            requestPointerLockSafe(true);
        } else {
            IS_INVENTORY_OPEN = true;
            toggleInventoryUI(true, 'INVENTORY');
            controls.unlock();
        }
        return;
    }

    if (e.code === 'Escape') { 
        if (IS_INVENTORY_OPEN) {
            IS_INVENTORY_OPEN = false;
            toggleInventoryUI(false);
            requestPointerLockSafe(true);
            return;
        }
        if (GAME_ACTIVE && !worldLoadingActive && !IS_CHAT_OPEN) {
            if (isPauseMenuVisible()) {
                window.resumeGame();
            } else {
                pauseRequestedThisFrame = true;
                rightMouseHeld = false;
                cancelBowDraw();
                setPausedState(true);
                if (controls && controls.isLocked) {
                    try { controls.unlock(); } catch (_) {}
                }
            }
            return;
        }
    }
    
    if(IS_PAUSED || IS_INVENTORY_OPEN) return;
    
    switch(e.code) {
        case 'KeyW': moveState.fwd = true; break;
        case 'KeyS': moveState.bwd = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': {
            const now = Date.now();
            if (flyEnabled && !e.repeat) {
                if (now - lastFlyToggleTapMs <= FLY_DOUBLE_TAP_MS) {
                    setFlyingActive(!isFlying);
                }
                lastFlyToggleTapMs = now;
            }
            moveState.jump = true;
            break;
        }
        case 'ShiftLeft':
        case 'ShiftRight':
            if (isFlying) {
                moveState.descend = true;
                moveState.crouch = false;
            } else {
                moveState.crouch = true;
            }
            break; 
        case 'Digit1': setSelectedSlot(0); break;
        case 'Digit2': setSelectedSlot(1); break;
        case 'Digit3': setSelectedSlot(2); break;
        case 'Digit4': setSelectedSlot(3); break;
        case 'Digit5': setSelectedSlot(4); break;
        case 'Digit6': setSelectedSlot(5); break;
        case 'Digit7': setSelectedSlot(6); break;
        case 'Digit8': setSelectedSlot(7); break;
        case 'Digit9': setSelectedSlot(8); break;
        case 'Digit0': setSelectedSlot(9); break;
        case 'KeyQ': dropCurrentItem(); break; 
    }
});

document.addEventListener('keyup', (e) => {
    switch(e.code) {
        case 'KeyW': moveState.fwd = false; break;
        case 'KeyS': moveState.bwd = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyD': moveState.right = false; break;
        case 'Space': moveState.jump = false; break;
        case 'ShiftLeft':
        case 'ShiftRight':
            moveState.descend = false;
            moveState.crouch = false;
            break;
    }
});

document.addEventListener('mousedown', (e) => {
    if (!GAME_ACTIVE || IS_PAUSED || IS_INVENTORY_OPEN || IS_CHAT_OPEN) return;
    if (controls && !controls.isLocked) {
        requestPointerLockSafe(true);
    }
    
    if (e.button === 0) {
        if (isTargetingVehicleEntity()) {
            removeTargetVehicleEntity(true);
            isMouseDown = false;
            miningState.isMining = false;
            miningState.progress = 0;
            breakingMesh.visible = false;
            scheduleSaveGame();
            return;
        }
        const hit = mobManager.tryAttackNearestMob(camera, 4.5, getPlayerAttackDamage());
        if (hit && hit.ok) {
            if (hit.msg) addMessage(hit.msg);
            isMouseDown = false;
            miningState.isMining = false;
            miningState.progress = 0;
            breakingMesh.visible = false;
            return;
        }
        isMouseDown = true; 
        miningState.isMining = true;
    }
    
    if (e.button === 1) interactWithUrl();

    if (e.button === 2) {
        rightMouseHeld = true;
        if (isTargetingVehicleEntity()) {
            toggleMountTargetVehicle();
            return;
        }
        if (startBowDraw()) return;
        const { x, y, z } = targetBlock || {};
        if(x !== undefined) {
             const id = chunkManager.getBlock(x,y,z);
             if (
                isCraftingTableId(id) ||
                isFurnaceId(id) ||
                isChestId(id) ||
                isDoorId(id) ||
                isBedBlockId(id) ||
                isCakeBlockId(id) ||
                isNoteBlockId(id) ||
                isButtonId(id) ||
                isRepeaterId(id) ||
                isLeverId(id) ||
                isTrapdoorId(id)
             ) interact();
             else placeBlock();
        } else {
             placeBlock();
        }
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        isMouseDown = false; 
        miningState.isMining = false;
        breakingMesh.visible = false;
        miningState.progress = 0;
    }
    if (e.button === 2) {
        rightMouseHeld = false;
        releaseBowDraw();
    }
}, { capture: true });

document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
}, { capture: true });

// Add listeners for dropping items from UI
['inventory-screen', 'crafting-table-screen', 'furnace-screen', 'chest-screen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('mousedown', (e) => {
            // Only drop if clicking the background overlay, not the window itself
            if (e.target === el) {
                dropCursorItem();
            }
        });
    }
});

window.addEventListener('blur', () => {
    rightMouseHeld = false;
    cancelBowDraw();
});

setInterval(() => { if (GAME_ACTIVE && !IS_PAUSED) saveGame(); }, 5000);

let chunkTimer = 0;
let smoothedFps = 60;  // Used for dynamic chunk loading; smoothed over frames
let lastVoidRescueMs = 0;
let pendingSurfaceSpawn = null;
let lastChunkRecoveryKickMs = 0;
let worldLoadStartedMs = 0;
let lastChunkProgressMs = 0;
let lastChunkProgressCount = 0;
let hardBootstrapCount = 0;
let lastDirectBootstrapMs = 0;
let worldLoadingActive = false;
let worldLoadingTargetChunks = 64;
let worldLoadingPeakChunks = 0;
let worldLoadingLabel = 'Preparing spawn...';
let worldLoadingStartedAt = 0;
let pendingPlayerLoadHealth = PLAYER_MAX_HEALTH;
let suppressPauseOnUnlockUntil = 0;
let pauseRequestedThisFrame = false;
let pointerLockRequestInFlight = false;
let pointerLockRetryAfterMs = 0;
let hasPointerLockSinceWorldLoad = false;
const RENDER_CHUNK_RETENTION_MS = 1500;
const renderChunkLastNeededAt = new Map();

function setPausedState(paused) {
    IS_PAUSED = !!paused;
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
        if (IS_PAUSED) {
            pauseMenu.classList.remove('hidden');
            pauseMenu.style.display = 'flex';
        } else {
            pauseMenu.classList.add('hidden');
            pauseMenu.style.display = 'none';
        }
    }
}

function isPauseMenuVisible() {
    const pauseMenu = document.getElementById('pause-menu');
    if (!pauseMenu) return false;
    const style = window.getComputedStyle(pauseMenu);
    return !pauseMenu.classList.contains('hidden') && style.display !== 'none' && style.visibility !== 'hidden';
}

function requestPointerLockSafe(fromUserGesture = false) {
    if (!controls || controls.isLocked) return;
    const now = Date.now();
    if (pointerLockRequestInFlight) return;
    if (!fromUserGesture && now < pointerLockRetryAfterMs) return;
    if (!fromUserGesture) return;
    pointerLockRequestInFlight = true;
    try {
        if (controls && typeof controls.lock === 'function') {
            controls.lock();
            setTimeout(() => {
                pointerLockRequestInFlight = false;
                if (!controls.isLocked) pointerLockRetryAfterMs = Date.now() + 150;
            }, 0);
            return;
        }
        const p = document.body?.requestPointerLock?.();
        if (p && typeof p.catch === 'function') p.catch(() => { pointerLockRetryAfterMs = Date.now() + 150; });
        setTimeout(() => { pointerLockRequestInFlight = false; }, 0);
    } catch (_) {
        pointerLockRequestInFlight = false;
        pointerLockRetryAfterMs = Date.now() + 150;
    }
}

function isSolidForSpawn(id) {
    if (id === 0) return false;
    if (isFluidId(id)) return false;
    // Non-solid decorations / thin blocks
    if (id === 7 || isTorchId(id) || isButtonId(id) || isLeverId(id) || isPressurePlateId(id) || isRailId(id) || isRepeaterId(id) || isTrapdoorId(id) || isLadderId(id) || isSignId(id) || isDoorId(id) || isBedBlockId(id) || isCakeBlockId(id) || isFlowerId(id) || isMushroomId(id) || isTallGrassId(id) || isDeadBushId(id) || isCropId(id) || id === 103 || id === 63 || id === 78 || id === 90) return false;
    return true;
}

function setWorldLoadingUIVisible(visible) {
    const loadingScreen = document.getElementById('world-loading-screen');
    if (!loadingScreen) return;
    if (visible) loadingScreen.classList.remove('hidden');
    else loadingScreen.classList.add('hidden');
}

function beginWorldLoading(label = 'Preparing spawn...', targetOverride = null) {
    worldLoadingActive = true;
    worldLoadingLabel = label;
    worldLoadingStartedAt = Date.now();
    worldLoadingPeakChunks = 0;
    const loadRad = LOAD_RADIUS();
    const defaultTarget = Math.max(48, (loadRad * 2 + 1) * (loadRad * 2 + 1));
    worldLoadingTargetChunks = Number.isFinite(Number(targetOverride)) ? Math.max(1, Number(targetOverride)) : defaultTarget;
    setWorldLoadingUIVisible(true);
    const titleEl = document.getElementById('world-loading-title');
    const statusEl = document.getElementById('world-loading-status');
    const barEl = document.getElementById('world-loading-progress');
    const pctEl = document.getElementById('world-loading-percent');
    if (titleEl) titleEl.textContent = (String(label).toLowerCase().includes('you died')) ? 'You Died' : 'Loading World';
    if (statusEl) statusEl.textContent = worldLoadingLabel;
    if (barEl) barEl.style.width = '0%';
    if (pctEl) pctEl.textContent = '0%';
}

function beginResolvedSurfaceSpawnStabilization() {
    pendingSurfaceSpawn = {
        x: camera.position.x,
        z: camera.position.z,
        restoreSavedPosition: false,
        resolved: true,
        resolvedAt: Date.now(),
        startedAt: pendingSurfaceSpawn?.startedAt || Date.now(),
        columnRequested: true
    };
}

function beginResolvedSavedPositionStabilization(savedEyeY) {
    pendingSurfaceSpawn = {
        x: camera.position.x,
        z: camera.position.z,
        savedY: Number.isFinite(savedEyeY) ? savedEyeY : camera.position.y,
        savedFlying: !!isFlying,
        restoreSavedPosition: true,
        resolved: true,
        resolvedAt: Date.now(),
        startedAt: pendingSurfaceSpawn?.startedAt || Date.now(),
        columnRequested: true
    };
}

function isSavedFlyingRestoreActive() {
    return !!(pendingSurfaceSpawn && pendingSurfaceSpawn.restoreSavedPosition && pendingSurfaceSpawn.savedFlying);
}

function getSavedFlyingColumnChunkRange(eyeY) {
    const { min: worldMinChunkY } = getWorldChunkYBounds();
    const pcy = Math.floor(getPlayerColliderTopY(eyeY) / CHUNK_SIZE);
    return { minCy: worldMinChunkY, maxCy: pcy };
}

function requestSavedPositionLoadNeighborhood(x, eyeY, z) {
    if (!chunkWorker) return;
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    const { minCy, maxCy } = getSavedFlyingColumnChunkRange(eyeY);
    for (let cy = minCy; cy <= maxCy; cy++) {
        enqueueChunkLoad(pcx, cy, pcz, 5);
    }
    processChunkQueue();
}

function isSavedPositionNeighborhoodReady(x, eyeY, z) {
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    const { minCy, maxCy } = getSavedFlyingColumnChunkRange(eyeY);
    for (let cy = minCy; cy <= maxCy; cy++) {
        if (!chunkManager.hasChunk(pcx, cy, pcz)) return false;
    }
    return true;
}

function isSpawnStandingColumnReady(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const yTargets = getSpawnYTargetsForColumn(cx, cz);
    for (const cy of yTargets) {
        if (!chunkManager.hasChunk(cx, cy, cz)) return false;
    }
    return true;
}

function hasVisibleRenderChunkKey(key) {
    const rc = renderChunks.get(key);
    if (!rc || !Array.isArray(rc.meshes)) return false;
    return rc.meshes.some((mesh) => !!mesh && mesh.visible);
}

function getSavedRestorePreferredYTargets(yTargets, pcy) {
    const preferred = yTargets.filter((cy) => Math.abs(cy - pcy) <= 1);
    if (preferred.length > 0) return preferred;
    if (yTargets.length === 0) return [];
    const sorted = [...yTargets].sort((a, b) => Math.abs(a - pcy) - Math.abs(b - pcy));
    return [sorted[0]];
}

function isSavedPositionNeighborhoodRendered(x, eyeY, z) {
    return isSavedPositionNeighborhoodReady(x, eyeY, z);
}

function getSavedPositionNeighborhoodProgress(x, eyeY, z) {
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    let total = 0;
    let visible = 0;
    const { minCy, maxCy } = getSavedFlyingColumnChunkRange(eyeY);
    for (let cy = minCy; cy <= maxCy; cy++) {
        total++;
        if (chunkManager.hasChunk(pcx, cy, pcz)) visible++;
    }
    return { visible, total: Math.max(1, total) };
}

function updateWorldLoadingUI() {
    if (!worldLoadingActive) return;
    if (!pendingSurfaceSpawn) {
        finishWorldLoading();
        return;
    }
    const statusEl = document.getElementById('world-loading-status');
    const barEl = document.getElementById('world-loading-progress');
    const pctEl = document.getElementById('world-loading-percent');
    let displayChunks = renderChunks.size;
    let targetChunks = worldLoadingTargetChunks;
    if (pendingSurfaceSpawn?.restoreSavedPosition && Number.isFinite(Number(pendingSurfaceSpawn.savedY))) {
        const progressInfo = getSavedPositionNeighborhoodProgress(
            Number(pendingSurfaceSpawn.x),
            Number(pendingSurfaceSpawn.savedY),
            Number(pendingSurfaceSpawn.z)
        );
        displayChunks = progressInfo.visible;
        targetChunks = progressInfo.total;
        worldLoadingTargetChunks = targetChunks;
    } else {
        worldLoadingPeakChunks = Math.max(worldLoadingPeakChunks, renderChunks.size);
        displayChunks = worldLoadingPeakChunks;
    }
    const chunksProgress = Math.max(0, Math.min(1, displayChunks / Math.max(1, targetChunks)));
    const progress = pendingSurfaceSpawn ? chunksProgress : 1;
    const pct = Math.max(0, Math.min(100, Math.floor(progress * 100)));

    if (statusEl) {
        const shownChunks = Math.min(displayChunks, targetChunks);
        statusEl.textContent = pendingSurfaceSpawn
            ? `${worldLoadingLabel} (${shownChunks}/${targetChunks} chunks)`
            : 'Spawn ready';
    }
    if (barEl) {
        const width = `${pct}%`;
        barEl.style.width = width;
        barEl.style.minWidth = pct > 0 ? '2px' : '0px';
        barEl.style.transform = '';
    }
    if (pctEl) pctEl.textContent = `${pct}%`;

    // Hard no-stall fallback: if chunk target is met but spawn resolution is still pending,
    // force a safe spawn so loading never hangs on "49/49".
    if (pendingSurfaceSpawn && !pendingSurfaceSpawn.resolved) {
        const startedAt = pendingSurfaceSpawn.startedAt || worldLoadingStartedAt || Date.now();
        const elapsed = Date.now() - startedAt;
        if (renderChunks.size >= worldLoadingTargetChunks && elapsed > 2000) {
            if (pendingSurfaceSpawn.restoreSavedPosition) {
                const savedEyeY = Number(pendingSurfaceSpawn.savedY);
                if (Number.isFinite(savedEyeY)) {
                    camera.position.set(Number(pendingSurfaceSpawn.x), savedEyeY, Number(pendingSurfaceSpawn.z));
                    renderCameraPosition.copy(camera.position);
                    velocity.set(0, 0, 0);
                    beginResolvedSavedPositionStabilization(savedEyeY);
                }
            } else {
                teleportPlayerToEstimatedSurface(pendingSurfaceSpawn.x, pendingSurfaceSpawn.z, {
                    centerOnBlock: true,
                    searchNearbyXZRadius: 6,
                    surfaceOnlyPlacement: true
                });
                beginResolvedSurfaceSpawnStabilization();
            }
            return;
        }
        if (elapsed > 12000) {
            if (pendingSurfaceSpawn.restoreSavedPosition) {
                const savedEyeY = Number(pendingSurfaceSpawn.savedY);
                if (Number.isFinite(savedEyeY)) {
                    camera.position.set(Number(pendingSurfaceSpawn.x), savedEyeY, Number(pendingSurfaceSpawn.z));
                    renderCameraPosition.copy(camera.position);
                    velocity.set(0, 0, 0);
                    beginResolvedSavedPositionStabilization(savedEyeY);
                }
            } else {
                teleportPlayerToEstimatedSurface(pendingSurfaceSpawn.x, pendingSurfaceSpawn.z, {
                    centerOnBlock: true,
                    searchNearbyXZRadius: 6,
                    surfaceOnlyPlacement: true
                });
                beginResolvedSurfaceSpawnStabilization();
            }
            return;
        }
    }
}

function finishWorldLoading() {
    if (!worldLoadingActive) return;
    rebuildSignTextMeshesFromRegistry();
    worldLoadingActive = false;
    worldLoadingStartedAt = 0;
    playerHealth = Math.max(1, Math.min(PLAYER_MAX_HEALTH, Math.floor(Number(pendingPlayerLoadHealth) || PLAYER_MAX_HEALTH)));
    playerInvulnTimer = 0;
    playerBurnTimer = 0;
    playerBurnDamageTimer = 0;
    playerWasInLava = false;
    playerWasGrounded = false;
    playerFallStartEyeY = null;
    suppressPauseOnUnlockUntil = Date.now() + 750;
    setWorldLoadingUIVisible(false);
    if (GAME_ACTIVE) {
        const active = document.activeElement;
        if (active && typeof active.blur === 'function') active.blur();
        if (controls) {
            if (controls.isLocked) {
                setPausedState(false);
            } else {
                setPausedState(true);
                requestPointerLockSafe(false);
            }
        } else {
            setPausedState(false);
        }
    }
}

function scheduleSaveGame(delayMs = 200) {
    if (!CURRENT_WORLD_ID) return;
    if (deferredSaveTimeout !== null) {
        clearTimeout(deferredSaveTimeout);
    }
    deferredSaveTimeout = setTimeout(() => {
        deferredSaveTimeout = null;
        saveGame();
    }, Math.max(0, Number(delayMs) || 0));
}

function hasOpenHeadroomAt(x, y, z, blocksAbove = 6) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const startY = Math.floor(y + 0.1);
    const endY = Math.min(WORLD_HEIGHT - 1, startY + blocksAbove);
    for (let ty = startY; ty <= endY; ty++) {
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(ty / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        if (!chunkManager.hasChunk(cx, cy, cz)) return false;
        const id = chunkManager.getBlock(bx, ty, bz);
        if (isSolidForSpawn(id)) return false;
    }
    return true;
}

function tryResolvePendingSurfaceSpawn() {
    if (!pendingSurfaceSpawn) return;
    if (!pendingSurfaceSpawn.startedAt) pendingSurfaceSpawn.startedAt = Date.now();
    const restoringSavedPosition = !!pendingSurfaceSpawn.restoreSavedPosition;
    if (pendingSurfaceSpawn.resolved) {
        const px = camera.position.x;
        const pz = camera.position.z;
        let supportReady = true;
        let visibleReady = false;
        let nearVisibleReady = false;
        if (restoringSavedPosition) {
            requestSavedPositionLoadNeighborhood(px, camera.position.y, pz);
            const dataReady = isSavedPositionNeighborhoodReady(px, camera.position.y, pz);
            const renderReady = isSavedPositionNeighborhoodRendered(px, camera.position.y, pz);
            visibleReady = dataReady && renderReady;
            nearVisibleReady = renderReady;
        } else {
            const pcx = Math.floor(px / CHUNK_SIZE);
            const pcz = Math.floor(pz / CHUNK_SIZE);
            requestSpawnColumnLoad(pcx, pcz, px, pz);
            supportReady = hasSolidSupportAt(px, getPlayerColliderTopY(camera.position.y), pz);
            const planner = getChunkPlannerMetrics();
            nearVisibleReady = planner.nearVisibleLoadedChunks >= Math.min(9, Math.max(1, planner.nearVisibleTargetChunks));
            visibleReady = nearVisibleReady || planner.visibleLoadedChunks >= Math.min(9, Math.max(1, planner.visibleTargetChunks));
        }
        const resolvedAt = pendingSurfaceSpawn.resolvedAt || Date.now();
        const stabilizeElapsed = Date.now() - resolvedAt;
        if (supportReady && visibleReady) {
            pendingSurfaceSpawn = null;
            finishWorldLoading();
            return;
        }
        if (restoringSavedPosition) {
            if (stabilizeElapsed > 1500) {
                requestSavedPositionLoadNeighborhood(px, camera.position.y, pz);
                pendingSurfaceSpawn.resolvedAt = Date.now();
            }
            if (visibleReady && stabilizeElapsed > 3000) {
                pendingSurfaceSpawn = null;
                finishWorldLoading();
                return;
            }
            return;
        }
        if (!restoringSavedPosition && !supportReady && nearVisibleReady && stabilizeElapsed > 1500) {
            const recenterAttempts = Number(pendingSurfaceSpawn.recenterAttempts) || 0;
            if (recenterAttempts < 2) {
                teleportPlayerToEstimatedSurface(px, pz, {
                    centerOnBlock: true,
                    searchNearbyXZRadius: 6,
                    surfaceOnlyPlacement: true
                });
                pendingSurfaceSpawn.recenterAttempts = recenterAttempts + 1;
                pendingSurfaceSpawn.resolvedAt = Date.now();
                return;
            }
        }
        if (visibleReady && stabilizeElapsed > 3000) {
            pendingSurfaceSpawn = null;
            finishWorldLoading();
            return;
        }
        if (stabilizeElapsed > 6000) {
            pendingSurfaceSpawn = null;
            finishWorldLoading();
            return;
        }
        if (stabilizeElapsed > 1500) {
            if (restoringSavedPosition) {
                requestSavedPositionLoadNeighborhood(px, camera.position.y, pz);
                pendingSurfaceSpawn.resolvedAt = Date.now();
            } else {
                teleportPlayerToEstimatedSurface(px, pz, {
                    centerOnBlock: true,
                    searchNearbyXZRadius: 6,
                    surfaceOnlyPlacement: true
                });
                pendingSurfaceSpawn.resolvedAt = Date.now();
            }
        }
        return;
    }
    const rawX = Number(pendingSurfaceSpawn.x);
    const rawZ = Number(pendingSurfaceSpawn.z);
    const centerX = Math.floor(rawX);
    const centerZ = Math.floor(rawZ);
    const height = PLAYER_HEIGHT;
    const x = rawX;
    const z = rawZ;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    if (restoringSavedPosition && Number.isFinite(Number(pendingSurfaceSpawn.savedY))) {
        const savedEyeY = Number(pendingSurfaceSpawn.savedY);
        requestSavedPositionLoadNeighborhood(x, savedEyeY, z);
        if (!isSavedPositionNeighborhoodRendered(x, savedEyeY, z)) {
            if (Date.now() - pendingSurfaceSpawn.startedAt > 10000) {
                camera.position.set(x, savedEyeY, z);
                renderCameraPosition.copy(camera.position);
                velocity.set(0, 0, 0);
                setFlyingActive(!!pendingSurfaceSpawn.savedFlying);
                beginResolvedSavedPositionStabilization(savedEyeY);
            }
            return;
        }
        const savedTopY = savedEyeY + (PLAYER_HEIGHT - PLAYER_EYE_HEIGHT);
        const canRestoreMidAir = !!pendingSurfaceSpawn.savedFlying;
        if (canRestoreMidAir || !checkCollision(x, savedTopY, z, chunkManager, PLAYER_HEIGHT)) {
            camera.position.set(x, savedEyeY, z);
            renderCameraPosition.copy(camera.position);
            velocity.set(0, 0, 0);
            setFlyingActive(!!pendingSurfaceSpawn.savedFlying);
            beginResolvedSavedPositionStabilization(savedEyeY);
            return;
        }
        setFlyingActive(false);
        teleportPlayerToEstimatedSurface(centerX, centerZ);
        pendingSurfaceSpawn = null;
        finishWorldLoading();
        return;
    }
    if (!pendingSurfaceSpawn.columnRequested) {
        requestSpawnColumnLoad(cx, cz, x, z);
        pendingSurfaceSpawn.columnRequested = true;
        return;
    }
    if (isSpawnStandingColumnReady(x, z)) {
        teleportPlayerToEstimatedSurface(centerX, centerZ, {
            centerOnBlock: true,
            searchNearbyXZRadius: 6,
            surfaceOnlyPlacement: true
        });
        pendingSurfaceSpawn = null;
        finishWorldLoading();
        return;
    }
    if (!isSpawnColumnReady(x, z)) {
        requestSpawnColumnLoad(cx, cz, x, z);
        if (Date.now() - pendingSurfaceSpawn.startedAt > 10000) {
            if (pendingSurfaceSpawn.restoreSavedPosition && Number.isFinite(Number(pendingSurfaceSpawn.savedY))) {
                const savedEyeY = Number(pendingSurfaceSpawn.savedY);
                camera.position.set(x, savedEyeY, z);
                renderCameraPosition.copy(camera.position);
                velocity.set(0, 0, 0);
                beginResolvedSavedPositionStabilization(savedEyeY);
            } else {
                teleportPlayerToEstimatedSurface(centerX, centerZ, {
                    centerOnBlock: true,
                    searchNearbyXZRadius: 6,
                    surfaceOnlyPlacement: true
                });
                beginResolvedSurfaceSpawnStabilization();
            }
            if (pendingSurfaceSpawn?.restoreSavedPosition && !pendingSurfaceSpawn.resolved) {
                pendingSurfaceSpawn = null;
                finishWorldLoading();
            }
        }
        return;
    }

    // New worlds: once the spawn column is ready, use the shared safe surface
    // resolver instead of the raw loaded-top shortcut. That avoids settling on
    // cave roofs if the loaded column is incomplete.
    teleportPlayerToEstimatedSurface(x, z, {
        preferUpOnly: false,
        centerOnBlock: true,
        searchNearbyXZRadius: 6,
        surfaceOnlyPlacement: true
    });
    beginResolvedSurfaceSpawnStabilization();
}

function hasSolidSupportAt(x, y, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const footBlockY = Math.floor(y - PLAYER_HEIGHT - 0.1);
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cy = Math.floor(footBlockY / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    if (!chunkManager.hasChunk(cx, cy, cz)) return false;
    const supportId = chunkManager.getBlock(bx, footBlockY, bz);
    return isSolidForSpawn(supportId);
}

function kickstartChunkLoadingNearPlayer() {
    if (!GAME_ACTIVE || !chunkWorker) return;
    const MIN_RECOVERED_CHUNKS = Math.max(64, (LOAD_RADIUS() + 1) * (LOAD_RADIUS() + 1) * 4);
    const needsRecovery =
        renderChunks.size === 0 ||
        (renderChunks.size < MIN_RECOVERED_CHUNKS &&
         requestedChunks.size === 0 &&
         pendingLoadQueue.length < 8 &&
         chunkStreamStats.workerLoadQueue === 0);
    if (!needsRecovery) return;
    const now = Date.now();
    if (now - lastChunkRecoveryKickMs < 250) return;
    lastChunkRecoveryKickMs = now;
    if (pendingLoadQueue.length > 384) return;
    identifyNeededChunks();
    processChunkQueue();
}

function requeueVisibleWatchdogChunks(maxTasks = 32, maxRing = 2) {
    if (!GAME_ACTIVE || !chunkWorker) return 0;
    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
    const { min: worldMinChunkY, max: worldMaxChunkY } = getWorldChunkYBounds();
    const focusY = getChunkLoadFocusY(camera.position.x, camera.position.y, camera.position.z);
    const pcy = Math.floor(focusY / CHUNK_SIZE);
    const loadMode = getChunkLoadMode(camera.position.x, camera.position.y, camera.position.z);
    const loadRad = Math.min(LOAD_RADIUS(), Math.max(0, maxRing));
    const STALE_REQUEST_MS = 1500;
    const now = Date.now();
    let queued = 0;

    for (let ring = 0; ring <= loadRad; ring++) {
        for (let x = pcx - ring; x <= pcx + ring; x++) {
            for (let z = pcz - ring; z <= pcz + ring; z++) {
                const dx = x - pcx;
                const dz = z - pcz;
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                if (!canChunkExistJacobo(x, z, pcx, pcz)) continue;

                const yTargets = (loadMode === CHUNK_LOAD_MODE_LOCAL_3D)
                    ? getLocal3DChunkYTargets(x, z, pcx, pcy, pcz, worldMinChunkY, worldMaxChunkY, true)
                    : getLoadYTargetsForColumn(x, z, pcy, worldMinChunkY, worldMaxChunkY, true);

                for (const y of yTargets) {
                    const key = `${x},${y},${z}`;
                    const localChunk = chunkManager.getChunk(x, y, z);
                    if (localChunk && localChunk.isGenerated) continue;

                    const requestedAt = requestedChunks.get(key);
                    if (requestedAt !== undefined) {
                        if (now - requestedAt <= STALE_REQUEST_MS) continue;
                        requestedChunks.delete(key);
                    }
                    if (pendingLoadQueueKeys.has(key)) continue;

                    const task = {
                        x,
                        y,
                        z,
                        dist2D: 0,
                        dyAbs: 0,
                        urgency: ring <= 1 ? 2 : 1
                    };
                    updateChunkTaskPriority(task, pcx, pcy, pcz);
                    enqueuePendingChunkTask(task);
                    queued++;
                    if (queued >= maxTasks) return queued;
                }
            }
        }
    }

    return queued;
}

function runChunkLoadWatchdog() {
    if (!GAME_ACTIVE || !chunkWorker) return;
    if (worldLoadStartedMs <= 0) return;
    const now = Date.now();
    // Only apply during early world-load window.
    if (now - worldLoadStartedMs > 30000) return;

    const loaded = renderChunks.size;
    if (loaded > lastChunkProgressCount) {
        lastChunkProgressCount = loaded;
        lastChunkProgressMs = now;
        return;
    }

    // If startup stalls at very low loaded chunk counts, requeue only the nearest
    // visible missing chunks. Do not wipe the whole queue/request state.
    if (loaded <= 8 && now - lastChunkProgressMs > 2500) {
        const requeued = requeueVisibleWatchdogChunks(48, 3);
        if (requeued === 0) {
            identifyNeededChunks();
        }
        processChunkQueue();
        lastChunkProgressMs = now;
    }
}

function hardBootstrapDirectLoadNearPlayer() {
    // Deprecated by the single-planner frontier scheduler.
    // Keep the function as a compatibility shim for existing call sites.
    identifyNeededChunks();
    processChunkQueue();
}

function runContinuousDirectBootstrap() {
    // Deprecated by the single-planner frontier scheduler.
    // Keep the function as a compatibility shim for existing call sites.
    return;
}

// Helper to detect if player is colliding with ANY portal block
function isPlayerInPortal() {
    const r = PLAYER_RADIUS;
    const h = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
    const px = camera.position.x;
    const py = getPlayerColliderTopY(camera.position.y);
    const pz = camera.position.z;

    // Check bounds of player (feet to head, width radius)
    // We check integer blocks overlapping the player's AABB
    const minX = Math.floor(px - r);
    const maxX = Math.floor(px + r);
    const minY = Math.floor(py - h);
    const maxY = Math.floor(py);
    const minZ = Math.floor(pz - r);
    const maxZ = Math.floor(pz + r);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (chunkManager.getBlock(x, y, z) === 90) return true;
            }
        }
    }
    return false;
}

const TARGET_FPS = 0;  // 0 = uncapped (run as fast as possible); set to 60, 120, etc. to cap

function animate() {
    if (rendererInitFailed || !renderer) return;
    const frameStartMs = performance.now();
    // Schedule next frame based on vsync setting
    if (VSYNC_ENABLED) {
        // Use requestAnimationFrame for vsync (respects display refresh rate)
        requestAnimationFrame(animate);
    } else {
        // Use setTimeout for no vsync (runs as fast as possible)
        if (TARGET_FPS > 0) {
            setTimeout(animate, 1000 / TARGET_FPS);
        } else {
            setTimeout(animate, 0);
        }
    }

    let dt = clock.getDelta();
    if (dt > 0.25) dt = 0.25;
    let loadingProfileMs = 0;
    let tickProfileMs = 0;
    let plannerProfileMs = 0;
    let debugProfileMs = 0;
    let occlusionProfileMs = 0;
    let thirdPersonProfileMs = 0;
    let renderProfileMs = 0;

    if (GAME_ACTIVE) {
        const loadingStartMs = performance.now();
        // Recover from stale hidden-paused state: gameplay should not remain paused
        // when no modal UI is open and world loading is complete.
        if (IS_PAUSED && !worldLoadingActive && !IS_INVENTORY_OPEN && !IS_CHAT_OPEN) {
            const pauseMenu = document.getElementById('pause-menu');
            if (!pauseMenu || pauseMenu.classList.contains('hidden')) {
                setPausedState(false);
            }
        }
        if (worldLoadingActive && worldLoadingStartedAt > 0) {
            const hardElapsed = Date.now() - worldLoadingStartedAt;
            if (hardElapsed > 15000) {
                if (pendingSurfaceSpawn && !pendingSurfaceSpawn.resolved) {
                    if (pendingSurfaceSpawn.restoreSavedPosition) {
                        const savedEyeY = Number(pendingSurfaceSpawn.savedY);
                        if (Number.isFinite(savedEyeY)) {
                            camera.position.set(Number(pendingSurfaceSpawn.x), savedEyeY, Number(pendingSurfaceSpawn.z));
                            renderCameraPosition.copy(camera.position);
                            velocity.set(0, 0, 0);
                            beginResolvedSavedPositionStabilization(savedEyeY);
                        }
                    } else {
                        teleportPlayerToEstimatedSurface(pendingSurfaceSpawn.x, pendingSurfaceSpawn.z, {
                            centerOnBlock: true,
                            searchNearbyXZRadius: 6,
                            surfaceOnlyPlacement: true
                        });
                        beginResolvedSurfaceSpawnStabilization();
                    }
                }
                if (!pendingSurfaceSpawn) {
                    finishWorldLoading();
                } else if (pendingSurfaceSpawn.restoreSavedPosition && Number.isFinite(Number(pendingSurfaceSpawn.savedY))) {
                    const savedEyeY = Number(pendingSurfaceSpawn.savedY);
                    requestSavedPositionLoadNeighborhood(camera.position.x, savedEyeY, camera.position.z);
                    if (isSavedPositionNeighborhoodRendered(camera.position.x, savedEyeY, camera.position.z)) {
                        pendingSurfaceSpawn = null;
                        finishWorldLoading();
                    } else {
                        worldLoadingStartedAt = Date.now();
                    }
                }
            }
        }
        tryResolvePendingSurfaceSpawn();
        updateWorldLoadingUI();
        kickstartChunkLoadingNearPlayer();
        runChunkLoadWatchdog();
        runContinuousDirectBootstrap();
        loadingProfileMs += performance.now() - loadingStartMs;
        accumulator += dt;
        if (bowDrawActive && (IS_PAUSED || IS_INVENTORY_OPEN || IS_CHAT_OPEN || !GAME_ACTIVE || !isBowSelected())) {
            cancelBowDraw();
        }

        if (!IS_PAUSED && !IS_CHAT_OPEN) {
            const tickStartMs = performance.now();
            let physicsUpdated = false;
            let fixedStepsThisFrame = 0;
            while (accumulator >= FIXED_STEP) {
                fixedStepsThisFrame++;
                if (fixedStepsThisFrame > MAX_FIXED_STEPS_PER_FRAME) {
                    // Guard against long browser/input stalls causing visible frame freeze.
                    accumulator = 0;
                    break;
                }
                if (bowDrawActive) {
                    if (!GAME_ACTIVE || IS_PAUSED || IS_INVENTORY_OPEN || IS_CHAT_OPEN || !isBowSelected()) {
                        cancelBowDraw();
                    } else {
                        bowDrawTicks = Math.min(BOW_MAX_DRAW_TICKS, bowDrawTicks + FIXED_STEP * GAME_TICKS_PER_SECOND);
                    }
                }
                if (throwableUseCooldownTicks > 0) {
                    throwableUseCooldownTicks = Math.max(0, throwableUseCooldownTicks - (FIXED_STEP * GAME_TICKS_PER_SECOND));
                }
                // Beta time progression: 20 world ticks per real second.
                // Carry fractional ticks so time advances correctly at fixed-step rates.
                worldTimeCarry += FIXED_STEP * 20;
                if (worldTimeCarry >= 1) {
                    const add = Math.floor(worldTimeCarry);
                    worldTimeCarry -= add;
                    setWorldTimeTicks(worldTimeTicks + add);
                }
                const mountedTransport = entityManager.getMountedTransport();
                if (mountedTransport) {
                    entityManager.updateMountedTransport(FIXED_STEP, moveState, camera, chunkManager);
                    velocity.set(0, 0, 0);
                    canJumpRef.val = false;
                    if (moveState.crouch || moveState.descend) {
                        entityManager.unmountTransport();
                    }
                } else if (isFlying) {
                    updateFlying(FIXED_STEP);
                } else {
                    updatePhysics(FIXED_STEP, camera, velocity, moveState, canJumpRef, chunkManager);
                }
                updatePressurePlatesForPlayer();
                tickRails(FIXED_STEP);
                tickRedstoneWires(FIXED_STEP);
                tickRedstoneTorches(FIXED_STEP);
                tickRedstoneWires(FIXED_STEP);
                tickRepeaters(FIXED_STEP);
                tickPistons(FIXED_STEP);
                tickRedstoneActuators(FIXED_STEP);
                tickPlayerBurn(FIXED_STEP);
                tickPlayerFallDamage();
                playerInvulnTimer = Math.max(0, playerInvulnTimer - FIXED_STEP);
                if (camera.position.y < WORLD_DEPTH - 16 || !Number.isFinite(camera.position.y)) {
                    const now = Date.now();
                    if (now - lastVoidRescueMs > 750) {
                        lastVoidRescueMs = now;
                        teleportPlayerToTopOfWorld(camera.position.x, camera.position.z);
                    }
                }
                entityManager.update(FIXED_STEP, camera.position, chunkManager);
                if (fishingBobberDrop && !entityManager.drops.includes(fishingBobberDrop)) {
                    fishingBobberDrop = null;
                }
                if (fishingBobberDrop) {
                    const held = inventory.slots[getSelectedSlot()];
                    const heldKind = held ? getItemStackKind(held.id, held.kind) : null;
                    const heldActionId = held ? getActionItemId(held) : 0;
                    const dxFish = fishingBobberDrop.position.x - camera.position.x;
                    const dyFish = fishingBobberDrop.position.y - camera.position.y;
                    const dzFish = fishingBobberDrop.position.z - camera.position.z;
                    const distSqFish = dxFish * dxFish + dyFish * dyFish + dzFish * dzFish;
                    const lostRod = !(held && heldKind === ITEM_STACK_KIND_ITEM && heldActionId === FISHING_ROD_ITEM_ID);
                    if (lostRod || distSqFish > (32 * 32)) {
                        clearFishingBobber();
                    }
                }
                tickFishingBobberState(FIXED_STEP);
                if (tntManager) tntManager.update(FIXED_STEP);
                mobManager.update(FIXED_STEP, camera.position);
                updateMining(FIXED_STEP); 
                
                // Clear fluid updates from previous tick
                fluidUpdatesThisTick.length = 0;
                fluidManager.update(FIXED_STEP, camera.position, chunkManager);
                
                // Send all fluid updates as a batch to ensure they're processed together
                // This prevents visual lag by ensuring all water updates are applied before meshing
                if (fluidUpdatesThisTick.length > 0) {
                    chunkWorker.postMessage({ 
                        type: 'setBlockBatch', 
                        data: { 
                            updates: fluidUpdatesThisTick.map(u => ({ 
                                x: u.x, y: u.y, z: u.z, 
                                id: u.id, 
                                metadata: u.meta 
                            }))
                        } 
                    });
                }

                fallingBlockManager.update(FIXED_STEP, camera.position);
                
                fireManager.update(FIXED_STEP, camera.position);
                plantGrowthCarry += FIXED_STEP;
                while (plantGrowthCarry >= PLANT_GROWTH_INTERVAL_SECONDS) {
                    plantGrowthCarry -= PLANT_GROWTH_INTERVAL_SECONDS;
                    processPlantGrowthTick();
                }
                accumulator -= FIXED_STEP;
                physicsUpdated = true;
            }
            
            // Reset render position to physics position after each physics update
            if (physicsUpdated) {
                renderCameraPosition.copy(camera.position);
            } else {
                // Update render position smoothly every frame using velocity
                // This eliminates jitter by updating the visual position smoothly between physics updates
                renderCameraPosition.add(velocity.clone().multiplyScalar(dt));
            }
            
            // updateRaycast and updateHover use actual camera position for accurate physics/selection
            updateRaycast();
            updateHover();
            pruneSignTextMeshes(dt);
            
            // Add fire animation update here
            updateFireAnimation(dt);
            updatePortalAnimation(dt);

            // --- IMPROVED PORTAL TELEPORT LOGIC ---
            if (isPlayerInPortal()) {
                portalTimer += dt;
                if (portalTimer > 5.0) {
                    switchDimension();
                }
            } else {
                portalTimer = 0;
            }
            tickProfileMs += performance.now() - tickStartMs;

        } else {
            accumulator = 0;
        }
        
        if (!IS_PAUSED) {
            updateFurnaces();
        }

        if (IS_INVENTORY_OPEN) {
             selectionWireframe.visible = false;
        }
        const plannerStartMs = performance.now();
        chunkTimer += dt;
        if (chunkTimer > 0.05) {
            refreshChunkPlannerIfNeeded(false);
            chunkTimer = 0;
        }

        const instantFps = 1 / (dt || 0.016);
        smoothedFps = smoothedFps * 0.85 + instantFps * 0.15;

        if (chunkWorker) {
            const pos = camera.position;
            let workerLoadFocusY = pos.y;
            if (CURRENT_DIMENSION === 'OVERWORLD') {
                const surfaceY = getSurfaceSpawnY(pos.x, pos.z);
                workerLoadFocusY = Math.min(pos.y, surfaceY + 8);
            }
            if (!Number.isFinite(workerLoadFocusY)) {
                workerLoadFocusY = getSurfaceSpawnY(pos.x, pos.z);
            }
            workerLoadFocusY = Math.max(WORLD_DEPTH + 2, Math.min(WORLD_HEIGHT - 2, workerLoadFocusY));
            camera.getWorldDirection(tempViewDirA);
            chunkWorker.postMessage({
                type: 'playerPosition',
                data: {
                    x: pos.x,
                    y: workerLoadFocusY,
                    z: pos.z,
                    dirX: tempViewDirA.x,
                    dirZ: tempViewDirA.z,
                    loadRadius: LOAD_RADIUS()
                }
            });
        }
        processChunkQueue();
        sampleChunkStreamStats();
        plannerProfileMs += performance.now() - plannerStartMs;
        
        const debugEl = document.getElementById('debug');
        // UPDATED: Show expanded debug info only if visible
        if (debugEl && debugEl.style.display !== 'none') {
            const debugStartMs = performance.now();
            const p = camera.position;
            const fps = Math.round(1 / (dt || 0.016)); // Avoid infinity
            const cx = Math.floor(p.x / CHUNK_SIZE);
            const cy = Math.floor(p.y / CHUNK_SIZE);
            const cz = Math.floor(p.z / CHUNK_SIZE);
            const bx = Math.floor(p.x);
            const by = Math.floor(p.y);
            const bz = Math.floor(p.z);
            
            // Biome Info
            const terrain = getTerrainData(p.x, p.z);
            const biome = terrain.isDesert ? "Desert" : "Plains";
            
            // Light Level at feet
            const light = chunkManager.getLight(bx, by, bz);
            const playerTopY = getPlayerColliderTopY(p.y);
            const surfaceY = getNearbySurfaceReferenceY(p.x, p.z, { allowParity: false, sampleRadius: 2 });
            const belowSurface = surfaceY - playerTopY;
            const rawLoadMode = detectChunkLoadMode(p.x, p.y, p.z);
            const activeLoadMode = getChunkLoadMode(p.x, p.y, p.z);
            const loadModeHoldMs = Math.max(0, chunkLoadModeHoldUntil - Date.now());
            const planner = getChunkPlannerMetrics();
            
            // Direction
            camera.getWorldDirection(tempViewDirB);
            let facing = "";
            if (Math.abs(tempViewDirB.x) > Math.abs(tempViewDirB.z)) {
                facing = (tempViewDirB.x > 0) ? "East" : "West";
            } else {
                facing = (tempViewDirB.z > 0) ? "South" : "North";
            }
            
            debugEl.innerText = `FPS: ${fps}
XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}
Block: ${bx} ${by} ${bz}
Chunk: ${cx} ${cy} ${cz}
Facing: ${facing}
Biome: ${biome}
Dim: ${CURRENT_DIMENSION}
Time: ${worldTimeTicks}
Light: ${light}
Resident Chunks: ${renderChunks.size}
Visible Chunks: ${planner.visibleLoadedChunks}
Visible Target: ${planner.visibleTargetChunks}
Near Visible: ${planner.nearVisibleLoadedChunks}/${planner.nearVisibleTargetChunks}
Cache Target: ${planner.cacheTargetChunks}
Entities: ${entityManager.drops.length}
Pigs: ${mobManager.pigs.length}
Chickens: ${mobManager.chickens.length}
Sheep: ${mobManager.sheep.length}
Cows: ${mobManager.cows.length}
Creepers: ${mobManager.creepers.length}
Zombies: ${mobManager.zombies.filter((m) => m?.mobType !== 'giant').length}
Giants: ${mobManager.zombies.filter((m) => m?.mobType === 'giant').length}
Spiders: ${mobManager.spiders.length}
Skeletons: ${mobManager.skeletons.length}
Zombie Pigmen: ${mobManager.zombiePigmen.length}
Slimes: ${mobManager.slimes.length}
Ghasts: ${mobManager.ghasts.length}
Health: ${playerHealth}
Queue: ${pendingLoadQueue.length}
InFlight: ${requestedChunks.size}
GeomReq: ${geometryRefreshRequests.size}
Dispatch/s: ${chunkStreamStats.dispatchRate.toFixed(1)}
Complete/s: ${chunkStreamStats.completeRate.toFixed(1)}
Retries: ${chunkStreamStats.retriedTotal}
Cancels: ${chunkStreamStats.canceledTotal}
Errs: ${chunkStreamStats.errorTotal}
AvgWaitMs: ${chunkStreamStats.avgWaitMs.toFixed(1)}
W.LoadQ: ${chunkStreamStats.workerLoadQueue}
W.SetQ: ${chunkStreamStats.workerSetBlockQueue}
DirtyMeshQ: ${chunkStreamStats.dirtyMeshBacklog}
W.OldestLoadMs: ${chunkStreamStats.workerOldestLoadMs}
LoadMode Raw: ${rawLoadMode}
LoadMode Active: ${activeLoadMode}
LoadMode HoldMs: ${Math.round(loadModeHoldMs)}
BelowSurface: ${belowSurface.toFixed(2)}
CamMode: ${thirdPersonController.getModeName()}
${buildFrameProfilerText()}
`;
            debugProfileMs += performance.now() - debugStartMs;
        }
    } else {
        const t = Date.now() * 0.0002;
        camera.position.x = Math.sin(t) * 40;
        camera.position.z = Math.cos(t) * 40;
        camera.lookAt(0, 0, 0);
    }

    if (GAME_ACTIVE && renderChunks.size > 0) {
        const occlusionStartMs = performance.now();
        updateChunkOcclusion();
        occlusionProfileMs += performance.now() - occlusionStartMs;
    }

    updatePlayerBurnVisuals(dt);
    updatePlayerHealthHUD();
    updateBowChargeUI();

    if (GAME_ACTIVE) {
        const thirdPersonStartMs = performance.now();
        const activeHeight = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
        const activeEyeHeight = moveState.crouch ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT;
        thirdPersonController.updatePose(
            dt,
            renderCameraPosition,
            camera.rotation,
            velocity,
            moveState.crouch,
            activeHeight,
            activeEyeHeight,
            bowDrawActive ? Math.max(0, Math.min(1, bowDrawTicks / BOW_MAX_DRAW_TICKS)) : 0
        );
        thirdPersonProfileMs += performance.now() - thirdPersonStartMs;
    } else {
        thirdPersonController.setActive(false);
        thirdPersonController.setBurning(false);
        playerBurnTimer = 0;
    }

    if (GAME_ACTIVE && (rightMouseHeld || bowDrawActive) && !IS_PAUSED && !IS_INVENTORY_OPEN && !IS_CHAT_OPEN) {
        if (controls && !controls.isLocked) {
            requestPointerLockSafe(false);
        }
    }

    // Use interpolated camera position for smooth rendering
    const renderStartMs = performance.now();
    if (GAME_ACTIVE && !IS_PAUSED && !IS_CHAT_OPEN) {
        const actualCameraPos = camera.position.clone();
        const actualCameraRot = camera.rotation.clone();
        thirdPersonController.applyRenderCamera(camera, renderCameraPosition);
        renderer.render(scene, camera);
        // Restore actual camera position after rendering (needed for physics calculations)
        camera.position.copy(actualCameraPos);
        camera.rotation.copy(actualCameraRot);
    } else {
        renderer.render(scene, camera);
    }
    renderCompositionStats.drawCalls = renderer.info?.render?.calls || 0;
    renderCompositionStats.triangles = renderer.info?.render?.triangles || 0;
    renderCompositionStats.points = renderer.info?.render?.points || 0;
    renderCompositionStats.lines = renderer.info?.render?.lines || 0;
    renderProfileMs += performance.now() - renderStartMs;

    const frameEndMs = performance.now();
    const rawFrameMs = Math.max(0, frameEndMs - frameStartMs);
    frameProfiler.frameMs = frameProfiler.frameMs * (1 - FRAME_PROFILER_SMOOTHING) + rawFrameMs * FRAME_PROFILER_SMOOTHING;
    profileSection('loading', 0, loadingProfileMs);
    profileSection('tick', 0, tickProfileMs);
    profileSection('planner', 0, plannerProfileMs);
    profileSection('debug', 0, debugProfileMs);
    profileSection('occlusion', 0, occlusionProfileMs);
    profileSection('thirdPerson', 0, thirdPersonProfileMs);
    profileSection('render', 0, renderProfileMs);
}

// --- Automated Chunk Soak Harness ---
const chunkSoakState = {
    running: false,
    timerId: null,
    samples: [],
    stalls: [],
    startedAt: 0,
    config: null,
    stepIndex: 0
};

function getChunkDebugSnapshot() {
    const p = camera.position;
    const surfaceLoadedChunks = getLoadedSurfaceChunkCount();
    const planner = getChunkPlannerMetrics();
    const renderComp = getRenderCompositionSnapshot();
    return {
        t: Date.now(),
        x: p.x,
        y: p.y,
        z: p.z,
        cx: Math.floor(p.x / CHUNK_SIZE),
        cy: Math.floor(p.y / CHUNK_SIZE),
        cz: Math.floor(p.z / CHUNK_SIZE),
        loadedChunks: renderChunks.size,
        surfaceLoadedChunks,
        surfaceCompletedTotal: generatedSurfaceChunkKeys.size,
        loadMode: planner.loadMode,
        visibleTargetChunks: planner.visibleTargetChunks,
        cacheTargetChunks: planner.cacheTargetChunks,
        nearVisibleTargetChunks: planner.nearVisibleTargetChunks,
        visibleColumns: planner.visibleColumns,
        avgVisibleYSlicesPerColumn: planner.avgVisibleYSlicesPerColumn,
        visibleMissingChunks: planner.visibleMissingChunks,
        visibleLoadedChunks: planner.visibleLoadedChunks,
        nearVisibleMissingChunks: planner.nearVisibleMissingChunks,
        nearVisibleLoadedChunks: planner.nearVisibleLoadedChunks,
        surfaceCacheColumnsUsed: planner.surfaceCacheColumnsUsed,
        surfaceFallbackColumnsUsed: planner.surfaceFallbackColumnsUsed,
        pending: pendingLoadQueue.length,
        inFlight: requestedChunks.size,
        geometryInFlight: geometryRefreshRequests.size,
        dispatchRate: chunkStreamStats.dispatchRate,
        completeRate: chunkStreamStats.completeRate,
        avgWaitMs: chunkStreamStats.avgWaitMs,
        retries: chunkStreamStats.retriedTotal,
        workerLoadQ: chunkStreamStats.workerLoadQueue,
        workerSetQ: chunkStreamStats.workerSetBlockQueue,
        dirtyMeshQ: chunkStreamStats.dirtyMeshBacklog,
        workerOldestLoadMs: chunkStreamStats.workerOldestLoadMs,
        planTargetingMs: plannerProfiler.targeting,
        planCacheMs: plannerProfiler.cacheShell,
        planQueueMs: plannerProfiler.queue,
        planVisibilityMs: plannerProfiler.visibility,
        renderDrawCalls: renderComp.drawCalls,
        renderTriangles: renderComp.triangles,
        renderVisibleChunkMeshes: renderComp.visibleChunkMeshes,
        renderVisibleChunks: renderComp.visibleRenderChunks,
        renderTransparentMeshes: renderComp.transparentMeshes,
        renderTransparentWaterMeshes: renderComp.transparentWaterMeshes,
        renderTransparentFoliageMeshes: renderComp.transparentFoliageMeshes,
        renderTransparentDecorMeshes: renderComp.transparentDecorMeshes,
        renderTransparentGrassOverlayMeshes: renderComp.transparentGrassOverlayMeshes,
        renderTransparentGlassIceMeshes: renderComp.transparentGlassIceMeshes,
        renderTransparentCactusMeshes: renderComp.transparentCactusMeshes,
        renderTransparentOtherMeshes: renderComp.transparentOtherMeshes,
        renderTopTransparentOtherSources: renderComp.topTransparentOtherSources,
        renderVisibleMergedOpaqueMeshes: renderComp.visibleMergedOpaqueMeshes,
        renderVisibleLegacyChunkMeshes: renderComp.visibleLegacyChunkMeshes,
        renderVisibleMeshGroups: renderComp.visibleMeshGroups,
        renderAvgMeshesPerVisibleChunk: renderComp.avgMeshesPerVisibleChunk,
        renderAvgTransparentMeshesPerVisibleChunk: renderComp.avgTransparentMeshesPerVisibleChunk,
        renderMaxMeshesPerVisibleChunk: renderComp.maxMeshesPerVisibleChunk,
        renderMaxTransparentMeshesPerVisibleChunk: renderComp.maxTransparentMeshesPerVisibleChunk,
        renderVisibleDrops: renderComp.visibleDrops,
        renderVisibleFallingBlocks: renderComp.visibleFallingBlocks,
        renderVisibleMobs: renderComp.visibleMobs,
        renderVisiblePrimedTnt: renderComp.visiblePrimedTnt,
        paused: IS_PAUSED,
        loading: worldLoadingActive,
        controlsLocked: !!(controls && controls.isLocked)
    };
}

function teleportPlayerForSoak(x, z) {
    const y = Math.min(WORLD_HEIGHT - 2, Math.max(WORLD_DEPTH + 3, getTerrainData(x, z).y + 3));
    camera.position.set(x, y, z);
    renderCameraPosition.copy(camera.position);
    velocity.set(0, 0, 0);
}

function stopChunkSoakTest() {
    if (chunkSoakState.timerId !== null) {
        clearInterval(chunkSoakState.timerId);
    }
    chunkSoakState.timerId = null;
    chunkSoakState.running = false;
}

function finishChunkSoakTest() {
    stopChunkSoakTest();
    const endedAt = Date.now();
    const durationMs = Math.max(1, endedAt - chunkSoakState.startedAt);
    const report = {
        startedAt: new Date(chunkSoakState.startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        durationMs,
        config: chunkSoakState.config,
        samples: chunkSoakState.samples,
        stalls: chunkSoakState.stalls,
        summary: {
            sampleCount: chunkSoakState.samples.length,
            stallCount: chunkSoakState.stalls.length,
            peakPending: chunkSoakState.samples.reduce((m, s) => Math.max(m, s.pending || 0), 0),
            peakInFlight: chunkSoakState.samples.reduce((m, s) => Math.max(m, s.inFlight || 0), 0),
            peakWorkerOldestLoadMs: chunkSoakState.samples.reduce((m, s) => Math.max(m, s.workerOldestLoadMs || 0), 0),
            minCompleteRate: chunkSoakState.samples.reduce((m, s) => Math.min(m, s.completeRate || 0), Infinity)
        }
    };
    if (!Number.isFinite(report.summary.minCompleteRate)) {
        report.summary.minCompleteRate = 0;
    }
    console.log('[chunk-soak] completed', report.summary);
    window.__lastChunkSoakReport = report;
    return report;
}

function startChunkSoakTest(options = {}) {
    if (!GAME_ACTIVE) {
        throw new Error('Game is not active. Load or create a world first.');
    }
    if (chunkSoakState.running) {
        throw new Error('Chunk soak test already running.');
    }

    const config = {
        steps: Number.isFinite(options.steps) ? Math.max(1, options.steps) : 400,
        stepBlocks: Number.isFinite(options.stepBlocks) ? Math.max(1, options.stepBlocks) : 2,
        intervalMs: Number.isFinite(options.intervalMs) ? Math.max(50, options.intervalMs) : 300,
        dirX: Number.isFinite(options.dirX) ? options.dirX : 1,
        dirZ: Number.isFinite(options.dirZ) ? options.dirZ : 0,
        stallPendingMin: Number.isFinite(options.stallPendingMin) ? options.stallPendingMin : 24,
        stallOldestMinMs: Number.isFinite(options.stallOldestMinMs) ? options.stallOldestMinMs : 7000,
        stallCompleteRateMax: Number.isFinite(options.stallCompleteRateMax) ? options.stallCompleteRateMax : 0.25
    };

    const baseX = camera.position.x;
    const baseZ = camera.position.z;

    chunkSoakState.running = true;
    chunkSoakState.samples = [];
    chunkSoakState.stalls = [];
    chunkSoakState.startedAt = Date.now();
    chunkSoakState.config = { ...config, baseX, baseZ };
    chunkSoakState.stepIndex = 0;

    console.log('[chunk-soak] started', chunkSoakState.config);
    chunkSoakState.timerId = setInterval(() => {
        if (!chunkSoakState.running) return;
        chunkSoakState.stepIndex++;

        const nx = baseX + chunkSoakState.stepIndex * config.stepBlocks * config.dirX;
        const nz = baseZ + chunkSoakState.stepIndex * config.stepBlocks * config.dirZ;
        teleportPlayerForSoak(nx, nz);

        const sample = getChunkDebugSnapshot();
        sample.step = chunkSoakState.stepIndex;
        chunkSoakState.samples.push(sample);

        const stalled =
            sample.pending >= config.stallPendingMin &&
            sample.workerOldestLoadMs >= config.stallOldestMinMs &&
            sample.completeRate <= config.stallCompleteRateMax;

        if (stalled) {
            chunkSoakState.stalls.push({
                step: sample.step,
                t: sample.t,
                cx: sample.cx,
                cz: sample.cz,
                pending: sample.pending,
                inFlight: sample.inFlight,
                completeRate: sample.completeRate,
                workerOldestLoadMs: sample.workerOldestLoadMs
            });
        }

        if (chunkSoakState.stepIndex >= config.steps) {
            finishChunkSoakTest();
        }
    }, config.intervalMs);
}

function createAndLoadChunkSoakWorld(seed = '12345', name = 'Chunk Soak Test') {
    const id = `w_chunk_soak_${Date.now()}`;
    const parsedSeed = parseMinecraftSeed(String(seed));
    const s = BigInt.asIntN(64, parsedSeed).toString();
    const saves = getSavesIndex();
    saves.push({ id, name, seed: s, lastPlayed: Date.now() });
    saveStore.setItem('mindblock_saves', JSON.stringify(saves));
    const initialData = {
        modified: [],
        links: [],
        mobsOverworld: { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] },
        mobsNether: { pigs: [], chickens: [], sheep: [], cows: [], creepers: [], zombies: [], spiders: [], skeletons: [], zombiePigmen: [], slimes: [], ghasts: [], squids: [], wolves: [] }
    };
    saveStore.setItem('mindblock_data_' + id, JSON.stringify(initialData));
    loadWorld(id);
    return id;
}

window.chunkTest = {
    getSnapshot: getChunkDebugSnapshot,
    startSoak: startChunkSoakTest,
    stopSoak: stopChunkSoakTest,
    finishSoak: finishChunkSoakTest,
    createAndLoadWorld: createAndLoadChunkSoakWorld,
    teleport: (x, z) => teleportPlayerForSoak(x, z),
    getChunkState: (cx, cy, cz) => {
        const x = Math.floor(Number(cx));
        const y = Math.floor(Number(cy));
        const z = Math.floor(Number(cz));
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        const key = `${x},${y},${z}`;
        const rc = renderChunks.get(key);
        const chunk = chunkManager.getChunk(x, y, z);
        return {
            key,
            hasChunkData: !!(chunk && chunk.isGenerated),
            hasRenderChunk: !!rc,
            baseVisible: !!rc?.baseVisible,
            meshVisible: !!(rc && Array.isArray(rc.meshes) && rc.meshes.some((m) => !!m && m.visible))
        };
    },
    getRenderMeshStats: (cx, cy, cz, sourceBlockId = null) => {
        const x = Math.floor(Number(cx));
        const y = Math.floor(Number(cy));
        const z = Math.floor(Number(cz));
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        const key = `${x},${y},${z}`;
        const rc = renderChunks.get(key);
        if (!rc || !Array.isArray(rc.meshes)) return { key, meshCount: 0, meshes: [] };
        const wanted = sourceBlockId == null ? null : Math.floor(Number(sourceBlockId));
        const meshes = [];
        for (const m of rc.meshes) {
            if (!m) continue;
            const bid = Number(m.userData?.sourceBlockId);
            if (Number.isFinite(wanted) && bid !== wanted) continue;
            const posAttr = m.geometry?.getAttribute?.('position');
            const colAttr = m.geometry?.getAttribute?.('color');
            const uvAttr = m.geometry?.getAttribute?.('uv');
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            let geometryHash = 0;
            if (posAttr && posAttr.count > 0) {
                for (let i = 0; i < posAttr.count; i++) {
                    const x = Number(posAttr.getX(i) || 0);
                    const y = Number(posAttr.getY(i) || 0);
                    const z = Number(posAttr.getZ(i) || 0);
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (z < minZ) minZ = z;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                    if (z > maxZ) maxZ = z;
                    geometryHash = ((geometryHash * 1315423911) ^ ((Math.round(x * 1000) & 0xffff) << 1) ^ ((Math.round(y * 1000) & 0xffff) << 2) ^ ((Math.round(z * 1000) & 0xffff) << 3)) >>> 0;
                }
            }
            let avgColor = null;
            if (colAttr && colAttr.count > 0) {
                let sr = 0, sg = 0, sb = 0;
                for (let i = 0; i < colAttr.count; i++) {
                    sr += Number(colAttr.getX(i) || 0);
                    sg += Number(colAttr.getY(i) || 0);
                    sb += Number(colAttr.getZ(i) || 0);
                }
                const inv = 1 / colAttr.count;
                avgColor = { r: sr * inv, g: sg * inv, b: sb * inv };
            }
            const map = m.material?.map || null;
            meshes.push({
                sourceBlockId: bid,
                sourceMatIndex: Number(m.userData?.sourceMatIndex ?? 0),
                vertexCount: Number(posAttr?.count || 0),
                indexCount: Number(m.geometry?.index?.count || 0),
                uvCount: Number(uvAttr?.count || 0),
                avgColor,
                bbox: Number.isFinite(minX) ? { minX, minY, minZ, maxX, maxY, maxZ } : null,
                geometryHash,
                materialUv: map ? {
                    offsetX: Number(map.offset?.x ?? 0),
                    offsetY: Number(map.offset?.y ?? 0),
                    repeatX: Number(map.repeat?.x ?? 0),
                    repeatY: Number(map.repeat?.y ?? 0)
                } : null
            });
        }
        return { key, meshCount: meshes.length, meshes };
    },
    getRenderMeshStatsAtBlock: (x, y, z, sourceBlockId = null) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return null;
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(by / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        return window.chunkTest.getRenderMeshStats(cx, cy, cz, sourceBlockId);
    },
    getRenderFaceQuadsAtBlock: (x, y, z, sourceBlockId = null) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return null;
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(by / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        const key = `${cx},${cy},${cz}`;
        const rc = renderChunks.get(key);
        if (!rc || !Array.isArray(rc.meshes)) return { key, quads: [] };
        const wanted = sourceBlockId == null ? null : Math.floor(Number(sourceBlockId));
        const quads = [];
        const uvRotations = [
            [0, 0, 1, 0, 1, 1, 0, 1],
            [1, 0, 1, 1, 0, 1, 0, 0],
            [1, 1, 0, 1, 0, 0, 1, 0],
            [0, 1, 0, 0, 1, 0, 1, 1]
        ];
        const decodeUvRotation = (uv) => {
            const eps = 1e-4;
            for (let r = 0; r < uvRotations.length; r++) {
                const ref = uvRotations[r];
                let ok = true;
                for (let i = 0; i < 8; i++) {
                    if (Math.abs(uv[i] - ref[i]) > eps) { ok = false; break; }
                }
                if (ok) return r;
            }
            return -1;
        };
        const faceDirFromNormal = (nx, ny, nz) => {
            const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
            if (ay >= ax && ay >= az) return ny >= 0 ? 'top' : 'bottom';
            if (ax >= ay && ax >= az) return nx >= 0 ? 'east' : 'west';
            return nz >= 0 ? 'south' : 'north';
        };

        for (const m of rc.meshes) {
            if (!m || !m.geometry) continue;
            const bid = Number(m.userData?.sourceBlockId);
            if (Number.isFinite(wanted) && bid !== wanted) continue;
            const pos = m.geometry.getAttribute?.('position');
            const uvAttr = m.geometry.getAttribute?.('uv');
            const idx = m.geometry.index;
            if (!pos || !uvAttr || !idx || idx.count < 6) continue;
            const ia = idx.array;
            for (let i = 0; i + 5 < ia.length; i += 6) {
                const a = ia[i], b = ia[i + 1], c = ia[i + 2], d = ia[i + 4];
                if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) continue;
                const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
                const bxv = pos.getX(b), byv = pos.getY(b), bzv = pos.getZ(b);
                const cxv = pos.getX(c), cyv = pos.getY(c), czv = pos.getZ(c);
                const dxv = pos.getX(d), dyv = pos.getY(d), dzv = pos.getZ(d);
                const centerX = (ax + bxv + cxv + dxv) * 0.25;
                const centerY = (ay + byv + cyv + dyv) * 0.25;
                const centerZ = (az + bzv + czv + dzv) * 0.25;
                // Piston/extension geometry may protrude beyond the owning block cell.
                // Use a wider ownership window for parity probes.
                if (centerX < (bx - 1.05) || centerX > (bx + 1.05) ||
                    centerY < (by - 1.05) || centerY > (by + 1.05) ||
                    centerZ < (bz - 1.05) || centerZ > (bz + 1.05)) continue;

                const abx = bxv - ax, aby = byv - ay, abz = bzv - az;
                const acx = cxv - ax, acy = cyv - ay, acz = czv - az;
                let nx = aby * acz - abz * acy;
                let ny = abz * acx - abx * acz;
                let nz = abx * acy - aby * acx;
                const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                nx /= nl; ny /= nl; nz /= nl;
                const faceDir = faceDirFromNormal(nx, ny, nz);
                const uv = [
                    uvAttr.getX(a), uvAttr.getY(a),
                    uvAttr.getX(b), uvAttr.getY(b),
                    uvAttr.getX(c), uvAttr.getY(c),
                    uvAttr.getX(d), uvAttr.getY(d)
                ];
                quads.push({
                    sourceBlockId: bid,
                    sourceMatIndex: Number(m.userData?.sourceMatIndex ?? 0),
                    center: { x: centerX, y: centerY, z: centerZ },
                    faceDir,
                    uv,
                    uvRotation: decodeUvRotation(uv)
                });
            }
        }
        return { key, quads };
    },
    getRenderFaceQuadsDetailedAtBlock: (x, y, z, sourceBlockId = null) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return null;
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(by / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        const key = `${cx},${cy},${cz}`;
        const rc = renderChunks.get(key);
        if (!rc || !Array.isArray(rc.meshes)) return { key, quads: [] };
        const wanted = sourceBlockId == null ? null : Math.floor(Number(sourceBlockId));
        const quads = [];
        const faceDirFromNormal = (nx, ny, nz) => {
            const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
            if (ay >= ax && ay >= az) return ny >= 0 ? 'top' : 'bottom';
            if (ax >= ay && ax >= az) return nx >= 0 ? 'east' : 'west';
            return nz >= 0 ? 'south' : 'north';
        };
        const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
        const ATLAS_GRID = 16;
        const decodeAtlas = (uRaw, vRaw) => {
            const u = Number(uRaw) || 0;
            const v = Number(vRaw) || 0;
            const scaledU = u * ATLAS_GRID;
            const tileX = Math.max(0, Math.min(ATLAS_GRID - 1, Math.floor(scaledU + 1e-8)));
            const localU = clamp01(scaledU - tileX);
            const scaledV = v * ATLAS_GRID;
            let tileY = Math.max(0, Math.min(ATLAS_GRID - 1, Math.floor((ATLAS_GRID - 1) - scaledV + 1e-8)));
            const localV = clamp01(scaledV - (ATLAS_GRID - 1 - tileY));
            if (!Number.isFinite(tileY)) tileY = 0;
            return {
                tileX,
                tileY,
                tile: (tileY * ATLAS_GRID) + tileX,
                localU,
                localV
            };
        };

        for (const m of rc.meshes) {
            if (!m || !m.geometry) continue;
            const bid = Number(m.userData?.sourceBlockId);
            if (Number.isFinite(wanted) && bid !== wanted) continue;
            const pos = m.geometry.getAttribute?.('position');
            const uvAttr = m.geometry.getAttribute?.('uv');
            const colorAttr = m.geometry.getAttribute?.('color');
            const idx = m.geometry.index;
            if (!pos || !uvAttr || !idx || idx.count < 6) continue;
            const ia = idx.array;
            for (let i = 0; i + 5 < ia.length; i += 6) {
                const a = ia[i], b = ia[i + 1], c = ia[i + 2], d = ia[i + 4];
                if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) continue;
                const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
                const bxv = pos.getX(b), byv = pos.getY(b), bzv = pos.getZ(b);
                const cxv = pos.getX(c), cyv = pos.getY(c), czv = pos.getZ(c);
                const dxv = pos.getX(d), dyv = pos.getY(d), dzv = pos.getZ(d);
                const centerX = (ax + bxv + cxv + dxv) * 0.25;
                const centerY = (ay + byv + cyv + dyv) * 0.25;
                const centerZ = (az + bzv + czv + dzv) * 0.25;
                // Piston/extension geometry may protrude beyond the owning block cell.
                // Use a wider ownership window for parity probes.
                if (centerX < (bx - 1.05) || centerX > (bx + 1.05) ||
                    centerY < (by - 1.05) || centerY > (by + 1.05) ||
                    centerZ < (bz - 1.05) || centerZ > (bz + 1.05)) continue;

                const abx = bxv - ax, aby = byv - ay, abz = bzv - az;
                const acx = cxv - ax, acy = cyv - ay, acz = czv - az;
                let nx = aby * acz - abz * acy;
                let ny = abz * acx - abx * acz;
                let nz = abx * acy - aby * acx;
                const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                nx /= nl; ny /= nl; nz /= nl;
                const faceDir = faceDirFromNormal(nx, ny, nz);
                const map = m.material?.map || null;
                const mapOffX = Number(map?.offset?.x ?? 0);
                const mapOffY = Number(map?.offset?.y ?? 0);
                const mapRepX = Number(map?.repeat?.x ?? 1);
                const mapRepY = Number(map?.repeat?.y ?? 1);
                const localA = { u: uvAttr.getX(a), v: uvAttr.getY(a) };
                const localB = { u: uvAttr.getX(b), v: uvAttr.getY(b) };
                const localC = { u: uvAttr.getX(c), v: uvAttr.getY(c) };
                const localD = { u: uvAttr.getX(d), v: uvAttr.getY(d) };
                const toGlobalUv = (lu, lv) => ({
                    u: mapOffX + (lu * mapRepX),
                    v: mapOffY + (lv * mapRepY)
                });
                const uva = toGlobalUv(localA.u, localA.v);
                const uvb = toGlobalUv(localB.u, localB.v);
                const uvc = toGlobalUv(localC.u, localC.v);
                const uvd = toGlobalUv(localD.u, localD.v);
                const ad = decodeAtlas(uva.u, uva.v);
                const bd = decodeAtlas(uvb.u, uvb.v);
                const cd = decodeAtlas(uvc.u, uvc.v);
                const dd = decodeAtlas(uvd.u, uvd.v);
                const avgLight = (() => {
                    if (!colorAttr || colorAttr.count <= Math.max(a, b, c, d)) return null;
                    const ca = [colorAttr.getX(a), colorAttr.getY(a), colorAttr.getZ(a)];
                    const cb = [colorAttr.getX(b), colorAttr.getY(b), colorAttr.getZ(b)];
                    const cc = [colorAttr.getX(c), colorAttr.getY(c), colorAttr.getZ(c)];
                    const cdv = [colorAttr.getX(d), colorAttr.getY(d), colorAttr.getZ(d)];
                    const all = [...ca, ...cb, ...cc, ...cdv];
                    let s = 0;
                    for (const v of all) s += Number(v) || 0;
                    return s / all.length;
                })();
                quads.push({
                    sourceBlockId: bid,
                    sourceMatIndex: Number(m.userData?.sourceMatIndex ?? 0),
                    faceDir,
                    normal: { x: nx, y: ny, z: nz },
                    center: { x: centerX, y: centerY, z: centerZ },
                    tile: ad.tile,
                    tileX: ad.tileX,
                    tileY: ad.tileY,
                    tileSubsection: {
                        uMin: Math.min(ad.localU, bd.localU, cd.localU, dd.localU),
                        uMax: Math.max(ad.localU, bd.localU, cd.localU, dd.localU),
                        vMin: Math.min(ad.localV, bd.localV, cd.localV, dd.localV),
                        vMax: Math.max(ad.localV, bd.localV, cd.localV, dd.localV)
                    },
                    lightMultiplier: avgLight,
                    vertices: [
                        { x: ax, y: ay, z: az, u: uva.u, v: uva.v, tileU: clamp01(localA.u), tileV: clamp01(localA.v) },
                        { x: bxv, y: byv, z: bzv, u: uvb.u, v: uvb.v, tileU: clamp01(localB.u), tileV: clamp01(localB.v) },
                        { x: cxv, y: cyv, z: czv, u: uvc.u, v: uvc.v, tileU: clamp01(localC.u), tileV: clamp01(localC.v) },
                        { x: dxv, y: dyv, z: dzv, u: uvd.u, v: uvd.v, tileU: clamp01(localD.u), tileV: clamp01(localD.v) }
                    ]
                });
            }
        }
        return { key, quads };
    },
    getSurfaceSpan: (cx, cz) => {
        const x = Math.floor(Number(cx));
        const z = Math.floor(Number(cz));
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        const { min, max } = getWorldChunkYBounds();
        const cached = getSurfaceColumnCacheEntry(x, z);
        const span = getSurfaceChunkYSpanForColumn(x, z, min, max);
        return {
            cached,
            minCy: span.minCy,
            maxCy: span.maxCy
        };
    },
    getPlayerPosition: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    getCowVisualSummary: (spawnIfMissing = true) => {
        let cow = Array.isArray(mobManager.cows) && mobManager.cows.length > 0
            ? mobManager.cows[mobManager.cows.length - 1]
            : null;
        if (!cow && spawnIfMissing) {
            const p = camera.position;
            mobManager.spawnCow(p.x + 2, p.y + 1, p.z + 2, null);
            cow = Array.isArray(mobManager.cows) && mobManager.cows.length > 0
                ? mobManager.cows[mobManager.cows.length - 1]
                : null;
        }
        if (!cow || !cow.root) return null;
        let hornCount = 0;
        let yMin = Infinity;
        let yMax = -Infinity;
        cow.root.updateMatrixWorld(true);
        cow.root.traverse((obj) => {
            if (!obj || !obj.isMesh || !obj.geometry) return;
            const gp = obj.geometry.parameters || {};
            if (gp.width === (1 / 16) && gp.height === (3 / 16) && gp.depth === (1 / 16)) hornCount++;
            const posAttr = obj.geometry.getAttribute && obj.geometry.getAttribute('position');
            if (!posAttr) return;
            const sample = obj.position && typeof obj.position.clone === 'function' ? obj.position.clone() : null;
            for (let i = 0; i < posAttr.count; i++) {
                let y = Number(posAttr.getY(i) || 0);
                if (sample && typeof sample.set === 'function' && typeof obj.localToWorld === 'function') {
                    sample.set(
                        Number(posAttr.getX(i) || 0),
                        Number(posAttr.getY(i) || 0),
                        Number(posAttr.getZ(i) || 0)
                    );
                    obj.localToWorld(sample);
                    y = Number(sample.y || 0);
                } else {
                    y += Number(obj.position?.y || 0);
                }
                if (y < yMin) yMin = y;
                if (y > yMax) yMax = y;
            }
        });
        return {
            hornCount,
            rootScale: Number(cow.root.scale?.x || 0),
            visualHeight: Number.isFinite(yMin) && Number.isFinite(yMax) ? (yMax - yMin) : null
        };
    },
    getSelectedSlotIndex: () => Number(getSelectedSlot()),
    setSelectedSlotIndex: (slot) => {
        const idx = Math.max(0, Math.min(9, Math.floor(Number(slot))));
        if (!Number.isFinite(idx)) return false;
        setSelectedSlot(idx);
        return true;
    },
    setPlayerPosition: (x, y, z) => {
        const px = Number(x), py = Number(y), pz = Number(z);
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return false;
        camera.position.set(px, py, pz);
        renderCameraPosition.copy(camera.position);
        velocity.set(0, 0, 0);
        canJumpRef.val = false;
        return true;
    },
    setCameraYaw: (yaw) => {
        const y = Number(yaw);
        if (!Number.isFinite(y)) return false;
        camera.rotation.y = y;
        return true;
    },
    setCameraPitch: (pitch) => {
        const p = Number(pitch);
        if (!Number.isFinite(p)) return false;
        camera.rotation.x = p;
        return true;
    },
    getPlayerHealth: () => Number(playerHealth),
    getSkeletonArrows: () => {
        if (!Array.isArray(mobManager.skeletonArrows)) return [];
        return mobManager.skeletonArrows.map((a) => ({
            x: Number(a?.pos?.x ?? 0),
            y: Number(a?.pos?.y ?? 0),
            z: Number(a?.pos?.z ?? 0)
        }));
    },
    getGhastCombatSnapshot: () => ({
        ghastCount: Array.isArray(mobManager.ghasts) ? mobManager.ghasts.length : 0,
        fireballCount: Array.isArray(mobManager.ghastFireballs) ? mobManager.ghastFireballs.length : 0,
        attackCounters: Array.isArray(mobManager.ghasts) ? mobManager.ghasts.map((g) => Number(g?.attackCounter || 0)) : []
    }),
    getSpawnParitySnapshot: () => (typeof mobManager.getSpawnParitySnapshot === 'function'
        ? mobManager.getSpawnParitySnapshot(camera.position)
        : null),
    tryNaturalSpawn: (type, x, z) => {
        const t = String(type || '').toLowerCase();
        const sx = Number(x);
        const sz = Number(z);
        if (!Number.isFinite(sx) || !Number.isFinite(sz)) return { ok: false, msg: 'Invalid coordinates.' };
        return mobManager.spawnMobNear(t, sx, sz, null, false);
    },
    tryNaturalSpawnTypeAt: (type, x, z) => {
        const t = String(type || '').toLowerCase();
        const sx = Number(x);
        const sz = Number(z);
        if (!Number.isFinite(sx) || !Number.isFinite(sz)) return false;
        if (typeof mobManager.debugTrySpawnTypeAt !== 'function') return false;
        return !!mobManager.debugTrySpawnTypeAt(t, sx, sz, camera.position);
    },
    tryNaturalSpawnGroupInChunk: (type, cx, cz, maxToSpawn = 32) => {
        if (typeof mobManager.debugTrySpawnGroupInChunk !== 'function') return 0;
        return Number(mobManager.debugTrySpawnGroupInChunk(type, cx, cz, camera.position, maxToSpawn)) || 0;
    },
    canNaturalSpawnTypeInBiome: (type, biome) => {
        if (typeof mobManager.debugCanNaturalSpawnTypeInBiome !== 'function') return false;
        return !!mobManager.debugCanNaturalSpawnTypeInBiome(type, biome);
    },
    getSpawnGroupBounds: (type) => {
        if (typeof mobManager.debugGetSpawnGroupBounds !== 'function') return null;
        return mobManager.debugGetSpawnGroupBounds(type);
    },
    getPassiveSpawnWeightsForBiome: (biome) => {
        if (typeof mobManager.debugGetPassiveSpawnWeightsForBiome !== 'function') return [];
        return mobManager.debugGetPassiveSpawnWeightsForBiome(biome);
    },
    debugEvaluateHostileDespawn: (input = {}) => {
        if (typeof mobManager.debugEvaluateHostileDespawn !== 'function') return null;
        return mobManager.debugEvaluateHostileDespawn(input);
    },
    debugEvaluateAmbientDespawn: (input = {}) => {
        if (typeof mobManager.debugEvaluateAmbientDespawn !== 'function') return null;
        return mobManager.debugEvaluateAmbientDespawn(input);
    },
    getBiomeAt: (x, z) => {
        const sx = Math.floor(Number(x));
        const sz = Math.floor(Number(z));
        if (!Number.isFinite(sx) || !Number.isFinite(sz)) return null;
        if (CURRENT_DIMENSION !== 'OVERWORLD') return 'hell';
        return getTerrainData(sx, sz)?.biome || null;
    },
    toggleLeverAt: (x, y, z) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        const id = chunkManager.getBlock(bx, by, bz);
        if (!isLeverId(id)) return false;
        const meta = chunkManager.getMetadata(bx, by, bz) & 15;
        const toggled = meta ^ 8;
        if (!isLeverSupportValidAt(bx, by, bz, toggled)) return false;
        markPlayerEditPriority();
        chunkManager.setMetadata(bx, by, bz, toggled);
        updateModBlock(bx, by, bz, id, toggled);
        markRepeatersDirtyAround(bx, by, bz);
        if (chunkWorker) {
            chunkWorker.postMessage({ type: 'setBlock', data: { x: bx, y: by, z: bz, id, metadata: toggled, immediate: true } });
        }
        requestChunkGeometryAt(bx, by, bz);
        updateDependentsAround(bx, by, bz, true);
        return true;
    },
    debugIsSourcePoweringTowards: (sx, sy, sz, tx, ty, tz) => {
        return isSourcePoweringTowards(
            Math.floor(Number(sx)), Math.floor(Number(sy)), Math.floor(Number(sz)),
            Math.floor(Number(tx)), Math.floor(Number(ty)), Math.floor(Number(tz))
        );
    },
    getState: () => ({ ...chunkSoakState }),
    getMobSnapshot: () => {
        const toSimple = (m) => ({
            x: Number(m.pos?.x ?? 0),
            y: Number(m.pos?.y ?? 0),
            z: Number(m.pos?.z ?? 0),
            yaw: Number(m.yaw ?? 0),
            health: Number(m.health ?? 0),
            sheared: !!m.sheared,
            tamed: !!m.tamed,
            persistenceRequired: !!m._persistenceRequired
        });
        return {
            pigs: mobManager.pigs.map(toSimple),
            chickens: mobManager.chickens.map(toSimple),
            sheep: mobManager.sheep.map(toSimple),
            cows: mobManager.cows.map(toSimple),
            creepers: mobManager.creepers.map(toSimple),
            zombies: mobManager.zombies.map(toSimple),
            spiders: mobManager.spiders.map(toSimple),
            skeletons: mobManager.skeletons.map(toSimple),
            zombiePigmen: mobManager.zombiePigmen.map(toSimple),
            slimes: mobManager.slimes.map(toSimple),
            ghasts: mobManager.ghasts.map(toSimple),
            squids: mobManager.squids.map(toSimple),
            wolves: mobManager.wolves.map(toSimple),
            skeletonArrows: Array.isArray(mobManager.skeletonArrows) ? mobManager.skeletonArrows.length : 0,
            serialized: mobManager.serializeState()
        };
    },
    debugTameNearestWolf: () => {
        const playerPos = camera.position;
        let best = null;
        let bestD2 = 9 * 9;
        for (const w of mobManager.wolves) {
            if (!w || w._dead) continue;
            const dx = w.pos.x - playerPos.x;
            const dy = w.pos.y - playerPos.y;
            const dz = w.pos.z - playerPos.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = w;
            }
        }
        if (!best) return { ok: false, msg: 'No nearby wolf.' };
        best.tamed = true;
        best.ownerId = 'player';
        best.sitting = false;
        best.angry = false;
        best.angryTimer = 0;
        best.ownerTarget = null;
        if (typeof mobManager.updateWolfAppearance === 'function') {
            mobManager.updateWolfAppearance(best);
        }
        return { ok: true, msg: 'Wolf tamed for debug.' };
    },
    debugTriggerWolfOwnerDefense: (attackerType = 'zombie') => {
        const type = String(attackerType || 'zombie').toLowerCase();
        const map = {
            zombie: mobManager.zombies,
            skeleton: mobManager.skeletons,
            spider: mobManager.spiders,
            creeper: mobManager.creepers,
            pigman: mobManager.zombiePigmen
        };
        const list = map[type] || mobManager.zombies;
        if (!Array.isArray(list) || list.length === 0) return { ok: false, msg: 'No attacker mob available.' };
        const attacker = list.find((m) => m && !m._dead) || null;
        if (!attacker) return { ok: false, msg: 'No live attacker mob available.' };
        if (typeof mobManager.onPlayerDamaged === 'function') {
            mobManager.onPlayerDamaged({ attacker });
        }
        const assigned = mobManager.wolves.filter((w) => w && !w._dead && w.tamed && w.ownerId === 'player' && !!w.ownerTarget).length;
        return { ok: assigned > 0, assigned };
    },
    saveReloadCurrentWorld: () => {
        if (!CURRENT_WORLD_ID) return { ok: false, msg: 'No world loaded.' };
        const id = CURRENT_WORLD_ID;
        saveGame();
        loadWorld(id);
        return { ok: true, worldId: id };
    },
    runCommand: (text) => {
        const cmd = String(text || '').trim();
        if (!cmd) return false;
        try {
            handleCommand(cmd);
            return true;
        } catch {
            return false;
        }
    },
    debugUseSelectedItem: () => {
        const prevPaused = IS_PAUSED;
        const prevInventoryOpen = IS_INVENTORY_OPEN;
        IS_PAUSED = false;
        IS_INVENTORY_OPEN = false;
        try {
            placeBlock();
            return true;
        } catch {
            return false;
        } finally {
            IS_PAUSED = prevPaused;
            IS_INVENTORY_OPEN = prevInventoryOpen;
        }
    },
    debugResolveBoatAnchor: () => {
        const fromTarget = resolveBoatAnchorFromTargetBlock(targetBlock);
        const fromView = resolveBoatAnchorFromView(6.0);
        const nearPlayer = resolveBoatAnchorNearPlayer(3);
        return {
            fromTarget,
            fromView,
            nearPlayer
        };
    },
    debugSelectedUseState: () => {
        const idx = getSelectedSlot();
        const stack = inventory.slots[idx];
        if (!stack) return { idx, stack: null };
        const kind = getItemStackKind(stack.id, stack.kind);
        const action = getActionItemId(stack);
        const def = getInventoryDef(stack.id, kind);
        const name = String(def?.name || '');
        return {
            idx,
            id: Number(stack.id),
            kind,
            action,
            boatItemId: BOAT_ITEM_ID,
            minecartItemId: MINECART_ITEM_ID,
            isBoatBlockId: isBoatBlockId(stack.id),
            isMinecartBlockId: isMinecartBlockId(stack.id),
            name,
            selectedIsBoatStack: (action === BOAT_ITEM_ID) || isBoatBlockId(stack.id) || name.toLowerCase().includes('boat'),
            selectedIsMinecartStack: (action === MINECART_ITEM_ID) || isMinecartBlockId(stack.id) || name.toLowerCase().includes('minecart'),
            paused: !!IS_PAUSED,
            inventoryOpen: !!IS_INVENTORY_OPEN
        };
    },
    getInventorySlot: (slotIndex) => {
        const idx = Math.floor(Number(slotIndex));
        if (!Number.isFinite(idx) || idx < 0 || idx >= inventory.slots.length) return null;
        const stack = inventory.slots[idx];
        if (!stack) return null;
        const kind = getItemStackKind(stack.id, stack.kind);
        const def = getInventoryDef(stack.id, kind);
        return {
            id: Number(stack.id),
            count: Number(stack.count || 0),
            metadata: Number(stack.metadata || 0),
            kind,
            name: def?.name || null,
            texture: def?.texture || null
        };
    },
    getInventorySlotCount: () => (Array.isArray(inventory.slots) ? inventory.slots.length : 0),
    clearInventoryForProbe: () => {
        inventory.slots.fill(null);
        inventory.cursorItem = null;
        refreshHotbar();
        return true;
    },
    setInventorySlotForProbe: (slotIndex, stack) => {
        const idx = Math.floor(Number(slotIndex));
        if (!Number.isFinite(idx) || idx < 0 || idx >= inventory.slots.length) return false;
        if (!stack) {
            inventory.slots[idx] = null;
            refreshHotbar();
            return true;
        }
        const id = Math.floor(Number(stack.id));
        if (!Number.isFinite(id) || id <= 0) return false;
        const count = Math.max(1, Math.floor(Number(stack.count) || 1));
        const metadata = Number.isFinite(Number(stack.metadata)) ? (Number(stack.metadata) & 15) : 0;
        const durability = Number.isFinite(Number(stack.durability)) ? Number(stack.durability) : null;
        const kind = getItemStackKind(id, stack.kind);
        inventory.slots[idx] = new ItemStack(id, count, durability, metadata, kind);
        refreshHotbar();
        return true;
    },
    debugResolvePlacementBlockId: (id, kind = ITEM_STACK_KIND_ITEM) => {
        const stack = { id: Number(id) };
        const resolved = resolvePlacementBlockIdForStack(stack, kind);
        return Number.isFinite(resolved) ? resolved : 0;
    },
    debugDeterminePistonPlacementMeta: (x, y, z) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return 0;
        return determinePistonPlacementMeta(bx, by, bz) & 7;
    },
    getBlockAt: (x, y, z) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return 0;
        return chunkManager.getBlock(bx, by, bz);
    },
    setDispenserSlot: (x, y, z, slot, stack) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        const idx = Math.floor(Number(slot));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        if (!Number.isFinite(idx) || idx < 0 || idx > 8) return false;
        const key = getKey(bx, by, bz);
        let de = dispenserRegistry.get(key);
        if (!de) {
            de = { slots: new Array(9).fill(null) };
            dispenserRegistry.set(key, de);
        }
        if (!stack) {
            de.slots[idx] = null;
            return true;
        }
        const id = Math.floor(Number(stack.id));
        const count = Math.max(1, Math.floor(Number(stack.count) || 1));
        const metadata = Number.isFinite(Number(stack.metadata)) ? (Number(stack.metadata) & 15) : 0;
        const durability = Number.isFinite(Number(stack.durability)) ? Number(stack.durability) : null;
        const kind = getItemStackKind(id, stack.kind);
        if (!Number.isFinite(id) || id <= 0) return false;
        de.slots[idx] = new ItemStack(id, count, durability, metadata, kind);
        return true;
    },
    getDispenserSlot: (x, y, z, slot) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        const idx = Math.floor(Number(slot));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return null;
        if (!Number.isFinite(idx) || idx < 0 || idx > 8) return null;
        const de = dispenserRegistry.get(getKey(bx, by, bz));
        const s = de?.slots?.[idx];
        if (!s) return null;
        return { id: s.id, count: s.count, metadata: s.metadata || 0, durability: s.durability ?? null, kind: getItemStackKind(s.id, s.kind) };
    },
    triggerDispenserAt: (x, y, z) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        return !!triggerDispenserAt(bx, by, bz);
    },
    getEntityDropCount: () => (Array.isArray(entityManager?.drops) ? entityManager.drops.length : 0),
    getEntityDropIds: () => (Array.isArray(entityManager?.drops)
        ? entityManager.drops.map((d) => Number(d?.id || 0))
        : []),
    clearEntityDrops: () => (entityManager?.clearDrops ? entityManager.clearDrops() : 0),
    spawnTransportAt: (type, x, y, z, yaw = 0) => {
        const bx = Number(x), by = Number(y), bz = Number(z), ry = Number(yaw);
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        return !!entityManager.spawnTransport(type, bx, by, bz, Number.isFinite(ry) ? ry : 0, chunkManager, null);
    },
    tryPlaceMinecartOnRailAt: (x, y, z, yaw = 0) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        const ry = Number(yaw);
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        if (!isRailId(chunkManager.getBlock(bx, by, bz))) return false;
        if (chunkManager.getBlock(bx, by + 1, bz) !== 0) return false;
        return !!entityManager.spawnTransport('minecart', bx, by + 0.35, bz, Number.isFinite(ry) ? ry : 0, chunkManager, null);
    },
    getTransportCount: () => (Array.isArray(entityManager?.transports) ? entityManager.transports.length : 0),
    getTransportStates: () => ((entityManager?.transports || []).map((t) => ({
        type: t.type,
        x: t.mesh.position.x,
        y: t.mesh.position.y,
        z: t.mesh.position.z,
        yaw: t.mesh.rotation.y,
        vx: Number(t.velocity?.x || 0),
        vz: Number(t.velocity?.z || 0),
        mounted: !!t.mounted
    }))),
    setFirstTransportVelocity: (vx = 0, vz = 0) => {
        const t = (entityManager?.transports || [])[0];
        if (!t || !t.velocity) return false;
        const x = Number(vx);
        const z = Number(vz);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
        t.velocity.x = x;
        t.velocity.z = z;
        return true;
    },
    setTransportVelocityAt: (index = 0, vx = 0, vz = 0) => {
        const i = Math.max(0, Math.floor(Number(index) || 0));
        const t = (entityManager?.transports || [])[i];
        if (!t || !t.velocity) return false;
        const x = Number(vx);
        const z = Number(vz);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
        t.velocity.x = x;
        t.velocity.z = z;
        return true;
    },
    clearTransports: () => {
        const arr = entityManager?.transports || [];
        let removed = 0;
        for (let i = arr.length - 1; i >= 0; i--) {
            if (entityManager.removeTransport(arr[i], false)) removed++;
        }
        return removed;
    },
    getMountedTransportType: () => {
        const t = entityManager?.getMountedTransport?.();
        return t ? t.type : null;
    },
    forceMobMeleeHit: (type = 'zombie', damage = 2) => {
        const t = String(type || '').toLowerCase();
        const dmg = Math.max(1, Number(damage) || 1);
        const prevPaused = IS_PAUSED;
        IS_PAUSED = false;
        try {
        let list = null;
        if (t === 'zombie') list = mobManager?.zombies;
        else if (t === 'skeleton') list = mobManager?.skeletons;
        else if (t === 'spider') list = mobManager?.spiders;
        else if (t === 'creeper') list = mobManager?.creepers;
        else if (t === 'wolf') list = mobManager?.wolves;
        else if (t === 'pigman') list = mobManager?.pigZombies;
        const entityFromList = Array.isArray(list) ? (list.find((m) => !!m && !m._dead) || null) : null;
        if (entityFromList && typeof mobManager?.tryMeleeDamagePlayerFrom === 'function') {
            return !!mobManager.tryMeleeDamagePlayerFrom(entityFromList, dmg, { reach: 12, source: 'probe' });
        }
        if (typeof mobManager?.tryMobMeleePlayer !== 'function') return false;
        const p = camera.position;
        mobManager.lastPlayerPos = { x: p.x, y: p.y, z: p.z };
        const synthetic = {
            mobType: t || 'zombie',
            pos: { x: p.x + 0.35, y: p.y - 1.62, z: p.z + 0.35 },
            _dead: false,
            attackCooldown: 0
        };
        const melee = !!mobManager.tryMobMeleePlayer(synthetic, 2.5, dmg, 0, false);
        if (melee) return true;
        // Deterministic probe fallback when AI/melee helper gating prevents contact.
        return damagePlayer(dmg, { source: 'mob', mobType: t || 'zombie' }) === true;
        } finally {
            IS_PAUSED = prevPaused;
        }
    },
    mountNearestTransport: (maxDistance = 4) => {
        const d = Math.max(0, Number(maxDistance) || 0);
        let best = null;
        let bestDistSq = Infinity;
        for (const t of (entityManager?.transports || [])) {
            const dx = t.mesh.position.x - camera.position.x;
            const dy = t.mesh.position.y - camera.position.y;
            const dz = t.mesh.position.z - camera.position.z;
            const dsq = dx * dx + dy * dy + dz * dz;
            if (dsq > d * d) continue;
            if (dsq < bestDistSq) { bestDistSq = dsq; best = t; }
        }
        if (!best) return false;
        return !!entityManager.mountTransport(best);
    },
    driveMountedTransport: (forward = 0, strafe = 0, steps = 20, dt = 0.05) => {
        const f = Number(forward) || 0;
        const s = Number(strafe) || 0;
        const count = Math.max(1, Math.floor(Number(steps) || 1));
        const stepDt = Math.max(0.001, Number(dt) || 0.05);
        const syntheticMove = {
            fwd: f > 0,
            bwd: f < 0,
            right: s > 0,
            left: s < 0,
            crouch: false,
            descend: false,
            jump: false
        };
        for (let i = 0; i < count; i++) {
            entityManager.updateMountedTransport(stepDt, syntheticMove, camera, chunkManager);
            entityManager.update(stepDt, camera.position, chunkManager);
        }
        return true;
    },
    stepTransports: (steps = 20, dt = 0.05) => {
        const count = Math.max(1, Math.floor(Number(steps) || 1));
        const stepDt = Math.max(0.001, Number(dt) || 0.05);
        for (let i = 0; i < count; i++) {
            entityManager.update(stepDt, camera.position, chunkManager);
        }
        return true;
    },
    unmountTransport: () => {
        entityManager?.unmountTransport?.();
        return true;
    },
    removeNearestTransport: (maxDistance = 6, dropItem = true) => {
        const d = Math.max(0, Number(maxDistance) || 0);
        let best = null;
        let bestDistSq = Infinity;
        for (const t of (entityManager?.transports || [])) {
            const dx = t.mesh.position.x - camera.position.x;
            const dy = t.mesh.position.y - camera.position.y;
            const dz = t.mesh.position.z - camera.position.z;
            const dsq = dx * dx + dy * dy + dz * dz;
            if (dsq > d * d) continue;
            if (dsq < bestDistSq) { bestDistSq = dsq; best = t; }
        }
        if (!best) return false;
        return !!entityManager.removeTransport(best, !!dropItem);
    },
    damageNearestTransport: (maxDistance = 6, amount = 10) => {
        const d = Math.max(0, Number(maxDistance) || 0);
        const dmg = Math.max(0, Number(amount) || 0);
        let best = null;
        let bestDistSq = Infinity;
        for (const t of (entityManager?.transports || [])) {
            const dx = t.mesh.position.x - camera.position.x;
            const dy = t.mesh.position.y - camera.position.y;
            const dz = t.mesh.position.z - camera.position.z;
            const dsq = dx * dx + dy * dy + dz * dz;
            if (dsq > d * d) continue;
            if (dsq < bestDistSq) { bestDistSq = dsq; best = t; }
        }
        if (!best) return false;
        return !!entityManager.applyTransportDamage(best, dmg, 'probe');
    },
    breakBlockAt: (x, y, z) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        const prevTarget = targetBlock;
        const prevPaused = IS_PAUSED;
        const prevInventoryOpen = IS_INVENTORY_OPEN;
        targetBlock = {
            x: bx,
            y: by,
            z: bz,
            object: { userData: {} },
            face: { normal: { x: 0, y: 1, z: 0 } }
        };
        IS_PAUSED = false;
        IS_INVENTORY_OPEN = false;
        mineBlock();
        IS_PAUSED = prevPaused;
        IS_INVENTORY_OPEN = prevInventoryOpen;
        targetBlock = prevTarget;
        return true;
    },
    updateDependentsAround: (x, y, z, emitDrops = true) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        updateDependentsAround(bx, by, bz, !!emitDrops);
        return true;
    },
    placePaintingAtTarget: (x, y, z, normal = { x: 0, y: 0, z: 1 }) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        return !!placePaintingAtTarget(bx, by, bz, normal);
    },
    getBlockMetaAt: (x, y, z) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return 0;
        return chunkManager.getMetadata(bx, by, bz) & 15;
    },
    getLightAt: (x, y, z) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return 0;
        return chunkManager.getLight(bx, by, bz);
    },
    getWorkerLightAt: async (x, y, z, timeoutMs = 5000) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return null;
        const t = Math.floor(Number(timeoutMs));
        const effectiveTimeout = Number.isFinite(t) ? Math.max(1000, Math.min(60000, t)) : 5000;
        return await requestWorkerLightSample(bx, by, bz, effectiveTimeout);
    },
    applyBlockChanges: (updates, options = {}) => {
        if (!Array.isArray(updates) || updates.length === 0) return false;
        applyBlockChangesAndSync(updates, options);
        return true;
    },
    saveCurrentWorld: () => {
        if (!CURRENT_WORLD_ID) return false;
        saveGame();
        return true;
    },
    loadWorldById: (id) => {
        if (!id) return false;
        loadWorld(String(id));
        return true;
    },
    setBlock: (x, y, z, id, metadata = 0) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        const bid = Math.floor(Number(id));
        const bmeta = Math.floor(Number(metadata));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz) || !Number.isFinite(bid)) return false;
        chunkManager.setBlock(bx, by, bz, bid);
        chunkManager.setMetadata(bx, by, bz, Number.isFinite(bmeta) ? bmeta : 0);
        updateModBlock(bx, by, bz, bid, Number.isFinite(bmeta) ? bmeta : 0);
        markRepeatersDirtyAround(bx, by, bz);
        markRedstoneWireDirtyAround(bx, by, bz);
        markRedstoneTorchDirtyAround(bx, by, bz);
        markPistonDirtyAt(bx, by, bz);
        fallingBlockManager.markDirty(bx, by, bz);
        if (chunkWorker) {
            chunkWorker.postMessage({
                type: 'setBlock',
                data: { x: bx, y: by, z: bz, id: bid, metadata: Number.isFinite(bmeta) ? bmeta : 0, immediate: true }
            });
        }
        requestChunkGeometryAt(bx, by, bz);
        return true;
    },
    remeshAt: (x, y, z) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        requestChunkGeometryAt(bx, by, bz);
        return true;
    },
    runRedstoneTicks: (seconds = 0.5, fixedStep = FIXED_STEP) => {
        const total = Math.max(0, Number(seconds) || 0);
        const step = Math.max(0.001, Number(fixedStep) || FIXED_STEP);
        const steps = Math.max(1, Math.ceil(total / step));
        for (let i = 0; i < steps; i++) {
            tickRails(step);
            tickRedstoneWires(step);
            tickRedstoneTorches(step);
            tickRedstoneWires(step);
            tickRepeaters(step);
            tickPistons(step);
            tickRedstoneActuators(step);
        }
        return true;
    },
    setBlockBatch: (updates) => {
        if (!Array.isArray(updates) || updates.length === 0) return false;
        const sanitized = [];
        for (let i = 0; i < updates.length; i++) {
            const u = updates[i];
            if (!u) continue;
            const x = Math.floor(Number(u.x));
            const y = Math.floor(Number(u.y));
            const z = Math.floor(Number(u.z));
            const id = Math.floor(Number(u.id));
            const metadata = Math.floor(Number(u.metadata ?? 0));
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(id)) continue;
            chunkManager.setBlock(x, y, z, id);
            chunkManager.setMetadata(x, y, z, Number.isFinite(metadata) ? metadata : 0);
            fallingBlockManager.markDirty(x, y, z);
            sanitized.push({ x, y, z, id, metadata: Number.isFinite(metadata) ? metadata : 0 });
        }
        if (sanitized.length === 0) return false;
        if (chunkWorker) {
            chunkWorker.postMessage({ type: 'setBlockBatch', data: { updates: sanitized } });
        }
        return true;
    },
    igniteTntAt: (x, y, z, fuseTicks = 80) => {
        const bx = Math.floor(Number(x));
        const by = Math.floor(Number(y));
        const bz = Math.floor(Number(z));
        const fuse = Math.max(1, Math.floor(Number(fuseTicks) || 80));
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return false;
        if (!tntManager) return false;
        return tntManager.igniteAt(bx, by, bz, fuse);
    },
    getTntDebug: () => ({
        primedCount: tntManager ? tntManager.primed.length : 0,
        flashCount: tntManager ? tntManager.flashes.length : 0,
        primed: tntManager ? tntManager.primed.map((p) => ({
            blockX: p.blockX,
            blockY: p.blockY,
            blockZ: p.blockZ,
            x: p.group?.position?.x ?? 0,
            y: p.group?.position?.y ?? 0,
            z: p.group?.position?.z ?? 0,
            fuseTicks: p.fuseTicks
        })) : []
    }),
    probeMovementCollision: (step = 0.2) => {
        const s = Number(step);
        const d = Number.isFinite(s) ? Math.max(0.05, Math.min(1.0, s)) : 0.2;
        const p = camera.position;
        const h = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
        const topY = getPlayerColliderTopY(p.y);
        return {
            here: checkCollision(p.x, topY, p.z, chunkManager, h, true),
            xPlus: checkCollision(p.x + d, topY, p.z, chunkManager, h, false),
            xMinus: checkCollision(p.x - d, topY, p.z, chunkManager, h, false),
            zPlus: checkCollision(p.x, topY, p.z + d, chunkManager, h, false),
            zMinus: checkCollision(p.x, topY, p.z - d, chunkManager, h, false)
        };
    },
    setChunkTraceEnabled: (enabled) => setChunkTraceEnabled(enabled),
    clearChunkTrace: () => clearChunkLifecycleTrace(),
    getChunkTrace: () => chunkLifecycleTrace.slice()
};

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
});

initUI();
// Initialize render distance button text
window.setRenderDistance(RENDER_DISTANCE);
window.showTitleScreen();

// Start animation loop (animate() function handles vsync internally)
if (renderer && !rendererInitFailed) animate();
