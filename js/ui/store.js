// Estado en memoria y su persistencia en localStorage (en claro o cifrado).
import { defaultState, migrate, NewerVersionError } from '../core/model.js';
import { isEnvelope, seal } from '../core/crypto.js';
import { setDefaultCurrency } from '../core/format.js';
import { toast } from './dom.js';

export const STORAGE_KEY = 'cuentas-claras:v1'; // la clave se mantiene; la versión del modelo va en `version`
export const META_KEY = 'cuentas-claras:meta'; // datos del dispositivo que no viajan en las copias
export const RECOVERY_PREFIX = 'cuentas-claras:recuperacion:';
export const cryptoOK = !!(globalThis.isSecureContext && globalThis.crypto && crypto.subtle);

export let S = null; // null hasta que se cargan (o descifran) los datos
export function setS(v) { S = v; if (v) setDefaultCurrency(v.settings.currency); }
export let vault = null; // { key, salt, iter, lock } mientras los datos están cifrados y desbloqueados
export function setVault(v) { vault = v; }
export let readOnly = false; // datos de una versión más nueva: no se sobrescriben
export function setReadOnly(v) { readOnly = v; }
// La copia automática se engancha aquí para enterarse de cada guardado.
export const hooks = { afterSave: () => {} };

export function readStored() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return { state: defaultState(), note: 'blocked' }; }
  if (!raw) return { state: defaultState(), fresh: true };
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { preserveRaw(raw); return { state: defaultState(), note: 'corrupt' }; }
  if (isEnvelope(obj)) return { envelope: obj };
  try { return { state: migrate(obj) }; } catch (e) {
    if (e instanceof NewerVersionError) return { newer: true };
    preserveRaw(raw);
    return { state: defaultState(), note: 'corrupt' };
  }
}
// Antes de empezar de cero, guarda los datos ilegibles aparte para poder recuperarlos.
function preserveRaw(raw) {
  try { localStorage.setItem(RECOVERY_PREFIX + Date.now(), raw); } catch (e) { /* sin espacio */ }
}
export const recoveryKeys = () => { try { return Object.keys(localStorage).filter((k) => k.startsWith(RECOVERY_PREFIX)); } catch (e) { return []; } };

let storageWarned = false;
function writeStorage(str) {
  try { localStorage.setItem(STORAGE_KEY, str); return true; } catch (e) {
    if (!storageWarned) { storageWarned = true; toast('No se pudo guardar en este navegador. Descarga una copia de seguridad.'); }
    return false;
  }
}
// Con cifrado, cada guardado cifra de nuevo con un IV aleatorio; los guardados seguidos se agrupan.
export let saveChain = Promise.resolve();
let saveQueued = false;
export function save() {
  if (!S || readOnly) return;
  if (!vault) { writeStorage(JSON.stringify(S)); hooks.afterSave(); return; }
  if (saveQueued) return;
  saveQueued = true;
  saveChain = saveChain.then(async () => {
    saveQueued = false;
    const v = vault;
    if (!v) { writeStorage(JSON.stringify(S)); return; }
    writeStorage(JSON.stringify(await seal(v, S)));
    hooks.afterSave();
  }).catch(() => toast('No se pudieron cifrar los datos al guardar.'));
}

// Metadatos del dispositivo (fecha de la última copia, aviso pospuesto, copia automática).
export let META = {};
try { META = JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { META = {}; }
export function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) { /* ignorar */ } }
