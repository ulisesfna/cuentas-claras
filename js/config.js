// Servidor de sincronización por defecto (Cloudflare Worker). Es el mismo que usa «Mi calendario»:
// sus rutas /sync/get y /sync/put guardan una copia cifrada por cuenta, y Cuentas Claras usa
// identificadores distintos, así que los datos de cada app quedan separados.
// También se puede cambiar en la app: Menú → Sincronización.
export const DEFAULT_SYNC_SERVER = 'https://calendario-avisos.ulisesfna2.workers.dev';
