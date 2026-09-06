// js/fireManager.js
import { CHUNK_SIZE, WORLD_DEPTH, WORLD_HEIGHT } from './constants.js';
import { BLOCKS } from './blocks.js';
import { isLavaId } from './fluidIds.js';

export class FireManager {
    constructor(chunkManager, updateBlockCallback) {
        this.chunkManager = chunkManager;
        this.updateBlock = updateBlockCallback;
        
        this.timer = 0;
        this.tickRate = 0.8; 
        
        // Optimization: Cache flammable IDs
        this.flammableIds = new Set();
        BLOCKS.forEach(b => {
            if (b.flammable) this.flammableIds.add(b.id);
        });
    }

    update(dt, playerPos) {
        this.timer += dt;
        if (this.timer >= this.tickRate) {
            this.timer = 0;
            this.tick(playerPos);
        }
    }

    isFlammable(id) {
        return this.flammableIds.has(id);
    }

    tick(playerPos) {
        const cx = Math.floor(playerPos.x / CHUNK_SIZE);
        const cz = Math.floor(playerPos.z / CHUNK_SIZE);
        const cy = Math.floor(playerPos.y / CHUNK_SIZE);
        
        const updates = new Map();

        for (let x = cx - 2; x <= cx + 2; x++) {
            for (let z = cz - 2; z <= cz + 2; z++) {
                const minY = Math.floor(WORLD_DEPTH / CHUNK_SIZE);
                const maxY = Math.min(Math.floor(WORLD_HEIGHT / CHUNK_SIZE), cy + 1);

                for (let y = minY; y <= maxY; y++) {
                    const chunk = this.chunkManager.getChunk(x, y, z);
                    if (!chunk || !chunk.isGenerated) continue;

                    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                                const id = chunk.getBlock(lx, ly, lz);
                                if (id === 63) { // FIRE
                                    const wx = x * CHUNK_SIZE + lx;
                                    const wy = y * CHUNK_SIZE + ly;
                                    const wz = z * CHUNK_SIZE + lz;
                                    const meta = chunk.getMetadata(lx, ly, lz);
                                    this.processFire(wx, wy, wz, meta, updates);
                                } else if (isLavaId(id)) { // LAVA
                                    const wx = x * CHUNK_SIZE + lx;
                                    const wy = y * CHUNK_SIZE + ly;
                                    const wz = z * CHUNK_SIZE + lz;
                                    this.processLavaIgnition(wx, wy, wz, updates);
                                }
                            }
                        }
                    }
                }
            }
        }

        updates.forEach(u => {
            this.updateBlock(u.x, u.y, u.z, u.id, u.meta);
        });
    }

    getSupportPos(x, y, z, meta) {
        // Meta 0: Floor -> y-1
        // Meta 1: North Wall (Fire on South face of block at z-1) -> z-1
        // Meta 2: South Wall (Fire on North face of block at z+1) -> z+1
        // Meta 3: East Wall (Fire on West face of block at x+1) -> x+1
        // Meta 4: West Wall (Fire on East face of block at x-1) -> x-1
        
        if (meta === 0) return { x, y: y - 1, z };
        if (meta === 1) return { x, y, z: z - 1 };
        if (meta === 2) return { x, y, z: z + 1 };
        if (meta === 3) return { x: x + 1, y, z };
        if (meta === 4) return { x: x - 1, y, z };
        return { x, y: y - 1, z }; // Default
    }

    processFire(x, y, z, meta, updates) {
        const support = this.getSupportPos(x, y, z, meta);
        const supportId = this.chunkManager.getBlock(support.x, support.y, support.z);
        const supportFlammable = this.isFlammable(supportId);

        // 1. Check if support exists
        if (supportId === 0 || supportId === 63) {
            // Unsupported fire extinguishes
            this.queueUpdate(updates, x, y, z, 0, 0);
            return;
        }

        const r = Math.random();

        // 2. Extinguish on non-flammables
        if (!supportFlammable) {
            if (r < 0.2) { // 20% chance to burn out
                this.queueUpdate(updates, x, y, z, 0, 0);
            }
            return; 
        }

        // 3. Destroy flammable support
        // Reduced from 0.1 (10%) to 0.03 (3%) to allow fire to persist longer
        if (r < 0.03) { 
            // Destroy the support block
            this.queueUpdate(updates, support.x, support.y, support.z, 0, 0);
            // Extinguish this fire (it falls or disappears)
            this.queueUpdate(updates, x, y, z, 0, 0);
            return;
        }

        // 4. Spread to neighbors
        // Increased attempts from 3 to 5
        for(let i=0; i<5; i++) {
            const rx = x + Math.floor(Math.random() * 3) - 1;
            const ry = y + Math.floor(Math.random() * 3) - 1;
            const rz = z + Math.floor(Math.random() * 3) - 1;

            const targetId = this.chunkManager.getBlock(rx, ry, rz);
            
            // Only spread into Air
            if (targetId === 0) { 
                // Check neighbors of target for flammability to attach to
                const attachment = this.findFlammableAttachment(rx, ry, rz);
                if (attachment !== null) {
                    // Increased spread chance from 0.05 (5%) to 0.3 (30%)
                    if (Math.random() < 0.3) {
                        this.queueUpdate(updates, rx, ry, rz, 63, attachment);
                    }
                }
            }
        }
    }

    findFlammableAttachment(x, y, z) {
        // Check Floor (y-1) -> Meta 0
        if (this.isFlammable(this.chunkManager.getBlock(x, y - 1, z))) return 0;
        
        // Check North (z-1) -> Meta 1
        if (this.isFlammable(this.chunkManager.getBlock(x, y, z - 1))) return 1;
        
        // Check South (z+1) -> Meta 2
        if (this.isFlammable(this.chunkManager.getBlock(x, y, z + 1))) return 2;
        
        // Check East (x+1) -> Meta 3
        if (this.isFlammable(this.chunkManager.getBlock(x + 1, y, z))) return 3;
        
        // Check West (x-1) -> Meta 4
        if (this.isFlammable(this.chunkManager.getBlock(x - 1, y, z))) return 4;

        return null;
    }

    processLavaIgnition(x, y, z, updates) {
        const rx = x + Math.floor(Math.random() * 3) - 1;
        const ry = y + Math.floor(Math.random() * 3) - 1;
        const rz = z + Math.floor(Math.random() * 3) - 1;

        if (this.chunkManager.getBlock(rx, ry, rz) === 0) {
            const attachment = this.findFlammableAttachment(rx, ry, rz);
            if (attachment !== null) {
                if (Math.random() < 0.02) {
                    this.queueUpdate(updates, rx, ry, rz, 63, attachment);
                }
            }
        }
    }

    queueUpdate(updates, x, y, z, id, meta) {
        const key = `${x},${y},${z}`;
        if (!updates.has(key)) {
            updates.set(key, {x, y, z, id, meta});
        }
    }
}
