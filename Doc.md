# Project Miya - Technical Documentation

## Tech Stack

### Frontend
- **Framework**: React 19 (Vite)
- **3D Rendering**: Three.js with `@react-three/fiber` and `@react-three/drei`
- **VRM Support**: `@pixiv/three-vrm`
- **Styling**: TailwindCSS 4
- **State Management**: React Hooks (and potentially Leva for UI controls)

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **LLM**: OpenAI GPT / Google Gemini (via `google-genai` and `google-generativeai`)
- **ASR (Speech-to-Text)**: Faster-Whisper
- **TTS (Text-to-Speech)**: GPT-SoVITS
- **Communication**: WebSockets for real-time interaction

### DevOps
- **Containerization**: Docker & Docker Compose
- **Package Management**: `uv` (Python), `npm`/`yarn` (JS)

## Current Features
1. **Interactive VRM Avatar**: 3D visualization of Miya with animations and emotion-based lip-sync.
2. **Real-time Multimodal Dialogue**: Gemini Live integration for voice, vision, and text interaction.
3. **Advanced PC Control (Miya PC Bridge)**: Proactive system automation via function calls:
    - **System**: Volume, brightness, window management, screenshot, lock.
    - **Apps**: WhatsApp (send message), YouTube/Spotify control, Open any app.
    - **Web**: Google Search, Real-time News.
    - **Utilities**: Health assist (safe mode), File operations, Page scrolling.
4. **Gender-Aware Personas**: Sophisticated, gender-accurate Hindi/Hinglish grammar for all personas (Jashu, Miya, Ahani).
5. **Dynamic Persona Selection**: Real-time switching between Miya, Jashu, and Ahani, updating VRM, voice, and system instructions instantly.
6. **Character-Driven Ambient Effects**:
    - **Dynamic Lighting**: Persona-specific mood lighting and rim glows (Pink, Blue, Lavender).
    - **Synchronized Sparkles**: Particle effects that match the active persona's theme.
7. **Lifelike Facial Animations**:
    - **Smart Blinking**: Natural randomized single-eye winks.
    - **Status-Aware State**: Auto-pausing idle animations when the AI is Thinking or Speaking for better micro-expression focus.
8. **Advanced PC Control (Miya PC Bridge)**: Proactive system automation via function calls:

## Architecture
The system follows a Client-Server architecture with a modularized AI brain:

### Backend Structure
- **server/main.py**: REST API for general operations and text-based chat.
- **server/server.py**: Real-time WebSocket relay for Gemini Live multimodal interaction.
- **server/brain/**: The "Brain" of the system, containing LLM and persona logic.
    - `persona.py`: Manages different AI personalities (Miya, Jashu, Ahani).
    - `llm_configs.py`: Configures LLM tools and capabilities (e.g., system commands, web search).
    - `llm_client.py`: Handles connection and authentication for various LLM providers.

### Client Structure
- **client/src/App.jsx**: Main application component.
- **client/src/geminiLive.js**: Lightweight relay client for WebSocket communication.
- **client/src/face/lipsync.js**: Core logic for VRM visemes and emotion mapping.
- **client/src/components/**: UI and 3D experience components.
2. **Brain**: Determines how the AI responds based on the selected persona and configures the LLM's "intelligence" and available tools.
3. **Server**: Orchestrates the communication between the client and the LLM (Gemini/OpenAI) via the Brain's configurations.
