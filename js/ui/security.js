// Código de acceso y cifrado: teclado de PIN o contraseña, pantalla de bloqueo y ajustes.
import { KDF_ITERATIONS } from '../core/constants.js';
import { esc } from '../core/util.js';
import { nfInt } from '../core/format.js';
import { decryptWithKey, deriveKey, hashPin, newVault, openEnvelope } from '../core/crypto.js';
import { migrate, NewerVersionError } from '../core/model.js';
import { $, $$, confirmDialog, icon, openSheet, shake, toast } from './dom.js';
import { cryptoOK, S, save, saveChain, setReadOnly, setS, setVault, STORAGE_KEY, vault } from './store.js';
import { refreshAll } from './screen.js';
import { auto, writeAutoBackup } from './backup.js';

function mountPinPad(container, { title, subtitle = '', onComplete }) {
  let pin = '';
  let busy = false;
  container.innerHTML = `<div class="pin-wrap">
    <div class="pin-title">${esc(title)}</div><div class="pin-sub">${esc(subtitle)}</div>
    <div class="pin-dots">${'<i></i>'.repeat(4)}</div>
    <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
      <span></span><button data-n="0">0</button><button data-back aria-label="Borrar">${icon('backspace')}</button></div></div>`;
  const dots = $$('.pin-dots i', container);
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const press = (n) => {
    if (busy || pin.length >= 4) return;
    pin += n;
    paint();
    if (pin.length === 4) setTimeout(() => onComplete(pin), 120);
  };
  const back = () => { if (!busy) { pin = pin.slice(0, -1); paint(); } };
  $('.pin-pad', container).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.back != null) back(); else press(b.dataset.n);
  });
  return {
    reset(msg) {
      pin = '';
      paint();
      if (msg) { $('.pin-sub', container).textContent = msg; shake($('.pin-dots', container)); }
    },
    busy(on) {
      busy = on;
      container.classList.toggle('busy', on);
      if (on) $('.pin-sub', container).textContent = 'Comprobando…';
    },
    key(e) {
      if (/^\d$/.test(e.key)) { press(e.key); return true; }
      if (e.key === 'Backspace') { back(); return true; }
      return false;
    },
  };
}

// Campo para PIN (teclado numérico) o contraseña (texto), con la misma interfaz.
function mountSecretInput(container, { lock, title, subtitle = '', isNew = false, onSubmit }) {
  if (lock === 'pin') return mountPinPad(container, { title, subtitle, onComplete: onSubmit });
  container.innerHTML = `<form class="pw-wrap" novalidate>
    <div class="pin-title">${esc(title)}</div><div class="pin-sub">${esc(subtitle)}</div>
    <input type="password" class="pw-input" autocomplete="${isNew ? 'new-password' : 'current-password'}" aria-label="${esc(title)}">
    <button class="btn btn-primary btn-block" type="submit">Continuar</button></form>`;
  const form = $('form', container), inp = $('input', form), btn = $('button', form), sub = $('.pin-sub', form);
  form.addEventListener('submit', (e) => { e.preventDefault(); if (inp.value) onSubmit(inp.value); });
  setTimeout(() => inp.focus(), 60);
  return {
    reset(msg) { inp.value = ''; if (msg) { sub.textContent = msg; shake(inp); } inp.focus(); },
    busy(on) { inp.disabled = on; btn.disabled = on; if (on) sub.textContent = 'Comprobando…'; else inp.focus(); },
    key: () => false,
  };
}

export const hasCode = () => !!vault || !!(S && S.settings.pinHash);
const lockType = () => (vault ? vault.lock : S.settings.lockType === 'password' ? 'password' : 'pin');

// Comprueba el código: con cifrado, intentando descifrar los datos guardados.
async function verifySecret(secret) {
  if (vault) {
    try {
      await saveChain;
      const env = JSON.parse(localStorage.getItem(STORAGE_KEY));
      await decryptWithKey(await deriveKey(secret, vault.salt, vault.iter), env);
      return true;
    } catch (e) { return false; }
  }
  return hashPin(secret) === S.settings.pinHash;
}
// Activa o cambia el código. Si el navegador lo permite, los datos quedan cifrados con él.
async function applyNewSecret(type, secret) {
  if (cryptoOK) {
    setVault(await newVault(secret, type, KDF_ITERATIONS));
    S.settings.pinHash = null;
  } else {
    S.settings.pinHash = hashPin(secret);
  }
  S.settings.lockType = type;
  save();
  await saveChain;
  if (auto.state === 'active') writeAutoBackup();
}
async function removeSecret() {
  setVault(null);
  S.settings.pinHash = null;
  save();
  await saveChain;
  if (auto.state === 'active') writeAutoBackup();
}

