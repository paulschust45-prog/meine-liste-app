package de.meineliste.app.guard;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;

import de.meineliste.app.MainActivity;

/**
 * Bedienungshilfe-Dienst: merkt, welche App gerade vorne ist,
 * und legt bei gesperrten Apps den Sperrbildschirm darüber.
 * Startet nach einem Neustart automatisch wieder (sobald er einmal erlaubt wurde).
 */
public class GuardService extends AccessibilityService {
    private GuardStore store;
    private String last = "";
    private long lastAt = 0;

    @Override
    protected void onServiceConnected() {
        store = new GuardStore(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        if (e.getPackageName() == null) return;
        if (store == null) store = new GuardStore(this);
        String pkg = e.getPackageName().toString();
        if (pkg.equals(getPackageName()) || isAlwaysAllowed(pkg)) return;

        // Nicht dauernd neu auslösen, wenn dieselbe App mehrere Fenster meldet
        long now = System.currentTimeMillis();
        if (pkg.equals(last) && now - lastAt < 800) return;
        last = pkg;
        lastAt = now;

        // 1) Fokus läuft: nur Meine Liste ist erlaubt
        if (store.focusOn()) {
            boolean strict = store.focusLevel() >= 3;
            if (!strict && isSettings(pkg)) return;
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            i.putExtra("guard", "focus");
            startActivity(i);
            BlockActivity.toast(this, "Erst das: " + store.focusTask());
            return;
        }

        // 2) Gesperrte App (Handykontrolle / Hardcore)
        if (!store.rulesOn() || store.allowed(pkg)) return;
        boolean blocked = store.apps().contains(pkg) || (store.level() >= 3 && isSettings(pkg) && store.apps().size() > 0);
        if (!blocked) return;
        Intent b = new Intent(this, BlockActivity.class);
        b.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        b.putExtra("pkg", pkg);
        startActivity(b);
    }

    /** Telefon, Notruf, Tastatur und Systemleiste bleiben immer erreichbar */
    private boolean isAlwaysAllowed(String pkg) {
        return pkg.equals("com.android.systemui")
            || pkg.contains("dialer")
            || pkg.equals("com.android.phone")
            || pkg.equals("com.android.server.telecom")
            || pkg.contains("emergency")
            || pkg.contains("inputmethod")
            || pkg.contains("keyboard")
            || pkg.equals("com.google.android.permissioncontroller")
            || pkg.equals("com.android.permissioncontroller");
    }

    private boolean isSettings(String pkg) {
        return pkg.equals("com.android.settings") || pkg.endsWith(".settings");
    }

    @Override
    public void onInterrupt() {}
}
