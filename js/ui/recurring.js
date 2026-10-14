// Movimientos recurrentes (pausar, omitir una vez) y próximos movimientos.
import { FREQ } from '../core/constants.js';
import { esc } from '../core/util.js';
import { dayLabel, fmt, fmtSigned, shortDate, signCls } from '../core/format.js';
import { accCur, accName, getAccount, getCategory, txParts } from '../core/ledger.js';
import { generateRecurring, nextOccurrence, resumeRule, toggleSkip, upcoming } from '../core/recurring.js';
import { catIcon, confirmDialog, icon, openSheet, toast, TRANSFER_ICO } from './dom.js';
import { S, save } from './store.js';
import { refreshAll, upRow } from './screen.js';
import { openTxSheet } from './tx-editor.js';
import { openAccountForm } from './accounts.js';

export function openRecurring() {
  const sh = openSheet({ title: 'Movimientos recurrentes' });
  const draw = () => {
    if (!S.recurring.length) {
      sh.body.innerHTML = `<div class="empty"><div class="big">🔁</div><p><b>Sin movimientos recurrentes</b></p>
        <p>Al crear un gasto, ingreso o transferencia, elige <b>Repetir</b> para que se apunte solo cada día, semana, mes o año.</p></div>`;
      return;
    }
    sh.body.innerHTML = `<div class="list">${S.recurring.map((r) => {
      const t = r.template;
      const isTr = t.type === 'transfer';
      const c = isTr ? null : getCategory(S, txParts(t)[0].categoryId);
      const title = t.note || (isTr ? `${accName(S, t.accountId)} → ${accName(S, t.toAccountId)}` : txParts(t).map((p) => getCategory(S, p.categoryId).name).join(' + '));
      const nx = nextOccurrence(r);
      let next = 'Detenida';
      if (r.active) {
        next = nx.date ? `Próximo: ${shortDate(nx.date)}` : 'Sin próximas fechas';
        if (nx.skipped.length) next += ` · se omite el ${nx.skipped.map((x) => shortDate(x)).join(', ')}`;
      }
      const skipBtn = !r.active ? '' : nx.skipped.length
        ? `<button class="btn sm" data-unskip="${r.id}" data-date="${nx.skipped[nx.skipped.length - 1]}" title="Volver a apuntar el ${esc(shortDate(nx.skipped[nx.skipped.length - 1]))}">Deshacer omisión</button>`
        : nx.date ? `<button class="btn sm" data-skipnext="${r.id}" data-date="${nx.date}" title="Omitir solo el del ${esc(shortDate(nx.date))}">${icon('skip')} Omitir el próximo</button>` : '';
      return `<div class="list-row rule-row${r.active ? '' : ' archived'}">${isTr ? TRANSFER_ICO : catIcon(c)}
        <span class="grow"><span class="t">${esc(title)}</span><span class="s">${FREQ[r.freq]} · ${esc(next)}</span></span>
        <span class="amt ${isTr ? 'neutral' : t.type}">${fmt(t.amount, accCur(S, t.accountId))}</span>
        <span class="rule-actions">${skipBtn}
        ${r.active ? `<button class="icon-btn sm" data-stop="${r.id}" aria-label="Detener" title="Detener">${icon('pause')}</button>`
          : `<button class="icon-btn sm" data-resume="${r.id}" aria-label="Reanudar" title="Reanudar">${icon('play')}</button>`}
        <button class="icon-btn sm" data-del="${r.id}" aria-label="Eliminar regla" title="Eliminar">${icon('trash')}</button></span></div>`;
    }).join('')}</div>
    <p class="muted small">«Omitir el próximo» salta solo esa fecha, como cuando desactivas una alarma un día: la repetición sigue para las siguientes. Puedes elegir otras fechas en <b>Próximos movimientos</b>.</p>
    <p class="muted small">Los movimientos ya creados se conservan aunque detengas o elimines la regla.</p>`;
  };
  sh.refresh = draw;
  draw();
  sh.body.addEventListener('click', async (e) => {
    const sk = e.target.closest('[data-skipnext],[data-unskip]');
    if (sk) {
      const r = S.recurring.find((x) => x.id === (sk.dataset.skipnext || sk.dataset.unskip));
      if (!r) return;
      const skipped = toggleSkip(r, sk.dataset.date);
      save();
      refreshAll();
      toast(skipped ? `Se omitirá el del ${shortDate(sk.dataset.date)}; la repetición sigue activa` : 'Omisión deshecha');
      return;
    }
    const b = e.target.closest('[data-stop],[data-resume],[data-del]');
    if (!b) return;
    const r = S.recurring.find((x) => x.id === (b.dataset.stop || b.dataset.resume || b.dataset.del));
    if (!r) return;
    if (b.dataset.stop) r.active = false;
    else if (b.dataset.resume) {
      resumeRule(r);
      generateRecurring(S);
    } else {
      if (!(await confirmDialog('¿Eliminar esta regla? Los movimientos ya creados se conservan.', { ok: 'Eliminar', danger: true }))) return;
      S.recurring = S.recurring.filter((x) => x !== r);
    }
    save();
    refreshAll();
  });
}

