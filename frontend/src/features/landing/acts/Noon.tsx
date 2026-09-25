import { useEffect, useRef } from "react";
import type { OfficeDirector } from "@/features/office/director";
import { SCENE } from "@/features/office/layout";
import { EMPLOYEE_IDS } from "@/features/team/employees";
import type { EmployeeId } from "@/lib/types";
import { clamp01, clock, gsap, reducedMotion, smooth, sunAt } from "../clock";
import { setVar, useNear, useProgress } from "../hooks";
import { OfficeWorld } from "@/features/office/OfficeWorld";

const WORDS = "Then, at noon, every desk is taken.".split(" ");

/** 11:59. Authored silence: one sentence brightening word by word under the reader's hand. */
export function Silence() {
  const ref = useRef<HTMLElement>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  useProgress(ref, (p) => {
    words.current.forEach((w, i) => {
      if (!w) return;
      const t = smooth(0.08 + i * 0.075, 0.2 + i * 0.075, p);
      w.style.opacity = (0.14 + 0.86 * t).toFixed(3);
    });
  });
  return (
    <section ref={ref} id="silence" className="lp-act lp-silence" style={{ "--span": 1.5 } as React.CSSProperties} data-sc-act="pin">
      <div className="lp-stage">
        <p className="lp-display lp-display--lg lp-silence__line">
          {WORDS.map((w, i) => <span key={i} ref={(el) => { words.current[i] = el; }}>{w} </span>)}
        </p>
      </div>
    </section>
  );
}

// Each employee's task is taken from the sample audit's real findings and proposed fixes.
const TASKS: Record<EmployeeId, string> = {
  manager: "Planning today's cycle",
  auditor: "Re-checking 31 findings",
  rank_analyst: "Striking-distance queries",
  researcher: "Keyword ideas: catalogue",
  onpage: "Fix 6 duplicate titles",
  strategist: "Plan: thin About page",
  writer: "Draft: Privacy Policy",
  link_builder: "56 missing canonicals",
  tech_seo: "Generate sitemap.xml",
  engineer: "PR: canonicals + schema",
  compliance: "Verifying 67 fixes",
};
const ALL = [...EMPLOYEE_IDS];
// Hand-offs follow the real reporting lines.
const LINES: [EmployeeId, EmployeeId][] = [
  ["manager", "onpage"], ["manager", "rank_analyst"], ["manager", "strategist"], ["rank_analyst", "onpage"], ["researcher", "strategist"],
  ["strategist", "writer"], ["link_builder", "engineer"], ["tech_seo", "engineer"], ["researcher", "writer"], ["manager", "tech_seo"],
];

type Cam = { cx: number; cy: number; w: number };
// Camera stops, in office scene units, and the caption for each.
const SHOTS: { at: [number, number]; cam: Cam; time: string; text: string; cue?: (d: OfficeDirector) => void }[] = [
  { at: [0, 0.12], cam: { cx: 720, cy: 430, w: 1440 }, time: "12:00", text: "Every desk is taken. A sample day on books.toscrape.com." },
  { at: [0.2, 0.3], cam: { cx: 470, cy: 390, w: 860 }, time: "12:04", text: "Maya gives Lena the six duplicate titles Theo found.", cue: (d) => d.handoff("manager", "onpage") },
  { at: [0.38, 0.48], cam: { cx: 790, cy: 430, w: 520 }, time: "12:09", text: "Lena rewrites each one against what already ranks for that page." },
  { at: [0.56, 0.66], cam: { cx: 1150, cy: 370, w: 560 }, time: "12:11", text: "Jev checks every line. Nothing reaches your site without a pass.", cue: (d) => d.say("compliance", "🛡️ Verified", 2.6) },
  { at: [0.74, 0.84], cam: { cx: 1150, cy: 380, w: 760 }, time: "12:15", text: "Kai hands 56 missing canonicals to Ezra. One pull request.", cue: (d) => d.handoff("link_builder", "engineer") },
  { at: [0.92, 1], cam: { cx: 720, cy: 430, w: 1440 }, time: "12:30", text: "That is one lunchtime. They keep going until six." },
];

/** Scroll picks the shot (switching halfway between two shot windows); the camera then glides to it and holds. */
function shotAt(p: number) {
  for (let i = SHOTS.length - 1; i > 0; i--) if (p >= (SHOTS[i - 1].at[1] + SHOTS[i].at[0]) / 2) return i;
  return 0;
}

