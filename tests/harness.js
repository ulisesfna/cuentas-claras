// Mini-marco de pruebas sin dependencias: funciona en el navegador (tests/index.html) y en Node (tests/run.mjs).
const tests = [];
let suite = '';

export function describe(name, fn) { const prev = suite; suite = name; fn(); suite = prev; }
export function test(name, fn) { tests.push({ suite, name, fn }); }

class AssertionError extends Error {}
const show = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
function deepEq(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEq(a[k], b[k]));
}
export const assert = {
  ok(v, msg = 'se esperaba un valor verdadero') { if (!v) throw new AssertionError(`${msg} (obtenido: ${show(v)})`); },
  equal(a, b, msg = '') { if (!Object.is(a, b)) throw new AssertionError(`${msg ? msg + ': ' : ''}esperado ${show(b)}, obtenido ${show(a)}`); },
  deepEqual(a, b, msg = '') { if (!deepEq(a, b)) throw new AssertionError(`${msg ? msg + ': ' : ''}esperado ${show(b)}, obtenido ${show(a)}`); },
  close(a, b, eps = 0.005, msg = '') { if (!(Math.abs(a - b) <= eps)) throw new AssertionError(`${msg ? msg + ': ' : ''}esperado ≈${b}, obtenido ${a}`); },
  throws(fn, type, msg = 'se esperaba una excepción') {
    try { fn(); } catch (e) { if (type && !(e instanceof type)) throw new AssertionError(`excepción de otro tipo: ${e}`); return; }
    throw new AssertionError(msg);
  },
  async rejects(fn, msg = 'se esperaba un error') {
    try { await fn(); } catch (e) { return; }
    throw new AssertionError(msg);
  },
};

export async function run() {
  const results = [];
  for (const t of tests) {
    const t0 = Date.now();
    try { await t.fn(); results.push({ ...t, ok: true, ms: Date.now() - t0 }); }
    catch (e) { results.push({ ...t, ok: false, error: e && e.message ? e.message : String(e), ms: Date.now() - t0 }); }
  }
  return results;
}
