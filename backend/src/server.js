import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { AssemblyVoiceAgentSession, AGENT_CORE_VERSION } from './agent/assemblyClient.js';
import { EscrowService } from './services/escrowService.js';
import { LedgerService } from './services/ledgerService.js';
import { LLMGatewayService } from './services/llmGatewayService.js';
import { SCENARIOS_MATRIX, getScenarioByKey } from './services/scenarioMatrix.js';
import { TuningService } from './services/tuningService.js';
import { ReasoningEngine } from './services/reasoningEngine.js';
import { VoiceprintRepository } from './services/voiceprintRepository.js';
import { AcousticDspService } from './services/acousticService.js';
import { ChallengeService } from './services/challengeService.js';

dotenv.config();

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  }
});

// Enable CORS for frontend
await fastify.register(fastifyCors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS']
});

// Enable WebSocket support
await fastify.register(fastifyWebsocket);

// Root endpoint
fastify.get('/', async () => {
  return {
    service: 'SentinelVoice Gateway',
    version: '1.0.0',
    description: 'Autonomous Voice Treasury Guardian & Fraud Interrogator',
    ws_endpoint: '/ws/voice-session',
    health_endpoint: '/api/health'
  };
});

// Health check endpoint
fastify.get('/api/health', async () => {
  return {
    service: 'SentinelVoice Gateway',
    status: 'OPERATIONAL',
    agent_core_version: AGENT_CORE_VERSION, // verify the running process is not stale
    timestamp: new Date().toISOString(),
    assembly_key_configured: Boolean(process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY !== 'your_assemblyai_api_key_here'),
    llm: LLMGatewayService.getProviderInfo()
  };
});

// LLM Provider Status
fastify.get('/api/llm/status', async () => {
  return LLMGatewayService.getProviderInfo();
});

// Get latest escrow transaction state
fastify.get('/api/escrow/latest', async () => {
  return EscrowService.getLatestTransaction();
});

// Reset escrow to standby state
fastify.post('/api/escrow/reset', async () => {
  return EscrowService.reset();
});

// Trigger direct ledger verify via REST (useful for frontend inspect)
fastify.post('/api/ledger/verify', async (req) => {
  const { account_number, vendor_name, amount } = req.body || {};
  return LedgerService.verifyCorporateLedger(account_number, vendor_name, amount);
});

// LLM Evaluation endpoint (Poolside Laguna S / Gateway)
fastify.post('/api/evaluate-speech', async (req) => {
  const { executive_name, challenge_question, caller_answer } = req.body || {};
  return LLMGatewayService.evaluateChallengeWithLLM(executive_name, challenge_question, caller_answer);
});

// Scenario Matrix Listing (10 real-world benchmark cases)
fastify.get('/api/scenarios', async () => {
  return {
    count: SCENARIOS_MATRIX.length,
    scenarios: SCENARIOS_MATRIX.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      reference: s.reference,
      category: s.category,
      threatVector: s.threatVector,
      executiveClaimed: s.executiveClaimed,
      wireDetails: s.wireDetails,
      expectedOutcome: s.groundTruth.expectedOutcome
    }))
  };
});

// Run single scenario benchmark
fastify.post('/api/scenarios/run', async (req) => {
  const { scenario_key, tuning_config } = req.body || {};
  const scenario = getScenarioByKey(scenario_key) || SCENARIOS_MATRIX[0];
  return ReasoningEngine.evaluateScenarioBenchmark(scenario, tuning_config);
});

// Tuning Configuration Management
fastify.get('/api/tuning/config', async () => {
  return TuningService.getConfig();
});

fastify.post('/api/tuning/config', async (req) => {
  return TuningService.updateConfig(req.body || {});
});

// Automated 10-Scenario Benchmark Suite Runner
fastify.post('/api/benchmark/run', async (req) => {
  const { tuning_config } = req.body || {};
  return TuningService.runBenchmarkSuite(tuning_config);
});

fastify.get('/api/benchmark/latest', async () => {
  const latest = TuningService.getLatestBenchmark();
  if (!latest) {
    return TuningService.runBenchmarkSuite();
  }
  return latest;
});

// Dynamic Executive Hardware Security Token Route (RFC 6238 TOTP)
fastify.get('/api/token/current', async (req) => {
  const execId = req.query?.exec_id || 'EXEC-001';
  const tokenData = ChallengeService.getLiveHardwareToken(execId);
  return {
    success: true,
    executive_id: execId,
    token: tokenData.otp,
    seconds_remaining: tokenData.secondsRemaining,
    time_step_sec: tokenData.timeStep,
    standard: 'RFC 6238 TOTP (SHA-256)'
  };
});

// Voiceprint Registry & Biometric Enrollment Routes (SQLite / JSON Vault)
fastify.get('/api/voiceprint/profiles', async () => {
  return {
    count: VoiceprintRepository.getAllProfiles().length,
    profiles: VoiceprintRepository.getAllProfiles()
  };
});

