// Calculadora del teclado: expresiones con + − × ÷ y coma decimal ("45,5+4×2").
import { plain, round2 } from './util.js';

export const isOp = (c) => c !== '' && '+-×÷'.includes(c);

// Evalúa respetando la prioridad (× y ÷ antes que + y −). División entre cero → NaN.
export function evalExpr(expr) {
  const toks = expr.match(/\d+(?:,\d*)?|[+\-×÷]/g) || [];
  while (toks.length && isOp(toks[toks.length - 1])) toks.pop();
  if (!toks.length) return 0;
  const num = (t) => parseFloat(String(t).replace(',', '.')) || 0;
  const terms = [num(toks[0])];
  for (let i = 1; i < toks.length; i += 2) {
    const op = toks[i], n = num(toks[i + 1]);
    if (op === '×') terms[terms.length - 1] *= n;
    else if (op === '÷') terms[terms.length - 1] = n === 0 ? NaN : terms[terms.length - 1] / n;
    else terms.push(op === '-' ? -n : n);
  }
  return round2(terms.reduce((a, b) => a + b, 0));
}

// Aplica una tecla a la expresión y devuelve la nueva expresión.
export function pressKey(expr, k) {
  const last = expr.slice(-1);
  const lastNum = expr.split(/[+\-×÷]/).pop();
  switch (k) {
    case 'C': return '0';
    case '⌫': return expr.length > 1 ? expr.slice(0, -1) : '0';
    case '=': { const r = evalExpr(expr); return r >= 0 && isFinite(r) ? plain(r) : expr; }
    case ',':
      if (lastNum.includes(',')) return expr;
      return isOp(last) ? expr + '0,' : expr + ',';
    case '+': case '-': case '×': case '÷':
      if (expr === '0') return expr;
      if (isOp(last) || last === ',') return expr.slice(0, -1) + k;
      return expr + k;
    default:
      if (expr.length >= 28) return expr;
      if (lastNum.includes(',') && lastNum.split(',')[1].length >= 2) return expr;
      if (lastNum === '0') return expr.slice(0, -1) + k;
      if (lastNum.length >= 10) return expr;
      return expr + k;
  }
}

export const displayExpr = (e) => e.replace(/-/g, '−').replace(/([+−×÷])/g, ' $1 ');
