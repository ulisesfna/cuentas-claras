# Cuentas Claras

Gestor de gastos personal inspirado en las funciones de [Monefy](https://www.monefy.com/).
Es una aplicación web progresiva (PWA): funciona en el navegador, se puede instalar en el
móvil o en el ordenador como una app más y sigue funcionando sin conexión. En Android también
está como app normal (APK, ver «App de Android»).

No tiene dependencias ni paso de compilación: HTML, CSS y JavaScript.

## Cómo ejecutarla

```bash
python -m http.server 5173
```

Después abre <http://localhost:5173>. La app usa módulos de JavaScript, así que necesita
servirse por http(s): abrir `index.html` con doble clic no funciona.

Para instalarla en el móvil hay que servirla por HTTPS (por ejemplo con GitHub Pages,
Netlify o Cloudflare Pages: basta con subir la carpeta tal cual). Luego, en el navegador
del móvil, usa «Añadir a pantalla de inicio» o «Instalar app».

## Funciones (equivalencia con Monefy)

| Monefy | Cuentas Claras |
|---|---|
| Gráfico circular de gastos con las categorías alrededor | Anillo de 16 categorías alrededor del gráfico; al tocar una se apunta un gasto en ella |
| Botones grandes − / + para añadir rápido | Botones **− Gasto** y **+ Ingreso**; tocar una categoría con importe la guarda al momento |
| Calculadora integrada | Teclado con + − × ÷ (respeta la precedencia); la tecla ✓ guarda |
| Periodos: día, semana, mes, año, todo, intervalo, fecha concreta | Todos, más deslizar a izquierda/derecha (o usar las flechas del teclado) para cambiar de período |
| Varias cuentas y transferencias entre ellas | Tipos de cuenta (efectivo, débito, ahorro, tarjeta de crédito, préstamo) con liquidez, deudas y patrimonio neto; transferencias con conversión de moneda |
| Varias monedas | Moneda principal y tipos de cambio manuales (sin depender de internet) |
| Categorías personalizables | Crear, editar (icono y color), reordenar, archivar y eliminar |
| Modo presupuesto | Presupuesto total y por categoría, con avisos al 80 % y al superarlo |
| Movimientos recurrentes | Diario, semanal, mensual o anual; se generan solos; se pueden pausar u omitir una sola vez |
| Arrastrar saldo (carry over) | Opción en Ajustes |
| Lista agrupada por categoría | Por categoría (desplegable con porcentajes) o por fecha |
| Búsqueda | Por nota, categoría, cuenta, #etiqueta, importe o fecha |
| — | **Etiquetas** (#vacaciones) que atraviesan las categorías y filtran toda la pantalla |
| — | **Gastos divididos** entre varias categorías (la compra con comida y limpieza) |
| — | **Importar CSV del banco** con detección de columnas, duplicados y **reglas de categorización** («MERCADONA» → Supermercado) |
| Protección con contraseña | PIN o contraseña que además **cifra los datos** (AES-GCM 256, clave PBKDF2-SHA-256 con 600.000 iteraciones) |
| Exportar a CSV | CSV del período visible o de todo el historial (se abre en Excel) |
| Copia en Dropbox / Google Drive | Copia `.json` (cifrada si los datos lo están), copia automática a un archivo en escritorio y aviso si pasan más de 30 días sin copia; al restaurar, validación completa y opción de combinar |
| Tema oscuro | Automático, claro u oscuro |
| Inicio de mes personalizado | El mes puede empezar cualquier día del 1 al 28 |

Además: **Análisis** (ingresos frente a gastos por mes, comparación con el mes anterior,
media diaria con previsión y evolución por categoría), **Próximos movimientos** (lo que se
cobra y se ingresa en los próximos 7, 30 o 90 días, incluido el cargo estimado de las tarjetas
de crédito), deshacer un borrado, sincronización entre pestañas abiertas, atajos de teclado
(`−` gasto, `+` ingreso, `/` buscar, `?` guía, `←`/`→` cambiar de período, `Esc` cerrar) y una
**Guía de uso** integrada (menú ☰ → Guía de uso) que explica cada función en detalle, con
buscador y accesos directos a cada pantalla.

### Diferencias

- **Sincronización en la nube**: en lugar de Dropbox o Google Drive, se sincroniza con tu
  propio servidor de Cloudflare y los datos van cifrados de extremo a extremo (ver abajo).
- **Widget de pantalla de inicio**: las apps web no pueden crear widgets nativos.
- **Copia automática**: usa la File System Access API, disponible en Chrome y Edge de
  escritorio. En el móvil hay que descargar la copia a mano (la app avisa a los 30 días).
- **Cifrado con PIN**: un PIN de 4 dígitos solo tiene 10.000 combinaciones; protege frente
  al acceso casual, pero para una protección real hay que usar una contraseña. El cifrado
  requiere abrir la app por https (o en localhost).

### El gráfico central con etiquetas y gastos divididos

El gráfico circular responde a «¿en qué gasté?» y siempre suma el 100 % de los gastos:

- Un **gasto dividido** aporta cada parte a su categoría, así que encaja sin cambios.
- Las **etiquetas** no son trozos del gráfico, porque un movimiento puede llevar varias y sus
  totales se solaparían. Funcionan como **filtro**: con «#vacaciones» activo, el gráfico, la
  lista y el saldo muestran solo esos movimientos, repartidos por categoría. Los totales por
  etiqueta se ven en barras (pantalla Etiquetas y Análisis).

## Sincronización entre dispositivos

Menú → **Sincronización** → **Activar sincronización**, y la misma contraseña de sincronización
en cada dispositivo.

**Cómo protege los datos.** Funciona igual que la de «Mi calendario»:

- De la contraseña se derivan (PBKDF2-SHA-256, 600.000 iteraciones) dos cosas independientes:
  el identificador y el código de acceso de tu copia en el servidor, y la clave AES-GCM de
  256 bits con la que se cifran los datos **en el dispositivo**.
- El servidor solo guarda texto cifrado: sin la contraseña no se puede leer, ni siquiera
  encontrar tu copia. La contraseña no se guarda; la clave queda en el dispositivo como no
  exportable (IndexedDB).
- Cuentas Claras usa otra «sal» al derivar el identificador, así que en el mismo servidor su
  copia está separada de la del calendario aunque uses la misma contraseña.

**Cómo fusiona.** Tres bandas: compara lo de este dispositivo, lo del servidor y lo último
sincronizado (`js/core/sync.js`, con pruebas en `tests/sync.test.js`):

- Se respetan los cambios y los borrados de cada lado. Si dos dispositivos cambian el mismo
  movimiento, se juntan los campos (y las etiquetas); si tocan el mismo campo, gana el último.
- Si uno borra algo que otro acababa de modificar, se conserva.
- Las repeticiones de los recurrentes tienen un identificador fijo (`regla@fecha`), así que
  dos dispositivos que las generan por su cuenta no las duplican.
- Un dispositivo nuevo sin movimientos recibe lo del servidor; uno con datos los junta.
- Restaurar una copia o borrar los datos con la sincronización activa solo suma: no borra nada
  en los demás dispositivos.
- No se sincronizan el tema, la vista ni el código de bloqueo, que son de cada dispositivo.

**Servidor.** Por defecto, el Worker de «Mi calendario» (`js/config.js`), que ya tiene las rutas
`/sync/get` y `/sync/put`. Se puede cambiar en la app.

- El plan gratuito de Cloudflare KV permite 1.000 escrituras al día, compartidas entre las apps
  que usen ese Worker. Cada sincronización con cambios es una escritura: con un uso normal sobra.
- Si prefieres un servidor solo para Cuentas Claras:
  1. En Cloudflare, crea un Worker nuevo y pega el código de `servidor-sync/worker.js`.
  2. En Storage → KV, crea un espacio y enlázalo al Worker con el nombre `KV`.
  3. Pulsa Deploy y escribe la dirección del Worker en Menú → Sincronización → Tu servidor.

## App de Android (APK)

Igual que «Mi calendario» y «Mi aventura»: GitHub fabrica la app sola cada vez que subes cambios
y la deja en **Releases**. Es la misma app web dentro de un envoltorio de Android (Capacitor), así
que todo funciona igual, con estas diferencias:

- Las copias de seguridad y los CSV se guardan con el menú **Compartir** (Drive, Archivos, correo…).
- El botón **atrás** de Android cierra la pantalla o el diálogo de encima; en la principal, minimiza.
- Avisa cuando hay una versión nueva («Descargar»), que se instala encima **conservando los datos**.
- No usa service worker: la app ya está en el móvil y funciona sin conexión.

Enlace fijo de descarga:
**`https://github.com/TU-USUARIO/TU-REPOSITORIO/releases/latest/download/CuentasClaras.apk`**
(en la web publicada también aparece en el menú → «App de Android»).

**Preparación (una sola vez)**

1. Sube a GitHub todo como siempre, **incluida la carpeta `android-app`**. No subas copias de
   seguridad (`cuentas-claras-*.json`) ni CSV del banco: el repositorio es público.
2. **La llave de firma:** en el repositorio → **Settings → Secrets and variables → Actions → New
   repository secret** → *Name*: **`APK_KEYSTORE`** → *Secret*: pega el contenido de
   **`APK_KEYSTORE.txt`** de la carpeta `llave-apk` (la misma llave del Calendario) → **Add secret**.
3. **El fabricante:** **Add file → Create new file** → nombre exacto **`.github/workflows/apk.yml`**
   → pega el contenido de **`android-app/apk.yml`** → **Commit changes**.
4. Pestaña **Actions**: «App Android (APK)» tarda unos 5 minutos. Con ✅, el APK está en
   **Releases**. Si sale ❌, abre el paso en rojo y haz una captura.

**Pasar tus datos a la app** (la app y la web guardan cada una los suyos)

- Con sincronización: en la app, Menú → Sincronización → Activar, con la misma contraseña.
- Sin ella: en la web, Exportar y copias → Descargar copia; en la app, Exportar y copias →
  Restaurar → **Reemplazar todo** (si la copia está cifrada, te pedirá el código).

Después, conviene dejar de usar la versión web en ese móvil para no apuntar en dos sitios.

⚠️ Si desinstalas la app se borran sus datos. Ten la sincronización activa o haz copias.

**Cómo se fabrica:** `android-app/preparar.py` copia la web a `www/` (sin `sw.js` ni `tests/`) y
anota el número de compilación en `apk-version.json`; `npx cap add android` crea el proyecto;
`android-app/parchear.py` pone el icono, la pantalla de carga, el color de la barra de estado, la
versión y la firma. El código propio de la app para Android está en `js/ui/native.js`: en el
navegador no hace nada.

## Pruebas

La lógica que no depende de la pantalla (períodos, conversión, recurrentes con fin de mes,
presupuestos, migraciones, validación y combinación de copias, CSV, reglas, etiquetas,
cifrado y fusión de la sincronización) tiene pruebas automáticas en `tests/`.

- En el navegador: con el servidor en marcha, abre <http://localhost:5173/tests/>.
- Con Node 20 o superior:

```bash
node tests/run.mjs
```

Para añadir pruebas, crea un `tests/*.test.js` y añádelo a `tests/all.js`.

## Estructura

```
index.html            Estructura de la pantalla principal
css/styles.css        Estilos (tema claro y oscuro, móvil y escritorio)
js/main.js            Punto de entrada: eventos globales y arranque
js/config.js          Servidor de sincronización por defecto
js/core/              Lógica pura, sin DOM (se prueba en tests/)
  util, format          Fechas, números y formato
  periods, calc         Períodos de la vista y calculadora
  ledger, budget        Totales, saldos, deudas y presupuestos
  recurring             Recurrentes y próximos movimientos
  tags, rules, csv      Etiquetas, reglas de categorización e importación/exportación CSV
  model, validate,      Modelo de datos y migraciones, validación de copias,
  merge, crypto         combinación de copias y cifrado
  sync                  Fusión a tres bandas para la sincronización
js/ui/                Pantallas (una por archivo) y piezas comunes (dom.js, store.js, idb.js)
  sync.js               Sincronización: red, claves y pantalla
  native.js             App de Android: Compartir, botón atrás y aviso de versión nueva
android-app/          Envoltorio de Android (Capacitor) y apk.yml para GitHub Actions
servidor-sync/        Worker de Cloudflare opcional, solo para la sincronización
tests/                Pruebas (index.html para el navegador, run.mjs para Node)
sw.js                 Service worker (modo sin conexión)
manifest.webmanifest  Datos para instalar la app
icons/                Iconos
```

Si añades un archivo a `js/`, añádelo también a la lista de `sw.js` para que funcione sin
conexión.

### Convivencia con otras apps en GitHub Pages

Todas las apps publicadas en `usuario.github.io/…` comparten dominio y, con él, el
almacenamiento del navegador. Para no interferir con ellas, Cuentas Claras:

- guarda sus datos solo en claves que empiezan por `cuentas-claras:` y en la base de datos
  IndexedDB `cuentas-claras`, y nunca borra el almacenamiento entero;
- su service worker solo crea, usa y borra cachés que empiezan por `cuentas-claras-`, y solo
  atiende peticiones de su propia carpeta.

Cada app debe estar en su propio repositorio (`usuario.github.io/nombre-repo/`), no en el
repositorio raíz `usuario.github.io`: un service worker en la raíz controlaría también las
carpetas de las demás apps.

Los datos se guardan en `localStorage` con la clave `cuentas-claras:v1` (en claro o como
sobre cifrado). La fecha de la última copia y el estado de la copia automática van aparte,
en `cuentas-claras:meta`, y el archivo elegido para la copia automática en IndexedDB.

### Versiones del modelo de datos

Los datos llevan un número de `version` (ahora `3`: la 2 añadió tipos de cuenta y
presupuestos por categoría; la 3, etiquetas, divisiones, reglas y perfiles de importación).
Para cambiar el modelo, añade una función en `MIGRATIONS` (`js/core/model.js`) que lleve los
datos de la versión N-1 a la N, sube `SCHEMA_VERSION` (`js/core/constants.js`) y añade una
prueba en `tests/model.test.js`. Las migraciones se aplican al cargar y al restaurar copias
antiguas. Si los datos vienen de una versión más nueva que la app, esta no los abre para no
estropearlos.
