import { useState, useEffect, useRef, useCallback } from 'react';
import { apiUrl, getWsUrl } from '../config/api.js';

export function useVoiceSession() {
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // DISCONNECTED | CONNECTING | CONNECTED | ERROR
  const [agentState, setAgentState] = useState('IDLE'); // IDLE | LISTENING | ANALYZING | SPEAKING | EMERGENCY_LOCK
  const [transcripts, setTranscripts] = useState([]);
  const [toolCalls, setToolCalls] = useState([]);
  const [escrowState, setEscrowState] = useState({
    txId: null,
    amount: 0,
    currency: 'USD',
    accountNumber: '--',
    vendorName: 'No Active Wire Intercept',
    status: 'STANDBY', // STANDBY | PENDING_VERIFICATION | FROZEN | RELEASED
    riskLevel: 'NOMINAL',
    reason: null
  });
  const [isMicActive, setIsMicActive] = useState(false);
  const [isScenarioRunning, setIsScenarioRunning] = useState(false);
  const [latestThinking, setLatestThinking] = useState(null);
  const [activeScenarioMeta, setActiveScenarioMeta] = useState(null);
  const [micLevel, setMicLevel] = useState(0); // live mic RMS 0..1 for the wave visualizer
  const isScenarioRunningRef = useRef(false);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const playAudioCtxRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const isCallStartedRef = useRef(false);
  const scheduledSourcesRef = useRef(new Set()); // all queued BufferSources (for instant barge-in flush)
  const agentSpeakingRef = useRef(false); // half-duplex gate: mute mic while agent speaks (echo prevention)
  const halfDuplexTailRef = useRef(null); // short tail timer before reopening mic gate
  const lastCallerFinalAtRef = useRef(0); // zombie-bubble watchdog: last time a caller bubble was finalized
  const micGateStuckSinceRef = useRef(0); // watchdog: when the half-duplex gate closed
  const isUnmountedRef = useRef(false); // stop ws.onclose auto-reconnect after unmount

  // Unlocks audio context on user gesture (bypasses browser autoplay policy)
  const unlockAudioContext = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!playAudioCtxRef.current || playAudioCtxRef.current.state === 'closed') {
        playAudioCtxRef.current = new AudioCtx({ sampleRate: 24000 });
      }
      if (playAudioCtxRef.current.state === 'suspended') {
        playAudioCtxRef.current.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('[AudioContext Unlock]', e);
    }
  }, []);

  const currentReplyIdRef = useRef(null);

  // Instantly stop all scheduled audio (barge-in / interruption flush)
  const flushPlayback = useCallback(() => {
    nextPlayTimeRef.current = 0;
    const sources = scheduledSourcesRef.current;
    scheduledSourcesRef.current = new Set();
    sources.forEach((src) => {
      try { src.stop(); } catch (e) {}
      try { src.disconnect(); } catch (e) {}
    });
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  }, []);

  const playAudioChunk = useCallback((base64, replyId = null) => {
    try {
      if (!base64) return;
      if (replyId && currentReplyIdRef.current !== replyId) {
        currentReplyIdRef.current = replyId;
        nextPlayTimeRef.current = 0;
      }
      const binaryString = atob(base64);
      const len = binaryString.length;
      if (len < 2) return;

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Drop odd trailing byte if any to prevent RangeError in Int16 decoding
      const validByteLen = len - (len % 2);
      if (validByteLen <= 0) return;

      const dataView = new DataView(bytes.buffer, bytes.byteOffset, validByteLen);
      const samplesCount = validByteLen / 2;
      const float32 = new Float32Array(samplesCount);

      for (let i = 0; i < samplesCount; i++) {
        const pcmVal = dataView.getInt16(i * 2, true); // true = Little-Endian PCM16
        float32[i] = pcmVal < 0 ? pcmVal / 32768 : pcmVal / 32767;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!playAudioCtxRef.current || playAudioCtxRef.current.state === 'closed') {
        playAudioCtxRef.current = new AudioCtx({ sampleRate: 24000 });
      }

      const audioCtx = playAudioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;

      // Track source for barge-in flush
      scheduledSourcesRef.current.add(source);
      source.onended = () => scheduledSourcesRef.current.delete(source);

      // Master gain node to ensure full loudness
      const masterGain = audioCtx.createGain();
      masterGain.gain.value = 1.0;
      source.connect(masterGain);
      masterGain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      // Seamless audio queue: if queue is idle or fell behind real time, schedule with small jitter buffer
      if (nextPlayTimeRef.current < now) {
        nextPlayTimeRef.current = now + 0.025;
      }

      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += audioBuffer.duration;
    } catch (err) {
      console.error('[Audio Playback Error]', err);
    }
  }, []);

  const speakSynthesis = useCallback((text, role) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const speakChunk = (chunkText) => {
        try {
          const utterance = new SpeechSynthesisUtterance(chunkText);
          utterance.rate = 1.05;
          utterance.pitch = role === 'agent' ? 1.05 : 0.85;
          const voices = window.speechSynthesis.getVoices();
          const enVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
          if (enVoice) utterance.voice = enVoice;
          window.speechSynthesis.speak(utterance);
        } catch (err) {
          console.warn('[SpeechSynthesis Speak]', err);
        }
      };
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // cancel() is asynchronous inside Chrome — speaking in the same tick gets
      // swallowed. Give the queue one tick to actually flush before speaking.
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
        setTimeout(() => speakChunk(text), 60);
      } else {
        speakChunk(text);
      }
    } catch (e) {
      console.warn('[SpeechSynthesis]', e);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setConnectionStatus('CONNECTING');
    const wsUrl = getWsUrl();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('CONNECTED');
      setAgentState('LISTENING');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'status') {
          if (msg.state === 'ERROR') setConnectionStatus('ERROR');
        }

        if (msg.type === 'agent_state' && msg.state) {
          setAgentState(msg.state);

          // Half-duplex echo gate state tracking (ARIA-style: gate mic while agent
          // speaks, reopen after a short tail so the TTS tail doesn't retrigger VAD)
          if (msg.state === 'SPEAKING') {
            agentSpeakingRef.current = true;
            if (halfDuplexTailRef.current) {
              clearTimeout(halfDuplexTailRef.current);
              halfDuplexTailRef.current = null;
            }
          } else if (msg.state === 'LISTENING' || msg.state === 'IDLE') {
            if (halfDuplexTailRef.current) clearTimeout(halfDuplexTailRef.current);
            halfDuplexTailRef.current = setTimeout(() => {
              agentSpeakingRef.current = false;
            }, 350);
          }

          // BARGE-IN FLUSH POLICY (per AssemblyAI docs): flush scheduled audio only
          // on reply.done with status 'interrupted' (handled below via reply_done).
          // Do NOT flush on input.speech.started: with laptop speakers the VAD can
          // pick up the agent's own TTS and we'd cut off our own audio mid-reply
          // ("agent interrupts itself" — docs: Troubleshooting). The half-duplex
          // gate above already prevents echo from reaching the VAD.
          if (msg.interrupted && msg.state === 'LISTENING' && !msg.userSpeaking) {
            // true semantic barge-in confirmed by the server (reply.done interrupted)
            flushPlayback();
            if (halfDuplexTailRef.current) {
              clearTimeout(halfDuplexTailRef.current);
              halfDuplexTailRef.current = null;
            }
            agentSpeakingRef.current = false;
          }
        }

        if (msg.type === 'audio_chunk' && msg.buffer) {
          playAudioChunk(msg.buffer, msg.replyId);
        }

        if (msg.type === 'transcript_delta') {
          // Merge streaming deltas into ONE bubble keyed by replyId (per-turn in
          // simulation, per-reply live). STRICT RULE: a bubble that is already
          // finalized must NEVER be rewritten — a delta for a finalized key means
          // a NEW turn reusing the key, so spawn a fresh bubble instead (keeps
          // multi-turn scenario transcripts as a growing list, not a rewrite).
          const streamKey = msg.replyId || `role_${msg.role}`;
          setTranscripts((prev) => {
            const idx = prev.findIndex((t) => t.streamKey === streamKey);
            if (idx !== -1) {
              const target = prev[idx];
              if (!target.isStreaming) {
                // Finalized bubble with same key: start a NEW bubble (turn boundary)
                return [
                  ...prev,
                  {
                    id: `stream_${Date.now()}_${Math.random()}`,
                    streamKey: `${streamKey}_${Date.now()}`, // unique key — never re-collide
                    role: msg.role,
                    speaker: msg.speaker || (msg.role === 'agent' ? 'SentinelVoice AI' : 'Caller (Live Voice)'),
                    text: msg.text || '',
                    isStreaming: true,
                    lastDeltaAt: Date.now(),
                    timestamp: new Date().toLocaleTimeString('en-US')
                  }
                ];
              }
              const needsSpace = msg.mode === 'append' &&
                target.text.length > 0 &&
                !target.text.endsWith(' ') &&
                !msg.text.startsWith(' ') &&
                !/^[.,!?;:'")\]}]/.test(msg.text);
              const updatedText = msg.mode === 'append'
                ? target.text + (needsSpace ? ' ' : '') + (msg.text || '')
                : msg.text;
              const next = prev.slice();
              next[idx] = { ...target, text: updatedText, isStreaming: true, lastDeltaAt: Date.now() };
              return next;
            }
            return [
              ...prev,
              {
                id: `stream_${Date.now()}_${Math.random()}`,
                streamKey,
                role: msg.role,
                speaker: msg.speaker || (msg.role === 'agent' ? 'SentinelVoice AI' : 'Caller (Live Voice)'),
                text: msg.text || '',
                isStreaming: true,
                lastDeltaAt: Date.now(),
                timestamp: new Date().toLocaleTimeString('en-US')
              }
            ];
          });

          if (msg.role === 'agent') {
            agentSpeakingRef.current = true;
            setAgentState('SPEAKING');
          }
          // NOTE: caller delta no longer forces ANALYZING — that made the UI flap
          // between Listening/Analyzing on every word. input.speech.* events drive it.
        }

        if (msg.type === 'transcript' || msg.type === 'transcript_final') {
          // Final transcript: finalize the streaming bubble if it exists, else create one.
          setTranscripts((prev) => {
            const streamKey = msg.replyId || `role_${msg.role}`;
            const idx = prev.findIndex((t) => t.streamKey === streamKey && t.isStreaming);
            if (idx !== -1) {
              const next = prev.slice();
              next[idx] = {
                ...next[idx],
                text: msg.text, // authoritative full text (also fixes partial concat drift)
                isStreaming: false,
                finalizedAt: Date.now()
              };
              return next;
            }
            // No matching streaming bubble (e.g. final arrived without deltas).
            // LIVE MIC ONLY: caller finals can arrive in quick succession with
            // different item_ids (VAD splits, duplicate transcript.user) — merge
            // those into one bubble. In SCENARIO mode every turn carries a unique
            // replyId, so a finalized same-role bubble means a NEW turn -> append.
            const isScenarioTurn = Boolean(msg.replyId && msg.replyId.startsWith('sim_'));
            if (!isScenarioTurn) {
              const lastSameRole = [...prev].reverse().find((t) => t.role === msg.role && !t.isStreaming);
              if (lastSameRole && Date.now() - (lastSameRole.finalizedAt || 0) < 4000) {
                return prev.map((t) => t.id === lastSameRole.id ? { ...t, text: msg.text, finalizedAt: Date.now() } : t);
              }
            }
            return [
              ...prev,
              {
                id: `tr_${Date.now()}_${Math.random()}`,
                streamKey: `role_${msg.role}`,
                role: msg.role,
                speaker: msg.speaker || (msg.role === 'agent' ? 'SentinelVoice AI' : 'Caller'),
                text: msg.text,
                isStreaming: false,
                finalizedAt: Date.now(),
                timestamp: msg.timestamp || new Date().toLocaleTimeString('en-US')
              }
            ];
          });

          // In simulation scenarios, only the AGENT speaks aloud. Voicing both
          // sides floods the speechSynthesis queue — caller TTS is still playing
          // when the agent's final arrives, so cancel() cuts it mid-word and the
          // two voices race/overlap. Agent-only audio matches a real call (the
          // caller side reads as transcript text).
          if (isScenarioRunningRef.current && msg.text && msg.role === 'agent') {
            speakSynthesis(msg.text, msg.role);
          }

          if (msg.role === 'agent') {
            if (msg.localTakeover) {
              // Local-brain turn: the speak_text handler owns the SPEAKING window
              // and the mic gate (real TTS playback time, not event timing).
              // Forcing LISTENING here would open the gate while browser TTS is
              // still playing -> mic re-captures the TTS -> echo loop.
            } else if (isScenarioRunningRef.current) {
              // Simulation: TTS is still playing the response — hold SPEAKING for
              // the estimated playback duration so the UI doesn't flip to
              // LISTENING mid-speech (matches what the user hears).
              agentSpeakingRef.current = true;
              const estMs = Math.min(20000, Math.max(1500, String(msg.text || '').split(/\s+/).length * 140));
              setTimeout(() => {
                agentSpeakingRef.current = false;
                setAgentState((cur) => (cur === 'SPEAKING' ? 'LISTENING' : cur));
              }, estMs);
            } else {
              agentSpeakingRef.current = false;
              setAgentState('LISTENING'); // reply fully delivered — no artificial 3.5s freeze
            }
          } else {
            setAgentState('ANALYZING'); // caller final -> agent is about to think/reply
            lastCallerFinalAtRef.current = Date.now();
            micGateStuckSinceRef.current = 0; // gate clearly reopened — reset watchdog
          }
        }

        // Zombie-bubble watchdog: a streaming bubble whose reply ended >15s ago but
        // never got a final transcript (dropped packet, reply.done(interrupted) race)
        // would show a blinking cursor forever and block same-key bubbles. Kill it.
        if (msg.type === 'reply_done') {
          // Authoritative end-of-reply from backend. Per AssemblyAI docs, THIS is the
          // flush point: reply.done with status 'interrupted' means the server cut the
          // reply short — drain scheduled audio so stale speech never plays.
          if (msg.status === 'interrupted') {
            flushPlayback();
            agentSpeakingRef.current = false;
          }
          setTimeout(() => {
            setTranscripts((prev) => {
              const now = Date.now();
              let changed = false;
              const next = prev.map((t) => {
                if (t.isStreaming && (msg.replyId == null || t.streamKey === msg.replyId || now - t.lastDeltaAt > 5000)) {
                  changed = true;
                  return { ...t, isStreaming: false, finalizedAt: t.finalizedAt || now };
                }
                return t;
              });
              return changed ? next : prev;
            });
          }, 150);
        }

        if (msg.type === 'reply.done') {
          setTimeout(() => {
            setTranscripts((prev) => {
              const now = Date.now();
              let changed = false;
              const next = prev.map((t) => {
                if (t.isStreaming && now - t.lastDeltaAt > 15000) {
                  changed = true;
                  return { ...t, isStreaming: false, finalizedAt: t.finalizedAt || now };
                }
                return t;
              });
              return changed ? next : prev;
            });
          }, 100);
        }

        if (msg.type === 'tool_call_start') {
          setAgentState('ANALYZING');
          setToolCalls((prev) => [
            {
              id: msg.callId || `call_${Date.now()}`,
              toolName: msg.toolName,
              args: msg.args,
              status: 'CALLING',
              timestamp: msg.timestamp,
              result: null
            },
            ...prev
          ]);
        }

        if (msg.type === 'tool_call_end') {
          setToolCalls((prev) =>
            prev.map((call) =>
              call.toolName === msg.toolName
                ? { ...call, status: 'COMPLETED', result: msg.result }
                : call
            )
          );

          // Update Escrow state based on tool results
          if (msg.toolName === 'emergency_escrow_freeze') {
            setAgentState('EMERGENCY_LOCK');
            setEscrowState((prev) => ({
              ...prev,
              status: 'FROZEN',
              riskLevel: 'CRITICAL',
              reason: msg.result?.freeze_reason || 'High-Confidence Deepfake BEC Pattern Confirmed'
            }));
          } else if (msg.toolName === 'release_escrow_transfer') {
            setAgentState('LISTENING');
            setEscrowState((prev) => ({
              ...prev,
              status: 'RELEASED',
              riskLevel: 'LOW',
              reason: 'Verified Genuine Authorization'
            }));
          }
        }

        if (msg.type === 'escrow_update' && msg.transaction) {
          setEscrowState({
            txId: msg.transaction.tx_id,
            amount: msg.transaction.amount_usd || 0,
            currency: msg.transaction.currency || 'USD',
            accountNumber: msg.transaction.account_number || '--',
            vendorName: msg.transaction.vendor_name || 'No Active Wire Intercept',
            status: msg.transaction.status,
            riskLevel: msg.transaction.risk_level || 'NOMINAL',
            reason: msg.transaction.freeze_reason || null
          });
        }

        if (msg.type === 'thinking_stream') {
          setLatestThinking((prev) => ({
            thinking: msg.thinking,
            dagNode: msg.dag_node || prev?.dagNode,
            threatAssessment: msg.threat_assessment !== undefined ? msg.threat_assessment : prev?.threatAssessment,
            engine: msg.engine || 'Sentinel Forensic Core',
            timestamp: new Date().toLocaleTimeString('en-US')
          }));
        }

        // Local-brain takeover speech: backend forensic core speaks via browser TTS
        if (msg.type === 'speak_text' && msg.text) {
          // Gate the mic for the REAL TTS playback duration (speakers would re-capture it)
          agentSpeakingRef.current = true;
          speakSynthesis(msg.text, msg.role || 'agent');
          // Approximate the speaking duration so the UI doesn't flap back to
          // LISTENING while the TTS is still playing (≈150ms per word).
          const estMs = Math.min(20000, Math.max(2500, String(msg.text).split(/\s+/).length * 150));
          setTimeout(() => {
            agentSpeakingRef.current = false;
            setAgentState((cur) => (cur === 'SPEAKING' ? 'LISTENING' : cur));
          }, estMs);
        }

        if (msg.type === 'scenario_meta') {
          setActiveScenarioMeta(msg.scenario);
          setIsScenarioRunning(true);
          isScenarioRunningRef.current = true;
        }

        if (msg.type === 'scenario_completed') {
          setIsScenarioRunning(false);
          isScenarioRunningRef.current = false;
        }
      } catch (err) {
        console.error('[VoiceSession] Error parsing message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[VoiceSession] WebSocket error:', err);
      setConnectionStatus('ERROR');
    };

    ws.onclose = () => {
      setConnectionStatus('DISCONNECTED');
      setAgentState('IDLE');
      // Auto-reconnect to backend after connection drop — but never after unmount
      // (cleanup close() would otherwise schedule reconnects forever → zombie sockets)
      if (isUnmountedRef.current) return;
      setTimeout(() => {
        if (!isUnmountedRef.current) {
          console.log('[VoiceSession] Attempting auto-reconnect to backend...');
          connect();
        }
      }, 1500);
    };
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    // Unlock Web Audio context on the user's very first interaction (bypasses browser autoplay lock)
    const handleFirstGesture = () => {
      unlockAudioContext();
    };
    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });

    // Preload system voices for speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }

    // Synchronize initial escrow state directly from backend
    fetch(apiUrl('/api/escrow/latest'))
      .then((res) => res.json())
      .then((data) => {
        if (data && data.status) {
          setEscrowState({
            txId: data.tx_id,
            amount: data.amount_usd || 0,
            currency: data.currency || 'USD',
            accountNumber: data.account_number || '--',
            vendorName: data.vendor_name || 'No Active Wire Intercept',
            status: data.status,
            riskLevel: data.risk_level || 'NOMINAL',
            reason: data.freeze_reason || null
          });
        }
      })
      .catch(() => {});

    return () => {
      isUnmountedRef.current = true;
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      if (wsRef.current) wsRef.current.close();
      stopMic();
    };
  }, [connect, unlockAudioContext, flushPlayback]);

  const triggerScenario = (scenarioName = 'ferrari_ceo_deepfake', customTuning = null) => {
    unlockAudioContext();
    // Reset state for new scenario
    setTranscripts([]);
    setToolCalls([]);
    setLatestThinking(null);
    setIsScenarioRunning(true);
    isScenarioRunningRef.current = true;
    isCallStartedRef.current = false;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'trigger_simulation_scenario',
        scenario: scenarioName,
        tuningConfig: customTuning
      }));
    } else {
      connect();
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'trigger_simulation_scenario',
            scenario: scenarioName,
            tuningConfig: customTuning
          }));
        }
      }, 350);
    }
  };

  const startMic = async () => {
    try {
      unlockAudioContext();
      setIsScenarioRunning(false);
      isScenarioRunningRef.current = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      // Only initiate new call session & greeting if this is a fresh call
      // If muting/unmuting mid-call, resume existing session without greeting repeat
      if (!isCallStartedRef.current) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'start_call' }));
        }
        isCallStartedRef.current = true;
      }

      // 1. Request microphone with hardware echo cancellation, noise suppression, and mono channel
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 24000
        }
      });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      let audioCtx;
      try {
        audioCtx = new AudioCtx({ sampleRate: 24000 });
      } catch (e) {
        audioCtx = new AudioCtx();
      }
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // 2048 samples = ~85ms chunks for low-latency streaming
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      // Connect through a zero-gain mute node to keep script processor active without feeding mic back to speakers
      const muteNode = audioCtx.createGain();
      muteNode.gain.value = 0;
      source.connect(processor);
      processor.connect(muteNode);
      muteNode.connect(audioCtx.destination);

      // Ensure playback context is unlocked on this user gesture
      if (playAudioCtxRef.current && playAudioCtxRef.current.state === 'suspended') {
        playAudioCtxRef.current.resume().catch(() => {});
      }

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const floatAll = e.inputBuffer.getChannelData(0);

        // Live mic level meter (drives the wave visualizer). Always computed,
        // even while gated, so the UI can show the agent-speaking state too.
        let lvlSq = 0;
        for (let i = 0; i < floatAll.length; i++) lvlSq += floatAll[i] * floatAll[i];
        const lvlRms = Math.sqrt(lvlSq / floatAll.length);
        const lvl = Math.min(1, lvlRms * 6);
        // Throttle React updates to ~12fps — setMicLevel on every audio frame
        // (23x/sec+) would re-render the whole app tree needlessly.
        if (!processor._lastLevelPush || Date.now() - processor._lastLevelPush > 80) {
          processor._lastLevelPush = Date.now();
          setMicLevel((prev) => prev + (lvl - prev) * 0.35); // smooth EMA for natural motion
        }

        // Watchdog: if the half-duplex gate has been shut for >8s with the agent
        // NOT speaking (e.g. a LISTENING event was lost), force it open again —
        // otherwise the agent goes permanently deaf mid-conversation.
        if (agentSpeakingRef.current) {
          if (!micGateStuckSinceRef.current) micGateStuckSinceRef.current = Date.now();
          if (Date.now() - micGateStuckSinceRef.current > 8000) {
            console.warn('[VoiceSession] Half-duplex gate stuck — force reopening mic gate.');
            agentSpeakingRef.current = false;
            micGateStuckSinceRef.current = 0;
          }
        } else {
          micGateStuckSinceRef.current = 0;
        }

        // Half-duplex gate: while the agent is speaking, do not stream mic audio.
        // Prevents the agent from transcribing its own TTS output (self-interrupt loop)
        // on speakers — same approach ARIA uses (mic gated with a short tail).
        if (agentSpeakingRef.current) return;

        const floatData = e.inputBuffer.getChannelData(0);
        const inRate = audioCtx.sampleRate || 24000;

        // 1. Dynamic resampling: converts hardware mic clock (48kHz/44.1kHz on Mac) to exact 24kHz for AssemblyAI
        let data24k = floatData;
        if (inRate !== 24000) {
          const ratio = inRate / 24000;
          const outLength = Math.round(floatData.length / ratio);
          data24k = new Float32Array(outLength);
          for (let i = 0; i < outLength; i++) {
            const srcIdx = i * ratio;
            const idxFloor = Math.floor(srcIdx);
            const frac = srcIdx - idxFloor;
            const s1 = floatData[idxFloor] || 0;
            const s2 = floatData[idxFloor + 1] || s1;
            data24k[i] = s1 + frac * (s2 - s1);
          }
        }

        // 2. Hardware Noise Floor Squelch Gate (filters ambient hiss from polluting STT)
        let sumSq = 0;
        for (let i = 0; i < data24k.length; i++) {
          sumSq += data24k[i] * data24k[i];
        }
        const rms = Math.sqrt(sumSq / data24k.length);

        // 3. Convert to 16-bit Linear PCM Little-Endian
        const pcm16 = new Int16Array(data24k.length);
        for (let i = 0; i < data24k.length; i++) {
          const sample = rms < 0.003 ? 0 : Math.max(-1, Math.min(1, data24k[i]));
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        // 4. Native Chunked Base64 Encoding (100x faster than character loop, zero frame drops)
        const uint8 = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < uint8.length; i += chunk) {
          binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunk));
        }
        const base64 = btoa(binary);

        wsRef.current.send(JSON.stringify({
          type: 'audio_chunk',
          buffer: base64
        }));
      };

      setIsMicActive(true);
      setAgentState('LISTENING');
    } catch (err) {
      console.error('[Mic Error]', err);
      alert(`Mic access denied or unavailable: ${err.message}`);
    }
  };

  const stopMic = () => {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    agentSpeakingRef.current = false;
    flushPlayback();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsMicActive(false);
  };

  const resetSession = () => {
    setTranscripts([]);
    setToolCalls([]);
    setLatestThinking(null);
    setActiveScenarioMeta(null);
    setAgentState('IDLE');
    setIsScenarioRunning(false);
    isScenarioRunningRef.current = false;
    isCallStartedRef.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    nextPlayTimeRef.current = 0;
    setEscrowState({
      txId: null,
      amount: 0,
      currency: 'USD',
      accountNumber: '--',
      vendorName: 'No Active Wire Intercept',
      status: 'STANDBY',
      riskLevel: 'NOMINAL',
      reason: null
    });
    fetch(apiUrl('/api/escrow/reset'), { method: 'POST' }).catch(() => {});
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reset_session' }));
    }
  };

  return {
    connectionStatus,
    agentState,
    transcripts,
    toolCalls,
    escrowState,
    isMicActive,
    isScenarioRunning,
    latestThinking,
    activeScenarioMeta,
    connect,
    triggerScenario,
    resetSession,
    startMic,
    stopMic,
    micLevel
  };
}
