// Sincronización entre dispositivos a través de tu servidor (Cloudflare Worker), cifrada de extremo a extremo.
//
// · Solo hace falta una contraseña de sincronización, la misma en todos tus dispositivos.
// · De ella se derivan (PBKDF2-SHA-256, 600.000 iteraciones) dos cosas independientes:
//     - el identificador y el código de acceso de tu copia en el servidor (sin la contraseña no se
//       puede ni encontrar ni sobrescribir), y
//     - la clave AES-GCM de 256 bits con la que se cifran los datos EN el dispositivo.
//   El servidor solo guarda texto cifrado: ni Cloudflare ni nadie más puede leerlo.
// · La clave se guarda en este dispositivo como no exportable (IndexedDB); la contraseña no se guarda.
// · Usa las mismas rutas que «Mi calendario» (/sync/get y /sync/put) con otra «sal», así que en el
//   mismo servidor cada app tiene su propia copia, aunque uses la misma contraseña.
// · Fusión a tres bandas (ver js/core/sync.js): se respetan los cambios y borrados de cada dispositivo.
import { DEFAULT_SYNC_SERVER } from '../config.js';
import { SCHEMA_VERSION } from '../core/constants.js';
import { b64, deriveKey, unb64 } from '../core/crypto.js';
import { esc } from '../core/util.js';
import { dfShortY, relTime } from '../core/format.js';
import { validateImport } from '../core/validate.js';
import { mergeData } from '../core/merge.js';
import { generateRecurring } from '../core/recurring.js';
import { merge3, payloadState, samePayload, toPayload } from '../core/sync.js';
import { $, confirmDialog, icon, openSheet, promptSecret, toast } from './dom.js';
import { cryptoOK, S, save, saveListeners, setS } from './store.js';
import { idbDel, idbGet, idbSet } from './idb.js';
import { refreshAll, renderNotice } from './screen.js';
import { isVisible, onVisibility } from './native.js';

const CFG_KEY = 'cuentas-claras:sync'; // ajustes de este dispositivo (no viajan en las copias)
const ACCOUNT_SALT = 'cuentas-claras/cuenta/v1';
const ITER = 600000;
const MIN_PASS = 10;

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let cfg = {};
try { cfg = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { cfg = {}; }
let status = { state: cfg.enabled ? 'idle' : 'off', error: null };
const listeners = new Set();
let busy = false, again = false, timer = 0, changeSeq = 0, applying = false;

function writeCfg(patch) {
  cfg = { ...cfg, ...patch };
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* sin espacio */ }
}
function setStatus(state, error = null) {
  status = { state, error };
  listeners.forEach((f) => f());
}
export const onSyncChange = (f) => listeners.add(f);
export const serverUrl = () => (cfg.url || DEFAULT_SYNC_SERVER || '').replace(/\/+$/, '');
export const syncStatus = () => ({ ...status, enabled: !!cfg.enabled, lastSync: cfg.lastSync || null, pending: !!cfg.dirty, url: serverUrl() });

class NeedsPass extends Error {}
class NeedsUpdate extends Error {}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
async function api(path, body, { allow = [], base = serverUrl() } = {}) {
  if (!base) throw new Error('Falta la dirección de tu servidor (Menú → Sincronización).');
  let r;
  try {
    r = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  } catch (e) {
    throw new Error('No se puede conectar con el servidor. Revisa la conexión a internet.');
  }
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { /* no es JSON */ }
  if (!j) throw new Error('Esa dirección no responde como tu servidor de sincronización.');
  if (allow.includes(r.status)) return { ...j, status: r.status };
  if (r.status === 404 && path.startsWith('/sync')) throw new Error('Tu servidor no tiene la sincronización (ruta /sync). Revisa que el Worker tenga el código actualizado.');
  if (!r.ok || j.error) throw new Error(j.error || `El servidor respondió ${r.status}`);
  return j;
}

// Comprueba una dirección sin escribir nada en el servidor.
export async function testServer(url) {
  const base = url.replace(/\/+$/, '');
  const info = await api('/', null, { base }).catch(() => null);
  const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await api('/sync/get', { id: rand(16), tok: rand(32), since: 0 }, { base });
  return info && info.app ? `${info.app}${info.version ? ' v' + info.version : ''}` : 'servidor de sincronización';
}

