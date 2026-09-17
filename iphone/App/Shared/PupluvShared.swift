import Foundation

/// The widget runs in its own process and cannot see the web view's
/// localStorage or IndexedDB, so everything it needs crosses through an App
/// Group. The app writes; the widget reads and appends to the outbox.
public enum PupluvShared {
    public static let suiteName = "group.com.pupluv.app"

    public static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    private enum Key {
        static let token = "token"
        static let apiBase = "apiBase"
        static let dogs = "dogs"
        static let placements = "placements"
        static let outbox = "outbox"
        static let detailOpen = "detailOpen"
        static let skipped = "skippedDogs"
        static let picks = "picks"
        static let pendingPlace = "pendingPlace"
    }

    public struct Dog: Codable, Identifiable, Equatable {
        public let id: String
        public let name: String
        public let emoji: String
        /// Optional so a payload published before the widget cared about colour
        /// still decodes, rather than emptying the dog list until the next sync.
        public let accent: String?
    }

    /// An event the widget minted. Mirrors the shape the API expects, so a
    /// queued one can be posted verbatim later. A potty kind is what separates
    /// the two types, exactly as it does in the Zod union.
    public struct PendingEvent: Codable, Equatable {
        public let id: String
        public let dogId: String
        public let type: String
        public let occurredAt: String
        public let location: String
        public let pottyKind: String?
        public let note: String?
        public let deletedAt: String?

        public init(
            dogId: String,
            location: String,
            pottyKind: String? = nil,
            occurredAt: Date = Date()
        ) {
            self.id = UUID().uuidString.lowercased()
            self.dogId = dogId
            self.type = pottyKind == nil ? "location" : "potty"
            self.occurredAt = ISO8601DateFormatter.pupluv.string(from: occurredAt)
            self.location = location
            self.pottyKind = pottyKind
            self.note = nil
            self.deletedAt = nil
        }
    }

    // MARK: - What the app publishes

    public static var token: String? {
        get { defaults?.string(forKey: Key.token) }
        set { defaults?.set(newValue, forKey: Key.token) }
    }

    public static var apiBase: String {
        get { defaults?.string(forKey: Key.apiBase) ?? "https://www.pupluv.online" }
        set { defaults?.set(newValue, forKey: Key.apiBase) }
    }

    public static var dogs: [Dog] {
        get { decode([Dog].self, Key.dogs) ?? [] }
        set { encode(newValue, Key.dogs) }
    }

    /// Where each dog is right now, keyed by dog id — so the widget can show
    /// the current place rather than only writing to it.
    public static var placements: [String: String] {
        get { decode([String: String].self, Key.placements) ?? [:] }
        set { encode(newValue, Key.placements) }
    }

    /// The single place every dog is, or nil when they are apart.
    public static var sharedPlace: String? {
        let places = Set(dogs.compactMap { placements[$0.id] })
        return places.count == 1 ? places.first : nil
    }

    // MARK: - What the detail row holds between taps

    /// A widget view keeps no state of its own: every tap runs an intent that
    /// writes here and asks for a redraw. This is the deck's second row.
    public static var detailOpen: Bool {
        get { defaults?.bool(forKey: Key.detailOpen) ?? false }
        set { defaults?.set(newValue, forKey: Key.detailOpen) }
    }

    /// The dogs left out rather than the ones taken, so every entry starts with
    /// all of them — the same default the deck holds.
    public static var skipped: [String] {
        get { decode([String].self, Key.skipped) ?? [] }
        set { encode(newValue, Key.skipped) }
    }

    /// `pee`, `poo`, or both — both together is the `both` kind.
    public static var picks: [String] {
        get { decode([String].self, Key.picks) ?? [] }
        set { encode(newValue, Key.picks) }
    }

    /// Where the entry is being filed. Only set while the row is open: closed,
    /// a place button writes immediately instead.
    public static var pendingPlace: String? {
        get { defaults?.string(forKey: Key.pendingPlace) }
        set { defaults?.set(newValue, forKey: Key.pendingPlace) }
    }

    public static var pottyKind: String? {
        picks.count == 2 ? "both" : picks.first
    }

    public static var takenDogs: [Dog] {
        dogs.filter { !skipped.contains($0.id) }
    }

    /// Matches DEFAULT_LOCATION in domain.ts: a house dog is indoors until told
    /// otherwise.
    public static let defaultLocation = "inside"


    /// Folds the row away and drops everything in it, so nothing carries into
    /// the next entry.
    public static func closeDetail() {
        detailOpen = false
        skipped = []
        picks = []
        defaults?.removeObject(forKey: Key.pendingPlace)
    }

    // MARK: - What the widget queues

    public static var outbox: [PendingEvent] {
        get { decode([PendingEvent].self, Key.outbox) ?? [] }
        set { encode(newValue, Key.outbox) }
    }

    public static func enqueue(_ events: [PendingEvent]) {
        outbox += events
    }

    public static func clearOutbox() {
        defaults?.removeObject(forKey: Key.outbox)
    }

    // MARK: -

    private static func decode<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private static func encode<T: Encodable>(_ value: T, _ key: String) {
        defaults?.set(try? JSONEncoder().encode(value), forKey: key)
    }
}

extension ISO8601DateFormatter {
    /// Milliseconds, to match what the web client sends.
    public static let pupluv: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