export function openUpcoming() {
  let days = 30;
  const sh = openSheet({ title: 'Próximos movimientos', cls: 'sheet-tall' });
  const draw = () => {
    const u = upcoming(S, days, S.view.account);
    const acc = getAccount(S, S.view.account);
    let html = '', day = null, rows = [], net = 0;
    const flush = () => {
      if (!day) return;
      html += `<section class="list-sec"><h3><span>${esc(dayLabel(day))}</span><span class="amt ${signCls(net)}">${Math.abs(net) > 0.004 ? fmtSigned(net, u.cur) : ''}</span></h3><div class="day-items">${rows.join('')}</div></section>`;
    };
    for (const i of u.items) {
      if (i.date !== day) { flush(); day = i.date; rows = []; net = 0; }
      rows.push(upRow(i, true));
      if (!i.skipped) net += i.value;
    }
    flush();
    sh.body.innerHTML = `
      <div class="seg full" role="tablist" aria-label="Horizonte">${[7, 30, 90].map((n) => `<button data-days="${n}" role="tab" class="${n === days ? 'active' : ''}" aria-selected="${n === days}">${n} días</button>`).join('')}</div>
      <div class="mini-stats up-stats">
        <div class="mini-stat"><span>Salen</span><b class="expense">${fmt(u.out, u.cur)}</b></div>
        <div class="mini-stat"><span>Entran</span><b class="income">${fmt(u.in, u.cur)}</b></div>
        ${u.cards > 0.004 ? `<div class="mini-stat"><span>Cargos de tarjeta</span><b>${fmt(u.cards, u.cur)}</b></div>` : ''}
      </div>
      <p class="muted small">${acc ? `Solo la cuenta ${esc(acc.name)}. ` : ''}Incluye los recurrentes, lo que apuntaste con fecha futura y el cargo estimado de tus tarjetas de crédito. Apaga el interruptor de un recurrente para <b>omitirlo solo esa vez</b>: las siguientes repeticiones siguen igual.</p>
      ${html || `<div class="empty"><div class="big">📅</div><p><b>Nada previsto en los próximos ${days} días</b></p><p>Crea movimientos recurrentes (opción «Repetir» al añadir uno) o apunta movimientos con fecha futura.</p></div>`}`;
  };
  sh.refresh = draw;
  draw();
  sh.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-days]');
    if (b) { days = Number(b.dataset.days); draw(); return; }
    const t = e.target.closest('[data-tx]');
    if (t) { const tx = S.transactions.find((x) => x.id === t.dataset.tx); if (tx) openTxSheet({ tx }); return; }
    const a = e.target.closest('[data-acc-edit]');
    if (a) { const acc = getAccount(S, a.dataset.accEdit); if (acc) openAccountForm(acc); }
  });
  sh.body.addEventListener('change', (e) => {
    const id = e.target.dataset.skip;
    if (!id) return;
    const r = S.recurring.find((x) => x.id === id);
    if (!r) return;
    const skipped = toggleSkip(r, e.target.dataset.date);
    save();
    refreshAll();
    toast(skipped ? `Omitido el del ${shortDate(e.target.dataset.date)}; la repetición sigue activa` : `Se volverá a apuntar el del ${shortDate(e.target.dataset.date)}`);
  });
}