/** 12:00. The peak: the product's office in full daylight, a scroll camera following one lunchtime. */
export function Noon() {
  const ref = useRef<HTMLElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const scene = useRef<SVGGElement>(null);
  const director = useRef<OfficeDirector | null>(null);
  const caps = useRef<(HTMLParagraphElement | null)[]>([]);
  const lastShot = useRef(-1);
  const prog = useRef(0);
  // Stage size and the SVG's base scale (it is sized to cover the stage at the wide shot), measured on resize only.
  const box = useRef({ W: 1440, H: 900, so: 1 });
  useEffect(() => {
    const el = svg.current;
    const stage = el?.parentElement;
    if (!el || !stage) return;
    const ro = new ResizeObserver(([e]) => {
      const W = e.contentRect.width;
      const H = Math.max(1, e.contentRect.height);
      const so = Math.max(W / SCENE.w, H / SCENE.h);
      box.current = { W, H, so };
      el.style.width = `${SCENE.w * so}px`;
      el.style.height = `${SCENE.h * so}px`;
      draw();
    });
    ro.observe(stage);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const near = useNear(ref, "60% 0px");
  const inView = useNear(ref, "0px");

  // The live camera, in scene units; a tween walks it between shots.
  const cam = useRef<Cam>({ ...SHOTS[0].cam });
  const glide = useRef<gsap.core.Tween | null>(null);
  const draw = () => {
    const el = svg.current;
    if (!el) return;
    const c = cam.current;
    const { W, H, so } = box.current;
    const a = W / H;
    const w = Math.min(c.w, SCENE.w, SCENE.h * a);
    const h = w / a;
    const x = Math.min(SCENE.w - w, Math.max(0, c.cx - w / 2));
    const y = Math.min(Math.max(0, SCENE.h - h), Math.max(0, c.cy - h / 2));
    const s = W / w; // screen px per scene unit
    el.style.transform = `translate3d(${(-x * s).toFixed(1)}px, ${(-y * s).toFixed(1)}px, 0) scale(${(s / so).toFixed(4)})`;
  };
  const apply = (p: number) => {
    const shot = shotAt(p);
    if (shot === lastShot.current) return;
    caps.current.forEach((c, i) => c?.setAttribute("data-on", String(i === shot)));
    if (lastShot.current !== -1 && director.current) SHOTS[shot].cue?.(director.current);
    lastShot.current = shot;
    glide.current?.kill();
    const to = SHOTS[shot].cam;
    if (reducedMotion()) { cam.current = { ...to }; draw(); return; }
    // Width travels in log space so a zoom feels even from wide to close.
    const from = { ...cam.current, lw: Math.log(cam.current.w) };
    const el = svg.current;
    // Composited while it moves; re-rastered sharp once it lands.
    if (el) el.style.willChange = "transform";
    glide.current = gsap.to(from, {
      cx: to.cx, cy: to.cy, lw: Math.log(to.w), duration: 1.15, ease: "power3.inOut",
      onUpdate: () => { cam.current = { cx: from.cx, cy: from.cy, w: Math.exp(from.lw) }; draw(); },
      onComplete: () => { if (el) el.style.willChange = "auto"; },
    });
  };
  useEffect(() => () => { glide.current?.kill(); }, []);

  useProgress(ref, (p) => {
    prog.current = p;
    apply(p);
    setVar(scene.current, "--day", clamp01(sunAt(clock.get()) * 1.15));
  });

  // Dragging the sun regrades the office even while the camera holds still.
  useEffect(() => clock.on((h) => {
    if (h >= 11.5 && h <= 15.5) setVar(scene.current, "--day", clamp01(sunAt(h) * 1.15));
  }), []);

  // Ambient hand-offs along the reporting lines while the office is on screen.
  useEffect(() => {
    if (!inView || reducedMotion()) return;
    const id = setInterval(() => {
      const d = director.current;
      if (!d) return;
      const [a, b] = LINES[Math.floor(Math.random() * LINES.length)];
      if (Math.random() < 0.25) d.celebrate(b); else d.handoff(a, b);
    }, 2300);
    return () => clearInterval(id);
  }, [inView]);

  const onDirector = (d: OfficeDirector | null) => {
    director.current = d;
    if (!d) return;
    for (const id of ALL) d.setDesired(id, { mode: "work", text: TASKS[id] });
    requestAnimationFrame(() => { lastShot.current = -1; apply(prog.current); });
  };

  return (
    <section ref={ref} id="noon" className="lp-act lp-noon g-day" style={{ "--span": 4.2 } as React.CSSProperties} data-sc-act="pin" aria-labelledby="noon-title">
      <div className="lp-stage">
        <h2 id="noon-title" className="lp-sr">12:00: the whole crew at work on the sample site</h2>
        <svg ref={svg} className="lp-noon__office" viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} preserveAspectRatio="none" role="img" aria-label="The Rankcrew office at noon: all eleven employees at their desks, paper planes carrying tasks between them.">
          <g ref={scene} className="office-scene lo" style={{ "--day": 1 } as React.CSSProperties}>
            {near && <OfficeWorld dark={false} working={ALL} atDesks onDirector={onDirector} />}
          </g>
        </svg>
        <div className="lp-noon__captions" aria-live="off">
          {SHOTS.map((s, i) => (
            <p key={s.time} ref={(el) => { caps.current[i] = el; }} className="lp-status lp-noon__cap" data-on={i === 0}>
              <span className="lp-status__dot" aria-hidden="true" />
              <span className="lp-nums">{s.time}</span>
              <span>{s.text}</span>
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
