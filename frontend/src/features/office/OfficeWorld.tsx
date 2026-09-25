import { memo, useEffect, useMemo, useRef } from "react";
import { Character, type CharacterParts, Overlay } from "./Character";
import { OfficeDirector } from "./director";
import { Floor, GlassOfficeBack, SceneDefs, Wall } from "./Furniture";
import { OfficeDecor, OfficeDesks } from "./OfficeProps";
import "./office.css";
import { EMPLOYEE_IDS, persona } from "@/features/team/employees";
import type { EmployeeId } from "@/lib/types";

export const NAMES: Record<EmployeeId, string> = {
  manager: "Maya", auditor: "Theo", rank_analyst: "Ravi", researcher: "Zara", onpage: "Lena", strategist: "Omar",
  writer: "Iris", link_builder: "Kai", tech_seo: "Nora", engineer: "Ezra", compliance: "Jev",
};

/**
 * The product's own office renderer and behaviour engine, mounted as a plain SVG group so a page can
 * put it anywhere (inside a building window, full-bleed with a scroll camera). Status is driven by
 * the page's script, not the API, so it runs for signed-out visitors.
 */
export const OfficeWorld = memo(function OfficeWorld({ dark, working, atDesks = false, onDirector }: {
  dark: boolean;
  working: readonly EmployeeId[];
  atDesks?: boolean;
  onDirector?: (d: OfficeDirector | null) => void;
}) {
  const director = useMemo(() => new OfficeDirector((id) => NAMES[id], { atDesks }), [atDesks]);
  const parts = useMemo(() => new Map<EmployeeId, Partial<CharacterParts>>(), []);
  const handlers = useMemo(() => {
    const make = (id: EmployeeId) => (p: Partial<CharacterParts> | null) => {
      if (!p) { director.unregister(id); parts.delete(id); return; }
      const merged = { ...(parts.get(id) ?? {}), ...p };
      parts.set(id, merged);
      if (merged.root && merged.bubble) director.register(id, merged as CharacterParts);
    };
    return Object.fromEntries(EMPLOYEE_IDS.map((id) => [id, { body: make(id), bubble: make(id) }])) as Record<EmployeeId, { body: ReturnType<typeof make>; bubble: ReturnType<typeof make> }>;
  }, [director, parts]);

  const depthRef = useRef<SVGGElement>(null);
  const fxRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (depthRef.current && fxRef.current) director.attach(depthRef.current, fxRef.current);
    onDirector?.(director);
    return () => { onDirector?.(null); director.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [director]);

  const workingSet = new Set(working);
  const status = (id: EmployeeId) => (workingSet.has(id) ? "working" as const : "idle" as const);
  return (
    <>
      <SceneDefs />
      <Floor />
      <Wall dark={dark} counts={{ todo: 4, doing: working.length, waiting: 0, done: 12 }} working={working.length} />
      <GlassOfficeBack />
      <g ref={depthRef}>
        <OfficeDesks status={status} dark={dark} nameOf={(id) => NAMES[id]} />
        <OfficeDecor dark={dark} />
        {EMPLOYEE_IDS.map((id) => (
          <g key={id} data-agent={id} aria-hidden="true">
            <Character id={id} persona={persona(id)} robot={id === "compliance"} onParts={handlers[id].body} />
          </g>
        ))}
      </g>
      <g ref={fxRef} pointerEvents="none" />
      <g pointerEvents="none" aria-hidden="true">
        {EMPLOYEE_IDS.map((id) => <Overlay key={id} name={NAMES[id]} color={persona(id).from} status={status(id)} showName onParts={handlers[id].bubble} />)}
      </g>
    </>
  );
});
