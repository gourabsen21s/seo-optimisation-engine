import { gsap, prefersReducedMotion } from "@/lib/gsap";
import type { EmployeeId } from "@/lib/types";
import type { CharacterParts } from "./Character";
import { DESKS, findPath, JEV_SPOTS, MEETING, MEETING_SEATS, NODES, nearestNode, type Pt, type Spot, SPOTS } from "./layout";

/**
 * The office director: an imperative behaviour engine that animates each employee with GSAP.
 * React renders the static scene once; the director moves characters, poses them and shows bubbles
 * based on live team status (working / blocked / idle) without re-rendering.
 */
export type Mode = "work" | "blocked" | "roam" | "meet";
export type Desired = { mode: Mode; text?: string };
type Tone = "default" | "warn" | "brand" | "success";

const SPEED = 110; // scene units per second
const SIT = 4; // how far the body drops when seated at a desk
const LOUNGE_SIT = 9;
const BUBBLE_H = 22;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const clip = (t: string, n = 24) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

const TONES: Record<Tone, { fill: string; stroke: string; text: string }> = {
  default: { fill: "var(--color-card)", stroke: "var(--color-border)", text: "var(--color-foreground)" },
  warn: { fill: "#fef3c7", stroke: "#f59e0b", text: "#92400e" },
  brand: { fill: "color-mix(in oklch, var(--color-primary) 10%, var(--color-card))", stroke: "color-mix(in oklch, var(--color-primary) 55%, var(--color-border))", text: "var(--color-foreground)" },
  success: { fill: "#dcfce7", stroke: "#22c55e", text: "#166534" },
};

class Agent {
  id: EmployeeId;
  parts: CharacterParts;
  director: OfficeDirector;
  pos: Pt;
  node: string;
  desired: Desired = { mode: "roam" };
  activity = "Arriving";
  seated = false;
  bubbleOn = false;
  bubbleW = 0;
  lift = { v: 0 };
  private liftTarget = 0;
  private gen = 0;
  private live = new Set<gsap.core.Animation>();
  private walkTl: gsap.core.Timeline;
  private poseTl: gsap.core.Timeline | null = null;
  private idleTl: gsap.core.Tween | null = null;
  private blinkCall: gsap.core.Tween | null = null;
  private compactCall: gsap.core.Tween | null = null;
  private sayCall: gsap.core.Tween | null = null;
  private ringTl: gsap.core.Timeline | null = null;
  private disposed = false;
  private hovered = false;
  private reduced: boolean;
  private headOffset: number;

  constructor(id: EmployeeId, parts: CharacterParts, director: OfficeDirector, start: string) {
    this.id = id;
    this.parts = parts;
    this.director = director;
    this.reduced = director.reduced;
    this.headOffset = id === "compliance" ? 86 : 76;
    this.node = start;
    this.pos = { ...NODES[start] };
    gsap.set(parts.root, { x: this.pos.x, y: this.pos.y });
    gsap.set([parts.legL, parts.legR], { transformOrigin: "50% 0%" });
    gsap.set([parts.armL, parts.armR], { transformOrigin: "50% 8%" });
    gsap.set(parts.eyes, { transformOrigin: "50% 50%" });
    gsap.set(parts.breath, { transformOrigin: "50% 100%" });
    gsap.set(parts.bubbleInner, { transformOrigin: "50% 100%", scale: 0.6, autoAlpha: 0 });
    gsap.set([parts.bubble, parts.tag], { visibility: "visible" });
    parts.tag.setAttribute("transform", `translate(${this.pos.x} ${this.pos.y})`);
    gsap.set([parts.halo, parts.ring], { transformOrigin: "50% 50%" });
    this.walkTl = gsap.timeline({ paused: true, repeat: -1, defaults: { ease: "sine.inOut", duration: 0.21 } })
      .to(parts.legL, { rotation: 26 }, 0).to(parts.legR, { rotation: -26 }, 0)
      .to(parts.armL, { rotation: -22 }, 0).to(parts.armR, { rotation: 22 }, 0)
      .to(parts.body, { y: -2, duration: 0.105, yoyo: true, repeat: 1, ease: "sine.out" }, 0)
      .to(parts.legL, { rotation: -26 }, 0.21).to(parts.legR, { rotation: 26 }, 0.21)
      .to(parts.armL, { rotation: 22 }, 0.21).to(parts.armR, { rotation: -22 }, 0.21)
      .to(parts.body, { y: -2, duration: 0.105, yoyo: true, repeat: 1, ease: "sine.out" }, 0.21);
    if (!this.reduced) {
      this.idleTl = gsap.to(parts.breath, { scaleY: 1.03, scaleX: 0.99, duration: rand(1.5, 2.1), ease: "sine.inOut", yoyo: true, repeat: -1, delay: rand(0, 1) });
      this.scheduleBlink();
    }
    void this.run();
  }

