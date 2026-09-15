"""
Gemini Live multimodal relay server.

This server sits between the browser client and Gemini Live. It accepts
browser-side microphone audio, screen-share frames, and typed text over a
single WebSocket connection and forwards them to a Live API session created
with the `google-genai` SDK.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import sys

# Ensure the server directory is in the path for modular imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dataclasses import dataclass
from typing import Any

import websockets
from dotenv import load_dotenv
from google import genai
from google.genai import types
from websockets.asyncio.server import ServerConnection
from websockets.exceptions import ConnectionClosed, ConnectionClosedError

# ── Brain Imports (Persona & LLM Logic) ───────────────────────────────────────
from personas import get_full_system_instruction
from brain.llm_client import create_genai_client, resolve_live_model
from brain.micro_expressions import MicroExpressionGenerator
from brain.expression_generator import RealTimeExpressionGenerator

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("miya.gemini_relay")

DEFAULT_HOST = os.getenv("MIYA_WS_HOST", "0.0.0.0")
DEFAULT_PORT = int(os.getenv("MIYA_WS_PORT", "8765"))
DEFAULT_VOICE = os.getenv("MIYA_GEMINI_VOICE", "Aoede")
DEFAULT_IMAGE_MIME = "image/jpeg"
DEFAULT_INPUT_RATE = 16000
DEFAULT_OUTPUT_RATE = 24000
MAX_AUDIO_QUEUE = int(os.getenv("MIYA_MAX_AUDIO_QUEUE", "16"))
MAX_BROWSER_QUEUE = int(os.getenv("MIYA_MAX_BROWSER_QUEUE", "32"))

def blob_to_base64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def base64_to_bytes(data: str) -> bytes:
    if "," in data and data.startswith("data:"):
        data = data.split(",", 1)[1]
    return base64.b64decode(data)


def parse_sample_rate(mime_type: str | None, fallback: int = DEFAULT_OUTPUT_RATE) -> int:
    if not mime_type:
        return fallback
    for part in mime_type.split(";")[1:]:
        key, _, value = part.strip().partition("=")
        if key.lower() == "rate":
            try:
                return int(value)
            except ValueError:
                return fallback
    return fallback


@dataclass(slots=True)
class BrowserMessage:
    raw: dict[str, Any]

    @property
    def kind(self) -> str:
        return str(self.raw.get("type", "")).strip()

    @property
    def data(self) -> str:
        return str(self.raw.get("data", "")).strip()

    @property
    def text(self) -> str:
        return str(self.raw.get("text", "")).strip()

    @property
    def mime_type(self) -> str | None:
        value = self.raw.get("mimeType")
        return str(value).strip() if value else None

    @property
    def sample_rate(self) -> int:
        value = self.raw.get("sampleRate", DEFAULT_INPUT_RATE)
        try:
            return int(value)
        except (TypeError, ValueError):
            return DEFAULT_INPUT_RATE


class GeminiLiveRelaySession:
    def __init__(self, websocket: ServerConnection, voice_name: str = DEFAULT_VOICE) -> None:
        self.websocket = websocket
        self.client = create_genai_client()
        self.model = resolve_live_model()
        self.session: Any | None = None
        self.audio_queue: asyncio.Queue[BrowserMessage] = asyncio.Queue(maxsize=MAX_AUDIO_QUEUE)
        self.browser_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=MAX_BROWSER_QUEUE)
        self.lock = asyncio.Lock()
        self.closed = False
        self.session_alive = False
        self.receive_task: asyncio.Task[None] | None = None
        self.audio_send_task: asyncio.Task[None] | None = None
        self.browser_send_task: asyncio.Task[None] | None = None
        self.micro_exp_task: asyncio.Task[None] | None = None
        self.voice_name = voice_name
        self.exp_generator = RealTimeExpressionGenerator()
        self.is_currently_speaking = False

    async def connect(self) -> None:
        async with self.lock:
            if self.session is not None:
                return

            # Wait briefly to ensure this isn't a ghost connection from React StrictMode
            await asyncio.sleep(0.8)
            if self.closed:
                logger.debug("Cancelling Gemini connection: browser already disconnected")
                return

            persona_instruction = get_full_system_instruction(self.voice_name)
            logger.info("Initializing session for persona voice: %s", self.voice_name)

            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                system_instruction=persona_instruction,
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=self.voice_name,
                        )
                    )
                ),
                input_audio_transcription=types.AudioTranscriptionConfig(),
                output_audio_transcription=types.AudioTranscriptionConfig(),
            )

            # aio.live.connect() returns an async context manager
            # We need to enter it and keep the session alive
            self._session_cm = self.client.aio.live.connect(
                model=self.model,
                config=config,
            )
            logger.debug("Entering Gemini session context...")
            self.session = await self._session_cm.__aenter__()
            self.session_alive = True
            logger.info("Gemini session connected (model=%s)", self.model)
            
            if self.receive_task and not self.receive_task.done():
                self.receive_task.cancel()
                try:
                    await self.receive_task
                except asyncio.CancelledError:
                    pass

            self.receive_task = asyncio.create_task(
                self._receive_from_gemini(),
                name="gemini-live-receive",
            )
            
            if not self.audio_send_task or self.audio_send_task.done():
                self.audio_send_task = asyncio.create_task(
                    self._audio_sender_loop(),
                    name="gemini-live-audio-send",
                )
            
            if not self.browser_send_task or self.browser_send_task.done():
                self.browser_send_task = asyncio.create_task(
                    self._browser_sender_loop(),
                    name="browser-sender",
                )

            if not self.micro_exp_task or self.micro_exp_task.done():
                self.micro_exp_task = asyncio.create_task(
                    self._micro_expression_loop(),
                    name="micro-expressions",
                )

            await self.send_json(
                {
                    "type": "session.connected",
                    "model": self.model,
                    "voice": DEFAULT_VOICE,
                }
            )

    async def ensure_session(self) -> None:
        if self.session is None:
            await self.connect()

    async def handle_browser_message(self, browser_message: BrowserMessage) -> None:
        await self.ensure_session()

        if browser_message.kind == "ping":
            await self.send_json({"type": "pong"})
            return

        if browser_message.kind == "input.audio":
            self._enqueue_audio(browser_message)
            return

        if browser_message.kind == "input.audio_end":
            await self._send_audio_stream_end()
            return

        if browser_message.kind == "input.image":
            await self._send_image_frame(browser_message)
            return

        if browser_message.kind == "input.text":
            await self._send_text_turn(browser_message)
            return

        if browser_message.kind == "session.reset":
            await self.restart()
            return

        await self.send_json(
            {
                "type": "error",
                "message": f"Unsupported message type: {browser_message.kind}",
            }
        )

    def _enqueue_audio(self, browser_message: BrowserMessage) -> None:
        if self.closed or not self.session_alive:
            return
        try:
            self.audio_queue.put_nowait(browser_message)
        except asyncio.QueueFull:
            try:
                _ = self.audio_queue.get_nowait()
                self.audio_queue.task_done()
            except asyncio.QueueEmpty:
                pass
            try:
                self.audio_queue.put_nowait(browser_message)
            except asyncio.QueueFull:
                logger.debug("Dropped audio chunk because relay queue is full")

    async def _audio_sender_loop(self) -> None:
        try:
            while not self.closed:
                browser_message = await self.audio_queue.get()
                try:
                    if not self.session_alive or self.session is None:
                        continue
                    await self._send_audio_chunk(browser_message)
                finally:
                    self.audio_queue.task_done()
        except asyncio.CancelledError:
            raise

    async def _send_audio_chunk(self, browser_message: BrowserMessage) -> None:
        if not self.session_alive or self.session is None:
            return
        audio_bytes = base64_to_bytes(browser_message.data)
        mime_type = browser_message.mime_type or f"audio/pcm;rate={browser_message.sample_rate}"
        try:
            logger.debug("Sending audio chunk to Gemini (%d bytes)", len(audio_bytes))
            # Use recommended method in modern SDK
            await self.session.send_realtime_input(
                media=types.Blob(data=audio_bytes, mime_type=mime_type)
            )
        except Exception as exc:
            logger.error("Error sending audio to Gemini: %s", exc)
            await self._mark_session_dead(exc)

    async def _send_audio_stream_end(self) -> None:
        if not self.session_alive or self.session is None:
            return
        try:
            logger.info("Sending audio stream end to Gemini")
            # Modern SDK uses direct parameter on send_realtime_input
            await self.session.send_realtime_input(end_of_turn=True)
        except Exception as exc:
            await self._mark_session_dead(exc)

    async def _send_image_frame(self, browser_message: BrowserMessage) -> None:
        if not self.session_alive or self.session is None:
            return
        try:
            image_bytes = base64_to_bytes(browser_message.data)
            mime_type = browser_message.mime_type or DEFAULT_IMAGE_MIME
            logger.debug("Sending image frame to Gemini (%d bytes)", len(image_bytes))
            await self.session.send_realtime_input(
                media=types.Blob(data=image_bytes, mime_type=mime_type)
            )
        except Exception as exc:
            logger.error("Error sending image to Gemini: %s", exc)
            await self._mark_session_dead(exc)

    async def _send_text_turn(self, browser_message: BrowserMessage) -> None:
        if not browser_message.text or not self.session_alive or self.session is None:
            return
        try:
            logger.info("Sending text turn to Gemini: %s", browser_message.text)
            
            # Trigger expression based on user input
            exp_payload = MicroExpressionGenerator.generate_from_text(browser_message.text)
            await self.send_json(exp_payload)

            # Use unified send with fallback
            # Use recommended method for text turns
            await self.session.send_client_content(
                turns=[types.Content(role="user", parts=[types.Part(text=browser_message.text)])],
                turn_complete=True
            )
        except Exception as exc:
            logger.error("Error sending text to Gemini: %s", exc)
            await self._mark_session_dead(exc)

    async def restart(self) -> None:
        await self.close()
        self.closed = False
        await self.connect()

    async def _micro_expression_loop(self) -> None:
        """Periodically send real-time expression updates when AI is not speaking."""
        try:
            while not self.closed:
                # Higher frequency for smoother idle movements (e.g., 10fps idle update)
                await asyncio.sleep(0.1)
                
                if self.session_alive and not self.closed and not self.is_currently_speaking:
                    expression = self.exp_generator.update(is_speaking=False, volume=0)
                    await self.send_json({
                        "type": "output.expression",
                        "expression": expression
                    })
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("Micro-expression loop error: %s", exc)

    async def _receive_from_gemini(self) -> None:
        try:
            async for message in self.session.receive():
                # DEBUG: Log all incoming message types
                msg_types = []
                for attr in ["setup_complete", "server_content", "tool_call", "go_away"]:
                    if getattr(message, attr, None):
                        msg_types.append(attr)
                if msg_types:
                    logger.debug("Received message from Gemini: %s", ", ".join(msg_types))

                if getattr(message, "setup_complete", None):
                    await self.send_json({"type": "session.ready"})

                if getattr(message, "server_content", None):
                    await self._handle_server_content(message.server_content)

                if getattr(message, "go_away", None):
                    await self.send_json(
                        {
                            "type": "session.go_away",
                            "timeLeft": getattr(message.go_away, "time_left", None),
                        }
                    )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Gemini receive loop failed: %s", exc)
            await self._mark_session_dead(exc)

    async def _mark_session_dead(self, exc: Exception) -> None:
        if self.closed:
            return
        
        self.session_alive = False
        error_msg = str(exc)
        logger.warning("Gemini live session interrupted: %s", error_msg)
        
        # Proactively attempt to reconnect instead of just dying
        logger.info("Attempting automatic Gemini session recovery...")
        try:
            # Cleanup the dead session properly before reconnecting
            if self.session is not None:
                try:
                    logger.debug("Cleaning up old Gemini session...")
                    await asyncio.wait_for(
                        self._session_cm.__aexit__(None, None, None),
                        timeout=2.0
                    )
                except Exception as cleanup_exc:
                    logger.debug("Gemini session cleanup failed: %s", cleanup_exc)
                finally:
                    self.session = None
            
            # Reset queues to prevent backlog issues on reconnect
            while not self.audio_queue.empty():
                try: self.audio_queue.get_nowait()
                except asyncio.QueueEmpty: break
            
            await self.connect()
            logger.info("Gemini session recovered successfully.")
            return
        except Exception as recovery_exc:
            logger.error("Failed to recover Gemini session: %s", recovery_exc, exc_info=True)

        await self.send_json({"type": "session.disconnected", "message": error_msg})

    async def _handle_server_content(self, server_content: Any) -> None:
        if getattr(server_content, "input_transcription", None):
            text = getattr(server_content.input_transcription, "text", None)
            if text:
                await self.send_json({"type": "input.transcript", "text": text})

        if getattr(server_content, "output_transcription", None):
            text = getattr(server_content.output_transcription, "text", None)
            if text:
                # Trigger expression based on Gemini's speech
                exp_payload = MicroExpressionGenerator.generate_from_text(text)
                await self.send_json(exp_payload)
                await self.send_json({"type": "output.transcript", "text": text})

        model_turn = getattr(server_content, "model_turn", None)
        if model_turn and getattr(model_turn, "parts", None):
            for part in model_turn.parts:
                inline_data = getattr(part, "inline_data", None)
                if inline_data and getattr(inline_data, "data", None):
                    mime_type = getattr(inline_data, "mime_type", "audio/pcm")
                    if "audio/pcm" in mime_type:
                        # Simple energy calculation for expression reactivity
                        import numpy as np
                        audio_data = np.frombuffer(inline_data.data, dtype=np.int16)
                        volume = np.abs(audio_data).mean() / 32768.0 if len(audio_data) > 0 else 0
                        
                        expression = self.exp_generator.update(is_speaking=True, volume=volume)
                        
                        await self.send_json(
                            {
                                "type": "output.audio",
                                "data": blob_to_base64(inline_data.data),
                                "mimeType": mime_type,
                                "sampleRate": parse_sample_rate(mime_type),
                                "expression": expression
                            }
                        )
                    else:
                        await self.send_json(
                            {
                                "type": "output.inline_data",
                                "data": blob_to_base64(inline_data.data),
                                "mimeType": mime_type,
                            }
                        )

                text = getattr(part, "text", None)
                if text:
                    await self.send_json({"type": "output.text", "text": text})

        if getattr(server_content, "interrupted", None):
            await self.send_json({"type": "turn.interrupted"})

        if getattr(server_content, "generation_complete", None):
            self.is_currently_speaking = False
            await self.send_json({"type": "generation.complete"})

        if getattr(server_content, "turn_complete", None):
            self.is_currently_speaking = False
            # Send one final idle expression state
            expression = self.exp_generator.update(is_speaking=False, volume=0)
            await self.send_json(
                {
                    "type": "turn.complete",
                    "reason": getattr(server_content, "turn_complete_reason", None),
                    "expression": expression
                }
            )

        if getattr(server_content, "waiting_for_input", None):
            await self.send_json({"type": "session.waiting_for_input"})

    async def send_json(self, payload: dict[str, Any]) -> None:
        if self.closed:
            return
        try:
            self.browser_queue.put_nowait(payload)
        except asyncio.QueueFull:
            # If the browser is really far behind, we drop old audio or transcripts
            # to prevent stalling the Gemini connection
            try:
                _ = self.browser_queue.get_nowait()
                self.browser_queue.task_done()
            except asyncio.QueueEmpty:
                pass
            
            try:
                self.browser_queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.debug("Dropped outgoing browser message because queue is full")

    async def _browser_sender_loop(self) -> None:
        try:
            while not self.closed:
                payload = await self.browser_queue.get()
                try:
                    await self.websocket.send(json.dumps(payload))
                except ConnectionClosed:
                    self.closed = True
                    break
                except Exception as exc:
                    logger.error("Failed to send message to browser: %s", exc)
                finally:
                    self.browser_queue.task_done()
        except asyncio.CancelledError:
            raise

    async def close(self) -> None:
        self.closed = True
        self.session_alive = False
        if self.receive_task:
            self.receive_task.cancel()
            try:
                await self.receive_task
            except asyncio.CancelledError:
                pass
            self.receive_task = None

        if self.audio_send_task:
            self.audio_send_task.cancel()
            try:
                await self.audio_send_task
            except asyncio.CancelledError:
                pass
            self.audio_send_task = None

        if self.browser_send_task:
            self.browser_send_task.cancel()
            try:
                await self.browser_send_task
            except asyncio.CancelledError:
                pass
            self.browser_send_task = None

        if self.session is not None:
            try:
                # Exit the async context manager properly
                await self._session_cm.__aexit__(None, None, None)
            except Exception:
                logger.debug("Gemini session context exit raised", exc_info=True)
            self.session = None


class MiyaGeminiRelayServer:
    def __init__(self, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> None:
        self.host = host
        self.port = port

    async def handle_connection(self, websocket: ServerConnection) -> None:
        # Extract voice/persona from query parameters
        path = getattr(websocket, "request", None)
        path_str = path.path if path else "/"
        
        voice_name = DEFAULT_VOICE
        if "?" in path_str:
            from urllib.parse import parse_qs, urlparse
            query = urlparse(path_str).query
            params = parse_qs(query)
            if "voice" in params:
                voice_name = params["voice"][0]
            elif "persona" in params:
                # Map persona name to default voice if only persona provided
                p_name = params["persona"][0]
                from personas import PERSONA_MAPPING
                for v, meta in PERSONA_MAPPING.items():
                    if meta["name"].lower() == p_name.lower():
                        voice_name = v
                        break

        relay = GeminiLiveRelaySession(websocket, voice_name=voice_name)
        remote = getattr(websocket, "remote_address", None)
        logger.info("Browser connected from %s (Voice: %s)", remote, voice_name)

        try:
            await relay.connect()
            async for message in websocket:
                try:
                    payload = json.loads(message)
                    await relay.handle_browser_message(BrowserMessage(payload))
                except json.JSONDecodeError:
                    await relay.send_json(
                        {"type": "error", "message": "Invalid JSON payload from client"}
                    )
                except Exception as exc:
                    logger.exception("Failed to process browser message: %s", exc)
                    await relay.send_json({"type": "error", "message": str(exc)})
        except ConnectionClosedError:
            logger.info("Browser websocket closed abruptly: %s", remote)
        except ConnectionClosed:
            logger.info("Browser websocket closed: %s", remote)
        finally:
            await relay.close()
            logger.info("Browser disconnected: %s", remote)

    async def run(self) -> None:
        async with websockets.serve(
            self.handle_connection,
            self.host,
            self.port,
            max_size=8 * 1024 * 1024,
            ping_interval=30,
            ping_timeout=60,
        ):
            logger.info("Gemini relay listening on ws://%s:%s", self.host, self.port)
            await asyncio.Future()


if __name__ == "__main__":
    import sys
    try:
        asyncio.run(MiyaGeminiRelayServer().run())
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Gemini relay server stopped gracefully.")
        sys.exit(0)
