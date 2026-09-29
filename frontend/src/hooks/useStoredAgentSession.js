import { useState, useEffect, useRef, useCallback } from 'react';
import { apiUrl, getWsUrl, getAgentEventsWsUrl } from '../config/api.js';
import { useVoiceSession } from './useVoiceSession';

/**
 * Stored-agent session hook — browser connects DIRECTLY to the AssemblyAI
 * Voice Agent WebSocket using a single-use temporary token minted by the
 * backend (/api/voice-token) and binds to the stored agent by agent_id
 * (session.update { agent_id }). The backend is no longer on the audio path;
 * it only mints tokens, executes HTTP tools (see /api/tools/*), and streams
 * forensic/UI events over /ws/agent-events.
 *
 * Scenario benchmark mode (deterministic red-team simulator) still needs the
 * legacy backend relay, so it is delegated to useVoiceSession() unchanged.
 *
 * API is a superset of useVoiceSession() — a drop-in replacement for App.jsx.
 */
export function useStoredAgentSession() {
  // ---- Shared UI state ------------------------------------------------------
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [agentState, setAgentState] = useState('IDLE');
  const [transcripts, setTranscripts] = useState([]);
  const [toolCalls, setToolCalls] = useState([]);
  const [escrowState, setEscrowState] = useState({
    txId: null,
    amount: 0,
    currency: 'USD',
    accountNumber: '--',
    vendorName: 'No Active Wire Intercept',
    status: 'STANDBY',
    riskLevel: 'NOMINAL',
    reason: null
  });
  const [isMicActive, setIsMicActive] = useState(false);
  const [latestThinking, setLatestThinking] = useState(null);
  const [micLevel, setMicLevel] = useState(0);
  const [storedAgentId, setStoredAgentId] = useState(null);
  const [directMode, setDirectMode] = useState(true); // false = legacy relay fallback

  // ---- Legacy relay hook (scenario benchmark mode only) ---------------------
  const legacy = useVoiceSession();

  const aaiWsRef = useRef(null);
  const eventsWsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const workletRef = useRef(null);
  const playCtxRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const scheduledSourcesRef = useRef(new Set());
  const currentReplyIdRef = useRef(null);
  const isCallStartedRef = useRef(false);
  const isUnmountedRef = useRef(false);
  const aaiReadyRef = useRef(false); // session.ready received on the direct channel
  const modeRef = useRef('direct'); // 'direct' | 'scenario'

  const applyEscrowTx = useCallback((tx) => {
    if (!tx) return;
    setEscrowState({
      txId: tx.tx_id,
      amount: tx.amount_usd || 0,
      currency: tx.currency || 'USD',
      accountNumber: tx.account_number || '--',
      vendorName: tx.vendor_name || 'No Active Wire Intercept',
      status: tx.status,
      riskLevel: tx.risk_level || 'NOMINAL',
      reason: tx.freeze_reason || null
    });
  }, []);

  const flushPlayback = useCallback(() => {
    nextPlayTimeRef.current = 0;
    const sources = scheduledSourcesRef.current;
    scheduledSourcesRef.current = new Set();
    sources.forEach((src) => {
      try { src.stop(); } catch (e) {}
      try { src.disconnect(); } catch (e) {}
    });
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
      const validByteLen = len - (len % 2);
      if (validByteLen <= 0) return;

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      const dataView = new DataView(bytes.buffer, bytes.byteOffset, validByteLen);
      const samplesCount = validByteLen / 2;
      const float32 = new Float32Array(samplesCount);
      for (let i = 0; i < samplesCount; i++) {
        const pcmVal = dataView.getInt16(i * 2, true);
        float32[i] = pcmVal < 0 ? pcmVal / 32768 : pcmVal / 32767;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!playCtxRef.current || playCtxRef.current.state === 'closed') {
        playCtxRef.current = new AudioCtx({ sampleRate: 24000 });
      }
      const ctx = playCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      scheduledSourcesRef.current.add(source);
      source.onended = () => scheduledSourcesRef.current.delete(source);
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now + 0.025;
      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += buffer.duration;
    } catch (err) {
      console.error('[StoredAgent Audio Playback]', err);
    }
  }, []);

  const pushTranscript = useCallback((role, text, streamKey, isFinal) => {
    setTranscripts((prev) => {
      const key = streamKey || `role_${role}`;
      const idx = prev.findIndex((t) => t.streamKey === key);
      if (idx !== -1) {
        const next = prev.slice();
        next[idx] = {
          ...next[idx],
          text,
          isStreaming: !isFinal,
          finalizedAt: isFinal ? Date.now() : next[idx].finalizedAt,
          lastDeltaAt: Date.now()
        };
        return next;
      }
      return [
        ...prev,
        {
          id: `sa_${Date.now()}_${Math.random()}`,
          streamKey: key,
          role,
          speaker: role === 'agent' ? 'SentinelVoice AI' : 'Caller (Live Voice)',
          text,
          isStreaming: !isFinal,
          lastDeltaAt: Date.now(),
          finalizedAt: isFinal ? Date.now() : undefined,
          timestamp: new Date().toLocaleTimeString('en-US')
        }
      ];
    });
  }, []);

  // ---- Backend event bus (tool cards, escrow, forensic thinking) ------------
  const connectEvents = useCallback(() => {
    if (eventsWsRef.current && eventsWsRef.current.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(getAgentEventsWsUrl());
      eventsWsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'tool_call_start') {
            setAgentState((cur) => (cur === 'EMERGENCY_LOCK' ? cur : 'ANALYZING'));
            setToolCalls((prev) => [
              {
                id: msg.callId || `rest_${Date.now()}`,
                toolName: msg.toolName,
                args: msg.args,
                status: 'CALLING',
                timestamp: msg.timestamp,
                result: null
              },
              ...prev
            ]);
          } else if (msg.type === 'tool_call_end') {
            setToolCalls((prev) =>
              prev.map((c) =>
                c.toolName === msg.toolName && c.status === 'CALLING'
                  ? { ...c, status: 'COMPLETED', result: msg.result }
                  : c
              )
            );
            if (msg.toolName === 'emergency_escrow_freeze') {
              setAgentState('EMERGENCY_LOCK');
            }
          } else if (msg.type === 'escrow_update' && msg.transaction) {
            applyEscrowTx(msg.transaction);
          } else if (msg.type === 'thinking_stream') {
            setLatestThinking((prev) => ({
              thinking: msg.thinking,
              dagNode: msg.dag_node || prev?.dagNode,
              threatAssessment: msg.threat_assessment !== undefined ? msg.threat_assessment : prev?.threatAssessment,
              engine: msg.engine || 'Sentinel Forensic Core',
              timestamp: msg.timestamp || new Date().toLocaleTimeString('en-US')
            }));
          }
        } catch (e) {}
      };
      ws.onclose = () => {
        if (!isUnmountedRef.current) setTimeout(connectEvents, 2000);
      };
    } catch (e) {}
  }, [applyEscrowTx]);

  // ---- Direct AssemblyAI voice channel --------------------------------------
  const attachMic = async (ctx) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, channelCount: 1 }
    });
    mediaStreamRef.current = stream;

    await ctx.audioWorklet.addModule('/pcm-processor.js');
    const worklet = new AudioWorkletNode(ctx, 'pcm-processor');
    workletRef.current = worklet;
    const source = ctx.createMediaStreamSource(stream);
    const mute = ctx.createGain();
    mute.gain.value = 0; // keep worklet alive without mic feedback to speakers
    source.connect(worklet);
    worklet.connect(mute);
    mute.connect(ctx.destination);

    worklet.port.onmessage = (e) => {
      if (!aaiReadyRef.current || !aaiWsRef.current || aaiWsRef.current.readyState !== WebSocket.OPEN) return;

      // Mic level meter (throttled) for the wave visualizer
      const pcm = new Int16Array(e.data);
      let sumSq = 0;
      for (let i = 0; i < pcm.length; i += 4) {
        const s = pcm[i] / 32768;
        sumSq += s * s;
      }
      const lvl = Math.min(1, Math.sqrt(sumSq / Math.max(1, pcm.length / 4)) * 6);
      if (!worklet._lastLevelPush || Date.now() - worklet._lastLevelPush > 80) {
        worklet._lastLevelPush = Date.now();
        setMicLevel((prev) => prev + (lvl - prev) * 0.35);
      }

      const uint8 = new Uint8Array(e.data);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < uint8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunk));
      }
      aaiWsRef.current.send(JSON.stringify({ type: 'input.audio', audio: btoa(binary) }));
    };
  };

  const startMic = async () => {
    try {
      if (modeRef.current === 'scenario') {
        return legacy.startMic(); // benchmark mode rides the legacy relay
      }

      // Mute/unmute mid-call: reuse the open session — a fresh session would
      // replay the stored greeting and wipe conversation context.
      if (aaiWsRef.current && aaiWsRef.current.readyState === WebSocket.OPEN && aaiReadyRef.current) {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          audioCtxRef.current = new AudioCtx({ sampleRate: 24000 });
          await audioCtxRef.current.resume();
        }
        await attachMic(audioCtxRef.current);
        setIsMicActive(true);
        setAgentState('LISTENING');
        return;
      }

      setConnectionStatus('CONNECTING');

      // Fresh call: reset backend escrow to STANDBY (parity with legacy start_call)
      fetch(apiUrl('/api/escrow/reset'), { method: 'POST' }).catch(() => {});

      // 1. Fresh single-use token (docs: fetch immediately before EVERY connection)
      const { token } = await fetch(apiUrl('/api/voice-token')).then((r) => {
        if (!r.ok) throw new Error('token mint failed (' + r.status + ')');
        return r.json();
      });

      // 2. Audio contexts (Chromium honors 24kHz; Firefox/Safari resample server-side ok)
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      let ctx;
      try {
        ctx = new AudioCtx({ sampleRate: 24000 });
      } catch (e) {
        ctx = new AudioCtx();
      }
      audioCtxRef.current = ctx;
      await ctx.resume();

      // 3. Connect to AssemblyAI with the temporary token
      const url = new URL('wss://agents.assemblyai.com/v1/ws');
      url.searchParams.set('token', token);
      const ws = new WebSocket(url);
      aaiWsRef.current = ws;
      aaiReadyRef.current = false;

      ws.onopen = () => {
        setConnectionStatus('CONNECTED');
        // agent_id is mutually exclusive with inline config fields
        ws.send(JSON.stringify({ type: 'session.update', session: { agent_id: storedAgentId } }));
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        switch (msg.type) {
          case 'session.ready':
            aaiReadyRef.current = true;
            isCallStartedRef.current = true;
            setAgentState('LISTENING');
            break;
          case 'input.speech.started':
            setAgentState('LISTENING');
            break;
          case 'input.speech.stopped':
            setAgentState('ANALYZING');
            break;
          case 'reply.started':
            setAgentState('SPEAKING');
            break;
          case 'reply.done':
            setAgentState('LISTENING');
            if (msg.status === 'interrupted') flushPlayback();
            break;
          case 'reply.audio':
            playAudioChunk(msg.data || msg.audio, msg.reply_id);
            break;
          case 'transcript.agent.delta':
            if (msg.delta || msg.text) {
              pushTranscript('agent', (msg.delta || msg.text), msg.reply_id || 'agent_active', false);
              setAgentState('SPEAKING');
            }
            break;
          case 'transcript.agent':
            if (msg.text) pushTranscript('agent', msg.text, msg.reply_id || 'agent_active', true);
            break;
          case 'transcript.user.delta':
            if (msg.text || msg.delta) {
              pushTranscript('caller', (msg.text || msg.delta), msg.item_id || 'caller_active', false);
            }
            break;
          case 'transcript.user':
            if (msg.text) pushTranscript('caller', msg.text, msg.item_id || 'caller_active', true);
            break;
          case 'tool.call':
            setToolCalls((prev) => [
              {
                id: msg.call_id || `aai_${Date.now()}`,
                toolName: msg.name || (msg.function && msg.function.name),
                args: typeof msg.arguments === 'string' ? JSON.parse(msg.arguments) : msg.arguments,
                status: 'CALLING',
                timestamp: new Date().toLocaleTimeString('en-US'),
                result: null
              },
              ...prev
            ]);
            break;
          case 'session.error':
          case 'error':
            console.error('[StoredAgent]', msg.code || '', msg.message || JSON.stringify(msg));
            break;
          case 'session.ended':
            stopMic();
            break;
        }
      };

      ws.onerror = () => setConnectionStatus('ERROR');
      ws.onclose = () => {
        setConnectionStatus('DISCONNECTED');
        aaiReadyRef.current = false;
        if (!isUnmountedRef.current) setAgentState('IDLE');
      };

      // 4. Mic capture via AudioWorklet -> PCM16 base64 -> input.audio
      await attachMic(ctx);

      setIsMicActive(true);
    } catch (err) {
      console.error('[StoredAgent Mic Error]', err);
      setConnectionStatus('ERROR');
      alert(`Mic/call failed: ${err.message}`);
    }
  };

  const teardownMic = () => {
    try { workletRef.current && workletRef.current.disconnect(); } catch (e) {}
    workletRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const closeAaiSession = () => {
    try {
      if (aaiWsRef.current && aaiWsRef.current.readyState === WebSocket.OPEN) {
        // session.end FIRST — bare close leaves a billable 30s grace window
        aaiWsRef.current.send(JSON.stringify({ type: 'session.end' }));
      }
    } catch (e) {}
    setTimeout(() => {
      try { aaiWsRef.current && aaiWsRef.current.close(); } catch (e) {}
      aaiWsRef.current = null;
      aaiReadyRef.current = false;
    }, 300);
  };

  const stopMic = useCallback(() => {
    if (modeRef.current === 'scenario') {
      return legacy.stopMic();
    }
    // Mute = teardown mic pipeline only. The AAI session stays open so unmuting
    // resumes the same conversation (fresh session would replay the greeting).
    teardownMic();
    flushPlayback();
    setIsMicActive(false);
    setAgentState('IDLE');
  }, [legacy, flushPlayback]);

  const triggerScenario = (scenarioName, customTuning) => {
    // Benchmark scenarios run on the legacy backend relay (deterministic engine)
    modeRef.current = 'scenario';
    setDirectMode(false);
    stopMic(); // tear down direct AAI channel if open
    legacy.triggerScenario(scenarioName, customTuning);
  };

  const resetSession = () => {
    setTranscripts([]);
    setToolCalls([]);
    setLatestThinking(null);
    setAgentState('IDLE');
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
    isCallStartedRef.current = false;
    aaiReadyRef.current = false;
    modeRef.current = 'direct';
    setDirectMode(true);
    closeAaiSession();
    legacy.resetSession(); // also resets escrow + relay state on the backend
  };

  // ---- Lifecycle -------------------------------------------------------------
  useEffect(() => {
    isUnmountedRef.current = false;
    connectEvents();

    // Which stored agent will the console bind to?
    fetch(apiUrl('/api/agent/status'))
      .then((r) => r.json())
      .then((s) => setStoredAgentId(s.stored_agent_id || null))
      .catch(() => {});

    fetch(apiUrl('/api/escrow/latest'))
      .then((r) => r.json())
      .then(applyEscrowTx)
      .catch(() => {});

    return () => {
      isUnmountedRef.current = true;
      if (eventsWsRef.current) eventsWsRef.current.close();
      closeAaiSession();
      teardownMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectEvents]);

  // Mirror legacy state when in scenario mode so the UI stays identical
  const activeScenario = modeRef.current === 'scenario';
  return {
    connectionStatus: activeScenario ? legacy.connectionStatus : connectionStatus,
    agentState: activeScenario ? legacy.agentState : agentState,
    transcripts: activeScenario ? legacy.transcripts : transcripts,
    toolCalls: activeScenario ? legacy.toolCalls : toolCalls,
    escrowState: activeScenario ? legacy.escrowState : escrowState,
    isMicActive: activeScenario ? legacy.isMicActive : isMicActive,
    isScenarioRunning: legacy.isScenarioRunning,
    latestThinking: activeScenario ? legacy.latestThinking : latestThinking,
    activeScenarioMeta: legacy.activeScenarioMeta,
    micLevel: activeScenario ? legacy.micLevel : micLevel,
    storedAgentId,
    directMode,
    connect: () => {},
    triggerScenario,
    resetSession,
    startMic,
    stopMic
  };
}
