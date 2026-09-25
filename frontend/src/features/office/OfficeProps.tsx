import { ASSIGNABLE_IDS, EMPLOYEE_IDS, persona } from "@/features/team/employees";
import type { EmployeeId, TeamMemberStatus } from "@/lib/types";
import {
  ArmchairBack, ArmchairFront, Bookshelf, Chair, CoffeeCounter, Credenza, DeployKiosk, Desk, FloorLamp, Foosball, GlassOfficeFront,
  MeetingTable, Plant, Planter, ServerRack, SofaBack, SofaFront, Terminal, WaterCooler,
} from "./Furniture";
import { DESKS, MEETING, NODES } from "./layout";

/**
 * Depth-sorted scene props shared by the app's office and the landing page.
 * Both render as fragments so every `g[data-baseline]` stays a direct child of the director's depth layer.
 */
export function OfficeDesks({ status, dark, nameOf, onDesk, onTerminal }: {
  status: (id: EmployeeId) => TeamMemberStatus;
  dark: boolean;
  nameOf: (id: EmployeeId) => string;
  onDesk?: (id: EmployeeId, e: React.MouseEvent | React.KeyboardEvent) => void;
  onTerminal?: (id: EmployeeId) => void;
}) {
  return (
    <>
      {EMPLOYEE_IDS.map((id) => {
        const d = DESKS[id];
        const p = persona(id);
        const s = status(id);
        const label = `${nameOf(id)}'s ${d.kind === "terminal" ? "console" : "desk"} — ${ASSIGNABLE_IDS.includes(id) ? "assign a task" : "open profile"}`;
        if (d.kind === "terminal") {
          return [
            <g key={`c-${id}`} data-baseline={d.seat.y - 1}><Chair x={d.seat.x} y={d.seat.y} color="#14b8a6" dark={dark} /></g>,
            <g key={`t-${id}`} data-baseline={d.y}>
              <Terminal x={d.x} y={d.y} active={s === "working"} label={label} onClick={onTerminal && (() => onTerminal(id))} />
            </g>,
          ];
        }
        return [
          <g key={`c-${id}`} data-baseline={d.seat.y - 1}><Chair x={d.seat.x} y={d.seat.y} color={p.from} dark={dark} /></g>,
          <g key={`d-${id}`} data-baseline={d.y}>
            <Desk id={id} x={d.x} y={d.y} persona={p} kind={d.kind} working={s === "working"} blocked={s === "blocked"} dark={dark} label={label} onClick={onDesk && ((e) => onDesk(id, e))} />
          </g>,
        ];
      })}
    </>
  );
}

export function OfficeDecor({ dark, onCoffee, onFoosball }: { dark: boolean; onCoffee?: () => void; onFoosball?: () => void }) {
  return (
    <>
      {/* manager office */}
      <g data-baseline={205}><Credenza x={170} y={205} /></g>
      <g data-baseline={214}><Plant x={292} y={214} variant="tall" s={0.9} /></g>
      <g data-baseline={408}><Plant x={52} y={408} variant="round" s={0.8} /></g>
      <g data-baseline={418}><GlassOfficeFront /></g>
      {/* library */}
      <g data-baseline={572}><Bookshelf x={96} y={572} seed={0} /></g>
      <g data-baseline={572}><Bookshelf x={214} y={572} seed={3} /></g>
      <g data-baseline={745}><ArmchairBack x={104} y={750} /></g>
      <g data-baseline={761}><ArmchairFront x={104} y={760} /></g>
      <g data-baseline={730}><FloorLamp x={36} y={730} /></g>
      <g data-baseline={700}><Plant x={318} y={700} variant="leafy" s={0.85} /></g>
      <g data-baseline={846}><Plant x={44} y={846} variant="cactus" s={0.8} /></g>
      {/* window-side plants */}
      <g data-baseline={166}><Plant x={404} y={166} variant="leafy" s={0.75} /></g>
      <g data-baseline={166}><Plant x={1010} y={166} variant="tall" s={0.72} /></g>
      {/* engineering */}
      <g data-baseline={236}><ServerRack x={1212} y={236} /></g>
      <g data-baseline={236}><ServerRack x={1268} y={236} /></g>
      <g data-baseline={186}><Plant x={1406} y={186} variant="cactus" s={0.7} /></g>
      <g data-baseline={410}><DeployKiosk x={1394} y={410} /></g>
      <g data-baseline={452}><Planter x={1268} y={452} w={296} /></g>
      {/* lounge */}
      <g data-baseline={540}><WaterCooler x={1136} y={540} /></g>
      <g data-baseline={540}><CoffeeCounter x={1352} y={540} onClick={onCoffee} /></g>
      <g data-baseline={667}><Foosball x={1253} y={667} onClick={onFoosball} /></g>
      <g data-baseline={640}><Plant x={1410} y={640} variant="round" s={0.85} /></g>
      <g data-baseline={796}><SofaBack x={1252} y={798} /></g>
      <g data-baseline={812}><SofaFront x={1252} y={812} /></g>
      <g data-baseline={800}><FloorLamp x={1396} y={800} color="#6c7cf0" /></g>
      <g data-baseline={848}><Plant x={1106} y={848} variant="leafy" s={0.8} /></g>
      {/* meeting */}
      {[0, 1, 2, 3].map((i) => (
        <g key={`mc-${i}`} data-baseline={667}><Chair x={NODES[`meet_n${i}`].x} y={NODES[`meet_n${i}`].y} color="#9aa3b5" dark={dark} /></g>
      ))}
      <g data-baseline={MEETING.y}><MeetingTable x={MEETING.x} y={MEETING.y} w={MEETING.w} /></g>
      <g data-baseline={600}><Plant x={372} y={600} variant="round" s={0.7} /></g>
    </>
  );
}
