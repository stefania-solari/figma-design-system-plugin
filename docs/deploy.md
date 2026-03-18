# Deploy guide

## Order of operations

Deploy in this order — each step depends on the previous URL.

```
1. Render  (reasoning service) → get URL
2. Vercel  (backend)           → set Render URL as env var → get URL
3. Figma   (plugin)            → set Vercel URL in config.ts → build → load
```

---

## 1. Reasoning service → Render.com

1. Push repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — no manual config needed
5. Click **Deploy**
6. Wait ~3 minutes for first deploy
7. Test:

```bash
curl -X POST https://YOUR-SERVICE.onrender.com/reason \
  -H "Content-Type: application/json" \
  -d '{"query": "SaaS dashboard", "project_name": "Test"}'
```

Expected: JSON with `style`, `colors`, `typography`, `effects`, `antiPatterns`

---

## 2. Backend → Vercel

```bash
cd packages/backend
npm install
npx vercel login
npx vercel env add ANTHROPIC_API_KEY        # your Anthropic key
npx vercel env add REASONING_SERVICE_URL    # your Render URL
npx vercel deploy --prod
```

Test:

```bash
curl -X POST https://YOUR-BACKEND.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme",
    "industry": "fintech",
    "productType": "dashboard"
  }'
```

Expected: JSON with `operations` array and `spec` object

---

## 3. Figma plugin

1. Update `packages/plugin/src/config.ts` with your Vercel URL
2. Build:

```bash
cd packages/plugin
npm install
npm run build
```

3. In Figma Desktop: **Plugins → Development → Import plugin from manifest**
4. Select `packages/plugin/manifest.json`
5. Open any Figma file → run the plugin

---

## Environment variables reference

| Variable | Where | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vercel | `sk-ant-...` from console.anthropic.com |
| `REASONING_SERVICE_URL` | Vercel | `https://xxx.onrender.com` |
| `BACKEND_URL` | `config.ts` | `https://xxx.vercel.app` |

---

## Cold start note

The Render free tier sleeps after 15 minutes of inactivity.
The plugin sends a keep-alive ping every 10 minutes while open — this minimizes cold starts during active work sessions.
First load after a long idle period may take ~30 seconds.
