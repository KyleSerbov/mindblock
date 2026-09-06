export const WORLD_FACES = ['north', 'south', 'east', 'west', 'top', 'bottom'];
export const TRANSPORT_PART_ORDER = ['base', 'port', 'starboard', 'bow', 'stern'];

export const TRANSPORT_MODEL_BOUNDS = {
  '259': {
    base: { minX: -0.36, maxX: 0.36, minY: -0.50, maxY: -0.38, minZ: -0.72, maxZ: 0.72 },
    port: { minX: -0.50, maxX: -0.34, minY: -0.38, maxY: 0.18, minZ: -0.52, maxZ: 0.52 },
    starboard: { minX: 0.34, maxX: 0.50, minY: -0.38, maxY: 0.18, minZ: -0.52, maxZ: 0.52 },
    bow: { minX: -0.50, maxX: 0.50, minY: -0.38, maxY: 0.18, minZ: 0.52, maxZ: 0.72 },
    stern: { minX: -0.50, maxX: 0.50, minY: -0.38, maxY: 0.18, minZ: -0.72, maxZ: -0.52 }
  },
  '260': {
    base: { minX: -0.30, maxX: 0.30, minY: -0.50, maxY: -0.38, minZ: -0.54, maxZ: 0.54 },
    port: { minX: -0.48, maxX: -0.30, minY: -0.38, maxY: 0.24, minZ: -0.44, maxZ: 0.44 },
    starboard: { minX: 0.30, maxX: 0.48, minY: -0.38, maxY: 0.24, minZ: -0.44, maxZ: 0.44 },
    bow: { minX: -0.22, maxX: 0.22, minY: -0.38, maxY: 0.24, minZ: 0.38, maxZ: 0.54 },
    stern: { minX: -0.22, maxX: 0.22, minY: -0.38, maxY: 0.24, minZ: -0.54, maxZ: -0.38 }
  }
};

export const TRANSPORT_TEXTURE_PATHS = {
  '259': 'assets/textures/entity/boat.png',
  '260': 'assets/textures/entity/cart.png'
};

export const TRANSPORT_MODEL_BOXES = {
  '259': [
    {
      part: 'bottom',
      textureOffsetX: 0,
      textureOffsetY: 8,
      uvDx: 24,
      uvDy: 16,
      uvDz: 4,
      x: -10,
      y: -8,
      z: -3,
      dx: 20,
      dy: 16,
      dz: 4,
      rotationPointX: 0,
      rotationPointY: 3,
      rotationPointZ: 0,
      rotateAngleX: Math.PI / 2,
      rotateAngleY: 0,
      rotateAngleZ: 0
    },
    {
      part: 'left',
      textureOffsetX: 0,
      textureOffsetY: 0,
      uvDx: 20,
      uvDy: 6,
      uvDz: 2,
      x: -10,
      y: -7,
      z: -1,
      dx: 20,
      dy: 6,
      dz: 2,
      rotationPointX: -11,
      rotationPointY: 4,
      rotationPointZ: 0,
      rotateAngleX: 0,
      rotateAngleY: 3 * Math.PI / 2,
      rotateAngleZ: 0
    },
    {
      part: 'right',
      textureOffsetX: 0,
      textureOffsetY: 0,
      uvDx: 20,
      uvDy: 6,
      uvDz: 2,
      x: -10,
      y: -7,
      z: -1,
      dx: 20,
      dy: 6,
      dz: 2,
      rotationPointX: 11,
      rotationPointY: 4,
      rotationPointZ: 0,
      rotateAngleX: 0,
      rotateAngleY: Math.PI / 2,
      rotateAngleZ: 0
    },
    {
      part: 'front',
      textureOffsetX: 0,
      textureOffsetY: 0,
      uvDx: 20,
      uvDy: 6,
      uvDz: 2,
      x: -10,
      y: -7,
      z: -1,
      dx: 20,
      dy: 6,
      dz: 2,
      rotationPointX: 0,
      rotationPointY: 4,
      rotationPointZ: -9,
      rotateAngleX: 0,
      rotateAngleY: Math.PI,
      rotateAngleZ: 0
    },
    {
      part: 'back',
      textureOffsetX: 0,
      textureOffsetY: 0,
      uvDx: 20,
      uvDy: 6,
      uvDz: 2,
      x: -10,
      y: -7,
      z: -1,
      dx: 20,
      dy: 6,
      dz: 2,
      rotationPointX: 0,
      rotationPointY: 4,
      rotationPointZ: 9,
      rotateAngleX: 0,
      rotateAngleY: 0,
      rotateAngleZ: 0
    }
  ],
  '260': [
    {
      part: 'bottom',
      textureOffsetX: 0,
      textureOffsetY: 10,
      uvDx: 20,
      uvDy: 16,
      uvDz: 2,
      x: -10,
      y: -8,
      z: -1,
      dx: 20,
      dy: 16,
      dz: 2,
      rotationPointX: 0,
      rotationPointY: 4,
      rotationPointZ: 0,
      rotateAngleX: Math.PI / 2,
      rotateAngleY: 0,
      rotateAngleZ: 0
    },
    {
      part: 'inner',
      textureOffsetX: 44,
      textureOffsetY: 10,
      uvDx: 18,
      uvDy: 14,
      uvDz: 1,
      x: -9,
      y: -7,
      z: -1,
      dx: 18,
      dy: 14,
      dz: 1,
      rotationPointX: 0,
      // Tiny bias to prevent z-fighting with the lower cart floor slab.
      rotationPointY: 4.02,
      rotationPointZ: 0,
      rotateAngleX: -Math.PI / 2,
      rotateAngleY: 0,
      rotateAngleZ: 0
    },
    {
      part: 'left',
      textureOffsetX: 0,
      textureOffsetY: 0,
      uvDx: 16,
      uvDy: 8,
      uvDz: 2,
      x: -8,
      y: -9,
      z: -1,
      dx: 16,
      dy: 8,
      dz: 2,
      rotationPointX: -9,
      rotationPointY: 4,
      rotationPointZ: 0,
      rotateAngleX: 0,
      rotateAngleY: 3 * Math.PI / 2,
      rotateAngleZ: 0
    },
    {
      part: 'right',
      textureOffsetX: 0,
      textureOffsetY: 0,
      uvDx: 16,
      uvDy: 8,
      uvDz: 2,
      x: -8,
      y: -9,
      z: -1,
      dx: 16,
      dy: 8,
      dz: 2,
      rotationPointX: 9,
      rotationPointY: 4,
      rotationPointZ: 0,
      rotateAngleX: 0,
      rotateAngleY: Math.PI / 2,
      rotateAngleZ: 0
    },
    {
      part: 'front',
      textureOffsetX: 0,
      textureOffsetY: 0,
      uvDx: 16,
      uvDy: 8,
      uvDz: 2,
      x: -8,
      y: -9,
      z: -1,
      dx: 16,
      dy: 8,
      dz: 2,
      rotationPointX: 0,
      rotationPointY: 4,
      rotationPointZ: -7,
      rotateAngleX: 0,
      rotateAngleY: Math.PI,
      rotateAngleZ: 0
    },
    {
      part: 'back',
      textureOffsetX: 0,
      textureOffsetY: 0,
      uvDx: 16,
      uvDy: 8,
      uvDz: 2,
      x: -8,
      y: -9,
      z: -1,
      dx: 16,
      dy: 8,
      dz: 2,
      rotationPointX: 0,
      rotationPointY: 4,
      rotationPointZ: 7,
      rotateAngleX: 0,
      rotateAngleY: 0,
      rotateAngleZ: 0
    }
  ]
};

