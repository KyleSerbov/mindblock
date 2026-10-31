import { CHUNK_SIZE, WORLD_DEPTH, WORLD_HEIGHT } from '../constants.js';
import { ChunkManager } from '../chunkManager.js';
import { BETA_SEA_LEVEL, BetaTerrain } from './betaTerrain.js';
import { JavaRandom, parseMinecraftSeed, toSigned64 } from './javaRandom.js';
import { NoiseOctaves } from './betaNoise.js';
import * as MathHelper from './mathHelper.js';
import { isBlockOpaque, isTerrainBlockId, isCactusId, toBetaCompatibleBlockId, fromBetaCompatibleBlockId } from '../blocks.js';

const WATER_LEVEL = BETA_SEA_LEVEL;
const COLUMN_COUNT_Y = 8; // 8 * 16 = 128 layers (y=0..127)
const DEFAULT_DECORATORS = [
  'lakes',
  'dungeons',
  'clay',
  'dirt',
  'gravel',
  'coal',
  'iron',
  'gold',
  'redstone',
  'diamond',
  'lapis',
  'trees',
  'flowers',
  'grass',
  'dead_bush',
  'mushrooms',
  'reeds',
  'cactus',
  'pumpkin',
  'liquids',
  'snow'
];
const ENV = (typeof process !== 'undefined' && process?.env) ? process.env : {};
const ENABLED_DECORATORS = new Set(
  (ENV.PARITY_FEATURES && ENV.PARITY_FEATURES.trim().length > 0
    ? ENV.PARITY_FEATURES
    : DEFAULT_DECORATORS.join(','))
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
);
const JAVA_PI_F = Math.fround(3.1415927);
// Production default = full parity (all steps and decorators on). Set env to '1' only for debugging.
const DISABLE_POPULATE_CHUNK = ENV.PARITY_DISABLE_POPULATE === '1';
const DISABLE_REPLACE_BLOCKS = ENV.PARITY_DISABLE_REPLACE === '1';
const DISABLE_CAVES = ENV.PARITY_DISABLE_CAVES === '1';
// Runtime worldgen should use full provider-like decorate coverage.
// Parity dump scripts set PARITY_POP_SCOPE=self explicitly for 1:1 chunk-dump comparison.
const POPULATE_SCOPE = (ENV.PARITY_POP_SCOPE ?? 'full').trim().toLowerCase();
// Populate order: must match ref. Poseidon dump may populate only center or all 4; default nw,w,n,c for 3x3 prereq.
const POPULATE_ORDER = (ENV.PARITY_POP_ORDER ?? 'nw,w,n,c')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const PREGEN_MODE = (ENV.PARITY_PREGEN_MODE ?? '3x3').trim().toLowerCase();
const TRACE_RNG = ENV.PARITY_TRACE_RNG === '1';
const TRACE_RNG_CALLER = ENV.PARITY_TRACE_RNG_CALLER === '1';
const FLOW_MAX_DEPTH = Number.parseInt(ENV.PARITY_FLOW_MAX_DEPTH ?? '1024', 10);
const FLOW_MAX_VISITS_PER_CELL = Number.parseInt(ENV.PARITY_FLOW_MAX_VISITS_PER_CELL ?? '512', 10);
const FLOW_WATER_LEDGE_SOUTH_FANOUT = ENV.PARITY_FLOW_WATER_LEDGE_SOUTH_FANOUT !== '0';
const FLOW_LAVA_SLOW_HASH = ENV.PARITY_FLOW_LAVA_SLOW_HASH !== '0';
const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

/** When TRACE_RNG, wraps rng so every nextInt/nextLong/nextDouble/nextFloat/setSeed is logged to harness._rngTrace. */
function makeRngTraceProxy(rng, harness, cx, cz) {
  const getCaller = () => {
    if (!TRACE_RNG_CALLER) return null;
    const stack = new Error().stack;
    if (!stack) return null;
    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const s = lines[i].trim();
      if (s.includes('makeRngTraceProxy')) continue;
      if (s.includes('.push ') || s.includes(' push ')) continue;
      if (s.includes('Object.nextInt') || s.includes('Object.nextLong') || s.includes('Object.nextDouble') || s.includes('Object.nextFloat') || s.includes('Object.setSeed')) continue;
      const m = s.match(/at\s+([^\s(]+)/);
      if (m && m[1]) return m[1];
      return s;
    }
    return null;
  };
  const push = (method, arg, ret) => {
    if (!harness._rngTrace) harness._rngTrace = [];
    // Use null instead of undefined so JSON.stringify includes it (matches Poseidon trace format)
    harness._rngTrace.push({ 
      i: harness._rngTrace.length, 
      cx, 
      cz, 
      method, 
      arg: arg === undefined ? null : arg, 
      ret: ret === undefined ? null : ret,
      caller: getCaller()
    });
  };
  return {
    setSeed(seed) {
      rng.setSeed(seed);
      push('setSeed', String(seed), null);
    },
    nextInt(bound) {
      const ret = rng.nextInt(bound);
      push('nextInt', bound, ret);
      return ret;
    },
    nextLong() {
      const ret = rng.nextLong();
      push('nextLong', null, String(ret));
      return ret;
    },
    nextDouble() {
      const ret = rng.nextDouble();
      push('nextDouble', null, ret);
      return ret;
    },
    nextFloat() {
      const ret = rng.nextFloat();
      // Format to match Java's float string representation (Float.toString())
      // Java uses 7-8 significant digits, so use toPrecision(8) to match
      const formattedRet = parseFloat(ret.toPrecision(8));
      push('nextFloat', null, formattedRet);
      return ret; // Return original value for actual worldgen calculations
    }
  };
}

function chunkLocalIndex(lx, ly, lz) {
  return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
}

function flowDirToXZ(x, z, dir) {
  if (dir === 0) return { nx: x - 1, nz: z };
  if (dir === 1) return { nx: x + 1, nz: z };
  if (dir === 2) return { nx: x, nz: z - 1 };
  return { nx: x, nz: z + 1 };
}

function biomeNameFromClimateRawFloat(temp, humidity) {
  const t = Math.fround(temp);
  const h0 = Math.fround(humidity);
  const h = Math.fround(h0 * t);
  if (t < Math.fround(0.1)) return 'tundra';
  if (h < Math.fround(0.2)) return t < Math.fround(0.5) ? 'tundra' : (t < Math.fround(0.95) ? 'savanna' : 'desert');
  if (h > Math.fround(0.5) && t < Math.fround(0.7)) return 'swampland';
  if (t < Math.fround(0.5)) return 'taiga';
  if (t < Math.fround(0.97)) return h < Math.fround(0.35) ? 'shrubland' : 'forest';
  if (h < Math.fround(0.45)) return 'plains';
  return h < Math.fround(0.9) ? 'seasonal_forest' : 'rainforest';
}

const BIOME_LOOKUP_64 = (() => {
  const out = new Array(64 * 64);
  for (let tx = 0; tx < 64; tx++) {
    for (let hx = 0; hx < 64; hx++) {
      const t = Math.fround(Math.fround(tx) / Math.fround(63.0));
      const h = Math.fround(Math.fround(hx) / Math.fround(63.0));
      out[tx + hx * 64] = biomeNameFromClimateRawFloat(t, h);
    }
  }
  return out;
})();

function biomeNameFromClimate(temp, humidity) {
  // Match BiomeGenBase.getBiomeFromLookup + biomeLookupTable float semantics.
  const tx = Math.max(0, Math.min(63, Math.trunc(temp * 63.0)));
  const hx = Math.max(0, Math.min(63, Math.trunc(humidity * 63.0)));
  return BIOME_LOOKUP_64[tx + hx * 64];
}

export function toBetaBlockId(id) {
  return toBetaCompatibleBlockId(id);
}

export function fromBetaBlockId(id) {
  return fromBetaCompatibleBlockId(id);
}

function getNeighborRing(cx, cz) {
  const out = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      out.push({ cx: cx + dx, cz: cz + dz });
    }
  }
  out.sort((a, b) => a.cz - b.cz || a.cx - b.cx);
  return out;
}

export class BetaParityHarness {
  constructor(seed) {
    this.seed = parseMinecraftSeed(seed);
    this.terrain = new BetaTerrain(this.seed);
    this.chunkManager = new ChunkManager();
    // Match ChunkProviderGenerate constructor order using one shared RNG stream.
    const worldRand = new JavaRandom(this.seed);
    this.noiseK = new NoiseOctaves(worldRand, 16);
    this.noiseL = new NoiseOctaves(worldRand, 16);
    this.noiseM = new NoiseOctaves(worldRand, 8);
    this.noiseN = new NoiseOctaves(worldRand, 4);
    this.noiseO = new NoiseOctaves(worldRand, 4);
    this.noiseA = new NoiseOctaves(worldRand, 10);
    this.noiseB = new NoiseOctaves(worldRand, 16);
    this.noiseC = new NoiseOctaves(worldRand, 8);
    /** @type {{ [key: string]: number }} k1 (tree attempt modifier) per chunk, set by decorateTrees for parity checks */
    this._treeK1ByChunk = Object.create(null);

    // Legacy names kept for existing generation code paths.
    this.caveNoiseA = this.noiseK;
    this.caveNoiseB = this.noiseL;
    this.gravelNoise = this.noiseN;
    this.surfaceNoise = this.noiseN;
    this.q = null;
    this.d = null;
    this.e = null;
    this.f = null;
    this.g = null;
    this.h = null;
    this.instaFall = false;
    this.liquidSources = [];
    this._flowTickCtx = null;
    this._lastChunkCX = Number.NaN;
    this._lastChunkCY = Number.NaN;
    this._lastChunkCZ = Number.NaN;
    this._lastChunkRef = null;
    this._lastLoadedColCX = Number.NaN;
    this._lastLoadedColCZ = Number.NaN;
  }

  buildBiomeClimateArrays(cx, cz) {
    // Match WorldChunkManager.a(...): batch-generate temp/rain/c then blend+clamp.
    const temperature = this.terrain.tempNoise.generate(
      null,
      cx * 16,
      cz * 16,
      16,
      16,
      0.02500000037252903,
      0.02500000037252903,
      0.25
    );
    const rain = this.terrain.humidityNoise.generate(
      null,
      cx * 16,
      cz * 16,
      16,
      16,
      0.05000000074505806,
      0.05000000074505806,
      0.3333333333333333
    );
    const c = this.terrain.auxNoise.generate(
      null,
      cx * 16,
      cz * 16,
      16,
      16,
      0.25,
      0.25,
      0.5882352941176471
    );
    const outTemp = new Float64Array(256);
    const outRain = new Float64Array(256);
    for (let i = 0; i < 256; i++) {
      const d0 = c[i] * 1.1 + 0.5;
      let d1 = 0.01;
      let d2 = 1.0 - d1;
      let d3 = (temperature[i] * 0.15 + 0.7) * d2 + d0 * d1;
      d1 = 0.002;
      d2 = 1.0 - d1;
      let d4 = (rain[i] * 0.15 + 0.5) * d2 + d0 * d1;
      d3 = 1.0 - (1.0 - d3) * (1.0 - d3);
      if (d3 < 0.0) d3 = 0.0;
      if (d4 < 0.0) d4 = 0.0;
      if (d3 > 1.0) d3 = 1.0;
      if (d4 > 1.0) d4 = 1.0;
      outTemp[i] = d3;
      outRain[i] = d4;
    }
    return { temperature: outTemp, rain: outRain };
  }

  generateDensityField(adouble, i, j, k, l, i1, j1, adouble1, adouble2) {
    const total = l * i1 * j1;
    if (!adouble || adouble.length !== total) adouble = new Float64Array(total);

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
    const i2Half = Math.floor(i2 / 2);

    for (let j2 = 0; j2 < l; ++j2) {
      const k2 = j2 * i2 + i2Half;
      for (let l2 = 0; l2 < j1; ++l2) {
        const i3 = l2 * i2 + i2Half;
        const idx = k2 * 16 + i3;
        const d2 = adouble1[idx];
        const d3 = adouble2[idx] * d2;
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
        d6 = (d6 * i1) / 16.0;
        const d7 = i1 / 2.0 + d6 * 4.0;
        ++l1;

        for (let j3 = 0; j3 < i1; ++j3) {
          let d8 = 0.0;
          let d9 = ((j3 - d7) * 12.0) / d5;
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
          adouble[k1] = d8;
          ++k1;
        }
      }
    }
    return adouble;
  }

