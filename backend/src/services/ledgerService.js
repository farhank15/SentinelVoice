import mockLedger from '../data/mockLedger.json' with { type: 'json' };

export class LedgerService {
  static verifyCorporateLedger(accountNumber, vendorName = '', amount = 0) {
    const cleanAccount = String(accountNumber || '').replace(/\D/g, '');
    const numAmount = Number(amount) || 0;

    const matchedVendor = mockLedger.known_vendors.find(
      (v) => v.account_number === cleanAccount || (vendorName && v.vendor_name.toLowerCase().includes(vendorName.toLowerCase()))
    );

    if (!matchedVendor) {
      return {
        status: "UNREGISTERED_ANOMALY",
        is_whitelisted: false,
        account_number: accountNumber,
        vendor_name: vendorName || "Unknown / Unverified Beneficiary",
        amount_requested_usd: numAmount,
        anomaly_detected: true,
        risk_score: 95,
        reason: "Beneficiary bank account and vendor are NOT listed on the corporate ERP whitelist (High-probability fraud mule account).",
        recommendation: "MANDATORY: Issue Zero-Knowledge Security Challenge immediately and place transaction in Escrow Hold."
      };
    }

    // Check if amount exceeds typical range
    const maxTypical = matchedVendor.typical_range_usd[1];
    const isAmountAnomalous = numAmount > maxTypical;
    const deviationPercent = isAmountAnomalous
      ? Math.round(((numAmount - maxTypical) / maxTypical) * 100)
      : 0;

    if (isAmountAnomalous) {
      return {
        status: "DEVIATION_ALERT",
        is_whitelisted: true,
        account_number: matchedVendor.account_number,
        vendor_name: matchedVendor.vendor_name,
        amount_requested_usd: numAmount,
        typical_max_usd: maxTypical,
        deviation_percent: deviationPercent,
        anomaly_detected: true,
        risk_score: 65,
        reason: `Beneficiary is recognized (${matchedVendor.vendor_name}), but requested amount of $${numAmount.toLocaleString()} exceeds normal historical threshold (+${deviationPercent}% above typical cap).`,
        recommendation: "Require executive secondary challenge authorization before release."
      };
    }

    return {
      status: "VERIFIED_NORMAL",
      is_whitelisted: true,
      account_number: matchedVendor.account_number,
      vendor_name: matchedVendor.vendor_name,
      amount_requested_usd: numAmount,
      anomaly_detected: false,
      risk_score: 10,
      reason: "Beneficiary account and transfer amount comply with historical procurement patterns.",
      recommendation: "Eligible for standard automated clearing."
    };
  }
}
