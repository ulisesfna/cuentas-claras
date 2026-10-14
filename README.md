# Cuentas Claras

Gestor de gastos personal inspirado en las funciones de [Monefy](https://www.monefy.com/).
Es una aplicación web progresiva (PWA): funciona en el navegador, se puede instalar en el
móvil o en el ordenador como una app más y sigue funcionando sin conexión.

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

- **Sincronización en la nube**: no hay servidor, así que no se sincroniza sola. Para pasar
  los datos de un dispositivo a otro se usa la copia de seguridad (Exportar y copias).
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

## Pruebas

La lógica que no depende de la pantalla (períodos, conversión, recurrentes con fin de mes,
presupuestos, migraciones, validación y combinación de copias, CSV, reglas, etiquetas y
cifrado) tiene pruebas automáticas en `tests/`.

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
js/core/              Lógica pura, sin DOM (se prueba en tests/)
  util, format          Fechas, números y formato
  periods, calc         Períodos de la vista y calculadora
  ledger, budget        Totales, saldos, deudas y presupuestos
  recurring             Recurrentes y próximos movimientos
  tags, rules, csv      Etiquetas, reglas de categorización e importación/exportación CSV
  model, validate,      Modelo de datos y migraciones, validación de copias,
  merge, crypto         combinación de copias y cifrado
js/ui/                Pantallas (una por archivo) y piezas comunes (dom.js, store.js)
tests/                Pruebas (index.html para el navegador, run.mjs para Node)
sw.js                 Service worker (modo sin conexión)
manifest.webmanifest  Datos para instalar la app
icons/                Iconos
```

Si añades un archivo a `js/`, añádelo también a la lista de `sw.js` para que funcione sin
conexión.

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