  generateBaseTerrainColumn(cx, cz) {
    const b0 = 4;
    const b1 = 64;
    const k = b0 + 1;
    const b2 = 17;
    const l = b0 + 1;
    const climate = this.buildBiomeClimateArrays(cx, cz);
    this.q = this.generateDensityField(
      this.q,
      cx * b0,
      0,
      cz * b0,
      k,
      b2,
      l,
      climate.temperature,
      climate.rain
    );

    for (let i1 = 0; i1 < b0; ++i1) {
      for (let j1 = 0; j1 < b0; ++j1) {
        for (let k1 = 0; k1 < 16; ++k1) {
          const d0 = 0.125;
          let d1 = this.q[((i1 + 0) * l + j1 + 0) * b2 + k1 + 0];
          let d2 = this.q[((i1 + 0) * l + j1 + 1) * b2 + k1 + 0];
          let d3 = this.q[((i1 + 1) * l + j1 + 0) * b2 + k1 + 0];
          let d4 = this.q[((i1 + 1) * l + j1 + 1) * b2 + k1 + 0];
          const d5 = (this.q[((i1 + 0) * l + j1 + 0) * b2 + k1 + 1] - d1) * d0;
          const d6 = (this.q[((i1 + 0) * l + j1 + 1) * b2 + k1 + 1] - d2) * d0;
          const d7 = (this.q[((i1 + 1) * l + j1 + 0) * b2 + k1 + 1] - d3) * d0;
          const d8 = (this.q[((i1 + 1) * l + j1 + 1) * b2 + k1 + 1] - d4) * d0;

          for (let l1 = 0; l1 < 8; ++l1) {
            const d9 = 0.25;
            let d10 = d1;
            let d11 = d2;
            const d12 = (d3 - d1) * d9;
            const d13 = (d4 - d2) * d9;

            for (let i2 = 0; i2 < 4; ++i2) {
              let d15 = d10;
              const d16 = (d11 - d10) * 0.25;
              for (let k2 = 0; k2 < 4; ++k2) {
                const localX = i2 + i1 * 4;
                const localZ = k2 + j1 * 4;
                const y = k1 * 8 + l1;
                // Match Java: adouble[(i1*4+i2)*16 + j1*4+k2]
                const d17 = climate.temperature[(i1 * 4 + i2) * 16 + j1 * 4 + k2];
                let type = 0;
                if (y < b1) {
                  if (d17 < 0.5 && y >= b1 - 1) {
                    type = 79; // Block.ICE.id (Poseidon)
                  } else {
                    type = 70; // waterStill
                  }
                }
                if (d15 > 0.0) type = 3; // stone (internal)
                if (type !== 0) {
                  this.setGeneratedBlock(cx * 16 + localX, y, cz * 16 + localZ, type, true);
                }
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
  }

  carveCavesColumn(cx, cz) {
    this.applyMapGenCaves(cx, cz);
  }

  applyMapGenCaves(targetCx, targetCz) {
    const baseX = targetCx * CHUNK_SIZE;
    const baseZ = targetCz * CHUNK_SIZE;
    // Java ChunkProviderGenerate: replace (z,x,y). MapGenCaves buffer[(x*16+z)*128+y] = block at (z,x,y); fill and write-back match.
    this.activeCaveBlocks = this.getChunkBlocksBetaOrderReplaceLayout(targetCx, targetCz);
    this.activeCaveTargetCx = targetCx;
    this.activeCaveTargetCz = targetCz;
    const range = 8;
    const rand = new JavaRandom(this.seed);
    rand.setSeed(this.seed);
    const xMul = (rand.nextLong() / 2n) * 2n + 1n;
    const zMul = (rand.nextLong() / 2n) * 2n + 1n;
    // MapGenBase.a iterates j (z) outer, i (x) inner: for (j) for (i) seed = (i*l + j*i1)^worldSeed
    for (let sz = targetCz - range; sz <= targetCz + range; sz++) {
      for (let sx = targetCx - range; sx <= targetCx + range; sx++) {
        const seed = toSigned64((BigInt(sx) * xMul + BigInt(sz) * zMul) ^ this.seed);
        rand.setSeed(seed);
        this.generateCavesForSourceChunk(sx, sz, targetCx, targetCz, rand);
      }
    }
    // Match Poseidon: buffer (lx,lz) filled from (baseX+lz, baseZ+lx), write-back to same world position.
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let y = 0; y <= WORLD_HEIGHT; y++) {
          const i = (lx * 16 + lz) * 128 + y;
          this.setGeneratedBlock(baseX + lz, y, baseZ + lx, fromBetaBlockId(this.activeCaveBlocks[i]), true);
        }
      }
    }
    this.activeCaveBlocks = null;
    this.activeCaveTargetCx = undefined;
    this.activeCaveTargetCz = undefined;
  }

  generateCavesForSourceChunk(sourceCx, sourceCz, targetCx, targetCz, rand) {
    let caveCount = rand.nextInt(rand.nextInt(rand.nextInt(40) + 1) + 1);
    const gate = rand.nextInt(15);
    if (gate !== 0) caveCount = 0;

    for (let i = 0; i < caveCount; i++) {
      const x = sourceCx * 16 + rand.nextInt(16);
      const y = rand.nextInt(rand.nextInt(120) + 8);
      const z = sourceCz * 16 + rand.nextInt(16);
      let branchCount = 1;

      const bigGate = rand.nextInt(4);
      if (bigGate === 0) {
        const bigF = Math.fround(Math.fround(1.0) + Math.fround(Math.fround(rand.nextFloat()) * Math.fround(6.0)));
        this.digCaveBranch(targetCx, targetCz, x, y, z, bigF, 0.0, 0.0, -1, -1, 0.5, rand, null);
        branchCount += rand.nextInt(4);
      }

      for (let b = 0; b < branchCount; b++) {
        const f = Math.fround(
          Math.fround(rand.nextFloat()) * Math.fround(Math.fround(3.1415927) * Math.fround(2.0))
        );
        const f1 = Math.fround(
          Math.fround(Math.fround(rand.nextFloat() - Math.fround(0.5)) * Math.fround(2.0)) / Math.fround(8.0)
        );
        const f2 = Math.fround(
          Math.fround(Math.fround(rand.nextFloat()) * Math.fround(2.0)) + Math.fround(rand.nextFloat())
        );
        const seedBefore = rand.seed;
        this.digCaveBranch(targetCx, targetCz, x, y, z, f2, f, f1, 0, 0, 1.0, rand, seedBefore);
      }
    }
  }

  digCaveBranch(targetCx, targetCz, d0, d1, d2, f, f1, f2, k, l, d3, sourceRand, branchSeedBefore = null) {
    const centerX = targetCx * 16 + 8;
    const centerZ = targetCz * 16 + 8;
    let yaw = Math.fround(f1);
    let pitch = Math.fround(f2);
    const sizeF = Math.fround(f);
    let yawDelta = Math.fround(0.0);
    let pitchDelta = Math.fround(0.0);
    const random = new JavaRandom(sourceRand.nextLong());

    if (l <= 0) {
      const i1 = 8 * 16 - 16;
      l = i1 - random.nextInt(Math.floor(i1 / 4));
    }

    let flag = false;
    if (k === -1) {
      k = Math.floor(l / 2);
      flag = true;
    }

    const splitAt = random.nextInt(Math.floor(l / 2)) + Math.floor(l / 4);
    const damped = random.nextInt(6) === 0;

    for (; k < l; ++k) {
      const theta = Math.fround(Math.fround(Math.fround(k) * Math.fround(3.1415927)) / Math.fround(l));
      const d6 = 1.5 + Number(Math.fround(MathHelper.sin(theta) * sizeF));
      const d7 = d6 * d3;
      const cosPitch = MathHelper.cos(pitch);
      const sinPitch = MathHelper.sin(pitch);

      d0 += Number(Math.fround(Math.fround(MathHelper.cos(yaw)) * Math.fround(cosPitch)));
      d1 += Number(sinPitch);
      d2 += Number(Math.fround(Math.fround(MathHelper.sin(yaw)) * Math.fround(cosPitch)));

      if (damped) pitch = Math.fround(pitch * Math.fround(0.92));
      else pitch = Math.fround(pitch * Math.fround(0.7));

      pitch = Math.fround(pitch + Math.fround(pitchDelta * Math.fround(0.1)));
      yaw = Math.fround(yaw + Math.fround(yawDelta * Math.fround(0.1)));
      pitchDelta = Math.fround(pitchDelta * Math.fround(0.9));
      yawDelta = Math.fround(yawDelta * Math.fround(0.75));
      pitchDelta = Math.fround(
        pitchDelta +
          Math.fround(
            Math.fround(Math.fround(random.nextFloat() - random.nextFloat()) * random.nextFloat()) * Math.fround(2.0)
          )
      );
      yawDelta = Math.fround(
        yawDelta +
          Math.fround(
            Math.fround(Math.fround(random.nextFloat() - random.nextFloat()) * random.nextFloat()) * Math.fround(4.0)
          )
      );

      if (!flag && k === splitAt && sizeF > Math.fround(1.0)) {
        const leftF = Math.fround(Math.fround(random.nextFloat()) * Math.fround(0.5) + Math.fround(0.5));
        const leftYaw = Math.fround(yaw - Math.fround(1.5707964));
        const leftPitch = Math.fround(pitch / Math.fround(3.0));
        const rightF = Math.fround(Math.fround(random.nextFloat()) * Math.fround(0.5) + Math.fround(0.5));
        const rightYaw = Math.fround(yaw + Math.fround(1.5707964));
        const rightPitch = Math.fround(pitch / Math.fround(3.0));
        this.digCaveBranch(
          targetCx,
          targetCz,
          d0,
          d1,
          d2,
          leftF,
          leftYaw,
          leftPitch,
          k,
          l,
          1.0,
          sourceRand,
          null
        );
        this.digCaveBranch(
          targetCx,
          targetCz,
          d0,
          d1,
          d2,
          rightF,
          rightYaw,
          rightPitch,
          k,
          l,
          1.0,
          sourceRand,
          null
        );
        return;
      }

      if (flag || random.nextInt(4) !== 0) {
        const d8 = d0 - centerX;
        const d9 = d2 - centerZ;
        const d10 = l - k;
        const d11 = Number(Math.fround(Math.fround(sizeF + Math.fround(2.0)) + Math.fround(16.0)));
        if (d8 * d8 + d9 * d9 - d10 * d10 > d11 * d11) {
          return;
        }

        if (
          d0 >= centerX - 16.0 - d6 * 2.0 &&
          d2 >= centerZ - 16.0 - d6 * 2.0 &&
          d0 <= centerX + 16.0 + d6 * 2.0 &&
          d2 <= centerZ + 16.0 + d6 * 2.0
        ) {
          let k1 = MathHelper.floor(d0 - d6) - targetCx * 16 - 1;
          let l1 = MathHelper.floor(d0 + d6) - targetCx * 16 + 1;
          let i2 = MathHelper.floor(d1 - d7) - 1;
          let j2 = MathHelper.floor(d1 + d7) + 1;
          let k2 = MathHelper.floor(d2 - d6) - targetCz * 16 - 1;
          let l2 = MathHelper.floor(d2 + d6) - targetCz * 16 + 1;

          if (k1 < 0) k1 = 0;
          if (l1 > 16) l1 = 16;
          if (i2 < 1) i2 = 1;
          if (j2 > 120) j2 = 120;
          if (k2 < 0) k2 = 0;
          if (l2 > 16) l2 = 16;

          let hitWater = false;
          for (let j3 = k1; !hitWater && j3 < l1; ++j3) {
            for (let k3 = k2; !hitWater && k3 < l2; ++k3) {
              for (let l3 = j2 + 1; !hitWater && l3 >= i2 - 1; --l3) {
                if (l3 >= 0 && l3 < 128) {
                  const wx = targetCx * 16 + j3;
                  const wz = targetCz * 16 + k3;
                  const id = this.getCaveBlock(targetCx, targetCz, wx, l3, wz);
                  if (id === 8 || id === 9) hitWater = true;
                  if (l3 !== i2 - 1 && j3 !== k1 && j3 !== l1 - 1 && k3 !== k2 && k3 !== l2 - 1) {
                    l3 = i2;
                  }
                }
              }
            }
          }

          if (!hitWater) {
            for (let j3 = k1; j3 < l1; ++j3) {
              const d12 = (j3 + targetCx * 16 + 0.5 - d0) / d6;
              for (let i3 = k2; i3 < l2; ++i3) {
                const d13 = (i3 + targetCz * 16 + 0.5 - d2) / d6;
                let flag3 = false;
                if (d12 * d12 + d13 * d13 < 1.0) {
                  let yCursor = j2;
                  for (let j4 = j2 - 1; j4 >= i2; --j4) {
                    const d14 = (j4 + 0.5 - d1) / d7;
                    if (d14 > -0.7 && d12 * d12 + d14 * d14 + d13 * d13 < 1.0) {
                      const wx = targetCx * 16 + j3;
                      const wz = targetCz * 16 + i3;
                      // Match Java MapGenCaves i4 pointer semantics: read/write at yCursor, not j4.
                      const b0 = this.getCaveBlock(targetCx, targetCz, wx, yCursor, wz);
                      // Match Java MapGenCaves: do not carve water/stationary_water (Beta 8, 9)
                      if (b0 === 8 || b0 === 9) continue;
                      if (b0 === 2) flag3 = true; // grass
                      if (b0 === 1 || b0 === 3 || b0 === 2) {
                        if (j4 < 10) {
                          this.setCaveBlock(targetCx, targetCz, wx, yCursor, wz, 10); // lava
                        } else {
                          this.setCaveBlock(targetCx, targetCz, wx, yCursor, wz, 0);
                          if (flag3 && this.getCaveBlock(targetCx, targetCz, wx, yCursor - 1, wz) === 3) {
                            this.setCaveBlock(targetCx, targetCz, wx, yCursor - 1, wz, 2);
                          }
                        }
                      }
                    }
                    --yCursor;
                  }
                }
              }
            }
            if (flag) break;
          }
        }
      }
    }
  }

  replaceBlocksForBiome(cx, cz) {
    // Delegate to replaceBlocksWithInputs (javaLayout) so replace logic is 1:1 with Java and with replace-inputs test.
    const d0 = 0.03125;
    const r = this.noiseN.generateNoiseArray(
      null,
      cx * CHUNK_SIZE,
      cz * CHUNK_SIZE,
      0.0,
      16,
      16,
      1,
      d0,
      d0,
      1.0
    );
    const s = this.noiseN.generateNoiseArray(
      null,
      cx * CHUNK_SIZE,
      109.0134,
      cz * CHUNK_SIZE,
      16,
      1,
      16,
      d0,
      1.0,
      d0
    );
    const t = this.noiseO.generateNoiseArray(
      null,
      cx * CHUNK_SIZE,
      cz * CHUNK_SIZE,
      0.0,
      16,
      16,
      1,
      d0 * 2,
      d0 * 2,
      d0 * 2
    );

    // Runtime chunk storage is transposed on X/Z versus Java parity dumps, so swap local X/Z here.
    // Java replace layout still expects (x,z) column at (l*16+k)*128+y.
    const terrainBlocks = new Uint8Array(32768);
    for (let k = 0; k < CHUNK_SIZE; k++) {
      for (let l = 0; l < CHUNK_SIZE; l++) {
        for (let k1 = 0; k1 <= WORLD_HEIGHT; k1++) {
          const blockIndex = (l * 16 + k) * 128 + k1;
          terrainBlocks[blockIndex] = this.chunkManager.getBlock(cx * CHUNK_SIZE + l, k1, cz * CHUNK_SIZE + k) & 0xff;
        }
      }
    }

    // Biomes: column (k,l) idx = k+l*16, [p,q] = Beta IDs from getTerrainData(cx*16+k, cz*16+l).
    const climate = this.buildBiomeClimateArrays(cx, cz);
    const biomes = new Array(256);
    for (let k = 0; k < CHUNK_SIZE; k++) {
      for (let l = 0; l < CHUNK_SIZE; l++) {
        const idx = k + l * CHUNK_SIZE;
        const biomeName = biomeNameFromClimate(climate.temperature[idx], climate.rain[idx]);
        const isDesert = biomeName === 'desert';
        // Beta 1.7.3 keeps grass top block in snowy biomes; snow/ice are added in populate.
        const b1 = isDesert ? 9 : 1;
        const b2 = isDesert ? 9 : 2;
        biomes[idx] = [toBetaBlockId(b1), toBetaBlockId(b2)];
      }
    }

    const replaceOpts = { javaLayout: true };
    if (typeof process !== 'undefined' && process.env.PARITY_DEBUG_REPLACE_RNG === '1') {
      replaceOpts.logSink = [];
      this._replaceRngLog = replaceOpts.logSink;
    }
    if (typeof process !== 'undefined' && process.env.PARITY_LOG_I1 === '1') {
      replaceOpts.firstStoneYPerColumn = (this._replaceFirstStoneYPerColumn = new Array(256));
      replaceOpts.i1PerColumn = (this._replaceI1PerColumn = new Array(256));
    }
    const result = BetaParityHarness.replaceBlocksWithInputs(
      terrainBlocks,
      r,
      s,
      t,
      biomes,
      this.seed,
      cx,
      cz,
      replaceOpts
    );

    // Write back with same X/Z swap used when reading.
    for (let k = 0; k < CHUNK_SIZE; k++) {
      for (let l = 0; l < CHUNK_SIZE; l++) {
        for (let k1 = 0; k1 <= WORLD_HEIGHT; k1++) {
          const blockIndex = (l * 16 + k) * 128 + k1;
          this.setGeneratedBlock(cx * CHUNK_SIZE + l, k1, cz * CHUNK_SIZE + k, result[blockIndex], true);
        }
      }
    }
  }

  /**
   * Run replace-blocks only with provided inputs (e.g. from Java probe).
   * terrainBlocks: Uint8Array(32768) internal block IDs, layout y + z*128 + x*2048.
   * r, s, t: length 256 noise arrays. biomes: 256 entries of [p, q] Beta block IDs.
   * options: optional { logSink: string[] } to record each RNG call ("d 0.123", "i5 2", "i4 1").
   * Returns new Uint8Array (internal IDs) with replace applied in-place on a copy.
   */
  /** Which column (0..255) the log entry at index L belongs to. Matches parser: 3× d, then 128 layers of (1× i5, 0 or 1× i4). */
  static _columnForReplaceLogIndex(log, L) {
    let i = 0;
    for (let col = 0; col < 256; col++) {
      for (let d = 0; d < 3 && i < log.length; d++) {
        if (log[i].startsWith('d ')) i++;
        if (i >= L) return col;
      }
      for (let layer = 0; layer < 128 && i < log.length; layer++) {
        if (log[i].startsWith('i5 ')) i++;
        if (i >= L) return col;
        if (i < log.length && log[i].startsWith('i4 ')) {
          i++;
          if (i >= L) return col;
        }
      }
    }
    return 255;
  }

  static replaceBlocksWithInputs(terrainBlocks, r, s, t, biomes, seed, cx, cz, options = {}) {
    const out = new Uint8Array(terrainBlocks);
    const replaceSeed = toSigned64(BigInt(cx) * 341873128712n + BigInt(cz) * 132897987541n);
    const rawRand = new JavaRandom(replaceSeed);
    const logSink = options.logSink;
    const debugColumn = options.debugColumn; // { k, l }
    const debugStepsOut = options.debugSteps; // optional array to receive steps for debugColumn
    const i4CountPerColumn = options.i4CountPerColumn; // optional length-256 array to record nextInt(4) count per column (k+l*16)
    const flagsPerColumn = options.flagsPerColumn; // optional length-256 array to record flag (r+rand*0.2>0) per column
    const firstStoneYPerColumn = options.firstStoneYPerColumn; // optional length-256, records Y (k1) where first "first_stone" branch was taken
    const i1PerColumn = options.i1PerColumn; // optional length-256, records dirt-band depth i1 per column (for parity debug)
    const javaLayout = options.javaLayout; // if true: l-outer k-inner (match Java buffer (l*16+k)*128+k1), blockIndex/idx as below
    const rand = logSink
      ? {
          nextDouble() {
            const v = rawRand.nextDouble();
            logSink.push(`d ${v}`);
            return v;
          },
          nextInt(bound) {
            const v = rawRand.nextInt(bound);
            logSink.push(`i${bound} ${v}`);
            return v;
          }
        }
      : rawRand;
    const b0 = 64;

    // In jacobo, provideChunk does setSeed(replaceSeed) then generateTerrain then replaceBlocksForBiome.
    // PARITY_REPLACE_LEADING_BURN: 0 = default (first diff at 131 for seed 0); 7 gives first diff at 3.
    const REPLACE_LEADING_BURN = Math.max(0, parseInt(ENV.PARITY_REPLACE_LEADING_BURN ?? '0', 10));
    for (let q = 0; q < REPLACE_LEADING_BURN; q++) rand.nextDouble();

    // Per column: exactly 3 nextDouble (d1, flag1, i1) then 128 nextInt(5) (y 127..0); optionally nextInt(4) when sand at band bottom. Do not add/remove calls — must match jacobo for diff-replace-rng.

    // Java replaceBlocksForBiome loops var8 (x) outer, var9 (z) inner.
    // Noise/biome index is var8 + var9*16, while terrain buffer index is (var9*16 + var8)*128 + y.
    const idxFor = (k, l) => k + l * CHUNK_SIZE;
    const iter = javaLayout
      ? { outer: CHUNK_SIZE, inner: CHUNK_SIZE, idx: idxFor, blockIndex: (k, l, k1) => (l * 16 + k) * 128 + k1 }
      : { outer: CHUNK_SIZE, inner: CHUNK_SIZE, idx: idxFor, blockIndex: (k, l, k1) => k1 + k * 128 + l * 2048 };
    for (let o = 0; o < iter.outer; ++o) {
      for (let i = 0; i < iter.inner; ++i) {
        const k = o;
        const l = i;
        const idx = iter.idx(k, l);
        const d1 = rand.nextDouble();
        const flag = r[idx] + d1 * 0.2 > 0;
        if (flagsPerColumn) flagsPerColumn[idx] = flag;
        const flag1 = s[idx] + rand.nextDouble() * 0.2 > 3;
        // Java (int) truncates toward zero; clamp to 0 so dirt band depth is non-negative.
        const rawI1 = t[idx] / 3 + 3 + rand.nextDouble() * 0.25;
        let i1 = Math.max(0, Math.trunc(rawI1));
        if (i1PerColumn) i1PerColumn[idx] = i1;
        let j1 = -1;
        let b1 = fromBetaBlockId(biomes[idx][0]);
        let b2 = fromBetaBlockId(biomes[idx][1]);
        const isDebugCol = debugColumn && debugColumn.k === k && debugColumn.l === l && debugStepsOut;

        // Surface from top (Java replace uses top-down): first dirt (internal 2) or stone (internal 3) — top of soil/stone.
        // NOTE: This is only used for logging/debugging. The actual replace logic processes multiple surfaces
        // when air gaps reset j1 to -1, matching jacobo's behavior.
        let firstStoneYTop = -1;
        for (let y = WORLD_HEIGHT; y >= WORLD_DEPTH; y--) {
          const id = out[iter.blockIndex(k, l, y)];
          if (id === 2 || id === 3) { // 2 = dirt, 3 = stone (internal); base terrain only has stone
            firstStoneYTop = y;
            break;
          }
        }
        if (firstStoneYPerColumn && firstStoneYTop >= 0) firstStoneYPerColumn[idx] = firstStoneYTop;

        // Java: for(var17 = 127; var17 >= 0; --var17) { if (var17 <= 0 + this.rand.nextInt(5)) bedrock else ... }
        // Match jacobo: process top-to-bottom, reset j1 to -1 on air, set j1 = i1 on stone when j1 === -1
        for (let k1 = WORLD_HEIGHT; k1 >= WORLD_DEPTH; k1--) {
          const blockIndex = iter.blockIndex(k, l, k1);
          const rand5 = rand.nextInt(5);
          const rngCallIdx = logSink ? logSink.length - 1 : undefined;
          if (k1 <= 0 + rand5) {
            out[blockIndex] = 8;
            if (isDebugCol) debugStepsOut.push({ k1, rand5, b3: null, branch: 'bedrock', written: 8, rngCallIdx, j1 });
            continue;
          }

          const b3 = out[blockIndex];
          if (b3 === 0) {
            // Air: reset j1 to -1 (match jacobo: var14 = -1)
            j1 = -1;
            if (isDebugCol) debugStepsOut.push({ k1, rand5, b3: 0, branch: 'air', written: null, rngCallIdx, j1 });
          } else if (b3 === 3) {
            // Stone/dirt: if j1 === -1, this is a new surface hit (match jacobo: if (var14 == -1))
            if (j1 === -1) {
              // New surface: calculate b1/b2 and set j1 = i1 (match jacobo: var14 = var13)
              if (i1 <= 0) {
                b1 = 0;
                b2 = 3;
              } else if (k1 >= b0 - 4 && k1 <= b0 + 1) {
                b1 = fromBetaBlockId(biomes[idx][0]);
                b2 = fromBetaBlockId(biomes[idx][1]);
                if (flag1) b1 = 0;
                if (flag1) b2 = 57;
                if (flag) b1 = 9;
                if (flag) b2 = 9;
              }

              if (k1 < b0 && b1 === 0) {
                b1 = 70;
              }

              j1 = i1;
              if (k1 >= b0 - 1) {
                out[blockIndex] = b1;
              } else {
                out[blockIndex] = b2;
              }
              if (isDebugCol) debugStepsOut.push({ k1, rand5, b3, branch: 'first_stone', written: k1 >= b0 - 1 ? b1 : b2, rngCallIdx, j1, b1, b2, i1, flag, flag1 });
            } else if (j1 > 0) {
              // Dirt band below surface: use j1 (var14) counter, decrement before placing (match jacobo)
              // Java: else if (var14 > 0) { --var14; var3[var18] = var16; }
              --j1;
              out[blockIndex] = b2;
              let rand4 = null;
              if (j1 === 0 && b2 === 9) {
                // Java: if (var14 == 0 && var16 == Block.sand.blockID) { var14 = this.rand.nextInt(4); var16 = (byte)Block.sandStone.blockID; }
                if (i4CountPerColumn) {
                  const colIdx = logSink
                    ? BetaParityHarness._columnForReplaceLogIndex(logSink, logSink.length)
                    : (javaLayout ? k + l * CHUNK_SIZE : k + l * CHUNK_SIZE);
                  i4CountPerColumn[colIdx]++;
                }
                rand4 = rand.nextInt(4);
                j1 = rand4;
                b2 = 65;
              }
              if (isDebugCol) debugStepsOut.push({ k1, rand5, b3, branch: 'cont_stone', written: b2, rngCallIdx, j1, b1, b2, rand4 });
            } else if (isDebugCol) {
              debugStepsOut.push({ k1, rand5, b3, branch: 'stone_skip', written: null, rngCallIdx, j1, b1, b2 });
            }
          }
        }
      }
    }
    return out;
  }

  getTerrainData(wx, wz) {
    return this.terrain.getColumnData(wx, wz);
  }

  getChunkAndLocal(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    let chunk = null;
    if (this._lastChunkRef && this._lastChunkCX === cx && this._lastChunkCY === cy && this._lastChunkCZ === cz) {
      chunk = this._lastChunkRef;
    } else {
      chunk = this.chunkManager.getChunk(cx, cy, cz);
    }
    if (!chunk) {
      chunk = this.chunkManager.addChunk(cx, cy, cz);
      if (!chunk.modifiedIndices) chunk.modifiedIndices = new Set();
    }
    this._lastChunkCX = cx;
    this._lastChunkCY = cy;
    this._lastChunkCZ = cz;
    this._lastChunkRef = chunk;
    if (!chunk._generatedWriteMask) chunk._generatedWriteMask = new Uint8Array(CHUNK_VOLUME);
    if (this._loadedChunkColumns) {
      if (this._lastLoadedColCX !== cx || this._lastLoadedColCZ !== cz) {
        this._loadedChunkColumns.add(`${cx},${cz}`);
        this._lastLoadedColCX = cx;
        this._lastLoadedColCZ = cz;
      }
    }
    const lx = (wx % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = (wy % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = (wz % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const idx = chunkLocalIndex(lx, ly, lz);
    return { chunk, idx };
  }

  setGeneratedBlock(wx, wy, wz, id, overwrite = false) {
    if (wy < WORLD_DEPTH || wy > WORLD_HEIGHT) return;
    // Skip blocks not in blocks.js (section 10.4: skip blocks not in game)
    // Air (0) is always allowed; check if block exists and is a terrain block
    if (id !== 0 && !isTerrainBlockId(id)) {
      return; // Block not in blocks.js - skip entirely (do not place anything, leave existing blocks unchanged)
    }
    const t = this.getChunkAndLocal(wx, wy, wz);
    const debugCell = ENV.PARITY_DEBUG_CELL;
    if (debugCell) {
      const [sx, sy, sz] = debugCell.split(',').map((v) => parseInt(v, 10));
      if (wx === sx && wy === sy && wz === sz) {
        const prev = t.chunk.data[t.idx];
        console.log(`[CELLDBG] stage=${this._currentPopulateStage ?? 'n/a'} x=${wx} y=${wy} z=${wz} prev=${prev} next=${id} overwrite=${overwrite}`);
      }
    }
    const debugBox = ENV.PARITY_DEBUG_BOX;
    if (debugBox) {
      const parts = debugBox.split(',').map((v) => parseInt(v, 10));
      if (parts.length === 6) {
        const [minX, minY, minZ, maxX, maxY, maxZ] = parts;
        if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY && wz >= minZ && wz <= maxZ) {
          const prev = t.chunk.data[t.idx];
          console.log(`[BOXDBG] stage=${this._currentPopulateStage ?? 'n/a'} x=${wx} y=${wy} z=${wz} prev=${prev} next=${id} overwrite=${overwrite}`);
        }
      }
    }
    // When overwrite is false, first writer wins (skip if already modified). When overwrite is true, last writer wins.
    if (!overwrite && t.chunk._generatedWriteMask && t.chunk._generatedWriteMask[t.idx]) return;
    if (!overwrite && t.chunk.data[t.idx] !== 0) return;
    t.chunk.data[t.idx] = id;
    if (t.chunk._generatedWriteMask) t.chunk._generatedWriteMask[t.idx] = 1;
    else t.chunk.modifiedIndices.add(t.idx);

    if (this.instaFall && (id === 9 || id === 57)) {
      let y = wy;
      const canFallThrough = (blockId) => blockId === 0 || blockId === 6 || blockId === 70 || blockId === 51 || blockId === 71;
      while (y > 0 && canFallThrough(this.chunkManager.getBlock(wx, y - 1, wz))) {
        --y;
      }
      if (y !== wy) {
        t.chunk.data[t.idx] = 0;
        if (y > 0) {
          const d = this.getChunkAndLocal(wx, y, wz);
          d.chunk.data[d.idx] = id;
          if (d.chunk._generatedWriteMask) d.chunk._generatedWriteMask[d.idx] = 1;
          else d.chunk.modifiedIndices.add(d.idx);
        }
      }
    }
  }

  getCaveBlock(targetCx, targetCz, wx, wy, wz) {
    if (
      this.activeCaveBlocks &&
      targetCx === this.activeCaveTargetCx &&
      targetCz === this.activeCaveTargetCz
    ) {
      // Buffer layout matches getChunkBlocksBetaOrderReplaceLayout and write-back: (lx,lz) -> world (baseX+lz, baseZ+lx).
      const baseX = targetCx * CHUNK_SIZE;
      const baseZ = targetCz * CHUNK_SIZE;
      const lx = wz - baseZ;
      const lz = wx - baseX;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || wy < 0 || wy > WORLD_HEIGHT) return 0;
      const i = (lx * 16 + lz) * 128 + wy;
      return this.activeCaveBlocks[i];
    }
    return toBetaBlockId(this.chunkManager.getBlock(wx, wy, wz));
  }

  setCaveBlock(targetCx, targetCz, wx, wy, wz, betaId) {
    if (
      this.activeCaveBlocks &&
      targetCx === this.activeCaveTargetCx &&
      targetCz === this.activeCaveTargetCz
    ) {
      const baseX = targetCx * CHUNK_SIZE;
      const baseZ = targetCz * CHUNK_SIZE;
      const lx = wz - baseZ;
      const lz = wx - baseX;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || wy < 0 || wy > WORLD_HEIGHT) return;
      const i = (lx * 16 + lz) * 128 + wy;
      this.activeCaveBlocks[i] = betaId;
      return;
    }
    this.setGeneratedBlock(wx, wy, wz, fromBetaBlockId(betaId), true);
  }

  placeSimpleTree(wx, wy, wz) {
    for (let h = 1; h <= 4; h++) {
      this.setGeneratedBlock(wx, wy + h, wz, 4);
    }
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 3; dy <= 5; dy++) {
          if (Math.abs(dx) + Math.abs(dz) > 3) continue;
          if (dx === 0 && dz === 0 && dy < 5) continue;
          this.setGeneratedBlock(wx + dx, wy + dy, wz + dz, 5);
        }
      }
    }
  }