// Pantalla de bloqueo. Con `envelope`, el código además descifra los datos al arrancar.
export let lockEl = null;
export function showLock(envelope) {
  return new Promise((resolve) => {
    if (lockEl) { resolve(); return; }
    if (!envelope && !hasCode()) { resolve(); return; }
    const type = envelope ? (envelope.lock === 'pin' ? 'pin' : 'password') : lockType();
    lockEl = document.createElement('div');
    lockEl.className = 'lock';
    lockEl.innerHTML = '<img src="icons/icon.svg" alt="" class="lock-logo"><div class="lock-body"></div>';
    document.body.appendChild(lockEl);
    if (envelope && !cryptoOK) {
      lockEl.padKey = () => false;
      $('.lock-body', lockEl).innerHTML = '<div class="pw-wrap"><div class="pin-title">Datos cifrados</div><p class="pin-sub">Este navegador no puede descifrarlos aquí. Abre la app desde su dirección https.</p></div>';
      return;
    }
    const wrong = type === 'pin' ? 'Código incorrecto' : 'Contraseña incorrecta';
    const pad = mountSecretInput($('.lock-body', lockEl), {
      lock: type,
      title: type === 'pin' ? 'Introduce tu código' : 'Introduce tu contraseña',
      subtitle: envelope ? 'Tus datos están cifrados' : '',
      onSubmit: async (secret) => {
        pad.busy(true);
        let ok = false;
        try {
          if (envelope) {
            const r = await openEnvelope(envelope, secret);
            setS(migrate(r.obj));
            setVault(r.vault);
            ok = true;
          } else ok = await verifySecret(secret);
        } catch (e) {
          if (e instanceof NewerVersionError) { pad.busy(false); showBlocked(); return; }
          ok = false;
        }
        pad.busy(false);
        if (!ok) { pad.reset(wrong); return; }
        lockEl.remove();
        lockEl = null;
        resolve();
      },
    });
    lockEl.padKey = pad.key;
  });
}
export function showBlocked() {
  setReadOnly(true);
  if (lockEl) lockEl.remove();
  lockEl = document.createElement('div');
  lockEl.className = 'lock';
  lockEl.padKey = () => false;
  lockEl.innerHTML = `<img src="icons/icon.svg" alt="" class="lock-logo"><div class="pw-wrap"><div class="pin-title">Hay una versión más nueva</div>
    <p class="pin-sub">Tus datos se guardaron con una versión más reciente de la app. Para no estropearlos, esta versión no los abrirá. Recarga con conexión a internet para actualizar.</p>
    <button class="btn btn-primary btn-block" data-reload>Recargar</button></div>`;
  $('[data-reload]', lockEl).addEventListener('click', () => location.reload());
  document.body.appendChild(lockEl);
}

