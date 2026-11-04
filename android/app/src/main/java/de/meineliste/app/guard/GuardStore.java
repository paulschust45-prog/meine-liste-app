package de.meineliste.app.guard;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Speichert die Sperr-Regeln dauerhaft auf dem Gerät.
 * Bleibt nach Neustart erhalten – der Bedienungshilfe-Dienst liest sie direkt.
 */
public class GuardStore {
    private static final String NAME = "meine_liste_guard";
    private final SharedPreferences p;

    public GuardStore(Context c) {
        p = c.getApplicationContext().getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    // ---------- App-Sperre (Handykontrolle / Hardcore) ----------
    public boolean rulesOn() { return p.getBoolean("rulesOn", false); }
    public Set<String> apps() { return new HashSet<>(p.getStringSet("apps", new HashSet<>())); }
    /** 1 = Erinnern (wegklickbar), 2 = Streng, 3 = Kompromisslos (auch Einstellungen gesperrt) */
    public int level() { return p.getInt("level", 2); }
    public boolean pauseAllowed() { return p.getBoolean("pauseAllowed", false); }
    public String hash() { return p.getString("hash", ""); }
    public String message() { return p.getString("message", "Erst die Aufgabe, dann das Handy."); }

    public void setRules(boolean on, Set<String> apps, int level, boolean pauseAllowed, String hash, String message) {
        p.edit()
            .putBoolean("rulesOn", on)
            .putStringSet("apps", apps)
            .putInt("level", Math.max(1, Math.min(3, level)))
            .putBoolean("pauseAllowed", pauseAllowed)
            .putString("hash", hash == null ? "" : hash)
            .putString("message", message == null ? "" : message)
            .apply();
    }

    // ---------- Fokus-Sperre (nur Meine Liste erlaubt) ----------
    public boolean focusOn() {
        if (!p.getBoolean("focusOn", false)) return false;
        long until = p.getLong("focusUntil", 0);
        if (until > 0 && System.currentTimeMillis() > until) {
            stopFocus();
            return false;
        }
        return true;
    }
    public String focusTask() { return p.getString("focusTask", ""); }
    public String focusHash() { return p.getString("focusHash", ""); }
    public int focusLevel() { return p.getInt("focusLevel", 2); }

    public void startFocus(String task, long until, String hash, int level) {
        p.edit()
            .putBoolean("focusOn", true)
            .putString("focusTask", task == null ? "" : task)
            .putLong("focusUntil", until)
            .putString("focusHash", hash == null ? "" : hash)
            .putInt("focusLevel", level)
            .apply();
    }
    public void stopFocus() {
        p.edit().putBoolean("focusOn", false).remove("focusTask").remove("focusUntil").remove("focusHash").apply();
    }

    // ---------- Eigener Sperrbildschirm ----------
    public String quote() { return p.getString("scr_quote", ""); }
    public int waitSec() { return p.getInt("scr_wait", 10); }
    public boolean showTime() { return p.getBoolean("scr_time", true); }
    /** Frist (HH:MM), z. B. bei Hardcore – für „noch X bis …“ */
    public String until() { return p.getString("scr_until", ""); }
    public void setScreen(String quote, int wait, boolean time, String until) {
        p.edit()
            .putString("scr_quote", quote == null ? "" : quote)
            .putInt("scr_wait", Math.max(0, Math.min(60, wait)))
            .putBoolean("scr_time", time)
            .putString("scr_until", until == null ? "" : until)
            .apply();
    }

    // ---------- Notfall-Code ----------
    private static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.GERMANY).format(new Date());
    }
    /** Sperre bis Mitternacht aus (nach richtigem Notfall-Code) */
    public void emergencyOff() { p.edit().putString("emergency_day", today()).apply(); }
    public boolean emergencyActive() { return today().equals(p.getString("emergency_day", "")); }

    /** Gleicher Hash wie in der Web-App: SHA-256 von "meine-liste:" + Code (klein, ohne Leerzeichen am Rand) */
    public static String hashCode(String word) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(("meine-liste:" + word.trim().toLowerCase(Locale.ROOT)).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    // ---------- Kurze Freigaben ----------
    /** Wegklicken bei Stufe 1: eine App für kurze Zeit freigeben */
    public void allow(String pkg, long ms) { p.edit().putLong("pass_" + pkg, System.currentTimeMillis() + ms).apply(); }
    public boolean allowed(String pkg) {
        return System.currentTimeMillis() < Math.max(p.getLong("pass_" + pkg, 0), p.getLong("pause_until", 0));
    }

    /** Notfall-Pause: 5 Minuten, höchstens 3× pro Tag */
    public int pausesLeft() {
        String day = new SimpleDateFormat("yyyy-MM-dd", Locale.GERMANY).format(new Date());
        if (!day.equals(p.getString("pause_day", ""))) return 3;
        return Math.max(0, 3 - p.getInt("pause_count", 0));
    }
    public boolean takePause() {
        if (!pauseAllowed() || pausesLeft() <= 0) return false;
        String day = new SimpleDateFormat("yyyy-MM-dd", Locale.GERMANY).format(new Date());
        int n = day.equals(p.getString("pause_day", "")) ? p.getInt("pause_count", 0) : 0;
        p.edit()
            .putString("pause_day", day)
            .putInt("pause_count", n + 1)
            .putLong("pause_until", System.currentTimeMillis() + 5 * 60 * 1000)
            .apply();
        return true;
    }
}
