// js/saveStore.js
// World saves, kept in IndexedDB rather than localStorage. localStorage holds only about 5 MB for
// the whole site (shared with every other page on it), and once that's full a new world couldn't
// be written at all. The game reads and writes saves synchronously, so they're all read into
// memory when the game starts, and writes go out to IndexedDB in the background (only the latest
// value of each key is written). Saves left in localStorage by older versions are moved over
// (and removed from localStorage) the first time.
const DB_NAME = 'mindblock';
const STORE = 'saves';
const PREFIX = 'mindblock_';

const cache = new Map();
let db = null;

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
}

function readAll(database) {
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const keysReq = store.getAllKeys();
        const valuesReq = store.getAll();
        tx.oncomplete = () => resolve(keysReq.result.map((k, i) => [k, valuesReq.result[i]]));
        tx.onerror = () => reject(tx.error);
    });
}

// Writes waiting to go out (key -> value, or null to delete), sent together.
const queued = new Map();
let flushScheduled = false;
function flush() {
    flushScheduled = false;
    if (!db || queued.size === 0) return;
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [key, value] of queued) {
        if (value === null) store.delete(key);
        else store.put(value, key);
    }
    queued.clear();
    tx.onerror = () => console.error('[saveStore] write failed', tx.error);
}
function queue(key, value) {
    queued.set(key, value);
    if (!flushScheduled) { flushScheduled = true; setTimeout(flush, 0); }
}

try {
    db = await openDb();
    for (const [k, v] of await readAll(db)) cache.set(k, v);
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PREFIX)) continue;
        const value = localStorage.getItem(key);
        // (the index: the worlds listed in either, so none is lost)
        if (key === PREFIX + 'saves' && cache.has(key)) {
            try {
                const merged = JSON.parse(cache.get(key));
                for (const s of JSON.parse(value)) if (!merged.some(m => m.id === s.id)) merged.push(s);
                cache.set(key, JSON.stringify(merged));
            } catch (e) { /* keep what IndexedDB has */ }
        } else if (!cache.has(key)) {
            cache.set(key, value);
        }
        queued.set(key, cache.get(key));
    }
    if (queued.size) {
        const moved = [...queued.keys()];
        // (only once the moved saves are safely in IndexedDB, take them out of localStorage)
        const written = await new Promise(resolve => {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            for (const [key, value] of queued) store.put(value, key);
            queued.clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = tx.onabort = () => resolve(false);
        });
        if (written) for (const key of moved) localStorage.removeItem(key);
    }
} catch (e) {
    // No IndexedDB (a private window in some browsers): fall back to localStorage.
    console.warn('[saveStore] IndexedDB unavailable, using localStorage', e);
    db = null;
}

export const saveStore = {
    getItem(key) {
        if (db) return cache.has(key) ? cache.get(key) : null;
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value) {
        value = String(value);
        if (db) { cache.set(key, value); queue(key, value); return; }
        localStorage.setItem(key, value);
    },
    removeItem(key) {
        if (db) { cache.delete(key); queue(key, null); return; }
        try { localStorage.removeItem(key); } catch (e) { /* nothing to remove */ }
    },
};

// (a save started just before the page closes still goes out)
window.addEventListener('pagehide', flush);
