import { memo, useEffect, useRef } from "react";
import type { Persona } from "@/features/team/employees";
import type { TeamMemberStatus } from "@/lib/types";

/** Element handles the office director animates imperatively. */
export type BodyParts = {
  root: SVGGElement;
  flip: SVGGElement;
  body: SVGGElement;
  breath: SVGGElement;
  legL: SVGGElement;
  legR: SVGGElement;
  armL: SVGGElement;
  armR: SVGGElement;
  eyes: SVGGElement;
  halo: SVGEllipseElement;
  prop: SVGGElement;
};
export type BubbleParts = {
  tag: SVGGElement;
  ring: SVGRectElement;
  bubble: SVGGElement;
  bubbleInner: SVGGElement;
  bubbleBg: SVGRectElement;
  bubbleTail: SVGPathElement;
  bubbleText: SVGTextElement;
};
export type CharacterParts = BodyParts & BubbleParts;

const PANTS = ["#334155", "#3b4a6b", "#44403c", "#1e3a5f", "#4c3d6b", "#3f4a3c"];
const SHOE = "#1f1a24";
const FONT = { fontFamily: "var(--font-sans)" } as const;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Hair drawn behind the head (long hair, hoods). */
function BackHair({ persona }: { persona: Persona }) {
  const { hairStyle: s, hair } = persona;
  if (persona.accessory === "hoodie") {
    const d = "M-15.5 -52 C-17.5 -74 17.5 -74 15.5 -52 L14 -42 H-14Z";
    return <g><path d={d} fill={persona.shirt} /><path d={d} fill="#000" opacity="0.18" /></g>;
  }
  if (s === "long") return <path fill={hair} d="M-13 -60 C-13 -73 13 -73 13 -60 L14.5 -40 C11 -38 -11 -38 -14.5 -40Z" />;
  if (s === "bob") return <path fill={hair} d="M-13.2 -60 C-13.2 -73 13.2 -73 13.2 -60 L13 -48 C9 -46 -9 -46 -13 -48Z" />;
  return null;
}

/** Hair drawn over the head. */
function FrontHair({ persona }: { persona: Persona }) {
  const { hairStyle: s, hair } = persona;
  const hl = <path d="M-6 -67.5 C-2 -69.5 3 -69.5 6 -68" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.6" strokeLinecap="round" />;
  if (persona.accessory === "cap") {
    return (
      <g>
        <path fill={hair} d="M-12.3 -56 C-12.6 -60 -12 -62 -11 -63 L-9 -57Z M12.3 -56 C12.6 -60 12 -62 11 -63 L9 -57Z" />
        <path fill={persona.from} d="M-12.6 -60 C-12.6 -74 12.6 -74 12.6 -60 Z" />
        <path fill={persona.to} d="M4 -61 C9 -62.5 16 -62 19.5 -59.5 C16 -58.4 9 -58.6 3 -59.4Z" />
        <circle cx="0" cy="-71.4" r="1.4" fill={persona.to} />
        <path d="M-5 -71 C-2 -72.6 2 -72.6 5 -71" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="1.2" />
      </g>
    );
  }
  switch (s) {
    case "bun":
      return (
        <g fill={hair}>
          <circle cx="0" cy="-73.5" r="6" />
          <path d="M-12.8 -56 C-13.5 -69 -6 -71.5 0 -71.5 C6 -71.5 13.5 -69 12.8 -56 C11 -62 6 -64.5 1 -63.5 C-4 -65 -10 -62.5 -12.8 -56Z" />
          {hl}
        </g>
      );
    case "long":
      return (
        <g fill={hair}>
          <path d="M-13 -55 C-14 -69 -6 -71.5 0 -71.5 C6 -71.5 14 -69 13 -55 C11 -61 7 -63 2 -62 C-2 -64.5 -9 -63 -13 -55Z" />
          {hl}
        </g>
      );
    case "curly":
      return (
        <g fill={hair}>
          {[-10, -5.5, 0, 5.5, 10].map((x, i) => <circle key={i} cx={x} cy={-67 + (i % 2) * 1.8} r="5.4" />)}
          <circle cx="-11.8" cy="-60.5" r="4" /><circle cx="11.8" cy="-60.5" r="4" />
          <circle cx="-3" cy="-71" r="4.6" /><circle cx="3.5" cy="-71.2" r="4.6" />
        </g>
      );
    case "buzz":
      return <path fill={hair} opacity="0.92" d="M-12.2 -58 C-12.2 -68 -6 -70.6 0 -70.6 C6 -70.6 12.2 -68 12.2 -58 C10 -63.5 5 -65.2 0 -65.2 C-5 -65.2 -10 -63.5 -12.2 -58Z" />;
    case "bob":
      return (
        <g fill={hair}>
          <path d="M-13.2 -53 C-14.4 -69 -6 -72 0 -72 C6 -72 14.4 -69 13.2 -53 L12.4 -50 C10.6 -52 10.4 -56 10.2 -59 C5 -61.5 -2 -62 -10.2 -59 C-10.4 -56 -10.6 -52 -12.4 -50Z" />
          {hl}
        </g>
      );
    case "short":
    default:
      return (
        <g fill={hair}>
          <path d="M-12.6 -57 C-13.6 -69 -6 -71.4 0 -71.4 C7 -71.4 13.6 -69 12.6 -57 C11 -61.5 8 -63.8 3 -63 C-1 -66 -9 -63.8 -12.6 -57Z" />
          {hl}
        </g>
      );
  }
}

