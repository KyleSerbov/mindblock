// js/ui.js
import { getItemDef, getPlaceableBlockDef, getInventoryDef, resolveInventoryDefByLooseName, fromBetaCompatibleBlockId, normalizeLegacyRuntimeBlockId, getAllItemDefs, getAllPlaceableBlockDefs, getCanonicalStatefulDrop } from './blocks.js';
import { inventory, WOOL_WHITE_ITEM_ID, DYE_POWDER_ITEM_ID, BED_ITEM_ID, getItemStackKind, ITEM_STACK_KIND_BLOCK, ITEM_STACK_KIND_ITEM } from './inventory.js';
import { getItemAtlasTileById, getTerrainAtlasTileById } from './world.js';

const TEXTURE_PATH = 'assets/textures/';
const TERRAIN_ATLAS_PATH = `${TEXTURE_PATH}terrain_atlas_beta173.png`;
const ITEMS_ATLAS_PATH = `${TEXTURE_PATH}items_atlas_beta173.png`;
const ATLAS_GRID_SIZE = 16;
let uiInterval = null;
let selectedSlotIndex = 0; 
const WOOL_COLOR_METADATA = new Map([
    ['white', 0],
    ['orange', 1],
    ['magenta', 2],
    ['light blue', 3],
    ['yellow', 4],
    ['lime', 5],
    ['pink', 6],
    ['gray', 7],
    ['grey', 7],
    ['light gray', 8],
    ['light grey', 8],
    ['silver', 8],
    ['cyan', 9],
    ['purple', 10],
    ['blue', 11],
    ['brown', 12],
    ['green', 13],
    ['red', 14],
    ['black', 15]
]);
const DYE_COLOR_METADATA = new Map([
    ['ink sac', 0],
    ['ink', 0],
    ['black dye', 0],
    ['rose red', 1],
    ['red dye', 1],
    ['cactus green', 2],
    ['green dye', 2],
    ['cocoa beans', 3],
    ['brown dye', 3],
    ['lapis lazuli', 4],
    ['blue dye', 4],
    ['purple dye', 5],
    ['cyan dye', 6],
    ['light gray dye', 7],
    ['light grey dye', 7],
    ['gray dye', 8],
    ['grey dye', 8],
    ['pink dye', 9],
    ['lime dye', 10],
    ['dandelion yellow', 11],
    ['yellow dye', 11],
    ['light blue dye', 12],
    ['magenta dye', 13],
    ['orange dye', 14],
    ['bone meal', 15],
    ['bonemeal', 15],
    ['white dye', 15]
]);
const SAPLING_TYPE_METADATA = new Map([
    ['oak', 0],
    ['spruce', 1],
    ['pine', 1],
    ['birch', 2]
]);
const WOOL_DISPLAY_BY_META = new Map([
    [0, 'White Wool'],
    [1, 'Orange Wool'],
    [2, 'Magenta Wool'],
    [3, 'Light Blue Wool'],
    [4, 'Yellow Wool'],
    [5, 'Lime Wool'],
    [6, 'Pink Wool'],
    [7, 'Gray Wool'],
    [8, 'Light Gray Wool'],
    [9, 'Cyan Wool'],
    [10, 'Purple Wool'],
    [11, 'Blue Wool'],
    [12, 'Brown Wool'],
    [13, 'Green Wool'],
    [14, 'Red Wool'],
    [15, 'Black Wool']
]);
const DYE_DISPLAY_BY_META = new Map([
    [0, 'Ink Sac'],
    [1, 'Rose Red'],
    [2, 'Cactus Green'],
    [3, 'Cocoa Beans'],
    [4, 'Lapis Lazuli'],
    [5, 'Purple Dye'],
    [6, 'Cyan Dye'],
    [7, 'Light Gray Dye'],
    [8, 'Gray Dye'],
    [9, 'Pink Dye'],
    [10, 'Lime Dye'],
    [11, 'Dandelion Yellow'],
    [12, 'Light Blue Dye'],
    [13, 'Magenta Dye'],
    [14, 'Orange Dye'],
    [15, 'Bone Meal']
]);
const ITEM_NAME_ALIASES = new Map([
    ['bowl', 'bowl (beta id)'],
    ['wooden bowl', 'bowl (beta id)'],
    ['mushroom stew', 'mushroom stew (beta id)'],
    ['mushroom soup', 'mushroom stew (beta id)'],
    ['soup', 'mushroom stew (beta id)'],
    ['mushroomstew', 'mushroom stew (beta id)'],
    ['bowlsoup', 'mushroom stew (beta id)'],
    ['stew', 'mushroom stew (beta id)'],
    ['bread', 'bread (beta id)'],
    ['cookie', 'cookie'],
    ['cookies', 'cookie'],
    ['cake', 'cake'],
    ['cake item', 'cake'],
    ['porkchop', 'raw porkchop'],
    ['raw pork', 'raw porkchop'],
    ['cooked pork', 'cooked porkchop'],
    ['porkchopraw', 'raw porkchop'],
    ['porkchopcooked', 'cooked porkchop'],
    ['porkchop raw', 'raw porkchop'],
    ['porkchop cooked', 'cooked porkchop'],
    ['chicken', 'raw chicken'],
    ['chicken raw', 'raw chicken'],
    ['chicken cooked', 'cooked chicken'],
    ['cooked chicken meat', 'cooked chicken'],
    ['chickenraw', 'raw chicken'],
    ['chickencooked', 'cooked chicken'],
    ['fish', 'raw fish'],
    ['cooked fish meat', 'cooked fish'],
    ['raw fish meat', 'raw fish'],
    ['rawfish', 'raw fish'],
    ['cookedfish', 'cooked fish'],
    ['fishraw', 'raw fish'],
    ['fishcooked', 'cooked fish'],
    ['fish raw', 'raw fish'],
    ['fish cooked', 'cooked fish'],
    ['seeds', 'seeds (beta id)'],
    ['wheat', 'wheat (beta id)'],
    ['wheat seeds', 'seeds (beta id)'],
    ['pumpkin seeds', 'seeds (beta id)'],
    ['sugar', 'sugar'],
    ['sugarcane sugar', 'sugar'],
    ['reed sugar', 'sugar'],
    ['egg', 'egg (beta id)'],
    ['eggs', 'egg (beta id)'],
    ['snowball', 'snowball (beta id)'],
    ['snowballs', 'snowball (beta id)'],
    ['arrow', 'arrow (beta id)'],
    ['arrows', 'arrow (beta id)'],
    ['bucket', 'empty bucket (beta id)'],
    ['emptybucket', 'empty bucket (beta id)'],
    ['bucketempty', 'empty bucket (beta id)'],
    ['bucketwater', 'water bucket (beta id)'],
    ['bucketlava', 'lava bucket (beta id)'],
    ['bucket water', 'water bucket (beta id)'],
    ['bucket lava', 'lava bucket (beta id)'],
    ['waterbucket', 'water bucket (beta id)'],
    ['lavabucket', 'lava bucket (beta id)'],
    ['milkbucket', 'milk bucket (beta id)'],
    ['bucketmilk', 'milk bucket (beta id)'],
    ['bucket milk', 'milk bucket (beta id)'],
    ['milk', 'milk bucket (beta id)'],
    ['minecart', 'item:minecart (beta id)'],
    ['cart', 'item:minecart (beta id)'],
    ['boat', 'item:boat (beta id)'],
    ['fishing rod', 'fishing rod (beta id)'],
    ['fishingrod', 'fishing rod (beta id)'],
    ['rod', 'fishing rod (beta id)'],
    ['bow', 'bow (beta id)'],
    ['shears', 'shears'],
    ['flint and steel', 'flint and steel (beta id)'],
    ['flintsteel', 'flint and steel (beta id)'],
    ['glowstone dust', 'glowstone dust (beta id)'],
    ['glowstonedust', 'glowstone dust (beta id)'],
    ['lightstone dust', 'glowstone dust (beta id)'],
    ['lightstonedust', 'glowstone dust (beta id)'],
    ['lightstone', 'glowstone'],
    ['charcoal', 'charcoal'],
    ['sulphur', 'gunpowder'],
    ['sulfur', 'gunpowder'],
    ['clay ball', 'clay ball (beta id)'],
    ['clayball', 'clay ball (beta id)'],
    ['clay brick', 'brick (beta id)'],
    ['brick item', 'brick (beta id)'],
    ['brick', 'item:brick'],
    ['bricks block', 'brick block'],
    ['brick block', 'brick block'],
    ['leather cap', 'leather helmet'],
    ['leather tunic', 'leather chestplate'],
    ['leather pants', 'leather leggings'],
    ['leather leggings', 'leather leggings'],
    ['leather boots', 'leather boots'],
    ['gold helmet', 'gold helmet'],
    ['gold chestplate', 'gold chestplate'],
    ['gold leggings', 'gold leggings'],
    ['gold boots', 'gold boots'],
    ['gold cap', 'gold helmet'],
    ['gold pants', 'gold leggings'],
    ['slime ball', 'slimeball (beta id)'],
    ['slimeball', 'slimeball (beta id)'],
    ['slime', 'slimeball (beta id)'],
    ['ghast tear', 'ghast tear (beta id)'],
    ['ghasttear', 'ghast tear (beta id)'],
    ['piston', 'block:piston'],
    ['sticky piston', 'block:sticky piston'],
    ['sticky_piston', 'block:sticky piston'],
    ['piston block', 'block:piston'],
    ['sticky piston block', 'block:sticky piston'],
    ['redstone dust', 'item:redstone dust (beta id)'],
    ['redstonedust', 'item:redstone dust (beta id)'],
    ['redstone dust item', 'item:redstone dust (beta id)'],
    ['redstone dust block', 'block:redstone wire'],
    ['redstone wire', 'block:redstone wire'],
    ['redstonewire', 'block:redstone wire'],
    ['redstone torch', 'redstone torch on'],
    ['redstone torch on', 'block:redstone torch on'],
    ['redstone torch off', 'block:redstone torch off'],
    ['redstone repeater', 'redstone repeater'],
    ['redstone repeater item', 'item:redstone repeater'],
    ['redstone repeater block', 'block:redstone repeater off'],
    ['repeater', 'redstone repeater'],
    ['watch', 'clock (beta id)'],
    ['apple', 'red apple (beta id)'],
    ['golden apple', 'golden apple (beta id)'],
    ['goldenapple', 'golden apple (beta id)'],
    ['compass', 'compass'],
    ['map', 'map'],
    ['empty map', 'map'],
    ['filled map', 'map'],
    ['emptymap', 'map'],
    ['filledmap', 'map'],
    ['record 13', 'music disc 13'],
    ['record13', 'music disc 13'],
    ['record', 'music disc 13'],
    ['disc 13', 'music disc 13'],
    ['disc13', 'music disc 13'],
    ['musicdisc13', 'music disc 13'],
    ['music disc 13', 'music disc 13'],
    ['record cat', 'music disc cat'],
    ['recordcat', 'music disc cat'],
    ['disc cat', 'music disc cat'],
    ['disccat', 'music disc cat'],
    ['musicdisccat', 'music disc cat'],
    ['music disc cat', 'music disc cat'],
    ['snow block', 'snow block'],
    ['full snow', 'snow block'],
    ['gold block', 'block of gold'],
    ['block of gold', 'block of gold'],
    ['goldblock', 'block of gold'],
    ['iron block', 'block of iron'],
    ['block of iron', 'block of iron'],
    ['ironblock', 'block of iron'],
    ['diamond block', 'block of diamond'],
    ['diamondblock', 'block of diamond'],
    ['mob spawner', 'mob spawner'],
    ['monster spawner', 'mob spawner'],
    ['spawner', 'mob spawner'],
    ['mobspawner', 'mob spawner'],
    ['monsterspawner', 'mob spawner'],
    ['locked chest', 'locked chest'],
    ['april fools chest', 'locked chest'],
    ['lockedchest', 'locked chest'],
    ['aprilfoolschest', 'locked chest'],
    ['jukebox block', 'jukebox'],
    ['dispenser block', 'dispenser'],
    ['reed', 'reed/sugar cane (beta id)'],
    ['reeds', 'block:reeds'],
    ['sugar cane', 'reed/sugar cane (beta id)'],
    ['sugarcane', 'reed/sugar cane (beta id)'],
    ['bed', 'item:bed']
]);

