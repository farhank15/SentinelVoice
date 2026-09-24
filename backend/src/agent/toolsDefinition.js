export const sentinelTools = [
  {
    type: "function",
    name: "verify_corporate_ledger",
    description: "Verify whether the beneficiary bank account and vendor name are on the corporate ERP whitelist and check the wire amount for anomalies. Call this tool the moment the caller mentions any bank account, vendor, or dollar amount — even if details are partial. Do not answer from memory; always call.",
    execution_mode: "interactive",
    timeout_seconds: 15,
    parameters: {
      type: "object",
      properties: {
        account_number: {
          type: "string",
          description: "The beneficiary bank account number as produced from the caller's speech. May contain spaces between digit groups when spoken digit-by-digit; pass it exactly as recognized.",
          pattern: "[0-9 ]{4,24}",
          examples: ["9821442277", "9821 4422 77", "4455667788"]
        },
        vendor_name: {
          type: "string",
          description: "The beneficiary name spoken by the caller (company or individual).",
          examples: ["Deloitte", "Apex Cloud Services", "PwC Frankfurt"]
        },
        amount: {
          type: "string",
          description: "The wire amount in USD exactly as recognized from speech — digits only, no currency symbol, no commas.",
          pattern: "[0-9]+(\\.[0-9]{2})?",
          examples: ["500000", "45000", "11900.50"]
        }
      },
      required: ["account_number", "amount"]
    }
  },
  {
    type: "function",
    name: "issue_security_challenge",
    description: "Retrieve the confidential zero-knowledge security challenge to verbally interrogate the caller. Call this after verify_corporate_ledger returns UNREGISTERED_ANOMALY, or whenever the amount exceeds the $50,000 SOX dual-control threshold, or when the caller's identity is unconfirmed.",
    execution_mode: "interactive",
    timeout_seconds: 10,
    parameters: {
      type: "object",
      properties: {
        executive_name: {
          type: "string",
          description: "The name of the executive the caller claims to be.",
          examples: ["Robert Sterling", "Elena Rostova"]
        }
      },
      required: ["executive_name"]
    }
  },
  {
    type: "function",
    name: "trigger_out_of_band_verification",
    description: "Dispatch an emergency out-of-band push notification to the genuine executive's private secure channel when an impersonation attempt is detected. Call this AFTER the caller fails or refuses validate_security_challenge — one tool per turn.",
    execution_mode: "interactive",
    timeout_seconds: 15,
    parameters: {
      type: "object",
      properties: {
        executive_name: {
          type: "string",
          description: "The name of the executive being impersonated.",
          examples: ["Robert Sterling", "Elena Rostova"]
        },
        transfer_summary: {
          type: "string",
          description: "One-line summary of the fraudulent wire attempt, e.g. amount and target account.",
          examples: ["$500,000 wire to Deloitte account 9821"]
        }
      },
      required: ["executive_name", "transfer_summary"]
    }
  },
  {
    type: "function",
    name: "emergency_escrow_freeze",
    description: "Instantly lock wire funds in corporate escrow and issue a CISO incident alert. Call this AFTER trigger_out_of_band_verification when the caller fails the security challenge, or immediately upon hostile coercive intimidation.",
    execution_mode: "interactive",
    timeout_seconds: 10,
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Specific reason for the freeze.",
          examples: ["Failed zero-knowledge security challenge", "Coercive urgency and authority framing"]
        },
        risk_level: {
          type: "string",
          enum: ["HIGH", "CRITICAL"],
          description: "The severity level of the incident."
        }
      },
      required: ["reason", "risk_level"]
    }
  },
  {
    type: "function",
    name: "validate_security_challenge",
    description: "Evaluate the caller's spoken answer (6-digit rolling hardware token, PIN, project codename, or audit firm) against the executive's zero-knowledge security credentials. Call this the moment the caller states an answer — never stall or claim you are waiting for a system comparison.",
    execution_mode: "interactive",
    timeout_seconds: 10,
    parameters: {
      type: "object",
      properties: {
        executive_name: {
          type: "string",
          description: "The name of the executive the caller claims to be.",
          examples: ["Robert Sterling", "Elena Rostova"]
        },
        answer: {
          type: "string",
          description: "The caller's spoken answer exactly as recognized, including spaced digits.",
          pattern: "[0-9A-Za-z ]+",
          examples: ["4422", "7782", "project olympus", "4 4 2 2"]
        }
      },
      required: ["executive_name", "answer"]
    }
  },
  {
    type: "function",
    name: "release_escrow_transfer",
    description: "Authorize and release the wire transfer from corporate escrow to the settlement queue. MANDATORY before ever stating a wire is released or processed. Call whenever approving a whitelisted invoice or a passed security challenge.",
    execution_mode: "interactive",
    timeout_seconds: 10,
    parameters: {
      type: "object",
      properties: {
        approval_code: {
          type: "string",
          description: "The verified approval code, purchase order number, hardware PIN, or routine preapproval tag.",
          examples: ["7782", "PO-2026-0491", "ROUTINE-PREAPPROVED"]
        }
      },
      required: ["approval_code"]
    }
  }
];
