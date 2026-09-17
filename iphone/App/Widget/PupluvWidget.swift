import AppIntents
import SwiftUI
import WidgetKit

private struct Place: Identifiable {
    let id: String
    let glyph: String
    let label: String
}

/// Daytime places first, then the two sleeping ones, which is also how they split
/// when a small widget cannot fit five across.
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

private struct Pick: Identifiable {
    let id: String
    let glyph: String
    let label: String
}

private let pickKinds = [
    Pick(id: "pee", glyph: "💧", label: "Pee"),
    Pick(id: "poo", glyph: "💩", label: "Poo"),
]

/// No paper plane exists in the emoji set; the outbox tray is the send glyph.
private let sendGlyph = "📤"

// Mirrors accent.ts over the tokens in global.css. These tiles hold emoji, not
// text, so their background carries no contrast requirement.

/// Softened, as the deck softens the places: a tile that size would swamp the
/// widget at full strength.
private func placeTint(_ accent: String?) -> Color {
    switch accent {
    case "amber": return Color(red: 0.89, green: 0.78, blue: 0.62)
    case "teal": return Color(red: 0.64, green: 0.85, blue: 0.82)
    default: return Color(red: 0.78, green: 0.81, blue: 0.79)
    }
}

/// Full strength, for the detail row — the same wash on a half-size circle
/// simply disappears.
private func detailTint(_ accent: String?) -> Color {
    switch accent {
    case "amber": return Color(red: 0.89, green: 0.63, blue: 0.33)
    case "teal": return Color(red: 0.27, green: 0.71, blue: 0.68)
    default: return Color.primary.opacity(0.45)
    }
}

private func blend(_ dogs: [PupluvShared.Dog], _ tint: (String?) -> Color) -> AnyShapeStyle {
    let colours = dogs.map { tint($0.accent) }
    guard colours.count > 1 else { return AnyShapeStyle(colours.first ?? tint(nil)) }
    return AnyShapeStyle(
        LinearGradient(colors: colours, startPoint: .topLeading, endPoint: .bottomTrailing)
    )
}

struct PlaceEntry: TimelineEntry {
    let date: Date
    let current: String?
    let dogs: [PupluvShared.Dog]
    let signedIn: Bool
    let detailOpen: Bool
    let skipped: [String]
    let picked: [String]
    let pending: String?
}

struct PlaceProvider: TimelineProvider {
    func placeholder(in context: Context) -> PlaceEntry {
        PlaceEntry(
            date: Date(),
            current: "outside",
            dogs: [],
            signedIn: true,
            detailOpen: false,
            skipped: [],
            picked: [],
            pending: nil
        )
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
            signedIn: PupluvShared.token != nil,
            detailOpen: PupluvShared.detailOpen,
            skipped: PupluvShared.skipped,
            picked: PupluvShared.picks,
            pending: PupluvShared.pendingPlace
        )
    }
}

/// The deck's one button shape: a bordered tile that fills in when it is on. The
/// corner radius comes from the places, so the half-size row below them rounds to
/// a circle exactly as it does on the web.
private struct Tile: View {
    let glyph: String
    let side: CGFloat
    let radius: CGFloat
    let on: Bool
    let fill: AnyShapeStyle

    var body: some View {
        Text(glyph)
            .font(.system(size: side * 0.375))
            .minimumScaleFactor(0.5)
            .lineLimit(1)
            .frame(width: side, height: side)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(on ? fill : AnyShapeStyle(Color.primary.opacity(0.06)))
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Color.primary.opacity(on ? 0 : 0.12))
            )
    }
}

private struct PlaceButton: View {
    let place: Place
    let side: CGFloat
    let selected: Bool
    let fill: AnyShapeStyle

