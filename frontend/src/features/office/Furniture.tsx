import { memo, useEffect, useState } from "react";
import type { Persona } from "@/features/team/employees";
import { BRAND } from "@/config/brand";
import type { EmployeeId } from "@/lib/types";
import { SCENE, WALL_H, WINDOWS, ZONES } from "./layout";

const FONT = { fontFamily: "var(--font-sans)" } as const;
const MONO = { fontFamily: "var(--font-mono, ui-monospace, monospace)" } as const;

/** Soft contact shadow (radial gradient, cheap compared to filters). */
export function Shadow({ x, y, rx, ry = rx * 0.22, o = 1 }: { x: number; y: number; rx: number; ry?: number; o?: number }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="url(#soft-shadow)" opacity={o} />;
}

/** Warm light pool under lamps; only visible at night. */
function Glow({ x, y, r, color = "url(#lamp-glow)" }: { x: number; y: number; r: number; color?: string }) {
  return <ellipse cx={x} cy={y} rx={r} ry={r * 0.55} fill={color} className="office-night-only" pointerEvents="none" />;
}

// ── Floor ────────────────────────────────────────────────────────────────────
export const Floor = memo(function Floor() {
  const z = ZONES;
  return (
    <g pointerEvents="none">
      <rect x="0" y={WALL_H} width={SCENE.w} height={SCENE.h - WALL_H} fill="url(#floor-planks)" />
      {/* ambient light falling from the windows */}
      {WINDOWS.map((x) => (
        <path key={x} d={`M${x - 70} ${WALL_H} L${x + 70} ${WALL_H} L${x + 130} ${WALL_H + 150} L${x - 10} ${WALL_H + 150}Z`} fill="url(#window-light)" className="office-day-only" />
      ))}
      {/* manager office carpet */}
      <rect x={z.manager.x} y={z.manager.y} width={z.manager.w} height={z.manager.h} rx="10" fill="url(#carpet)" />
      {/* team pods */}
      <rect x={z.pod1.x} y={z.pod1.y} width={z.pod1.w} height={z.pod1.h} rx="18" fill="var(--office-pod1)" />
      <rect x={z.pod2.x} y={z.pod2.y} width={z.pod2.w} height={z.pod2.h} rx="18" fill="var(--office-pod2)" />
      <rect x={z.pod1.x + 6} y={z.pod1.y + 6} width={z.pod1.w - 12} height={z.pod1.h - 12} rx="13" fill="none" stroke="var(--office-pod1-edge)" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
      <rect x={z.pod2.x + 6} y={z.pod2.y + 6} width={z.pod2.w - 12} height={z.pod2.h - 12} rx="13" fill="none" stroke="var(--office-pod2-edge)" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
      {/* engineering tiles */}
      <rect x={z.eng.x} y={z.eng.y} width={z.eng.w} height={z.eng.h} rx="10" fill="url(#tiles)" />
      <rect x={z.eng.x + 0.75} y={z.eng.y + 0.75} width={z.eng.w - 1.5} height={z.eng.h - 1.5} rx="10" fill="none" stroke="var(--office-tile-line)" strokeWidth="1.5" />
      {/* lounge rug */}
      <rect x={z.lounge.x + 8} y={z.lounge.y + 70} width={z.lounge.w - 16} height={z.lounge.h - 90} rx="26" fill="var(--office-rug-lounge)" />
      <rect x={z.lounge.x + 18} y={z.lounge.y + 80} width={z.lounge.w - 36} height={z.lounge.h - 110} rx="20" fill="none" stroke="var(--office-rug-lounge-edge)" strokeWidth="3" strokeDasharray="10 7" />
      {/* meeting rug */}
      <ellipse cx={z.meeting.cx} cy={z.meeting.cy} rx={z.meeting.rx} ry={z.meeting.ry} fill="var(--office-rug-meet)" />
      <ellipse cx={z.meeting.cx} cy={z.meeting.cy} rx={z.meeting.rx - 14} ry={z.meeting.ry - 12} fill="none" stroke="var(--office-rug-meet-edge)" strokeWidth="3" />
      {/* library rug */}
      <rect x="40" y="690" width="200" height="120" rx="60" fill="var(--office-rug-lib)" />
      <rect x="52" y="700" width="176" height="100" rx="50" fill="none" stroke="var(--office-rug-lib-edge)" strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round" />
      {/* ceiling light pools at night */}
      <g className="office-night-only">
        {[[705, 282, 390, 96], [705, 472, 390, 96], [705, 706, 280, 110], [170, 290, 170, 110], [1250, 300, 190, 120], [1250, 680, 190, 150]].map(([cx, cy, rx, ry], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#lamp-glow)" />
        ))}
      </g>
      {/* zone labels */}
      {[
        { x: z.manager.x + 14, y: z.manager.y + 22, t: "MANAGER" },
        { x: z.library.x + 14, y: 600, t: "LIBRARY" },
        { x: z.eng.x + 14, y: z.eng.y + 22, t: "ENGINEERING" },
        { x: 1166, y: z.lounge.y + 22, t: "LOUNGE" },
      ].map((l) => (
        <text key={l.t} x={l.x} y={l.y} fontSize="9" fontWeight="700" fill="var(--office-zone-label)" style={{ ...FONT, letterSpacing: "0.14em" }}>{l.t}</text>
      ))}
    </g>
  );
});

// ── Wall ─────────────────────────────────────────────────────────────────────
function WindowPane({ x, dark, i }: { x: number; dark: boolean; i: number }) {
  const w = 150;
  const top = 16;
  const h = 78;
  const l = x - w / 2;
  return (
    <g>
      <rect x={l - 5} y={top - 5} width={w + 10} height={h + 10} rx="7" fill="var(--office-frame)" />
      <rect x={l} y={top} width={w} height={h} rx="3" fill={dark ? "url(#sky-night)" : "url(#sky-day)"} />
      <g clipPath={`url(#win-clip-${i})`}>
        {dark ? (
          <g>
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <circle key={k} cx={l + 12 + k * 25} cy={top + 8 + ((k * 17 + i * 11) % 30)} r={k % 2 ? 0.9 : 1.3} fill="#fff" className="office-twinkle" style={{ animationDelay: `${(k + i) * 0.6}s` }} />
            ))}
            {i === 2 && <g><circle cx={l + 118} cy={top + 20} r="10" fill="#fef3c7" /><circle cx={l + 122} cy={top + 17} r="9" fill="url(#sky-night)" /></g>}
            <g fill="#241f45">
              <rect x={l} y={top + 50} width="22" height="30" /><rect x={l + 24} y={top + 38} width="16" height="42" /><rect x={l + 44} y={top + 56} width="26" height="24" />
              <rect x={l + 74} y={top + 44} width="20" height="36" /><rect x={l + 98} y={top + 54} width="24" height="26" /><rect x={l + 126} y={top + 40} width="24" height="40" />
            </g>
            {[[4, 56], [28, 44], [30, 52], [80, 50], [84, 60], [104, 60], [132, 46], [138, 56], [50, 62]].map(([dx, dy], k) => (
              <rect key={k} x={l + dx} y={top + dy} width="3" height="3" rx="0.5" fill="#fde68a" opacity={0.85} className={k % 3 === 0 ? "office-twinkle" : undefined} />
            ))}
          </g>
        ) : (
          <g>
            {i === 0 && <g><circle cx={l + 30} cy={top + 22} r="16" fill="#fef9c3" opacity="0.5" /><circle cx={l + 30} cy={top + 22} r="10" fill="#fde047" /></g>}
            <g className="office-cloud" style={{ animationDelay: `${-i * 7}s` }}>
              <ellipse cx={l + 60} cy={top + 30} rx="20" ry="6.5" fill="#fff" opacity="0.95" />
              <ellipse cx={l + 72} cy={top + 25} rx="12" ry="7" fill="#fff" opacity="0.95" />
              <ellipse cx={l + 118} cy={top + 16} rx="12" ry="4" fill="#fff" opacity="0.8" />
            </g>
            <g fill="#b6d4ee">
              <rect x={l} y={top + 54} width="22" height="26" /><rect x={l + 24} y={top + 44} width="16" height="36" /><rect x={l + 44} y={top + 60} width="26" height="20" />
              <rect x={l + 74} y={top + 50} width="20" height="30" /><rect x={l + 98} y={top + 58} width="24" height="22" /><rect x={l + 126} y={top + 46} width="24" height="34" />
            </g>
            <path d={`M${l} ${top + h} C${l + 30} ${top + 62} ${l + 60} ${top + 70} ${l + 90} ${top + 66} S${l + 140} ${top + 64} ${l + w} ${top + 70} V${top + h}Z`} fill="#8fd19e" opacity="0.9" />
          </g>
        )}
      </g>
      <rect x={l} y={top} width={w} height={h} rx="3" fill="url(#glass-sheen)" />
      <path d={`M${x} ${top} V${top + h} M${l} ${top + h * 0.45} H${l + w}`} stroke="var(--office-frame)" strokeWidth="3.5" />
      <rect x={l - 10} y={top + h + 4} width={w + 20} height="6" rx="3" fill="var(--office-sill)" />
      {/* sill plants */}
      <g transform={`translate(${l + 12} ${top + h + 4})`}>
        <path d="M-5 0 L-4 -7 H4 L5 0Z" fill="#e07a5f" />
        <circle cx="-2" cy="-10" r="4" fill="#4caf73" /><circle cx="2.5" cy="-11.5" r="4" fill="#5cc486" />
      </g>
      {i === 1 && (
        <g transform={`translate(${l + w - 14} ${top + h + 4})`}>
          <rect x="-5" y="-8" width="10" height="8" rx="2" fill="#7aa7e0" />
          <path d="M0 -8 C-1 -15 -6 -17 -7 -20 M0 -8 C1 -16 5 -18 7 -22 M0 -8 V-20" stroke="#3f9a62" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      )}
    </g>
  );
}

