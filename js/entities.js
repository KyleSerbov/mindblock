// js/entities.js
import * as THREE from 'three';
import { materials, BLOCKS, createWoolDisplayMaterial, createItemDisplayMaterial } from './world.js';
import { inventory, getItemStackKind } from './inventory.js';
import { refreshHotbar } from './ui.js';
import { MAX_LIGHT, PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS } from './constants.js';
import { getInventoryDef, getItemDef, getPlaceableBlockDef, isBlockOpaque, isChestId, isRailId, isTorchId, isWoolId } from './blocks.js';
import { FLAT_DROP_SIZE } from './flatEntityRenderConfig.js';
import { getTerrainData } from './terrain.js';
import { getGrassColor, getFoliageColor, unpackRgb } from './colorizers.js';
import { WORLD_FACES, TRANSPORT_PART_ORDER, TRANSPORT_MODEL_BOUNDS, TRANSPORT_FACE_DEFAULTS, TRANSPORT_MODEL_BOXES, TRANSPORT_TEXTURE_PATHS, getTransportTypeKey } from './transportRenderConfig.js';
const UV_CORNER_ROT = [
    [0, 1, 2, 3],
    [1, 2, 3, 0],
    [2, 3, 0, 1],
    [3, 0, 1, 2]
];
const MODEL_BOX_UV_BASE = [1, 0, 3, 2];
const transportTextureLoader = new THREE.TextureLoader();
const transportMaterialCache = new Map();
const MINECART_MODEL_YAW_OFFSET = Math.PI * 0.5;
const BOAT_MODEL_YAW_OFFSET = Math.PI * 0.5;
const JACOBO_WALK_SPEED = 4.317;
const JACOBO_BOAT_SPEED = 8.0;
const JACOBO_MINECART_SPEED_CAP = 8.0;
const JACOBO_POWERED_RAIL_BOOST = 0.06;
const JACOBO_POWERED_RAIL_KICK = 0.02;
const JACOBO_MINECART_SLOPE_PUSH = 0.0078125;
const OUR_WALK_SPEED = 8.0;
const TRANSPORT_SPEED_SCALE = OUR_WALK_SPEED / JACOBO_WALK_SPEED;
const BOAT_SPEED_SCALE = JACOBO_BOAT_SPEED / JACOBO_WALK_SPEED;
const BOAT_SPEED_CAP = OUR_WALK_SPEED * BOAT_SPEED_SCALE;
const BOAT_ACCEL = 8.5 * (BOAT_SPEED_CAP / 4.8);
const MINECART_RAIL_SPEED_CAP = JACOBO_MINECART_SPEED_CAP * TRANSPORT_SPEED_SCALE;
const MINECART_OFFRAIL_SPEED_CAP = JACOBO_MINECART_SPEED_CAP * TRANSPORT_SPEED_SCALE;
const MINECART_POWERED_RAIL_BOOST = JACOBO_POWERED_RAIL_BOOST * TRANSPORT_SPEED_SCALE;
const MINECART_POWERED_RAIL_KICK = JACOBO_POWERED_RAIL_KICK * TRANSPORT_SPEED_SCALE;
const MINECART_SLOPE_PUSH = JACOBO_MINECART_SLOPE_PUSH * TRANSPORT_SPEED_SCALE;
const MINECART_HALF_HEIGHT = 0.5;
const MINECART_HALF_LENGTH_FOR_PITCH = 0.48;
const MINECART_SLOPE_CLEARANCE_BIAS = 0.6;

function getTransportFaceVertsFromBounds(bounds, face) {
    const minX = bounds.minX, maxX = bounds.maxX;
    const minY = bounds.minY, maxY = bounds.maxY;
    const minZ = bounds.minZ, maxZ = bounds.maxZ;
    if (face === 'east') return [[ maxX,minY, maxZ],[ maxX,minY,minZ],[ maxX,maxY,minZ],[ maxX,maxY, maxZ]];
    if (face === 'west') return [[minX,minY,minZ],[minX,minY, maxZ],[minX,maxY, maxZ],[minX,maxY,minZ]];
    if (face === 'top') return [[minX,maxY, maxZ],[ maxX,maxY, maxZ],[ maxX,maxY,minZ],[minX,maxY,minZ]];
    if (face === 'bottom') return [[minX,minY,minZ],[ maxX,minY,minZ],[ maxX,minY, maxZ],[minX,minY, maxZ]];
    if (face === 'south') return [[minX,minY, maxZ],[ maxX,minY, maxZ],[ maxX,maxY, maxZ],[minX,maxY, maxZ]];
    return [[ maxX,minY,minZ],[minX,minY,minZ],[minX,maxY,minZ],[ maxX,maxY,minZ]];
}

function rotateTransportPoint(point, rotX = 0, rotY = 0, rotZ = 0) {
    let [x, y, z] = point;
    if (rotZ) {
        const c = Math.cos(rotZ), s = Math.sin(rotZ);
        const nx = x * c - y * s;
        const ny = x * s + y * c;
        x = nx; y = ny;
    }
    if (rotY) {
        const c = Math.cos(rotY), s = Math.sin(rotY);
        const nx = x * c + z * s;
        const nz = -x * s + z * c;
        x = nx; z = nz;
    }
    if (rotX) {
        const c = Math.cos(rotX), s = Math.sin(rotX);
        const ny = y * c - z * s;
        const nz = y * s + z * c;
        y = ny; z = nz;
    }
    return [x, y, z];
}

function appendTransportFaceToBuffers(verts, faceConfig, positions, normals, uvs, indices) {
    const rotation = Number(faceConfig?.rotation || 0) & 3;
    const uOffset = Number(faceConfig?.uOffset || 0);
    const vOffset = Number(faceConfig?.vOffset || 0);
    const cornerMap = UV_CORNER_ROT[rotation];
    const v0 = verts[0], v1 = verts[1], v2 = verts[2];
    const lenU = Math.sqrt(
        Math.pow(v1[0] - v0[0], 2) +
        Math.pow(v1[1] - v0[1], 2) +
        Math.pow(v1[2] - v0[2], 2)
    );
    const lenV = Math.sqrt(
        Math.pow(v2[0] - v1[0], 2) +
        Math.pow(v2[1] - v1[1], 2) +
        Math.pow(v2[2] - v1[2], 2)
    );
    const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
    const isQuarterTurn = (rotation & 1) === 1;
    const spanU = Math.max(0, Math.min(1, isQuarterTurn ? lenV : lenU));
    const spanV = Math.max(0, Math.min(1, isQuarterTurn ? lenU : lenV));
    const u0 = clamp(uOffset, 0, Math.max(0, 1 - spanU));
    const v0t = clamp(vOffset, 0, Math.max(0, 1 - spanV));
    const u1 = u0 + spanU;
    const v1t = v0t + spanV;
    const uvCorners = [[u0, v0t], [u1, v0t], [u1, v1t], [u0, v1t]];
    const edgeA = new THREE.Vector3(v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]);
    const edgeB = new THREE.Vector3(v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]);
    const normal = new THREE.Vector3().crossVectors(edgeA, edgeB).normalize();
    const baseIndex = positions.length / 3;
    for (let i = 0; i < 4; i++) {
        const v = verts[i];
        positions.push(v[0], v[1], v[2]);
        normals.push(normal.x, normal.y, normal.z);
        const uv = uvCorners[cornerMap[i]];
        uvs.push(uv[0], 1 - uv[1]);
    }
    indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
}

function appendTransportModelFaceWithRect(verts, rect, faceConfig, positions, normals, uvs, indices) {
    const rotation = Number(faceConfig?.rotation || 0) & 3;
    const uOffset = Number(faceConfig?.uOffset || 0);
    const vOffset = Number(faceConfig?.vOffset || 0);
    const cornerMap = UV_CORNER_ROT[rotation].map((index) => MODEL_BOX_UV_BASE[index]);
    const [u0px, v0px, u1px, v1px] = rect;
    const insetU = 0.0015625;
    const insetV = 0.003125;
    const uSpan = (u1px - u0px) / 64;
    const vSpan = (v1px - v0px) / 32;
    const uu0 = (u0px / 64) + insetU + uOffset * uSpan;
    const vv0 = (v0px / 32) + insetV + vOffset * vSpan;
    const uu1 = (u1px / 64) - insetU + uOffset * uSpan;
    const vv1 = (v1px / 32) - insetV + vOffset * vSpan;
    const uvCorners = [[uu0, vv0], [uu1, vv0], [uu1, vv1], [uu0, vv1]];
    const edgeA = new THREE.Vector3(verts[1][0] - verts[0][0], verts[1][1] - verts[0][1], verts[1][2] - verts[0][2]);
    const edgeB = new THREE.Vector3(verts[2][0] - verts[1][0], verts[2][1] - verts[1][1], verts[2][2] - verts[1][2]);
    const normal = new THREE.Vector3().crossVectors(edgeA, edgeB).normalize();
    const baseIndex = positions.length / 3;
    for (let i = 0; i < 4; i++) {
        const v = verts[i];
        positions.push(v[0], v[1], v[2]);
        normals.push(normal.x, normal.y, normal.z);
        const uv = uvCorners[cornerMap[i]];
        uvs.push(uv[0], 1 - uv[1]);
    }
    indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2, baseIndex + 2, baseIndex + 3, baseIndex + 0);
}

