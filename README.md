# Meine Liste – Handy-App (Android zuerst, iPhone vorbereitet)

Die App zeigt die bekannte Web-App (https://meine-liste-08gd2z.v2.appdeploy.ai/) und ergänzt die
**Handykontrolle**, die eine Website nicht kann:

- **Apps sperren** (Instagram, TikTok, YouTube …) mit eigenem Sperrbildschirm
- **Fokus**: Während der Timer läuft, holt die App dich zurück, sobald du eine andere App öffnest
- **Nach Neustart** greifen die Sperren sofort wieder
- Lösen nur mit **Codewort** (Hardcore) – Telefon und Notruf bleiben immer erreichbar

## Android-App bekommen (ohne Android Studio)

1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `meine-liste-app`.
2. Den Inhalt dieses Ordners hochladen („Add file → Upload files“, alles hineinziehen, „Commit“).
3. GitHub baut die App automatisch (Reiter **Actions**, ca. 5–8 Minuten).
4. Am Handy öffnen: `https://github.com/DEIN-NAME/meine-liste-app/releases/download/latest/meine-liste.apk`
5. Installieren (einmalig „Aus dieser Quelle installieren“ erlauben).
6. In der App: ⋯ → Handykontrolle → **„Sperren erlauben“** → „Meine Liste – Handykontrolle“ einschalten.

## Technik

| Teil | Datei |
|---|---|
| Brücke Web ↔ Handy | `android/app/src/main/java/de/meineliste/app/guard/GuardPlugin.java` |
| Erkennt geöffnete Apps | `…/guard/GuardService.java` (Bedienungshilfe-Dienst) |
| Sperrbildschirm | `…/guard/BlockActivity.java` |
| Regeln dauerhaft speichern | `…/guard/GuardStore.java` |
| Nach Neustart | `…/guard/BootReceiver.java` |
| iPhone (vorbereitet) | `ios/App/App/GuardPlugin.swift`, `ios/App/App/AppViewController.swift` |

Schnittstelle (gleich auf Android und iPhone): `status`, `requestPermission`, `listApps`,
`setRules({on, apps, level, pause, hash, message})`, `startFocus({task, until, hash, level})`, `stopFocus({hash})`.

## iPhone freischalten (später)

1. Apple-Entwicklerkonto (99 $/Jahr), Berechtigung **Family Controls** bei Apple beantragen.
2. Auf einem Mac: `npm install && npx cap sync ios && npx cap open ios`.
3. `GuardPlugin.swift` und `AppViewController.swift` zum Ziel „App“ hinzufügen,
   in `Main.storyboard` die Klasse des View-Controllers auf `AppViewController` (Modul: App) setzen.
4. Capability „Family Controls“ aktivieren, App-Auswahl über `FamilyActivityPicker` ergänzen (TODO im Code).

## Grenzen (ehrlich)

- Das **Ausschalten** des Handys kann keine App verhindern. Nach dem Einschalten ist die Sperre sofort wieder aktiv.
- Android kann im **abgesicherten Modus** Bedienungshilfen umgehen – das ist ein Systemschutz.
- Für den **Play Store** verlangt Google bei Bedienungshilfe-Apps eine extra Begründung. Bis dahin: Installation per APK.
