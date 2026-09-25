# Rankcrew — your autonomous SEO team

Rankcrew is a self-hosted, multi-agent engine that audits websites for **SEO health** and **Google AdSense readiness**, fixes
what it can automatically, and keeps optimising on a schedule. It measures ranking impact with Google Search Console
and rolls back changes that hurt.

> **What it can't do.** No tool can guarantee a #1 ranking. Rankings also depend on backlinks, competition,
> brand and genuinely useful content, and Google takes weeks to react to changes. This engine removes every
> technical and on-page obstacle it can find, targets real ranking opportunities, and keeps iterating. Whatever
> needs a human (outreach, original writing, Search Console and AdSense settings) goes into a checklist.

## What it does

| Stage | How | Built on |
|---|---|---|
| **Crawl** | Every page, plus robots.txt, sitemaps, ads.txt, llms.txt, soft-404 and http/https/www probes | [advertools](https://github.com/eliasdabbas/advertools) (Scrapy), httpx |
| **Audit** | 40 requirements from the *AdSense Approval Manual 2026* plus core on-page SEO; 0–100 scores | own checks (`seo_engine/audit/checks/`) |
| **Core Web Vitals** | LCP, CLS, INP and Lighthouse scores | Google PageSpeed Insights API |
| **Content judge** | Scores **every** article for policy risk, generic-AI text, depth, sources and intent | [TypeSafe Jev](https://typesafe.ai) (any structured-output model works) |
| **Rule fixes** | robots.txt, ads.txt, llms.txt, sitemap, JSON-LD, lang, viewport, canonicals, legal page drafts | own generators (templates from the manual) |
| **AI workforce** | 11 employees with roles and real tools (live search results, keyword research, rank tracking, link building, PageSpeed, code edits via Aider), a shared task board, delegation, questions to you, standups and reports | [PydanticAI](https://ai.pydantic.dev), **any LLM** |
| **Memory** | Each employee remembers its own lessons; the team shares site facts, decisions and what worked | [Mem0](https://github.com/mem0ai/mem0) on [Qdrant](https://qdrant.tech) |
| **Context engine** | Every task starts with a briefing: role, site state, task thread, relevant memories, retrieved site knowledge, recent team activity | Qdrant + [FastEmbed](https://github.com/qdrant/fastembed) (local embeddings, no API key) |
| **Guardrail** | Jev checks every AI-written title, description and alt text before autopilot applies it | TypeSafe Jev |
| **Apply** | WordPress (REST + bridge plugin), GitHub pull request, or local files; dry-run diffs | httpx, PyGithub |
| **Learn** | Search Console rankings → striking-distance targets → impact after 14 days → auto-rollback | Search Console API |
| **Run forever** | Scheduler runs audits, optimisation cycles and impact measurement per site | arq (Redis) or in-process |

### The AI team

| Employee | Role | Delegates to |
|---|---|---|
| **Maya**, SEO Manager | Plans each cycle, assigns tasks, reviews results, writes cycle and weekly reports, answers your chat, notifies you | everyone |
| **Theo**, Technical SEO Auditor | Crawl + 40-requirement audit + rule-based fixes (deterministic, no LLM) | — |
| **Ravi**, Rank Analyst | Search Console + live positions: striking-distance queries, low-CTR snippets, index status, rank tracking | Lena, Nora, Zara |
| **Zara**, Market Researcher | Keyword research (real autocomplete queries + GSC demand), live results analysis, competitor content gaps | Omar, Iris |
| **Lena**, On-page Optimizer | Titles, meta descriptions, alt text, Open Graph, schema — checked against the live results page | Ezra |
| **Omar**, Content Strategist | Content risk review, priorities, content plan from keyword and competitor research | Iris, Zara, Kai |
| **Iris**, Content Writer | Researches the topic (results, competitor outlines, People Also Ask), drafts articles | — |
| **Kai**, Link Builder | Contextual internal links (real, reversible edits), orphan pages, backlink prospects, outreach drafts | Ezra |
| **Nora**, Technical SEO Engineer | Core Web Vitals (PageSpeed), index inspection, sitemap + IndexNow submission, canonicals/lang | Ezra |
| **Ezra**, Web Engineer | Edits the site's source code in its repository (Next.js, Astro, Hugo, Jekyll…) and ships pull requests | — |
| **Jev**, Compliance Officer | TypeSafe Jev: judges every page, verifies every change before it goes live | — |

### Their tools

| Tool group | What it does | Needs |
|---|---|---|
| Live search results | Ranked results, People Also Ask, related searches, live position checks | Serper, SerpAPI or Brave key |
| Keyword ideas | Real Google Autocomplete queries, merged with Search Console impressions | — |
| Competitor analysis | Fetch any page's outline, depth, schema and links; content-gap analysis vs the top results | Search key for gaps |
| Rank tracking | Daily positions per keyword (live results, or Search Console average position) | Search key or GSC |
| Links | Semantic internal-link suggestions + link insertion/removal; Open PageRank authority; prospect search | Open PageRank key (optional) |
| Technical | PageSpeed Insights, URL inspection, sitemap resubmission, IndexNow | GSC / IndexNow key (optional) |
| Code | Repository workspace, code search (ripgrep), tree-sitter outlines, page-to-source mapping, Aider edits, build checks | GitHub or local connector |
| Team | Delegate, board, comments, ask the owner, memory, site knowledge search, notify the owner | — |

Missing integrations never break a task: tools report what is not configured and the employee adapts.

They work like a real team:

- **Task board.** Every piece of work is a task with an owner, priority, status, output and comment thread.
  Employees delegate to colleagues within their reporting lines. Guardrails cap delegation depth, tasks per cycle
  and LLM requests per task, and skip duplicate tasks.
- **Parallel work.** Tasks run concurrently (`SEO_TASK_CONCURRENCY` per process; add workers to scale).
- **Questions to you.** An employee who needs your input asks. The task shows as *Waiting on you*, and your reply
  resumes it automatically. You can also assign tasks to anyone, reassign, retry or cancel.
- **Memory.** After each task, employees record durable lessons (their own) and team notes (shared). Your own notes
  ("teach the team") become part of every briefing. Near-duplicates are skipped.
- **Briefings.** The context engine assembles each task's briefing within a size budget: role card, site state,
  the task and its discussion, the most relevant team and personal memories, retrieved pages, findings and search
  queries, and what colleagues finished recently.
- **Rituals.** A daily standup (who did what, who is blocked) and a weekly report from Maya.

### The autonomous loop

```
 every N hours per site
 ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Theo: crawl + audit ──► knowledge index refresh ──► Search Console data ──► measure old fixes │
 │                                                                              (roll back worse)│
 │ Maya: plan the cycle ──► tasks on the board ──► Ravi · Lena · Omar · Iris work in parallel    │
 │        ▲                                          │  (delegate, ask you, remember)            │
 │        └──── Maya: wrap-up review + report ◄──────┤                                           │
 │                                                   ▼                                           │
 │                         Jev verifies every change ──► autopilot applies eligible fixes        │
 └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Autopilot modes** (per site):

- `off`: fixes are proposed; you review and apply them in the UI.
- `safe`: automatically applies additive, low-risk fixes (schema, alt text, missing meta, ads.txt, drafts, …).
- `full`: applies everything the Judge passes, including robots.txt and title rewrites. AI-written articles are
  still saved as **drafts** unless *auto-publish content* is switched on. The manual (R28) warns that unedited AI
  content gets sites rejected by AdSense.

## The web UI

The UI is built with React 19, [shadcn/ui](https://ui.shadcn.com) (Radix, Tailwind v4) and [GSAP](https://gsap.com).
`/` is the public, scroll-driven landing page; customers sign up at `/signup` and work at `/sites`.
Pick a site in the sidebar to get these sections:

- **Workspace:**
  - **Overview:** animated score rings, trends and what the crew is doing.
  - **Office:** a live, animated office floor. Each employee walks to their desk and works while they have a task, and shows a "waiting on you" bubble when blocked. With no task they wander, get coffee and hold meetings. Hover an employee for their status; click one to open their profile.
  - **Chat:** a ChatGPT-style conversation with Maya, the manager.
  - **Board:** a kanban view of every task.
  - **Cycles.**
- **Audit:** Rankings (daily keyword positions), Findings, the AdSense checklist, Pages, Content quality.
- **Improve:** Content, Fixes (diff view, Jev verification, rollback), Memory, Reports.
- **Configure:** site settings, autopilot and connectors.
- **Billing & credits:** balance, credit packs (Stripe Checkout), what everything costs, and a ledger of every credit.
- **Account:** profile, password, the workspace's own notification channels, and deleting the workspace.
- **Platform settings** (operators only): AI models, research integrations, the email server, budgets and customers.

Other shortcuts: <kbd>⌘K</kbd> opens the command menu, <kbd>⌘1–9</kbd> jumps between sections, and light, dark and system themes are all supported.

## Quick start

### Docker (production)

```bash
cp .env.example .env
docker compose build
docker compose run --rm --no-deps app seo-engine gen-secrets
# paste both printed values into .env, add your LLM key (e.g. ANTHROPIC_API_KEY) and optionally TYPESAFE_API_KEY
docker compose up -d
docker compose exec app seo-engine create-admin you@yourcompany.com   # the first platform operator
open http://localhost:8000
```

Customers create their own accounts at `/signup`. The `SEO_API_KEYS` value still works as an operator key for
the API (`X-API-Key` header) and the CLI.

This starts `app` (API + UI, runs migrations on boot), `worker` (jobs, tasks + scheduler), Postgres, Redis and
Qdrant. The embedding model is baked into the image, so memory works offline.

### Local development

```bash
make install                 # venv + backend + frontend deps
make tools                   # Aider for code edits (isolated env in ./.tools)
.venv/bin/seo-engine gen-secrets >> .env   # then add your LLM key to .env
make dev                     # API on :8000 with in-process jobs + scheduler (SQLite)
make web                     # UI dev server on :5173
```

One-off audit from the terminal (no database needed):

```bash
.venv/bin/seo-engine audit https://example.com --max-pages 200 --html report.html
```

## Running Rankcrew as a service

Rankcrew is multi-tenant: every customer gets a **workspace** (account) with its own sites, crew, memory, credits
and notification channels. Customers can only see and change their own workspace; requests for anything else get
a 404.

**Accounts.** Email and password sign-up with email verification, password reset, and sign-out everywhere when a
password changes. Passwords are hashed with scrypt; sessions are random tokens in an HttpOnly, SameSite cookie
(Secure in production), and only their hashes are stored. State-changing requests must carry an
`X-Requested-With` header, which cross-site forms cannot send. Sign-in locks for 15 minutes after 10 failed
attempts, and sign-up, sign-in and reset are rate-limited per IP and per email.

**Credits.** Customers pay for work, not seats. New workspaces get `SEO_SIGNUP_CREDITS` (100) free. Defaults:

| Work | Price |
|---|---|
| Audit | 0.1 credit per crawled page (a crawl never goes past what the balance covers) |
| AI work (tasks, chat, reports, code edits) | 1 credit per 2,000 tokens |
| Live rank check | 1 credit per keyword |
| Fixes, rollbacks, Search Console | free |

Paid work is refused with HTTP 402 when a workspace is out of credits, and the scheduler skips workspaces that are
out of credits, unconfirmed or suspended. The owner is told once a day when the crew stops. Every change to a
balance is a row in the credit ledger, shown to the customer in Billing.

**Payments (Stripe).** Customers buy credit packs through Stripe Checkout. Set `SEO_STRIPE_SECRET_KEY` and
`SEO_STRIPE_WEBHOOK_SECRET`, and point a Stripe webhook at `<SEO_PUBLIC_URL>/api/billing/webhook` for
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and
`checkout.session.expired`. Webhooks are signature-checked, and each payment credits the workspace exactly once.
Pack sizes and prices come from `SEO_CREDIT_PACKS`.

**Operators.** Users listed in `SEO_ADMIN_EMAILS` (or created with `seo-engine create-admin`) manage the platform:
AI models and keys, research integrations, the SMTP server used for account email, budgets, and customer
workspaces (search, add or remove credits). `seo-engine grant-credits <email> <credits>` does the same from a shell.

**Before launch.** Set `SEO_ENVIRONMENT=production`, `SEO_PUBLIC_URL`, an SMTP server (Platform settings → Notifications
or the `SEO_SMTP_*` variables), the Stripe keys, and your company details for the legal pages
(`VITE_LEGAL_NAME`, `VITE_SUPPORT_EMAIL`, `VITE_LEGAL_ADDRESS` at build time). The Terms and Privacy pages
(`/terms`, `/privacy`) are a starting point: have them reviewed for your jurisdiction.

## Configuration

Everything is set with environment variables (`SEO_*`, see `.env.example`). The LLM and the Judge can also be
changed at runtime on the **Settings** page; keys entered there are stored encrypted.

### Any LLM

`SEO_LLM_MODEL` takes `<provider>:<model>`. Examples:

| Provider | Model string | Key |
|---|---|---|
| Anthropic | `anthropic:claude-opus-5` (default) | `ANTHROPIC_API_KEY` |
| OpenAI | `openai:gpt-5` | `OPENAI_API_KEY` |
| Google | `google-gla:gemini-2.5-pro` | `GOOGLE_API_KEY` |
| Groq / Mistral / DeepSeek / xAI | `groq:…`, `mistral:…`, `deepseek:…`, `xai:…` | provider key |
| OpenRouter | `openrouter:anthropic/claude-opus-5` | `OPENROUTER_API_KEY` |
| Ollama (local) | `ollama:llama3.3` + `SEO_LLM_BASE_URL` | none |
| vLLM / LM Studio / LiteLLM | `openai-compatible:<model>` + `SEO_LLM_BASE_URL` | optional |

With no LLM configured, the engine still works: audits, rule-based fixes and heuristic copy all run.

### Compliance Judge (TypeSafe Jev)

Set `TYPESAFE_API_KEY` (default model `typesafe:jev-latest`). Jev returns typed decisions with calibrated
confidence in about 100 ms, cheaply enough to judge every page. It powers the per-page content judgements
(R27–R31 findings) and the pre-apply verification of AI-written copy. Without a key, the judge layer is skipped.

### Google Search Console (ranking data, impact measurement, rollback)

1. In Google Cloud, create a service account and download its JSON key. Enable the *Google Search Console API*.
2. In Search Console → Settings → Users and permissions, add the service-account email as a **Full** user.
3. In the site's **Settings → Google Search Console** tab, enter the property (`sc-domain:example.com` or
   `https://example.com/`) and paste the JSON.

### Connectors (how fixes reach the site)

| Type | Setup | Notes |
|---|---|---|
| **WordPress** | Install the [SEO Engine Bridge](wordpress/) plugin and create an Application Password | Writes Rank Math / Yoast / built-in fields, JSON-LD, robots/ads/llms.txt; creates draft pages |
| **GitHub** | Fine-grained token with *contents* + *pull requests* write | Opens one PR per apply; optional auto-merge for autopilot |
| **Local** | Absolute path to the site's files | For static builds, mounted volumes, or a local checkout |

Every apply can be previewed first as a dry run with diffs.

### Code edits (Ezra, the Web Engineer)

Page-level patches only work on plain HTML. For framework sites Ezra changes the real source code:

1. Each task gets a disposable, git-tracked copy of the repository (GitHub tarball of the base branch, or a copy
   of the local folder).
2. Ezra explores it like a developer: `repo_overview` (framework, scripts, where SEO tags live), `find_page_source`
   (URL → route files + files containing the page's current title/H1), code search (ripgrep when installed),
   tree-sitter file outlines and numbered reads.
3. Edits are made by [Aider](https://aider.chat) (Apache-2.0), an open-source coding agent built for large
   codebases (tree-sitter repo map, robust edit formats, built-in lint-and-fix), running headless with the same LLM
   as the rest of the crew. It runs in its own virtualenv, so its dependencies never clash with Rankcrew's.
4. After every edit Rankcrew runs tree-sitter syntax checks; with *build verification* enabled it also runs the
   site's own `build`/`lint`/`test` scripts.
5. The result is one `code_change` fix holding the exact before/after of every file and the full diff. Applying it
   opens a pull request (auto-merged on full autopilot if the connector allows); a file that changed in the
   meantime is detected as a conflict; rollback reverts it exactly.

Install Aider with `make tools` (local) — the Docker image already includes it, plus git and ripgrep. CI
workflows, secrets and lock files are never edited.

### Research, notifications and budget

All optional, and editable at runtime in **Workspace settings** (keys are encrypted at rest):

- **Integrations** — search results provider (`SEO_SERP_PROVIDER` + `SEO_SERP_API_KEY`), Open PageRank, PageSpeed,
  IndexNow.
- **Notifications** — Slack webhook, generic JSON webhook (Discord/Teams/Zapier/n8n), or SMTP email for: task
  waiting on you, cycle finished, change rolled back, job failed, budget reached, messages from Maya.
- **Usage & budget** — every LLM call (employees, chat, Aider) is recorded; `SEO_LLM_DAILY_TOKEN_BUDGET` pauses
  AI work for the rest of the UTC day once reached.

### PageSpeed Insights

Set `SEO_PAGESPEED_API_KEY` to add Core Web Vitals (the homepage plus two articles per audit).

## API

Interactive docs are at `/api/docs`. Authentication uses the `X-API-Key` header (or `?api_key=` for Server-Sent
Events and downloads). Main resources: `/api/sites`, `/api/sites/{id}/audits`, `/api/sites/{id}/cycles`,
`/api/sites/{id}/fixes`, `/api/sites/{id}/keywords` (rank tracking), `/api/jobs/{id}/stream` (live progress),
`/api/settings/llm`, `/api/settings/integrations`, `/api/settings/usage`, `/api/capabilities`.

## Project layout

```
seo_engine/
  core/          settings, domain models, the 40-requirement catalog, security (SSRF guard, encryption), logging
  crawler/       advertools crawl → PageData, site-level probes
  audit/         check registry, checks/ (one module per manual section), scoring, PageSpeed, CLI runner
  judge/         Jev content judgements + copy verification
  generators/    site profile, robots/ads/llms/sitemap, JSON-LD library, legal page drafts
  fixes/         FixAction model, rule planner, HTML patcher
  agent/         LLM factory (any provider), audit/fix tools, copywriter/strategist agents, rank tools
  workforce/     roster, task board, collaboration / research / code tools, employee agents, task runner, rituals
  knowledge/     Mem0 memory, Qdrant knowledge index, FastEmbed embeddings, briefing assembly (context engine)
  integrations/  Google Search Console, IndexNow, notifications (Slack / webhook / email)
  research/      live search results providers, keyword ideas, page dissection + content gaps, authority, PageSpeed
  code/          repository workspaces, code inspection (ripgrep, tree-sitter), Aider runner, build verification
  connectors/    WordPress, GitHub, local (page patches, internal links, code changes)
  db/            SQLAlchemy models + async session  (migrations/ holds Alembic)
  services/      business logic: sites, audits, cycles, fixes, impact, chat, settings, integrations, rankings, budget
  workers/       job queue (arq or in-process), job dispatcher, scheduler
  api/           FastAPI app + routers
  reports/       standalone HTML report
frontend/        React + TypeScript + Tailwind + shadcn-style UI
wordpress/       SEO Engine Bridge plugin
tests/           unit + end-to-end API tests against a local fixture site
```

## Operations

- **Migrations:** `seo-engine migrate` (runs automatically in the Docker image). To add one after changing models,
  run `alembic revision --autogenerate -m "..."`.
- **Scaling:** run more `worker` replicas; jobs and tasks are claimed atomically. The scheduler cron is `unique`, so
  only one worker enqueues at a time. Several processes (API + workers) need a Qdrant server (`SEO_QDRANT_URL`);
  embedded Qdrant is single-process only.
- **Health:** `/healthz` (liveness) and `/readyz` (database connectivity).
- **Logs:** JSON lines when `SEO_ENVIRONMENT=production`.
- **Security:** API keys are compared in constant time. Connector credentials and LLM keys are Fernet-encrypted at
  rest with `SEO_SECRET_KEY`. Outbound fetches refuse private and loopback addresses (SSRF protection). The local
  connector refuses paths outside its root. Without API keys, production mode refuses to serve.
- **Costs:** `SEO_AGENT_REQUEST_LIMIT` caps LLM requests per cycle; `cycle_every_hours` (default weekly) controls
  how often the team runs.

## Tests

```bash
make test     # starts a local fixture website and runs unit + end-to-end API tests (offline LLM)
make lint
```