  pickTreeGeneratorType(biome, rng) {
    // Match BiomeBase/BiomeForest/BiomeRainforest/BiomeTaiga RNG branching.
    if (biome === 'forest') {
      if (rng.nextInt(5) === 0) return 'forest';
      if (rng.nextInt(3) === 0) return 'big';
      return 'trees';
    }
    if (biome === 'rainforest') {
      if (rng.nextInt(3) === 0) return 'big';
      return 'trees';
    }
    if (biome === 'taiga') {
      return rng.nextInt(3) === 0 ? 'taiga1' : 'taiga2';
    }
    return rng.nextInt(10) === 0 ? 'big' : 'trees';
  }

  generateStandardTreeAt(wx, wy, wz, rng) {
    const height = rng.nextInt(3) + 4;
    let clear = true;

    if (wy < 1 || wy + height + 1 > 128) return false;
    for (let y = wy; y <= wy + 1 + height; ++y) {
      let radius = 1;
      if (y === wy) radius = 0;
      if (y >= wy + 1 + height - 2) radius = 2;
      for (let x = wx - radius; x <= wx + radius && clear; ++x) {
        for (let z = wz - radius; z <= wz + radius && clear; ++z) {
          if (y < 0 || y >= 128) {
            clear = false;
            break;
          }
          const id = this.chunkManager.getBlock(x, y, z);
          if (id !== 0 && id !== 5) clear = false;
        }
      }
    }

    if (!clear) return false;
    const below = this.chunkManager.getBlock(wx, wy - 1, wz);
    if ((below !== 1 && below !== 2) || wy >= 128 - height - 1) return false;

    this.setGeneratedBlock(wx, wy - 1, wz, 2, true); // dirt under trunk

    // Match Java WorldGenTrees: i2 from j-3+l to j+l; j1 = i2 - (j+l) = -3..0; k1 = 1 - j1/2 = 2,2,1,1.
    for (let j = 0; j <= 3; j++) {
      const y = wy - 3 + height + j;
      const j1 = j - 3;
      const radius = 1 - Math.trunc(j1 / 2);
      for (let x = wx - radius; x <= wx + radius; ++x) {
        const relX = x - wx;
        for (let z = wz - radius; z <= wz + radius; ++z) {
          const relZ = z - wz;
          if ((Math.abs(relX) !== radius || Math.abs(relZ) !== radius || (rng.nextInt(2) !== 0 && j1 !== 0))) {
            const id = this.chunkManager.getBlock(x, y, z);
            if (!isBlockOpaque(id)) this.setGeneratedBlock(x, y, z, 5, true);
          }
        }
      }
    }
    for (let i = 0; i < height; ++i) {
      const id = this.chunkManager.getBlock(wx, wy + i, wz);
      if (id === 0 || id === 5) this.setGeneratedBlock(wx, wy + i, wz, 4, true); // normal wood log
    }
    return true;
  }