  // ── primitives ────────────────────────────────────────────────────────────
  // Every wait registers its resolver in `pending`, so interrupt() can always release the behaviour loop.
  private pending = new Set<() => void>();
  private waitFor(start: (done: () => void) => gsap.core.Animation | null) {
    return new Promise<void>((resolve) => {
      let anim: gsap.core.Animation | null = null;
      const done = () => {
        if (!this.pending.delete(done)) return;
        if (anim) this.live.delete(anim);
        resolve();
      };
      this.pending.add(done);
      anim = start(done);
      if (anim) this.live.add(anim);
    });
  }
  private tween(target: gsap.TweenTarget, vars: gsap.TweenVars) {
    return this.waitFor((done) => gsap.to(target, { ...vars, onComplete: done }));
  }
  private sleep(seconds: number) {
    return this.waitFor((done) => gsap.delayedCall(seconds, done));
  }
  private untilChanged() {
    return this.waitFor(() => null);
  }
  private scheduleBlink() {
    this.blinkCall = gsap.delayedCall(rand(2.5, 6), () => {
      if (this.disposed) return;
      gsap.to(this.parts.eyes, { scaleY: 0.1, duration: 0.07, yoyo: true, repeat: Math.random() < 0.2 ? 3 : 1 });
      this.scheduleBlink();
    });
  }
  private face(dir: 1 | -1) {
    gsap.to(this.parts.flip, { scaleX: dir, duration: this.reduced ? 0 : 0.15, transformOrigin: "50% 50%" });
  }
  private setBody(y: number, legs = 1) {
    const d = this.reduced ? 0 : 0.3;
    gsap.to(this.parts.body, { y, duration: d, ease: "power2.out" });
    gsap.to([this.parts.legL, this.parts.legR], { scaleY: legs, duration: d });
  }
  private resetPose() {
    this.poseTl?.kill();
    this.poseTl = null;
    const d = this.reduced ? 0 : 0.25;
    gsap.to([this.parts.armL, this.parts.armR, this.parts.legL, this.parts.legR], { rotation: 0, duration: d });
    gsap.to(this.parts.prop, { opacity: 0, duration: d });
  }
  private pose(tl: gsap.core.Timeline) {
    this.poseTl?.kill();
    if (this.reduced) {
      tl.progress(0.5).pause();
    }
    this.poseTl = tl;
  }

  /** Current vertical body offset (seated / bobbing). */
  bodyY() {
    return Number(gsap.getProperty(this.parts.body, "y")) || 0;
  }

