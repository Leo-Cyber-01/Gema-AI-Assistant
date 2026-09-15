/**
 * visemeMap.js — Hybrid Viseme Detection & 15-Viseme → VRM Mapping
 *
 * Auto-detects whether the VRM model has Oculus viseme morph targets.
 * If yes → use 15 Oculus morphs directly.
 * If no  → map 15 visemes to 5 VRM presets (aa, ee, oh, ou, ih).
 *
 * Oculus Visemes (15):
 *   sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U
 *
 * VRM Presets (5):
 *   Aa, Ee, Oh, Ou, Ih
 */

// ── Oculus Viseme Names ──────────────────────────────────────────
export const VISEME_NAMES = [
  'sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS',
  'nn', 'RR', 'aa', 'E', 'I', 'O', 'U',
];

// ── Oculus Viseme → VRM Preset Mapping (fallback) ───────────────
// When model doesn't have Oculus morphs, map to VRM presets.
const VISEME_TO_VRM_PRESET = {
  sil: { preset: null, weight: 0 },
  PP:  { preset: 'aa', weight: 0.3,  morphs: { mouthPressLeft: 0.6, mouthPressRight: 0.6, jawOpen: 0.15 } },
  FF:  { preset: 'ee', weight: 0.5,  morphs: { mouthFunnel: 0.4, mouthPucker: 0.3 } },
  TH:  { preset: 'aa', weight: 0.4,  morphs: { tongueOut: 0.6, jawOpen: 0.2 } },
  DD:  { preset: 'aa', weight: 0.6,  morphs: { jawOpen: 0.5, mouthDimpleLeft: 0.2, mouthDimpleRight: 0.2 } },
  kk:  { preset: 'oh', weight: 0.5,  morphs: { mouthFunnel: 0.5, jawOpen: 0.3 } },
  CH:  { preset: 'oh', weight: 0.6,  morphs: { mouthPucker: 0.5, mouthFunnel: 0.3 } },
  SS:  { preset: 'ee', weight: 0.5,  morphs: { mouthStretchLeft: 0.4, mouthStretchRight: 0.4 } },
  nn:  { preset: 'aa', weight: 0.3,  morphs: { jawOpen: 0.2, mouthDimpleLeft: 0.15, mouthDimpleRight: 0.15 } },
  RR:  { preset: 'oh', weight: 0.4,  morphs: { mouthFunnel: 0.3, jawOpen: 0.2 } },
  aa:  { preset: 'aa', weight: 1.0,  morphs: { jawOpen: 0.8 } },
  E:   { preset: 'ee', weight: 1.0,  morphs: { mouthStretchLeft: 0.5, mouthStretchRight: 0.5 } },
  I:   { preset: 'ih', weight: 1.0,  morphs: { mouthRight: 0.4, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 } },
  O:   { preset: 'oh', weight: 1.0,  morphs: { mouthFunnel: 0.7 } },
  U:   { preset: 'ou', weight: 1.0,  morphs: { mouthPucker: 0.7 } },
};

// ── VRM Preset Name Mapping ─────────────────────────────────────
// Maps short names to VRMExpressionPresetName values
const VRM_PRESET_MAP = {
  aa: 'aa',
  ee: 'ee',
  oh: 'oh',
  ou: 'ou',
  ih: 'ih',
};

/**
 * Detect whether the VRM model has Oculus viseme morph targets.
 * Scans the model's meshes for morph target dictionaries.
 *
 * @param {object} vrm - The VRM model instance
 * @returns {{ mode: 'oculus'|'preset', availableVisemes: string[], availableMorphs: string[] }}
 */
export function detectVisemeMode(vrm) {
  if (!vrm || !vrm.scene) {
    return { mode: 'preset', availableVisemes: [], availableMorphs: [] };
  }

  const oculusVisemes = new Set();
  const allMorphs = new Set();

  vrm.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.morphTargetDictionary) return;
    const dict = obj.morphTargetDictionary;
    for (const name of Object.keys(dict)) {
      allMorphs.add(name);
      // Check for Oculus viseme naming convention
      if (name.startsWith('viseme_')) {
        const visemeName = name.replace('viseme_', '');
        if (VISEME_NAMES.includes(visemeName)) {
          oculusVisemes.add(visemeName);
        }
      }
    }
  });

  const mode = oculusVisemes.size >= 10 ? 'oculus' : 'preset';
  const availableVisemes = mode === 'oculus' ? [...oculusVisemes] : VISEME_NAMES;

  console.log(`[visemeMap] Detected mode: ${mode}, Oculus visemes: ${oculusVisemes.size}, Total morphs: ${allMorphs.size}`);

  return { mode, availableVisemes, availableMorphs: [...allMorphs] };
}

/**
 * Get the VRM expression values for a given viseme.
 * Returns preset name + weight for preset mode,
 * or morph target overrides for oculus mode.
 *
 * @param {string} visemeName - Oculus viseme name (e.g. "PP", "aa")
 * @param {string} mode - 'oculus' or 'preset'
 * @param {number} intensity - Viseme intensity (0-1)
 * @returns {{ preset: string|null, presetWeight: number, morphs: Record<string, number>, oculusTarget: string|null }}
 */
export function getVisemeValues(visemeName, mode, intensity = 1.0) {
  const mapping = VISEME_TO_VRM_PRESET[visemeName] || VISEME_TO_VRM_PRESET.sil;

  if (mode === 'oculus') {
    return {
      preset: null,
      presetWeight: 0,
      morphs: {},
      oculusTarget: `viseme_${visemeName}`,
      oculusWeight: intensity,
    };
  }

  // Preset mode: map to VRM presets + secondary morphs
  const presetName = mapping.preset ? VRM_PRESET_MAP[mapping.preset] : null;
  const presetWeight = mapping.weight * intensity;

  // Apply secondary morphs (ARKit blendshapes for finer control)
  const morphs = {};
  if (mapping.morphs) {
    for (const [morphName, morphWeight] of Object.entries(mapping.morphs)) {
      morphs[morphName] = morphWeight * intensity;
    }
  }

  return {
    preset: presetName,
    presetWeight,
    morphs,
    oculusTarget: null,
    oculusWeight: 0,
  };
}
