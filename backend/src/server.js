import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { AssemblyVoiceAgentSession } from './agent/assemblyClient.js';
import { EscrowService } from './services/escrowService.js';
import { LedgerService } from './services/ledgerService.js';
import { LLMGatewayService } from './services/llmGatewayService.js';
import { SCENARIOS_MATRIX, getScenarioByKey } from './services/scenarioMatrix.js';
import { TuningService } from './services/tuningService.js';
import { ReasoningEngine } from './services/reasoningEngine.js';

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
