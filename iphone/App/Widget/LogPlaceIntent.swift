import AppIntents
import Foundation

/// Chooses the place the entry will be filed at. Nothing is written here — the
/// row is always open now, so a tap is a statement of intent and send is the
/// only thing that commits, exactly as the deck behaves when its row is open.
///
/// Not discoverable: it no longer completes an action on its own, so offering it
/// to Shortcuts would promise something it does not do.
struct LogPlaceIntent: AppIntent {
    static var title: LocalizedStringResource = "Choose where the dogs are"
    static var isDiscoverable = false

    @Parameter(title: "Place")
    var place: String

    init() {}

    init(place: String) {
        self.place = place
    }

    func perform() async throws -> some IntentResult {
        // Tapping the lit place again takes it back. Without this there is no
        // way to undo a mis-tap: the row would go on showing a place they are
        // not in until something else was sent.
        PupluvShared.pendingPlace = PupluvShared.pendingPlace == place ? nil : place
        WidgetRefresh.reload()
        return .result()
    }
}
