/**
 * Frontier LLM Service: Poolside Laguna S & AssemblyAI Gateway
 *
 * Primary: Poolside AI (model: poolside/laguna-s-2.1)
 * Endpoint: https://inference.poolside.ai/v1/chat/completions
 *
 * Fallback: AssemblyAI LLM Gateway (model: qwen3.5-4b-32k-fast)
 * Endpoint: https://llm-gateway.assemblyai.com/v1/chat/completions
 */
export class LLMGatewayService {
  /**
   * Get active provider metadata
   */
  static getProviderInfo() {
    const poolsideKey = process.env.LLM_API_KEY;
    if (poolsideKey && poolsideKey.startsWith('sky_')) {
      return {
        provider: 'Poolside AI',
        model: 'poolside/laguna-s-2.1',
        type: 'FRONTIER_REASONING_MODEL',
        endpoint: 'https://inference.poolside.ai/v1'
      };
    }
    return {
      provider: 'AssemblyAI LLM Gateway',
      model: 'qwen3.5-4b-32k-fast',
      type: 'MANAGED_LLM_GATEWAY',
      endpoint: 'https://llm-gateway.assemblyai.com/v1'
    };
  }

  /**
   * Evaluate a zero-knowledge challenge answer using Poolside Laguna S
   */
  static async evaluateChallengeWithLLM(executiveName, challengeQuestion, callerAnswer) {
    const poolsideKey = process.env.LLM_API_KEY;
    const aaiKey = process.env.ASSEMBLYAI_API_KEY;

    const prompt = `
You are a senior cybersecurity forensics model evaluating a corporate wire authorization call.
Executive Claimed: ${executiveName}
Challenge Question: "${challengeQuestion}"
Caller's Verbal Response: "${callerAnswer}"

Determine if the caller passed the verification challenge, or if they are exhibiting evasiveness, intimidation, or failure.
Return strict JSON with no markdown wrapping:
{
  "passed": boolean,
  "confidence": number between 0 and 1,
  "threat_level": "LOW" | "ELEVATED" | "CRITICAL",
  "reasoning": "concise explanation"
}
`;

    // 1. Try Poolside AI (Laguna S) if LLM_API_KEY is available
    if (poolsideKey) {
      try {
        console.log('[LLMGatewayService] Calling Poolside Laguna S (poolside/laguna-s-2.1)...');
        const response = await fetch('https://inference.poolside.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${poolsideKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'poolside/laguna-s-2.1',
            messages: [
              {
                role: 'system',
                content: 'You are an unyielding treasury fraud detection intelligence engine. You evaluate zero-knowledge identity challenge responses. Output valid JSON only.'
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 400
          })
        });

        if (response.ok) {
          const result = await response.json();
          const rawContent = result.choices?.[0]?.message?.content || '{}';
          const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          console.log('[LLMGatewayService] Poolside Laguna S evaluated successfully:', parsed);
          return {
            ...parsed,
            engine: 'Poolside Laguna S 2.1'
          };
        } else {
          console.warn(`[LLMGatewayService] Poolside responded with HTTP ${response.status}: ${await response.text()}`);
        }
      } catch (poolsideErr) {
        console.warn('[LLMGatewayService] Poolside Laguna S error, trying fallback:', poolsideErr.message);
      }
    }

    // 2. Fallback to AssemblyAI LLM Gateway
    if (aaiKey && aaiKey !== 'your_assemblyai_api_key_here') {
      try {
        console.log('[LLMGatewayService] Calling AssemblyAI LLM Gateway (qwen3.5-4b-32k-fast)...');
        const response = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'authorization': aaiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'qwen3.5-4b-32k-fast',
            messages: [
              { role: 'system', content: 'You are a corporate fraud security evaluator. Output strict JSON only.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 400
          })
        });

        if (response.ok) {
          const result = await response.json();
          const rawContent = result.choices?.[0]?.message?.content || '{}';
          const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          return {
            ...parsed,
            engine: 'AssemblyAI LLM Gateway (Qwen-2.5)'
          };
        }
      } catch (aaiErr) {
        console.warn('[LLMGatewayService] AssemblyAI LLM Gateway error:', aaiErr.message);
      }
    }

    // 3. Fallback Heuristic
    const lower = String(callerAnswer || '').toLowerCase();
    const passed = lower.includes('olympus') || lower.includes('7782') || lower.includes('deloitte');
    return {
      mode: 'HEURISTIC_RULE_FALLBACK',
      passed,
      confidence: passed ? 0.95 : 0.2,
      threat_level: passed ? 'LOW' : 'CRITICAL',
      reasoning: passed
        ? 'Matched verified secret token keyphrase.'
        : 'Failed identity verification challenge.',
      engine: 'Deterministic Heuristic'
    };
  }

  /**
   * Classify psychological threat vectors (Urgency, Coercion, Secrecy)
   */
  static async classifyThreatVectors(transcript) {
    const poolsideKey = process.env.LLM_API_KEY;
    if (!poolsideKey) return null;

    try {
      const response = await fetch('https://inference.poolside.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${poolsideKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'poolside/laguna-s-2.1',
          messages: [
            {
              role: 'system',
              content: 'Classify BEC fraud vectors. Output JSON only: { "coercion_score": number, "urgency_score": number, "secrecy_demanded": boolean, "verdict": "BENIGN" | "SUSPICIOUS" | "CRITICAL_FRAUD" }'
            },
            {
              role: 'user',
              content: `Transcript: "${transcript}"`
            }
          ],
          temperature: 0.1,
          max_tokens: 300
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '{}';
        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
      }
    } catch (err) {
      console.warn('[LLMGatewayService] Threat vector classification error:', err.message);
    }
    return null;
  }
}
