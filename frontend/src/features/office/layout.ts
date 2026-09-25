import type { EmployeeId } from "@/lib/types";

/** Office scene coordinates (SVG viewBox units). */
export const SCENE = { w: 1440, h: 860 } as const;
/** Height of the back wall; the floor starts below it. */
export const WALL_H = 134;
export type Pt = { x: number; y: number };

// ── Desks ─────────────────────────────────────────────────────────────────────
// A desk is drawn with its front edge at `y`; the chair/seat sits behind it (smaller y) so the desk
// occludes the seated character's legs. `approach` is the walkway node used to reach the seat.
export type DeskKind = "desk" | "manager" | "dev" | "terminal";
export type DeskSpec = { id: EmployeeId; x: number; y: number; seat: Pt; approach: string; kind: DeskKind; team?: string };

const ROW1 = 300;
const ROW2 = 490;
const SEAT_BACK = 26; // seat sits this far behind the desk front
export const COLS = [450, 620, 790, 960] as const;

// The seat is offset left of the desk centre so the monitor (right side of the desk) never hides the person.
export const SEAT_DX: Record<DeskKind, number> = { desk: -14, manager: -18, dev: -30, terminal: -16 };
const desk = (id: EmployeeId, x: number, y: number, approach: string, kind: DeskKind = "desk", team?: string): DeskSpec => ({
  id, x, y, seat: { x: x + SEAT_DX[kind], y: y - SEAT_BACK }, approach, kind, team,
});

export const DESKS: Record<EmployeeId, DeskSpec> = {
  manager: desk("manager", 175, ROW1, "mgr_seat_app", "manager"),
  // Pod 1 — research & technical
  auditor: desk("auditor", COLS[0], ROW1, "d_450_1", "desk", "insights"),
  rank_analyst: desk("rank_analyst", COLS[1], ROW1, "d_620_1", "desk", "insights"),
  researcher: desk("researcher", COLS[2], ROW1, "d_790_1", "desk", "insights"),
  tech_seo: desk("tech_seo", COLS[3], ROW1, "d_960_1", "desk", "insights"),
  // Pod 2 — content & links
  strategist: desk("strategist", COLS[0], ROW2, "d_450_2", "desk", "content"),
  writer: desk("writer", COLS[1], ROW2, "d_620_2", "desk", "content"),
  onpage: desk("onpage", COLS[2], ROW2, "d_790_2", "desk", "content"),
  link_builder: desk("link_builder", COLS[3], ROW2, "d_960_2", "desk", "content"),
  // Engineering corner
  engineer: desk("engineer", 1330, ROW1, "ezra_app", "dev"),
  compliance: { id: "compliance", x: 1180, y: 384, seat: { x: 1180 + SEAT_DX.terminal, y: 358 }, approach: "jev_side", kind: "terminal" },
};

// ── Zones (floor areas, drawn under everything) ──────────────────────────────
export const ZONES = {
  manager: { x: 26, y: 146, w: 296, h: 272 },
  library: { x: 26, y: 452, w: 296, h: 392 },
  pod1: { x: 372, y: 226, w: 660, h: 96 },
  pod2: { x: 372, y: 416, w: 660, h: 96 },
  eng: { x: 1088, y: 146, w: 330, h: 290 },
  lounge: { x: 1088, y: 468, w: 330, h: 376 },
  meeting: { cx: 705, cy: 712, rx: 250, ry: 92 },
} as const;

// ── Walkway graph ─────────────────────────────────────────────────────────────
const V = [350, 535, 705, 875, 1045]; // vertical aisles (between desk columns)
const H = [195, 385, 578, 822]; // horizontal aisles

export const NODES: Record<string, Pt> = {};
const EDGES: [string, string][] = [];
const n = (id: string, x: number, y: number) => (NODES[id] = { x, y });
const e = (a: string, b: string) => EDGES.push([a, b]);
const A = (x: number, y: number) => `a_${x}_${y}`;

for (const x of V) for (const y of H) n(A(x, y), x, y);
for (const y of H) for (let i = 0; i < V.length - 1; i++) e(A(V[i], y), A(V[i + 1], y));
for (const x of V) for (let i = 0; i < H.length - 1; i++) {
  // The meeting table blocks the middle aisles between the bottom two rows.
  if (i === 2 && (x === 535 || x === 705 || x === 875)) continue;
  e(A(x, H[i]), A(x, H[i + 1]));
}

