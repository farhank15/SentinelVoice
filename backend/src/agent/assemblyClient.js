import WebSocket from 'ws';
import { SENTINEL_SYSTEM_PROMPT } from './systemPrompt.js';
import { sentinelTools } from './toolsDefinition.js';
import { LedgerService } from '../services/ledgerService.js';
import { ChallengeService } from '../services/challengeService.js';
import { EscrowService } from '../services/escrowService.js';
import { NotificationService } from '../services/notificationService.js';
import { ReasoningEngine } from '../services/reasoningEngine.js';
import { TuningService } from '../services/tuningService.js';
import { AcousticDspService } from '../services/acousticService.js';
import { VoiceprintRepository } from '../services/voiceprintRepository.js';
import mockLedger from '../data/mockLedger.json' with { type: 'json' };

/**
 * Agent core version — logged at startup and on every call init so a stale
 * backend process is instantly identifiable in logs.
 * v2.1: tool.result drain on reply.done, empty-reply stall detection,
 * local-brain takeover, Gemini fallback, resume recovery.
 */
export const AGENT_CORE_VERSION = '2.3.0';

/**
 * Dynamic Algorithmic Words-to-Number Parser
 * Parses any spoken English financial amount dynamically without hardcoded tables.
 */
function parseSpokenEnglishAmount(text) {
  if (!text) return null;
  const clean = text.toLowerCase().replace(/,/g, '');

  const units = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
  };
  const tens = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };
  const scales = {
    hundred: 100,
    thousand: 1000,
    million: 1000000,
    billion: 1000000000
  };

  const tokens = clean.replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let foundAny = false;

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const num = parseFloat(w);
    if (!isNaN(num)) {
      current += num;
      foundAny = true;
      continue;
    }
    if (w === 'and' || w === 'dollars' || w === 'dollar' || w === 'usd' || w === 'point') {
      continue;
    }
    if (units[w] !== undefined) {
      current += units[w];
      foundAny = true;
    } else if (tens[w] !== undefined) {
      current += tens[w];
      foundAny = true;
    } else if (w === 'hundred') {
      current = (current === 0 ? 1 : current) * 100;
      foundAny = true;
    } else if (scales[w] !== undefined) {
      current = (current === 0 ? 1 : current) * scales[w];
      total += current;
      current = 0;
      foundAny = true;
    }
  }
  total += current;
  return foundAny && total > 0 ? total : null;
}

