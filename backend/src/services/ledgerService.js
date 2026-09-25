import mockLedger from '../data/mockLedger.json' with { type: 'json' };

// N7: AML/OFAC sanctions screening registry (FinCEN-mandated check).
// In production this queries the live OFAC SDN list; for the benchmark it is a
// deterministic registry so the screening result is reproducible.
const OFAC_RESTRICTED = new Set([
  '7755332211', // sanctioned-jurisdiction shell (benchmark: Tehran-routed beneficiary)
  '9900112233', // OFAC SDN matched entity (benchmark: shadow fleet shell)
  '8877665544'  // high-risk jurisdiction correspondent (benchmark: opaque shell chain)
]);
const HIGH_RISK_JURISDICTIONS = new Set(['IR', 'RU', 'KP', 'SY']);

export class LedgerService {
  /**
   * N7: AML/OFAC Screening — deterministic sanctions & high-risk-jurisdiction gate.
   * Returns { screened, match, jurisdiction, reason } and is surfaced in every
   * verify_corporate_ledger result so the agent's ERP verdict carries the
   * compliance check mandated by FinCEN/OFAC.
   */
  static screenOfac(accountNumber, destinationCountry = null) {
    const clean = String(accountNumber || '').replace(/\D/g, '');
    if (OFAC_RESTRICTED.has(clean)) {
      return {
        screened: true,
        match: true,
        jurisdiction: destinationCountry || 'RESTRICTED',
        reason: 'Beneficiary account matches an OFAC SDN / restricted-jurisdiction registry entry. Wire processing prohibited (31 CFR Chapter V).'
      };
    }
    if (destinationCountry && HIGH_RISK_JURISDICTIONS.has(String(destinationCountry).toUpperCase())) {
      return {
        screened: true,
        match: true,
        jurisdiction: destinationCountry.toUpperCase(),
        reason: `Destination jurisdiction (${destinationCountry.toUpperCase()}) is on the FinCEN high-risk list. Enhanced due diligence required before release.`
      };
    }
    return { screened: true, match: false, jurisdiction: destinationCountry || 'N/A', reason: 'No OFAC SDN or restricted-jurisdiction match.' };
  }

  static verifyCorporateLedger(accountNumber, vendorName = '', amount = 0) {
    const cleanAccount = String(accountNumber || '').replace(/\D/g, '');
    const numAmount = typeof amount === 'number'
      ? amount
      : (Number(String(amount || '').replace(/[^0-9.]/g, '')) || 0);

    // N7 runs unconditionally on every ledger check (compliance-by-default)
    const ofac = LedgerService.screenOfac(cleanAccount);

    const matchedVendor = mockLedger.known_vendors.find(
      (v) => v.account_number === cleanAccount || (vendorName && v.vendor_name.toLowerCase().includes(vendorName.toLowerCase()))
    );

    if (!matchedVendor) {
      if (ofac.match) {
        return {
          status: "OFAC_SANCTION_MATCH",
          is_whitelisted: false,
          account_number: accountNumber,
          vendor_name: vendorName || "Unknown / Unverified Beneficiary",
          amount_requested_usd: numAmount,
          anomaly_detected: true,
          risk_score: 99,
          ofac_screening: ofac,
          reason: ofac.reason,
          recommendation: "MANDATORY: Freeze immediately and file SAR (Suspicious Activity Report). No challenge or release path is permitted."
        };
      }
      return {
        status: "UNREGISTERED_ANOMALY",
        is_whitelisted: false,
        account_number: accountNumber,
        vendor_name: vendorName || "Unknown / Unverified Beneficiary",
        amount_requested_usd: numAmount,
        anomaly_detected: true,
        risk_score: 95,
        ofac_screening: ofac,
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
        ofac_screening: ofac,
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
      ofac_screening: ofac,
      reason: "Beneficiary account and transfer amount comply with historical procurement patterns.",
      recommendation: "Eligible for standard automated clearing."
    };
  }
}
