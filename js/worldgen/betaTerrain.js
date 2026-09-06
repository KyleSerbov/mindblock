import { NoiseOctaves, NoiseOctaves2 } from './betaNoise.js';
import { JavaRandom, toSigned64 } from './javaRandom.js';

const SEA_LEVEL = 63;

function clamp(v, min, max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
}

function biomeFrom(temp, humidity) {
    const h = humidity * temp;
    if (temp < 0.1) return 'tundra';
    if (h < 0.2) return temp < 0.5 ? 'tundra' : (temp < 0.95 ? 'savanna' : 'desert');
    if (h > 0.5 && temp < 0.7) return 'swampland';
    if (temp < 0.5) return 'taiga';
    if (temp < 0.97) return h < 0.35 ? 'shrubland' : 'forest';
    return h < 0.45 ? 'plains' : (h < 0.9 ? 'seasonal_forest' : 'rainforest');
}

export class BetaTerrain {
    constructor(seed) {
        const signed = toSigned64(BigInt(seed));
        this.seed = signed;
        const worldRand = new JavaRandom(signed);
        this.noiseK = new NoiseOctaves(worldRand, 16);
        this.noiseL = new NoiseOctaves(worldRand, 16);
        this.noiseM = new NoiseOctaves(worldRand, 8);
        this.noiseN = new NoiseOctaves(worldRand, 4);
        this.noiseO = new NoiseOctaves(worldRand, 4);
        this.noiseA = new NoiseOctaves(worldRand, 10);
        this.noiseB = new NoiseOctaves(worldRand, 16);
        this.noiseC = new NoiseOctaves(worldRand, 8);
        this.tempNoise = new NoiseOctaves2(toSigned64(signed * 9871n), 4);
        this.humidityNoise = new NoiseOctaves2(toSigned64(signed * 39811n), 4);
        this.auxNoise = new NoiseOctaves2(toSigned64(signed * 543321n), 2);
        this.surfaceCache = new Map();
        this.q = null;
        this.d = null;
        this.e = null;
        this.f = null;
        this.g = null;
        this.h = null;
    }

    getBiomeData(wx, wz) {
        const tempA = this.tempNoise.generate(null, wx, wz, 1, 1, 0.02500000037252903, 0.02500000037252903, 0.25)[0];
        const rainA = this.humidityNoise.generate(null, wx, wz, 1, 1, 0.05000000074505806, 0.05000000074505806, 1.0 / 3.0)[0];
        const aux = this.auxNoise.generate(null, wx, wz, 1, 1, 0.25, 0.25, 0.5882352941176471)[0] * 1.1 + 0.5;

        let temp = (tempA * 0.15 + 0.7) * 0.99 + aux * 0.01;
        let humidity = (rainA * 0.15 + 0.5) * 0.998 + aux * 0.002;

        temp = 1.0 - (1.0 - temp) * (1.0 - temp);
        temp = clamp(temp, 0, 1);
        humidity = clamp(humidity, 0, 1);
        const biome = biomeFrom(temp, humidity);
        
        // Debug: log raw values for world (0,0) to investigate biome mismatch
        if (wx === 0 && wz === 0 && typeof process !== 'undefined' && process?.env?.PARITY_TRACE_RNG === '1') {
            console.log(`[DEBUG] getBiomeData(0,0): tempA=${tempA.toFixed(9)}, rainA=${rainA.toFixed(9)}, aux=${aux.toFixed(9)}, temp=${temp.toFixed(9)}, humidity=${humidity.toFixed(9)}, biome=${biome}`);
        }
        
        return { temp, humidity, biome };
    }

    floorDiv(n, d) {
        const q = Math.trunc(n / d);
        if (n >= 0 || n % d === 0) return q;
        return q - 1;
    }

