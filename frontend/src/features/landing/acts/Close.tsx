import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/config/brand";
import { clamp01, finePointer, lerp, reducedMotion, smooth } from "../clock";
import { useProgress } from "../hooks";

const REPO = "https://github.com/gourabsen21s/seo-optimisation-engine";

/** 17:00. The 14-day check, drawn by scroll: kept or rolled back. */
const useCompact = () => {
  const q = "(max-width: 700px)";
  const [c, setC] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setC(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return c;
};

export function Results() {
  const ref = useRef<HTMLElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const compact = useCompact();
  // x of day 0, x of day 14, x where the fork ends, and the frame width
  const [X0, X1, XE, VW] = compact ? [16, 400, 520, 720] : [40, 900, 1080, 1200];
  const dx = (d: number) => X0 + (d / 14) * (X1 - X0);
  useProgress(ref, (p) => {
    const t = smooth(0.06, 0.52, p);
    const fork = smooth(0.52, 0.74, p);
    svg.current?.style.setProperty("--t", t.toFixed(4));
    svg.current?.style.setProperty("--fork", fork.toFixed(4));
    svg.current?.querySelectorAll<SVGGElement>("[data-day]").forEach((g) => {
      g.dataset.on = String(+g.dataset.day! / 14 <= t + 0.001);
    });
  });
  return (
    <section ref={ref} id="results" className="lp-act lp-results g-dusk" style={{ "--span": 1.9 } as React.CSSProperties} data-sc-act="pin" aria-labelledby="results-title">
      <div className="lp-stage">
      <div className="lp-wrap lp-results__wrap">
        <svg ref={svg} className="lp-results__line" viewBox={`0 0 ${VW} 300`} role="img" aria-label="Timeline: a change is applied on day 0, measured on day 14, then kept if rankings held or rolled back if they fell.">
          <path className="lp-results__track" d={`M${X0} 150 H${X1}`} />
          <path className="lp-results__draw" d={`M${X0} 150 H${X1}`} pathLength={1} />
          {Array.from({ length: 15 }, (_, d) => (
            <g key={d} data-day={d} data-on="false" transform={`translate(${dx(d)} 150)`}>
              <circle r={d === 0 || d === 14 ? 9 : 4} />
              {(d === 0 || d === 14 || (d === 7 && !compact)) && <text y="42" textAnchor={d === 0 && compact ? "start" : "middle"} x={d === 0 && compact ? -8 : 0}>Day {d}</text>}
            </g>
          ))}
          <text x={X0 - (compact ? 8 : 0)} y="104" className="lp-results__cap">Change applied</text>
          <text x={X1 + 12} y="104" textAnchor="end" className="lp-results__cap">{compact ? "Day 14 check" : "Search Console check"}</text>
          <path className="lp-results__fork lp-results__fork--up" d={`M${X1} 150 C ${X1 + 80} 150, ${X1 + 90} 70, ${XE} 70`} pathLength={1} />
          <path className="lp-results__fork lp-results__fork--down" d={`M${X1} 150 C ${X1 + 80} 150, ${X1 + 90} 230, ${XE} 230`} pathLength={1} />
          <g className="lp-results__end lp-results__end--up"><circle cx={XE + 6} cy="70" r="7" /><text x={XE + 22} y="77">Kept</text></g>
          <g className="lp-results__end lp-results__end--down"><circle cx={XE + 6} cy="230" r="7" /><text x={XE + 22} y="237">Rolled back</text></g>
        </svg>
        <div className="lp-results__copy">
          <p className="lp-hour">17:00</p>
          <h2 id="results-title" className="lp-display lp-display--lg">Every change gets judged by results.</h2>
          <p className="lp-body">Ravi pulls Search Console fourteen days after each change and compares it with the baseline. A change that made rankings worse is rolled back automatically, exactly as it was.</p>
          <p className="lp-results__honest">No tool can promise a #1 ranking. Rankcrew removes every technical and on-page obstacle it can find, and puts what needs a human on a checklist.</p>
        </div>
      </div>
      </div>
    </section>
  );
}

const MODELS = ["Anthropic", "OpenAI", "Google Gemini", "Groq", "Mistral", "DeepSeek", "xAI", "OpenRouter", "Ollama", "vLLM", "LM Studio", "LiteLLM"];

/** A band of the models the crew can run on; drifts faster while the page is being scrolled. */
function Models() {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    if (!el || reducedMotion()) return;
    let x = 0;
    let lastY = scrollY;
    let v = 0;
    let raf = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) { lastY = scrollY; raf = requestAnimationFrame(tick); }
    });
    io.observe(el);
    const tick = () => {
      if (!visible) return;
      const dy = scrollY - lastY;
      lastY = scrollY;
      v += (Math.min(40, Math.abs(dy)) - v) * 0.08;
      x -= 0.4 + v * 0.35;
      const half = el.scrollWidth / 2;
      if (-x > half) x += half;
      el.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      raf = requestAnimationFrame(tick);
    };
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="lp-models" aria-label={`Works with ${MODELS.join(", ")}`}>
      <div ref={track} className="lp-models__track" aria-hidden="true">
        {[...MODELS, ...MODELS].map((m, i) => <span key={i}>{m}</span>)}
      </div>
    </div>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="lp-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); });
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

