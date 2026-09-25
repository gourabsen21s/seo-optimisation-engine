# Rankcrew — web UI

The Rankcrew single-page app. It is built with React 19, TypeScript, Vite, Tailwind CSS v4, **shadcn/ui** (preset radix-nova, `src/components/ui/`) and **GSAP** (`@gsap/react`) for animation.

The app follows the official shadcn blocks (`dashboard-01` shell, `sidebar-07` navigation) themed with the Rankcrew palette in `src/index.css`: a cool silver "daytime studio" (light) and a navy "night shift" (dark), one sun-orange accent, Archivo for headings and Geist for text. Keep new UI on those tokens; avoid glass/blur and gradient text.

`/` is the public landing page (`src/features/landing/`): one working day of the crew, scroll as the clock (GSAP ScrollTrigger + Lenis). It uses the product's own office renderer and real output from one audit (`sample.ts`). The design brief lives in `../scrollcraft/builds/rankcrew-day/BRIEF.md`. The app itself starts at `/sites`.

Add components with `npx shadcn@latest add <name>`, or via the shadcn MCP server configured in the repo-root `.mcp.json` (restart Claude Code to load it). Brand name and tagline live in `src/config/brand.ts`.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api -> http://localhost:8000
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # serve the production build locally
npm run typecheck  # types only
```

## Backend / proxy

- All requests use relative `/api/...` URLs. In dev, Vite proxies `/api` to `http://localhost:8000`
  (override with `VITE_API_TARGET=http://host:port npm run dev`).
- In production FastAPI serves `dist/` as an SPA (unknown paths should fall back to `index.html`).
- Auth: the login page verifies an API key with `GET /api/auth/check`, stores it in `localStorage`
  and sends it as `X-API-Key` on every request. A 401 logs the user out. Keys are configured on the
  server with `SEO_API_KEYS`.
- Live job progress uses Server-Sent Events at `/api/jobs/{id}/stream?api_key=…` and falls back to
  polling `GET /api/jobs/{id}` every 2s. Audit exports open `/api/audits/{id}/export?format=…&api_key=…`.

## Layout

```
src/
  config/brand.ts        product name and tagline
  lib/                   api.ts · types.ts · hooks.ts (React Query + SSE) · gsap.ts · useCurrentSite.ts · utils.ts
  components/ui/         shadcn/ui components (generated; edit sparingly)
  components/brand/      Logo
  components/common/     motion (Reveal, AnimatedNumber, Aurora) · ScoreRing · blocks · badges · JobProgress
  components/layout/     AppShell · AppSidebar · CommandMenu (⌘K) · ThemeToggle · nav.ts
  features/landing/      public landing: acts/ (one per hour), DayRail (draggable sun), clock (scroll-to-time), sample data
  features/office/       live office: layout (walkway graph), Character, Furniture, OfficeProps, director (GSAP behaviour), OfficeFloor, OfficeWorld (scripted, API-free)
  features/chat/         ChatGPT-style chat with Maya
  features/team/         employees, avatars, task board bits, task sheet
  features/fixes/        FixCard
  features/sites/        AddSiteDialog, autopilot
  pages/                 LoginPage · SitesPage · WorkspaceSettingsPage · site/* (one page per sidebar section)
```
