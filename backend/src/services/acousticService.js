/**
 * Acoustic DSP & Voice Biometrics Forensic Service
 *
 * Implements research-backed acoustic analysis algorithms:
 * 1. YIN Fundamental Frequency (F0) Pitch Tracking (de Cheveigné & Kawahara, 2002)
 * 2. Linear Predictive Coding (LPC) Formant Analysis (Levinson-Durbin Recursion)
 * 3. Vocal Tract Resonance & Timbre Classification (F1/F2 Pharyngeal Geometry)
 * 4. Micro-Jitter Perturbation Analysis (Pita Suara Biologis vs Neural TTS Vocoder)
 * 5. 1:1 Enrolled Executive Voiceprint Matching (NIST SP 800-63B / ASVspoof 5)
 */

import { VoiceprintRepository } from './voiceprintRepository.js';

export class AcousticDspService {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    // Rolling ring buffer: 4 seconds of speech at 24kHz = 96,000 samples
    this.maxBufferSize = sampleRate * 4;
    this.samples = new Float32Array(this.maxBufferSize);
    this.sampleCount = 0;
    this.pitchPoints = [];
  }

  reset() {
    this.sampleCount = 0;
    this.pitchPoints = [];
  }

  /**
   * Ingest raw base64 PCM16 audio chunk from live microphone stream
   */
  ingestPcmChunk(base64Data) {
    if (!base64Data) return;
    try {
      const binary = atob(base64Data);
      const byteLen = binary.length - (binary.length % 2);
      if (byteLen <= 0) return;

      const samplesCount = byteLen / 2;
      for (let i = 0; i < samplesCount; i++) {
        const byte1 = binary.charCodeAt(i * 2);
        const byte2 = binary.charCodeAt(i * 2 + 1);
        let int16 = byte1 | (byte2 << 8);
        if (int16 >= 0x8000) int16 -= 0x10000;
        const floatVal = int16 / 32768.0;

        if (this.sampleCount < this.maxBufferSize) {
          this.samples[this.sampleCount++] = floatVal;
        } else {
          // Circular shift: drop oldest 25% to make room
          const drop = Math.floor(this.maxBufferSize * 0.25);
          this.samples.copyWithin(0, drop);
          this.sampleCount = this.maxBufferSize - drop;
          this.samples[this.sampleCount++] = floatVal;
        }
      }
    } catch (err) {
      // Ignore corrupted audio frame
    }
  }

  /**
   * YIN Algorithm for Real-Time Pitch (F0) Extraction
   */
  detectPitchYin(signal, offset = 0, length = 1024) {
    const minF0 = 65; // Low baritone male
    const maxF0 = 380; // High soprano female
    const minPeriod = Math.floor(this.sampleRate / maxF0);
    const maxPeriod = Math.floor(this.sampleRate / minF0);
    const windowSize = Math.min(length - maxPeriod, 512);

    if (windowSize <= 0 || offset + length > signal.length) return null;

    // 1. Squared Difference Function
    const diff = new Float32Array(maxPeriod + 1);
    for (let tau = 0; tau <= maxPeriod; tau++) {
      let sum = 0;
      for (let i = 0; i < windowSize; i++) {
        const delta = signal[offset + i] - signal[offset + i + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }

    // 2. Cumulative Mean Normalized Difference Function
    const cmndf = new Float32Array(maxPeriod + 1);
    cmndf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxPeriod; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
    }

    // 3. Absolute Thresholding (0.15)
    const threshold = 0.15;
    let tauFound = -1;
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      if (cmndf[tau] < threshold) {
        while (tau + 1 <= maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        tauFound = tau;
        break;
      }
    }

    if (tauFound === -1) {
      let minVal = 1.0;
      for (let tau = minPeriod; tau <= maxPeriod; tau++) {
        if (cmndf[tau] < minVal) {
          minVal = cmndf[tau];
          tauFound = tau;
        }
      }
      if (minVal > 0.40) return null; // Unvoiced / background noise
    }

    // 4. Parabolic Interpolation for Sub-Sample Precision
    const x0 = tauFound > minPeriod ? tauFound - 1 : tauFound;
    const x2 = tauFound < maxPeriod ? tauFound + 1 : tauFound;
    let refinedTau = tauFound;
    if (x0 !== tauFound && x2 !== tauFound) {
      const s0 = cmndf[x0];
      const s1 = cmndf[tauFound];
      const s2 = cmndf[x2];
      const denom = 2 * (s0 - 2 * s1 + s2);
      if (denom !== 0) {
        refinedTau = tauFound + (s0 - s2) / denom;
      }
    }

    const f0 = this.sampleRate / refinedTau;
    return (f0 >= minF0 && f0 <= maxF0) ? f0 : null;
  }

  /**
   * Linear Predictive Coding (LPC) Formant Analysis
   * Estimates F1 (pharyngeal depth) and F2 (tongue body position / vocal tract length)
   * Rule-of-thumb order p = Fs/1000 = 24 for 24kHz sampling rate (Makhoul 1975, Rabiner & Schafer 1978)
   */
  estimateFormantsLpc(signal, order = 24) {
    const N = Math.min(signal.length, 1024);
    if (N < order * 2) {
      return { f1: 500, f2: 1350, timbre: 'DEEP_BARITONE (LONG_VOCAL_TRACT)' };
    }

    // Check for ambient silence/noise floor (RMS < 0.008) to avoid fitting poles to white noise
    let sumSq = 0;
    for (let i = 0; i < N; i++) sumSq += signal[i] * signal[i];
    const rms = Math.sqrt(sumSq / N);
    if (rms < 0.008) {
      return { f1: 500, f2: 1350, timbre: 'STANDBY (AWAITING VOICED SPEECH)', isSilent: true };
    }

    // 1. Pre-emphasis Filter (High-pass boost to counteract glottal tilt: y[n] = x[n] - 0.97*x[n-1])
    const pre = new Float32Array(N);
    pre[0] = signal[0];
    for (let n = 1; n < N; n++) {
      pre[n] = signal[n] - 0.97 * signal[n - 1];
    }

    // 2. Hamming Windowing
    const windowed = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
      windowed[n] = pre[n] * w;
    }

    // 3. Autocorrelation (r[0..order])
    const r = new Float32Array(order + 1);
    for (let k = 0; k <= order; k++) {
      let sum = 0;
      for (let n = 0; n < N - k; n++) {
        sum += windowed[n] * windowed[n + k];
      }
      r[k] = sum;
    }

    if (r[0] === 0) {
      return { f1: 500, f2: 1350, timbre: 'DEEP_BARITONE (LONG_VOCAL_TRACT)' };
    }

    // 4. Levinson-Durbin Recursion
    const a = new Float32Array(order + 1);
    a[0] = 1;
    let e = r[0];

    for (let i = 1; i <= order; i++) {
      let lambda = 0;
      for (let j = 0; j < i; j++) {
        lambda += a[j] * r[i - j];
      }
      const k_i = -lambda / e;
      const prevA = new Float32Array(a);
      for (let j = 1; j < i; j++) {
        a[j] = prevA[j] + k_i * prevA[i - j];
      }
      a[i] = k_i;
      e *= (1 - k_i * k_i);
    }

    // 5. Evaluate All-Pole Vocal Tract Spectrum 1/|A(omega)|^2
    // A(e^j*omega) = 1 + sum_{k=1}^p a_k * e^(-j*k*omega)
    const numBins = 256;
    const maxFreq = 3200;
    const minFreq = 250;
    const spectrum = new Float32Array(numBins);
    const binStep = (maxFreq - minFreq) / numBins;

    for (let b = 0; b < numBins; b++) {
      const freq = minFreq + b * binStep;
      const omega = (2 * Math.PI * freq) / this.sampleRate;

      let re = 1.0;
      let im = 0.0;
      for (let k = 1; k <= order; k++) {
        re += a[k] * Math.cos(k * omega);
        im -= a[k] * Math.sin(k * omega);
      }
      const magSq = re * re + im * im;
      spectrum[b] = magSq > 1e-12 ? 1 / magSq : 1e12;
    }

    // 6. Resonant Peak Picking
    const peaks = [];
    for (let b = 1; b < numBins - 1; b++) {
      if (spectrum[b] > spectrum[b - 1] && spectrum[b] > spectrum[b + 1]) {
        peaks.push({ freq: minFreq + b * binStep, mag: spectrum[b] });
      }
    }

    let f1 = 510;
    let f2 = 1320;
    if (peaks.length >= 2) {
      peaks.sort((p1, p2) => p2.mag - p1.mag);
      const topPeaks = peaks.slice(0, 3).sort((p1, p2) => p1.freq - p2.freq);
      f1 = Math.round(topPeaks[0].freq);
      f2 = Math.round(topPeaks[1].freq);
    } else if (peaks.length === 1) {
      f1 = Math.round(peaks[0].freq);
    }

    const timbre = (f1 < 580 && f2 < 1550)
      ? 'DEEP_BARITONE (LONG_VOCAL_TRACT)'
      : (f1 > 600 && f2 > 1750)
      ? 'MEZZO_SOPRANO (SHORT_VOCAL_TRACT)'
      : 'TENOR_ALTO (STANDARD_VOCAL_TRACT)';

    return { f1, f2, timbre };
  }

  /**
   * Glottal Micro-Jitter Perturbation Calculation (Praat / Titze Standard)
   * Measures biological vs synthetic vocal fold cycle-to-cycle stability.
   * Includes period-ratio continuity filtering (ratio <= 1.30) to eliminate
   * false inflation from octave jumps, phonation onsets, and consonant stops.
   */
  calculateJitter(pitchPoints) {
    if (!pitchPoints || pitchPoints.length < 5) return 0.85; // Default normal human jitter

    const periods = pitchPoints.map((f) => 1000 / f); // Period in ms
    let validDiffSum = 0;
    let validPairs = 0;
    let validPeriodSum = 0;

    for (let i = 0; i < periods.length - 1; i++) {
      const t1 = periods[i];
      const t2 = periods[i + 1];
      const ratio = t1 > t2 ? t1 / t2 : t2 / t1;
      // Praat acoustic standard: maximum period factor = 1.30 (30% max change for pitch tracking continuity)
      if (ratio <= 1.30) {
        validDiffSum += Math.abs(t1 - t2);
        validPeriodSum += t1;
        validPairs++;
      }
    }

    if (validPairs < 3) return 0.85; // Fallback to baseline if voiced segments are too fragmented

    const meanPeriod = validPeriodSum / validPairs;
    if (meanPeriod === 0) return 0.85;

    const jitterPercent = (validDiffSum / validPairs / meanPeriod) * 100;
    return parseFloat(jitterPercent.toFixed(2));
  }

  /**
   * MULTI-UTTERANCE ENROLLMENT AGGREGATION (industry standard: TitaNet/NVIDIA
   * enrollment practice — 3-5 samples averaged into a stable centroid).
   *
   * Takes per-utterance DSP summaries and produces:
   *  - centroid features (F0/F1/F2/jitter means across samples)
   *  - ACROSS-SAMPLE variability (std) — the key upgrade over single-shot
   *    enrollment: these sigmas feed the live Mahalanobis matcher so genuine
   *    speakers are not rejected for natural session-to-session variation.
   *  - quality gate: >=3 valid voiced samples required.
   */
  static aggregateEnrollmentSamples(summaries = []) {
    const list = Array.isArray(summaries) ? summaries : [];
    const valid = list.filter((s) => s && s.f0_mean_hz > 0 && s.verdict !== 'STANDBY');
    if (valid.length < 3) {
      return {
        ok: false,
        total_samples: list.length,
        valid_samples: valid.length,
        reason: `Only ${valid.length} valid voiced sample(s) — minimum 3 required. Re-record in a quiet room with consistent mic distance.`
      };
    }

    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr) => {
      if (arr.length < 2) return 0;
      const m = mean(arr);
      return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / arr.length);
    };

    const f0Means = valid.map((s) => s.f0_mean_hz);
    const f0Stds = valid.map((s) => s.f0_std_hz || 0);
    const f1s = valid.map((s) => s.formant_f1_hz).filter((v) => v > 0);
    const f2s = valid.map((s) => s.formant_f2_hz).filter((v) => v > 0);
    const jitters = valid.map((s) => s.jitter_percent).filter((v) => v > 0);

    const f0Target = mean(f0Means);
    const f0AcrossStd = std(f0Means);
    // Enrollment envelope: per-sample mean +/- max(own within-sample std, cross-sample std)
    const f0Min = Math.max(60, Math.round(Math.min(...f0Means.map((m, i) => m - Math.max(f0Stds[i], f0AcrossStd)))));
    const f0Max = Math.min(380, Math.round(Math.max(...f0Means.map((m, i) => m + Math.max(f0Stds[i], f0AcrossStd)))));

    const f1Target = f1s.length ? mean(f1s) : 500;
    const f2Target = f2s.length ? mean(f2s) : 1350;
    const f1Std = f1s.length > 1 ? std(f1s) : 0;
    const f2Std = f2s.length > 1 ? std(f2s) : 0;
    const jitterBaseline = jitters.length ? parseFloat(mean(jitters).toFixed(2)) : 0.92;

    return {
      ok: true,
      sample_count: valid.length,
      total_samples: list.length,
      f0_target_hz: Math.round(f0Target * 10) / 10,
      f0_std_across_hz: Math.round(f0AcrossStd * 10) / 10,
      f0_min_hz: f0Min,
      f0_max_hz: f0Max,
      formant_f1_hz: Math.round(f1Target),
      formant_f2_hz: Math.round(f2Target),
      f1_std_hz: Math.round(f1Std * 10) / 10,
      f2_std_hz: Math.round(f2Std * 10) / 10,
      vocal_timbre: AcousticDspService.classifyTimbre(f1Target, f2Target),
      jitter_baseline_pct: jitterBaseline,
      per_sample_f0: f0Means.map((v) => Math.round(v * 10) / 10)
    };
  }

  static classifyTimbre(f1, f2) {
    return (f1 < 580 && f2 < 1550)
      ? 'DEEP_BARITONE (LONG_VOCAL_TRACT)'
      : (f1 > 600 && f2 > 1750)
      ? 'MEZZO_SOPRANO (SHORT_VOCAL_TRACT)'
      : 'TENOR_ALTO (STANDARD_VOCAL_TRACT)';
  }

  /**
   * Full Acoustic Forensic Extraction & 1:1 Voiceprint Verification
   */
  getAcousticSummary(claimedExecutive = 'Robert Sterling') {
    if (this.sampleCount < 1024) {
      return {
        f0_mean_hz: 0,
        f0_std_hz: 0,
        formant_f1_hz: 0,
        formant_f2_hz: 0,
        vocal_timbre: 'STANDBY (AWAITING SPEECH)',
        jitter_percent: 0,
        voiceprint_match: 0,
        synthetic_confidence: 0,
        verdict: 'STANDBY',
        summary_text: 'Awaiting sufficient live audio stream for acoustic extraction.'
      };
    }

    const activeSignal = this.samples.subarray(0, this.sampleCount);

    // 1. Extract pitch track over multiple 50ms frames
    const hopSize = Math.floor(this.sampleRate * 0.05); // 50ms hop
    const frameSize = Math.floor(this.sampleRate * 0.08); // 80ms window
    const pitches = [];
    let bestVoicedOffset = -1;
    let maxVoicedRms = 0;

    for (let offset = 0; offset + frameSize < this.sampleCount; offset += hopSize) {
      const f0 = this.detectPitchYin(activeSignal, offset, frameSize);
      if (f0 && f0 > 60 && f0 < 380) {
        pitches.push(f0);
        let sumSq = 0;
        for (let i = 0; i < frameSize; i++) {
          const val = activeSignal[offset + i];
          sumSq += val * val;
        }
        const frameRms = Math.sqrt(sumSq / frameSize);
        if (frameRms > maxVoicedRms) {
          maxVoicedRms = frameRms;
          bestVoicedOffset = offset;
        }
      }
    }

    // 2. F0 Statistics
    let f0Mean = 110;
    let f0Std = 12;
    if (pitches.length > 0) {
      f0Mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      const variance = pitches.reduce((acc, val) => acc + Math.pow(val - f0Mean, 2), 0) / pitches.length;
      f0Std = Math.sqrt(variance);
    }

    // 3. Formants & Vocal Timbre (LPC Analysis)
    // Extract formants from the peak-energy voiced frame to avoid fitting poles to ambient room noise
    if (bestVoicedOffset === -1) {
      for (let offset = 0; offset + 1024 <= this.sampleCount; offset += hopSize) {
        let sumSq = 0;
        for (let i = 0; i < 1024; i++) {
          const val = activeSignal[offset + i];
          sumSq += val * val;
        }
        const frameRms = Math.sqrt(sumSq / 1024);
        if (frameRms > maxVoicedRms) {
          maxVoicedRms = frameRms;
          bestVoicedOffset = offset;
        }
      }
    }

    const safeOffset = Math.max(0, Math.min(bestVoicedOffset >= 0 ? bestVoicedOffset : 0, this.sampleCount - 1024));
    const formantSignal = activeSignal.subarray(safeOffset, safeOffset + 1024);
    const formants = this.estimateFormantsLpc(formantSignal);

    // If no voiced pitch is detected and audio is below phonation energy floor, remain on standby
    if (pitches.length === 0 && formants.isSilent) {
      return {
        f0_mean_hz: 0,
        f0_std_hz: 0,
        formant_f1_hz: 0,
        formant_f2_hz: 0,
        vocal_timbre: 'STANDBY (AWAITING SPEECH)',
        jitter_percent: 0,
        voiceprint_match: 0,
        synthetic_confidence: 0,
        verdict: 'STANDBY',
        summary_text: 'Awaiting voiced speech phonation (audio buffer is ambient noise or silence).'
      };
    }

    // 4. Jitter Perturbation
    const jitter = this.calculateJitter(pitches);

    // 5. Enrolled Voiceprint Target Comparison from SQLite / Executive Registry
    // Implements NIST SRE-aligned Standardized Mahalanobis Distance with Gaussian RBF Kernel
    const profile = VoiceprintRepository.getProfileByName(claimedExecutive || 'Robert Sterling');
    const targetF0 = profile.f0_target_hz || 108.5;
    const targetF1 = profile.formant_f1_hz || 500;
    const targetF2 = profile.formant_f2_hz || 1350;

    // Physiological variance tolerances (sigma) — CALIBRATED: when the profile
    // was enrolled multi-utterance, use the real across-sample variability with
    // conservative floors (a 3-sample centroid must not become an over-tight
    // gate). Legacy single-shot profiles fall back to the physiological defaults.
    const sigmaF0 = profile.f0_std_across_hz > 0
      ? Math.max(8.0, profile.f0_std_across_hz)
      : (profile.f0_max_hz && profile.f0_min_hz)
      ? Math.max(12.0, (profile.f0_max_hz - profile.f0_min_hz) / 4)
      : 14.0;
    const sigmaF1 = profile.f1_std_hz > 0 ? Math.max(60.0, profile.f1_std_hz) : 90.0; // Pharyngeal vowel bandwidth variation
    const sigmaF2 = profile.f2_std_hz > 0 ? Math.max(140.0, profile.f2_std_hz) : 200.0; // Oral cavity tongue body variation

    const zF0 = Math.abs(f0Mean - targetF0) / sigmaF0;
    const zF1 = Math.abs(formants.f1 - targetF1) / sigmaF1;
    const zF2 = Math.abs(formants.f2 - targetF2) / sigmaF2;

    // Standardized Weighted Distance (Mahalanobis z-score norm)
    const dStdSq = (0.50 * zF0 * zF0) + (0.25 * zF1 * zF1) + (0.25 * zF2 * zF2);

    // Probabilistic Voiceprint Match Score via Gaussian RBF Kernel (gamma = 1.6)
    // Maps smoothly from [0, inf) to (0.01, 0.99] without arbitrary linear clamping
    const gamma = 1.6;
    const voiceprintMatch = parseFloat(Math.min(0.99, Math.max(0.01, Math.exp(-dStdSq / (2 * gamma * gamma)))).toFixed(2));

    // 6. ASVspoof 5 Calibrated Logistic Anti-Spoofing Classifier
    // Log-odds formulation avoids artificial saturation while penalizing vocoder artifacts
    let logit = -2.2; // Base log-odds for organic human speech (~10% prior risk)
    const reasons = [];

    // Jitter perturbation analysis (ASVspoof 5)
    if (jitter < 0.25) {
      logit += 2.8; // Strong indicator of neural TTS phase-locking (e.g. HiFi-GAN / VALL-E)
      reasons.push('Unnaturally low micro-jitter (Neural TTS phase lock < 0.25%)');
    } else if (jitter > 3.2) {
      logit += 1.8; // DSP vocoder phase discontinuity artifact
      reasons.push('DSP vocoder phase discontinuity (> 3.2%)');
    }

    // Pitch contour intonation dynamics (flat robotic speech)
    if (f0Std < 3.5 && pitches.length > 5) {
      logit += 2.0;
      reasons.push('Flat robotic intonation dynamics (F0 std < 3.5Hz)');
    }

    // Biometric mismatch penalty
    if (voiceprintMatch < 0.60) {
      const mismatchSeverity = (0.60 - voiceprintMatch) / 0.60;
      logit += 1.5 + mismatchSeverity * 2.0;
      reasons.push(`Acoustic biometrics mismatch (${(voiceprintMatch * 100).toFixed(0)}% match) for ${claimedExecutive}`);
    }

    // Calibrated Sigmoid Probability for Synthetic Confidence
    const syntheticScore = parseFloat((1 / (1 + Math.exp(-logit))).toFixed(2));

    const isAnomaly = syntheticScore >= 0.65 || voiceprintMatch < 0.60;
    const verdict = isAnomaly ? 'ANOMALOUS_SYNTHETIC' : 'ORGANIC_HUMAN';

    const summaryText = isAnomaly
      ? `Acoustic Anomaly Flagged: ${reasons.join(', ')}. Pitch: ${f0Mean.toFixed(1)}Hz (Match: ${(voiceprintMatch * 100).toFixed(0)}%).`
      : `Organic Human Glottal Cadence. Pitch: ${f0Mean.toFixed(1)}Hz, Formants: F1=${formants.f1}Hz / F2=${formants.f2}Hz (${formants.timbre}).`;

    return {
      f0_mean_hz: parseFloat(f0Mean.toFixed(1)),
      f0_std_hz: parseFloat(f0Std.toFixed(1)),
      formant_f1_hz: formants.f1,
      formant_f2_hz: formants.f2,
      vocal_timbre: formants.timbre,
      jitter_percent: jitter,
      voiceprint_match: voiceprintMatch,
      synthetic_confidence: syntheticScore,
      verdict,
      summary_text: summaryText
    };
  }
}
