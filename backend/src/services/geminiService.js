/**
 * Gemini Fallback LLM Service — MULTI-KEY with per-key circuit breakers.
 *
 * Fallback tier for all JSON-structured forensic evaluations (after Poolside
 * Laguna S / AssemblyAI LLM Gateway). Uses the official Gemini REST endpoint
 * with responseMimeType: application/json so replies are parseable.
 *
 * Key rotation chain:
 *   GEMINI_API_KEY   -> primary
 *   GEMINI_API_KEY2  -> secondary (used automatically when the primary
 *                       key's circuit breaker opens: quota exceeded, invalid,
 *                       or network path failure)
 *
 * Each key carries its OWN circuit breaker: 2 consecutive failures open that
 * key for 60s. generateJson() walks the key chain skipping open breakers, so
 * a dead/rate-limited primary never stalls the voice pipeline while the
 * secondary stays usable.
 *
 * Config:
 *   GEMINI_API_KEY   — primary key (Google AI Studio)
 *   GEMINI_API_KEY2  — optional secondary key
 *   GEMINI_MODEL     — optional, default: gemini-2.5-flash (GA, fast, cheap)
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const BREAKER_THRESHOLD = 2;
const BREAKER_COOLDOWN_MS = 60000;

// Per-key circuit breakers, indexed by position in the key chain
const breakers = [null, null].map(() => ({ failures: 0, openUntil: 0 }));

function breakerOpen(idx) {
  const b = breakers[idx];
  return Boolean(b && Date.now() < b.openUntil);
}

function recordResult(idx, success) {
  const b = breakers[idx];
  if (!b) return;
  if (success) {
    b.failures = 0;
    b.openUntil = 0;
  } else {
    b.failures++;
    if (b.failures >= BREAKER_THRESHOLD) {
      b.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      console.warn(`[Gemini] ⚡ Circuit breaker OPEN for key #${idx + 1} — skipped for ${BREAKER_COOLDOWN_MS / 1000}s`);
    }
  }
}

/**
 * Ordered list of usable API keys: [{ key, idx }] — skips keys whose breaker
 * is open but keeps the chain order so the primary is always preferred once
 * its breaker closes again.
 */
function getKeyChain() {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY2]
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean);
  return keys
    .map((key, idx) => ({ key, idx }))
    .filter(({ idx }) => !breakerOpen(idx));
}

function maskKey(key) {
  return key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-3)}` : '***';
}

/**
 * Repair truncated / dirty JSON from an LLM before giving up.
 */
function repairJson(raw) {
  let s = raw.trim().replace(/```json/g, '').replace(/```/g, '').trim();
  const match = s.match(/\{[\s\S]*\}/);
  if (match) s = match[0];

  try {
    return JSON.parse(s);
  } catch (e) {
    let repaired = s.replace(/,\s*([}\]])/g, '$1'); // trailing commas
    if (!repaired.endsWith('}')) {
      const quotes = (repaired.match(/"/g) || []).length;
      if (quotes % 2 === 1) repaired += '"';
      repaired = repaired.replace(/,\s*$/, '') + '}';
    }
    let opens = 0;
    for (const ch of repaired) {
      if (ch === '{') opens++;
      else if (ch === '}') opens--;
    }
    if (opens > 0) repaired += '}'.repeat(opens);
    return JSON.parse(repaired);
  }
}

export class GeminiService {
  static isConfigured() {
    return getKeyChain().length > 0 || [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY2]
      .some((k) => typeof k === 'string' && k.trim().length > 10);
  }

  static getInfo() {
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY2]
      .map((k) => (typeof k === 'string' ? k.trim() : ''));
    return {
      provider: 'Google Gemini',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      configured: keys.some((k) => k.length > 10),
      key_count: keys.filter((k) => k.length > 10).length,
      keys: keys.map((k, idx) => ({
        tier: idx + 1,
        configured: k.length > 10,
        breakerOpen: breakerOpen(idx)
      })),
      breakerOpen: breakers.every((_, idx) => breakerOpen(idx) || !keys[idx])
    };
  }

  /**
   * Call Gemini and return parsed strict JSON. Walks the key chain
   * (primary -> secondary), skipping keys with open breakers.
   * Returns { ok: true, data, keyTier } or { ok: false, error }.
   */
  static async generateJson(systemPrompt, userPrompt, { maxOutputTokens = 900, timeoutMs = 12000 } = {}) {
    const chain = getKeyChain();
    if (chain.length === 0) {
      const anyConfigured = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY2]
        .some((k) => typeof k === 'string' && k.trim().length > 10);
      return { ok: false, error: anyConfigured ? 'all Gemini keys circuit-broken' : 'no GEMINI_API_KEY configured' };
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const errors = [];

    for (const { key, idx } of chain) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'x-goog-api-key': key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
              maxOutputTokens,
              thinkingConfig: { thinkingBudget: 0 } // minimize latency for voice loops
            }
          })
        });

        if (!response.ok) {
          recordResult(idx, false);
          const body = await response.text().catch(() => '');
          const err = `key#${idx + 1} HTTP ${response.status}: ${body.slice(0, 120)}`;
          errors.push(err);
          console.warn(`[Gemini] ${err} — rotating to next key`);
          continue; // rotate to the next key in the chain
        }

        const data = await response.json();
        const text = (data.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || '')
          .join('')
          .trim();

        if (!text) {
          recordResult(idx, false);
          const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'empty';
          errors.push(`key#${idx + 1} empty completion (${reason})`);
          continue; // rotate
        }

        const parsed = repairJson(text);
        recordResult(idx, true);
        return { ok: true, data: parsed, model, keyTier: idx + 1, keyMask: maskKey(key) };
      } catch (err) {
        recordResult(idx, false);
        const msg = err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message;
        errors.push(`key#${idx + 1} ${msg}`);
        console.warn(`[Gemini] key#${idx + 1} failed (${msg}) — rotating to next key`);
      } finally {
        clearTimeout(timer);
      }
    }

    return { ok: false, error: `all keys failed: ${errors.join(' | ')}` };
  }
}
