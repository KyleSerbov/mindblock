// Shared fluid IDs and helpers (Beta-like moving/still variants).
export const WATER_MOVING_ID = 6;
export const WATER_STILL_ID = 70;
export const LAVA_MOVING_ID = 71;
export const LAVA_STILL_ID = 51;

export function isWaterId(id) {
    return id === WATER_MOVING_ID || id === WATER_STILL_ID;
}

export function isLavaId(id) {
    return id === LAVA_MOVING_ID || id === LAVA_STILL_ID;
}

export function isFluidId(id) {
    return isWaterId(id) || isLavaId(id);
}

export function fluidKindFromId(id) {
    if (isWaterId(id)) return 'water';
    if (isLavaId(id)) return 'lava';
    return null;
}

export function movingIdForKind(kind) {
    return kind === 'water' ? WATER_MOVING_ID : LAVA_MOVING_ID;
}

export function stillIdForKind(kind) {
    return kind === 'water' ? WATER_STILL_ID : LAVA_STILL_ID;
}

