import { useState, useEffect, useRef, useCallback } from 'react';

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
  const isScenarioRunningRef = useRef(false);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const playAudioCtxRef = useRef(null);
  const nextPlayTimeRef = useRef(0);

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

  const playAudioChunk = useCallback((base64) => {
    try {
      if (!base64) return;
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

      // Master gain node to ensure full loudness
      const masterGain = audioCtx.createGain();
      masterGain.gain.value = 1.0;
      source.connect(masterGain);
      masterGain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      // Gapless jitter-free lookahead buffer
      if (nextPlayTimeRef.current < now) {
        nextPlayTimeRef.current = now + 0.03;
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
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.cancel();
      setTimeout(() => {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.05;
          utterance.pitch = role === 'agent' ? 1.05 : 0.85;
          const voices = window.speechSynthesis.getVoices();
          const enVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
          if (enVoice) utterance.voice = enVoice;
          window.speechSynthesis.speak(utterance);
        } catch (err) {
          console.warn('[SpeechSynthesis Speak]', err);
        }
      }, 30);
    } catch (e) {
      console.warn('[SpeechSynthesis]', e);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setConnectionStatus('CONNECTING');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const isDev = window.location.port === '5173';
    const targetHost = isDev ? `${window.location.hostname}:8000` : window.location.host;
    const wsUrl = `${protocol}//${targetHost}/ws/voice-session`;

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
          if (msg.interrupted) {
            // User interrupted the agent (Barge-in)! Clear buffer timing
            nextPlayTimeRef.current = 0;
          }
        }

        if (msg.type === 'audio_chunk' && msg.buffer) {
          playAudioChunk(msg.buffer);
        }

        if (msg.type === 'transcript_delta') {
          setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.isStreaming && last.role === msg.role) {
              const updatedText = msg.mode === 'append' ? last.text + (msg.text || '') : msg.text;
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  text: updatedText
                }
              ];
            } else {
              return [
                ...prev,
                {
                  id: `stream_${Date.now()}_${Math.random()}`,
                  role: msg.role,
                  speaker: msg.speaker || (msg.role === 'agent' ? 'SentinelVoice AI' : 'Caller (Live Voice)'),
                  text: msg.text || '',
                  isStreaming: true,
                  timestamp: new Date().toLocaleTimeString('en-US')
                }
              ];
            }
          });

          if (msg.role === 'agent') {
            setAgentState('SPEAKING');
          } else {
            setAgentState('ANALYZING');
          }
        }

        if (msg.type === 'transcript' || msg.type === 'transcript_final') {
          setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.isStreaming && last.role === msg.role) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  text: msg.text,
                  isStreaming: false,
                  timestamp: msg.timestamp || new Date().toLocaleTimeString('en-US')
                }
              ];
            }
            return [
              ...prev,
              {
                id: `tr_${Date.now()}_${Math.random()}`,
                role: msg.role,
                speaker: msg.speaker || (msg.role === 'agent' ? 'SentinelVoice AI' : 'Caller'),
                text: msg.text,
                isStreaming: false,
                timestamp: msg.timestamp || new Date().toLocaleTimeString('en-US')
              }
            ];
          });

          // In simulation scenarios, synthesize speech aloud through browser TTS
          if (isScenarioRunningRef.current && msg.text) {
            speakSynthesis(msg.text, msg.role);
          }

          if (msg.role === 'agent') {
            setAgentState('SPEAKING');
            setTimeout(() => setAgentState('LISTENING'), 3500);
          } else {
            setAgentState('ANALYZING');
          }
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
    };
  }, []);

  useEffect(() => {
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
    fetch('/api/escrow/latest')
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
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      if (wsRef.current) wsRef.current.close();
      stopMic();
    };
  }, [connect, unlockAudioContext]);

  const triggerScenario = (scenarioName = 'ferrari_ceo_deepfake', customTuning = null) => {
    unlockAudioContext();
    // Reset state for new scenario
    setTranscripts([]);
    setToolCalls([]);
    setLatestThinking(null);
    setIsScenarioRunning(true);
    isScenarioRunningRef.current = true;

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

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'start_call' }));
      }

      // 1. Request microphone at 24000Hz (native AssemblyAI Voice Agent sample rate)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000
        }
      });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 24000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // 4096 samples at 24kHz = ~170ms audio chunks
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
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

        const floatData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(floatData.length);
        for (let i = 0; i < floatData.length; i++) {
          const s = Math.max(-1, Math.min(1, floatData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const uint8 = new Uint8Array(pcm16.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
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
      processorRef.current.disconnect();
      processorRef.current = null;
    }
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
    fetch('/api/escrow/reset', { method: 'POST' }).catch(() => {});
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
    stopMic
  };
}
