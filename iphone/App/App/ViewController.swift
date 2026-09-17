import Capacitor
import UIKit

/// Capacitor registers only the plugin classes listed in the generated
/// `capacitor.config.json`, which it builds from installed npm packages — an
/// app-local plugin is compiled but never reachable from JavaScript unless it is
/// registered here. The storyboard points at this class instead of
/// `CAPBridgeViewController` for exactly that reason.
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedStorePlugin())
    }
}