// Desk approach nodes: row 1 seats are reached from the window-side aisle, row 2 from the middle aisle.
COLS.forEach((cx, i) => {
  const x = cx + SEAT_DX.desk;
  n(`d_${cx}_1`, x, H[0]);
  e(`d_${cx}_1`, A(V[i], H[0]));
  e(`d_${cx}_1`, A(V[i + 1], H[0]));
  n(`d_${cx}_2`, x, H[1]);
  e(`d_${cx}_2`, A(V[i], H[1]));
  e(`d_${cx}_2`, A(V[i + 1], H[1]));
});

// Manager office (glass box, door in the right wall facing the middle aisle)
n("mgr_door", 322, 385); n("mgr_in", 272, 385); n("mgr_side", 58, 385); n("mgr_seat_app", 58, 274);
e(A(350, 385), "mgr_door"); e("mgr_door", "mgr_in"); e("mgr_in", "mgr_side"); e("mgr_side", "mgr_seat_app");
n("mgr_visit", 175, 360); e("mgr_in", "mgr_visit"); e("mgr_visit", "mgr_side");

// Library corner (bottom-left)
n("lib_a", 262, 640); n("book", 150, 604); n("book_2", 250, 596); n("armchair", 104, 752); n("lib_b", 190, 770); n("plant_l", 290, 700);
e(A(350, 578), "lib_a"); e(A(350, 822), "lib_b"); e("lib_a", "book"); e("lib_a", "book_2"); e("lib_a", "lib_b"); e("lib_b", "armchair"); e("lib_a", "plant_l"); e("plant_l", "lib_b");

// Engineering & compliance corner (top-right)
n("ezra_app", 1300, 195); e(A(1045, 195), "ezra_app");
n("rack_1", 1186, 262); n("rack_mid", 1240, 266); n("rack_2", 1290, 256);
n("jev_side", 1104, 358); n("jev_front", 1104, 412);
e("rack_1", "rack_mid"); e("rack_mid", "rack_2"); e("rack_2", "ezra_app"); e("rack_1", "jev_side"); e("jev_side", "jev_front"); e("jev_front", A(1045, 385));
e("rack_1", A(1045, 195));
n("deploy", 1330, 400); e("deploy", "jev_front"); e("deploy", A(1045, 385));

// Lounge (bottom-right)
n("lg_a", 1110, 578); n("water", 1136, 566); n("coffee", 1352, 566); n("lg_mid", 1250, 578);
n("foos_l", 1176, 668); n("foos_r", 1330, 668); n("lg_low", 1250, 742);
n("sofa_l", 1212, 806); n("sofa_r", 1292, 806); n("lg_b", 1110, 822);
e(A(1045, 578), "lg_a"); e("lg_a", "water"); e("lg_a", "lg_mid"); e("lg_mid", "coffee"); e("lg_a", "foos_l"); e("lg_mid", "foos_r");
e("foos_l", "lg_low"); e("foos_r", "lg_low"); e("lg_low", "sofa_l"); e("lg_low", "sofa_r");
e(A(1045, 822), "lg_b"); e("lg_b", "sofa_l"); e("lg_b", "foos_l");

// Meeting table (bottom centre) — seats around the table
export const MEETING = { x: 705, y: 712, w: 300 };
const MX = [598, 670, 742, 814];
MX.forEach((x, i) => {
  n(`meet_n${i}`, x, 668);
  n(`meet_s${i}`, x, 768);
});
n("meet_w", 520, 718); n("meet_head", 892, 718);
n("meet_nw", 535, 640); n("meet_ne", 875, 640); n("meet_sw", 535, 790); n("meet_se", 875, 790);
e(A(535, 578), "meet_nw"); e(A(875, 578), "meet_ne"); e(A(535, 822), "meet_sw"); e(A(875, 822), "meet_se");
e("meet_nw", "meet_w"); e("meet_sw", "meet_w"); e("meet_ne", "meet_head"); e("meet_se", "meet_head");
MX.forEach((_, i) => {
  e(`meet_n${i}`, i < 2 ? "meet_nw" : "meet_ne");
  e(`meet_s${i}`, i < 2 ? "meet_sw" : "meet_se");
  if (i) { e(`meet_n${i}`, `meet_n${i - 1}`); e(`meet_s${i}`, `meet_s${i - 1}`); }
});
e(A(705, 578), "meet_n1"); e(A(705, 578), "meet_n2"); e(A(705, 822), "meet_s1"); e(A(705, 822), "meet_s2");

