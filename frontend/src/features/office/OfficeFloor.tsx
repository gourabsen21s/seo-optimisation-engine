import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ClipboardList, ExternalLink, Minus, Plus, RotateCcw, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { ASSIGNABLE_IDS, EMPLOYEE_IDS, persona, useEmployees } from "@/features/team/employees";
import { gsap } from "@/lib/gsap";
import { useIsDark } from "@/lib/hooks";
import type { Activity, EmployeeId, TeamMember, TeamMemberStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Character, type CharacterParts, Overlay } from "./Character";
import { OfficeDirector } from "./director";
import { Floor, GlassOfficeBack, SceneDefs, Wall } from "./Furniture";
import { NODES, SCENE, WALKWAYS } from "./layout";
import { OfficeDecor, OfficeDesks } from "./OfficeProps";
import "./office.css";

const MEETING_TASK = /plan|review the cycle/i;
const MAX_ZOOM = 3.2;

export type BoardCounts = { todo: number; doing: number; waiting: number; done: number };

type Props = {
  siteId: number;
  members: TeamMember[] | undefined;
  activity: Activity[] | undefined;
  counts: BoardCounts;
  showNames?: boolean;
  highlight?: EmployeeId | null;
  onSelect: (id: EmployeeId) => void;
  onAssign: (id: EmployeeId) => void;
  onOpenTask: (id: number) => void;
  className?: string;
};

export const STATUS_META: Record<TeamMemberStatus, { label: string; dot: string }> = {
  working: { label: "Working", dot: "bg-emerald-500" },
  blocked: { label: "Waiting on you", dot: "bg-amber-500" },
  idle: { label: "Available", dot: "bg-zinc-400" },
};

