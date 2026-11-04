package de.meineliste.app.guard;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.InputType;
import android.widget.EditText;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

import de.meineliste.app.MainActivity;

/**
 * Vollbild-Sperre über gesperrten Apps – mit eigenem Bild, Spruch, Uhr und Warte-Timer.
 * „Zurück“ führt immer zu Meine Liste. Stufe 1 erlaubt kurzes Wegklicken (nach dem Timer).
 */
public class BlockActivity extends Activity {
    private GuardStore store;
    private String pkg = "";
    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView clock;
    private TextView rest;
    private Button later;
    private String laterLabel = "";
    private int waitLeft = 0;

    static File bgFile(Context c) {
        return new File(c.getFilesDir(), "lock_bg.jpg");
    }

    static void toast(Context c, String msg) {
        try {
            Toast.makeText(c, msg, Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {
        }
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setTextColor(primary ? Color.parseColor("#141211") : Color.parseColor("#F2ECE6"));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(26));
        bg.setColor(primary ? Color.parseColor("#F2ECE6") : Color.parseColor("#22000000"));
        if (!primary) bg.setStroke(dp(1), Color.parseColor("#66F2ECE6"));
        b.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private TextView text(float sp, String color, Typeface tf) {
        TextView t = new TextView(this);
        t.setTextSize(sp);
        t.setTextColor(Color.parseColor(color));
        t.setTypeface(tf);
        t.setGravity(Gravity.CENTER);
        t.setShadowLayer(dp(8), 0, dp(1), Color.parseColor("#99000000"));
        return t;
    }

    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        store = new GuardStore(this);
        pkg = getIntent().getStringExtra("pkg");
        if (pkg == null) pkg = "";

        String name = pkg;
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            name = pm.getApplicationLabel(ai).toString();
        } catch (Exception ignored) {
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#141211"));

        // Hintergrundbild (Motivationsbild oder eigenes Foto)
        File f = bgFile(this);
        if (f.exists()) {
            try {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inSampleSize = 1;
                Bitmap bmp = BitmapFactory.decodeFile(f.getAbsolutePath(), o);
                if (bmp != null) {
                    ImageView iv = new ImageView(this);
                    iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
                    iv.setImageBitmap(bmp);
                    root.addView(iv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                }
            } catch (Exception ignored) {
            }
        }
        View shade = new View(this);
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] { Color.parseColor("#44000000"), Color.parseColor("#88000000"), Color.parseColor("#EE0A0908") });
        shade.setBackground(g);
        root.addView(shade, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Uhr oben
        if (store.showTime()) {
            LinearLayout top = new LinearLayout(this);
            top.setOrientation(LinearLayout.VERTICAL);
            top.setGravity(Gravity.CENTER_HORIZONTAL);
            top.setPadding(dp(24), dp(64), dp(24), 0);
            clock = text(64, "#F2ECE6", Typeface.create(Typeface.SERIF, Typeface.NORMAL));
            top.addView(clock);
            rest = text(14, "#CCF2ECE6", Typeface.DEFAULT);
            top.addView(rest);
            root.addView(top, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        }

        // Unten: Spruch und Knöpfe
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setPadding(dp(28), dp(28), dp(28), dp(40));

        TextView badge = text(12, "#E0533F", Typeface.DEFAULT_BOLD);
        badge.setText(store.level() >= 2 ? "GESPERRT · " + name.toUpperCase(Locale.GERMANY) : name.toUpperCase(Locale.GERMANY));
        badge.setLetterSpacing(0.18f);
        box.addView(badge);

        TextView quote = text(28, "#F2ECE6", Typeface.SERIF);
        String q = store.quote();
        quote.setText(q.isEmpty() ? store.message() : q);
        quote.setPadding(0, dp(14), 0, dp(8));
        box.addView(quote);

        TextView msg = text(15, "#CCF2ECE6", Typeface.DEFAULT);
        msg.setText(store.message());
        msg.setPadding(0, 0, 0, dp(22));
        if (!q.isEmpty()) box.addView(msg);

        Button back = button("Zurück zu Meine Liste", true);
        back.setOnClickListener(v -> goHome());
        box.addView(back);

        if (store.level() <= 1) {
            laterLabel = "Weiter";
            later = button(laterLabel, false);
            later.setOnClickListener(v -> {
                if (waitLeft > 0) return;
                store.allow(pkg, 5 * 60 * 1000);
                openTarget();
            });
            box.addView(later);
        } else if (store.pauseAllowed() && store.pausesLeft() > 0) {
            laterLabel = "Notfall-Pause 5 Min. (" + store.pausesLeft() + " übrig)";
            later = button(laterLabel, false);
            later.setOnClickListener(v -> {
                if (waitLeft > 0) return;
                if (store.takePause()) openTarget();
            });
            box.addView(later);
        }
        // Notfall-Code: schaltet die Sperre bis Mitternacht ab
        if (!store.hash().isEmpty()) {
            TextView code = text(14, "#CCF2ECE6", Typeface.DEFAULT);
            code.setText("Notfall-Code eingeben");
            code.setPadding(0, dp(18), 0, dp(4));
            code.setOnClickListener(v -> askCode());
            box.addView(code);
        }
        root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        setContentView(root);

        // Warte-Timer: erst nach X Sekunden lässt sich die Sperre umgehen
        waitLeft = later != null ? store.waitSec() : 0;
        tick();
    }

    private void tick() {
        if (clock != null) {
            clock.setText(new SimpleDateFormat("HH:mm", Locale.GERMANY).format(new Date()));
            String u = store.until();
            if (u.matches("\\d{2}:\\d{2}")) {
                Calendar c = Calendar.getInstance();
                c.set(Calendar.HOUR_OF_DAY, Integer.parseInt(u.substring(0, 2)));
                c.set(Calendar.MINUTE, Integer.parseInt(u.substring(3)));
                c.set(Calendar.SECOND, 0);
                long left = c.getTimeInMillis() - System.currentTimeMillis();
                rest.setText(left > 0
                    ? "Noch " + (left / 3600000 > 0 ? left / 3600000 + " h " : "") + (left % 3600000) / 60000 + " min bis " + u
                    : "Frist " + u + " vorbei – erledige es trotzdem");
            } else {
                rest.setText("");
            }
        }
        if (later != null) {
            if (waitLeft > 0) {
                later.setEnabled(false);
                later.setAlpha(0.55f);
                later.setText("Atme durch … " + waitLeft);
                waitLeft--;
            } else {
                later.setEnabled(true);
                later.setAlpha(1f);
                later.setText(laterLabel);
            }
        }
        ui.postDelayed(this::tick, 1000);
    }

    private void askCode() {
        final EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        in.setHint("Notfall-Code");
        in.setPadding(dp(20), dp(12), dp(20), dp(12));
        new AlertDialog.Builder(this)
            .setTitle("Sperre im Notfall abschalten")
            .setMessage("Gilt bis Mitternacht.")
            .setView(in)
            .setPositiveButton("Entsperren", (d, w) -> {
                if (GuardStore.hashCode(in.getText().toString()).equals(store.hash())) {
                    store.emergencyOff();
                    toast(this, "Sperre bis Mitternacht aus.");
                    openTarget();
                } else {
                    toast(this, "Falscher Code.");
                }
            })
            .setNegativeButton("Abbrechen", null)
            .show();
        in.requestFocus();
    }

    private void openTarget() {
        finish();
        Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
        if (i != null) startActivity(i);
    }

    private void goHome() {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        startActivity(i);
        finish();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goHome();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (store != null && store.level() >= 2) finish();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }
}
