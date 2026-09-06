import * as THREE from 'three';
import { BLOCKS, getFireAnimationCanvas } from './world.js';
import { isFluidId } from './fluidIds.js';
import { isTorchId } from './blocks.js';
import { FIRE_PLANE_HEIGHT, FIRE_PLANE_WIDTH } from './flatEntityRenderConfig.js';

export const CAMERA_MODE_FIRST_PERSON = 0;
export const CAMERA_MODE_THIRD_PERSON_BACK = 1;
export const CAMERA_MODE_THIRD_PERSON_FRONT = 2;

const CAMERA_DISTANCE_BACK = 4.0;
const CAMERA_DISTANCE_FRONT = 4.0;
const CAMERA_VERTICAL_OFFSET = 0.2;
const CAMERA_COLLISION_RADIUS = 0.12;
const BETA_CAMERA_TRACE_STEP = 0.05;
const PLAYER_WALK_SPEED_REF = 4.317;
const LIMB_SWING_FREQ = 3.3;
const ARM_SWING_SCALE = 1.0;
const LEG_SWING_SCALE = 1.4;
const LIMB_ROTATION_DAMP = 24.0;
const PLAYER_FIRE_ALPHA_BASE = 0.9;
const PLAYER_FIRE_PLANE_COUNT = 42;
const FIRE_SURFACE_PARTS = [
    { cx: 0.0, cy: 1.75, cz: 0.0, hx: 0.25, hy: 0.25, hz: 0.25 },        // head
    { cx: 0.0, cy: 1.125, cz: 0.0, hx: 0.25, hy: 0.375, hz: 0.125 },     // torso
    { cx: -0.375, cy: 1.125, cz: 0.0, hx: 0.125, hy: 0.375, hz: 0.125 }, // right arm
    { cx: 0.375, cy: 1.125, cz: 0.0, hx: 0.125, hy: 0.375, hz: 0.125 },  // left arm
    { cx: -0.125, cy: 0.375, cz: 0.0, hx: 0.125, hy: 0.375, hz: 0.125 }, // right leg
    { cx: 0.125, cy: 0.375, cz: 0.0, hx: 0.125, hy: 0.375, hz: 0.125 }   // left leg
];

function isCameraSolidBlock(id) {
    if (!id) return false;
    if (isFluidId(id)) return false;
    if (isTorchId(id) || id === 63 || id === 90) return false;
    const def = BLOCKS[id];
    if (!def) return false;
    return !def.transparent;
}

function makeSkinnedBoxGeometry(width, height, depth, faces, texW = 64, texH = 32) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const uv = geometry.attributes.uv;

    const setFace = (faceIndex, rect) => {
        if (!rect) return;
        const [u0, v0, u1, v1] = rect;
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

    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
    // For this player orientation, visual "front" maps to -Z and "back" maps to +Z.
    setFace(0, faces.right);
    setFace(1, faces.left);
    setFace(2, faces.top);
    setFace(3, faces.bottom);
    setFace(4, faces.back);
    setFace(5, faces.front);
    uv.needsUpdate = true;
    return geometry;
}

function mirrorFacesX(faces) {
    const flipU = (rect) => rect ? [rect[2], rect[1], rect[0], rect[3]] : rect;
    return {
        right: flipU(faces.left),
        left: flipU(faces.right),
        top: flipU(faces.top),
        bottom: flipU(faces.bottom),
        front: flipU(faces.front),
        back: flipU(faces.back)
    };
}