    generateDensityField(out, i, j, k, l, i1, j1, temp, rain) {
        const total = l * i1 * j1;
        if (!out || out.length !== total) out = new Float64Array(total);

        const d0 = 684.412;
        const d1 = 684.412;
        this.g = this.noiseA.generateNoiseArray(this.g, i, 10.0, k, l, 1, j1, 1.121, 1.0, 1.121);
        this.h = this.noiseB.generateNoiseArray(this.h, i, 10.0, k, l, 1, j1, 200.0, 1.0, 200.0);
        this.d = this.noiseM.generateNoiseArray(this.d, i, j, k, l, i1, j1, d0 / 80.0, d1 / 160.0, d0 / 80.0);
        this.e = this.noiseK.generateNoiseArray(this.e, i, j, k, l, i1, j1, d0, d1, d0);
        this.f = this.noiseL.generateNoiseArray(this.f, i, j, k, l, i1, j1, d0, d1, d0);

        let k1 = 0;
        let l1 = 0;
        const i2 = Math.floor(16 / l);

        for (let j2 = 0; j2 < l; ++j2) {
            const k2 = j2 * i2 + i2 / 2;
            for (let l2 = 0; l2 < j1; ++l2) {
                const i3 = l2 * i2 + i2 / 2;
                const d2 = temp[k2 * 16 + i3];
                const d3 = rain[k2 * 16 + i3] * d2;
                let d4 = 1.0 - d3;
                d4 *= d4;
                d4 *= d4;
                d4 = 1.0 - d4;

                let d5 = (this.g[l1] + 256.0) / 512.0;
                d5 *= d4;
                if (d5 > 1.0) d5 = 1.0;

                let d6 = this.h[l1] / 8000.0;
                if (d6 < 0.0) d6 = -d6 * 0.3;
                d6 = d6 * 3.0 - 2.0;
                if (d6 < 0.0) {
                    d6 /= 2.0;
                    if (d6 < -1.0) d6 = -1.0;
                    d6 /= 1.4;
                    d6 /= 2.0;
                    d5 = 0.0;
                } else {
                    if (d6 > 1.0) d6 = 1.0;
                    d6 /= 8.0;
                }

                if (d5 < 0.0) d5 = 0.0;
                d5 += 0.5;
                d6 = d6 * i1 / 16.0;
                const d7 = i1 / 2.0 + d6 * 4.0;
                ++l1;

                for (let j3 = 0; j3 < i1; ++j3) {
                    let d8;
                    let d9 = (j3 - d7) * 12.0 / d5;
                    if (d9 < 0.0) d9 *= 4.0;
                    const d10 = this.e[k1] / 512.0;
                    const d11 = this.f[k1] / 512.0;
                    const d12 = (this.d[k1] / 10.0 + 1.0) / 2.0;
                    if (d12 < 0.0) d8 = d10;
                    else if (d12 > 1.0) d8 = d11;
                    else d8 = d10 + (d11 - d10) * d12;
                    d8 -= d9;
                    if (j3 > i1 - 4) {
                        const d13 = Number(Math.fround(Math.fround(j3 - (i1 - 4)) / Math.fround(3.0)));
                        d8 = d8 * (1.0 - d13) + -10.0 * d13;
                    }
                    out[k1] = d8;
                    ++k1;
                }
            }
        }
        return out;
    }

