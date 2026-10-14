// Importar extractos del banco (CSV) con mapeo de columnas y reglas de categorización.
import { esc, uid } from '../core/util.js';
import { fmt, shortDate } from '../core/format.js';
import { getCategory, sortedCats } from '../core/ledger.js';
import {
  buildRows, decodeBytes, detectDelimiter, detectHeaderRow, guessMapping, headerSignature, parseCSV, prepareImport,
} from '../core/csv.js';
import { matchRule, suggestKeyword } from '../core/rules.js';
import { $, $$, catIcon, closeSheet, confirmDialog, icon, openSheet, shake, toast } from './dom.js';
import { S, save } from './store.js';
import { refreshAll } from './screen.js';

const DELIMS = { ';': 'punto y coma', ',': 'coma', '\t': 'tabulador', '|': 'barra vertical' };

export function openCsvImport() {
  const sh = openSheet({ title: 'Importar del banco', cls: 'sheet-tall sheet-wide' });
  const st = {
    step: 'file', fileName: '', delim: ';', rows: [], map: null, profileUsed: false,
    accountId: S.view.account !== 'all' ? S.view.account : (S.settings.lastAccount || S.accounts[0].id),
    prepared: [], defExp: (sortedCats(S, 'expense')[0] || {}).id || '', defInc: (sortedCats(S, 'income')[0] || {}).id || '',
  };
  const accOptions = (sel) => S.accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`).join('');
  const catOptions = (type, sel, empty) => `${empty ? `<option value="">${esc(empty)}</option>` : ''}${sortedCats(S, type).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}`;
  const header = () => (st.map.headerRow >= 0 ? st.rows[st.map.headerRow] : []);
  const colName = (i) => { const h = header()[i]; return h ? `${i + 1}. ${h}` : `Columna ${i + 1}`; };
  const ncols = () => Math.max(...st.rows.slice(0, 60).map((r) => r.length), 1);
  const colOptions = (sel, allowNone) => `${allowNone ? '<option value="-1">— Ninguna —</option>' : ''}${Array.from({ length: ncols() }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(colName(i))}</option>`).join('')}`;

  // Paso 1: elegir archivo y cuenta.
  const drawFile = () => {
    sh.body.innerHTML = `
      <ol class="steps"><li class="on">Archivo</li><li>Columnas</li><li>Revisar</li></ol>
      <p>Descarga desde la web o la app de tu banco los movimientos en formato <b>CSV</b> (a veces aparece como «Exportar a Excel (CSV)» o «Descargar movimientos»). Después elígelo aquí.</p>
      <label class="field"><span>¿De qué cuenta es el extracto?</span><select data-acc>${accOptions(st.accountId)}</select></label>
      <button class="btn btn-primary btn-block" data-pick>${icon('inbox')} Elegir archivo CSV</button>
      <input type="file" accept=".csv,text/csv,text/plain" hidden data-file>
      <ul class="muted small hints">
        <li>Se reconocen el separador, la codificación (también la de Excel en Windows) y el formato de fechas e importes.</li>
        <li>Nada se importa hasta que revises los movimientos en el último paso. Los que ya estén en la app se marcan como duplicados.</li>
        <li>La próxima vez que importes un archivo del mismo banco, se recordarán las columnas.</li>
        <li>¿Tu banco solo da Excel (.xlsx)? Ábrelo en Excel o Google Sheets y guárdalo como CSV.</li>
      </ul>`;
  };

  // Paso 2: qué columna es cada cosa, con una vista previa del resultado.
  const drawMap = () => {
    const m = st.map;
    const data = st.rows.slice(m.headerRow + 1, m.headerRow + 4);
    const preview = buildRows(st.rows.slice(0, m.headerRow + 1 + 5), m).slice(0, 5);
    sh.body.innerHTML = `
      <ol class="steps"><li class="done">Archivo</li><li class="on">Columnas</li><li>Revisar</li></ol>
      <p class="muted small"><b>${esc(st.fileName)}</b> · ${st.rows.length} filas · separador ${esc(DELIMS[st.delim] || st.delim)}${st.profileUsed ? ' · <span class="pill">Columnas recordadas de la última vez</span>' : ''}</p>
      <div class="table-scroll"><table class="raw"><tbody>
        ${m.headerRow >= 0 ? `<tr class="hdr">${header().map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}
        ${data.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="map-grid">
        <label class="field"><span>Fila de títulos</span><select data-m="headerRow"><option value="-1" ${m.headerRow < 0 ? 'selected' : ''}>No hay (todo son datos)</option>
          ${st.rows.slice(0, 15).map((r, i) => `<option value="${i}" ${i === m.headerRow ? 'selected' : ''}>Fila ${i + 1}: ${esc(r.slice(0, 3).join(' · ').slice(0, 40))}</option>`).join('')}</select></label>
        <label class="field"><span>Fecha</span><select data-m="dateCol">${colOptions(m.dateCol)}</select></label>
        <label class="field"><span>Formato de fecha</span><select data-m="dateFormat">
          ${[['dmy', 'día/mes/año (14/10/2026)'], ['mdy', 'mes/día/año (10/14/2026)'], ['ymd', 'año-mes-día (2026-10-14)']].map(([k, l]) => `<option value="${k}" ${k === m.dateFormat ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Concepto</span><select data-m="descCol">${colOptions(m.descCol)}</select></label>
        <label class="field"><span>Importe</span><select data-m="amountMode">
          <option value="single" ${m.amountMode === 'single' ? 'selected' : ''}>Una columna con signo (− = gasto)</option>
          <option value="split" ${m.amountMode === 'split' ? 'selected' : ''}>Dos columnas: cargos y abonos</option></select></label>
        ${m.amountMode === 'single'
          ? `<label class="field"><span>Columna del importe</span><select data-m="amountCol">${colOptions(m.amountCol)}</select></label>`
          : `<label class="field"><span>Columna de cargos (gastos)</span><select data-m="debitCol">${colOptions(m.debitCol, true)}</select></label>
             <label class="field"><span>Columna de abonos (ingresos)</span><select data-m="creditCol">${colOptions(m.creditCol, true)}</select></label>`}
        <label class="field"><span>Decimales</span><select data-m="decimal">
          <option value="," ${m.decimal === ',' ? 'selected' : ''}>Coma (1.234,56)</option><option value="." ${m.decimal === '.' ? 'selected' : ''}>Punto (1,234.56)</option></select></label>
      </div>
      <label class="switch-row"><span><b>Invertir el signo</b><small>Actívalo si tu banco pone los gastos en positivo.</small></span><input type="checkbox" class="switch" data-m="invert" ${m.invert ? 'checked' : ''}></label>
      <h4 class="sub-h">Así se leerán</h4>
      <div class="list">${preview.map((r) => `<div class="list-row"><span class="grow"><span class="t">${esc(r.desc || '(sin concepto)')}</span>
        <span class="s">${r.error ? `<span class="expense">⚠ ${esc(r.error)}</span>` : esc(shortDate(r.date))}</span></span>
        ${isFinite(r.amount) ? `<span class="amt ${r.amount < 0 ? 'expense' : 'income'}">${r.amount < 0 ? '−' : '+'}${fmt(Math.abs(r.amount))}</span>` : ''}</div>`).join('') || '<p class="muted">No hay filas de datos.</p>'}</div>
      <div class="form-actions"><button class="btn" data-back-file>Otro archivo</button><span class="grow"></span><button class="btn btn-primary" data-to-review>Revisar movimientos ${icon('chevR')}</button></div>`;
  };

  // Recalcula la categoría de las filas que no tocaste a mano (tras crear una regla).
  const reapplyRules = () => {
    for (const r of st.prepared) {
      if (r.error || r.manual) continue;
      const rule = matchRule(S.rules, r.desc, r.type);
      r.ruleId = rule ? rule.id : null;
      r.categoryId = rule ? rule.categoryId : null;
    }
  };

  // Paso 3: revisar, categorizar y elegir qué importar.
  const drawReview = () => {
    const rows = st.prepared;
    const ok = rows.filter((r) => !r.error);
    const sel = ok.filter((r) => r.include);
    const exact = ok.filter((r) => r.dup === 'exact').length, likely = ok.filter((r) => r.dup === 'likely').length;
    const byRule = ok.filter((r) => r.ruleId && !r.manual).length;
    const noCat = ok.filter((r) => !r.categoryId).length;
    const errs = rows.length - ok.length;
    const chip = (cls, text) => `<span class="badge ${cls}">${text}</span>`;
    sh.body.innerHTML = `
      <ol class="steps"><li class="done">Archivo</li><li class="done">Columnas</li><li class="on">Revisar</li></ol>
      <div class="mini-stats">
        <div class="mini-stat"><span>Leídos</span><b>${ok.length}</b></div>
        <div class="mini-stat"><span>Por reglas</span><b>${byRule}</b></div>
        <div class="mini-stat"><span>Sin regla</span><b>${noCat}</b></div>
        <div class="mini-stat"><span>Duplicados</span><b>${exact + likely}</b></div>
      </div>
      ${errs ? `<p class="tip mt">⚠ ${errs} fila(s) no se pudieron leer (fecha o importe no válidos, o importe cero) y no se importarán.</p>` : ''}
      <div class="row2 mt">
        <label class="field"><span>Gastos sin regla →</span><select data-def="exp">${catOptions('expense', st.defExp)}</select></label>
        <label class="field"><span>Ingresos sin regla →</span><select data-def="inc">${catOptions('income', st.defInc)}</select></label>
      </div>
      <p class="muted small">Cambia la categoría de una fila para corregirla. Con ${icon('wand')} creas una regla («si el concepto contiene MERCADONA → Supermercado») que se aplica a esta importación y a las siguientes. Los duplicados vienen desmarcados.</p>
      <div class="imp-toolbar"><button class="btn sm" data-all="1">Marcar todos</button><button class="btn sm" data-all="0">Desmarcar todos</button></div>
      <div class="imp-list">${rows.map((r, i) => {
        if (r.error) return `<div class="imp-row err"><input type="checkbox" disabled aria-label="Fila ${r.line} no se importa"><span class="grow"><span class="t">${esc(r.desc || '(sin concepto)')}</span><span class="s">Fila ${r.line} · ${esc(r.error)}</span></span></div>`;
        const badges = [r.dup === 'exact' ? chip('dup', 'Ya importado') : r.dup === 'likely' ? chip('dup', 'Posible duplicado') : '',
          r.ruleId && !r.manual ? chip('rule', 'Regla') : !r.categoryId ? chip('none', 'Sin regla') : ''].join('');
        return `<div class="imp-row${r.include ? '' : ' off'}">
          <input type="checkbox" data-inc="${i}" ${r.include ? 'checked' : ''} aria-label="Importar ${esc(r.desc)}">
          <span class="grow"><span class="t">${esc(r.desc || '(sin concepto)')}</span><span class="s">${esc(shortDate(r.date))} ${badges}</span></span>
          <span class="amt ${r.type}">${r.type === 'expense' ? '−' : '+'}${fmt(r.abs)}</span>
          <select data-cat="${i}" aria-label="Categoría">${catOptions(r.type, r.categoryId, `Por defecto: ${getCategory(S, r.type === 'expense' ? st.defExp : st.defInc).name}`)}</select>
          <button class="icon-btn sm" data-rule="${i}" title="Crear una regla a partir de este concepto" aria-label="Crear regla desde ${esc(r.desc)}">${icon('wand')}</button>
        </div>`;
      }).join('')}</div>
      <div class="form-actions sticky-actions"><button class="btn" data-back-map>${icon('chevL')} Columnas</button><span class="grow"></span>
        <button class="btn btn-primary" data-import ${sel.length ? '' : 'disabled'}>Importar ${sel.length} movimiento(s)</button></div>`;
  };

  const draw = () => (st.step === 'file' ? drawFile() : st.step === 'map' ? drawMap() : drawReview());
  sh.refresh = () => { if (st.step === 'review') { reapplyRules(); drawReview(); } };
  draw();

  const loadFile = async (file) => {
    let text;
    try { text = decodeBytes(new Uint8Array(await file.arrayBuffer())); } catch (e) { toast('No se pudo leer el archivo'); return; }
    st.fileName = file.name;
    st.delim = detectDelimiter(text);
    st.rows = parseCSV(text, st.delim);
    if (st.rows.length < 1) { toast('El archivo está vacío'); return; }
    const headerRow = detectHeaderRow(st.rows);
    const hdr = headerRow >= 0 ? st.rows[headerRow] : [];
    const profile = hdr.length ? (S.settings.csvProfiles || {})[headerSignature(hdr)] : null;
    if (profile && profile.map) {
      st.map = { ...profile.map, headerRow };
      if (profile.accountId && S.accounts.some((a) => a.id === profile.accountId) && st.accountId === S.accounts[0].id) st.accountId = profile.accountId;
      st.profileUsed = true;
    } else {
      st.map = { ...guessMapping(hdr, st.rows.slice(headerRow + 1)), headerRow };
      st.profileUsed = false;
    }
    st.step = 'map';
    draw();
  };

  const toReview = () => {
    const m = st.map;
    const okCols = m.dateCol >= 0 && m.descCol >= 0 && (m.amountMode === 'single' ? m.amountCol >= 0 : m.debitCol >= 0 || m.creditCol >= 0);
    if (!okCols) { toast('Indica las columnas de fecha, concepto e importe'); return; }
    st.prepared = prepareImport(S, buildRows(st.rows, m), st.accountId);
    if (!st.prepared.length) { toast('No hay filas de datos que importar'); return; }
    st.step = 'review';
    draw();
  };

  const doImport = async () => {
    const sel = st.prepared.filter((r) => r.include && !r.error);
    if (!sel.length) return;
    if ((sel.some((r) => r.type === 'expense' && !r.categoryId) && !st.defExp) || (sel.some((r) => r.type === 'income' && !r.categoryId) && !st.defInc)) {
      toast('Crea al menos una categoría de cada tipo antes de importar');
      return;
    }
    const likely = sel.filter((r) => r.dup).length;
    if (likely && !(await confirmDialog(`Vas a importar ${likely} movimiento(s) marcados como duplicados. ¿Seguro?`, { ok: 'Importar igualmente' }))) return;
    const batch = uid();
    const now = Date.now();
    for (const r of sel) {
      S.transactions.push({
        id: uid(), type: r.type, amount: r.abs, accountId: st.accountId,
        categoryId: r.categoryId || (r.type === 'expense' ? st.defExp : st.defInc),
        toAccountId: null, toAmount: null, date: r.date, note: r.desc.slice(0, 140), tags: [],
        createdAt: now, importRef: r.ref, importBatch: batch,
      });
    }
    const hdr = header();
    if (hdr.length) {
      const { headerRow, ...map } = st.map;
      S.settings.csvProfiles = { ...(S.settings.csvProfiles || {}), [headerSignature(hdr)]: { map, accountId: st.accountId } };
    }
    save();
    closeSheet();
    refreshAll();
    toast(`${sel.length} movimiento(s) importados`, {
      label: 'Deshacer',
      run: () => { S.transactions = S.transactions.filter((t) => t.importBatch !== batch); save(); refreshAll(); toast('Importación deshecha'); },
    }, 8000);
  };

  sh.body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-pick]')) { $('[data-file]', sh.body).click(); return; }
    if (e.target.closest('[data-back-file]')) { st.step = 'file'; draw(); return; }
    if (e.target.closest('[data-back-map]')) { st.step = 'map'; draw(); return; }
    if (e.target.closest('[data-to-review]')) { toReview(); return; }
    if (e.target.closest('[data-import]')) { doImport(); return; }
    const all = e.target.closest('[data-all]');
    if (all) { st.prepared.forEach((r) => { if (!r.error) r.include = all.dataset.all === '1'; }); drawReview(); return; }
    const rb = e.target.closest('[data-rule]');
    if (rb) {
      const r = st.prepared[+rb.dataset.rule];
      const catId = r.categoryId || (r.type === 'expense' ? st.defExp : st.defInc);
      openRuleForm(null, { pattern: suggestKeyword(r.desc), categoryId: catId, type: r.type, sample: r.desc });
    }
  });
  sh.body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-file]')) { const f = t.files && t.files[0]; t.value = ''; if (f) loadFile(f); return; }
    if (t.matches('[data-acc]')) { st.accountId = t.value; return; }
    if (t.dataset.m) {
      const k = t.dataset.m;
      st.map[k] = t.type === 'checkbox' ? t.checked : ['dateFormat', 'decimal', 'amountMode'].includes(k) ? t.value : Number(t.value);
      drawMap();
      return;
    }
    if (t.dataset.def) { if (t.dataset.def === 'exp') st.defExp = t.value; else st.defInc = t.value; drawReview(); return; }
    if (t.dataset.inc != null) { st.prepared[+t.dataset.inc].include = t.checked; t.closest('.imp-row').classList.toggle('off', !t.checked); const n = st.prepared.filter((r) => r.include && !r.error).length; const b = $('[data-import]', sh.body); b.textContent = `Importar ${n} movimiento(s)`; b.disabled = !n; return; }
    if (t.dataset.cat != null) { const r = st.prepared[+t.dataset.cat]; r.categoryId = t.value || null; r.manual = true; r.ruleId = null; }
  });
}