type Cam = { x: number; y: number; w: number };
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function OfficeFloor({ siteId, members, activity, counts, showNames = true, highlight = null, onSelect, onAssign, onOpenTask, className }: Props) {
  const dir = useEmployees();
  const dark = useIsDark();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const depthRef = useRef<SVGGElement>(null);
  const fxRef = useRef<SVGGElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardActivityRef = useRef<HTMLParagraphElement>(null);
  const partsRef = useRef(new Map<EmployeeId, Partial<CharacterParts>>());
  const nameOf = useRef(dir.name);
  nameOf.current = dir.name;
  const director = useMemo(() => new OfficeDirector((id) => nameOf.current(id)), []);
  const [hovered, setHovered] = useState<EmployeeId | null>(null);
  const [deskMenu, setDeskMenu] = useState<{ id: EmployeeId; x: number; y: number } | null>(null);
  const debug = useMemo(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("walkways"), []);

  const byId = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const status = (id: EmployeeId): TeamMemberStatus => byId.get(id)?.status ?? "idle";

  // ── director lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (depthRef.current && fxRef.current) director.attach(depthRef.current, fxRef.current);
    return () => director.dispose();
  }, [director]);

  // Character body + bubble parts arrive separately; register once both are mounted.
  const partHandlers = useMemo(() => {
    const make = (id: EmployeeId) => (p: Partial<CharacterParts> | null) => {
      const map = partsRef.current;
      if (!p) {
        director.unregister(id);
        map.delete(id);
        return;
      }
      const merged = { ...(map.get(id) ?? {}), ...p };
      map.set(id, merged);
      if (merged.root && merged.bubble) director.register(id, merged as CharacterParts);
    };
    return Object.fromEntries(EMPLOYEE_IDS.map((id) => [id, { body: make(id), bubble: make(id) }])) as Record<EmployeeId, { body: ReturnType<typeof make>; bubble: ReturnType<typeof make> }>;
  }, [director]);

  // Live status → behaviour
  useEffect(() => {
    if (!members) return;
    const mgr = byId.get("manager");
    const meeting = !!(mgr?.status === "working" && mgr.current_task && MEETING_TASK.test(mgr.current_task.title));
    if (!meeting) director.endMeeting();
    for (const id of EMPLOYEE_IDS) {
      const m = byId.get(id);
      if (id === "manager" && meeting) director.setDesired(id, { mode: "meet", text: m?.current_task?.title });
      else if (m?.status === "working") director.setDesired(id, { mode: "work", text: m.current_task?.title });
      else if (m?.status === "blocked") director.setDesired(id, { mode: "blocked", text: m.current_task?.title });
      else if (meeting && id !== "compliance") director.setDesired(id, { mode: "meet" });
      else director.setDesired(id, { mode: "roam" });
    }
  }, [members, byId, director]);

  // New activity → hand-offs, celebrations, reviews
  const seen = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!activity) return;
    if (seen.current == null) {
      seen.current = new Set(activity.map((a) => a.id));
      return;
    }
    const fresh = activity.filter((a) => !seen.current!.has(a.id)).reverse();
    for (const a of fresh) {
      seen.current.add(a.id);
      if (a.actor === "human") continue;
      const actor = a.actor as EmployeeId;
      if (a.verb === "created_task") {
        const to = dir.list.find((e) => new RegExp(`to ${e.name}\\b`).test(a.message));
        if (to && to.id !== actor) director.handoff(actor, to.id);
      } else if (a.verb === "completed") director.celebrate(actor);
      else if (a.verb === "reviewed") director.say("compliance", "🛡️ Verified");
      else if (a.verb === "proposed_fixes") director.say(actor, "🛠️ Fixes ready");
      else if (a.verb === "opened_pr" || /pull request/i.test(a.message)) director.say(actor, "🚀 PR opened");
    }
  }, [activity, dir.list, director]);

  useEffect(() => { director.spotlight(highlight); }, [highlight, director]);

  // ── camera: zoom & pan by rewriting the viewBox (no React renders) ────────
  const cam = useRef<Cam>({ x: 0, y: 0, w: SCENE.w });
  const aspect = useRef(SCENE.w / SCENE.h);
  const camTween = useRef<gsap.core.Tween | null>(null);
  const [zoomInfo, setZoomInfo] = useState({ canPan: false, canPanY: false, atMin: true, atMax: false });

  const limits = useCallback(() => {
    const wMax = Math.min(SCENE.w, SCENE.h * aspect.current);
    return { wMax, wMin: wMax / MAX_ZOOM };
  }, []);
  const clampCam = useCallback((c: Cam): Cam => {
    const { wMax, wMin } = limits();
    const w = clampN(c.w, wMin, wMax);
    const h = w / aspect.current;
    return { w, x: clampN(c.x, 0, SCENE.w - w), y: clampN(c.y, 0, SCENE.h - h) };
  }, [limits]);
  const applyCam = useCallback(() => {
    const c = cam.current;
    const h = c.w / aspect.current;
    svgRef.current?.setAttribute("viewBox", `${c.x.toFixed(2)} ${c.y.toFixed(2)} ${c.w.toFixed(2)} ${h.toFixed(2)}`);
    const { wMax, wMin } = limits();
    const next = { canPan: c.w < SCENE.w - 1 || h < SCENE.h - 1, canPanY: h < SCENE.h - 1, atMin: c.w >= wMax - 0.5, atMax: c.w <= wMin + 0.5 };
    setZoomInfo((p) => (p.canPan === next.canPan && p.canPanY === next.canPanY && p.atMin === next.atMin && p.atMax === next.atMax ? p : next));
  }, [limits]);
  const moveCam = useCallback((target: Cam, animate = true) => {
    const t = clampCam(target);
    camTween.current?.kill();
    if (!animate || director.reduced) {
      cam.current = t;
      applyCam();
      return;
    }
    camTween.current = gsap.to(cam.current, { ...t, duration: 0.4, ease: "power3.out", onUpdate: applyCam });
  }, [applyCam, clampCam, director.reduced]);
  const homeCam = useCallback((): Cam => {
    const { wMax } = limits();
    const h = wMax / aspect.current;
    return { w: wMax, x: (SCENE.w - wMax) / 2, y: (SCENE.h - h) / 2 };
  }, [limits]);
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const c = cam.current;
    return { x: c.x + ((clientX - r.left) / r.width) * c.w, y: c.y + ((clientY - r.top) / r.height) * (c.w / aspect.current) };
  }, []);
  const zoomAt = useCallback((factor: number, p?: { x: number; y: number }, animate = true) => {
    const c = camTween.current?.isActive() ? { ...(camTween.current.vars as Cam) } : { ...cam.current };
    const h = c.w / aspect.current;
    const at = p ?? { x: c.x + c.w / 2, y: c.y + h / 2 };
    const { wMax, wMin } = limits();
    const w = clampN(c.w / factor, wMin, wMax);
    const k = w / c.w;
    moveCam({ w, x: at.x - (at.x - c.x) * k, y: at.y - (at.y - c.y) * k }, animate);
  }, [limits, moveCam]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let first = true;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      const prevW = limits().wMax;
      aspect.current = width / height;
      if (first) {
        first = false;
        cam.current = homeCam();
      } else {
        // keep the same relative zoom when the container changes shape
        const rel = cam.current.w / prevW;
        const cx = cam.current.x + cam.current.w / 2;
        const w = limits().wMax * rel;
        cam.current = clampCam({ w, x: cx - w / 2, y: cam.current.y });
      }
      applyCam();
    });
    ro.observe(wrap);
    return () => { ro.disconnect(); camTween.current?.kill(); };
  }, [applyCam, clampCam, homeCam, limits]);

  // Pointer: drag to pan (when there is room), pinch to zoom, ctrl/⌘ + wheel to zoom.
  const dragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { cam: Cam; x: number; y: number; dist: number; mid: { x: number; y: number } } | null = null;
    let active = false;
    const snapshot = () => {
      const list = [...pts.values()];
      const mid = list.length > 1 ? { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 } : list[0];
      const dist = list.length > 1 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0;
      start = { cam: { ...cam.current }, x: mid.x, y: mid.y, dist, mid };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragged.current = false;
      snapshot();
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = svg.getBoundingClientRect();
      const list = [...pts.values()];
      if (list.length > 1) {
        const dist = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
        if (!start.dist) { snapshot(); return; }
        const factor = dist / start.dist;
        const { wMax, wMin } = limits();
        const w = clampN(start.cam.w / factor, wMin, wMax);
        const at = { x: start.cam.x + ((start.mid.x - r.left) / r.width) * start.cam.w, y: start.cam.y + ((start.mid.y - r.top) / r.height) * (start.cam.w / aspect.current) };
        const k = w / start.cam.w;
        const mid = { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 };
        const panX = ((mid.x - start.mid.x) / r.width) * w;
        const panY = ((mid.y - start.mid.y) / r.height) * (w / aspect.current);
        camTween.current?.kill();
        cam.current = clampCam({ w, x: at.x - (at.x - start.cam.x) * k - panX, y: at.y - (at.y - start.cam.y) * k - panY });
        applyCam();
        dragged.current = true;
        if (!active) { active = true; setDragging(true); }
        e.preventDefault();
        return;
      }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const c = cam.current;
      const canPan = c.w < SCENE.w - 1 || c.w / aspect.current < SCENE.h - 1;
      if (!canPan) return;
      if (!active && Math.hypot(dx, dy) < 6) return;
      if (!active) {
        active = true;
        setDragging(true);
        try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      dragged.current = true;
      camTween.current?.kill();
      cam.current = clampCam({ w: start.cam.w, x: start.cam.x - (dx / r.width) * start.cam.w, y: start.cam.y - (dy / r.height) * (start.cam.w / aspect.current) });
      applyCam();
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size) { snapshot(); return; }
      start = null;
      if (active) { active = false; setDragging(false); }
    };
    // Swallow the click that ends a drag so it doesn't open a profile.
    const click = (e: MouseEvent) => {
      if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; }
    };
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0045), toWorld(e.clientX, e.clientY), false);
    };
    svg.addEventListener("pointerdown", down);
    svg.addEventListener("pointermove", move, { passive: false });
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    svg.addEventListener("click", click, true);
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => {
      svg.removeEventListener("pointerdown", down);
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
      svg.removeEventListener("click", click, true);
      svg.removeEventListener("wheel", wheel);
    };
  }, [applyCam, clampCam, limits, toWorld, zoomAt]);

  // ── hover card: follows the character via direct style writes (no per-frame renders) ──
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardHover = useRef(false);
  useEffect(() => {
    if (!hovered) return;
    let raf = 0;
    let lastText = "";
    const tick = () => {
      const p = partsRef.current.get(hovered);
      const wrap = wrapRef.current;
      const card = cardRef.current;
      if (p?.halo && wrap && card && !cardHover.current) {
        // Fixed-position card (portalled to <body>) so it is never clipped by the scene.
        const feet = p.halo.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        const svgScale = w.width / (cam.current.w || SCENE.w);
        const cw = card.offsetWidth;
        const ch = card.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cx = feet.left + feet.width / 2;
        const headTop = feet.top - 90 * svgScale;
        const fitsAbove = headTop - ch - 10 > 8;
        const fitsBelow = feet.bottom + 24 * svgScale + ch + 10 < vh;
        let x = cx - cw / 2;
        let y: number;
        if (fitsAbove || !fitsBelow) y = headTop - ch - 10;
        else y = feet.bottom + 24 * svgScale + 10;
        if (!fitsAbove && !fitsBelow) {
          // not enough room vertically: sit beside the character instead
          y = Math.min(Math.max(8, feet.top - ch / 2 - 30 * svgScale), vh - ch - 8);
          x = cx + 24 * svgScale + cw < vw - 8 ? cx + 24 * svgScale : cx - 24 * svgScale - cw;
        }
        x = clampN(x, 8, vw - cw - 8);
        card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        card.style.visibility = feet.bottom < w.top || feet.top > w.bottom ? "hidden" : "visible";
      }
      const busy = !!byIdRef.current.get(hovered)?.current_task;
      const text = busy ? "" : director.activityOf(hovered) || dir.get(hovered).summary;
      if (text !== lastText && cardActivityRef.current) {
        lastText = text;
        cardActivityRef.current.textContent = text;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [hovered, director, dir]);

  const enter = (id: EmployeeId) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (hovered && hovered !== id) director.hover(hovered, false);
    director.hover(id, true);
    setHovered(id);
  };
  const leave = (id: EmployeeId, delay = 180) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (cardHover.current) return;
      director.hover(id, false);
      setHovered((h) => (h === id ? null : h));
    }, delay);
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const select = (id: EmployeeId) => {
    if (hovered) director.hover(hovered, false);
    setHovered(null);
    cardHover.current = false;
    onSelect(id);
  };

  const openDeskMenu = (id: EmployeeId, e: React.MouseEvent | React.KeyboardEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.getBoundingClientRect();
    let x: number;
    let y: number;
    if ("clientX" in e && e.clientX) { x = e.clientX - w.left; y = e.clientY - w.top; } else {
      const r = (e.currentTarget as Element).getBoundingClientRect();
      x = r.left + r.width / 2 - w.left;
      y = r.top + r.height / 2 - w.top;
    }
    setDeskMenu({ id, x, y });
  };

  const hoverMember = hovered ? byId.get(hovered) : undefined;
  const hoverStatus = hovered ? status(hovered) : "idle";

  // ── scene ─────────────────────────────────────────────────────────────────
  const zoomed = zoomInfo.canPan;
  return (
    <div
      ref={wrapRef}
      className={cn("office-scene relative isolate aspect-square overflow-hidden bg-[var(--office-floor)] sm:aspect-[1440/860]", className)}
      data-zoomed={zoomInfo.canPanY}
      data-dragging={dragging}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SCENE.w} ${SCENE.h}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 block size-full select-none"
        role="group"
        aria-label="Live office: what each AI employee is doing right now"
      >
        <SceneDefs />
        <Floor />
        <Wall dark={dark} counts={counts} working={counts.doing} onWhiteboard={() => navigate(`/sites/${siteId}/board`)} />
        <GlassOfficeBack />

        <g ref={depthRef}>
          <OfficeDesks status={status} dark={dark} nameOf={(id) => dir.name(id)} onDesk={openDeskMenu} onTerminal={select} />
          <OfficeDecor
            dark={dark}
            onCoffee={() => {
              const who = director.coffeeBreak();
              toast(who ? `${dir.name(who)} is grabbing a coffee ☕` : "Everyone's busy — no coffee break right now.");
            }}
            onFoosball={() => {
              const who = director.foosball();
              toast(who.length ? `${dir.name(who[0])} vs ${dir.name(who[1])} — foosball time ⚽` : "Not enough people free for a game right now.");
            }}
          />

          {EMPLOYEE_IDS.map((id) => (
            <g
              key={id}
              data-agent={id}
              tabIndex={0}
              role="button"
              aria-label={`${dir.name(id)}, ${dir.title(id)} — ${STATUS_META[status(id)].label}${byId.get(id)?.current_task ? `: ${byId.get(id)!.current_task!.title}` : ""}. Press Enter to open profile.`}
              onPointerEnter={(e) => e.pointerType === "mouse" && enter(id)}
              onPointerLeave={(e) => e.pointerType === "mouse" && leave(id)}
              onFocus={() => enter(id)}
              onBlur={() => leave(id, 0)}
              onClick={() => select(id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(id); } }}
            >
              <Character id={id} persona={persona(id)} robot={id === "compliance"} onParts={partHandlers[id].body} />
            </g>
          ))}
        </g>
        <g ref={fxRef} pointerEvents="none" />
        <g pointerEvents="none" className="office-bubbles">
          {EMPLOYEE_IDS.map((id) => <Overlay key={id} name={dir.name(id)} color={persona(id).from} status={status(id)} showName={showNames} onParts={partHandlers[id].bubble} />)}
        </g>
        {debug && (
          <g pointerEvents="none" opacity="0.7">
            {WALKWAYS.map(([a, b], i) => <line key={i} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="#e11d48" strokeWidth="1.5" />)}
            {Object.entries(NODES).map(([k, p]) => <g key={k}><circle cx={p.x} cy={p.y} r="3" fill="#e11d48" /><text x={p.x + 4} y={p.y - 4} fontSize="7" fill="#e11d48">{k}</text></g>)}
          </g>
        )}
      </svg>

      {/* zoom controls */}
      <div className="absolute right-2.5 bottom-2.5 z-10 flex flex-col overflow-hidden rounded-lg border bg-background/95 shadow-sm">
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-none" aria-label="Zoom in" disabled={zoomInfo.atMax} onClick={() => zoomAt(1.4)}><Plus /></Button>
        </TooltipTrigger><TooltipContent side="left">Zoom in <span className="text-muted-foreground">(⌘/Ctrl + scroll)</span></TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-none border-t" aria-label="Zoom out" disabled={zoomInfo.atMin} onClick={() => zoomAt(1 / 1.4)}><Minus /></Button>
        </TooltipTrigger><TooltipContent side="left">Zoom out</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-none border-t" aria-label="Reset view" disabled={zoomInfo.atMin && !zoomed} onClick={() => moveCam(homeCam())}><RotateCcw /></Button>
        </TooltipTrigger><TooltipContent side="left">Reset view</TooltipContent></Tooltip>
      </div>
      {zoomed && (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 rounded-md border bg-background/95 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
          Drag to look around
        </div>
      )}

      {/* hover card */}
      {hovered && createPortal(
        <div
          ref={cardRef}
          className="fixed top-0 left-0 z-50 w-64 will-change-transform"
          style={{ visibility: "hidden" }}
          onPointerEnter={() => { cardHover.current = true; if (closeTimer.current) clearTimeout(closeTimer.current); }}
          onPointerLeave={() => { cardHover.current = false; leave(hovered); }}
        >
          <div className="grid gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5">
              <EmployeeAvatar actor={hovered} size="md" status={hoverStatus} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{dir.name(hovered)}</div>
                <div className="truncate text-xs text-muted-foreground">{dir.title(hovered)}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="gap-1.5 px-1.5 text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", STATUS_META[hoverStatus].dot)} />{STATUS_META[hoverStatus].label}
              </Badge>
              {hoverMember && (
                <span className="text-xs text-muted-foreground">
                  <b className="font-medium text-foreground tabular-nums">{hoverMember.counts.done}</b> done · <b className="font-medium text-foreground tabular-nums">{hoverMember.counts.todo + hoverMember.counts.in_progress}</b> open · <b className="font-medium text-foreground tabular-nums">{hoverMember.memories}</b> memories
                </span>
              )}
            </div>
            {hoverMember?.current_task ? (
              <button
                type="button"
                onClick={() => onOpenTask(hoverMember.current_task!.id)}
                className={cn("rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:bg-muted", hoverStatus === "blocked" && "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10")}
              >
                <div className="text-[11px] text-muted-foreground">{hoverStatus === "blocked" ? "Needs your answer on" : "Working on"}</div>
                <div className="line-clamp-2 text-xs leading-snug font-medium">{hoverMember.current_task.title}</div>
              </button>
            ) : null}
            <p ref={cardActivityRef} className="line-clamp-2 text-xs text-muted-foreground empty:hidden" />
            <div className="flex gap-1.5">
              <Button size="xs" variant="outline" className="flex-1" onClick={() => select(hovered)}><UserRound /> Profile</Button>
              {ASSIGNABLE_IDS.includes(hovered) && (
                <Button size="xs" className="flex-1" onClick={() => { const id = hovered; setHovered(null); director.hover(id, false); cardHover.current = false; onAssign(id); }}><ClipboardList /> Assign task</Button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* desk quick menu */}
      <Popover open={!!deskMenu} onOpenChange={(o) => !o && setDeskMenu(null)}>
        <PopoverAnchor asChild>
          <div className="pointer-events-none absolute size-px" style={{ left: deskMenu?.x ?? 0, top: deskMenu?.y ?? 0 }} />
        </PopoverAnchor>
        {deskMenu && (
          <PopoverContent side="top" className="w-64" onOpenAutoFocus={(e) => e.preventDefault()} onFocusOutside={(e) => e.preventDefault()}>
            <div className="flex items-center gap-2.5">
              <EmployeeAvatar actor={deskMenu.id} size="sm" status={status(deskMenu.id)} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{dir.name(deskMenu.id)}'s desk</div>
                <div className="truncate text-xs text-muted-foreground">{dir.title(deskMenu.id)} · {STATUS_META[status(deskMenu.id)].label}</div>
              </div>
            </div>
            <div className="grid gap-1">
              {ASSIGNABLE_IDS.includes(deskMenu.id) && (
                <Button size="sm" className="justify-start" onClick={() => { const id = deskMenu.id; setDeskMenu(null); onAssign(id); }}>
                  <ClipboardList /> Assign a task to {dir.name(deskMenu.id)}
                </Button>
              )}
              {byId.get(deskMenu.id)?.current_task && (
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => { const t = byId.get(deskMenu.id)!.current_task!; setDeskMenu(null); onOpenTask(t.id); }}>
                  <ExternalLink /> Open current task
                </Button>
              )}
              <Button size="sm" variant="ghost" className="justify-start" onClick={() => { const id = deskMenu.id; setDeskMenu(null); onSelect(id); }}>
                <UserRound /> View profile
              </Button>
            </div>
          </PopoverContent>
        )}
      </Popover>
    </div>
  );
}
