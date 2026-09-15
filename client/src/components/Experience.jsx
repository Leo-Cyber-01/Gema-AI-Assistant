import { 
  CameraControls, 
  Environment, 
  Sparkles, 
  useTexture 
} from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import { useControls } from "leva";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
  VRMExpressionPresetName,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
import { 
  Bloom, 
  BrightnessContrast, 
  EffectComposer, 
  ToneMapping, 
  Vignette 
} from "@react-three/postprocessing";
import * as THREE from "three";

const Placeholder = () => {
  return (
    <group position-y={-0.6}>
      <mesh castShadow receiveShadow>
        <capsuleGeometry args={[0.25, 0.8, 4, 12]} />
        <meshStandardMaterial color="#ff69b4" roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial color="#ffb6c1" roughness={0.25} />
      </mesh>
    </group>
  );
};

const DEFAULT_ANIMATION_URL = "/models/animations/Breathing Idle.fbx";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const setExpressionValue = (vrm, key, value) => {
  const manager = vrm?.expressionManager;
  if (!manager) return;
  try {
    manager.setValue(key, value);
    if (key === VRMExpressionPresetName.Aa) {
      manager.setValue("aa", value);
    }
  } catch (err) {
    // Ignore expression mismatches for different VRM versions.
  }
};

const mixamoVRMRigMap = {
  mixamorigHips: "hips",
  mixamorigSpine: "spine",
  mixamorigSpine1: "chest",
  mixamorigSpine2: "upperChest",
  mixamorigNeck: "neck",
  mixamorigHead: "head",
  mixamorigLeftShoulder: "leftShoulder",
  mixamorigLeftArm: "leftUpperArm",
  mixamorigLeftForeArm: "leftLowerArm",
  mixamorigLeftHand: "leftHand",
  mixamorigLeftHandThumb1: "leftThumbMetacarpal",
  mixamorigLeftHandThumb2: "leftThumbProximal",
  mixamorigLeftHandThumb3: "leftThumbDistal",
  mixamorigLeftHandIndex1: "leftIndexProximal",
  mixamorigLeftHandIndex2: "leftIndexIntermediate",
  mixamorigLeftHandIndex3: "leftIndexDistal",
  mixamorigLeftHandMiddle1: "leftMiddleProximal",
  mixamorigLeftHandMiddle2: "leftMiddleIntermediate",
  mixamorigLeftHandMiddle3: "leftMiddleDistal",
  mixamorigLeftHandRing1: "leftRingProximal",
  mixamorigLeftHandRing2: "leftRingIntermediate",
  mixamorigLeftHandRing3: "leftRingDistal",
  mixamorigLeftHandPinky1: "leftLittleProximal",
  mixamorigLeftHandPinky2: "leftLittleIntermediate",
  mixamorigLeftHandPinky3: "leftLittleDistal",
  mixamorigRightShoulder: "rightShoulder",
  mixamorigRightArm: "rightUpperArm",
  mixamorigRightForeArm: "rightLowerArm",
  mixamorigRightHand: "rightHand",
  mixamorigRightHandPinky1: "rightLittleProximal",
  mixamorigRightHandPinky2: "rightLittleIntermediate",
  mixamorigRightHandPinky3: "rightLittleDistal",
  mixamorigRightHandRing1: "rightRingProximal",
  mixamorigRightHandRing2: "rightRingIntermediate",
  mixamorigRightHandRing3: "rightRingDistal",
  mixamorigRightHandMiddle1: "rightMiddleProximal",
  mixamorigRightHandMiddle2: "rightMiddleIntermediate",
  mixamorigRightHandMiddle3: "rightMiddleDistal",
  mixamorigRightHandIndex1: "rightIndexProximal",
  mixamorigRightHandIndex2: "rightIndexIntermediate",
  mixamorigRightHandIndex3: "rightIndexDistal",
  mixamorigRightHandThumb1: "rightThumbMetacarpal",
  mixamorigRightHandThumb2: "rightThumbProximal",
  mixamorigRightHandThumb3: "rightThumbDistal",
  mixamorigLeftUpLeg: "leftUpperLeg",
  mixamorigLeftLeg: "leftLowerLeg",
  mixamorigLeftFoot: "leftFoot",
  mixamorigLeftToeBase: "leftToes",
  mixamorigRightUpLeg: "rightUpperLeg",
  mixamorigRightLeg: "rightLowerLeg",
  mixamorigRightFoot: "rightFoot",
  mixamorigRightToeBase: "rightToes",
};