// ---------------------------------------------------------------------------
// Cifrado
// ---------------------------------------------------------------------------
const te = new TextEncoder(), td = new TextDecoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Identificador y código de acceso de tu copia (independientes de la clave de cifrado).
async function deriveAccount(pass) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode(ACCOUNT_SALT), iterations: ITER, hash: 'SHA-256' }, base, 256));
  const tagged = async (tag) => hex(await crypto.subtle.digest('SHA-256', new Uint8Array([...te.encode(tag), ...bits])));
  return { id: (await tagged('id')).slice(0, 32), tok: await tagged('tok') };
}
async function encrypt(payload, stored) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const inner = { version: SCHEMA_VERSION, savedAt: Date.now(), data: payload };
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, stored.key, te.encode(JSON.stringify(inner))));
  return JSON.stringify({ app: 'cuentas-claras', format: 'sync', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(stored.salt), iv: b64(iv), data: b64(ct) });
}
// Descifra y valida una copia del servidor. Devuelve la parte compartida, ya limpia.
async function readRemote(text, key) {
  const f = JSON.parse(text);
  let inner;
  try {
    inner = JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, key, unb64(f.data))));
  } catch (e) { throw new NeedsPass('La contraseña de sincronización no coincide con la de tus otros dispositivos.'); }
  if (inner.version > SCHEMA_VERSION) throw new NeedsUpdate('Otro dispositivo usa una versión más nueva de la app. Recarga esta con conexión para actualizarla.');
  const res = validateImport(payloadState(inner.data, inner.version));
  if (res.errors) throw new Error(`Los datos del servidor no son válidos (${res.errors[0]}). No se ha cambiado nada.`);
  return toPayload(res.data);
}
function localPayload() {
  const res = validateImport(JSON.parse(JSON.stringify(S)));
  if (res.errors) throw new Error(`Hay un dato no válido en este dispositivo (${res.errors[0]}). No se ha sincronizado nada.`);
  return toPayload(res.data);
}

// ---------------------------------------------------------------------------
// Aplicar cambios recibidos
// ---------------------------------------------------------------------------
function applyPayload(p) {
  applying = true;
  try {
    S.accounts = p.accounts;
    S.categories = p.categories;
    S.transactions = p.transactions;
    S.recurring = p.recurring;
    S.rules = p.rules;
    S.rates = p.rates;
    Object.assign(S.settings, p.settings);
    generateRecurring(S);
    save();
  } finally { applying = false; }
  refreshAll();
}
// Primera sincronización de este dispositivo (o tras restaurar una copia o borrar los datos):
// si no tiene movimientos, adopta lo del servidor tal cual (sin duplicar las categorías de ejemplo);
// si los tiene, se juntan ambos (cuentas y categorías con el mismo nombre se consideran la misma).
function adoptOrCombine(remote) {
  if (!S.transactions.length) { applyPayload(remote); return; }
  const full = validateImport(payloadState(remote, SCHEMA_VERSION)).data;
  const { data } = mergeData(S, full);
  applying = true;
  try { setS(data); generateRecurring(S); save(); } finally { applying = false; }
  refreshAll();
}

