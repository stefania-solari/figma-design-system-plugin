from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess, json, os, sys, logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Design System Reasoning Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

SKILL_DIR = os.path.join(os.path.dirname(__file__), "skill")
SKILL_PATH = os.path.join(SKILL_DIR, "src/ui-ux-pro-max/scripts/search.py")


class ReasoningRequest(BaseModel):
    query: str
    project_name: str


@app.on_event("startup")
async def clone_skill():
    if not os.path.exists(SKILL_DIR):
        logger.info("Cloning UI UX Pro Max skill...")
        result = os.system(
            "git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git skill"
        )
        if result != 0:
            logger.error("Failed to clone skill repository")
        else:
            logger.info("Skill cloned successfully")
    else:
        logger.info("Skill already present, skipping clone")


def parse_ascii_output(raw: str) -> dict:
    """Parse the ASCII table output from search.py into a structured dict."""
    result = {
        "style": None,
        "pattern": None,
        "colors": {},
        "typography": {},
        "effects": [],
        "antiPatterns": [],
        "checklist": [],
        "raw": raw
    }

    lines = raw.splitlines()
    section = None

    for line in lines:
        line = line.strip().strip("|").strip()
        if not line or line.startswith("+") or line.startswith("=") or line.startswith("TARGET"):
            continue

        # Detect sections
        if "STYLE:" in line:
            section = "style"
            val = line.split("STYLE:")[-1].strip()
            if val:
                result["style"] = val
        elif "PATTERN:" in line:
            section = "pattern"
            val = line.split("PATTERN:")[-1].strip()
            if val:
                result["pattern"] = val
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
            # heading/body font inside typography block
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


@app.post("/reason")
def run_reasoning(req: ReasoningRequest):
    if not os.path.exists(SKILL_PATH):
        raise HTTPException(
            status_code=503,
            detail="Skill not ready yet. Retry in a few seconds."
        )
    try:
        logger.info(f"Running reasoning for: {req.query} / {req.project_name}")
        result = subprocess.run(
            [sys.executable, SKILL_PATH, req.query,
             "--design-system", "--project-name", req.project_name],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=SKILL_DIR
        )
        if result.returncode != 0:
            logger.error(f"Skill error: {result.stderr}")
            raise HTTPException(status_code=500, detail=result.stderr)

        raw = result.stdout.strip()
        logger.info(f"Raw output (first 300 chars): {raw[:300]}")
        return parse_ascii_output(raw)

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Skill timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {
        "status": "ok",
        "skill_ready": os.path.exists(SKILL_PATH),
        "skill_path": SKILL_PATH
    }
