import { LedgerService } from './ledgerService.js';
import { ChallengeService } from './challengeService.js';
import { EscrowService } from './escrowService.js';
import { NotificationService } from './notificationService.js';

/**
 * Shared tool dispatcher — the SINGLE source of truth for executing the six
 * SentinelVoice tools. Both execution paths use it:
 *   1. Legacy relay mode: AssemblyVoiceAgentSession.executeTool() (WebSocket tool.call)
 *   2. Stored-agent mode: /api/tools/* REST endpoints (AssemblyAI HTTP tools)
 * This guarantees ledger/escrow/challenge state stays consistent no matter
 * which path a call comes through.
 */
export class ToolDispatcher {
  static execute(name, args = {}) {
    // Normalize common LLM/spoken-form quirks before dispatch (AAI docs:
    // "most 'tool never fires' failures trace back to argument shape mismatches")
    if (typeof args.amount === 'string') {
      const cleaned = args.amount.replace(/[^0-9.]/g, '');
      if (cleaned) args.amount = Number(cleaned);
    }
    if (typeof args.account_number === 'string') {
      // Spoken digit sequences arrive spaced: "9988 7766 65" -> "9988776665"
      args.account_number = args.account_number.replace(/\s+/g, '');
    }
    if (typeof args.answer === 'string' && /^[0-9 ]+$/.test(args.answer.trim())) {
      args.answer = args.answer.replace(/\s+/g, '');
    }

    switch (name) {
      case 'verify_corporate_ledger':
        EscrowService.updateActiveTransaction({
          amount_usd: args.amount,
          vendor_name: args.vendor_name || 'Unregistered Beneficiary',
          account_number: args.account_number
        });
        return LedgerService.verifyCorporateLedger(args.account_number, args.vendor_name, args.amount);

      case 'issue_security_challenge':
        return ChallengeService.issueSecurityChallenge(args.executive_name);

      case 'validate_security_challenge':
        return ChallengeService.validateAnswer(args.executive_name, args.answer);

      case 'trigger_out_of_band_verification':
        return NotificationService.triggerOutOfBandVerification(args.executive_name, args.transfer_summary);

      case 'emergency_escrow_freeze':
        return EscrowService.emergencyEscrowFreeze(null, args.reason, args.risk_level);

      case 'release_escrow_transfer':
        return EscrowService.releaseEscrowTransfer(args.approval_code);

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  /**
   * Broadcast a tool execution to UI subscribers (thinking stream, tool cards,
   * escrow panel). Called by the REST tool endpoints in stored-agent mode —
   * the legacy relay calls sendToBrowser() directly instead.
   */
  static broadcast(browserHub, toolName, args, result) {
    if (!browserHub) return;
    const dagNode = {
      verify_corporate_ledger: 'n6',
      issue_security_challenge: 'n9',
      validate_security_challenge: 'n9',
      trigger_out_of_band_verification: 'n10',
      emergency_escrow_freeze: 'n11',
      release_escrow_transfer: 'n11'
    }[toolName] || 'n6';

    const stamp = new Date().toLocaleTimeString('en-US');
    browserHub.publish({
      type: 'tool_call_start',
      toolName,
      args,
      callId: `rest_${Date.now()}`,
      timestamp: stamp
    });
    browserHub.publish({
      type: 'tool_call_end',
      toolName,
      result,
      callId: `rest_${Date.now()}`,
      timestamp: stamp
    });
    browserHub.publish({
      type: 'thinking_stream',
      dag_node: dagNode,
      thinking: `Executing ${toolName} via stored-agent HTTP tool endpoint.`,
      engine: 'Sentinel Forensic Core'
    });
    browserHub.publish({
      type: 'escrow_update',
      transaction: EscrowService.getLatestTransaction()
    });
  }
}
