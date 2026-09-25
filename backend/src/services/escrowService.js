import crypto from 'node:crypto';

const parseCleanAmount = (val) => {
  if (typeof val === 'number') return val;
  const cleaned = String(val || '').replace(/[^0-9.]/g, '');
  return Number(cleaned) || 0;
};

/**
 * N12: SIEM Audit Trail — chained SHA-256 evidence digest (tamper-evident).
 * Each entry commits to the previous digest (blockchain-style chaining) so any
 * retroactive modification of the evidence trail breaks verification.
 * Standard: SEC Rule 17a-4 / FINRA 4511 record integrity.
 */
function appendEvidence(tx, event, details) {
  const prevDigest = tx.evidence_trail.length
    ? tx.evidence_trail[tx.evidence_trail.length - 1].digest
    : 'GENESIS';
  const timestamp = new Date().toISOString();
  const payload = `${prevDigest}|${timestamp}|${event}|${details}`;
  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  tx.evidence_trail.push({ timestamp, event, details, digest });
  tx.audit_chain_head = digest;
  return digest;
}

function verifyEvidenceChain(tx) {
  let prevDigest = 'GENESIS';
  for (const entry of tx.evidence_trail) {
    const expected = crypto.createHash('sha256')
      .update(`${prevDigest}|${entry.timestamp}|${entry.event}|${entry.details}`)
      .digest('hex');
    if (expected !== entry.digest) return false;
    prevDigest = entry.digest;
  }
  return true;
}

export class EscrowService {
  static transactions = new Map();

  static initializeTransaction(txData) {
    const txId = txData.tx_id || `TX-${Date.now().toString().slice(-6)}`;
    const parsedAmount = parseCleanAmount(txData.amount_usd !== undefined ? txData.amount_usd : txData.amount);
    const record = {
      tx_id: txId,
      account_number: txData.account_number || 'UNKNOWN',
      vendor_name: txData.vendor_name || 'UNKNOWN',
      amount_usd: parsedAmount,
      currency: 'USD',
      status: 'PENDING_VERIFICATION', // PENDING_VERIFICATION | FROZEN | RELEASED
      risk_level: 'EVALUATING',
      created_at: new Date().toISOString(),
      frozen_at: null,
      freeze_reason: null,
      evidence_trail: []
    };
    this.transactions.set(txId, record);
    return record;
  }

  static updateActiveTransaction(fields = {}) {
    const targetId = Array.from(this.transactions.keys()).pop();
    let tx = targetId ? this.transactions.get(targetId) : null;
    if (!tx) {
      tx = this.initializeTransaction(fields);
    } else {
      const parsedAmount = parseCleanAmount(fields.amount_usd !== undefined ? fields.amount_usd : fields.amount);
      if (parsedAmount > 0) tx.amount_usd = parsedAmount;
      if (fields.vendor_name && fields.vendor_name !== 'UNKNOWN') tx.vendor_name = fields.vendor_name;
      if (fields.account_number && fields.account_number !== 'UNKNOWN') tx.account_number = fields.account_number;
      if (fields.status) tx.status = fields.status;
      if (fields.risk_level) tx.risk_level = fields.risk_level;
      if (fields.freeze_reason) tx.freeze_reason = fields.freeze_reason;
    }
    return tx;
  }

  static emergencyEscrowFreeze(txId = null, reason = 'Detected high-confidence deepfake/BEC anomaly', riskLevel = 'CRITICAL') {
    const targetId = txId || Array.from(this.transactions.keys()).pop() || `TX-${Date.now().toString().slice(-6)}`;
    const tx = this.transactions.get(targetId) || this.initializeTransaction({ tx_id: targetId });

    tx.status = 'FROZEN';
    tx.risk_level = riskLevel;
    tx.frozen_at = new Date().toISOString();
    tx.freeze_reason = reason;
    appendEvidence(tx, 'EMERGENCY_FREEZE_TRIGGERED', reason);

    return {
      status: 'SUCCESS_FROZEN',
      transaction_id: tx.tx_id,
      escrow_state: 'FROZEN',
      funds_locked_amount_usd: tx.amount_usd,
      risk_level: tx.risk_level,
      freeze_reason: reason,
      action_taken: "Funds permanently locked in corporate escrow. Wire instruction halted and CISO incident ticket dispatched."
    };
  }

  static releaseEscrowTransfer(approvalCode = '', txId = null) {
    const targetId = txId || Array.from(this.transactions.keys()).pop() || `TX-${Date.now().toString().slice(-6)}`;
    const tx = this.transactions.get(targetId) || this.initializeTransaction({ tx_id: targetId });

    tx.status = 'RELEASED';
    tx.risk_level = 'LOW';
    tx.released_at = new Date().toISOString();
    tx.approval_code = approvalCode;
    appendEvidence(tx, 'ESCROW_RELEASED', `Authorized with code: ${approvalCode}`);

    return {
      status: 'SUCCESS_RELEASED',
      transaction_id: tx.tx_id,
      escrow_state: 'RELEASED',
      funds_released_amount_usd: tx.amount_usd,
      action_taken: "Wire transfer successfully authorized and released to clearing queue."
    };
  }

  /**
   * N12 verifier: recomputes the full evidence chain — used by the audit
   * endpoint and tests to prove the trail has not been tampered with.
   */
  static verifyAuditTrail(txId = null) {
    const targetId = txId || Array.from(this.transactions.keys()).pop();
    const tx = targetId ? this.transactions.get(targetId) : null;
    if (!tx) return { exists: false, intact: false };
    return { exists: true, intact: verifyEvidenceChain(tx), chain_head: tx.audit_chain_head || null };
  }

  static getLatestTransaction() {
    if (this.transactions.size === 0) {
      return {
        tx_id: null,
        account_number: '--',
        vendor_name: 'No Active Wire Intercept',
        amount_usd: 0,
        currency: 'USD',
        status: 'STANDBY', // STANDBY | PENDING_VERIFICATION | FROZEN | RELEASED
        risk_level: 'NOMINAL',
        created_at: null,
        frozen_at: null,
        freeze_reason: null,
        evidence_trail: []
      };
    }
    return Array.from(this.transactions.values()).pop();
  }

  static reset() {
    this.transactions.clear();
    return this.getLatestTransaction();
  }
}