    var body: some View {
        Button(intent: LogPlaceIntent(place: place.id)) {
            Tile(glyph: place.glyph, side: side, radius: side / 4, on: selected, fill: fill)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(place.label)
    }
}

/// The deck's second row, minus the note: a widget cannot take typed input, so
/// the space it fills on the web is simply left open here.
private struct DetailRow: View {
    let entry: PlaceEntry
    /// The place tile above, which everything here is measured against.
    let side: CGFloat

    private var small: CGFloat { side / 2 }
    private var radius: CGFloat { side / 4 }

    var body: some View {
        HStack(spacing: 8) {
            if entry.detailOpen {
                HStack(spacing: 4) {
                    ForEach(entry.dogs) { dog in
                        Button(intent: ToggleDogIntent(dogId: dog.id)) {
                            Tile(
                                glyph: dog.emoji,
                                side: small,
                                radius: radius,
                                on: !entry.skipped.contains(dog.id),
                                fill: AnyShapeStyle(detailTint(dog.accent))
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(dog.name)
                    }
                }

                HStack(spacing: 4) {
                    ForEach(pickKinds) { pick in
                        Button(intent: TogglePickIntent(pick: pick.id)) {
                            Tile(
                                glyph: pick.glyph,
                                side: small,
                                radius: radius,
                                on: entry.picked.contains(pick.id),
                                fill: blend(entry.dogs, detailTint)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(pick.label)
                    }
                }

                Spacer(minLength: 0)

                // No standing fill: it is live the moment the row opens, and a
                // filled tile would read as something already chosen. The system
                // supplies the press highlight.
                Button(intent: SubmitIntent()) {
                    Tile(
                        glyph: sendGlyph,
                        side: small,
                        radius: radius,
                        on: false,
                        fill: blend(entry.dogs, detailTint)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Log it")
            } else {
                Spacer(minLength: 0)
            }

            Button(intent: ToggleDetailIntent()) {
                Image(systemName: entry.detailOpen ? "eye.slash" : "eye")
                    .font(.system(size: side * 0.25))
                    .foregroundStyle(.secondary)
                    // Trailing, so the icon ends on the same line as the last
                    // place button above it.
                    .frame(width: small, height: small, alignment: .trailing)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(entry.detailOpen ? "Hide details" : "Add details")
        }
    }
}

struct PupluvWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: PlaceEntry

    /// Five across a small widget is about 20pt each — well under a thumb. It
    /// wraps there instead, and the detail row only opens where it fits.
    private var fitsOneRow: Bool { family != .systemSmall }

    /// Closed, the lit place is where they are; open, it is the one about to be
    /// written. Exactly what the deck does.
    private var lit: String? { entry.detailOpen ? (entry.pending ?? entry.current) : entry.current }

    var body: some View {
        if entry.signedIn {
            GeometryReader { geo in
                let gap: CGFloat = 6
                let columns: CGFloat = fitsOneRow ? 5 : 3
                let side = (geo.size.width - gap * (columns - 1)) / columns

                VStack(spacing: gap) {
                    if fitsOneRow {
                        HStack(spacing: gap) {
                            ForEach(places) { button($0, side) }
                        }
                        DetailRow(entry: entry, side: side)
                    } else {
                        HStack(spacing: gap) {
                            ForEach(dayPlaces) { button($0, side) }
                        }
                        HStack(spacing: gap) {
                            ForEach(sleepPlaces) { button($0, side) }
                            Spacer(minLength: 0)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        } else {
            Text("Open pupluv to sign in")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func button(_ place: Place, _ side: CGFloat) -> some View {
        PlaceButton(
            place: place,
            side: side,
            selected: place.id == lit,
            fill: blend(entry.dogs, placeTint)
        )
    }
}

struct PupluvPlaceWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PupluvPlaceWidget", provider: PlaceProvider()) { entry in
            PupluvWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Where the dogs are")
        .description("Move both dogs between the pen, outside, inside, the crate and our bed.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct PupluvWidgetBundle: WidgetBundle {
    var body: some Widget {
        PupluvPlaceWidget()
    }
}