// ---------------------------------------------------------------------------
// Reglas de categorización
// ---------------------------------------------------------------------------
export function openRules() {
  const sh = openSheet({ title: 'Reglas de categorización', actions: `<button class="icon-btn" data-add aria-label="Nueva regla">${icon('plus')}</button>` });
  const draw = () => {
    const rules = S.rules || [];
    sh.body.innerHTML = `
      <p class="muted small">Si el concepto (o la nota) de un movimiento contiene el texto de una regla, se le asigna su categoría. Se usan al importar del banco y al escribir la nota de un movimiento nuevo. Gana la primera de la lista que encaja: ordénalas con las flechas. No distinguen mayúsculas ni tildes.</p>
      ${rules.length ? `<div class="list">${rules.map((r, i) => {
        const c = getCategory(S, r.categoryId);
        return `<div class="list-row"><button class="grow-btn" data-edit="${r.id}">${catIcon(c)}<span class="grow"><span class="t">«${esc(r.pattern)}»</span><span class="s">→ ${esc(c.name)} · ${r.type === 'income' ? 'ingresos' : 'gastos'}</span></span></button>
          <button class="icon-btn sm" data-move="-1" data-id="${r.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icon('up')}</button>
          <button class="icon-btn sm" data-move="1" data-id="${r.id}" ${i === rules.length - 1 ? 'disabled' : ''} aria-label="Bajar">${icon('down')}</button></div>`;
      }).join('')}</div>`
        : `<div class="empty"><div class="big">🪄</div><p><b>Aún no hay reglas</b></p><p>Créalas aquí o, más cómodo, desde la revisión al importar un CSV del banco.</p></div>`}
      <button class="btn btn-block" data-add>${icon('plus')} Nueva regla</button>`;
  };
  sh.refresh = draw;
  draw();
  sh.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) { openRuleForm(null, {}); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openRuleForm(S.rules.find((r) => r.id === ed.dataset.edit)); return; }
    const mv = e.target.closest('[data-move]');
    if (mv && !mv.disabled) {
      const i = S.rules.findIndex((r) => r.id === mv.dataset.id);
      const j = i + Number(mv.dataset.move);
      [S.rules[i], S.rules[j]] = [S.rules[j], S.rules[i]];
      save();
      draw();
    }
  });
}