fastify.post('/api/voiceprint/enroll', async (req) => {
  const { executive_id, executive_name, audio_base64, duration_sec, title, samples_base64 } = req.body || {};

  // ---- MULTI-UTTERANCE BATCH PATH (industry standard: 3-5 samples -> centroid
  // + cross-sample variability feeds the live Mahalanobis sigma) ----
  if (Array.isArray(samples_base64) && samples_base64.length > 0) {
    const perSampleSummaries = [];
    for (const b64 of samples_base64) {
      const dsp = new AcousticDspService(24000);
      dsp.ingestPcmChunk(b64);
      perSampleSummaries.push(dsp.getAcousticSummary(executive_name || 'Custom Executive'));
    }
    const agg = AcousticDspService.aggregateEnrollmentSamples(perSampleSummaries);
    if (!agg.ok) {
      return {
        error: 'ENROLLMENT_QUALITY_GATE',
        detail: agg.reason,
        total_samples: agg.total_samples,
        valid_samples: agg.valid_samples,
        per_sample_f0: perSampleSummaries.map((s) => s.f0_mean_hz)
      };
    }

    const profile = {
      executive_id: executive_id || `EXEC-${Date.now().toString().slice(-4)}`,
      executive_name: executive_name || 'Custom Executive',
      title: title || 'Executive Officer',
      f0_target_hz: agg.f0_target_hz,
      f0_min_hz: agg.f0_min_hz,
      f0_max_hz: agg.f0_max_hz,
      formant_f1_hz: agg.formant_f1_hz,
      formant_f2_hz: agg.formant_f2_hz,
      f1_std_hz: agg.f1_std_hz,
      f2_std_hz: agg.f2_std_hz,
      f0_std_across_hz: agg.f0_std_across_hz,
      vocal_timbre: agg.vocal_timbre,
      jitter_baseline_pct: agg.jitter_baseline_pct,
      sample_duration_sec: duration_sec || 6,
      sample_count: agg.sample_count,
      notes: `Multi-utterance enrollment (${agg.sample_count} samples): F0 ${agg.f0_target_hz}Hz ±${agg.f0_std_across_hz}, F1=${agg.formant_f1_hz}Hz, Jitter=${agg.jitter_baseline_pct}%`
    };
    const saved = VoiceprintRepository.saveVoiceprint(profile);
    return { ...saved, acoustic_analysis: agg, enrollment_mode: 'multi_utterance' };
  }

  // ---- LEGACY SINGLE-SAMPLE PATH (kept for API compatibility) ----
  if (!audio_base64) {
    return { error: 'Missing audio_base64 payload or samples_base64 array' };
  }

  const dsp = new AcousticDspService(24000);
  dsp.ingestPcmChunk(audio_base64);
  const summary = dsp.getAcousticSummary(executive_name || 'Robert Sterling');

  const profile = {
    executive_id: executive_id || `EXEC-${Date.now().toString().slice(-4)}`,
    executive_name: executive_name || 'Custom Executive',
    title: title || 'Executive Officer',
    f0_target_hz: summary.f0_mean_hz,
    f0_min_hz: Math.max(60, Math.round(summary.f0_mean_hz - summary.f0_std_hz * 2)),
    f0_max_hz: Math.min(380, Math.round(summary.f0_mean_hz + summary.f0_std_hz * 2)),
    formant_f1_hz: summary.formant_f1_hz,
    formant_f2_hz: summary.formant_f2_hz,
    vocal_timbre: summary.vocal_timbre,
    jitter_baseline_pct: summary.jitter_percent,
    sample_duration_sec: duration_sec || 5,
    notes: `Enrolled via Web Mic (${summary.f0_mean_hz}Hz, F1=${summary.formant_f1_hz}Hz, Jitter=${summary.jitter_percent}%)`
  };

  const saved = VoiceprintRepository.saveVoiceprint(profile);
  return {
    ...saved,
    acoustic_analysis: summary
  };
});

// WebSocket Voice Session Route
fastify.register(async function (fastifyInstance) {
  fastifyInstance.get('/ws/voice-session', { websocket: true }, (socket, req) => {
    fastify.log.info('[SentinelVoice] New Browser WebSocket Connection opened.');

    const session = new AssemblyVoiceAgentSession(socket);
    session.start();

    socket.on('message', (message) => {
      session.handleBrowserMessage(message);
    });

    socket.on('close', () => {
      fastify.log.info('[SentinelVoice] Browser WebSocket Connection closed.');
      session.destroy();
    });

    socket.on('error', (err) => {
      fastify.log.error(`[SentinelVoice] Browser Socket error: ${err.message}`);
      session.destroy();
    });
  });
});

const PORT = Number(process.env.PORT) || 8000;
const HOST = '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`\n🛡️  [SentinelVoice] Server is running on http://localhost:${PORT}`);
  console.log(`📡 [SentinelVoice] WebSocket endpoint: ws://localhost:${PORT}/ws/voice-session\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