function Accessory({ persona }: { persona: Persona }) {
  const kind = persona.accessory;
  if (kind === "glasses")
    return (
      <g fill="#ffffff" fillOpacity="0.25" stroke="#1e1b2e" strokeWidth="1.2">
        <rect x="-8.6" y="-60.2" width="7" height="5.6" rx="2.2" /><rect x="1.6" y="-60.2" width="7" height="5.6" rx="2.2" /><path d="M-1.6 -57.8 H1.6" fill="none" />
      </g>
    );
  if (kind === "headset")
    return (
      <g fill="none" stroke="#1e1b2e" strokeWidth="1.8" strokeLinecap="round">
        <path d="M-12.6 -58 C-13 -74 13 -74 12.6 -58" />
        <rect x="-15" y="-61" width="4.4" height="7.4" rx="2" fill="#1e1b2e" />
        <path d="M-13 -54.5 C-12 -48 -7 -47 -3.5 -47.6" strokeWidth="1.2" />
        <circle cx="-3" cy="-47.6" r="1.5" fill={persona.from} stroke="none" />
      </g>
    );
  if (kind === "beret")
    return (
      <g>
        <path fill={persona.from} d="M-14 -64 C-13 -75 12 -77 14.5 -65.5 C9 -68 -6 -68.5 -14 -64Z" />
        <circle cx="1" cy="-73.6" r="1.4" fill={persona.from} />
      </g>
    );
  if (kind === "earring")
    return (
      <g fill="#fbbf24" stroke="#b45309" strokeWidth="0.5">
        <circle cx="-12.3" cy="-52.2" r="1.5" /><circle cx="12.3" cy="-52.2" r="1.5" />
      </g>
    );
  return null;
}

function Torso({ persona }: { persona: Persona }) {
  const { shirt, skin, accessory } = persona;
  return (
    <g>
      <rect x="-3" y="-49.5" width="6" height="5" rx="2" fill={skin} />
      <path d="M-12 -40.5 C-12 -45 -8.5 -46.5 -5 -46.5 H5 C8.5 -46.5 12 -45 12 -40.5 V-23.5 C12 -21.5 10.5 -20.5 8.5 -20.5 H-8.5 C-10.5 -20.5 -12 -21.5 -12 -23.5Z" fill={shirt} />
      {/* soft side shade + highlight */}
      <path d="M6 -46 C9.5 -45.5 12 -44 12 -40.5 V-23.5 C12 -21.5 10.5 -20.5 8.5 -20.5 H6Z" fill="#000" opacity="0.12" />
      <path d="M-9 -44 C-10 -40 -10 -32 -9.5 -26" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round" />
      {accessory === "hoodie" ? (
        <g>
          <path d="M-7 -46.5 C-5 -41 5 -41 7 -46.5" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1.6" />
          <path d="M-2.5 -42.5 V-35 M2.5 -42.5 V-34" stroke="#f8fafc" strokeWidth="0.9" strokeLinecap="round" />
          <rect x="-7" y="-30" width="14" height="6.5" rx="2.5" fill="#000" opacity="0.14" />
        </g>
      ) : (
        <path d="M-4.5 -46.5 L0 -41.5 L4.5 -46.5" fill="#fff" opacity="0.92" />
      )}
      {accessory === "tie" && <path d="M-1.7 -42 H1.7 L2.6 -29 L0 -26.2 L-2.6 -29Z" fill="#9f1239" />}
    </g>
  );
}

function Face({ persona }: { persona: Persona }) {
  return (
    <g>
      <circle cx="-12" cy="-57" r="2.6" fill={persona.skin} />
      <circle cx="12" cy="-57" r="2.6" fill={persona.skin} />
      <circle cx="0" cy="-58" r="12" fill={persona.skin} />
      <path d="M6 -67.5 C11 -64 12.5 -58 10.5 -52 C9 -49 6 -47 3 -46.3 C9 -50 10.5 -60 6 -67.5Z" fill="#000" opacity="0.07" />
      <path d="M-7 -61.6 H-3 M3 -61.6 H7" stroke={persona.hair} strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
    </g>
  );
}