function Clock({ x, y }: { x: number; y: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const h = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
  const m = now.getMinutes() * 6;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="23" fill="#000" opacity="0.08" cy="2" />
      <circle r="22" fill="#fffdf8" stroke="#e07a5f" strokeWidth="4" />
      {Array.from({ length: 12 }).map((_, i) => <rect key={i} x="-0.8" y="-18" width="1.6" height={i % 3 ? 2.5 : 4} rx="0.8" fill="#6b6478" transform={`rotate(${i * 30})`} />)}
      <rect x="-1.6" y="-10" width="3.2" height="12" rx="1.6" fill="#2d2838" transform={`rotate(${h})`} />
      <rect x="-1" y="-15.5" width="2" height="17" rx="1" fill="#e07a5f" transform={`rotate(${m})`} />
      <circle r="2.2" fill="#2d2838" />
    </g>
  );
}

type BoardCounts = { todo: number; doing: number; waiting: number; done: number };

function Whiteboard({ x, y, counts, onClick }: { x: number; y: number; counts: BoardCounts; onClick?: () => void }) {
  const w = 180;
  const h = 90;
  const cols = [
    { k: "To do", v: counts.todo, c: "#fde68a" },
    { k: "Doing", v: counts.doing, c: "#a7f3d0" },
    { k: "Waiting", v: counts.waiting, c: "#fdba74" },
    { k: "Done", v: counts.done, c: "#c7d2fe" },
  ];
  const cw = (w - 16) / 4;
  return (
    <g onClick={onClick} className="office-clickable" role="button" tabIndex={0} aria-label="Team board — open the task board" onKeyDown={(e) => e.key === "Enter" && onClick?.()}>
      <rect x={x - 3} y={y - 1} width={w + 6} height={h + 6} rx="6" fill="#000" opacity="0.08" />
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx="6" fill="#b8bcc8" />
      <rect x={x} y={y} width={w} height={h} rx="3" fill="var(--office-board)" />
      <text x={x + 8} y={y + 13} fontSize="8.5" fontWeight="800" fill="#5b5bd6" style={{ ...FONT, letterSpacing: "0.1em" }}>TEAM BOARD</text>
      <circle cx={x + w - 10} cy={y + 10} r="3" fill={counts.waiting ? "#f59e0b" : "#22c55e"} className={counts.waiting ? "office-pulse" : undefined} />
      {cols.map((c, i) => {
        const cx = x + 8 + i * cw;
        const notes = Math.min(c.v, 3);
        return (
          <g key={c.k}>
            {i > 0 && <path d={`M${cx - 1} ${y + 20} V${y + h - 10}`} stroke="#d4d4dc" strokeWidth="1" />}
            <text x={cx + cw / 2 - 1} y={y + 27} textAnchor="middle" fontSize="6.8" fontWeight="600" fill="#6b6478" style={FONT}>{c.k}</text>
            {Array.from({ length: notes }).map((_, k) => (
              <rect key={k} x={cx + 5 + (k % 2) * 13} y={y + 33 + Math.floor(k / 2) * 14} width="12" height="11" rx="1.2" fill={c.c} transform={`rotate(${k % 2 ? 4 : -3} ${cx + 11 + (k % 2) * 13} ${y + 38 + Math.floor(k / 2) * 14})`} />
            ))}
            <text x={cx + cw / 2 - 1} y={y + h - 13} textAnchor="middle" fontSize="12" fontWeight="800" fill={c.k === "Waiting" && c.v ? "#c2410c" : "#2d2838"} style={FONT}>{c.v}</text>
          </g>
        );
      })}
      <rect x={x + 20} y={y + h} width={w - 40} height="4" rx="2" fill="#9ca3af" />
      <rect x={x + 30} y={y + h - 2.5} width="14" height="3" rx="1.5" fill="#ef4444" />
      <rect x={x + 48} y={y + h - 2.5} width="14" height="3" rx="1.5" fill="#3b82f6" />
    </g>
  );
}

/** Wall TV with an animated ranking chart. */
function RankTV({ x, y, working }: { x: number; y: number; working: number }) {
  const w = 150;
  const h = 76;
  return (
    <g pointerEvents="none">
      <rect x={x - 2} y={y + 2} width={w + 4} height={h + 4} rx="6" fill="#000" opacity="0.1" />
      <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx="6" fill="#1f1b2e" />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx="3" fill="#15122a" />
      <text x={x + 10} y={y + 15} fontSize="7" fontWeight="700" fill="#a5b4fc" style={{ ...FONT, letterSpacing: "0.12em" }}>ORGANIC CLICKS</text>
      <text x={x + w - 10} y={y + 15} textAnchor="end" fontSize="7" fontWeight="700" fill="#4ade80" style={FONT}>▲ live</text>
      {[0, 1, 2].map((k) => <path key={k} d={`M${x + 10} ${y + 28 + k * 14} H${x + w - 10}`} stroke="#ffffff" strokeOpacity="0.07" />)}
      <path d={`M${x + 10} ${y + h - 12} L${x + 32} ${y + 54} L${x + 52} ${y + 58} L${x + 74} ${y + 42} L${x + 96} ${y + 46} L${x + 118} ${y + 30} L${x + w - 10} ${y + 22} V${y + h - 8} H${x + 10}Z`} fill="url(#tv-area)" />
      <path d={`M${x + 10} ${y + h - 12} L${x + 32} ${y + 54} L${x + 52} ${y + 58} L${x + 74} ${y + 42} L${x + 96} ${y + 46} L${x + 118} ${y + 30} L${x + w - 10} ${y + 22}`} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="office-draw" />
      <circle cx={x + w - 10} cy={y + 22} r="3" fill="#c7d2fe" className="office-pulse" />
      <text x={x + 10} y={y + h - 1} fontSize="6" fill="#8b87a8" style={FONT}>{working ? `${working} working now` : "team idle"}</text>
    </g>
  );
}

