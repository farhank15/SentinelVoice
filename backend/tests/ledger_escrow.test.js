import { describe, expect, it } from 'bun:test';
import { LedgerService } from '../src/services/ledgerService.js';
import { EscrowService } from '../src/services/escrowService.js';

describe('N7 AML/OFAC Screening & N12 Immutable Audit Chain', () => {
  it('N7. OFAC restricted account is blocked before any ERP verdict (SANCTION_MATCH, risk 99)', () => {
    const res = LedgerService.verifyCorporateLedger('7755332211', 'Unknown Shell', 250000);
    expect(res.status).toBe('OFAC_SANCTION_MATCH');
    expect(res.risk_score).toBe(99);
    expect(res.ofac_screening.match).toBe(true);
  });

  it('N7. Clean whitelisted vendor carries a passed OFAC screening result', () => {
    const res = LedgerService.verifyCorporateLedger('9876543210', 'Apex Cloud Infrastructure Inc.', 45000);
    expect(res.status).toBe('VERIFIED_NORMAL');
    expect(res.ofac_screening.screened).toBe(true);
    expect(res.ofac_screening.match).toBe(false);
  });

  it('N12. Evidence trail is SHA-256 chained and tamper-evident (verifyAuditTrail)', () => {
    const tx = EscrowService.initializeTransaction({ vendor_name: 'Apex Cloud Infrastructure Inc.', amount_usd: 45000 });
    EscrowService.releaseEscrowTransfer('TOTP-123456', tx.tx_id);
    const audit = EscrowService.verifyAuditTrail(tx.tx_id);
    expect(audit.exists).toBe(true);
    expect(audit.intact).toBe(true);
    expect(audit.chain_head).toMatch(/^[a-f0-9]{64}$/);

    // Tamper simulation: modifying a historical entry must break the chain
    tx.evidence_trail[0].details = 'TAMPERED ENTRY';
    expect(EscrowService.verifyAuditTrail(tx.tx_id).intact).toBe(false);
  });
});

describe('Corporate Ledger & Treasury Escrow State Machine (SOX 404)', () => {
  it('1. Robust Currency Parsing: Handles formatted strings ($115,000, 115,000 USD, 115000)', () => {
    const resDollar = LedgerService.verifyCorporateLedger('482910492', 'Deloitte', '$115,000.00');
    expect(resDollar.amount_requested_usd).toBe(115000);

    const resSuffix = LedgerService.verifyCorporateLedger('482910492', 'Deloitte', '115,000 USD');
    expect(resSuffix.amount_requested_usd).toBe(115000);
  });

  it('2. SOX Liquidity Gate: Flags anomaly when amount exceeds typical vendor ceiling (DEVIATION_ALERT)', () => {
    // Adidharma typical max is $100,000 in mockLedger. $150,000 exceeds threshold by +50%
    const res = LedgerService.verifyCorporateLedger('5544332211', 'Adidharma', 150000);
    expect(res.anomaly_detected).toBe(true);
    expect(res.status).toBe('DEVIATION_ALERT');
    expect(res.amount_requested_usd).toBe(150000);
    expect(res.deviation_percent).toBe(50);
  });

  it('3. ERP Whitelist: Flags unregistered beneficiary account as high-risk fraud anomaly (UNREGISTERED_ANOMALY)', () => {
    // Deloitte with unverified account number 482910492 is NOT on ERP whitelist
    const res = LedgerService.verifyCorporateLedger('482910492', 'Deloitte', 115000);
    expect(res.anomaly_detected).toBe(true);
    expect(res.status).toBe('UNREGISTERED_ANOMALY');
    expect(res.risk_score).toBe(95);
  });

  it('4. Escrow State Machine: Enforces state transitions (PENDING -> FROZEN vs PENDING -> RELEASED)', () => {
    // Clean state
    const initTx = EscrowService.initializeTransaction({
      vendor_name: 'Deloitte Consulting LLP',
      amount_usd: '$115,000'
    });
    expect(initTx.status).toBe('PENDING_VERIFICATION');
    expect(initTx.amount_usd).toBe(115000);

    // Test Emergency Freeze
    const freezeRes = EscrowService.emergencyEscrowFreeze(initTx.tx_id, 'Failed security challenge', 'CRITICAL');
    expect(freezeRes.escrow_state).toBe('FROZEN');
    expect(EscrowService.getLatestTransaction().status).toBe('FROZEN');

    // Test Escrow Release
    const releaseRes = EscrowService.releaseEscrowTransfer('TOTP-829104', initTx.tx_id);
    expect(releaseRes.status).toBe('SUCCESS_RELEASED');
    expect(EscrowService.getLatestTransaction().status).toBe('RELEASED');
  });
});
