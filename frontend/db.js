// Tiny IndexedDB wrapper: local-first storage so LeadSnap works fully
// offline. All reads/writes go here first; a sync queue (outbox) pushes
// changes to the server whenever a connection is available.
window.LeadSnapDB = (() => {
  "use strict";

  const DB_NAME = "leadsnap";
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("contacts")) {
          const store = db.createObjectStore("contacts", { keyPath: "id" });
          store.createIndex("event_id", "event_id", { unique: false });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode) {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function wrap(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(storeName) {
    const store = await tx(storeName, "readonly");
    return wrap(store.getAll());
  }

  async function getAllByIndex(storeName, indexName, value) {
    const store = await tx(storeName, "readonly");
    return wrap(store.index(indexName).getAll(value));
  }

  async function put(storeName, value) {
    const store = await tx(storeName, "readwrite");
    return wrap(store.put(value));
  }

  async function del(storeName, key) {
    const store = await tx(storeName, "readwrite");
    return wrap(store.delete(key));
  }

  async function clearByEventId(storeName, eventId) {
    const items = await getAllByIndex(storeName, "event_id", eventId);
    const store = await tx(storeName, "readwrite");
    await Promise.all(items.map((item) => wrap(store.delete(item.id))));
  }

  async function addOutbox(item) {
    const store = await tx("outbox", "readwrite");
    return wrap(store.add({ ...item, ts: Date.now() }));
  }

  async function getOutbox() {
    const store = await tx("outbox", "readonly");
    const items = await wrap(store.getAll());
    return items.sort((a, b) => a.seq - b.seq);
  }

  async function deleteOutbox(seq) {
    const store = await tx("outbox", "readwrite");
    return wrap(store.delete(seq));
  }

  return { getAll, getAllByIndex, put, del, clearByEventId, addOutbox, getOutbox, deleteOutbox };
})();
