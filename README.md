# figma-design-system-plugin

> AI-powered Figma plugin that generates professional design systems using industry-specific reasoning rules, Claude API, and real-time Figma node manipulation.

---

## What it does

Give it a brand name, industry, and product type. It generates a complete, production-ready design system directly inside your Figma file — foundations, tokens, components, and documentation — in seconds.

**Pipeline:**
1. **Reasoning layer** — [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) analyzes your input against 161 industry-specific rules and returns the optimal style, palette, typography, and anti-patterns for your product type
2. **Translation layer** — Claude API (Sonnet 4) converts the design spec into a structured JSON array of Figma operations
3. **Execution layer** — The Figma plugin sandbox executes operations directly on nodes: pages, color styles, text styles, variables, components with variants

**Output in Figma:**
```
📄 Cover
📄 Foundations   — color primitives, type scale, spacing, elevation
📄 Tokens        — semantic color, typography, spacing tokens
📄 Atoms         — buttons, inputs, badges, avatars
📄 Molecules     — cards, forms, alerts, nav items
📄 Organisms     — header, sidebar, tables, page templates
📄 Changelog
```

---

## Architecture

```
Plugin UI (iframe)
    │
    ├── HTTPS POST ──→ Edge Function (Vercel)
    │                       │
    │                       ├── HTTP POST ──→ Reasoning Service (Render)
    │                       │                    └── search.py + CSV data
    │                       │                    └── DesignSystemSpec JSON
    │                       │
    │                       └── Claude API (Anthropic)
    │                               └── Operation[] JSON
    │
    └── postMessage ──→ Plugin Sandbox
                            └── Figma API → nodes
```

```
figma-design-system-plugin/
├── packages/
│   ├── reasoning/      # Python microservice — Render.com
│   ├── backend/        # Edge Function — Vercel
│   └── plugin/         # Figma plugin — TypeScript
└── docs/
    ├── architecture.md
    └── deploy.md
```

---

## Stack

| Layer | Technology | Hosting |
|---|---|---|
| Reasoning | Python + FastAPI + UI UX Pro Max skill | Render.com (free) |
| Backend | TypeScript + Vercel Edge Functions + Zod | Vercel (free) |
| Plugin | TypeScript + Figma Plugin API | Figma Desktop |
| AI | Claude Sonnet 4 (Anthropic API) | Pay per use (~$0.036/generation) |

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- Figma Desktop
- Anthropic API key → [console.anthropic.com](https://console.anthropic.com)
- GitHub account
- Render.com account (free)
- Vercel account (free)

---

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/figma-design-system-plugin.git
cd figma-design-system-plugin
```

### 2. Deploy the reasoning service (Render)

```bash
cd packages/reasoning
```

Push to GitHub, then on [render.com](https://render.com):
- New → Web Service
- Connect your repo, select `packages/reasoning`
- Render auto-detects `render.yaml` and configures everything
- Deploy → get your URL: `https://reasoning-service-xxxx.onrender.com`

Test it:
```bash
curl -X POST https://reasoning-service-xxxx.onrender.com/reason \
  -H "Content-Type: application/json" \
  -d '{"query": "SaaS dashboard B2B", "project_name": "TestApp"}'
```

### 3. Deploy the backend (Vercel)

```bash
cd packages/backend
npm install
```

Add environment variables:
```bash
vercel env add ANTHROPIC_API_KEY
vercel env add REASONING_SERVICE_URL   # your Render URL
```

Deploy:
```bash
vercel deploy
# → https://your-backend-xxxx.vercel.app
```

### 4. Install the Figma plugin

```bash
cd packages/plugin
npm install
npm run build
```

In Figma Desktop:
- Plugins → Development → Import plugin from manifest
- Select `packages/plugin/manifest.json`

Set your backend URL in `packages/plugin/src/config.ts`:
```typescript
export const BACKEND_URL = "https://your-backend-xxxx.vercel.app"
```

---

## Usage

1. Open any Figma file
2. Run the plugin: **Plugins → Design System Generator**
3. Fill in brand name, industry, product type
4. Click **Generate** — the plugin builds the full design system in your file

---

## Cost

| Service | Cost |
|---|---|
| Render.com (reasoning) | Free (sleeps after 15min inactivity) |
| Vercel (backend) | Free |
| Claude API | ~$0.036 per design system generated |

> **Note on cold starts:** The free Render tier sleeps after 15 minutes of inactivity. The plugin sends a keep-alive ping every 10 minutes while open to minimize this.

---

## Contributing

PRs welcome. Please open an issue first for significant changes.

```bash
git checkout -b feat/your-feature
git commit -m "feat: description"
git push origin feat/your-feature
```

---

## License

MIT
