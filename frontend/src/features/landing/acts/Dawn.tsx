import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { OfficeDirector } from "@/features/office/director";
import { SCENE } from "@/features/office/layout";
import type { EmployeeId } from "@/lib/types";
import { clamp01, fmtClock, gsap, lerp, reducedMotion, smooth, SplitText, sunAt } from "../clock";
import { setVar, useNear, usePointer, useProgress } from "../hooks";
import { OfficeWorld } from "@/features/office/OfficeWorld";

// World units for the city scene. The lit glass box has the office's own aspect ratio,
// so flying the viewBox onto it lands on the office exactly, full-bleed.
const WORLD = { w: 1600, h: 1000 };
const BOX = { x: 930, y: 452, w: 430, h: (430 * SCENE.h) / SCENE.w };
const TOWER = { x: 880, y: 150, w: 530 };

// Seeded pseudo-random so the skyline is the same on every visit.
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function useCity() {
  return useMemo(() => {
    const r = rng(7);
    const far: { x: number; w: number; h: number; lit: [number, number][] }[] = [];
    for (let x = -20; x < WORLD.w; ) {
      const w = 40 + r() * 90;
      const h = 90 + r() * 260;
      const lit: [number, number][] = [];
      for (let yy = 14; yy < h - 10; yy += 16) for (let xx = 8; xx < w - 8; xx += 13) if (r() < 0.06) lit.push([xx, yy]);
      far.push({ x, w, h, lit });
      x += w + 4 + r() * 10;
    }
    const windows: { x: number; y: number; on: boolean; flick: boolean }[] = [];
    for (let y = TOWER.y + 46; y < WORLD.h + 40; y += 58) {
      for (let i = 0; i < 7; i++) {
        const x = TOWER.x + 30 + i * 70;
        if (y + 30 > BOX.y - 18 && y < BOX.y + BOX.h + 18) continue;
        const on = r() < 0.13;
        windows.push({ x, y, on, flick: on && r() < 0.35 });
      }
    }
    const stars = Array.from({ length: 90 }, () => ({ x: r() * 100, y: r() * 58, s: 0.6 + r() * 1.6, d: r() * 4 }));
    return { far, windows, stars };
  }, []);
}

type Rect = { x: number; y: number; w: number; h: number };
/** Rect along a dolly zoom from A to B about their shared fixed point, width interpolated in log space. */
function zoomRect(a: Rect, b: Rect, t: number): Rect {
  const r = b.w / a.w;
  const fx = (b.x - a.x * r) / (1 - r);
  const fy = (b.y - a.y * r) / (1 - r);
  const k = Math.pow(r, t);
  return { x: fx - (fx - a.x) * k, y: fy - (fy - a.y) * k, w: a.w * k, h: a.h * k };
}

