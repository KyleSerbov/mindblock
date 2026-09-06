/**
 * Java-compatible RNG for Beta 1.7.3 terrain parity.
 * Matches java.util.Random: 48-bit LCG, setSeed(seed ^ 0x5DEECE66D) & MASK_48,
 * next(bits), nextInt(bound) with rejection, nextLong() as signed 64-bit.
 */
const MULTIPLIER = 25214903917n;
const ADDEND = 11n;
const MASK_48 = (1n << 48n) - 1n;
const SEED_XOR = 0x5DEECE66Dn;
const FLOAT_UNIT = 1 << 24;
const DOUBLE_DENOMINATOR = 1n << 53n;

export function toSigned64(v) {
    return BigInt.asIntN(64, v);
}

export function javaStringHashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h * 31) + str.charCodeAt(i)) | 0;
    }
    return h;
}

export function parseMinecraftSeed(rawSeed) {
    if (rawSeed === undefined || rawSeed === null) {
        return 0n;
    }

    const s = String(rawSeed).trim();
    if (s.length === 0) {
        return 0n;
    }

    if (/^[+-]?\d+$/.test(s)) {
        try {
            return toSigned64(BigInt(s));
        } catch {
            // Fallback to hash behavior when parsing fails unexpectedly.
        }
    }

    return BigInt(javaStringHashCode(s));
}

export class JavaRandom {
    constructor(seed = 0n) {
        this.seed = 0n;
        this.setSeed(seed);
    }

    setSeed(seed) {
        const s = toSigned64(BigInt(seed));
        this.seed = (s ^ SEED_XOR) & MASK_48;
    }

    next(bits) {
        this.seed = (this.seed * MULTIPLIER + ADDEND) & MASK_48;
        const out = Number(this.seed >> (48n - BigInt(bits)));
        // Java next(32) returns a signed int.
        if (bits === 32 && out >= 2147483648) return out - 4294967296;
        return out;
    }

    nextBoolean() {
        return this.next(1) !== 0;
    }

    nextFloat() {
        // Java: next(24) / ((float)(1 << 24))
        // Round to 32-bit float precision to match Java's float type
        const result = this.next(24) / FLOAT_UNIT;
        return Math.fround(result);
    }

    nextDouble() {
        // Java: (((long)next(26) << 27) + next(27)) / (double)(1L << 53)
        const hi = BigInt(this.next(26));
        const lo = BigInt(this.next(27));
        const numerator = (hi << 27n) + lo;
        return Number(numerator) / Number(DOUBLE_DENOMINATOR);
    }

    nextInt(bound) {
        if (bound === undefined) {
            return this.next(32);
        }

        if (bound <= 0) throw new Error('bound must be positive');
        if ((bound & -bound) === bound) {
            // Java: (int)((bound * (long)next(31)) >> 31)
            return Math.floor((bound * this.next(31)) / 2147483648);
        }
        let bits;
        let val;
        do {
            bits = this.next(31);
            val = bits % bound;
            // Java: reject when bits - val + (bound-1) < 0 (32-bit signed; overflow makes it negative)
        } while (((bits - val + (bound - 1)) | 0) < 0);
        return val;
    }

    nextLong() {
        // Java: return ((long)next(32) << 32) + next(32);
        // next(32) is signed int, so the low addend must preserve sign.
        const hi = BigInt(this.nextInt());
        const lo = BigInt(this.nextInt());
        return toSigned64((hi << 32n) + lo);
    }
}