export const Wall = memo(function Wall({ dark, counts, working, onWhiteboard }: { dark: boolean; counts: BoardCounts; working: number; onWhiteboard?: () => void }) {
  return (
    <g>
      <rect x="0" y="0" width={SCENE.w} height={WALL_H} fill="var(--office-wall)" />
      <rect x="0" y="0" width={SCENE.w} height="6" fill="var(--office-wall-shade)" />
      <rect x="0" y="100" width={SCENE.w} height={WALL_H - 100} fill="var(--office-wainscot)" />
      {Array.from({ length: Math.ceil(SCENE.w / 40) }).map((_, i) => (
        <path key={i} d={`M${i * 40 + 20} 104 V${WALL_H - 8}`} stroke="var(--office-wainscot-line)" strokeWidth="2" />
      ))}
      <rect x="0" y="99" width={SCENE.w} height="4" fill="var(--office-wainscot-line)" />
      <rect x="0" y={WALL_H - 7} width={SCENE.w} height="7" fill="var(--office-skirting)" />
      {WINDOWS.map((x, i) => <WindowPane key={x} x={x} dark={dark} i={i} />)}
      {/* brand sign */}
      <g transform="translate(106 50)">
        <rect x="-72" y="-22" width="144" height="44" rx="12" fill="#1f1b2e" />
        <rect x="-72" y="-22" width="144" height="44" rx="12" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="2" />
        <circle cx="-50" cy="0" r="9" fill="url(#brand-grad)" />
        <path d="M-54 3 L-50 -3 L-46 1" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <text x="-34" y="5.5" fontSize="15" fontWeight="700" fill="#fafafa" style={{ ...FONT, letterSpacing: "0.01em" }}>{BRAND.name}</text>
      </g>
      {/* framed poster */}
      <g transform="translate(226 22)">
        <rect x="0" y="0" width="54" height="66" rx="3" fill="#fffdf8" stroke="#c89a6a" strokeWidth="3" />
        <circle cx="27" cy="26" r="13" fill="#f4b942" />
        <path d="M8 58 L22 38 L32 48 L40 40 L48 58Z" fill="#2bb5a6" />
        <path d="M8 58 L20 44 L30 58Z" fill="#e07a5f" />
      </g>
      <Clock x={350} y={52} />
      <Whiteboard x={970} y={12} counts={counts} onClick={onWhiteboard} />
      <RankTV x={1180} y={16} working={working} />
      {/* shelf with trophies */}
      <g transform="translate(1356 44)">
        <rect x="-26" y="18" width="80" height="5" rx="2" fill="var(--office-wood)" />
        <path d="M-18 18 V8 H-8 V18 M-13 8 V4" stroke="#f4b942" strokeWidth="3" fill="none" />
        <circle cx="-13" cy="3" r="5" fill="#f4b942" />
        <rect x="4" y="2" width="9" height="16" rx="1" fill="#6c7cf0" /><rect x="14" y="5" width="7" height="13" rx="1" fill="#e07a5f" /><rect x="22" y="0" width="8" height="18" rx="1" fill="#2bb5a6" transform="rotate(8 26 18)" />
        <path d="M38 18 C38 10 50 10 50 18Z" fill="#5cc486" /><circle cx="44" cy="9" r="3" fill="#4caf73" />
      </g>
    </g>
  );
});

// ── Desks & chairs ───────────────────────────────────────────────────────────
/** Office chair (drawn behind the seated character). */
export function Chair({ x, y, color, dark = false }: { x: number; y: number; color: string; dark?: boolean }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 1} rx={16} o={0.7} />
      <path d={`M${x - 11} ${y - 1} L${x} ${y - 5} L${x + 11} ${y - 1}`} stroke="#3f3a4a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <rect x={x - 1.8} y={y - 16} width="3.6" height="12" fill="#57506a" />
      <rect x={x - 17} y={y - 58} width="34" height="40" rx="11" fill={color} />
      <rect x={x - 17} y={y - 58} width="34" height="40" rx="11" fill="url(#chair-shade)" />
      <rect x={x - 12} y={y - 53} width="24" height="28" rx="8" fill="#fff" opacity={dark ? 0.05 : 0.14} />
      <rect x={x - 18} y={y - 22} width="36" height="8" rx="4" fill={color} />
      <rect x={x - 18} y={y - 22} width="36" height="8" rx="4" fill="#000" opacity="0.18" />
    </g>
  );
}

const CODE_COLORS = ["#c4b5fd", "#7dd3fc", "#fda4af", "#86efac", "#fde68a"];

