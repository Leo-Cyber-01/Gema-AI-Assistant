import random
import time
from typing import Any, Dict

class RealTimeExpressionGenerator:
    """
    Generates real-time expression states to be sent alongside audio chunks.
    Controls blinking, eyes, brows, and mouth hints from the server.
    """
    def __init__(self):
        self.blink_timer = 0
        self.blink_duration_remaining = 0.0
        self.next_blink = random.uniform(3.5, 7.0) 
        self.last_update = time.time()
        self.silence_frames = 0
        self.is_speaking = False
        self.smoothed_volume = 0.0
        self.smoothed_brow = 0.0
        
    def update(self, is_speaking: bool, volume: float = 0.0) -> Dict[str, Any]:
        """
        Updates the internal state and returns the current expression data.
        """
        now = time.time()
        dt = now - self.last_update
        self.last_update = now
        self.is_speaking = is_speaking
        
        # 1. VOLUME SMOOTHING (High-cut filter for brow jitter)
        # We use a moving average to prevent the face from twitching with every audio chunk.
        self.smoothed_volume = self.smoothed_volume * 0.8 + volume * 0.2
        
        # 2. PAUSE DETECTION (With Hysteresis)
        # Slightly higher noise floor threshold
        threshold = 0.015 
        if volume < threshold:
            self.silence_frames += 1
        else:
            # Requires 2 frames of activity to break a long silence
            if self.silence_frames > 2:
                self.silence_frames -= 2 
            else:
                self.silence_frames = 0
            
        pause_level = 0
        if self.silence_frames > 30: # 1 second pause at ~30 FPS
            pause_level = 2
        elif self.silence_frames > 10: # Short gap
            pause_level = 1
            
        # 3. BLINK CONTROL (SERVER SIDE)
        blink_active = 0
        if self.is_speaking:
            # Blink less frequently but still blink while talking
            self.blink_timer += dt
            if self.blink_timer > (self.next_blink * 1.5):
                blink_active = 1
                self.blink_timer = 0
                self.next_blink = random.uniform(4.0, 8.0)
        else:
            if self.blink_duration_remaining > 0:
                self.blink_duration_remaining -= dt
                blink_active = 1
            else:
                self.blink_timer += dt
                if self.blink_timer > self.next_blink:
                    blink_active = 1
                    self.blink_duration_remaining = 0.15 
                    self.blink_timer = 0
                    self.next_blink = random.uniform(3.0, 6.0)
        
        # 4. EXPRESSION LOGIC
        target_eye_open = 1.0
        target_brow = 0.0
        mouth_bias = 1.0
        
        if self.is_speaking:
            target_eye_open = 1.0
            # Brows react to the SMOOTHED volume for stability
            target_brow = min(self.smoothed_volume * 0.35, 0.3)
            mouth_bias = 1.0
        else:
            if pause_level == 1:
                target_eye_open = 0.96
                mouth_bias = 0.7
            elif pause_level == 2:
                target_eye_open = 0.92
                mouth_bias = 0.0
        
        # Smooth the brow movement output
        self.smoothed_brow = self.smoothed_brow * 0.85 + target_brow * 0.15
        
        return {
            "isSpeaking": self.is_speaking,
            "blink": blink_active,
            "eyeOpen": round(target_eye_open, 3),
            "brow": round(self.smoothed_brow, 3),
            "mouthBias": round(mouth_bias, 2),
            "pauseLevel": pause_level
        }
