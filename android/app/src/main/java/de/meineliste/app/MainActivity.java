package de.meineliste.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import de.meineliste.app.guard.GuardPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigenes Plugin für die Handykontrolle registrieren (vor super.onCreate)
        registerPlugin(GuardPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
