#!/usr/bin/env bun
/**
 * Publish the SentinelVoice stored agent to AssemblyAI Voice Agents REST API.
 *
 * Usage:
 *   bun scripts/publish-agent.mjs            # create or update (uses saved id)
 *   bun scripts/publish-agent.mjs --new      # force create a NEW agent
 *   bun scripts/publish-agent.mjs --get      # fetch & print current agent
 *
 * Env required:
 *   ASSEMBLYAI_API_KEY   — from https://www.assemblyai.com/app/account
 *   PUBLIC_BASE_URL      — public https base URL AssemblyAI will call for HTTP
 *                          tools, e.g. https://<your-tunnel>.trycloudflare.com
 *                          (local dev: `cloudflared tunnel --url http://localhost:8000`)
 *
 * Optional:
 *   AGENT_ID_FILE        — where the agent id is cached (default .agent-id)
 *
 * Docs: https://www.assemblyai.com/docs/voice-agents/voice-agent-api/manage-agents
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const API = 'https://agents.assemblyai.com/v1/agents';
const KEY = process.env.ASSEMBLYAI_API_KEY;
const AGENT_ID_FILE = process.env.AGENT_ID_FILE || path.resolve(process.cwd(), '.agent-id');

const arg = process.argv[2] || '';

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!KEY || KEY === 'your_assemblyai_api_key_here') {
  die('ASSEMBLYAI_API_KEY missing. Copy .env.example to .env and set it.');
}

const body = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'src/agent/sentinel-agent.json'), 'utf8')
);

// ${VAR} substitution at publish time (official starter behavior): PUBLIC_BASE_URL
// must be a public https URL — AssemblyAI refuses private/loopback hosts.
const missing = [];
const substituted = JSON.parse(
  JSON.stringify(body).replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    const v = process.env[name];
    if (!v) {
      missing.push(name);
      return `__MISSING_${name}__`;
    }
    return v;
  })
);
if (missing.length) {
  die(
    `Missing env vars for tool URLs: ${missing.join(', ')}.\n` +
    `Set PUBLIC_BASE_URL to a public https host (e.g. cloudflared tunnel --url http://localhost:8000).`
  );
}

const headers = { Authorization: KEY, 'Content-Type': 'application/json' };

async function main() {
  if (arg === '--get') {
    const id = fs.existsSync(AGENT_ID_FILE) ? fs.readFileSync(AGENT_ID_FILE, 'utf8').trim() : null;
    if (!id) die('No saved agent id. Publish first.');
    const res = await fetch(`${API}/${id}`, { headers });
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  const savedId = fs.existsSync(AGENT_ID_FILE) ? fs.readFileSync(AGENT_ID_FILE, 'utf8').trim() : null;
  const forceNew = arg === '--new' || !savedId;

  let res;
  if (forceNew) {
    console.log('🚀 POST /v1/agents (create)...');
    res = await fetch(API, { method: 'POST', headers, body: JSON.stringify(substituted) });
  } else {
    console.log(`🚀 PUT /v1/agents/${savedId} (update)...`);
    res = await fetch(`${API}/${savedId}`, { method: 'PUT', headers, body: JSON.stringify(substituted) });
  }

  const text = await res.text();
  if (!res.ok) {
    die(`HTTP ${res.status}: ${text}`);
  }
  const agent = JSON.parse(text);
  fs.writeFileSync(AGENT_ID_FILE, agent.id);
  console.log(`✅ Agent published: ${agent.name}`);
  console.log(`   id:        ${agent.id}`);
  console.log(`   saved to:  ${AGENT_ID_FILE}`);
  console.log(`   tools:     ${agent.tools?.map((t) => t.name).join(', ')}`);
  console.log(`\nNext: restart backend, then open http://localhost:8000/agent-console.html`);
}

main().catch((e) => die(e.message));
