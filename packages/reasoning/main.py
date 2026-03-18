from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess, json, os, sys, logging
from typing import Optional
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Design System Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

SKILL_DIR = os.path.join(os.path.dirname(__file__), "skill")
SKILL_PATH = os.path.join(SKILL_DIR, "src/ui-ux-pro-max/scripts/search.py")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")


class ReasoningRequest(BaseModel):
    query: str
    project_name: str

class BrandInput(BaseModel):
    name: str
    industry: str
    productType: str
    primaryColor: Optional[str] = None
    tone: Optional[str] = None


@app.on_event("startup")
async def clone_skill():
    if not os.path.exists(SKILL_DIR):
        logger.info("Cloning UI UX Pro Max skill...")
        result = os.system("git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git skill")
        if result != 0:
            logger.error("Failed to clone skill repository")
        else:
            logger.info("Skill cloned successfully")
    else:
        logger.info("Skill already present")


def parse_ascii_output(raw: str) -> dict:
    result = {"style": None, "pattern": None, "colors": {}, "typography": {}, "effects": [], "antiPatterns": [], "checklist": [], "raw": raw}
    lines = raw.splitlines()
    section = None
    for line in lines:
        line = line.strip().strip("|").strip()
        if not line or line.startswith("+") or line.startswith("=") or "TARGET:" in line:
            continue
        if "STYLE:" in line:
            section = "style"
            val = line.split("STYLE:")[-1].strip()
            if val: result["style"] = val
        elif "PATTERN:" in line:
            section = "pattern"
            val = line.split("PATTERN:")[-1].strip()
            if val: result["pattern"] = val
        elif "COLORS:" in line:
            section = "colors"
        elif "TYPOGRAPHY:" in line:
            section = "typography"
        elif "KEY EFFECTS:" in line:
            section = "effects"
        elif "AVOID" in line or "Anti-pattern" in line.lower():
            section = "antiPatterns"
        elif "CHECKLIST" in line:
            section = "checklist"
        elif section == "colors":
            for key in ["Primary", "Secondary", "CTA", "Background", "Text"]:
                if line.startswith(key + ":"):
                    val = line.split(":", 1)[-1].strip().split()[0]
                    result["colors"][key.lower()] = val
        elif section == "typography":
            if ":" in line:
                parts = line.split(":", 1)
                k = parts[0].strip().lower()
                v = parts[1].strip()
                if k in ("heading", "body", "mood", "best for"):
                    result["typography"][k] = v
        elif section == "effects" and line:
            result["effects"] = [e.strip() for e in line.split("+") if e.strip()]
        elif section == "antiPatterns" and line and not line.startswith("["):
            result["antiPatterns"] = [a.strip() for a in line.split("+") if a.strip()]
        elif section == "checklist" and line.startswith("["):
            result["checklist"].append(line.lstrip("[ ] ").strip())
    return result


def build_system_prompt(spec: dict, brand: BrandInput) -> str:
    colors = spec.get("colors", {})
    typography = spec.get("typography", {})
    return f"""You are the execution engine of a Figma plugin that builds professional design systems.

DESIGN SYSTEM SPEC — authoritative source, do not change:
Style: {spec.get("style", "Flat Design")}
Pattern: {spec.get("pattern", "")}
Colors:
  Primary:    {colors.get("primary", "#0066FF")}
  Secondary:  {colors.get("secondary", "#666666")}
  CTA:        {colors.get("cta", "#FF6600")}
  Background: {colors.get("background", "#FFFFFF")}
  Text:       {colors.get("text", "#111111")}
Typography:
  Heading: {typography.get("heading", "Inter")}
  Body:    {typography.get("body", "Inter")}
  Mood:    {typography.get("mood", "")}
Effects: {", ".join(spec.get("effects", []))}
Anti-patterns to NEVER use: {", ".join(spec.get("antiPatterns", []))}

BRAND:
Name: {brand.name}
Primary color override: {brand.primaryColor or "use spec above"}
Tone: {brand.tone or "default from spec"}

OUTPUT CONTRACT:
Reply ONLY with a valid JSON array of operations. Zero free text, zero markdown, no backticks.

Available operations:
{{ "op": "createPage", "name": string, "index": number }}
{{ "op": "createColorStyle", "name": string, "hex": string }}
{{ "op": "createTextStyle", "name": string, "fontFamily": string, "fontSize": number, "fontWeight": number, "lineHeight": number }}
{{ "op": "createVariable", "collection": string, "name": string, "type": "COLOR"|"FLOAT"|"STRING", "value": any }}
{{ "op": "createComponent", "name": string, "category": "atom"|"molecule"|"organism", "variants": object[] }}
{{ "op": "createCoverPage", "systemName": string, "version": string, "palette": string[] }}

Naming: "Category/Subcategory/Variant"
Pages: Cover → Foundations → Tokens → Atoms → Molecules → Organisms → Changelog
Build a complete production-ready design system with all foundations, semantic tokens, and at least 6 atom components."""


@app.get("/health")
def health():
    return {"status": "ok", "skill_ready": os.path.exists(SKILL_PATH), "anthropic_key_set": bool(ANTHROPIC_API_KEY)}

@app.post("/reason")
def run_reasoning(req: ReasoningRequest):
    if not os.path.exists(SKILL_PATH):
        raise HTTPException(status_code=503, detail="Skill not ready.")
    try:
        result = subprocess.run(
            [sys.executable, SKILL_PATH, req.query, "--design-system", "--project-name", req.project_name],
            capture_output=True, text=True, timeout=30, cwd=SKILL_DIR
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=result.stderr)
        return parse_ascii_output(result.stdout.strip())
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Skill timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate")
async def generate_design_system(brand: BrandInput):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")
    if not os.path.exists(SKILL_PATH):
        raise HTTPException(status_code=503, detail="Skill not ready.")

    try:
        reasoning_result = subprocess.run(
            [sys.executable, SKILL_PATH, f"{brand.industry} {brand.productType}",
             "--design-system", "--project-name", brand.name],
            capture_output=True, text=True, timeout=30, cwd=SKILL_DIR
        )
        spec = parse_ascii_output(reasoning_result.stdout.strip())
        logger.info(f"Reasoning complete: style={spec.get('style')}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reasoning failed: {str(e)}")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 4000,
                    "system": build_system_prompt(spec, brand),
                    "messages": [{"role": "user", "content": f"Build the complete design system for \"{brand.name}\". Return ONLY the JSON array of operations."}]
                }
            )
        claude_data = response.json()
        raw_text = claude_data.get("content", [{}])[0].get("text", "")
        clean = raw_text.replace("```json", "").replace("```", "").strip()
        operations = json.loads(clean)
        logger.info(f"Claude returned {len(operations)} operations")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Claude output not valid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Claude API failed: {str(e)}")

    return {"operations": operations, "spec": spec, "brand": brand.dict()}
