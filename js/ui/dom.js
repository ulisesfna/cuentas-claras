// Piezas de interfaz reutilizables: iconos, hojas (modales), diálogos y avisos.
import { esc, uid } from '../core/util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Iconos SVG de trazo.
const ICONS = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  transfer: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  wallet: '<path d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M3 7V6a2 2 0 0 1 2-2h11v3"/><circle cx="16.5" cy="13.5" r="1.2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.3"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M14.9 9.9A6 6 0 1 1 9.9 14.9"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  backspace: '<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/><path d="m12 9 6 6M18 9l-6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17h.01"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-4M12 17V8M16 17v-6M20 17V5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  skip: '<path d="M5 5l9 7-9 7z"/><path d="M19 5v14"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  split: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.6 8.6 20 18M8.6 15.4 20 6"/>',
  hash: '<path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18"/>',
  wand: '<path d="m4 20 11-11"/><path d="m14 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="m19 11 .7 1.3L21 13l-1.3.7L19 15l-.7-1.3L17 13l1.3-.7z"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
};
export const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
export function catIcon(c, size) {
  return `<span class="cat-ico" style="--c:${esc(c.color)}${size ? `;--size:${size}px` : ''}">${esc(c.icon)}</span>`;
}
export const TRANSFER_ICO = '<span class="cat-ico" style="--c:#7b8794">⇄</span>';

// ---------------------------------------------------------------------------
// Hojas (modales) con soporte del botón "atrás"
// ---------------------------------------------------------------------------
export const stack = [];
const afterPop = [];
let pendingPops = 0;
let useHistory = true;
try { history.replaceState({ depth: 0 }, ''); } catch (e) { useHistory = false; }

export function openSheet({ title, cls = '', ovCls = '', actions = '' }) {
  const ov = document.createElement('div');
  ov.className = `overlay ${ovCls}`;
  const hid = 'sh' + uid();
  ov.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true" aria-labelledby="${hid}">
    <header class="sheet-head">
      <button class="icon-btn" data-close aria-label="Cerrar">${icon('close')}</button>
      <h2 id="${hid}">${esc(title)}</h2>
      <div class="sheet-actions">${actions}</div>
    </header>
    <div class="sheet-body"></div>
  </div>`;
  document.body.appendChild(ov);
  const sh = { el: ov, sheet: $('.sheet', ov), body: $('.sheet-body', ov), refresh: null, onKey: null };
  stack.push(sh);
  if (useHistory) { try { history.pushState({ depth: stack.length }, ''); } catch (e) { useHistory = false; } }
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeSheet(); });
  $('.sheet-head [data-close]', ov).addEventListener('click', () => closeSheet());
  requestAnimationFrame(() => ov.classList.add('open'));
  return sh;
}
function popTo(depth) {
  while (stack.length > depth) {
    const sh = stack.pop();
    sh.el.classList.remove('open');
    sh.el.classList.add('closing');
    setTimeout(() => sh.el.remove(), 200);
  }
  afterPop.splice(0).forEach((f) => f());
}
// Cierra la hoja superior; `then` se ejecuta cuando ya está cerrada.
export function closeSheet(then) {
  if (stack.length - pendingPops <= 0) return;
  if (then) afterPop.push(then);
  if (useHistory) { pendingPops++; history.back(); } else popTo(stack.length - 1);
}
window.addEventListener('popstate', (e) => {
  pendingPops = Math.max(0, pendingPops - 1);
  popTo((e.state && e.state.depth) || 0);
});

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------
// `buttons`: [{ label, value, cls }]; el último es el principal.
// Con `input`, el botón cuyo valor es INPUT devuelve el texto escrito.
export const INPUT = Symbol('input');
export function dialog({ message = '', html = '', title = '', buttons, input = null }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay dialog-ov open';
    ov.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true">
      ${title ? `<h3 class="dialog-title">${esc(title)}</h3>` : ''}
      ${html || `<p>${esc(message)}</p>`}
      ${input ? `<input class="dialog-input" type="${input.type || 'text'}" placeholder="${esc(input.placeholder || '')}" autocomplete="${input.autocomplete || 'off'}" aria-label="${esc(input.label || title || message)}">` : ''}
      <div class="dialog-actions">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-r="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    const field = $('.dialog-input', ov);
    if (field && input.value) field.value = input.value;
    const pick = (b) => (b.value === INPUT ? (field.value || null) : b.value);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(input ? null : false); }
      else if (e.key === 'Enter' && field && document.activeElement === field) { e.preventDefault(); e.stopPropagation(); done(pick(buttons[buttons.length - 1])); }
    };
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) done(pick(buttons[+b.dataset.r])); else if (e.target === ov) done(input ? null : false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    const f = field || $(`[data-r="${buttons.length - 1}"]`, ov);
    f.focus();
    if (field && input.value) field.select();
  });
}
export function confirmDialog(message, { ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
  return dialog({ message, buttons: [{ label: cancel, value: false }, { label: ok, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }] });
}
export function promptSecret(message, { title = 'Contraseña', ok = 'Continuar' } = {}) {
  return dialog({ title, message, input: { type: 'password', autocomplete: 'current-password', label: title },
    buttons: [{ label: 'Cancelar', value: null }, { label: ok, value: INPUT, cls: 'btn-primary' }] });
}
export function promptText(title, message, value = '', { ok = 'Guardar', placeholder = '' } = {}) {
  return dialog({ title, message, input: { type: 'text', value, placeholder, label: title },
    buttons: [{ label: 'Cancelar', value: null }, { label: ok, value: INPUT, cls: 'btn-primary' }] });
}

let toastTimer;
export function toast(msg, action, ms) {
  const el = $('#toast');
  if (!el) return;
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) $('button', el).onclick = () => { el.classList.remove('show'); action.run(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms || (action ? 5000 : 2600));
}
export function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
export function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
