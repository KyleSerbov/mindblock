// js/blocks.js
export const TEXTURE_PATH = 'assets/textures/';

const RAW_BLOCKS = [
    { id: 1, name: 'Grass', type: 'multi', top: 'grass_top.png', side: 'grass_side.png', bottom: 'dirt.png', hardness: 0.6, tool: 'shovel' },
    { id: 2, name: 'Dirt', type: 'single', texture: 'dirt.png', hardness: 0.5, tool: 'shovel' },
    { id: 3, name: 'Stone', type: 'single', texture: 'stone.png', hardness: 1.5, tool: 'pickaxe' },
    
    // Flammable Blocks
    { id: 4, name: 'Wood', type: 'multi', top: 'wood_top.png', side: 'wood_side.png', bottom: 'wood_top.png', hardness: 2.0, tool: 'axe', flammable: true, burnChance: 0.05 },
    { id: 5, name: 'Leaves', type: 'single', texture: 'leaves.png', transparent: true, hardness: 0.2, flammable: true, burnChance: 0.15 },
    { id: 103, name: 'Sapling', type: 'cross', texture: 'flower_dandelion.png', transparent: true, hardness: 0.0, tool: 'none' },
    
    { id: 6, name: 'Flowing Water', type: 'single', texture: 'water.png', transparent: true, opacity: 0.8, hardness: -1 },
    { id: 70, name: 'Water', type: 'single', texture: 'water.png', transparent: true, opacity: 0.8, hardness: -1 },
    { id: 7, name: 'Link', type: 'color', color: '#00FFFF', glow: true, hardness: 0.2 },
    { id: 8, name: 'Bedrock', type: 'single', texture: 'bedrock.png', hardness: -1 },
    { id: 9, name: 'Sand', type: 'single', texture: 'sand.png', hardness: 0.5, tool: 'shovel' },
    { id: 10, name: 'Coal Ore', type: 'single', texture: 'coal_ore.png', hardness: 3.0, tool: 'pickaxe' },
    { id: 11, name: 'Gold Ore', type: 'single', texture: 'gold_ore.png', hardness: 3.0, tool: 'pickaxe' },
    { id: 12, name: 'Iron Ore', type: 'single', texture: 'iron_ore.png', hardness: 3.0, tool: 'pickaxe' },
    { id: 13, name: 'Diamond Ore', type: 'single', texture: 'diamond_ore.png', hardness: 3.0, tool: 'pickaxe' },
    { id: 21, name: 'Link', type: 'color', color: '#00FFFF', glow: true, hardness: 0.2 }, // Link block placed where Lapis Lazuli Ore would be (Beta ID 21)
    
    // Flammable Planks
    { id: 14, name: 'Wood Planks', type: 'single', texture: 'wood_planks.png', hardness: 2.0, tool: 'axe', flammable: true, burnChance: 0.1 },
    
    { id: 15, name: 'Cobblestone', type: 'single', texture: 'cobblestone.png', hardness: 2.0, tool: 'pickaxe' },
    { id: 48, name: 'Mossy Cobblestone', type: 'single', texture: 'cobblestone_mossy.png', hardness: 2.0, tool: 'pickaxe' },
    { id: 16, name: 'Crafting Table', type: 'multi', top: 'crafting_table_top.png', bottom: 'wood_planks.png', side: 'crafting_table_side_1.png', side2: 'crafting_table_side_2.png', hardness: 2.5, tool: 'axe', flammable: true, burnChance: 0.05 },
    { id: 17, name: 'Furnace', type: 'multi', top: 'furnace_top.png', bottom: 'furnace_top.png', front: 'furnace_front_off.png', side: 'furnace_side.png', hardness: 3.5, tool: 'pickaxe' },
    { id: 18, name: 'Furnace On', type: 'multi', top: 'furnace_top.png', bottom: 'furnace_top.png', front: 'furnace_front_on.png', side: 'furnace_side.png', light: 15, hardness: 3.5, tool: 'pickaxe' },
    { id: 58, name: 'Crafting Table', type: 'multi', top: 'crafting_table_top.png', bottom: 'wood_planks.png', side: 'crafting_table_side_1.png', side2: 'crafting_table_side_2.png', hardness: 2.5, tool: 'axe', flammable: true, burnChance: 0.05 },
    { id: 61, name: 'Furnace', type: 'multi', top: 'furnace_top.png', bottom: 'furnace_top.png', front: 'furnace_front_off.png', side: 'furnace_side.png', hardness: 3.5, tool: 'pickaxe' },
    { id: 62, name: 'Furnace On', type: 'multi', top: 'furnace_top.png', bottom: 'furnace_top.png', front: 'furnace_front_on.png', side: 'furnace_side.png', light: 15, hardness: 3.5, tool: 'pickaxe' },
    { id: 19, name: 'Glass', type: 'single', texture: 'glass.png', transparent: true, hardness: 0.3 },
    { id: 20, name: 'Glass', type: 'single', texture: 'glass.png', transparent: true, hardness: 0.3 },
    
    // Items (Not placeable) ??? 21 is Link block (replaces Lapis Ore); Iron Ingot at 201
    // Canonical Beta tool-ID aliases (collide with block IDs, resolved by ItemStack.kind).
    { id: 1, name: 'Iron Pickaxe (Beta ID)', type: 'item', texture: 'pickaxe_iron.png', isItem: true, toolType: 'pickaxe', tier: 3, maxDurability: 250, stackable: false },
    { id: 2, name: 'Iron Axe (Beta ID)', type: 'item', texture: 'axe_iron.png', isItem: true, toolType: 'axe', tier: 3, maxDurability: 250, stackable: false },
    { id: 3, name: 'Flint and Steel (Beta ID)', type: 'item', texture: 'flint_and_steel.png', isItem: true, stackable: false, maxDurability: 64 },
    { id: 11, name: 'Iron Sword (Beta ID)', type: 'item', texture: 'sword_iron.png', isItem: true, toolType: 'sword', tier: 3, maxDurability: 250, stackable: false },
    { id: 12, name: 'Wood Sword (Beta ID)', type: 'item', texture: 'sword_wood.png', isItem: true, toolType: 'sword', tier: 1, maxDurability: 60, stackable: false },
    { id: 13, name: 'Wood Shovel (Beta ID)', type: 'item', texture: 'shovel_wood.png', isItem: true, toolType: 'shovel', tier: 1, maxDurability: 60, stackable: false },
    { id: 14, name: 'Wood Pickaxe (Beta ID)', type: 'item', texture: 'pickaxe_wood.png', isItem: true, toolType: 'pickaxe', tier: 1, maxDurability: 60, stackable: false },
    { id: 15, name: 'Wood Axe (Beta ID)', type: 'item', texture: 'axe_wood.png', isItem: true, toolType: 'axe', tier: 1, maxDurability: 60, stackable: false },
    { id: 16, name: 'Stone Sword (Beta ID)', type: 'item', texture: 'sword_stone.png', isItem: true, toolType: 'sword', tier: 2, maxDurability: 132, stackable: false },
    { id: 17, name: 'Stone Shovel (Beta ID)', type: 'item', texture: 'shovel_stone.png', isItem: true, toolType: 'shovel', tier: 2, maxDurability: 132, stackable: false },
    { id: 18, name: 'Stone Pickaxe (Beta ID)', type: 'item', texture: 'pickaxe_stone.png', isItem: true, toolType: 'pickaxe', tier: 2, maxDurability: 132, stackable: false },
    { id: 19, name: 'Stone Axe (Beta ID)', type: 'item', texture: 'axe_stone.png', isItem: true, toolType: 'axe', tier: 2, maxDurability: 132, stackable: false },
    { id: 21, name: 'Diamond Shovel (Beta ID)', type: 'item', texture: 'shovel_diamond.png', isItem: true, toolType: 'shovel', tier: 4, maxDurability: 1561, stackable: false },
    { id: 7, name: 'Coal (Beta ID)', type: 'item', texture: 'coal.png', isItem: true },
    { id: 8, name: 'Diamond (Beta ID)', type: 'item', texture: 'diamond.png', isItem: true },
    { id: 9, name: 'Iron Ingot (Beta ID)', type: 'item', texture: 'iron.png', isItem: true },
    { id: 37, name: 'Diamond Hoe (Beta ID)', type: 'item', texture: 'hoe_diamond.png', isItem: true, toolType: 'hoe', tier: 4, maxDurability: 1561, stackable: false },
    { id: 38, name: 'Gold Hoe (Beta ID)', type: 'item', texture: 'hoe_gold.png', isItem: true, toolType: 'hoe', tier: 1, maxDurability: 33, stackable: false },
    { id: 63, name: 'Raw Porkchop (Beta ID)', type: 'item', texture: 'porkchop_raw.png', isItem: true },
    { id: 64, name: 'Cooked Porkchop (Beta ID)', type: 'item', texture: 'porkchop_cooked.png', isItem: true },
    { id: 4, name: 'Red Apple (Beta ID)', type: 'item', texture: 'cookie.png', isItem: true },
    { id: 5, name: 'Bow (Beta ID)', type: 'item', texture: 'stick.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 384 },
    { id: 6, name: 'Arrow (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 10, name: 'Gold Ingot (Beta ID)', type: 'item', texture: 'iron.png', isItem: true },
    { id: 31, name: 'String (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 32, name: 'Feather (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 39, name: 'Seeds (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 40, name: 'Wheat (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 44, name: 'Leather Pants (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 75 },
    { id: 45, name: 'Leather Boots (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 65 },
    // Stable runtime IDs for leather armor pieces whose canonical Beta IDs collide in this codebase.
    { id: 342, name: 'Leather Helmet', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 55 },
    { id: 343, name: 'Leather Chestplate', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 80 },
    { id: 344, name: 'Gold Helmet', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 77 },
    { id: 345, name: 'Gold Chestplate', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 112 },
    { id: 346, name: 'Gold Leggings', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 105 },
    { id: 347, name: 'Gold Boots', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 91 },
    { id: 46, name: 'Chain Helmet (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 165 },
    { id: 47, name: 'Chain Chestplate (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 240 },
    { id: 48, name: 'Chain Leggings (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 225 },
    { id: 49, name: 'Chain Boots (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 195 },
    { id: 50, name: 'Iron Helmet (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 165 },
    { id: 51, name: 'Iron Chestplate (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 240 },
    { id: 52, name: 'Iron Leggings (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 225 },
    { id: 53, name: 'Iron Boots (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 195 },
    { id: 54, name: 'Diamond Helmet (Beta ID)', type: 'item', texture: 'diamond.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 363 },
    { id: 55, name: 'Diamond Chestplate (Beta ID)', type: 'item', texture: 'diamond.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 528 },
    { id: 56, name: 'Diamond Leggings (Beta ID)', type: 'item', texture: 'diamond.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 495 },
    { id: 57, name: 'Diamond Boots (Beta ID)', type: 'item', texture: 'diamond.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 429 },
    { id: 65, name: 'Painting (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 66, name: 'Golden Apple (Beta ID)', type: 'item', texture: 'cookie.png', isItem: true },
    { id: 67, name: 'Sign (Beta ID)', type: 'item', texture: 'stick.png', isItem: true, stackable: true, maxStack: 16 },
    { id: 68, name: 'Wooden Door (Beta ID)', type: 'item', texture: 'wood_planks.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 69, name: 'Empty Bucket (Beta ID)', type: 'item', texture: 'bucket_empty.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 70, name: 'Water Bucket (Beta ID)', type: 'item', texture: 'bucket_water.png', isItem: true, stackable: false },
    { id: 71, name: 'Lava Bucket (Beta ID)', type: 'item', texture: 'bucket_lava.png', isItem: true, stackable: false },
    { id: 72, name: 'Minecart (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 73, name: 'Saddle (Beta ID)', type: 'item', texture: 'mob/saddle.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 74, name: 'Iron Door (Beta ID)', type: 'item', texture: 'iron.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 75, name: 'Redstone Dust (Beta ID)', type: 'item', texture: 'repeater.png', isItem: true },
    { id: 76, name: 'Snowball (Beta ID)', type: 'item', texture: 'snow.png', isItem: true, stackable: true, maxStack: 16 },
    { id: 77, name: 'Boat (Beta ID)', type: 'item', texture: 'wood_planks.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 78, name: 'Leather (Beta ID)', type: 'item', texture: 'mob/saddle.png', isItem: true },
    { id: 79, name: 'Milk Bucket (Beta ID)', type: 'item', texture: 'bucket_water.png', isItem: true, stackable: false },
    { id: 80, name: 'Brick (Beta ID)', type: 'item', texture: 'stone.png', isItem: true },
    { id: 81, name: 'Clay Ball (Beta ID)', type: 'item', texture: 'clay.png', isItem: true },
    { id: 82, name: 'Reed/Sugar Cane (Beta ID)', type: 'item', texture: 'sugar.png', isItem: true },
    { id: 84, name: 'Book (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 90, name: 'Fishing Rod (Beta ID)', type: 'item', texture: 'stick.png', isItem: true, stackable: false, maxStack: 1, maxDurability: 64 },
    { id: 91, name: 'Clock (Beta ID)', type: 'item', texture: 'repeater.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 349, name: 'Compass', type: 'item', texture: 'repeater.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 350, name: 'Map', type: 'item', texture: 'stick.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 93, name: 'Raw Fish (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 94, name: 'Cooked Fish (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 95, name: 'Dye Powder (Beta ID)', type: 'item', texture: 'gunpowder.png', isItem: true },
    { id: 96, name: 'Bone (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 297, name: 'Bread (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 339, name: 'Paper (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 341, name: 'Slimeball (Beta ID)', type: 'item', texture: 'stick.png', isItem: true },
    { id: 370, name: 'Ghast Tear (Beta ID)', type: 'item', texture: 'gunpowder.png', isItem: true },
    { id: 283, name: 'Gold Sword (Beta ID)', type: 'item', texture: 'sword_gold.png', isItem: true, toolType: 'sword', tier: 1, maxDurability: 33, stackable: false },
    { id: 284, name: 'Gold Shovel (Beta ID)', type: 'item', texture: 'shovel_gold.png', isItem: true, toolType: 'shovel', tier: 1, maxDurability: 33, stackable: false },
    { id: 285, name: 'Gold Pickaxe (Beta ID)', type: 'item', texture: 'pickaxe_gold.png', isItem: true, toolType: 'pickaxe', tier: 1, maxDurability: 33, stackable: false },
    { id: 286, name: 'Gold Axe (Beta ID)', type: 'item', texture: 'axe_gold.png', isItem: true, toolType: 'axe', tier: 1, maxDurability: 33, stackable: false },
    { id: 294, name: 'Gold Hoe (Beta ID)', type: 'item', texture: 'hoe_gold.png', isItem: true, toolType: 'hoe', tier: 1, maxDurability: 33, stackable: false },
    { id: 280, name: 'Bowl (Beta ID)', type: 'item', texture: 'stick.png', isItem: true, stackable: true, maxStack: 64 },
    { id: 281, name: 'Mushroom Stew (Beta ID)', type: 'item', texture: 'cookie.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 20, name: 'Coal', type: 'item', texture: 'coal.png', isItem: true },
    { id: 201, name: 'Iron Ingot', type: 'item', texture: 'iron.png', isItem: true },
    { id: 22, name: 'Diamond', type: 'item', texture: 'diamond.png', isItem: true },
    { id: 23, name: 'Stick', type: 'item', texture: 'stick.png', isItem: true },
    { id: 22, name: 'Link Block', type: 'color', color: '#00FFFF', glow: true, hardness: 0.2 },
    { id: 23, name: 'Dispenser', type: 'multi', top: 'furnace_top.png', bottom: 'furnace_top.png', front: 'furnace_front_off.png', side: 'furnace_side.png', hardness: 3.5, tool: 'pickaxe' },

    // Wood Tools (Durability: 60)
    { id: 24, name: 'Wood Sword', type: 'item', texture: 'sword_wood.png', isItem: true, toolType: 'sword', tier: 1, maxDurability: 60, stackable: false },
    { id: 25, name: 'Wood Pickaxe', type: 'item', texture: 'pickaxe_wood.png', isItem: true, toolType: 'pickaxe', tier: 1, maxDurability: 60, stackable: false },
    { id: 26, name: 'Wood Axe', type: 'item', texture: 'axe_wood.png', isItem: true, toolType: 'axe', tier: 1, maxDurability: 60, stackable: false },
    { id: 27, name: 'Wood Shovel', type: 'item', texture: 'shovel_wood.png', isItem: true, toolType: 'shovel', tier: 1, maxDurability: 60, stackable: false },
    { id: 28, name: 'Wood Hoe', type: 'item', texture: 'hoe_wood.png', isItem: true, toolType: 'hoe', tier: 1, maxDurability: 60, stackable: false },
    { id: 263, name: 'Rail', type: 'rail', texture: 'stone.png', transparent: true, hardness: 0.7, tool: 'pickaxe', stackable: true },
    { id: 264, name: 'Jukebox', type: 'single', texture: 'wood_planks.png', hardness: 2.0, tool: 'axe' },
    { id: 265, name: 'Snow Block', type: 'single', texture: 'snow.png', hardness: 0.2, tool: 'shovel' },
    { id: 266, name: 'Block of Diamond', type: 'single', texture: 'diamond.png', hardness: 5.0, tool: 'pickaxe' },
    { id: 27, name: 'Powered Rail', type: 'rail', texture: 'stone.png', transparent: true, hardness: 0.7, tool: 'pickaxe', stackable: true },
    { id: 28, name: 'Detector Rail', type: 'rail', texture: 'stone.png', transparent: true, hardness: 0.7, tool: 'pickaxe', stackable: true },
    { id: 25, name: 'Note Block', type: 'single', texture: 'wood_planks.png', hardness: 0.8, tool: 'axe' },
    { id: 26, name: 'Bed', type: 'bed', texture: 'bed.png', transparent: true, hardness: 0.2, tool: 'axe' },

    // Stone Tools (Durability: 132) ??? 31/32 removed (Long Grass/Dead Bush texture files missing); axe/shovel at 231/232
    { id: 31, name: 'Tall Grass', type: 'cross', texture: 'flower_dandelion.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 32, name: 'Dead Bush', type: 'cross', texture: 'flower_dandelion.png', transparent: true, hardness: 0.0, tool: 'none' },

    { id: 29, name: 'Stone Sword', type: 'item', texture: 'sword_stone.png', isItem: true, toolType: 'sword', tier: 2, maxDurability: 132, stackable: false },
    { id: 29, name: 'Sticky Piston', type: 'multi', top: 'stone.png', bottom: 'stone.png', side: 'stone.png', front: 'stone.png', hardness: 2.5, tool: 'pickaxe' },
    { id: 30, name: 'Stone Pickaxe', type: 'item', texture: 'pickaxe_stone.png', isItem: true, toolType: 'pickaxe', tier: 2, maxDurability: 132, stackable: false },
    { id: 30, name: 'Cobweb', type: 'cross', texture: 'glass.png', transparent: true, hardness: 4.0, tool: 'sword' },
    { id: 231, name: 'Stone Axe', type: 'item', texture: 'axe_stone.png', isItem: true, toolType: 'axe', tier: 2, maxDurability: 132, stackable: false },
    { id: 232, name: 'Stone Shovel', type: 'item', texture: 'shovel_stone.png', isItem: true, toolType: 'shovel', tier: 2, maxDurability: 132, stackable: false },
    { id: 33, name: 'Stone Hoe', type: 'item', texture: 'hoe_stone.png', isItem: true, toolType: 'hoe', tier: 2, maxDurability: 132, stackable: false },
    { id: 33, name: 'Piston', type: 'multi', top: 'stone.png', bottom: 'stone.png', side: 'stone.png', front: 'stone.png', hardness: 2.5, tool: 'pickaxe' },

    // Iron Tools (Durability: 250) ??? 37/38 reserved for Beta flowers; shovel/hoe at 237/238
    { id: 34, name: 'Iron Sword', type: 'item', texture: 'sword_iron.png', isItem: true, toolType: 'sword', tier: 3, maxDurability: 250, stackable: false },
    { id: 35, name: 'Iron Pickaxe', type: 'item', texture: 'pickaxe_iron.png', isItem: true, toolType: 'pickaxe', tier: 3, maxDurability: 250, stackable: false },
    { id: 36, name: 'Iron Axe', type: 'item', texture: 'axe_iron.png', isItem: true, toolType: 'axe', tier: 3, maxDurability: 250, stackable: false },
    { id: 237, name: 'Iron Shovel', type: 'item', texture: 'shovel_iron.png', isItem: true, toolType: 'shovel', tier: 3, maxDurability: 250, stackable: false },
    { id: 238, name: 'Iron Hoe', type: 'item', texture: 'hoe_iron.png', isItem: true, toolType: 'hoe', tier: 3, maxDurability: 250, stackable: false },

    // Diamond Tools (Durability: 1561) ??? 39/40 removed (Beta mushrooms texture files missing); sword/pickaxe at 239/240
    { id: 239, name: 'Diamond Sword', type: 'item', texture: 'sword_diamond.png', isItem: true, toolType: 'sword', tier: 4, maxDurability: 1561, stackable: false },
    { id: 240, name: 'Diamond Pickaxe', type: 'item', texture: 'pickaxe_diamond.png', isItem: true, toolType: 'pickaxe', tier: 4, maxDurability: 1561, stackable: false },
    { id: 41, name: 'Diamond Axe', type: 'item', texture: 'axe_diamond.png', isItem: true, toolType: 'axe', tier: 4, maxDurability: 1561, stackable: false },
    { id: 42, name: 'Diamond Shovel', type: 'item', texture: 'shovel_diamond.png', isItem: true, toolType: 'shovel', tier: 4, maxDurability: 1561, stackable: false },
    { id: 43, name: 'Diamond Hoe', type: 'item', texture: 'hoe_diamond.png', isItem: true, toolType: 'hoe', tier: 4, maxDurability: 1561, stackable: false },
    { id: 43, name: 'Double Stone Slab', type: 'multi', top: 'stone.png', bottom: 'stone.png', side: 'stone.png', hardness: 2.0, tool: 'pickaxe' },
    { id: 44, name: 'Stone Slab', type: 'slab', texture: 'stone.png', hardness: 2.0, tool: 'pickaxe' },
    { id: 45, name: 'Brick Block', type: 'single', texture: 'stone.png', hardness: 2.0, tool: 'pickaxe' },
    { id: 46, name: 'TNT', type: 'multi', top: 'tnt_top.png', bottom: 'tnt_bottom.png', side: 'tnt_side.png', hardness: 0.0, tool: 'none', flammable: true, burnChance: 1.0 },
    { id: 47, name: 'Bookshelf', type: 'single', texture: 'wood_planks.png', hardness: 1.5, tool: 'axe', flammable: true, burnChance: 0.15 },
    { id: 49, name: 'Obsidian', type: 'single', texture: 'obsidian.png', hardness: 50.0, tool: 'pickaxe' },

    // Lighting Items
    { id: 50, name: 'Torch', type: 'torch', texture: 'torch.png', light: 14, transparent: true, hardness: 0.1, stackable: true },
    { id: 75, name: 'Redstone Torch Off', type: 'torch', texture: 'torch.png', light: 0, transparent: true, hardness: 0.1, stackable: true },
    { id: 76, name: 'Redstone Torch On', type: 'torch', texture: 'torch.png', light: 7, transparent: true, hardness: 0.1, stackable: true },
    { id: 77, name: 'Stone Button', type: 'button', texture: 'stone.png', transparent: true, hardness: 0.5, stackable: true },
    { id: 96, name: 'Trapdoor', type: 'trapdoor', texture: 'wood_planks.png', transparent: true, hardness: 3.0, tool: 'axe', flammable: true, burnChance: 0.05, stackable: true },
    // Runtime block IDs reserved for Beta-canonical colliding structure families.
    { id: 253, name: 'Ladder', type: 'ladder', texture: 'wood_planks.png', transparent: true, hardness: 0.4, tool: 'axe', flammable: true, burnChance: 0.1, stackable: true },
    { id: 254, name: 'Sign Post', type: 'signPost', texture: 'wood_planks.png', transparent: true, hardness: 1.0, tool: 'axe', flammable: true, burnChance: 0.1, stackable: true },
    { id: 255, name: 'Wall Sign', type: 'wallSign', texture: 'wood_planks.png', transparent: true, hardness: 1.0, tool: 'axe', flammable: true, burnChance: 0.1, stackable: true },
    { id: 256, name: 'Wooden Door Block', type: 'door', texture: 'wood_planks.png', transparent: true, hardness: 3.0, tool: 'axe', flammable: true, burnChance: 0.1, stackable: true },
    { id: 257, name: 'Iron Door Block', type: 'door', texture: 'iron.png', transparent: true, hardness: 5.0, tool: 'pickaxe', stackable: true },
    { id: 112, name: 'Painting Block', type: 'painting', texture: 'wood_planks.png', transparent: true, hardness: 0.0, tool: 'none', stackable: true },
    { id: 258, name: 'Painting Block', type: 'painting', texture: 'wood_planks.png', transparent: true, hardness: 0.0, tool: 'none', stackable: true },
    { id: 259, name: 'Boat Block', type: 'boat', texture: 'entity/boat.png', transparent: true, hardness: 0.0, tool: 'none', stackable: true },
    { id: 260, name: 'Minecart Block', type: 'minecart', texture: 'entity/cart.png', transparent: true, hardness: 0.0, tool: 'none', stackable: true },
    { id: 111, name: 'Lever', type: 'lever', texture: 'stone.png', transparent: true, hardness: 0.5, tool: 'pickaxe', stackable: true },
    { id: 261, name: 'Lever', type: 'lever', texture: 'stone.png', transparent: true, hardness: 0.5, tool: 'pickaxe', stackable: true },
    { id: 72, name: 'Wood Pressure Plate', type: 'pressurePlate', texture: 'wood_planks.png', transparent: true, hardness: 0.5, stackable: true },
    { id: 262, name: 'Stone Pressure Plate', type: 'pressurePlate', texture: 'stone.png', transparent: true, hardness: 0.5, tool: 'pickaxe', stackable: true },
    
    // Fluids
    { id: 51, name: 'Lava', type: 'single', texture: 'lava.png', light: 15, hardness: -1 }, // still lava
    { id: 71, name: 'Flowing Lava', type: 'single', texture: 'lava.png', light: 15, hardness: -1 },
    
    // New Blocks (Beta parity: 52 = Mob Spawner; Obsidian moved to 252)
    { id: 52, name: 'Mob Spawner', type: 'single', texture: 'stone.png', hardness: 5.0, tool: 'pickaxe' },
    
    // Chest (Beta 54; 53 kept for backward compat)
    { id: 53, name: 'Chest', type: 'chest', hardness: 2.5, tool: 'axe', transparent: true, flammable: true, burnChance: 0.05 },
    { id: 54, name: 'Chest', type: 'chest', hardness: 2.5, tool: 'axe', transparent: true, flammable: true, burnChance: 0.05 },
    { id: 95, name: 'Locked Chest', type: 'chest', hardness: 2.5, tool: 'axe', transparent: true, flammable: true, burnChance: 0.05 },
    
    // Vegetation (Beta 37/38 = flowers; 55 kept for backward compat)
    { id: 37, name: 'Yellow Flower', type: 'cross', texture: 'flower_dandelion.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 38, name: 'Red Rose', type: 'cross', texture: 'flower_rose.png', transparent: true, hardness: 0.0, tool: 'none' },
    // Canonical Beta mushrooms (39/40). Texture placeholders reuse flower sprites until dedicated mushroom textures are added.
    { id: 39, name: 'Brown Mushroom', type: 'cross', texture: 'flower_dandelion.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 40, name: 'Red Mushroom', type: 'cross', texture: 'flower_rose.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 41, name: 'Block of Gold', type: 'single', texture: 'url_block.png', hardness: 3.0, tool: 'pickaxe' },
    { id: 42, name: 'Block of Iron', type: 'single', texture: 'iron.png', hardness: 5.0, tool: 'pickaxe' },
    // Legacy runtime mushroom aliases kept for backward compatibility.
    { id: 66, name: 'Brown Mushroom', type: 'cross', texture: 'flower_dandelion.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 67, name: 'Red Mushroom', type: 'cross', texture: 'flower_rose.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 68, name: 'Reeds', type: 'cross', texture: 'flower_dandelion.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 69, name: 'Pumpkin', type: 'multi', top: 'wood_top.png', side: 'wood_side.png', bottom: 'wood_top.png', front: 'wood_side.png', hardness: 1.0, tool: 'axe' },
    { id: 55, name: 'Redstone Wire', type: 'rail', texture: 'redstone_dust.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 56, name: 'Cactus', type: 'multi', top: 'cactus_top.png', side: 'cactus_side.png', bottom: 'cactus_bottom.png', hardness: 0.4, tool: 'axe', transparent: true },
    { id: 57, name: 'Gravel', type: 'single', texture: 'gravel.png', hardness: 0.6, tool: 'shovel' },
    { id: 81, name: 'Cactus', type: 'multi', top: 'cactus_top.png', side: 'cactus_side.png', bottom: 'cactus_bottom.png', hardness: 0.4, tool: 'axe', transparent: true },
    { id: 82, name: 'Clay', type: 'single', texture: 'clay.png', hardness: 0.6, tool: 'shovel' },
    { id: 84, name: 'White Wool', type: 'single', texture: 'wool_white.png', hardness: 0.8, tool: 'shears' },
    { id: 85, name: 'Fence', type: 'fence', texture: 'wood_planks.png', transparent: true, hardness: 2.0, tool: 'axe', flammable: true, burnChance: 0.1 },
    { id: 73, name: 'Redstone Ore', type: 'single', texture: 'stone.png', hardness: 3.0, tool: 'pickaxe' },
    { id: 74, name: 'Glowing Redstone Ore', type: 'single', texture: 'stone.png', light: 10, hardness: 3.0, tool: 'pickaxe' },
    { id: 86, name: 'Raw Porkchop', type: 'item', texture: 'porkchop_raw.png', isItem: true },
    { id: 87, name: 'Cooked Porkchop', type: 'item', texture: 'porkchop_cooked.png', isItem: true },
    { id: 88, name: 'Raw Chicken', type: 'item', texture: 'chicken_raw.png', isItem: true },
    { id: 89, name: 'Cooked Chicken', type: 'item', texture: 'chicken_cooked.png', isItem: true },
    { id: 88, name: 'Soul Sand', type: 'single', texture: 'sand.png', hardness: 0.5, tool: 'shovel' },
    { id: 89, name: 'Glowstone', type: 'single', texture: 'stone.png', hardness: 0.3, tool: 'none', light: 15 },
    
    // New Items
    { id: 58, name: 'Flint', type: 'item', texture: 'flint.png', isItem: true },
    { id: 59, name: 'Flint and Steel', type: 'item', texture: 'flint_and_steel.png', isItem: true, stackable: false, maxDurability: 64 },
    { id: 59, name: 'Crops', type: 'cross', texture: 'flower_dandelion.png', transparent: true, hardness: 0.0, tool: 'none' },
    { id: 60, name: 'Farmland', type: 'multi', top: 'dirt.png', bottom: 'dirt.png', side: 'dirt.png', hardness: 0.6, tool: 'shovel' },
    { id: 85, name: 'Egg', type: 'item', texture: 'egg.png', isItem: true, stackable: true, maxStack: 16 },
    { id: 83, name: 'Shears', type: 'item', texture: 'shears.png', isItem: true, stackable: false, maxDurability: 238 },
    { id: 0, name: 'Iron Shovel', type: 'item', texture: 'shovel_iron.png', isItem: true, toolType: 'shovel', tier: 3, maxDurability: 250, stackable: false },

    // Buckets
    { id: 60, name: 'Empty Bucket', type: 'item', texture: 'bucket_empty.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 61, name: 'Water Bucket', type: 'item', texture: 'bucket_water.png', isItem: true, stackable: false },
    { id: 62, name: 'Lava Bucket', type: 'item', texture: 'bucket_lava.png', isItem: true, stackable: false },

    // Fire (Animated)
    { id: 63, name: 'Fire', type: 'fire', transparent: true, light: 15, hardness: 0.0, tool: 'none', animated: true, frames: 4 },

    // Snow Grass (NEW)
    { id: 64, name: 'Snow Grass', type: 'multi', top: 'snow.png', side: 'grass_snow_side.png', bottom: 'dirt.png', hardness: 0.6, tool: 'shovel' },
    { id: 65, name: 'Sandstone', type: 'multi', top: 'sandstone_top.png', side: 'sandstone_side.png', bottom: 'sandstone_bottom.png', hardness: 0.8, tool: 'pickaxe' },
    
    // Poseidon / Beta terrain (snow layer, ice)
    { id: 78, name: 'Snow', type: 'single', texture: 'snow.png', hardness: 0.2, tool: 'shovel' },
    { id: 79, name: 'Ice', type: 'single', texture: 'ice.png', transparent: true, opacity: 0.8, hardness: 0.5, tool: 'pickaxe' },

    // Nether Blocks
    { id: 80, name: 'Netherrack', type: 'single', texture: 'netherrack.png', hardness: 0.4, tool: 'pickaxe' },
    { id: 87, name: 'Netherrack', type: 'single', texture: 'netherrack.png', hardness: 0.4, tool: 'pickaxe' },

    // Portal (Animated)
    { id: 90, name: 'Portal', type: 'portal', transparent: true, light: 11, hardness: -1, tool: 'none' },
    { id: 91, name: 'TNT', type: 'multi', top: 'tnt_top.png', bottom: 'tnt_bottom.png', side: 'tnt_side.png', hardness: 0.0, tool: 'none', flammable: true, burnChance: 1.0 },
    { id: 92, name: 'Gunpowder', type: 'item', texture: 'gunpowder.png', isItem: true },
    { id: 92, name: 'Cake Block', type: 'cakeBlock', texture: 'cake.png', transparent: true, hardness: 0.5, tool: 'none' },
    { id: 93, name: 'Redstone Repeater Off', type: 'repeater', texture: 'stone.png', hardness: 0.0, transparent: true, stackable: true },
    { id: 94, name: 'Redstone Repeater On', type: 'repeater', texture: 'stone.png', hardness: 0.0, transparent: true, stackable: true, light: 9 },
    { id: 97, name: 'Sugar', type: 'item', texture: 'sugar.png', isItem: true },
    { id: 348, name: 'Glowstone Dust (Beta ID)', type: 'item', texture: 'gunpowder.png', isItem: true },
    { id: 98, name: 'Cake', type: 'item', texture: 'cake.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 99, name: 'Bed', type: 'item', texture: 'bed.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 100, name: 'Redstone Repeater', type: 'item', texture: 'repeater.png', isItem: true },
    { id: 101, name: 'Cookie', type: 'item', texture: 'cookie.png', isItem: true },
    { id: 102, name: 'Ladder Item', type: 'item', texture: 'wood_planks.png', isItem: true },
    { id: 2000, name: 'Music Disc 13', type: 'item', texture: 'record_13.png', isItem: true, stackable: false, maxStack: 1 },
    { id: 2001, name: 'Music Disc Cat', type: 'item', texture: 'record_cat.png', isItem: true, stackable: false, maxStack: 1 },
    // Obsidian (moved to 252 so 52 = Mob Spawner for Beta parity)
    { id: 252, name: 'Obsidian', type: 'single', texture: 'obsidian.png', hardness: 50.0, tool: 'pickaxe' }
];

const RAW_BLOCK_IDS = new Set(RAW_BLOCKS.filter((b) => !b.isItem).map((b) => Number(b.id)));
const RAW_ALL_IDS = new Set(RAW_BLOCKS.map((b) => Number(b.id)));
const LEGACY_TO_CANONICAL_BLOCK_ID = new Map();
const CANONICAL_TO_LEGACY_BLOCK_ID = new Map();
const LEGACY_TO_CANONICAL_ITEM_ID = new Map();
const CANONICAL_TO_LEGACY_ITEM_ID = new Map();

{
    const occupied = new Set([...RAW_BLOCK_IDS].filter((id) => Number.isFinite(id) && id >= 0 && id <= 255));
    let nextBlockId = 1;
    for (const def of RAW_BLOCKS) {
        if (def.isItem) continue;
        const legacyId = Number(def.id);
        if (!Number.isFinite(legacyId) || legacyId <= 255) continue;
        while (occupied.has(nextBlockId)) nextBlockId++;
        LEGACY_TO_CANONICAL_BLOCK_ID.set(legacyId, nextBlockId);
        CANONICAL_TO_LEGACY_BLOCK_ID.set(nextBlockId, legacyId);
        occupied.add(nextBlockId);
        nextBlockId++;
    }
}

{
    let nextItemId = 1000;
    for (const def of RAW_BLOCKS) {
        if (!def.isItem) continue;
        const legacyId = Number(def.id);
        if (!Number.isFinite(legacyId)) continue;
        // Fully de-collision runtime scheme:
        // reserve byte-range IDs (0..255) for blocks only.
        if (legacyId > 255) continue;
        while (RAW_ALL_IDS.has(nextItemId) || LEGACY_TO_CANONICAL_ITEM_ID.has(nextItemId)) {
            nextItemId++;
        }
        LEGACY_TO_CANONICAL_ITEM_ID.set(legacyId, nextItemId);
        CANONICAL_TO_LEGACY_ITEM_ID.set(nextItemId, legacyId);
        nextItemId++;
    }
}

export const BLOCKS = RAW_BLOCKS.map((def) => {
    if (!def.isItem) {
        const canonicalBlockId = LEGACY_TO_CANONICAL_BLOCK_ID.get(Number(def.id));
        return canonicalBlockId !== undefined ? { ...def, id: canonicalBlockId } : def;
    }
    const canonicalItemId = LEGACY_TO_CANONICAL_ITEM_ID.get(Number(def.id));
    return canonicalItemId !== undefined ? { ...def, id: canonicalItemId } : def;
});

const ITEM_DEFS = BLOCKS.filter((b) => !!b.isItem);
const PLACEABLE_BLOCK_DEFS = BLOCKS.filter((b) => !b.isItem);
const ITEM_DEFS_BY_ID = new Map(ITEM_DEFS.map((b) => [b.id, b]));
const PLACEABLE_BLOCK_DEFS_BY_ID = new Map(PLACEABLE_BLOCK_DEFS.map((b) => [b.id, b]));
const AMBIGUOUS_INVENTORY_IDS = new Set(
    [...ITEM_DEFS_BY_ID.keys()].filter((id) => PLACEABLE_BLOCK_DEFS_BY_ID.has(id))
);
const INVENTORY_DEFS_BY_NAME = new Map();
const BETA_ALIAS_SUFFIX_RE = /\s+\(beta id\)$/i;

function addInventoryNameAlias(name, def) {
    const key = String(name || '').toLowerCase().trim();
    if (!key) return;
    if (!INVENTORY_DEFS_BY_NAME.has(key)) {
        INVENTORY_DEFS_BY_NAME.set(key, def);
    }
}

for (const def of ITEM_DEFS) {
    addInventoryNameAlias(def.name, def);
    if (BETA_ALIAS_SUFFIX_RE.test(def.name)) {
        addInventoryNameAlias(def.name.replace(BETA_ALIAS_SUFFIX_RE, ''), def);
    }
}
for (const def of PLACEABLE_BLOCK_DEFS) {
    addInventoryNameAlias(def.name, def);
    if (BETA_ALIAS_SUFFIX_RE.test(def.name)) {
        addInventoryNameAlias(def.name.replace(BETA_ALIAS_SUFFIX_RE, ''), def);
    }
}

function resolveRuntimeBlockId(id) {
    const normalized = fromBetaCompatibleBlockId(Number(id));
    return Number.isFinite(normalized) ? normalized : 0;
}

export function getRuntimeBlockDef(id) {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return null;
    return PLACEABLE_BLOCK_DEFS_BY_ID.get(runtimeId) || null;
}

export function getItemDef(id) {
    const runtimeId = normalizeLegacyRuntimeItemId(Number(id));
    if (!Number.isFinite(runtimeId)) return null;
    return ITEM_DEFS_BY_ID.get(runtimeId) || null;
}

export function getPlaceableBlockDef(id) {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return null;
    return PLACEABLE_BLOCK_DEFS_BY_ID.get(runtimeId) || null;
}

export function getInventoryDef(id, kind = null) {
    if (kind === 'item') return getItemDef(id);
    if (kind === 'block') return getPlaceableBlockDef(id);
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return null;
    if (AMBIGUOUS_INVENTORY_IDS.has(runtimeId)) {
        // Runtime de-collision policy: ambiguous byte-range IDs should default to block.
        // Item runtime IDs are expected to be canonicalized to non-colliding item space.
        if (runtimeId >= 0 && runtimeId <= 255) {
            return getPlaceableBlockDef(runtimeId) || getItemDef(runtimeId);
        }
        return getItemDef(runtimeId) || getPlaceableBlockDef(runtimeId);
    }
    return getPlaceableBlockDef(runtimeId) || getItemDef(runtimeId);
}

export function getAllItemDefs() {
    return ITEM_DEFS.slice();
}

export function getAllPlaceableBlockDefs() {
    return PLACEABLE_BLOCK_DEFS.slice();
}

export function hasInventoryIdCollision(id) {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return false;
    return AMBIGUOUS_INVENTORY_IDS.has(runtimeId);
}

export function getInventoryIdCollisions() {
    return [...AMBIGUOUS_INVENTORY_IDS].sort((a, b) => a - b);
}

export function getInventoryDefByName(name) {
    if (!name) return null;
    return INVENTORY_DEFS_BY_NAME.get(String(name).toLowerCase()) || null;
}

let INVENTORY_DEFS_BY_LOOSE_NAME = null;

function toInventoryLooseKey(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\(beta id\)/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9]+/g, '');
}

function getInventoryDefsByLooseNameMap() {
    if (INVENTORY_DEFS_BY_LOOSE_NAME) return INVENTORY_DEFS_BY_LOOSE_NAME;
    INVENTORY_DEFS_BY_LOOSE_NAME = new Map();
    for (const [name, def] of INVENTORY_DEFS_BY_NAME.entries()) {
        const key = toInventoryLooseKey(name);
        if (!key || INVENTORY_DEFS_BY_LOOSE_NAME.has(key)) continue;
        INVENTORY_DEFS_BY_LOOSE_NAME.set(key, def);
    }
    return INVENTORY_DEFS_BY_LOOSE_NAME;
}

export function resolveInventoryDefByLooseName(name) {
    if (!name) return null;
    const raw = String(name).trim();
    if (!raw) return null;
    const direct = getInventoryDefByName(raw);
    if (direct) return direct;
    const spaced = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const spacedDirect = getInventoryDefByName(spaced);
    if (spacedDirect) return spacedDirect;
    const key = toInventoryLooseKey(spaced);
    if (!key) return null;
    return getInventoryDefsByLooseNameMap().get(key) || null;
}

export function getBlockDef(id) {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return null;
    return getRuntimeBlockDef(runtimeId);
}

export function isBlockOpaque(id) {
    if (!id) return false;
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return false;
    const b = getRuntimeBlockDef(runtimeId);
    if (runtimeId === 78) return false; // Snow layer is thin and should not behave as a full opaque cube for lighting/AO.
    if (b && (b.transparent || b.isItem || b.type === 'torch' || b.type === 'chest' || b.type === 'cross' || b.type === 'fire' || b.type === 'ladder' || b.type === 'signPost' || b.type === 'wallSign' || b.type === 'door')) return false;
    return true;
}

/** Returns true if this id is a valid terrain/placeable block (not an item). Used to treat bad chunk data as air. */
export function isTerrainBlockId(id) {
    if (id === 0) return true;
    const b = getBlockDef(id);
    return b && !b.isItem;
}

export function isObsidianId(id) {
    return id === 49 || id === 252;
}

export function isGlassId(id) {
    return id === 19 || id === 20;
}

export function isCraftingTableId(id) {
    return id === 16 || id === 58;
}

export function isFurnaceId(id) {
    return id === 17 || id === 18 || id === 61 || id === 62;
}

export function isDispenserId(id) {
    return id === 23;
}

export function isTntId(id) {
    return id === 46 || id === 91;
}

export function isReedId(id) {
    // Runtime reeds block id is 68.
    // Beta id 83 is mapped to 68 on import; 83 is used for shears item in this runtime.
    return id === 68;
}

export function isPumpkinId(id) {
    return id === 69 || id === 86;
}

export function isBrownMushroomId(id) {
    return id === 39 || id === 66;
}

export function isRedMushroomId(id) {
    return id === 40 || id === 67;
}

export function isMushroomId(id) {
    return isBrownMushroomId(id) || isRedMushroomId(id);
}

export function isYellowFlowerId(id) {
    return id === 37;
}

export function isTallGrassId(id) {
    return id === 31;
}

export function isDeadBushId(id) {
    return id === 32;
}

export function isRoseId(id) {
    return id === 38;
}

export function isRedstoneWireId(id) {
    return id === 55;
}

export function isFlowerId(id) {
    return isYellowFlowerId(id) || isRoseId(id);
}

export function isWoolId(id) {
    return id === 35 || id === 84;
}

export function isFenceId(id) {
    return id === 85;
}

export function isFarmlandId(id) {
    return id === 60;
}

export function isCropId(id) {
    return id === 59;
}

export function isNoteBlockId(id) {
    return id === 25;
}

export function isPistonId(id) {
    return id === 29 || id === 33 || id === 34;
}


export function isCactusId(id) {
    return id === 56 || id === 81;
}

export function isNetherrackId(id) {
    return id === 80 || id === 87;
}

export function isChestId(id) {
    return id === 53 || id === 54 || id === 95;
}

export function isTorchId(id) {
    return id === 50 || id === 75 || id === 76;
}

export function isButtonId(id) {
    return id === 77;
}

export function isPressurePlateId(id) {
    const n = normalizeLegacyRuntimeBlockId(id);
    return n === 72 || n === normalizeLegacyRuntimeBlockId(262);
}

export function isRailId(id) {
    const n = normalizeLegacyRuntimeBlockId(id);
    return n === 27 || n === 28 || n === normalizeLegacyRuntimeBlockId(263);
}

export function isTrapdoorId(id) {
    return id === 96;
}

export function isLadderId(id) {
    return normalizeLegacyRuntimeBlockId(id) === normalizeLegacyRuntimeBlockId(253);
}

export function isSignPostId(id) {
    return normalizeLegacyRuntimeBlockId(id) === normalizeLegacyRuntimeBlockId(254);
}

export function isWallSignId(id) {
    return normalizeLegacyRuntimeBlockId(id) === normalizeLegacyRuntimeBlockId(255);
}

export function isSignId(id) {
    return isSignPostId(id) || isWallSignId(id);
}

export function isDoorId(id) {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return false;
    const woodDoorRuntime = LEGACY_TO_CANONICAL_BLOCK_ID.get(256) ?? 256;
    const ironDoorRuntime = LEGACY_TO_CANONICAL_BLOCK_ID.get(257) ?? 257;
    if (runtimeId === woodDoorRuntime || runtimeId === ironDoorRuntime) return true;
    if (runtimeId === 256 || runtimeId === 257) return true; // legacy aliases
    const n = normalizeLegacyRuntimeBlockId(runtimeId);
    return n === woodDoorRuntime || n === ironDoorRuntime;
}

export function isPaintingId(id) {
    const n = normalizeLegacyRuntimeBlockId(id);
    return n === 112 || n === normalizeLegacyRuntimeBlockId(258);
}

export function isBoatBlockId(id) {
    return normalizeLegacyRuntimeBlockId(id) === normalizeLegacyRuntimeBlockId(259);
}

export function isMinecartBlockId(id) {
    return normalizeLegacyRuntimeBlockId(id) === normalizeLegacyRuntimeBlockId(260);
}

export function isVehicleBlockId(id) {
    return isBoatBlockId(id) || isMinecartBlockId(id);
}

export function isLeverId(id) {
    const n = normalizeLegacyRuntimeBlockId(id);
    return n === normalizeLegacyRuntimeBlockId(261) || n === 111;
}

export function isBedBlockId(id) {
    return id === 26;
}

export function isCakeBlockId(id) {
    return id === 92;
}

export function isSlabId(id) {
    return id === 44;
}

export function isRepeaterId(id) {
    return id === 93 || id === 94;
}

export function getCanonicalStatefulDrop(id, kind = 'block') {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return { id: 0, kind };
    if (runtimeId === 111 || runtimeId === 261) {
        return { id: 111, kind: 'block', displayName: 'Lever' };
    }
    if (runtimeId === 75 || runtimeId === 76) {
        return { id: 76, kind: 'block', displayName: 'Redstone Torch' };
    }
    if (runtimeId === 93 || runtimeId === 94) {
        return { id: normalizeLegacyRuntimeItemId(100), kind: 'item', displayName: 'Redstone Repeater' };
    }
    if (runtimeId === 27) {
        return { id: 27, kind: 'block', displayName: 'Powered Rail' };
    }
    if (runtimeId === 28) {
        return { id: 28, kind: 'block', displayName: 'Detector Rail' };
    }
    return { id: runtimeId, kind };
}

const LEGACY_RUNTIME_BLOCK_ALIASES = new Map([
    ...LEGACY_TO_CANONICAL_BLOCK_ID.entries(),
]);

export function normalizeLegacyRuntimeBlockId(id) {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return 0;
    return LEGACY_RUNTIME_BLOCK_ALIASES.get(runtimeId) ?? runtimeId;
}

const LEGACY_RUNTIME_ITEM_ALIASES = new Map([
    ...LEGACY_TO_CANONICAL_ITEM_ID.entries(),
    // legacy iron shovel alias -> canonical iron shovel item id
    [237, LEGACY_TO_CANONICAL_ITEM_ID.get(0) ?? 0],
]);

export function normalizeLegacyRuntimeItemId(id) {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return 0;
    return LEGACY_RUNTIME_ITEM_ALIASES.get(runtimeId) ?? runtimeId;
}

export function toLegacyItemId(id) {
    const runtimeId = Number(id);
    if (!Number.isFinite(runtimeId)) return 0;
    return CANONICAL_TO_LEGACY_ITEM_ID.get(runtimeId) ?? runtimeId;
}

const RUNTIME_TO_BETA_BLOCK_ALIASES = new Map([
    [0, 0],    // air
    [1, 2],    // grass
    [2, 3],    // dirt
    [3, 1],    // stone
    [4, 17],   // log
    [5, 18],   // leaves
    [103, 6],  // sapling
    [6, 8],    // flowing water
    [7, 21],   // legacy Link block -> Beta lapis ore
    [8, 7],    // bedrock
    [9, 12],   // sand
    [10, 16],  // coal ore
    [11, 14],  // gold ore
    [12, 15],  // iron ore
    [13, 56],  // diamond ore
    [15, 4],   // cobblestone
    [21, 21],  // Link ore substitute for Beta lapis ore
    [53, 54],  // legacy chest -> canonical chest
    [51, 11],  // still lava
    [57, 13],  // gravel
    [111, 69], // runtime lever -> Beta lever
    [112, 258], // runtime painting -> legacy painting block id (save compatibility)
    [64, 64],  // snow grass
    [65, 24],  // sandstone
    [84, 35],  // white wool -> canonical Beta wool (metadata 0)
    [66, 39],  // brown mushroom
    [67, 40],  // red mushroom
    [68, 83],  // reeds
    [69, 86],  // pumpkin
    [70, 9],   // still water
    [71, 10],  // flowing lava
    [91, 46],  // legacy TNT -> canonical TNT
    [252, 49], // legacy obsidian -> canonical obsidian
]);

const BETA_TO_RUNTIME_BLOCK_ALIASES = new Map([
    [0, 0],
    [1, 3],
    [2, 1],
    [3, 2],
    [4, 15],
    [7, 8],
    [8, 6],
    [6, 103],
    [9, 70],
    [10, 71],
    [11, 51],
    [12, 9],
    [13, 57],
    [14, 11],
    [15, 12],
    [16, 10],
    [17, 4],
    [18, 5],
    [21, 21], // Beta lapis ore -> MindBlock Link ore
    [24, 65],
    [35, 84],
    [39, 66],
    [40, 67],
    [56, 13],
    [83, 68],
    [86, 69],
    [258, 112],
]);

export function toBetaCompatibleBlockId(id) {
    return RUNTIME_TO_BETA_BLOCK_ALIASES.get(id) ?? id;
}

export function fromBetaCompatibleBlockId(id) {
    return BETA_TO_RUNTIME_BLOCK_ALIASES.get(id) ?? id;
}