function makeFaceConfig(rotation = 0, uOffset = 0, vOffset = 0, presetKey = 'single') {
  return { rotation: rotation & 3, uOffset, vOffset, presetKey };
}

function makeTransportFaceDefaults(overrides = {}) {
  const result = {};
  for (const part of TRANSPORT_PART_ORDER) {
    for (const face of WORLD_FACES) {
      const key = `${part}_${face}`;
      const override = overrides[key] || {};
      result[key] = makeFaceConfig(
        Number(override.rotation) || 0,
        Number(override.uOffset) || 0,
        Number(override.vOffset) || 0,
        typeof override.presetKey === 'string' ? override.presetKey : 'single'
      );
    }
  }
  return result;
}

export const TRANSPORT_FACE_PRESET_OPTIONS = {
  single: { label: 'Single', rotation: 0, uOffset: 0, vOffset: 0 },
  spin90: { label: 'Spin 90', rotation: 1, uOffset: 0, vOffset: 0 },
  spin180: { label: 'Spin 180', rotation: 2, uOffset: 0, vOffset: 0 },
  spin270: { label: 'Spin 270', rotation: 3, uOffset: 0, vOffset: 0 },
  topBand: { label: 'Top Band', rotation: 0, uOffset: 0, vOffset: 0.15 },
  bottomBand: { label: 'Bottom Band', rotation: 0, uOffset: 0, vOffset: 0.0 },
  topBand90: { label: 'Top Band 90', rotation: 1, uOffset: 0, vOffset: 0.15 },
  topBand270: { label: 'Top Band 270', rotation: 3, uOffset: 0, vOffset: 0.15 }
};

export const TRANSPORT_FACE_DEFAULTS = {
  '259': makeTransportFaceDefaults({
    base_top: { rotation: 2, presetKey: 'spin180' },
    port_top: { rotation: 1, presetKey: 'topBand90', vOffset: 0.15 },
    starboard_top: { rotation: 3, presetKey: 'topBand270', vOffset: 0.15 },
    bow_top: { rotation: 2, presetKey: 'topBand', vOffset: 0.15 },
    stern_top: { rotation: 0, presetKey: 'topBand', vOffset: 0.15 }
  }),
  '260': makeTransportFaceDefaults({
    base_top: { rotation: 2, presetKey: 'spin180' },
    port_top: { rotation: 1, presetKey: 'topBand90', vOffset: 0.15 },
    starboard_top: { rotation: 3, presetKey: 'topBand270', vOffset: 0.15 },
    bow_top: { rotation: 2, presetKey: 'topBand', vOffset: 0.15 },
    stern_top: { rotation: 0, presetKey: 'topBand', vOffset: 0.15 }
  })
};

export function getTransportTypeKey(value) {
  if (value === 'boat' || value === 259 || value === '259') return '259';
  if (value === 'minecart' || value === 260 || value === '260') return '260';
  return null;
}
