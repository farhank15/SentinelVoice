import React, { useState, useRef, useEffect } from 'react';
import { Fingerprint, Mic, CheckCircle2, AlertCircle, X, Volume2, Database } from 'lucide-react';
import { apiUrl } from '../config/api.js';

function downsampleToPCM16(float32, inputRate, outputRate = 24000) {
  if (!float32 || float32.length === 0) return new Int16Array(0);
  if (inputRate === outputRate) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32[i]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return out;
  }

  const ratio = inputRate / outputRate;
  const outLength = Math.max(1, Math.round(float32.length / ratio));
  const out = new Int16Array(outLength);

  let inputOffset = 0;
  for (let i = 0; i < outLength; i++) {
    const nextOffset = Math.min(float32.length, Math.round((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (; inputOffset < nextOffset; inputOffset++) {
      sum += float32[inputOffset];
      count++;
    }
    const sample = Math.max(-1, Math.min(1, count > 0 ? sum / count : 0));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return out;
}

export function VoiceEnrollmentModal({ isOpen, onClose }) {
  const TOTAL_SAMPLES = 4; // industry standard: 3-5 samples averaged into a centroid
  const [executives, setExecutives] = useState([]);
  const [selectedExecId, setSelectedExecId] = useState('EXEC-001');
  const [customName, setCustomName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(6);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [enrollmentResult, setEnrollmentResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // Multi-utterance state: completed sample F0 readings + collected PCM payloads
  const [sampleProgress, setSampleProgress] = useState({ done: 0, total: TOTAL_SAMPLES, f0s: [] });
  const samplesRef = useRef([]);
  const [sampleError, setSampleError] = useState(null);

  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setEnrollmentResult(null);
      setSampleProgress({ done: 0, total: TOTAL_SAMPLES, f0s: [] });
      samplesRef.current = [];
      setSampleError(null);
      fetch(apiUrl('/api/voiceprint/profiles'))
        .then((res) => res.json())
        .then((data) => {
          if (data && data.profiles) {
            setExecutives(data.profiles);
            if (data.profiles.length > 0) setSelectedExecId(data.profiles[0].executive_id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const selectedExec = executives.find((e) => e.executive_id === selectedExecId) || {
    executive_id: 'EXEC-001',
    executive_name: 'Robert Sterling',
    title: 'Chief Executive Officer (CEO)',
    f0_target_hz: 108.5,
    vocal_timbre: 'DEEP_BARITONE (LONG_VOCAL_TRACT)'
  };

  const startEnrollmentRecording = async () => {
    try {
      setEnrollmentResult(null);
      setSampleError(null);
      setCountdown(6);
      setIsRecording(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false, // We want raw acoustic characteristics
          sampleRate: 24000
        }
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const muteNode = audioCtx.createGain();
      muteNode.gain.value = 0;
      source.connect(processor);
      processor.connect(muteNode);
      muteNode.connect(audioCtx.destination);

      const volBuffer = new Uint8Array(analyser.frequencyBinCount);
      const volInterval = setInterval(() => {
        analyser.getByteFrequencyData(volBuffer);
        const avg = volBuffer.reduce((a, b) => a + b, 0) / volBuffer.length;
        setVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
      }, 50);

      processor.onaudioprocess = (e) => {
        const floatData = e.inputBuffer.getChannelData(0);
        const inRate = audioCtx.sampleRate || 24000;
        const pcm16 = downsampleToPCM16(floatData, inRate, 24000);
        if (pcm16.length > 0) {
          audioChunksRef.current.push(pcm16);
        }
      };

      let timeLeft = 6;
      timerRef.current = setInterval(() => {
        timeLeft -= 1;
        setCountdown(timeLeft);
        if (timeLeft <= 0) {
          clearInterval(timerRef.current);
          clearInterval(volInterval);
          finishRecording();
        }
      }, 1000);
    } catch (err) {
      console.error('[Enrollment Mic Error]', err);
      setIsRecording(false);
      alert(`Could not access microphone: ${err.message}`);
    }
  };

  const finishRecording = async () => {
    setIsRecording(false);
    setIsLoading(true);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Merge PCM chunks into one Uint8Array
    let totalLen = 0;
    for (const chunk of audioChunksRef.current) totalLen += chunk.length;
    const combinedPcm = new Int16Array(totalLen);
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      combinedPcm.set(chunk, offset);
      offset += chunk.length;
    }

    const uint8 = new Uint8Array(combinedPcm.buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < uint8.length; i += chunk) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    samplesRef.current.push(base64);

    const done = samplesRef.current.length;

    // Not all samples collected yet — store and prompt for the next repetition.
    if (done < TOTAL_SAMPLES) {
      setIsLoading(false);
      try {
        const probeRes = await fetch(apiUrl('/api/voiceprint/enroll'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            executive_id: selectedExecId === 'CUSTOM' ? `EXEC-${Date.now().toString().slice(-4)}` : selectedExecId,
            executive_name: selectedExecId === 'CUSTOM' ? (customName || 'Custom Executive') : selectedExec.executive_name,
            samples_base64: samplesRef.current
          })
        });
        const probe = await probeRes.json();
        if (probe && probe.per_sample_f0) {
          setSampleProgress({ done, total: TOTAL_SAMPLES, f0s: probe.per_sample_f0 });
        } else {
          setSampleProgress({ done, total: TOTAL_SAMPLES, f0s: [] });
        }
      } catch (e) {
        setSampleProgress({ done, total: TOTAL_SAMPLES, f0s: [] });
      }
      return;
    }

    // All samples collected — finalize centroid enrollment
    const execName = selectedExecId === 'CUSTOM' ? (customName || 'Custom Executive') : selectedExec.executive_name;

    try {
      const res = await fetch(apiUrl('/api/voiceprint/enroll'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executive_id: selectedExecId === 'CUSTOM' ? `EXEC-${Date.now().toString().slice(-4)}` : selectedExecId,
          executive_name: execName,
          title: selectedExec.title || 'Executive Officer',
          samples_base64: samplesRef.current,
          duration_sec: 6.0
        })
      });
      const data = await res.json();
      setIsLoading(false);
      if (data && data.error === 'ENROLLMENT_QUALITY_GATE') {
        // Too few valid voiced samples — reset so the user re-records everything.
        setSampleError(data.detail || 'Enrollment quality gate failed — re-record all samples.');
        samplesRef.current = [];
        setSampleProgress({ done: 0, total: TOTAL_SAMPLES, f0s: [] });
        return;
      }
      if (data && data.enrolled_voiceprint) {
        setSampleProgress({ done: TOTAL_SAMPLES, total: TOTAL_SAMPLES, f0s: data.acoustic_analysis?.per_sample_f0 || [] });
        setEnrollmentResult(data);
      }
    } catch (err) {
      setIsLoading(false);
      setSampleError('Enrollment API error — check backend connection.');
      console.error('[Enrollment API Error]', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Fingerprint className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Executive Voiceprint Enrollment Vault
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                NIST SP 800-63B • SQLite Biometric Baseline Calibration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Executive Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-mono">
              1. Select Executive Identity to Enroll / Calibrate
            </label>
            <select
              value={selectedExecId}
              disabled={isRecording}
              onChange={(e) => {
                setSelectedExecId(e.target.value);
                setEnrollmentResult(null);
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-medium focus:outline-hidden focus:border-indigo-500"
            >
              {executives.map((ex) => (
                <option key={ex.executive_id} value={ex.executive_id}>
                  {ex.executive_name} ({ex.title}) — Baseline F0: {ex.f0_target_hz || 110}Hz
                </option>
              ))}
              <option value="CUSTOM">+ Enroll My Custom Voice Profile</option>
            </select>
          </div>

          {selectedExecId === 'CUSTOM' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">
                Custom Executive Name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. John Doe. (Treasury Director)"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-800 font-medium focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          )}

          {/* Current Enrolled Baseline Card */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 font-mono text-[11px] flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">REGISTERED BIOMETRIC BASELINE</span>
              <span className="font-bold text-slate-800 text-xs">
                Pitch: {selectedExec.f0_target_hz || 108.5} Hz • F1: {selectedExec.formant_f1_hz || 500} Hz / F2: {selectedExec.formant_f2_hz || 1350} Hz
              </span>
              <span className="text-[10px] text-indigo-600 block mt-0.5">
                Resonance: {selectedExec.vocal_timbre || 'DEEP_BARITONE (LONG_VOCAL_TRACT)'}
              </span>
            </div>
            {/* <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 text-[10px] font-bold">
              <Database className="w-3 h-3" />
              <span>SQLite</span>
            </div>*/}
          </div>

          {/* Multi-utterance sample progress */}
          {sampleProgress.done > 0 && sampleProgress.done < sampleProgress.total && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 font-mono text-[10.5px]">
              <span className="font-bold text-amber-800">
                Sample {sampleProgress.done}/{sampleProgress.total} accepted
              </span>
              <span className="text-amber-700"> — rest briefly, then record the next repetition. Per-sample F0: </span>
              <span className="font-bold text-amber-900">
                {sampleProgress.f0s.length ? sampleProgress.f0s.map((v) => `${v}Hz`).join(' • ') : 'analyzing…'}
              </span>
            </div>
          )}

          {sampleError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 font-mono text-[10.5px] flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
              <span className="text-rose-800 font-medium">{sampleError}</span>
            </div>
          )}

          {/* Prompt Sentence to Read */}
          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
            <span className="text-[10.5px] font-mono font-bold text-indigo-900 block mb-1">
              PROMPT: Read this out loud clearly into your microphone ({countdown}s):
            </span>
            <p className="text-xs font-semibold text-slate-800 italic leading-relaxed">
              "I am authorizing the institutional treasury dual-control compliance verification protocol for OmniCorp Global Holdings."
            </p>
          </div>

          {/* Live Recording Area */}
          <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 gap-3">
            {isRecording ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="flex items-center gap-2 text-rose-600 font-bold text-sm font-mono animate-pulse">
                  <span className="w-3 h-3 rounded-full bg-rose-600" />
                  <span>Recording Voice Sample... {countdown}s</span>
                </div>
                {/* Visual Audio Volume Bar */}
                <div className="w-full max-w-xs bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-75 rounded-full"
                    style={{ width: `${Math.max(5, volumeLevel)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  Input Volume: {volumeLevel}% • Extracting glottal pulses & formants...
                </span>
              </div>
            ) : isLoading ? (
              <div className="flex items-center gap-2 text-indigo-600 font-bold font-mono">
                <span className="animate-spin">⏳</span>
                <span>Calculating YIN Pitch, LPC Formants, & Jitter...</span>
              </div>
            ) : (
              <button
                onClick={startEnrollmentRecording}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Mic className="w-4 h-4" />
                <span>
                  {sampleProgress.done === 0
                    ? `Start Calibration — Sample 1 of ${TOTAL_SAMPLES}`
                    : `Record Sample ${sampleProgress.done + 1} of ${TOTAL_SAMPLES}`}
                </span>
              </button>
            )}
          </div>

          {/* Enrollment Success Result */}
          {enrollmentResult && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 font-mono space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Voiceprint Successfully Enrolled to SQLite Vault!</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10.5px] text-slate-700 pt-1">
                <div>
                  <span className="text-slate-400 block">Measured Pitch (F0):</span>
                  <span className="font-bold text-slate-900">{enrollmentResult.enrolled_voiceprint.f0_target_hz} Hz</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Vocal Resonances:</span>
                  <span className="font-bold text-slate-900">
                    F1: {enrollmentResult.enrolled_voiceprint.formant_f1_hz}Hz / F2: {enrollmentResult.enrolled_voiceprint.formant_f2_hz}Hz
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Glottal Jitter:</span>
                  <span className="font-bold text-slate-900">{enrollmentResult.enrolled_voiceprint.jitter_baseline_pct}% (Natural)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Vocal Timbre:</span>
                  <span className="font-bold text-indigo-700">{enrollmentResult.enrolled_voiceprint.vocal_timbre}</span>
                </div>
              </div>
              <p className="text-[10px] text-emerald-700 pt-1 border-t border-emerald-200/60 font-medium">
                Centroid from {enrollmentResult.acoustic_analysis?.sample_count || TOTAL_SAMPLES} utterances — cross-sample variability now calibrates the live Mahalanobis matcher.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <span className="text-[10.5px] font-mono text-slate-400">
            Database: SQLite (Persisted)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
