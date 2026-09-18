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

private let barkGlyph = "🗯️"
private let barkLabel = "Barked"

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

/// The one fill behind the detail row's circles, mirroring --color-tile. Deep
/// enough that the white in the bowl and the drop reads against it, and the same
/// for every button so that being on looks the same everywhere in the row.
private let tileFill = AnyShapeStyle(Color(red: 0.059, green: 0.325, blue: 0.314))

private func blend(_ dogs: [PupluvShared.Dog]) -> AnyShapeStyle {
    let colours = dogs.map { placeTint($0.accent) }
    guard colours.count > 1 else { return AnyShapeStyle(colours.first ?? placeTint(nil)) }
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
    let barked: Bool
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
            barked: false,
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
            barked: PupluvShared.barked,
            pending: PupluvShared.pendingPlace
        )
    }
}

/// The deck's one button shape: a bordered tile that fills in when it is on. The
/// places take a rounded square; the row below them takes half its own side, so
/// it stays a circle exactly as it does on the web.
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

/// The deck's second row. The note has a line of its own on the web and none
/// here — a widget cannot take typed input.
private struct DetailRow: View {
    let entry: PlaceEntry
    /// The place tile above, which everything here is measured against.
    let side: CGFloat

    /// A bark makes six circles and the eye where five and the eye fitted at
    /// three quarters, so they come down to what a medium widget will hold.
    private var small: CGFloat { side * 0.65 }
    /// Half the tile, so it stays a circle whatever the tile grows to.
    private var radius: CGFloat { small / 2 }

    /// Tight inside a group, loose between them, so dogs / pee and poo / send /
    /// the eye read as four things rather than one run of six. Both measured
    /// against the circle, which is what the eye is comparing them to.
    private var within: CGFloat { small * 0.125 }
    private var between: CGFloat { small * 0.29 }

    var body: some View {
        HStack(spacing: between) {
            if entry.detailOpen {
                HStack(spacing: within) {
                    ForEach(entry.dogs) { dog in
                        Button(intent: ToggleDogIntent(dogId: dog.id)) {
                            Tile(
                                glyph: dog.emoji,
                                side: small,
                                radius: radius,
                                on: !entry.skipped.contains(dog.id),
                                fill: tileFill
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(dog.name)
                    }
                }

                HStack(spacing: within) {
                    ForEach(pickKinds) { pick in
                        Button(intent: TogglePickIntent(pick: pick.id)) {
                            Tile(
                                glyph: pick.glyph,
                                side: small,
                                radius: radius,
                                on: entry.picked.contains(pick.id),
                                fill: tileFill
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(pick.label)
                    }
                    Button(intent: ToggleBarkIntent()) {
                        Tile(
                            glyph: barkGlyph,
                            side: small,
                            radius: radius,
                            on: entry.barked,
                            fill: tileFill
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(barkLabel)
                }

                Spacer(minLength: between)

                // No standing fill: it is live the moment the row opens, and a
                // filled tile would read as something already chosen. The system
                // supplies the press highlight.
                Button(intent: SubmitIntent()) {
                    Tile(
                        glyph: sendGlyph,
                        side: small,
                        radius: radius,
                        on: false,
                        fill: tileFill
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Log it")
            } else {
                Spacer(minLength: 0)
            }

            Button(intent: ToggleDetailIntent()) {
                Image(systemName: entry.detailOpen ? "eye.slash" : "eye")
                    .font(.system(size: small * 0.45))
                    .foregroundStyle(.secondary)
                    // Narrower than a circle — it is an icon, not a button face,
                    // and the row has no width to spare. Trailing, so it ends on
                    // the same line as the last place button above it.
                    .frame(width: small * 0.7, height: small, alignment: .trailing)
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
                        // Two and a half times the gap running between the
                        // places. The web carries a note field under this row
                        // and the widget does not, so without the extra air the
                        // two rows crowd the top and leave the rest empty.
                        DetailRow(entry: entry, side: side)
                            .padding(.top, gap * 1.5)
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
            fill: blend(entry.dogs)
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
