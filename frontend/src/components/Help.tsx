import { Modal } from "./Modal"

export type HelpTopic = "what" | "readings" | "keys"

/**
 * What the instrument is telling you, and how to work it.
 *
 * The readings are the part that needs saying. Altitude and density are not
 * decoration: they are there because a fitted space pulls towards the average
 * of what it was fitted on, and an instrument that does not show the pull
 * cannot help anyone resist it.
 */
export function Help({ topic, onClose }: {
  topic: HelpTopic
  onClose: () => void
}) {
  return topic === "keys" ? <Keys onClose={onClose} />
    : topic === "what" ? <What onClose={onClose} />
    : <Readings onClose={onClose} />
}

function What({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="What is Vectorography" wide onClose={onClose}
           subtitle="Type design by traversal">
      <div className="max-h-none sm:max-h-[62vh] overflow-y-auto pr-2 space-y-3
                      text-[12px] leading-relaxed">
        <p>
          Vectorography is an instrument for designing type by <em>moving
          through a space of letterforms</em> rather than by drawing them or by
          describing them to a machine. Every face it can produce already
          exists somewhere in that space. The work is getting to the one you
          want.
        </p>
        <p>
          The space is <strong>VectorModel</strong>, fitted from 441 type
          families. Each family was reduced to one long vector: every glyph
          resampled to forty points per contour at uniform arc length, in
          cyclic correspondence so that the same point lands on the same part
          of the letter in every font. That correspondence is what makes the
          space walkable, and it is why any two positions in it interpolate
          into a face rather than into a mess.
        </p>
        <p>
          What comes out of that fitting is a <strong>vector space</strong> in
          the full sense: 128 dimensions, a basis, a metric that means
          something, and an encode and decode that are exactly linear. Not a
          latent space in the machine-learning sense, where the geometry is
          learned, warped, and only approximately invertible. Here a step of a
          given length goes a given distance, the difference between two
          families is a heading you can apply anywhere, and a straight line
          between two points passes through faces all the way.
        </p>

        <Section title="Two things it refuses to do">
          <p className="mb-2">
            <strong>There is no generate button.</strong> Nothing here takes a
            description and returns a result. Every control is a movement: a
            step, a drift, a repulsion, an orbit, a drag on the letterform
            itself. You arrive at a typeface the way you arrive at a place.
          </p>
          <p>
            <strong>It shows you the pull towards the average.</strong> Any
            space fitted to a corpus has a centre, and that centre is the
            consensus of everything in it, which for type is the neo-grotesque.
            Movement in such a space is not neutral; it runs downhill. The
            altitude, density and isolation readings exist so that slope is
            something you can see, and <em>repel</em> exists so you can climb
            against it.
          </p>
        </Section>

        <Section title="What you leave with">
          <p>
            A journey is a path, and a path is an axis. Compile one and you get
            a variable font whose single Journey axis runs from where you
            started to where you stopped, with every stop a named instance.
            Or take the UFO source and carry on in Glyphs or RoboFont. The
            outlines are a linear transformation of a fitted space rather than
            a copy of any face.
          </p>
        </Section>
      </div>
    </Modal>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[7.5rem_1fr] gap-1 sm:gap-3
                    items-baseline py-1.5
                    border-b border-border/40 last:border-0">
      <span className="rail-label !text-[8px] pt-0.5">{term}</span>
      <span className="text-[12px] leading-relaxed">{children}</span>
    </div>
  )
}

function Section({ title, children }: {
  title: string; children: React.ReactNode
}) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="font-display text-[13px] mb-1.5">{title}</h3>
      {children}
    </section>
  )
}