  bubble(text: string | null, tone: Tone = "default") {
    const { bubbleInner, bubbleBg, bubbleText, bubbleTail } = this.parts;
    this.compactCall?.kill();
    this.compactCall = null;
    if (!text) {
      if (!this.bubbleOn) return;
      this.bubbleOn = false;
      gsap.to(bubbleInner, { autoAlpha: 0, scale: 0.6, duration: this.reduced ? 0 : 0.2 });
      return;
    }
    bubbleText.textContent = clip(text);
    let w = text.length * 5.6;
    try { w = bubbleText.getComputedTextLength(); } catch { /* not rendered yet */ }
    const bw = Math.max(BUBBLE_H + 2, w + 18);
    this.bubbleW = bw;
    bubbleBg.setAttribute("x", String(-bw / 2));
    bubbleBg.setAttribute("width", String(bw));
    const t = TONES[tone];
    for (const el of [bubbleBg, bubbleTail]) {
      el.setAttribute("fill", t.fill);
      el.setAttribute("stroke", t.stroke);
    }
    bubbleText.setAttribute("fill", t.text);
    const was = this.bubbleOn;
    this.bubbleOn = true;
    this.director.requestLayout();
    if (this.reduced) gsap.set(bubbleInner, { autoAlpha: 1, scale: 1 });
    else if (was) gsap.fromTo(bubbleInner, { scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 0.25, ease: "back.out(2)" });
    else gsap.fromTo(bubbleInner, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "back.out(2.4)" });
  }

  /** Show a message, then collapse to a short icon after a while (keeps the room readable). */
  private bubbleThenCompact(text: string, compact: string, tone: Tone, after = 6) {
    this.bubble(text, tone);
    this.compactCall = gsap.delayedCall(after, () => {
      if (!this.disposed && this.bubbleOn) this.bubble(compact, tone);
    });
  }

  /** Called every frame by the director's ticker: pin the bubble above the head. */
  private tagAt = "";
  follow() {
    const at = `translate(${this.pos.x.toFixed(1)} ${this.pos.y.toFixed(1)})`;
    if (at !== this.tagAt) { this.tagAt = at; this.parts.tag.setAttribute("transform", at); }
    if (!this.bubbleOn && Number(gsap.getProperty(this.parts.bubbleInner, "autoAlpha")) === 0) return;
    const y = this.pos.y + this.bodyY() - this.headOffset - this.lift.v;
    this.parts.bubble.setAttribute("transform", `translate(${this.pos.x.toFixed(1)} ${y.toFixed(1)})`);
  }

  setLift(v: number) {
    if (v === this.liftTarget) return;
    this.liftTarget = v;
    gsap.to(this.lift, { v, duration: this.reduced ? 0 : 0.3, ease: "power2.out" });
  }
  bubbleBox() {
    const y = this.pos.y + this.bodyY() - this.headOffset;
    return { x1: this.pos.x - this.bubbleW / 2 - 3, x2: this.pos.x + this.bubbleW / 2 + 3, y };
  }

  private async walkTo(target: Pt, targetNode: string | null, gen: number) {
    const from = nearestNode(this.pos);
    const to = targetNode ?? nearestNode(target);
    const path = [...findPath(from, to)];
    if (!targetNode || NODES[targetNode].x !== target.x || NODES[targetNode].y !== target.y) path.push(target);
    if (this.reduced) {
      const end = path[path.length - 1];
      this.pos = { ...end };
      gsap.set(this.parts.root, { x: end.x, y: end.y });
      if (targetNode && gen === this.gen) this.node = targetNode;
      return;
    }
    this.walkTl.play();
    for (const p of path) {
      if (gen !== this.gen || this.disposed) break;
      const d = Math.hypot(p.x - this.pos.x, p.y - this.pos.y);
      if (d < 1) continue;
      if (Math.abs(p.x - this.pos.x) > 2) this.face(p.x > this.pos.x ? 1 : -1);
      await this.tween(this.parts.root, {
        x: p.x, y: p.y, duration: d / SPEED, ease: "none",
        onUpdate: () => {
          this.pos.x = Number(gsap.getProperty(this.parts.root, "x"));
          this.pos.y = Number(gsap.getProperty(this.parts.root, "y"));
        },
      });
    }
    this.walkTl.pause();
    gsap.to([this.parts.legL, this.parts.legR, this.parts.armL, this.parts.armR], { rotation: 0, duration: 0.2 });
    gsap.to(this.parts.body, { y: 0, duration: 0.2 });
    if (targetNode && gen === this.gen) this.node = targetNode;
  }

  // ── behaviours ────────────────────────────────────────────────────────────
  private async goToDesk(gen: number) {
    const desk = DESKS[this.id];
    if (this.seated) return;
    this.activity = "Heading to the desk";
    await this.walkTo(NODES[desk.approach], desk.approach, gen);
    if (gen !== this.gen) return;
    await this.walkTo(desk.seat, null, gen);
    if (gen !== this.gen) return;
    this.face(1);
    this.seated = true;
    this.setBody(SIT);
  }

  private sitWork(d: Desired) {
    this.resetPose();
    this.setBody(SIT);
    const p = this.parts;
    if (d.mode === "blocked") {
      this.activity = "Waiting on you";
      this.bubble("? Waiting on you", "warn");
      this.pose(gsap.timeline({ repeat: -1, repeatDelay: 1.6 })
        .to(p.armR, { rotation: -150, duration: 0.3 })
        .to(p.armR, { rotation: -128, duration: 0.18, yoyo: true, repeat: 3 })
        .to(p.armR, { rotation: 0, duration: 0.3 }));
    } else {
      this.activity = d.text ? `Working on: ${d.text}` : "Working";
      const icon = this.id === "compliance" ? "🛡️" : this.id === "engineer" ? "🧑‍💻" : this.id === "writer" ? "✍️" : "⌨️";
      this.bubbleThenCompact(d.text ? `${icon} ${d.text}` : `${icon} Working…`, icon, "brand");
      this.pose(gsap.timeline({ repeat: -1 })
        .to(p.armR, { rotation: -26, duration: 0.11, yoyo: true, repeat: 1, ease: "sine.inOut" })
        .to(p.armL, { rotation: 26, duration: 0.11, yoyo: true, repeat: 1, ease: "sine.inOut" }, "-=0.08")
        .to(p.armR, { rotation: -20, duration: 0.1, yoyo: true, repeat: 1 }, "+=0.02")
        .to({}, { duration: rand(0.15, 0.7) }));
    }
  }

  private standUp() {
    this.seated = false;
    this.bubble(null);
    this.resetPose();
    this.setBody(0);
  }

  private async perform(spot: Spot, gen: number) {
    this.face(spot.face);
    this.activity = spot.label;
    this.bubble(spot.emoji);
    const p = this.parts;
    switch (spot.kind) {
      case "coffee":
      case "water":
        gsap.to(p.prop, { opacity: 1, duration: 0.2 });
        this.pose(gsap.timeline({ repeat: -1, repeatDelay: 1.2 }).to(p.armR, { rotation: -115, duration: 0.45 }).to(p.armR, { rotation: -20, duration: 0.45, delay: 0.8 }));
        break;
      case "read":
        this.pose(gsap.timeline().to([p.armR, p.armL], { rotation: (i) => (i ? 60 : -60), duration: 0.4 }));
        break;
      case "armchair":
      case "sofa":
        this.setBody(LOUNGE_SIT, 0.55);
        this.pose(spot.kind === "armchair"
          ? gsap.timeline().to([p.armR, p.armL], { rotation: (i) => (i ? 55 : -55), duration: 0.4 })
          : gsap.timeline({ repeat: -1, yoyo: true, repeatDelay: 2 }).to(p.armR, { rotation: -70, duration: 0.5 }));
        break;
      case "plant":
        this.pose(gsap.timeline({ repeat: -1, yoyo: true }).to(p.armR, { rotation: -60, duration: 0.8 }));
        break;
      case "stretch":
        this.pose(gsap.timeline({ repeat: 3, yoyo: true }).to([p.armL, p.armR], { rotation: (i) => (i ? -165 : 165), duration: 0.6 }).to(p.breath, { scaleY: 1.06, duration: 0.6 }, 0));
        break;
      case "foosball":
        this.pose(gsap.timeline({ repeat: -1, yoyo: true }).to([p.armR, p.armL], { rotation: (i) => (i ? 35 : -40), duration: 0.18, ease: "power1.inOut" }).to(p.body, { y: -1.5, duration: 0.18 }, 0));
        break;
      case "scan":
      case "deploy":
        this.pose(gsap.timeline({ repeat: -1, yoyo: true }).to(p.armR, { rotation: -80, duration: 0.6 }).to(p.eyes, { scaleY: 0.5, duration: 0.3 }, 0));
        break;
      default:
        this.pose(gsap.timeline({ repeat: -1, yoyo: true }).to(p.body, { y: -1, duration: 1.2 }));
    }
    await this.sleep(this.reduced ? rand(25, 45) : rand(5, 10));
    if (gen !== this.gen) return;
    this.bubble(null);
    this.resetPose();
    this.setBody(0);
    await this.sleep(rand(0.4, 1.4));
  }

  private async visitColleague(gen: number): Promise<boolean> {
    const host = this.director.randomWorkingColleague(this.id);
    if (!host) return false;
    const desk = DESKS[host.id];
    this.activity = `Chatting with ${this.director.nameOf(host.id)}`;
    const target = desk.kind === "manager" ? "mgr_visit" : desk.approach;
    await this.walkTo(NODES[target], target, gen);
    if (gen !== this.gen) return true;
    this.face(desk.seat.x >= this.pos.x ? 1 : -1);
    this.bubble("💬");
    this.pose(gsap.timeline({ repeat: -1, yoyo: true }).to(this.parts.armR, { rotation: -45, duration: 0.5 }));
    await this.sleep(rand(3.5, 6));
    this.bubble(null);
    this.resetPose();
    return true;
  }

  private async run() {
    await this.sleep(rand(0.2, 2.2));
    while (!this.disposed) {
      const gen = this.gen;
      const d = this.desired;
      if (d.mode === "work" || d.mode === "blocked") {
        await this.goToDesk(gen);
        if (gen !== this.gen) continue;
        this.sitWork(d);
        await this.untilChanged();
        this.standUp();
        continue;
      }
      if (this.seated) this.standUp();
      if (d.mode === "meet") {
        const isHost = this.id === "manager";
        const seat = isHost ? "meet_head" : this.director.meetingSeat(this.id);
        this.activity = isHost ? "Leading the planning meeting" : "In the planning meeting";
        await this.walkTo(NODES[seat], seat, gen);
        if (gen !== this.gen) continue;
        this.face(NODES[seat].x > MEETING.x ? -1 : 1);
        if (seat.startsWith("meet_n")) this.setBody(SIT + 12);
        if (isHost) this.bubbleThenCompact(d.text ? `📋 ${d.text}` : "📋 Planning", "📋", "brand", 8);
        else this.bubbleThenCompact("💬", "💬", "default", 3 + Math.random() * 3);
        this.pose(gsap.timeline({ repeat: -1, yoyo: true, repeatDelay: rand(0.5, 2) }).to(this.parts.armR, { rotation: -50, duration: 0.5 }));
        await this.untilChanged();
        this.bubble(null);
        this.resetPose();
        this.setBody(0);
        continue;
      }
      // roam
      if (this.id !== "compliance" && !this.director.hasForced(this.id) && Math.random() < 0.2 && (await this.visitColleague(gen))) continue;
      const spot = this.director.claimSpot(this.id);
      this.activity = spot.label;
      const target = spot.offset ? { x: NODES[spot.node].x + spot.offset.x, y: NODES[spot.node].y + spot.offset.y } : NODES[spot.node];
      await this.walkTo(target, spot.node, gen);
      if (gen === this.gen) await this.perform(spot, gen);
      this.director.releaseSpot(this.id);
    }
  }

  // ── control ───────────────────────────────────────────────────────────────
  setDesired(d: Desired) {
    const prev = this.desired;
    this.desired = d;
    if (prev.mode === d.mode) {
      if ((d.mode === "work" || d.mode === "blocked") && d.text !== prev.text && this.seated) this.sitWork(d);
      return;
    }
    this.interrupt();
  }

  interrupt() {
    this.gen++;
    for (const a of this.live) a.kill();
    this.live.clear();
    this.walkTl.pause();
    for (const release of [...this.pending]) release();
  }

  setHovered(on: boolean) {
    if (on === this.hovered) return;
    this.hovered = on;
    gsap.to(this.parts.halo, { opacity: on ? 0.28 : 0, scale: on ? 1 : 0.7, duration: 0.2 });
    if (on && !this.reduced && !this.walkTl.isActive()) {
      const base = this.bodyY();
      gsap.fromTo(this.parts.body, { y: base }, { y: base - 5, duration: 0.16, yoyo: true, repeat: 1, ease: "power2.out", onComplete: () => { gsap.set(this.parts.body, { y: base }); } });
    }
  }

  spotlight(on: boolean) {
    this.ringTl?.kill();
    this.ringTl = null;
    if (!on) {
      gsap.to(this.parts.ring, { opacity: 0, duration: 0.2 });
      return;
    }
    if (this.reduced) {
      gsap.set(this.parts.ring, { opacity: 1, scale: 1 });
      return;
    }
    this.ringTl = gsap.timeline({ repeat: -1 }).fromTo(this.parts.ring, { opacity: 1, scale: 0.9 }, { opacity: 0, scale: 1.45, duration: 1.1, ease: "power1.out" });
    const base = this.bodyY();
    if (!this.walkTl.isActive()) gsap.fromTo(this.parts.body, { y: base }, { y: base - 6, duration: 0.18, yoyo: true, repeat: 3, ease: "power2.out", onComplete: () => { gsap.set(this.parts.body, { y: base }); } });
  }

  say(text: string, tone: Tone, seconds: number) {
    this.sayCall?.kill();
    const restore = this.seated && (this.desired.mode === "work" || this.desired.mode === "blocked") ? this.desired : null;
    this.bubble(text, tone);
    this.sayCall = gsap.delayedCall(seconds, () => {
      if (this.disposed) return;
      if (restore && this.seated) this.bubble(restore.mode === "blocked" ? "? Waiting on you" : "⌨️", restore.mode === "blocked" ? "warn" : "brand");
      else if (!this.seated) this.bubble(null);
    });
  }

  celebrate() {
    this.director.burst(this.pos, "#10b981");
    this.say("✅ Done!", "success", 2.4);
    if (!this.reduced) gsap.fromTo(this.parts.body, { y: this.bodyY() }, { y: this.bodyY() - 10, duration: 0.2, yoyo: true, repeat: 3, ease: "power2.out" });
  }

  dispose() {
    this.disposed = true;
    this.interrupt();
    this.walkTl.kill();
    this.poseTl?.kill();
    this.idleTl?.kill();
    this.blinkCall?.kill();
    this.compactCall?.kill();
    this.sayCall?.kill();
    this.ringTl?.kill();
    gsap.killTweensOf([this.lift, ...Object.values(this.parts)]);
  }
}

