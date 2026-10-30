// Servidor de sincronización de Cuentas Claras (Cloudflare Worker). OPCIONAL.
//
// La app usa por defecto el Worker de «Mi calendario», que ya tiene estas mismas rutas. Este archivo
// sirve si prefieres un servidor solo para Cuentas Claras (por ejemplo, para no compartir el cupo
// gratuito de escrituras de KV con el calendario). Ver README → Sincronización.
//
// Guarda la copia CIFRADA de tus datos (la cifra tu dispositivo; aquí no se puede leer).
// `id` y `tok` se derivan de tu contraseña de sincronización: sin ella no se encuentra ni se
// sobrescribe la copia. Del código de acceso solo se guarda su huella (SHA-256).
// `rev` evita que dos dispositivos se pisen: si otro subió antes, se responde 409 y el dispositivo
// vuelve a descargar, fusiona y sube.
//
// Necesita un espacio KV enlazado con el nombre «KV».

const MAX_SYNC_BYTES = 20e6;

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!env.KV) return json({ error: 'Falta enlazar el espacio KV con el nombre «KV»' }, 500);
    const url = new URL(req.url);
    if (req.method !== 'POST') return json({ ok: true, app: 'cuentas-claras-sync', version: 1 });
    try {
      if (url.pathname !== '/sync/get' && url.pathname !== '/sync/put') return json({ error: 'Ruta desconocida' }, 404);
      const body = await req.json();
      const { id, tok } = body;
      if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || typeof tok !== 'string' || !/^[a-f0-9]{64}$/.test(tok)) {
        throw new Error('Datos de sincronización no válidos');
      }
      const key = `s:${id}`;
      const rec = await env.KV.get(key, 'json');
      const tokHash = await sha256hex(tok);
      if (rec && rec.tokHash !== tokHash) return json({ error: 'Código de acceso incorrecto' }, 403);

      if (url.pathname === '/sync/get') {
        if (!rec) return json({ exists: false, rev: 0 });
        // Si el dispositivo ya tiene esta versión, no hace falta mandarla otra vez
        if (body.since && body.since === rec.rev) return json({ exists: true, same: true, rev: rec.rev, at: rec.at });
        return json({ exists: true, rev: rec.rev, at: rec.at, data: rec.data });
      }

      if (typeof body.data !== 'string' || body.data.length > MAX_SYNC_BYTES) throw new Error('Datos no válidos o demasiado grandes');
      const current = rec ? rec.rev : 0;
      if ((body.rev || 0) !== current) return json({ conflict: true, rev: current }, 409);
      const next = { tokHash, rev: current + 1, at: Date.now(), data: body.data };
      await env.KV.put(key, JSON.stringify(next));
      return json({ ok: true, rev: next.rev });
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  },
};

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
