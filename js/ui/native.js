// App de Android (APK hecha con Capacitor, ver android-app/). Dentro de la APK existe
// window.Capacitor: las copias se guardan con «Compartir», el botón «atrás» cierra pantallas y
// la app avisa si hay una versión nueva. En el navegador NATIVE es false y todo va como en la web.
const Cap = window.Capacitor;
export const NATIVE = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform() && typeof Cap.registerPlugin === 'function');
const P = NATIVE ? {
  app: Cap.registerPlugin('App'),
  fs: Cap.registerPlugin('Filesystem'),
  share: Cap.registerPlugin('Share'),
} : null;
export const APK_NAME = 'CuentasClaras.apk';
const UPDATE_KEY = 'cuentas-claras:apk-update';

// Guarda un archivo: en la APK no hay descargas, así que se escribe en la caché y se abre el menú
// «Compartir» (Drive, Archivos, correo…). Devuelve false si se cancela.
export async function shareFile(name, content) {
  try {
    const { uri } = await P.fs.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
    await P.share.share({ title: name, files: [uri], dialogTitle: 'Guardar en…' });
    return true;
  } catch (e) {
    if (/cancel/i.test((e && e.message) || '')) return false;
    throw e;
  }
}

// Avisa cuando la app pasa a primer o segundo plano. En la APK también escucha pause/resume de
// Android, por si la página no recibe visibilitychange; si llegan los dos, solo cuenta el primero.
let visible = document.visibilityState !== 'hidden';
const visListeners = [];
function setVisible(v) {
  if (v === visible) return;
  visible = v;
  visListeners.forEach((f) => f(v));
}
document.addEventListener('visibilitychange', () => setVisible(document.visibilityState !== 'hidden'));
if (NATIVE) {
  P.app.addListener('pause', () => setVisible(false));
  P.app.addListener('resume', () => setVisible(true));
}
export const isVisible = () => visible;
export const onVisibility = (f) => visListeners.push(f);

// Botón «atrás» de Android: `handler` devuelve true si ha cerrado algo; si no, la app se minimiza.
export function onBackButton(handler) {
  if (NATIVE) P.app.addListener('backButton', () => { if (!handler()) P.app.minimizeApp(); });
}

// Número de compilación y repositorio, que escribe android-app/preparar.py al fabricar la APK.
let info = null;
export async function apkInfo() {
  if (!NATIVE) return null;
  if (!info) info = await fetch('apk-version.json').then((r) => r.json()).catch(() => ({}));
  return info;
}
export const apkVersionLabel = (i) => (i && i.build ? `Android 1.${i.build} (${i.date})` : '');

// En la web publicada en GitHub Pages: dirección fija de la última APK.
export function apkDownloadURL() {
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? `https://github.com/${m[1]}/${repo}/releases/latest/download/${APK_NAME}` : null;
}

// ¿Hay una APK más nueva en GitHub? Como mucho una consulta cada 12 h. Devuelve
// { build, url } o null.
export async function checkUpdate() {
  const i = await apkInfo();
  if (!i || !i.repo || !i.build) return null;
  let last = null;
  try { last = JSON.parse(localStorage.getItem(UPDATE_KEY)); } catch (e) { /* nada guardado */ }
  if (!last || Date.now() - last.at > 12 * 3600e3) {
    const r = await fetch(`https://api.github.com/repos/${i.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } }).catch(() => null);
    if (!r || !r.ok) return null;
    const j = await r.json();
    last = { at: Date.now(), latest: parseInt(String(j.tag_name || '').replace(/\D/g, ''), 10) || 0 };
    try { localStorage.setItem(UPDATE_KEY, JSON.stringify(last)); } catch (e) { /* sin guardar */ }
  }
  return last.latest > i.build ? { build: last.latest, url: `https://github.com/${i.repo}/releases/latest/download/${APK_NAME}` } : null;
}
