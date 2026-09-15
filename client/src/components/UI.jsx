import { useEffect, useRef, useState } from "react";
import { THEME_COLORS, PERSONA_METADATA } from "../constants";


const STATUS_CONFIG = {
  OFFLINE: { color: "#6b7280", label: "Offline", pulse: false },
  CONNECTING: { color: "#f59e0b", label: "Connecting...", pulse: true },
  RECONNECTING: { color: "#fb7185", label: "Reconnecting...", pulse: true },
  IDLE: { color: "#10b981", label: "Ready", pulse: false },
  THINKING: { color: "#60a5fa", label: "Thinking...", pulse: true },
  SPEAKING: { color: "#ec4899", label: "Speaking", pulse: true },
};

const MicIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path
      d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-5 9a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.92V21h-2v-2.08A7 7 0 0 1 5 12h2Z"
      fill="currentColor"
    />
  </svg>
);

const ScreenIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path
      d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v2h3v2H8v-2h3v-2H6a2 2 0 0 1-2-2V5Zm2 0v9h12V5H6Z"
      fill="currentColor"
    />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path d="M3.4 20.2 21 12 3.4 3.8 3 10l10 2-10 2 .4 6.2Z" fill="currentColor" />
  </svg>
);

const ChatHistoryIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path 
      d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Zm-3 12H7v-1.5h10V14Zm0-3H7V9.5h10V11Zm0-3H7V6.5h10V8Z" 
      fill="currentColor" 
    />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path
      d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
      fill="currentColor"
    />
  </svg>
);

const AvatarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path
      d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 9c4.42 0 8 2.24 8 5v2H4v-2c0-2.76 3.58-5 8-5Z"
      fill="currentColor"
    />
  </svg>
);

const CCIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path
      d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-8 7H9.5v-.5h-2v3h2v-.5H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1Zm7 0h-1.5v-.5h-2v3h2v-.5H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1Z"
      fill="currentColor"
    />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path 
      d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5ZM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5Zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3Z" 
      fill="currentColor" 
    />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path 
      d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.82l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.74-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7ZM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27ZM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2Zm4.34-1.07 3.39 3.39c-.1-.82-.57-1.53-1.3-2.06l-.03-.03c-.53-.73-1.24-1.2-2.06-1.3Z" 
      fill="currentColor" 
    />
  </svg>
);

const WaveformIcon = () => (
  <svg viewBox="0 0 40 24" className="icon" style={{ width: 28, height: 20 }}>
    {[4, 10, 16, 22, 28, 34].map((x, index) => (
      <rect
        key={x}
        x={x}
        y={12 - (index % 2 === 0 ? 8 : 5)}
        width={3}
        height={index % 2 === 0 ? 16 : 10}
        rx={2}
        fill="currentColor"
        style={{
          animation: `waveBar 0.8s ease-in-out ${index * 0.1}s infinite alternate`,
        }}
      />
    ))}
  </svg>
);

