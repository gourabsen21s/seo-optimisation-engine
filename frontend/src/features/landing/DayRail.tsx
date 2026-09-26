import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "@/config/brand";
import { ACTS, clock, DAY_END, DAY_START, fmtClock, sunAt } from "./clock";

const STOPS = ACTS.filter((a) => a.label);
const SPAN = DAY_END - DAY_START;
const groundAt = (h: number) => (h >= 12 && h < 17 ? "day" : h >= 17 ? "dusk" : "night");

/** Bar sun colour: low sun is red-orange, high sun is pale gold. */
const sunColor = (e: number) => `oklch(${0.72 + e * 0.2} ${0.19 - e * 0.09} ${48 + e * 30})`;

/**
 * The nav is the day. Hour stops jump; the sun is the playhead, and dragging it scrubs the whole page
 * (scroll, light, the office) like a timeline.
 */
export function DayRail() {
  const bar = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const sun = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);

  useEffect(() => clock.on((h) => {
    const t = (h - DAY_START) / SPAN;
    const s = sun.current;
    if (s) {
      s.style.setProperty("--t", t.toFixed(4));
      s.style.setProperty("--sun", sunColor(sunAt(h)));
      s.setAttribute("aria-valuenow", h.toFixed(2));
      if (s.getAttribute("aria-valuetext") !== fmtClock(h)) s.setAttribute("aria-valuetext", fmtClock(h));
    }
    const txt = fmtClock(h);
    if (time.current && time.current.textContent !== txt) time.current.textContent = txt;
    const cur = [...STOPS].reverse().find((a) => h >= a.h0 - 0.001);
    bar.current?.querySelectorAll<HTMLLIElement>("[data-stop]").forEach((li) => {
      if (li.dataset.stop === cur?.id) li.dataset.active = ""; else delete li.dataset.active;
    });
    const g = groundAt(h);
    if (bar.current && bar.current.dataset.ground !== g) bar.current.dataset.ground = g;
  }), []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let dragging = false;
    let moved = false;
    const hourAt = (x: number) => {
      const r = el.getBoundingClientRect();
      return DAY_START + Math.min(1, Math.max(0, (x - r.left) / r.width)) * SPAN;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      document.documentElement.dataset.scrubbing = "";
      el.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      moved = true;
      clock.seek(hourAt(e.clientX), false);
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      delete document.documentElement.dataset.scrubbing;
      if (!moved) clock.seek(hourAt(e.clientX), true);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, []);

  const key = (e: React.KeyboardEvent) => {
    const h = clock.get();
    const step = { ArrowRight: 0.25, ArrowUp: 0.25, ArrowLeft: -0.25, ArrowDown: -0.25, PageUp: 1, PageDown: -1 }[e.key];
    if (step !== undefined) { e.preventDefault(); clock.seek(Math.min(DAY_END, Math.max(DAY_START, h + step)), true); }
    else if (e.key === "Home") { e.preventDefault(); clock.seek(DAY_START, true); }
    else if (e.key === "End") { e.preventDefault(); clock.seek(DAY_END, true); }
  };

  return (
    <header ref={bar} className="lp-rail" data-ground="night">
      <a className="lp-rail__brand" href="#dawn" onClick={(e) => { e.preventDefault(); clock.seek(DAY_START, true); }} aria-label={`${BRAND.name}, back to the top`}>
        <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="17" width="5.5" height="10" rx="2" opacity="0.55" /><rect x="13.25" y="11" width="5.5" height="16" rx="2" opacity="0.8" /><rect x="21.5" y="5" width="5.5" height="22" rx="2" /></svg>
        <span>{BRAND.name}</span>
      </a>

      <nav className="lp-rail__day" aria-label="The day, by hour">
        <ol className="lp-rail__stops">
          {STOPS.map((a) => (
            <li key={a.id} data-stop={a.id} style={{ "--at": (a.h0 - DAY_START) / SPAN } as React.CSSProperties}>
              <a href={`#${a.id}`} onClick={(e) => { e.preventDefault(); clock.seek(a.h0 + 0.001, true); }}>
                <span className="lp-sr">{fmtClock(a.h0)} </span>{a.label}
              </a>
            </li>
          ))}
        </ol>
        <div ref={track} className="lp-rail__track">
          <div className="lp-rail__strip" aria-hidden="true" />
          <div
            ref={sun}
            className="lp-rail__sun"
            role="slider"
            tabIndex={0}
            aria-label="Time of day. Drag or use the arrow keys to move through the day."
            aria-valuemin={DAY_START}
            aria-valuemax={DAY_END}
            onKeyDown={key}
          >
            <span ref={time} className="lp-rail__time lp-nums">06:00</span>
          </div>
        </div>
      </nav>

      <div className="lp-rail__actions">
        <Link className="lp-btn lp-btn--ghost lp-btn--sm lp-hide-sm" to="/login">Sign in</Link>
        <Link className="lp-btn lp-btn--primary lp-btn--sm" to="/signup">Start free</Link>
      </div>
    </header>
  );
}
