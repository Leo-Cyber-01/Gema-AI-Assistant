"""
LLM Client initialization and model resolution.
"""
import os
import logging
from google import genai
from google.genai import types

logger = logging.getLogger("miya.brain.llm_client")

def resolve_live_model() -> str:
    """Resolve the Gemini Live model name from environment or defaults."""
    explicit_model = os.getenv("GEMINI_LIVE_MODEL")
    if explicit_model:
        logger.info("Using GEMINI_LIVE_MODEL from environment: %s", explicit_model)
        return explicit_model

    # Prefer 2.0-flash-exp for Live features if available
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        model = "gemini-2.0-flash-exp"
        logger.info("Defaulting to stable live model: %s", model)
        return model

    # Fallback for Vertex AI or other setups
    model = "gemini-2.0-flash-live-preview-04-09"
    logger.info("Using fallback preview model: %s", model)
    return model


def create_genai_client() -> genai.Client:
    """Create and return a Gemini API client."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    location = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")

    if api_key:
        logger.info(
            "Using Gemini API key authentication (api_version=v1alpha)"
        )
        return genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(api_version="v1alpha"),
        )

    if project:
        logger.info(
            "Using Vertex AI authentication (project=%s, location=%s)",
            project,
            location,
        )
        return genai.Client(vertexai=True, project=project, location=location)

    raise RuntimeError(
        "No Gemini credentials configured. Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT."
    )