// Window-gazing spots (in front of the windows)
export const WINDOWS = [535, 705, 875];
WINDOWS.forEach((x, i) => { n(`win_${i}`, x, 158); e(`win_${i}`, A(x, 195)); });

const ADJ: Record<string, string[]> = {};
for (const [a, b] of EDGES) {
  (ADJ[a] ??= []).push(b);
  (ADJ[b] ??= []).push(a);
}
/** Edges for the debug overlay. */
export const WALKWAYS: ReadonlyArray<readonly [string, string]> = EDGES;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function nearestNode(p: Pt): string {
  let best = A(705, 385);
  let bd = Infinity;
  for (const [id, q] of Object.entries(NODES)) {
    const d = dist(p, q);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/** Dijkstra over the walkway graph; returns the node points to walk through. */
export function findPath(fromId: string, toId: string): Pt[] {
  if (fromId === toId) return [NODES[toId]];
  const d: Record<string, number> = { [fromId]: 0 };
  const prev: Record<string, string> = {};
  const open = new Set([fromId]);
  const done = new Set<string>();
  while (open.size) {
    let cur = "";
    let cd = Infinity;
    for (const id of open) if ((d[id] ?? Infinity) < cd) { cd = d[id]; cur = id; }
    open.delete(cur);
    if (cur === toId) break;
    done.add(cur);
    for (const nb of ADJ[cur] ?? []) {
      if (done.has(nb)) continue;
      const nd = cd + dist(NODES[cur], NODES[nb]);
      if (nd < (d[nb] ?? Infinity)) { d[nb] = nd; prev[nb] = cur; open.add(nb); }
    }
  }
  const out: Pt[] = [];
  let c: string | undefined = toId;
  while (c && c !== fromId) { out.unshift(NODES[c]); c = prev[c]; }
  return out.length ? out : [NODES[toId]];
}

// ── Idle activities ──────────────────────────────────────────────────────────
export type ActivityKind = "coffee" | "water" | "read" | "plant" | "window" | "sofa" | "visit" | "stretch" | "scan" | "foosball" | "armchair" | "deploy";
export type Spot = { node: string; kind: ActivityKind; face: 1 | -1; emoji: string; label: string; offset?: Pt };

export const SPOTS: Spot[] = [
  { node: "coffee", kind: "coffee", face: 1, emoji: "☕", label: "Grabbing a coffee" },
  { node: "water", kind: "water", face: -1, emoji: "💧", label: "At the water cooler" },
  { node: "book", kind: "read", face: -1, emoji: "📚", label: "Reading SEO research" },
  { node: "book_2", kind: "read", face: 1, emoji: "📖", label: "Browsing the library" },
  { node: "armchair", kind: "armchair", face: 1, emoji: "📰", label: "Reading in the armchair" },
  { node: "plant_l", kind: "plant", face: 1, emoji: "🌱", label: "Watering the plants" },
  { node: "win_0", kind: "window", face: 1, emoji: "🌤️", label: "Thinking by the window" },
  { node: "win_1", kind: "window", face: -1, emoji: "💭", label: "Thinking by the window" },
  { node: "win_2", kind: "window", face: 1, emoji: "💡", label: "Thinking by the window" },
  { node: "sofa_l", kind: "sofa", face: 1, emoji: "📱", label: "Taking a short break" },
  { node: "sofa_r", kind: "sofa", face: -1, emoji: "😌", label: "Taking a short break" },
  { node: "foos_l", kind: "foosball", face: 1, emoji: "⚽", label: "Playing foosball" },
  { node: "foos_r", kind: "foosball", face: -1, emoji: "⚽", label: "Playing foosball" },
  { node: "meet_w", kind: "stretch", face: 1, emoji: "🙆", label: "Stretching" },
];

export const JEV_SPOTS: Spot[] = [
  { node: "rack_1", kind: "scan", face: -1, emoji: "🛡️", label: "Scanning servers" },
  { node: "rack_2", kind: "scan", face: 1, emoji: "🔍", label: "Checking compliance logs" },
  { node: "rack_mid", kind: "scan", face: 1, emoji: "⚙️", label: "Running self-checks" },
  { node: "deploy", kind: "deploy", face: 1, emoji: "📡", label: "Watching the deploy board" },
];

export const MEETING_SEATS = ["meet_n0", "meet_n1", "meet_n2", "meet_n3", "meet_s0", "meet_s1", "meet_s2", "meet_s3", "meet_w"];
