/**
 * Beta 1.7.3 terrain noise: Perlin (ImprovedNoise) + NoiseOctaves, Simplex (Noise2) + NoiseOctaves2.
 * Matches NoiseGeneratorPerlin, NoiseGeneratorOctaves, NoiseGenerator2, NoiseGeneratorOctaves2.
 * Fade curve: t*t*t*(t*(t*6-15)+10). Octave amplitude 1, 1/2, 1/4, ...
 */
import { JavaRandom } from './javaRandom.js';

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t, a, b) {
  return a + t * (b - a);
}

function grad3(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function grad2(hash, x, y) {
  const h = hash & 15;
  const d2 = (1 - ((h & 8) >> 3)) * x;
  const d3 = h < 4 ? 0.0 : (h !== 12 && h !== 14 ? y : x);
  return ((h & 1) === 0 ? d2 : -d2) + ((h & 2) === 0 ? d3 : -d3);
}

export class ImprovedNoise {
  constructor(rng) {
    this.d = new Int32Array(512);
    this.a = rng.nextDouble() * 256.0;
    this.b = rng.nextDouble() * 256.0;
    this.c = rng.nextDouble() * 256.0;
    for (let i = 0; i < 256; i++) this.d[i] = i;
    for (let i = 0; i < 256; i++) {
      const j = i + rng.nextInt(256 - i);
      const t = this.d[i];
      this.d[i] = this.d[j];
      this.d[j] = t;
      this.d[i + 256] = this.d[i];
    }
  }

  noise(x, y, z) {
    let d3 = x + this.a;
    let d4 = y + this.b;
    let d5 = z + this.c;
    let i = d3 < 0 ? Math.ceil(d3) : Math.floor(d3);
    let j = d4 < 0 ? Math.ceil(d4) : Math.floor(d4);
    let k = d5 < 0 ? Math.ceil(d5) : Math.floor(d5);
    if (d3 < i) i--;
    if (d4 < j) j--;
    if (d5 < k) k--;

    const l = i & 255;
    const i1 = j & 255;
    const j1 = k & 255;
    d3 -= i;
    d4 -= j;
    d5 -= k;
    const d6 = fade(d3);
    const d7 = fade(d4);
    const d8 = fade(d5);
    const k1 = this.d[l] + i1;
    const l1 = this.d[k1] + j1;
    const i2 = this.d[k1 + 1] + j1;
    const j2 = this.d[l + 1] + i1;
    const k2 = this.d[j2] + j1;
    const l2 = this.d[j2 + 1] + j1;

    return lerp(
      d8,
      lerp(
        d7,
        lerp(d6, grad3(this.d[l1], d3, d4, d5), grad3(this.d[k2], d3 - 1, d4, d5)),
        lerp(d6, grad3(this.d[i2], d3, d4 - 1, d5), grad3(this.d[l2], d3 - 1, d4 - 1, d5))
      ),
      lerp(
        d7,
        lerp(d6, grad3(this.d[l1 + 1], d3, d4, d5 - 1), grad3(this.d[k2 + 1], d3 - 1, d4, d5 - 1)),
        lerp(
          d6,
          grad3(this.d[i2 + 1], d3, d4 - 1, d5 - 1),
          grad3(this.d[l2 + 1], d3 - 1, d4 - 1, d5 - 1)
        )
      )
    );
  }

  add(
    out,
    x,
    y,
    z,
    sizeX,
    sizeY,
    sizeZ,
    scaleX,
    scaleY,
    scaleZ,
    amplitude
  ) {
    if (sizeY === 1) {
      let outIdx = 0;
      const ampScale = 1.0 / amplitude;
      for (let ix = 0; ix < sizeX; ++ix) {
        let d7 = (x + ix) * scaleX + this.a;
        let l2 = d7 < 0 ? Math.ceil(d7) : Math.floor(d7);
        if (d7 < l2) --l2;
        const i3 = l2 & 255;
        d7 -= l2;
        const d8 = fade(d7);

        for (let iz = 0; iz < sizeZ; ++iz) {
          let d9 = (z + iz) * scaleZ + this.c;
          let k1 = d9 < 0 ? Math.ceil(d9) : Math.floor(d9);
          if (d9 < k1) --k1;
          const l1 = k1 & 255;
          d9 -= k1;
          const d10 = fade(d9);
          const l = this.d[i3] + 0;
          const j3 = this.d[l] + l1;
          const k3 = this.d[i3 + 1] + 0;
          const i1 = this.d[k3] + l1;
          const d11 = lerp(d8, grad2(this.d[j3], d7, d9), grad3(this.d[i1], d7 - 1.0, 0.0, d9));
          const d12 = lerp(
            d8,
            grad3(this.d[j3 + 1], d7, 0.0, d9 - 1.0),
            grad3(this.d[i1 + 1], d7 - 1.0, 0.0, d9 - 1.0)
          );
          const d14 = lerp(d10, d11, d12);
          out[outIdx++] += d14 * ampScale;
        }
      }
      return;
    }

    let outIdx = 0;
    const ampScale = 1.0 / amplitude;
    let prevYHash = -1;
    let d16 = 0.0;
    let d7 = 0.0;
    let d17 = 0.0;
    let d8 = 0.0;

    for (let ix = 0; ix < sizeX; ++ix) {
      let d9 = (x + ix) * scaleX + this.a;
      let k1 = d9 < 0 ? Math.ceil(d9) : Math.floor(d9);
      if (d9 < k1) --k1;
      const l1 = k1 & 255;
      d9 -= k1;
      const d10 = fade(d9);

      for (let iz = 0; iz < sizeZ; ++iz) {
        let d18 = (z + iz) * scaleZ + this.c;
        let i4 = d18 < 0 ? Math.ceil(d18) : Math.floor(d18);
        if (d18 < i4) --i4;
        const j4 = i4 & 255;
        d18 -= i4;
        const d19 = fade(d18);

        for (let iy = 0; iy < sizeY; ++iy) {
          let d20 = (y + iy) * scaleY + this.b;
          let l4 = d20 < 0 ? Math.ceil(d20) : Math.floor(d20);
          if (d20 < l4) --l4;
          const i5 = l4 & 255;
          d20 -= l4;
          const d21 = fade(d20);

          if (iy === 0 || i5 !== prevYHash) {
            prevYHash = i5;
            const j5 = this.d[l1] + i5;
            const k5 = this.d[j5] + j4;
            const l5 = this.d[j5 + 1] + j4;
            const i6 = this.d[l1 + 1] + i5;
            const j2 = this.d[i6] + j4;
            const j6 = this.d[i6 + 1] + j4;
            d16 = lerp(d10, grad3(this.d[k5], d9, d20, d18), grad3(this.d[j2], d9 - 1.0, d20, d18));
            d7 = lerp(d10, grad3(this.d[l5], d9, d20 - 1.0, d18), grad3(this.d[j6], d9 - 1.0, d20 - 1.0, d18));
            d17 = lerp(
              d10,
              grad3(this.d[k5 + 1], d9, d20, d18 - 1.0),
              grad3(this.d[j2 + 1], d9 - 1.0, d20, d18 - 1.0)
            );
            d8 = lerp(
              d10,
              grad3(this.d[l5 + 1], d9, d20 - 1.0, d18 - 1.0),
              grad3(this.d[j6 + 1], d9 - 1.0, d20 - 1.0, d18 - 1.0)
            );
          }

          const d22 = lerp(d21, d16, d7);
          const d23 = lerp(d21, d17, d8);
          const d24 = lerp(d19, d22, d23);
          out[outIdx++] += d24 * ampScale;
        }
      }
    }
  }
}

export class NoiseOctaves {
  constructor(seedOrRng, octaves) {
    const rng = seedOrRng instanceof JavaRandom ? seedOrRng : new JavaRandom(seedOrRng);
    this.noises = [];
    this.octaves = octaves;
    for (let i = 0; i < octaves; i++) {
      this.noises.push(new ImprovedNoise(rng));
    }
  }

  noise(x, y, z) {
    let out = 0.0;
    let scale = 1.0;
    for (let i = 0; i < this.octaves; i++) {
      out += this.noises[i].noise(x * scale, y * scale, z * scale) / scale;
      scale /= 2.0;
    }
    return out;
  }

  noise2D(x, z) {
    return this.noise(x, z, 0.0);
  }

  generateNoiseArray(out, x, y, z, sizeX, sizeY, sizeZ, scaleX, scaleY, scaleZ) {
    const arr = out ?? new Float64Array(sizeX * sizeY * sizeZ);
    if (out) {
      for (let i = 0; i < arr.length; i++) arr[i] = 0.0;
    }

    let amp = 1.0;
    for (let i = 0; i < this.octaves; i++) {
      this.noises[i].add(
        arr,
        x,
        y,
        z,
        sizeX,
        sizeY,
        sizeZ,
        scaleX * amp,
        scaleY * amp,
        scaleZ * amp,
        amp
      );
      amp /= 2.0;
    }
    return arr;
  }
}

const SIMPLEX_GRAD = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

function simplexFloor(v) {
  const i = Math.trunc(v);
  return v > 0.0 ? i : i - 1;
}

function simplexDot(g, x, y) {
  return g[0] * x + g[1] * y;
}

export class Noise2 {
  constructor(seedOrRng) {
    const rng = seedOrRng instanceof JavaRandom ? seedOrRng : new JavaRandom(seedOrRng);
    this.e = new Int32Array(512);
    this.a = rng.nextDouble() * 256.0;
    this.b = rng.nextDouble() * 256.0;
    this.c = rng.nextDouble() * 256.0;
    for (let i = 0; i < 256; i++) this.e[i] = i;
    for (let i = 0; i < 256; ++i) {
      const j = rng.nextInt(256 - i) + i;
      const k = this.e[i];
      this.e[i] = this.e[j];
      this.e[j] = k;
      this.e[i + 256] = this.e[i];
    }
  }

  add(out, x, z, sizeX, sizeZ, scaleX, scaleZ, amp) {
    let k = 0;
    for (let l = 0; l < sizeX; ++l) {
      const d5 = (x + l) * scaleX + this.a;
      for (let i1 = 0; i1 < sizeZ; ++i1) {
        const d6 = (z + i1) * scaleZ + this.b;
        const d7 = (d5 + d6) * F2;
        const j1 = simplexFloor(d5 + d7);
        const k1 = simplexFloor(d6 + d7);
        const d8 = (j1 + k1) * G2;
        const d9 = j1 - d8;
        const d10 = k1 - d8;
        const d11 = d5 - d9;
        const d12 = d6 - d10;
        const b0 = d11 > d12 ? 1 : 0;
        const b1 = d11 > d12 ? 0 : 1;
        const d13 = d11 - b0 + G2;
        const d14 = d12 - b1 + G2;
        const d15 = d11 - 1.0 + 2.0 * G2;
        const d16 = d12 - 1.0 + 2.0 * G2;
        const l1 = j1 & 255;
        const i2 = k1 & 255;
        const j2 = this.e[l1 + this.e[i2]] % 12;
        const k2 = this.e[l1 + b0 + this.e[i2 + b1]] % 12;
        const l2 = this.e[l1 + 1 + this.e[i2 + 1]] % 12;

        let d18 = 0.0;
        let d17 = 0.5 - d11 * d11 - d12 * d12;
        if (d17 >= 0.0) {
          d17 *= d17;
          d18 = d17 * d17 * simplexDot(SIMPLEX_GRAD[j2], d11, d12);
        }
        let d20 = 0.0;
        let d19 = 0.5 - d13 * d13 - d14 * d14;
        if (d19 >= 0.0) {
          d19 *= d19;
          d20 = d19 * d19 * simplexDot(SIMPLEX_GRAD[k2], d13, d14);
        }
        let d22 = 0.0;
        let d21 = 0.5 - d15 * d15 - d16 * d16;
        if (d21 >= 0.0) {
          d21 *= d21;
          d22 = d21 * d21 * simplexDot(SIMPLEX_GRAD[l2], d15, d16);
        }
        out[k++] += 70.0 * (d18 + d20 + d22) * amp;
      }
    }
  }
}

export class NoiseOctaves2 {
  constructor(seedOrRng, octaves) {
    const rng = seedOrRng instanceof JavaRandom ? seedOrRng : new JavaRandom(seedOrRng);
    this.octaves = octaves;
    this.a = [];
    for (let i = 0; i < octaves; i++) this.a.push(new Noise2(rng));
  }

  generate(out, x, z, sizeX, sizeZ, scaleX, scaleZ, lacunarity, persistence = 0.5) {
    scaleX /= 1.5;
    scaleZ /= 1.5;
    const arr = out && out.length >= sizeX * sizeZ ? out : new Float64Array(sizeX * sizeZ);
    for (let i = 0; i < arr.length; i++) arr[i] = 0.0;
    let d6 = 1.0;
    let d7 = 1.0;
    for (let l = 0; l < this.octaves; ++l) {
      this.a[l].add(arr, x, z, sizeX, sizeZ, scaleX * d7, scaleZ * d7, 0.55 / d6);
      d7 *= lacunarity;
      d6 *= persistence;
    }
    return arr;
  }
}
