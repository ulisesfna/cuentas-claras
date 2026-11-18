package io.github.ulisesfna.cuentasclaras;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/** Puente entre la app (JavaScript) y las actualizaciones. En JS: Capacitor.registerPlugin('Actualizar') */
@CapacitorPlugin(name = "Actualizar", permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "avisos") })
public class ActualizarPlugin extends Plugin {

    private static volatile ActualizarPlugin abierto;

    @Override
    public void load() {
        abierto = this;
    }

    /** Error del instalador de Android: avisar a la app (evento «instalacion») */
    static void avisarInstalacion(String error) {
        ActualizarPlugin p = abierto;
        if (p == null) return;
        try {
            p.notifyListeners("instalacion", new JSObject().put("error", error));
        } catch (RuntimeException ignored) {}
    }

    /** { build: versión del APK, nativo: huella de la parte nativa, web: versión de la web en uso } */
    @PluginMethod
    public void version(PluginCall call) {
        call.resolve(new JSObject()
            .put("build", Actualizar.versionApk(getContext()))
            .put("nativo", Version.NATIVO)
            .put("web", Actualizar.webActual(getContext(), getBridge().getServerBasePath())));
    }

    /** La web ha arrancado bien (si no llega, la próxima vez se vuelve a la del APK) */
    @PluginMethod
    public void webOk(PluginCall call) {
        Actualizar.webOk(getContext());
        call.resolve();
    }

    /** version.json de la última versión publicada en GitHub */
    @PluginMethod
    public void buscarVersion(PluginCall call) {
        new Thread(() -> {
            try {
                call.resolve(JSObject.fromJSONObject(Actualizar.buscar()));
            } catch (Exception e) {
                call.reject(mensaje(e));
            }
        }).start();
    }

    /** Descarga la web nueva ({ build, web: sha256, nativo }); queda lista para aplicarWeb o para la próxima vez */
    @PluginMethod
    public void bajarWeb(PluginCall call) {
        int build = call.getInt("build", 0);
        String sha = call.getString("web", "");
        String nativo = call.getString("nativo", "");
        new Thread(() -> {
            try {
                Actualizar.bajarWeb(getContext(), build, sha, nativo);
                call.resolve(new JSObject().put("build", build));
            } catch (Exception e) {
                call.reject(mensaje(e));
            }
        }).start();
    }

    /** Pasa ya a la web descargada ({ build }): Capacitor recarga la app desde ella */
    @PluginMethod
    public void aplicarWeb(PluginCall call) {
        int build = call.getInt("build", 0);
        if (!new java.io.File(Actualizar.carpetaDe(getContext(), build), "index.html").exists()) {
            call.reject("Esa versión no está descargada");
            return;
        }
        call.resolve();
        getBridge().setServerBasePath(Actualizar.usar(getContext(), build));
    }

    /** Descarga e instala el APK nuevo ({ url }); el progreso llega como evento «descarga» { pct } */
    @PluginMethod
    public void instalarApk(PluginCall call) {
        if (!Actualizar.puedeInstalar(getContext())) {
            // Hay que permitir una vez que esta app instale actualizaciones
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getActivity().startActivity(i);
            } catch (Exception ignored) {}
            call.reject("Permite que «Cuentas Claras» instale aplicaciones y vuelve a pulsar Actualizar", "PERMISO");
            return;
        }
        String url = call.getString("url", "");
        new Thread(() -> {
            try {
                Actualizar.instalarApk(getContext(), url, (p) -> notifyListeners("descarga", new JSObject().put("pct", p)));
                call.resolve();
            } catch (Exception e) {
                call.reject(mensaje(e));
            }
        }).start();
    }

    private static String mensaje(Exception e) {
        if (e instanceof java.net.UnknownHostException || e instanceof java.net.SocketTimeoutException) return "Sin conexión con GitHub";
        return e.getMessage() != null ? e.getMessage() : e.toString();
    }
}