export class ThirdPersonController {
    constructor(scene, chunkManager, textureLoader) {
        this.scene = scene;
        this.chunkManager = chunkManager;
        this.textureLoader = textureLoader;

        this.mode = CAMERA_MODE_FIRST_PERSON;
        this.playerRoot = null;
        this.headPivot = null;
        this.leftArmPivot = null;
        this.rightArmPivot = null;
        this.leftLegPivot = null;
        this.rightLegPivot = null;
        this.walkPhase = 0;
        this.burning = false;
        this.lastEyePos = new THREE.Vector3();
        this.lastEyeRot = new THREE.Euler(0, 0, 0, 'YXZ');

        this.tmpForward = new THREE.Vector3();
        this.tmpAnchor = new THREE.Vector3();
        this.tmpDesired = new THREE.Vector3();
        this.tmpActual = new THREE.Vector3();
        this.tmpLook = new THREE.Vector3();
        this.tmpDir = new THREE.Vector3();
        this.tmpAxisZ = new THREE.Vector3(0, 0, 1);
        this.tmpAxisY = new THREE.Vector3(0, 1, 0);
        this.tmpSurfaceNormal = new THREE.Vector3();
        this.tmpFireQuat = new THREE.Quaternion();
        this.tmpFireAxis = new THREE.Vector3();
        this.tmpCandidate = new THREE.Vector3();
        this.tmpBestCandidate = new THREE.Vector3();
        this.playerFireGroup = null;
        this.playerFireMaterial = null;
        this.playerFirePlanes = [];

        this._buildPlayerModel();
    }

    _getNearestSurfacePointOnAabb(px, py, pz, minX, minY, minZ, maxX, maxY, maxZ, outPoint, outNormal) {
        // Face distances
        const dPosX = Math.abs(maxX - px);
        const dNegX = Math.abs(px - minX);
        const dPosY = Math.abs(maxY - py);
        const dNegY = Math.abs(py - minY);
        const dPosZ = Math.abs(maxZ - pz);
        const dNegZ = Math.abs(pz - minZ);

        let face = 0; // +X
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

    _alignFlameToNearestSurface(flame, padding = 0.03) {
        const p = flame.position;
        let bestDistSq = Infinity;
        let bestNormal = this.tmpSurfaceNormal.set(0, 1, 0);

        for (let i = 0; i < FIRE_SURFACE_PARTS.length; i++) {
            const part = FIRE_SURFACE_PARTS[i];
            const minX = part.cx - part.hx;
            const minY = part.cy - part.hy;
            const minZ = part.cz - part.hz;
            const maxX = part.cx + part.hx;
            const maxY = part.cy + part.hy;
            const maxZ = part.cz + part.hz;
            this._getNearestSurfacePointOnAabb(
                p.x, p.y, p.z,
                minX, minY, minZ, maxX, maxY, maxZ,
                this.tmpCandidate, this.tmpFireAxis
            );
            const dx = p.x - this.tmpCandidate.x;
            const dy = p.y - this.tmpCandidate.y;
            const dz = p.z - this.tmpCandidate.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestDistSq) {
                bestDistSq = d2;
                this.tmpBestCandidate.copy(this.tmpCandidate);
                bestNormal.copy(this.tmpFireAxis);
            }
        }

        // Make local +Y point away from the surface so flame bottom touches the surface
        // and flame top extends outward from it.
        const halfHeight = 0.5 * 0.31 * Math.max(0.0001, flame.scale.y);
        p.copy(this.tmpBestCandidate).addScaledVector(bestNormal, halfHeight + padding);
        this.tmpFireQuat.setFromUnitVectors(this.tmpAxisY, bestNormal);
        flame.quaternion.copy(this.tmpFireQuat);
        return bestNormal;
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
        const halfHeight = 0.5 * 0.31 * Math.max(0.0001, flame.scale.y);
        p.copy(this.tmpBestCandidate).addScaledVector(this.tmpSurfaceNormal, halfHeight + padding);
        this.tmpFireQuat.setFromUnitVectors(this.tmpAxisY, this.tmpSurfaceNormal);
        flame.quaternion.copy(this.tmpFireQuat);
        return this.tmpSurfaceNormal;
    }

