import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./motion";

function tone(score: number | null | undefined) {
  return score == null ? "var(--color-muted-foreground)" : "var(--color-primary)";
}

/** Animated score ring (0–100). */
export function ScoreRing({
  score,
  size = 132,
  stroke = 11,
  label,
  sublabel,
  className,
}: {
  score: number | null | undefined;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const arc = useRef<SVGCircleElement>(null);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const t = tone(score);

  useGSAP(
    () => {
      if (!arc.current) return;
      const target = c * (1 - pct);
      if (prefersReducedMotion()) {
        gsap.set(arc.current, { strokeDashoffset: target });
        return;
      }
      gsap.to(arc.current, { strokeDashoffset: target, duration: 1.3, ease: "power3.out" });
    },
    { dependencies: [pct, c] },
  );

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
          <circle
            ref={arc}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={t}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ fontSize: Math.round(size * 0.27) }}>
          <AnimatedNumber value={score == null ? null : Math.round(score)} className="font-semibold leading-none tracking-tight tabular-nums" />
        </div>
      </div>
      {(label || sublabel) && (
        <div className="text-center">
          {label && <div className="text-sm font-medium">{label}</div>}
          {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
        </div>
      )}
    </div>
  );
}
