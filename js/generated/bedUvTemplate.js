export const SOUTH_BED_FOOT_FACES = {
    north: { tile: 149, rotation: 0, uOffset: 0, vOffset: 0, flipH: false, flipV: false },
    south: { tile: 134, rotation: 0, uOffset: 0, vOffset: 0, flipH: false, flipV: false },
    east: { tile: 150, rotation: 0, uOffset: 0, vOffset: 0, flipH: true, flipV: false },
    west: { tile: 150, rotation: 0, uOffset: 0, vOffset: 0, flipH: false, flipV: false },
    top: { tile: 134, rotation: 1, uOffset: 0, vOffset: 0 },
    bottom: { tile: 4, rotation: 0, uOffset: 0, vOffset: 0 }
};

export const SOUTH_BED_HEAD_FACES = {
    north: { tile: 135, rotation: 0, uOffset: 0, vOffset: 0, flipH: false, flipV: true },
    south: { tile: 152, rotation: 0, uOffset: 0, vOffset: 0, flipH: false, flipV: false },
    east: { tile: 151, rotation: 0, uOffset: 0, vOffset: 0, flipH: true, flipV: false },
    west: { tile: 151, rotation: 0, uOffset: 0, vOffset: 0, flipH: false, flipV: false },
    top: { tile: 135, rotation: 1, uOffset: 0, vOffset: 0 },
    bottom: { tile: 4, rotation: 0, uOffset: 0, vOffset: 0 }
};

export const SOUTH_BED_FACES_BY_PART = {
    foot: SOUTH_BED_FOOT_FACES,
    head: SOUTH_BED_HEAD_FACES
};
