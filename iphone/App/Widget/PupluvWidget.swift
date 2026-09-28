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
private let mealGlyph = "🍗"
private let mealLabel = "Ate"
private let sleepGlyph = "😴"
private let sleepLabel = "Slept"

/// No paper plane exists in the emoji set; the outbox tray is the send glyph.
/// The action, not a thing — so the platform's own send mark rather than artwork.
private let sendSymbol = "paperplane.fill"

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
    let skipped: [String]
    let picked: [String]
    let barked: Bool
    let ate: Bool
    let slept: Bool
    let pending: String?
    /// Whether send would write anything at all, so it can say so before it is
    /// tapped rather than resetting in silence afterwards.
    let canSubmit: Bool
    /// Taps the server has not taken yet. The app delivers these on its next
    /// sync; showing the count is what keeps them from looking lost.
    let queued: Int
}

struct PlaceProvider: TimelineProvider {
    func placeholder(in context: Context) -> PlaceEntry {
        PlaceEntry(
            date: Date(),
            current: "outside",
            dogs: [],
            signedIn: true,
            skipped: [],
            picked: [],
            barked: false,
            ate: false,
            slept: false,
            pending: nil,
            canSubmit: true,
            queued: 0
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
            skipped: PupluvShared.skipped,
            picked: PupluvShared.picks,
            barked: PupluvShared.barked,
            ate: PupluvShared.ate,
            slept: PupluvShared.slept,
            pending: PupluvShared.pendingPlace,
            canSubmit: submittable,
            queued: PupluvShared.outbox.count
        )
    }

    /// The same question SubmitIntent answers, asked before the tap: some dog
    /// taken, and either a mark picked or a place that would actually move one.
    private var submittable: Bool {
        let targets = PupluvShared.takenDogs
        guard !targets.isEmpty else { return false }
        if PupluvShared.pottyKind != nil { return true }
        if PupluvShared.barked || PupluvShared.ate || PupluvShared.slept { return true }
        guard let pending = PupluvShared.pendingPlace else { return false }
        let placements = PupluvShared.placements
        return targets.contains { placements[$0.id] != pending }
    }
}

/// Emoji are drawn either by the system font or by the Twemoji artwork bundled
/// beside this file. The web carries the same switch in
/// `src/app/lib/glyphs.ts`; they are separate builds and cannot share a
/// constant.
private enum GlyphStyle {
    case native
    case twemoji
}

private let glyphStyle = GlyphStyle.twemoji

/**
 Twemoji files are named for their code points in hex, joined by dashes, with the
 variation selector dropped — 🗯️ is U+1F5EF U+FE0F and lives in 1f5ef.png.
 */
private func glyphName(_ emoji: String) -> String {
    emoji.unicodeScalars
        .filter { $0.value != 0xFE0F }
        .map { String($0.value, radix: 16) }
        .joined(separator: "-")
}

private func glyphImage(_ emoji: String) -> Image? {
    guard
        let url = Bundle.main.url(
            forResource: glyphName(emoji),
            withExtension: "png",
            subdirectory: "Glyphs"
        ),
        let raster = UIImage(contentsOfFile: url.path)
    else { return nil }
    return Image(uiImage: raster).renderingMode(.original)
}

/// One image per emoji: a pair like 💧💩 is two glyphs in one string, and the
/// artwork is filed one to a code point. Swift iterates grapheme clusters, which
/// is exactly the split wanted. Falls back to the character when a glyph has no
/// artwork, so a dog renamed on the phone still shows something.
private struct Glyph: View {
    let text: String
    let size: CGFloat

    var body: some View {
        if glyphStyle == .native {
            characters
        } else {
            HStack(spacing: 0) {
                ForEach(Array(text.enumerated()), id: \.offset) { _, character in
                    if let image = glyphImage(String(character)) {
                        image.resizable().frame(width: size, height: size)
                    } else {
                        Text(String(character)).font(.system(size: size))
                    }
                }
            }
        }
    }

    private var characters: some View {
        Text(text)
            .font(.system(size: size))
            .minimumScaleFactor(0.5)
            .lineLimit(1)
    }
}

/// The deck's one button shape: a bordered tile that fills in when it is on. The
/// places take a rounded square; the row below them takes half its own side, so
/// it stays a circle exactly as it does on the web.
private struct Tile: View {
    /// Artwork for the things being logged; a symbol for the action, which is
    /// not one of them. No paper plane exists in the emoji set, but the tile
    /// draws images now, so the send button was never bound by it.
    enum Mark {
        case glyph(String)
        case symbol(String)
    }

    let mark: Mark
    let side: CGFloat
    let radius: CGFloat
    let on: Bool
    let fill: AnyShapeStyle