function Monitor({ x, y, persona, working, blocked, id, w = 46, h = 34, i = 0 }: {
  x: number; y: number; persona: Persona; working: boolean; blocked: boolean; id: string; w?: number; h?: number; i?: number;
}) {
  // x, y = bottom centre of the stand
  const sx = x - w / 2;
  const sy = y - 8 - h;
  const clip = `scr-${id}-${i}`;
  return (
    <g>
      {(working || blocked) && <ellipse cx={x} cy={sy + h / 2} rx={w * 0.78} ry={h * 0.78} fill={blocked ? "#f59e0b" : persona.from} className="office-glow" filter="url(#soft-blur)" />}
      <rect x={x - 3} y={y - 9} width="6" height="8" fill="#6b6478" />
      <rect x={x - 11} y={y - 2.5} width="22" height="3.5" rx="1.75" fill="#57506a" />
      <rect x={sx - 3} y={sy - 3} width={w + 6} height={h + 6} rx="4" fill="#2d2838" />
      <clipPath id={clip}><rect x={sx} y={sy} width={w} height={h} rx="2" /></clipPath>
      <rect x={sx} y={sy} width={w} height={h} rx="2" fill={working ? "#1a1630" : blocked ? "url(#amber-screen)" : "var(--office-screen-off)"} />
      {working && (
        <g clipPath={`url(#${clip})`}>
          <g className="office-code" style={{ animationDuration: `${2 + (id.length % 4) * 0.35}s` }}>
            {Array.from({ length: 14 }).map((_, k) => (
              <rect key={k} x={sx + 3 + ((k * 5) % 4) * 3} y={sy + 3 + k * 5} width={8 + ((k * 7 + id.length) % 22)} height="2" rx="1" fill={k % 4 === 0 ? persona.from : CODE_COLORS[(k + id.length) % CODE_COLORS.length]} opacity="0.9" />
            ))}
          </g>
          <rect x={sx + 3} y={sy + h - 6} width="3" height="3" fill="#fff" className="office-blink" />
        </g>
      )}
      {blocked && (
        <g>
          <circle cx={x} cy={sy + h / 2} r={h * 0.28} fill="#fff" opacity="0.92" />
          <text x={x} y={sy + h / 2 + 4.5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#b45309" style={FONT} className="office-pulse">?</text>
        </g>
      )}
      {!working && !blocked && (
        <g className="office-breathe" style={{ transformOrigin: `${x}px ${sy + h / 2}px`, transformBox: "view-box" }}>
          <circle cx={x} cy={sy + h / 2} r="5" fill={persona.from} opacity="0.45" />
          <circle cx={x} cy={sy + h / 2} r="2.2" fill="#fff" opacity="0.5" />
        </g>
      )}
      <rect x={sx} y={sy} width={w} height={h} rx="2" fill="url(#screen-glare)" />
    </g>
  );
}

/** Little personal items that make each desk feel owned. */
function DeskItems({ id, x, y, w, persona, working }: { id: EmployeeId; x: number; y: number; w: number; persona: Persona; working: boolean }) {
  const left = x - w / 2;
  const top = y - 34; // middle of the desk top
  const mug = (
    <g transform={`translate(${left + 14} ${top - 9})`}>
      <rect x="0" y="0" width="9" height="10" rx="2.2" fill={persona.to} />
      <rect x="0" y="0" width="9" height="2.5" rx="1.2" fill="#fff" opacity="0.35" />
      <path d="M9 2.5 C12.5 2.5 12.5 7.5 9 7.5" fill="none" stroke={persona.to} strokeWidth="1.6" />
      {working && <path d="M3 -2 C1.5 -5 5 -6 3.5 -9" fill="none" stroke="var(--office-steam)" strokeWidth="1" className="office-steam" />}
    </g>
  );
  const extra = (() => {
    switch (id) {
      case "manager":
        return (
          <g>
            <rect x={x - 24} y={top - 7} width="48" height="9" rx="2" fill="#2d2838" />
            <text x={x} y={top - 0.5} textAnchor="middle" fontSize="6" fontWeight="700" fill="#f4b942" style={{ ...FONT, letterSpacing: "0.1em" }}>MANAGER</text>
            <g transform={`translate(${left + 40} ${top - 4})`}><path d="M-5 4 L-4 -3 H4 L5 4Z" fill="#e07a5f" /><circle cx="-2" cy="-7" r="4.5" fill="#4caf73" /><circle cx="3" cy="-8" r="4" fill="#5cc486" /></g>
          </g>
        );
      case "researcher":
        return (
          <g transform={`translate(${left + 32} ${top})`}>
            <rect x="-8" y="-4" width="18" height="4" rx="1" fill="#6c7cf0" /><rect x="-7" y="-8" width="16" height="4" rx="1" fill="#f4b942" /><rect x="-9" y="-12" width="17" height="4" rx="1" fill="#e07a5f" />
          </g>
        );
      case "writer":
        return (
          <g transform={`translate(${left + 34} ${top - 2})`}>
            <rect x="-8" y="-5" width="16" height="10" rx="1.5" fill="#fffdf8" stroke="#e5e0d8" strokeWidth="0.8" transform="rotate(-8)" />
            <path d="M2 -9 L10 3" stroke="#db2777" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        );
      case "strategist":
        return (
          <g>
            <rect x={x + w / 2 - 55} y={top - 50} width="9" height="9" rx="1" fill="#fde68a" transform={`rotate(-6 ${x + w / 2 - 50} ${top - 45})`} />
            <rect x={x + w / 2 - 55} y={top - 38} width="9" height="9" rx="1" fill="#a7f3d0" transform={`rotate(5 ${x + w / 2 - 50} ${top - 33})`} />
          </g>
        );
      case "tech_seo":
        return (
          <g transform={`translate(${left + 34} ${top - 3})`}>
            <path d="M-8 4 A8 8 0 0 1 8 4" fill="none" stroke="#22c55e" strokeWidth="3" />
            <path d="M0 4 L4 -3" stroke="#2d2838" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        );
      case "link_builder":
        return (
          <g transform={`translate(${left + 34} ${top - 3})`} fill="none" stroke="#65a30d" strokeWidth="2">
            <rect x="-9" y="-3" width="9" height="6" rx="3" /><rect x="-2" y="-3" width="9" height="6" rx="3" />
          </g>
        );
      case "rank_analyst":
        return (
          <g transform={`translate(${left + 32} ${top + 2})`}>
            <rect x="-8" y="-6" width="4" height="6" fill="#f59e0b" /><rect x="-3" y="-10" width="4" height="10" fill="#ea580c" /><rect x="2" y="-14" width="4" height="14" fill="#f59e0b" />
          </g>
        );
      case "onpage":
        return (
          <g transform={`translate(${left + 34} ${top - 2})`}>
            <path d="M-8 -4 H3 L8 0 L3 4 H-8Z" fill="#10b981" /><circle cx="-5" cy="0" r="1.2" fill="#fff" />
          </g>
        );
      case "auditor":
        return (
          <g transform={`translate(${left + 34} ${top - 3})`}>
            <circle cx="-2" cy="-1" r="5" fill="none" stroke="#0284c7" strokeWidth="2" /><path d="M1.5 2.5 L6 7" stroke="#0284c7" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        );
      case "engineer":
        return (
          <g>
            {/* rubber duck */}
            <g transform={`translate(${left + 36} ${top - 1})`}>
              <ellipse cx="0" cy="0" rx="6" ry="4" fill="#facc15" /><circle cx="3" cy="-5" r="3.4" fill="#facc15" /><path d="M6 -5 L9 -4.2 L6 -3.4Z" fill="#f97316" /><circle cx="3.8" cy="-6" r="0.6" fill="#1f1b2e" />
            </g>
            {/* laptop */}
            <g transform={`translate(${left + 62} ${top + 1})`}>
              <rect x="-11" y="-12" width="22" height="12" rx="1.5" fill="#57506a" /><rect x="-9.5" y="-10.5" width="19" height="9" rx="1" fill={working ? "#22c55e" : "#2d2838"} opacity={working ? 0.7 : 1} />
              <rect x="-14" y="0" width="28" height="2.5" rx="1" fill="#6b6478" />
            </g>
          </g>
        );
      default:
        return null;
    }
  })();
  return <g>{mug}{extra}</g>;
}

/** Desk: surface, monitor(s) (glow + code when working, amber when blocked), keyboard and personal items. */
export function Desk({ id, x, y, persona, working, blocked, kind = "desk", onClick, label, dark = false }: {
  id: EmployeeId; x: number; y: number; persona: Persona; working: boolean; blocked: boolean; kind?: "desk" | "manager" | "dev"; onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void; label: string; dark?: boolean;
}) {
  const w = kind === "manager" ? 190 : kind === "dev" ? 156 : 132;
  const l = x - w / 2;
  const topFill = kind === "manager" ? "var(--office-wood)" : "var(--office-desk-top)";
  const edgeFill = kind === "manager" ? "var(--office-wood-dark)" : "var(--office-desk-edge)";
  return (
    <g
      onClick={onClick}
      className={onClick ? "office-clickable office-desk" : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={label}
      onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(e); } }}
    >
      <Shadow x={x} y={y + 3} rx={w / 2 + 10} ry={9} />
      {/* legs / drawer */}
      <rect x={l + 6} y={y - 14} width="5" height="16" rx="2" fill="var(--office-desk-leg)" />
      <rect x={l + w - 11} y={y - 14} width="5" height="16" rx="2" fill="var(--office-desk-leg)" />
      <rect x={l + 14} y={y - 14} width="34" height="14" rx="2" fill={edgeFill} />
      <rect x={l + 14} y={y - 14} width="34" height="14" rx="2" fill="#000" opacity="0.08" />
      <rect x={l + 26} y={y - 9} width="10" height="2.4" rx="1.2" fill="#fff" opacity="0.5" />
      {/* surface */}
      <rect x={l} y={y - 46} width={w} height="26" rx="6" fill={topFill} />
      <rect x={l + 4} y={y - 44} width={w - 8} height="3" rx="1.5" fill="#fff" opacity={dark ? 0.06 : 0.5} />
      <rect x={l} y={y - 22} width={w} height="9" rx="3" fill={edgeFill} />
      {kind === "dev" && <rect x={l + 6} y={y - 14} width={w - 12} height="2" rx="1" fill={persona.from} opacity={working ? 0.95 : 0.4} className={working ? "office-glow-strong" : undefined} />}
      {/* keyboard + mouse */}
      <rect x={x - 17} y={y - 33} width="32" height="7" rx="2" fill="var(--office-keyboard)" />
      <path d={`M${x - 14} ${y - 30.5} H${x + 12} M${x - 14} ${y - 28} H${x + 12}`} stroke="#000" strokeOpacity="0.12" strokeWidth="0.8" strokeDasharray="2 1" />
      <ellipse cx={x + 22} cy={y - 29.5} rx="3" ry="2.2" fill="var(--office-keyboard)" />
      <DeskItems id={id} x={x} y={y} w={w} persona={persona} working={working} />
      {kind === "dev" ? (
        <g>
          <Monitor x={x + w / 2 - 70} y={y - 34} persona={persona} working={working} blocked={blocked} id={id} w={42} h={30} i={0} />
          <Monitor x={x + w / 2 - 28} y={y - 34} persona={persona} working={working} blocked={blocked} id={`${id}x`} w={34} h={42} i={1} />
        </g>
      ) : (
        <Monitor x={x + w / 2 - (kind === "manager" ? 44 : 34)} y={y - 34} persona={persona} working={working} blocked={blocked} id={id} />
      )}
      {blocked && (
        <g transform={`translate(${l + 8} ${y - 50})`}>
          <circle r="5" fill="#f59e0b" className="office-pulse" />
          <text y="3" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff" style={FONT}>!</text>
        </g>
      )}
      {/* desk lamp glow at night */}
      <Glow x={x} y={y - 20} r={w * 0.62} />
    </g>
  );
}