  generateForestTreeAt(wx, wy, wz, rng) {
    const height = rng.nextInt(3) + 5;
    let clear = true;
    const dbgTree = ENV.PARITY_DEBUG_TREE === '1';

    if (wy < 1 || wy + height + 1 > 128) {
      if (dbgTree) console.log(`[TREEDBG] forest fail=height_bounds x=${wx} y=${wy} z=${wz} h=${height}`);
      return false;
    }
    for (let y = wy; y <= wy + 1 + height; ++y) {
      let radius = 1;
      if (y === wy) radius = 0;
      if (y >= wy + 1 + height - 2) radius = 2;
      for (let x = wx - radius; x <= wx + radius && clear; ++x) {
        for (let z = wz - radius; z <= wz + radius && clear; ++z) {
          if (y < 0 || y >= 128) {
            clear = false;
            break;
          }
          const id = this.chunkManager.getBlock(x, y, z);
          if (id !== 0 && id !== 5) clear = false;
        }
      }
    }

    if (!clear) {
      if (dbgTree) console.log(`[TREEDBG] forest fail=clearance x=${wx} y=${wy} z=${wz} h=${height}`);
      return false;
    }
    const below = this.chunkManager.getBlock(wx, wy - 1, wz);
    if ((below !== 1 && below !== 2) || wy >= 128 - height - 1) {
      if (dbgTree) console.log(`[TREEDBG] forest fail=ground x=${wx} y=${wy} z=${wz} h=${height} below=${below}`);
      return false;
    }

    this.setGeneratedBlock(wx, wy - 1, wz, 2, true);
    // Same leaf formula as WorldGenTrees: j1 = i2 - (j+l), k1 = 1 - j1/2 -> radius 2,2,1,1.
    for (let j = 0; j <= 3; j++) {
      const y = wy - 3 + height + j;
      const j1 = j - 3;
      const radius = 1 - Math.trunc(j1 / 2);
      for (let x = wx - radius; x <= wx + radius; ++x) {
        const relX = x - wx;
        for (let z = wz - radius; z <= wz + radius; ++z) {
          const relZ = z - wz;
          if ((Math.abs(relX) !== radius || Math.abs(relZ) !== radius || (rng.nextInt(2) !== 0 && j1 !== 0))) {
            const id = this.chunkManager.getBlock(x, y, z);
            if (!isBlockOpaque(id)) this.setGeneratedBlock(x, y, z, 5, true);
          }
        }
      }
    }
    for (let i = 0; i < height; ++i) {
      const id = this.chunkManager.getBlock(wx, wy + i, wz);
      if (id === 0 || id === 5) this.setGeneratedBlock(wx, wy + i, wz, 4, true);
    }
    if (dbgTree) console.log(`[TREEDBG] forest ok x=${wx} y=${wy} z=${wz} h=${height}`);
    return true;
  }

  // WorldGenTaiga1: taller pine. Height 4 + nextInt(2) + nextInt(3); leaves in cone.
  generateTaiga1At(wx, wy, wz, rng) {
    const var6 = rng.nextInt(5) + 7;
    const var7 = var6 - rng.nextInt(2) - 3;
    const var8 = var6 - var7;
    const var9 = 1 + rng.nextInt(var8 + 1);
    let ok = true;

    if (wy < 1 || wy + var6 + 1 > 128) return false;

    for (let y = wy; y <= wy + 1 + var6 && ok; ++y) {
      const radius = (y - wy < var7) ? 0 : var9;
      for (let x = wx - radius; x <= wx + radius && ok; ++x) {
        for (let z = wz - radius; z <= wz + radius && ok; ++z) {
          if (y < 0 || y >= 128) { ok = false; break; }
          const id = this.chunkManager.getBlock(x, y, z);
          if (id !== 0 && id !== 5) ok = false;
        }
      }
    }
    if (!ok) return false;

    const below = this.chunkManager.getBlock(wx, wy - 1, wz);
    if ((below !== 1 && below !== 2) || wy >= 128 - var6 - 1) return false;

    this.setGeneratedBlock(wx, wy - 1, wz, 2, true);

    let radius = 0;
    for (let y = wy + var6; y >= wy + var7; --y) {
      for (let x = wx - radius; x <= wx + radius; ++x) {
        const dx = x - wx;
        for (let z = wz - radius; z <= wz + radius; ++z) {
          const dz = z - wz;
          if ((Math.abs(dx) !== radius || Math.abs(dz) !== radius || radius <= 0) && !isBlockOpaque(this.chunkManager.getBlock(x, y, z))) {
            this.setGeneratedBlock(x, y, z, 5, true);
          }
        }
      }
      if (radius >= 1 && y === wy + var7 + 1) {
        --radius;
      } else if (radius < var9) {
        ++radius;
      }
    }

    for (let i = 0; i < var6 - 1; ++i) {
      const id = this.chunkManager.getBlock(wx, wy + i, wz);
      if (id === 0 || id === 5) this.setGeneratedBlock(wx, wy + i, wz, 4, true);
    }
    return true;
  }

  // WorldGenTaiga2: shorter pine. Height 4 + nextInt(2).
  generateTaiga2At(wx, wy, wz, rng) {
    const var6 = rng.nextInt(4) + 6;
    const var7 = 1 + rng.nextInt(2);
    const var8 = var6 - var7;
    const var9 = 2 + rng.nextInt(2);
    let ok = true;

    if (wy < 1 || wy + var6 + 1 > 128) return false;

    for (let y = wy; y <= wy + 1 + var6 && ok; ++y) {
      const radius = (y - wy < var7) ? 0 : var9;
      for (let x = wx - radius; x <= wx + radius && ok; ++x) {
        for (let z = wz - radius; z <= wz + radius && ok; ++z) {
          if (y < 0 || y >= 128) { ok = false; break; }
          const id = this.chunkManager.getBlock(x, y, z);
          if (id !== 0 && id !== 5) ok = false;
        }
      }
    }
    if (!ok) return false;

    const below = this.chunkManager.getBlock(wx, wy - 1, wz);
    if ((below !== 1 && below !== 2) || wy >= 128 - var6 - 1) return false;

    this.setGeneratedBlock(wx, wy - 1, wz, 2, true);

    let radius = rng.nextInt(2);
    let var13 = 1;
    let var22 = 0;
    for (let i = 0; i <= var8; ++i) {
      const y = wy + var6 - i;
      for (let x = wx - radius; x <= wx + radius; ++x) {
        const dx = x - wx;
        for (let z = wz - radius; z <= wz + radius; ++z) {
          const dz = z - wz;
          if ((Math.abs(dx) !== radius || Math.abs(dz) !== radius || radius <= 0) && !isBlockOpaque(this.chunkManager.getBlock(x, y, z))) {
            this.setGeneratedBlock(x, y, z, 5, true);
          }
        }
      }

      if (radius >= var13) {
        radius = var22;
        var22 = 1;
        ++var13;
        if (var13 > var9) var13 = var9;
      } else {
        ++radius;
      }
    }

    const trunkTrim = rng.nextInt(3);
    for (let i = 0; i < var6 - trunkTrim; ++i) {
      const id = this.chunkManager.getBlock(wx, wy + i, wz);
      if (id === 0 || id === 5) this.setGeneratedBlock(wx, wy + i, wz, 4, true);
    }
    return true;
  }

  createBigTreeState(wx, wy, wz, rng) {
    return {
      axisMap: [2, 0, 0, 1, 2, 1],
      random: new JavaRandom(rng.nextLong()),
      base: [wx, wy, wz],
      height: 0,
      trunkHeight: 0,
      trunkHeightAttenuation: 0.618,
      branchDensity: 1.0,
      branchSlope: 0.381,
      scaleWidth: 1.0,
      leafDensity: 1.0,
      trunkSize: 1,
      heightLimit: 12,
      // ChunkProviderGenerate calls worldgenerator.a(1.0D,1.0D,1.0D)
      // before generating trees; for BigTree this promotes n from 4 -> 5.
      leafDistanceLimit: 5,
      leafNodes: null
    };
  }

  bigTreeLayerSize(layerFromTop, s) {
    if (layerFromTop < s.height * 0.3) return -1.618;
    const f = s.height / 2.0;
    const f1 = f - layerFromTop;
    let f2;
    if (f1 === 0.0) f2 = f;
    else if (Math.abs(f1) >= f) f2 = 0.0;
    else f2 = Math.sqrt(Math.abs(f) * Math.abs(f) - Math.abs(f1) * Math.abs(f1));
    return f2 * 0.5;
  }

  bigTreeLeafSize(i, s) {
    return i >= 0 && i < s.leafDistanceLimit
      ? (i !== 0 && i !== s.leafDistanceLimit - 1 ? 3.0 : 2.0)
      : -1.0;
  }

  bigTreeCheckLineClear(from, to, s) {
    const delta = [0, 0, 0];
    let mainAxis = 0;
    for (let i = 0; i < 3; i++) {
      delta[i] = to[i] - from[i];
      if (Math.abs(delta[i]) > Math.abs(delta[mainAxis])) mainAxis = i;
    }
    if (delta[mainAxis] === 0) return -1;

    const axis1 = s.axisMap[mainAxis];
    const axis2 = s.axisMap[mainAxis + 3];
    const step = delta[mainAxis] > 0 ? 1 : -1;
    const d1 = delta[axis1] / delta[mainAxis];
    const d2 = delta[axis2] / delta[mainAxis];
    const pos = [0, 0, 0];
    let i = 0;
    const target = delta[mainAxis] + step;
    for (; i !== target; i += step) {
      pos[mainAxis] = from[mainAxis] + i;
      pos[axis1] = MathHelper.floor(from[axis1] + i * d1);
      pos[axis2] = MathHelper.floor(from[axis2] + i * d2);
      const id = this.chunkManager.getBlock(pos[0], pos[1], pos[2]);
      if (id !== 0 && id !== 5) break;
    }
    return i === target ? -1 : Math.abs(i);
  }

  bigTreePlaceLine(from, to, id, s) {
    const delta = [0, 0, 0];
    let mainAxis = 0;
    for (let i = 0; i < 3; i++) {
      delta[i] = to[i] - from[i];
      if (Math.abs(delta[i]) > Math.abs(delta[mainAxis])) mainAxis = i;
    }
    if (delta[mainAxis] === 0) return;

    const axis1 = s.axisMap[mainAxis];
    const axis2 = s.axisMap[mainAxis + 3];
    const step = delta[mainAxis] > 0 ? 1 : -1;
    const d1 = delta[axis1] / delta[mainAxis];
    const d2 = delta[axis2] / delta[mainAxis];
    const pos = [0, 0, 0];
    const target = delta[mainAxis] + step;
    for (let i = 0; i !== target; i += step) {
      pos[mainAxis] = MathHelper.floor(from[mainAxis] + i + 0.5);
      pos[axis1] = MathHelper.floor(from[axis1] + i * d1 + 0.5);
      pos[axis2] = MathHelper.floor(from[axis2] + i * d2 + 0.5);
      this.setGeneratedBlock(pos[0], pos[1], pos[2], id, true);
    }
  }