const loadMixamoAnimation = async (url, vrm) => {
  const loader = new FBXLoader();
  const asset = await loader.loadAsync(url);
  const clip = THREE.AnimationClip.findByName(asset.animations, "mixamo.com");
  const tracks = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quatA = new THREE.Quaternion();

  const motionHips = asset.getObjectByName("mixamorigHips");
  if (!clip || !motionHips) {
    throw new Error("Invalid Mixamo animation");
  }

  const motionHipsHeight = motionHips.position.y;
  const vrmHipsHeight = vrm.humanoid.normalizedRestPose.hips.position[1];
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  clip.tracks.forEach((track) => {
    const [mixamoRigName, propertyName] = track.name.split(".");
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);
    if (!vrmNodeName || !mixamoRigNode) return;

    mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
    mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      for (let i = 0; i < track.values.length; i += 4) {
        const flatQuaternion = track.values.slice(i, i + 4);
        quatA.fromArray(flatQuaternion);
        quatA
          .premultiply(parentRestWorldRotation)
          .multiply(restRotationInverse);
        quatA.toArray(flatQuaternion);
        flatQuaternion.forEach((v, index) => {
          track.values[index + i] = v;
        });
      }
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          track.values.map((v, i) =>
            vrm.meta?.metaVersion === "0" && i % 2 === 0 ? -v : v
          )
        )
      );
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      const value = track.values.map(
        (v, i) =>
          (vrm.meta?.metaVersion === "0" && i % 3 !== 1 ? -v : v) *
          hipsPositionScale
      );
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          value
        )
      );
    }
  });

  return new THREE.AnimationClip("vrmAnimation", clip.duration, tracks);
};

const VRMModel = ({ url, onLoaded }) => {
  const gltf = useLoader(
    GLTFLoader,
    url,
    (loader) => {
      loader.register((parser) => new VRMLoaderPlugin(parser));
      loader.setCrossOrigin("anonymous");
    }
  );

  const vrmRef = useRef(null);
  const mixerRef = useRef(null);
  const actionRef = useRef(null);

  const { scene, scale, offsetY, bounds } = useMemo(() => {
    const vrm = gltf.userData.vrm;
    if (!vrm) {
      return { scene: null, scale: 1, offsetY: 0, bounds: null };
    }

    VRMUtils.removeUnnecessaryJoints(vrm.scene);
    vrm.scene.traverse((obj) => {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
    });

    const box = new THREE.Box3().setFromObject(vrm.scene);
    const size = box.getSize(new THREE.Vector3());
    const scaleValue = size.y > 0 ? 1.4 / size.y : 1;
    const offset = -box.min.y * scaleValue;

    return {
      scene: vrm.scene,
      scale: scaleValue,
      offsetY: offset,
      bounds: box.clone(),
    };
  }, [gltf]);

  useEffect(() => {
    const vrm = gltf.userData.vrm;
    if (!vrm) return;

    // Fix: Miya.vrm is front-facing by default, while others need a 180-degree flip.
    const isMiya = url.toLowerCase().includes("miya.vrm");
    vrm.scene.rotation.y = isMiya ? 0 : Math.PI;

    vrmRef.current = vrm;
    onLoaded?.({ vrm, scale, offsetY, bounds });
    const mixer = new THREE.AnimationMixer(vrm.scene);
    mixerRef.current = mixer;

    const animationUrl = encodeURI(DEFAULT_ANIMATION_URL);
    loadMixamoAnimation(animationUrl, vrm)
      .then((clip) => {
        const action = mixer.clipAction(clip);
        action.reset().play();
        actionRef.current = action;
      })
      .catch((err) => {
        console.warn("Animation load failed:", err);
      });

    return () => {
      if (actionRef.current) {
        actionRef.current.stop();
      }
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }
      VRMUtils.deepDispose(vrm.scene);
      vrmRef.current = null;
      mixerRef.current = null;
      actionRef.current = null;
    };
  }, [gltf, onLoaded, scale, offsetY, bounds]);

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
    // Redundant vrm update removed - now handled in Experience main loop
  });

  if (!scene) return null;

  return (
    <group position-y={offsetY}>
      <primitive object={scene} scale={scale} />
    </group>
  );
};