export const UI = ({
  models,
  currentModelId,
  isLoading,
  error,
  onRefresh,
  onSelect,
  onSendMessage,
  onToggleMic,
  onToggleScreen,
  isMicActive,
  isScreenActive,
  isConnected,
  geminiStatus,
  miyaOnline,
  messages,
  onClearMessages,
  isDark,
  activePersona,
  onSwitchPersona,
  currentCaption,
  isCaptionsVisible,
  onToggleCaptions,
}) => {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isModelsOpen, setIsModelsOpen] = useState(false);
  const [isHudVisible, setIsHudVisible] = useState(true);
  const messagesEndRef = useRef(null);

  const personaTheme = THEME_COLORS[activePersona.persona] || THEME_COLORS.Miya;
  const accentColor = personaTheme.primary;

  const statusCfg = { ...STATUS_CONFIG[geminiStatus] } || { ...STATUS_CONFIG.OFFLINE };
  // Override status color with persona-specific color when speaking/thinking
  if (geminiStatus === "SPEAKING" || geminiStatus === "THINKING") {
    statusCfg.color = accentColor;
  }


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, geminiStatus]);

  const handleSend = async (value) => {
    const next = (value || input).trim();
    if (!next || isSending) return;
    setInput("");
    setIsSending(true);
    try {
      await onSendMessage(next);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes waveBar {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <section
        className={`fixed inset-0 z-10 pointer-events-none ${
          isDark ? "theme-dark" : "theme-light"
        }`}
      >
        <div className="absolute top-5 left-5 pointer-events-auto flex flex-col gap-2">
          <div className={`transition-all duration-500 ${isHudVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}`}>
            <div className="panel px-4 py-3 flex items-center gap-3">
              <div style={{ color: statusCfg.color, transition: "color 0.3s ease" }}>
                {geminiStatus === "SPEAKING" ? (
                  <WaveformIcon />
                ) : (
                  <svg viewBox="0 0 24 24" className="icon" style={{ width: 22, height: 22 }}>
                    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
                    <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.35" />
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                  </svg>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold text-main leading-tight">
                  <span style={{ color: accentColor }}>{activePersona.name}</span>
                  <span className="text-xs font-normal text-muted ml-2">CoolGuys</span>
                </h1>


                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: statusCfg.color,
                      animation: statusCfg.pulse ? "pulseDot 1s ease-in-out infinite" : "none",
                    }}
                  />
                  <span className="text-xs" style={{ color: statusCfg.color }}>
                    {statusCfg.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="panel px-3 py-2 mt-2 flex flex-col gap-2 text-xs text-muted">
              <div className="flex items-center justify-between gap-4">
                <span>Relay</span>
                <span style={{ color: isConnected ? "#10b981" : "#6b7280" }}>
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Microphone</span>
                <span style={{ color: isMicActive ? "#ef4444" : "inherit" }}>
                  {isMicActive ? "Live" : "Muted"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Screen Share</span>
                <span style={{ color: isScreenActive ? "#60a5fa" : "inherit" }}>
                  {isScreenActive ? "Streaming" : "Off"}
                </span>
              </div>
            </div>
          </div>

          {/* HUD Toggle Toggle */}
          <button
            onClick={() => setIsHudVisible((prev) => !prev)}
            className={`icon-button w-11 h-11 pointer-events-auto transition-all duration-300 ${!isHudVisible ? "hover:scale-110 active:scale-95 bg-accent/20 text-accent border border-accent/20" : ""}`}
            title={isHudVisible ? "Enter Zen Mode" : "Show HUD"}
          >
            {isHudVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        <div className={`absolute top-5 right-5 flex flex-col items-end gap-3 pointer-events-auto transition-all duration-500 ${isHudVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}`}>
          <div className="models-panel">
            <button
              onClick={() => setIsModelsOpen((prev) => !prev)}
              className={`icon-button ${isModelsOpen ? "is-active" : ""}`}
              title={isModelsOpen ? "Hide avatar models" : "Change avatar"}
              style={{ width: 44, height: 44 }}
            >
              <AvatarIcon />
            </button>

            <div className={`models-dropdown ${isModelsOpen ? "is-open" : ""}`}>
              <div className="panel p-3">
                <div className="flex items-center justify-between gap-3 text-sm mb-3 pb-2 border-b border-white/5">
                  <span className="text-accent font-bold uppercase tracking-wider text-[10px]">Select Persona</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  {Object.entries(PERSONA_METADATA).map(([key, meta]) => (
                    <button
                      key={key}
                      onClick={() => onSwitchPersona(key)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-300 border ${
                        activePersona.name === meta.name
                          ? "bg-white/10 border-white/20 ring-1 ring-white/10"
                          : "border-transparent hover:bg-white/5 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <span className="text-xl">{meta.icon}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-tight ${activePersona.name === meta.name ? "text-white" : "text-muted"}`}>
                        {meta.name}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3 text-sm mb-2">
                  <span className="text-muted text-[10px] uppercase font-bold tracking-wider">VRM Models</span>
                  <button onClick={onRefresh} className="text-accent hover:underline text-[10px] uppercase font-bold">
                    Refresh
                  </button>
                </div>

                {isLoading && <div className="text-xs text-muted">Loading models...</div>}
                {error && <div className="text-xs text-red-400">{error}</div>}
                
                {!isLoading && models.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
                    {[...models].reverse().map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          onSelect(model.id);
                          setIsModelsOpen(false);
                        }}
                        className={`model-item-btn text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          currentModelId === model.id 
                            ? "bg-accent/20 text-accent font-medium border border-accent/30" 
                            : "hover:bg-white/5 text-muted hover:text-main"
                        }`}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {isCaptionsVisible && (
          <div 
            className="absolute bottom-40 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 pointer-events-auto"
            style={{ animation: "fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <div className="panel px-0 py-0 glass-morphism overflow-hidden flex flex-col max-h-[45vh]">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/5">
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-accent">
                  {activePersona.name} • Conversation History
                </div>
                {messages.length > 0 && (
                  <button 
                    onClick={onClearMessages}
                    className="text-[10px] uppercase tracking-wider text-muted hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-400/10"
                  >
                    Clear History
                  </button>
                )}
              </div>
              
              <div className="px-6 py-6 overflow-y-auto custom-scrollbar flex flex-col gap-4 text-center">
                {messages.length === 0 && !currentCaption ? (
                  <div className="text-sm text-muted/40 italic py-6">
                    Miya is listening... your conversation will appear here.
                  </div>
                ) : (
                  <>
                    {messages.slice(-8).map((msg, idx) => (
                      <div 
                        key={msg.id || idx}
                        className={`transition-all duration-300 ${msg.role === "user" ? "opacity-50 text-sm italic" : "text-base font-medium captions-text"}`}
                      >
                        {msg.role === "user" ? `“${msg.text}”` : msg.text}
                        {msg.streaming && msg.role === "assistant" && (
                           <span className="inline-block ml-1 h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                        )}
                      </div>
                    ))}
                    {!messages.some(m => m.text === currentCaption) && currentCaption && (
                      <div className="text-base font-medium captions-text">
                        {currentCaption}
                        <span className="inline-block ml-1 h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        )}

        <div className={`absolute bottom-6 left-1/2 w-full max-w-2xl -translate-x-1/2 px-4 pointer-events-auto transition-all duration-500 ${isHudVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>

          <div className={`panel chat-panel ${isChatOpen ? "is-open" : "is-closed"}`}>

            <div className={`chat-footer ${isChatOpen ? "is-open" : "is-closed"}`}>
              <div className="chat-controls">
                <button
                  onClick={onToggleMic}
                  className={`icon-button ${isMicActive ? "is-recording" : ""}`}
                  title={isMicActive ? "Stop microphone" : "Start microphone"}
                >
                  <MicIcon />
                </button>

                <button
                  onClick={onToggleScreen}
                  className={`icon-button ${isScreenActive ? "is-active" : ""}`}
                  title={isScreenActive ? "Stop screen share" : "Start screen share"}
                >
                  <ScreenIcon />
                </button>

                <button
                  onClick={() => setIsChatOpen((prev) => !prev)}
                  className={`icon-button ${isChatOpen ? "is-active" : ""}`}
                  title={isChatOpen ? "Hide input bar" : "Show input bar"}
                >
                  <ChatIcon />
                </button>

                <button
                  onClick={onToggleCaptions}
                  className={`icon-button ${isCaptionsVisible ? "is-active" : ""}`}
                  title={isCaptionsVisible ? "Hide history window" : "Show history window"}
                  style={{ 
                    color: isCaptionsVisible ? accentColor : undefined
                  }}
                >
                  <ChatHistoryIcon />
                </button>
              </div>

              <div className={`chat-input ${isChatOpen ? "is-open" : ""}`}>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    !isChatOpen
                      ? "Open chat to type"
                      : isConnected
                        ? "Type while mic and screen keep streaming..."
                        : "Connecting to relay..."
                  }
                  className="input-field"
                  disabled={!isChatOpen || isSending || !isConnected}
                />
                <button
                  onClick={() => handleSend()}
                  className="icon-button send-button"
                  disabled={!input.trim() || isSending || !isChatOpen || !isConnected}
                  title="Send"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