function Readings({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="What the readings mean" wide onClose={onClose}
           subtitle="The instrument measures where you are, not only what you drew">
      <div className="max-h-none sm:max-h-[62vh] overflow-y-auto pr-2">
        <Section title="The pull towards the middle">
          <p className="text-[12px] leading-relaxed mb-2">
            A vector space fitted on a corpus has a centre, and the centre is
            the average of what it was fitted on. For type that average is the
            neo-grotesque: the shape a thousand faces agree on. Movement in the
            space is not neutral, it runs downhill towards that agreement. The
            readings below are here so the slope is something you can see and
            work against.
          </p>
        </Section>

        <Section title="The strip beside the map">
          <Row term="from centroid">
            How far the specimen sits from the corpus average, in whitened
            units. The corpus median is about 7. Nothing in the 441 families
            sits within 3 of the centre, so a low reading means a shape no
            existing face occupies, not a safe one.
          </Row>
          <Row term="local density">
            How crowded this part of the space is, as a percentile of the
            corpus. High is busy ground where many families already live; low
            is open country. Crowded is not better. It is where the space
            wants you.
          </Row>
          <Row term="isolation">
            Mean distance to the five nearest real families. It rises as you
            leave the herd, and it is the reading to watch when you are trying
            to arrive somewhere no one else is.
          </Row>
        </Section>

        <Section title="The map">
          <Row term="the shell">
            The dashed sphere is the corpus fitted to the three directions
            currently on screen, not the whole space. It moves when you change
            the axes, because it is a picture of what is being shown.
          </Row>
          <Row term="the route">
            Every stop of the journey in red, running on to wherever the
            specimen is being held. Going back rewinds it; travelling on from
            an earlier stop opens a branch and keeps both.
          </Row>
          <Row term="axes">
            Each is either a direction the corpus varies in most, or a property
            measured off the outlines. Choosing between them is choosing
            whether to move by a name or by the corpus's own structure. When
            two share variance the overlap is reported, and the second is drawn
            with the shared part removed.
          </Row>
        </Section>

        <Section title="Ways of moving">
          <Row term="traverse">
            One step out on the two axes the map is drawn in. There is no
            generate button because there is nothing to generate: the
            letterforms are already everywhere in the space.
          </Row>
          <Row term="drift">
            A random walk, scaled by temperature.
          </Row>
          <Row term="repel">
            A step directly against the local density gradient, away from
            wherever the corpus is thickest. This is the anti-average control.
          </Row>
          <Row term="ride">
            The difference between two real families, taken as a heading you
            can steer by from anywhere.
          </Row>
          <Row term="orbit">
            Circle one family at your present distance, to see what sits at the
            same remove from it in every direction.
          </Row>
        </Section>

        <Section title="Working the letterform">
          <p className="text-[12px] leading-relaxed mb-2">
            Three ways for the hand to drive the type, chosen from the first
            group of the toolbar on the specimen. Press a tool a second time,
            or hold it, to see what it is set to.
          </p>
          <Row term="handles">
            Grab the part of the letter that carries the property: the side of
            a stem moves weight, the outer edge width, the top of a lowercase
            x-height, the gap between letters spacing. The points are found in
            the outlines rather than drawn on top of them, and each wears its
            property's colour. Set it to one property and a press anywhere
            takes hold of that one, which is how to spend a session on weight
            alone.
          </Row>
          <Row term="modifier">
            The whole word as a pad: sideways moves one property, up and down
            a second, the wheel or the fader at the edge a third. You say which
            three.
          </Row>
          <Row term="perspective">
            The word stands inside the corpus shell, the same sphere the map
            draws. Sideways moves it across the floor, pushing up sends it
            away, and away is where the second property lives. The shell turns
            under the hand so the space answers the gesture.
          </Row>
          <Row term="rigidify">
            Half the way to the nearest real family, and half again on the
            next press. The way back from country where the outlines are
            guesses toward something that was drawn.
          </Row>
        </Section>

        <Section title="Keeping your place">
          <Row term="waypoints">
            Double-press a stop on the trail, or press its flag, to mark it
            WP1, WP2 and so on. They are numbered down the trail, they travel
            in a saved journey, and one control clears them all.
          </Row>
          <Row term="what is remembered">
            How the desk is set up: the mode, the properties it drives, what
            the map is coloured by, the axes, the dividers. The journey itself
            is not, because that belongs in a file.
          </Row>
        </Section>
      </div>
    </Modal>
  )
}

const KEYS: [string, string][] = [
  ["← ↑ → ↓", "Step one radius on the two axes the map is drawn in"],
  ["d", "Drift: a random walk scaled by temperature"],
  ["r", "Repel: step against the local density gradient"],
  ["⌘ Z", "Back one stop. The route rewinds with you"],
  ["⇧ ⌘ Z", "Forward again"],
  ["Esc", "Close a dialogue"],
]

const POINTER: [string, string][] = [
  ["Drag the letterform", "Move through the space by the shape rather than the map"],
  ["Wheel on the letterform", "The third property, in modifier mode"],
  ["Drag in the map", "Turn the model"],
  ["Wheel or pinch in the map", "Zoom"],
  ["Click a family", "Travel to it"],
  ["Hover a family", "Name it"],
  ["Click a stop", "Return to it, keeping everything after it"],
  ["Double-click a stop", "Mark or unmark it as a waypoint"],
  ["Hold a tool", "Open what it is set to"],
  ["Drag the toolbar's grip", "Move it to another edge of the specimen"],
  ["Drag a divider", "Trade room between the specimen, the map and the panels"],
]

const TOUCH: [string, string][] = [
  ["The lower half", "One instrument at a time: map, steer, trail, traverse, settings"],
  ["Two fingers in the map", "Pinch to zoom; one finger turns the model"],
  ["Tap a family", "Names it; tap it again to travel there"],
  ["The fader", "Stands in for the wheel when modifier drives a third property"],
  ["Tap the altitude strip", "Show the readings, since there is nothing to hover"],
  ["Hold a tool", "Open what it is set to"],
]

function Keys({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard and pointer" wide onClose={onClose}
           subtitle="Every one of them is a movement">
      <div className="max-h-none sm:max-h-[62vh] overflow-y-auto pr-2">
        <Section title="Keys">
          {KEYS.map(([k, what]) => (
            <div key={k} className="grid grid-cols-1 sm:grid-cols-[7.5rem_1fr]
                                    gap-1 sm:gap-3
                                    items-baseline py-1.5 border-b
                                    border-border/40 last:border-0">
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm
                              border border-border bg-muted/40 justify-self-start">
                {k}
              </kbd>
              <span className="text-[12px] leading-relaxed">{what}</span>
            </div>
          ))}
        </Section>
        <Section title="Pointer">
          {POINTER.map(([k, what]) => <Row key={k} term={k}>{what}</Row>)}
        </Section>
        <Section title="On a touchscreen">
          {TOUCH.map(([k, what]) => <Row key={k} term={k}>{what}</Row>)}
        </Section>
      </div>
    </Modal>
  )
}
