import * as THREE from 'three';
import { materials } from './world.js';
import { getRuntimeBlockDef, isObsidianId, isTntId } from './blocks.js';

const TICK_SECONDS = 1 / 20;
const DEFAULT_FUSE_TICKS = 80;
const EXPLOSION_RADIUS = 4.0;
const EXPLOSION_RAY_GRID = 16;
const EXPLOSION_STEP = 0.3;
const TNT_RENDER_ID = 91;
const BEDROCK_ID = 8;
const AIR_IDS = new Set([0, 6, 70, 51, 71, 63]);

function cloneBlockMaterial(id) {
    const base = materials[id];
    if (!base) return null;
    if (Array.isArray(base)) {
        return base.map((m) => {
            const clone = m.clone();
            clone.transparent = !!m.transparent;
            clone.vertexColors = false;
            if (clone.color) clone.color.setScalar(1.0);
            clone.needsUpdate = true;
            return clone;
        });
    }
    const clone = base.clone();
    clone.transparent = !!base.transparent;
    clone.vertexColors = false;
    if (clone.color) clone.color.setScalar(1.0);
    clone.needsUpdate = true;
    return clone;
}

function setMaterialColor(mat, scalar) {
    if (!mat) return;
    if (Array.isArray(mat)) {
        for (const m of mat) {
            if (m && m.color) m.color.setScalar(scalar);
        }
        return;
    }
    if (mat.color) mat.color.setScalar(scalar);
}

function getBlockResistance(id) {
    if (!id || id === 0) return 0;
    if (id === BEDROCK_ID) return Infinity;
    if (isObsidianId(id)) return 6000;
    if (isTntId(id)) return 0;
    const def = getRuntimeBlockDef(id);
    if (!def) return 1.0;
    const hardness = Number(def.hardness);
    if (!Number.isFinite(hardness) || hardness < 0) return 0;
    return hardness * 1.5 + 0.3;
}

function isDestroyableByExplosion(id) {
    if (!id || id === 0) return false;
    if (id === BEDROCK_ID) return false;
    return true;
}

export class TNTManager {
    constructor(scene, chunkManager, options = {}) {
        this.scene = scene;
        this.chunkManager = chunkManager;
        this.applyBlockChanges = typeof options.applyBlockChanges === 'function' ? options.applyBlockChanges : null;
        this.spawnDrop = typeof options.spawnDrop === 'function' ? options.spawnDrop : null;
        this.primed = [];
        this.flashes = [];
        this._tmpVec = new THREE.Vector3();
    }

