import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/** Staggered fade/slide-in for direct children marked with `data-reveal` (or all children). */
export function Reveal({
  children,
  className,
  stagger = 0.06,
  y = 14,
  deps = [],
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  y?: number;
  deps?: unknown[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      const marked = ref.current.querySelectorAll<HTMLElement>("[data-reveal]");
      const targets = marked.length ? marked : ref.current.children;
      gsap.fromTo(targets, { autoAlpha: 0, y }, { autoAlpha: 1, y: 0, stagger, duration: 0.55, clearProps: "transform" });
    },
    { scope: ref, dependencies: deps },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Counts up to `value` whenever it changes. */
export function AnimatedNumber({ value, className, decimals = 0, suffix = "" }: { value: number | null | undefined; className?: string; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || value == null) return;
      const obj = { v: last.current };
      if (prefersReducedMotion()) {
        el.textContent = value.toFixed(decimals) + suffix;
        last.current = value;
        return;
      }
      gsap.to(obj, {
        v: value,
        duration: 1.1,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = obj.v.toFixed(decimals) + suffix;
        },
        onComplete: () => {
          last.current = value;
        },
      });
    },
    { dependencies: [value] },
  );
  return (
    <span ref={ref} className={cn("tabular", className)}>
      {value == null ? "–" : `0${suffix}`}
    </span>
  );
}
