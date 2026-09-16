import WebSocket from 'ws';
import { SENTINEL_SYSTEM_PROMPT } from './systemPrompt.js';
import { sentinelTools } from './toolsDefinition.js';
import { LedgerService } from '../services/ledgerService.js';
import { ChallengeService } from '../services/challengeService.js';
import { EscrowService } from '../services/escrowService.js';
import { NotificationService } from '../services/notificationService.js';
import { ReasoningEngine } from '../services/reasoningEngine.js';
import { TuningService } from '../services/tuningService.js';

export class AssemblyVoiceAgentSession {
  constructor(browserWs, apiKey = process.env.ASSEMBLYAI_API_KEY) {
    this.browserWs = browserWs;
    this.apiKey = apiKey;
    this.aaiWs = null;
    this.isSimulation = !apiKey || apiKey === 'your_assemblyai_api_key_here';
    this.currentTx = EscrowService.getLatestTransaction();
    this.sessionActive = true;
    this.greetingSent = false;
  }

  async start() {
    console.log(`[SentinelVoice] Initializing voice session. Mode: ${this.isSimulation ? 'SIMULATED / TEST RUNNER' : 'LIVE ASSEMBLYAI API'}`);

    if (this.isSimulation) {
      this.initSimulationMode();
    } else {
      this.initLiveAssemblyConnection();
    }
  }

