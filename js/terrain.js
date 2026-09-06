import { BetaTerrain } from './worldgen/betaTerrain.js';
import { parseMinecraftSeed } from './worldgen/javaRandom.js';

let terrainGen = null;
let currentSeedVal = 0n;

export function initTerrain(seed) {
    currentSeedVal = parseMinecraftSeed(seed);
    terrainGen = new BetaTerrain(currentSeedVal);
}

export function getTerrainData(wx, wz) {
    if (!terrainGen) initTerrain(0n);
    return terrainGen.getColumnData(wx, wz);
}

export function getWorldgenSignature(seed) {
    const s = parseMinecraftSeed(seed);
    const gen = new BetaTerrain(s);
    const pts = [
        [0, 0], [16, 16], [128, -64], [-255, 90], [1024, 1024],
        [777, -777], [-2048, 12], [42, 4096]
    ];
    const sample = pts.map(([x, z]) => {
        const d = gen.getColumnData(x, z);
        return `${x},${z}:${d.y}:${d.biome}`;
    });
    return sample.join('|');
}