// js/physics.js
import * as THREE from 'three';
import { SPEED, CROUCH_SPEED, GRAVITY, JUMP_FORCE, PLAYER_HEIGHT, PLAYER_HEIGHT_CROUCH, PLAYER_EYE_HEIGHT, PLAYER_EYE_HEIGHT_CROUCH, PLAYER_RADIUS, CHUNK_SIZE } from './constants.js';
import { isBedBlockId, isButtonId, isCakeBlockId, isCropId, isDeadBushId, isDoorId, isFarmlandId, isFenceId, isFlowerId, isLadderId, isMinecartBlockId, isMushroomId, isPaintingId, isPistonId, isPressurePlateId, isRailId, isRedstoneWireId, isRepeaterId, isReedId, isSignId, isSlabId, isTallGrassId, isTorchId, isTrapdoorId, isBoatBlockId, isLeverId } from './blocks.js';
import { isWaterId, isLavaId, isFluidId } from './fluidIds.js';

let currentColliderHeight = PLAYER_HEIGHT;
let currentEyeHeight = PLAYER_EYE_HEIGHT;
const COLLISION_RADIUS = Math.max(0.05, PLAYER_RADIUS);
const COLLISION_EPS = 1e-4;
const SUPPORT_PROBE_EPS = 0.02;

function toBlockCoordXZ(v) {
    return Math.floor(v + 0.5);
}

function isBlockingCollisionId(type) {
    return type !== 0 &&
        !isFluidId(type) &&
        type !== 7 &&
        !isTorchId(type) &&
        !isButtonId(type) &&
        !isPressurePlateId(type) &&
        !isRailId(type) &&
        !isRedstoneWireId(type) &&
        !isRepeaterId(type) &&
        !isLadderId(type) &&
        !isSignId(type) &&
        !isPaintingId(type) &&
        !isLeverId(type) &&
        !isBoatBlockId(type) &&
        !isMinecartBlockId(type) &&
        !isFlowerId(type) &&
        !isMushroomId(type) &&
        !isCropId(type) &&
        !isTallGrassId(type) &&
        !isDeadBushId(type) &&
        !isReedId(type) &&
        type !== 63 &&
        type !== 78 &&
        type !== 90;
}

