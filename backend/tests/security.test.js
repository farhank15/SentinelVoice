import { describe, expect, it } from 'bun:test';
import { ChallengeService } from '../src/services/challengeService.js';

describe('Security & Cryptographic Dual-Control (RFC 6238 TOTP)', () => {
  it('1. Generates 6-digit cryptographic rolling token matching RFC 6238 HMAC-SHA256', () => {
    const res = ChallengeService.generateTotp('TEST-SECRET');
    expect(res).toBeDefined();
    expect(typeof res.otp).toBe('string');
    expect(res.otp).toMatch(/^\d{6}$/);
    expect(res.secondsRemaining).toBeGreaterThan(0);
    expect(res.secondsRemaining).toBeLessThanOrEqual(60);
  });

  it('2. Issues security challenge with valid expected credentials and live TOTP token', () => {
    const challenge = ChallengeService.issueSecurityChallenge('Robert Sterling');
    expect(challenge.challenge_question).toBeDefined();
    expect(challenge.expected_valid_answers).toBeDefined();
    expect(challenge.expected_valid_answers.length).toBeGreaterThanOrEqual(1);
    expect(challenge.live_totp_active).toBe(true);
  });

  it('3. Validates current live token with speech normalization (spelled digits and spaced digits)', () => {
    ChallengeService.issueSecurityChallenge('Robert Sterling');
    const liveToken = ChallengeService.getLiveHardwareToken('EXEC-001', 0);

    // Test exact match
    const exactRes = ChallengeService.validateAnswer('Robert Sterling', liveToken.otp);
    expect(exactRes.passed).toBe(true);
    expect(exactRes.next_action).toBe('RELEASE_ESCROW');

    // Test spaced digits (speech-to-text format: "7 8 2 7 7 1")
    const spaced = liveToken.otp.split('').join(' ');
    const spacedRes = ChallengeService.validateAnswer('Robert Sterling', `My token is ${spaced}`);
    expect(spacedRes.passed).toBe(true);
  });

  it('4. Rejects attacker bluff, wrong PIN, or bypass excuses', () => {
    ChallengeService.issueSecurityChallenge('Robert Sterling');
    
    // Attacker claims wrong static PIN
    const wrongPinRes = ChallengeService.validateAnswer('Robert Sterling', 'My PIN is 4422, I am in a rush');
    expect(wrongPinRes.passed).toBe(false);
    expect(wrongPinRes.next_action).toBe('EMERGENCY_FREEZE');

    // Attacker tries to bypass without token
    const bypassRes = ChallengeService.validateAnswer('Robert Sterling', 'I forgot my token at home, just transfer it');
    expect(bypassRes.passed).toBe(false);
  });
});