/** Jev's compliance console: a low slate desk with a wide verification screen. */
export function Terminal({ x, y, active, onClick, label }: { x: number; y: number; active: boolean; onClick?: () => void; label: string }) {
  const w = 128;
  const l = x - w / 2;
  const mx = x + 30;
  const sy = y - 84;
  return (
    <g onClick={onClick} className="office-clickable office-desk" role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => e.key === "Enter" && onClick?.()}>
      <Shadow x={x} y={y + 3} rx={w / 2 + 10} ry={9} />
      <rect x={l + 4} y={y - 16} width={w - 8} height="18" rx="4" fill="#2d2840" />
      <rect x={l + 10} y={y - 12} width="30" height="10" rx="2" fill="#221e36" />
      {[0, 1, 2].map((i) => <circle key={i} cx={l + 16 + i * 8} cy={y - 7} r="1.6" fill={i === 1 ? "#f472b6" : "#5eead4"} className="office-blink" style={{ animationDelay: `${i * 0.4}s` }} />)}
      <rect x={l} y={y - 46} width={w} height="26" rx="6" fill="#4a4462" />
      <rect x={l + 4} y={y - 44} width={w - 8} height="3" rx="1.5" fill="#fff" opacity="0.12" />
      <rect x={l} y={y - 22} width={w} height="9" rx="3" fill="#3a3552" />
      <rect x={l + 6} y={y - 14} width={w - 12} height="2" rx="1" fill="#2dd4bf" opacity={active ? 0.95 : 0.35} className={active ? "office-glow-strong" : undefined} />
      {/* wide monitor */}
      {active && <ellipse cx={mx} cy={sy + 20} rx="46" ry="30" fill="#2dd4bf" className="office-glow" filter="url(#soft-blur)" />}
      <rect x={mx - 3} y={y - 43} width="6" height="9" fill="#6b6478" />
      <rect x={mx - 12} y={y - 36} width="24" height="3.5" rx="1.75" fill="#57506a" />
      <rect x={mx - 30} y={sy - 3} width="60" height="44" rx="5" fill="#221e36" />
      <rect x={mx - 27} y={sy} width="54" height="38" rx="3" fill={active ? "#0b3b3a" : "#0f0d1c"} />
      <text x={mx - 22} y={sy + 9} fontSize="5.5" fontWeight="700" fill="#5eead4" style={MONO}>{active ? "VERIFYING" : "ALL CLEAR"}</text>
      {Array.from({ length: 3 }).map((_, i) => (
        <g key={i} opacity={active ? 1 : 0.45}>
          <path d={`M${mx - 22} ${sy + 16 + i * 7} l2.2 2.2 l4 -4`} fill="none" stroke="#5eead4" strokeWidth="1.3" strokeLinecap="round" className={active ? "office-blink" : undefined} style={{ animationDelay: `${i * 0.3}s` }} />
          <rect x={mx - 13} y={sy + 15 + i * 7} width={16 + ((i * 13) % 20)} height="2" rx="1" fill="#5eead4" opacity="0.6" />
        </g>
      ))}
      <rect x={mx - 27} y={sy} width="54" height="38" rx="3" fill="url(#screen-glare)" />
      {/* shield badge + keyboard */}
      <path d={`M${l + 20} ${y - 40} l7 -3 l7 3 v5 c0 5 -3.5 7.5 -7 9 c-3.5 -1.5 -7 -4 -7 -9Z`} fill="#14b8a6" />
      <path d={`M${l + 23.5} ${y - 34} l2.4 2.4 l4 -4`} fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <rect x={x - 17} y={y - 33} width="32" height="7" rx="2" fill="#5b556f" />
      <Glow x={x} y={y - 16} r={80} color="url(#teal-glow)" />
    </g>
  );
}

export function ServerRack({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 2} rx={32} ry={6} />
      <rect x={x - 27} y={y - 100} width="54" height="100" rx="5" fill="#2a2640" />
      <rect x={x - 27} y={y - 100} width="10" height="100" rx="4" fill="#fff" opacity="0.05" />
      {Array.from({ length: 7 }).map((_, i) => (
        <g key={i}>
          <rect x={x - 21} y={y - 93 + i * 13} width="42" height="9.5" rx="2" fill="#3a3552" />
          {[0, 1, 2].map((k) => <rect key={k} x={x - 18 + k * 5} y={y - 90 + i * 13} width="3" height="4" rx="0.8" fill="#221e36" />)}
          <circle cx={x + 15} cy={y - 88.2 + i * 13} r="1.7" fill={i % 3 === 0 ? "#f472b6" : "#5eead4"} className="office-blink" style={{ animationDelay: `${(i * 0.37 + x * 0.01) % 2}s` }} />
          <circle cx={x + 9.5} cy={y - 88.2 + i * 13} r="1.7" fill="#a3e635" className="office-blink" style={{ animationDelay: `${(i * 0.61) % 2}s` }} />
        </g>
      ))}
      <Glow x={x} y={y - 10} r={50} color="url(#teal-glow)" />
    </g>
  );
}

/** Standing screen showing the latest pull requests. */
export function DeployKiosk({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 2} rx={22} ry={5} />
      <rect x={x - 3} y={y - 40} width="6" height="40" fill="#57506a" />
      <rect x={x - 14} y={y - 3} width="28" height="4" rx="2" fill="#3a3552" />
      <rect x={x - 26} y={y - 92} width="52" height="56" rx="5" fill="#221e36" />
      <rect x={x - 22} y={y - 88} width="44" height="48" rx="3" fill="#15122a" />
      <text x={x - 18} y={y - 79} fontSize="5.5" fontWeight="700" fill="#a5b4fc" style={{ ...FONT, letterSpacing: "0.1em" }}>DEPLOYS</text>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle cx={x - 16} cy={y - 70 + i * 8} r="2" fill={i === 0 ? "#f59e0b" : "#22c55e"} className={i === 0 ? "office-pulse" : undefined} />
          <rect x={x - 11} y={y - 71 + i * 8} width={18 + ((i * 11) % 12)} height="2" rx="1" fill="#e4e4f0" opacity="0.55" />
        </g>
      ))}
    </g>
  );
}

// ── Plants & lamps ───────────────────────────────────────────────────────────
export function Plant({ x, y, s = 1, variant = "leafy" }: { x: number; y: number; s?: number; variant?: "leafy" | "tall" | "round" | "cactus" }) {
  const pot = variant === "tall" ? "#f4f1ec" : variant === "round" ? "#6c7cf0" : variant === "cactus" ? "#f4b942" : "#e07a5f";
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} pointerEvents="none">
      <Shadow x={0} y={1} rx={17} ry={4.5} />
      <g className="office-sway" style={{ transformOrigin: "0px -20px", transformBox: "fill-box", animationDelay: `${(x % 7) * -0.6}s` }}>
        {variant === "leafy" && (
          <g>
            <path d="M0 -20 C-22 -26 -26 -50 -12 -58 C-8 -44 -4 -32 0 -20Z" fill="#2f8a57" />
            <path d="M0 -20 C22 -30 26 -52 12 -62 C8 -46 4 -32 0 -20Z" fill="#3fa46a" />
            <path d="M0 -20 C-6 -42 -2 -62 4 -70 C8 -54 6 -36 0 -20Z" fill="#57c084" />
            <path d="M0 -22 C-16 -30 -28 -30 -30 -38 C-20 -40 -8 -34 0 -22Z" fill="#46b374" />
            <path d="M0 -22 C14 -26 26 -24 30 -32 C20 -36 8 -32 0 -22Z" fill="#2f8a57" />
          </g>
        )}
        {variant === "tall" && (
          <g>
            <path d="M-4 -20 C-10 -44 -8 -66 -6 -80 C-2 -64 0 -44 0 -20Z" fill="#2f8a57" />
            <path d="M2 -20 C6 -46 10 -62 12 -76 C14 -58 10 -40 4 -20Z" fill="#3fa46a" />
            <path d="M-2 -20 C-16 -38 -18 -54 -16 -64 C-10 -52 -6 -38 0 -20Z" fill="#57c084" />
            <path d="M0 -20 C0 -46 2 -70 4 -90 C8 -68 6 -44 2 -20Z" fill="#46b374" />
          </g>
        )}
        {variant === "round" && (
          <g>
            <circle cx="-8" cy="-30" r="12" fill="#2f8a57" /><circle cx="8" cy="-32" r="12" fill="#3fa46a" /><circle cx="0" cy="-42" r="13" fill="#57c084" />
            <circle cx="4" cy="-44" r="3" fill="#fda4af" /><circle cx="-7" cy="-34" r="2.5" fill="#fde68a" /><circle cx="9" cy="-30" r="2.5" fill="#fda4af" />
          </g>
        )}
        {variant === "cactus" && (
          <g>
            <rect x="-6" y="-52" width="12" height="34" rx="6" fill="#3fa46a" />
            <path d="M-6 -34 H-12 C-15 -34 -15 -38 -15 -40 V-44" stroke="#3fa46a" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M6 -40 H11 C14 -40 14 -44 14 -46 V-50" stroke="#46b374" strokeWidth="6" strokeLinecap="round" fill="none" />
            <circle cx="0" cy="-54" r="3" fill="#f472b6" />
          </g>
        )}
      </g>
      <path d="M-13 -21 H13 L10 0 H-10Z" fill={pot} />
      <path d="M-13 -21 H13 L12.4 -17 H-12.4Z" fill="#000" opacity="0.12" />
      <path d="M-10 -14 H-6 L-7 -3 H-9Z" fill="#fff" opacity="0.2" />
    </g>
  );
}

