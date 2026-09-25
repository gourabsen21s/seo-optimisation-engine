# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| rankcrew-day (2026-09-25) | Shift (new: one workday, hours as structure) | Day rail: fixed clock strip, hour stops jump, draggable sun is the playhead | Dolly zoom from a dawn skyline through one lit window into the live product office | 8 acts, 20.1vh: pin(zoom) > pin(line-draw + lit list) > pan(rail) > pin(word-brighten silence) > pin(peak, shot glides) > pin(wipe + control) > pin(timeline fork) > flow(input) | Dusk: real URL input writes the real CLI command; sun sets behind a pointer-pressure wordmark | Grab the sun and drag the whole day: scroll, office light and shadows regrade together | Illustrated (the product's own office renderer), night / day / dusk grounds | React route `/` in frontend/ (GSAP ScrollTrigger + Lenis, not the scrollcraft engine) |

*(empty: your first build has nothing to clear, so build whatever the interview
points at. From the second onwards, this table is the constraint.)*

---

## What is taken

- **Shift grammar** (hours as sections, clock rail as nav). A later build should not reuse a time-of-day spine.
- **Draggable-sun scrubber** as signature move, and **sun-driven shadow direction**.
- **Dolly-through-a-window hero** into a product surface.
- **Pinned-heavy 8 acts at ~20vh**: longer than the 8-14vh band; the next build should run shorter.

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

Nothing is taken yet.

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