export class OfficeDirector {
  agents = new Map<EmployeeId, Agent>();
  readonly reduced = prefersReducedMotion();
  private spots = new Map<EmployeeId, Spot>();
  private meetingSeats = new Map<EmployeeId, string>();
  private forced = new Map<EmployeeId, Spot>();
  private depthLayer: SVGGElement | null = null;
  private fxLayer: SVGGElement | null = null;
  private sortTimer: ReturnType<typeof setInterval> | null = null;
  private ticker = () => { for (const a of this.agents.values()) a.follow(); };
  private layoutDirty = true;
  private names: (id: EmployeeId) => string;
  private fx = new Set<gsap.core.Animation>();

  /** `atDesks`: everyone starts at their desk's approach node instead of somewhere on the floor. */
  private atDesks: boolean;

  constructor(names: (id: EmployeeId) => string, opts: { atDesks?: boolean } = {}) {
    this.names = names;
    this.atDesks = !!opts.atDesks;
  }

  nameOf(id: EmployeeId) { return this.names(id); }

  attach(depthLayer: SVGGElement, fxLayer: SVGGElement) {
    this.depthLayer = depthLayer;
    this.fxLayer = fxLayer;
    if (this.sortTimer) clearInterval(this.sortTimer);
    this.sortTimer = setInterval(() => { this.sortDepth(); this.layoutBubbles(); }, 140);
    gsap.ticker.add(this.ticker);
  }

