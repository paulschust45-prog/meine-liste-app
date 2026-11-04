package de.meineliste.app.guard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import de.meineliste.app.MainActivity;

/**
 * Nach dem Einschalten: Läuft noch ein Fokus, öffnet sich Meine Liste sofort wieder.
 * (Die App-Sperren greifen ohnehin, weil der Bedienungshilfe-Dienst automatisch startet.)
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(a)) return;
        GuardStore s = new GuardStore(c);
        if (!s.focusOn()) return;
        try {
            Intent i = new Intent(c, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            i.putExtra("guard", "boot");
            c.startActivity(i);
        } catch (Exception ignored) {
            // Android kann Starts aus dem Hintergrund blockieren – der Dienst holt die App beim nächsten App-Wechsel zurück.
        }
    }
}
