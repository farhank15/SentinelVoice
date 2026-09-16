export class EscrowService {
  static transactions = new Map();

  static initializeTransaction(txData) {
    const txId = txData.tx_id || `TX-${Date.now().toString().slice(-6)}`;
    const record = {
      tx_id: txId,
      account_number: txData.account_number || 'UNKNOWN',
      vendor_name: txData.vendor_name || 'UNKNOWN',
      amount_usd: Number(txData.amount_usd || txData.amount) || 0,
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

  static emergencyEscrowFreeze(txId = null, reason = 'Detected high-confidence deepfake/BEC anomaly', riskLevel = 'CRITICAL') {
    const targetId = txId || Array.from(this.transactions.keys()).pop() || `TX-${Date.now().toString().slice(-6)}`;
    const tx = this.transactions.get(targetId) || this.initializeTransaction({ tx_id: targetId });

    tx.status = 'FROZEN';
    tx.risk_level = riskLevel;
    tx.frozen_at = new Date().toISOString();
    tx.freeze_reason = reason;
    tx.evidence_trail.push({
      timestamp: new Date().toLocaleTimeString('en-US'),
      event: 'EMERGENCY_FREEZE_TRIGGERED',
      details: reason
    });

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
    tx.evidence_trail.push({
      timestamp: new Date().toLocaleTimeString('en-US'),
      event: 'ESCROW_RELEASED',
      details: `Authorized with code: ${approvalCode}`
    });

    return {
      status: 'SUCCESS_RELEASED',
      transaction_id: tx.tx_id,
      escrow_state: 'RELEASED',
      funds_released_amount_usd: tx.amount_usd,
      action_taken: "Wire transfer successfully authorized and released to clearing queue."
    };
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
