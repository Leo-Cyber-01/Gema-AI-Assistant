import random
import time
from typing import Any, Dict, List

class MicroExpressionGenerator:
    """
    Generates JSON payloads for facial movements based on conversational context.
    """
    
    EMOTION_MAP = {
        "joy": [
            {"type": "joy_subtle", "intensity": 0.4, "duration": 1800},
            {"type": "blink_soft", "intensity": 1.0, "duration": 250}
        ],
        "surprise": [
            {"type": "brow_high", "intensity": 0.5, "duration": 1000},
            {"type": "blink_soft", "intensity": 1.0, "duration": 200}
        ],
        "thinking": [
            {"type": "thoughtful_tilt", "intensity": 1.0, "duration": 2500},
            {"type": "brow_low", "intensity": 0.25, "duration": 2200},
            {"type": "blink_soft", "intensity": 1.0, "duration": 300}
        ],
        "angry": [
            {"type": "brow_low", "intensity": 0.6, "duration": 1500}
        ],
        "neutral": [
            {"type": "blink_soft", "intensity": 1.0, "duration": 250}
        ]
    }

    @classmethod
    def analyze_text(cls, text: str) -> str:
        """Simple keyword-based emotion detection."""
        text = text.lower()
        if any(w in text for w in ["haha", "lol", "yay", "wonderful", "amazing", "happy", "😊", "✨"]):
            return "joy"
        if any(w in text for w in ["what", "really", "wow", "unbelievable", "how", "?!"]):
            return "surprise"
        if any(w in text for w in ["hmm", "think", "let me see", "interesting", "searching"]):
            return "thinking"
        if any(w in text for w in ["no", "stop", "bad", "angry", "hate", "😡"]):
            return "angry"
        return "neutral"

    @classmethod
    def generate_from_text(cls, text: str) -> Dict[str, Any]:
        """Creates a payload based on detected sentiment."""
        emotion = cls.analyze_text(text)
        expressions = cls.EMOTION_MAP.get(emotion, cls.EMOTION_MAP["neutral"])
        
        # Add slight randomization to intensity
        for exp in expressions:
            exp["intensity"] = round(exp["intensity"] * random.uniform(0.8, 1.2), 2)

        return {
            "type": "micro-expression",
            "emotion": emotion,
            "expressions": expressions,
            "timestamp": time.time()
        }

    @classmethod
    def generate_random_sequence(cls) -> Dict[str, Any]:
        """Fallback for idle movements."""
        exp_type = random.choice(["brow_low", "brow_high", "blink_soft", "joy_subtle"])
        return {
            "type": "micro-expression",
            "expressions": [{
                "type": exp_type,
                "intensity": round(random.uniform(0.1, 0.3), 2),
                "duration": random.randint(1200, 2500) # Increased duration
            }],
            "timestamp": time.time()
        }
