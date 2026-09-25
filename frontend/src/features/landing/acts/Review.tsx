import { useRef, useState } from "react";
import { smooth } from "../clock";
import { useProgress } from "../hooks";
import { SAMPLE } from "../sample";

type Mode = "off" | "safe" | "full";
// Counts derived from the sample run's 67 proposed fixes (65 safe, 1 needs review, 1 manual server change).
const MODES: Record<Mode, { label: string; auto: number; note: string }> = {
  off: { label: "Off", auto: 0, note: "Every fix waits for you. Read the diff, approve, apply." },
  safe: { label: "Safe", auto: SAMPLE.fixes.safe, note: "Additive, low-risk fixes apply themselves: canonicals, schema, sitemap, draft pages." },
  full: { label: "Full", auto: SAMPLE.fixes.total - SAMPLE.fixes.manual, note: "Everything Jev passes applies, robots.txt included. Articles still land as drafts." },
};

const BEFORE = [
  { t: "<head>", k: "tag" },
  { t: '  <title>All products | Books to Scrape - Sandbox</title>', k: "" },
  { t: "  <!-- no canonical tag -->", k: "gap" },
  { t: "  <!-- no Organization schema -->", k: "gap" },
  { t: "</head>", k: "tag" },
];
const AFTER = [
  { t: "<head>", k: "tag" },
  { t: '  <title>All products | Books to Scrape - Sandbox</title>', k: "" },
  { t: '+ <link rel="canonical" href="https://books.toscrape.com/">', k: "add" },
  { t: '+ <script type="application/ld+json">', k: "add" },
  { t: '+   { "@type": "Organization",', k: "add" },
  { t: '+     "name": "Books to Scrape",', k: "add" },
  { t: '+     "url": "https://books.toscrape.com/" }', k: "add" },
  { t: "+ </script>", k: "add" },
  { t: "</head>", k: "tag" },
];

export function Review() {
  const ref = useRef<HTMLElement>(null);
  const after = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("safe");

  useProgress(ref, (p) => {
    const w = smooth(0.12, 0.62, p);
    after.current?.style.setProperty("--wipe", w.toFixed(4));
    handle.current?.style.setProperty("--wipe", w.toFixed(4));
    stamp.current?.setAttribute("data-on", String(p > 0.66));
  });

  const m = MODES[mode];
  const waiting = SAMPLE.fixes.total - m.auto;
  return (
    <section ref={ref} id="review" className="lp-act lp-review g-day" style={{ "--span": 2.2 } as React.CSSProperties} data-sc-act="pin" aria-labelledby="review-title">
      <div className="lp-stage">
        <div className="lp-wrap lp-review__grid">
          <div className="lp-review__copy">
            <p className="lp-hour">15:00</p>
            <h2 id="review-title" className="lp-display lp-display--lg">Nothing ships unchecked.</h2>
            <p className="lp-body">Every change is a fix you can read: the exact before and after, Jev's verdict, and a rollback that restores it exactly. Autopilot decides how much applies itself.</p>

            <fieldset className="lp-auto">
              <legend className="lp-label">Autopilot, on today's {SAMPLE.fixes.total} fixes</legend>
              <div className="lp-auto__seg" role="radiogroup" aria-label="Autopilot mode">
                {(Object.keys(MODES) as Mode[]).map((k) => (
                  <label key={k} className="lp-auto__opt" data-on={mode === k}>
                    <input type="radio" name="autopilot" value={k} checked={mode === k} onChange={() => setMode(k)} />
                    {MODES[k].label}
                  </label>
                ))}
              </div>
              <div className="lp-auto__bar" aria-hidden="true">
                {Array.from({ length: SAMPLE.fixes.total }, (_, i) => <i key={i} data-on={i < m.auto} style={{ transitionDelay: `${Math.min(i, 66) * 6}ms` }} />)}
              </div>
              <p className="lp-auto__count" aria-live="polite">
                <b className="lp-nums">{m.auto}</b> apply themselves. <b className="lp-nums">{waiting}</b> wait for you.
              </p>
              <p className="lp-auto__note">{m.note}</p>
            </fieldset>
          </div>

          <figure className="lp-diff">
            <figcaption className="lp-diff__head">
              <span>books.toscrape.com / index.html</span>
              <span className="lp-diff__legend"><span>before</span><span>after</span></span>
            </figcaption>
            <div className="lp-diff__body">
              <div className="lp-diff__layer lp-diff__before" aria-label="Before">
                {BEFORE.map((l, i) => <code key={i} data-k={l.k}>{l.t}</code>)}
              </div>
              <div ref={after} className="lp-diff__layer lp-diff__after" aria-label="After">
                {AFTER.map((l, i) => <code key={i} data-k={l.k}>{l.t}</code>)}
              </div>
              <div ref={handle} className="lp-diff__handle" aria-hidden="true" />
            </div>
            <div ref={stamp} className="lp-diff__stamp" data-on="false">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 6.8" /></svg>
              <span><b>Jev</b> verified: safe to apply. A rollback restores the page exactly.</span>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
