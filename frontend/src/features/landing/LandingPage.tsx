import { useLayoutEffect, useRef } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { BRAND } from "@/config/brand";
import { ACTS, clamp01, clock, gsap, reducedMotion, ScrollTrigger, sunAt } from "./clock";
import { DayRail } from "./DayRail";
import { Audit } from "./acts/Audit";
import { Results, SignOff } from "./acts/Close";
import { Crew } from "./acts/Crew";
import { Dawn } from "./acts/Dawn";
import { Noon, Silence } from "./acts/Noon";
import { Review } from "./acts/Review";
import "./landing.css";
import "./afternoon.css";

/** Keeps the page clock in step with scroll, and lets the rail (or a link) seek to an hour. */
function useDayClock(root: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const reduced = reducedMotion();
    const lenis = reduced ? null : new Lenis({ autoRaf: false, lerp: 0.11, wheelMultiplier: 0.9 });
    const raf = (t: number) => lenis?.raf(t * 1000);
    if (lenis) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }

    type Range = (typeof ACTS)[number] & { top: number; end: number };
    let ranges: Range[] = [];
    const measure = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const els = ACTS.map((a) => document.getElementById(a.id));
      ranges = ACTS.flatMap((a, i) => {
        const el = els[i];
        if (!el) return [];
        const top = el.getBoundingClientRect().top + scrollY;
        const next = els.slice(i + 1).find(Boolean);
        const end = next ? next.getBoundingClientRect().top + scrollY : max;
        return [{ ...a, top, end: Math.max(top + 1, Math.min(end, max)) }];
      });
    };
    let lastShadow = -1;
    const update = () => {
      if (!ranges.length) return;
      const y = scrollY;
      const r = ranges.find((x) => y < x.end) ?? ranges[ranges.length - 1];
      const h = r.h0 + (r.h1 - r.h0) * clamp01((y - r.top) / (r.end - r.top));
      clock.set(h);
      // Shadows fall away from the sun: long and to the right at dawn, short at noon, long left at dusk.
      const bucket = Math.round(h * 2);
      if (bucket !== lastShadow && root.current) {
        lastShadow = bucket;
        const az = ((h - 6) / 12.5) * Math.PI; // 0 = sun in the east (left)
        const len = 4 + (1 - sunAt(h)) * 12;
        root.current.style.setProperty("--shx", (Math.cos(az) * len).toFixed(1));
        root.current.style.setProperty("--shy", (6 + sunAt(h) * 6).toFixed(1));
      }
    };
    const onRefresh = () => { measure(); update(); };
    ScrollTrigger.addEventListener("refresh", onRefresh);
    const st = ScrollTrigger.create({ start: 0, end: "max", onUpdate: update });

    const toY = (h: number) => {
      const r = ranges.find((x) => h < x.h1) ?? ranges[ranges.length - 1];
      return r.top + (r.end - r.top) * clamp01((h - r.h0) / (r.h1 - r.h0));
    };
    clock.setSeeker((h, smoothly) => {
      if (!ranges.length) return;
      const y = toY(h);
      if (lenis) lenis.scrollTo(y, smoothly ? { duration: 1.6 } : { immediate: true });
      else window.scrollTo({ top: y, behavior: smoothly && !reduced ? "smooth" : "instant" });
    });

    // In-page anchors travel through the day instead of jumping.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a || !root.current?.contains(a)) return;
      const target = document.getElementById(a.hash.slice(1));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.8 });
      else target.scrollIntoView({ behavior: reduced ? "instant" : "smooth" });
      target.querySelector<HTMLElement>("input, [data-focus-on-arrive]")?.focus({ preventScroll: true });
    };
    document.addEventListener("click", onClick);

    // `sc-ready` is the signal the scroll-craft verification harness waits for.
    const fontsReady = document.fonts?.ready.then(() => { ScrollTrigger.refresh(); document.documentElement.classList.add("sc-ready"); });
    measure();
    update();
    return () => {
      void fontsReady;
      document.documentElement.classList.remove("sc-ready");
      document.removeEventListener("click", onClick);
      clock.setSeeker(null);
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      st.kill();
      gsap.ticker.remove(raf);
      lenis?.destroy();
    };
  }, [root]);
}

export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const prev = document.title;
    document.title = `${BRAND.name}: your SEO team starts before you do`;
    return () => { document.title = prev; };
  }, []);
  useDayClock(root);

  return (
    <div ref={root} className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <DayRail />
      <main id="main">
        <Dawn />
        <Audit />
        <Crew />
        <Silence />
        <Noon />
        <Review />
        <Results />
        <SignOff />
      </main>
      <div className="lp-grain" aria-hidden="true" />
    </div>
  );
}