function blockCollisionBounds(bx, by, bz, id, meta = 0) {
    if (isSlabId(id)) {
        return {
            minX: bx - 0.5,
            maxX: bx + 0.5,
            minY: by - 0.5,
            maxY: by,
            minZ: bz - 0.5,
            maxZ: bz + 0.5
        };
    }
    if (isBedBlockId(id)) {
        return {
            minX: bx - 0.5,
            maxX: bx + 0.5,
            minY: by - 0.5,
            maxY: by + (1 / 16),
            minZ: bz - 0.5,
            maxZ: bz + 0.5
        };
    }
    if (isCakeBlockId(id)) {
        const bites = Math.max(0, Math.min(6, meta & 7));
        const minX = bx - (7 / 16) + bites * (2 / 16);
        return {
            minX,
            maxX: bx + (7 / 16),
            minY: by - 0.5,
            maxY: by,
            minZ: bz - (7 / 16),
            maxZ: bz + (7 / 16)
        };
    }
    if (isFenceId(id)) {
        return {
            minX: bx - (3 / 16),
            maxX: bx + (3 / 16),
            minY: by - 0.5,
            maxY: by + 1.0,
            minZ: bz - (3 / 16),
            maxZ: bz + (3 / 16)
        };
    }
    if (isFarmlandId(id)) {
        return {
            minX: bx - 0.5,
            maxX: bx + 0.5,
            minY: by - 0.5,
            maxY: by + (7 / 16),
            minZ: bz - 0.5,
            maxZ: bz + 0.5
        };
    }
    if (id === 88) { // Soul Sand collision is 7/8 block tall in Beta.
        return {
            minX: bx - 0.5,
            maxX: bx + 0.5,
            minY: by - 0.5,
            maxY: by + (3 / 8),
            minZ: bz - 0.5,
            maxZ: bz + 0.5
        };
    }
    if (isDoorId(id)) {
        const orientation = meta & 3;
        const isOpen = (meta & 4) !== 0;
        const half = 3 / 32;
        const nsPlane = (!isOpen && (orientation === 0 || orientation === 2)) || (isOpen && (orientation === 1 || orientation === 3));
        if (nsPlane) {
            return {
                minX: bx - 0.5,
                maxX: bx + 0.5,
                minY: by - 0.5,
                maxY: by + 0.5,
                minZ: bz - half,
                maxZ: bz + half
            };
        }
        return {
            minX: bx - half,
            maxX: bx + half,
            minY: by - 0.5,
            maxY: by + 0.5,
            minZ: bz - 0.5,
            maxZ: bz + 0.5
        };
    }
    if (isTrapdoorId(id)) {
        const dir = meta & 3;
        const isOpen = (meta & 4) !== 0;
        const isTopHalf = (meta & 8) !== 0;
        const t = 3 / 16;
        if (!isOpen) {
            const minY = isTopHalf ? (by + 0.5 - t) : (by - 0.5);
            return {
                minX: bx - 0.5,
                maxX: bx + 0.5,
                minY,
                maxY: minY + t,
                minZ: bz - 0.5,
                maxZ: bz + 0.5
            };
        }
        if (dir === 0) { // south support
            return { minX: bx - 0.5, maxX: bx + 0.5, minY: by - 0.5, maxY: by + 0.5, minZ: bz + 0.5 - t, maxZ: bz + 0.5 };
        }
        if (dir === 1) { // north support
            return { minX: bx - 0.5, maxX: bx + 0.5, minY: by - 0.5, maxY: by + 0.5, minZ: bz - 0.5, maxZ: bz - 0.5 + t };
        }
        if (dir === 2) { // east support
            return { minX: bx + 0.5 - t, maxX: bx + 0.5, minY: by - 0.5, maxY: by + 0.5, minZ: bz - 0.5, maxZ: bz + 0.5 };
        }
        return { minX: bx - 0.5, maxX: bx - 0.5 + t, minY: by - 0.5, maxY: by + 0.5, minZ: bz - 0.5, maxZ: bz + 0.5 };
    }
    return {
        minX: bx - 0.5,
        maxX: bx + 0.5,
        minY: by - 0.5,
        maxY: by + 0.5,
        minZ: bz - 0.5,
        maxZ: bz + 0.5
    };
}

function getPistonFacing(meta = 0) {
    const m = meta & 7;
    if (m === 0) return { x: 0, y: 0, z: 1 };
    if (m === 1) return { x: -1, y: 0, z: 0 };
    if (m === 2) return { x: 0, y: 0, z: -1 };
    if (m === 3) return { x: 1, y: 0, z: 0 };
    if (m === 4) return { x: 0, y: 1, z: 0 };
    if (m === 5) return { x: 0, y: -1, z: 0 };
    return { x: 0, y: 0, z: 1 };
}

