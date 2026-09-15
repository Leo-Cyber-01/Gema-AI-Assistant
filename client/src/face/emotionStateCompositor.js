/**
 * emotionStateCompositor.js — Local Emotion State & Seed Compositor
 *
 * Implements a persistent emotion state machine and local seed compositor
 * for Gemini Live avatars.
 *
 * Architecture:
 *   Gemini semantic signal → Emotion State Machine (persistence, smoothing)
 *   → Local Emotion Seeds (happy, curious, loving, sad, surprised, etc.)
 *   → Local Compositor (weighted multi-emotion blending)
 *   → VRM Expression Target (52D / preset targets)
 *
 * Rules:
 *   1. No signal / null / undefined / none does NOT reset state (persistence).
 *   2. Meaningful signals activate or reinforce emotion seeds.
 *   3. Multiple emotions can coexist simultaneously.
 *   4. Explicit "neutral" or timeout triggers gradual release.
 *   5. Gemini never generates expression math or blend weights.
 */

import { VRMExpressionPresetName } from "@pixiv/three-vrm";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

// ── Emotion Seeds Library ───────────────────────────────────────
// Maps semantic emotion names to VRM presets and ARKit/blendshape influences.
const EMOTION_SEEDS = {
  happy: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.35,
    blendshapes: { browInnerUp: 0.15, cheekSquintLeft: 0.2, cheekSquintRight: 0.2 },
  },
  joy: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.4,
    blendshapes: { browInnerUp: 0.2, cheekSquintLeft: 0.25, cheekSquintRight: 0.25 },
  },
  sad: {
    preset: VRMExpressionPresetName.Sad,
    baseIntensity: 0.35,
    blendshapes: { browDownLeft: 0.2, browDownRight: 0.2, eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1 },
  },
  sorrow: {
    preset: VRMExpressionPresetName.Sad,
    baseIntensity: 0.35,
    blendshapes: { browDownLeft: 0.2, browDownRight: 0.2 },
  },
  angry: {
    preset: VRMExpressionPresetName.Angry,
    baseIntensity: 0.4,
    blendshapes: { browDownLeft: 0.3, browDownRight: 0.3, noseSneerLeft: 0.15, noseSneerRight: 0.15 },
  },
  anger: {
    preset: VRMExpressionPresetName.Angry,
    baseIntensity: 0.4,
    blendshapes: { browDownLeft: 0.3, browDownRight: 0.3 },
  },
  surprised: {
    preset: VRMExpressionPresetName.Surprised,
    baseIntensity: 0.5,
    blendshapes: { browOuterUpLeft: 0.3, browOuterUpRight: 0.3, eyeWideLeft: 0.2, eyeWideRight: 0.2 },
  },
  surprise: {
    preset: VRMExpressionPresetName.Surprised,
    baseIntensity: 0.5,
    blendshapes: { browOuterUpLeft: 0.3, browOuterUpRight: 0.3, eyeWideLeft: 0.2, eyeWideRight: 0.2 },
  },
  curious: {
    preset: VRMExpressionPresetName.Relaxed,
    baseIntensity: 0.25,
    blendshapes: { browInnerUp: 0.15, eyeWideLeft: 0.1, eyeWideRight: 0.1 },
  },
  loving: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.3,
    blendshapes: { cheekSquintLeft: 0.15, cheekSquintRight: 0.15, browInnerUp: 0.05 },
  },
  shy: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.2,
    blendshapes: { eyeLookDownLeft: 0.15, eyeLookDownRight: 0.15, cheekSquintLeft: 0.1, cheekSquintRight: 0.1 },
  },
  worried: {
    preset: VRMExpressionPresetName.Sad,
    baseIntensity: 0.3,
    blendshapes: { browInnerUp: 0.2, eyeWideLeft: 0.05, eyeWideRight: 0.05 },
  },
  gentle: {
    preset: VRMExpressionPresetName.Relaxed,
    baseIntensity: 0.3,
    blendshapes: {},
  },
  playful: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.3,
    blendshapes: { cheekSquintLeft: 0.15, cheekSquintRight: 0.15 },
  },
  // Server-side emotions (mapped from emotion_system.py)
  fear: {
    preset: VRMExpressionPresetName.Surprised,
    baseIntensity: 0.45,
    blendshapes: { browInnerUp: 0.8, browOuterUpLeft: 0.6, browOuterUpRight: 0.6, eyeWideLeft: 0.7, eyeWideRight: 0.7 },
  },
  confused: {
    preset: VRMExpressionPresetName.Relaxed,
    baseIntensity: 0.3,
    blendshapes: { browDownLeft: 0.4, browInnerUp: 0.5, browOuterUpRight: 0.3, eyeLookUpRight: 0.3 },
  },
  excited: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.45,
    blendshapes: { eyeWideLeft: 0.5, eyeWideRight: 0.5, browInnerUp: 0.4, cheekSquintLeft: 0.6, cheekSquintRight: 0.6 },
  },
  embarrassed: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.25,
    blendshapes: { cheekPuff: 0.4, eyeLookDownLeft: 0.4, eyeLookDownRight: 0.4, browInnerUp: 0.3, noseSneerLeft: 0.2, noseSneerRight: 0.2 },
  },
  proud: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.3,
    blendshapes: { chinDown: 0.2, eyeSquintLeft: 0.2, eyeSquintRight: 0.2, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 },
  },
  relieved: {
    preset: VRMExpressionPresetName.Relaxed,
    baseIntensity: 0.25,
    blendshapes: { eyeSquintLeft: 0.3, eyeSquintRight: 0.3, browInnerUp: 0.2 },
  },
  // Persona expression tags
  pout: {
    preset: VRMExpressionPresetName.Sad,
    baseIntensity: 0.35,
    blendshapes: { browDownLeft: 0.3, browDownRight: 0.3, mouthPressLeft: 0.4, mouthPressRight: 0.4, mouthFrownLeft: 0.3, mouthFrownRight: 0.3 },
  },
  warm_smile: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.3,
    blendshapes: { cheekSquintLeft: 0.2, cheekSquintRight: 0.2, browInnerUp: 0.1, eyeSquintLeft: 0.15, eyeSquintRight: 0.15 },
  },
  tired: {
    preset: VRMExpressionPresetName.Relaxed,
    baseIntensity: 0.2,
    blendshapes: { eyeSquintLeft: 0.4, eyeSquintRight: 0.4, browInnerUp: 0.1, mouthFrownLeft: 0.1, mouthFrownRight: 0.1 },
  },
  // User-requested expressions
  laugh: {
    preset: VRMExpressionPresetName.Joy,
    baseIntensity: 0.5,
    blendshapes: { cheekSquintLeft: 0.7, cheekSquintRight: 0.7, eyeSquintLeft: 0.5, eyeSquintRight: 0.5, browInnerUp: 0.2, jawOpen: 0.3 },
  },
  cry: {
    preset: VRMExpressionPresetName.Sad,
    baseIntensity: 0.5,
    blendshapes: { browDownLeft: 0.5, browDownRight: 0.5, browInnerUp: 0.6, eyeLookDownLeft: 0.3, eyeLookDownRight: 0.3, mouthFrownLeft: 0.5, mouthFrownRight: 0.5, mouthPressLeft: 0.3, mouthPressRight: 0.3 },
  },
};

