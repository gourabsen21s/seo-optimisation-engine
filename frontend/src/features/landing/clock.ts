import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);
export { gsap, ScrollTrigger, SplitText };

/** The page is one working day. Scroll position maps to a clock time, piecewise per act. */
export const DAY_START = 6;
export const DAY_END = 18.5;

export type ActId = "dawn" | "audit" | "crew" | "silence" | "noon" | "review" | "results" | "signoff";
export const ACTS: { id: ActId; h0: number; h1: number; label?: string }[] = [
  { id: "dawn", h0: 6, h1: 7, label: "Dawn" },
  { id: "audit", h0: 7, h1: 9, label: "Audit" },
  { id: "crew", h0: 9, h1: 11.5, label: "Crew" },
  { id: "silence", h0: 11.5, h1: 12 },
  { id: "noon", h0: 12, h1: 15, label: "Noon" },
  { id: "review", h0: 15, h1: 17, label: "Review" },
  { id: "results", h0: 17, h1: 18, label: "Results" },
  { id: "signoff", h0: 18, h1: 18.5, label: "Sign-off" },
];

type Listener = (hour: number) => void;
const listeners = new Set<Listener>();
let hour = DAY_START;
let seeker: ((h: number, smooth: boolean) => void) | null = null;

export const clock = {
  get: () => hour,
  set(h: number) {
    if (Math.abs(h - hour) < 1e-4) return;
    hour = h;
    listeners.forEach((l) => l(h));
  },
  on(l: Listener) {
    listeners.add(l);
    l(hour);
    return () => { listeners.delete(l); };
  },
  /** Scroll the page to a time of day. */
  seek: (h: number, smooth = true) => seeker?.(h, smooth),
  setSeeker(fn: typeof seeker) { seeker = fn; },
};

/** Sun elevation, 0 at 06:00 and 18:36, 1 around 12:18. */
export const sunAt = (h: number) => Math.max(0, Math.sin((Math.PI * (h - 6)) / 12.6));

export const fmtClock = (h: number) => {
  const m = Math.min(Math.round(h * 60), 24 * 60 - 1);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, 1 after b, smooth in between. */
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
