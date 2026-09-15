# Project Knowledge Base

This file tracks the changes, decisions, and progress of the Miya project.

## Initial State (Before Session)
- **Backend**: FastAPI server handling LLM (GPT/Gemini), TTS (GPT-SoVITS), and ASR (Faster-Whisper).
- **Frontend**: React + Three.js + Vite client for VRM model visualization and interaction.
- **Features**: Voice synthesis, Speech recognition, LLM-based dialogue, Conversation memory.
- **Status**: Core pipeline implemented, Docker support available.

## Session Log - April 6, 2026

### Task 10: Branding Refactor (Zerox to Miya)
- **Change**: Renamed all instances of "Zerox" to "Miya" in frontend constants, backend relay, documentation, and the bridge proxy.
- **Reason**: To complete the project's rebranding.

### Task 11: Gemini Live SDK Refactor
- **Change**: Migrated from deprecated `session.send()` to modern `google-genai` Methods (`send_realtime_input`, `send_client_content`).
- **Reason**: To resolve `extra_forbidden` Pydantic validation errors and ensure long-term stability.

### Task 12: Smarter Eye Blinking
- **Change**: Implemented natural, randomized single-eye winks and winks.
- **Change**: Synchronized idling with AI status; blinking now automatically pauses when the AI is **THINKING** or **SPEAKING**.
- **Reason**: To make the avatar's face feel more alive and prevent "bubble-eye" sync issues during speech.

### Task 13: Dynamic Persona Selection
- **Change**: Integrated a persona switching system for Miya, Jashu, and Ahani.
- **Change**: Switching a persona instantly updates the VRM model, voice, system instructions, and UI theme.
- **Reason**: To support multiple unique AI companions within a single interface.

### Task 14: Character-Driven Lighting Sync
- **Change**: Implemented dynamic 3D lighting and particle effects (Sparkles) that synchronize with the active persona's theme color (Pink, Blue, Lavender).
- **Change**: Added a "Rim Light" effect to the avatar for better depth and visual premium.
- **Reason**: To create an immersive, character-specific atmosphere.