  register(id: EmployeeId, parts: CharacterParts) {
    if (this.agents.has(id)) return;
    const d = DESKS[id];
    const start = this.atDesks ? d.approach : id === "compliance" ? "rack_mid" : d.kind === "manager" ? "mgr_in" : pick(["a_535_385", "a_705_385", "a_875_385", "a_535_578", "a_875_578", "lg_mid", "a_350_578", "lib_a", "a_1045_385"]);
    this.agents.set(id, new Agent(id, parts, this, start));
  }

  unregister(id: EmployeeId) {
    this.agents.get(id)?.dispose();
    this.agents.delete(id);
    this.spots.delete(id);
    this.meetingSeats.delete(id);
  }

  setDesired(id: EmployeeId, d: Desired) { this.agents.get(id)?.setDesired(d); }
  activityOf(id: EmployeeId) { return this.agents.get(id)?.activity ?? ""; }
  hover(id: EmployeeId, on: boolean) { this.agents.get(id)?.setHovered(on); }
  spotlight(id: EmployeeId | null) { for (const a of this.agents.values()) a.spotlight(a.id === id); }
  celebrate(id: EmployeeId) { this.agents.get(id)?.celebrate(); }
  requestLayout() { this.layoutDirty = true; }

  randomWorkingColleague(except: EmployeeId) {
    const hosts = [...this.agents.values()].filter((a) => a.id !== except && a.seated && a.id !== "compliance" && a.desired.mode === "work");
    return hosts.length ? pick(hosts) : null;
  }

