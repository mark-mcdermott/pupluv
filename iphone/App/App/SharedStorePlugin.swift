import Capacitor
import Foundation

/// Bridges the web app to the App Group the widget reads from. The web app owns
/// the session, so it is the only thing that can tell the widget who we are and
/// where the dogs currently stand.
@objc(SharedStorePlugin)
public class SharedStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedStorePlugin"
    public let jsName = "SharedStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeOutbox", returnType: CAPPluginReturnPromise),
    ]

    @objc func publish(_ call: CAPPluginCall) {

        if let token = call.getString("token") { PupluvShared.token = token }
        if let apiBase = call.getString("apiBase") { PupluvShared.apiBase = apiBase }

        if let dogs = call.getArray("dogs") {
            PupluvShared.dogs = dogs.compactMap { value in
                guard
                    let entry = value as? JSObject,
                    let id = entry["id"] as? String,
                    let name = entry["name"] as? String,
                    let emoji = entry["emoji"] as? String
                else { return nil }
                return PupluvShared.Dog(
                    id: id,
                    name: name,
                    emoji: emoji,
                    accent: entry["accent"] as? String
                )
            }
        }

        if let placements = call.getObject("placements") {
            PupluvShared.placements = placements.compactMapValues { $0 as? String }
        }

        WidgetRefresh.reload()
        call.resolve()
    }

    /// Hands the web app anything the widget queued while offline, and clears it.
    /// The web app owns retrying, so there is only ever one outbox doing the work.
    @objc func takeOutbox(_ call: CAPPluginCall) {
        let queued = PupluvShared.outbox
        PupluvShared.clearOutbox()
        let payload = queued.compactMap { event -> [String: Any]? in
            guard let data = try? JSONEncoder().encode(event),
                  let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return nil }
            return dict
        }
        call.resolve(["events": payload])
    }
}