export function openSecurity() {
  const sh = openSheet({ title: 'Código y cifrado' });
  let pad = null;
  let pick = null; // acción pendiente al elegir el tipo de código
  const row = (act, label, sub = '') => `<button class="list-row" data-act="${act}">${icon(act === 'off' ? 'close' : act === 'encrypt' ? 'shield' : 'lock')}<span class="grow"><span class="t">${label}</span>${sub ? `<span class="s">${sub}</span>` : ''}</span>${icon('chevR')}</button>`;
  const home = () => {
    pad = null;
    pick = null;
    const mode = vault ? 'enc' : S.settings.pinHash ? 'lock' : 'off';
    const lt = lockType();
    const head = {
      enc: ['ok', '🔒 Datos cifrados', `Protegidos con ${lt === 'pin' ? 'un PIN de 4 dígitos' : 'una contraseña'}: cifrado AES-GCM de 256 bits con una clave derivada por PBKDF2-SHA-256 (${nfInt.format(vault ? vault.iter : KDF_ITERATIONS)} iteraciones). Sin el código, lo guardado en el navegador es ilegible.`],
      lock: ['warn', '🔓 Código activo, datos sin cifrar', 'El código impide abrir la app, pero los datos se guardan legibles en el navegador.'],
      off: ['', 'Sin código de acceso', 'Cualquiera con acceso a este dispositivo puede abrir la app y ver tus datos.'],
    }[mode];
    sh.body.innerHTML = `
      <div class="status-card ${head[0]}"><b>${head[1]}</b><span>${head[2]}</span></div>
      ${!cryptoOK ? '<p class="tip">⚠ Este navegador no permite cifrar aquí (hace falta abrir la app por https o en localhost). Solo se puede activar el bloqueo.</p>' : ''}
      <div class="list">
        ${mode === 'off' ? row('on', 'Activar código', cryptoOK ? 'Tus datos quedarán cifrados con él' : '') : ''}
        ${mode === 'lock' && cryptoOK ? row('encrypt', 'Cifrar mis datos', 'Usa tu código actual para cifrarlos') : ''}
        ${mode !== 'off' ? row('change', 'Cambiar código') + row('off', mode === 'enc' ? 'Quitar código y descifrar' : 'Quitar código') : ''}
      </div>
      ${mode !== 'off' ? `<label class="switch-row"><span><b>Bloqueo automático</b><small>Pide el código si la app pasa más de 1 minuto en segundo plano.</small></span>
        <input type="checkbox" class="switch" data-auto ${S.settings.autoLock ? 'checked' : ''}></label>` : ''}
      ${mode === 'enc' && lt === 'pin' ? '<p class="tip mt">⚠ Un PIN de 4 dígitos solo tiene 10.000 combinaciones. Frena a quien coja el móvil, pero alguien que copie los datos del navegador podría probarlas todas en poco tiempo. Para una protección real, usa una contraseña larga.</p>' : ''}
      ${mode !== 'off' ? '<p class="tip mt">⚠ Si olvidas el código no hay forma de recuperar los datos. Guarda una copia de seguridad.</p>' : ''}`;
  };
  const ask = (lock, title, subtitle, isNew, cb) => {
    sh.body.innerHTML = '<div class="pin-host"></div>';
    pad = mountSecretInput($('.pin-host', sh.body), { lock, title, subtitle, isNew, onSubmit: cb });
  };
  const chooseType = (then) => {
    pad = null;
    pick = then;
    sh.body.innerHTML = `<p>¿Qué tipo de código quieres usar?</p>
      <div class="choice-list">
        <button class="choice" data-lt="password"><b>Contraseña <span class="pill">Recomendada</span></b><span>Al menos 6 caracteres. Protege de verdad los datos cifrados si alguien copia los archivos del navegador.</span></button>
        <button class="choice" data-lt="pin"><b>PIN de 4 dígitos</b><span>Más cómodo, pero solo 10.000 combinaciones: frena a quien coja el móvil, no a un ataque con tiempo.</span></button>
      </div>`;
  };
  const setNew = () => chooseType((lt) => ask(lt, lt === 'pin' ? 'Nuevo PIN' : 'Nueva contraseña', lt === 'pin' ? 'Elige 4 dígitos' : 'Mínimo 6 caracteres', true, (p1) => {
    if (lt === 'password' && p1.length < 6) { pad.reset('Usa al menos 6 caracteres'); return; }
    ask(lt, 'Confírmalo', 'Escríbelo otra vez', true, async (p2) => {
      if (p1 !== p2) { toast('No coinciden. Vuelve a empezar.'); setNew(); return; }
      pad.busy(true);
      await applyNewSecret(lt, p1);
      toast(vault ? 'Código activado: tus datos están cifrados' : 'Código activado');
      home();
      refreshAll();
    });
  }));
  const verify = (then) => ask(lockType(), lockType() === 'pin' ? 'Código actual' : 'Contraseña actual', '', false, async (p) => {
    pad.busy(true);
    const ok = await verifySecret(p);
    pad.busy(false);
    if (ok) then(p); else pad.reset('Incorrecto');
  });
  sh.body.addEventListener('click', async (e) => {
    const lt = e.target.closest('[data-lt]');
    if (lt && pick) { const f = pick; pick = null; f(lt.dataset.lt); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'on') setNew();
    else if (act === 'change') verify(() => setNew());
    else if (act === 'encrypt') verify(async (p) => { pad.busy(true); await applyNewSecret(lockType(), p); toast('Tus datos están cifrados'); home(); refreshAll(); });
    else if (act === 'off') {
      verify(async () => {
        if (vault && !(await confirmDialog('Tus datos se guardarán sin cifrar en este navegador. ¿Continuar?', { ok: 'Quitar código' }))) { home(); return; }
        await removeSecret();
        toast('Código quitado');
        home();
        refreshAll();
      });
    }
  });
  sh.body.addEventListener('change', (e) => {
    if (e.target.matches('[data-auto]')) { S.settings.autoLock = e.target.checked; save(); }
  });
  sh.onKey = (e) => (pad ? pad.key(e) : false);
  home();
}
