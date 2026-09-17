import AppIntents
import SwiftUI
import WidgetKit

private struct Place: Identifiable {
    let id: String
    let glyph: String
    let label: String
}

/// Daytime places on the first row, the two sleeping ones on the second, which
/// is also how they split when a small widget cannot fit five across.
private let dayPlaces = [
    Place(id: "pen", glyph: "🛖", label: "Pen"),
    Place(id: "outside", glyph: "🌳", label: "Outside"),
    Place(id: "inside", glyph: "🏠", label: "Inside"),
]

private let sleepPlaces = [
    Place(id: "crate", glyph: "📦", label: "Crate"),
    Place(id: "bed", glyph: "🛏️", label: "Bed"),
]

private let places = dayPlaces + sleepPlaces

struct PlaceEntry: TimelineEntry {
    let date: Date
    let current: String?
    let dogs: [PupluvShared.Dog]
    let signedIn: Bool
}

struct PlaceProvider: TimelineProvider {
    func placeholder(in context: Context) -> PlaceEntry {
        PlaceEntry(date: Date(), current: "outside", dogs: [], signedIn: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (PlaceEntry) -> Void) {
        completion(current())
    }

    /// No schedule: the widget is redrawn when the app publishes new state or an
    /// intent runs, so a periodic refresh would only burn budget.
    func getTimeline(in context: Context, completion: @escaping (Timeline<PlaceEntry>) -> Void) {
        completion(Timeline(entries: [current()], policy: .never))
    }

    private func current() -> PlaceEntry {
        PlaceEntry(
            date: Date(),
            current: PupluvShared.sharedPlace,
            dogs: PupluvShared.dogs,
            signedIn: PupluvShared.token != nil
        )
    }
}

private struct PlaceButton: View {
    let place: Place
    let selected: Bool

    var body: some View {
        Group {
            if #available(iOS 17.0, *) {
                Button(intent: LogPlaceIntent(place: place.id)) { face }
                    .buttonStyle(.plain)
            } else {
                face
            }
        }
        .accessibilityLabel(place.label)
    }

    private var face: some View {
        Text(place.glyph)
            .font(.system(size: 24))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(
                        selected
                            ? AnyShapeStyle(
                                LinearGradient(
                                    colors: [
                                        Color(red: 0.89, green: 0.78, blue: 0.62),
                                        Color(red: 0.64, green: 0.85, blue: 0.82),
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                            : AnyShapeStyle(Color.primary.opacity(0.06))
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color.primary.opacity(selected ? 0 : 0.12))
            )
    }
}

struct PupluvWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: PlaceEntry

    /// Five across a small widget is about 25pt each — well under a thumb. It
    /// wraps there instead, and only spreads out when there is room.
    private var fitsOneRow: Bool { family != .systemSmall }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                Text(entry.dogs.map(\.emoji).joined())
                    .font(.system(size: 15))
                Spacer()
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if entry.signedIn {
                if fitsOneRow {
                    HStack(spacing: 6) {
                        ForEach(places) { place in
                            PlaceButton(place: place, selected: place.id == entry.current)
                        }
                    }
                } else {
                    VStack(spacing: 6) {
                        HStack(spacing: 6) {
                            ForEach(dayPlaces) { place in
                                PlaceButton(place: place, selected: place.id == entry.current)
                            }
                        }
                        HStack(spacing: 6) {
                            ForEach(sleepPlaces) { place in
                                PlaceButton(place: place, selected: place.id == entry.current)
                            }
                        }
                    }
                }
            } else {
                Text("Open pupluv to sign in")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private var caption: String {
        guard entry.signedIn else { return "pupluv" }
        guard let current = entry.current else { return "apart" }
        return places.first { $0.id == current }?.label ?? "pupluv"
    }
}

struct PupluvPlaceWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PupluvPlaceWidget", provider: PlaceProvider()) { entry in
            if #available(iOS 17.0, *) {
                PupluvWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                PupluvWidgetView(entry: entry).padding()
            }
        }
        .configurationDisplayName("Where the dogs are")
        .description("Move both dogs between the pen, outside and inside.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct PupluvWidgetBundle: WidgetBundle {
    var body: some Widget {
        PupluvPlaceWidget()
    }
}