const DOCKER = `cp .env.example .env
docker compose build
docker compose run --rm --no-deps app seo-engine gen-secrets
docker compose up -d`;

function normalise(v: string) {
  const s = v.trim();
  if (!s) return "https://yoursite.com";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** The wordmark on the horizon: it stretches out as it arrives, and swells under the pointer. */
function Wordmark({ progress }: { progress: React.RefObject<number> }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const letters = [...el.querySelectorAll<HTMLSpanElement>("span")];
    const ptr = { x: -1e4, y: -1e4, on: false };
    const move = (e: PointerEvent) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; };
    const leave = () => { ptr.on = false; };
    const pointer = finePointer() && !reducedMotion();
    if (pointer) { addEventListener("pointermove", move, { passive: true }); document.addEventListener("pointerleave", leave); }
    const cur = letters.map(() => ({ w: 64, g: 560 }));
    let raf = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    const tick = () => {
      if (!visible) return;
      const base = lerp(64, 100, smooth(0.6, 1, progress.current ?? 0));
      letters.forEach((l, i) => {
        let near = 0;
        if (ptr.on) {
          const r = l.getBoundingClientRect();
          const d = Math.hypot(ptr.x - (r.left + r.width / 2), (ptr.y - (r.top + r.height / 2)) * 0.6);
          near = clamp01(1 - d / (innerWidth * 0.22));
        }
        const tw = base + near * 22;
        const tg = 560 + near * 340;
        if (Math.abs(tw - cur[i].w) < 0.05 && Math.abs(tg - cur[i].g) < 0.5) return;
        cur[i].w += (tw - cur[i].w) * 0.14;
        cur[i].g += (tg - cur[i].g) * 0.14;
        l.style.fontStretch = `${cur[i].w.toFixed(1)}%`;
        l.style.fontWeight = cur[i].g.toFixed(0);
      });
      raf = requestAnimationFrame(tick);
    };
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [progress]);
  return (
    <p ref={ref} className="lp-wordmark" aria-hidden="true">
      {BRAND.name.split("").map((c, i) => <span key={i}>{c}</span>)}
    </p>
  );
}

/** 18:00. Sign-off: the one action, with a real input that writes the real command. */
export function SignOff() {
  const ref = useRef<HTMLElement>(null);
  const sun = useRef<HTMLDivElement>(null);
  const prog = useRef(0);
  const [url, setUrl] = useState("");
  const cmd = `seo-engine audit ${normalise(url)} --max-pages 200 --html report.html`;

  useProgress(ref, (p) => {
    prog.current = p;
    // The sun sets behind the wordmark as the page arrives at its end.
    const s = smooth(0.55, 1, p);
    if (sun.current) sun.current.style.transform = `translate3d(-50%, ${lerp(-70, 12, s).toFixed(1)}%, 0)`;
  }, "tail");

  return (
    <section ref={ref} id="signoff" className="lp-act lp-signoff g-dusk" aria-labelledby="signoff-title">
      <Models />
      <div className="lp-wrap lp-signoff__grid">
        <div className="lp-signoff__copy">
          <p className="lp-hour">18:00</p>
          <h2 id="signoff-title" className="lp-display lp-display--lg">Your crew can start tonight.</h2>
          <p className="lp-body">Self-hosted, so your data stays on your server. Bring any model, or none: the audit and the rule-based fixes run without one. Search Console, WordPress and GitHub connect when you are ready.</p>
          <div className="lp-actions">
            <a className="lp-btn lp-btn--primary" href={`${REPO}#quick-start`} target="_blank" rel="noreferrer">Deploy the crew</a>
            <a className="lp-btn lp-btn--ghost" href="/login">Open console</a>
          </div>
        </div>

        <div id="deploy" className="lp-deploy">
          <div className="lp-deploy__step">
            <label className="lp-deploy__label" htmlFor="lp-site">Try it on your site first</label>
            <input
              id="lp-site"
              className="lp-input"
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="yoursite.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <div className="lp-code">
              <code>{cmd}</code>
              <Copy text={cmd} />
            </div>
            <p className="lp-deploy__hint">One command, no database: a full audit and an HTML report.</p>
          </div>
          <div className="lp-deploy__step">
            <p className="lp-deploy__label">Then run the whole crew</p>
            <div className="lp-code lp-code--block">
              <pre><code>{DOCKER}</code></pre>
              <Copy text={DOCKER} />
            </div>
            <p className="lp-deploy__hint">Paste the two printed secrets and your model key into <code>.env</code>, then open <code>localhost:8000</code>.</p>
          </div>
        </div>
      </div>

      <div className="lp-horizon">
        <div ref={sun} className="lp-horizon__sun" aria-hidden="true" />
        <Wordmark progress={prog} />
      </div>
      <footer className="lp-wrap lp-foot">
        <span>{BRAND.name}. Self-hosted SEO and AdSense readiness, run by a crew of AI employees.</span>
        <a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a>
      </footer>
    </section>
  );
}
