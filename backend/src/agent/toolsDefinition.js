export const sentinelTools = [
  {
    type: "function",
    name: "verify_corporate_ledger",
    description: "Verifies whether the beneficiary bank account and vendor name are on the corporate ERP whitelist, and checks for wire amount anomalies.",
    parameters: {
      type: "object",
      properties: {
        account_number: {
          type: "string",
          description: "The beneficiary bank account number stated by the caller"
        },
        vendor_name: {
          type: "string",
          description: "The name of the vendor, corporation, or individual beneficiary"
        },
        amount: {
          type: "number",
          description: "The wire transfer amount requested in USD"
        }
      },
      required: ["account_number", "amount"]
    }
  },
  {
    type: "function",
    name: "issue_security_challenge",
    description: "Retrieves a confidential zero-knowledge security challenge known exclusively to the genuine executive to verbally interrogate the caller.",
    parameters: {
      type: "object",
      properties: {
        executive_name: {
          type: "string",
          description: "The name of the executive claimed by the caller (e.g., 'Robert Sterling', 'Elena Rostova')"
        }
      },
      required: ["executive_name"]
    }
  },
  {
    type: "function",
    name: "trigger_out_of_band_verification",
    description: "Dispatches an emergency out-of-band push notification to the genuine executive's private secure channel (Slack/SMS) when an impersonation attempt is detected.",
    parameters: {
      type: "object",
      properties: {
        executive_name: {
          type: "string",
          description: "The name of the executive being impersonated"
        },
        transfer_summary: {
          type: "string",
          description: "Summary of the fraudulent wire attempt including dollar amount and target account"
        }
      },
      required: ["executive_name", "transfer_summary"]
    }
  },
  {
    type: "function",
    name: "emergency_escrow_freeze",
    description: "INSTANTLY LOCKS wire funds in corporate escrow and issues a high-priority CISO incident alert if the caller fails security challenge or displays coercive intimidation.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Specific reason for the freeze (e.g., 'Failed zero-knowledge security challenge', 'Coercive urgency and authority framing')"
        },
        risk_level: {
          type: "string",
          enum: ["HIGH", "CRITICAL"],
          description: "The severity level of the incident"
        }
      },
      required: ["reason", "risk_level"]
    }
  },
  {
    type: "function",
    name: "release_escrow_transfer",
    description: "Authorizes and releases wire transfer from escrow to the banking queue once all corporate compliance checks and zero-knowledge challenges are verified.",
    parameters: {
      type: "object",
      properties: {
        approval_code: {
          type: "string",
          description: "The valid cryptographic authorization code from the legitimate executive"
        }
      },
      required: ["approval_code"]
    }
  }
];
