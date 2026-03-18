// ─── Types ────────────────────────────────────────────────────────────────────

type Operation =
  | { op: "createPage"; name: string; index: number }
  | { op: "createColorStyle"; name: string; hex: string; opacity?: number }
  | { op: "createTextStyle"; name: string; fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing?: number }
  | { op: "createVariable"; collection: string; name: string; type: "COLOR" | "FLOAT" | "STRING"; value: any }
  | { op: "createComponent"; name: string; category: "atom" | "molecule" | "organism"; variants: Record<string, string>[] }
  | { op: "createCoverPage"; systemName: string; version: string; palette: string[] }

// ─── State ────────────────────────────────────────────────────────────────────

// Maps page name → page node
const pageMap: Record<string, PageNode> = {}
let currentX = 80
let currentY = 80
const GRID_COL_WIDTH = 280
const GRID_ROW_HEIGHT = 160
const COLS = 4

function getPageForCategory(category: string): PageNode {
  const map: Record<string, string> = {
    atom: "Atoms",
    molecule: "Molecules",
    organism: "Organisms",
  }
  const pageName = map[category] ?? "Atoms"
  return pageMap[pageName] ?? figma.currentPage
}

function nextPosition(page: PageNode): { x: number; y: number } {
  // Count existing top-level children to determine position
  const count = page.children.length
  const col = count % COLS
  const row = Math.floor(count / COLS)
  return {
    x: 80 + col * (GRID_COL_WIDTH + 40),
    y: 120 + row * (GRID_ROW_HEIGHT + 60),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "")
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  }
}

function getOrCreateCollection(name: string): VariableCollection {
  return (
    figma.variables.getLocalVariableCollections().find((c) => c.name === name) ??
    figma.variables.createVariableCollection(name)
  )
}

async function addSectionLabel(page: PageNode, text: string) {
  await figma.loadFontAsync({ family: "Inter", style: "Bold" })
  const label = figma.createText()
  label.characters = text
  label.fontSize = 13
  label.fontName = { family: "Inter", style: "Bold" }
  label.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }]
  label.x = 80
  label.y = 80
  page.appendChild(label)
}

// ─── Operation executors ──────────────────────────────────────────────────────

async function execCreatePage(op: Extract<Operation, { op: "createPage" }>) {
  // Check if page already exists
  const existing = figma.root.children.find(p => p.name === op.name)
  if (existing && existing.type === "PAGE") {
    pageMap[op.name] = existing
    return
  }
  const page = figma.createPage()
  page.name = op.name
  pageMap[op.name] = page

  // Add section label to page
  await addSectionLabel(page, op.name)
}

async function execCreateColorStyle(op: Extract<Operation, { op: "createColorStyle" }>) {
  // Check if style already exists
  const existing = figma.getLocalPaintStyles().find(s => s.name === op.name)
  if (existing) return

  const style = figma.createPaintStyle()
  style.name = op.name
  style.paints = [{
    type: "SOLID",
    color: hexToRgb(op.hex),
    opacity: op.opacity ?? 1,
  }]

  // Also render a swatch on Foundations page
  const foundationsPage = pageMap["Foundations"]
  if (foundationsPage) {
    const count = foundationsPage.children.filter(n => n.type === "FRAME" || n.type === "RECTANGLE").length
    const col = count % 8
    const row = Math.floor(count / 8)

    const swatch = figma.createFrame()
    swatch.resize(80, 80)
    swatch.x = 80 + col * 96
    swatch.y = 120 + row * 120
    swatch.cornerRadius = 8
    swatch.fills = [{ type: "SOLID", color: hexToRgb(op.hex) }]
    swatch.name = op.name

    await figma.loadFontAsync({ family: "Inter", style: "Regular" })
    const label = figma.createText()
    label.characters = op.name.split("/").pop() ?? op.name
    label.fontSize = 10
    label.fontName = { family: "Inter", style: "Regular" }
    label.fills = [{ type: "SOLID", color: { r: 0.3, g: 0.3, b: 0.3 } }]
    label.x = swatch.x
    label.y = swatch.y + 88
    label.resize(80, 16)

    foundationsPage.appendChild(swatch)
    foundationsPage.appendChild(label)
  }
}

