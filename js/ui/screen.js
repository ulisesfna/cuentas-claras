// Pantalla principal: cabecera, gráfico, lista de movimientos, avisos y próximos movimientos.
import { ACCOUNT_KINDS, BACKUP_WARN_DAYS, BUDGET_WARN, FREQ, kindOf } from '../core/constants.js';
import { esc } from '../core/util.js';
import { dayLabel, fmt, fmtSigned, setDefaultCurrency, shortDate, signCls } from '../core/format.js';
import { periodLabel, shiftView } from '../core/periods.js';
import {
  accCur, accName, byDateDesc, computeView, convert, creditInfo, getAccount, getCategory, isSplit, loanInfo,
  sortedCats, touches, txEntries, txParts, viewCurrency,
} from '../core/ledger.js';
import { budgetLevel, catBudget, periodBudget } from '../core/budget.js';
import { upcoming } from '../core/recurring.js';
import { hasTag } from '../core/tags.js';
import { $, $$, catIcon, icon, reducedMotion, stack, TRANSFER_ICO } from './dom.js';
import { META, S, save } from './store.js';
import { auto } from './backup.js';

const RING_SLOTS = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [4, 1], [3, 1], [2, 1]];
export const expanded = new Set();

export function refreshAll() {
  render();
  stack.forEach((s) => s.refresh && s.refresh());
}

export function render() {
  if (!S) return;
  setDefaultCurrency(S.settings.currency);
  applyTheme();
  renderHeader();
  const d = computeView(S, S.view);
  renderFilter(d);
  renderOverview(d);
  renderList(d);
  renderUpcomingCard();
  renderNotice();
}

