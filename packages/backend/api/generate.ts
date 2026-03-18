import { z } from "zod"

export const config = { runtime: "edge" }

// ─── Input schema ────────────────────────────────────────────────────────────

const BrandInputSchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
  productType: z.string().min(1),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  tone: z.enum(["minimal", "bold", "luxury", "playful", "corporate"]).optional(),
})

// ─── Operations schema (Zod) ─────────────────────────────────────────────────

const CreatePage = z.object({
  op: z.literal("createPage"),
  name: z.string(),
  index: z.number(),
})

const CreateColorStyle = z.object({
  op: z.literal("createColorStyle"),
  name: z.string(),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  opacity: z.number().min(0).max(1).optional(),
})

const CreateTextStyle = z.object({
  op: z.literal("createTextStyle"),
  name: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  fontWeight: z.number(),
  lineHeight: z.number(),
  letterSpacing: z.number().optional(),
})

const CreateVariable = z.object({
  op: z.literal("createVariable"),
  collection: z.string(),
  name: z.string(),
  type: z.enum(["COLOR", "FLOAT", "STRING"]),
  value: z.any(),
})

const CreateComponent = z.object({
  op: z.literal("createComponent"),
  name: z.string(),
  category: z.enum(["atom", "molecule", "organism"]),
  variants: z.array(z.record(z.string())),
  autoLayout: z.object({
    direction: z.enum(["HORIZONTAL", "VERTICAL"]),
    gap: z.number(),
    padding: z.array(z.number()),
  }).optional(),
})

const CreateCoverPage = z.object({
  op: z.literal("createCoverPage"),
  systemName: z.string(),
  version: z.string(),
  palette: z.array(z.string()),
})

const ExportTokensJSON = z.object({
  op: z.literal("exportTokensJSON"),
  repo: z.string(),
  branch: z.string(),
})

const SyncNotion = z.object({
  op: z.literal("syncNotion"),
  pageId: z.string(),
  content: z.record(z.any()),
})

const CreateJiraTasks = z.object({
  op: z.literal("createJiraTasks"),
  projectKey: z.string(),
  tasks: z.array(z.object({ title: z.string(), description: z.string() })),
})

const OperationsSchema = z.array(
  z.discriminatedUnion("op", [
    CreatePage,
    CreateColorStyle,
    CreateTextStyle,
    CreateVariable,
    CreateComponent,
    CreateCoverPage,
    ExportTokensJSON,
    SyncNotion,
    CreateJiraTasks,
  ])
)

// ─── System prompt builder ───────────────────────────────────────────────────

function buildSystemPrompt(spec: any, brand: z.infer<typeof BrandInputSchema>): string {
  return `You are the execution engine of a Figma plugin that builds professional design systems.

DESIGN SYSTEM SPEC — authoritative source, do not change:
Style: ${spec.style ?? "not specified"}
Pattern: ${spec.pattern ?? "not specified"}
Colors:
  Primary:    ${spec.colors?.primary ?? "#000000"}
  Secondary:  ${spec.colors?.secondary ?? "#666666"}
  CTA:        ${spec.colors?.cta ?? "#0066FF"}
  Background: ${spec.colors?.background ?? "#FFFFFF"}
  Text:       ${spec.colors?.text ?? "#111111"}
Typography:
  Heading: ${spec.typography?.heading ?? "Inter"}
  Body:    ${spec.typography?.body ?? "Inter"}
Effects: ${spec.effects?.join(", ") ?? "none"}
Anti-patterns to NEVER use: ${spec.antiPatterns?.join(", ") ?? "none"}

BRAND OVERRIDES:
Name: ${brand.name}
Primary color override: ${brand.primaryColor ?? "use spec above"}
Tone: ${brand.tone ?? "default from spec"}

OUTPUT CONTRACT:
Reply ONLY with a valid JSON array of operations. Zero free text, zero markdown, no backticks.

Available operations and their exact shapes:
{ op: "createPage", name: string, index: number }
{ op: "createColorStyle", name: string, hex: string }
{ op: "createTextStyle", name: string, fontFamily: string, fontSize: number, fontWeight: number, lineHeight: number }
{ op: "createVariable", collection: string, name: string, type: "COLOR"|"FLOAT"|"STRING", value: any }
{ op: "createComponent", name: string, category: "atom"|"molecule"|"organism", variants: object[] }
{ op: "createCoverPage", systemName: string, version: string, palette: string[] }

MANDATORY naming convention: "Category/Subcategory/Variant" (e.g. "Colors/Brand/500", "Button/Primary/Default")
MANDATORY page structure order: Cover → Foundations → Tokens → Atoms → Molecules → Organisms → Changelog

Build a complete, production-ready design system. Include all foundations, a full semantic token layer, and at least 6 atom components with multiple variants and states each.`
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    })
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  const REASONING_URL = process.env.REASONING_SERVICE_URL
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

  if (!REASONING_URL || !ANTHROPIC_KEY) {
    return new Response("Missing environment variables", { status: 500 })
  }

  try {
    const body = await req.json()
    const brand = BrandInputSchema.parse(body)

    // ── Step 1: UI UX Pro Max reasoning ──────────────────────────────────────
    const reasoningRes = await fetch(`${REASONING_URL}/reason`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${brand.industry} ${brand.productType}`,
        project_name: brand.name,
      }),
    })

    if (!reasoningRes.ok) {
      const err = await reasoningRes.text()
      return new Response(JSON.stringify({ error: `Reasoning service error: ${err}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    }

    const spec = await reasoningRes.json()

    // ── Step 2: Claude API ────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: buildSystemPrompt(spec, brand),
        messages: [
          {
            role: "user",
            content: `Build the complete design system for "${brand.name}". Return ONLY the JSON array of operations.`,
          },
        ],
      }),
    })

    const claudeData = await claudeRes.json()
    const rawText = claudeData.content?.[0]?.text ?? ""

    // ── Step 3: Validate with Zod ─────────────────────────────────────────────
    const clean = rawText.replace(/```json|```/g, "").trim()
    const operations = OperationsSchema.parse(JSON.parse(clean))

    return new Response(
      JSON.stringify({ operations, spec, brand }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