// ---------------------------------------------------------------------------
// Flujo principal
// ---------------------------------------------------------------------------
/** Descarga, fusiona y sube lo necesario. */
export async function syncNow() {
  if (!cfg.enabled || !S) return;
  if (busy) { again = true; return; }
  busy = true;
  again = false;
  setStatus('syncing');
  try {
    const [stored, auth] = await Promise.all([idbGet('sync.key'), idbGet('sync.auth')]);
    if (!stored || !stored.key || !auth || !auth.id) throw new NeedsPass('Falta la contraseña de sincronización en este dispositivo.');
    let baseText = (await idbGet('sync.base')) || null;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 6) throw new Error('No se pudo terminar: hay cambios a la vez en otro dispositivo o aquí. Se reintentará en unos minutos.');
      const seq = changeSeq;
      const r = await api('/sync/get', { ...auth, since: baseText ? cfg.rev || 0 : 0 });
      let base = null;
      if (baseText) base = await readRemote(baseText, stored.key).catch(() => null);
      if (!base) baseText = null;
      let remote = null, remoteText = null;
      if (r.exists && r.same && base) { remote = base; remoteText = baseText; }
      else if (r.exists) {
        if (JSON.parse(r.data).salt !== b64(stored.salt)) throw new NeedsPass('La contraseña de sincronización se cambió en otro dispositivo.');
        remoteText = r.data;
        remote = await readRemote(r.data, stored.key);
      }
      // Si escribiste algo mientras llegaba la respuesta, se vuelve a empezar con lo último.
      if (seq !== changeSeq) continue;
      if (remote && !base) { adoptOrCombine(remote); base = remote; }
      let local = localPayload();
      let merged = remote ? merge3(base, local, remote) : local;
      if (!samePayload(merged, local)) { applyPayload(merged); merged = localPayload(); }
      const upload = !remote || !samePayload(merged, remote);
      if (!upload) {
        await idbSet('sync.base', remoteText);
        baseText = remoteText;
        writeCfg({ rev: r.rev, lastSync: Date.now(), everSynced: true, ...(seq === changeSeq ? { dirty: false } : {}) });
        break;
      }
      const check = validateImport(payloadState(merged, SCHEMA_VERSION));
      if (check.errors) throw new Error(`No se ha subido nada: ${check.errors[0]}`);
      const content = await encrypt(merged, stored);
      const w = await api('/sync/put', { ...auth, rev: r.exists ? r.rev : 0, data: content }, { allow: [409] });
      if (w.conflict) continue; // otro dispositivo subió algo justo ahora: traerlo y fusionar otra vez
      await idbSet('sync.base', content);
      baseText = content;
      writeCfg({ rev: w.rev, lastSync: Date.now(), everSynced: true, ...(seq === changeSeq ? { dirty: false } : {}) });
      break;
    }
    setStatus('idle');
  } catch (e) {
    if (e instanceof NeedsPass) setStatus('needs-pass', e.message);
    else if (e instanceof NeedsUpdate) setStatus('needs-update', e.message);
    else setStatus('error', e.message);
  } finally {
    busy = false;
    renderNotice();
    if (again) setTimeout(syncNow, 500);
  }
}

/** Conecta este dispositivo con la contraseña de sincronización (la misma en todos tus dispositivos). */
export async function connect() {
  if (!cryptoOK) { toast('Este navegador no permite cifrar aquí (hace falta abrir la app por https).'); return false; }
  if (!serverUrl()) { toast('Escribe primero la dirección de tu servidor'); return false; }
  const reconnecting = !!cfg.everSynced; // este dispositivo ya se sincronizaba: lo normal es que la copia exista
  let error = '';
  for (;;) {
    const pass = await promptSecret(`${error ? error + ' ' : ''}Es la misma en todos tus dispositivos. No se guarda en ningún sitio: si la olvidas, tus datos siguen en cada dispositivo, pero tendrás que crear otra.`,
      { title: 'Contraseña de sincronización', ok: 'Conectar' });
    if (pass == null) return false;
    if (pass.length < MIN_PASS) { error = `Usa al menos ${MIN_PASS} caracteres; mejor una frase de varias palabras.`; continue; }
    setStatus('syncing');
    try {
      const auth = await deriveAccount(pass);
      const r = await api('/sync/get', { ...auth, since: 0 });
      let salt;
      if (r.exists) {
        salt = unb64(JSON.parse(r.data).salt);
        const key = await deriveKey(pass, salt, ITER);
        await readRemote(r.data, key); // comprueba que se puede leer antes de seguir
        await idbSet('sync.key', { key, salt });
      } else {
        setStatus(cfg.enabled ? 'idle' : 'off');
        const repeat = await promptSecret(reconnecting
          ? '⚠ No hay ninguna copia con esa contraseña. Como este dispositivo ya se sincronizaba, seguramente es una errata: pulsa Cancelar y vuelve a escribirla. Solo si de verdad quieres empezar una copia nueva y separada, escríbela otra vez.'
          : 'Todavía no hay datos con esa contraseña: se creará tu copia en el servidor. Escríbela otra vez para confirmarla.',
        { title: reconnecting ? '¿Copia nueva?' : 'Confirma la contraseña', ok: 'Crear' });
        if (repeat == null) return false;
        if (repeat !== pass) { error = 'Las dos contraseñas no coinciden.'; continue; }
        setStatus('syncing');
        salt = crypto.getRandomValues(new Uint8Array(16));
        await idbSet('sync.key', { key: await deriveKey(pass, salt, ITER), salt });
      }
      await idbSet('sync.auth', auth);
      await idbDel('sync.base');
      writeCfg({ enabled: true, rev: 0, dirty: true });
    } catch (e) {
      setStatus(cfg.enabled ? 'error' : 'off', e.message);
      if (e instanceof NeedsPass) { error = e.message; continue; }
      toast(e.message, null, 6000);
      return false;
    }
    break;
  }
  await syncNow();
  if (status.state === 'idle') toast('Sincronización activada');
  return status.state === 'idle';
}

