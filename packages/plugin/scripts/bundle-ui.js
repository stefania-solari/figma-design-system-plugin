const fs = require("fs")
const path = require("path")

const html = fs.readFileSync(path.join(__dirname, "../src/ui.html"), "utf8")
const js = fs.readFileSync(path.join(__dirname, "../dist/ui.js"), "utf8")

const combined = html.replace("</body>", `<script>${js}</script></body>`)

fs.mkdirSync(path.join(__dirname, "../dist"), { recursive: true })
fs.writeFileSync(path.join(__dirname, "../dist/ui.html"), combined)

console.log("UI bundled successfully → dist/ui.html")
