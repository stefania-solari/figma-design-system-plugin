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
             "--design-system", "-p", req.project_name, "-f", "json"],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=SKILL_DIR
        )
        if result.returncode != 0:
            logger.error(f"Skill error: {result.stderr}")
            raise HTTPException(status_code=500, detail=result.stderr)

        raw = result.stdout.strip()
        return json.loads(raw)

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e} — stdout: {result.stdout[:500]}")
        raise HTTPException(status_code=500, detail="Skill output is not valid JSON")
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
