"""
Miya Web UI Backend API
FastAPI server serving VRM models, Gemini Live key, Chat API, and Miya PC bridge proxy.
Runs on port 8001. Miya Bridge runs on port 8000.
"""

import os
import sys
import json
import mimetypes
import httpx

# Ensure the server directory is in the path for modular imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv


# ── Dev StaticFiles: force correct MIME types for JSX/MJS ────────────────────
class DevStaticFiles(StaticFiles):
    """StaticFiles subclass that serves .jsx/.mjs as application/javascript."""
    _JS_MIME_OVERRIDES = {
        ".jsx": "application/javascript",
        ".mjs": "application/javascript",
        ".tsx": "application/javascript",
        ".ts": "application/javascript",
    }

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.headers.get("content-type", "").startswith("application/octet-stream"):
            import pathlib
            ext = pathlib.Path(path).suffix.lower()
            if ext in self._JS_MIME_OVERRIDES:
                response.headers["content-type"] = self._JS_MIME_OVERRIDES[ext]
        return response

# ── Brain Imports ─────────────────────────────────────────────────────────────
from personas.constants import BASE_MIYA_PROMPT

# ── Load environment variables ────────────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
MIYA_BRIDGE_URL = os.getenv("MIYA_BRIDGE_URL", "http://localhost:8000")

# ── Path resolution ───────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
client_dir = os.path.join(BASE_DIR, "client")
legacy_models_dir = os.path.join(BASE_DIR, "character_files", "modles")
public_models_dir = os.path.join(client_dir, "public", "models")
env_models_dir = os.getenv("MODELS_DIR")
models_dir = (
    env_models_dir
    if env_models_dir
    else (public_models_dir if os.path.exists(public_models_dir) else legacy_models_dir)
)

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Miya Hub", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"Base directory: {BASE_DIR}")
print(f"Client directory: {client_dir}")
print(f"Models directory: {models_dir}")
print(f"Gemini API Key loaded: {'✅' if GEMINI_API_KEY else '❌ MISSING'}")
print(f"Miya bridge URL: {MIYA_BRIDGE_URL}")

# ── Static files ──────────────────────────────────────────────────────────────
if os.path.exists(client_dir):
    # Only mount /static if the dist folder exists (production build)
    dist_dir = os.path.join(client_dir, "dist")
    if os.path.exists(dist_dir):
        app.mount("/static", StaticFiles(directory=dist_dir), name="static")
        print("✅ Static dist files mounted")
    else:
        # Dev mode: serve src/ and public/ so index.html can load JSX/CSS
        src_dir = os.path.join(client_dir, "src")
        if os.path.exists(src_dir):
            app.mount("/src", DevStaticFiles(directory=src_dir), name="src")
            print("✅ Dev source files mounted (/src)")
        public_dir = os.path.join(client_dir, "public")
        if os.path.exists(public_dir):
            app.mount("/public", DevStaticFiles(directory=public_dir), name="public")
            print("✅ Public assets mounted (/public)")
else:
    print("⚠️ Client directory not found!")

if os.path.exists(models_dir):
    app.mount("/models", StaticFiles(directory=models_dir), name="models")
    print("✅ Models mounted successfully")
else:
    print("⚠️ Models directory not found!")


# ── Pydantic models ───────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: list = []


class ExecuteRequest(BaseModel):
    command: str
    parameters: dict = {}


# ── Endpoints: root & health ──────────────────────────────────────────────────
@app.get("/")
async def root():
    index_path = os.path.join(client_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Miya Hub is running! Visit /docs for API documentation."}


@app.get("/favicon.ico")
async def favicon():
    favicon_path = os.path.join(client_dir, "public", "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path, media_type="image/x-icon")
    from fastapi.responses import Response
    return Response(content=b"", media_type="image/x-icon")


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "gemini_key": bool(GEMINI_API_KEY),
        "miya_bridge": MIYA_BRIDGE_URL,
    }


# ── Endpoint: Gemini API key (safe — only exposed to localhost client) ─────────
@app.get("/api/gemini-key")
async def get_gemini_key():
    """Return the Gemini API key to the browser client."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
    return {"key": GEMINI_API_KEY}


# ── Endpoint: text chat via Gemini (fallback / text mode) ────────────────────
@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Text chat using Gemini 2.0 Flash (REST, not realtime)."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
    try:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=BASE_MIYA_PROMPT,
        )
        # Build history
        history = []
        for msg in req.history:
            role = "user" if msg.get("role") == "user" else "model"
            history.append({"role": role, "parts": [msg.get("text", "")]})

        chat_session = model.start_chat(history=history)
        response = chat_session.send_message(req.message)
        return {"response": response.text}
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "Quota exceeded" in error_str:
            return {
                "response": "I'm sorry, it looks like my Gemini API key has run out of its free quota! You'll need to wait for it to reset or provide a new key."
            }
        elif "API key not valid" in error_str:
            return {
                "response": "Oops! The Gemini API key in your .env file seems to be invalid."
            }
        else:
            raise HTTPException(status_code=500, detail=error_str)


# ── Endpoint: proxy to Miya bridge ────────────────────────────────────────────
@app.post("/api/execute")
async def execute_proxy(req: ExecuteRequest):
    """Proxy execute commands to the Miya PC bridge server (port 8000)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{MIYA_BRIDGE_URL}/execute",
                json={"command": req.command, "parameters": req.parameters},
            )
            return response.json()
    except httpx.ConnectError:
        return {
            "success": False,
            "message": "Miya PC bridge server not running. Start it first.",
            "data": None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/miya-status")
async def miya_status():
    """Check if Miya PC bridge is running by pinging its health endpoint."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            # Most bridges have a /health or just / endpoint
            response = await client.get(f"{MIYA_BRIDGE_URL}/health")
            return {"online": response.status_code == 200, "url": MIYA_BRIDGE_URL}
    except Exception:
        return {"online": False, "url": MIYA_BRIDGE_URL}


# ── Endpoint: list VRM models ─────────────────────────────────────────────────
@app.get("/api/models")
async def list_models(request: Request):
    """List available VRM models."""
    models = []
    base_url = str(request.base_url).rstrip("/")
    if os.path.exists(models_dir):
        for filename in sorted(os.listdir(models_dir)):
            if filename.endswith(".vrm"):
                models.append(
                    {
                        "id": filename.replace(".vrm", ""),
                        "name": filename.replace(".vrm", "").replace("_", " ").title(),
                        "url": f"{base_url}/models/{filename}",
                    }
                )
    return {"models": models}


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    import uvicorn

    print("Starting Miya Hub Server on port 8001...")
    print("Visit http://localhost:8001 to see Miya!")
    print("Miya PC bridge should be running on port 8000")
    try:
        uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
    except KeyboardInterrupt:
        pass
    
    sys.exit(0)