export function FloorLamp({ x, y, color = "#f4b942" }: { x: number; y: number; color?: string }) {
  return (
    <g pointerEvents="none">
      <Glow x={x} y={y - 4} r={90} />
      <Shadow x={x} y={y + 1} rx={12} ry={3.5} />
      <ellipse cx={x} cy={y - 1} rx="9" ry="2.6" fill="#3f3a4a" />
      <rect x={x - 1.3} y={y - 92} width="2.6" height="91" fill="#57506a" />
      <path d={`M${x - 16} ${y - 88} L${x - 10} ${y - 112} H${x + 10} L${x + 16} ${y - 88}Z`} fill={color} />
      <path d={`M${x - 16} ${y - 88} H${x + 16}`} stroke="#000" strokeOpacity="0.12" strokeWidth="2" />
      <ellipse cx={x} cy={y - 86} rx="14" ry="3" fill="#fff7d6" className="office-night-only" />
    </g>
  );
}

// ── Library ──────────────────────────────────────────────────────────────────
export function Bookshelf({ x, y, w = 104, seed = 0 }: { x: number; y: number; w?: number; seed?: number }) {
  const colors = ["#6c7cf0", "#e07a5f", "#2bb5a6", "#f4b942", "#ec6b9a", "#8b5cf6", "#5cc486", "#3b82f6"];
  const rows = 4;
  const rh = 26;
  const h = rows * rh + 12;
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 2} rx={w / 2 + 8} ry={6} />
      <rect x={x - w / 2} y={y - h} width={w} height={h} rx="4" fill="var(--office-wood-dark)" />
      <rect x={x - w / 2} y={y - h} width={w} height="6" rx="3" fill="var(--office-wood)" />
      {Array.from({ length: rows }).map((_, r) => {
        const ry = y - h + 8 + r * rh;
        let cx = x - w / 2 + 6;
        const books: React.ReactNode[] = [];
        let k = 0;
        while (cx < x + w / 2 - 12) {
          const bw = 6 + ((k * 3 + r + seed) % 4);
          const bh = rh - 6 - ((k + r * 2 + seed) % 4) * 1.5;
          const lean = (k + r + seed) % 7 === 3;
          books.push(
            <rect key={k} x={cx} y={ry + rh - 4 - bh} width={bw} height={bh} rx="1" fill={colors[(k + r * 3 + seed) % colors.length]} transform={lean ? `rotate(12 ${cx} ${ry + rh - 4})` : undefined} />,
          );
          cx += bw + (lean ? 5 : 1.2);
          k++;
          if ((k + r + seed) % 9 === 0) cx += 8;
        }
        return (
          <g key={r}>
            <rect x={x - w / 2 + 4} y={ry} width={w - 8} height={rh - 3} fill="#000" opacity="0.22" />
            {books}
            <rect x={x - w / 2 + 3} y={ry + rh - 4} width={w - 6} height="3.5" fill="var(--office-wood)" />
          </g>
        );
      })}
      <g transform={`translate(${x + w / 2 - 16} ${y - h})`}><path d="M-6 0 L-5 -8 H5 L6 0Z" fill="#f4f1ec" /><circle cx="-3" cy="-12" r="4.5" fill="#3fa46a" /><circle cx="3" cy="-13" r="4.5" fill="#57c084" /><path d="M4 -10 C9 -6 10 0 12 6" stroke="#3fa46a" strokeWidth="2" fill="none" /></g>
    </g>
  );
}

const ARM_A = "#f4b942";
const ARM_B = "#e3a52d";
export function ArmchairBack({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 18} rx={36} ry={7} />
      <rect x={x - 28} y={y - 48} width="56" height="46" rx="16" fill={ARM_B} />
      <rect x={x - 22} y={y - 44} width="44" height="30" rx="12" fill={ARM_A} />
    </g>
  );
}
export function ArmchairFront({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <rect x={x - 26} y={y - 8} width="52" height="16" rx="7" fill={ARM_A} />
      <rect x={x - 34} y={y - 26} width="14" height="36" rx="7" fill={ARM_B} />
      <rect x={x + 20} y={y - 26} width="14" height="36" rx="7" fill={ARM_B} />
      <rect x={x - 26} y={y + 8} width="4" height="6" fill="#6b4f35" /><rect x={x + 22} y={y + 8} width="4" height="6" fill="#6b4f35" />
    </g>
  );
}

// ── Lounge ───────────────────────────────────────────────────────────────────
export function SofaBack({ x, y, w = 170 }: { x: number; y: number; w?: number }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 24} rx={w / 2 + 16} ry={9} />
      <rect x={x - w / 2} y={y - 40} width={w} height="40" rx="14" fill="var(--office-sofa)" />
      <rect x={x - w / 2 + 8} y={y - 36} width={w / 2 - 12} height="28" rx="10" fill="var(--office-sofa-seat)" />
      <rect x={x + 4} y={y - 36} width={w / 2 - 12} height="28" rx="10" fill="var(--office-sofa-seat)" />
      <rect x={x - w / 2 + 16} y={y - 30} width="22" height="18" rx="5" fill="#f4b942" transform={`rotate(-10 ${x - w / 2 + 27} ${y - 21})`} />
      <rect x={x + w / 2 - 38} y={y - 30} width="22" height="18" rx="5" fill="#ec6b9a" transform={`rotate(9 ${x + w / 2 - 27} ${y - 21})`} />
    </g>
  );
}
export function SofaFront({ x, y, w = 170 }: { x: number; y: number; w?: number }) {
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2 + 4} y={y - 6} width={w - 8} height="18" rx="8" fill="var(--office-sofa-seat)" />
      <rect x={x - w / 2 + 4} y={y + 4} width={w - 8} height="8" rx="4" fill="#000" opacity="0.12" />
      <rect x={x - w / 2 - 12} y={y - 30} width="20" height="44" rx="9" fill="var(--office-sofa)" />
      <rect x={x + w / 2 - 8} y={y - 30} width="20" height="44" rx="9" fill="var(--office-sofa)" />
      <rect x={x - w / 2 + 2} y={y + 12} width="5" height="6" fill="#3f3a4a" /><rect x={x + w / 2 - 7} y={y + 12} width="5" height="6" fill="#3f3a4a" />
    </g>
  );
}