    _buildPlayerModel() {
        const skinTex = this.textureLoader.load('assets/textures/mob/char.png');
        skinTex.colorSpace = THREE.SRGBColorSpace;
        skinTex.magFilter = THREE.NearestFilter;
        skinTex.minFilter = THREE.NearestFilter;
        skinTex.generateMipmaps = false;
        skinTex.wrapS = THREE.ClampToEdgeWrapping;
        skinTex.wrapT = THREE.ClampToEdgeWrapping;

        const mat = new THREE.MeshLambertMaterial({
            map: skinTex,
            transparent: true,
            alphaTest: 0.1
        });

        const root = new THREE.Group();
        root.visible = false;
        root.renderOrder = 4;
        this.scene.add(root);

        const headPivot = new THREE.Group();
        headPivot.position.set(0, 1.5, 0);
        root.add(headPivot);
        const head = new THREE.Mesh(
            makeSkinnedBoxGeometry(0.5, 0.5, 0.5, {
                right: [0, 8, 8, 16],
                left: [16, 8, 24, 16],
                top: [8, 0, 16, 8],
                bottom: [16, 0, 24, 8],
                front: [8, 8, 16, 16],
                back: [24, 8, 32, 16]
            }),
            mat
        );
        head.position.set(0, 0.25, 0);
        headPivot.add(head);

        const body = new THREE.Mesh(
            makeSkinnedBoxGeometry(0.5, 0.75, 0.25, {
                right: [16, 20, 20, 32],
                left: [28, 20, 32, 32],
                top: [20, 16, 28, 20],
                bottom: [28, 16, 36, 20],
                front: [20, 20, 28, 32],
                back: [32, 20, 40, 32]
            }),
            mat
        );
        body.position.set(0, 1.125, 0);
        root.add(body);

        const armFaces = {
            right: [40, 20, 44, 32],
            left: [48, 20, 52, 32],
            top: [44, 16, 48, 20],
            bottom: [48, 16, 52, 20],
            front: [44, 20, 48, 32],
            back: [52, 20, 56, 32]
        };
        const makeArm = (faces) => new THREE.Mesh(
            makeSkinnedBoxGeometry(0.25, 0.75, 0.25, faces),
            mat
        );

        const rightArmPivot = new THREE.Group();
        rightArmPivot.position.set(-0.375, 1.5, 0);
        root.add(rightArmPivot);
        const rightArm = makeArm(armFaces);
        rightArm.position.set(0, -0.375, 0);
        rightArmPivot.add(rightArm);

        const leftArmPivot = new THREE.Group();
        leftArmPivot.position.set(0.375, 1.5, 0);
        root.add(leftArmPivot);
        const leftArm = makeArm(mirrorFacesX(armFaces));
        leftArm.position.set(0, -0.375, 0);
        leftArmPivot.add(leftArm);

        const legFaces = {
            right: [0, 20, 4, 32],
            left: [8, 20, 12, 32],
            top: [4, 16, 8, 20],
            bottom: [8, 16, 12, 20],
            front: [4, 20, 8, 32],
            back: [12, 20, 16, 32]
        };
        const makeLeg = (faces) => new THREE.Mesh(
            makeSkinnedBoxGeometry(0.25, 0.75, 0.25, faces),
            mat
        );

        const rightLegPivot = new THREE.Group();
        rightLegPivot.position.set(-0.125, 0.75, 0);
        root.add(rightLegPivot);
        const rightLeg = makeLeg(legFaces);
        rightLeg.position.set(0, -0.375, 0);
        rightLegPivot.add(rightLeg);

        const leftLegPivot = new THREE.Group();
        leftLegPivot.position.set(0.125, 0.75, 0);
        root.add(leftLegPivot);
        const leftLeg = makeLeg(mirrorFacesX(legFaces));
        leftLeg.position.set(0, -0.375, 0);
        leftLegPivot.add(leftLeg);

        const fireTex = new THREE.CanvasTexture(getFireAnimationCanvas());
        fireTex.colorSpace = THREE.SRGBColorSpace;
        fireTex.magFilter = THREE.NearestFilter;
        fireTex.minFilter = THREE.NearestFilter;
        fireTex.generateMipmaps = false;
        fireTex.wrapS = THREE.ClampToEdgeWrapping;
        fireTex.wrapT = THREE.ClampToEdgeWrapping;
        const fireMat = new THREE.MeshBasicMaterial({
            map: fireTex,
            transparent: true,
            alphaTest: 0.01,
            depthWrite: false,
            depthTest: false,
            side: THREE.FrontSide,
            opacity: PLAYER_FIRE_ALPHA_BASE
        });
        const fireGroup = new THREE.Group();
        fireGroup.visible = false;
        fireGroup.position.set(0, 0.0, 0);
        // Keep flame size capped to ~1/3 of the previous effect.
        const firePlaneGeom = new THREE.PlaneGeometry(FIRE_PLANE_WIDTH, FIRE_PLANE_HEIGHT);
        const planes = [];
        for (let i = 0; i < PLAYER_FIRE_PLANE_COUNT; i++) {
            const flame = new THREE.Mesh(firePlaneGeom, fireMat);
            const partIndex = i % FIRE_SURFACE_PARTS.length;
            const part = FIRE_SURFACE_PARTS[partIndex];
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

        for (const child of root.children) {
            child.traverse((obj) => {
                if (!obj.isMesh) return;
                obj.castShadow = true;
                obj.receiveShadow = true;
            });
        }

        this.playerRoot = root;
        this.headPivot = headPivot;
        this.leftArmPivot = leftArmPivot;
        this.rightArmPivot = rightArmPivot;
        this.leftLegPivot = leftLegPivot;
        this.rightLegPivot = rightLegPivot;
        this.playerFireGroup = fireGroup;
        this.playerFireMaterial = fireMat;
        this.playerFirePlanes = planes;
    }

    cycleMode() {
        this.mode = (this.mode + 1) % 3;
        return this.mode;
    }

    getModeName() {
        if (this.mode === CAMERA_MODE_THIRD_PERSON_BACK) return 'THIRD_BACK';
        if (this.mode === CAMERA_MODE_THIRD_PERSON_FRONT) return 'THIRD_FRONT';
        return 'FIRST';
    }

    isThirdPerson() {
        return this.mode !== CAMERA_MODE_FIRST_PERSON;
    }

    setActive(active) {
        if (this.playerRoot) this.playerRoot.visible = !!active && this.isThirdPerson();
    }

    setBurning(burning) {
        this.burning = !!burning;
    }

    _isBlockedPoint(x, y, z) {
        const checks = [
            [0, 0, 0],
            [CAMERA_COLLISION_RADIUS, 0, 0],
            [-CAMERA_COLLISION_RADIUS, 0, 0],
            [0, CAMERA_COLLISION_RADIUS, 0],
            [0, -CAMERA_COLLISION_RADIUS, 0],
            [0, 0, CAMERA_COLLISION_RADIUS],
            [0, 0, -CAMERA_COLLISION_RADIUS]
        ];
        for (const c of checks) {
            const bx = Math.floor(x + c[0]);
            const by = Math.floor(y + c[1]);
            const bz = Math.floor(z + c[2]);
            const id = this.chunkManager.getBlock(bx, by, bz);
            if (isCameraSolidBlock(id)) return true;
        }
        return false;
    }

    _clampCamera(anchor, desired) {
        const dx = desired.x - anchor.x;
        const dy = desired.y - anchor.y;
        const dz = desired.z - anchor.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= 0.0001) return this.tmpActual.copy(anchor);

        const inv = 1 / dist;
        const dirX = dx * inv;
        const dirY = dy * inv;
        const dirZ = dz * inv;

        let allowedDist = dist;
        // Jacobo-like multi-probe camera clipping: sample nearby offsets and take the minimum unobstructed distance.
        for (let i = 0; i < 8; i++) {
            const ox = (((i & 1) ? 1 : -1) * 0.1);
            const oy = ((((i >> 1) & 1) ? 1 : -1) * 0.1);
            const oz = ((((i >> 2) & 1) ? 1 : -1) * 0.1);
            const sample = this._traceUnobstructedDistance(anchor, dirX, dirY, dirZ, dist, ox, oy, oz);
            if (sample < allowedDist) allowedDist = sample;
        }

        this.tmpDir.set(dirX, dirY, dirZ);
        this.tmpActual.copy(anchor).addScaledVector(this.tmpDir, Math.max(0, allowedDist));
        return this.tmpActual;
    }