  initLiveAssemblyConnection() {
    // Official AssemblyAI Voice Agent API WebSocket endpoint
    const url = 'wss://agents.assemblyai.com/v1/ws';
    this.aaiWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    this.aaiWs.on('open', () => {
      console.log('[AssemblyAI] WebSocket Connected successfully to wss://agents.assemblyai.com/v1/ws (HTTP 101).');
      this.sendToBrowser({
        type: 'status',
        state: 'CONNECTED',
        mode: 'LIVE_ASSEMBLYAI',
        message: 'Connected to AssemblyAI Voice Agent API (Standby)'
      });
      // Do not send premature session.update with greeting: null
      // Wait for user to trigger live call (start_call) to send full config with greeting
    });

    this.aaiWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[AssemblyAI Event] Type: ${msg.type}${msg.text ? ` - "${msg.text.slice(0, 50)}..."` : ''}`);
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
    });
  }

  async handleAssemblyEvent(msg) {
    if (msg.type === 'session.ready') {
      console.log('[AssemblyAI] Session READY received. Ready for audio input/output.');
      this.sendToBrowser({ type: 'session_ready' });
      return;
    }

    if (msg.type === 'error') {
      console.error('[AssemblyAI Error Event]', JSON.stringify(msg));
      return;
    }

    // 1. Audio stream from AssemblyAI Voice Agent TTS
    if (msg.type === 'reply.audio' && (msg.data || msg.audio)) {
      this.sendToBrowser({
        type: 'audio_chunk',
        buffer: msg.data || msg.audio
      });
      return;
    }

    // 2a. Realtime agent streaming delta (word-by-word streaming typing effect)
    if (msg.type === 'transcript.agent.delta') {
      const deltaText = msg.text || msg.delta || '';
      if (deltaText) {
        this.sendToBrowser({
          type: 'transcript_delta',
          role: 'agent',
          speaker: 'SentinelVoice AI',
          replyId: msg.reply_id || 'agent_active',
          text: deltaText,
          mode: 'append'
        });
      }
      return;
    }

    // 2b. Realtime caller streaming delta (live speech recognition)
    if (msg.type === 'transcript.user.delta') {
      const partialText = msg.text || msg.delta || '';
      if (partialText) {
        this.sendToBrowser({
          type: 'transcript_delta',
          role: 'caller',
          speaker: 'Caller (Live Voice)',
          text: partialText,
          mode: 'replace'
        });
      }
      return;
    }

    // 2c. Final transcripts from agent and caller
    if (msg.type === 'transcript.agent' && msg.text) {
      this.sendToBrowser({
        type: 'transcript',
        role: 'agent',
        speaker: 'SentinelVoice AI',
        replyId: msg.reply_id || 'agent_active',
        text: msg.text,
        isFinal: true,
        timestamp: new Date().toLocaleTimeString('en-US')
      });
      return;
    }

    if (msg.type === 'transcript.user' && msg.text) {
      this.sendToBrowser({
        type: 'transcript',
        role: 'caller',
        speaker: 'Caller (Live Voice)',
        text: msg.text,
        isFinal: true,
        timestamp: new Date().toLocaleTimeString('en-US')
      });

      // Real-time Cialdini Multimodal Persuasion Profiler for live voice input
      const lower = msg.text.toLowerCase();
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

      const isThreat = persuasionVectors.authority_pressure > 0.7 || persuasionVectors.protocol_evasion > 0.7;

      this.sendToBrowser({
        type: 'thinking_stream',
        dag_node: 'n5',
        thinking: `[Live Persuasion Profile: ${attackProfile}] Ingested live voice input. Authority: ${(persuasionVectors.authority_pressure * 100).toFixed(0)}%, Urgency: ${(persuasionVectors.urgency_scarcity * 100).toFixed(0)}%, Liking: ${(persuasionVectors.smooth_rapport_liking * 100).toFixed(0)}%, Protocol Evasion: ${(persuasionVectors.protocol_evasion * 100).toFixed(0)}%. SOX-404 Zero-Trust Policy evaluating.`,
        threat_assessment: {
          persuasion_vectors: persuasionVectors,
          attack_profile: attackProfile,
          coercion_score: persuasionVectors.authority_pressure,
          urgency_score: persuasionVectors.urgency_scarcity,
          synthetic_confidence: 0.04,
          verdict: isThreat ? 'SUSPICIOUS' : 'NOMINAL'
        },
        engine: 'Sentinel Forensic Core'
      });
      return;
    }

    // 3. Speech Turn Detection & States
    if (msg.type === 'input.speech.started') {
      this.sendToBrowser({ type: 'agent_state', state: 'LISTENING', userSpeaking: true });
      return;
    }
    if (msg.type === 'input.speech.stopped') {
      this.sendToBrowser({ type: 'agent_state', state: 'ANALYZING' });
      return;
    }
    if (msg.type === 'reply.started') {
      this.sendToBrowser({ type: 'agent_state', state: 'SPEAKING' });
      return;
    }
    if (msg.type === 'reply.done') {
      this.sendToBrowser({
        type: 'agent_state',
        state: 'LISTENING',
        interrupted: msg.status === 'interrupted'
      });
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

      // Execute Tool
      const result = await this.executeTool(toolName, args);

      // Return result to AssemblyAI
      if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN) {
        this.aaiWs.send(JSON.stringify({
          type: 'tool.result',
          call_id: callId,
          tool_call_id: callId,
          result: JSON.stringify(result)
        }));
      }

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

  async executeTool(name, args) {
    switch (name) {
      case 'verify_corporate_ledger':
        return LedgerService.verifyCorporateLedger(args.account_number, args.vendor_name, args.amount);

      case 'issue_security_challenge':
        return ChallengeService.issueSecurityChallenge(args.executive_name);

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
        console.log('[SentinelVoice] Client initiated live call. Initializing AssemblyAI session with greeting.');
        if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN && !this.greetingSent) {
          this.greetingSent = true;
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
                turn_detection: {
                  vad_threshold: 0.45,
                  min_silence: 700,
                  max_silence: 2200,
                  interrupt_response: true
                },
                keyterms: [
                  'Sarbanes-Oxley',
                  'SOX-404',
                  'dual-control',
                  'escrow',
                  'beneficiary',
                  'wire disbursement',
                  'SWIFT',
                  'IBAN',
                  'OFAC',
                  'Apex Cloud',
                  'Adidharma',
                  'Elena Rostova',
                  'Robert Sterling',
                  'Project Olympus',
                  'Deloitte',
                  '7782',
                  'ASVspoof',
                  'voiceprint',
                  'deepfake'
                ]
              },
              tools: sentinelTools
            }
          };
          this.aaiWs.send(JSON.stringify(sessionConfig));
        }
        return;
      }

      if (data.type === 'trigger_simulation_scenario') {
        this.runSimulationScenario(data.scenario, data.tuningConfig);
        return;
      }

      if (data.type === 'reset_session') {
        this.greetingSent = false;
        if (this.aaiWs) {
          try {
            this.aaiWs.close();
          } catch (e) {}
          this.initLiveAssemblyConnection();
        }
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

      // Forward audio chunks to live AssemblyAI Voice Agent WebSocket
      if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN && data.type === 'audio_chunk' && data.buffer) {
        this.aaiWs.send(JSON.stringify({
          type: 'input.audio',
          data: data.buffer,
          audio: data.buffer
        }));
        return;
      }
    } catch (err) {
      // Direct binary audio chunk fallback -> convert to base64 input.audio JSON
      if (Buffer.isBuffer(raw) && this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN) {
        const b64 = raw.toString('base64');
        this.aaiWs.send(JSON.stringify({
          type: 'input.audio',
          data: b64,
          audio: b64
        }));
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
    if (this.aaiWs && this.aaiWs.readyState === WebSocket.OPEN) {
      this.aaiWs.close();
    }
  }
}