  hasForced(id: EmployeeId) { return this.forced.has(id); }

  private idleAgents() {
    return [...this.agents.values()].filter((a) => a.desired.mode === "roam" && !a.seated && a.id !== "compliance" && !this.forced.has(a.id));
  }

  /** Easter egg: send an idle employee for a coffee. Returns who went. */
  coffeeBreak(): EmployeeId | null {
    const idle = this.idleAgents();
    if (!idle.length) return null;
    const a = pick(idle);
    this.releaseSpot(a.id);
    this.forced.set(a.id, SPOTS.find((s) => s.kind === "coffee")!);
    a.interrupt();
    return a.id;
  }

  /** Easter egg: two idle employees play a round of foosball. */
  foosball(): EmployeeId[] {
    const idle = this.idleAgents().sort(() => Math.random() - 0.5).slice(0, 2);
    if (idle.length < 2) return [];
    const tables = SPOTS.filter((s) => s.kind === "foosball");
    // Anyone already at the table steps aside.
    for (const [id, s] of this.spots) if (s.kind === "foosball" && !idle.some((a) => a.id === id)) { this.spots.delete(id); this.agents.get(id)?.interrupt(); }
    idle.forEach((a, i) => { this.releaseSpot(a.id); this.forced.set(a.id, tables[i]); a.interrupt(); });
    return idle.map((a) => a.id);
  }