const GIVE_ITEM_NAME_MAP = new Map();
const GIVE_BLOCK_NAME_MAP = new Map();

function normalizeGiveName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\(beta id\)/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function addGiveName(map, name, def) {
    const key = normalizeGiveName(name);
    if (!key) return;
    if (!map.has(key)) map.set(key, def);
}

function initGiveNameMaps() {
    if (GIVE_ITEM_NAME_MAP.size > 0 || GIVE_BLOCK_NAME_MAP.size > 0) return;
    for (const def of getAllItemDefs()) {
        addGiveName(GIVE_ITEM_NAME_MAP, def.name, def);
    }
    for (const def of getAllPlaceableBlockDefs()) {
        addGiveName(GIVE_BLOCK_NAME_MAP, def.name, def);
    }
}

function resolveGiveDefByName(searchName, kindFilter = null) {
    initGiveNameMaps();
    const key = normalizeGiveName(searchName);
    if (!key) return null;
    if (kindFilter === ITEM_STACK_KIND_ITEM) return GIVE_ITEM_NAME_MAP.get(key) || null;
    if (kindFilter === ITEM_STACK_KIND_BLOCK) return GIVE_BLOCK_NAME_MAP.get(key) || null;
    return GIVE_BLOCK_NAME_MAP.get(key) || GIVE_ITEM_NAME_MAP.get(key) || null;
}