    _traceUnobstructedDistance(anchor, dirX, dirY, dirZ, maxDist, offX, offY, offZ) {
        const ox = anchor.x + offX;
        const oy = anchor.y + offY;
        const oz = anchor.z + offZ;
        let t = 0;
        while (t <= maxDist) {
            const sx = ox + dirX * t;
            const sy = oy + dirY * t;
            const sz = oz + dirZ * t;
            if (this._isBlockedPoint(sx, sy, sz)) {
                return Math.max(0, t - BETA_CAMERA_TRACE_STEP);
            }
            t += BETA_CAMERA_TRACE_STEP;
        }
        return maxDist;
    }

    updatePose(dt, eyePos, eyeRot, velocity, crouching, playerHeight, playerEyeHeight, bowDraw01 = 0) {
        this.lastEyePos.copy(eyePos);
        this.lastEyeRot.copy(eyeRot);

        if (!this.playerRoot) return;

        const feetY = (eyePos.y + (playerHeight - playerEyeHeight)) - playerHeight;
        this.playerRoot.position.set(eyePos.x, feetY, eyePos.z);
        this.playerRoot.rotation.set(0, eyeRot.y, 0);

        if (crouching) {
            this.playerRoot.position.y -= 0.125;
            this.playerRoot.rotation.x = 0.08;
        } else {
            this.playerRoot.rotation.x = 0;
        }

        const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        const speed01 = Math.min(1.0, horizontalSpeed / PLAYER_WALK_SPEED_REF);
        if (horizontalSpeed > 0.0001) {
            this.walkPhase += horizontalSpeed * dt * LIMB_SWING_FREQ;
        }

        const armSwing = Math.cos(this.walkPhase * 0.6662 + Math.PI) * speed01 * ARM_SWING_SCALE;
        const armSwingOpp = Math.cos(this.walkPhase * 0.6662) * speed01 * ARM_SWING_SCALE;
        const legSwing = Math.cos(this.walkPhase * 0.6662) * speed01 * LEG_SWING_SCALE;
        const legSwingOpp = Math.cos(this.walkPhase * 0.6662 + Math.PI) * speed01 * LEG_SWING_SCALE;
        const k = Math.min(1.0, dt * LIMB_ROTATION_DAMP);

        this.rightArmPivot.rotation.x += (armSwing - this.rightArmPivot.rotation.x) * k;
        this.leftArmPivot.rotation.x += (armSwingOpp - this.leftArmPivot.rotation.x) * k;
        this.rightLegPivot.rotation.x += (legSwing - this.rightLegPivot.rotation.x) * k;
        this.leftLegPivot.rotation.x += (legSwingOpp - this.leftLegPivot.rotation.x) * k;

        const draw = Math.max(0, Math.min(1, Number(bowDraw01) || 0));
        if (draw > 0) {
            // Beta-like third-person bow pose approximation.
            const targetRight = -1.05 - draw * 0.45;
            const targetLeft = -0.25 - draw * 0.25;
            this.rightArmPivot.rotation.x += (targetRight - this.rightArmPivot.rotation.x) * Math.min(1.0, dt * 18.0);
            this.leftArmPivot.rotation.x += (targetLeft - this.leftArmPivot.rotation.x) * Math.min(1.0, dt * 14.0);
        }

        const headPitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, eyeRot.x));
        this.headPivot.rotation.set(headPitch, 0, 0);

        if (this.playerFireGroup) {
            this.playerFireGroup.visible = this.burning && this.isThirdPerson();
            if (this.playerFireMaterial) {
                const t = performance.now() * 0.01;
                this.playerFireMaterial.opacity = PLAYER_FIRE_ALPHA_BASE + Math.sin(t) * 0.08;
                if (this.playerFireMaterial.map) this.playerFireMaterial.map.needsUpdate = true;
            }
            if (this.playerFirePlanes && this.playerFirePlanes.length > 0) {
                const t2 = performance.now() * 0.004;
                for (let i = 0; i < this.playerFirePlanes.length; i++) {
                    const p = this.playerFirePlanes[i];
                    const phase = p.userData.firePhase || 0;
                    const part = FIRE_SURFACE_PARTS[(p.userData.partIndex || 0) % FIRE_SURFACE_PARTS.length];
                    // Random-walk motion over player surface (non-linear, non-orbital).
                    const noise = 0.014;
                    p.userData.jx = (p.userData.jx || 0) * 0.92 + (Math.random() * 2 - 1) * noise;
                    p.userData.jy = (p.userData.jy || 0) * 0.90 + (Math.random() * 2 - 1) * (noise * 0.7);
                    p.userData.jz = (p.userData.jz || 0) * 0.92 + (Math.random() * 2 - 1) * noise;
                    p.position.x += p.userData.jx;
                    p.position.y += p.userData.jy;
                    p.position.z += p.userData.jz;

                    // Keep candidate near assigned part so all parts always receive flames.
                    p.position.x = Math.max(part.cx - part.hx - 0.08, Math.min(part.cx + part.hx + 0.08, p.position.x));
                    p.position.y = Math.max(part.cy - part.hy - 0.08, Math.min(part.cy + part.hy + 0.08, p.position.y));
                    p.position.z = Math.max(part.cz - part.hz - 0.08, Math.min(part.cz + part.hz + 0.08, p.position.z));

                    this._alignFlameToPartSurface(p, part, 0.03);
                }
            }
        }
    }

    applyRenderCamera(camera, renderEyePos) {
        if (!this.playerRoot) return;

        const isThird = this.isThirdPerson();
        this.playerRoot.visible = isThird;
        if (this.playerFireGroup) this.playerFireGroup.visible = this.burning && isThird;
        if (!isThird) {
            camera.position.copy(renderEyePos);
            camera.rotation.copy(this.lastEyeRot);
            return;
        }

        camera.position.copy(renderEyePos);
        camera.rotation.copy(this.lastEyeRot);
        camera.getWorldDirection(this.tmpForward);
        this.tmpAnchor.copy(renderEyePos);
        this.tmpAnchor.y += CAMERA_VERTICAL_OFFSET;

        const dist = (this.mode === CAMERA_MODE_THIRD_PERSON_FRONT) ? CAMERA_DISTANCE_FRONT : CAMERA_DISTANCE_BACK;
        const sign = (this.mode === CAMERA_MODE_THIRD_PERSON_FRONT) ? 1 : -1;
        this.tmpDesired.copy(this.tmpAnchor).addScaledVector(this.tmpForward, dist * sign);
        const clamped = this._clampCamera(this.tmpAnchor, this.tmpDesired);

        camera.position.copy(clamped);
        this.tmpLook.copy(this.tmpAnchor);
        const dx = this.tmpLook.x - camera.position.x;
        const dy = this.tmpLook.y - camera.position.y;
        const dz = this.tmpLook.z - camera.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 1e-6) {
            // Degenerate look-at when camera is forced into player anchor (tight shafts/walls):
            // keep camera orientation synced to player view so rotation never appears stuck.
            camera.rotation.copy(this.lastEyeRot);
        } else {
            camera.lookAt(this.tmpLook);
        }
    }
}