  say(id: EmployeeId, text: string, seconds = 2.5) {
    this.agents.get(id)?.say(text, "brand", seconds);
  }

  claimSpot(id: EmployeeId): Spot {
    const forced = this.forced.get(id);
    if (forced) {
      this.forced.delete(id);
      this.spots.set(id, forced);
      return forced;
    }
    const pool = id === "compliance" ? JEV_SPOTS : SPOTS;
    const taken = new Set([...this.spots.entries()].filter(([k]) => k !== id).map(([, s]) => s.node));
    for (const s of this.forced.values()) taken.add(s.node);
    const prev = this.spots.get(id);
    const free = pool.filter((s) => !taken.has(s.node) && s !== prev);
    const spot = pick(free.length ? free : pool.filter((s) => !taken.has(s.node)).length ? pool.filter((s) => !taken.has(s.node)) : pool);
    this.spots.set(id, spot);
    return spot;
  }
  releaseSpot(id: EmployeeId) { this.spots.delete(id); }

  meetingSeat(id: EmployeeId) {
    const existing = this.meetingSeats.get(id);
    if (existing) return existing;
    const used = new Set(this.meetingSeats.values());
    const seat = MEETING_SEATS.find((s) => !used.has(s)) ?? "meet_s3";
    this.meetingSeats.set(id, seat);
    return seat;
  }
  endMeeting() { this.meetingSeats.clear(); }

  private track(a: gsap.core.Animation) {
    this.fx.add(a);
    a.eventCallback("onInterrupt", () => this.fx.delete(a));
    return a;
  }