function getWoolTerrainTileForMetadata(meta) {
    const m = Number.isFinite(Number(meta)) ? (Number(meta) & 15) : 0;
    if (m === 0) return 64;
    const inverted = (~m) & 15;
    return 113 + ((inverted & 8) >> 3) + ((inverted & 7) * 16);
}

function parseWoolGiveMetadata(searchName) {
    if (searchName === 'wool') return { metadata: 0, label: 'White Wool' };
    let colorName = null;
    if (searchName.startsWith('wool ')) colorName = searchName.slice(5).trim();
    else if (searchName.endsWith(' wool')) colorName = searchName.slice(0, -5).trim();
    if (!colorName) return null;
    const metadata = WOOL_COLOR_METADATA.get(colorName);
    if (metadata === undefined) return null;
    const label = colorName.replace(/\b\w/g, (m) => m.toUpperCase()) + ' Wool';
    return { metadata, label };
}

function parseDyeGiveMetadata(searchName) {
    if (searchName === 'dye' || searchName === 'dye powder') return { metadata: 0, label: 'Ink Sac' };
    let colorName = null;
    if (searchName.startsWith('dye ')) colorName = searchName.slice(4).trim();
    else if (searchName.endsWith(' dye')) colorName = searchName.slice(0, -4).trim() + ' dye';
    else colorName = searchName;
    if (!colorName) return null;
    const metadata = DYE_COLOR_METADATA.get(colorName);
    if (metadata === undefined) return null;
    const label = colorName.replace(/\b\w/g, (m) => m.toUpperCase());
    return { metadata, label };
}

function parseSaplingGiveMetadata(searchName) {
    if (searchName === 'sapling') return { metadata: 0, label: 'Oak Sapling' };
    let typeName = null;
    if (searchName.startsWith('sapling ')) typeName = searchName.slice(8).trim();
    else if (searchName.endsWith(' sapling')) typeName = searchName.slice(0, -8).trim();
    if (!typeName) return null;
    const metadata = SAPLING_TYPE_METADATA.get(typeName);
    if (metadata === undefined) return null;
    const label = typeName.replace(/\b\w/g, (m) => m.toUpperCase()) + ' Sapling';
    return { metadata, label };
}

// Chat Logic
export function addMessage(text) {
    const history = document.getElementById('chat-history');
    if (!history) return;

    // Detect URLs and wrap in anchor tags
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const formattedText = text.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');

    const msg = document.createElement('div');
    msg.className = 'chat-message';
    msg.innerHTML = formattedText;
    history.appendChild(msg);
    
    // Auto-scroll
    history.scrollTop = history.scrollHeight;

    // Fade out timer
    setTimeout(() => {
        msg.classList.add('msg-expired');
    }, 60000); // 60s
}

export function toggleChat(isOpen) {
    const container = document.getElementById('chat-container');
    const input = document.getElementById('chat-input');
    
    if (isOpen) {
        container.classList.add('chat-open');
        input.focus();
    } else {
        container.classList.remove('chat-open');
        input.blur();
    }
}