function isExtendedPistonHeadAt(bx, by, bz, chunkManager) {
    // Approximate Beta piston-head collision: treat the front cell as occupied
    // while the piston is extended, so hitboxes change on activation.
    const dirs = [
        { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
    ];
    for (const d of dirs) {
        const baseX = bx - d.x;
        const baseY = by - d.y;
        const baseZ = bz - d.z;
        const id = chunkManager.getBlock(baseX, baseY, baseZ);
        if (!isPistonId(id)) continue;
        const meta = chunkManager.getMetadata(baseX, baseY, baseZ) & 15;
        if ((meta & 8) === 0) continue;
        const f = getPistonFacing(meta);
        if (f.x === d.x && f.y === d.y && f.z === d.z) {
            return true;
        }
    }
    return false;
}

function aabbOverlaps(minX, minY, minZ, maxX, maxY, maxZ, box) {
    return minX < box.maxX - COLLISION_EPS &&
        maxX > box.minX + COLLISION_EPS &&
        minY < box.maxY - COLLISION_EPS &&
        maxY > box.minY + COLLISION_EPS &&
        minZ < box.maxZ - COLLISION_EPS &&
        maxZ > box.minZ + COLLISION_EPS;
}

function hasAnySolidInAABB(minX, minY, minZ, maxX, maxY, maxZ, chunkManager) {
    const bx0 = Math.floor(minX + 0.5 + COLLISION_EPS);
    const by0 = Math.floor(minY + 0.5 + COLLISION_EPS);
    const bz0 = Math.floor(minZ + 0.5 + COLLISION_EPS);
    const bx1 = Math.floor(maxX + 0.5 - COLLISION_EPS);
    const by1 = Math.floor(maxY + 0.5 - COLLISION_EPS);
    const bz1 = Math.floor(maxZ + 0.5 - COLLISION_EPS);

    let sawLoaded = false;
    for (let bx = bx0; bx <= bx1; bx++) {
        for (let by = by0; by <= by1; by++) {
            for (let bz = bz0; bz <= bz1; bz++) {
                const cx = Math.floor(bx / CHUNK_SIZE);
                const cy = Math.floor(by / CHUNK_SIZE);
                const cz = Math.floor(bz / CHUNK_SIZE);
                if (!chunkManager.hasChunk(cx, cy, cz)) continue;
                sawLoaded = true;
                const id = chunkManager.getBlock(bx, by, bz);
                let meta = chunkManager.getMetadata(bx, by, bz);
                if (isDoorId(id) && (meta & 8) !== 0) {
                    const belowId = chunkManager.getBlock(bx, by - 1, bz);
                    if (isDoorId(belowId)) {
                        const lowerMeta = chunkManager.getMetadata(bx, by - 1, bz) & 7;
                        meta = (meta & 8) | lowerMeta;
                    }
                }
                if (isBlockingCollisionId(id) && aabbOverlaps(minX, minY, minZ, maxX, maxY, maxZ, blockCollisionBounds(bx, by, bz, id, meta))) return true;
                if (id === 0 && isExtendedPistonHeadAt(bx, by, bz, chunkManager)) {
                    const headBounds = {
                        minX: bx - 0.5, maxX: bx + 0.5,
                        minY: by - 0.5, maxY: by + 0.5,
                        minZ: bz - 0.5, maxZ: bz + 0.5
                    };
                    if (aabbOverlaps(minX, minY, minZ, maxX, maxY, maxZ, headBounds)) return true;
                }
            }
        }
    }
    if (!sawLoaded) return false;
    return false;
}

function intersectsUnloadedAABB(minX, minY, minZ, maxX, maxY, maxZ, chunkManager) {
    const bx0 = Math.floor(minX + 0.5 + COLLISION_EPS);
    const by0 = Math.floor(minY + 0.5 + COLLISION_EPS);
    const bz0 = Math.floor(minZ + 0.5 + COLLISION_EPS);
    const bx1 = Math.floor(maxX + 0.5 - COLLISION_EPS);
    const by1 = Math.floor(maxY + 0.5 - COLLISION_EPS);
    const bz1 = Math.floor(maxZ + 0.5 - COLLISION_EPS);
    for (let bx = bx0; bx <= bx1; bx++) {
        for (let by = by0; by <= by1; by++) {
            for (let bz = bz0; bz <= bz1; bz++) {
                const cx = Math.floor(bx / CHUNK_SIZE);
                const cy = Math.floor(by / CHUNK_SIZE);
                const cz = Math.floor(bz / CHUNK_SIZE);
                if (!chunkManager.hasChunk(cx, cy, cz)) return true;
            }
        }
    }
    return false;
}

function intersectsSolidAABB(minX, minY, minZ, maxX, maxY, maxZ, chunkManager) {
    // World blocks are centered on integer coordinates (extent: [n-0.5, n+0.5)).
    const bx0 = Math.floor(minX + 0.5 + COLLISION_EPS);
    const by0 = Math.floor(minY + 0.5 + COLLISION_EPS);
    const bz0 = Math.floor(minZ + 0.5 + COLLISION_EPS);
    const bx1 = Math.floor(maxX + 0.5 - COLLISION_EPS);
    const by1 = Math.floor(maxY + 0.5 - COLLISION_EPS);
    const bz1 = Math.floor(maxZ + 0.5 - COLLISION_EPS);
    let sawLoaded = false;
    for (let bx = bx0; bx <= bx1; bx++) {
        for (let by = by0; by <= by1; by++) {
            for (let bz = bz0; bz <= bz1; bz++) {
                const cx = Math.floor(bx / CHUNK_SIZE);
                const cy = Math.floor(by / CHUNK_SIZE);
                const cz = Math.floor(bz / CHUNK_SIZE);
                if (!chunkManager.hasChunk(cx, cy, cz)) {
                    continue;
                }
                sawLoaded = true;
                const id = chunkManager.getBlock(bx, by, bz);
                let meta = chunkManager.getMetadata(bx, by, bz);
                if (isDoorId(id) && (meta & 8) !== 0) {
                    const belowId = chunkManager.getBlock(bx, by - 1, bz);
                    if (isDoorId(belowId)) {
                        const lowerMeta = chunkManager.getMetadata(bx, by - 1, bz) & 7;
                        meta = (meta & 8) | lowerMeta;
                    }
                }
                if (isBlockingCollisionId(id) && aabbOverlaps(minX, minY, minZ, maxX, maxY, maxZ, blockCollisionBounds(bx, by, bz, id, meta))) return true;
            }
        }
    }
    // Unloaded space is treated as non-colliding so vertical placement cannot float on missing chunks.
    if (!sawLoaded) return false;
    return false;
}

// Helper to check standard box collision
export function checkCollision(px, py, pz, chunkManager, height, includeFeet = true) {
    const r = COLLISION_RADIUS;
    const minX = px - r;
    const maxX = px + r;
    const minZ = pz - r;
    const maxZ = pz + r;
    const minY = includeFeet ? (py - height) : (py - height + 0.2);
    const maxY = py;
    return intersectsSolidAABB(minX, minY, minZ, maxX, maxY, maxZ, chunkManager);
}

function checkCeilingCollision(px, py, pz, chunkManager) {
    const r = COLLISION_RADIUS;
    return intersectsSolidAABB(px - r, py, pz - r, px + r, py + 0.05, pz + r, chunkManager);
}

// Generic helper to check if player is touching a specific fluid
function isTouchingFluid(px, py, pz, chunkManager, height, predicate) {
    const r = COLLISION_RADIUS;
    const h = height;
    
    const points = [
        [px-r, py-h, pz-r], [px+r, py-h, pz-r],
        [px-r, py-h, pz+r], [px+r, py-h, pz+r],
        [px-r, py-h*0.5, pz-r], [px+r, py-h*0.5, pz-r],
        [px-r, py-h*0.5, pz+r], [px+r, py-h*0.5, pz+r],
        [px-r, py, pz-r], [px+r, py, pz-r],
        [px-r, py, pz+r], [px+r, py, pz+r]
    ];
    
    for (let p of points) {
        const bx = toBlockCoordXZ(p[0]);
        const by = Math.round(p[1]);
        const bz = toBlockCoordXZ(p[2]);
        const type = chunkManager.getBlock(bx, by, bz);
        if (predicate(type)) return true;
    }
    return false;
}

function isTouchingLadder(px, py, pz, chunkManager, height) {
    const r = COLLISION_RADIUS;
    const minX = px - r;
    const maxX = px + r;
    const minY = py - height;
    const maxY = py;
    const minZ = pz - r;
    const maxZ = pz + r;
    const bx0 = Math.floor(minX + 0.5 + COLLISION_EPS);
    const by0 = Math.floor(minY + 0.5 + COLLISION_EPS);
    const bz0 = Math.floor(minZ + 0.5 + COLLISION_EPS);
    const bx1 = Math.floor(maxX + 0.5 - COLLISION_EPS);
    const by1 = Math.floor(maxY + 0.5 - COLLISION_EPS);
    const bz1 = Math.floor(maxZ + 0.5 - COLLISION_EPS);
    for (let bx = bx0; bx <= bx1; bx++) {
        for (let by = by0; by <= by1; by++) {
            for (let bz = bz0; bz <= bz1; bz++) {
                const id = chunkManager.getBlock(bx, by, bz);
                if (isLadderId(id)) return true;
            }
        }
    }
    return false;
}

// Check if the player is supported by solid ground at the given position
function isSupported(x, y, z, chunkManager, height) {
    const r = COLLISION_RADIUS;
    const feetY = y - height;
    const probeMinY = feetY - SUPPORT_PROBE_EPS;
    const probeMaxY = feetY + 0.005;
    return hasAnySolidInAABB(
        x - r, probeMinY, z - r,
        x + r, probeMaxY, z + r,
        chunkManager
    );
}

function isStandingOnSoulSand(x, y, z, chunkManager, height) {
    const r = COLLISION_RADIUS;
    const feetY = y - height;
    const by = Math.floor((feetY - SUPPORT_PROBE_EPS) + 0.5);
    const points = [
        [x - r, z - r],
        [x + r, z - r],
        [x - r, z + r],
        [x + r, z + r],
        [x, z]
    ];
    for (const p of points) {
        const bx = Math.floor(p[0] + 0.5);
        const bz = Math.floor(p[1] + 0.5);
        if (chunkManager.getBlock(bx, by, bz) === 88) return true;
    }
    return false;
}

function isFullySupported(x, y, z, chunkManager, height) {
    return isSupported(x, y, z, chunkManager, height);
}

function isHorizontallyBlocked(px, py, pz, chunkManager, height) {
    const r = COLLISION_RADIUS;
    const minX = px - r;
    const maxX = px + r;
    const minZ = pz - r;
    const maxZ = pz + r;
    const minY = py - height;
    const maxY = py;
    // Keep player out of not-yet-loaded space (edge-of-world invisible wall behavior).
    if (intersectsUnloadedAABB(minX, minY, minZ, maxX, maxY, maxZ, chunkManager)) return true;
    return checkCollision(px, py, pz, chunkManager, height, true);
}

function clampCrouchStep(currentValue, stepValue, tryPosition, isSafePosition) {
    let low = 0.0;
    let high = 1.0;
    for (let i = 0; i < 10; i++) {
        const mid = (low + high) * 0.5;
        const candidate = currentValue + stepValue * mid;
        if (isSafePosition(tryPosition(candidate))) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return currentValue + stepValue * low;
}

export function updatePhysics(dt, camera, velocity, moveState, canJumpRef, chunkManager) {
    const previousHeight = currentColliderHeight;
    const previousEyeHeight = currentEyeHeight;
    const desiredHeight = moveState.crouch ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
    const desiredEyeHeight = moveState.crouch ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT;
    let nextHeight = currentColliderHeight;
    let nextEyeHeight = currentEyeHeight;
    if (desiredHeight < currentColliderHeight) {
        nextHeight = desiredHeight;
        nextEyeHeight = desiredEyeHeight;
    } else if (desiredHeight > currentColliderHeight) {
        const feetY = camera.position.y - currentEyeHeight;
        const standTopY = feetY + desiredHeight;
        const canStand = !checkCollision(camera.position.x, standTopY, camera.position.z, chunkManager, desiredHeight, true)
            && !checkCeilingCollision(camera.position.x, standTopY, camera.position.z, chunkManager);
        if (canStand) {
            nextHeight = desiredHeight;
            nextEyeHeight = desiredEyeHeight;
        }
    }
    const poseChanged = nextHeight !== currentColliderHeight || nextEyeHeight !== currentEyeHeight;
    if (poseChanged) {
        // Keep feet anchored while collider height changes.
        camera.position.y += (nextEyeHeight - currentEyeHeight);
        currentColliderHeight = nextHeight;
        currentEyeHeight = nextEyeHeight;
        // Prevent one-frame vertical settle/pop after crouch transitions.
        velocity.y = 0;
        canJumpRef.val = true;
    }
    const isCrouching = currentColliderHeight < PLAYER_HEIGHT;
    const currentHeight = currentColliderHeight;
    let currentTopY = camera.position.y + (currentHeight - currentEyeHeight);
    
    const inWater = isTouchingFluid(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight, isWaterId);
    const inLava = isTouchingFluid(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight, isLavaId);
    const onLadder = isTouchingLadder(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight);
    
    let currentSpeed = isCrouching ? CROUCH_SPEED : SPEED;
    const onSoulSand = isSupported(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight)
        && isStandingOnSoulSand(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight);
    if (inLava) {
        currentSpeed *= 0.25; // Slower in Lava
    } else if (inWater) {
        currentSpeed *= 0.5;
    } else if (onSoulSand) {
        // Beta parity baseline: soul sand slows horizontal movement.
        currentSpeed *= 0.4;
    }

    const inputFwd = (moveState.fwd ? 1 : 0) - (moveState.bwd ? 1 : 0);
    const inputRight = (moveState.right ? 1 : 0) - (moveState.left ? 1 : 0);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    if (inputFwd !== 0) velocity.add(forward.multiplyScalar(inputFwd * currentSpeed * dt * 5.0));
    if (inputRight !== 0) velocity.add(right.multiplyScalar(inputRight * currentSpeed * dt * 5.0));

    const damping = 10.0 * dt;
    velocity.x -= velocity.x * damping;
    velocity.z -= velocity.z * damping;
    
    let supportedNow = isSupported(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight);
    // Stabilize uncrouch while moving on edges/slopes: if we were grounded before pose change,
    // keep grounded for this frame to prevent a tiny gravity settle.
    if (!supportedNow && poseChanged && currentHeight > previousHeight) {
        const previousTopY = camera.position.y + (previousHeight - previousEyeHeight);
        const supportedAtPreviousHeight = isSupported(camera.position.x, previousTopY, camera.position.z, chunkManager, previousHeight);
        if (supportedAtPreviousHeight) {
            supportedNow = true;
            velocity.y = 0;
            canJumpRef.val = true;
        }
    }
    if (onLadder) {
        canJumpRef.val = true;
        const climbSpeed = 3.25;
        if (moveState.jump || moveState.fwd) velocity.y = climbSpeed;
        else if (moveState.crouch) velocity.y = -climbSpeed;
        else velocity.y = 0;
        velocity.y -= velocity.y * Math.min(1, 8.0 * dt);
    } else if (!inWater && !inLava) {
        if (supportedNow && velocity.y <= 0) {
            canJumpRef.val = true;
            velocity.y = 0;
            // Snap to the nearest stable ground contact (small range) so
            // landing height is consistent between fall and jump paths.
            const snapDrop = 0.6;
            const yTop = currentTopY;
            const yBottom = yTop - snapDrop;
            if (checkCollision(camera.position.x, yBottom, camera.position.z, chunkManager, currentHeight, true)) {
                let low = yBottom;
                let high = yTop;
                for (let i = 0; i < 10; i++) {
                    const mid = (low + high) * 0.5;
                    const collides = checkCollision(camera.position.x, mid, camera.position.z, chunkManager, currentHeight, true);
                    if (collides) low = mid;
                    else high = mid;
                }
                currentTopY = high;
                camera.position.y = currentTopY - (currentHeight - currentEyeHeight);
            }
            if (moveState.jump) {
                velocity.y = JUMP_FORCE;
                canJumpRef.val = false;
            }
        } else {
            velocity.y -= GRAVITY * dt;
        }
    } else if (inWater || inLava) {
        if (moveState.jump) {
            velocity.y = 5.0; 
        } else {
            velocity.y -= GRAVITY * 0.2 * dt;
        }
        velocity.y -= velocity.y * 3.0 * dt;
    }

    // --- X Axis (swept/sub-stepped to prevent tunneling through 1-block walls) ---
    const deltaX = velocity.x * dt;
    const stepsX = Math.max(1, Math.ceil(Math.abs(deltaX) / 0.2));
    const stepX = deltaX / stepsX;
    for (let i = 0; i < stepsX; i++) {
        const nextX = camera.position.x + stepX;
        let collisionX = isHorizontallyBlocked(nextX, currentTopY, camera.position.z, chunkManager, currentHeight);
        if (!collisionX && isCrouching && isSupported(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight)) {
            const nextSupported = isSupported(nextX, currentTopY, camera.position.z, chunkManager, currentHeight);
            const currentSupported = isSupported(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight);
            if (!nextSupported && currentSupported) {
                camera.position.x = clampCrouchStep(
                    camera.position.x,
                    stepX,
                    (x) => ({ x, y: currentTopY, z: camera.position.z }),
                    (p) => isSupported(p.x, p.y, p.z, chunkManager, currentHeight)
                );
                velocity.x = 0;
                break;
            }
        }
        if (collisionX) {
            velocity.x = 0;
            break;
        }
        camera.position.x = nextX;
    }

    // --- Z Axis (swept/sub-stepped to prevent tunneling through 1-block walls) ---
    const deltaZ = velocity.z * dt;
    const stepsZ = Math.max(1, Math.ceil(Math.abs(deltaZ) / 0.2));
    const stepZ = deltaZ / stepsZ;
    for (let i = 0; i < stepsZ; i++) {
        const nextZ = camera.position.z + stepZ;
        let collisionZ = isHorizontallyBlocked(camera.position.x, currentTopY, nextZ, chunkManager, currentHeight);
        if (!collisionZ && isCrouching && isSupported(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight)) {
            const nextSupported = isSupported(camera.position.x, currentTopY, nextZ, chunkManager, currentHeight);
            const currentSupported = isSupported(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight);
            if (!nextSupported && currentSupported) {
                camera.position.z = clampCrouchStep(
                    camera.position.z,
                    stepZ,
                    (z) => ({ x: camera.position.x, y: currentTopY, z }),
                    (p) => isSupported(p.x, p.y, p.z, chunkManager, currentHeight)
                );
                velocity.z = 0;
                break;
            }
        }
        if (collisionZ) {
            velocity.z = 0;
            break;
        }
        camera.position.z = nextZ;
    }

    // --- Y Axis (swept/sub-stepped to avoid hard snap and half-block offsets) ---
    const deltaY = velocity.y * dt;
    const stepsY = Math.max(1, Math.ceil(Math.abs(deltaY) / 0.08));
    const stepY = deltaY / stepsY;
    let landed = false;
    let blockedUp = false;
    let landingLowY = null;
    let landingHighY = null;
    for (let i = 0; i < stepsY; i++) {
        const nextEyeY = camera.position.y + stepY;
        const nextTopY = currentTopY + stepY;
        const collidedY = stepY > 0
            ? checkCeilingCollision(camera.position.x, nextTopY, camera.position.z, chunkManager)
            : checkCollision(camera.position.x, nextTopY, camera.position.z, chunkManager, currentHeight, true);
        if (collidedY) {
            if (stepY < 0) {
                landed = true;
                landingLowY = nextTopY;
                landingHighY = currentTopY;
            }
            else blockedUp = true;
            velocity.y = 0;
            break;
        }
        camera.position.y = nextEyeY;
        currentTopY = nextTopY;
    }

    // Refine downward contact so landing height is stable regardless of fall speed.
    if (landed && landingLowY !== null && landingHighY !== null) {
        let low = landingLowY;
        let high = landingHighY;
        for (let i = 0; i < 10; i++) {
            const mid = (low + high) * 0.5;
            const collides = checkCollision(camera.position.x, mid, camera.position.z, chunkManager, currentHeight, true);
            if (collides) {
                low = mid;
            } else {
                high = mid;
            }
        }
        currentTopY = high;
        camera.position.y = currentTopY - (currentHeight - currentEyeHeight);
    }

    if (landed) {
        if (moveState.jump) {
            velocity.y = JUMP_FORCE;
            canJumpRef.val = false;
        } else {
            canJumpRef.val = true;
        }
    } else if (blockedUp) {
        canJumpRef.val = false;
    } else {
        canJumpRef.val = isSupported(camera.position.x, currentTopY, camera.position.z, chunkManager, currentHeight);
    }
}

export function resetPhysicsPose(isCrouching = false) {
    currentColliderHeight = isCrouching ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
    currentEyeHeight = isCrouching ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT;
}
