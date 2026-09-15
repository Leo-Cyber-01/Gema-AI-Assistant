const BLENDSHAPE_ALIASES = {
  happy: "joy",
  sad: "sorrow",
  surprised: "fun",
  relaxed: "neutral",
  neutral: "neutral",
  angry: "angry",
  aa: "a",
  ih: "i",
  ou: "u",
  ee: "e",
  oh: "o",
  blink: "blink",
  blinkLeft: "blink_l",
  blinkRight: "blink_r",
};

// VRM0 Japanese morph target fallback names (common patterns)
// These are tried in order when the standard name fails
const MORPH_JAPANESE_FALLBACKS = {
  aa: ["Fcl_MTH_Down", "Fcl_MTH_Open", "Fcl_MTH_A"],
  oh: ["Fcl_MTH_Funnel", "Fcl_MTH_Small", "Fcl_MTH_O"],
  ou: ["Fcl_MTH_Small", "Fcl_MTH_Pucker", "Fcl_MTH_U"],
  ee: ["Fcl_MTH_Smile", "Fcl_MTH_Up", "Fcl_MTH_E"],
  ih: ["Fcl_MTH_Smile", "Fcl_MTH_Sorrow", "Fcl_MTH_I"],
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

let _diagLogged = false;

export const getExpressionController = (vrm) => {
  if (!vrm) return null;
  if (vrm.expressionManager) {
    return { kind: "expressionManager", controller: vrm.expressionManager };
  }
  if (vrm.blendShapeProxy) {
    return { kind: "blendShapeProxy", controller: vrm.blendShapeProxy };
  }
  return null;
};

export const setVrmExpressionValue = (vrm, name, value) => {
  if (!vrm) return false;

  const weight = clamp(value);

  // Build full list of names to try: standard → alias → Japanese fallbacks
  const alias = BLENDSHAPE_ALIASES[name];
  const jpFallbacks = MORPH_JAPANESE_FALLBACKS[name] || [];
  const allNames = [name, alias, ...jpFallbacks].filter(Boolean);

  // Path 1: expressionManager (three-vrm v2 standard)
  if (vrm.expressionManager) {
    for (const tryName of allNames) {
      try {
        vrm.expressionManager.setValue(tryName, weight);
        return true;
      } catch {
        // try next name
      }
    }
  }

  // Path 2: blendShapeProxy (VRM0 direct)
  if (vrm.blendShapeProxy) {
    for (const tryName of allNames) {
      try {
        vrm.blendShapeProxy.setValue(tryName, weight);
        return true;
      } catch {
        // try next name
      }
    }
  }

  // Path 3: Direct morph target manipulation on meshes
  if (vrm.scene) {
    let applied = false;
    vrm.scene.traverse((obj) => {
      if (applied || !obj.isMesh || !obj.morphTargetDictionary || !obj.morphTargetInfluences) return;
      for (const tryName of allNames) {
        const idx = obj.morphTargetDictionary[tryName];
        if (idx !== undefined) {
          obj.morphTargetInfluences[idx] = weight;
          if (!_diagLogged) {
            console.log(`[VRM] Applied via direct morph target: mesh="${obj.name}" "${tryName}" idx=${idx} weight=${weight.toFixed(3)}`);
          }
          applied = true;
          break;
        }
      }
    });
    if (applied) return true;
  }

  if (!_diagLogged) {
    console.warn(`[VRM] All paths failed for expression "${name}" — tried: [${allNames.join(", ")}]`);
  }
  return false;
};

export const getVrmExpressionValue = (vrm, name) => {
  if (!vrm) return 0;
  try {
    if (vrm.expressionManager) {
      return vrm.expressionManager.getValue?.(name) ?? 0;
    }
    if (vrm.blendShapeProxy) {
      const alias = BLENDSHAPE_ALIASES[name] || name;
      return vrm.blendShapeProxy.getValue?.(alias) ?? 0;
    }
  } catch {
    // Expression not available
  }
  return 0;
};

export const updateVrmExpressions = (vrm) => {
  const resolved = getExpressionController(vrm);
  if (!resolved) return;

  try {
    if (typeof resolved.controller.update === "function") {
      resolved.controller.update();
    } else if (typeof resolved.controller.apply === "function") {
      resolved.controller.apply();
    }
  } catch {
    // Expression mismatches are model-specific and should not break rendering.
  }
};

/**
 * One-time diagnostic: log available expressions on the VRM model.
 * Call once after model loads to understand what expressions the model supports.
 */
export function logVrmExpressionDiagnostics(vrm) {
  if (_diagLogged || !vrm) return;
  _diagLogged = true;

  const resolved = getExpressionController(vrm);
  if (!resolved) {
    console.warn("[VRM-DIAG] No expression controller found (no expressionManager or blendShapeProxy)");
  } else {
    console.log(`[VRM-DIAG] Controller type: ${resolved.kind}`);
  }

  const VISAME_NAMES = ["aa", "ih", "ou", "ee", "oh", "blink", "blinkLeft", "blinkRight", "happy", "sad", "angry", "surprised", "neutral"];
  const found = [];
  const missing = [];

  for (const name of VISAME_NAMES) {
    const allNames = [name, BLENDSHAPE_ALIASES[name], ...(MORPH_JAPANESE_FALLBACKS[name] || [])].filter(Boolean);
    let worked = false;

    // Try expressionManager
    if (vrm.expressionManager) {
      for (const tryName of allNames) {
        try {
          vrm.expressionManager.setValue(tryName, 0);
          found.push(`em:${name}→${tryName}`);
          worked = true;
          break;
        } catch {
          // try next
        }
      }
    }

    // Try blendShapeProxy
    if (!worked && vrm.blendShapeProxy) {
      for (const tryName of allNames) {
        try {
          vrm.blendShapeProxy.setValue(tryName, 0);
          found.push(`bsp:${name}→${tryName}`);
          worked = true;
          break;
        } catch {
          // try next
        }
      }
    }

    // Try direct morph targets on meshes
    if (!worked && vrm.scene) {
      vrm.scene.traverse((obj) => {
        if (worked || !obj.isMesh || !obj.morphTargetDictionary) return;
        for (const tryName of allNames) {
          if (obj.morphTargetDictionary[tryName] !== undefined) {
            found.push(`morph:${name}→${tryName}`);
            worked = true;
            break;
          }
        }
      });
    }

    if (!worked) {
      missing.push(name);
    }
  }

  console.log(`[VRM-DIAG] Expressions that work: [${found.join(", ")}]`);
  if (missing.length > 0) {
    console.warn(`[VRM-DIAG] Missing expressions: [${missing.join(", ")}]`);
  }

  // Check three-vrm internal expression map
  if (vrm.expressionManager && vrm.expressionManager._expressionMap) {
    const available = Object.keys(vrm.expressionManager._expressionMap);
    console.log(`[VRM-DIAG] expressionManager._expressionMap keys: [${available.join(", ")}]`);
  }

  // Check morphTargetNames on all meshes (show ALL names for debugging)
  const scene = vrm.scene;
  if (scene) {
    scene.traverse((obj) => {
      if (obj.isMesh && obj.morphTargetDictionary) {
        const morphNames = Object.keys(obj.morphTargetDictionary);
        if (morphNames.length > 0) {
          console.log(`[VRM-DIAG] Mesh "${obj.name}" morph targets (${morphNames.length}): [${morphNames.join(", ")}]`);
        }
      }
    });
  }
}
