import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { finePointer, reducedMotion, ScrollTrigger } from "./clock";

/**
 * Reports an act's scroll progress (0..1) to `cb`. Deliberately not published as a CSS variable: an inherited
 * custom property changing every frame restyles the whole act, and the noon act holds a two-thousand-node SVG.
 * `pin`: the act is a tall section with a sticky stage; progress runs across its pinned travel.
 * `flow`: progress runs from the section entering the bottom edge to leaving the top.
 * `tail`: from entering the bottom edge until the page end (for the last section).
 */
export function useProgress(ref: RefObject<HTMLElement | null>, cb: (p: number) => void, mode: "pin" | "flow" | "tail" = "pin") {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      cbRef.current(1);
      return;
    }
    const run = (p: number) => cbRef.current(p);
    const st = ScrollTrigger.create({
      trigger: el,
      start: mode === "pin" ? "top top" : "top bottom",
      end: mode === "flow" ? "bottom top" : "bottom bottom",
      onUpdate: (s) => run(s.progress),
      onRefresh: (s) => run(s.progress),
    });
    run(st.progress);
    return () => st.kill();
  }, [ref, mode]);
}

/** Sets a CSS custom property only when it moves by at least `step`, so big subtrees are not restyled every frame. */
export function setVar(el: HTMLElement | SVGElement | null | undefined, name: string, v: number, step = 0.02) {
  if (!el) return;
  const q = Math.round(v / step) * step;
  const s = q.toFixed(3);
  if (el.style.getPropertyValue(name) !== s) el.style.setProperty(name, s);
}

/** True once the element is within `margin` of the viewport; used to mount heavy scenes lazily. */
export function useNear(ref: RefObject<Element | null>, margin = "100% 0px") {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return near;
}

/** Smoothed pointer offset (-1..1 from the viewport centre), fine pointers only, never pointer lock. */
export function usePointer(cb: (x: number, y: number) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (!finePointer() || reducedMotion()) return;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;
    const move = (e: PointerEvent) => {
      target.x = (e.clientX / innerWidth) * 2 - 1;
      target.y = (e.clientY / innerHeight) * 2 - 1;
    };
    const tick = () => {
      const dx = (target.x - cur.x) * 0.06;
      const dy = (target.y - cur.y) * 0.06;
      if (Math.abs(dx) + Math.abs(dy) > 0.0004) {
        cur.x += dx;
        cur.y += dy;
        cbRef.current(cur.x, cur.y);
      }
      raf = requestAnimationFrame(tick);
    };
    addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);
}