    buildSurfaceChunkCache(cx, cz) {
        const climateTemp = new Float64Array(256);
        const climateRain = new Float64Array(256);
        const biome = new Array(256);
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                const idx = x * 16 + z;
                const b = this.getBiomeData(cx * 16 + x, cz * 16 + z);
                climateTemp[idx] = b.temp;
                climateRain[idx] = b.humidity;
                biome[idx] = b.biome;
            }
        }

        const b0 = 4;
        const kSize = b0 + 1;
        const b2 = 17;
        const lSize = b0 + 1;
        this.q = this.generateDensityField(this.q, cx * b0, 0, cz * b0, kSize, b2, lSize, climateTemp, climateRain);
        const blocks = new Uint8Array(32768);

        for (let i1 = 0; i1 < b0; ++i1) {
            for (let j1 = 0; j1 < b0; ++j1) {
                for (let k1 = 0; k1 < 16; ++k1) {
                    const d0 = 0.125;
                    let d1 = this.q[((i1 + 0) * lSize + j1 + 0) * b2 + k1 + 0];
                    let d2 = this.q[((i1 + 0) * lSize + j1 + 1) * b2 + k1 + 0];
                    let d3 = this.q[((i1 + 1) * lSize + j1 + 0) * b2 + k1 + 0];
                    let d4 = this.q[((i1 + 1) * lSize + j1 + 1) * b2 + k1 + 0];
                    const d5 = (this.q[((i1 + 0) * lSize + j1 + 0) * b2 + k1 + 1] - d1) * d0;
                    const d6 = (this.q[((i1 + 0) * lSize + j1 + 1) * b2 + k1 + 1] - d2) * d0;
                    const d7 = (this.q[((i1 + 1) * lSize + j1 + 0) * b2 + k1 + 1] - d3) * d0;
                    const d8 = (this.q[((i1 + 1) * lSize + j1 + 1) * b2 + k1 + 1] - d4) * d0;
                    for (let l1 = 0; l1 < 8; ++l1) {
                        const d9 = 0.25;
                        let d10 = d1;
                        let d11 = d2;
                        const d12 = (d3 - d1) * d9;
                        const d13 = (d4 - d2) * d9;
                        for (let i2 = 0; i2 < 4; ++i2) {
                            let j2 = (i2 + i1 * 4 << 11) | (j1 * 4 << 7) | (k1 * 8 + l1);
                            const short1 = 128;
                            const d14 = 0.25;
                            let d15 = d10;
                            const d16 = (d11 - d10) * d14;
                            for (let k2 = 0; k2 < 4; ++k2) {
                                let id = 0;
                                if (k1 * 8 + l1 < 64) id = 9;
                                if (d15 > 0.0) id = 1;
                                blocks[j2] = id;
                                j2 += short1;
                                d15 += d16;
                            }
                            d10 += d12;
                            d11 += d13;
                        }
                        d1 += d5;
                        d2 += d6;
                        d3 += d7;
                        d4 += d8;
                    }
                }
            }
        }

        const d0 = 0.03125;
        const r = this.noiseN.generateNoiseArray(null, cx * 16, cz * 16, 0.0, 16, 16, 1, d0, d0, 1.0);
        const s = this.noiseN.generateNoiseArray(null, cx * 16, 109.0134, cz * 16, 16, 1, 16, d0, 1.0, d0);
        const t = this.noiseO.generateNoiseArray(null, cx * 16, cz * 16, 0.0, 16, 16, 1, d0 * 2.0, d0 * 2.0, d0 * 2.0);
        const rand = new JavaRandom(BigInt(cx) * 341873128712n + BigInt(cz) * 132897987541n);

        for (let k = 0; k < 16; ++k) {
            for (let l = 0; l < 16; ++l) {
                const idx = k + l * 16;
                const isDesert = biome[k * 16 + l] === 'desert';
                const flag = r[idx] + rand.nextDouble() * 0.2 > 0.0;
                const flag1 = s[idx] + rand.nextDouble() * 0.2 > 3.0;
                const i1 = Math.floor(t[idx] / 3.0 + 3.0 + rand.nextDouble() * 0.25);
                let j1 = -1;
                let b1 = isDesert ? 12 : 2;
                let b2 = isDesert ? 12 : 3;

                for (let y = 127; y >= 0; --y) {
                    const l1 = (k * 16 + l) * 128 + y;
                    if (y <= rand.nextInt(5)) {
                        blocks[l1] = 7;
                    } else {
                        const b3 = blocks[l1];
                        if (b3 === 0) {
                            j1 = -1;
                        } else if (b3 === 1) {
                            if (j1 === -1) {
                                if (i1 <= 0) {
                                    b1 = 0;
                                    b2 = 1;
                                } else if (y >= 60 && y <= 65) {
                                    b1 = isDesert ? 12 : 2;
                                    b2 = isDesert ? 12 : 3;
                                    if (flag1) {
                                        b1 = 0;
                                        b2 = 13;
                                    }
                                    if (flag) {
                                        b1 = 12;
                                        b2 = 12;
                                    }
                                }
                                if (y < 64 && b1 === 0) b1 = 9;
                                j1 = i1;
                                blocks[l1] = y >= 63 ? b1 : b2;
                            } else if (j1 > 0) {
                                --j1;
                                blocks[l1] = b2;
                                if (j1 === 0 && b2 === 12) {
                                    j1 = rand.nextInt(4);
                                    b2 = 24;
                                }
                            }
                        }
                    }
                }
            }
        }

        const heights = new Int16Array(256);
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                const idx = x * 16 + z;
                let yFound = -1;
                for (let y = 127; y >= 0; y--) {
                    const id = blocks[y + z * 128 + x * 128 * 16];
                    if (id !== 0 && id !== 8 && id !== 9) {
                        yFound = y;
                        break;
                    }
                }
                heights[idx] = yFound;
            }
        }
        this.surfaceCache.set(`${cx},${cz}`, heights);
        return heights;
    }

    getSurfaceY(wx, wz) {
        const cx = this.floorDiv(wx, 16);
        const cz = this.floorDiv(wz, 16);
        const key = `${cx},${cz}`;
        const heights = this.surfaceCache.get(key) ?? this.buildSurfaceChunkCache(cx, cz);
        const lx = ((wx % 16) + 16) % 16;
        const lz = ((wz % 16) + 16) % 16;
        return heights[lx * 16 + lz];
    }

    getColumnData(wx, wz) {
        const biome = this.getBiomeData(wx, wz);
        const y = this.getSurfaceY(wx, wz);
        return {
            y,
            temperature: biome.temp,
            humidity: biome.humidity,
            biome: biome.biome,
            isDesert: biome.biome === 'desert',
            isSnow: biome.biome === 'tundra' || biome.biome === 'taiga',
            vegetationDensity: clamp((biome.humidity * 0.8 + (1 - Math.abs(biome.temp - 0.6)) * 0.2), 0, 1)
        };
    }

    getTemperatures(adouble, wx, wz, width, height) {
        if (!adouble || adouble.length < width * height) adouble = new Float64Array(width * height);
        for (let x = 0; x < width; x++) {
            for (let z = 0; z < height; z++) {
                adouble[x * height + z] = this.getBiomeData(wx + x, wz + z).temp;
            }
        }
        return adouble;
    }
}

export function getChunkPopulationSeed(worldSeed, cx, cz) {
    const rand = new JavaRandom(worldSeed);
    const xMul = toSigned64(rand.nextLong() / 2n * 2n + 1n);
    const zMul = toSigned64(rand.nextLong() / 2n * 2n + 1n);
    return toSigned64(BigInt(cx) * xMul + BigInt(cz) * zMul ^ BigInt(worldSeed));
}

export const BETA_SEA_LEVEL = SEA_LEVEL;