function appendMinecraftTransportModelBox(box, faceDefaults, positions, normals, uvs, indices, modelFlipFn = null) {
    const uvDx = Number(box.uvDx || box.dx || 0);
    const uvDy = Number(box.uvDy || box.dy || 0);
    const uvDz = Number(box.uvDz || box.dz || 0);
    const x1 = box.x;
    const y1 = box.y;
    const z1 = box.z;
    const x2 = box.x + box.dx;
    const y2 = box.y + box.dy;
    const z2 = box.z + box.dz;
    const verts = {
        v20: [x1, y1, z1],
        v12: [x2, y1, z1],
        v13: [x2, y2, z1],
        v14: [x1, y2, z1],
        v15: [x1, y1, z2],
        v16: [x2, y1, z2],
        v17: [x2, y2, z2],
        v18: [x1, y2, z2]
    };
    const faces = [
        { face: 'east', verts: [verts.v16, verts.v12, verts.v13, verts.v17], rect: [box.textureOffsetX + uvDz + uvDx, box.textureOffsetY + uvDz, box.textureOffsetX + uvDz + uvDx + uvDz, box.textureOffsetY + uvDz + uvDy] },
        { face: 'west', verts: [verts.v20, verts.v15, verts.v18, verts.v14], rect: [box.textureOffsetX + 0, box.textureOffsetY + uvDz, box.textureOffsetX + uvDz, box.textureOffsetY + uvDz + uvDy] },
        { face: 'bottom', verts: [verts.v16, verts.v15, verts.v20, verts.v12], rect: [box.textureOffsetX + uvDz, box.textureOffsetY + 0, box.textureOffsetX + uvDz + uvDx, box.textureOffsetY + uvDz] },
        { face: 'top', verts: [verts.v13, verts.v14, verts.v18, verts.v17], rect: [box.textureOffsetX + uvDz + uvDx, box.textureOffsetY + 0, box.textureOffsetX + uvDz + uvDx + uvDx, box.textureOffsetY + uvDz] },
        { face: 'north', verts: [verts.v12, verts.v20, verts.v14, verts.v13], rect: [box.textureOffsetX + uvDz, box.textureOffsetY + uvDz, box.textureOffsetX + uvDz + uvDx, box.textureOffsetY + uvDz + uvDy] },
        { face: 'south', verts: [verts.v15, verts.v16, verts.v17, verts.v18], rect: [box.textureOffsetX + uvDz + uvDx + uvDz, box.textureOffsetY + uvDz, box.textureOffsetX + uvDz + uvDx + uvDz + uvDx, box.textureOffsetY + uvDz + uvDy] }
    ];
    const omitFaceSet = new Set(Array.isArray(box.omitFaces) ? box.omitFaces : []);
    for (const entry of faces) {
        if (omitFaceSet.has(entry.face)) continue;
        const transformed = entry.verts.map((v) => {
            let p = rotateTransportPoint(v, box.rotateAngleX || 0, box.rotateAngleY || 0, box.rotateAngleZ || 0);
            p = [p[0] + (box.rotationPointX || 0), p[1] + (box.rotationPointY || 0), p[2] + (box.rotationPointZ || 0)];
            p = [p[0] / 16, p[1] / 16, p[2] / 16];
            return modelFlipFn ? modelFlipFn(p) : p;
        });
        appendTransportModelFaceWithRect(transformed, entry.rect, faceDefaults[`${box.part}_${entry.face}`], positions, normals, uvs, indices);
    }
}

function buildTransportGeometry(type) {
    const typeKey = getTransportTypeKey(type);
    const faceDefaults = TRANSPORT_FACE_DEFAULTS[typeKey] || {};
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const modelBoxes = TRANSPORT_MODEL_BOXES[typeKey];
    if (Array.isArray(modelBoxes) && modelBoxes.length > 0) {
        const modelFlipFn = (typeKey === '259' || typeKey === '260')
            ? ((p) => ([-p[0], -p[1], p[2]]))
            : null;
        for (const box of modelBoxes) {
            appendMinecraftTransportModelBox(box, faceDefaults, positions, normals, uvs, indices, modelFlipFn);
        }
    } else {
        const parts = TRANSPORT_MODEL_BOUNDS[typeKey];
        for (const partName of TRANSPORT_PART_ORDER) {
            const bounds = parts?.[partName];
            if (!bounds) continue;
            for (const face of WORLD_FACES) {
                const verts = getTransportFaceVertsFromBounds(bounds, face);
                const faceKey = `${partName}_${face}`;
                appendTransportFaceToBuffers(verts, faceDefaults[faceKey], positions, normals, uvs, indices);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}

function createTransportMaterial(type) {
    const typeKey = getTransportTypeKey(type);
    const blockId = Number(typeKey);
    const source = materials[blockId];
    if (source && !Array.isArray(source) && source.isMaterial) {
        const mat = source.clone();
        if (source.map) mat.map = source.map;
        mat.color = new THREE.Color(0xffffff);
        return mat;
    }
    const texturePath = TRANSPORT_TEXTURE_PATHS[typeKey];
    if (texturePath) {
        let cached = transportMaterialCache.get(typeKey);
        if (!cached) {
            const normalizedPath = String(texturePath).startsWith('assets/textures/')
                ? String(texturePath)
                : `assets/textures/${String(texturePath).replace(/^\/+/, '')}`;
            const tex = transportTextureLoader.load(normalizedPath);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            cached = new THREE.MeshLambertMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.1,
                side: THREE.DoubleSide
            });
            transportMaterialCache.set(typeKey, cached);
        }
        return cached.clone();
    }
    return new THREE.MeshLambertMaterial({
        color: type === 'boat' ? 0x8a5a2b : 0x9ea7b3
    });
}

const FALL_FACE_BASIS = [
    { n: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(0, 0, 1) },   // +X
    { n: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(0, 0, -1) },  // -X
    { n: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) },   // +Y
    { n: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },   // -Y
    { n: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },    // +Z
    { n: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, 1, 0) }   // -Z
];

