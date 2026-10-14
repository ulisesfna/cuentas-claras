// Reglas de categorización: «si el concepto contiene MERCADONA → Supermercado».
// Se comparan sin mayúsculas ni tildes; gana la primera regla de la lista que encaja.
import { norm } from './util.js';

const squash = (s) => norm(s).replace(/\s+/g, ' ').trim();

// `type` es 'expense' o 'income': una regla solo aplica a movimientos del tipo de su categoría.
export function matchRule(rules, text, type) {
  const hay = squash(text);
  if (!hay) return null;
  for (const r of rules || []) {
    if (r.type && type && r.type !== type) continue;
    const needle = squash(r.pattern);
    if (needle && hay.includes(needle)) return r;
  }
  return null;
}

// Palabras que los bancos añaden al concepto y no identifican al comercio.
const STOP = new Set(('compra compras tarj tarjeta pago pagos recibo recibos transferencia transf trf bizum adeudo cargo abono en de del la el los las con por para ' +
  'operacion op num numero ref referencia card purchase payment visa mastercard debito credito contactless sepa domiciliacion domiciliado ' +
  'fecha concepto mov movimiento www com es sl sa slu inc ltd').split(' '));

// Propone una palabra clave a partir del concepto del banco:
// «COMPRA TARJ. 5402XXXX1234 MERCADONA VALENCIA» → «MERCADONA».
export function suggestKeyword(desc) {
  const words = String(desc || '').split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean);
  for (const w of words) {
    if (/\d/.test(w) || w.length < 3) continue;
    if (STOP.has(norm(w))) continue;
    return w.toUpperCase();
  }
  return String(desc || '').trim().slice(0, 30).toUpperCase();
}
