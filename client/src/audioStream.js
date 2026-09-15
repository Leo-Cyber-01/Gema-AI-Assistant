import { Mp3StreamPlayer } from "./audioPlayer";

let player = null;
let analyser = null;
let volumeBuffer = null;

export const initAudioStream = async ({ mimeType = "audio/mpeg" } = {}) => {
  if (!player) {
    player = new Mp3StreamPlayer();
  }
  await player.init({ mimeType });
  await player.unlock();
  analyser = player.getAnalyser();
  if (analyser && (!volumeBuffer || volumeBuffer.length !== analyser.fftSize)) {
    volumeBuffer = new Uint8Array(analyser.fftSize);
  }
};

export const pushAudioChunk = (chunk) => {
  if (!player) return;
  player.push(chunk);
};

export const clearAudioStream = () => {
  if (!player) return;
  player.clear();
};

export const getAnalyser = () => analyser;

export const getVolume = () => {
  if (!analyser || !volumeBuffer) return 0;
  analyser.getByteTimeDomainData(volumeBuffer);
  let sum = 0;
  for (let i = 0; i < volumeBuffer.length; i += 1) {
    const v = (volumeBuffer[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / volumeBuffer.length);
  return Math.min(1, Math.max(0, rms));
};
