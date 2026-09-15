/**
 * Pause-Aware Adaptive LipSyncEngine
 * Detects word gaps and sentence ends for natural conversational rhythm.
 */
export class LipSyncEngine {
  constructor(analyser) {
    this.analyser = analyser;
    this.fftSize = analyser.fftSize;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    
    // Running Audio Statistics
    this.noiseFloor = 0.01;
    this.maxVolume = 0.1;
    this.silenceFrames = 0;
    
    // Constants
    this.MIN_CLAMP = 0.02;
    this.MAX_LIMITS = { aa: 0.8, ee: 0.7, oh: 0.6 };
    
    this.prevValues = { aa: 0, ee: 0, oh: 0 };
  }

  /**
   * Update viseme levels with pause-awareness.
   */
  update(sampleRate, isSpeaking = true) {
    if (!isSpeaking) {
        this.silenceFrames = 100; // Force long pause
        return this.#applyAdaptiveSmoothing({ aa: 0, ee: 0, oh: 0 });
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    
    const binSize = sampleRate / this.fftSize;
    let low = 0, mid = 0, high = 0;
    let lowCount = 0, midCount = 0, highCount = 0;

    for (let i = 0; i < this.frequencyData.length; i++) {
      const frequency = i * binSize;
      const val = this.frequencyData[i];

      if (frequency < 300) {
        low += val; lowCount++;
      } else if (frequency < 2000) {
        mid += val; midCount++;
      } else if (frequency < 8000) {
        high += val; highCount++;
      }
    }

    // Normalized band energy
    const rawLow = (lowCount > 0 ? (low / lowCount) / 255 : 0);
    const rawMid = (midCount > 0 ? (mid / midCount) / 255 : 0);
    const rawHigh = (highCount > 0 ? (high / highCount) / 255 : 0);

    const currentVolume = (rawLow + rawMid + rawHigh) / 3;

    // 1. RUNNING STATS
    this.noiseFloor = this.noiseFloor * 0.95 + currentVolume * 0.05;
    this.maxVolume = Math.max(this.maxVolume * 0.98, currentVolume);
    const threshold = this.noiseFloor * 1.5;

    // 2. PAUSE DETECTION
    if (currentVolume < threshold) {
        this.silenceFrames++;
    } else {
        this.silenceFrames = 0;
    }

    const isShortPause = this.silenceFrames > 5 && this.silenceFrames < 35; // Increased from 2..15
    const isLongPause = this.silenceFrames >= 35; // Increased from 15

    // 3. NORMALIZE & BOOST
    let norm = (currentVolume - threshold) / (Math.max(this.maxVolume, 0.05) - threshold);
    norm = Math.max(0, Math.min(norm, 1));
    norm = Math.pow(norm, 1.3);

    // 4. VISEME MAPPING
    let aa = rawLow * norm;
    let ee = rawMid * norm;
    let oh = rawHigh * norm;

    // 5. PAUSE REACTION (Instant Feedback)
    let isSpeakingState = currentVolume > threshold;
    
    if (isShortPause) {
        // Partial closure for natural gaps between words
        // As requested: reduce mouth but DO NOT fully close
        aa *= 0.45;
        ee *= 0.45;
        oh *= 0.45;
        
        // Ensure it stays slightly open during short pauses if we were just speaking
        aa = Math.max(aa, 0.05);
    } else if (isLongPause) {
        // Full close
        aa = 0;
        ee = 0;
        oh = 0;
    }

    // 6. CLAMPS & SCALING
    if (aa < this.MIN_CLAMP && !isShortPause) aa = 0;
    if (ee < this.MIN_CLAMP && !isShortPause) ee = 0;
    if (oh < this.MIN_CLAMP && !isShortPause) oh = 0;

    aa = Math.min(aa * 2.2, this.MAX_LIMITS.aa);
    ee = Math.min(ee * 1.8, this.MAX_LIMITS.ee);
    oh = Math.min(oh * 1.8, this.MAX_LIMITS.oh);

    const visemes = this.#applyAdaptiveSmoothing({ aa, ee, oh });
    
    return {
      ...visemes,
      isSpeaking: isSpeakingState,
      isShortPause,
      isLongPause,
      volume: currentVolume,
      normalizedVolume: norm
    };
  }

  /**
   * ADAPTIVE SMOOTHING
   * Optimized for fast closing and smooth opening.
   */
  #applyAdaptiveSmoothing(target) {
    const smoothed = {};
    
    Object.keys(target).forEach(key => {
        const prev = this.prevValues[key];
        const goal = target[key];

        if (goal < prev) {
            // Close fast (Responsive to word ends)
            smoothed[key] = prev * 0.5 + goal * 0.5;
        } else {
            // Open slow (Natural muscle movement)
            smoothed[key] = prev * 0.85 + goal * 0.15;
        }
    });

    this.prevValues = smoothed;
    return smoothed;
  }
}
