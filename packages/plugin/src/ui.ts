import { BACKEND_URL, KEEPALIVE_INTERVAL } from "./config"

interface BrandInput {
  name: string
  industry: string
  productType: string
  primaryColor?: string
  tone?: "minimal" | "bold" | "luxury" | "playful" | "corporate"
}

// ─── Keep-alive ping (prevents Render cold starts) ────────────────────────────

function startKeepAlive() {
  const ping = () => {
    fetch(`${BACKEND_URL.replace("/api/generate", "")}/health`).catch(() => {})
  }
  ping()
  setInterval(ping, KEEPALIVE_INTERVAL)
}

// ─── Generate design system ───────────────────────────────────────────────────

async function generate(brand: BrandInput): Promise<void> {
  setStatus("loading", "Analyzing brand with reasoning engine...")

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brand),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error ?? "Backend error")
    }

    const { operations, spec } = await res.json()

    setStatus("loading", `Building design system — ${operations.length} operations...`)
    showSpec(spec)

    // Send operations to sandbox for execution
    parent.postMessage(
      { pluginMessage: { type: "EXECUTE", operations } },
      "*"
    )
  } catch (err: any) {
    setStatus("error", err.message)
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function setStatus(type: "idle" | "loading" | "error" | "success", message: string) {
  const el = document.getElementById("status")
  if (!el) return
  el.textContent = message
  el.className = `status status--${type}`
}

function showSpec(spec: any) {
  const el = document.getElementById("spec-preview")
  if (!el) return
  el.innerHTML = `
    <div class="spec-row"><span>Style</span><strong>${spec.style ?? "—"}</strong></div>
    <div class="spec-row"><span>Heading font</span><strong>${spec.typography?.heading ?? "—"}</strong></div>
    <div class="spec-row"><span>Body font</span><strong>${spec.typography?.body ?? "—"}</strong></div>
    <div class="spec-row colors">
      ${Object.entries(spec.colors ?? {}).map(([k, v]) =>
        `<span class="swatch" style="background:${v}" title="${k}: ${v}"></span>`
      ).join("")}
    </div>
  `
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

window.onload = () => {
  startKeepAlive()

  document.getElementById("generate-btn")?.addEventListener("click", () => {
    const name = (document.getElementById("brand-name") as HTMLInputElement)?.value.trim()
    const industry = (document.getElementById("industry") as HTMLInputElement)?.value.trim()
    const productType = (document.getElementById("product-type") as HTMLInputElement)?.value.trim()
    const primaryColor = (document.getElementById("primary-color") as HTMLInputElement)?.value || undefined
    const tone = (document.getElementById("tone") as HTMLSelectElement)?.value as BrandInput["tone"]

    if (!name || !industry || !productType) {
      setStatus("error", "Fill in all required fields")
      return
    }

    generate({ name, industry, productType, primaryColor, tone })
  })

  // Listen for completion message from sandbox
  window.addEventListener("message", (event) => {
    const msg = event.data?.pluginMessage
    if (msg?.type === "DONE") {
      setStatus("success", `Done — ${msg.count} nodes created`)
    }
    if (msg?.type === "ERROR") {
      setStatus("error", msg.message)
    }
  })
}