export function handleCommand(text) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    
    if (cmd === '/give') {
        if (parts.length < 2) {
            addMessage("Usage: /give <block name> [amount]");
            return;
        }
        
        let amount = 1;
        let nameParts = parts.slice(1);
        
        // Check if last part is a number
        const lastArg = parseInt(nameParts[nameParts.length - 1]);
        if (!isNaN(lastArg)) {
            amount = lastArg;
            nameParts.pop();
        }
        
        let searchName = nameParts.join(' ').toLowerCase();
        let kindFilter = null;
        if (searchName.startsWith('item:')) {
            kindFilter = ITEM_STACK_KIND_ITEM;
            searchName = searchName.slice(5).trim();
        } else if (searchName.startsWith('block:')) {
            kindFilter = ITEM_STACK_KIND_BLOCK;
            searchName = searchName.slice(6).trim();
        }
        const numericSpec = String(searchName).trim().match(/^(\d+)(?::(\d+))?$/);
        if (numericSpec) {
            const runtimeId = Number(numericSpec[1]);
            const metadata = Number.isFinite(Number(numericSpec[2])) ? (Number(numericSpec[2]) & 15) : 0;
            const defById = kindFilter === ITEM_STACK_KIND_ITEM
                ? getItemDef(runtimeId)
                : (kindFilter === ITEM_STACK_KIND_BLOCK
                    ? getPlaceableBlockDef(runtimeId)
                    : (getPlaceableBlockDef(runtimeId) || getItemDef(runtimeId)));
            if (!defById) {
                addMessage(`Error: Item/block id '${runtimeId}' not found`);
                return;
            }
            const kind = defById.isItem ? ITEM_STACK_KIND_ITEM : ITEM_STACK_KIND_BLOCK;
            inventory.addItem(defById.id, amount, null, metadata, kind);
            refreshHotbar();
            addMessage(`Gave ${amount} ${defById.name}${numericSpec[2] ? `:${metadata}` : ''}`);
            return;
        }
        const normalizedSearchName = searchName.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        searchName = ITEM_NAME_ALIASES.get(searchName) || ITEM_NAME_ALIASES.get(normalizedSearchName) || normalizedSearchName;
        // Allow aliases to expand into explicit kind-qualified names (item:/block:).
        if (searchName.startsWith('item:')) {
            kindFilter = ITEM_STACK_KIND_ITEM;
            searchName = searchName.slice(5).trim();
        } else if (searchName.startsWith('block:')) {
            kindFilter = ITEM_STACK_KIND_BLOCK;
            searchName = searchName.slice(6).trim();
        }
        const block = resolveGiveDefByName(searchName, kindFilter) || resolveInventoryDefByLooseName(searchName);
        const filteredBlock = (block && kindFilter === ITEM_STACK_KIND_ITEM && !block.isItem)
            ? null
            : (block && kindFilter === ITEM_STACK_KIND_BLOCK && block.isItem)
                ? null
                : block;
        
        if (filteredBlock) {
            const kind = filteredBlock.isItem ? 'item' : 'block';
            inventory.addItem(filteredBlock.id, amount, null, 0, kind);
            refreshHotbar();
            addMessage(`Gave ${amount} ${filteredBlock.name}`);
        } else {
            if (searchName === 'charcoal') {
                inventory.addItem(20, amount, null, 1, ITEM_STACK_KIND_ITEM);
                refreshHotbar();
                addMessage(`Gave ${amount} Charcoal`);
                return;
            }
            const saplingSpec = parseSaplingGiveMetadata(searchName);
            if (saplingSpec) {
                inventory.addItem(103, amount, null, saplingSpec.metadata, ITEM_STACK_KIND_BLOCK);
                refreshHotbar();
                addMessage(`Gave ${amount} ${saplingSpec.label}`);
                return;
            }
            const woolSpec = parseWoolGiveMetadata(searchName);
            if (woolSpec) {
                inventory.addItem(WOOL_WHITE_ITEM_ID, amount, null, woolSpec.metadata, ITEM_STACK_KIND_BLOCK);
                refreshHotbar();
                addMessage(`Gave ${amount} ${woolSpec.label}`);
            } else {
                const dyeSpec = parseDyeGiveMetadata(searchName);
                if (dyeSpec) {
                    inventory.addItem(DYE_POWDER_ITEM_ID, amount, null, dyeSpec.metadata, ITEM_STACK_KIND_ITEM);
                    refreshHotbar();
                    addMessage(`Gave ${amount} ${dyeSpec.label}`);
                } else {
                    addMessage(`Error: Block '${searchName}' not found`);
                }
            }
        }
    } else if (cmd === '/day') {
        if (typeof window.setDayTime === 'function') {
            window.setDayTime();
            addMessage('Set time to day (morning).');
        } else {
            addMessage('Time command unavailable.');
        }
    } else if (cmd === '/night') {
        if (typeof window.setNightTime === 'function') {
            window.setNightTime();
            addMessage('Set time to night.');
        } else {
            addMessage('Time command unavailable.');
        }
    } else if (cmd === '/time') {
        if (parts.length >= 2) {
            const requested = Math.floor(Number(parts[1]));
            if (!Number.isFinite(requested)) {
                addMessage('Usage: /time [0-23999]');
                return;
            }
            if (typeof window.setWorldTime === 'function') {
                window.setWorldTime(requested);
                addMessage(`Set world time to ${requested}.`);
            } else {
                addMessage('Time command unavailable.');
            }
        } else if (typeof window.getWorldTime === 'function') {
            const t = window.getWorldTime();
            addMessage(`World time: ${t}`);
        } else {
            addMessage('Time command unavailable.');
        }
    } else if (cmd === '/spawn') {
        // /spawn -> teleport to world spawn
        // /spawn <pig|chicken|sheep|cow|squid|wolf|creeper|zombie|giant|spider|skeleton|slime|ghast|pigman> -> spawn mob at player
        if (parts.length < 2) {
            if (typeof window.teleportToSpawn === 'function') {
                try {
                    const res = window.teleportToSpawn();
                    if (res && typeof res.msg === 'string') addMessage(res.msg);
                    else addMessage('Spawn command failed.');
                } catch (err) {
                    console.error('[chat:/spawn teleport] failed', err);
                    addMessage('Spawn command failed due to runtime error.');
                }
            } else {
                addMessage('Spawn command unavailable.');
            }
            return;
        }
        const type = parts[1].toLowerCase();
        if (typeof window.spawnMob === 'function') {
            try {
                const res = window.spawnMob(type);
                if (res && typeof res.msg === 'string') addMessage(res.msg);
                else addMessage('Spawn mob command failed.');
            } catch (err) {
                console.error('[chat:/spawn mob] failed', err);
                addMessage('Spawn mob command failed due to runtime error.');
            }
        } else {
            addMessage('Spawn mob command unavailable.');
        }
    } else if (cmd === '/kill') {
        if (parts.length >= 2 && parts[1].toLowerCase() === 'mobs') {
            if (typeof window.killMobs === 'function') {
                try {
                    const res = window.killMobs();
                    if (res && typeof res.msg === 'string') addMessage(res.msg);
                    else addMessage('Kill mobs command failed.');
                } catch (err) {
                    console.error('[chat:/kill mobs] failed', err);
                    addMessage('Kill mobs command failed due to runtime error.');
                }
            } else {
                addMessage('Kill mobs command unavailable.');
            }
            return;
        }
        if (typeof window.killPlayer === 'function') {
            try {
                const res = window.killPlayer();
                if (res && typeof res.msg === 'string') addMessage(res.msg);
                else addMessage('Kill command failed.');
            } catch (err) {
                console.error('[chat:/kill] failed', err);
                addMessage('Kill command failed due to runtime error.');
            }
        } else {
            addMessage('Kill command unavailable.');
        }
    } else if (cmd === '/heal') {
        if (typeof window.healPlayer === 'function') {
            try {
                const res = window.healPlayer();
                if (res && typeof res.msg === 'string') addMessage(res.msg);
                else addMessage('Heal command failed.');
            } catch (err) {
                console.error('[chat:/heal] failed', err);
                addMessage('Heal command failed due to runtime error.');
            }
        } else {
            addMessage('Heal command unavailable.');
        }
    } else if (cmd === '/farlands') {
        if (parts.length < 2) {
            addMessage('Usage: /farlands <north|south|east|west>');
            return;
        }
        const direction = parts[1].toLowerCase();
        if (typeof window.teleportToFarlands === 'function') {
            try {
                const res = window.teleportToFarlands(direction);
                if (res && typeof res.msg === 'string') addMessage(res.msg);
                else addMessage('Far Lands command failed.');
            } catch (err) {
                console.error('[chat:/farlands] failed', err);
                addMessage('Far Lands command failed due to runtime error.');
            }
        } else {
            addMessage('Far Lands command unavailable.');
        }
    } else if (cmd === '/clear') {
        if (parts.length < 2) {
            addMessage('Usage: /clear <entities|inventory>');
            return;
        }
        const target = parts[1].toLowerCase();
        if (target === 'entities') {
            if (typeof window.clearDroppedEntities === 'function') {
                try {
                    const res = window.clearDroppedEntities();
                    if (res && typeof res.msg === 'string') addMessage(res.msg);
                    else addMessage('Cleared dropped items.');
                } catch (err) {
                    console.error('[chat:/clear entities] failed', err);
                    addMessage('Clear entities command failed due to runtime error.');
                }
            } else {
                addMessage('Clear entities command unavailable.');
            }
            return;
        }
        if (target === 'inventory') {
            if (typeof window.clearInventory === 'function') {
                try {
                    const res = window.clearInventory();
                    if (res && typeof res.msg === 'string') addMessage(res.msg);
                    else addMessage('Cleared inventory.');
                } catch (err) {
                    console.error('[chat:/clear inventory] failed', err);
                    addMessage('Clear inventory command failed due to runtime error.');
                }
            } else {
                addMessage('Clear inventory command unavailable.');
            }
            return;
        }
        addMessage('Usage: /clear <entities|inventory>');
    } else if (cmd === '/fly') {
        if (typeof window.toggleFly === 'function') {
            try {
                const mode = parts.length >= 2 ? parts[1].toLowerCase() : null;
                if (mode && mode !== 'fast') {
                    addMessage('Usage: /fly [fast]');
                    return;
                }
                const res = window.toggleFly(mode);
                if (res && typeof res.msg === 'string') addMessage(res.msg);
                else addMessage('Fly toggled.');
            } catch (err) {
                console.error('[chat:/fly] failed', err);
                addMessage('Fly command failed due to runtime error.');
            }
        } else {
            addMessage('Fly command unavailable.');
        }
    } else if (cmd === '/optimise') {
        if (typeof window.toggleOptimise === 'function') {
            try {
                const res = window.toggleOptimise();
                if (res && typeof res.msg === 'string') addMessage(res.msg);
                else addMessage('Optimise mode toggled.');
            } catch (err) {
                console.error('[chat:/optimise] failed', err);
                addMessage('Optimise command failed due to runtime error.');
            }
        } else {
            addMessage('Optimise command unavailable.');
        }
    } else {
        addMessage(`Unknown command: ${cmd}`);
    }
}

