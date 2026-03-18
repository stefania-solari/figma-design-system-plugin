// ─── Types ────────────────────────────────────────────────────────────────────

type Operation =
  | { op: "createPage"; name: string; index: number }
  | { op: "createColorStyle"; name: string; hex: string; opacity?: number }
  | { op: "createTextStyle"; name: string; fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing?: number }
  | { op: "createVariable"; collection: string; name: string; type: "COLOR" | "FLOAT" | "STRING"; value: any }
  | { op: "createComponent"; name: string; category: "atom" | "molecule" | "organism"; variants: Record<string, string>[] }
  | { op: "createCoverPage"; systemName: string; version: string; palette: string[] }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): RGB {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return { r, g, b }
}

function getOrCreateCollection(name: string): VariableCollection {
  return (
    figma.variables.getLocalVariableCollections().find((c) => c.name === name) ??
    figma.variables.createVariableCollection(name)
  )
}

// ─── Operation executors ──────────────────────────────────────────────────────

async function execCreatePage(op: Extract<Operation, { op: "createPage" }>) {
  const page = figma.createPage()
  page.name = op.name
  // Move to correct index
  figma.root.insertChild(op.index, page)
}

async function execCreateColorStyle(op: Extract<Operation, { op: "createColorStyle" }>) {
  const style = figma.createPaintStyle()
  style.name = op.name
  style.paints = [{
    type: "SOLID",
    color: hexToRgb(op.hex),
    opacity: op.opacity ?? 1,
  }]
}

async function execCreateTextStyle(op: Extract<Operation, { op: "createTextStyle" }>) {
  await figma.loadFontAsync({ family: op.fontFamily, style: "Regular" }).catch(() =>
    figma.loadFontAsync({ family: "Inter", style: "Regular" })
  )
  const style = figma.createTextStyle()
  style.name = op.name
  style.fontName = { family: op.fontFamily, style: "Regular" }
  style.fontSize = op.fontSize
  style.lineHeight = { value: op.lineHeight, unit: "PERCENT" }
  if (op.letterSpacing !== undefined) {
    style.letterSpacing = { value: op.letterSpacing, unit: "PERCENT" }
  }
}

async function execCreateVariable(op: Extract<Operation, { op: "createVariable" }>) {
  const collection = getOrCreateCollection(op.collection)
  const variable = figma.variables.createVariable(op.name, collection, op.type)
  variable.setValueForMode(collection.defaultModeId, op.value)
}

async function execCreateComponent(op: Extract<Operation, { op: "createComponent" }>) {
  const page = figma.currentPage
  const component = figma.createComponent()
  component.name = op.name
  component.resize(200, 48)

  // Auto layout
  component.layoutMode = "HORIZONTAL"
  component.paddingLeft = 16
  component.paddingRight = 16
  component.paddingTop = 8
  component.paddingBottom = 8
  component.itemSpacing = 8
  component.primaryAxisAlignItems = "CENTER"
  component.counterAxisAlignItems = "CENTER"

  // Label
  await figma.loadFontAsync({ family: "Inter", style: "Regular" })
  const label = figma.createText()
  label.characters = op.name.split("/").pop() ?? op.name
  label.fontSize = 14
  component.appendChild(label)

  page.appendChild(component)
}

async function execCreateCoverPage(op: Extract<Operation, { op: "createCoverPage" }>) {
  const page = figma.createPage()
  page.name = "Cover"
  figma.root.insertChild(0, page)

  const frame = figma.createFrame()
  frame.name = "Cover"
  frame.resize(1440, 900)
  frame.fills = [{ type: "SOLID", color: { r: 0.97, g: 0.97, b: 0.97 } }]

  await figma.loadFontAsync({ family: "Inter", style: "Bold" })
  await figma.loadFontAsync({ family: "Inter", style: "Regular" })

  const title = figma.createText()
  title.characters = op.systemName
  title.fontSize = 64
  title.fontName = { family: "Inter", style: "Bold" }
  title.x = 80
  title.y = 80
  frame.appendChild(title)

  const version = figma.createText()
  version.characters = `v${op.version}`
  version.fontSize = 16
  version.fontName = { family: "Inter", style: "Regular" }
  version.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }]
  version.x = 80
  version.y = 160
  frame.appendChild(version)

  // Palette swatches
  op.palette.forEach((hex, i) => {
    const swatch = figma.createRectangle()
    swatch.resize(80, 80)
    swatch.x = 80 + i * 96
    swatch.y = 220
    swatch.cornerRadius = 8
    swatch.fills = [{ type: "SOLID", color: hexToRgb(hex) }]
    frame.appendChild(swatch)
  })

  page.appendChild(frame)
}

// ─── Main executor ────────────────────────────────────────────────────────────

async function executeAll(operations: Operation[]) {
  let count = 0
  for (const op of operations) {
    try {
      switch (op.op) {
        case "createPage":        await execCreatePage(op); break
        case "createColorStyle":  await execCreateColorStyle(op); break
        case "createTextStyle":   await execCreateTextStyle(op); break
        case "createVariable":    await execCreateVariable(op); break
        case "createComponent":   await execCreateComponent(op); break
        case "createCoverPage":   await execCreateCoverPage(op); break
      }
      count++
    } catch (err: any) {
      console.error(`[sandbox] Failed op ${op.op}:`, err.message)
    }
  }
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
