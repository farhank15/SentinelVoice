import { describe, expect, it } from 'bun:test';
import { AcousticDspService } from '../src/services/acousticService.js';

describe('Acoustic DSP Core & Physics Validation (IEEE & JASA Literature)', () => {
  const Fs = 24000;
  const dsp = new AcousticDspService(Fs);

  it('1. YIN Algorithm: Accurately estimates male fundamental pitch (108.5 Hz) within 0.05 Hz', () => {
    const N = Fs * 1; // 1 second of audio
    const signal = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // 108.5 Hz fundamental with natural glottal harmonics
      signal[i] = 0.6 * Math.sin(2 * Math.PI * 108.5 * i / Fs)
                + 0.3 * Math.sin(2 * Math.PI * 217.0 * i / Fs)
                + 0.1 * Math.sin(2 * Math.PI * 325.5 * i / Fs);
    }
    const detected = dsp.detectPitchYin(signal, 0, 1920);
    expect(detected).not.toBeNull();
    expect(Math.abs(detected - 108.5)).toBeLessThan(0.05);
  });

  it('2. YIN Algorithm: Accurately estimates female fundamental pitch (195.0 Hz) within 0.05 Hz', () => {
    const N = Fs * 1;
    const signal = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      signal[i] = 0.7 * Math.sin(2 * Math.PI * 195.0 * i / Fs)
                + 0.3 * Math.sin(2 * Math.PI * 390.0 * i / Fs);
    }
    const detected = dsp.detectPitchYin(signal, 0, 1920);
    expect(detected).not.toBeNull();
    expect(Math.abs(detected - 195.0)).toBeLessThan(0.05);
  });

  it('3. LPC Levinson-Durbin (Order p=24): Resolves male baritone resonances (F1=510Hz, F2=1350Hz)', () => {
    const N = 1024;
    const signal = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      signal[i] = Math.sin(2 * Math.PI * 510 * i / Fs)
                + 0.6 * Math.sin(2 * Math.PI * 1350 * i / Fs)
                + 0.05 * (Math.random() - 0.5);
    }
    const formants = dsp.estimateFormantsLpc(signal, 24);
    expect(formants.f1).toBeGreaterThanOrEqual(480);
    expect(formants.f1).toBeLessThanOrEqual(540);
    expect(formants.f2).toBeGreaterThanOrEqual(1300);
    expect(formants.f2).toBeLessThanOrEqual(1400);
    expect(formants.timbre).toContain('DEEP_BARITONE');
  });

  it('4. Glottal Jitter: Praat-standard period ratio continuity filter eliminates false octave jump penalties', () => {
    // Pitch track with natural 0.8% micro-jitter but an octave glitch (217Hz) in the middle
    const pitchPointsWithOctaveGlitch = [108.5, 109.1, 107.9, 217.0, 108.2, 109.0, 108.7];
    const filteredJitter = dsp.calculateJitter(pitchPointsWithOctaveGlitch);
    // Should NOT blow up to 20%+; must remain within healthy human range (< 1.5%)
    expect(filteredJitter).toBeLessThan(1.5);
    expect(filteredJitter).toBeGreaterThan(0.4);
  });

  it('5. ASVspoof 5 Anomaly Classifier: Detects synthetic vocoders with flat jitter (<0.25%)', () => {
    // Ingest simulated synthetic audio: 108.5Hz pitch but flat intonation and rigid jitter
    dsp.reset();
    const N = Fs * 1;
    for (let i = 0; i < N; i++) {
      // Exactly 108.5Hz with zero frequency modulation (robotic)
      dsp.samples[dsp.sampleCount++] = 0.5 * Math.sin(2 * Math.PI * 108.5 * i / Fs);
    }
    const summary = dsp.getAcousticSummary('Robert Sterling');
    expect(summary.verdict).toBe('ANOMALOUS_SYNTHETIC');
    expect(summary.synthetic_confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('6. 1:1 Voiceprint Matching: High-fidelity organic voice matching Robert Sterling yields high confidence (>=80%)', () => {
    dsp.reset();
    const N = Fs * 1.5;
    for (let i = 0; i < N; i++) {
      // Natural human speech modulation around 108.5Hz with formant resonances (500Hz & 1350Hz) and biological jitter
      const mod = 1.0 * Math.sin(2 * Math.PI * 5 * i / Fs);
      const pitch = 108.5 + mod;
      dsp.samples[dsp.sampleCount++] = 0.5 * Math.sin(2 * Math.PI * pitch * i / Fs)
        + 0.3 * Math.sin(2 * Math.PI * 500 * i / Fs)
        + 0.2 * Math.sin(2 * Math.PI * 1350 * i / Fs)
        + 0.04 * (Math.random() - 0.5);
    }
    const summary = dsp.getAcousticSummary('Robert Sterling');
    expect(summary.voiceprint_match).toBeGreaterThanOrEqual(0.80);
    expect(summary.f0_mean_hz).toBeGreaterThan(100);
    expect(summary.f0_mean_hz).toBeLessThan(118);
  });

  it('7. 1:1 Voiceprint Matching: Impostor soprano voice (210Hz) claiming to be Robert Sterling is flagged with low match (<35%)', () => {
    dsp.reset();
    const N = Fs * 1.5;
    for (let i = 0; i < N; i++) {
      // 210Hz soprano female voice with natural 420Hz harmonic series
      dsp.samples[dsp.sampleCount++] = 0.7 * Math.sin(2 * Math.PI * 210 * i / Fs)
        + 0.3 * Math.sin(2 * Math.PI * 420 * i / Fs);
    }
    const summary = dsp.getAcousticSummary('Robert Sterling');
    expect(summary.voiceprint_match).toBeLessThan(0.35);
    expect(summary.verdict).toBe('ANOMALOUS_SYNTHETIC');
  });
});