export function scrollChat(direction) {
    const history = document.getElementById('chat-history');
    if (history) {
        history.scrollTop += direction;
    }
}

function getBlockStyle(id, metadata = 0, kind = null) {
    if (!id) return '';
    let stackKind = getItemStackKind(id, kind);
    const blockIdForKind = (() => {
        if (stackKind !== ITEM_STACK_KIND_BLOCK) return id;
        // Prefer native runtime block IDs; only beta-convert legacy saved IDs.
        const direct = getPlaceableBlockDef(id);
        if (direct) return id;
        const normalized = normalizeLegacyRuntimeBlockId(id);
        return getPlaceableBlockDef(normalized) ? normalized : fromBetaCompatibleBlockId(id);
    })();
    const blockDef = getPlaceableBlockDef(blockIdForKind);
    const itemDef = getItemDef(id);
    if (
        kind == null &&
        blockDef &&
        itemDef &&
        typeof itemDef.name === 'string' &&
        /\s*\(beta id\)\s*$/i.test(itemDef.name)
    ) {
        // UI fallback for legacy missing-kind stacks: prefer block icon when the item side
        // is only a colliding Beta alias entry.
        stackKind = ITEM_STACK_KIND_BLOCK;
    }
    const b = stackKind === ITEM_STACK_KIND_BLOCK
        ? blockDef
        : itemDef || getInventoryDef(id, ITEM_STACK_KIND_ITEM);
    if (!b) return '';
    
    let style = 'width:32px; height:32px; image-rendering: pixelated;';
    const applyTerrainAtlasTile = (terrainId, part = 'single') => {
        const tile = getTerrainAtlasTileById(terrainId, part, metadata);
        if (tile == null) return false;
        const tileX = tile % ATLAS_GRID_SIZE;
        const tileY = Math.floor(tile / ATLAS_GRID_SIZE);
        const bgX = (tileX / (ATLAS_GRID_SIZE - 1)) * 100;
        const bgY = (tileY / (ATLAS_GRID_SIZE - 1)) * 100;
        if (tintRgb) {
            style += `background-image: linear-gradient(rgba(${tintRgb.r},${tintRgb.g},${tintRgb.b},0.95), rgba(${tintRgb.r},${tintRgb.g},${tintRgb.b},0.95)), url('${TERRAIN_ATLAS_PATH}'); background-repeat: no-repeat, no-repeat; background-size: 100% 100%, ${ATLAS_GRID_SIZE * 100}% ${ATLAS_GRID_SIZE * 100}%; background-position: 0 0, ${bgX}% ${bgY}%; background-blend-mode: multiply;`;
        } else {
            style += `background-image: url('${TERRAIN_ATLAS_PATH}'); background-repeat: no-repeat; background-size: ${ATLAS_GRID_SIZE * 100}% ${ATLAS_GRID_SIZE * 100}%; background-position: ${bgX}% ${bgY}%;`;
        }
        return true;
    };
    const applyItemAtlasTile = (itemId) => {
        const tile = getItemAtlasTileById(itemId, metadata);
        if (tile == null) return false;
        const tileX = tile % ATLAS_GRID_SIZE;
        const tileY = Math.floor(tile / ATLAS_GRID_SIZE);
        const bgX = (tileX / (ATLAS_GRID_SIZE - 1)) * 100;
        const bgY = (tileY / (ATLAS_GRID_SIZE - 1)) * 100;
        style += `background-image: url('${ITEMS_ATLAS_PATH}'); background-repeat: no-repeat; background-size: ${ATLAS_GRID_SIZE * 100}% ${ATLAS_GRID_SIZE * 100}%; background-position: ${bgX}% ${bgY}%;`;
        return true;
    };
    const tintRgb = (() => {
        const meta = Number.isFinite(Number(metadata)) ? (Number(metadata) & 15) : 0;
        if (stackKind !== ITEM_STACK_KIND_BLOCK) return null;
        if (blockIdForKind === 1 || blockIdForKind === 31) return { r: 128, g: 180, b: 64 }; // grass / tall grass
        if (blockIdForKind === 5) {
            if (meta === 1 || meta === 9) return { r: 97, g: 153, b: 97 }; // spruce leaves
            if (meta === 2 || meta === 10) return { r: 128, g: 167, b: 85 }; // birch leaves
            return { r: 128, g: 180, b: 64 }; // oak leaves
        }
        return null;
    })();

    if (stackKind === ITEM_STACK_KIND_BLOCK && blockIdForKind === WOOL_WHITE_ITEM_ID) {
        const tile = getWoolTerrainTileForMetadata(metadata);
        const tileX = tile % ATLAS_GRID_SIZE;
        const tileY = Math.floor(tile / ATLAS_GRID_SIZE);
        const bgX = (tileX / (ATLAS_GRID_SIZE - 1)) * 100;
        const bgY = (tileY / (ATLAS_GRID_SIZE - 1)) * 100;
        style += `background-image: url('${TERRAIN_ATLAS_PATH}'); background-repeat: no-repeat; background-size: ${ATLAS_GRID_SIZE * 100}% ${ATLAS_GRID_SIZE * 100}%; background-position: ${bgX}% ${bgY}%;`;
    } else if (b.type === 'multi') {
        const terrainId = stackKind === ITEM_STACK_KIND_BLOCK ? blockIdForKind : id;
        const preferredPart = (terrainId === 29 || terrainId === 33 || terrainId === 69 || terrainId === 86 || terrainId === 17 || terrainId === 18 || terrainId === 23)
            ? 'front'
            : 'side';
        if (!applyTerrainAtlasTile(terrainId, preferredPart)) {
            style += `background: url('${TEXTURE_PATH}${b.side}') center/cover no-repeat;`;
        }
    }
    else if (b.type === 'single') {
        const terrainId = stackKind === ITEM_STACK_KIND_BLOCK ? blockIdForKind : id;
        if (!applyTerrainAtlasTile(terrainId, 'single')) {
            style += `background: url('${TEXTURE_PATH}${b.texture}') center/cover no-repeat;`;
        }
    }
    else if (b.type === 'item') {
        const tile = getItemAtlasTileById(id, metadata);
        if (tile != null) {
            const tileX = tile % ATLAS_GRID_SIZE;
            const tileY = Math.floor(tile / ATLAS_GRID_SIZE);
            const bgX = (tileX / (ATLAS_GRID_SIZE - 1)) * 100;
            const bgY = (tileY / (ATLAS_GRID_SIZE - 1)) * 100;
            style += `background-image: url('${ITEMS_ATLAS_PATH}'); background-repeat: no-repeat; background-size: ${ATLAS_GRID_SIZE * 100}% ${ATLAS_GRID_SIZE * 100}%; background-position: ${bgX}% ${bgY}%;`;
        }
    }
    else if (b.type === 'bed') {
        if (!applyItemAtlasTile(BED_ITEM_ID)) {
            const terrainId = stackKind === ITEM_STACK_KIND_BLOCK ? blockIdForKind : id;
            if (!applyTerrainAtlasTile(terrainId, 'single')) {
                style += `background: url('${TEXTURE_PATH}${b.texture}') center/cover no-repeat;`;
            }
        }
    }
    else if (b.type === 'cross') {
        const terrainId = stackKind === ITEM_STACK_KIND_BLOCK ? blockIdForKind : id;
        if (!applyTerrainAtlasTile(terrainId, 'single')) {
            style += `background: url('${TEXTURE_PATH}${b.texture}') center/cover no-repeat;`;
        }
    }
    else if (b.type === 'torch') style += `background: url('${TEXTURE_PATH}${b.texture}') center/cover no-repeat;`;
    else if (b.type === 'button' || b.type === 'lever') {
        const terrainId = stackKind === ITEM_STACK_KIND_BLOCK ? blockIdForKind : fromBetaCompatibleBlockId(id);
        if (!applyTerrainAtlasTile(terrainId, 'single')) {
            style += `background: url('${TEXTURE_PATH}${b.texture}') center/cover no-repeat;`;
        }
    }
    else if (b.type === 'pressurePlate' || b.type === 'rail' || b.type === 'repeater' || b.type === 'trapdoor') {
        const terrainId = stackKind === ITEM_STACK_KIND_BLOCK ? blockIdForKind : id;
        if (!applyTerrainAtlasTile(terrainId, 'single')) {
            style += `background: url('${TEXTURE_PATH}${b.texture}') center/cover no-repeat;`;
        }
    }
    else if (b.type === 'chest') style += `background: url('${TEXTURE_PATH}chest_small_front.png') center/cover no-repeat;`;
    else style += `background: ${b.color};`;
    
    if (b.glow) style += 'box-shadow: 0 0 4px cyan; border: 1px solid cyan;';
    return style;
}

