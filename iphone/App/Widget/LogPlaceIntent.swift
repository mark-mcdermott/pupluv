import AppIntents
import Foundation

/// The whole point of the widget: one tap moves every dog, without opening the
/// app. Tapping the place they are already in is a no-op, same as in the deck.
/// With the detail row open it only marks the place, and nothing is written
/// until send — again, same as the deck.
struct LogPlaceIntent: AppIntent {
    static var title: LocalizedStringResource = "Log where the dogs are"
    static var isDiscoverable = true

    @Parameter(title: "Place")
    var place: String

    init() {}

    init(place: String) {
        self.place = place
    }

    func perform() async throws -> some IntentResult {
        guard !PupluvShared.detailOpen else {
            PupluvShared.pendingPlace = place
            WidgetRefresh.reload()
            return .result()
        }

        let dogs = PupluvShared.dogs
        let moving = dogs.filter { PupluvShared.placements[$0.id] != place }
        guard !moving.isEmpty else { return .result() }

        let occurredAt = Date()
        let events = moving.map {
            PupluvShared.PendingEvent(
                dogId: $0.id,
                kind: .location,
                location: place,
                occurredAt: occurredAt
            )
        }

        // Reflect the tap before the network answers — the widget should redraw
        // instantly, and the event is queued if the request never lands.
        var placements = PupluvShared.placements
        for dog in moving { placements[dog.id] = place }
        PupluvShared.placements = placements

        // Redraw before the network, not after: the tap has already changed
        // what the widget should show, and waiting on a round trip to say so is
        // the pause you feel.
        WidgetRefresh.reload()
        await PupluvAPI.send(events)
        WidgetRefresh.reload()
        return .result()
    }
}