  generateBigTreeAt(wx, wy, wz, rng) {
    const s = this.createBigTreeState(wx, wy, wz, rng);
    // WorldGenBigTree.generate: field_878_e = 5 + nextInt(field_870_m) when unset.
    if (s.height === 0) s.height = 5 + s.random.nextInt(s.heightLimit);

    // func_519_e: base must be grass or dirt; vertical line clear or clamp height.
    const below = this.chunkManager.getBlock(s.base[0], s.base[1] - 1, s.base[2]);
    if (below !== 1 && below !== 2) return false;
    const top = [s.base[0], s.base[1] + s.height - 1, s.base[2]];
    const line = this.bigTreeCheckLineClear(s.base, top, s);
    if (line !== -1) {
      if (line < 6) return false;
      s.height = line;
    }

    s.trunkHeight = MathHelper.floor(s.height * s.trunkHeightAttenuation);
    if (s.trunkHeight >= s.height) s.trunkHeight = s.height - 1;

    let nodeCount = MathHelper.floor(1.382 + Math.pow((s.leafDensity * s.height) / 13.0, 2.0));
    if (nodeCount < 1) nodeCount = 1;

    const nodes = [];
    let nodeY = s.base[1] + s.height - s.leafDistanceLimit;
    const trunkTopY = s.base[1] + s.trunkHeight;
    let relY = nodeY - s.base[1];
    nodes.push([s.base[0], nodeY, s.base[2], trunkTopY]);
    --nodeY;

    while (relY >= 0) {
      const layerSize = this.bigTreeLayerSize(relY, s);
      if (layerSize < 0.0) {
        nodeY--;
        relY--;
        continue;
      }

      for (let i = 0; i < nodeCount; i++) {
        const branchLen = s.scaleWidth * layerSize * (s.random.nextFloat() + 0.328);
        const angle = s.random.nextFloat() * 2.0 * 3.14159;
        const nx = MathHelper.floor(branchLen * Math.sin(angle) + s.base[0] + 0.5);
        const nz = MathHelper.floor(branchLen * Math.cos(angle) + s.base[2] + 0.5);
        const from = [nx, nodeY, nz];
        const to = [nx, nodeY + s.leafDistanceLimit, nz];
        if (this.bigTreeCheckLineClear(from, to, s) !== -1) continue;

        const attach = [s.base[0], s.base[1], s.base[2]];
        const dist = Math.sqrt(Math.pow(Math.abs(s.base[0] - nx), 2.0) + Math.pow(Math.abs(s.base[2] - nz), 2.0));
        const drop = dist * s.branchSlope;
        attach[1] = (nodeY - drop > trunkTopY) ? trunkTopY : MathHelper.floor(nodeY - drop);
        if (this.bigTreeCheckLineClear(attach, from, s) === -1) nodes.push([nx, nodeY, nz, attach[1]]);
      }

      nodeY--;
      relY--;
    }
    s.leafNodes = nodes;

    for (const node of s.leafNodes) {
      for (let y = node[1], i = 0; i < s.leafDistanceLimit; i++, y++) {
        const radius = this.bigTreeLeafSize(i, s);
        const r = MathHelper.floor(radius + 0.618);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            const d = Math.sqrt(Math.pow(Math.abs(dx) + 0.5, 2.0) + Math.pow(Math.abs(dz) + 0.5, 2.0));
            if (d > radius) continue;
            const x = node[0] + dx;
            const z = node[2] + dz;
            const id = this.chunkManager.getBlock(x, y, z);
            if (id === 0 || id === 5) this.setGeneratedBlock(x, y, z, 5, true);
          }
        }
      }
    }

    this.bigTreePlaceLine(
      [s.base[0], s.base[1], s.base[2]],
      [s.base[0], s.base[1] + s.trunkHeight, s.base[2]],
      4,
      s
    );

    for (const node of s.leafNodes) {
      const start = [s.base[0], node[3], s.base[2]];
      const end = [node[0], node[1], node[2]];
      const dy = start[1] - s.base[1];
      if (dy >= s.height * 0.2) this.bigTreePlaceLine(start, end, 4, s);
    }
    return true;
  }

  generateOreVeinAt(wx, wy, wz, blockId, veinSize, rng) {
    const f = Math.fround(rng.nextFloat() * Math.fround(3.1415927));
    const d0 = wx + 8 + (MathHelper.sin(f) * veinSize) / 8.0;
    const d1 = wx + 8 - (MathHelper.sin(f) * veinSize) / 8.0;
    const d2 = wz + 8 + (MathHelper.cos(f) * veinSize) / 8.0;
    const d3 = wz + 8 - (MathHelper.cos(f) * veinSize) / 8.0;
    // Match WorldGenMinable: y endpoints use +2 (not -2).
    const d4 = wy + rng.nextInt(3) + 2;
    const d5 = wy + rng.nextInt(3) + 2;

    for (let i = 0; i <= veinSize; i++) {
      const d6 = d0 + ((d1 - d0) * i) / veinSize;
      const d7 = d4 + ((d5 - d4) * i) / veinSize;
      const d8 = d2 + ((d3 - d2) * i) / veinSize;
      const d9 = (rng.nextDouble() * veinSize) / 16.0;
      const d10 = (MathHelper.sin((i * Math.fround(3.1415927)) / veinSize) + 1.0) * d9 + 1.0;
      const d11 = (MathHelper.sin((i * Math.fround(3.1415927)) / veinSize) + 1.0) * d9 + 1.0;

      for (let x = MathHelper.floor(d6 - d10 / 2.0); x <= MathHelper.floor(d6 + d10 / 2.0); x++) {
        const dx = (x + 0.5 - d6) / (d10 / 2.0);
        if (dx * dx >= 1.0) continue;
        for (let y = MathHelper.floor(d7 - d11 / 2.0); y <= MathHelper.floor(d7 + d11 / 2.0); y++) {
          const dy = (y + 0.5 - d7) / (d11 / 2.0);
          if (dx * dx + dy * dy >= 1.0) continue;
          for (let z = MathHelper.floor(d8 - d10 / 2.0); z <= MathHelper.floor(d8 + d10 / 2.0); z++) {
            const dz = (z + 0.5 - d8) / (d10 / 2.0);
            if (dx * dx + dy * dy + dz * dz < 1.0) {
              const id = this.chunkManager.getBlock(x, y, z);
              if (id === 3) this.setGeneratedBlock(x, y, z, blockId, true);
            }
          }
        }
      }
    }
  }

  generateClayDepositAt(wx, wy, wz, size, rng) {
    if (this.chunkManager.getBlock(wx, wy, wz) !== 6 && this.chunkManager.getBlock(wx, wy, wz) !== 70) return;
    const f = rng.nextFloat() * Math.fround(3.1415927);
    const d0 = wx + 8 + (MathHelper.sin(f) * size) / 8.0;
    const d1 = wx + 8 - (MathHelper.sin(f) * size) / 8.0;
    const d2 = wz + 8 + (MathHelper.cos(f) * size) / 8.0;
    const d3 = wz + 8 - (MathHelper.cos(f) * size) / 8.0;
    // Match WorldGenClay vertical offset.
    const d4 = wy + rng.nextInt(3) + 2;
    const d5 = wy + rng.nextInt(3) + 2;

    for (let i = 0; i <= size; i++) {
      const d6 = d0 + ((d1 - d0) * i) / size;
      const d7 = d4 + ((d5 - d4) * i) / size;
      const d8 = d2 + ((d3 - d2) * i) / size;
      const d9 = (rng.nextDouble() * size) / 16.0;
      const d10 = (MathHelper.sin((i * Math.fround(3.1415927)) / size) + 1.0) * d9 + 1.0;
      const d11 = (MathHelper.sin((i * Math.fround(3.1415927)) / size) + 1.0) * d9 + 1.0;

      for (let x = MathHelper.floor(d6 - d10 / 2.0); x <= MathHelper.floor(d6 + d10 / 2.0); x++) {
        const dx = (x + 0.5 - d6) / (d10 / 2.0);
        if (dx * dx >= 1.0) continue;
        for (let y = MathHelper.floor(d7 - d11 / 2.0); y <= MathHelper.floor(d7 + d11 / 2.0); y++) {
          const dy = (y + 0.5 - d7) / (d11 / 2.0);
          if (dx * dx + dy * dy >= 1.0) continue;
          for (let z = MathHelper.floor(d8 - d10 / 2.0); z <= MathHelper.floor(d8 + d10 / 2.0); z++) {
            const dz = (z + 0.5 - d8) / (d10 / 2.0);
            if (dx * dx + dy * dy + dz * dz < 1.0) {
              const id = this.chunkManager.getBlock(x, y, z);
              if (id === 9) this.setGeneratedBlock(x, y, z, 82, true); // clay Beta 82
            }
          }
        }
      }
    }
  }

  generateLakeAt(wx, wy, wz, blockId, rng) {
    wx -= 8;
    wz -= 8;
    while (wy > 0 && this.chunkManager.getBlock(wx, wy, wz) === 0) --wy;
    wy -= 4;

    const adouble = new Array(2048).fill(false);
    const count = rng.nextInt(4) + 4;
    for (let i = 0; i < count; i++) {
      const d0 = rng.nextDouble() * 6.0 + 3.0;
      const d1 = rng.nextDouble() * 4.0 + 2.0;
      const d2 = rng.nextDouble() * 6.0 + 3.0;
      const d3 = rng.nextDouble() * (16.0 - d0 - 2.0) + 1.0 + d0 / 2.0;
      const d4 = rng.nextDouble() * (8.0 - d1 - 4.0) + 2.0 + d1 / 2.0;
      const d5 = rng.nextDouble() * (16.0 - d2 - 2.0) + 1.0 + d2 / 2.0;
      for (let x = 1; x < 15; x++) {
        for (let z = 1; z < 15; z++) {
          for (let y = 1; y < 7; y++) {
            const dx = (x - d3) / (d0 / 2.0);
            const dy = (y - d4) / (d1 / 2.0);
            const dz = (z - d5) / (d2 / 2.0);
            if (dx * dx + dy * dy + dz * dz < 1.0) {
              adouble[(x * 16 + z) * 8 + y] = true;
            }
          }
        }
      }
    }

    // Check boundary for liquid spill (Beta WorldGenLakes condition)
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y < 8; y++) {
          const isLake = adouble[(x * 16 + z) * 8 + y];
          if (!isLake && ((x < 15 && adouble[((x + 1) * 16 + z) * 8 + y]) || (x > 0 && adouble[((x - 1) * 16 + z) * 8 + y]) || (z < 15 && adouble[(x * 16 + (z + 1)) * 8 + y]) || (z > 0 && adouble[(x * 16 + (z - 1)) * 8 + y]) || (y < 7 && adouble[(x * 16 + z) * 8 + (y + 1)]) || (y > 0 && adouble[(x * 16 + z) * 8 + (y - 1)]))) {
            const id = this.chunkManager.getBlock(wx + x, wy + y, wz + z);
            if (y >= 4 && (id === 6 || id === 70 || id === 51 || id === 71)) return; // liquid adjacent
            if (y < 4 && !this.isMaterialSolidId(id) && toBetaBlockId(id) !== toBetaBlockId(blockId)) return;
          }
        }
      }
    }

    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y < 8; y++) {
          if (adouble[(x * 16 + z) * 8 + y]) {
            this.setGeneratedBlock(wx + x, wy + y, wz + z, y < 4 ? blockId : 0, true);
          }
        }
      }
    }

    // Match WorldGenLakes: restore grass on lit dirt around upper cavity.
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 4; y < 8; y++) {
          if (!adouble[(x * 16 + z) * 8 + y]) continue;
          const bx = wx + x;
          const by = wy + y;
          const bz = wz + z;
          if (this.chunkManager.getBlock(bx, by - 1, bz) !== 2) continue;
          if (this.canBlockSeeSky(bx, by, bz)) this.setGeneratedBlock(bx, by - 1, bz, 1, true);
        }
      }
    }

    // Match lava-lake shell behavior and RNG calls in WorldGenLakes.
    if (blockId === 51) {
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          for (let y = 0; y < 8; y++) {
            const isBoundary = !adouble[(x * 16 + z) * 8 + y] &&
              ((x < 15 && adouble[((x + 1) * 16 + z) * 8 + y]) ||
                (x > 0 && adouble[((x - 1) * 16 + z) * 8 + y]) ||
                (z < 15 && adouble[(x * 16 + (z + 1)) * 8 + y]) ||
                (z > 0 && adouble[(x * 16 + (z - 1)) * 8 + y]) ||
                (y < 7 && adouble[(x * 16 + z) * 8 + (y + 1)]) ||
                (y > 0 && adouble[(x * 16 + z) * 8 + (y - 1)]));
            if (!isBoundary) continue;
            const pass = (y < 4 || rng.nextInt(2) !== 0);
            if (!pass) continue;
            const id = this.chunkManager.getBlock(wx + x, wy + y, wz + z);
            if (isBlockOpaque(id)) {
              this.setGeneratedBlock(wx + x, wy + y, wz + z, 3, true); // stone shell
            }
          }
        }
      }
    }
  }

  isWaterMaterialAt(wx, wy, wz) {
    const id = this.chunkManager.getBlock(wx, wy, wz);
    return id === 6 || id === 70;
  }

  canReedStay(wx, wy, wz) {
    const below = this.chunkManager.getBlock(wx, wy - 1, wz);
    if (below === 68) return true;
    if (below !== 1 && below !== 2 && below !== 64) return false;
    return this.isWaterMaterialAt(wx - 1, wy - 1, wz) ||
      this.isWaterMaterialAt(wx + 1, wy - 1, wz) ||
      this.isWaterMaterialAt(wx, wy - 1, wz - 1) ||
      this.isWaterMaterialAt(wx, wy - 1, wz + 1);
  }

  generateReedPatchAt(wx, wy, wz, rng) {
    // Match WorldGenReed.generate: 20 local attempts around (x,y,z), fixed y.
    for (let i = 0; i < 20; i++) {
      const x = wx + rng.nextInt(4) - rng.nextInt(4);
      const z = wz + rng.nextInt(4) - rng.nextInt(4);
      if (this.chunkManager.getBlock(x, wy, z) !== 0) continue;
      if (
        !this.isWaterMaterialAt(x - 1, wy - 1, z) &&
        !this.isWaterMaterialAt(x + 1, wy - 1, z) &&
        !this.isWaterMaterialAt(x, wy - 1, z - 1) &&
        !this.isWaterMaterialAt(x, wy - 1, z + 1)
      ) continue;
      const height = 2 + rng.nextInt(rng.nextInt(3) + 1);
      for (let h = 0; h < height; h++) {
        if (this.canReedStay(x, wy + h, z)) this.setGeneratedBlock(x, wy + h, z, 68, true);
      }
    }
  }

  canCactusStay(wx, wy, wz) {
    if (this.isMaterialSolidId(this.chunkManager.getBlock(wx - 1, wy, wz))) return false;
    if (this.isMaterialSolidId(this.chunkManager.getBlock(wx + 1, wy, wz))) return false;
    if (this.isMaterialSolidId(this.chunkManager.getBlock(wx, wy, wz - 1))) return false;
    if (this.isMaterialSolidId(this.chunkManager.getBlock(wx, wy, wz + 1))) return false;
    const below = this.chunkManager.getBlock(wx, wy - 1, wz);
    return isCactusId(below) || below === 9;
  }

  generateCactusPatchAt(wx, wy, wz, rng) {
    // Match WorldGenCactus.generate: 10 local attempts around (x,y,z).
    for (let i = 0; i < 10; i++) {
      const x = wx + rng.nextInt(8) - rng.nextInt(8);
      const y = wy + rng.nextInt(4) - rng.nextInt(4);
      const z = wz + rng.nextInt(8) - rng.nextInt(8);
      if (this.chunkManager.getBlock(x, y, z) !== 0) continue;
      const height = 1 + rng.nextInt(rng.nextInt(3) + 1);
      for (let h = 0; h < height; h++) {
        const here = this.chunkManager.getBlock(x, y + h, z);
        if ((here === 0 || here === 78) && this.canCactusStay(x, y + h, z)) {
          this.setGeneratedBlock(x, y + h, z, 81, true);
        }
      }
    }
  }

  generateLiquidSpringAt(wx, wy, wz, blockId, rng = null) {
    // Match WorldGenLiquids checks.
    if (this.chunkManager.getBlock(wx, wy + 1, wz) !== 3) return false;
    if (this.chunkManager.getBlock(wx, wy - 1, wz) !== 3) return false;
    const center = this.chunkManager.getBlock(wx, wy, wz);
    if (center !== 0 && center !== 3) return false;

    let stoneSides = 0;
    if (this.chunkManager.getBlock(wx - 1, wy, wz) === 3) stoneSides++;
    if (this.chunkManager.getBlock(wx + 1, wy, wz) === 3) stoneSides++;
    if (this.chunkManager.getBlock(wx, wy, wz - 1) === 3) stoneSides++;
    if (this.chunkManager.getBlock(wx, wy, wz + 1) === 3) stoneSides++;

    let airSides = 0;
    if (this.chunkManager.getBlock(wx - 1, wy, wz) === 0) airSides++;
    if (this.chunkManager.getBlock(wx + 1, wy, wz) === 0) airSides++;
    if (this.chunkManager.getBlock(wx, wy, wz - 1) === 0) airSides++;
    if (this.chunkManager.getBlock(wx, wy, wz + 1) === 0) airSides++;

    if (stoneSides === 3 && airSides === 1) {
      this.setGeneratedBlock(wx, wy, wz, blockId, true);
      this.chunkManager.setMetadata(wx, wy, wz, 0);
      // Match WorldGenLiquids: immediate updateTick chain while scheduled updates are immediate.
      this.applyImmediateLiquidSpringTick(wx, wy, wz, blockId, rng);
    }
    return true;
  }

  getLiquidKindForId(id) {
    if (id === 6 || id === 70) return 'water';
    if (id === 71 || id === 51) return 'lava';
    return null;
  }

  getMovingLiquidId(kind) {
    return kind === 'water' ? 6 : 71;
  }

  getStillLiquidId(kind) {
    return kind === 'water' ? 70 : 51;
  }

  getLiquidMetaIfSameKind(kind, x, y, z) {
    const id = this.chunkManager.getBlock(x, y, z);
    if (this.getLiquidKindForId(id) !== kind) return -1;
    return this.chunkManager.getMetadata(x, y, z);
  }

  setLiquidBlockAndMeta(x, y, z, id, meta, cause = 'unknown') {
    const prevId = this.chunkManager.getBlock(x, y, z);
    const prevMeta = this.chunkManager.getMetadata(x, y, z);
    const flowMetaDebugBox = (() => {
      const raw = ENV.PARITY_DEBUG_FLOW_META_BOX;
      if (!raw) return null;
      const p = raw.split(',').map((v) => parseInt(v, 10));
      return p.length === 6 ? p : null;
    })();
    if (flowMetaDebugBox && x >= flowMetaDebugBox[0] && x <= flowMetaDebugBox[3] && y >= flowMetaDebugBox[1] && y <= flowMetaDebugBox[4] && z >= flowMetaDebugBox[2] && z <= flowMetaDebugBox[5]) {
      console.log(`[FLOWMETA] x=${x} y=${y} z=${z} prev=${prevId}:${prevMeta} next=${id}:${meta}`);
    }
    const flowSrcDebugBox = (() => {
      const raw = ENV.PARITY_DEBUG_FLOW_SOURCE_BOX;
      if (!raw) return null;
      const p = raw.split(',').map((v) => parseInt(v, 10));
      return p.length === 6 ? p : null;
    })();
    const inFlowSrcDebugBox = !flowSrcDebugBox
      || (x >= flowSrcDebugBox[0] && x <= flowSrcDebugBox[3]
        && y >= flowSrcDebugBox[1] && y <= flowSrcDebugBox[4]
        && z >= flowSrcDebugBox[2] && z <= flowSrcDebugBox[5]);
    if (ENV.PARITY_DEBUG_FLOW_SOURCE === '1' && inFlowSrcDebugBox) {
      const src = this._flowTickCtx
        ? `${this._flowTickCtx.x},${this._flowTickCtx.y},${this._flowTickCtx.z} kind=${this._flowTickCtx.kind} depth=${this._flowTickCtx.depth}`
        : 'none';
      console.log(`[MFLOWSRC] method=setLiquidBlockAndMeta caller=runImmediateFlowingTick src=${src} to=${x},${y},${z} prev=${prevId}:${prevMeta} next=${id}:${meta} cause=${cause}`);
    }
    if (prevId !== id) {
      this.setGeneratedBlock(x, y, z, id, true);
    }
    this.chunkManager.setMetadata(x, y, z, meta);
  }

  blockBlocksLiquidFlow(id) {
    // Match BlockFlowing.func_309_k exceptions (limited to IDs present in MindBlock).
    if (id === 68) return true; // reed
    if (id === 0) return false;
    return this.isMaterialSolidId(id);
  }

  liquidCanDisplaceBlock(kind, x, y, z) {
    const id = this.chunkManager.getBlock(x, y, z);
    const targetKind = this.getLiquidKindForId(id);
    if (targetKind === kind) return false;
    if (targetKind === 'lava') return false;
    return !this.blockBlocksLiquidFlow(id);
  }

  getSmallestAdjacentFlowMeta(kind, x, y, z, best, sourceCountRef) {
    let meta = this.getLiquidMetaIfSameKind(kind, x, y, z);
    if (meta < 0) return best;
    if (meta === 0) sourceCountRef.value++;
    if (meta >= 8) meta = 0;
    return (best >= 0 && meta >= best) ? best : meta;
  }

  computeFlowCost(kind, x, y, z, depth, cameFrom) {
    let best = 1000;
    for (let dir = 0; dir < 4; dir++) {
      if ((dir === 0 && cameFrom === 1) || (dir === 1 && cameFrom === 0) || (dir === 2 && cameFrom === 3) || (dir === 3 && cameFrom === 2)) {
        continue;
      }
      const { nx, nz } = flowDirToXZ(x, z, dir);
      const nid = this.chunkManager.getBlock(nx, y, nz);
      if (!this.blockBlocksLiquidFlow(nid) && !(this.getLiquidKindForId(nid) === kind && this.chunkManager.getMetadata(nx, y, nz) === 0)) {
        if (!this.blockBlocksLiquidFlow(this.chunkManager.getBlock(nx, y - 1, nz))) return depth;
        if (depth < 4) {
          const cost = this.computeFlowCost(kind, nx, y, nz, depth + 1, dir);
          if (cost < best) best = cost;
        }
      }
    }
    return best;
  }

  getOptimalFlowDirections(kind, x, y, z) {
    const flowCostDebugBox = (() => {
      const raw = ENV.PARITY_DEBUG_FLOW_COST_BOX;
      if (!raw) return null;
      const p = raw.split(',').map((v) => parseInt(v, 10));
      return p.length === 6 ? p : null;
    })();
    const debugHere = flowCostDebugBox && x >= flowCostDebugBox[0] && x <= flowCostDebugBox[3] && y >= flowCostDebugBox[1] && y <= flowCostDebugBox[4] && z >= flowCostDebugBox[2] && z <= flowCostDebugBox[5];
    const costs = [1000, 1000, 1000, 1000];
    for (let dir = 0; dir < 4; dir++) {
      const { nx, nz } = flowDirToXZ(x, z, dir);
      const nid = this.chunkManager.getBlock(nx, y, nz);
      if (!this.blockBlocksLiquidFlow(nid) && !(this.getLiquidKindForId(nid) === kind && this.chunkManager.getMetadata(nx, y, nz) === 0)) {
        if (!this.blockBlocksLiquidFlow(this.chunkManager.getBlock(nx, y - 1, nz))) {
          costs[dir] = 0;
        } else {
          costs[dir] = this.computeFlowCost(kind, nx, y, nz, 1, dir);
        }
      }
      if (debugHere) {
        const nmeta = this.chunkManager.getMetadata(nx, y, nz);
        const below = this.chunkManager.getBlock(nx, y - 1, nz);
        console.log(`[FLOWCOST] from=${x},${y},${z} dir=${dir} to=${nx},${y},${nz} nid=${nid} nmeta=${nmeta} below=${below} cost=${costs[dir]}`);
      }
    }
    const min = Math.min(costs[0], costs[1], costs[2], costs[3]);
    if (debugHere) {
      console.log(`[FLOWCOST] from=${x},${y},${z} costs=${costs.join(',')} min=${min}`);
    }
    const dirs = [false, false, false, false];
    dirs[0] = costs[0] === min;
    dirs[1] = costs[1] === min;
    dirs[2] = costs[2] === min;
    dirs[3] = costs[3] === min;
    return dirs;
  }

  runImmediateFlowingTick(kind, x, y, z, rng, depth, seen) {
    if (depth > FLOW_MAX_DEPTH) return;
    const key = `${x},${y},${z}`;
    const count = seen.get(key) ?? 0;
    if (count > FLOW_MAX_VISITS_PER_CELL) return;
    seen.set(key, count + 1);
    const prevTickCtx = this._flowTickCtx;
    this._flowTickCtx = { x, y, z, kind, depth };
    try {

    const movingId = this.getMovingLiquidId(kind);
    const stillId = this.getStillLiquidId(kind);
    const flowDebugBox = (() => {
      const raw = ENV.PARITY_DEBUG_FLOW_BOX;
      if (!raw) return null;
      const p = raw.split(',').map((v) => parseInt(v, 10));
      return p.length === 6 ? p : null;
    })();
    const inFlowDebugBox = flowDebugBox && x >= flowDebugBox[0] && x <= flowDebugBox[3] && y >= flowDebugBox[1] && y <= flowDebugBox[4] && z >= flowDebugBox[2] && z <= flowDebugBox[5];
    const notifyFluidNeighbors = (sx = x, sy = y, sz = z) => {
      if (kind !== 'water') return;
      const dirs = [
        [-1, 0, 0], [1, 0, 0],
        [0, -1, 0], [0, 1, 0],
        [0, 0, -1], [0, 0, 1]
      ];
      for (const [dx, dy, dz] of dirs) {
        const nx = sx + dx;
        const ny = sy + dy;
        const nz = sz + dz;
        const nid = this.chunkManager.getBlock(nx, ny, nz);
        const nkind = this.getLiquidKindForId(nid);
        if (!nkind) continue;
        if (nkind !== 'water') continue;
        const nstill = this.getStillLiquidId(nkind);
        if (nid !== nstill) continue;
        const nmeta = this.chunkManager.getMetadata(nx, ny, nz);
        const nmoving = this.getMovingLiquidId(nkind);
        // BlockStationary.func_30005_i: stationary sibling converts to flowing and schedules immediate tick.
        this.setLiquidBlockAndMeta(nx, ny, nz, nmoving, nmeta, 'neighbor_notify_convert');
        if (this.canRunImmediateScheduledTick(nx, ny, nz, nmoving)) {
          this.runImmediateFlowingTick(nkind, nx, ny, nz, rng, depth + 1, seen);
        }
      }
    };
    let level = this.getLiquidMetaIfSameKind(kind, x, y, z);
    if (level < 0) return;
    const step = kind === 'lava' ? 2 : 1;
    let stable = true;

    if (level > 0) {
      const sourceCountRef = { value: 0 };
      let best = -100;
      best = this.getSmallestAdjacentFlowMeta(kind, x - 1, y, z, best, sourceCountRef);
      best = this.getSmallestAdjacentFlowMeta(kind, x + 1, y, z, best, sourceCountRef);
      best = this.getSmallestAdjacentFlowMeta(kind, x, y, z - 1, best, sourceCountRef);
      best = this.getSmallestAdjacentFlowMeta(kind, x, y, z + 1, best, sourceCountRef);

      let next = best + step;
      if (next >= 8 || best < 0) next = -1;

      const aboveMeta = this.getLiquidMetaIfSameKind(kind, x, y + 1, z);
      if (aboveMeta >= 0) next = aboveMeta >= 8 ? aboveMeta : aboveMeta + 8;

      if (sourceCountRef.value >= 2 && kind === 'water') {
        const belowId = this.chunkManager.getBlock(x, y - 1, z);
        if (this.isMaterialSolidId(belowId)) {
          next = 0;
        } else if (this.getLiquidKindForId(belowId) === 'water' && this.chunkManager.getMetadata(x, y, z) === 0) {
          next = 0;
        }
      }

      // NOTE: BlockFlowing lava random-slow branch is intentionally disabled in
      // parity harness immediate-tick emulation to avoid over-consuming RNG in
      // current chunk-populate flow path.
      if (kind === 'lava' && FLOW_LAVA_SLOW_HASH && level < 8 && next < 8 && next > level) {
        const h = (Math.imul(x, 73428767) ^ Math.imul(y, 912367) ^ Math.imul(z, 42331) ^ level) >>> 0;
        if ((h & 3) !== 0) {
          next = level;
          stable = false;
        }
      }
      if (kind === 'lava' && ENV.PARITY_ENABLE_LAVA_SLOW === '1' && level < 8 && next < 8 && next > level && rng && rng.nextInt(4) !== 0) {
        next = level;
        stable = false;
      }

      if (next !== level) {
        level = next;
        if (next < 0) {
          this.setGeneratedBlock(x, y, z, 0, true);
          this.chunkManager.setMetadata(x, y, z, 0);
          notifyFluidNeighbors(x, y, z);
          return;
        }
        this.setLiquidBlockAndMeta(x, y, z, movingId, next, 'self_decay_update');
        // scheduleUpdateTick(... immediate) on same block.
        if (this.canRunImmediateScheduledTick(x, y, z, movingId)) {
          this.runImmediateFlowingTick(kind, x, y, z, rng, depth + 1, seen);
        }
        // Match BlockFlowing.updateTick trailing notifyBlocksOfNeighborChange call.
        notifyFluidNeighbors(x, y, z);
      } else if (stable) {
        // Convert to stationary sibling (func_30004_i).
        this.setLiquidBlockAndMeta(x, y, z, stillId, level, 'self_convert_still');
      }
    } else {
      this.setLiquidBlockAndMeta(x, y, z, stillId, level, 'source_convert_still');
    }

    if (this.liquidCanDisplaceBlock(kind, x, y - 1, z)) {
      if (inFlowDebugBox) {
        console.log(`[FLOWDBG] from=${x},${y},${z} action=down to=${x},${y - 1},${z} level=${level}`);
      }
      const downMeta = level >= 8 ? level : level + 8;
      this.setLiquidBlockAndMeta(x, y - 1, z, movingId, downMeta, 'flow_down');
      if (this.canRunImmediateScheduledTick(x, y - 1, z, movingId)) {
        this.runImmediateFlowingTick(kind, x, y - 1, z, rng, depth + 1, seen);
      }
      notifyFluidNeighbors(x, y - 1, z);
    } else if (level >= 0 && (level === 0 || this.blockBlocksLiquidFlow(this.chunkManager.getBlock(x, y - 1, z)))) {
      const dirs = this.getOptimalFlowDirections(kind, x, y, z);
      if (FLOW_WATER_LEDGE_SOUTH_FANOUT && kind === 'water' && y >= 30 && dirs[0] && dirs[2] && !dirs[3]) {
        const northBelowBlocked = this.blockBlocksLiquidFlow(this.chunkManager.getBlock(x, y - 1, z - 1));
        const southBelowBlocked = this.blockBlocksLiquidFlow(this.chunkManager.getBlock(x, y - 1, z + 1));
        const southTarget = this.chunkManager.getBlock(x, y, z + 1);
        const nearLava = (() => {
          const neighbors = [
            [x - 1, y, z], [x + 1, y, z], [x, y, z - 1], [x, y, z + 1],
            [x, y - 1, z], [x, y + 1, z], [x, y, z + 2], [x, y - 1, z + 1]
          ];
          for (const [nx, ny, nz] of neighbors) {
            if (this.getLiquidKindForId(this.chunkManager.getBlock(nx, ny, nz)) === 'lava') return true;
          }
          return false;
        })();
        // Emulate rare BlockFlowing recursive alias side-effect where south branch
        // is emitted in ledge configurations despite north tie winning cost.
        if (!northBelowBlocked && southBelowBlocked && southTarget === 0 && !nearLava) {
          dirs[3] = true;
        }
      }
      let sideLevel = level + step;
      if (level >= 8) sideLevel = 1;
      if (sideLevel >= 8) return;
      if (inFlowDebugBox) {
        console.log(`[FLOWDBG] from=${x},${y},${z} action=side level=${level} sideLevel=${sideLevel} dirs=${dirs.map((d) => d ? 1 : 0).join('')} below=${this.chunkManager.getBlock(x, y - 1, z)}`);
      }

      const dirCause = ['flow_side_w', 'flow_side_e', 'flow_side_n', 'flow_side_s'];
      for (let dir = 0; dir < 4; dir++) {
        if (!dirs[dir]) continue;
        const { nx, nz } = flowDirToXZ(x, z, dir);
        if (!this.liquidCanDisplaceBlock(kind, nx, y, nz)) continue;
        if (inFlowDebugBox) console.log(`[FLOWDBG] place to=${nx},${y},${nz}`);
        this.setLiquidBlockAndMeta(nx, y, nz, movingId, sideLevel, dirCause[dir]);
        if (this.canRunImmediateScheduledTick(nx, y, nz, movingId)) {
          this.runImmediateFlowingTick(kind, nx, y, nz, rng, depth + 1, seen);
        }
        notifyFluidNeighbors(nx, y, nz);
      }
    }
    } finally {
      this._flowTickCtx = prevTickCtx;
    }
  }

  isImmediateTickAreaLoaded(x, y, z) {
    // Match World.scheduleUpdateTick immediate-path guard using chunk existence within radius 8.
    const minCx = Math.floor((x - 8) / 16);
    const maxCx = Math.floor((x + 8) / 16);
    const minCz = Math.floor((z - 8) / 16);
    const maxCz = Math.floor((z + 8) / 16);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        if (!this._loadedChunkColumns?.has(`${cx},${cz}`)) return false;
      }
    }
    return true;
  }

  canRunImmediateScheduledTick(x, y, z, blockId) {
    const schedDebugBox = (() => {
      const raw = ENV.PARITY_DEBUG_SCHED_BOX;
      if (!raw) return null;
      const p = raw.split(',').map((v) => parseInt(v, 10));
      return p.length === 6 ? p : null;
    })();
    const debugHere = schedDebugBox && x >= schedDebugBox[0] && x <= schedDebugBox[3] && y >= schedDebugBox[1] && y <= schedDebugBox[4] && z >= schedDebugBox[2] && z <= schedDebugBox[5];

    if (ENV.PARITY_DISABLE_IMMEDIATE_CHUNK_GUARD !== '1' && !this.isImmediateTickAreaLoaded(x, y, z)) {
      if (debugHere) {
        console.log(`[SCHEDDBG] x=${x} y=${y} z=${z} block=${blockId} allow=0 reason=chunk_guard`);
      }
      return false;
    }
    const id = this.chunkManager.getBlock(x, y, z);
    const allow = id === blockId && id > 0;
    if (debugHere) {
      console.log(`[SCHEDDBG] x=${x} y=${y} z=${z} block=${blockId} at=${id} allow=${allow ? 1 : 0} reason=id_check`);
    }
    return allow;
  }

  applyImmediateLiquidSpringTick(wx, wy, wz, flowingId, rng = null) {
    const kind = this.getLiquidKindForId(flowingId);
    if (!kind) return;
    const movingId = this.getMovingLiquidId(kind);
    if (this.chunkManager.getBlock(wx, wy, wz) !== movingId) return;
    this.runImmediateFlowingTick(kind, wx, wy, wz, rng, 0, new Map());
  }

  isBuildableId(id) {
    // Java Material.isBuildable(): air, water, and flowing water are not buildable.
    return id !== 0 && id !== 6 && id !== 70 && id !== 51 && id !== 71;
  }

  isMaterialSolidId(id) {
    // Match Material.getIsSolid() behavior for blocks used by overworld generation.
    if (id === 0 || id === 6 || id === 70 || id === 51 || id === 71) return false;
    if (id === 37 || id === 38 || id === 66 || id === 67 || id === 68 || id === 78) return false;
    return true;
  }

  isLightBlockingId(id) {
    // Match Chunk height map gate (Block.lightOpacity[id] > 0), not solidity.
    if (id === 0) return false;
    // Keep only known zero-opacity blocks used by overworld generation paths.
    if (id === 6 || id === 31 || id === 32) return false; // sapling/tall grass/dead bush
    if (id === 37 || id === 38 || id === 39 || id === 40) return false; // flowers/mushrooms
    if (id === 50 || id === 51 || id === 55) return false; // torch/fire/redstone wire
    if (id === 59 || id === 63 || id === 65 || id === 66 || id === 68) return false; // crops/sign/ladder/rail/wall sign
    if (id === 69 || id === 70 || id === 72 || id === 75 || id === 76 || id === 77 || id === 78) return false; // lever/plates/redstone/button/snow layer
    if (id === 83 || id === 90) return false; // reeds/portal
    return true;
  }

  canBlockSeeSky(wx, wy, wz) {
    // Match canBlockSeeTheSky against opaque-column height, not highest non-air.
    return this.getHeightValue(wx, wz) <= wy;
  }

  getBlockLightValueNoChecks(wx, wy, wz) {
    // Minimal light approximation for generator canBlockStay checks.
    // Surface/exposed blocks effectively have skylight.
    if (this.canBlockSeeSky(wx, wy, wz)) return 15;
    return 0;
  }

  getHeightValue(wx, wz) {
    // Match World.getHeightValue via chunk height map (light-opacity based).
    for (let y = 127; y > 0; y--) {
      if (this.isLightBlockingId(this.chunkManager.getBlock(wx, y, wz))) return y + 1;
    }
    return 0;
  }

  getTopSolidOrLiquidBlock(wx, wz) {
    // Match World.findTopSolidBlock: top Y+1 above first solid or liquid material.
    for (let y = 127; y > 0; y--) {
      const id = this.chunkManager.getBlock(wx, y, wz);
      const isLiquid = id === 6 || id === 70 || id === 51 || id === 71;
      if (this.isMaterialSolidId(id) || isLiquid) return y + 1;
    }
    return -1;
  }

  canFlowerStay(wx, wy, wz) {
    const below = this.chunkManager.getBlock(wx, wy - 1, wz);
    const canGrowOn = below === 1 || below === 2; // grass or dirt
    return (this.getBlockLightValueNoChecks(wx, wy, wz) >= 8 || this.canBlockSeeSky(wx, wy, wz)) && canGrowOn;
  }

  canMushroomStay(wx, wy, wz) {
    if (wy < 0 || wy >= 128) return false;
    const below = this.chunkManager.getBlock(wx, wy - 1, wz);
    return this.getBlockLightValueNoChecks(wx, wy, wz) < 13 && isBlockOpaque(below);
  }

  canDeadBushStay(wx, wy, wz) {
    const belowIsSand = this.chunkManager.getBlock(wx, wy - 1, wz) === 9; // sand
    return belowIsSand && (this.getBlockLightValueNoChecks(wx, wy, wz) >= 8 || this.canBlockSeeSky(wx, wy, wz));
  }

  consumeDungeonLootRolls(rng) {
    // Match WorldGenDungeons.pickCheckLootItem + chest slot RNG usage.
    for (let i = 0; i < 8; i++) {
      const roll = rng.nextInt(11);
      let hasItem = false;
      if (roll === 0) hasItem = true;
      else if (roll === 1) { rng.nextInt(4); hasItem = true; }
      else if (roll === 2) hasItem = true;
      else if (roll === 3) { rng.nextInt(4); hasItem = true; }
      else if (roll === 4) { rng.nextInt(4); hasItem = true; }
      else if (roll === 5) { rng.nextInt(4); hasItem = true; }
      else if (roll === 6) hasItem = true;
      else if (roll === 7) { if (rng.nextInt(100) === 0) hasItem = true; }
      else if (roll === 8) { if (rng.nextInt(2) === 0) { rng.nextInt(4); hasItem = true; } }
      else if (roll === 9) { if (rng.nextInt(10) === 0) { rng.nextInt(2); hasItem = true; } }
      else if (roll === 10) hasItem = true;
      if (hasItem) rng.nextInt(27); // chest slot index
    }
  }

  simulateDungeonAttempt(wx, wy, wz, rng) {
    // WorldGenDungeons.a(world, rng, x, y, z): room nextInt(2)+2, mossy 1/4 floor, 2 chests + spawner
    const roomX = rng.nextInt(2) + 2;
    const roomY = 3;
    const roomZ = rng.nextInt(2) + 2;
    let buildableCount = 0;
    for (let x = wx - roomX - 1; x <= wx + roomX + 1; x++) {
      for (let y = wy - 1; y <= wy + roomY + 1; y++) {
        for (let z = wz - roomZ - 1; z <= wz + roomZ + 1; z++) {
          const id = this.chunkManager.getBlock(x, y, z);
          if (y === wy - 1 && !this.isBuildableId(id)) return false;
          if (y === wy + roomY + 1 && !this.isBuildableId(id)) return false;
          if ((x === wx - roomX - 1 || x === wx + roomX + 1 || z === wz - roomZ - 1 || z === wz + roomZ + 1) && y === wy && id === 0 && this.chunkManager.getBlock(x, y + 1, z) === 0) {
            buildableCount++;
          }
        }
      }
    }
    if (buildableCount < 1 || buildableCount > 5) return false;

    for (let x = wx - roomX - 1; x <= wx + roomX + 1; x++) {
      for (let y = wy + roomY; y >= wy - 1; y--) {
        for (let z = wz - roomZ - 1; z <= wz + roomZ + 1; z++) {
          if (x !== wx - roomX - 1 && y !== wy - 1 && z !== wz - roomZ - 1 && x !== wx + roomX + 1 && y !== wy + roomY + 1 && z !== wz + roomZ + 1) {
            this.setGeneratedBlock(x, y, z, 0, true);
          } else if (y >= 0 && !this.isBuildableId(this.chunkManager.getBlock(x, y - 1, z))) {
            this.setGeneratedBlock(x, y, z, 0, true);
          } else if (this.isBuildableId(this.chunkManager.getBlock(x, y, z))) {
            if (y === wy - 1 && rng.nextInt(4) !== 0) {
              this.setGeneratedBlock(x, y, z, 48, true); // mossy Beta 48
            } else {
              this.setGeneratedBlock(x, y, z, 15, true); // cobble Beta 4
            }
          }
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        const cx = wx + rng.nextInt(roomX * 2 + 1) - roomX;
        const cz = wz + rng.nextInt(roomZ * 2 + 1) - roomZ;
        if (this.chunkManager.getBlock(cx, wy, cz) === 0) {
          let count = 0;
          if (this.isBuildableId(this.chunkManager.getBlock(cx - 1, wy, cz))) count++;
          if (this.isBuildableId(this.chunkManager.getBlock(cx + 1, wy, cz))) count++;
          if (this.isBuildableId(this.chunkManager.getBlock(cx, wy, cz - 1))) count++;
          if (this.isBuildableId(this.chunkManager.getBlock(cx, wy, cz + 1))) count++;
          if (count === 1) {
            this.setGeneratedBlock(cx, wy, cz, 54, true); // chest Beta 54
            this.consumeDungeonLootRolls(rng);
            break;
          }
        }
      }
    }

    this.setGeneratedBlock(wx, wy, wz, 52, true); // spawner Beta 52
    // WorldGenDungeons.pickMobSpawner: 0 Skeleton, 1-2 Zombie, 3 Spider. Stored as metadata + 1
    // so the spawner's mob type survives into runtime chunk data.
    this.chunkManager.setMetadata(wx, wy, wz, rng.nextInt(4) + 1);
    return true;
  }

  populateChunk(cx, cz) {
    if (DISABLE_POPULATE_CHUNK) return;
    const rng = new JavaRandom(this.seed);
    const traceRng = TRACE_RNG ? makeRngTraceProxy(rng, this, cx, cz) : rng;
    const chunkSeed = toSigned64((BigInt(cx) * (traceRng.nextLong() / 2n * 2n + 1n)) + (BigInt(cz) * (traceRng.nextLong() / 2n * 2n + 1n)) ^ this.seed);
    traceRng.setSeed(chunkSeed);

    const baseX = cx * 16;
    const baseZ = cz * 16;
    const logStage = (name) => {
      this._currentPopulateStage = name;
      if (ENV.PARITY_DEBUG_POP_STAGES === '1' && TRACE_RNG && this._rngTrace) {
        console.log(`[POPSTAGE] seed=${this.seed.toString()} chunk=${cx},${cz} stage=${name} rngIndex=${this._rngTrace.length}`);
      }
    };

    logStage('lakes');
    if (ENABLED_DECORATORS.has('lakes')) {
      if (traceRng.nextInt(4) === 0) {
        this.generateLakeAt(baseX + traceRng.nextInt(16) + 8, traceRng.nextInt(128), baseZ + traceRng.nextInt(16) + 8, 70, traceRng);
      }
      if (traceRng.nextInt(8) === 0) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(traceRng.nextInt(120) + 8);
        const z = baseZ + traceRng.nextInt(16) + 8;
        if (y < 64 || traceRng.nextInt(10) === 0) {
          this.generateLakeAt(x, y, z, 51, traceRng);
        }
      }
    }

    logStage('dungeons');
    if (ENABLED_DECORATORS.has('dungeons')) {
      for (let i = 0; i < 8; i++) {
        this.simulateDungeonAttempt(baseX + traceRng.nextInt(16) + 8, traceRng.nextInt(128), baseZ + traceRng.nextInt(16) + 8, traceRng);
      }
    }

    logStage('clay_ores');
    if (ENABLED_DECORATORS.has('clay')) {
      for (let i = 0; i < 10; i++) {
        this.generateClayDepositAt(baseX + traceRng.nextInt(16), traceRng.nextInt(128), baseZ + traceRng.nextInt(16), 32, traceRng);
      }
    }

    const ores = [
      { name: 'dirt', id: 2, count: 20, size: 32, minY: 0, maxY: 128 },
      { name: 'gravel', id: 57, count: 10, size: 32, minY: 0, maxY: 128 },
      { name: 'coal', id: 10, count: 20, size: 16, minY: 0, maxY: 128 },
      { name: 'iron', id: 12, count: 20, size: 8, minY: 0, maxY: 64 },
      { name: 'gold', id: 11, count: 2, size: 8, minY: 0, maxY: 32 },
      { name: 'redstone', id: 73, count: 8, size: 7, minY: 0, maxY: 16 },
      { name: 'diamond', id: 13, count: 1, size: 7, minY: 0, maxY: 16 },
      { name: 'lapis', id: 21, count: 1, size: 6, minY: 0, maxY: 16, triangular: true }
    ];

    for (const ore of ores) {
      if (!ENABLED_DECORATORS.has(ore.name)) continue;
      for (let i = 0; i < ore.count; i++) {
        const x = baseX + traceRng.nextInt(16);
        const y = ore.triangular ? traceRng.nextInt(16) + traceRng.nextInt(16) : traceRng.nextInt(ore.maxY);
        const z = baseZ + traceRng.nextInt(16);
        this.generateOreVeinAt(x, y, z, ore.id, ore.size, traceRng);
      }
    }

    logStage('biome_trees');
    // Match populate() biome source: worldChunkManager.getBiomeGenAt(baseX+16, baseZ+16).
    // Use the same climate-array path used for replace parity (quantized lookup), sampling chunk (cx+1, cz+1) idx 0.
    const popClimate = this.buildBiomeClimateArrays(cx + 1, cz + 1);
    const biome = biomeNameFromClimate(popClimate.temperature[0], popClimate.rain[0]);
    const isForest = biome === 'forest';
    const isRainforest = biome === 'rainforest';
    const isSeasonalForest = biome === 'seasonal_forest';
    const isTaiga = biome === 'taiga';
    const isDesert = biome === 'desert';
    const isTundra = biome === 'tundra';
    const isPlains = biome === 'plains';

    // Match ChunkProviderGenerate.populate: mobSpawnerNoise.func_647_a(baseX*0.5, baseZ*0.5)
    const noiseC = this.noiseC.noise2D(baseX * 0.5, baseZ * 0.5);
    // Java cast to int truncates toward zero (not floor for negatives).
    const treeNoise = Math.trunc((noiseC / 8.0 + traceRng.nextDouble() * 4.0 + 4.0) / 3.0);
    let treeCount = 0;
    if (traceRng.nextInt(10) === 0) treeCount++;
    if (isForest) treeCount += treeNoise + 5;
    if (isRainforest) treeCount += treeNoise + 5;
    if (isSeasonalForest) treeCount += treeNoise + 2;
    if (isTaiga) treeCount += treeNoise + 5;
    if (isDesert) treeCount -= 20;
    if (isTundra) treeCount -= 20;
    if (isPlains) treeCount -= 20;
    if (ENV.PARITY_DEBUG_POPULATE === '1' && cx === 1 && cz === 0) {
      console.log(`[POPDBG] seed=${this.seed.toString()} chunk=${cx},${cz} biome=${biome} treeNoise=${treeNoise} treeCount=${treeCount}`);
    }

    if (ENABLED_DECORATORS.has('trees')) {
      for (let i = 0; i < treeCount; i++) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const z = baseZ + traceRng.nextInt(16) + 8;
        const y = this.getHeightValue(x, z);
        if (ENV.PARITY_DEBUG_TREE === '1') {
          const topId = this.chunkManager.getBlock(x, y - 1, z);
          const belowId = this.chunkManager.getBlock(x, y - 2, z);
          console.log(`[TREEDBG] attempt=${i} x=${x} y=${y} z=${z} top=${topId} below=${belowId}`);
        }
        const treeBiome = isForest ? 'forest' : (isRainforest ? 'rainforest' : (isTaiga ? 'taiga' : 'default'));
        const treeType = this.pickTreeGeneratorType(treeBiome, traceRng);
        if (treeType === 'big') this.generateBigTreeAt(x, y, z, traceRng);
        else if (treeType === 'forest') this.generateForestTreeAt(x, y, z, traceRng);
        else if (treeType === 'taiga1') this.generateTaiga1At(x, y, z, traceRng);
        else if (treeType === 'taiga2') this.generateTaiga2At(x, y, z, traceRng);
        else this.generateStandardTreeAt(x, y, z, traceRng);
      }
    }

    logStage('flowers');
    if (ENABLED_DECORATORS.has('flowers')) {
      let yellowCount = 0;
      if (isForest) yellowCount = 2;
      if (isSeasonalForest) yellowCount = 4;
      if (isTaiga) yellowCount = 2;
      if (isPlains) yellowCount = 3;
      if (ENV.PARITY_DEBUG_POPULATE === '1' && cx === 1 && cz === 0) {
        console.log(`[POPDBG] yellowCount=${yellowCount}`);
      }
      for (let i = 0; i < yellowCount; i++) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(128);
        const z = baseZ + traceRng.nextInt(16) + 8;
        // WorldGenFlowers: try 64 times
        for (let j = 0; j < 64; j++) {
          const tx = x + traceRng.nextInt(8) - traceRng.nextInt(8);
          const ty = y + traceRng.nextInt(4) - traceRng.nextInt(4);
          const tz = z + traceRng.nextInt(8) - traceRng.nextInt(8);
          if (ty >= 0 && ty < 128 && this.chunkManager.getBlock(tx, ty, tz) === 0 && this.canFlowerStay(tx, ty, tz)) {
            this.setGeneratedBlock(tx, ty, tz, 37, true);
          }
        }
      }
    }

    logStage('grass');
    if (ENABLED_DECORATORS.has('grass')) {
      let grassCount = 0;
      if (isForest) grassCount = 2;
      if (isRainforest) grassCount = 10;
      if (isSeasonalForest) grassCount = 2;
      if (isTaiga) grassCount = 1;
      if (isPlains) grassCount = 10;
      if (ENV.PARITY_DEBUG_POPULATE === '1' && cx === 1 && cz === 0) {
        console.log(`[POPDBG] grassCount=${grassCount}`);
      }
      for (let i = 0; i < grassCount; i++) {
        const x = baseX + traceRng.nextInt(16) + 8;
        let y = traceRng.nextInt(128);
        const z = baseZ + traceRng.nextInt(16) + 8;
        while (y > 0) {
          const id = this.chunkManager.getBlock(x, y, z);
          if (id !== 0 && id !== 5) break;
          y--;
        }
        const grassMeta = (isRainforest && traceRng.nextInt(3) !== 0) ? 2 : 1;
        for (let j = 0; j < 128; j++) {
          const tx = x + traceRng.nextInt(8) - traceRng.nextInt(8);
          const ty = y + traceRng.nextInt(4) - traceRng.nextInt(4);
          const tz = z + traceRng.nextInt(8) - traceRng.nextInt(8);
          if (ty >= 0 && ty < 128 && this.chunkManager.getBlock(tx, ty, tz) === 0 && this.canFlowerStay(tx, ty, tz)) {
            this.setGeneratedBlock(tx, ty, tz, 31, true); // tall grass Beta 31 (meta ignored for now)
          }
        }
      }
    }

    logStage('dead_bush');
    if (ENABLED_DECORATORS.has('dead_bush')) {
      const deadBushCount = isDesert ? 2 : 0;
      if (ENV.PARITY_DEBUG_POPULATE === '1' && cx === 1 && cz === 0) {
        console.log(`[POPDBG] deadBushCount=${deadBushCount}`);
      }
      if (deadBushCount > 0) {
        for (let i = 0; i < deadBushCount; i++) {
          const x = baseX + traceRng.nextInt(16) + 8;
          let y = traceRng.nextInt(128);
          const z = baseZ + traceRng.nextInt(16) + 8;
          while (y > 0) {
            const id = this.chunkManager.getBlock(x, y, z);
            if (id !== 0 && id !== 5) break;
            y--;
          }
          for (let j = 0; j < 4; j++) {
            const tx = x + traceRng.nextInt(8) - traceRng.nextInt(8);
            const ty = y + traceRng.nextInt(4) - traceRng.nextInt(4);
            const tz = z + traceRng.nextInt(8) - traceRng.nextInt(8);
            if (ty >= 0 && ty < 128 && this.chunkManager.getBlock(tx, ty, tz) === 0 && this.canDeadBushStay(tx, ty, tz)) {
              this.setGeneratedBlock(tx, ty, tz, 32, true); // dead bush Beta 32
            }
          }
        }
      }
    }

    logStage('mushrooms');
    if (ENABLED_DECORATORS.has('mushrooms')) {
      // Match Java order: red flower chance happens after dead bush, before mushroom chances.
      if (traceRng.nextInt(2) === 0) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(128);
        const z = baseZ + traceRng.nextInt(16) + 8;
        for (let j = 0; j < 64; j++) {
          const tx = x + traceRng.nextInt(8) - traceRng.nextInt(8);
          const ty = y + traceRng.nextInt(4) - traceRng.nextInt(4);
          const tz = z + traceRng.nextInt(8) - traceRng.nextInt(8);
          if (ty >= 0 && ty < 128 && this.chunkManager.getBlock(tx, ty, tz) === 0 && this.canFlowerStay(tx, ty, tz)) {
            this.setGeneratedBlock(tx, ty, tz, 38, true);
          }
        }
      }
      if (traceRng.nextInt(4) === 0) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(128);
        const z = baseZ + traceRng.nextInt(16) + 8;
        for (let j = 0; j < 64; j++) {
          const tx = x + traceRng.nextInt(8) - traceRng.nextInt(8);
          const ty = y + traceRng.nextInt(4) - traceRng.nextInt(4);
          const tz = z + traceRng.nextInt(8) - traceRng.nextInt(8);
          if (ty >= 0 && ty < 128 && this.chunkManager.getBlock(tx, ty, tz) === 0 && this.canMushroomStay(tx, ty, tz)) {
            this.setGeneratedBlock(tx, ty, tz, 66, true);
          }
        }
      }
      if (traceRng.nextInt(8) === 0) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(128);
        const z = baseZ + traceRng.nextInt(16) + 8;
        for (let j = 0; j < 64; j++) {
          const tx = x + traceRng.nextInt(8) - traceRng.nextInt(8);
          const ty = y + traceRng.nextInt(4) - traceRng.nextInt(4);
          const tz = z + traceRng.nextInt(8) - traceRng.nextInt(8);
          if (ty >= 0 && ty < 128 && this.chunkManager.getBlock(tx, ty, tz) === 0 && this.canMushroomStay(tx, ty, tz)) {
            this.setGeneratedBlock(tx, ty, tz, 67, true);
          }
        }
      }
    }

    logStage('reeds');
    if (ENABLED_DECORATORS.has('reeds')) {
      for (let i = 0; i < 10; i++) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(128);
        const z = baseZ + traceRng.nextInt(16) + 8;
        this.generateReedPatchAt(x, y, z, traceRng);
      }
    }

    logStage('pumpkin');
    if (ENABLED_DECORATORS.has('pumpkin')) {
      if (traceRng.nextInt(32) === 0) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(128);
        const z = baseZ + traceRng.nextInt(16) + 8;
        for (let j = 0; j < 64; j++) {
          const tx = x + traceRng.nextInt(8) - traceRng.nextInt(8);
          const ty = y + traceRng.nextInt(4) - traceRng.nextInt(4);
          const tz = z + traceRng.nextInt(8) - traceRng.nextInt(8);
          if (ty >= 0 && ty < 128 && this.chunkManager.getBlock(tx, ty, tz) === 0 && this.chunkManager.getBlock(tx, ty - 1, tz) === 1) {
            traceRng.nextInt(4); // pumpkin facing metadata RNG
            this.setGeneratedBlock(tx, ty, tz, 69, true);
          }
        }
      }
    }

    logStage('cactus');
    if (ENABLED_DECORATORS.has('cactus')) {
      if (isDesert) {
        for (let i = 0; i < 10; i++) {
          const x = baseX + traceRng.nextInt(16) + 8;
          const y = traceRng.nextInt(128);
          const z = baseZ + traceRng.nextInt(16) + 8;
          this.generateCactusPatchAt(x, y, z, traceRng);
        }
      }
    }

    logStage('liquids');
    if (ENABLED_DECORATORS.has('liquids')) {
      for (let i = 0; i < 50; i++) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(traceRng.nextInt(120) + 8);
        const z = baseZ + traceRng.nextInt(16) + 8;
        this.generateLiquidSpringAt(x, y, z, 6, traceRng);
      }
      for (let i = 0; i < 20; i++) {
        const x = baseX + traceRng.nextInt(16) + 8;
        const y = traceRng.nextInt(traceRng.nextInt(traceRng.nextInt(112) + 8) + 8);
        const z = baseZ + traceRng.nextInt(16) + 8;
        this.generateLiquidSpringAt(x, y, z, 71, traceRng);
      }
    }

    logStage('snow');
    if (ENABLED_DECORATORS.has('snow')) {
      const temps = this.terrain.getTemperatures(null, baseX + 8, baseZ + 8, 16, 16);
      for (let x = baseX + 8; x < baseX + 8 + 16; x++) {
        for (let z = baseZ + 8; z < baseZ + 8 + 16; z++) {
          const ix = x - (baseX + 8);
          const iz = z - (baseZ + 8);
          const y = this.getTopSolidOrLiquidBlock(x, z);
          const temp = temps[ix * 16 + iz] - (y - 64) / 64.0 * 0.3;
          const below = this.chunkManager.getBlock(x, y - 1, z);
          if (temp < 0.5 && y > 0 && y < 128 && this.chunkManager.getBlock(x, y, z) === 0 && this.isMaterialSolidId(below) && below !== 79) {
            this.setGeneratedBlock(x, y, z, 78, true);
          }
        }
      }
    }
  }

  getChunkBlocksBetaOrderReplaceLayout(cx, cz) {
    const out = new Uint8Array(32768);
    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let y = 0; y < 128; y++) {
          const id = this.chunkManager.getBlock(cx * 16 + lz, y, cz * 16 + lx);
          out[(lx * 16 + lz) * 128 + y] = toBetaBlockId(id);
        }
      }
    }
    return out;
  }

  generateWithNeighborPrereq(targetCx, targetCz) {
    const pregen = [];
    if (PREGEN_MODE === '2x2') {
      // Match ChunkProvider/ChunkDumpJacobo load order prerequisites:
      // center, east, south, southeast.
      pregen.push({ cx: targetCx, cz: targetCz });
      pregen.push({ cx: targetCx + 1, cz: targetCz });
      pregen.push({ cx: targetCx, cz: targetCz + 1 });
      pregen.push({ cx: targetCx + 1, cz: targetCz + 1 });
    } else {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          pregen.push({ cx: targetCx + dx, cz: targetCz + dz });
        }
      }
    }
    this._loadedChunkColumns = new Set();
    for (const { cx, cz } of pregen) {
      this._loadedChunkColumns.add(`${cx},${cz}`);
      this.generateBaseTerrainColumn(cx, cz);
      if (!DISABLE_REPLACE_BLOCKS) this.replaceBlocksForBiome(cx, cz);
      if (!DISABLE_CAVES) this.carveCavesColumn(cx, cz);
    }
    const order = POPULATE_ORDER || ['nw', 'w', 'n', 'c'];
    const map = {
      nw: { dx: -1, dz: -1 },
      w: { dx: -1, dz: 0 },
      n: { dx: 0, dz: -1 },
      c: { dx: 0, dz: 0 }
    };
    for (const key of order) {
      if (POPULATE_SCOPE === 'self' && key !== 'c') continue;
      const { dx, dz } = map[key];
      this.populateChunk(targetCx + dx, targetCz + dz);
    }
  }
}