export function shiftPeriod(dir) {
  if (S.view.type === 'all') return;
  shiftView(S.view, dir, S.settings);
  save();
  render();
  if (!reducedMotion()) {
    const anim = (el) => el && el.animate && el.animate(
      [{ opacity: 0.2, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    anim($('.donut-cell')); anim($('#txList'));
  }
}

function renderHeader() {
  if (S.view.account !== 'all' && !getAccount(S, S.view.account)) S.view.account = 'all';
  const a = getAccount(S, S.view.account);
  $('#accountLabel').textContent = a ? `${a.icon} ${a.name}` : 'Todas las cuentas';
  $('#periodLabel').textContent = periodLabel(S.view, S.settings);
  const fixed = S.view.type === 'all';
  $('#prevPeriod').disabled = fixed;
  $('#nextPeriod').disabled = fixed;
  $('#btnTransfer').hidden = S.accounts.length < 2;
}

// Con una etiqueta activa, toda la pantalla muestra solo sus movimientos.
function renderFilter(d) {
  const el = $('#filterBar');
  const tag = S.view.tag;
  el.hidden = !tag;
  if (!tag) { el.innerHTML = ''; return; }
  const n = new Set([...d.exp, ...d.inc].flatMap((g) => g.items.map((i) => i.t.id))).size;
  el.innerHTML = `${icon('hash')}<span class="grow">Solo <b>#${esc(tag)}</b> · ${n} movimiento(s) en este período</span>
    <button class="btn sm" data-clear-tag>Quitar filtro ${icon('close')}</button>`;
}

function renderOverview(d) {
  const cats = sortedCats(S, 'expense');
  const overflow = cats.length > 16;
  const shown = overflow ? cats.slice(0, 15) : cats;
  const spent = new Map(d.exp.map((g) => [g.key, g.total]));
  const slots = shown.map((c) => {
    const s = spent.get(c.id) || 0;
    const b = catBudget(S, c, d);
    const lv = budgetLevel(s, b);
    const flag = lv === 'warn' || lv === 'over';
    const tip = `${c.name}${s ? ': ' + fmt(s, d.cur) : ''}${b ? ` de ${fmt(b, d.cur)} presupuestados` : ''}`;
    return `<button class="ring-cat" data-cat="${c.id}" title="${esc(tip)}" aria-label="Añadir gasto en ${esc(c.name)}${flag ? (lv === 'over' ? ' (presupuesto superado)' : ' (cerca del límite del presupuesto)') : ''}">
      <span class="ico-wrap">${catIcon(c)}${flag ? `<span class="bud-dot ${lv}" aria-hidden="true">${lv === 'over' ? '!' : ''}</span>` : ''}</span><span class="ring-name">${esc(c.name)}</span></button>`;
  });
  if (overflow) slots.push(`<button class="ring-cat" data-more aria-label="Más categorías"><span class="cat-ico more">•••</span><span class="ring-name">Más</span></button>`);
  else if (slots.length < 16) slots.push(`<button class="ring-cat" data-addcat aria-label="Nueva categoría"><span class="cat-ico more">+</span><span class="ring-name">Nueva</span></button>`);

  let html = slots.map((s, i) => `<div class="slot" style="grid-row:${RING_SLOTS[i][0]};grid-column:${RING_SLOTS[i][1]}">${s}</div>`).join('');
  html += `<div class="donut-cell">${donutSVG(d)}<div class="donut-center">${centerHTML(d)}</div></div>`;
  $('#ring').innerHTML = html;

  const bal = $('#balanceValue');
  bal.textContent = fmt(d.balance, d.cur);
  bal.className = 'amt ' + signCls(d.balance);
}

// Anillo de gastos por categoría: es una parte del total, así que cada movimiento dividido
// aporta cada parte a su categoría y la suma sigue siendo el 100 %.
function donutSVG(d) {
  const R = 78, SW = 20, C = 2 * Math.PI * R;
  let segs = '';
  if (d.expense > 0) {
    const gap = d.exp.length > 1 ? 1.4 : 0;
    let off = 0;
    for (const g of d.exp) {
      const len = (g.total / d.expense) * C;
      const vis = Math.max(len - gap, 0.8);
      segs += `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${esc(g.cat.color)}" stroke-width="${SW}" stroke-dasharray="${vis.toFixed(2)} ${(C - vis).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(g.cat.name)}: ${esc(fmt(g.total, d.cur))}</title></circle>`;
      off += len;
    }
  }
  let budget = '';
  const b = periodBudget(S, d);
  if (b) {
    const R2 = 95, C2 = 2 * Math.PI * R2;
    const p = Math.min(d.expense / b, 1);
    const col = d.expense > b ? 'var(--expense)' : p >= BUDGET_WARN ? 'var(--warn)' : 'var(--income)';
    budget = `<circle class="donut-track" r="${R2}" cx="100" cy="100" fill="none" stroke-width="4"/>
      <circle r="${R2}" cx="100" cy="100" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(p * C2).toFixed(2)} ${C2.toFixed(2)}"/>`;
  }
  return `<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="Gastos por categoría${S.view.tag ? ' con la etiqueta ' + esc(S.view.tag) : ''}">
    <g transform="rotate(-90 100 100)">
      <circle class="donut-track" r="${R}" cx="100" cy="100" fill="none" stroke-width="${SW}"/>
      ${segs}${budget}
    </g></svg>`;
}

function centerHTML(d) {
  const b = periodBudget(S, d);
  if (b != null) {
    const left = b - d.expense;
    return `<span class="c-label">${left >= 0 ? 'Disponible' : 'Excedido'}</span>
      <span class="c-big ${left >= 0 ? 'income' : 'expense'}">${fmt(Math.abs(left), d.cur)}</span>
      <span class="c-sub">de ${fmt(b, d.cur)}</span>`;
  }
  const tag = S.view.tag ? `<span class="c-tag">#${esc(S.view.tag)}</span>` : '';
  return `${tag}<span class="c-label">Ingresos</span><span class="c-val income">${fmt(d.income, d.cur)}</span>
    <span class="c-label">Gastos</span><span class="c-val expense">${fmt(d.expense, d.cur)}</span>`;
}

function renderList(d) {
  $$('.list-mode button').forEach((b) => {
    const on = b.dataset.mode === S.settings.listMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  const el = $('#txList');
  const showCarry = S.settings.carryOver && !S.view.tag && d.from && Math.abs(d.carry) > 0.004;
  const empty = !d.exp.length && !d.inc.length && !d.transfers.length;
  let html = '';
  if (showCarry) html += `<div class="carry-row"><span>Saldo anterior</span><span class="amt ${signCls(d.carry)}">${fmt(d.carry, d.cur)}</span></div>`;
  if (empty) {
    html += S.view.tag
      ? `<div class="empty"><div class="big">#</div><p><b>Ningún movimiento con #${esc(S.view.tag)} en este período</b></p><p>Cambia de período o quita el filtro.</p></div>`
      : `<div class="empty"><div class="big">🪙</div><p><b>Sin movimientos en este período</b></p>
        <p>Pulsa <b>− Gasto</b> o <b>+ Ingreso</b>, o toca una categoría alrededor del gráfico para apuntar un gasto.</p></div>`;
  } else {
    html += S.settings.listMode === 'date' ? dateList(d) : categoryList(d);
  }
  el.innerHTML = html;
}

function categoryList(d) {
  const sec = (title, groups, total, type) => (groups.length
    ? `<section class="list-sec"><h3><span>${title}</span><span class="amt ${type}">${fmt(total, d.cur)}</span></h3>${groups.map((g) => groupHTML(g, total, d)).join('')}</section>`
    : '');
  let html = sec('Gastos', d.exp, d.expense, 'expense') + sec('Ingresos', d.inc, d.income, 'income');
  if (d.transfers.length) {
    html += `<section class="list-sec"><h3><span>Transferencias</span><span>${d.transfers.length}</span></h3>
      <div class="day-items">${d.transfers.slice().sort(byDateDesc).map((t) => itemRow(t, 'cat')).join('')}</div></section>`;
  }
  return html;
}

function groupHTML(g, total, d) {
  const pct = total ? Math.round((g.total / total) * 100) : 0;
  const open = expanded.has(g.gk);
  const b = g.type === 'expense' ? catBudget(S, g.cat, d) : null;
  const lv = budgetLevel(g.total, b);
  const bud = b ? `<span class="bud ${lv}">${lv === 'over' ? '⚠ ' : ''}${Math.round((g.total / b) * 100)} % de ${fmt(b, d.cur)}</span>` : '';
  return `<div class="grp${open ? ' open' : ''}">
    <button class="grp-head" data-group="${esc(g.gk)}" aria-expanded="${open}">
      ${catIcon(g.cat)}
      <span class="grp-main"><span class="grp-name">${esc(g.cat.name)} <small>${g.items.length}</small>${bud}</span>
        <span class="bar"><i style="width:${pct}%;background:${esc(g.cat.color)}"></i></span></span>
      <span class="grp-pct">${pct}%</span>
      <span class="amt ${g.type}">${fmt(g.total, d.cur)}</span>
    </button>
    ${open ? `<div class="grp-items">${g.items.slice().sort((a, b2) => byDateDesc(a.t, b2.t)).map((i) => itemRow(i.t, 'cat', i)).join('')}</div>` : ''}
  </div>`;
}

function dateList(d) {
  const acc = d.view.account;
  const tag = d.view.tag;
  const txs = S.transactions.filter((t) => (!d.from || t.date >= d.from) && (!d.to || t.date <= d.to) && touches(S, t, acc)
    && hasTag(t, tag)).sort(byDateDesc);
  let html = '', day = null, rows = [], net = 0;
  const flush = () => {
    if (!day) return;
    html += `<section class="list-sec"><h3><span>${esc(dayLabel(day))}</span><span class="amt ${signCls(net)}">${fmtSigned(net, d.cur)}</span></h3><div class="day-items">${rows.join('')}</div></section>`;
  };
  for (const t of txs) {
    if (t.date !== day) { flush(); day = t.date; rows = []; net = 0; }
    rows.push(itemRow(t, 'date'));
    for (const e of txEntries(S, t, acc)) net += (e.type === 'income' ? 1 : -1) * convert(S, e.amount, e.currency, d.cur);
  }
  flush();
  return html;
}

const tagText = (t) => (t.tags || []).map((g) => '#' + g).join(' ');

// Fila de movimiento. mode: 'cat' (dentro de una categoría), 'date' (por día) o 'search'.
// `part` = { amount, split } cuando la fila es la parte de un movimiento dividido.
export function itemRow(t, mode, part = null) {
  const acc = S.view.account;
  const sub = [];
  let ico, title, amt;
  if (t.type === 'transfer') {
    ico = TRANSFER_ICO;
    title = `${accName(S, t.accountId)} → ${accName(S, t.toAccountId)}`;
    const fc = accCur(S, t.accountId), tc = accCur(S, t.toAccountId);
    if (mode !== 'search' && acc !== 'all' && acc === t.toAccountId) amt = `<span class="amt income">+${fmt(t.toAmount, tc)}</span>`;
    else if (mode !== 'search' && acc !== 'all') amt = `<span class="amt expense">−${fmt(t.amount, fc)}</span>`;
    else amt = `<span class="amt neutral">${fmt(t.amount, fc)}</span>`;
    if (t.note) sub.push(t.note);
  } else {
    const split = isSplit(t);
    const parts = txParts(t);
    // Dentro de una categoría, la parte se muestra con el icono de esa categoría; si no, el de la parte mayor.
    const main = split && part && part.categoryId ? { categoryId: part.categoryId }
      : split ? parts.slice().sort((a, b) => b.amount - a.amount)[0] : parts[0];
    const c = getCategory(S, main.categoryId);
    ico = split ? `<span class="ico-wrap">${catIcon(c)}<span class="split-dot" aria-hidden="true">✂</span></span>` : catIcon(c);
    let shownAmount = t.amount;
    if (mode === 'cat') {
      title = t.note || c.name;
      if (split && part) {
        shownAmount = part.amount;
        title = t.note || `${c.name} (parte de un gasto dividido)`;
        sub.push(`✂ parte de ${fmt(t.amount, accCur(S, t.accountId))}`);
      }
    } else {
      const names = parts.map((p) => getCategory(S, p.categoryId).name);
      title = split ? (names.length > 2 ? `${names[0]} + ${names.length - 1} más` : names.join(' + ')) : c.name;
      if (t.note) sub.push(t.note);
    }
    if (acc === 'all' || mode === 'search') sub.push(accName(S, t.accountId));
    amt = `<span class="amt ${t.type}">${t.type === 'expense' ? '−' : '+'}${fmt(shownAmount, accCur(S, t.accountId))}</span>`;
  }
  if (mode !== 'date') sub.unshift(shortDate(t.date));
  const tags = tagText(t);
  return `<button class="tx-row" data-tx="${t.id}">${ico}
    <span class="tx-main"><span class="tx-title">${esc(title)}${t.recurringId ? ' <span class="rec" title="Recurrente">↻</span>' : ''}</span>
    ${sub.length || tags ? `<span class="tx-sub">${sub.map(esc).join(' · ')}${tags ? `${sub.length ? ' · ' : ''}<span class="tx-tags">${esc(tags)}</span>` : ''}</span>` : ''}</span>${amt}</button>`;
}

export function accountNote(a) {
  const parts = [];
  const ci = creditInfo(S, a);
  if (ci) {
    if (ci.lastClose) parts.push(`Ciclo actual ${fmt(ci.cycleSpend, a.currency)} · cierra el ${shortDate(ci.nextClose)}`);
    if (ci.available != null) parts.push(`Disponible ${fmt(ci.available, a.currency)} de ${fmt(ci.limit, a.currency)}`);
  }
  const li = loanInfo(S, a);
  if (li) parts.push(`Devuelto ${Math.round(li.pct)} % · quedan ${fmt(li.remaining, a.currency)}`);
  if (a.currency !== S.settings.currency) parts.push(a.currency);
  if (a.includeInTotal === false) parts.push('Excluida del total');
  return parts.join(' · ');
}
export const kindLabel = (a) => ACCOUNT_KINDS[kindOf(a)].label;

// ---------------------------------------------------------------------------
// Avisos y próximos movimientos
// ---------------------------------------------------------------------------
export function backupAgeDays() {
  const ref = META.lastBackupAt || META.installedAt || Date.now();
  return Math.floor((Date.now() - ref) / 86400000);
}
export const backupOverdue = () => !!S && S.transactions.length > 0 && backupAgeDays() > BACKUP_WARN_DAYS && !(META.snoozeUntil > Date.now());

export function renderNotice() {
  const el = $('#notice');
  if (!el || !S) return;
  const box = (ico, text, actions) => `<div class="notice"><span class="notice-ico" aria-hidden="true">${ico}</span><p>${text}</p>
    <div class="notice-actions">${actions.map(([a, l, cls]) => `<button class="btn sm ${cls || ''}" data-notice="${a}">${l}</button>`).join('')}</div></div>`;
  let html = '';
  if (auto.state === 'paused') {
    html = box('⏸️', '<b>La copia automática está en pausa.</b> El navegador necesita que vuelvas a darle permiso para escribir en el archivo.', [['resume', 'Reanudar', 'btn-primary']]);
  } else if (auto.state === 'error') {
    html = box('⚠️', `<b>No se pudo escribir la copia automática.</b> ${esc((META.auto && META.auto.error) || '')}`, [['data', 'Revisar', 'btn-primary']]);
  } else if (backupOverdue()) {
    const msg = META.lastBackupAt
      ? `<b>Tu última copia de seguridad fue hace ${backupAgeDays()} días.</b>`
      : '<b>Aún no has hecho ninguna copia de seguridad.</b>';
    html = box('💾', `${msg} Si se borran los datos del navegador, perderías tus movimientos.`, [['snooze', 'Más tarde'], ['backup', 'Hacer copia', 'btn-primary']]);
  }
  el.innerHTML = html;
  el.hidden = !html;
}

export const upTitle = (i) => (i.kind === 'card' ? `Cargo de ${i.account.name}` : i.t.type === 'transfer'
  ? (i.t.note || `${accName(S, i.t.accountId)} → ${accName(S, i.t.toAccountId)}`)
  : (i.t.note || txParts(i.t).map((p) => getCategory(S, p.categoryId).name).join(' + ')));

export function renderUpcomingCard() {
  const el = $('#upcoming');
  if (!el) return;
  const week = upcoming(S, 7, S.view.account);
  const live = week.items.filter((i) => !i.skipped);
  if (!live.length) {
    const later = upcoming(S, 30, S.view.account).items.filter((i) => !i.skipped);
    if (!later.length) { el.hidden = true; return; }
    const n = later[0];
    el.hidden = false;
    el.innerHTML = `<button class="up-head" data-up-all><span><b>Próximos movimientos</b><span class="s">Nada en los próximos 7 días · el siguiente, ${esc(dayLabel(n.date).toLowerCase())}: ${esc(upTitle(n))}</span></span>${icon('chevR')}</button>`;
    return;
  }
  el.hidden = false;
  const parts = [];
  if (week.out > 0.004) parts.push(`salen <b class="expense">${fmt(week.out, week.cur)}</b>`);
  if (week.in > 0.004) parts.push(`entran <b class="income">${fmt(week.in, week.cur)}</b>`);
  if (week.cards > 0.004) parts.push(`cargo de tarjeta <b>${fmt(week.cards, week.cur)}</b>`);
  const summary = parts.length ? parts.join(' · ') : `${live.length} movimiento(s) programado(s)`;
  el.innerHTML = `<button class="up-head" data-up-all><span><b>Próximos 7 días</b><span class="s up-sum">${summary}</span></span><span class="link-txt">Ver todo ${icon('chevR')}</span></button>
    <div class="day-items">${live.slice(0, 3).map((i) => upRow(i, false)).join('')}</div>`;
}

// Fila de un movimiento previsto; con `toggles` muestra el interruptor para omitirlo una vez.
export function upRow(i, toggles) {
  let ico;
  if (i.kind === 'card') ico = '<span class="cat-ico" style="--c:#7b8794">💳</span>';
  else if (i.t.type === 'transfer') ico = TRANSFER_ICO;
  else ico = catIcon(getCategory(S, txParts(i.t)[0].categoryId));
  let sub;
  if (i.kind === 'card') sub = `${i.overdue ? 'Vencido · ' : ''}Estimado · saldo al cierre del ${shortDate(creditInfo(S, i.account).lastClose)}`;
  else if (i.kind === 'rule') sub = `${FREQ[i.rule.freq]} · ${accName(S, i.t.accountId)}${i.skipped ? ' · se omitirá esta vez' : ''}`;
  else sub = `Programado · ${accName(S, i.t.accountId)}`;
  let amt;
  if (i.kind === 'card') amt = `<span class="amt neutral">${fmt(i.amount, i.account.currency)}</span>`;
  else if (i.t.type === 'transfer' && Math.abs(i.value) < 0.005) amt = `<span class="amt neutral">${fmt(i.t.amount, accCur(S, i.t.accountId))}</span>`;
  else if (i.t.type === 'transfer') amt = `<span class="amt ${signCls(i.value)}">${i.value < 0 ? '−' : '+'}${fmt(Math.abs(i.value), viewCurrency(S, S.view))}</span>`;
  else amt = `<span class="amt ${signCls(i.value)}">${i.t.type === 'expense' ? '−' : '+'}${fmt(i.t.amount, accCur(S, i.t.accountId))}</span>`;
  const when = toggles ? '' : `${esc(dayLabel(i.date))} · `;
  const attrs = i.kind === 'tx' ? `data-tx="${i.tx.id}"` : i.kind === 'card' ? `data-acc-edit="${i.account.id}"` : `data-rule="${i.rule.id}" data-date="${i.date}"`;
  const body = `${ico}<span class="tx-main"><span class="tx-title">${esc(upTitle(i))}${i.kind === 'rule' ? ' <span class="rec">↻</span>' : ''}</span><span class="tx-sub">${when}${esc(sub)}</span></span>${amt}`;
  if (toggles && i.kind === 'rule') {
    return `<div class="tx-row up-row${i.skipped ? ' skipped' : ''}">${body}
      <input type="checkbox" class="switch" data-skip="${i.rule.id}" data-date="${i.date}" ${i.skipped ? '' : 'checked'} aria-label="${i.skipped ? 'Volver a apuntar' : 'Omitir'} ${esc(upTitle(i))} del ${esc(shortDate(i.date))}" title="${i.skipped ? 'Omitido esta vez' : 'Se apuntará'}"></div>`;
  }
  return `<button class="tx-row up-row${i.skipped ? ' skipped' : ''}" ${attrs}>${body}</button>`;
}

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------
const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
export function applyTheme() {
  if (!S) return;
  const t = S.settings.theme;
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && darkQuery && darkQuery.matches);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0c3b37' : '#0f766e');
}
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);
