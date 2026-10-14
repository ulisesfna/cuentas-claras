// Guía de uso integrada: un apartado por función, con buscador y accesos directos.
import { esc, norm } from '../core/util.js';
import { $, $$, icon, openSheet } from './dom.js';
import { openTxSheet } from './tx-editor.js';
import { openPeriodSheet, openSearch } from './period.js';
import { openAccounts, openCurrencies } from './accounts.js';
import { openCategories } from './categories.js';
import { openBudget } from './budget.js';
import { openRecurring, openUpcoming } from './recurring.js';
import { openData } from './backup.js';
import { openSecurity } from './security.js';
import { openAnalysis } from './analysis.js';
import { openTags } from './tags.js';
import { openCsvImport, openRules } from './importer.js';

const HELP = [
  {
    icon: '🏠', title: 'La pantalla principal', body: `
    <p>Es un resumen del <b>período</b> que estás viendo (por defecto, el mes actual) y de la <b>cuenta</b> elegida arriba.</p>
    <ul>
      <li><b>Barra superior:</b> <b>☰</b> abre el menú; el nombre del centro («Todas las cuentas») permite ver una sola cuenta; <b>⇄</b> registra una transferencia (solo si tienes dos cuentas o más); el icono de <b>gráfico</b> abre el Análisis y la <b>lupa</b>, la búsqueda.</li>
      <li><b>Barra del período:</b> las flechas <b>‹ ›</b> van al período anterior o siguiente; tocando el nombre eliges otro tipo de período o una fecha concreta.</li>
      <li><b>Anillo de categorías:</b> alrededor del gráfico aparecen hasta 16 categorías de gasto. Al tocar una, se abre el editor con esa categoría elegida. Si tienes menos de 16 verás <b>+ Nueva</b>; si tienes más, la última posición es <b>••• Más</b>.</li>
      <li><b>Gráfico circular:</b> cada color es una categoría y su tamaño es proporcional a lo gastado en ella. Responde a «¿en qué gasté?» y siempre suma el 100 % de los gastos: un gasto dividido aporta cada parte a su categoría.</li>
      <li><b>Centro del gráfico:</b> total de <b>ingresos</b> (verde) y <b>gastos</b> (rojo) del período. Con el modo presupuesto muestra lo que te queda disponible.</li>
      <li><b>Saldo:</b> ingresos menos gastos del período (más lo acumulado antes si activas «Arrastrar saldo»).</li>
      <li><b>Marcas en las categorías:</b> un punto <b>ámbar</b> indica que la categoría va por el 80 % de su presupuesto y uno <b>rojo con «!»</b> que lo ha superado.</li>
      <li><b>Filtro por etiqueta:</b> si eliges una etiqueta (en Etiquetas o en el Análisis), aparece una franja «Solo #vacaciones» y toda la pantalla muestra únicamente esos movimientos. Pulsa <b>Quitar filtro</b> para volver.</li>
      <li><b>Próximos 7 días</b> y <b>avisos</b>: una tarjeta resume lo que va a salir y entrar esta semana, y arriba aparece un aviso si hace más de 30 días que no haces copia de seguridad.</li>
    </ul>
    <p class="tip">💡 Desliza el dedo a izquierda o derecha sobre el gráfico para cambiar de período.</p>` },
  {
    icon: '➕', title: 'Añadir un gasto o un ingreso', open: 'expense', body: `
    <p>Pulsa <b>− Gasto</b> o <b>+ Ingreso</b>, toca una categoría del anillo o, en el ordenador, pulsa <kbd>−</kbd> o <kbd>+</kbd>. En el editor:</p>
    <ol>
      <li>Escribe el <b>importe</b> con el teclado de la calculadora.</li>
      <li>Revisa la <b>cuenta</b> (la que estás viendo o la última que usaste) y la <b>fecha</b> (hoy; si ves un período pasado, su último día).</li>
      <li>Si quieres, elige <b>Repetir</b>, escribe una <b>nota</b> y añade <b>etiquetas</b>.</li>
      <li>Elige la <b>categoría</b>, o pulsa <b>✂ Dividir</b> para repartir el importe entre varias.</li>
    </ol>
    <p><b>Guardado rápido:</b> en un movimiento nuevo, si ya has escrito un importe, <b>tocar una categoría lo guarda al instante</b>. Por eso conviene rellenar fecha, nota y etiquetas <i>antes</i>. También puedes guardar con <b>✓</b> o con <kbd>Intro</kbd>.</p>
    <p><b>Categoría sugerida:</b> si la nota contiene el texto de una <b>regla de categorización</b> (por ejemplo «Mercadona»), la categoría se elige sola y verás «Categoría sugerida por la regla…». Puedes cambiarla tocando otra.</p>
    <p>Si filtras la pantalla por una etiqueta, los movimientos nuevos la llevan ya puesta.</p>` },
  {
    icon: '🧮', title: 'La calculadora', body: `
    <ul>
      <li><b>+ − × ÷</b> encadenan operaciones respetando la prioridad: <i>10 + 5 × 2 = 20</i>. Debajo ves el resultado provisional.</li>
      <li><b>=</b> sustituye la operación por su resultado; sin operación pendiente, esa tecla es <b>✓ Guardar</b>.</li>
      <li><b>,</b> añade decimales (máximo dos). <b>⌫</b> borra el último carácter y <b>C</b> todo. El resultado nunca puede ser negativo.</li>
    </ul>
    <p>Con teclado: números, <kbd>+</kbd> <kbd>-</kbd> <kbd>*</kbd> <kbd>/</kbd>, <kbd>.</kbd> o <kbd>,</kbd>, <kbd>Retroceso</kbd>, <kbd>Supr</kbd> para limpiar, <kbd>Intro</kbd> para guardar y <kbd>Esc</kbd> para cerrar.</p>` },
  {
    icon: '#️⃣', title: 'Etiquetas', open: 'tags', body: `
    <p>La <b>categoría</b> responde a «¿en qué gasté?» (comida, transporte, ocio). Una <b>etiqueta</b> responde a otra pregunta: «¿para qué o con qué motivo?». Atraviesa las categorías: un viaje genera gastos de transporte, hotel, comidas y ocio, y con <b>#vacaciones-roma</b> los ves todos juntos.</p>
    <ul>
      <li><b>Añadir:</b> en el editor, escribe en el campo «Etiquetas» y pulsa <kbd>Intro</kbd> o coma. Un movimiento puede llevar varias. Se proponen las que ya usas. Los espacios se convierten en guiones.</li>
      <li><b>Quitar:</b> toca la <b>×</b> de la etiqueta, o pulsa Retroceso con el campo vacío.</li>
      <li><b>Ver solo una etiqueta:</b> Menú → <b>Etiquetas</b> y toca una. La pantalla principal se filtra: el gráfico muestra <i>en qué</i> categorías se repartió ese motivo, y la lista, solo sus movimientos. El presupuesto no se aplica dentro de un filtro.</li>
      <li><b>Totales:</b> la pantalla Etiquetas muestra cuántos movimientos, gastos e ingresos tiene cada una (en este período o en todo el historial), y el Análisis incluye el <b>gasto por etiqueta</b>.</li>
      <li><b>Renombrar</b> (✏) cambia la etiqueta en todos sus movimientos; si eliges el nombre de otra existente, se <b>unen</b>. <b>Quitar</b> (🗑) la borra de todos los movimientos, que se conservan.</li>
      <li>La búsqueda también encuentra por etiqueta: escribe <b>#roma</b>.</li>
    </ul>
    <p class="tip">💡 Las etiquetas no aparecen como trozos del gráfico circular porque un movimiento puede llevar varias: sus totales se solapan y no sumarían el 100 %. Por eso funcionan como filtro.</p>` },
  {
    icon: '✂️', title: 'Dividir un gasto entre categorías', body: `
    <p>Para una compra que mezcla cosas, como el súper con comida y productos de limpieza.</p>
    <ol>
      <li>En el editor, escribe el <b>importe total</b> y pulsa <b>✂ Dividir</b> (junto a «Categoría»).</li>
      <li>Elige la categoría y el importe de cada parte. Abajo ves cuánto <b>falta por repartir</b>; <b>Poner lo que falta en la última</b> lo completa. <b>Añadir parte</b> admite más de dos.</li>
      <li>Pulsa <b>Aplicar división</b>: el editor muestra el reparto, con <b>Editar división</b> y <b>Quitar división</b>.</li>
    </ol>
    <ul>
      <li>Cada parte cuenta en <b>su</b> categoría: en el gráfico, en los presupuestos (y sus avisos) y en el Análisis. El gráfico sigue sumando el total.</li>
      <li>En la lista por categorías, cada parte aparece en su categoría con «✂ parte de 57,00 €». Por fechas, sale una sola fila con «Supermercado + Higiene».</li>
      <li>Si cambias el importe total después, la app te pedirá ajustar las partes. Si dejas una sola parte, deja de estar dividido.</li>
      <li>En el CSV exportado, cada parte ocupa una fila (columna «Dividido»).</li>
    </ul>` },
  {
    icon: '✏️', title: 'Editar o eliminar movimientos', body: `
    <p>Toca cualquier movimiento de la lista o de la búsqueda para cambiar lo que quieras, también el tipo, la división o las etiquetas. Pulsa <b>✓</b> para guardar.</p>
    <p>Para borrarlo, usa la <b>papelera</b> y confirma. Durante unos segundos tienes <b>Deshacer</b>.</p>
    <p class="tip">💡 Al editar, tocar una categoría solo la selecciona; no guarda automáticamente.</p>` },
  {
    icon: '🏦', title: 'Importar del banco (CSV)', open: 'import', body: `
    <p>Menú → <b>Importar del banco</b> (o desde Exportar y copias). Ahorra apuntar a mano lo que ya está en tu banco.</p>
    <ol>
      <li><b>Archivo:</b> descarga los movimientos de tu banco en <b>CSV</b>, elige de qué cuenta son y selecciona el archivo. Si tu banco solo da Excel, ábrelo y guárdalo como CSV.</li>
      <li><b>Columnas:</b> la app detecta el separador, la codificación, la fila de títulos, qué columna es la fecha, el concepto y el importe (o cargos y abonos por separado), el formato de fecha y los decimales. Revisa la vista previa «Así se leerán» y corrige lo que haga falta. Si tu banco pone los gastos en positivo, activa <b>Invertir el signo</b>.</li>
      <li><b>Revisar:</b> cada movimiento muestra su categoría, puesta por una <b>regla</b> o la categoría por defecto («Gastos sin regla →»). Cámbiala si hace falta, o pulsa 🪄 para <b>crear una regla</b> a partir de ese concepto: se aplica al momento a las demás filas y a futuras importaciones.</li>
      <li>Pulsa <b>Importar</b>. Tienes unos segundos para <b>Deshacer</b> toda la importación.</li>
    </ol>
    <ul>
      <li><b>Duplicados:</b> si una fila ya se importó antes, sale como «Ya importado»; si ya tienes un movimiento en esa cuenta con la misma fecha, tipo e importe (por ejemplo, apuntado a mano), como «Posible duplicado». Ambos vienen desmarcados.</li>
      <li>Las filas que no se pueden leer (líneas de saldo, totales, fechas raras) se muestran aparte y no se importan.</li>
      <li>La app <b>recuerda las columnas</b> de cada banco: la próxima vez irás directo a revisar.</li>
      <li>El concepto del banco se guarda como nota, así que luego puedes buscarlo.</li>
    </ul>` },
  {
    icon: '🪄', title: 'Reglas de categorización', open: 'rules', body: `
    <p>Menú → <b>Reglas de categorización</b>. Una regla dice: «si el concepto contiene <b>MERCADONA</b> → <b>Supermercado</b>».</p>
    <ul>
      <li>Se aplican al <b>importar del banco</b> y al escribir la <b>nota</b> de un movimiento nuevo.</li>
      <li>No distinguen mayúsculas ni tildes. Usa una palabra que identifique al comercio, sin números de tarjeta ni fechas: la app la propone sola al crearla desde una importación.</li>
      <li>Cada regla es de gastos o de ingresos, según su categoría.</li>
      <li>Si varias encajan, gana la <b>primera de la lista</b>: ordénalas con ↑ ↓ (las nuevas se colocan arriba).</li>
      <li>Al crear la regla verás con cuántos movimientos tuyos encaja. Cambiar o borrar una regla no modifica lo ya categorizado.</li>
    </ul>` },
  {
    icon: '📅', title: 'Períodos y fechas', open: 'period', body: `
    <ul>
      <li><b>Día, Semana, Mes, Año</b>: las flechas avanzan o retroceden una unidad. <b>Todo</b>: todo el historial.</li>
      <li><b>Intervalo personalizado</b>: las flechas lo desplazan manteniendo su duración. <b>Ir a un día concreto</b> y <b>Volver a hoy</b>.</li>
      <li>Al abrir la app, el período vuelve a hoy, conservando el tipo.</li>
      <li>En <b>Ajustes</b> eliges el día de inicio de la semana y del mes (si cobras el 25, los meses irán del 25 al 24).</li>
    </ul>` },
  {
    icon: '📋', title: 'La lista de movimientos', body: `
    <ul>
      <li><b>Categorías:</b> gastos e ingresos por categoría, con el número de movimientos, el porcentaje, el importe y, si tiene presupuesto, cuánto lleva usado. Toca para desplegar.</li>
      <li><b>Fechas:</b> por día, con el balance neto de cada uno.</li>
    </ul>
    <p>Las transferencias van en su propio bloque. <b>↻</b> indica un movimiento recurrente, <b>✂</b> uno dividido, y las etiquetas aparecen al final de cada fila (#viaje).</p>` },
  {
    icon: '💳', title: 'Cuentas', open: 'accounts', body: `
    <ul>
      <li><b>Tipos:</b> <b>Efectivo</b> y <b>Cuenta o tarjeta de débito</b> (tu <b>liquidez</b>), <b>Ahorro e inversión</b>, <b>Tarjeta de crédito</b> y <b>Préstamo o deuda</b>.</li>
      <li><b>Tarjeta de crédito:</b> su saldo es lo que debes. Con el <b>límite</b> ves el crédito disponible; con el <b>día de cierre</b>, lo gastado en el ciclo; con el <b>día de cargo</b>, el cobro estimado en «Próximos movimientos». Págala con una transferencia desde el banco.</li>
      <li><b>Préstamo o deuda:</b> escribe lo que debías al empezar (en positivo). Cada transferencia a la cuenta la reduce y verás el porcentaje devuelto.</li>
      <li><b>Patrimonio neto</b> = liquidez + ahorro − deudas.</li>
      <li><b>Incluir en el patrimonio y los totales:</b> desactívalo para seguir una cuenta aparte.</li>
      <li><b>Eliminar</b> una cuenta borra también sus movimientos.</li>
      <li><b>Ver una sola cuenta:</b> toca «Todas las cuentas» arriba.</li>
    </ul>` },
  {
    icon: '⇄', title: 'Transferencias entre cuentas', open: 'transfer', body: `
    <p>Mueven dinero entre tus cuentas sin contar como gasto ni ingreso: sacar del cajero, ahorrar, pagar la tarjeta de crédito… Pulsa <b>⇄</b> o la pestaña <b>Transferencia</b>. Con monedas distintas, verás cuánto llega al destino. En «Todas las cuentas» no afectan al gráfico; viendo una cuenta, sí.</p>` },
  {
    icon: '🏷️', title: 'Categorías', open: 'categories', body: `
    <ul>
      <li><b>Crear o editar:</b> nombre, tipo (no se puede cambiar después), icono, color y presupuesto mensual opcional.</li>
      <li><b>Ordenar</b> con ↑ ↓: es el orden del anillo del gráfico.</li>
      <li><b>Archivar</b> la oculta sin perder su historial. <b>Eliminar</b> borra la categoría, sus movimientos (también los divididos que tengan una parte en ella) y las reglas que la usan.</li>
    </ul>` },
  {
    icon: '🎯', title: 'Presupuestos', open: 'budget', body: `
    <ul>
      <li>Fija un límite <b>mensual</b> por categoría y, si quieres, uno total (vacío = suma de las categorías).</li>
      <li><b>Avisos</b> al llegar al <b>80 %</b> y al superarlo (también por las partes de un gasto dividido), y marcas ámbar o rojas en el anillo.</li>
      <li><b>Mostrar en el gráfico</b>: el centro enseña lo disponible y un anillo fino el progreso.</li>
      <li>Se adaptan al período visible (año, semana, día…). Solo cuentan los gastos. No se aplican mientras filtras por una etiqueta.</li>
    </ul>` },
  {
    icon: '🔁', title: 'Movimientos recurrentes', open: 'recurring', body: `
    <ul>
      <li><b>Crear:</b> al añadir un movimiento, elige <b>Repetir</b>. Las etiquetas y la división se copian en cada repetición.</li>
      <li>Se apuntan solos al abrir la app. Los del día 31 caen el último día de los meses cortos.</li>
      <li><b>Omitir una sola vez:</b> <b>Omitir el próximo</b> en Recurrentes, o apaga su interruptor en Próximos movimientos. La regla sigue para las demás fechas.</li>
      <li><b>⏸</b> detiene y <b>▶</b> reanuda (sin rellenar lo que pasó en pausa). Detener o eliminar nunca borra lo ya creado.</li>
    </ul>` },
  {
    icon: '📅', title: 'Próximos movimientos', open: 'upcoming', body: `
    <p>Lo que viene en los próximos 7, 30 o 90 días: repeticiones de recurrentes, movimientos con fecha futura y el cargo estimado de las tarjetas de crédito. Arriba ves cuánto sale y entra. Apaga el interruptor de una repetición para omitirla solo esa vez.</p>` },
  {
    icon: '📊', title: 'Análisis', open: 'analysis', body: `
    <ul>
      <li><b>Ingresos y gastos por mes</b> (6 o 12 meses), con tooltip, tabla y la media de los meses cerrados y tu tasa de ahorro.</li>
      <li><b>Este mes frente al anterior</b>, comparando los mismos días, y las categorías que más cambian.</li>
      <li><b>Media diaria</b> y previsión a fin de mes frente al presupuesto.</li>
      <li><b>Evolución por categoría</b> con una mini-gráfica cada una.</li>
      <li><b>Gasto por etiqueta</b>: toca una para filtrar la pantalla principal por ella.</li>
      <li>Usa la cuenta y la etiqueta que tengas elegidas arriba.</li>
    </ul>` },
  {
    icon: '💱', title: 'Monedas y tipos de cambio', open: 'currencies', body: `
    <p>Elige la moneda principal y escribe los tipos de cambio a mano («1 USD = 0,92 EUR»), para que funcione sin internet. Las conversiones usan siempre el tipo actual. Cambiar la moneda principal recalcula los tipos y los presupuestos.</p>` },
  {
    icon: '➡️', title: 'Arrastrar saldo', open: 'settings', body: `
    <p>Ajustes → <b>Arrastrar saldo</b>: al principio de la lista aparece el <b>Saldo anterior</b> (todo lo previo al período, con los saldos iniciales) y se suma al saldo, que así coincide con el dinero real al final de cada período. No se aplica al filtrar por etiqueta.</p>` },
  {
    icon: '🔍', title: 'Búsqueda', open: 'search', body: `
    <p>Pulsa la <b>lupa</b> (o <kbd>/</kbd>). Busca en todo el historial por nota, categoría (también las de las partes divididas), cuenta, <b>#etiqueta</b>, importe o fecha («2026-10»). No distingue mayúsculas ni tildes.</p>` },
  {
    icon: '💾', title: 'Exportar y copias de seguridad', open: 'data', body: `
    <ul>
      <li><b>Última copia</b> y aviso si pasan más de 30 días (con <b>Hacer copia</b> o <b>Más tarde</b>).</li>
      <li><b>Descargar copia (.json)</b> con todo: también etiquetas, divisiones y reglas. Si tus datos están cifrados, la copia también.</li>
      <li><b>Copia automática</b> (Chrome y Edge de ordenador): la app reescribe un archivo que elijas cada vez que cambias algo.</li>
      <li><b>Restaurar o combinar:</b> la copia se revisa entera antes de tocar nada. <b>Combinar</b> añade lo que falta sin duplicar; <b>Reemplazar</b> deja solo la copia.</li>
      <li><b>Exportar a CSV</b> (para Excel): con columnas de etiquetas y una fila por cada parte de un gasto dividido.</li>
    </ul>
    <p class="tip">⚠️ Los datos solo existen en este navegador. Haz copias de vez en cuando.</p>` },
  {
    icon: '🔒', title: 'Código y cifrado', open: 'security', body: `
    <ul>
      <li>Activa una <b>contraseña</b> (recomendada) o un <b>PIN de 4 dígitos</b>. Si el navegador lo permite (app abierta por https), los datos quedan <b>cifrados</b> (AES-GCM de 256 bits, clave PBKDF2-SHA-256 con 600.000 iteraciones).</li>
      <li>Un PIN solo tiene 10.000 combinaciones: frena a quien coja el móvil, no a alguien que copie los datos del navegador.</li>
      <li><b>Bloqueo automático</b> tras 1 minuto en segundo plano.</li>
    </ul>
    <p class="tip">⚠️ Si olvidas el código no hay forma de recuperar los datos cifrados.</p>` },
  {
    icon: '📲', title: 'Instalar y usar sin conexión', body: `
    <p><b>Android (Chrome):</b> ⋮ → Instalar aplicación. <b>iPhone (Safari):</b> Compartir → Añadir a pantalla de inicio. <b>Ordenador:</b> icono de instalar en la barra de direcciones. Solo hace falta internet la primera vez. Cada navegador y dispositivo tiene sus propios datos: usa la copia de seguridad (Combinar) para juntarlos.</p>` },
  {
    icon: '⌨️', title: 'Atajos de teclado', body: `
    <ul>
      <li><kbd>−</kbd> nuevo gasto · <kbd>+</kbd> nuevo ingreso · <kbd>←</kbd> <kbd>→</kbd> cambiar de período</li>
      <li><kbd>/</kbd> buscar · <kbd>?</kbd> esta guía · <kbd>Esc</kbd> cerrar</li>
      <li>En el editor, el teclado escribe en la calculadora y <kbd>Intro</kbd> guarda (en el campo de etiquetas, <kbd>Intro</kbd> añade la etiqueta).</li>
    </ul>` },
  {
    icon: '❓', title: 'Preguntas frecuentes', body: `
    <p><b>¿Por qué el «Saldo» no coincide con el patrimonio del menú?</b><br>El saldo es el del <i>período</i>; el patrimonio suma todo el historial y los saldos iniciales. Activa «Arrastrar saldo» si quieres que coincidan.</p>
    <p><b>¿Por qué las etiquetas no salen en el gráfico circular?</b><br>Porque un movimiento puede tener varias y sus totales se solaparían. Usa la etiqueta como filtro: el gráfico te dirá en qué categorías se fue ese dinero.</p>
    <p><b>¿Qué diferencia hay entre dividir un gasto y etiquetarlo?</b><br>Dividir reparte el <i>importe</i> entre categorías (40 € comida + 12 € limpieza). La etiqueta no reparte nada: marca el movimiento entero con un motivo (#cumpleaños-ana).</p>
    <p><b>¿Por qué una transferencia no aparece en el gráfico?</b><br>Mover dinero entre tus cuentas no es un gasto.</p>
    <p><b>¿Mis datos se envían a algún sitio?</b><br>No. Todo se guarda en tu dispositivo; nada sale de él salvo los archivos que tú exportes.</p>` },
];