export class EmotionStateCompositor {
  constructor() {
    /** @type {Object.<string, {weight: number, target: number, activatedAt: number, lastReinforced: number}>} */
    this._activeSeeds = {};

    /** @type {string | null} */
    this._dominantEmotion = null;

    /** @type {number} Timestamp of last meaningful signal */
    this._lastMeaningfulSignal = 0;

    /** @type {boolean} Whether we are actively releasing toward neutral */
    this._isReleasing = false;

    // Configurable parameters
    this._riseSpeed = 3.0;         // How fast emotions activate
    this._fallSpeed = 0.8;         // How fast emotions release (slow and smooth)
    this._reinforceBoost = 0.15;   // Weight added when signal is reinforced
    this._releaseThreshold = 0.03; // Below this weight, seed is removed
    this._neutralTimeout = 6000;   // ms before unreinforced seeds begin releasing
  }

  /**
   * Receive a semantic emotion signal from Gemini Live.
   * Rule 1: null / undefined / none / empty does NOT reset state.
   * Rule 2: "neutral" triggers gradual release.
   * Rule 3: Meaningful emotion activates or reinforces the seed.
   *
   * @param {string | {name: string, intensity?: number} | null} signal
   */
  receiveSignal(signal) {
    if (!signal) return;

    let emotionName = null;
    let signalIntensity = 0.5;

    if (typeof signal === "string") {
      emotionName = signal.toLowerCase().trim();
    } else if (typeof signal === "object" && signal.name) {
      emotionName = signal.name.toLowerCase().trim();
      signalIntensity = signal.intensity ?? 0.5;
    }

    // Rule 1: No signal / none / null / empty preserves state
    if (!emotionName || emotionName === "none" || emotionName === "null" || emotionName === "undefined" || emotionName === "") {
      return;
    }

    const now = performance.now();

    // Rule 2: Explicit neutral triggers release
    if (emotionName === "neutral") {
      this._startRelease();
      return;
    }

    // Check if seed exists in library
    const seedDef = EMOTION_SEEDS[emotionName];
    if (!seedDef) {
      console.warn(`[EmotionCompositor] Unknown emotion seed: "${emotionName}"`);
      return;
    }

    // Rule 3: Meaningful signal activates or reinforces seed
    this._isReleasing = false;
    this._lastMeaningfulSignal = now;
    this._dominantEmotion = emotionName;

    const targetIntensity = seedDef.baseIntensity * Math.max(0.3, signalIntensity);

    if (this._activeSeeds[emotionName]) {
      // Reinforce existing seed
      const seed = this._activeSeeds[emotionName];
      seed.target = Math.max(seed.target, targetIntensity);
      seed.weight = Math.min(seed.weight + this._reinforceBoost, seed.target * 1.2);
      seed.lastReinforced = now;
      console.log(`[EmotionCompositor] Reinforced emotion: ${emotionName} (weight: ${seed.weight.toFixed(2)})`);
    } else {
      // Activate new seed
      this._activeSeeds[emotionName] = {
        weight: 0.05, // Start smooth from zero
        target: targetIntensity,
        activatedAt: now,
        lastReinforced: now,
      };
      console.log(`[EmotionCompositor] Activated emotion: ${emotionName} (target: ${targetIntensity.toFixed(2)})`);
    }
  }

