import { openTtsStream } from "./audio/ttsStreamClient";

export const startTTSStream = ({
  text,
  onFormat,
  onChunk,
  onDone,
  onError,
} = {}) => {
  return openTtsStream({
    text,
    onFormat,
    onChunk,
    onDone,
    onError,
  });
};
