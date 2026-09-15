import { VRMExpressionPresetName } from "@pixiv/three-vrm";
import { LipSyncEngine } from "./lipSyncEngine";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/**
 * VRM LipSync Adapter
 * Bridges LipSyncEngine frequency data to VRM expressions.
 */
export const createLipSync = ({
  getAnalyser: initialGetAnalyser,
} = {}) => {
  let engine = null;
  let getAnalyser = initialGetAnalyser || (() => null);

  const setVisemeSource = (nextSource) => {
    // Adapter for backward compatibility
    getAnalyser = nextSource;
    engine = null; // Re-init engine on next update
  };

  const update = (vrm, { isSpeaking = true, emotion = "neutral", sampleRate = 24000 } = {}) => {
    if (!vrm) return 0;

    const analyser = getAnalyser();
    if (!analyser) return 0;

    // Initialize engine once analyser is available
    if (!engine || engine.analyser !== analyser) {
      engine = new LipSyncEngine(analyser);
    }

    // Get smoothed viseme levels from engine
    const visemes = engine.update(sampleRate, isSpeaking);

    // Map to VRM
    // Core engine provides aa, ee, oh
    vrm.expressionManager.setValue(VRMExpressionPresetName.Aa, visemes.aa);
    vrm.expressionManager.setValue(VRMExpressionPresetName.Ee, visemes.ee);
    vrm.expressionManager.setValue(VRMExpressionPresetName.Oh, visemes.oh);
    
    // Derived values
    const jawOpen = visemes.aa;
    const mouthWidth = visemes.ee * 0.5;

    // Moods Integration
    const isJoy = emotion === "joy" || emotion === "happy";
    if (isJoy) {
        const joyValue = clamp(0.1 + mouthWidth * 0.4 + jawOpen * 0.1, 0, 0.7);
        vrm.expressionManager.setValue(VRMExpressionPresetName.Joy, joyValue);
    }

    const isAngry = emotion === "angry";
    if (isAngry) vrm.expressionManager.setValue(VRMExpressionPresetName.Angry, 0.8);

    const isSorrow = emotion === "sorrow" || emotion === "sad";
    if (isSorrow) vrm.expressionManager.setValue(VRMExpressionPresetName.Sorrow, 0.7);

    const isSurprised = emotion === "surprised";
    if (isSurprised) vrm.expressionManager.setValue(VRMExpressionPresetName.Surprised, 0.8);

    return jawOpen;
  };

  return { update, setVisemeSource };
};
