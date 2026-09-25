# Rankcrew landing: BRIEF

**Self-authored under explicit creative delegation.** The owner asked for "a modern website with proper
animations", pointed at 21st.dev, React Bits, Aceternity UI and Awwwards for reference, and said not to stop
until it works. They did not answer the eight interview questions; the answers below are authored decisions,
labelled as such. Evidence (what the product actually is and does) comes from the repo README and a real
engine run; everything else is an assumption.

## Evidence

- Product: Rankcrew, self-hosted multi-agent engine. Eleven AI "employees" (Maya, Theo, Ravi, Zara, Lena, Omar,
  Iris, Kai, Nora, Ezra, Jev) audit a site for SEO and AdSense readiness, fix what they can, and measure impact
  in Search Console after 14 days, rolling back changes that hurt. Any LLM. Docker quick start.
- The product already owns an illustrated, animated office (`features/office`) with a light "daytime studio"
  palette and a dark "night shift" palette, walking characters and paper-plane task hand-offs. That is real,
  running product code, so the world is illustrated because the brand genuinely is.
- Real sample run (used as the page's data): audit of `books.toscrape.com`, 2026-09-25. 56 pages crawled in
  51 s, 31 findings (1 critical, 8 high, 7 medium, 12 low, 3 info), scores 50 overall / 40 SEO / 60 AdSense,
  67 proposed fixes (65 safe, 2 need review). Copied into `frontend/src/features/landing/sample.ts`.
- The README is honest that no tool can guarantee a #1 ranking. The page must be just as honest.

## The eight topics (authored)

1. **Vibe:** calm competence, a lit office at dawn, a studio that works while you sleep. References: the opening
   of *Playtime* (Tati, the glass office floor), a Monocle city-at-dawn cover, Apple's "Shot on iPhone" night
   series.
2. **Journey:** see the office before anyone is awake, watch the site get read, meet the people, feel the
   office at full work, see a change checked before it ships, learn how results are judged, then start your own.
3. **Energy:** quiet at dawn, rising through the morning, one loud noon, calm and exact in the afternoon, warm
   and settled at dusk.
4. **Feeling and the moment:** see curve below. The moment: noon.
5. **What no other site does:** the page is one working day. Scroll is the clock, and you can grab the sun and
   drag the whole day: the light in the office, the sky and the page all regrade together.
6. **Range:** premium, dense where it shows real data, playful only inside the office illustration.
7. **World:** distinct scenes (hours), not one unbroken flight.
8. **Assets:** no photography, no footage, no generation key. The product's own illustration and real data.

## Grammar: "Shift" (new)

The unit is an hour of one workday. Time is information here (what the crew does when), so timestamps are
allowed where section numbers are banned.

- **Nav:** the day rail. A fixed clock bar with the hour stops of the page; the sun on it is the playhead and a
  drag handle for the whole page. The wordmark and two actions sit at its ends.
- **Hero:** 06:00, an establishing shot outside the building. Scrolling flies through the one lit window.
- **Close:** 18:00 sign-off. A real input (your URL) that writes the real CLI command, and the deploy commands.
- **Bans:** section numbers other than clock times, identical feature-card grids, scroll cues, gradient text,
  glow halos, invented statistics, a magnetic CTA, full-frame dark overlays.
- Why not the other seven: filmic one-shot needs footage we do not have; chaptered editorial is for reading,
  this is a thing that works; live surface bans the display type the owner asked for (Shift keeps its honesty
  rule: the office is the real renderer on real sample data); continuous world needs a generated flight;
  typographic poster would hide the product; gallery and split stage fit one act each, not the page; a
  cutlist is the wrong energy for an operations product.

## Journey and feeling curve

| Hour | Beat | Feeling | Cause on screen | Device |
|---|---|---|---|---|
| 06:00 | Recognition | Curiosity | A dark skyline, one lit floor; the camera flies through its window into the office as the crew arrives | layered parallax + camera push (pinned) |
| 07:00 | Tension | Unease | Theo's crawl draws the site as a tree, 56 pages; real findings light up one by one; the score settles at 50 | pin + line drawing + lit list |
| 09:00 | Range | Warmth | The eleven, one at a time, sliding in on a rail with museum labels | pan |
| 11:59 | Silence | Anticipation | One sentence on an almost empty screen, words brightening under your hand | flow, word reveal (authored silence) |
| 12:00 | **Peak** | Awe, delight | Hard cut to daylight. The whole office at work, planes crossing the floor, the camera following one task desk to desk | pin, longest span, camera + regrade |
| 15:00 | Control | Trust | A real fix: before and after wiped by your scroll; Jev's verdict; you pick the autopilot mode and the count of fixes that would apply changes | reveal + real control |
| 17:00 | Honesty | Confidence | The 14-day check drawn as a timeline; kept or rolled back | flow + in |
| 18:00 | Resolve | Readiness | Dusk. Type your site, get the exact command. The wordmark sits on the horizon as the sun goes down | flow, holds |

**The peak:** "the screen went white and suddenly the whole office was working on the site, paper planes
flying between desks." Lives at 12:00. It gets the most scroll room (4 viewport-heights), the silence before
it (11:59), and the only hard cut from dark to light ground.

**It's the site where** you scrub through an AI team's whole workday, and you can grab the sun and drag it.

**Authored silence:** 11:59 is deliberately near-empty. It is not dead scroll.

## Fingerprint gate

Registry was empty at the start of this build, so the gate passes trivially. Row appended after shipping.