export const Experience = ({ 
  modelUrl, 
  onModelLoaded, 
  lipSync, 
  faceController, 
  session, 
  geminiStatus,
  activePersona 
}) => {
  const texture = useTexture("/images/background.png");
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
  }
  const controls = useRef();
  const lastFramingRef = useRef(null);
  const currentVrmRef = useRef(null);
  const { allowUserControls } = useControls("Debug", {
    allowUserControls: {
      label: "Enable Camera Controls",
      value: false,
    },
  });

  const faceSystem = useControls("Face System (Live)", {
    enableLipSync: { value: true, label: "Adaptive LipSync" },
    enableMicroExps: { value: true, label: "Micro-Expressions" },
    enableThoughtTilts: { value: true, label: "Thought Tilts" },
  });

  const {
    bloomIntensity, 
    bloomThreshold, 
    vignetteDarkness, 
    exposure, 
    cinematicBreathing, 
    enableCinematicZoom,
    ambientSparkles 
  } = useControls("Visuals (Premium)", {
    bloomIntensity: { value: 0.45, min: 0, max: 2, step: 0.05 },
    bloomThreshold: { value: 1.0, min: 0, max: 1.5, step: 0.05 },
    vignetteDarkness: { value: 0.5, min: 0, max: 1, step: 0.05 },
    exposure: { value: 1.1, min: 0.5, max: 2, step: 0.1 },
    cinematicBreathing: { value: true },
    enableCinematicZoom: { value: true, label: "Cinematic Zoom" },
    ambientSparkles: { value: true },
  });

  const handleModelLoaded = useCallback(
    ({ vrm, scale, offsetY, bounds }) => {
      currentVrmRef.current = vrm;
      onModelLoaded?.(vrm);
      if (!controls.current || !bounds) return;

      const size = bounds.getSize(new THREE.Vector3());
      const min = bounds.min;
      const upperFraction = 0.6;
      const targetFraction = 0.75;
      const targetY = min.y * scale + offsetY + size.y * scale * targetFraction;
      const camera = controls.current.camera;
      const fovRad = (camera?.fov ?? 35) * (Math.PI / 180);
      const halfHeight = size.y * scale * (upperFraction / 2);
      const fitDistance = halfHeight / Math.tan(fovRad / 2);
      const distance = Math.max(1.2, Math.min(6, fitDistance * 1.15));
      const target = new THREE.Vector3(0, targetY, 0);
      const position = new THREE.Vector3(0, targetY, distance);

      lastFramingRef.current = {
        position: position.toArray(),
        target: target.toArray(),
      };

      controls.current.setLookAt(
        position.x,
        position.y,
        position.z,
        target.x,
        target.y,
        target.z,
        true
      );
    },
    [onModelLoaded]
  );

  useFrame((state) => {
    if (allowUserControls) return;
    const framing = lastFramingRef.current;
    if (!controls.current || !framing) return;
    
    let [px, py, pz] = framing.position;
    const [tx, ty, tz] = framing.target;
    
    // Cinematic Breathing Effect
    if (cinematicBreathing) {
      const t = state.clock.getElapsedTime();
      px += Math.sin(t * 0.5) * 0.02;
      py += Math.cos(t * 0.3) * 0.01;
      pz += Math.sin(t * 0.2) * 0.03;
    }
    
    controls.current.setLookAt(px, py, pz, tx, ty, tz, false);
  });

  useFrame((state, delta) => {
    const vrm = currentVrmRef.current;
    if (!vrm) return;

    // Update Unified Face System BEFORE vrm.update so expressions are applied in this frame
    faceController?.current?.update(vrm, {
      isSpeaking: lipSync?.isSpeaking,
      emotion: lipSync?.emotion,
      sampleRate: session?.current?.getSampleRate() || 24000,
      enableLipSync: faceSystem.enableLipSync,
      enableMicroExps: faceSystem.enableMicroExps,
      enableThoughtTilts: faceSystem.enableThoughtTilts
    });

    vrm.update(delta);
  });

  useEffect(() => {
    const isAIActive = geminiStatus === "THINKING" || geminiStatus === "SPEAKING" || lipSync?.isSpeaking;
    if (!controls.current || !enableCinematicZoom) return;

    const vrm = currentVrmRef.current;
    if (!vrm) return;

    // Recalculate framing based on state
    // Close-up for active, Medium for idle
    const targetFraction = isAIActive ? 0.78 : 0.75; // Focus slightly higher for close-up
    const fov = isAIActive ? 25 : 35;
    const distanceMultiplier = isAIActive ? 0.65 : 1.15; // Zoom in for close-up

    const scene = vrm.scene;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const min = box.min;
    
    // Calculate 3D target world position
    const vrmScale = scene.scale.x; 
    const vrmOffsetY = scene.position.y;
    const targetY = min.y + vrmOffsetY + size.y * targetFraction;
    
    const camera = controls.current.camera;
    const currentFov = camera.fov;
    
    // Smoothly animate FOV change
    const fovStep = (fov - currentFov) * 0.1;
    if (Math.abs(fovStep) > 0.01) {
       camera.fov += fovStep;
       camera.updateProjectionMatrix();
    }

    const fovRad = (camera.fov) * (Math.PI / 180);
    const upperFraction = isAIActive ? 0.3 : 0.6; 
    const halfHeight = size.y * (upperFraction / 2);
    const fitDistance = halfHeight / Math.tan(fovRad / 2);
    const distance = Math.max(0.8, Math.min(6, fitDistance * distanceMultiplier));

    const targetPos = new THREE.Vector3(0, targetY, 0);
    const camPos = new THREE.Vector3(0, targetY, distance);
    
    // Animate to new position
    controls.current.setLookAt(
      camPos.x, camPos.y, camPos.z,
      targetPos.x, targetPos.y, targetPos.z,
      true // Enable smooth transition
    );

  }, [geminiStatus, lipSync?.isSpeaking, enableCinematicZoom]);

  useEffect(() => {
    if (!controls.current) return;
    const none = CameraControlsImpl.ACTION.NONE;
    if (allowUserControls) {
      controls.current.mouseButtons = {
        left: CameraControlsImpl.ACTION.ROTATE,
        middle: CameraControlsImpl.ACTION.DOLLY,
        right: CameraControlsImpl.ACTION.TRUCK,
        wheel: CameraControlsImpl.ACTION.DOLLY,
      };
      controls.current.touches = {
        one: CameraControlsImpl.ACTION.TOUCH_ROTATE,
        two: CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK,
        three: CameraControlsImpl.ACTION.TOUCH_TRUCK,
      };
    } else {
      controls.current.mouseButtons = {
        left: none,
        middle: none,
        right: none,
        wheel: none,
      };
      controls.current.touches = { one: none, two: none, three: none };
    }
  }, [allowUserControls]);

  return (
    <>
      <primitive object={texture} attach="background" />
      <CameraControls
        ref={controls}
        maxPolarAngle={Math.PI / 2}
        minDistance={1.2}
        maxDistance={6}
        enabled
      />
      
      {ambientSparkles && (
        <Sparkles 
          count={60} 
          scale={5} 
          size={2} 
          speed={0.2} 
          opacity={0.3} 
          color={activePersona?.color || "#ffb6c1"} 
        />
      )}

      <Environment preset="sunset" environmentIntensity={exposure} />
      <ambientLight intensity={0.4} />
      <directionalLight intensity={1.5} position={[3, 5, 2]} castShadow />
      <directionalLight intensity={0.8} position={[-3, 5, -2]} />
      
      {/* Hero Light and Persona Rim Light */}
      <spotLight 
        position={[0, 2, 3]} 
        intensity={2.8} 
        angle={0.2} 
        penumbra={1} 
        color="#fff5e6" 
        target-position={[0, 1.4, 0]}
      />
      <pointLight 
        position={[0, 1, -2]} 
        intensity={1.2} 
        color={activePersona?.color || "#ffffff"} 
      />

      <EffectComposer disableNormalPass>
        <Bloom 
          luminanceThreshold={bloomThreshold} 
          mipmapBlur 
          intensity={bloomIntensity} 
          radius={0.4} 
        />
        <BrightnessContrast brightness={0} contrast={0.1} />
        <Vignette offset={0.3} darkness={vignetteDarkness} />
        <ToneMapping edgeDetection={false} />
      </EffectComposer>

      {modelUrl ? (
        <VRMModel url={modelUrl} onLoaded={handleModelLoaded} />
      ) : (
        <Placeholder />
      )}
    </>
  );
};