function getDurabilityBar(item) {
    if (!item || item.durability === undefined) return '';
    const def = getInventoryDef(item.id, getItemStackKind(item.id, item.kind));
    if (!def || !def.maxDurability) return '';
    
    const pct = Math.max(0, Math.min(1, item.durability / def.maxDurability));
    const hue = pct * 120; // 0=Red, 120=Green
    return `<div class="durability-bar-container"><div class="durability-bar-fill" style="width:${pct*100}%; background-color:hsl(${hue},100%,50%)"></div></div>`;
}

function getStackDisplayName(item) {
    if (!item) return '';
    const kind = getItemStackKind(item.id, item.kind);
    const meta = Number.isFinite(Number(item.metadata)) ? (Number(item.metadata) & 15) : 0;
    const canonical = getCanonicalStatefulDrop(item.id, kind);
    if (canonical.displayName) {
        return canonical.displayName;
    }
    if (kind === ITEM_STACK_KIND_ITEM && (item.id === 20 || item.id === 7) && meta === 1) {
        return 'Charcoal';
    }
    const blockIdForKind = (() => {
        if (kind !== ITEM_STACK_KIND_BLOCK) return item.id;
        const direct = getPlaceableBlockDef(item.id);
        if (direct) return item.id;
        const normalized = normalizeLegacyRuntimeBlockId(item.id);
        return getPlaceableBlockDef(normalized) ? normalized : fromBetaCompatibleBlockId(item.id);
    })();
    if (kind === ITEM_STACK_KIND_BLOCK && blockIdForKind === 103) {
        if (meta === 1) return 'Spruce Sapling';
        if (meta === 2) return 'Birch Sapling';
        return 'Oak Sapling';
    }
    if (kind === ITEM_STACK_KIND_BLOCK && blockIdForKind === 5) {
        if (meta === 1 || meta === 9) return 'Spruce Leaves';
        if (meta === 2 || meta === 10) return 'Birch Leaves';
        return 'Oak Leaves';
    }
    if (kind === ITEM_STACK_KIND_BLOCK && blockIdForKind === WOOL_WHITE_ITEM_ID) {
        return WOOL_DISPLAY_BY_META.get(meta) || 'White Wool';
    }
    if (kind === ITEM_STACK_KIND_ITEM && item.id === DYE_POWDER_ITEM_ID) {
        return DYE_DISPLAY_BY_META.get(meta) || 'Dye Powder';
    }
    if (kind === ITEM_STACK_KIND_ITEM) {
        if (item.id === 44) return 'Leather Leggings';
        if (item.id === 45) return 'Leather Boots';
        if (item.id === 342) return 'Leather Helmet';
        if (item.id === 343) return 'Leather Chestplate';
        if (item.id === 344) return 'Gold Helmet';
        if (item.id === 345) return 'Gold Chestplate';
        if (item.id === 346) return 'Gold Leggings';
        if (item.id === 347) return 'Gold Boots';
    }
    const def = kind === ITEM_STACK_KIND_BLOCK
        ? getPlaceableBlockDef(blockIdForKind)
        : (getItemDef(item.id) || getInventoryDef(item.id, ITEM_STACK_KIND_ITEM));
    if (!def) return `Unknown (${item.id})`;
    const raw = def.name || `Unknown (${item.id})`;
    return raw.replace(/\s*\(beta id\)\s*$/i, '');
}