/** Olvida la contraseña en este dispositivo (los datos de aquí y los del servidor se quedan). */
export async function disconnect() {
  await Promise.all(['sync.key', 'sync.auth', 'sync.base'].map((k) => idbDel(k).catch(() => {})));
  writeCfg({ enabled: false, rev: 0, lastSync: null, dirty: false, everSynced: false });
  setStatus('off');
  renderNotice();
}

/** Tras restaurar una copia o borrar los datos: la próxima sincronización solo suma, no borra. */
export async function forgetSyncBase() {
  if (!cfg.enabled) return;
  await idbDel('sync.base').catch(() => {});
  writeCfg({ rev: 0, dirty: true });
}

export function initSync() {
  saveListeners.add(() => {
    if (applying) return;
    changeSeq++;
    if (!cfg.enabled) return;
    if (!cfg.dirty) writeCfg({ dirty: true });
    clearTimeout(timer);
    timer = setTimeout(syncNow, 4000);
    listeners.forEach((f) => f());
  });
  // Traer cambios al abrir, al volver a la app y cada 3 minutos; subir antes de cerrarla.
  const pull = () => cfg.enabled && isVisible() && syncNow();
  onVisibility((v) => {
    if (!v) { if (cfg.enabled && cfg.dirty) syncNow(); }
    else pull();
  });
  window.addEventListener('online', pull);
  setInterval(pull, 3 * 60000);
  setTimeout(pull, 1500);
}

// ---------------------------------------------------------------------------
// Pantalla «Sincronización»
// ---------------------------------------------------------------------------
export function syncLabel() {
  const s = syncStatus();
  if (!s.enabled) return 'Desactivada';
  if (s.state === 'syncing') return 'Sincronizando…';
  if (s.state === 'needs-pass') return 'Necesita tu contraseña';
  if (s.state === 'needs-update') return 'Hay que actualizar la app';
  if (s.state === 'error') return 'No se pudo sincronizar';
  return s.lastSync ? `Sincronizada ${relTime(s.lastSync)}` : 'Activada';
}