    var body: some View {
        face
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

    @ViewBuilder private var face: some View {
        switch mark {
        case let .glyph(text):
            Glyph(text: text, size: side * 0.375)
        case let .symbol(name):
            Image(systemName: name)
                .font(.system(size: side * 0.42, weight: .medium))
                .foregroundStyle(Color.primary.opacity(0.75))
        }
    }
}

/// Where a place stands in the row. Filled is a fact and ringed is an intention,
/// and they have to look different: nothing is written until send, so a tap that
/// only staged a place used to look exactly like the dogs having moved.
enum PlaceState {
    case idle
    /// Where they are, as far as the last sync knows.
    case current
    /// What send would write. Drawn as an outline rather than a fill.
    case staged
}

private struct PlaceButton: View {
    let place: Place
    let side: CGFloat
    let state: PlaceState
    let fill: AnyShapeStyle

    var body: some View {
        Button(intent: LogPlaceIntent(place: place.id)) {
            Tile(
                mark: .glyph(place.glyph),
                side: side,
                radius: side / 4,
                on: state == .current,
                fill: fill
            )
            .overlay {
                if state == .staged {
                    RoundedRectangle(cornerRadius: side / 4, style: .continuous)
                        .strokeBorder(fill, lineWidth: side * 0.06)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            state == .staged ? "\(place.label) — tap send to log it" : place.label
        )
    }
}

/// The deck's second row. The note has a line of its own on the web and none
/// here — a widget cannot take typed input.
private struct DetailRow: View {
    let entry: PlaceEntry
    /// The whole row's width, which the circles are sized to fill.
    let width: CGFloat

    /// Eight circles across, sized to fill the row rather than to a fraction of
    /// the tile above: five tight gaps inside the groups, one between the dogs
    /// and the marks, and a wider one before send so it still reads as the
    /// action rather than a ninth thing to pick. Solving that for the circle
    /// gives the divisor; the spare tenth goes to the two spacers.
    private var small: CGFloat { width / 9.4 }
    private var radius: CGFloat { small / 2 }
    private var within: CGFloat { small * 0.1 }
    private var apart: CGFloat { small * 0.22 }
    private var beforeSend: CGFloat { small * 0.4 }

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: within) {
                ForEach(entry.dogs) { dog in
                    Button(intent: ToggleDogIntent(dogId: dog.id)) {
                        Tile(
                            mark: .glyph(dog.emoji),
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

            Spacer(minLength: apart)

            HStack(spacing: within) {
                ForEach(pickKinds) { pick in
                    Button(intent: TogglePickIntent(pick: pick.id)) {
                        Tile(
                            mark: .glyph(pick.glyph),
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
                        mark: .glyph(barkGlyph),
                        side: small,
                        radius: radius,
                        on: entry.barked,
                        fill: tileFill
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(barkLabel)
                Button(intent: ToggleAteIntent()) {
                    Tile(
                        mark: .glyph(mealGlyph),
                        side: small,
                        radius: radius,
                        on: entry.ate,
                        fill: tileFill
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(mealLabel)
                Button(intent: ToggleSleptIntent()) {
                    Tile(
                        mark: .glyph(sleepGlyph),
                        side: small,
                        radius: radius,
                        on: entry.slept,
                        fill: tileFill
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(sleepLabel)
            }

            // Wider than the gaps inside the row, so send reads as the action
            // rather than a ninth thing to pick.
            Spacer(minLength: beforeSend)

            // No standing fill: it is live at all times now, and a filled tile
            // would read as something already chosen. The system supplies the
            // press highlight.
            Button(intent: SubmitIntent()) {
                Tile(
                    mark: .symbol(sendSymbol),
                    side: small,
                    radius: radius,
                    on: false,
                    fill: tileFill
                )
                // Dimmed when it would write nothing — a place they are already
                // in, or every dog left out. It used to reset in silence, which
                // is indistinguishable from being broken.
                .opacity(entry.canSubmit ? 1 : 0.35)
                .overlay(alignment: .topTrailing) {
                    if entry.queued > 0 {
                        Text("\(entry.queued)")
                            .font(.system(size: small * 0.3, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: small * 0.46, height: small * 0.46)
                            .background(Circle().fill(Color(red: 0.85, green: 0.47, blue: 0.37)))
                            .offset(x: small * 0.1, y: -small * 0.1)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                entry.queued > 0
                    ? "Log it — \(entry.queued) waiting to send"
                    : (entry.canSubmit ? "Log it" : "Nothing to log")
            )
        }
    }
}

struct PupluvWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: PlaceEntry

    /// Five across a small widget is about 20pt each — well under a thumb. It
    /// wraps there instead, and the row of marks only fits where it does not.
    private var fitsOneRow: Bool { family != .systemSmall }

    /// A staged place that matches where they already are is not an intention to
    /// do anything — send is dimmed for it — so it keeps reading as current.
    private func state(of place: Place) -> PlaceState {
        if place.id == entry.pending && entry.pending != entry.current { return .staged }
        if place.id == entry.current { return .current }
        return .idle
    }

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
                        DetailRow(entry: entry, width: geo.size.width)
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
            state: state(of: place),
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