async function execCreateTextStyle(op: Extract<Operation, { op: "createTextStyle" }>) {
  const existing = figma.getLocalTextStyles().find(s => s.name === op.name)
  if (existing) return

  try {
    await figma.loadFontAsync({ family: op.fontFamily, style: "Regular" })
  } catch {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" })
    op.fontFamily = "Inter"
  }

  const style = figma.createTextStyle()
  style.name = op.name
  style.fontName = { family: op.fontFamily, style: "Regular" }
  style.fontSize = op.fontSize
  style.lineHeight = { value: op.lineHeight, unit: "PIXELS" }
  if (op.letterSpacing !== undefined) {
    style.letterSpacing = { value: op.letterSpacing, unit: "PERCENT" }
  }

  // Render type sample on Foundations page
  const foundationsPage = pageMap["Foundations"]
  if (foundationsPage) {
    await figma.loadFontAsync({ family: op.fontFamily, style: "Regular" })
    const sample = figma.createText()
    sample.characters = `${op.name.split("/").pop()} — ${op.fontSize}px`
    sample.fontSize = Math.min(op.fontSize, 32)
    sample.fontName = { family: op.fontFamily, style: "Regular" }
    sample.name = op.name

    const typeCount = foundationsPage.children.filter(n => n.type === "TEXT").length
    sample.x = 80
    sample.y = 500 + typeCount * (Math.min(op.fontSize, 32) + 12)
    foundationsPage.appendChild(sample)
  }
}

async function execCreateVariable(op: Extract<Operation, { op: "createVariable" }>) {
  try {
    const collection = getOrCreateCollection(op.collection)
    const existing = figma.variables.getLocalVariables().find(
      v => v.name === op.name && v.variableCollectionId === collection.id
    )
    if (existing) return

    const variable = figma.variables.createVariable(op.name, collection, op.type)

    if (op.type === "COLOR" && typeof op.value === "string" && op.value.startsWith("#")) {
      const rgb = hexToRgb(op.value)
      variable.setValueForMode(collection.defaultModeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 })
    } else {
      variable.setValueForMode(collection.defaultModeId, op.value)
    }
  } catch (e) {
    console.error(`[sandbox] createVariable failed for ${op.name}:`, e)
  }
}

async function execCreateComponent(op: Extract<Operation, { op: "createComponent" }>) {
  const page = getPageForCategory(op.category)
  figma.currentPage = page

  await figma.loadFontAsync({ family: "Inter", style: "Regular" })
  await figma.loadFontAsync({ family: "Inter", style: "Medium" })

  const { x, y } = nextPosition(page)

  if (op.variants && op.variants.length > 0) {
    // Create component set with variants
    const components: ComponentNode[] = []

    for (const variant of op.variants) {
      const comp = figma.createComponent()
      const variantLabel = Object.entries(variant).map(([k, v]) => `${k}=${v}`).join(", ")
      comp.name = variantLabel
      comp.resize(200, 48)
      comp.layoutMode = "HORIZONTAL"
      comp.paddingLeft = 16
      comp.paddingRight = 16
      comp.paddingTop = 10
      comp.paddingBottom = 10
      comp.primaryAxisAlignItems = "CENTER"
      comp.counterAxisAlignItems = "CENTER"
      comp.cornerRadius = 6
      comp.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.97 } }]

      const label = figma.createText()
      label.characters = op.name.split("/").pop() ?? op.name
      label.fontSize = 13
      label.fontName = { family: "Inter", style: "Medium" }
      label.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.15 } }]
      comp.appendChild(label)

      components.push(comp)
    }

    try {
      const compSet = figma.combineAsVariants(components, page)
      compSet.name = op.name
      compSet.x = x
      compSet.y = y
      compSet.layoutMode = "HORIZONTAL"
      compSet.layoutWrap = "WRAP"
      compSet.itemSpacing = 16
      compSet.counterAxisSpacing = 16
      compSet.paddingLeft = 16
      compSet.paddingRight = 16
      compSet.paddingTop = 16
      compSet.paddingBottom = 16
      compSet.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 1 } }]
      compSet.strokes = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.9 } }]
      compSet.strokeWeight = 1
      compSet.cornerRadius = 8
    } catch {
      // fallback: just place components individually
      components.forEach((comp, i) => {
        comp.x = x + i * 220
        comp.y = y
        page.appendChild(comp)
      })
    }
  } else {
    // Single component
    const comp = figma.createComponent()
    comp.name = op.name
    comp.resize(200, 48)
    comp.x = x
    comp.y = y
    comp.layoutMode = "HORIZONTAL"
    comp.paddingLeft = 16
    comp.paddingRight = 16
    comp.paddingTop = 10
    comp.paddingBottom = 10
    comp.primaryAxisAlignItems = "CENTER"
    comp.counterAxisAlignItems = "CENTER"
    comp.cornerRadius = 6
    comp.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.97 } }]

    await figma.loadFontAsync({ family: "Inter", style: "Medium" })
    const label = figma.createText()
    label.characters = op.name.split("/").pop() ?? op.name
    label.fontSize = 13
    label.fontName = { family: "Inter", style: "Medium" }
    comp.appendChild(label)

    page.appendChild(comp)
  }
}

