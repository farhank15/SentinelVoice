import { SCENARIOS_MATRIX } from './scenarioMatrix.js';
import { ReasoningEngine } from './reasoningEngine.js';

export class TuningService {
  static currentConfig = {
    coercionTolerance: 0.15,
    urgencyTolerance: 0.20,
    syntheticThreshold: 0.82,
    soxThresholdAmount: 50000
  };

  static latestBenchmark = null;

  static getConfig() {
    return { ...this.currentConfig };
  }

  static updateConfig(newConfig = {}) {
    this.currentConfig = {
      ...this.currentConfig,
      ...newConfig
    };
    return this.getConfig();
  }

  /**
   * Run full 10-scenario tuning benchmark suite
   */
  static async runBenchmarkSuite(customConfig = null) {
    const config = customConfig || this.currentConfig;
    const startTime = Date.now();
    const results = await Promise.all(
      SCENARIOS_MATRIX.map((scenario) => ReasoningEngine.evaluateScenarioBenchmark(scenario, config))
    );

    let tp = 0; // True Positive: Attack correctly FROZEN
    let tn = 0; // True Negative: Legit correctly RELEASED
    let fp = 0; // False Positive: Legit erroneously FROZEN
    let fn = 0; // False Negative: Attack erroneously RELEASED

    for (const evalResult of results) {
      const isAttack = evalResult.category === 'ADVERSARIAL_DEEPFAKE';
      if (isAttack) {
        if (evalResult.predicted === 'FROZEN') {
          tp++;
        } else {
          fn++;
        }
      } else {
        if (evalResult.predicted === 'RELEASED') {
          tn++;
        } else {
          fp++;
        }
      }
    }

    const total = results.length;
    const passedCount = results.filter((r) => r.passed).length;
    const accuracy = Number(((passedCount / total) * 100).toFixed(1));
    const fpr = (fp + tn) > 0 ? Number(((fp / (fp + tn)) * 100).toFixed(1)) : 0;
    const fnr = (fn + tp) > 0 ? Number(((fn / (fn + tp)) * 100).toFixed(1)) : 0;
    const totalDurationMs = Date.now() - startTime;
    const avgLatencyMs = Math.round(results.reduce((acc, r) => acc + r.latencyMs, 0) / total);

    const benchmarkReport = {
      timestamp: new Date().toISOString(),
      tuningConfig: config,
      summary: {
        totalScenarios: total,
        passedCount,
        accuracy,
        fpr,
        fnr,
        confusionMatrix: {
          truePositives: tp,
          trueNegatives: tn,
          falsePositives: fp,
          falseNegatives: fn
        },
        avgLatencyMs,
        totalDurationMs
      },
      results
    };

    this.latestBenchmark = benchmarkReport;
    return benchmarkReport;
  }

  static getLatestBenchmark() {
    return this.latestBenchmark;
  }
}