    clear() {
        for (const p of this.primed) {
            this.scene.remove(p.group);
            p.group.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
            });
        }
        for (const f of this.flashes) {
            this.scene.remove(f.mesh);
            if (f.mesh.geometry) f.mesh.geometry.dispose();
            if (f.mesh.material) f.mesh.material.dispose();
        }
        this.primed.length = 0;
        this.flashes.length = 0;
    }

    hasPrimedAtBlock(x, y, z) {
        const bx = Math.floor(x);
        const by = Math.floor(y);
        const bz = Math.floor(z);
        for (const p of this.primed) {
            if (p.blockX === bx && p.blockY === by && p.blockZ === bz) return true;
        }
        return false;
    }

    createPrimedVisual() {
        const group = new THREE.Group();
        const baseMaterial = cloneBlockMaterial(TNT_RENDER_ID);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.98, 0.98), baseMaterial);
        body.castShadow = true;
        body.receiveShadow = false;
        group.add(body);

        const flash = new THREE.Mesh(
            new THREE.BoxGeometry(1.02, 1.02, 1.02),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.0,
                depthWrite: false
            })
        );
        flash.visible = false;
        group.add(flash);
        return { group, body, flash, baseMaterial };
    }

    spawnPrimedTNT(x, y, z, fuseTicks = DEFAULT_FUSE_TICKS) {
        if (this.hasPrimedAtBlock(x, y, z)) return false;
        const visual = this.createPrimedVisual();
        if (!visual.group) return false;
        visual.group.position.set(x + 0.5, y + 0.5, z + 0.5);

        const angle = Math.random() * Math.PI * 2;
        const velocity = new THREE.Vector3(
            -Math.sin(angle) * 0.02,
            0.2,
            -Math.cos(angle) * 0.02
        );

        this.scene.add(visual.group);
        this.primed.push({
            ...visual,
            blockX: Math.floor(x),
            blockY: Math.floor(y),
            blockZ: Math.floor(z),
            velocity,
            tickCarry: 0,
            fuseTicks: Math.max(1, Math.floor(fuseTicks)),
            smokeCarry: 0
        });
        return true;
    }

    igniteAt(x, y, z, fuseTicks = DEFAULT_FUSE_TICKS) {
        if (!isTntId(this.chunkManager.getBlock(x, y, z))) return false;
        if (!this.spawnPrimedTNT(x, y, z, fuseTicks)) return false;
        if (this.applyBlockChanges) {
            this.applyBlockChanges([{ x, y, z, id: 0, metadata: 0 }], { immediate: true });
        }
        return true;
    }

    igniteNeighbors(x, y, z) {
        const dirs = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];
        let ignited = false;
        for (const [dx, dy, dz] of dirs) {
            ignited = this.igniteAt(x + dx, y + dy, z + dz) || ignited;
        }
        return ignited;
    }

    spawnExplosionFlash(x, y, z, radius) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(0.6, radius * 0.45), 8, 8),
            new THREE.MeshBasicMaterial({
                color: 0xfff2c6,
                transparent: true,
                opacity: 0.55,
                depthWrite: false
            })
        );
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
        this.scene.add(mesh);
        this.flashes.push({ mesh, age: 0, life: 0.18, maxScale: radius * 1.35 });
    }

    explodeAt(x, y, z, radius = EXPLOSION_RADIUS) {
        const destroyed = this.collectExplosionBlocks(x + 0.5, y + 0.5, z + 0.5, radius);
        const changes = [];
        for (const posKey of destroyed) {
            const [sx, sy, sz] = posKey.split(',').map(Number);
            const id = this.chunkManager.getBlock(sx, sy, sz);
            if (!id || !isDestroyableByExplosion(id)) continue;
            if (isTntId(id)) {
                const shortFuse = Math.floor(Math.random() * (DEFAULT_FUSE_TICKS / 4)) + Math.floor(DEFAULT_FUSE_TICKS / 8);
                this.igniteAt(sx, sy, sz, shortFuse);
                continue;
            }
            if (this.spawnDrop && Math.random() < 0.3) {
                this.spawnDrop(sx, sy, sz, id, null, 0.1, null, { autoMagnet: true, kind: 'block' });
            }
            changes.push({ x: sx, y: sy, z: sz, id: 0, metadata: 0 });
        }
        if (changes.length > 0 && this.applyBlockChanges) {
            this.applyBlockChanges(changes, { immediate: true });
        }
        this.spawnExplosionFlash(x, y, z, radius);
    }

    collectExplosionBlocks(originX, originY, originZ, radius) {
        const destroyed = new Set();
        const edge = EXPLOSION_RAY_GRID - 1;
        for (let ix = 0; ix < EXPLOSION_RAY_GRID; ix++) {
            for (let iy = 0; iy < EXPLOSION_RAY_GRID; iy++) {
                for (let iz = 0; iz < EXPLOSION_RAY_GRID; iz++) {
                    if (ix !== 0 && ix !== edge && iy !== 0 && iy !== edge && iz !== 0 && iz !== edge) continue;
                    const dx = (ix / edge) * 2 - 1;
                    const dy = (iy / edge) * 2 - 1;
                    const dz = (iz / edge) * 2 - 1;
                    const len = Math.hypot(dx, dy, dz);
                    if (len < 1e-6) continue;
                    let dirX = dx / len;
                    let dirY = dy / len;
                    let dirZ = dz / len;
                    let power = radius * (0.7 + Math.random() * 0.6);
                    let px = originX;
                    let py = originY;
                    let pz = originZ;
                    while (power > 0) {
                        const bx = Math.floor(px);
                        const by = Math.floor(py);
                        const bz = Math.floor(pz);
                        const id = this.chunkManager.getBlock(bx, by, bz);
                        if (id && id !== 0) {
                            const resistance = getBlockResistance(id);
                            if (Number.isFinite(resistance)) {
                                power -= (resistance + 0.3) * EXPLOSION_STEP;
                            } else {
                                power = -1;
                            }
                            if (power > 0 && isDestroyableByExplosion(id)) {
                                destroyed.add(`${bx},${by},${bz}`);
                            }
                        }
                        px += dirX * EXPLOSION_STEP;
                        py += dirY * EXPLOSION_STEP;
                        pz += dirZ * EXPLOSION_STEP;
                        power -= EXPLOSION_STEP * 0.75;
                    }
                }
            }
        }
        return destroyed;
    }

    tickPrimedEntity(entity) {
        entity.velocity.y -= 0.04;
        entity.group.position.add(entity.velocity);
        entity.velocity.multiplyScalar(0.98);

        const floorX = Math.floor(entity.group.position.x);
        const floorYBelow = Math.floor(entity.group.position.y - 0.5);
        const floorZ = Math.floor(entity.group.position.z);
        const belowId = this.chunkManager.getBlock(floorX, floorYBelow, floorZ);
        if (!AIR_IDS.has(belowId) && entity.velocity.y < 0) {
            entity.group.position.y = floorYBelow + 1.0;
            entity.velocity.x *= 0.7;
            entity.velocity.z *= 0.7;
            entity.velocity.y *= -0.5;
        }

        entity.fuseTicks -= 1;
        if (entity.fuseTicks <= 0) {
            this.scene.remove(entity.group);
            entity.group.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
            });
            this.explodeAt(
                Math.floor(entity.group.position.x),
                Math.floor(entity.group.position.y),
                Math.floor(entity.group.position.z),
                EXPLOSION_RADIUS
            );
            return false;
        }

        const fuseNorm = Math.max(0, Math.min(1, 1 - (entity.fuseTicks / 10)));
        const scale = 1 + Math.pow(fuseNorm, 4) * 0.3;
        entity.body.scale.setScalar(scale);
        const flashOn = Math.floor(entity.fuseTicks / 5) % 2 === 0;
        entity.flash.visible = flashOn;
        entity.flash.material.opacity = flashOn ? 0.28 : 0.0;
        setMaterialColor(entity.baseMaterial, flashOn ? 1.2 : 1.0);
        return true;
    }

    update(dt) {
        for (let i = this.primed.length - 1; i >= 0; i--) {
            const entity = this.primed[i];
            entity.tickCarry += dt;
            let keep = true;
            while (keep && entity.tickCarry >= TICK_SECONDS) {
                entity.tickCarry -= TICK_SECONDS;
                keep = this.tickPrimedEntity(entity);
            }
            if (!keep) {
                this.primed.splice(i, 1);
            }
        }

        for (let i = this.flashes.length - 1; i >= 0; i--) {
            const flash = this.flashes[i];
            flash.age += dt;
            const t = Math.min(1, flash.age / flash.life);
            const scale = 1 + (flash.maxScale - 1) * t;
            flash.mesh.scale.setScalar(scale);
            flash.mesh.material.opacity = Math.max(0, 0.55 * (1 - t));
            if (flash.age >= flash.life) {
                this.scene.remove(flash.mesh);
                if (flash.mesh.geometry) flash.mesh.geometry.dispose();
                if (flash.mesh.material) flash.mesh.material.dispose();
                this.flashes.splice(i, 1);
            }
        }
    }
}