export function Dawn() {
  const ref = useRef<HTMLElement>(null);
  const city = useCity();
  const svg = useRef<SVGSVGElement>(null);
  const office = useRef<SVGGElement>(null);
  const layers = useRef<Record<string, HTMLElement | SVGElement | null>>({});
  const lay = (k: string) => (el: HTMLElement | SVGElement | null) => { layers.current[k] = el; };
  const director = useRef<OfficeDirector | null>(null);
  const [working, setWorking] = useState<EmployeeId[]>([]);
  const workingRef = useRef(working);
  const ptr = useRef({ x: 0, y: 0 });
  const near = useNear(ref, "50% 0px");
  const prog = useRef(0);

  const render = () => {
    const p = prog.current;
    const L = layers.current;
    const el = ref.current;
    const s = svg.current;
    if (!el || !s) return;
    const vw = innerWidth;
    const vh = innerHeight;
    const portrait = vw < vh;
    // Opening frame: whole skyline on wide screens, the tower on phones.
    const aspect = vw / vh;
    const openH = WORLD.h;
    const openW = portrait ? openH * aspect : WORLD.w;
    const openX = portrait ? TOWER.x + TOWER.w / 2 - openW / 2 - 40 : 0;
    // On phones the copy sits at the top, so the lit floor opens in the lower half of the frame.
    const open = { x: openX, y: portrait ? -330 : 0, w: openW, h: openH };
    const end = portrait ? { x: BOX.x + BOX.w * 0.3, y: BOX.y, w: BOX.h * aspect, h: BOX.h } : BOX;
    const t = smooth(0.1, 0.9, p);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const cam = zoomRect(open, end, eased);
    const { x: mx, y: my } = ptr.current;
    const drift = 1 - eased; // pointer parallax fades out as we arrive
    s.setAttribute("viewBox", `${(cam.x - mx * 6 * drift).toFixed(2)} ${(cam.y - my * 4 * drift).toFixed(2)} ${cam.w.toFixed(2)} ${cam.h.toFixed(2)}`);

    const set = (k: string, v: string, o?: number) => {
      const n = L[k] as HTMLElement | null;
      if (!n) return;
      n.style.transform = v;
      if (o !== undefined) n.style.opacity = o.toFixed(3);
    };
    set("sky", `translate3d(${-mx * 4}px, ${-my * 3}px, 0)`);
    set("stars", `translate3d(${-mx * 6}px, ${-my * 4 + p * 40}px, 0)`, clamp01(1 - p * 1.6));
    set("sun", `translate3d(${-mx * 8}px, ${lerp(0, -26, p)}vh, 0) scale(${lerp(1, 1.35, p)})`);
    set("glow", `translate3d(0, ${lerp(0, -6, p)}vh, 0)`, lerp(0.35, 1, p));
    set("far", `translate3d(${-mx * 14}px, ${p * 6}vh, 0) translateY(${-my * 6}px) scale(${lerp(1, 1.18, eased)})`, clamp01(1 - smooth(0.55, 0.85, p)));
    set("mist", `translate3d(${-mx * 22}px, ${p * 10}vh, 0)`, clamp01(0.8 - p));
    const out = lerp(0, 58, eased);
    set("nearL", `translate3d(${-out}vw, ${p * 8}vh, 0) translateX(${-mx * 40}px) scale(${lerp(1, 2.2, eased)})`);
    set("nearR", `translate3d(${out}vw, ${p * 12}vh, 0) translateX(${-mx * 40}px) scale(${lerp(1, 2.4, eased)})`);
    const copyOut = smooth(0.04, 0.34, p);
    set("copy", `translate3d(0, ${-copyOut * 60}px, 0) scale(${1 - copyOut * 0.04})`, 1 - copyOut);
    const glass = L.glass as SVGGElement | null;
    if (glass) glass.style.opacity = (1 - smooth(0.62, 0.86, eased)).toFixed(3);
    const cap = L.caption as HTMLElement | null;
    if (cap) cap.style.opacity = smooth(0.86, 0.97, p).toFixed(3);
  };

  useProgress(ref, (raw) => {
    // Without motion the hero rests on its opening composition: headline, city, the lit floor.
    const p = reducedMotion() ? 0 : raw;
    prog.current = p;
    render();
    const hour = lerp(6, 7, p);
    const day = sunAt(hour) * 1.6;
    setVar(office.current, "--day", Math.min(0.42, day));
    // The crew arrives with the camera: Theo first, then Maya.
    const next: EmployeeId[] = p > 0.5 ? (p > 0.8 ? ["auditor", "manager"] : ["auditor"]) : [];
    if (next.join() !== workingRef.current.join()) {
      workingRef.current = next;
      setWorking(next);
      const d = director.current;
      if (d) {
        d.setDesired("auditor", next.includes("auditor") ? { mode: "work", text: "Starting the 07:00 crawl" } : { mode: "roam" });
        d.setDesired("manager", next.includes("manager") ? { mode: "work", text: "Reading last night's report" } : { mode: "roam" });
      }
    }
    const cap = layers.current.captionTime as HTMLElement | null;
    if (cap) cap.textContent = fmtClock(hour);
  });
  usePointer((x, y) => { ptr.current = { x, y }; if (prog.current < 0.95) render(); });

  const scene = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (reducedMotion() || !scene.current || !title.current) return;
    const copy = layers.current.copy as HTMLElement | null;
    gsap.set(scene.current, { scale: 1.07, autoAlpha: 0 });
    gsap.set(copy, { autoAlpha: 0 });
    let split: SplitText | null = null;
    let tl: gsap.core.Timeline | null = null;
    let dead = false;
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (dead) return;
      split = new SplitText(title.current!, { type: "lines", mask: "lines", linesClass: "lp-line" });
      tl = gsap.timeline({ defaults: { ease: "expo.out" } })
        .to(scene.current, { scale: 1, autoAlpha: 1, duration: 2.2 }, 0)
        .set(copy, { autoAlpha: 1 }, 0.25)
        .from(split.lines, { yPercent: 110, duration: 1.3, stagger: 0.12 }, 0.3)
        .from(copy!.querySelectorAll(".lp-lede, .lp-actions"), { autoAlpha: 0, y: 16, duration: 1, stagger: 0.08 }, 0.75);
    });
    return () => { dead = true; tl?.kill(); split?.revert(); gsap.set([scene.current, copy], { clearProps: "all" }); };
  }, []);

  return (
    <section ref={ref} id="dawn" className="lp-act lp-dawn" style={{ "--span": 2.3 } as React.CSSProperties} data-sc-act="pin" aria-labelledby="dawn-title">
      <div className="lp-stage">
        <div ref={scene} className="lp-dawn__scene">
        <div ref={lay("sky")} className="lp-dawn__sky" />
        <svg ref={lay("stars") as never} className="lp-dawn__stars" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          {city.stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.s * 0.09} style={{ animationDelay: `${s.d}s` }} />)}
        </svg>
        <div ref={lay("glow")} className="lp-dawn__glow" />
        <div ref={lay("sun")} className="lp-dawn__sun" />
        <svg ref={lay("far") as never} className="lp-dawn__far" viewBox={`0 0 ${WORLD.w} 420`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <defs>
            <linearGradient id="far-haze" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1d2742" />
              <stop offset="1" stopColor="#2a2640" />
            </linearGradient>
          </defs>
          {city.far.map((b, i) => (
            <g key={i} transform={`translate(${b.x} ${420 - b.h})`}>
              <rect width={b.w} height={b.h + 10} fill="url(#far-haze)" />
              {b.lit.map(([x, y], j) => <rect key={j} x={x} y={y} width="5" height="7" fill="#f3b36b" opacity="0.4" />)}
            </g>
          ))}
        </svg>
        <div ref={lay("mist")} className="lp-dawn__mist" />

        <svg ref={svg} className="lp-dawn__city" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="An office tower before sunrise. One floor is lit: the Rankcrew office, where the crew is arriving.">
          <defs>
            <linearGradient id="tw-face" x1="0" x2="1">
              <stop offset="0" stopColor="#1a2336" />
              <stop offset="0.35" stopColor="#111a2a" />
              <stop offset="1" stopColor="#0b111d" />
            </linearGradient>
            <linearGradient id="tw-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="0.4" stopColor="#fff" stopOpacity="0.02" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0.1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="tw-lit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffd59a" />
              <stop offset="1" stopColor="#c9773a" />
            </linearGradient>
            <radialGradient id="tw-spill" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffb86b" stopOpacity="0.28" />
              <stop offset="1" stopColor="#ffb86b" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* a second, nearer tower to the left for depth */}
          <g fill="#0d1422">
            <rect x="560" y="330" width="250" height="700" />
            {Array.from({ length: 10 }, (_, r) => Array.from({ length: 4 }, (_, c) => (
              <rect key={`${r}-${c}`} x={580 + c * 58} y={360 + r * 62} width="36" height="26" fill={(r * 7 + c * 3) % 11 === 0 ? "#e9a766" : "#141d2e"} opacity={(r * 7 + c * 3) % 11 === 0 ? 0.6 : 1} />
            )))}
          </g>
          {/* the tower */}
          <rect x={TOWER.x} y={TOWER.y} width={TOWER.w} height={WORLD.h} fill="url(#tw-face)" />
          <rect x={TOWER.x + 150} y={TOWER.y - 70} width="16" height="70" fill="#101828" />
          <rect x={TOWER.x + 157} y={TOWER.y - 128} width="3" height="60" fill="#101828" />
          <circle cx={TOWER.x + 158.5} cy={TOWER.y - 130} r="3.2" fill="#ff5d4a" className="lp-beacon" />
          <rect x={TOWER.x + 330} y={TOWER.y - 44} width="90" height="44" rx="4" fill="#0f1726" />
          {city.windows.map((w, i) => (
            <rect key={i} x={w.x} y={w.y} width="44" height="30" rx="1.5" fill={w.on ? "url(#tw-lit)" : "#16202f"} opacity={w.on ? 0.62 : 1} className={w.flick ? "lp-flick" : undefined} style={w.flick ? { animationDelay: `${(i % 7) * 0.9}s` } : undefined} />
          ))}
          {/* light spilling from the lit floor */}
          <ellipse cx={BOX.x + BOX.w / 2} cy={BOX.y + BOX.h / 2} rx={BOX.w * 0.95} ry={BOX.h * 1.2} fill="url(#tw-spill)" />
          <rect x={BOX.x - 14} y={BOX.y - 14} width={BOX.w + 28} height={BOX.h + 28} fill="#0a0f19" />
          {/* the Rankcrew floor: the product's live office, at the office's own scale */}
          <svg x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} overflow="hidden">
            <g ref={office} className="office-scene lo" style={{ "--day": 0 } as React.CSSProperties}>
              {near && <OfficeWorld dark working={working} onDirector={(d) => { director.current = d; }} />}
            </g>
          </svg>
          <g ref={lay("glass") as never} pointerEvents="none">
            <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill="url(#tw-glass)" />
            {[1, 2, 3].map((i) => <rect key={i} x={BOX.x + (BOX.w / 4) * i - 1.5} y={BOX.y} width="3" height={BOX.h} fill="#0a0f19" />)}
            <rect x={BOX.x} y={BOX.y + BOX.h * 0.18} width={BOX.w} height="2.5" fill="#0a0f19" />
          </g>
        </svg>

        <svg ref={lay("nearL") as never} className="lp-dawn__near lp-dawn__near--l" viewBox="0 0 300 1000" preserveAspectRatio="xMinYMax meet" aria-hidden="true">
          <path d="M0 120 H210 V170 H240 V1000 H0Z" fill="#05080e" />
          {Array.from({ length: 12 }, (_, r) => [0, 1, 2].map((c) => (
            <rect key={`${r}${c}`} x={24 + c * 66} y={200 + r * 66} width="40" height="30" fill={(r + c * 2) % 9 === 1 ? "#d69556" : "#0a0f18"} opacity={(r + c * 2) % 9 === 1 ? 0.5 : 1} />
          )))}
        </svg>
        <svg ref={lay("nearR") as never} className="lp-dawn__near lp-dawn__near--r" viewBox="0 0 300 1000" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
          <path d="M300 300 H120 V330 H70 V1000 H300Z" fill="#05080e" />
          <path d="M150 300 V200 M150 210 L210 300 M150 240 L190 300" stroke="#05080e" strokeWidth="6" fill="none" />
          <rect x="136" y="170" width="30" height="34" rx="3" fill="#05080e" />
        </svg>
        </div>

        <div ref={lay("copy")} className="lp-dawn__copy">
          <h1 ref={title} id="dawn-title" className="lp-display lp-display--xl">Your SEO team starts<br /> before you do.</h1>
          <p className="lp-lede">Rankcrew is eleven AI employees who audit, fix and grow your site's search presence, then check what actually worked.</p>
          <div className="lp-actions">
            <a className="lp-btn lp-btn--primary" href="#deploy">Deploy the crew</a>
            <a className="lp-btn lp-btn--ghost" href="/login">Open console</a>
          </div>
        </div>

        <p ref={lay("caption") as never} className="lp-status lp-dawn__caption" style={{ opacity: 0 }}>
          <span className="lp-status__dot" aria-hidden="true" />
          <span ref={lay("captionTime") as never} className="lp-nums">06:00</span>
          <span>Theo is first in. He starts the crawl at seven.</span>
        </p>
      </div>
    </section>
  );
}

