import Foundation
import Capacitor
#if canImport(FamilyControls)
import FamilyControls
import ManagedSettings
#endif

/// Handykontrolle fürs iPhone – gleiche Schnittstelle wie auf Android (GuardPlugin.java).
///
/// VORBEREITET, NOCH NICHT AKTIV. Damit das Sperren funktioniert, braucht es:
/// 1. Apple-Entwicklerkonto (99 $/Jahr) und die Berechtigung „Family Controls“ (bei Apple beantragen).
/// 2. In Xcode: Capability „Family Controls“ für das App-Ziel aktivieren.
/// 3. Optional: Erweiterungen „Shield Configuration“ (eigener Sperrbildschirm) und
///    „Device Activity Monitor“ (Sperre nach Zeitplan) hinzufügen.
///
/// Wichtig: iOS gibt keine Paketnamen heraus. Apps werden über Apples Auswahl
/// (FamilyActivityPicker) gewählt – die Auswahl bleibt auf dem Gerät.
@objc(GuardPlugin)
public class GuardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GuardPlugin"
    public let jsName = "Guard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRules", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startFocus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopFocus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setScreen", returnType: CAPPluginReturnPromise),
    ]

    private let defaults = UserDefaults.standard

    #if canImport(FamilyControls)
    private let store = ManagedSettingsStore()
    #endif

    @objc func status(_ call: CAPPluginCall) {
        var ready = false
        #if canImport(FamilyControls)
        if #available(iOS 16.0, *) {
            ready = AuthorizationCenter.shared.authorizationStatus == .approved
        }
        #endif
        call.resolve([
            "platform": "ios",
            "ready": ready,
            "rulesOn": defaults.bool(forKey: "guard.rulesOn"),
            "focusOn": defaults.bool(forKey: "guard.focusOn"),
            "apps": [],
            "pausesLeft": 3,
        ])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        #if canImport(FamilyControls)
        if #available(iOS 16.0, *) {
            Task {
                do {
                    try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                    call.resolve()
                } catch {
                    call.reject("Bildschirmzeit-Zugriff wurde nicht erlaubt")
                }
            }
            return
        }
        #endif
        call.reject("Braucht iOS 16 oder neuer")
    }

    /// iOS: Auswahl läuft über Apples FamilyActivityPicker (SwiftUI) – TODO beim Freischalten.
    @objc func listApps(_ call: CAPPluginCall) {
        call.resolve(["apps": [], "picker": true])
    }

    @objc func setRules(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        let hash = call.getString("hash") ?? ""
        let stored = defaults.string(forKey: "guard.hash") ?? ""
        if !on && defaults.bool(forKey: "guard.rulesOn") && !stored.isEmpty && stored != hash {
            call.reject("Falsches Codewort")
            return
        }
        defaults.set(on, forKey: "guard.rulesOn")
        defaults.set(hash, forKey: "guard.hash")
        defaults.set(call.getInt("level") ?? 2, forKey: "guard.level")
        #if canImport(FamilyControls)
        if !on {
            store.shield.applications = nil
            store.shield.applicationCategories = nil
        }
        // TODO: gespeicherte FamilyActivitySelection laden und
        // store.shield.applications = selection.applicationTokens setzen.
        #endif
        call.resolve()
    }

    @objc func startFocus(_ call: CAPPluginCall) {
        defaults.set(true, forKey: "guard.focusOn")
        defaults.set(call.getString("hash") ?? "", forKey: "guard.focusHash")
        #if canImport(FamilyControls)
        // Fokus auf dem iPhone: alle Kategorien außer Meine Liste abschirmen.
        // store.shield.applicationCategories = .all(except: [eigenesAppToken])
        #endif
        call.resolve()
    }

    @objc func stopFocus(_ call: CAPPluginCall) {
        let stored = defaults.string(forKey: "guard.focusHash") ?? ""
        if !stored.isEmpty && stored != (call.getString("hash") ?? "") {
            call.reject("Falsches Codewort")
            return
        }
        defaults.set(false, forKey: "guard.focusOn")
        #if canImport(FamilyControls)
        store.shield.applicationCategories = nil
        #endif
        call.resolve()
    }

    /// Sperrbildschirm: auf dem iPhone über eine „Shield Configuration“-Erweiterung (TODO beim Freischalten).
    /// Bild und Spruch werden schon gespeichert, damit die Erweiterung sie später lesen kann (App Group).
    @objc func setScreen(_ call: CAPPluginCall) {
        defaults.set(call.getString("quote") ?? "", forKey: "guard.quote")
        defaults.set(call.getInt("wait") ?? 10, forKey: "guard.wait")
        defaults.set(call.getBool("time") ?? true, forKey: "guard.time")
        call.resolve()
    }
}