  /** Paper plane from one employee to another (a task hand-off). */
  handoff(from: EmployeeId, to: EmployeeId) {
    const a = this.agents.get(from);
    const b = this.agents.get(to);
    if (!a || !b || !this.fxLayer) return;
    if (this.reduced) { b.say("📋 New task!", "brand", 2.5); return; }
    const ns = "http://www.w3.org/2000/svg";
    const plane = document.createElementNS(ns, "path");
    plane.setAttribute("d", "M-10 -5 L11 0 L-10 5 L-5 0Z");
    plane.setAttribute("fill", "#fff");
    plane.setAttribute("stroke", "var(--color-primary)");
    plane.setAttribute("stroke-width", "1.4");
    plane.setAttribute("stroke-linejoin", "round");
    const trail = document.createElementNS(ns, "path");
    trail.setAttribute("fill", "none");
    trail.setAttribute("stroke", "var(--color-primary)");
    trail.setAttribute("stroke-width", "1.5");
    trail.setAttribute("stroke-dasharray", "3 5");
    trail.setAttribute("stroke-linecap", "round");
    trail.setAttribute("opacity", "0.5");
    this.fxLayer.append(trail, plane);
    const p0 = { x: a.pos.x, y: a.pos.y - 70 };
    const p2 = { x: b.pos.x, y: b.pos.y - 70 };
    const p1 = { x: (p0.x + p2.x) / 2, y: Math.min(p0.y, p2.y) - 110 };
    const s = { t: 0 };
    const pts: string[] = [];
    a.say("📨 Sending a task", "brand", 1.8);
    const tw = gsap.to(s, {
      t: 1, duration: 1.7, ease: "power1.inOut",
      onUpdate: () => {
        const t = s.t;
        const x = (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
        const y = (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
        const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
        const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
        plane.setAttribute("transform", `translate(${x} ${y}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})`);
        pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
        trail.setAttribute("d", `M${pts.join(" L")}`);
      },
      onComplete: () => {
        this.fx.delete(tw);
        plane.remove();
        this.track(gsap.to(trail, { opacity: 0, duration: 0.6, onComplete: () => trail.remove() }));
        b.say("📋 New task!", "brand", 2.2);
      },
    });
    this.track(tw);
  }

  burst(at: Pt, color: string) {
    if (!this.fxLayer || this.reduced) return;
    const ns = "http://www.w3.org/2000/svg";
    const colors = [color, "#6c7cf0", "#f4b942", "#ec6b9a", "#2bb5a6", "#e07a5f"];
    for (let i = 0; i < 22; i++) {
      const c = document.createElementNS(ns, i % 3 ? "rect" : "circle");
      if (i % 3) { c.setAttribute("width", "4"); c.setAttribute("height", "7"); c.setAttribute("rx", "1"); } else c.setAttribute("r", "2.5");
      c.setAttribute("fill", colors[i % colors.length]);
      this.fxLayer.appendChild(c);
      const ang = (Math.PI * 2 * i) / 22 + rand(-0.2, 0.2);
      const r = rand(30, 70);
      this.track(gsap.timeline({ onComplete: () => c.remove() })
        .fromTo(c, { x: at.x, y: at.y - 60, rotation: 0, opacity: 1 }, { x: at.x + Math.cos(ang) * r, y: at.y - 70 + Math.sin(ang) * r * 0.7, rotation: rand(-300, 300), duration: 0.6, ease: "power3.out" })
        .to(c, { y: `+=${rand(40, 60)}`, opacity: 0, rotation: `+=${rand(-180, 180)}`, duration: 0.9, ease: "power1.in" }));
    }
  }

  /** Paint order by baseline so people pass in front of / behind furniture correctly. */
  private sortDepth() {
    const layer = this.depthLayer;
    if (!layer) return;
    const kids = Array.from(layer.children) as SVGGElement[];
    const baseline = (el: SVGGElement) => {
      const id = el.dataset.agent as EmployeeId | undefined;
      if (id) return this.agents.get(id)?.pos.y ?? 0;
      return Number(el.dataset.baseline ?? 0);
    };
    const sorted = [...kids].sort((a, b) => baseline(a) - baseline(b));
    if (!sorted.some((el, i) => el !== kids[i])) return;
    const focused = document.activeElement;
    const hadFocus = focused instanceof SVGElement && layer.contains(focused) ? focused : null;
    // Minimal moves: only nodes that are out of place get re-inserted (keeps focus stable elsewhere).
    for (let i = 0; i < sorted.length; i++) {
      const at = layer.children[i];
      if (at !== sorted[i]) layer.insertBefore(sorted[i], at ?? null);
    }
    if (hadFocus && document.activeElement !== hadFocus) hadFocus.focus({ preventScroll: true });
    this.layoutDirty = true;
  }

  /** Lift speech bubbles that would overlap each other. */
  private layoutBubbles() {
    const shown = [...this.agents.values()].filter((a) => a.bubbleOn);
    if (!shown.length) return;
    if (!this.layoutDirty && !shown.some((a) => !a.seated)) return;
    this.layoutDirty = false;
    const placed: { x1: number; x2: number; y1: number; y2: number }[] = [];
    shown.sort((a, b) => b.pos.y - a.pos.y);
    for (const a of shown) {
      const b = a.bubbleBox();
      let lift = 0;
      for (let k = 0; k < 4; k++) {
        const y2 = b.y - lift;
        const y1 = y2 - BUBBLE_H - 4;
        if (!placed.some((p) => p.x1 < b.x2 && b.x1 < p.x2 && p.y1 < y2 && y1 < p.y2)) break;
        lift += BUBBLE_H + 4;
      }
      placed.push({ x1: b.x1, x2: b.x2, y1: b.y - lift - BUBBLE_H - 4, y2: b.y - lift });
      a.setLift(lift);
    }
  }

  dispose() {
    if (this.sortTimer) clearInterval(this.sortTimer);
    this.sortTimer = null;
    gsap.ticker.remove(this.ticker);
    for (const a of this.agents.values()) a.dispose();
    this.agents.clear();
    for (const a of this.fx) a.kill();
    this.fx.clear();
    this.fxLayer?.replaceChildren();
    this.spots.clear();
    this.meetingSeats.clear();
    this.forced.clear();
  }
}
