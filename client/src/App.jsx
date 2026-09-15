import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Experience } from "./components/Experience";
import { UI } from "./components/UI";
import { GeminiLiveSession } from "./geminiLive";
import { createFaceController } from "./face/faceController";
import { EmotionStateCompositor } from "./face/emotionStateCompositor";
import { PERSONA_METADATA } from "./constants";


const fetchModels = async () => {
  const response = await fetch("/api/models", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load models");
  return response.json();
};

function App() {
  const [activePersona, setActivePersona] = useState(PERSONA_METADATA.Miya);
  const [currentModelId, setCurrentModelId] = useState(activePersona.vrmId);
  const [models, setModels] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDark, setIsDark] = useState(true);

  const [geminiStatus, setGeminiStatus] = useState("CONNECTING");
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isScreenActive, setIsScreenActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentCaption, setCurrentCaption] = useState("");
  const [isCaptionsVisible, setIsCaptionsVisible] = useState(true);


  const sessionRef = useRef(null);
  const faceControllerRef = useRef(null);
  const emotionCompositorRef = useRef(new EmotionStateCompositor());
  const assistantDraftIdRef = useRef(null);
  const userDraftIdRef = useRef(null);

  const lipSyncState = useMemo(() => ({ isSpeaking: false, emotion: "neutral" }), []);

  const currentModelUrl = useMemo(() => {
    const model = models.find((item) => item.id === currentModelId);
    return model?.url || "";
  }, [models, currentModelId]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => setIsDark(media.matches);
    updateTheme();
    media.addEventListener?.("change", updateTheme) || media.addListener?.(updateTheme);
    return () =>
      media.removeEventListener?.("change", updateTheme) || media.removeListener?.(updateTheme);
  }, []);

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const payload = await fetchModels();
      const nextModels = Array.isArray(payload.models) ? payload.models : [];
      setModels(nextModels);
      if (nextModels.length) {
        setCurrentModelId((prev) => {
          if (prev) return prev;
          const target = nextModels.find(m => m.id === "7062840423830520603");

          return target ? target.id : nextModels[0].id;
        });
      }
    } catch (loadError) {
      console.error(loadError);
      setError("Could not load VRM models from the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);


  const finalizeDraft = useCallback((draftIdRef) => {
    const draftId = draftIdRef.current;
    if (!draftId) return;
    setMessages((prev) =>
      prev.map((message) =>
        message.id === draftId ? { ...message, streaming: false } : message
      )
    );
    draftIdRef.current = null;
  }, []);

  const upsertStreamingMessage = useCallback((role, text) => {
    if (!text?.trim()) return;
    const draftRef = role === "assistant" ? assistantDraftIdRef : userDraftIdRef;
    const existingId = draftRef.current;

    if (existingId) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === existingId ? { ...message, text, streaming: true } : message
        )
      );
      return;
    }

    const id = `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    draftRef.current = id;
    setMessages((prev) => [...prev, { id, role, text, streaming: true }]);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let session = null;
    let startTimeout = null;
    
    const startSession = async () => {
      // Small delay to let StrictMode cleanup run if this is a double-mount
      await new Promise(r => startTimeout = setTimeout(r, 50));
      if (!isMounted) return;

      session = new GeminiLiveSession();
      sessionRef.current = session;

      // Initialize unified face controller
      if (!faceControllerRef.current) {
        faceControllerRef.current = createFaceController({
          getAnalyser: () => sessionRef.current?.getAnalyser()
        });
      }

      try {
        await session.connect(
          {
            onMicroExpression: (payload) => {
              if (isMounted && faceControllerRef.current) {
                if (payload.type === "output.expression" || payload.expression) {
                  faceControllerRef.current.setServerExpression(payload.expression);
                } else {
                  faceControllerRef.current.push(payload);
                }
              }
            },
            onConnectionChange: (connected) => {
              if (isMounted) setIsConnected(connected);
            },
            onStatus: (status) => {
              if (isMounted) {
                setGeminiStatus(status);
                lipSyncState.isSpeaking = status === "SPEAKING";
              }
            },
            onMicStateChange: (active) => {
              if (isMounted) setIsMicActive(active);
            },
            onScreenStateChange: (active) => {
              if (isMounted) setIsScreenActive(active);
            },
            onReady: () => {
              if (isMounted) {
                setGeminiStatus("IDLE");
              }
            },
            onSessionConnected: (payload) => {
              console.log("[App] Session connected:", payload);
            },
            onUserTranscript: (text) => {
              if (isMounted) upsertStreamingMessage("user", text);
            },
            onAssistantText: (text) => {
              if (!text?.trim() || !isMounted) return;
              upsertStreamingMessage("assistant", text);
              setCurrentCaption(text);

              // Emotion compositor: extract [emotion] tags or detect from text
              const tagMatch = text.match(/\[(\w+)\]/);
              if (tagMatch) {
                emotionCompositorRef.current.receiveSignal(tagMatch[1]);
              } else {
                // Fallback: keyword detection
                const lower = text.toLowerCase();
                let detected = null;
                if (lower.includes("wow") || lower.includes("what?!") || lower.includes("really?")) detected = "surprised";
                else if (lower.includes("haha") || lower.includes("yay") || lower.includes("wonderful") || lower.includes("😊")) detected = "happy";
                else if (lower.includes("sorry") || lower.includes("sad") || lower.includes("cry") || lower.includes("😢")) detected = "sad";
                else if (lower.includes("angry") || lower.includes("stop") || lower.includes("no!") || lower.includes("😡")) detected = "angry";
                else if (lower.includes("fun") || lower.includes("cool") || lower.includes("✨")) detected = "excited";
                if (detected) emotionCompositorRef.current.receiveSignal(detected);
              }

              // Update lipSync state with compositor's dominant emotion
              const compState = emotionCompositorRef.current.getState();
              lipSyncState.emotion = compState.dominant || "neutral";
            },
            onTurnComplete: (payload) => {
              if (isMounted) {
                if (payload?.expression) {
                  faceControllerRef.current?.setServerExpression(payload.expression);
                }
                lipSyncState.isSpeaking = false;
                // Release emotion compositor toward neutral
                emotionCompositorRef.current.receiveSignal("neutral");
                setTimeout(() => {
                  if (isMounted) setCurrentCaption("");
                }, 3000);
              }
            },
            onInterrupted: () => {
              if (isMounted) {
                lipSyncState.isSpeaking = false;
                setCurrentCaption("");
              }
            },
            onError: (message) => {
              if (isMounted) {
                console.error(message);
                setError(typeof message === "string" ? message : "Gemini relay error");
              }
            },
          },
          {
            voice: activePersona.voice,
            persona: activePersona.name,
          }
        );
      } catch (connectError) {
        if (isMounted) {
          console.error(connectError);
          setGeminiStatus("OFFLINE");
          setError("Could not connect to the Gemini Live relay server.");
        }
      }
    };

    startSession();

    return () => {
      isMounted = false;
      if (startTimeout) clearTimeout(startTimeout);
      session?.disconnect();
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, [activePersona.name, activePersona.voice, upsertStreamingMessage, lipSyncState]);

  const handlePersonaSwitch = useCallback((personaKey) => {
    const meta = PERSONA_METADATA[personaKey];
    if (meta) {
      setActivePersona(meta);
      setCurrentModelId(meta.vrmId);
    }
  }, []);

  const toggleMicrophone = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    // Resume audio context on user gesture
    await session.resume();

    try {
      if (isMicActive) {
        await session.stopMicrophone();
        finalizeDraft(userDraftIdRef);
      } else {
        await session.startMicrophone();
        setError("");
      }
    } catch (toggleError) {
      console.error(toggleError);
      setError("Microphone access failed. Check browser permissions and try again.");
    }
  }, [finalizeDraft, isMicActive]);

  const toggleScreenShare = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    try {
      if (isScreenActive) {
        session.stopScreenShare();
      } else {
        await session.startScreenShare();
        setError("");
      }
    } catch (toggleError) {
      console.error(toggleError);
      setError("Screen share failed. Check browser permissions and try again.");
    }
  }, [isScreenActive]);

  const handleSendMessage = useCallback(async (text) => {
    const trimmed = text?.trim();
    if (!trimmed) return;

    // Resume audio context on user gesture
    await sessionRef.current?.resume();

    finalizeDraft(userDraftIdRef);
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", text: trimmed, streaming: false },
    ]);

    try {
      await sessionRef.current?.sendText(trimmed);
    } catch (sendError) {
      console.error(sendError);
      setError("Could not send your message to the Gemini relay.");
    }
  }, [finalizeDraft]);

  return (
    <>
      <UI
        models={models}
        currentModelId={currentModelId}
        isLoading={isLoading}
        error={error}
        onRefresh={loadModels}
        onSelect={(id) => {
          // If the selected model happens to match a persona, switch to it
          const matched = Object.values(PERSONA_METADATA).find(p => p.vrmId === id);
          if (matched) handlePersonaSwitch(matched.key);
          else setCurrentModelId(id);
        }}
        onSwitchPersona={handlePersonaSwitch}
        onSendMessage={handleSendMessage}
        onToggleMic={toggleMicrophone}
        onToggleScreen={toggleScreenShare}
        isMicActive={isMicActive}
        isScreenActive={isScreenActive}
        isConnected={isConnected}
        geminiStatus={geminiStatus}
        messages={messages}
        onClearMessages={() => {
          assistantDraftIdRef.current = null;
          userDraftIdRef.current = null;
          setMessages([]);
        }}
        isDark={isDark}
        activePersona={activePersona}
        currentCaption={currentCaption}
        isCaptionsVisible={isCaptionsVisible}
        onToggleCaptions={() => setIsCaptionsVisible((prev) => !prev)}
      />


      <Leva collapsed={false} />
      <Loader />
      <Canvas shadows camera={{ position: [0, 1.4, 2.8], fov: 35 }} dpr={[1, 2]}>
        <Suspense>
          <Experience
            modelUrl={currentModelUrl}
            lipSync={lipSyncState}
            faceController={faceControllerRef}
            session={sessionRef}
            geminiStatus={geminiStatus}
            activePersona={activePersona}
          />
        </Suspense>
      </Canvas>
    </>
  );
}

export default App;