export function initUI() {
    refreshHotbar();
    addMessage("Welcome to MindBlock! Press T to chat.");
}

export function setSelectedSlot(index) {
    selectedSlotIndex = index;
    refreshHotbar();
}

export function getSelectedSlot() {
    return selectedSlotIndex;
}

export function refreshHotbar() {
    const containers = [
        document.getElementById('ui'),
        document.getElementById('inv-hotbar'),
        document.getElementById('inv-hotbar-3x3'),
        document.getElementById('inv-hotbar-furnace'),
        document.getElementById('inv-hotbar-chest')
    ];

    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = ''; 
        for (let i = 0; i < 10; i++) {
            const item = inventory.slots[i];
            const slot = document.createElement('div');
            slot.className = 'slot';
            if (i === selectedSlotIndex) slot.classList.add('active');
            if (item) {
                slot.innerHTML = `<div style="${getBlockStyle(item.id, item.metadata, item.kind)}"></div><span class="count">${item.count > 1 ? item.count : ''}</span>${getDurabilityBar(item)}`;
                slot.title = getStackDisplayName(item);
            } else {
                slot.title = '';
            }
            
            if (container.id !== 'ui') {
                 slot.onmousedown = (e) => {
                    inventory.clickSlot(i, e.button === 2);
                    updateCursorPos(e); // Fix cursor lag
                    renderAllGrids();
                 };
            }
            container.appendChild(slot);
        }
    });
}

export function toggleInventoryUI(isOpen, type = 'INVENTORY') {
    const screens = {
        'INVENTORY': document.getElementById('inventory-screen'),
        'CRAFTING_TABLE': document.getElementById('crafting-table-screen'),
        'FURNACE': document.getElementById('furnace-screen'),
        'CHEST': document.getElementById('chest-screen'),
        'DISPENSER': document.getElementById('chest-screen')
    };
    
    const hud = document.getElementById('ui');
    
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    
    if (isOpen) {
        inventory.activeContainerType = type;
        const activeScreen = screens[type];
        if(activeScreen) activeScreen.classList.remove('hidden');
        
        hud.style.display = 'none'; 
        renderAllGrids();
        if (!uiInterval) uiInterval = setInterval(renderAllGrids, 100);
    } else {
        inventory.closeContainer();
        hud.style.display = 'flex';
        refreshHotbar(); 
        clearInterval(uiInterval);
        uiInterval = null;
        
        if (inventory.cursorItem) {
             inventory.addItem(
                 inventory.cursorItem.id,
                 inventory.cursorItem.count,
                 inventory.cursorItem.durability,
                 inventory.cursorItem.metadata,
                 inventory.cursorItem.kind
             );
             inventory.cursorItem = null;
        }
    }
}

function updateCursorPos(e) {
    const cursor = document.getElementById('cursor-item');
    if (cursor) {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
    }
}

