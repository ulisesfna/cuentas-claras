// Cifrado con Web Crypto: AES-GCM de 256 bits con clave derivada por PBKDF2-SHA-256.
// Un "sobre" guarda los parámetros necesarios para descifrar (sal, iteraciones, IV) junto a los datos.

const te = new TextEncoder(), td = new TextDecoder();
export const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const isEnvelope = (o) => !!o && o.enc === 1 && typeof o.data === 'string' && typeof o.iv === 'string'
  && !!o.kdf && typeof o.kdf.salt === 'string' && Number.isInteger(o.kdf.iter);

export async function deriveKey(secret, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// `v` = { key, salt, iter, lock }. Cada llamada usa un IV aleatorio nuevo.
export async function seal(v, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, v.key, te.encode(JSON.stringify(obj))));
  return { app: 'cuentas-claras', enc: 1, lock: v.lock, cipher: 'AES-GCM-256', kdf: { name: 'PBKDF2-SHA-256', iter: v.iter, salt: b64(v.salt) }, iv: b64(iv), data: b64(ct) };
}
export async function decryptWithKey(key, env) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
  return JSON.parse(td.decode(pt));
}
// Lanza un error si el código no es correcto (AES-GCM verifica la integridad).
export async function openEnvelope(env, secret) {
  const iter = env.kdf.iter;
  if (iter < 10000 || iter > 10000000) throw new Error('Parámetros de cifrado no válidos.');
  const salt = unb64(env.kdf.salt);
  const key = await deriveKey(secret, salt, iter);
  const obj = await decryptWithKey(key, env);
  return { obj, vault: { key, salt, iter, lock: env.lock === 'pin' ? 'pin' : 'password' } };
}
export async function newVault(secret, lock, iter) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { key: await deriveKey(secret, salt, iter), salt, iter, lock };
}

// Bloqueo sin cifrado (navegadores sin Web Crypto): solo evita miradas casuales.
export function hashPin(pin) {
  const s = 'cuentas-claras:' + pin;
  let h1 = 0x811c9dc5, h2 = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2, 33) + c) >>> 0;
  }
  return h1.toString(16) + h2.toString(16);
}
