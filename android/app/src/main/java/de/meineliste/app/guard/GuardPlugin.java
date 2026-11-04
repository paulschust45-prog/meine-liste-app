package de.meineliste.app.guard;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import android.util.Base64;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Brücke zwischen der Web-App und der Handykontrolle.
 * Gleiche Methoden gibt es später auf dem iPhone (siehe ios/App/App/GuardPlugin.swift).
 */
@CapacitorPlugin(name = "Guard")
public class GuardPlugin extends Plugin {

    private GuardStore store() {
        return new GuardStore(getContext());
    }

    private boolean serviceEnabled() {
        String enabled = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        ComponentName me = new ComponentName(getContext(), GuardService.class);
        for (String s : enabled.split(":")) {
            ComponentName c = ComponentName.unflattenFromString(s);
            if (c != null && c.equals(me)) return true;
        }
        return false;
    }

    @PluginMethod
    public void status(PluginCall call) {
        GuardStore s = store();
        JSObject r = new JSObject();
        r.put("platform", "android");
        r.put("ready", serviceEnabled());
        r.put("rulesOn", s.rulesOn());
        r.put("focusOn", s.focusOn());
        r.put("apps", new JSArray(s.apps()));
        r.put("pausesLeft", s.pausesLeft());
        call.resolve(r);
    }

    /** Öffnet die Bedienungshilfe-Einstellungen, damit der Nutzer den Dienst einschaltet */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Installierte Apps (Name + Paket) für die Auswahl */
    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
        JSArray out = new JSArray();
        Set<String> seen = new HashSet<>();
        for (ResolveInfo ri : list) {
            String pkg = ri.activityInfo.packageName;
            if (pkg.equals(getContext().getPackageName()) || !seen.add(pkg)) continue;
            JSObject o = new JSObject();
            o.put("id", pkg);
            o.put("name", ri.loadLabel(pm).toString());
            out.put(o);
        }
        JSObject r = new JSObject();
        r.put("apps", out);
        call.resolve(r);
    }

    /** Regeln setzen: { on, apps: [paketnamen], level 1–3, pause, hash, message } */
    @PluginMethod
    public void setRules(PluginCall call) {
        GuardStore s = store();
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        String hash = call.getString("hash", "");
        // Ausschalten bei Stufe 2+ nur mit passendem Codewort-Hash
        if (!on && s.rulesOn() && s.level() >= 2 && !s.hash().isEmpty() && !s.hash().equals(hash)) {
            call.reject("Falsches Codewort");
            return;
        }
        Set<String> apps = new HashSet<>();
        JSArray arr = call.getArray("apps", new JSArray());
        try {
            for (Object o : arr.toList()) if (o != null) apps.add(o.toString());
        } catch (JSONException e) {
            call.reject("Ungültige App-Liste");
            return;
        }
        Integer level = call.getInt("level", 2);
        s.setRules(on, apps, level == null ? 2 : level, Boolean.TRUE.equals(call.getBoolean("pause", false)), hash,
            call.getString("message", "Erst die Aufgabe, dann das Handy."));
        s.setSkip(call.getString("skip", "limited"));
        call.resolve();
    }

    /** Fokus: nur Meine Liste ist erlaubt, bis {until} (ms) oder bis stopFocus */
    @PluginMethod
    public void startFocus(PluginCall call) {
        Long until = call.getLong("until", 0L);
        Integer level = call.getInt("level", 2);
        store().startFocus(call.getString("task", ""), until == null ? 0 : until, call.getString("hash", ""), level == null ? 2 : level);
        call.resolve();
    }

    /** Sperrbildschirm: { image (Base64), imageUrl, quote, wait, time, until } */
    @PluginMethod
    public void setScreen(PluginCall call) {
        GuardStore s = store();
        Integer wait = call.getInt("wait", 10);
        s.setScreen(call.getString("quote", ""), wait == null ? 10 : wait,
            Boolean.TRUE.equals(call.getBoolean("time", true)), call.getString("until", ""));
        final String b64 = call.getString("image", "");
        final String url = call.getString("imageUrl", "");
        final File out = BlockActivity.bgFile(getContext());
        new Thread(() -> {
            try {
                if (b64 != null && !b64.isEmpty()) {
                    byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                    try (OutputStream os = new FileOutputStream(out)) {
                        os.write(bytes);
                    }
                } else if (url != null && url.startsWith("https://")) {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    try (InputStream is = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
                    } finally {
                        c.disconnect();
                    }
                } else if (out.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Bild konnte nicht gespeichert werden");
            }
        }).start();
    }

    @PluginMethod
    public void stopFocus(PluginCall call) {
        GuardStore s = store();
        String hash = call.getString("hash", "");
        if (!s.focusHash().isEmpty() && !s.focusHash().equals(hash)) {
            call.reject("Falsches Codewort");
            return;
        }
        s.stopFocus();
        call.resolve();
    }
}
