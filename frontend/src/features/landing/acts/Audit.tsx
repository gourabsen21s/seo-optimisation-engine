import { useLayoutEffect, useMemo, useRef } from "react";
import { clamp01, gsap, reducedMotion, ScrollTrigger, smooth, SplitText } from "../clock";
import { useProgress } from "../hooks";
import { CRAWLED, FINDINGS, SAMPLE, type Severity } from "../sample";

const SEV_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const SEV_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
// The loud ones, in the order the list lights up. Titles are the engine's own wording.
const SHOWN = [
  "No Privacy Policy page found",
  "No Google-certified consent banner (CMP) detected",
  "HTTP does not redirect to HTTPS",
  "Mixed content (http:// resources on https pages)",
  "No XML sitemap found",
  "Pages without a canonical tag",
  "Duplicate titles",
].map((t) => FINDINGS.find((f) => f.t === t)!);

const C = { x: 500, y: 500 };
type Node = { i: number; path: string; x: number; y: number; px: number; py: number; listing: boolean; d: string; len: number };

/** Lay the real crawl out as a radial tree: listing pages on the inner ring, the books they link to outside. */
function layoutTree(): Node[] {
  const listings = CRAWLED.map((p, i) => ({ p, i })).filter(({ p }) => p === "/" || /page-\d+\.html$/.test(p));
  const groups = new Map<number, number[]>();
  let parent = 0;
  CRAWLED.forEach((_, i) => {
    if (listings.some((l) => l.i === i)) { parent = i; groups.set(i, groups.get(i) ?? []); return; }
    groups.get(parent)!.push(i);
  });
  const nodes: Node[] = [];
  const ang0 = -Math.PI / 2;
  const total = CRAWLED.length - listings.length;
  let k = 0;
  listings.forEach((l, li) => {
    const kids = groups.get(l.i) ?? [];
    // Each listing sits in the middle of the arc its children occupy.
    const a0 = ang0 + (k / total) * Math.PI * 2;
    const a1 = ang0 + ((k + Math.max(kids.length, 1)) / total) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const r1 = 190;
    const lx = C.x + Math.cos(am) * r1;
    const ly = C.y + Math.sin(am) * r1;
    nodes.push(edge(l.i, l.p, lx, ly, C.x + Math.cos(am) * 104, C.y + Math.sin(am) * 104, true));
    kids.forEach((ci, j) => {
      const a = a0 + ((j + 0.5) / Math.max(kids.length, 1)) * (a1 - a0);
      const r2 = 330 + (j % 3) * 34 + (li % 2) * 10;
      nodes.push(edge(ci, CRAWLED[ci], C.x + Math.cos(a) * r2, C.y + Math.sin(a) * r2, lx, ly, false));
    });
    k += Math.max(kids.length, 1);
  });
  return nodes.sort((a, b) => a.i - b.i);
}
function edge(i: number, path: string, x: number, y: number, px: number, py: number, listing: boolean): Node {
  // A gentle curve bowing away from the centre.
  const mx = (x + px) / 2 + (y - py) * 0.12;
  const my = (y + py) / 2 - (x - px) * 0.12;
  const d = `M${px.toFixed(1)} ${py.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  const len = Math.hypot(x - px, y - py) * 1.05;
  return { i, path, x, y, px, py, listing, d, len };
}

const RING = 2 * Math.PI * 84;

export function Audit() {
  const ref = useRef<HTMLElement>(null);
  const nodes = useMemo(layoutTree, []);
  const edges = useRef<(SVGPathElement | null)[]>([]);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const lines = useRef<(HTMLLIElement | null)[]>([]);
  const q = useRef<Record<string, HTMLElement | SVGElement | null>>({});
  const r = (k: string) => (el: HTMLElement | SVGElement | null) => { q.current[k] = el; };
  const title = useRef<HTMLHeadingElement>(null);

  // Headline assembles line by line while the act slides into view.
  useLayoutEffect(() => {
    const h = title.current;
    if (!h || reducedMotion()) return;
    let split: SplitText | null = null;
    let tl: gsap.core.Timeline | null = null;
    let st: ScrollTrigger | null = null;
    const build = () => {
      split = new SplitText(h, { type: "lines", mask: "lines", linesClass: "lp-line" });
      tl = gsap.timeline({ paused: true }).from(split.lines, { yPercent: 105, duration: 1, stagger: 0.14, ease: "power3.out" });
      st = ScrollTrigger.create({ trigger: ref.current, start: "top 78%", end: "top 12%", scrub: true, animation: tl });
    };
    const ready = document.fonts?.ready ?? Promise.resolve();
    let dead = false;
    void ready.then(() => { if (!dead) build(); });
    return () => { dead = true; st?.kill(); tl?.kill(); split?.revert(); };
  }, []);

  useProgress(ref, (p) => {
    const crawl = smooth(0.02, 0.52, p);
    const shown = crawl * nodes.length;
    const judge = smooth(0.46, 0.92, p);
    const lit = Math.floor(judge * (SHOWN.length + 0.999));
    // Highest severity touching each page so far, from the findings already lit.
    const sev = new Array<Severity | null>(nodes.length).fill(null);
    SHOWN.slice(0, lit).forEach((f) => {
      const n = f.n || 1;
      for (let j = 0; j < Math.min(n, nodes.length); j++) {
        const idx = f.n ? j : 0;
        const cur = sev[idx];
        if (!cur || SEV_RANK[f.s] > SEV_RANK[cur]) sev[idx] = f.s;
      }
    });
    // Only touch what changed: this runs every scroll frame across 56 paths and dots.
    nodes.forEach((n, j) => {
      const t = clamp01(shown - j);
      const e = edges.current[j];
      const off = ((1 - t) * n.len).toFixed(1);
      if (e && e.style.strokeDashoffset !== off) e.style.strokeDashoffset = off;
      const d = dots.current[j];
      if (d) {
        const op = t > 0.9 ? "1" : "0";
        if (d.style.opacity !== op) d.style.opacity = op;
        const sv = sev[j] ?? "";
        if (d.dataset.sev !== sv) d.dataset.sev = sv;
      }
    });
    lines.current.forEach((li, j) => {
      const on = j < lit ? "true" : "false";
      if (li && li.dataset.on !== on) li.dataset.on = on;
    });
    const pages = Math.round(crawl * CRAWLED.length);
    const set = (k: string, v: string) => { const el = q.current[k]; if (el && el.textContent !== v) el.textContent = v; };
    set("pages", String(pages));
    set("secs", `${Math.round(crawl * SAMPLE.crawlSeconds)}s`);
    set("found", String(Math.round(judge * 31)));
    const score = Math.round(judge * SAMPLE.scores.overall);
    set("score", String(score));
    const ring = q.current.ring as SVGCircleElement | null;
    const ro = (RING * (1 - score / 100)).toFixed(1);
    if (ring && ring.style.strokeDashoffset !== ro) ring.style.strokeDashoffset = ro;
    const cur = CRAWLED[Math.min(CRAWLED.length - 1, Math.floor(shown))];
    set("log", crawl < 1 ? `GET ${cur.length > 58 ? `${cur.slice(0, 57)}…` : cur}` : `Crawl complete · ${CRAWLED.length} pages · ${SAMPLE.crawlSeconds}s`);
    const log = q.current.logWrap as HTMLElement | null;
    const done = crawl >= 1 ? "true" : "false";
    if (log && log.dataset.done !== done) log.dataset.done = done;
  });

  return (
    <section ref={ref} id="audit" className="lp-act lp-audit" style={{ "--span": 2.8 } as React.CSSProperties} data-sc-act="pin" aria-labelledby="audit-title">
      <div className="lp-stage">
        <div className="lp-wrap lp-audit__grid">
          <div className="lp-audit__copy">
            <p className="lp-hour">07:00</p>
            <h2 ref={title} id="audit-title" className="lp-display lp-display--lg">Theo reads every page before breakfast.</h2>
            <p className="lp-body lp-hide-sm">One crawl, the 40 requirements of the AdSense approval manual, core on-page SEO and Core Web Vitals.</p>
            <dl className="lp-audit__stats">
              <div><dt>Pages crawled</dt><dd ref={r("pages") as never} className="lp-nums">0</dd></div>
              <div><dt>Time</dt><dd ref={r("secs") as never} className="lp-nums">0s</dd></div>
              <div><dt>Findings</dt><dd ref={r("found") as never} className="lp-nums">0</dd></div>
            </dl>
            <ol className="lp-audit__findings" aria-label="The most serious findings">
              {SHOWN.map((f, j) => (
                <li key={f.t} ref={(el) => { lines.current[j] = el; }} data-on="false" data-sev={f.s}>
                  <span className="lp-sev">{SEV_LABEL[f.s]}</span>
                  <span className="lp-audit__t">{f.t}</span>
                  {f.n > 0 && <span className="lp-audit__n lp-nums">{f.n} pages</span>}
                </li>
              ))}
            </ol>
          </div>

          <figure className="lp-audit__viz">
            <svg viewBox="0 0 1000 1000" role="img" aria-label={`The crawl of ${SAMPLE.site}: ${CRAWLED.length} pages drawn as a tree around the overall score of ${SAMPLE.scores.overall} out of 100.`}>
              <circle cx={C.x} cy={C.y} r="330" fill="none" stroke="var(--line)" strokeDasharray="2 10" />
              <circle cx={C.x} cy={C.y} r="190" fill="none" stroke="var(--line)" strokeDasharray="2 8" />
              {nodes.map((n, j) => (
                <path key={n.i} ref={(el) => { edges.current[j] = el; }} d={n.d} className={n.listing ? "lp-edge lp-edge--l" : "lp-edge"} style={{ strokeDasharray: n.len, strokeDashoffset: n.len }} />
              ))}
              {nodes.map((n, j) => (
                <circle key={n.i} ref={(el) => { dots.current[j] = el; }} cx={n.x} cy={n.y} r={n.listing ? 9 : 5.5} className={n.listing ? "lp-node lp-node--l" : "lp-node"} style={{ opacity: 0 }} />
              ))}
              <circle cx={C.x} cy={C.y} r="84" fill="none" stroke="var(--line)" strokeWidth="10" />
              <circle ref={r("ring") as never} cx={C.x} cy={C.y} r="84" fill="none" stroke="var(--sev-high)" strokeWidth="10" strokeLinecap="round" transform={`rotate(-90 ${C.x} ${C.y})`} style={{ strokeDasharray: RING, strokeDashoffset: RING }} />
              <text x={C.x} y={C.y + 18} textAnchor="middle" className="lp-audit__score"><tspan ref={r("score") as never}>0</tspan></text>
              <text x={C.x} y={C.y + 48} textAnchor="middle" className="lp-audit__of">out of 100</text>
            </svg>
            <figcaption ref={r("logWrap") as never} className="lp-audit__log" data-done="false">
              <span ref={r("log") as never} className="lp-nums">GET /</span>
            </figcaption>
          </figure>
        </div>
        <p className="lp-wrap lp-sample">Sample data: a real Rankcrew audit of {SAMPLE.site}, a public scraping sandbox, run {SAMPLE.date}.</p>
      </div>
    </section>
  );
}