// Formulario de regla. `init` puede traer { pattern, categoryId, type, sample } desde la importación.
export function openRuleForm(rule, init = {}) {
  const isNew = !rule;
  const r = rule ? { ...rule } : { id: uid(), pattern: init.pattern || '', categoryId: init.categoryId || null, type: init.type || 'expense' };
  const sh = openSheet({ title: isNew ? 'Nueva regla' : 'Editar regla' });
  const countText = () => {
    if (!r.pattern.trim()) return '';
    const n = S.transactions.filter((t) => t.type === r.type && matchRule([{ pattern: r.pattern }], t.note, t.type)).length;
    return `Ahora encaja con ${n} movimiento(s) que ya tienes.`;
  };
  const draw = () => {
    sh.body.innerHTML = `
      ${init.sample ? `<p class="muted small">Concepto del banco: <b>${esc(init.sample)}</b></p>` : ''}
      <label class="field"><span>Si el concepto contiene…</span><input data-pattern maxlength="80" value="${esc(r.pattern)}" placeholder="p. ej. MERCADONA">
        <small class="muted">Usa una palabra que identifique al comercio, sin números de tarjeta ni fechas. <span data-count>${countText()}</span></small></label>
      <div class="field"><span>Tipo</span><div class="seg full" data-typeseg><button data-v="expense" class="${r.type === 'expense' ? 'active' : ''}">Gasto</button><button data-v="income" class="${r.type === 'income' ? 'active' : ''}">Ingreso</button></div></div>
      <div class="field"><span>…ponerlo en la categoría</span><div class="cat-grid static">${sortedCats(S, r.type).map((c) => `<button class="cat-pick${c.id === r.categoryId ? ' sel' : ''}" data-cat="${c.id}">${catIcon(c)}<span>${esc(c.name)}</span></button>`).join('')}</div></div>
      <div class="form-actions">${isNew ? '' : `<button class="btn btn-danger-ghost" data-del>${icon('trash')} Eliminar</button>`}<span class="grow"></span><button class="btn btn-primary" data-save>Guardar regla</button></div>`;
  };
  draw();
  sh.body.addEventListener('input', (e) => {
    if (!e.target.matches('[data-pattern]')) return;
    r.pattern = e.target.value;
    $('[data-count]', sh.body).textContent = countText();
  });
  sh.body.addEventListener('click', async (e) => {
    const ty = e.target.closest('[data-typeseg] [data-v]');
    if (ty) { r.pattern = $('[data-pattern]', sh.body).value; if (r.type !== ty.dataset.v) { r.type = ty.dataset.v; r.categoryId = null; } draw(); return; }
    const cp = e.target.closest('[data-cat]');
    if (cp) { r.pattern = $('[data-pattern]', sh.body).value; r.categoryId = cp.dataset.cat; $$('.cat-pick', sh.body).forEach((b) => b.classList.toggle('sel', b === cp)); return; }
    if (e.target.closest('[data-save]')) {
      r.pattern = $('[data-pattern]', sh.body).value.trim();
      if (!r.pattern) { shake($('[data-pattern]', sh.body)); toast('Escribe el texto a buscar'); return; }
      if (!r.categoryId) { toast('Elige una categoría'); return; }
      if (!Array.isArray(S.rules)) S.rules = [];
      if (isNew) S.rules.unshift(r); else Object.assign(rule, r); // las nuevas, primero: suelen ser más concretas
      save();
      closeSheet();
      refreshAll();
      toast(`Regla guardada: «${r.pattern}» → ${getCategory(S, r.categoryId).name}`);
      return;
    }
    if (e.target.closest('[data-del]')) {
      if (!(await confirmDialog(`¿Eliminar la regla «${rule.pattern}»? Los movimientos ya categorizados no cambian.`, { ok: 'Eliminar', danger: true }))) return;
      S.rules = S.rules.filter((x) => x.id !== rule.id);
      save();
      closeSheet();
      refreshAll();
    }
  });
}
