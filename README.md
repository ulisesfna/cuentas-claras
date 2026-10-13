# Cuentas Claras

Gestor de gastos personal inspirado en las funciones de [Monefy](https://www.monefy.com/).
Es una aplicación web progresiva (PWA): funciona en el navegador, se puede instalar en el
móvil o en el ordenador como una app más y sigue funcionando sin conexión.

No tiene dependencias ni paso de compilación: HTML, CSS y JavaScript.

## Cómo ejecutarla

```bash
python -m http.server 5173
```

Después abre <http://localhost:5173>. También funciona abriendo `index.html` directamente,
pero entonces no se activa el modo sin conexión ni la instalación.

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
| Varias cuentas y transferencias entre ellas | Cuentas con icono, moneda, saldo inicial y opción «incluir en el total»; transferencias con conversión de moneda |
| Varias monedas | Moneda principal y tipos de cambio manuales (sin depender de internet) |
| Categorías personalizables | Crear, editar (icono y color), reordenar, archivar y eliminar |
| Modo presupuesto | Presupuesto mensual que se ajusta al período visible, con anillo de progreso |
| Movimientos recurrentes | Diario, semanal, mensual o anual; se generan solos al abrir la app; se pueden pausar |
| Arrastrar saldo (carry over) | Opción en Ajustes |
| Lista agrupada por categoría | Por categoría (desplegable con porcentajes) o por fecha |
| Búsqueda | Por nota, categoría, cuenta, importe o fecha |
| Protección con contraseña | Código PIN de 4 dígitos con bloqueo automático |
| Exportar a CSV | CSV del período visible o de todo el historial (se abre en Excel) |
| Copia en Dropbox / Google Drive | Copia de seguridad en archivo `.json` que se puede restaurar en otro dispositivo |
| Tema oscuro | Automático, claro u oscuro |
| Inicio de mes personalizado | El mes puede empezar cualquier día del 1 al 28 |

Además: deshacer un borrado, sincronización entre pestañas abiertas, atajos de teclado
(`−` gasto, `+` ingreso, `/` buscar, `?` guía, `←`/`→` cambiar de período, `Esc` cerrar) y una
**Guía de uso** integrada (menú ☰ → Guía de uso) que explica cada función en detalle, con
buscador y accesos directos a cada pantalla.

### Diferencias

- **Sincronización en la nube**: no hay servidor, así que no se sincroniza sola. Para pasar
  los datos de un dispositivo a otro se usa la copia de seguridad (Exportar y copias).
- **Widget de pantalla de inicio**: las apps web no pueden crear widgets nativos.
- **Seguridad del código**: el PIN impide el acceso casual, pero los datos no se cifran.

## Estructura

```
index.html            Estructura de la pantalla principal
css/styles.css        Estilos (tema claro y oscuro, móvil y escritorio)
js/app.js             Toda la lógica: datos, cálculos, pantallas
sw.js                 Service worker (modo sin conexión)
manifest.webmanifest  Datos para instalar la app
icons/                Iconos
```

Los datos se guardan en `localStorage` con la clave `cuentas-claras:v1`.
