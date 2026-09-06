// js/chunkManager.js
import { CHUNK_SIZE, MAX_LIGHT } from './constants.js';
import { getChunkKey } from './utils.js';
import { isTerrainBlockId } from './blocks.js';

export class Chunk {
    constructor(cx, cy, cz) {
        this.cx = cx; this.cy = cy; this.cz = cz;
        this.data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        this.metadata = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        this.light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE); // Light buffer
        this.isModified = false;
        this.isGenerated = false;
        this.modifiedIndices = new Set();
    }

    getBlock(lx, ly, lz) {
        if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
        const idx = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
        const raw = this.data[idx];
        if (!isTerrainBlockId(raw)) {
            this.data[idx] = 0;
            return 0;
        }
        return raw;
    }

    setBlock(lx, ly, lz, id) {
        if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
        const index = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
        const runtimeId = Number(id);
        this.data[index] = Number.isFinite(runtimeId) ? runtimeId : 0;
        this.isModified = true;
        
        if (!this.modifiedIndices) this.modifiedIndices = new Set();
        this.modifiedIndices.add(index);
    }
    
    getMetadata(lx, ly, lz) {
        if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
        return this.metadata[lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE];
    }

    setMetadata(lx, ly, lz, meta) {
        if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
        const index = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
        this.metadata[index] = meta;
    }

    getLight(lx, ly, lz) {
        if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
        return this.light[lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE];
    }

    setLight(lx, ly, lz, val) {
        if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
        const index = lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
        this.light[index] = val;
    }
}

export class ChunkManager {
    constructor() {
        this.chunks = new Map();
    }

    clear() {
        this.chunks.clear();
    }

    addChunk(cx, cy, cz, data) {
        const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        let chunk = this.chunks.get(key);
        if (!chunk) {
            chunk = new Chunk(cx, cy, cz);
            this.chunks.set(key, chunk);
        }
        
        if (data) {
            for (let i = 0; i < data.length; i++) {
                const runtimeId = Number(data[i]);
                chunk.data[i] = Number.isFinite(runtimeId) ? runtimeId : 0;
            }
            chunk.isGenerated = true;
        }
        return chunk;
    }
    
    // Updated to accept light data
    addChunkData(cx, cy, cz, data, metadata, light) {
        const c = this.addChunk(cx, cy, cz, data);
        if (metadata) c.metadata.set(metadata);
        if (light) c.light.set(light);
        else c.light.fill(MAX_LIGHT);
        return c;
    }

    hasChunk(cx, cy, cz) {
        const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        return this.chunks.has(key);
    }

    getChunk(cx, cy, cz) {
        const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        return this.chunks.get(key);
    }

    getChunkByKey(key) {
        return this.chunks.get(key);
    }

    removeChunk(cx, cy, cz) {
        const key = getChunkKey(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        this.chunks.delete(key);
    }

    getBlock(x, y, z) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return 0;

        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

        return chunk.getBlock(lx, ly, lz);
    }

    setBlock(x, y, z, id) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        
        let chunk = this.getChunk(cx, cy, cz);
        if (!chunk) chunk = this.addChunk(cx, cy, cz);

        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

        chunk.setBlock(lx, ly, lz, id);
    }
    
    getMetadata(x, y, z) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return 0;
        
        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        
        return chunk.getMetadata(lx, ly, lz);
    }

    setMetadata(x, y, z, meta) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        
        let chunk = this.getChunk(cx, cy, cz);
        if (!chunk) chunk = this.addChunk(cx, cy, cz);
        
        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        
        chunk.setMetadata(lx, ly, lz, meta);
    }

    // New Light Methods
    getLight(x, y, z) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return MAX_LIGHT; // Default to full light if chunk missing (prevents black voids)
        
        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        
        return chunk.getLight(lx, ly, lz);
    }

    setLight(x, y, z, val) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        
        let chunk = this.getChunk(cx, cy, cz);
        if (!chunk) chunk = this.addChunk(cx, cy, cz);
        
        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = (y % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        
        chunk.setLight(lx, ly, lz, val);
    }

    getHighestBlockY(x, z) {
        for (let y = 127; y >= 0; y--) {
            if (this.getBlock(x, y, z) !== 0) return y + 1;
        }
        return 0;
    }
}