function renderAllGrids() {
    const type = inventory.activeContainerType;
    
    let invGridId = 'inv-grid';
    if (type === 'CRAFTING_TABLE') invGridId = 'inv-grid-3x3';
    if (type === 'FURNACE') invGridId = 'inv-grid-furnace';
    if (type === 'CHEST') invGridId = 'inv-grid-chest';
    
    const invContainer = document.getElementById(invGridId);
    if(invContainer) {
        invContainer.innerHTML = '';
        for (let i = 10; i < 40; i++) {
            createSlotElement(invContainer, i, inventory.slots[i], false);
        }
    }
    
    refreshHotbar();

    if (type === 'INVENTORY') {
        const craftInput = document.getElementById('craft-input');
        const craftOutput = document.getElementById('craft-output');
        craftInput.innerHTML = '';
        for (let i = 0; i < 4; i++) createSlotElement(craftInput, i, inventory.crafting2x2[i], true);
        
        craftOutput.innerHTML = '';
        createOutputSlot(craftOutput);
    } 
    else if (type === 'CRAFTING_TABLE') {
        const craftInput = document.getElementById('craft-input-3x3');
        const craftOutput = document.getElementById('craft-output-3x3');
        craftInput.innerHTML = '';
        for (let i = 0; i < 9; i++) createSlotElement(craftInput, i, inventory.crafting3x3[i], true);
        
        craftOutput.innerHTML = '';
        createOutputSlot(craftOutput);
    }
    else if (type === 'FURNACE' && inventory.activeTileEntity) {
        const fe = inventory.activeTileEntity;
        const slots = {
            'furnace-input': fe.inventory[0],
            'furnace-fuel': fe.inventory[1],
            'furnace-output': fe.inventory[2]
        };
        
        for (const [id, item] of Object.entries(slots)) {
            const el = document.getElementById(id);
            el.innerHTML = '';
            const slotDiv = document.createElement('div');
            slotDiv.className = 'slot';
            if (item) {
                slotDiv.innerHTML = `<div style="${getBlockStyle(item.id, item.metadata, item.kind)}"></div><span class="count">${item.count > 1 ? item.count : ''}</span>${getDurabilityBar(item)}`;
                slotDiv.title = getStackDisplayName(item);
            } else {
                slotDiv.title = '';
            }
            
            const slotName = id.split('-')[1]; 
            slotDiv.onmousedown = (e) => {
                inventory.clickFurnaceSlot(slotName, e.button === 2);
                updateCursorPos(e); // Fix cursor lag
                renderAllGrids();
            };
            el.appendChild(slotDiv);
        }
        
        const fire = document.getElementById('furnace-fire');
        if (fe.burnTime > 0) {
            fire.style.background = 'linear-gradient(to top, #ff4500, #ffa500)';
            fire.style.opacity = '1';
        } else {
            fire.style.background = '#555';
            fire.style.opacity = '0.3';
        }

        const arrow = document.querySelector('.arrow-right');
        if (arrow) {
            if (fe.cookTime > 0 && fe.maxCookTime > 0) {
                const percent = Math.floor((fe.cookTime / fe.maxCookTime) * 100);
                arrow.style.background = `linear-gradient(to right, #00FF00 ${percent}%, #404040 ${percent}%)`;
                arrow.style.webkitBackgroundClip = 'text';
                arrow.style.color = 'transparent';
                if (!CSS.supports('background-clip', 'text')) {
                     arrow.style.color = '#fff';
                }
            } else {
                arrow.style.background = 'none';
                arrow.style.color = '#404040';
            }
        }
    } else if ((type === 'CHEST' || type === 'DISPENSER') && inventory.activeTileEntity) {
        const chest = inventory.activeTileEntity;
        const chestGrid = document.getElementById('chest-grid');
        const numSlots = type === 'DISPENSER' ? 9 : (chest.isDouble ? 60 : 30);
        
        chestGrid.innerHTML = '';
        for (let i = 0; i < numSlots; i++) {
            const item = chest.inventory[i];
            const slot = document.createElement('div');
            slot.className = 'slot';
            if (item) {
                slot.innerHTML = `<div style="${getBlockStyle(item.id, item.metadata, item.kind)}"></div><span class="count">${item.count > 1 ? item.count : ''}</span>${getDurabilityBar(item)}`;
                slot.title = getStackDisplayName(item);
            } else {
                slot.title = '';
            }
            slot.onmousedown = (e) => {
                inventory.handleSlotClick(chest.inventory, i, e.button === 2);
                updateCursorPos(e);
                renderAllGrids();
            };
            slot.oncontextmenu = (e) => e.preventDefault();
            chestGrid.appendChild(slot);
        }
    }

    const cursorEl = document.getElementById('cursor-item');
    if (inventory.cursorItem) {
        cursorEl.style.display = 'block';
        cursorEl.innerHTML = `<div style="${getBlockStyle(inventory.cursorItem.id, inventory.cursorItem.metadata, inventory.cursorItem.kind)}"></div><span class="count">${inventory.cursorItem.count}</span>${getDurabilityBar(inventory.cursorItem)}`;
        cursorEl.title = getStackDisplayName(inventory.cursorItem);
    } else {
        cursorEl.style.display = 'none';
        cursorEl.title = '';
    }
}

function createSlotElement(parent, index, item, isCrafting = false) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (item) {
        slot.innerHTML = `<div style="${getBlockStyle(item.id, item.metadata, item.kind)}"></div><span class="count">${item.count > 1 ? item.count : ''}</span>${getDurabilityBar(item)}`;
        slot.title = getStackDisplayName(item);
    } else {
        slot.title = '';
    }
    slot.onmousedown = (e) => {
        const isRight = e.button === 2;
        if (isCrafting) inventory.clickCraftingSlot(index, isRight);
        else inventory.clickSlot(index, isRight);
        
        updateCursorPos(e); // Fix cursor lag
        renderAllGrids(); 
    };
    slot.oncontextmenu = (e) => e.preventDefault();
    parent.appendChild(slot);
}

function createOutputSlot(parent) {
    const outItem = inventory.craftingOutput;
    const outSlot = document.createElement('div');
    outSlot.className = 'slot';
    if (outItem) {
         outSlot.innerHTML = `<div style="${getBlockStyle(outItem.id, outItem.metadata, outItem.kind)}"></div><span class="count">${outItem.count > 1 ? outItem.count : ''}</span>${getDurabilityBar(outItem)}`;
         outSlot.title = getStackDisplayName(outItem);
         outSlot.onmousedown = (e) => {
             inventory.clickCraftingOutput(e.button === 2);
             updateCursorPos(e); // Fix cursor lag
             renderAllGrids(); 
         };
    } else {
         outSlot.title = '';
    }
    parent.appendChild(outSlot);
}

export function bindUIWindowFunctions(callbacks) {
    window.showTitleScreen = callbacks.onShowTitle;
    window.showWorldList = callbacks.windowShowWorldList;
    window.showCreateScreen = callbacks.windowShowCreateScreen;
    window.createWorldAction = callbacks.windowCreateWorldAction;
    window.deleteWorld = callbacks.windowDeleteWorld;
    window.saveAndQuit = callbacks.saveAndQuit;
    window.resumeGame = callbacks.resumeGame;
    window.setRenderDistance = callbacks.setRenderDistance;
    window.cycleRenderDistance = callbacks.cycleRenderDistance;
    window.toggleVSync = callbacks.toggleVSync;
    window.teleportToTop = callbacks.teleportToTop;
    window.teleportToFarlands = callbacks.teleportToFarlands;
    window.setDayTime = callbacks.setDayTime;
    window.setNightTime = callbacks.setNightTime;
    window.setWorldTime = callbacks.setWorldTime;
    window.getWorldTime = callbacks.getWorldTime;
    window.spawnMob = callbacks.spawnMob;
    window.teleportToSpawn = callbacks.teleportToSpawn;
    window.killMobs = callbacks.killMobs;
    window.killPlayer = callbacks.killPlayer;
    window.healPlayer = callbacks.healPlayer;
    window.clearDroppedEntities = callbacks.clearDroppedEntities;
    window.clearInventory = callbacks.clearInventory;
    window.toggleFly = callbacks.toggleFly;
    window.toggleOptimise = callbacks.toggleOptimise;
    
    document.addEventListener('mousemove', (e) => {
        updateCursorPos(e);
    });
}