export function CoffeeCounter({ x, y, onClick }: { x: number; y: number; onClick?: () => void }) {
  return (
    <g onClick={onClick} className="office-clickable" role="button" tabIndex={0} aria-label="Coffee machine — send someone on a coffee break" onKeyDown={(e) => e.key === "Enter" && onClick?.()}>
      <Shadow x={x} y={y + 3} rx={62} ry={7} />
      <rect x={x - 56} y={y - 44} width="112" height="44" rx="5" fill="var(--office-desk-top)" />
      <rect x={x - 56} y={y - 44} width="112" height="7" rx="3" fill="var(--office-wood)" />
      <rect x={x - 50} y={y - 32} width="48" height="28" rx="3" fill="var(--office-desk-edge)" />
      <rect x={x + 2} y={y - 32} width="48" height="28" rx="3" fill="var(--office-desk-edge)" />
      <rect x={x - 8} y={y - 20} width="3" height="8" rx="1.5" fill="#fff" opacity="0.6" /><rect x={x + 6} y={y - 20} width="3" height="8" rx="1.5" fill="#fff" opacity="0.6" />
      {/* espresso machine */}
      <rect x={x - 44} y={y - 86} width="44" height="42" rx="7" fill="#c9ccd6" />
      <rect x={x - 44} y={y - 86} width="44" height="12" rx="6" fill="#e07a5f" />
      <rect x={x - 44} y={y - 80} width="44" height="6" fill="#e07a5f" />
      <rect x={x - 40} y={y - 70} width="8" height="22" rx="2" fill="#fff" opacity="0.35" />
      <rect x={x - 28} y={y - 70} width="18" height="6" rx="2" fill="#57506a" />
      <rect x={x - 22} y={y - 64} width="6" height="5" fill="#3f3a4a" />
      <rect x={x - 26} y={y - 54} width="14" height="10" rx="2.5" fill="#fffdf8" />
      <path d={`M${x - 12} ${y - 51} C${x - 8} ${y - 51} ${x - 8} ${y - 46} ${x - 12} ${y - 46}`} fill="none" stroke="#fffdf8" strokeWidth="1.6" />
      <rect x={x - 30} y={y - 45} width="22" height="2.5" rx="1" fill="#6b6478" />
      <circle cx={x - 7} cy={y - 80} r="1.6" fill="#fff" opacity="0.9" />
      <path d={`M${x - 20} ${y - 57} C${x - 22} ${y - 62} ${x - 17} ${y - 64} ${x - 19} ${y - 69}`} fill="none" stroke="var(--office-steam)" strokeWidth="1.2" className="office-steam" />
      {/* mugs + fruit bowl */}
      {["#6c7cf0", "#2bb5a6", "#f4b942"].map((c, i) => <rect key={c} x={x + 8 + i * 11} y={y - 54} width="8" height="10" rx="2" fill={c} />)}
      <path d={`M${x + 40} ${y - 48} Q${x + 48} ${y - 40} ${x + 56} ${y - 48}Z`} fill="#fffdf8" />
      <circle cx={x + 45} cy={y - 50} r="3" fill="#ef4444" /><circle cx={x + 51} cy={y - 51} r="3" fill="#f4b942" />
      <text x={x - 22} y={y - 94} textAnchor="middle" fontSize="12" className="office-bob">☕</text>
    </g>
  );
}

export function WaterCooler({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 2} rx={18} ry={4.5} />
      <rect x={x - 13} y={y - 44} width="26" height="44" rx="5" fill="#f4f1ec" />
      <rect x={x - 13} y={y - 44} width="7" height="44" rx="4" fill="#fff" opacity="0.5" />
      <rect x={x - 8} y={y - 34} width="16" height="8" rx="2" fill="#dcd6ce" />
      <rect x={x - 6} y={y - 32} width="4" height="4" rx="1" fill="#3b82f6" /><rect x={x + 2} y={y - 32} width="4" height="4" rx="1" fill="#ef4444" />
      <path d={`M${x - 11} ${y - 44} C${x - 13} ${y - 72} ${x + 13} ${y - 72} ${x + 11} ${y - 44}Z`} fill="#7dd3fc" opacity="0.85" />
      <path d={`M${x - 6} ${y - 48} C${x - 7} ${y - 60} ${x - 3} ${y - 66} ${x} ${y - 67}`} fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      <circle cx={x + 3} cy={y - 55} r="1.5" fill="#fff" opacity="0.7" className="office-bubble-rise" />
    </g>
  );
}

export function Foosball({ x, y, onClick }: { x: number; y: number; onClick?: () => void }) {
  const w = 120;
  return (
    <g onClick={onClick} className="office-clickable" role="button" tabIndex={0} aria-label="Foosball table — start a quick game" onKeyDown={(e) => e.key === "Enter" && onClick?.()}>
      <Shadow x={x} y={y + 2} rx={w / 2 + 8} ry={7} />
      <rect x={x - w / 2 + 6} y={y - 20} width="6" height="22" fill="#57506a" /><rect x={x + w / 2 - 12} y={y - 20} width="6" height="22" fill="#57506a" />
      <rect x={x - w / 2} y={y - 44} width={w} height="26" rx="5" fill="#8a5a3b" />
      <rect x={x - w / 2 + 5} y={y - 41} width={w - 10} height="18" rx="3" fill="#3fa46a" />
      <path d={`M${x} ${y - 41} V${y - 23}`} stroke="#fff" strokeOpacity="0.6" />
      <circle cx={x} cy={y - 32} r="4" fill="none" stroke="#fff" strokeOpacity="0.6" />
      {[-40, -14, 14, 40].map((dx, i) => (
        <g key={dx}>
          <path d={`M${x + dx} ${y - 50} V${y - 16}`} stroke="#c9ccd6" strokeWidth="1.8" />
          {[-6, 4].map((dy) => <rect key={dy} x={x + dx - 2.5} y={y - 34 + dy} width="5" height="7" rx="1.5" fill={i % 2 ? "#3b82f6" : "#ef4444"} />)}
          <circle cx={x + dx} cy={i < 2 ? y - 50 : y - 16} r="2.5" fill="#1f1b2e" />
        </g>
      ))}
      <circle cx={x + 6} cy={y - 30} r="2" fill="#fff" className="office-ball" />
      <rect x={x - w / 2} y={y - 20} width={w} height="6" rx="2" fill="#6b4530" />
    </g>
  );
}

export function Planter({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 2} rx={w / 2 + 6} ry={6} />
      <g>
        {Array.from({ length: Math.floor(w / 18) }).map((_, i) => {
          const px = x - w / 2 + 10 + i * 18;
          return (
            <g key={i} className="office-sway" style={{ transformOrigin: `${px}px ${y - 18}px`, transformBox: "view-box", animationDelay: `${-i * 0.7}s` }}>
              <path d={`M${px} ${y - 16} C${px - 8} ${y - 26} ${px - 10} ${y - 36} ${px - 4} ${y - 44} C${px - 2} ${y - 32} ${px} ${y - 26} ${px} ${y - 16}Z`} fill={i % 2 ? "#3fa46a" : "#2f8a57"} />
              <path d={`M${px} ${y - 16} C${px + 8} ${y - 24} ${px + 12} ${y - 32} ${px + 8} ${y - 40} C${px + 4} ${y - 30} ${px + 2} ${y - 24} ${px} ${y - 16}Z`} fill={i % 2 ? "#57c084" : "#46b374"} />
            </g>
          );
        })}
      </g>
      <rect x={x - w / 2} y={y - 20} width={w} height="20" rx="4" fill="var(--office-wood)" />
      <rect x={x - w / 2} y={y - 20} width={w} height="5" rx="2.5" fill="var(--office-wood-dark)" />
    </g>
  );
}