async function execCreateCoverPage(op: Extract<Operation, { op: "createCoverPage" }>) {
  let page = pageMap["Cover"]
  if (!page) {
    page = figma.createPage()
    page.name = "Cover"
    figma.root.insertChild(0, page)
    pageMap["Cover"] = page
  }

  figma.currentPage = page

  const frame = figma.createFrame()
  frame.name = "Cover"
  frame.resize(1440, 900)
  frame.x = 0
  frame.y = 0
  frame.fills = [{ type: "SOLID", color: { r: 0.97, g: 0.97, b: 0.99 } }]
  page.appendChild(frame)

  await figma.loadFontAsync({ family: "Inter", style: "Bold" })
  await figma.loadFontAsync({ family: "Inter", style: "Regular" })

  const title = figma.createText()
  title.characters = op.systemName
  title.fontSize = 72
  title.fontName = { family: "Inter", style: "Bold" }
  title.fills = [{ type: "SOLID", color: { r: 0.05, g: 0.05, b: 0.1 } }]
  title.x = 80
  title.y = 80
  frame.appendChild(title)

  const subtitle = figma.createText()
  subtitle.characters = "Design System"
  subtitle.fontSize = 24
  subtitle.fontName = { family: "Inter", style: "Regular" }
  subtitle.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.6 } }]
  subtitle.x = 80
  subtitle.y = 170
  frame.appendChild(subtitle)

  const version = figma.createText()
  version.characters = `v${op.version}`
  version.fontSize = 14
  version.fontName = { family: "Inter", style: "Regular" }
  version.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.7 } }]
  version.x = 80
  version.y = 210
  frame.appendChild(version)

  // Palette swatches
  op.palette.forEach((hex, i) => {
    const swatch = figma.createRectangle()
    swatch.resize(100, 100)
    swatch.x = 80 + i * 120
    swatch.y = 280
    swatch.cornerRadius = 12
    swatch.fills = [{ type: "SOLID", color: hexToRgb(hex) }]
    frame.appendChild(swatch)
  })
}

// ─── Main executor ────────────────────────────────────────────────────────────

async function executeAll(operations: Operation[]) {
  let count = 0

  // First pass: create all pages so pageMap is populated
  for (const op of operations) {
    if (op.op === "createPage" || op.op === "createCoverPage") {
      try {
        if (op.op === "createPage") await execCreatePage(op)
        else await execCreateCoverPage(op)
        count++
      } catch (err: any) {
        console.error(`[sandbox] Failed ${op.op}:`, err.message)
      }
    }
  }

  // Second pass: everything else
  for (const op of operations) {
    if (op.op === "createPage" || op.op === "createCoverPage") continue
    try {
      switch (op.op) {
        case "createColorStyle":  await execCreateColorStyle(op); break
        case "createTextStyle":   await execCreateTextStyle(op); break
        case "createVariable":    await execCreateVariable(op); break
        case "createComponent":   await execCreateComponent(op); break
      }
      count++
    } catch (err: any) {
      console.error(`[sandbox] Failed op ${op.op}:`, err.message)
    }
  }

  // Go to Cover page at the end
  const cover = pageMap["Cover"] ?? pageMap["Foundations"]
  if (cover) figma.currentPage = cover

  return count
}

// ─── Message listener ─────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg) => {
  if (msg.type !== "EXECUTE") return

  try {
    const count = await executeAll(msg.operations)
    figma.ui.postMessage({ type: "DONE", count })
    figma.notify(`Design system created — ${count} elements`)
  } catch (err: any) {
    figma.ui.postMessage({ type: "ERROR", message: err.message })
    figma.notify("Error: " + err.message, { error: true })
  }
}

figma.showUI(__html__, { width: 380, height: 520 })
