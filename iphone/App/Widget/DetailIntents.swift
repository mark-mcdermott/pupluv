import AppIntents
import Foundation

// The deck's second row, as intents. A widget view cannot hold state, so each
// tap writes to the App Group and asks for a redraw; the entry read back on the
// next draw is what the row shows.

/// The eye. Folding the row away drops everything in it.
struct ToggleDetailIntent: AppIntent {
    static var title: LocalizedStringResource = "Show or hide the details"
    static var isDiscoverable = false

    init() {}

    func perform() async throws -> some IntentResult {
        if PupluvShared.detailOpen {
            PupluvShared.closeDetail()
        } else {
            PupluvShared.detailOpen = true
        }
        WidgetRefresh.reload()
        return .result()
    }
}

struct ToggleDogIntent: AppIntent {
    static var title: LocalizedStringResource = "Include or leave out a dog"
    static var isDiscoverable = false

    @Parameter(title: "Dog")
    var dogId: String

    init() {}

    init(dogId: String) {
        self.dogId = dogId
    }

    func perform() async throws -> some IntentResult {
        var skipped = PupluvShared.skipped
        if let at = skipped.firstIndex(of: dogId) {
            skipped.remove(at: at)
        } else {
            skipped.append(dogId)
        }
        PupluvShared.skipped = skipped
        WidgetRefresh.reload()
        return .result()
    }
}

struct TogglePickIntent: AppIntent {
    static var title: LocalizedStringResource = "Pick pee or poo"
    static var isDiscoverable = false

    @Parameter(title: "Kind")
    var pick: String

    init() {}

    init(pick: String) {
        self.pick = pick
    }

    func perform() async throws -> some IntentResult {
        var picks = PupluvShared.picks
        if let at = picks.firstIndex(of: pick) {
            picks.remove(at: at)
        } else {
            picks.append(pick)
        }
        PupluvShared.picks = picks
        WidgetRefresh.reload()
        return .result()
    }
}

struct SubmitIntent: AppIntent {
    static var title: LocalizedStringResource = "Log the entry"
    static var isDiscoverable = false

    init() {}

    func perform() async throws -> some IntentResult {
        let targets = PupluvShared.takenDogs
        let kind = PupluvShared.pottyKind
        let barked = PupluvShared.barked
        let ate = PupluvShared.ate
        let slept = PupluvShared.slept
        let pending = PupluvShared.pendingPlace
        let placements = PupluvShared.placements

        // Live whenever the row is open, so with nothing picked this is simply
        // the way back out.
        guard !targets.isEmpty else {
            PupluvShared.closeDetail()
            WidgetRefresh.reload()
            return .result()
        }

        let occurredAt = Date()
        var events: [PupluvShared.PendingEvent] = []

        if let kind {
            events += targets.map { dog in
                PupluvShared.PendingEvent(
                    dogId: dog.id,
                    kind: .potty,
                    // The dog's own place when none was chosen, which is what
                    // makes filing a potty one tap.
                    location: pending ?? placements[dog.id] ?? PupluvShared.defaultLocation,
                    pottyKind: kind,
                    occurredAt: occurredAt
                )
            }
        }

        for (marked, kind) in [
            (barked, PupluvShared.PendingEvent.Kind.bark), (ate, .meal), (slept, .sleep),
        ]
        where marked {
            events += targets.map { dog in
                PupluvShared.PendingEvent(
                    dogId: dog.id,
                    kind: kind,
                    location: pending ?? placements[dog.id] ?? PupluvShared.defaultLocation,
                    occurredAt: occurredAt
                )
            }
        }

        if let pending {
            let moving = targets.filter { placements[$0.id] != pending }
            events += moving.map {
                PupluvShared.PendingEvent(
                    dogId: $0.id,
                    kind: .location,
                    location: pending,
                    occurredAt: occurredAt
                )
            }
            var next = placements
            for dog in moving { next[dog.id] = pending }
            PupluvShared.placements = next
        }

        PupluvShared.closeDetail()
        guard !events.isEmpty else {
            WidgetRefresh.reload()
            return .result()
        }

        // Redraw before the network, not after: the tap has already changed
        // what the widget should show, and waiting on a round trip to say so is
        // the pause you feel.
        WidgetRefresh.reload()
        await PupluvAPI.send(events)
        WidgetRefresh.reload()
        return .result()
    }
}

/// Their own toggles rather than further picks: neither is a kind of potty, and
/// picking pee and poo together already means something.
struct ToggleBarkIntent: AppIntent {
    static var title: LocalizedStringResource = "Note a bark"
    static var isDiscoverable = false

    init() {}

    func perform() async throws -> some IntentResult {
        PupluvShared.barked.toggle()
        WidgetRefresh.reload()
        return .result()
    }
}

struct ToggleAteIntent: AppIntent {
    static var title: LocalizedStringResource = "Note a meal"
    static var isDiscoverable = false

    init() {}

    func perform() async throws -> some IntentResult {
        PupluvShared.ate.toggle()
        WidgetRefresh.reload()
        return .result()
    }
}

struct ToggleSleptIntent: AppIntent {
    static var title: LocalizedStringResource = "Note a sleep"
    static var isDiscoverable = false

    init() {}

    func perform() async throws -> some IntentResult {
        PupluvShared.slept.toggle()
        WidgetRefresh.reload()
        return .result()
    }
}