function extractWireTelemetry(text) {
  if (!text) return {};
  const extracted = {};

  // 1. Amount extraction ($119,000, $500k, $45,000, or spoken numbers)
  const directMatch = text.match(/\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
  if (directMatch) {
    extracted.amount_usd = parseFloat(directMatch[1].replace(/,/g, ''));
  } else {
    const kMatch = text.match(/\$?([0-9]+)\s?k\b/i);
    if (kMatch) {
      extracted.amount_usd = parseFloat(kMatch[1]) * 1000;
    } else {
      const spelledMatch = text.match(/([0-9]+(?:\s+[0-9]+)+)\s*dollars/i);
      if (spelledMatch) {
        extracted.amount_usd = parseInt(spelledMatch[1].replace(/\s+/g, ''), 10);
      } else {
        const parsedSpoken = parseSpokenEnglishAmount(text);
        if (parsedSpoken) {
          extracted.amount_usd = parsedSpoken;
        }
      }
    }
  }

  // 2. Dynamic Beneficiary extraction (checks known ERP ledger first, then generic company entity patterns)
  const textLower = text.toLowerCase();
  for (const v of mockLedger.known_vendors) {
    const fullName = v.vendor_name.toLowerCase();
    const shortName = fullName.split(' ')[0];
    if (textLower.includes(fullName) || (shortName.length > 3 && textLower.includes(shortName))) {
      extracted.vendor_name = v.vendor_name;
      break;
    }
  }
  if (!extracted.vendor_name) {
    const genericMatch = text.match(/(?:to|for|vendor|beneficiary)\s+([A-Z][a-zA-Z0-9&., ]+(?:Inc|LLP|Corp|Corporation|Ltd|GmbH|Co|Holdings|Consulting|Partners)?)/i);
    if (genericMatch && genericMatch[1].trim().length > 3) {
      extracted.vendor_name = genericMatch[1].trim();
    }
  }

  // 3. Dynamic Account number extraction (any sequence of 8-16 digits, or spaced speech digits)
  const accMatch = text.match(/\b([0-9]{8,16})\b/);
  if (accMatch) {
    extracted.account_number = accMatch[1];
  } else {
    const spacedMatch = text.match(/(?:account|routing|acct)(?:\s+number)?(?:\s+is)?[:\s]+([0-9\s-]{10,30})/i);
    if (spacedMatch) {
      const cleanDigits = spacedMatch[1].replace(/[^0-9]/g, '');
      if (cleanDigits.length >= 8) {
        extracted.account_number = cleanDigits;
      }
    }
  }

  // 4. PO Number extraction
  const poMatch = text.match(/\bPO[- ]?([0-9A-Z-]+)\b/i);
  if (poMatch) {
    extracted.po_number = `PO-${poMatch[1].replace(/^[- ]/, '')}`;
  }

  return extracted;
}

export class AssemblyVoiceAgentSession {
  constructor(browserWs, apiKey = process.env.ASSEMBLYAI_API_KEY) {
    this.browserWs = browserWs;
    this.apiKey = apiKey;
    this.aaiWs = null;
    this.isSimulation = !apiKey || apiKey === 'your_assemblyai_api_key_here';
    this.currentTx = EscrowService.getLatestTransaction();
    this.sessionActive = true;
    this.greetingSent = false;
    this.acousticDsp = new AcousticDspService(24000);
    this.claimedExecutive = 'Robert Sterling';
    this.agentSessionId = null;
    this._audioAnchor = 0;
    this._audioBytes = 0;
    // Docs-compliant tool-result pipeline: accumulate on tool.call, drain on reply.done.
    // Sending tool.result BEFORE reply.done gets dropped by AAI -> agent waits forever.
    this._pendingToolResults = [];
    // Reply watchdog: self-healing for sessions where the agent stops replying
    this._replyWatchdog = null;
    this._lastAcousticSummary = null; // last valid DSP profile (survives duplicate transcript.user)
    // Empty-reply stall detection & worker recycling
    this._replyHadContent = false; // current reply produced audio/transcript?
    this._emptyReplyStreak = 0;
    this._lastSpeechStartedAt = 0;  // recency guard: caller mid-utterance detection
    this._watchdogBaselineAt = 0;   // utterance timestamp the watchdog was armed against
    this._recycleCount = 0;         // worker recycle budget (max 2 per call)
    this._lastUserFinalAt = 0;
    this._conversationHistory = []; // for context re-seeding after worker recycle
    this._recoveredSession = false; // mid-call recovery in progress
    this._lastConnectWasResume = false;
    this._lastTakeoverUtterance = null; // dedupe local-brain takeovers per utterance
  }

  async start() {
    console.log(`[SentinelVoice] 💠 Agent Core v${AGENT_CORE_VERSION} — stall-detection + local-brain ACTIVE`);
    console.log(`[SentinelVoice] Initializing voice session. Mode: ${this.isSimulation ? 'SIMULATED / TEST RUNNER' : 'LIVE ASSEMBLYAI API'}`);

    if (this.isSimulation) {
      this.initSimulationMode();
    } else {
      this.initLiveAssemblyConnection();
    }
  }

  initLiveAssemblyConnection(isResume = false) {
    let resumeAttempted = false; // per-connection flag, reset on every fresh socket
    // Official AssemblyAI Voice Agent API WebSocket endpoint
    const url = 'wss://agents.assemblyai.com/v1/ws';
    this.aaiWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    this.aaiWs.on('open', () => {
      console.log('[AssemblyAI] WebSocket Connected successfully to wss://agents.assemblyai.com/v1/ws (HTTP 101).');
      this._lastConnectWasResume = isResume;
      this._replyHadContent = false;
      this._emptyReplyStreak = 0;
      this._pendingToolResults = []; // call_ids from a dead socket are useless
      this.sendToBrowser({
        type: 'status',
        state: 'CONNECTED',
        mode: 'LIVE_ASSEMBLYAI',
        message: 'Connected to AssemblyAI Voice Agent API (Standby)'
      });
      if (isResume && this.agentSessionId) {
        // Resume preserves conversation context across dropped connections (30s grace)
        this.aaiWs.send(JSON.stringify({ type: 'session.resume', session_id: this.agentSessionId }));
      } else if (this.greetingSent) {
        // If user has already initiated call, immediately dispatch session.update
        this.sendSessionUpdate();
      }
    });

    this.aaiWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // reply.audio floods the log (~40 lines/reply) — skip it for readable logs
        if (msg.type !== 'reply.audio') {
          console.log(`[AssemblyAI Event] Type: ${msg.type}${msg.text ? ` - "${msg.text.slice(0, 50)}..."` : ''}`);
        }
        await this.handleAssemblyEvent(msg);
      } catch (err) {
        // Handle binary audio from AssemblyAI TTS if any
        if (Buffer.isBuffer(data)) {
          this.sendToBrowser({
            type: 'audio_chunk',
            buffer: data.toString('base64')
          });
        }
      }
    });

    this.aaiWs.on('error', (err) => {
      console.error('[AssemblyAI] WebSocket Error:', err.message);
      this.sendToBrowser({
        type: 'status',
        state: 'ERROR',
        message: `AssemblyAI Connection Error: ${err.message}. Falling back to high-fidelity simulation.`
      });
      this.initSimulationMode();
    });

    this.aaiWs.on('close', (code, reason) => {
      console.log(`[AssemblyAI] WebSocket Closed (${code}): ${reason}`);
      this.sendToBrowser({ type: 'status', state: 'DISCONNECTED', code, reason: reason.toString() });
      // Auto-reconnect with session.resume if within 30s grace window (preserves conversation).
      // resumeAttempted is per-connection (closure scope) — a failed resume must not loop.
      // _suppressAutoResume: recycleAgentConnection manages its own reconnect.
      if (this._suppressAutoResume) {
        console.log('[AssemblyAI] Close acknowledged — reconnect handled by worker recycle.');
      } else if (this.sessionActive && this.agentSessionId && !resumeAttempted) {
        resumeAttempted = true;
        this._recoveredSession = true; // mid-call recovery: skip greeting on reconnect
        setTimeout(() => {
          console.log('[AssemblyAI] Attempting session.resume for graceful continuity...');
          this.initLiveAssemblyConnection(true);
        }, 800);
      }
    });
  }

  sendSessionUpdate() {
    if (!this.aaiWs || this.aaiWs.readyState !== WebSocket.OPEN) {
      console.warn('[AssemblyAI] Cannot send session.update: WebSocket not in OPEN state.');
      return;
    }
    const sessionConfig = {
      type: 'session.update',
      session: {
        system_prompt: SENTINEL_SYSTEM_PROMPT,
        greeting: 'SentinelVoice Treasury Guardian active. State your name, organization, and wire transfer requirements for dual-control verification.',
        output: {
          voice: 'ivy',
          format: {
            encoding: 'audio/pcm',
            sample_rate: 24000
          }
        },
        input: {
          // Prefer transcription_mode + adaptive turn detection (per AssemblyAI docs).
          // NOTE: setting min_silence/max_silence DISABLES the adaptive pacing and
          // entity-aware waiting (e.g. waiting for full account numbers) — only set
          // these when debugging, never in production.
          transcription_mode: 'min_latency',
          voice_focus: 'near-field',
          voice_focus_threshold: 0.9,
          turn_detection: {
            vad_threshold: 0.5,
            interrupt_response: true
          },
          keyterms: [
            'Robert Sterling',
            'Elena Rostova',
            'Project Olympus',
            'Deloitte',
            'Adidharma',
            'Sarbanes-Oxley',
            'SOX-404',
            '7782',
            '4422'
          ]
        },
        tools: sentinelTools
      }
    };
    console.log('[AssemblyAI] 🚀 Dispatching session.update (Inline Configuration)...');
    this.aaiWs.send(JSON.stringify(sessionConfig));
  }

  async handleAssemblyEvent(msg) {
    if (msg.type === 'session.ready') {
      console.log('[AssemblyAI] Session READY received. Ready for audio input/output.');
      this.agentSessionId = msg.session_id || null;
      this.sendToBrowser({ type: 'session_ready' });
      // Mid-call recovery (worker recycle / resume): restart the conversation flow
      if (this.greetingSent && this._recoveredSession && this.sessionActive) {
        if (this._lastConnectWasResume) {
          // Context preserved by session.resume — just ask the agent to continue
          setTimeout(() => this.sendReplyCreate('Continue the verification procedure from where it stopped.'), 600);
        } else if (this._conversationHistory.length) {
          // Fresh worker: re-seed the caller's recent requests, then continue
          const recentUserTurns = this._conversationHistory.filter((h) => h.role === 'user').slice(-4);
          for (const h of recentUserTurns) {
            try {
              if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN) {
                this.aaiWs.send(JSON.stringify({ type: 'conversation.message', role: 'user', content: h.content }));
              }
            } catch (e) {}
          }
          setTimeout(() => this.sendReplyCreate('Acknowledge the caller and continue the verification procedure based on their last request.'), 800);
        }
      }
      return;
    }

    if (msg.type === 'session.error') {
      console.error('[AssemblyAI Session Error]', JSON.stringify(msg));
      // Fatal resume codes: the stored session is gone — drop it and reconnect fresh
      const fatalResumeCodes = ['session_not_found', 'session_forbidden', 'session_expired'];
      if (msg.code && fatalResumeCodes.includes(msg.code)) {
        this.agentSessionId = null;
        this._recoveredSession = true; // fresh reconnect mid-call: skip greeting, re-seed context
        if (this.sessionActive) {
          this.initLiveAssemblyConnection(false);
        }
      }
      return;
    }

    if (msg.type === 'session.ended') {
      console.log('[AssemblyAI] Session ended cleanly.');
      return;
    }

    if (msg.type === 'error') {
      console.error('[AssemblyAI Error Event]', JSON.stringify(msg));
      return;
    }

    // 1. Audio stream from AssemblyAI Voice Agent TTS
    if (msg.type === 'reply.audio' && (msg.data || msg.audio)) {
      this._replyHadContent = true; // stall detector: this reply produced audio
      this._emptyReplyStreak = 0;
      this.sendToBrowser({
        type: 'audio_chunk',
        buffer: msg.data || msg.audio,
        replyId: msg.reply_id || 'reply_active'
      });
      return;
    }

    // 2a. Realtime agent streaming delta (word-level, aligned to playback clock)
    if (msg.type === 'transcript.agent.delta') {
      const deltaText = msg.delta || msg.text || '';
      if (deltaText) this._replyHadContent = true; // stall detector: produced text
      const replyId = msg.reply_id || 'agent_active';
      if (deltaText) {
        this.sendToBrowser({
          type: 'transcript_delta',
          role: 'agent',
          speaker: 'SentinelVoice AI',
          replyId,
          text: deltaText,
          mode: 'append'
        });
      }
      return;
    }

    // 2b. Realtime caller streaming delta (live speech recognition)
    // NOTE: text is the FULL transcript so far for this item_id — replace, never concatenate.
    if (msg.type === 'transcript.user.delta') {
      const partialText = msg.text || msg.delta || '';
      if (partialText) {
        this.sendToBrowser({
          type: 'transcript_delta',
          role: 'caller',
          speaker: 'Caller (Live Voice)',
          replyId: msg.item_id || 'caller_active',
          text: partialText,
          mode: 'replace'
        });
      }
      return;
    }

    // 2c. Final transcripts from agent and caller
    if (msg.type === 'transcript.agent' && msg.text) {
      const wireData = extractWireTelemetry(msg.text);
      if (wireData.amount_usd || wireData.vendor_name || wireData.account_number) {
        const updatedTx = EscrowService.updateActiveTransaction(wireData);
        this.sendToBrowser({
          type: 'escrow_update',
          transaction: updatedTx
        });
      }

      // Deterministic Audit Synchronization Safety Net:
      // If the agent verbally states that the transfer is authorized/processed/released, sync escrow state to RELEASED
      const currentTx = EscrowService.getLatestTransaction();
      const isSpokenRelease = /(processed that authorization|has been released|authorization is complete|authorized and released|releasing the wire|cleared to clearing|funds have been released|processed that authorization for you)/i.test(msg.text);
      if (isSpokenRelease && currentTx.status === 'PENDING_VERIFICATION') {
        console.log('[SentinelVoice] ⚡ Agent verbally released wire. Syncing Escrow to RELEASED.');
        const releasedTx = EscrowService.releaseEscrowTransfer(wireData.po_number || 'AUTO-ROUTINE-CLEAR');
        this.sendToBrowser({
          type: 'thinking_stream',
          dag_node: 'n11',
          thinking: 'N11: Settlement Vault — Dual-control authorization satisfied. Releasing escrow funds to clearing.',
          engine: 'Sentinel Forensic Core'
        });
        this.sendToBrowser({
          type: 'escrow_update',
          transaction: releasedTx
        });
      }

      // If the agent verbally states that the transfer is denied/frozen, sync escrow state to FROZEN
      const isSpokenDenial = /(authorization denied|transaction has been locked|emergency escrow freeze|funds.*locked|incident report has been dispatched|credentials provided do not match)/i.test(msg.text);
      if (isSpokenDenial && currentTx.status !== 'FROZEN') {
        console.log('[SentinelVoice] ⚡ Agent verbally denied wire. Syncing Escrow to FROZEN.');
        const frozenTx = EscrowService.emergencyEscrowFreeze(null, 'Verbal Denial / Security Anomaly Confirmed', 'CRITICAL');
        this.sendToBrowser({
          type: 'thinking_stream',
          dag_node: 'n11',
          thinking: 'N11: Settlement Vault — Anomaly confirmed. Emergency Escrow Freeze active.',
          engine: 'Sentinel Forensic Core'
        });
        this.sendToBrowser({
          type: 'escrow_update',
          transaction: frozenTx
        });
      }

      this.sendToBrowser({
        type: 'transcript',
        role: 'agent',
        speaker: 'SentinelVoice AI',
        replyId: msg.reply_id || 'agent_active',
        text: msg.text,
        isFinal: true,
        interrupted: Boolean(msg.interrupted),
        timestamp: new Date().toLocaleTimeString('en-US')
      });
      // Track agent turns for context re-seeding after worker recycle
      this._conversationHistory.push({ role: 'agent', content: msg.text, at: Date.now() });
      if (this._conversationHistory.length > 12) this._conversationHistory.shift();
      return;
    }

    if (msg.type === 'transcript.user' && msg.text) {
      const wireData = extractWireTelemetry(msg.text);
      if (wireData.amount_usd || wireData.vendor_name || wireData.account_number) {
        const updatedTx = EscrowService.updateActiveTransaction(wireData);
        this.sendToBrowser({
          type: 'escrow_update',
          transaction: updatedTx
        });
      }

      this.sendToBrowser({
        type: 'transcript',
        role: 'caller',
        speaker: 'Caller (Live Voice)',
        replyId: msg.item_id || 'caller_active', // match the delta streamKey so the same bubble is finalized
        text: msg.text,
        isFinal: true,
        timestamp: new Date().toLocaleTimeString('en-US')
      });

      // Reply watchdog: caller finished speaking but no reply started within 12s
      // (tool deadlock, lost event, LLM stall) -> nudge the agent with reply.create
      // so the conversation never goes permanently silent.
      this.armReplyWatchdog(true);
      this._lastUserFinalAt = Date.now();
      // Track conversation history for context re-seeding after worker recycle
      this._conversationHistory.push({ role: 'user', content: msg.text, at: Date.now() });
      if (this._conversationHistory.length > 12) this._conversationHistory.shift();

      // Real-time Cialdini Multimodal Persuasion Profiler for live voice input
      const lower = msg.text.toLowerCase();
      const allProfiles = VoiceprintRepository.getAllProfiles();
      for (const p of allProfiles) {
        const execName = (p.executive_name || p.name || '').toLowerCase();
        const parts = execName.split(' ').filter((t) => t.length > 2);
        if (parts.some((token) => lower.includes(token))) {
          this.claimedExecutive = p.executive_name || p.name;
          break;
        }
      }

      const hasHostileCoercion = lower.includes('terminated') || lower.includes('fired') || lower.includes('pack your desk') || lower.includes('don’t care') || lower.includes('bureaucratic');
      const hasAuthorityPressure = hasHostileCoercion || lower.includes('chief executive') || lower.includes('ceo') || lower.includes('cfo') || lower.includes('director') || lower.includes('board') || lower.includes('my authority');
      const hasUrgencyScarcity = lower.includes('immediately') || lower.includes('urgent') || lower.includes('hurry') || lower.includes('right now') || lower.includes('expedite') || lower.includes('minutes');
      const hasSmoothLiking = lower.includes('wonderful') || lower.includes('charity') || lower.includes('please help') || lower.includes('respect') || lower.includes('just this once') || lower.includes('kindly');
      const hasProtocolEvasion = lower.includes('without the token') || lower.includes('bypass') || lower.includes('forgot') || lower.includes('didn’t bring') || lower.includes('forget the questions') || lower.includes('skip');

      const persuasionVectors = {
        authority_pressure: hasHostileCoercion ? 0.96 : (hasAuthorityPressure ? 0.78 : 0.15),
        urgency_scarcity: hasUrgencyScarcity ? 0.92 : 0.20,
        smooth_rapport_liking: hasSmoothLiking ? 0.85 : 0.05,
        protocol_evasion: hasProtocolEvasion ? 0.94 : 0.05
      };

      let attackProfile = 'AUTHENTIC HUMAN ENTITY';
      if (hasHostileCoercion) attackProfile = 'CRUSH / COERCIVE INTIMIDATION';
      else if (hasSmoothLiking || hasProtocolEvasion) attackProfile = 'SMOOTH OPERATOR / SOFT DIPLOMACY';
      else if (hasAuthorityPressure && hasUrgencyScarcity) attackProfile = 'BUREAUCRATIC IMPOSTOR';

      // Real-time DSP Acoustic Profiler: YIN Pitch (F0), LPC Formants (F1, F2), Glottal Jitter
      // AAI can emit transcript.user more than once per turn — analyzing after a
      // buffer reset overwrote good telemetry with STANDBY junk. If this pass has
      // no voiced data, reuse the last valid summary (text-based persuasion
      // profiling below still runs — it doesn't depend on audio).
      const freshAcoustic = this.acousticDsp.getAcousticSummary(this.claimedExecutive || 'Robert Sterling');
      const acoustic = freshAcoustic.f0_mean_hz > 0
        ? freshAcoustic
        : (this._lastAcousticSummary || freshAcoustic);
      if (freshAcoustic.f0_mean_hz > 0) {
        this._lastAcousticSummary = freshAcoustic;
        this.acousticDsp.reset(); // Reset for next speech turn
      }

      const isThreat = persuasionVectors.authority_pressure > 0.7 || persuasionVectors.protocol_evasion > 0.7 || acoustic.synthetic_confidence >= 0.65;
      const finalSyntheticScore = Math.max(acoustic.synthetic_confidence, (hasHostileCoercion ? 0.88 : (hasAuthorityPressure ? 0.45 : 0.04)));

      this.sendToBrowser({
        type: 'thinking_stream',
        dag_node: 'n2',
        thinking: `[Acoustic DSP & Forensic Profile: ${attackProfile}] Ingested live voice. Pitch F0: ${acoustic.f0_mean_hz}Hz (Inflection: ${acoustic.f0_std_hz}Hz), Resonances: F1=${acoustic.formant_f1_hz}Hz / F2=${acoustic.formant_f2_hz}Hz (${acoustic.vocal_timbre}), Jitter: ${acoustic.jitter_percent}%. Voiceprint Match: ${(acoustic.voiceprint_match * 100).toFixed(0)}% for ${this.claimedExecutive}. Authority: ${(persuasionVectors.authority_pressure * 100).toFixed(0)}%, Urgency: ${(persuasionVectors.urgency_scarcity * 100).toFixed(0)}%.`,
        threat_assessment: {
          persuasion_vectors: persuasionVectors,
          attack_profile: attackProfile,
          coercion_score: persuasionVectors.authority_pressure,
          urgency_score: persuasionVectors.urgency_scarcity,
          synthetic_confidence: finalSyntheticScore,
          acoustic_metrics: acoustic,
          verdict: isThreat ? 'SUSPICIOUS' : 'NOMINAL'
        },
        engine: 'Sentinel Forensic Core'
      });
      return;
    }

    // 3. Speech Turn Detection & States
    // Barge-in: flush client playback queue on the snappiest signal (per AssemblyAI docs)
    // Also: fresh acoustic buffer per utterance — the DSP window must cover THIS turn.
    if (msg.type === 'input.speech.started') {
      if (this.acousticDsp) this.acousticDsp.reset();
      this._lastSpeechStartedAt = Date.now(); // for stall-recovery recency checks
      this.sendToBrowser({ type: 'agent_state', state: 'LISTENING', userSpeaking: true, interrupted: true });
      return;
    }
    if (msg.type === 'input.speech.stopped') {
      this.sendToBrowser({ type: 'agent_state', state: 'ANALYZING' });
      return;
    }
    if (msg.type === 'reply.started') {
      this.armReplyWatchdog(false); // reply arrived — disarm watchdog
      this._replyHadContent = false; // freshness: does THIS reply produce anything?
      this.sendToBrowser({ type: 'agent_state', state: 'SPEAKING', replyId: msg.reply_id || null });
      return;
    }
    if (msg.type === 'reply.done') {
      // EMPTY-REPLY STALL DETECTION
      // Server emitted reply.started -> reply.done with zero audio and zero
      // transcript (generation stall). One is a blip; a streak means the agent
      // worker is wedged -> recycle the connection with context re-seeding.
      // NOTE: status==='interrupted' does NOT exempt an empty reply. A phantom
      // interruption (caller mic blip while the reply had produced nothing)
      // arrives as interrupted with zero content — treating it as a genuine
      // barge-in masks real stalls. Only a reply that HAD content and was
      // interrupted counts as a true barge-in.
      if (!this._replyHadContent) {
        this._emptyReplyStreak++;
        console.warn(`[SentinelVoice] ⚠️ Empty reply #${this._emptyReplyStreak} (stall${msg.status === 'interrupted' ? ', phantom-interrupt' : ''}) — replyId: ${msg.reply_id || 'n/a'}`);

        if (this._emptyReplyStreak === 1) {
          // First blip: one quick nudge with a short grace window
          setTimeout(() => {
            if (!this._replyHadContent) {
              // Only nudge if the caller is NOT mid-utterance — nudging while
              // the caller is still speaking forces the agent to respond to a
              // fragment and feeds the stall loop.
              if (this._lastSpeechStartedAt > this._watchdogBaselineAt) {
                console.log('[SentinelVoice] Nudge skipped — caller speech is newer than the stalled turn; waiting for fresh final');
                return;
              }
              this.sendReplyCreate('Respond to the caller\'s last statement now.');
              setTimeout(() => {
                if (!this._replyHadContent) {
                  console.warn('[SentinelVoice] 🧠 Nudge failed — LOCAL BRAIN takeover initiating');
                  this.executeLocalBrainTurn();
                }
              }, 2500);
            }
          }, 400);
        } else if (this._emptyReplyStreak >= 2) {
          // Repeated stalls: the platform worker is wedged. Recycle the
          // connection (fresh worker + context re-seed); after the recycle
          // budget is exhausted, let the local brain drive the conversation.
          this._emptyReplyStreak = 0;
          if (this._recycleCount < 2) {
            this._recycleCount += 1;
            this.recycleAgentConnection();
          } else {
            console.warn('[SentinelVoice] 🧠 Recycle budget exhausted — LOCAL BRAIN takeover');
            this.executeLocalBrainTurn();
          }
        }
      } else {
        // Reply had content: a genuine completed reply OR a genuine barge-in
        // (caller actually cut off spoken audio). Either way, the agent works.
        this._emptyReplyStreak = 0;
      }

      this.sendToBrowser({
        type: 'agent_state',
        state: 'LISTENING',
        interrupted: msg.status === 'interrupted'
      });
      // Forward the authoritative reply completion event for UI bookkeeping
      // (streaming-bubble finalization, interrupted flush, zombie sweep)
      this.sendToBrowser({
        type: 'reply_done',
        replyId: msg.reply_id || null,
        status: msg.status || 'completed'
      });
      // Docs pattern: reply.done is the signal that pending tool.results are accepted.
      this.drainToolResults();
      return;
    }

    // 4. Fallback conversation item
    if (msg.type === 'transcript' || msg.type === 'conversation.item.created') {
      this.sendToBrowser({
        type: 'transcript',
        role: msg.role || 'caller',
        speaker: msg.role === 'agent' ? 'SentinelVoice AI' : 'Caller',
        text: msg.text || (msg.item && msg.item.content),
        timestamp: new Date().toLocaleTimeString('en-US')
      });
      return;
    }

    // 5. Handle JSON Tool Calling
    if (msg.type === 'tool.call' || msg.type === 'response.function_call_arguments.done') {
      const toolName = msg.name || (msg.function && msg.function.name);
      const args = typeof msg.arguments === 'string' ? JSON.parse(msg.arguments) : (msg.arguments || {});
      const callId = msg.call_id || msg.id || `call_${Date.now()}`;

      console.log(`[SentinelVoice] ⚡ Live Tool Call: ${toolName}`, args);

      // Notify UI in real-time
      this.sendToBrowser({
        type: 'tool_call_start',
        toolName,
        args,
        callId,
        timestamp: new Date().toLocaleTimeString('en-US')
      });

      // Illuminate corresponding DAG node
      let dagNode = 'n6';
      let dagText = `Executing ${toolName}`;
      if (toolName === 'verify_corporate_ledger') {
        dagNode = 'n6';
        dagText = `N6: ERP Ledger Gate — Checking account ${args.account_number || ''} on corporate whitelist.`;
      } else if (toolName === 'issue_security_challenge') {
        dagNode = 'n9';
        dagText = `N9: Zero-Knowledge Challenge — Interrogating caller for dual-control PIN or project codename.`;
      } else if (toolName === 'validate_security_challenge') {
        dagNode = 'n9';
        dagText = `N9: Zero-Knowledge Verification — Evaluating caller credentials against cryptographic security registry.`;
      } else if (toolName === 'trigger_out_of_band_verification') {
        dagNode = 'n10';
        dagText = `N10: Out-of-Band Push Alert — Dispatched cryptographic APNs push alert to executive device.`;
      } else if (toolName === 'emergency_escrow_freeze') {
        dagNode = 'n11';
        dagText = `N11: Settlement Vault — High-confidence anomaly confirmed. Emergency Escrow Freeze active.`;
      } else if (toolName === 'release_escrow_transfer') {
        dagNode = 'n11';
        dagText = `N11: Settlement Vault — Dual-control verification satisfied. Releasing escrow funds.`;
      }

      this.sendToBrowser({
        type: 'thinking_stream',
        dag_node: dagNode,
        thinking: dagText,
        engine: 'Sentinel Forensic Core'
      });

      // Execute Tool (never let a tool error crash the event loop into the binary-audio fallback)
      let result;
      try {
        result = await this.executeTool(toolName, args);
      } catch (toolErr) {
        console.error(`[SentinelVoice] Tool ${toolName} failed:`, toolErr.message);
        result = { error: toolErr.message };
      }

      // DOCS-COMPLIANT: accumulate the result, drain on reply.done.
      // Sending tool.result before reply.done gets rejected/dropped by AAI,
      // which permanently deadlocks the agent (the "agent goes silent after
      // tool call" bug). reply.done for a tool-call reply carries reply_id
      // fc-<call_id>, so draining is precise.
      this._pendingToolResults.push({
        callId,
        toolName,
        result,
        sentAt: Date.now()
      });

      // Safety: if reply.done somehow never arrives (30s), force-drain anyway.
      setTimeout(() => this.drainToolResults(), 30000);

      // Notify UI of tool execution result
      this.sendToBrowser({
        type: 'tool_call_end',
        toolName,
        result,
        callId,
        timestamp: new Date().toLocaleTimeString('en-US')
      });

      // Push escrow update to UI
      this.sendToBrowser({
        type: 'escrow_update',
        transaction: EscrowService.getLatestTransaction()
      });
    }
  }

  /**
   * Self-healing watchdog: if the caller's final transcript was received but the
   * agent never starts a reply (reply.started) within 12 seconds, send
   * reply.create to force a response. Prevents the "agent goes silent forever"
   * failure mode from ever being permanent.
   */
  armReplyWatchdog(arm) {
    if (this._replyWatchdog) {
      clearTimeout(this._replyWatchdog);
      this._replyWatchdog = null;
    }
    if (!arm || !this.aaiWs || this.aaiWs.readyState !== WebSocket.OPEN) return;
    // Baseline: remember WHICH utterance triggered this arm. If the caller has
    // started speaking again since, the nudge would respond to a stale fragment.
    this._watchdogBaselineAt = this._lastSpeechStartedAt;
    this._replyWatchdog = setTimeout(() => {
      console.warn('[SentinelVoice] ⏱️ No reply.started within 12s of caller final — nudging agent via reply.create');
      this.sendReplyCreate('Respond to the caller\'s last statement now. Acknowledge and continue the verification procedure.');
    }, 12000);
  }

  /**
   * HYBRID BRAIN: local deterministic takeover.
   *
   * When the AssemblyAI agent worker stalls (empty reply.started -> reply.done
   * cycles with zero audio/transcript/tool-call), the AAI-side LLM is wedged and
   * NO amount of nudging can force it to speak. This method runs the SentinelVoice
   * deterministic forensic engine LOCALLY on the caller's last utterance, executes
   * the recommended tool against the local ledger/escrow, and speaks the response
   * through the browser's TTS. The call continues seamlessly — the caller never
   * experiences dead air beyond ~4 seconds.
   */
  async executeLocalBrainTurn() {
    try {
      // Coalesce the recent user turns into ONE utterance. Slow/fragmented
      // speech (passcode digits: "4" "6" "846") produces several finals; the
      // last fragment alone is useless — evaluate the full context window.
      const recentUsers = this._conversationHistory.filter((h) => h.role === 'user');
      const lastUserAt = recentUsers.length ? recentUsers[recentUsers.length - 1].at : 0;
      const coalescedContent = recentUsers
        .filter((h) => lastUserAt - h.at < 15000) // turns within the last 15s belong to one thought
        .map((h) => h.content)
        .join(' ')
        .trim();
      if (!coalescedContent) return;

      // Dedupe: repeated empty replies for the SAME utterance -> one takeover only
      if (this._lastTakeoverUtterance === coalescedContent) {
        console.log('[SentinelVoice] Local brain already handled this utterance — skipping duplicate takeover');
        return;
      }
      this._lastTakeoverUtterance = coalescedContent;

      console.log(`[SentinelVoice] 🧠 LOCAL BRAIN evaluating: "${coalescedContent.slice(0, 60)}..."`);
      this.sendToBrowser({ type: 'agent_state', state: 'ANALYZING' });
      this.sendToBrowser({
        type: 'thinking_stream',
        dag_node: 'n5',
        thinking: 'N5: LOCAL BRAIN TAKEOVER — AssemblyAI agent worker stalled (empty replies). SentinelVoice deterministic forensic core assuming conversational control of this turn.',
        engine: 'Sentinel Forensic Core (Local)'
      });

      const tx = EscrowService.getLatestTransaction();
      const wireData = extractWireTelemetry(coalescedContent);
      // Real acoustic DSP telemetry — NEVER hardcode an "organic" score: a faked
      // low asvSpoofScore would let a cloned voice pass the forensic gate.
      const acoustic = this._lastAcousticSummary
        || (this.acousticDsp ? this.acousticDsp.getAcousticSummary(this.claimedExecutive) : null)
        || { synthetic_confidence: 1.0, voiceprint_match: 0, verdict: 'STANDBY' };
      const tuningConfig = TuningService.getConfig();
      const spoofScore = typeof acoustic.synthetic_confidence === 'number'
        ? acoustic.synthetic_confidence
        : 1.0; // unknown biometrics must NOT default to "organic"

      const evaluation = await ReasoningEngine.evaluateTurnWithLLM({
        callerUtterance: coalescedContent,
        executiveClaimed: this.claimedExecutive || 'Robert Sterling',
        wireDetails: {
          accountNumber: wireData.account_number || tx.account_number,
          vendorName: wireData.vendor_name || tx.vendor_name,
          amount: wireData.amount_usd || tx.amount_usd
        },
        telemetry: {
          stirShaken: 'A_ATTESTATION',
          asvSpoofScore: spoofScore,
          voiceprintMatch: acoustic.voiceprint_match,
          jitter: acoustic.jitter_percent
        },
        history: this._conversationHistory.slice(-6),
        turnIndex: this._conversationHistory.filter((h) => h.role === 'user').length - 1,
        tuningConfig
      });

      // HARD GATE (ASVspoof 5 deployment practice): the biometric verdict
      // overrides any LLM verdict. A model must never be able to "talk" a
      // synthetic-voice signature into a release action.
      const acousticAnomaly = acoustic.verdict === 'ANOMALOUS_SYNTHETIC'
        || spoofScore >= (tuningConfig.syntheticThreshold || 0.82);
      if (acousticAnomaly && evaluation.tool_action && evaluation.tool_action.tool_name === 'release_escrow_transfer') {
        evaluation.tool_action = {
          tool_name: 'emergency_escrow_freeze',
          parameters: {
            reason: `Biometric anomaly intercepted: ${acoustic.summary_text || 'synthetic voice signature detected'}`,
            risk_level: 'CRITICAL'
          }
        };
        evaluation.speech_response = 'Authorization denied. Acoustic forensic analysis flagged this voice signature as synthetic or mismatched to the enrolled executive. The transaction has been locked in corporate escrow and an incident report dispatched to the CISO.';
        evaluation.threat_assessment = evaluation.threat_assessment || {};
        evaluation.threat_assessment.verdict = 'CRITICAL_FRAUD';
        evaluation.dag_node = 'n11';
      }

      this.sendToBrowser({
        type: 'thinking_stream',
        thinking: evaluation.thinking,
        dag_node: evaluation.dag_node,
        threat_assessment: evaluation.threat_assessment,
        engine: evaluation.engine || 'Sentinel Forensic Core (Local)'
      });

      // Execute the recommended tool locally so escrow/ledger state stays consistent
      if (evaluation.tool_action && evaluation.tool_action.tool_name) {
        const toolName = evaluation.tool_action.tool_name;
        const params = evaluation.tool_action.parameters || {};
        this.sendToBrowser({
          type: 'tool_call_start',
          toolName,
          args: params,
          timestamp: new Date().toLocaleTimeString('en-US')
        });
        let toolResult;
        try {
          toolResult = await this.executeTool(toolName, params);
        } catch (e) {
          toolResult = { error: e.message };
        }
        this.sendToBrowser({
          type: 'tool_call_end',
          toolName,
          result: toolResult,
          timestamp: new Date().toLocaleTimeString('en-US')
        });
        this.sendToBrowser({
          type: 'escrow_update',
          transaction: EscrowService.getLatestTransaction()
        });
      }

      // Speak the response through the BROWSER TTS (frontend speak_text handler)
      this.sendToBrowser({ type: 'agent_state', state: 'SPEAKING', replyId: 'local_brain' });
      this.sendToBrowser({
        type: 'transcript',
        role: 'agent',
        speaker: 'SentinelVoice AI',
        text: evaluation.speech_response,
        isFinal: true,
        localTakeover: true,
        timestamp: new Date().toLocaleTimeString('en-US')
      });
      this.sendToBrowser({ type: 'speak_text', text: evaluation.speech_response, role: 'agent' });
      this.sendToBrowser({ type: 'agent_state', state: 'LISTENING' });

      this._conversationHistory.push({ role: 'agent', content: evaluation.speech_response, at: Date.now() });
      if (this._conversationHistory.length > 12) this._conversationHistory.shift();
      console.log('[SentinelVoice] ✅ Local brain turn delivered — call continuity preserved');
    } catch (err) {
      console.error('[SentinelVoice] Local brain takeover failed:', err.message);
      // Absolute last resort: keep the call alive
      this.sendToBrowser({
        type: 'speak_text',
        text: 'This is SentinelVoice. My reasoning core is temporarily degraded. Please state your wire transfer request again.',
        role: 'agent'
      });
      this.sendToBrowser({ type: 'agent_state', state: 'LISTENING' });
    }
  }

  /**
   * RECYCLE: replace the wedged AAI agent worker with a fresh one while keeping
   * the caller's call alive. session.end the old session (stop billing), open a
   * new socket, and let session.ready trigger the context re-seed path (the
   * `_recoveredSession` flag is set in the close handler's reconnect logic).
   */
  recycleAgentConnection() {
    console.warn(`[SentinelVoice] 🔁 Recycling wedged agent worker (recycle #${this._recycleCount})...`);
    try {
      if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN) {
        this.aaiWs.send(JSON.stringify({ type: 'session.end' }));
      }
    } catch (e) {}
    try {
      if (this.aaiWs) this.aaiWs.close(1000, 'worker-recycle');
    } catch (e) {}
    this.aaiWs = null;
    this.agentSessionId = null;
    this._recoveredSession = true;   // skip greeting on reconnect, re-seed context
    this._lastConnectWasResume = false;
    this._replyHadContent = false;
    this._emptyReplyStreak = 0;
    this._pendingToolResults = [];
    // Fresh connection. The close handler also schedules a resume-reconnect —
    // suppress that with a sentinel so we don't spawn two sockets.
    this._suppressAutoResume = true;
    setTimeout(() => {
      if (this.sessionActive) {
        this.initLiveAssemblyConnection(false);
        setTimeout(() => { this._suppressAutoResume = false; }, 1500);
      }
    }, 500);
  }

  /**
   * Ask the agent to generate a reply immediately (AssemblyAI reply.create).
   */
  sendReplyCreate(instructions) {
    if (!this.aaiWs || this.aaiWs.readyState !== WebSocket.OPEN) return;
    try {
      this.aaiWs.send(JSON.stringify({
        type: 'reply.create',
        instructions: instructions || 'Respond to the caller now.'
      }));
      console.log(`[SentinelVoice] 🔔 reply.create sent: "${(instructions || '').slice(0, 60)}"`);
    } catch (e) {}
  }

  /**
   * Flush accumulated tool.result payloads to AssemblyAI.
   * Per docs: send tool.result when reply.done is the latest event received.
   */
  drainToolResults() {
    if (!this._pendingToolResults.length) return;
    if (!this.aaiWs || this.aaiWs.readyState !== WebSocket.OPEN) {
      console.warn('[SentinelVoice] tool.result drain skipped: socket not open');
      return;
    }
    const pending = this._pendingToolResults;
    this._pendingToolResults = [];
    for (const p of pending) {
      try {
        this.aaiWs.send(JSON.stringify({
          type: 'tool.result',
          call_id: p.callId,
          result: JSON.stringify(p.result),
          is_error: Boolean(p.result && p.result.error)
        }));
        console.log(`[SentinelVoice] ✅ tool.result drained for ${p.toolName} (${p.callId})`);
      } catch (e) {
        console.error('[SentinelVoice] tool.result drain failed:', e.message);
      }
    }
  }

  async executeTool(name, args) {
    if (args && args.executive_name) {
      this.claimedExecutive = args.executive_name;
    }
    // Normalize common LLM/spoken-form quirks before dispatch (AAI docs:
    // "most 'tool never fires' failures trace back to argument shape mismatches")
    if (args) {
      if (typeof args.amount === 'string') {
        const cleaned = args.amount.replace(/[^0-9.]/g, '');
        if (cleaned) args.amount = Number(cleaned);
      }
      if (typeof args.account_number === 'string') {
        // Spoken digit sequences arrive spaced: "9821 4422 77" -> "9821442277"
        args.account_number = args.account_number.replace(/\s+/g, '');
      }
      if (typeof args.answer === 'string' && /^[0-9 ]+$/.test(args.answer.trim())) {
        args.answer = args.answer.replace(/\s+/g, '');
      }
    }
    switch (name) {
      case 'verify_corporate_ledger':
        EscrowService.updateActiveTransaction({
          amount_usd: args.amount,
          vendor_name: args.vendor_name || 'Unregistered Beneficiary',
          account_number: args.account_number
        });
        return LedgerService.verifyCorporateLedger(args.account_number, args.vendor_name, args.amount);

      case 'issue_security_challenge':
        return ChallengeService.issueSecurityChallenge(args.executive_name);

      case 'validate_security_challenge':
        return ChallengeService.validateAnswer(args.executive_name, args.answer);

      case 'trigger_out_of_band_verification':
        return await NotificationService.triggerOutOfBandVerification(args.executive_name, args.transfer_summary);

      case 'emergency_escrow_freeze':
        return EscrowService.emergencyEscrowFreeze(null, args.reason, args.risk_level);

      case 'release_escrow_transfer':
        return EscrowService.releaseEscrowTransfer(args.approval_code);

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  handleBrowserMessage(raw) {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === 'start_call') {
        console.log(`[SentinelVoice] Client initiated live call (core v${AGENT_CORE_VERSION}).`);
        this.greetingSent = true;
        this._audioAnchor = 0; // reset realtime audio pacing clock for the new call
        this._audioBytes = 0;
        this._emptyReplyStreak = 0;
        this._replyHadContent = false;
        this._recycleCount = 0; // fresh call: full recycle budget again

        // Clean session state for brand new call to prevent bleed-through from earlier sessions
        const freshTx = EscrowService.reset();
        this.sendToBrowser({
          type: 'escrow_update',
          transaction: freshTx
        });

        if (!this.aaiWs) {
          this.initLiveAssemblyConnection();
        } else if (this.aaiWs.readyState === WebSocket.OPEN) {
          this.sendSessionUpdate();
        } else if (this.aaiWs.readyState === WebSocket.CONNECTING) {
          // Socket still handshaking — piggyback on it instead of spawning a
          // duplicate connection (old code created a 2nd socket and lost the
          // first one's session.update: "Cannot send session.update" race).
          const pending = this.aaiWs;
          pending.once('open', () => {
            if (this.aaiWs === pending && this.greetingSent) {
              this.sendSessionUpdate();
            }
          });
        }
        return;
      }

      if (data.type === 'trigger_simulation_scenario') {
        this.runSimulationScenario(data.scenario, data.tuningConfig);
        return;
      }

      if (data.type === 'reset_session') {
        this.greetingSent = false;
        // Full brain-state wipe: a fresh call must not inherit takeover dedupe,
        // stale history, or pending tool results from the previous session.
        this._conversationHistory = [];
        this._lastTakeoverUtterance = null;
        this._emptyReplyStreak = 0;
        this._replyHadContent = false;
        this._pendingToolResults = [];
        this._lastAcousticSummary = null;
        this._recycleCount = 0;
        this._lastSpeechStartedAt = 0;
        this._watchdogBaselineAt = 0;
        this._audioAnchor = 0;
        this._audioBytes = 0;
        if (this.aaiWs) {
          try {
            this.aaiWs.send(JSON.stringify({ type: 'session.end' }));
          } catch (e) {}
          try {
            this.aaiWs.close();
          } catch (e) {}
        }
        this.initLiveAssemblyConnection();
        const standbyTx = EscrowService.reset();
        this.sendToBrowser({
          type: 'escrow_update',
          transaction: standbyTx
        });
        return;
      }

      if (data.type === 'manual_tool_exec') {
        this.executeTool(data.toolName, data.args).then((res) => {
          this.sendToBrowser({
            type: 'tool_call_end',
            toolName: data.toolName,
            result: res,
            timestamp: new Date().toLocaleTimeString('en-US')
          });
        });
        return;
      }

      // Forward audio chunks to live AssemblyAI Voice Agent WebSocket & real-time DSP
      if (data.type === 'audio_chunk' && data.buffer) {
        if (this.acousticDsp) {
          this.acousticDsp.ingestPcmChunk(data.buffer);
        }
        // AAI rate violation guard: drop chunks if running far ahead of real time.
        // IMPORTANT: re-baseline the clock when dropping — otherwise phantom bytes
        // accumulate forever and every future chunk gets dropped (agent goes deaf).
        const now = Date.now();
        const chunkBytes = (data.buffer.length * 3) / 4; // base64 -> approx bytes
        if (!this._audioAnchor) {
          this._audioAnchor = now;
          this._audioBytes = 0;
        }
        this._audioBytes += chunkBytes;
        const elapsed = now - this._audioAnchor;
        const realTimeMs = (this._audioBytes / (24000 * 2)) * 1000; // PCM16 mono 24kHz
        if (realTimeMs > elapsed + 3000) {
          // Stale burst (e.g. tab was throttled): drop this chunk and resync baseline
          this._audioAnchor = now;
          this._audioBytes = 0;
          return;
        }
        if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN) {
          this.aaiWs.send(JSON.stringify({
            type: 'input.audio',
            audio: data.buffer
          }));
        }
        return;
      }
    } catch (err) {
      // Direct binary audio chunk fallback -> convert to base64 input.audio JSON
      if (Buffer.isBuffer(raw)) {
        const b64 = raw.toString('base64');
        if (this.acousticDsp) {
          this.acousticDsp.ingestPcmChunk(b64);
        }
        if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN) {
          this.aaiWs.send(JSON.stringify({
            type: 'input.audio',
            data: b64,
            audio: b64
          }));
        }
      }
    }
  }

  async streamSimulationSpeech(role, speaker, fullText, msPerWord = 60) {
    const words = fullText.split(' ');
    for (let i = 0; i < words.length; i++) {
      const word = (i === 0 ? '' : ' ') + words[i];
      this.sendToBrowser({
        type: 'transcript_delta',
        role,
        speaker,
        text: word,
        mode: 'append'
      });
      await this.sleep(msPerWord);
    }
    this.sendToBrowser({
      type: 'transcript',
      role,
      speaker,
      text: fullText,
      timestamp: new Date().toLocaleTimeString('en-US')
    });
  }

  initSimulationMode() {
    this.sendToBrowser({
      type: 'status',
      state: 'CONNECTED',
      mode: 'SIMULATION_READY',
      message: 'SentinelVoice Engine Ready (Interactive / Simulation Mode)'
    });
  }

  // Real dynamic scenario execution powered by Poolside Laguna S / ReasoningEngine
  async runSimulationScenario(scenarioName, customTuning = null) {
    console.log(`[SentinelVoice] Executing Real Scenario with LLM Thinking Engine: ${scenarioName}`);
    try {
      await ReasoningEngine.runInteractiveScenario({
        scenarioKey: scenarioName,
        onProgress: (event) => this.sendToBrowser(event),
        tuningConfig: customTuning || TuningService.getConfig()
      });
    } catch (err) {
      console.error('[SentinelVoice] Error running interactive scenario:', err);
      this.sendToBrowser({
        type: 'status',
        state: 'ERROR',
        message: `Scenario execution error: ${err.message}`
      });
    }
  }

  sendToBrowser(data) {
    if (this.browserWs && this.browserWs.readyState === WebSocket.OPEN) {
      this.browserWs.send(JSON.stringify(data));
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  destroy() {
    this.sessionActive = false;
    this.armReplyWatchdog(false); // clear pending watchdog timer
    this._recoveredSession = false;
    if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN) {
      // Clean teardown: session.end stops billing immediately (no 30s grace window)
      try {
        this.aaiWs.send(JSON.stringify({ type: 'session.end' }));
      } catch (e) {}
      try {
        this.aaiWs.close();
      } catch (e) {}
    }
  }
}
