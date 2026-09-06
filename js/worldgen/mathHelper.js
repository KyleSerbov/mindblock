const SIN_TABLE = new Float32Array(65536);
const SIN_SCALE = Math.fround(10430.378);
const COS_OFFSET = Math.fround(16384.0);

for (let i = 0; i < 65536; i++) {
  SIN_TABLE[i] = Math.sin((i * Math.PI * 2) / 65536);
}

function toJavaInt(v) {
  if (!Number.isFinite(v)) return v > 0 ? 2147483647 : -2147483648;
  if (v >= 2147483647) return 2147483647;
  if (v <= -2147483648) return -2147483648;
  return v < 0 ? Math.ceil(v) : Math.floor(v);
}

export function sin(f) {
  const scaled = Math.fround(Math.fround(f) * SIN_SCALE);
  return SIN_TABLE[toJavaInt(scaled) & 0xffff];
}

export function cos(f) {
  const shifted = Math.fround(Math.fround(Math.fround(f) * SIN_SCALE) + COS_OFFSET);
  return SIN_TABLE[toJavaInt(shifted) & 0xffff];
}

export function floor(d) {
  const i = toJavaInt(d);
  return d < i ? i - 1 : i;
}
