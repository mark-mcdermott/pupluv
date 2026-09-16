import Foundation

public enum PostOutcome {
    case accepted
    /// The server will never take it — a malformed event, or an unknown dog.
    case rejected
    /// Worth keeping and trying again: offline, or the server is unwell.
    case transient
}

public enum PupluvAPI {
    /// Posts a batch. Ids are minted on the device, so replaying is idempotent —
    /// the same rule the web client relies on.
    public static func post(_ events: [PupluvShared.PendingEvent]) async -> PostOutcome {
        guard
            !events.isEmpty,
            let token = PupluvShared.token,
            let url = URL(string: PupluvShared.apiBase + "/api/events"),
            let body = try? JSONEncoder().encode(events)
        else { return .transient }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.httpBody = body

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .transient }
            if (200 ..< 300).contains(http.statusCode) { return .accepted }
            // 401 included: the token has expired and only the app can renew it.
            return (400 ..< 500).contains(http.statusCode) ? .rejected : .transient
        } catch {
            return .transient
        }
    }

    /// Sends a batch, queueing it in the App Group if it could not be delivered.
    /// A tap on the home screen must survive a dead zone.
    @discardableResult
    public static func send(_ events: [PupluvShared.PendingEvent]) async -> PostOutcome {
        let outcome = await post(events)
        if outcome == .transient { PupluvShared.enqueue(events) }
        return outcome
    }
}