export function openSync() {
  const sh = openSheet({ title: 'Sincronización', cls: 'sheet-tall' });
  const draw = () => {
    if (!sh.el.isConnected || sh.el.classList.contains('closing')) { listeners.delete(draw); return; } // hoja cerrada
    const s = syncStatus();
    let card;
    if (!s.enabled) card = ['', 'Sincronización desactivada', 'Tus datos solo están en este dispositivo.'];
    else if (s.state === 'syncing') card = ['', '⏳ Sincronizando…', 'Cifrando y comparando con tu servidor.'];
    else if (s.state === 'needs-pass') card = ['warn', '🔑 Hace falta tu contraseña de sincronización', s.error || ''];
    else if (s.state === 'needs-update') card = ['warn', '⬆️ Actualiza la app en este dispositivo', s.error || ''];
    else if (s.state === 'error') card = ['warn', '⚠ No se pudo sincronizar', `${s.error || ''} Se volverá a intentar sola.`];
    else card = ['ok', `🔒 Sincronizada ${s.lastSync ? relTime(s.lastSync) : ''}`, `${s.pending ? 'Hay cambios pendientes de subir. ' : ''}${s.lastSync ? `Última vez: ${dfShortY.format(new Date(s.lastSync))}, ${new Date(s.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.` : ''}`];
    sh.body.innerHTML = `
      <div class="status-card ${card[0]}"><b>${esc(card[1])}</b>${card[2] ? `<span>${esc(card[2])}</span>` : ''}</div>
      <div class="btn-row">
        ${!s.enabled ? `<button class="btn btn-primary" data-s="connect">${icon('cloud')} Activar sincronización</button>` : ''}
        ${s.enabled && s.state === 'needs-pass' ? `<button class="btn btn-primary" data-s="connect">${icon('lock')} Escribir la contraseña</button>` : ''}
        ${s.enabled && s.state !== 'needs-pass' ? `<button class="btn btn-primary" data-s="now" ${s.state === 'syncing' ? 'disabled' : ''}>${icon('repeat')} Sincronizar ahora</button>` : ''}
        ${s.enabled ? '<button class="btn btn-danger-ghost" data-s="off">Desconectar este dispositivo</button>' : ''}
      </div>
      <h4 class="sub-h">Cómo funciona</h4>
      <ul class="hints small">
        <li>Tus datos se <b>cifran en el dispositivo</b> (AES-GCM de 256 bits) antes de salir; tu servidor de Cloudflare solo guarda texto cifrado que no puede leer.</li>
        <li>Usas una <b>contraseña de sincronización</b>, la misma en todos tus dispositivos. No se guarda en ningún sitio; de ella salen la clave de cifrado y el acceso a tu copia.</li>
        <li>Los cambios se suben unos segundos después de hacerlos, y se traen al abrir la app, al volver a ella y cada pocos minutos. Sin conexión todo sigue funcionando y se sincroniza al volver.</li>
        <li>Si cambias lo mismo en dos dispositivos a la vez, se juntan los cambios; si borras algo en uno, se borra en los demás. Si en un dispositivo se borra algo que en otro se acababa de modificar, se conserva.</li>
        <li>La primera vez, un dispositivo sin movimientos recibe lo del servidor; uno que ya tenía datos los junta con los del servidor.</li>
        <li>No sincroniza el tema, la vista ni el código de bloqueo: son de cada dispositivo.</li>
      </ul>
      <p class="tip">⚠️ Elige una contraseña larga (por ejemplo, una frase de 4 o 5 palabras). Si la olvidas, tus datos siguen en cada dispositivo, pero tendrás que desconectar y crear una nueva.</p>
      <h4 class="sub-h">Tu servidor</h4>
      <label class="field"><span>Dirección del servidor (Cloudflare Worker)</span>
        <input data-url type="url" inputmode="url" autocomplete="off" value="${esc(s.url)}" placeholder="https://…workers.dev">
        <small class="muted">Por defecto, el mismo de «Mi calendario». Cada app guarda allí su propia copia, separada.</small></label>
      <div class="btn-row"><button class="btn" data-s="test">Probar conexión</button>${cfg.url ? '<button class="btn" data-s="default">Usar el servidor por defecto</button>' : ''}</div>
      <p class="muted small" data-test-result></p>`;
  };
  sh.refresh = draw;
  draw();
  listeners.add(draw);
  sh.body.addEventListener('change', (e) => {
    if (!e.target.matches('[data-url]')) return;
    let url = e.target.value.trim();
    try { url = url ? new URL(url).origin : ''; } catch (err) { toast('Esa dirección no es válida'); return; }
    writeCfg({ url });
    draw();
  });
  sh.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const a = b.dataset.s;
    if (a === 'connect') { if (cfg.enabled) await disconnectSecretsOnly(); await connect(); draw(); }
    else if (a === 'now') await syncNow();
    else if (a === 'off') {
      if (!(await confirmDialog('Este dispositivo dejará de sincronizarse. Tus datos se quedan aquí y en el servidor. ¿Continuar?', { ok: 'Desconectar' }))) return;
      await disconnect();
      toast('Sincronización desconectada en este dispositivo');
    } else if (a === 'default') { writeCfg({ url: '' }); draw(); }
    else if (a === 'test') {
      const out = $('[data-test-result]', sh.body);
      out.textContent = 'Probando…';
      try { out.textContent = `✓ Conecta con ${await testServer(serverUrl())} y admite sincronización.`; }
      catch (err) { out.textContent = `✗ ${err.message}`; }
    }
  });
}
// Para volver a escribir la contraseña sin perder la configuración del servidor.
async function disconnectSecretsOnly() {
  await Promise.all(['sync.key', 'sync.auth'].map((k) => idbDel(k).catch(() => {})));
  writeCfg({ enabled: false });
}