export function openHelp() {
  const openers = {
    expense: ['Añadir un gasto', () => openTxSheet({ type: 'expense' })],
    transfer: ['Nueva transferencia', () => openTxSheet({ type: 'transfer' })],
    period: ['Elegir período', openPeriodSheet],
    accounts: ['Abrir Cuentas', openAccounts],
    categories: ['Abrir Categorías', () => openCategories('expense')],
    tags: ['Abrir Etiquetas', openTags],
    import: ['Importar del banco', openCsvImport],
    rules: ['Abrir Reglas', openRules],
    budget: ['Abrir Presupuestos', openBudget],
    analysis: ['Abrir Análisis', openAnalysis],
    upcoming: ['Abrir Próximos movimientos', openUpcoming],
    recurring: ['Abrir Recurrentes', openRecurring],
    currencies: ['Abrir Monedas', openCurrencies],
    search: ['Abrir búsqueda', openSearch],
    data: ['Abrir Exportar y copias', openData],
    security: ['Abrir Código y cifrado', openSecurity],
    settings: ['Abrir Ajustes', () => import('./menu.js').then((m) => m.openSettings())],
  };
  const sh = openSheet({ title: 'Guía de uso', cls: 'sheet-tall' });
  sh.body.innerHTML = `
    <div class="search-box">${icon('search')}<input type="search" placeholder="Buscar en la guía" autocomplete="off" aria-label="Buscar en la guía"></div>
    <p class="muted small">Toca un apartado para desplegarlo. Puedes volver aquí cuando quieras desde el menú ☰ → Guía de uso.</p>
    <div class="help">${HELP.map((h, i) => `<details class="help-sec" data-i="${i}">
      <summary><span class="help-ico" aria-hidden="true">${h.icon}</span><span class="grow">${esc(h.title)}</span>${icon('chevD')}</summary>
      <div class="help-body">${h.body}${h.open && openers[h.open] ? `<button class="btn sm help-go" data-open="${h.open}">${esc(openers[h.open][0])} ${icon('chevR')}</button>` : ''}</div>
    </details>`).join('')}</div>
    <p class="muted center help-none" hidden>Nada coincide con tu búsqueda.</p>`;
  const index = HELP.map((h) => norm(h.title + ' ' + h.body.replace(/<[^>]+>/g, ' ')));
  const secs = $$('.help-sec', sh.body);
  $('input', sh.body).addEventListener('input', (e) => {
    const q = norm(e.target.value.trim());
    let shown = 0;
    secs.forEach((el, i) => {
      const hit = !q || index[i].includes(q);
      el.hidden = !hit;
      if (hit) shown++;
      el.open = !!q && hit;
    });
    $('.help-none', sh.body).hidden = shown > 0;
  });
  sh.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) openers[b.dataset.open][1]();
  });
}
