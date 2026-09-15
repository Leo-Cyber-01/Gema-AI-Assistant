import { VRMExpressionPresetName } from "@pixiv/three-vrm";
import * as THREE from "three";

/**
 * Micro-Expression Controller
 * Handles subtle, randomized facial movements to make the avatar feel 'alive'.
 */
export const createMicroExpressions = () => {
  let activeExpressions = [];
  let queue = [];

  const applyExpression = (vrm, type, intensity, duration) => {
    const manager = vrm?.expressionManager;
    if (!manager) return;

    let preset = null;
    switch (type) {
      case "brow_low": preset = VRMExpressionPresetName.Angry; break;
      case "brow_high": preset = VRMExpressionPresetName.Surprised; break;
      case "blink_soft": preset = VRMExpressionPresetName.Blink; break;
      case "joy_subtle": preset = VRMExpressionPresetName.Joy; break;
      default: return;
    }

    const startTime = performance.now();
    activeExpressions.push({
      preset,
      intensity,
      duration,
      startTime,
      cleanup: () => {
          try { manager.setValue(preset, 0); } catch(e) {}
      }
    });
  };

  const update = (vrm) => {
    const now = performance.now();
    const manager = vrm?.expressionManager;
    if (!manager) return;

    // Process queue
    while (queue.length > 0) {
      const json = queue.shift();
      if (json && Array.isArray(json.expressions)) {
        json.expressions.forEach(exp => {
          applyExpression(vrm, exp.type, exp.intensity, exp.duration);
        });
      }
    }

    activeExpressions = activeExpressions.filter((exp) => {
      const elapsed = now - exp.startTime;
      if (elapsed >= exp.duration) {
        exp.cleanup();
        return false;
      }

      // Simple ease-in-out envelope
      const progress = elapsed / exp.duration;
      const weight = Math.sin(progress * Math.PI);
      
      try {
        manager.setValue(exp.preset, exp.intensity * weight);
      } catch (e) {}
      
      return true;
    });

    // Subtle Eye Darting
    if (Math.random() > 0.99 && vrm.lookAt) {
        const offset = new THREE.Euler(
            (Math.random() - 0.5) * 0.05,
            (Math.random() - 0.5) * 0.1,
            0
        );
        vrm.lookAt.applier?.apply?.(offset);
    }
  };

  const push = (json) => {
    queue.push(json);
  };

  return { update, push };
};
