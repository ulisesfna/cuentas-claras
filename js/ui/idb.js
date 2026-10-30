// Almacén clave-valor en IndexedDB («cuentas-claras»): archivo de la copia automática y claves de
// sincronización. Guarda objetos que localStorage no admite, como claves CryptoKey no exportables.
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cuentas-claras', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', mode);
      const r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { req.result.close(); resolve(r && r.result); };
      tx.onerror = () => reject(tx.error);
    };
  });
}
export const idbGet = (k) => idb('readonly', (s) => s.get(k));
export const idbSet = (k, v) => idb('readwrite', (s) => s.put(v, k));
export const idbDel = (k) => idb('readwrite', (s) => s.delete(k));
