export class NotificationService {
  static async triggerOutOfBandVerification(executiveName = 'Robert Sterling', transferSummary = '', riskLevel = 'HIGH') {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    const timestamp = new Date().toLocaleTimeString('en-US');

    const alertPayload = {
      executive_target: executiveName,
      alert_title: `🚨 [SECURITY ALERT] SentinelVoice Intercepted Suspicious Wire Instruction`,
      severity: riskLevel,
      timestamp,
      summary: transferSummary || "High-stakes unauthorized wire transfer request detected.",
      channel: "#ceo-emergency-security",
      suggested_action: "Contact Corporate Treasury immediately or tap 'CONFIRM ATTACK / REJECT'."
    };

    console.log("[NotificationService] Out-of-band alert payload generated:", JSON.stringify(alertPayload, null, 2));

    if (webhookUrl && webhookUrl.startsWith('http')) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 *SentinelVoice Alert*: Caller claiming to be *${executiveName}* detected!\n*Details:* ${transferSummary}\n*Severity:* ${riskLevel}\n*Time:* ${timestamp}`
          })
        });
        console.log("[NotificationService] Webhook dispatched to Slack. Status:", res.status);
      } catch (err) {
        console.error("[NotificationService] Failed to dispatch Slack webhook:", err.message);
      }
    } else {
      console.log("[NotificationService] No live SLACK_WEBHOOK_URL configured. Running in verified simulated mode.");
    }

    return {
      status: "DISPATCHED",
      channel: alertPayload.channel,
      executive: executiveName,
      dispatched_at: timestamp,
      details: alertPayload.summary
    };
  }
}
