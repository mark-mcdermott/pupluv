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
    }

    public struct Dog: Codable, Identifiable, Equatable {
        public let id: String
        public let name: String
        public let emoji: String
    }

    /// An event the widget minted. Mirrors the shape the API expects, so a
    /// queued one can be posted verbatim later.
    public struct PendingEvent: Codable, Equatable {
        public let id: String
        public let dogId: String
        public let type: String
        public let occurredAt: String
        public let location: String
        public let note: String?
        public let deletedAt: String?

        public init(dogId: String, location: String, occurredAt: Date = Date()) {
            self.id = UUID().uuidString.lowercased()
            self.dogId = dogId
            self.type = "location"
            self.occurredAt = ISO8601DateFormatter.pupluv.string(from: occurredAt)
            self.location = location
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
        get { defaults?.string(forKey: Key.apiBase) ?? "https://pupluv.vercel.app" }
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
