import asyncio
import json
import logging
import os
import sys
import websockets
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("verify_relay")

# Constants
RELAY_URL = os.getenv("MIYA_WS_URL", "ws://localhost:8765")
TIMEOUT = 15.0

async def verify_relay_handshake():
    """Verify that the relay server accepts connections and performs the initial handshake."""
    logger.info(f"Connecting to relay at {RELAY_URL}...")
    
    try:
        async with websockets.connect(RELAY_URL) as ws:
            logger.info("Connected to WebSocket server.")
            
            # 1. Wait for session.connected
            logger.info("Waiting for 'session.connected' message...")
            msg = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
            payload = json.loads(msg)
            
            if payload.get("type") != "session.connected":
                logger.error(f"Unexpected initial message: {payload.get('type')}")
                return False
            
            logger.info(f"Handshake successful! Model: {payload.get('model')}")
            
            # 2. Test a basic text turn
            test_text = "Hello Miya, can you hear me? Just say 'Yes'."
            logger.info(f"Sending test text turn: '{test_text}'")
            await ws.send(json.dumps({
                "type": "input.text",
                "text": test_text
            }))
            
            # 3. Wait for progress indicators (transcript, audio, or text)
            logger.info("Waiting for Gemini response (audio or text)...")
            start_time = asyncio.get_event_loop().time()
            got_response = False
            
            while asyncio.get_event_loop().time() - start_time < TIMEOUT:
                msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                payload = json.loads(msg)
                msg_type = payload.get("type")
                
                if msg_type in ["output.audio", "output.text", "output.transcript"]:
                    logger.info(f"Received {msg_type} from Gemini!")
                    got_response = True
                    break
                
                if msg_type == "error":
                    logger.error(f"Received error from relay: {payload.get('message')}")
                    return False

            if not got_response:
                logger.error("Timed out waiting for Gemini response.")
                return False
            
            logger.info("Relay verification PASSED.")
            return True

    except ConnectionRefusedError:
        logger.error(f"Connection refused. Is 'server.py' running at {RELAY_URL}?")
        return False
    except asyncio.TimeoutError:
        logger.error("Verification TIMEOUT.")
        return False
    except Exception as e:
        logger.exception(f"An unexpected error occurred: {e}")
        return False

if __name__ == "__main__":
    # Ensure current dir is in path for imports if needed
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    load_dotenv()
    
    success = asyncio.run(verify_relay_handshake())
    if success:
        logger.info("======================================")
        logger.info("VERIFICATION COMPLETE: RELAY IS HEALTHY")
        logger.info("======================================")
        sys.exit(0)
    else:
        logger.error("======================================")
        logger.error("VERIFICATION FAILED: CHECK LOGS")
        logger.error("======================================")
        sys.exit(1)
