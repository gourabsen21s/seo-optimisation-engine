import { useRef } from "react";
import { Character } from "@/features/office/Character";
import { persona } from "@/features/team/employees";
import type { EmployeeId } from "@/lib/types";
import { clamp01, reducedMotion } from "../clock";
import { useProgress } from "../hooks";

// Roles and reporting lines from the README's roster table.
const CREW: { id: EmployeeId; name: string; role: string; does: string; to: string }[] = [
  { id: "manager", name: "Maya", role: "SEO Manager", does: "Plans each cycle, assigns and reviews the work, writes the reports and answers your chat.", to: "Everyone" },
  { id: "auditor", name: "Theo", role: "Technical SEO Auditor", does: "Crawls the site and runs the 40-requirement audit. Deterministic rules, no language model.", to: "Maya, with the findings" },
  { id: "rank_analyst", name: "Ravi", role: "Rank Analyst", does: "Search Console and live positions: striking-distance queries, low-CTR snippets, index status.", to: "Lena, Nora, Zara" },
  { id: "researcher", name: "Zara", role: "Market Researcher", does: "Real autocomplete queries, live results analysis and competitor content gaps.", to: "Omar, Iris" },
  { id: "onpage", name: "Lena", role: "On-page Optimizer", does: "Titles, descriptions, alt text, Open Graph and schema, checked against the live results page.", to: "Ezra" },
  { id: "strategist", name: "Omar", role: "Content Strategist", does: "Content risk review and a content plan built from keyword and competitor research.", to: "Iris, Zara, Kai" },
  { id: "writer", name: "Iris", role: "Content Writer", does: "Researches outlines and People Also Ask, then drafts articles. Drafts stay drafts until you say so.", to: "Nobody. She writes." },
  { id: "link_builder", name: "Kai", role: "Link Builder", does: "Internal links you can reverse, orphan pages, backlink prospects and outreach drafts.", to: "Ezra" },
  { id: "tech_seo", name: "Nora", role: "Technical SEO Engineer", does: "Core Web Vitals, index inspection, sitemap and IndexNow submission, canonicals.", to: "Ezra" },
  { id: "engineer", name: "Ezra", role: "Web Engineer", does: "Edits your site's real source code in its repository and ships a pull request.", to: "Nobody. He ships." },
  { id: "compliance", name: "Jev", role: "Compliance Officer", does: "Judges every page and verifies every change before anything goes live.", to: "Nobody. Jev checks." },
];

const noop = () => {};

function Portrait({ id }: { id: EmployeeId }) {
  const p = persona(id);
  return (
    <svg className="lp-crew__portrait" viewBox="-60 -94 120 102" aria-hidden="true">
      <ellipse cx="0" cy="1" rx="19" ry="5" fill="rgb(0 0 0 / 0.35)" />
      <g className="lp-crew__body"><Character id={id} persona={p} robot={id === "compliance"} onParts={noop} /></g>
    </svg>
  );
}

export function Crew() {
  const ref = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);

  useProgress(ref, (p) => {
    const r = rail.current;
    if (!r || reducedMotion()) return;
    const travel = Math.max(0, r.scrollWidth - r.clientWidth);
    const x = -travel * clamp01(p);
    r.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    // Panels settle in sequence as they cross into view, like a drawer being pulled.
    const vw = innerWidth;
    items.current.forEach((el, i) => {
      if (!el || i === 0) return;
      const left = el.offsetLeft + x;
      const t = clamp01(1 - (left - vw * 0.62) / (vw * 0.38));
      el.style.opacity = (0.55 + 0.45 * t).toFixed(3);
      el.style.transform = `translate3d(0, ${((1 - t) * 26).toFixed(1)}px, 0)`;
    });
  });

  return (
    <section ref={ref} id="crew" className="lp-act lp-crew" style={{ "--span": 3.6 } as React.CSSProperties} data-sc-act="pin" aria-labelledby="crew-title">
      <div className="lp-stage">
        <div ref={rail} className="lp-crew__rail">
          <header ref={(el) => { items.current[0] = el; }} className="lp-crew__intro">
            <p className="lp-hour">09:00</p>
            <h2 id="crew-title" className="lp-display lp-display--lg">Maya hands out the day.</h2>
            <p className="lp-body">Eleven roles, each with real tools, one shared task board and a memory. They hand work to each other, ask you when they need to, and write down what worked.</p>
          </header>
          {CREW.map((c, i) => (
            <article key={c.id} ref={(el) => { items.current[i + 1] = el; }} className="lp-crew__card" style={{ "--tint": persona(c.id).from } as React.CSSProperties}>
              <Portrait id={c.id} />
              <h3 className="lp-display lp-display--sm">{c.name}</h3>
              <p className="lp-crew__role">{c.role}</p>
              <p className="lp-crew__does">{c.does}</p>
              <p className="lp-crew__to"><span>Hands work to</span> {c.to}</p>
            </article>
          ))}
          <aside ref={(el) => { items.current[CREW.length + 1] = el; }} className="lp-crew__outro">
            <p className="lp-display lp-display--md">Nobody works alone. Nothing ships without Jev.</p>
            <p className="lp-body">Every task starts with a briefing: the role, the site's state, the thread, the team's memories and what colleagues finished recently.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