export class EntityManager {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.drops = [];
        this.fallingBlocks = [];
        this.transports = [];
        this.nextTransportId = 1;
        this.mountedTransportId = null;
        this.placeFallingBlock = typeof options.placeFallingBlock === 'function' ? options.placeFallingBlock : null;
        this.tmpToPlayer = new THREE.Vector3();
        this.tmpVehicleDir = new THREE.Vector3();
        this.tmpVehicleCandidate = new THREE.Vector3();
        this.tmpCurrent = new THREE.Vector3();
        this.dropTintCache = new Map();
    }

    static get MINECART_RAIL_SAMPLE_OFFSET() { return 0.35; }
    static get MINECART_RAIL_CENTER_OFFSET() { return 0.00; }

    getColumnDropTint(wx, wz, foliage = false) {
        const key = `${wx},${wz},${foliage ? 'f' : 'g'}`;
        const cached = this.dropTintCache.get(key);
        if (cached) return cached;
        const terrain = getTerrainData(wx, wz);
        const temp = Number.isFinite(terrain?.temperature) ? terrain.temperature : terrain?.temp;
        const humidity = Number.isFinite(terrain?.humidity) ? terrain.humidity : 1;
        const rgb = foliage
            ? getFoliageColor(Number.isFinite(temp) ? temp : 0.5, humidity)
            : getGrassColor(Number.isFinite(temp) ? temp : 0.5, humidity);
        const tint = unpackRgb(rgb);
        this.dropTintCache.set(key, tint);
        return tint;
    }

    getDropTint(drop, physPos) {
        if (!drop) return null;
        const id = Number(drop.id) | 0;
        if (id !== 1 && id !== 31 && id !== 5) return null;
        if (!physPos) return null;
        if (id === 1 || id === 31) {
            return this.getColumnDropTint(Math.floor(physPos.x), Math.floor(physPos.z), false);
        }
        const meta = Number(drop.metadata) & 15;
        if (meta === 1 || meta === 9) return { r: 97 / 255, g: 153 / 255, b: 97 / 255 }; // spruce leaves
        if (meta === 2 || meta === 10) return { r: 128 / 255, g: 167 / 255, b: 85 / 255 }; // birch leaves
        return this.getColumnDropTint(Math.floor(physPos.x), Math.floor(physPos.z), true);
    }

    // Updated signature to accept durability
    spawnDrop(x, y, z, blockId, velocity = null, delay = 0.5, durability = null, options = null) {
        if (!blockId || blockId === 0) return;
        const metadata = options && Number.isFinite(Number(options.metadata)) ? (Number(options.metadata) & 15) : 0;
        let stackKind = getItemStackKind(blockId, options && options.kind);
        const optKind = options && options.kind;
        const blockDefForAmbiguous = getPlaceableBlockDef(blockId);
        const itemDefForAmbiguous = getItemDef(blockId);
        if (
            optKind == null &&
            blockDefForAmbiguous &&
            itemDefForAmbiguous &&
            typeof itemDefForAmbiguous.name === 'string' &&
            /\s*\(beta id\)\s*$/i.test(itemDefForAmbiguous.name)
        ) {
            stackKind = 'block';
        }
        
        const blockDef = stackKind === 'block'
            ? getPlaceableBlockDef(blockId)
            : getItemDef(blockId) || getInventoryDef(blockId, 'item');
        const isItem = stackKind === 'item';
        const isCrossPlant = blockDef && blockDef.type === 'cross';
        const isFlatDrop = isItem || isCrossPlant;

        let geometry;
        if (!isItem && isTorchId(blockId)) {
            // Torch Geometry (2px wide, 10px high)
            geometry = new THREE.BoxGeometry(2/16, 10/16, 2/16);
            
            // CRITICAL FIX: Convert to non-indexed geometry to ensure we have unique vertices 
            // for every face (6 faces * 2 tris * 3 verts = 36 vertices).
            // This prevents UV mapping logic from breaking due to shared vertices in indexed geometry.
            geometry = geometry.toNonIndexed();

            const uvs = geometry.attributes.uv;
            // Face order in Non-Indexed BoxGeometry: 
            // 0:+x(Right), 1:-x(Left), 2:+y(Top), 3:-y(Bottom), 4:+z(Front), 5:-z(Back)
            const faceTypes = ['side', 'side', 'top', 'bottom', 'side', 'side'];
            
            // 1/16th unit size
            const P = 1/16; 
            
            // Texture Bounds (based on standard torch placement in 16x16 grid)
            // Assumes torch stick is centered horizontally (pixels 7-9) 
            // and sits at the bottom (pixels 0-10).
            const bounds = {
                // Side: Map to the 2x10 stick area
                side:   { u: [7*P, 9*P], v: [0, 10*P] },
                // Top: Map to the top cross-section (pixels 7-9 horizontal, 9-11 vertical)
                // Using a small offset from the very top of the stick to ensure it matches the flame color
                top:    { u: [7*P, 9*P], v: [9*P, 11*P] }, 
                // Bottom: Map to bottom of stick
                bottom: { u: [7*P, 9*P], v: [0, 2*P] }     
            };

            for (let i = 0; i < uvs.count; i++) {
                const faceIdx = Math.floor(i / 6); 
                if (faceIdx >= 6) break;

                const type = faceTypes[faceIdx];
                const b = bounds[type];

                // Standard UVs are 0..1. 
                // We interpolate them into our specific texture bounds.
                const currentU = uvs.getX(i);
                const currentV = uvs.getY(i);

                const newU = b.u[0] + currentU * (b.u[1] - b.u[0]);
                const newV = b.v[0] + currentV * (b.v[1] - b.v[0]);

                uvs.setXY(i, newU, newV);
            }
            uvs.needsUpdate = true;

        } else if (isFlatDrop) {
            geometry = new THREE.PlaneGeometry(FLAT_DROP_SIZE, FLAT_DROP_SIZE);
        } else {
            // Reduced size by 30% (0.4 -> 0.28)
            geometry = new THREE.BoxGeometry(0.28, 0.28, 0.28);
        }

        let material;
        if (!isItem && isChestId(blockId)) {
            // Special handling for Chest Entity
            // materials[53] is [Front, Side, Top, LargeFront, LargeBack] (5 items)
            // BoxGeometry expects [Right, Left, Top, Bottom, Front, Back] (6 items)
            const m = materials[53];
            material = [
                m[1], // Right -> Side
                m[1], // Left -> Side
                m[2], // Top -> Top
                m[2], // Bottom -> Top
                m[0], // Front -> Small Front
                m[1]  // Back -> Side
            ];
        } else if (!isItem && isWoolId(blockId)) {
            material = createWoolDisplayMaterial(metadata);
        } else if (isItem) {
            material = createItemDisplayMaterial(blockId, metadata) || materials[blockId];
        } else {
            material = materials[blockId];
        }
        
        // Clone material and disable vertexColors
        if (Array.isArray(material)) {
            material = material.map(m => {
                const clone = m.clone();
                clone.vertexColors = false; 
                return clone;
            }); 
        } else {
            material = material.clone();
            material.vertexColors = false;

            if (isFlatDrop) {
                material.side = THREE.FrontSide;
                material.transparent = true;
                material.alphaTest = 0.5;
            }
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.userData = { physicsPos: new THREE.Vector3(x, y, z) }; 
        mesh.castShadow = true;
        this.scene.add(mesh);

        const vel = velocity || new THREE.Vector3(
            (Math.random() * 0.2) - 0.1,
            0.2,
            (Math.random() * 0.2) - 0.1
        );

        const drop = {
            mesh: mesh,
            id: blockId,
            metadata,
            kind: stackKind,
            velocity: vel,
            age: 0,
            isItem: isItem,
            isFlatDrop: isFlatDrop,
            pickupDelay: delay,
            durability: durability, // Store durability
            autoMagnet: !!(options && options.autoMagnet)
        };
        this.drops.push(drop);
        return drop;
    }

    removeDrop(drop) {
        if (!drop) return;
        const i = this.drops.indexOf(drop);
        if (i === -1) return;
        const d = this.drops[i];
        if (d.mesh) {
            this.scene.remove(d.mesh);
            if (d.mesh.geometry) d.mesh.geometry.dispose();
            if (Array.isArray(d.mesh.material)) {
                d.mesh.material.forEach(m => m && m.dispose && m.dispose());
            } else if (d.mesh.material) {
                d.mesh.material.dispose();
            }
        }
        this.drops.splice(i, 1);
    }

    faceFlatDropToPlayerPosition(drop, playerPos) {
        if (!playerPos) return;
        const pos = drop.mesh.userData.physicsPos;
        this.tmpToPlayer.set(playerPos.x - pos.x, 0, playerPos.z - pos.z);
        const lenSq = this.tmpToPlayer.lengthSq();
        if (lenSq <= 1.0e-8) return;
        const yaw = Math.atan2(this.tmpToPlayer.x, this.tmpToPlayer.z);
        drop.mesh.rotation.set(0, yaw, 0);
    }

    sampleShadedVertexAt(chunkManager, bx, by, bz, face, signU, signV) {
        const nx = face.n.x, ny = face.n.y, nz = face.n.z;
        const ux = face.u.x * signU, uy = face.u.y * signU, uz = face.u.z * signU;
        const vx = face.v.x * signV, vy = face.v.y * signV, vz = face.v.z * signV;

        const s1Opaque = this.isAOOccluder(chunkManager.getBlock(bx + nx + ux, by + ny + uy, bz + nz + uz));
        const s2Opaque = this.isAOOccluder(chunkManager.getBlock(bx + nx + vx, by + ny + vy, bz + nz + vz));
        const cOpaque = this.isAOOccluder(chunkManager.getBlock(bx + nx + ux + vx, by + ny + uy + vy, bz + nz + uz + vz));
        const aoVal = (s1Opaque && s2Opaque) ? 3 : ((s1Opaque ? 1 : 0) + (s2Opaque ? 1 : 0) + (cOpaque ? 1 : 0));

        const lp = chunkManager.getLight(bx + nx, by + ny, bz + nz);
        const ls1 = chunkManager.getLight(bx + nx + ux, by + ny + uy, bz + nz + uz);
        const ls2 = chunkManager.getLight(bx + nx + vx, by + ny + vy, bz + nz + vz);
        const lc = chunkManager.getLight(bx + nx + ux + vx, by + ny + uy + vy, bz + nz + uz + vz);
        const lightAvg = (lp + ls1 + ls2 + lc) / 4.0;

        const lightIntensity = Math.pow(Math.max(0, Math.min(MAX_LIGHT, lightAvg)) / MAX_LIGHT, 1.6);
        const aoFactor = 1.0 - (aoVal * 0.2);
        return Math.max(0.05, lightIntensity * aoFactor);
    }

    captureFallingAOSnapshot(chunkManager, bx, by, bz) {
        const temp = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
        const pos = temp.attributes.position;
        const factors = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
            const faceIdx = Math.floor(i / 6);
            const face = FALL_FACE_BASIS[faceIdx] || FALL_FACE_BASIS[0];
            const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
            const signU = (lx * face.u.x + ly * face.u.y + lz * face.u.z) >= 0 ? 1 : -1;
            const signV = (lx * face.v.x + ly * face.v.y + lz * face.v.z) >= 0 ? 1 : -1;
            // Snapshot source block's full vertex shade (AO + smooth light).
            factors[i] = this.sampleShadedVertexAt(chunkManager, bx, by, bz, face, signU, signV);
        }
        temp.dispose();
        return factors;
    }

    applyFallingAOSnapshot(entity) {
        const geom = entity.mesh.geometry;
        const col = geom && geom.attributes ? geom.attributes.color : null;
        const factors = entity.aoSnapshot;
        if (!col || !factors || factors.length !== col.count) return false;
        for (let i = 0; i < col.count; i++) {
            const shade = Math.max(0.05, Math.min(1.0, factors[i]));
            col.setXYZ(i, shade, shade, shade);
        }
        col.needsUpdate = true;
        return true;
    }

    spawnFallingBlock(x, y, z, blockId, metadata = 0, aoSnapshot = null) {
        if (!blockId || blockId === 0) return;
        const baseMat = materials[blockId];
        if (!baseMat) return;
        const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
        let material;
        if (Array.isArray(baseMat)) {
            material = baseMat.map(m => {
                const clone = m.clone();
                clone.vertexColors = true;
                clone.color.setScalar(1.0);
                clone.needsUpdate = true;
                return clone;
            });
        } else {
            material = baseMat.clone();
            material.vertexColors = true;
            material.color.setScalar(1.0);
            material.needsUpdate = true;
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.userData = { physicsPos: new THREE.Vector3(x, y, z) };
        this.scene.add(mesh);
        this.fallingBlocks.push({
            mesh,
            id: blockId,
            metadata,
            velocity: new THREE.Vector3(0, 0, 0),
            age: 0,
            startY: y,
            aoSnapshot: aoSnapshot && aoSnapshot.length === geometry.attributes.position.count ? aoSnapshot : null
        });
        mesh.rotation.set(0, 0, 0);
    }

    isFallingPassThroughId(id) {
        return id === 0 || id === 63 || id === 6 || id === 70 || id === 51 || id === 71;
    }

    isAOOccluder(id) {
        if (!id || id === 0) return false;
        if (this.isFallingPassThroughId(id)) return false;
        return isBlockOpaque(id);
    }

    sampleAOAt(chunkManager, bx, by, bz, face, signU, signV) {
        const nx = face.n.x, ny = face.n.y, nz = face.n.z;
        const ux = face.u.x * signU, uy = face.u.y * signU, uz = face.u.z * signU;
        const vx = face.v.x * signV, vy = face.v.y * signV, vz = face.v.z * signV;
        // Sample from the face-adjacent neighborhood (N+U, N+V, N+U+V),
        // not from the block center plane.
        const id1 = chunkManager.getBlock(bx + nx + ux, by + ny + uy, bz + nz + uz);
        const id2 = chunkManager.getBlock(bx + nx + vx, by + ny + vy, bz + nz + vz);
        const idc = chunkManager.getBlock(bx + nx + ux + vx, by + ny + uy + vy, bz + nz + uz + vz);
        const s1 = this.isAOOccluder(id1) ? 1 : 0;
        const s2 = this.isAOOccluder(id2) ? 1 : 0;
        const sc = this.isAOOccluder(idc) ? 1 : 0;
        const occ = (s1 && s2) ? 3 : (s1 + s2 + sc);
        // Approximate Beta-style corner darkening.
        if (occ === 0) return 1.0;
        if (occ === 1) return 0.78;
        if (occ === 2) return 0.56;
        return 0.38;
    }

    updateFallingBlockAO(entity, chunkManager, lightIntensity) {
        const geom = entity.mesh.geometry;
        const pos = geom.attributes.position;
        const col = geom.attributes.color;
        if (!pos || !col) return;
        const p = entity.mesh.userData.physicsPos;
        const bx = Math.floor(p.x);
        const by = Math.floor(p.y);
        const bz = Math.floor(p.z);

        for (let i = 0; i < pos.count; i++) {
            const faceIdx = Math.floor(i / 6);
            const face = FALL_FACE_BASIS[faceIdx] || FALL_FACE_BASIS[0];
            const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
            const signU = (lx * face.u.x + ly * face.u.y + lz * face.u.z) >= 0 ? 1 : -1;
            const signV = (lx * face.v.x + ly * face.v.y + lz * face.v.z) >= 0 ? 1 : -1;
            const ao = this.sampleAOAt(chunkManager, bx, by, bz, face, signU, signV);
            const shade = Math.max(0.06, Math.min(1.0, lightIntensity * ao));
            col.setXYZ(i, shade, shade, shade);
        }
        col.needsUpdate = true;
    }

    placeOrDropFallingBlock(entity, chunkManager, bx, by, bz) {
        const pos = entity.mesh.userData.physicsPos;
        const target = chunkManager.getBlock(bx, by, bz);
        if (this.isFallingPassThroughId(target) && this.placeFallingBlock) {
            return this.placeFallingBlock(bx, by, bz, entity.id, entity.metadata) !== false;
        }
        this.spawnDrop(pos.x, pos.y, pos.z, entity.id, null, 0.1, null, { autoMagnet: true });
        return false;
    }

    spawnTransport(type, x, y, z, yaw = 0, chunkManager = null, options = {}) {
        const t = String(type || '').toLowerCase();
        if (t !== 'boat' && t !== 'minecart') return null;
        const isBoat = t === 'boat';
        if (isBoat && !this.isBoatSpawnValid(x, y, z, chunkManager, options)) return null;
        const geometry = buildTransportGeometry(t);
        const material = createTransportMaterial(t);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        if (t === 'minecart') {
            mesh.rotation.order = 'YZX';
        }
        mesh.rotation.y = yaw;
        mesh.castShadow = true;
        mesh.userData = {
            isVehicleEntity: true,
            vehicleType: t,
            vehicleId: this.nextTransportId,
            selectionScale: isBoat ? { x: 1.22, y: 0.37, z: 0.82 } : { x: 1.0, y: 0.72, z: 1.0 }
        };
        this.scene.add(mesh);
        const transport = {
            id: this.nextTransportId++,
            type: t,
            mesh,
            velocity: new THREE.Vector3(),
            railTrack: null,
            mounted: false,
            age: 0
        };
        this.transports.push(transport);
        return transport;
    }

    getTransportRaycastMeshes() {
        return this.transports.map((t) => t.mesh).filter(Boolean);
    }

    getTransportByMesh(mesh) {
        if (!mesh) return null;
        const id = Number(mesh.userData?.vehicleId);
        if (!Number.isFinite(id)) return null;
        return this.transports.find((t) => t.id === id) || null;
    }

    getTransportById(id) {
        const numeric = Number(id);
        if (!Number.isFinite(numeric)) return null;
        return this.transports.find((t) => t.id === numeric) || null;
    }

    removeTransport(transport, dropItem = true) {
        if (!transport) return false;
        const idx = this.transports.indexOf(transport);
        if (idx === -1) return false;
        const isBoat = transport.type === 'boat';
        if (dropItem) {
            // Beta boat parity: broken boats drop 3 planks + 2 sticks.
            // Minecarts keep dropping a minecart item.
            if (isBoat) {
                const px = transport.mesh.position.x;
                const py = transport.mesh.position.y;
                const pz = transport.mesh.position.z;
                for (let i = 0; i < 3; i++) {
                    this.spawnDrop(
                        px + (Math.random() - 0.5) * 0.35,
                        py + 0.05 + (Math.random() * 0.15),
                        pz + (Math.random() - 0.5) * 0.35,
                        14,
                        null,
                        0.1,
                        null,
                        { autoMagnet: true, kind: 'block' }
                    );
                }
                for (let i = 0; i < 2; i++) {
                    this.spawnDrop(
                        px + (Math.random() - 0.5) * 0.35,
                        py + 0.05 + (Math.random() * 0.15),
                        pz + (Math.random() - 0.5) * 0.35,
                        23,
                        null,
                        0.1,
                        null,
                        { autoMagnet: true, kind: 'item' }
                    );
                }
            } else {
                this.spawnDrop(
                    transport.mesh.position.x,
                    transport.mesh.position.y,
                    transport.mesh.position.z,
                    72,
                    null,
                    0.1,
                    null,
                    { autoMagnet: true, kind: 'item' }
                );
            }
        }
        if (this.mountedTransportId === transport.id) {
            this.mountedTransportId = null;
        }
        this.scene.remove(transport.mesh);
        if (transport.mesh.geometry) transport.mesh.geometry.dispose();
        if (transport.mesh.material) transport.mesh.material.dispose();
        this.transports.splice(idx, 1);
        return true;
    }

    mountTransport(transport) {
        if (!transport) return false;
        this.mountedTransportId = transport.id;
        transport.mounted = true;
        return true;
    }

    unmountTransport() {
        const t = this.getMountedTransport();
        if (t) t.mounted = false;
        this.mountedTransportId = null;
    }

    getMountedTransport() {
        if (this.mountedTransportId == null) return null;
        return this.getTransportById(this.mountedTransportId);
    }

    isMinecartPassableId(id) {
        return id === 0 || id === 63 || id === 6 || id === 70 || id === 51 || id === 71 || !isBlockOpaque(id);
    }

    canTransportOccupy(chunkManager, x, y, z) {
        // Horizontal occupancy for minecarts should test the cart body volume,
        // not the rail bed directly under it, otherwise forward motion can stall.
        const bodyY = y + 0.22;
        const halfX = 0.44;
        const halfY = 0.22;
        const halfZ = 0.44;
        const minX = Math.floor(x - halfX + 0.001);
        const maxX = Math.floor(x + halfX - 0.001);
        const minY = Math.floor(bodyY - halfY + 0.001);
        const maxY = Math.floor(bodyY + halfY - 0.001);
        const minZ = Math.floor(z - halfZ + 0.001);
        const maxZ = Math.floor(z + halfZ - 0.001);
        for (let by = minY; by <= maxY; by++) {
            for (let bx = minX; bx <= maxX; bx++) {
                for (let bz = minZ; bz <= maxZ; bz++) {
                    const id = chunkManager.getBlock(bx, by, bz);
                    if (!this.isMinecartPassableId(id)) return false;
                }
            }
        }
        return true;
    }

    findMinecartGroundBlockY(chunkManager, x, fromY, toY, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const start = Math.floor(fromY);
        const end = Math.floor(toY);
        for (let by = start; by >= end; by--) {
            const id = chunkManager.getBlock(bx, by, bz);
            if (!isRailId(id) && !this.isMinecartPassableId(id)) return by;
        }
        return null;
    }

    isBoatPassableId(id) {
        return id === 0 || id === 63 || id === 6 || id === 70 || id === 51 || id === 71 || !isBlockOpaque(id);
    }

    canBoatOccupy(chunkManager, x, y, z) {
        const halfX = 0.58;
        const halfY = 0.20;
        const halfZ = 0.38;
        const minX = Math.floor(x - halfX + 0.001);
        const maxX = Math.floor(x + halfX - 0.001);
        const minY = Math.floor(y - halfY + 0.001);
        const maxY = Math.floor(y + halfY - 0.001);
        const minZ = Math.floor(z - halfZ + 0.001);
        const maxZ = Math.floor(z + halfZ - 0.001);
        for (let by = minY; by <= maxY; by++) {
            for (let bx = minX; bx <= maxX; bx++) {
                for (let bz = minZ; bz <= maxZ; bz++) {
                    const id = chunkManager.getBlock(bx, by, bz);
                    if (!this.isBoatPassableId(id)) return false;
                }
            }
        }
        return true;
    }

    moveBoatWithCollision(pos, velocity, dt, chunkManager) {
        let maxImpactSpeed = 0;
        let collided = false;
        const nextX = pos.x + velocity.x * dt;
        if (this.canBoatOccupy(chunkManager, nextX, pos.y, pos.z)) {
            pos.x = nextX;
        } else {
            collided = true;
            maxImpactSpeed = Math.max(maxImpactSpeed, Math.abs(velocity.x));
            velocity.x *= -0.16;
        }
        const nextZ = pos.z + velocity.z * dt;
        if (this.canBoatOccupy(chunkManager, pos.x, pos.y, nextZ)) {
            pos.z = nextZ;
        } else {
            collided = true;
            maxImpactSpeed = Math.max(maxImpactSpeed, Math.abs(velocity.z));
            velocity.z *= -0.16;
        }
        return { collided, maxImpactSpeed };
    }

    applyTransportDamage(transport, amount = 10, source = 'player') {
        if (!transport || !transport.mesh) return false;
        const dmg = Math.max(0, Number(amount) || 0);
        if (dmg <= 0) return false;
        const nowMs = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
        const lastMs = Number(transport.lastDamageMs || 0);
        if (Number.isFinite(lastMs) && (nowMs - lastMs) < 110) return false;
        transport.lastDamageMs = nowMs;

        transport.damageTaken = Math.max(0, Number(transport.damageTaken || 0)) + dmg;
        transport.hurtTime = 10;

        if (transport.damageTaken > 40) {
            this.removeTransport(transport, true);
            return true;
        }
        return false;
    }

    findBoatWaterSurfaceY(chunkManager, x, y, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const candidates = [Math.floor(y + 0.2), Math.floor(y), Math.floor(y - 0.12), Math.floor(y - 0.5), Math.floor(y - 1.0)];
        let best = null;
        for (const cy of candidates) {
            const id = chunkManager.getBlock(bx, cy, bz);
            if (id === 6 || id === 70) {
                if (best == null || cy > best) best = cy;
            }
        }
        return best;
    }

    sampleBoatWaterCurrent(chunkManager, x, y, z) {
        this.tmpCurrent.set(0, 0, 0);
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const surfaceY = this.findBoatWaterSurfaceY(chunkManager, x, y, z);
        if (surfaceY == null) return this.tmpCurrent;
        const centerId = chunkManager.getBlock(bx, surfaceY, bz);
        if (centerId !== 6) return this.tmpCurrent; // still water has no horizontal current
        const centerMeta = chunkManager.getMetadata(bx, surfaceY, bz) & 15;
        const centerLevel = centerMeta >= 8 ? 0 : centerMeta;
        const dirs = [
            { dx: 1, dz: 0 },
            { dx: -1, dz: 0 },
            { dx: 0, dz: 1 },
            { dx: 0, dz: -1 }
        ];
        for (const d of dirs) {
            const nx = bx + d.dx;
            const nz = bz + d.dz;
            const nid = chunkManager.getBlock(nx, surfaceY, nz);
            if (nid !== 6 && nid !== 70) continue;
            const nMeta = chunkManager.getMetadata(nx, surfaceY, nz) & 15;
            const nLevel = nMeta >= 8 ? 0 : nMeta;
            const diff = nLevel - centerLevel;
            if (diff > 0) {
                this.tmpCurrent.x += d.dx * diff;
                this.tmpCurrent.z += d.dz * diff;
            }
        }
        const len = Math.hypot(this.tmpCurrent.x, this.tmpCurrent.z);
        if (len > 1e-6) {
            this.tmpCurrent.x /= len;
            this.tmpCurrent.z /= len;
        }
        return this.tmpCurrent;
    }

    applyTransportEntityCollisions(transport, playerPos) {
        if (!transport?.mesh) return;
        const pos = transport.mesh.position;
        const radius = transport.type === 'boat' ? 0.68 : 0.52;

        // Player collision/repulsion (unless mounted this transport).
        if (playerPos && this.mountedTransportId !== transport.id) {
            const dx = pos.x - playerPos.x;
            const dz = pos.z - playerPos.z;
            const d2 = dx * dx + dz * dz;
            const minDist = radius + 0.35;
            if (d2 > 1e-9 && d2 < minDist * minDist) {
                const d = Math.sqrt(d2);
                const nx = dx / d;
                const nz = dz / d;
                const push = (minDist - d) * 0.55;
                pos.x += nx * push;
                pos.z += nz * push;
                transport.velocity.x += nx * 0.22;
                transport.velocity.z += nz * 0.22;
            }
        }

        // Transport-vs-transport collision/repulsion.
        for (const other of this.transports) {
            if (!other || other === transport || !other.mesh) continue;
            if (other.id < transport.id) continue;
            const op = other.mesh.position;
            const or = other.type === 'boat' ? 0.68 : 0.52;
            const dx = op.x - pos.x;
            const dz = op.z - pos.z;
            const d2 = dx * dx + dz * dz;
            const minDist = radius + or;
            if (d2 <= 1e-9 || d2 >= minDist * minDist) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const nz = dz / d;
            const push = (minDist - d) * 0.5;
            pos.x -= nx * push;
            pos.z -= nz * push;
            op.x += nx * push;
            op.z += nz * push;
            transport.velocity.x -= nx * 0.20;
            transport.velocity.z -= nz * 0.20;
            other.velocity.x += nx * 0.20;
            other.velocity.z += nz * 0.20;
        }
    }

    isBoatSpawnValid(x, y, z, chunkManager, options = {}) {
        if (!chunkManager) return true;
        options = options || {};
        const anchor = options.anchor || null;
        const waterX = Number.isFinite(Number(anchor?.x)) ? Math.floor(Number(anchor.x)) : Math.floor(x);
        const waterZ = Number.isFinite(Number(anchor?.z)) ? Math.floor(Number(anchor.z)) : Math.floor(z);
        let waterY = Number.isFinite(Number(anchor?.y)) ? Math.floor(Number(anchor.y)) : null;

        if (waterY == null) {
            const candidates = [Math.floor(y), Math.floor(y - 0.5), Math.floor(y - 1.0)];
            for (const cy of candidates) {
                const cid = chunkManager.getBlock(waterX, cy, waterZ);
                if ((cid === 6 || cid === 70) && chunkManager.getBlock(waterX, cy + 1, waterZ) === 0) {
                    waterY = cy;
                    break;
                }
            }
        }
        if (waterY == null) return false;
        const waterId = chunkManager.getBlock(waterX, waterY, waterZ);
        if (waterId !== 6 && waterId !== 70) return false;
        if (chunkManager.getBlock(waterX, waterY + 1, waterZ) !== 0) return false;

        for (const t of this.transports) {
            if (!t?.mesh) continue;
            const dx = t.mesh.position.x - x;
            const dz = t.mesh.position.z - z;
            const dy = t.mesh.position.y - y;
            if ((dx * dx + dz * dz) < (0.95 * 0.95) && Math.abs(dy) < 0.8) return false;
        }

        const halfX = 0.60;
        const halfZ = 0.40;
        const minX = Math.floor(x - halfX + 0.001);
        const maxX = Math.floor(x + halfX - 0.001);
        const minZ = Math.floor(z - halfZ + 0.001);
        const maxZ = Math.floor(z + halfZ - 0.001);
        const headY = waterY + 1;
        for (let bx = minX; bx <= maxX; bx++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                const id = chunkManager.getBlock(bx, headY, bz);
                if (id !== 0 && isBlockOpaque(id)) return false;
            }
        }
        return true;
    }

    constrainMinecartToRailPath(pos, velocity, chunkManager, railTrack = null) {
        const RAIL_MATRIX = [
            [[0, 0, -1], [0, 0, 1]],
            [[-1, 0, 0], [1, 0, 0]],
            [[-1, -1, 0], [1, 0, 0]],
            [[-1, 0, 0], [1, -1, 0]],
            [[0, 0, -1], [0, -1, 1]],
            [[0, -1, -1], [0, 0, 1]],
            [[0, 0, 1], [1, 0, 0]],
            [[0, 0, 1], [-1, 0, 0]],
            [[0, 0, -1], [-1, 0, 0]],
            [[0, 0, -1], [1, 0, 0]]
        ];
        const getRailEndpoints = (shape) => {
            // Endpoints in local block space where block center is (0, 0).
            let ax = 0.0, az = -0.5, bx = 0.0, bz = 0.5; // NS default
            if (shape === 1 || shape === 2 || shape === 3) { ax = -0.5; az = 0.0; bx = 0.5; bz = 0.0; } // EW
            else if (shape === 4 || shape === 5) { ax = 0.0; az = -0.5; bx = 0.0; bz = 0.5; } // NS-ish
            else if (shape === 6) { ax = 0.5; az = 0.0; bx = 0.0; bz = 0.5; } // SE
            else if (shape === 7) { ax = -0.5; az = 0.0; bx = 0.0; bz = 0.5; } // SW
            else if (shape === 8) { ax = -0.5; az = 0.0; bx = 0.0; bz = -0.5; } // NW
            else if (shape === 9) { ax = 0.5; az = 0.0; bx = 0.0; bz = -0.5; } // NE
            const matrix = RAIL_MATRIX[shape] || RAIL_MATRIX[0];
            return { ax, az, bx, bz, matrix };
        };
        const getRailWorldPoint = (rx, ry, rz, shape, sampleX, sampleZ) => {
            const { matrix } = getRailEndpoints(shape);
            const startX = rx + 0.5 + matrix[0][0] * 0.5;
            const startY = ry + 0.5 + matrix[0][1] * 0.5;
            const startZ = rz + 0.5 + matrix[0][2] * 0.5;
            const endX = rx + 0.5 + matrix[1][0] * 0.5;
            const endY = ry + 0.5 + matrix[1][1] * 0.5;
            const endZ = rz + 0.5 + matrix[1][2] * 0.5;
            const dx = endX - startX;
            const dy2 = (endY - startY) * 2.0;
            const dz = endZ - startZ;
            let along;
            let worldX = sampleX;
            let worldZ = sampleZ;
            if (dx === 0.0) {
                worldX = rx + 0.5;
                along = sampleZ - rz;
            } else if (dz === 0.0) {
                worldZ = rz + 0.5;
                along = sampleX - rx;
            } else {
                const relX = sampleX - startX;
                const relZ = sampleZ - startZ;
                along = (relX * dx + relZ * dz) * 2.0;
            }
            worldX = startX + dx * along;
            let worldY = startY + dy2 * along;
            worldZ = startZ + dz * along;
            if (dy2 < 0.0) worldY += 1.0;
            if (dy2 > 0.0) worldY += 0.5;
            return { x: worldX, y: worldY, z: worldZ, along, dx, dz, dy2, matrix };
        };
        const projectToRail = (rx, ry, rz, sampleX, sampleZ) => {
            const railId = chunkManager.getBlock(rx, ry, rz);
            const shape = (railId === 27 || railId === 28)
                ? (chunkManager.getMetadata(rx, ry, rz) & 7)
                : (chunkManager.getMetadata(rx, ry, rz) & 15);
            const { ax, az, bx, bz, matrix } = getRailEndpoints(shape);
            const tx = bx - ax;
            const tz = bz - az;
            const len2 = (tx * tx) + (tz * tz) || 1;
            const ux = sampleX - rx;
            const uz = sampleZ - rz;
            const t = Math.max(0, Math.min(1, ((ux - ax) * tx + (uz - az) * tz) / len2));
            const px = ax + tx * t;
            const pz = az + tz * t;
            const worldPoint = getRailWorldPoint(rx, ry, rz, shape, sampleX, sampleZ);
            return { shape, ax, az, bx, bz, tx, tz, t, px, pz, matrix, worldPoint };
        };

        const baseX = Math.floor(pos.x);
        const baseY = Math.floor(pos.y - EntityManager.MINECART_RAIL_SAMPLE_OFFSET);
        const baseZ = Math.floor(pos.z);
        const speed = Math.hypot(velocity.x, velocity.z);
        const lookAheadScale = speed > 0.0001 ? (0.35 / speed) : 0;
        const qx = pos.x + velocity.x * lookAheadScale;
        const qz = pos.z + velocity.z * lookAheadScale;
        let best = null;
        let bestD2 = Infinity;

        // Hysteresis: keep current rail while still close to its segment to avoid handoff jitter.
        if (railTrack && Number.isFinite(railTrack.x) && Number.isFinite(railTrack.y) && Number.isFinite(railTrack.z)) {
            const lrX = railTrack.x | 0;
            const lrY = railTrack.y | 0;
            const lrZ = railTrack.z | 0;
            if (isRailId(chunkManager.getBlock(lrX, lrY, lrZ))) {
                const proj = projectToRail(lrX, lrY, lrZ, qx, qz);
                const wx = lrX + proj.px;
                const wz = lrZ + proj.pz;
                const lockD2 = (qx - wx) * (qx - wx) + (qz - wz) * (qz - wz);
                // Keep lock only when comfortably inside the segment; release near ends for smooth handoff.
                if (lockD2 <= 0.36 && proj.t > 0.08 && proj.t < 0.92) {
                    best = { rx: lrX, ry: lrY, rz: lrZ };
                    bestD2 = lockD2;
                }
            }
        }

        if (!best) {
            // Robustly choose the nearest nearby rail tile so corner transitions don't drop the cart.
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const rx = baseX + dx;
                        const ry = baseY + dy;
                        const rz = baseZ + dz;
                        const id = chunkManager.getBlock(rx, ry, rz);
                        if (!isRailId(id)) continue;
                        const proj = projectToRail(rx, ry, rz, qx, qz);
                        const wx = rx + proj.px;
                        const wz = rz + proj.pz;
                        let d2 = (qx - wx) * (qx - wx) + (qz - wz) * (qz - wz) + (dy * dy * 0.25);
                        if (railTrack && railTrack.x === rx && railTrack.y === ry && railTrack.z === rz) {
                            d2 -= 0.04;
                        }
                        if (d2 < bestD2) {
                            bestD2 = d2;
                            best = { rx, ry, rz };
                        }
                    }
                }
            }
        }
        if (!best) return false;

        const { rx, ry, rz } = best;
        const projNow = projectToRail(rx, ry, rz, pos.x, pos.z);
        if (projNow.shape === 2) velocity.x -= MINECART_SLOPE_PUSH;
        else if (projNow.shape === 3) velocity.x += MINECART_SLOPE_PUSH;
        else if (projNow.shape === 4) velocity.z += MINECART_SLOPE_PUSH;
        else if (projNow.shape === 5) velocity.z -= MINECART_SLOPE_PUSH;
        const px = projNow.px;
        const pz = projNow.pz;
        const tx = projNow.tx;
        const tz = projNow.tz;
        const tl = Math.hypot(tx, tz) || 1;
        const tnx = tx / tl;
        const tnz = tz / tl;

        const along = velocity.x * tnx + velocity.z * tnz;
        const speedMag = Math.hypot(velocity.x, velocity.z);
        const dir = along < 0 ? -1 : 1;
        velocity.x = speedMag * tnx * dir;
        velocity.z = speedMag * tnz * dir;
        velocity.y = 0;
        const targetX = rx + px;
        const targetZ = rz + pz;
        const corrX = targetX - pos.x;
        const corrZ = targetZ - pos.z;
        const corrD2 = corrX * corrX + corrZ * corrZ;
        if (corrD2 > 0.16) {
            pos.x = targetX;
            pos.z = targetZ;
        } else {
            // Smooth out per-block micro snaps while still converging to exact rail centerline.
            pos.x += corrX * 0.30;
            pos.z += corrZ * 0.30;
        }
        const currentWorldPoint = getRailWorldPoint(rx, ry, rz, projNow.shape, pos.x, pos.z);
        let pitch = 0;
        {
            const signedTangentX = tnx * dir;
            const signedTangentZ = tnz * dir;
            const front = getRailWorldPoint(rx, ry, rz, projNow.shape, pos.x + signedTangentX * 0.3, pos.z + signedTangentZ * 0.3);
            const back = getRailWorldPoint(rx, ry, rz, projNow.shape, pos.x - signedTangentX * 0.3, pos.z - signedTangentZ * 0.3);
            const pitchDx = front.x - back.x;
            const pitchDy = front.y - back.y;
            const pitchDz = front.z - back.z;
            const pitchHoriz = Math.hypot(pitchDx, pitchDz);
            pitch = pitchHoriz > 1e-6 ? -Math.atan2(pitchDy, pitchHoriz) : 0;
        }
        const pitchLift = Math.max(
            0,
            Math.abs(Math.sin(pitch)) * MINECART_HALF_LENGTH_FOR_PITCH -
            (1 - Math.cos(pitch)) * MINECART_HALF_HEIGHT
        ) + (Math.abs(pitch) > 1e-4 ? MINECART_SLOPE_CLEARANCE_BIAS : 0);
        pos.y = currentWorldPoint.y - 0.35 + pitchLift + EntityManager.MINECART_RAIL_CENTER_OFFSET;
        if (railTrack) {
            railTrack.x = rx;
            railTrack.y = ry;
            railTrack.z = rz;
            railTrack.tangentX = tnx * dir;
            railTrack.tangentZ = tnz * dir;
            railTrack.shape = projNow.shape;
            railTrack.pitch = pitch;
            railTrack.pitchLift = pitchLift;
        }
        return true;
    }

    applyMinecartRailDrive(transport, dt, chunkManager) {
        const tx = Number(transport.railTrack?.tangentX);
        const tz = Number(transport.railTrack?.tangentZ);
        const railX = Number(transport.railTrack?.x);
        const railY = Number(transport.railTrack?.y);
        const railZ = Number(transport.railTrack?.z);
        if (!Number.isFinite(tx) || !Number.isFinite(tz) || (Math.abs(tx) + Math.abs(tz) <= 0.0001)) return;
        if (!Number.isFinite(railX) || !Number.isFinite(railY) || !Number.isFinite(railZ)) return;

        const railId = chunkManager.getBlock(railX, railY, railZ);
        if (railId !== 27) return;

        const railMeta = chunkManager.getMetadata(railX, railY, railZ) & 15;
        const railPowered = (railMeta & 8) !== 0;
        const railShape = railMeta & 7;
        const tangentLen = Math.hypot(tx, tz) || 1;
        const dirX = tx / tangentLen;
        const dirZ = tz / tangentLen;
        const along = transport.velocity.x * dirX + transport.velocity.z * dirZ;

        if (railPowered) {
            const speed = Math.abs(along);
            if (speed > 0.01) {
                const boostedAlong = along + Math.sign(along) * (MINECART_POWERED_RAIL_BOOST * 20 * dt);
                transport.velocity.x = dirX * boostedAlong;
                transport.velocity.z = dirZ * boostedAlong;
            } else if (railShape === 1) {
                if (chunkManager.getBlock(railX - 1, railY, railZ) !== 0) {
                    transport.velocity.x = MINECART_POWERED_RAIL_KICK;
                } else if (chunkManager.getBlock(railX + 1, railY, railZ) !== 0) {
                    transport.velocity.x = -MINECART_POWERED_RAIL_KICK;
                }
            } else if (railShape === 0) {
                if (chunkManager.getBlock(railX, railY, railZ - 1) !== 0) {
                    transport.velocity.z = MINECART_POWERED_RAIL_KICK;
                } else if (chunkManager.getBlock(railX, railY, railZ + 1) !== 0) {
                    transport.velocity.z = -MINECART_POWERED_RAIL_KICK;
                }
            }
            return;
        }

        if (Math.abs(along) < 0.03) {
            transport.velocity.x = 0;
            transport.velocity.z = 0;
            return;
        }

        const brakedAlong = along * 0.5;
        transport.velocity.x = dirX * brakedAlong;
        transport.velocity.z = dirZ * brakedAlong;
    }

    applyMinecartRailFriction(transport, dt, ridden = false) {
        const perTick = ridden ? 0.996999979019165 : 0.9599999785423279;
        const factor = Math.pow(perTick, Math.max(0, dt) * 20);
        transport.velocity.x *= factor;
        transport.velocity.z *= factor;
        transport.velocity.y = 0;
    }

    clampMinecartVelocity(transport, onRail) {
        const cap = onRail ? MINECART_RAIL_SPEED_CAP : MINECART_OFFRAIL_SPEED_CAP;
        transport.velocity.x = Math.max(-cap, Math.min(cap, transport.velocity.x));
        transport.velocity.z = Math.max(-cap, Math.min(cap, transport.velocity.z));
    }

    updateMountedTransport(dt, moveState, camera, chunkManager) {
        const t = this.getMountedTransport();
        if (!t) return false;
        const pos = t.mesh.position;
        const forward = (moveState.fwd ? 1 : 0) - (moveState.bwd ? 1 : 0);
        const strafe = (moveState.right ? 1 : 0) - (moveState.left ? 1 : 0);
        const yaw = camera.rotation.y;
        const speed = t.type === 'boat' ? BOAT_SPEED_CAP : MINECART_RAIL_SPEED_CAP;
        const accel = t.type === 'boat' ? BOAT_ACCEL : 14.0;
        this.tmpVehicleDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        if (t.type !== 'boat' && t.type !== 'minecart' && forward !== 0) {
            t.velocity.x += this.tmpVehicleDir.x * forward * accel * dt;
            t.velocity.z += this.tmpVehicleDir.z * forward * accel * dt;
        }
        if (strafe !== 0 && t.type !== 'boat' && t.type !== 'minecart') {
            t.velocity.x += rightX * strafe * accel * 0.55 * dt;
            t.velocity.z += rightZ * strafe * accel * 0.55 * dt;
        }
        const horizontal = Math.hypot(t.velocity.x, t.velocity.z);
        if (horizontal > speed) {
            const s = speed / horizontal;
            t.velocity.x *= s;
            t.velocity.z *= s;
        }

        this.tmpVehicleCandidate.set(
            pos.x + t.velocity.x * dt,
            pos.y,
            pos.z + t.velocity.z * dt
        );
        if (t.type !== 'minecart') {
            const impact = this.moveBoatWithCollision(pos, t.velocity, dt, chunkManager);
            // Beta-like boat crash break condition on strong collision.
            if (impact.collided && impact.maxImpactSpeed > 4.0) {
                this.removeTransport(t, true);
                return false;
            }
        }
        if (t.type === 'boat') {
            const waterSurfaceY = this.findBoatWaterSurfaceY(chunkManager, pos.x, pos.y, pos.z);
            const floating = waterSurfaceY != null;
            const horizontalSpeed = Math.hypot(t.velocity.x, t.velocity.z);
            const headingYaw = Number.isFinite(t.boatYaw) ? t.boatYaw : t.mesh.rotation.y;
            const turnAuthority = Math.min(1, horizontalSpeed / 2.2 + 0.45);
            const turnAccel = 5.6;
            const turnDamping = Math.exp(-6.0 * dt);
            // Jacobo parity: strafe-right should yaw-right, strafe-left should yaw-left.
            t.boatYawVel = (Number.isFinite(t.boatYawVel) ? t.boatYawVel : 0) + (-strafe * turnAccel * turnAuthority * dt);
            t.boatYawVel *= turnDamping;
            t.boatYaw = headingYaw + t.boatYawVel * dt;
            const hx = -Math.sin(t.boatYaw);
            const hz = -Math.cos(t.boatYaw);
            if (forward !== 0) {
                t.velocity.x += hx * forward * accel * dt;
                t.velocity.z += hz * forward * accel * dt;
            }
            const cap = floating ? BOAT_SPEED_CAP : 1.8;
            const hs = Math.hypot(t.velocity.x, t.velocity.z);
            if (hs > cap) {
                const s = cap / hs;
                t.velocity.x *= s;
                t.velocity.z *= s;
            }
            if (floating) {
                t.velocity.y = Math.max(t.velocity.y, 0);
                pos.y = waterSurfaceY + 1.12;
                const waterDrag = Math.exp(-1.6 * dt);
                t.velocity.x *= waterDrag;
                t.velocity.z *= waterDrag;
                const flow = this.sampleBoatWaterCurrent(chunkManager, pos.x, pos.y, pos.z);
                t.velocity.x += flow.x * dt * 0.75;
                t.velocity.z += flow.z * dt * 0.75;
            } else {
                t.velocity.y -= 18 * dt;
                pos.y += t.velocity.y * dt;
                const landDrag = Math.exp(-8.5 * dt);
                t.velocity.x *= landDrag;
                t.velocity.z *= landDrag;
            }
            t.mesh.rotation.y = t.boatYaw + BOAT_MODEL_YAW_OFFSET;
            this.applyTransportEntityCollisions(t, camera.position);
        } else {
            const onRail = this.constrainMinecartToRailPath(pos, t.velocity, chunkManager, t.railTrack || (t.railTrack = { x: 0, y: 0, z: 0 }));
            if (onRail) {
                this.clampMinecartVelocity(t, true);
                const tx = Number(t.railTrack?.tangentX);
                const tz = Number(t.railTrack?.tangentZ);
                this.applyMinecartRailDrive(t, dt, chunkManager);
                this.clampMinecartVelocity(t, true);
                if (Number.isFinite(tx) && Number.isFinite(tz) && (Math.abs(tx) + Math.abs(tz) > 0.0001)) {
                    t.mesh.rotation.y = Math.atan2(tx, tz) + MINECART_MODEL_YAW_OFFSET;
                }
                t.mesh.rotation.x = 0;
                t.mesh.rotation.z = Number.isFinite(t.railTrack?.pitch) ? t.railTrack.pitch : 0;
            }
            if (!onRail) {
                t.mesh.rotation.x = 0;
                t.mesh.rotation.z = 0;
                this.clampMinecartVelocity(t, false);
                t.velocity.y -= 18 * dt;
                const nextY = pos.y + t.velocity.y * dt;
                const currentFootY = pos.y - EntityManager.MINECART_RAIL_SAMPLE_OFFSET;
                const nextFootY = nextY - EntityManager.MINECART_RAIL_SAMPLE_OFFSET;
                const groundBy = (t.velocity.y <= 0)
                    ? this.findMinecartGroundBlockY(chunkManager, pos.x, currentFootY, nextFootY, pos.z)
                    : null;
                if (groundBy != null) {
                    pos.y = groundBy + EntityManager.MINECART_RAIL_CENTER_OFFSET;
                    t.velocity.y = 0;
                    t.velocity.x *= 0.9;
                    t.velocity.z *= 0.9;
                } else {
                    pos.y = nextY;
                }
            }
            if (onRail) {
                this.applyMinecartRailFriction(t, dt, true);
            } else {
                t.velocity.x *= 0.96;
                t.velocity.z *= 0.96;
            }
            const nextX = pos.x + t.velocity.x * dt;
            const nextZ = pos.z + t.velocity.z * dt;
            if (onRail) {
                pos.x = nextX;
                pos.z = nextZ;
                this.constrainMinecartToRailPath(pos, t.velocity, chunkManager, t.railTrack || (t.railTrack = { x: 0, y: 0, z: 0 }));
            } else if (this.canTransportOccupy(chunkManager, nextX, pos.y, nextZ)) {
                pos.x = nextX;
                pos.z = nextZ;
            } else {
                t.velocity.x *= -0.2;
                t.velocity.z *= -0.2;
            }
        }
        if (t.type !== 'boat' && Math.abs(t.velocity.x) + Math.abs(t.velocity.z) > 0.001) {
            t.mesh.rotation.y = Math.atan2(t.velocity.x, t.velocity.z) + MINECART_MODEL_YAW_OFFSET;
        }
        camera.position.set(pos.x, pos.y + 1.4, pos.z);
        return true;
    }

    update(dt, playerPos, chunkManager) {
        const gravity = 32.0;
        const itemRadius = 0.25; 
        const itemHalfWidth = 0.125;
        const itemHalfHeight = 0.125;

        // Beta-style falling blocks (sand/gravel): true falling entities with gravity.
        for (let i = this.fallingBlocks.length - 1; i >= 0; i--) {
            const fb = this.fallingBlocks[i];
            fb.age += dt;
            const pos = fb.mesh.userData.physicsPos;

            // Post-land handoff: keep briefly, then remove once terrain mesh has refreshed.
            if (fb.landed) {
                fb.landedAge += dt;
                if (fb.landedAge >= 0.08) {
                    this.scene.remove(fb.mesh);
                    if (fb.mesh.geometry) fb.mesh.geometry.dispose();
                    this.fallingBlocks.splice(i, 1);
                }
                continue;
            }

            const lx = Math.floor(pos.x);
            const ly = Math.floor(pos.y);
            const lz = Math.floor(pos.z);
            const lightLevel = chunkManager.getLight(lx, ly, lz);
            const intensity = Math.max(0.1, Math.pow(lightLevel / MAX_LIGHT, 1.4));
            if (Array.isArray(fb.mesh.material)) {
                fb.mesh.material.forEach(mat => mat.color.setScalar(1.0));
            } else {
                fb.mesh.material.color.setScalar(1.0);
            }
            if (!this.applyFallingAOSnapshot(fb)) {
                this.updateFallingBlockAO(fb, chunkManager, intensity);
            }

            fb.mesh.visible = true;

            fb.velocity.y -= gravity * dt;
            const nextX = pos.x + fb.velocity.x * dt;
            const nextY = pos.y + fb.velocity.y * dt;
            const nextZ = pos.z + fb.velocity.z * dt;
            fb.velocity.multiplyScalar(0.98);

            const bx = Math.floor(nextX + 0.5);
            const bz = Math.floor(nextZ + 0.5);
            const supportY = Math.floor(nextY - 0.5);
            const belowId = chunkManager.getBlock(bx, supportY, bz);
            const landed = !this.isFallingPassThroughId(belowId) && fb.velocity.y <= 0;

            if (landed) {
                const by = supportY + 1;
                pos.set(bx, by, bz);
                const placed = this.placeOrDropFallingBlock(fb, chunkManager, bx, by, bz);
                if (!placed) {
                    this.scene.remove(fb.mesh);
                    if (fb.mesh.geometry) fb.mesh.geometry.dispose();
                    this.fallingBlocks.splice(i, 1);
                    continue;
                }
                // Keep entity briefly to hide mesh handoff while chunk geometry refreshes.
                fb.velocity.set(0, 0, 0);
                fb.landed = true;
                fb.landedAge = 0;
                fb.mesh.position.set(bx, by + 0.01, bz);
                fb.mesh.rotation.set(0, 0, 0);
                continue;
            }

            pos.set(nextX, nextY, nextZ);
            fb.mesh.position.copy(pos);
            // Keep orientation fixed so shading appears stable while falling.
            fb.mesh.rotation.set(0, 0, 0);

            if (pos.y < -150) {
                this.spawnDrop(pos.x, pos.y, pos.z, fb.id, null, 0.1, null, { autoMagnet: true });
                this.scene.remove(fb.mesh);
                if (fb.mesh.geometry) fb.mesh.geometry.dispose();
                this.fallingBlocks.splice(i, 1);
            }
        }

        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];
            drop.age += dt;

            const physPos = drop.mesh.userData.physicsPos;
            const playerTopY = playerPos.y + (PLAYER_HEIGHT - PLAYER_EYE_HEIGHT);
            const playerMinX = playerPos.x - PLAYER_RADIUS;
            const playerMaxX = playerPos.x + PLAYER_RADIUS;
            const playerMinY = playerTopY - PLAYER_HEIGHT;
            const playerMaxY = playerTopY;
            const playerMinZ = playerPos.z - PLAYER_RADIUS;
            const playerMaxZ = playerPos.z + PLAYER_RADIUS;

            // --- Lighting Update ---
            // Get the integer block coordinates
            const lx = Math.floor(physPos.x);
            const ly = Math.floor(physPos.y);
            const lz = Math.floor(physPos.z);

            // Fetch light level (0-15) from the chunk data
            const lightLevel = chunkManager.getLight(lx, ly, lz);
            
            // Calculate intensity curve ( Gamma 1.4 )
            // Min brightness 0.1 so it doesn't disappear completely
            const intensity = Math.max(0.1, Math.pow(lightLevel / MAX_LIGHT, 1.4));

            const tint = this.getDropTint(drop, physPos);
            const tr = tint ? tint.r : 1.0;
            const tg = tint ? tint.g : 1.0;
            const tb = tint ? tint.b : 1.0;

            // Apply lighting and optional biome tint to material(s).
            // Grass block drops should only tint the top face (material index 2);
            // side dirt faces must remain untinted.
            if (Array.isArray(drop.mesh.material)) {
                if ((Number(drop.id) | 0) === 1 && drop.mesh.material.length >= 3) {
                    drop.mesh.material.forEach(mat => mat.color.setScalar(intensity));
                    drop.mesh.material[2].color.setRGB(intensity * tr, intensity * tg, intensity * tb);
                } else {
                    drop.mesh.material.forEach(mat => mat.color.setRGB(intensity * tr, intensity * tg, intensity * tb));
                }
            } else {
                drop.mesh.material.color.setRGB(intensity * tr, intensity * tg, intensity * tb);
            }

            // Beta 1.7.3 parity: item entities are picked up on collision only.
            // There is no magnetic attraction in EntityItem.onUpdate.
            const itemMinX = physPos.x - itemHalfWidth;
            const itemMaxX = physPos.x + itemHalfWidth;
            const itemMinY = physPos.y - itemHalfHeight;
            const itemMaxY = physPos.y + itemHalfHeight;
            const itemMinZ = physPos.z - itemHalfWidth;
            const itemMaxZ = physPos.z + itemHalfWidth;
            const intersectsPlayer =
                playerMinX < itemMaxX && playerMaxX > itemMinX &&
                playerMinY < itemMaxY && playerMaxY > itemMinY &&
                playerMinZ < itemMaxZ && playerMaxZ > itemMinZ;
            const canAutoCollect = drop.autoMagnet && inventory.canFitItem(drop.id, 1, drop.durability, drop.metadata, drop.kind);

            if (canAutoCollect) {
                const targetY = playerMinY + PLAYER_HEIGHT * 0.5;
                const toPlayer = new THREE.Vector3(
                    playerPos.x - physPos.x,
                    targetY - physPos.y,
                    playerPos.z - physPos.z
                );
                const distSq = toPlayer.lengthSq();
                if (distSq > 0.0001) {
                    const dist = Math.sqrt(distSq);
                    toPlayer.multiplyScalar(1 / dist);
                    const travel = Math.min(dist, Math.max(10, dist * 6) * dt);
                    physPos.addScaledVector(toPlayer, travel);
                    drop.velocity.set(0, 0, 0);
                }
            }

            if (drop.age > drop.pickupDelay && intersectsPlayer) {
                if (inventory.addItem(drop.id, 1, drop.durability, drop.metadata, drop.kind)) {
                    refreshHotbar(); 
                    this.scene.remove(drop.mesh);
                    if (drop.mesh.geometry) drop.mesh.geometry.dispose();
                    this.drops.splice(i, 1);
                    continue;
                }
            }

            if (canAutoCollect) {
                drop.mesh.position.copy(physPos);
                const bobOffset = Math.sin(drop.age * 1.257) * 0.05;
                drop.mesh.position.y += bobOffset;
                if (drop.isFlatDrop) {
                    this.faceFlatDropToPlayerPosition(drop, playerPos);
                } else {
                    drop.mesh.rotation.y += dt * 1.0;
                    drop.mesh.rotation.x += dt * 2.0;
                }
                continue;
            }

            // --- Physics Update ---
            drop.velocity.y -= gravity * dt;

            // 1. Horizontal Movement
            let nextX = physPos.x + drop.velocity.x * dt;
            let nextZ = physPos.z + drop.velocity.z * dt;

            const checkY = Math.round(physPos.y); 
            
            const bx = Math.floor(nextX);
            const bz = Math.floor(nextZ);
            const blockH = chunkManager.getBlock(bx, checkY, bz);

            if (blockH !== 0 && blockH !== 6 && blockH !== 7) {
                drop.velocity.x *= -0.5;
                drop.velocity.z *= -0.5;
            } else {
                physPos.x = nextX;
                physPos.z = nextZ;
            }

            // 2. Vertical Movement
            let nextY = physPos.y + drop.velocity.y * dt;
            
            const feetY = nextY - itemRadius;
            const blockY = Math.floor(feetY);
            
            if (drop.velocity.y < 0) {
                const blockV = chunkManager.getBlock(Math.floor(physPos.x), blockY, Math.floor(physPos.z));

                if (blockV !== 0 && blockV !== 6 && blockV !== 7) {
                     const groundLevel = blockY + 1.0 + itemRadius;
                     physPos.y = groundLevel;
                     drop.velocity.y = 0;
                     drop.velocity.x *= 0.9; 
                     drop.velocity.z *= 0.9;
                } else {
                    physPos.y = nextY;
                }
            } else {
                 physPos.y = nextY;
            }

            // --- Visual Update ---
            drop.mesh.position.copy(physPos);
            
            const bobOffset = Math.sin(drop.age * 1.257) * 0.1;
            drop.mesh.position.y += bobOffset;
            if (drop.isFlatDrop) {
                this.faceFlatDropToPlayerPosition(drop, playerPos);
            } else {
                drop.mesh.rotation.y += dt * 1.0;
                drop.mesh.rotation.x += dt * 1.0;
            }

            // Kill Plane
            if (physPos.y < -150) {
                this.scene.remove(drop.mesh);
                if (drop.mesh.geometry) drop.mesh.geometry.dispose();
                this.drops.splice(i, 1);
            }
        }

        for (let i = this.transports.length - 1; i >= 0; i--) {
            const t = this.transports[i];
            t.age += dt;
            if (this.mountedTransportId === t.id) continue;
            const pos = t.mesh.position;
            if (t.type === 'boat') {
                const waterSurfaceY = this.findBoatWaterSurfaceY(chunkManager, pos.x, pos.y, pos.z);
                const floating = waterSurfaceY != null;
            if (floating) {
                pos.y = waterSurfaceY + 1.12;
                t.velocity.y = 0;
                const waterDrag = Math.exp(-2.2 * dt);
                t.velocity.x *= waterDrag;
                t.velocity.z *= waterDrag;
                const flow = this.sampleBoatWaterCurrent(chunkManager, pos.x, pos.y, pos.z);
                t.velocity.x += flow.x * dt * 0.75;
                t.velocity.z += flow.z * dt * 0.75;
            } else {
                t.velocity.y -= 18 * dt;
                pos.y += t.velocity.y * dt;
                const landDrag = Math.exp(-8.5 * dt);
                t.velocity.x *= landDrag;
                    t.velocity.z *= landDrag;
                }
                const impact = this.moveBoatWithCollision(pos, t.velocity, dt, chunkManager);
                if (impact.collided && impact.maxImpactSpeed > 4.0) {
                    this.removeTransport(t, true);
                    continue;
                }
                if (Math.abs(t.velocity.x) + Math.abs(t.velocity.z) > 0.0005) {
                    t.mesh.rotation.y = Math.atan2(t.velocity.x, t.velocity.z) + BOAT_MODEL_YAW_OFFSET;
                }
            } else {
                const onRail = this.constrainMinecartToRailPath(pos, t.velocity, chunkManager, t.railTrack || (t.railTrack = { x: 0, y: 0, z: 0 }));
                if (onRail) {
                    this.clampMinecartVelocity(t, true);
                    const tx = Number(t.railTrack?.tangentX);
                    const tz = Number(t.railTrack?.tangentZ);
                    this.applyMinecartRailDrive(t, dt, chunkManager);
                    this.clampMinecartVelocity(t, true);
                if (Number.isFinite(tx) && Number.isFinite(tz) && (Math.abs(tx) + Math.abs(tz) > 0.0001)) {
                    t.mesh.rotation.y = Math.atan2(tx, tz) + MINECART_MODEL_YAW_OFFSET;
                }
                    t.mesh.rotation.x = 0;
                    t.mesh.rotation.z = Number.isFinite(t.railTrack?.pitch) ? t.railTrack.pitch : 0;
                }
                if (onRail) {
                    this.applyMinecartRailFriction(t, dt, false);
                } else {
                t.mesh.rotation.x = 0;
                t.mesh.rotation.z = 0;
                this.clampMinecartVelocity(t, false);
                    t.velocity.y -= 18 * dt;
                    const nextY = pos.y + t.velocity.y * dt;
                    const currentFootY = pos.y - EntityManager.MINECART_RAIL_SAMPLE_OFFSET;
                    const nextFootY = nextY - EntityManager.MINECART_RAIL_SAMPLE_OFFSET;
                    const groundBy = (t.velocity.y <= 0)
                        ? this.findMinecartGroundBlockY(chunkManager, pos.x, currentFootY, nextFootY, pos.z)
                        : null;
                    if (groundBy != null) {
                        pos.y = groundBy + EntityManager.MINECART_RAIL_CENTER_OFFSET;
                        t.velocity.y = 0;
                        t.velocity.x *= 0.9;
                        t.velocity.z *= 0.9;
                    } else {
                        pos.y = nextY;
                    }
                    t.velocity.x *= 0.98;
                    t.velocity.z *= 0.98;
                }
                const nextX = pos.x + t.velocity.x * dt;
                const nextZ = pos.z + t.velocity.z * dt;
                if (onRail) {
                    pos.x = nextX;
                    pos.z = nextZ;
                    this.constrainMinecartToRailPath(pos, t.velocity, chunkManager, t.railTrack || (t.railTrack = { x: 0, y: 0, z: 0 }));
                } else if (this.canTransportOccupy(chunkManager, nextX, pos.y, nextZ)) {
                    pos.x = nextX;
                    pos.z = nextZ;
                } else {
                    t.velocity.x *= -0.2;
                    t.velocity.z *= -0.2;
                }
            }
            this.applyTransportEntityCollisions(t, playerPos);
            if (pos.y < -150) {
                this.removeTransport(t, false);
                continue;
            }
        }
    }
    
    clear() {
        this.fallingBlocks.forEach(f => {
            this.scene.remove(f.mesh);
            if (f.mesh.geometry) f.mesh.geometry.dispose();
        });
        this.fallingBlocks = [];
        this.drops.forEach(d => {
            this.scene.remove(d.mesh);
            if (d.mesh.geometry) d.mesh.geometry.dispose();
        });
        this.drops = [];
        this.transports.forEach((t) => {
            this.scene.remove(t.mesh);
            if (t.mesh.geometry) t.mesh.geometry.dispose();
            if (t.mesh.material) t.mesh.material.dispose();
        });
        this.transports = [];
        this.mountedTransportId = null;
    }

    clearDrops() {
        this.drops.forEach(d => {
            this.scene.remove(d.mesh);
            if (d.mesh.geometry) d.mesh.geometry.dispose();
        });
        const removed = this.drops.length;
        this.drops = [];
        return removed;
    }

    serializeTransports() {
        return (this.transports || []).map((t) => ({
            type: String(t.type || ''),
            x: Number(t.mesh?.position?.x || 0),
            y: Number(t.mesh?.position?.y || 0),
            z: Number(t.mesh?.position?.z || 0),
            yaw: Number(t.mesh?.rotation?.y || 0),
            vx: Number(t.velocity?.x || 0),
            vy: Number(t.velocity?.y || 0),
            vz: Number(t.velocity?.z || 0),
            boatYaw: Number.isFinite(Number(t.boatYaw)) ? Number(t.boatYaw) : null,
            boatYawVel: Number.isFinite(Number(t.boatYawVel)) ? Number(t.boatYawVel) : null
        }));
    }

    loadTransports(list) {
        if (!Array.isArray(list)) return 0;
        let loaded = 0;
        for (const e of list) {
            if (!e || typeof e !== 'object') continue;
            const type = String(e.type || '').toLowerCase();
            if (type !== 'boat' && type !== 'minecart') continue;
            const x = Number(e.x), y = Number(e.y), z = Number(e.z), yaw = Number(e.yaw);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            const t = this.spawnTransport(type, x, y, z, Number.isFinite(yaw) ? yaw : 0, null, null);
            if (!t) continue;
            const vx = Number(e.vx), vy = Number(e.vy), vz = Number(e.vz);
            t.velocity.set(
                Number.isFinite(vx) ? vx : 0,
                Number.isFinite(vy) ? vy : 0,
                Number.isFinite(vz) ? vz : 0
            );
            if (Number.isFinite(Number(e.boatYaw))) t.boatYaw = Number(e.boatYaw);
            if (Number.isFinite(Number(e.boatYawVel))) t.boatYawVel = Number(e.boatYawVel);
            loaded++;
        }
        return loaded;
    }
}
