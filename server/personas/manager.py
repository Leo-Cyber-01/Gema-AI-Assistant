"""
Manager for persona loading and system instruction generation.
"""

from .constants import (
    LLM_SYSTEM_INSTRUCTION,
    CREATOR_INFO,
    BASE_MODALITY_INSTRUCTION,
    CONVERSATION_STYLE
)
from .definitions import PERSONA_MAPPING, DEFAULT_PERSONA

from guardrails import get_safety_guardrails
from rules import get_system_rules

def get_persona_prompt(voice_name: str) -> str:
    """Get the specific behavior prompt for a persona."""
    persona = PERSONA_MAPPING.get(voice_name, PERSONA_MAPPING[DEFAULT_PERSONA])
    return persona["behavior"]

def get_persona_name(voice_name: str) -> str:
    """Get the name for a persona."""
    persona = PERSONA_MAPPING.get(voice_name, PERSONA_MAPPING[DEFAULT_PERSONA])
    return persona["name"]

def get_full_system_instruction(voice_name: str = DEFAULT_PERSONA) -> str:
    """Generate the full system instruction for Gemini/LLM."""
    persona = PERSONA_MAPPING.get(voice_name, PERSONA_MAPPING[DEFAULT_PERSONA])
    behavior = persona["behavior"]
    name = persona["name"]

    # Base instruction with name injected
    base_instruction = LLM_SYSTEM_INSTRUCTION.strip().format(AI_NAME=name)

    # Fetch dynamic rules and guardrails
    guardrails = get_safety_guardrails()
    rules = get_system_rules()

    return f"""
{base_instruction}

--- BEHAVIOR ---
{behavior}

--- SYSTEM RULES ---
{rules}

--- GUARDRAILS ---
{guardrails}

--- DEVELOPER INFO ---
{CREATOR_INFO}

--- MODALITY INFO ---
{BASE_MODALITY_INSTRUCTION}

--- STYLE ---
{CONVERSATION_STYLE}
""".strip()