  /**
   * Start gradual release toward neutral.
   */
  _startRelease() {
    this._isReleasing = true;
    // Lower targets of all active seeds
    for (const seed of Object.values(this._activeSeeds)) {
      seed.target = 0;
    }
    console.log("[EmotionCompositor] Starting gradual release to neutral");
  }

  /**
   * Per-frame update of emotion weights and temporal state.
   *
   * @param {number} delta - Time since last frame in seconds
   * @param {number} now - Current performance.now() timestamp
   */
  update(delta, now) {
    // 1. Check for inactivity timeout → trigger release
    if (!this._isReleasing && Object.keys(this._activeSeeds).length > 0) {
      if (now - this._lastMeaningfulSignal > this._neutralTimeout) {
        this._startRelease();
      }
    }

    // 2. Interpolate weights toward targets
    for (const [name, seed] of Object.entries(this._activeSeeds)) {
      const speed = seed.target === 0 ? this._fallSpeed : this._riseSpeed;
      seed.weight = lerp(seed.weight, seed.target, speed * delta);

      // Clean up fully released seeds
      if (seed.target === 0 && seed.weight < this._releaseThreshold) {
        delete this._activeSeeds[name];
        console.log(`[EmotionCompositor] Released emotion seed: ${name}`);
      }
    }

    // Update dominant emotion
    const activeNames = Object.keys(this._activeSeeds);
    if (activeNames.length === 0) {
      this._dominantEmotion = null;
    } else if (!this._activeSeeds[this._dominantEmotion]) {
      // Pick highest weight active seed as dominant
      let highestName = activeNames[0];
      let highestWeight = this._activeSeeds[highestName].weight;
      for (const name of activeNames) {
        if (this._activeSeeds[name].weight > highestWeight) {
          highestWeight = this._activeSeeds[name].weight;
          highestName = name;
        }
      }
      this._dominantEmotion = highestName;
    }
  }

  /**
   * Compose all active emotion seeds into a single VRM expression target.
   * Multi-emotion blending: combines presets and ARKit blendshapes dynamically.
   *
   * @returns {Object} Composite expression target mapping preset/blendshape names to weights
   */
  composeExpression() {
    const target = {
      // Standard presets
      [VRMExpressionPresetName.Joy]: 0,
      [VRMExpressionPresetName.Sad]: 0,
      [VRMExpressionPresetName.Angry]: 0,
      [VRMExpressionPresetName.Surprised]: 0,
      [VRMExpressionPresetName.Relaxed]: 0,
      [VRMExpressionPresetName.Neutral]: 0,
      // ARKit blendshapes for nuance
      browInnerUp: 0,
      browDownLeft: 0,
      browDownRight: 0,
      browOuterUpLeft: 0,
      browOuterUpRight: 0,
      eyeWideLeft: 0,
      eyeWideRight: 0,
      eyeLookDownLeft: 0,
      eyeLookDownRight: 0,
      cheekSquintLeft: 0,
      cheekSquintRight: 0,
      noseSneerLeft: 0,
      noseSneerRight: 0,
    };

    let totalWeight = 0;

    for (const [name, seed] of Object.entries(this._activeSeeds)) {
      const seedDef = EMOTION_SEEDS[name];
      if (!seedDef) continue;

      const w = seed.weight;
      totalWeight += w;

      // Accumulate preset weight
      if (seedDef.preset && target[seedDef.preset] !== undefined) {
        target[seedDef.preset] += w;
      }

      // Accumulate ARKit/blendshape influences
      if (seedDef.blendshapes) {
        for (const [bsName, bsVal] of Object.entries(seedDef.blendshapes)) {
          if (target[bsName] !== undefined) {
            target[bsName] += w * bsVal;
          }
        }
      }
    }

    // Clamp presets and blendshapes to [0, 1]
    for (const key of Object.keys(target)) {
      target[key] = clamp(target[key], 0, 1);
    }

    // If no emotions are active, default to neutral = 1.0
    if (totalWeight < 0.01) {
      target[VRMExpressionPresetName.Neutral] = 1.0;
    } else {
      // Inverse neutral weighting based on emotional intensity
      target[VRMExpressionPresetName.Neutral] = clamp(1.0 - totalWeight, 0, 1);
    }

    return target;
  }

  /**
   * Get current active emotion states (for debugging / UI).
   */
  getState() {
    return {
      dominant: this._dominantEmotion,
      seeds: { ...this._activeSeeds },
      isReleasing: this._isReleasing,
    };
  }

  /**
   * Reset all state.
   */
  reset() {
    this._activeSeeds = {};
    this._dominantEmotion = null;
    this._lastMeaningfulSignal = 0;
    this._isReleasing = false;
  }
}
