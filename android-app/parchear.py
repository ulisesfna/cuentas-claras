"""Paso 2 de la compilación del APK: adapta el proyecto Android que crea `npx cap add android`.

· Icono (el anillo de Cuentas Claras) y pantalla de carga, en claro y en oscuro.
· Barra de estado del color de la cabecera, sin dibujar la app debajo (Android 15).
· Android 8 como mínimo y número de versión = número de compilación (BUILD).
· Firma siempre con la misma llave, para poder actualizar encima sin perder los datos.
"""
import glob
import json
import math
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(AQUI, 'android', 'app')
MAIN = os.path.join(APP, 'src', 'main')
RES = os.path.join(MAIN, 'res')
BUILD = int(os.environ.get('BUILD') or 1)

# Colores de css/styles.css (--head y --bg) e icons/icon.svg
VERDE, VERDE_OSCURO = '#FF0F766E', '#FF0C3B37'
FONDO, FONDO_OSCURO = '#FFF2F5F4', '#FF0B1110'
ARCOS = (('#FF5EEAD4', 0, 320), ('#FFFBBF24', 330, 200), ('#FFFB7185', 540, 154))  # color, inicio y largo (icon-maskable.svg)
CIRCUNFERENCIA = 2 * math.pi * 112


def leer(ruta):
    with open(ruta, encoding='utf-8') as f:
        return f.read()


def escribir(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(texto)


def cambiar(ruta, patron, nuevo, obligatorio=True):
    texto = leer(ruta)
    texto2, n = re.subn(patron, nuevo, texto, count=1)
    if obligatorio and n == 0:
        raise SystemExit(f'{ruta}: no se encontró {patron!r}')
    escribir(ruta, texto2)


# ---------------- Icono de la app (adaptable): el anillo de colores ----------------
# Lienzo de 108 dp; el anillo cabe en la zona segura (círculo de 66 dp en el centro).
# Mismas proporciones que icons/icon-maskable.svg (512 px → 108 dp).

ESCALA = 108 / 512
RADIO, GROSOR = 112 * ESCALA, 50 * ESCALA


def punto(grados):
    a = math.radians(grados)  # desde arriba, en el sentido de las agujas del reloj
    return f'{54 + RADIO * math.sin(a):.2f},{54 - RADIO * math.cos(a):.2f}'


def arco(inicio, largo):
    a, b = inicio / CIRCUNFERENCIA * 360, (inicio + largo) / CIRCUNFERENCIA * 360
    grande = 1 if b - a > 180 else 0
    return f'M{punto(a)}A{RADIO:.2f},{RADIO:.2f} 0 {grande} 1 {punto(b)}'


anillo = '\n'.join(
    f'    <path android:strokeColor="{c}" android:strokeWidth="{GROSOR:.2f}" android:pathData="{arco(i, l)}" />'
    for c, i, l in ARCOS)

CABECERA = '''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">'''

escribir(os.path.join(RES, 'drawable', 'ic_cuentas_fondo.xml'),
         f'{CABECERA}\n    <path android:fillColor="{VERDE}" android:pathData="M0,0h108v108h-108z" />\n</vector>\n')
escribir(os.path.join(RES, 'drawable', 'ic_cuentas_frente.xml'), f'{CABECERA}\n{anillo}\n</vector>\n')
# Icono completo con esquinas redondeadas (para la pantalla de carga)
escribir(os.path.join(RES, 'drawable', 'ic_cuentas_entero.xml'), f'''{CABECERA}
    <path android:fillColor="{VERDE}" android:pathData="M24,0h60a24,24 0 0 1 24,24v60a24,24 0 0 1 -24,24h-60a24,24 0 0 1 -24,-24v-60a24,24 0 0 1 24,-24z" />
{anillo}
</vector>
''')
adaptable = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_cuentas_fondo" />
    <foreground android:drawable="@drawable/ic_cuentas_frente" />
    <monochrome android:drawable="@drawable/ic_cuentas_frente" />
</adaptive-icon>
'''
for nombre in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    escribir(os.path.join(RES, 'mipmap-anydpi-v26', nombre), adaptable)

# ---------------- Pantalla de carga: fondo de la app con el icono en el centro ----------------

for png in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
    os.remove(png)
for carpeta, fondo in (('drawable', FONDO), ('drawable-night', FONDO_OSCURO)):
    escribir(os.path.join(RES, carpeta, 'splash.xml'), f'''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item><color android:color="{fondo}" /></item>
    <item android:drawable="@drawable/ic_cuentas_entero" android:gravity="center" android:width="128dp" android:height="128dp" />
</layer-list>
''')

# ---------------- Tema: barra de estado del color de la cabecera ----------------

for carpeta, color in (('values', VERDE), ('values-night', VERDE_OSCURO)):
    escribir(os.path.join(RES, carpeta, 'cuentas_colores.xml'), f'''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="cuentas_barra">{color}</color>
</resources>
''')
estilos = os.path.join(RES, 'values', 'styles.xml')
for estilo in ('AppTheme.NoActionBar', 'AppTheme.NoActionBarLaunch'):
    cambiar(estilos, r'(<style name="' + re.escape(estilo) + r'"[^>]*>)',
            r'\1\n        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>'
            r'\n        <item name="android:statusBarColor">@color/cuentas_barra</item>')

# ---------------- Versión y Android mínimo ----------------

cambiar(os.path.join(AQUI, 'android', 'variables.gradle'), r'minSdkVersion\s*=\s*\d+', 'minSdkVersion = 26')
gradle = os.path.join(APP, 'build.gradle')
cambiar(gradle, r'versionCode\s+\d+', f'versionCode {BUILD}')
cambiar(gradle, r'versionName\s+"[^"]*"', f'versionName "1.{BUILD}"')

# Firma: siempre con la misma llave (si cambia, Android no deja actualizar encima)
llave = os.environ.get('KEYSTORE_FILE')
if llave:
    firma = f'''android {{
    signingConfigs {{
        debug {{
            storeFile file({json.dumps(llave)})
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }}
    }}'''
    cambiar(gradle, r'android\s*\{', firma.replace('\\', '\\\\'))

print('Proyecto Android adaptado (versión', BUILD, ')')
