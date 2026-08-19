import { Modal } from "./Modal"

export type HelpTopic = "readings" | "keys"

/**
 * What the instrument is telling you, and how to work it.
 *
 * The readings are the part that needs saying. Altitude and density are not
 * decoration: they are there because a latent space pulls towards the average
 * of what it was fitted on, and an instrument that does not show the pull
 * cannot help anyone resist it.
 */
export function Help({ topic, onClose }: {
  topic: HelpTopic
  onClose: () => void
}) {
  return topic === "keys"
    ? <Keys onClose={onClose} />
    : <Readings onClose={onClose} />
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 items-baseline py-1.5
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
      <div className="max-h-[62vh] overflow-y-auto pr-2">
        <Section title="The pull towards the middle">
          <p className="text-[12px] leading-relaxed mb-2">
            A latent space fitted on a corpus has a centre, and the centre is
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
          <p className="text-[12px] leading-relaxed">
            The grab points are found in the outlines, not drawn on top of
            them: a point on the side of a stem moves weight, the outer edge
            moves width, the top of a lowercase moves x-height, the gap moves
            spacing. Colours match the property each one carries. The chips
            decide which properties a drag is allowed to change, so you can
            move through the space along one axis of the design and hold the
            rest still.
          </p>
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
  ["Drag in the map", "Turn the model"],
  ["Alt-drag in the map", "Move the specimen through the space"],
  ["Shift while moving", "Up and down the third axis"],
  ["Click a family", "Travel to it"],
  ["Hover a family", "Name it"],
  ["Click a stop", "Return to it, keeping everything after it"],
]

function Keys({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard and pointer" wide onClose={onClose}
           subtitle="Every one of them is a movement">
      <div className="max-h-[62vh] overflow-y-auto pr-2">
        <Section title="Keys">
          {KEYS.map(([k, what]) => (
            <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-3
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
      </div>
    </Modal>
  )
}
