// Cuentas (tipos, patrimonio neto), selector de cuenta visible y monedas.
import { ACCOUNT_EMOJIS, ACCOUNT_KINDS, CURRENCIES, GROUPS, isDebt, kindOf } from '../core/constants.js';
import { dayOrNull, esc, parseNum, plain, plainRate, round2, uid } from '../core/util.js';
import { curName, fmt, signCls } from '../core/format.js';
import { accountBalance, netWorth, rateOf, totalBalance } from '../core/ledger.js';
import { $, $$, closeSheet, confirmDialog, icon, openSheet, shake, toast } from './dom.js';
import { S, save } from './store.js';
import { accountNote, kindLabel, refreshAll, render } from './screen.js';

export function currencyOptions(sel, exclude = []) {
  const list = CURRENCIES.includes(sel) ? CURRENCIES : [sel, ...CURRENCIES];
  return list.filter((c) => c === sel || !exclude.includes(c))
    .map((c) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c} · ${esc(curName(c))}</option>`).join('');
}

export function openAccountSwitch() {
  const sh = openSheet({ title: 'Ver cuenta' });
  const cur = S.view.account;
  const tb = totalBalance(S);
  sh.body.innerHTML = `<div class="list">
    <button class="list-row" data-acc="all"><span class="acc-ico">∑</span>
      <span class="grow"><span class="t">Todas las cuentas</span><span class="s">${S.accounts.length} cuenta(s)</span></span>
      <span class="amt ${signCls(tb)}">${fmt(tb)}</span>${cur === 'all' ? icon('check') : ''}</button>
    ${S.accounts.map((a) => {
      const b = accountBalance(S, a);
      const note = accountNote(a);
      return `<button class="list-row" data-acc="${a.id}"><span class="acc-ico">${esc(a.icon)}</span>
        <span class="grow"><span class="t">${esc(a.name)}</span><span class="s">${esc(kindLabel(a))}${note ? ' · ' + esc(note) : ''}</span></span>
        <span class="amt ${signCls(b)}">${fmt(b, a.currency)}</span>${cur === a.id ? icon('check') : ''}</button>`;
    }).join('')}
    </div>
    <button class="btn btn-block" data-manage>${icon('wallet')} Gestionar cuentas</button>`;
  sh.body.addEventListener('click', (e) => {
    const r = e.target.closest('[data-acc]');
    if (r) { S.view.account = r.dataset.acc; save(); closeSheet(); render(); return; }
    if (e.target.closest('[data-manage]')) closeSheet(openAccounts);
  });
}

export function openAccounts() {
  const sh = openSheet({ title: 'Cuentas', actions: `<button class="icon-btn" data-add aria-label="Nueva cuenta">${icon('plus')}</button>` });
  const draw = () => {
    const nw = netWorth(S);
    const stat = (label, v) => `<div class="mini-stat"><span>${label}</span><b class="${signCls(v)}">${fmt(v)}</b></div>`;
    const sections = Object.entries(GROUPS).map(([g, title]) => {
      const accs = S.accounts.filter((a) => ACCOUNT_KINDS[kindOf(a)].group === g);
      if (!accs.length) return '';
      return `<h4 class="sub-h">${title}</h4><div class="list">${accs.map((a) => {
        const b = accountBalance(S, a);
        const note = accountNote(a);
        return `<button class="list-row" data-id="${a.id}"><span class="acc-ico">${esc(a.icon)}</span>
          <span class="grow"><span class="t">${esc(a.name)}</span><span class="s">${esc(kindLabel(a))}${note ? ' · ' + esc(note) : ''}</span></span>
          <span class="amt ${signCls(b)}">${fmt(b, a.currency)}</span></button>`;
      }).join('')}</div>`;
    }).join('');
    sh.body.innerHTML = `<div class="total-card"><span>Patrimonio neto</span><strong class="${signCls(nw.total)}">${fmt(nw.total)}</strong>
        <div class="mini-stats">${stat('Liquidez', nw.liquid)}${stat('Ahorro', nw.savings)}${stat('Deudas', nw.debt)}</div></div>
      <p class="muted small">La liquidez es el dinero disponible (efectivo y cuentas); el patrimonio neto suma además el ahorro y resta las deudas.</p>
      ${sections}
      <button class="btn btn-block" data-add>${icon('plus')} Nueva cuenta</button>`;
  };
  sh.refresh = draw;
  draw();
  sh.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) { openAccountForm(null); return; }
    const r = e.target.closest('[data-id]');
    if (r) openAccountForm(S.accounts.find((a) => a.id === r.dataset.id));
  });
}

export function openAccountForm(acc) {
  const isNew = !acc;
  const a = acc ? { ...acc, kind: kindOf(acc) } : { id: uid(), name: '', icon: '🏦', kind: 'bank', currency: S.settings.currency, initial: 0, includeInTotal: true, limit: 0, closingDay: null, paymentDay: null };
  const sh = openSheet({ title: isNew ? 'Nueva cuenta' : 'Editar cuenta' });
  const base = S.settings.currency;
  const dayOpts = (sel) => `<option value="">—</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}`;
  // En las deudas el usuario escribe lo que debe (positivo) y se guarda como saldo negativo.
  const initialShown = isDebt(a) ? -(a.initial || 0) : a.initial || 0;
  sh.body.innerHTML = `
    <div class="field"><span>Tipo de cuenta</span><div class="kind-grid">${Object.entries(ACCOUNT_KINDS).map(([k, v]) => `<button data-kind="${k}" class="${k === a.kind ? 'sel' : ''}"><span>${v.icon}</span>${esc(v.label)}</button>`).join('')}</div></div>
    <label class="field"><span>Nombre</span><input data-name maxlength="40" value="${esc(a.name)}" placeholder="p. ej. Banco, Visa, Hipoteca…"></label>
    <div class="field"><span>Icono</span><div class="emoji-grid">${ACCOUNT_EMOJIS.map((e) => `<button data-emoji="${e}" class="${e === a.icon ? 'sel' : ''}">${e}</button>`).join('')}</div></div>
    <label class="field"><span>Moneda</span><select data-cur>${currencyOptions(a.currency)}</select></label>
    <div class="field rate-field"><span>Tipo de cambio</span>
      <div class="rate-line">1 <b data-curcode></b> = <input data-rate inputmode="decimal" placeholder="0,00"> ${esc(base)}</div></div>
    <label class="field"><span data-initial-label></span><input data-initial inputmode="decimal" value="${initialShown ? plain(initialShown) : ''}" placeholder="0"><small class="muted" data-initial-help></small></label>
    <div class="credit-only">
      <label class="field"><span>Límite de crédito (opcional)</span><input data-limit inputmode="decimal" value="${a.limit ? plain(a.limit) : ''}" placeholder="p. ej. 1500"></label>
      <div class="row2">
        <label class="field"><span>Día de cierre</span><select data-closeday>${dayOpts(a.closingDay)}</select></label>
        <label class="field"><span>Día de cargo</span><select data-payday>${dayOpts(a.paymentDay)}</select></label>
      </div>
      <p class="muted small">El <b>cierre</b> es el día en que el banco corta el extracto; el <b>cargo</b>, cuando te cobra lo gastado. Con ellos verás el gasto del ciclo y el próximo cargo en «Próximos movimientos».</p>
    </div>
    <label class="switch-row"><span><b>Incluir en el patrimonio y los totales</b><small>Desactívalo para cuentas que quieras seguir aparte.</small></span>
      <input type="checkbox" class="switch" data-incl ${a.includeInTotal !== false ? 'checked' : ''}></label>
    ${!isNew ? '<p class="muted small">Si cambias la moneda, los importes ya registrados no se convierten.</p>' : ''}
    <div class="form-actions">${isNew ? '' : `<button class="btn btn-danger-ghost" data-del>${icon('trash')} Eliminar</button>`}<span class="grow"></span><button class="btn btn-primary" data-save>Guardar</button></div>`;
  const syncKind = () => {
    const debt = isDebt(a);
    $('.credit-only', sh.body).hidden = a.kind !== 'credit';
    $('[data-initial-label]', sh.body).textContent = debt ? 'Deuda al empezar (lo que debías)' : 'Saldo inicial';
    $('[data-initial-help]', sh.body).textContent = debt
      ? (a.kind === 'loan' ? 'Escríbela en positivo. Cada transferencia a esta cuenta la reduce; los intereses se apuntan como gasto en ella.'
        : 'Escríbela en positivo. Los gastos con la tarjeta aumentan la deuda y la transferencia con la que la pagas la reduce.')
      : 'Lo que tenía la cuenta antes de empezar a apuntar movimientos.';
  };
  syncKind();
  const curSel = $('[data-cur]', sh.body);
  const syncRate = () => {
    const c = curSel.value;
    $('.rate-field', sh.body).hidden = c === base;
    $('[data-curcode]', sh.body).textContent = c;
    $('[data-rate]', sh.body).value = S.rates[c] ? plainRate(S.rates[c]) : '';
  };
  curSel.addEventListener('change', syncRate);
  syncRate();
  const pickEmoji = (em) => { a.icon = em; $$('[data-emoji]', sh.body).forEach((b) => b.classList.toggle('sel', b.dataset.emoji === em)); };
  sh.body.addEventListener('click', async (e) => {
    const kb = e.target.closest('[data-kind]');
    if (kb) {
      const prevIcon = ACCOUNT_KINDS[a.kind].icon;
      a.kind = kb.dataset.kind;
      $$('[data-kind]', sh.body).forEach((b) => b.classList.toggle('sel', b === kb));
      if (a.icon === prevIcon) pickEmoji(ACCOUNT_KINDS[a.kind].icon); // icono del tipo, salvo si elegiste otro
      syncKind();
      return;
    }
    const em = e.target.closest('[data-emoji]');
    if (em) { pickEmoji(em.dataset.emoji); return; }
    if (e.target.closest('[data-save]')) {
      a.name = $('[data-name]', sh.body).value.trim();
      if (!a.name) { shake($('[data-name]', sh.body)); toast('Escribe un nombre'); return; }
      a.currency = curSel.value;
      const shown = round2(parseNum($('[data-initial]', sh.body).value));
      a.initial = isDebt(a) ? -shown : shown;
      a.includeInTotal = $('[data-incl]', sh.body).checked;
      if (a.kind === 'credit') {
        a.limit = Math.max(0, round2(parseNum($('[data-limit]', sh.body).value)));
        a.closingDay = dayOrNull(Number($('[data-closeday]', sh.body).value));
        a.paymentDay = dayOrNull(Number($('[data-payday]', sh.body).value));
      } else { a.limit = 0; a.closingDay = null; a.paymentDay = null; }
      if (a.currency !== base) {
        const r = parseNum($('[data-rate]', sh.body).value);
        if (r > 0) S.rates[a.currency] = r;
        else { shake($('[data-rate]', sh.body)); toast('Indica el tipo de cambio'); return; }
      }
      if (isNew) S.accounts.push(a); else Object.assign(acc, a);
      save();
      closeSheet();
      refreshAll();
      toast(isNew ? 'Cuenta creada' : 'Cuenta guardada');
      return;
    }
    if (e.target.closest('[data-del]')) {
      if (S.accounts.length <= 1) { toast('Debe existir al menos una cuenta'); return; }
      const n = S.transactions.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id).length;
      const msg = n ? `Se eliminará «${acc.name}» y sus ${n} movimiento(s). Esta acción no se puede deshacer.` : `¿Eliminar la cuenta «${acc.name}»?`;
      if (!(await confirmDialog(msg, { ok: 'Eliminar', danger: true }))) return;
      S.transactions = S.transactions.filter((t) => t.accountId !== acc.id && t.toAccountId !== acc.id);
      S.recurring = S.recurring.filter((r) => r.template.accountId !== acc.id && r.template.toAccountId !== acc.id);
      S.accounts = S.accounts.filter((x) => x.id !== acc.id);
      if (S.view.account === acc.id) S.view.account = 'all';
      if (S.settings.lastAccount === acc.id) S.settings.lastAccount = null;
      save();
      closeSheet();
      refreshAll();
      toast('Cuenta eliminada');
    }
  });
}

export function openCurrencies() {
  const sh = openSheet({ title: 'Monedas' });
  const draw = () => {
    const base = S.settings.currency;
    const used = new Set(S.accounts.map((a) => a.currency));
    Object.keys(S.rates).forEach((c) => used.add(c));
    used.delete(base);
    sh.body.innerHTML = `
      <label class="field"><span>Moneda principal</span><select data-base>${currencyOptions(base)}</select></label>
      <p class="muted small">Los totales, el gráfico y el presupuesto se muestran en la moneda principal. Los tipos de cambio se introducen a mano para que la app funcione sin conexión.</p>
      <h4 class="sub-h">Tipos de cambio</h4>
      ${used.size ? `<div class="list">${[...used].map((c) => `<div class="list-row">
          <span class="cur-code">${c}</span><span class="grow s">${esc(curName(c))}</span>
          <span class="rate-line">1 ${c} = <input class="rate-input" data-rate="${c}" inputmode="decimal" value="${S.rates[c] ? plainRate(S.rates[c]) : ''}" placeholder="1"> ${base}</span>
          ${S.accounts.some((a) => a.currency === c) ? '' : `<button class="icon-btn sm" data-rm="${c}" aria-label="Quitar ${c}">${icon('trash')}</button>`}
        </div>`).join('')}</div>` : `<p class="muted">Todas tus cuentas usan ${base}.</p>`}
      <div class="row2 align-end mt"><label class="field"><span>Añadir moneda</span><select data-addcur>${currencyOptions('USD', [base, ...used])}</select></label>
        <button class="btn" data-add>Añadir</button></div>`;
  };
  sh.refresh = draw;
  draw();
  sh.body.addEventListener('change', async (e) => {
    const rate = e.target.dataset.rate;
    if (rate) {
      const v = parseNum(e.target.value);
      if (v > 0) { S.rates[rate] = v; save(); render(); } else toast('El tipo de cambio debe ser mayor que cero');
      return;
    }
    if (e.target.matches('[data-base]')) {
      const nb = e.target.value, ob = S.settings.currency;
      if (!(await confirmDialog(`¿Usar ${nb} como moneda principal? Los tipos de cambio y el presupuesto se recalcularán.`))) { e.target.value = ob; return; }
      const r = rateOf(S, nb); // 1 nb = r ob
      const nr = {};
      for (const [c, v] of Object.entries(S.rates)) if (c !== nb) nr[c] = v / r;
      nr[ob] = 1 / r;
      S.rates = nr;
      S.settings.currency = nb;
      S.settings.budget = round2(S.settings.budget / r);
      S.categories.forEach((c) => { if (c.budget > 0) c.budget = round2(c.budget / r); });
      save();
      refreshAll();
      if (!(r > 0) || r === 1) toast('Revisa los tipos de cambio');
    }
  });
  sh.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) {
      const c = $('[data-addcur]', sh.body).value;
      if (!S.rates[c]) S.rates[c] = 1;
      save();
      draw();
      const inp = $(`[data-rate="${c}"]`, sh.body);
      if (inp) { inp.focus(); inp.select(); }
      return;
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) { delete S.rates[rm.dataset.rm]; save(); draw(); }
  });
}
