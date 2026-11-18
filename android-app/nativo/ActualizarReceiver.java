package io.github.ulisesfna.cuentasclaras;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Respuesta del instalador de Android y aviso de «app actualizada» */
public class ActualizarReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String accion = intent.getAction();
        if (Actualizar.INSTALADA.equals(accion)) {
            // Confirmar, error o cancelada
            Actualizar.resultado(ctx, intent);
        } else if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(accion)) {
            Actualizar.trasActualizar(ctx);
        }
    }
}
