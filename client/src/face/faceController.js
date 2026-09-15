import { VRMExpressionPresetName } from "@pixiv/three-vrm";
import * as THREE from "three";
import { LipSyncEngine } from "./lipSyncEngine";
import { setVrmExpressionValue } from "../lib/vrmExpressions";
import { detectVisemeMode, getVisemeValues } from "./visemeMap";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/**
 * Unified Face Controller - Server-Driven Version
 * Manages LipSync and applies Real-Time Expressions sent from the server.
 * This version HAS NO local random blinking logic.
 */
export const createFaceController = ({ getAnalyser } = {}) => {
  let engine = null;
  let activeMicroExps = [];
  let queue = [];
  let visemeMode = null; // Detected on first VRM load
  
  // Internal State
  const state = {
    visemes: { aa: 0, ee: 0, oh: 0 },
    headOffset: new THREE.Euler(),
    eyeOffset: new THREE.Euler(),
    emotion: "neutral",
    
    // Coordinated Expression State
    isSpeaking: false,
    isShortPause: false,
    isLongPause: true,
    speechEnergy: 0,
    
    // Server-Sent State (The Source of Truth)
    serverExpression: null,
    
    // Smoothed values for transitions
    smoothedBrow: 0,
    smoothedEyeOpen: 1.0,
    smoothedBlink: 0,
    mouthBias: 1.0,
    
    // Target for eye lerping to prevent jitter
    targetEyeOffset: new THREE.Euler()
  };

  const applyMicroExpression = (vrm, type, intensity, duration) => {
    let presets = [];
    switch (type) {
      case "brow_low": presets = [{ name: 'angry', val: intensity }]; break;
      case "brow_high": presets = [{ name: 'surprised', val: intensity }]; break;
      case "blink_soft": presets = [{ name: 'blink', val: intensity }]; break;
      case "joy_subtle": presets = [{ name: 'happy', val: intensity }, { name: 'surprised', val: intensity * 0.2 }]; break;
      case "thoughtful_tilt": 
        state.headOffset.z = (Math.random() - 0.5) * 0.15; 
        state.headOffset.x = 0.05;
        break;
      default: return;
    }

    const startTime = performance.now();
    activeMicroExps.push({
      presets,
      duration,
      startTime,
      cleanup: () => {
        presets.forEach(p => setVrmExpressionValue(vrm, p.name, 0));
        state.headOffset.set(0, 0, 0);
      }
    });
  };

  /**
   * Sets the expression state provided by the server WebSocket.
   */
  const setServerExpression = (exp) => {
    state.serverExpression = exp;
  };

  const update = (vrm, { 
    isSpeaking: isInputSpeaking, 
    sampleRate = 24000, 
    emotion = "neutral",
    enableLipSync = true,
    enableMicroExps = true,
    enableThoughtTilts = true
  }) => {
    if (!vrm) return;
    state.emotion = emotion;
    const now = performance.now();

    // Auto-detect viseme mode on first VRM load
    if (!visemeMode) {
      visemeMode = detectVisemeMode(vrm);
    }

    // 1. PROCESS LIP SYNC (Driven by Audio)
    if (enableLipSync) {
      const analyser = getAnalyser();
      if (analyser) {
        if (!engine || engine.analyser !== analyser) engine = new LipSyncEngine(analyser);
        const result = engine.update(sampleRate, isInputSpeaking);
        
        state.isSpeaking = result.isSpeaking;
        state.isShortPause = result.isShortPause;
        state.isLongPause = result.isLongPause;
        state.speechEnergy = result.normalizedVolume;

        const mb = state.serverExpression?.mouthBias ?? 1.0;
        state.mouthBias = state.mouthBias * 0.8 + mb * 0.2;

        state.visemes = { 
            aa: result.aa * state.mouthBias, 
            ee: result.ee * state.mouthBias, 
            oh: result.oh * state.mouthBias 
        };

        // Apply visemes using compatibility layer (VRM0/VRM2/Oculus)
        if (visemeMode?.mode === 'oculus') {
          // Oculus mode: use 15-viseme morph targets
          const aaVis = getVisemeValues('aa', 'oculus', state.visemes.aa);
          const eeVis = getVisemeValues('E', 'oculus', state.visemes.ee);
          const ohVis = getVisemeValues('O', 'oculus', state.visemes.oh);
          if (aaVis.oculusTarget) setVrmExpressionValue(vrm, aaVis.oculusTarget, aaVis.oculusWeight);
          if (eeVis.oculusTarget) setVrmExpressionValue(vrm, eeVis.oculusTarget, eeVis.oculusWeight);
          if (ohVis.oculusTarget) setVrmExpressionValue(vrm, ohVis.oculusTarget, ohVis.oculusWeight);
        } else {
          // Preset mode: map to VRM Aa/Ee/Oh
          setVrmExpressionValue(vrm, 'aa', state.visemes.aa);
          setVrmExpressionValue(vrm, 'ee', state.visemes.ee);
          setVrmExpressionValue(vrm, 'oh', state.visemes.oh);
        }

        // Tongue and Teeth heuristics
        setVrmExpressionValue(vrm, 'teeth', (state.visemes.aa > 0.4 || state.visemes.ee > 0.3) ? 0.7 : 0);
        setVrmExpressionValue(vrm, 'tongue', state.visemes.aa * 0.25);
      }
    }

    // 2. APPLY SERVER EXPRESSIONS (Blink/Eyes/Brows)
    if (state.serverExpression) {
        const targetBlink = state.serverExpression.blink === 1 ? 1.0 : 0.0;
        const targetEyeOpen = state.serverExpression.eyeOpen ?? 1.0;
        const targetBrow = state.serverExpression.brow ?? 0.0;

        if (targetBlink > 0.5) {
            state.smoothedBlink = state.smoothedBlink * 0.3 + 1.0 * 0.7;
        } else {
            state.smoothedBlink = state.smoothedBlink * 0.7 + 0.0 * 0.3;
        }
        
        state.smoothedEyeOpen = state.smoothedEyeOpen * 0.9 + targetEyeOpen * 0.1;
        state.smoothedBrow = state.smoothedBrow * 0.9 + targetBrow * 0.1;
    } else {
        state.smoothedEyeOpen = state.smoothedEyeOpen * 0.98 + 1.0 * 0.02;
        state.smoothedBlink = state.smoothedBlink * 0.8 + 0;
        state.smoothedBrow = state.smoothedBrow * 0.9 + 0;
    }

    // 3. APPLY TO VRM
    const effectiveBlink = Math.max(state.smoothedBlink, 1.0 - state.smoothedEyeOpen);
    setVrmExpressionValue(vrm, 'blink', effectiveBlink);
    setVrmExpressionValue(vrm, 'surprised', state.smoothedBrow);

    // 4. PROCESS MICRO-EXPRESSIONS
    if (enableMicroExps) {
      while (queue.length > 0) {
        const payload = queue.shift();
        if (payload.expressions) {
          payload.expressions.forEach(e => applyMicroExpression(vrm, e.type, e.intensity, e.duration));
        }
      }
    }

    // 5. UPDATE ACTIVE MICRO-EXPRESSIONS
    if (enableMicroExps) {
      activeMicroExps = activeMicroExps.filter((exp) => {
        const elapsed = now - exp.startTime;
        if (elapsed >= exp.duration) {
          exp.cleanup();
          return false;
        }
        const progress = elapsed / exp.duration;
        const weight = Math.sin(progress * Math.PI);
        exp.presets?.forEach(p => {
          setVrmExpressionValue(vrm, p.name, p.val * weight);
        });
        return true;
      });
    }

    // 6. IDLE EYE DARTING
    if (enableMicroExps) {
      if (Math.random() > 0.998) {
        state.targetEyeOffset.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.05, 0);
      }
      state.eyeOffset.x = state.eyeOffset.x * 0.97 + state.targetEyeOffset.x * 0.03;
      state.eyeOffset.y = state.eyeOffset.y * 0.97 + state.targetEyeOffset.y * 0.03;
      
      if (vrm.lookAt) vrm.lookAt.applier?.apply?.(state.eyeOffset);
    }

    // Subtle Head Sway
    const sway = Math.sin(now * 0.001) * 0.012;
    const head = vrm.humanoid?.getRawBoneNode("head");
    if (head) {
      if (enableThoughtTilts) {
        head.rotation.x += state.headOffset.x + sway;
        head.rotation.z += state.headOffset.z;
      } else {
        head.rotation.x += sway;
      }
    }

    // 7. BASELINE EMOTIONS
    if (emotion === "joy" || emotion === "happy") setVrmExpressionValue(vrm, 'happy', 0.3);
    if (emotion === "angry") setVrmExpressionValue(vrm, 'angry', 0.5);
    if (emotion === "surprised") setVrmExpressionValue(vrm, 'surprised', 0.4);
    if (emotion === "sad" || emotion === "sorrow") setVrmExpressionValue(vrm, 'sad', 0.4);
    if (emotion === "relaxed" || emotion === "gentle") setVrmExpressionValue(vrm, 'relaxed', 0.3);
  };

  const push = (json) => queue.push(json);

  return { update, push, setServerExpression };
};
