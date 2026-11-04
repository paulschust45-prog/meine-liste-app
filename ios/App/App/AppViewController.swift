import UIKit
import Capacitor

/// Registriert das eigene Guard-Plugin. In Main.storyboard ist diese Klasse
/// als Custom Class des Bridge-View-Controllers eingetragen.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GuardPlugin())
    }
}