export const Character = memo(function Character({ id, persona, robot = false, onParts }: {
  id: string;
  persona: Persona;
  robot?: boolean;
  onParts: (p: Partial<CharacterParts> | null) => void;
}) {
  const refs = useRef<Partial<BodyParts>>({});
  const set = <K extends keyof BodyParts>(k: K) => (el: BodyParts[K] | null) => {
    if (el) refs.current[k] = el;
  };
  useEffect(() => {
    onParts(refs.current);
    return () => onParts(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pants = robot ? "#94a3b8" : PANTS[hash(id) % PANTS.length];
  const hand = robot ? "#cbd5e1" : persona.skin;
  return (
    <g ref={set("root")} className="office-character">
      <ellipse ref={set("halo")} cx="0" cy="1" rx="18" ry="6" fill={persona.from} opacity="0" />
      <ellipse cx="0" cy="0" rx="14" ry="4" fill="url(#soft-shadow)" />
      <g ref={set("flip")}>
        <g ref={set("body")}>
          {/* legs */}
          <g ref={set("legL")} style={{ transformOrigin: "-4.2px -22px", transformBox: "view-box" }}>
            <rect x="-7.2" y="-23" width="6" height="21" rx="3" fill={pants} />
            <path d="M-8.8 -1.6 C-8.8 -4.4 -6.6 -5 -4.2 -5 C-1.6 -5 0 -4 0 -1.6Z" fill={robot ? "#475569" : SHOE} />
          </g>
          <g ref={set("legR")} style={{ transformOrigin: "4.2px -22px", transformBox: "view-box" }}>
            <rect x="1.2" y="-23" width="6" height="21" rx="3" fill={pants} />
            <path d="M0 -1.6 C0 -4 1.6 -5 4.2 -5 C6.6 -5 8.8 -4.4 8.8 -1.6Z" fill={robot ? "#475569" : SHOE} />
          </g>
          <g ref={set("breath")} style={{ transformOrigin: "0px -21px", transformBox: "view-box" }}>
            {!robot && <BackHair persona={persona} />}
            {/* back arm */}
            <g ref={set("armL")} style={{ transformOrigin: "-11px -42px", transformBox: "view-box" }}>
              <rect x="-15" y="-44" width="6" height="19" rx="3" fill={persona.shirt} />
              <rect x="-15" y="-44" width="6" height="19" rx="3" fill="#000" opacity="0.1" />
              <circle cx="-12" cy="-24.5" r="3" fill={hand} />
            </g>
            {robot ? (
              <g>
                <rect x="-12.5" y="-47" width="25" height="26" rx="7" fill="#e2e8f0" />
                <rect x="-12.5" y="-47" width="25" height="26" rx="7" fill={persona.shirt} opacity="0.9" />
                <path d="M7 -46.5 C10.5 -46 12.5 -44 12.5 -40 V-28 C12.5 -24 10 -21 7 -21Z" fill="#000" opacity="0.14" />
                <rect x="-7" y="-41" width="14" height="9" rx="2.5" fill="#0b1220" />
                <path d="M-5 -36.5 L-2.6 -34.4 L2.4 -39" fill="none" stroke="#5eead4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="-7" cy="-26" r="1.3" fill="#f472b6" className="office-blink" />
                <circle cx="-3" cy="-26" r="1.3" fill="#a3e635" className="office-blink" style={{ animationDelay: "0.4s" }} />
              </g>
            ) : (
              <Torso persona={persona} />
            )}
            {/* head */}
            {robot ? (
              <g>
                <path d="M0 -72 V-78" stroke="#94a3b8" strokeWidth="1.6" />
                <circle cx="0" cy="-79.5" r="2.6" fill="#f472b6" className="office-blink" />
                <rect x="-14" y="-60" width="3.5" height="7" rx="1.5" fill="#94a3b8" />
                <rect x="10.5" y="-60" width="3.5" height="7" rx="1.5" fill="#94a3b8" />
                <rect x="-12" y="-72" width="24" height="22" rx="8" fill="#f1f5f9" />
                <path d="M4 -71.6 C9 -71 12 -68 12 -63 V-58 C12 -53 9 -50.4 5 -50Z" fill="#000" opacity="0.08" />
                <rect x="-9" y="-67" width="18" height="11" rx="5" fill="#0b1220" />
                <g ref={set("eyes")} style={{ transformOrigin: "0px -61.5px", transformBox: "view-box" }}>
                  <rect x="-5.8" y="-63.6" width="3.6" height="4.2" rx="1.8" fill="#5eead4" />
                  <rect x="2.2" y="-63.6" width="3.6" height="4.2" rx="1.8" fill="#5eead4" />
                </g>
                <path d="M-2 -57.8 Q0 -56.6 2 -57.8" fill="none" stroke="#5eead4" strokeWidth="0.9" strokeLinecap="round" />
              </g>
            ) : (
              <g>
                <Face persona={persona} />
                <g ref={set("eyes")} style={{ transformOrigin: "0px -57px", transformBox: "view-box" }}>
                  <ellipse cx="-4.4" cy="-57" rx="1.5" ry="2" fill="#1e1b2e" />
                  <ellipse cx="4.4" cy="-57" rx="1.5" ry="2" fill="#1e1b2e" />
                  <circle cx="-3.9" cy="-57.8" r="0.55" fill="#fff" />
                  <circle cx="4.9" cy="-57.8" r="0.55" fill="#fff" />
                </g>
                <circle cx="-7.4" cy="-52.6" r="2.1" fill="#fb7185" opacity="0.28" />
                <circle cx="7.4" cy="-52.6" r="2.1" fill="#fb7185" opacity="0.28" />
                <path d="M-2.8 -51.6 Q0 -49.2 2.8 -51.6" fill="none" stroke="#7f1d1d" strokeWidth="1.15" strokeLinecap="round" />
                <FrontHair persona={persona} />
                <Accessory persona={persona} />
              </g>
            )}
            {/* front arm (holds props) */}
            <g ref={set("armR")} style={{ transformOrigin: "11px -42px", transformBox: "view-box" }}>
              <rect x="9" y="-44" width="6" height="19" rx="3" fill={robot ? "#94a3b8" : persona.shirt} />
              <circle cx="12" cy="-24.5" r="3" fill={hand} />
              <g ref={set("prop")} opacity="0">
                <rect x="9" y="-29.5" width="6.4" height="7" rx="1.4" fill="#fafafa" stroke="#d4d4d8" strokeWidth="0.6" />
                <rect x="9" y="-29.5" width="6.4" height="2.2" rx="1" fill={persona.from} />
                <path d="M15.4 -27.5 C18 -27.5 18 -23.8 15.4 -23.8" fill="none" stroke="#d4d4d8" strokeWidth="0.9" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
});

/**
 * Name tag + speech bubble, rendered in a top overlay layer so they are never hidden behind furniture or people.
 * The director keeps them pinned to the character every frame.
 */
export const Overlay = memo(function Overlay({ name, color, status = "idle", showName = true, onParts }: {
  name: string;
  color: string;
  status?: TeamMemberStatus;
  showName?: boolean;
  onParts: (p: Partial<CharacterParts> | null) => void;
}) {
  const refs = useRef<Partial<BubbleParts>>({});
  const set = <K extends keyof BubbleParts>(k: K) => (el: BubbleParts[K] | null) => {
    if (el) refs.current[k] = el;
  };
  useEffect(() => {
    onParts(refs.current);
    return () => onParts(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const labelW = name.length * 6.1 + 24;
  const dot = status === "working" ? "#22c55e" : status === "blocked" ? "#f59e0b" : "#a1a1aa";
  return (
    <g pointerEvents="none">
      <g ref={set("tag")} style={{ visibility: "hidden" }}>
        <rect ref={set("ring")} x={-labelW / 2 - 5} y="3" width={labelW + 10} height="24" rx="12" fill="none" stroke={color} strokeWidth="2.5" opacity="0" />
        <g transform="translate(0,15)" className="office-label" display={showName ? undefined : "none"}>
          <rect x={-labelW / 2} y="-8" width={labelW} height="16" rx="8" fill="var(--office-label)" stroke="var(--office-label-edge)" strokeWidth="1" />
          <circle cx={-labelW / 2 + 8.5} cy="0" r="3" fill={dot} className={status === "working" ? "office-pulse" : undefined} />
          <text x={5.5} y="3.4" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="var(--office-label-text)" style={{ ...FONT, letterSpacing: "0.01em" }}>
            {name}
          </text>
        </g>
      </g>
      <g ref={set("bubble")} style={{ visibility: "hidden" }} className="office-bubble">
        <g ref={set("bubbleInner")}>
          <rect ref={set("bubbleBg")} x="-40" y="-26" width="80" height="22" rx="11" fill="var(--color-card)" stroke="var(--color-border)" filter="url(#bubble-shadow)" />
          <path ref={set("bubbleTail")} d="M-5 -4.6 L0 2 L5 -4.6" fill="var(--color-card)" stroke="var(--color-border)" strokeLinejoin="round" />
          <text ref={set("bubbleText")} x="0" y="-11.3" textAnchor="middle" fontSize="10.5" fontWeight="500" fill="var(--color-foreground)" style={FONT}>
            …
          </text>
        </g>
      </g>
    </g>
  );
});
