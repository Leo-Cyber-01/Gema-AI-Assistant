export const createTtsWebSocketUrl = () => {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return `${protocol}://${host}/tts-stream`;
};

export const openTtsStream = ({
  text,
  onFormat,
  onChunk,
  onDone,
  onError,
} = {}) => {
  const url = createTtsWebSocketUrl();
  if (!url) {
    onError?.(new Error("WebSocket URL unavailable"));
    return { close: () => {} };
  }

  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    ws.send(JSON.stringify({ text }));
  };

  ws.onmessage = (event) => {
    if (typeof event.data === "string") {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "format") {
          onFormat?.(payload);
        } else if (payload.type === "done") {
          onDone?.();
        } else if (payload.type === "error") {
          onError?.(new Error(payload.message || "TTS stream error"));
        }
      } catch (err) {
        onError?.(err);
      }
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      onChunk?.(new Uint8Array(event.data));
    }
  };

  ws.onerror = () => {
    onError?.(new Error("WebSocket error"));
  };

  ws.onclose = () => {
    onDone?.();
  };

  return {
    close: () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
};