// ── Meeting ──────────────────────────────────────────────────────────────────
export function MeetingTable({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 6} rx={w / 2 + 14} ry={14} />
      <rect x={x - w / 2 + 20} y={y - 10} width="8" height="18" fill="var(--office-desk-leg)" />
      <rect x={x + w / 2 - 28} y={y - 10} width="8" height="18" fill="var(--office-desk-leg)" />
      <rect x={x - w / 2} y={y - 38} width={w} height="32" rx="16" fill="var(--office-wood)" />
      <rect x={x - w / 2 + 10} y={y - 35} width={w - 20} height="4" rx="2" fill="#fff" opacity="0.22" />
      <rect x={x - w / 2} y={y - 12} width={w} height="8" rx="4" fill="var(--office-wood-dark)" />
      {/* papers, laptop, vase */}
      <rect x={x - 90} y={y - 28} width="20" height="14" rx="1.5" fill="#fffdf8" transform={`rotate(-8 ${x - 80} ${y - 21})`} />
      <rect x={x + 60} y={y - 27} width="18" height="13" rx="1.5" fill="#fffdf8" transform={`rotate(6 ${x + 69} ${y - 20})`} />
      <g transform={`translate(${x - 28} ${y - 16})`}>
        <rect x="-12" y="-14" width="24" height="14" rx="1.5" fill="#57506a" /><rect x="-10.5" y="-12.5" width="21" height="11" rx="1" fill="#6c7cf0" opacity="0.8" />
        <rect x="-15" y="0" width="30" height="2.5" rx="1" fill="#6b6478" />
      </g>
      <g transform={`translate(${x + 20} ${y - 16})`}>
        <path d="M-4 0 C-6 -6 -4 -10 -2 -12 H2 C4 -10 6 -6 4 0Z" fill="#7aa7e0" />
        <circle cx="-3" cy="-16" r="3.5" fill="#fda4af" /><circle cx="3" cy="-17" r="3.5" fill="#f4b942" /><circle cx="0" cy="-20" r="3.5" fill="#ec6b9a" />
      </g>
    </g>
  );
}

// ── Manager's glass office ───────────────────────────────────────────────────
export function GlassOfficeBack() {
  const z = ZONES.manager;
  return (
    <g pointerEvents="none">
      <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="10" fill="var(--office-glass)" />
    </g>
  );
}
/** Side and front glass panes; a depth item so people behind it are drawn under the glass. */
export function GlassOfficeFront() {
  const z = ZONES.manager;
  const bottom = z.y + z.h;
  const right = z.x + z.w;
  const doorTop = 350;
  return (
    <g pointerEvents="none">
      {/* front pane */}
      <rect x={z.x} y={bottom - 44} width={z.w} height="44" fill="var(--office-glass)" />
      <path d={`M${z.x + 30} ${bottom - 2} L${z.x + 60} ${bottom - 42} M${z.x + 44} ${bottom - 2} L${z.x + 74} ${bottom - 42} M${z.x + 170} ${bottom - 2} L${z.x + 200} ${bottom - 42}`} stroke="#fff" strokeOpacity="0.35" strokeWidth="3" />
      <rect x={z.x} y={bottom - 46} width={z.w} height="4" rx="2" fill="var(--office-glass-frame)" />
      <rect x={z.x} y={bottom - 4} width={z.w} height="6" rx="3" fill="var(--office-glass-frame)" />
      {/* side frames */}
      <rect x={z.x - 2} y={z.y} width="5" height={z.h} rx="2.5" fill="var(--office-glass-frame)" />
      <rect x={right - 3} y={z.y} width="5" height={doorTop - z.y} rx="2.5" fill="var(--office-glass-frame)" />
      <rect x={right - 3} y={bottom - 46} width="5" height="46" rx="2.5" fill="var(--office-glass-frame)" />
    </g>
  );
}

export function Credenza({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <Shadow x={x} y={y + 2} rx={70} ry={6} />
      <rect x={x - 64} y={y - 34} width="128" height="34" rx="5" fill="var(--office-wood)" />
      <rect x={x - 64} y={y - 34} width="128" height="6" rx="3" fill="var(--office-wood-dark)" />
      {[0, 1, 2].map((i) => <rect key={i} x={x - 58 + i * 40} y={y - 24} width="36" height="20" rx="2" fill="#000" opacity="0.08" />)}
      <path d={`M${x - 44} ${y - 34} V${y - 46} H${x - 34} V${y - 34} M${x - 39} ${y - 46} V${y - 50}`} stroke="#f4b942" strokeWidth="3" fill="none" />
      <circle cx={x - 39} cy={y - 52} r="5" fill="#f4b942" />
      <rect x={x - 16} y={y - 52} width="26" height="18" rx="1.5" fill="#fffdf8" stroke="#c89a6a" strokeWidth="1.5" />
      <path d={`M${x - 12} ${y - 38} L${x - 6} ${y - 44} L${x} ${y - 41} L${x + 7} ${y - 48}`} stroke="#22c55e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

// ── Defs ─────────────────────────────────────────────────────────────────────
export const SceneDefs = memo(function SceneDefs() {
  return (
    <defs>
      <linearGradient id="sky-day" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6cc4f5" /><stop offset="100%" stopColor="#d6f0fd" /></linearGradient>
      <linearGradient id="sky-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a1740" /><stop offset="100%" stopColor="#4a2c7a" /></linearGradient>
      <linearGradient id="glass-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity="0.35" /><stop offset="35%" stopColor="#fff" stopOpacity="0" /><stop offset="60%" stopColor="#fff" stopOpacity="0" /><stop offset="70%" stopColor="#fff" stopOpacity="0.12" /><stop offset="80%" stopColor="#fff" stopOpacity="0" /></linearGradient>
      <linearGradient id="window-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff8e1" stopOpacity="0.55" /><stop offset="100%" stopColor="#fff8e1" stopOpacity="0" /></linearGradient>
      <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6c7cf0" /><stop offset="60%" stopColor="#c026d3" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient>
      <linearGradient id="screen-glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity="0.22" /><stop offset="42%" stopColor="#fff" stopOpacity="0" /></linearGradient>
      <linearGradient id="amber-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient>
      <linearGradient id="chair-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity="0.2" /><stop offset="100%" stopColor="#000" stopOpacity="0.2" /></linearGradient>
      <linearGradient id="tv-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity="0.45" /><stop offset="100%" stopColor="#818cf8" stopOpacity="0" /></linearGradient>
      <radialGradient id="soft-shadow"><stop offset="0%" stopColor="#1e1030" stopOpacity="0.28" /><stop offset="70%" stopColor="#1e1030" stopOpacity="0.1" /><stop offset="100%" stopColor="#1e1030" stopOpacity="0" /></radialGradient>
      <radialGradient id="lamp-glow"><stop offset="0%" stopColor="#ffd98a" stopOpacity="0.32" /><stop offset="100%" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
      <radialGradient id="teal-glow"><stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.22" /><stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" /></radialGradient>
      {WINDOWS.map((x, i) => <clipPath key={x} id={`win-clip-${i}`}><rect x={x - 75} y="16" width="150" height="78" rx="3" /></clipPath>)}
      <filter id="soft-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      <filter id="bubble-shadow" x="-20%" y="-40%" width="140%" height="190%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#1e1030" floodOpacity="0.18" /></filter>
      <pattern id="floor-planks" width="320" height="44" patternUnits="userSpaceOnUse">
        <rect width="320" height="44" fill="var(--office-floor)" />
        <rect x="0" y="0" width="200" height="22" fill="var(--office-plank-alt)" />
        <rect x="120" y="22" width="200" height="22" fill="var(--office-plank-alt)" opacity="0.55" />
        <path d="M0 21.5 H320 M0 43.5 H320" stroke="var(--office-plank-line)" strokeWidth="1" />
        <path d="M200 0 V21 M120 22 V43" stroke="var(--office-plank-line)" strokeWidth="1" opacity="0.8" />
        <path d="M40 8 C70 6 100 10 130 8 M210 30 C240 28 270 32 300 30" stroke="var(--office-plank-line)" strokeWidth="0.6" opacity="0.35" fill="none" />
      </pattern>
      <pattern id="tiles" width="36" height="36" patternUnits="userSpaceOnUse">
        <rect width="36" height="36" fill="var(--office-tile)" />
        <path d="M36 0 H0 V36" fill="none" stroke="var(--office-tile-line)" strokeWidth="1.2" />
        <circle cx="0" cy="0" r="2" fill="var(--office-tile-line)" />
      </pattern>
      <pattern id="carpet" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="var(--office-carpet)" />
        <circle cx="4" cy="4" r="1.1" fill="var(--office-carpet-line)" /><circle cx="12" cy="12" r="1.1" fill="var(--office-carpet-line)" />
      </pattern>
    </defs>
  );
});
