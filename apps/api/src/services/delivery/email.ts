/**
 * Email Delivery Service
 * 
 * Uses Resend API for email delivery.
 * Requires RESEND_API_KEY environment variable.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'briefings@argus.vitalpoint.ai';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Format a briefing for email
 */
export function formatBriefingForEmail(briefing: {
  summary: string;
  changes: any[];
  forecasts: any[];
  type: string;
  generatedAt: Date;
}): { html: string; text: string; subject: string } {
  const typeLabel = briefing.type.charAt(0).toUpperCase() + briefing.type.slice(1);
  const date = briefing.generatedAt.toISOString().split('T')[0];
  
  const subject = `Argus ${typeLabel} Briefing - ${date}`;

  // HTML version
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
    h2 { color: #0066cc; margin-top: 30px; }
    .summary { background: #f8f9fa; padding: 15px; border-radius: 8px; }
    .change { padding: 8px 0; border-bottom: 1px solid #eee; }
    .change.high { border-left: 3px solid #dc3545; padding-left: 10px; }
    .change.medium { border-left: 3px solid #ffc107; padding-left: 10px; }
    .change.low { border-left: 3px solid #28a745; padding-left: 10px; }
    .forecast { padding: 8px 0; }
    .probability { color: #0066cc; font-weight: bold; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>🦚 Argus ${typeLabel} Briefing</h1>
  <p style="color: #666;">${date}</p>
  
  <div class="summary">
    ${briefing.summary.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
  </div>
  
  ${briefing.changes.length > 0 ? `
  <h2>🔄 Significant Changes</h2>
  ${briefing.changes.slice(0, 5).map(c => `
    <div class="change ${c.significance}">
      ${c.description}
    </div>
  `).join('')}
  ` : ''}
  
  ${briefing.forecasts.length > 0 ? `
  <h2>🔮 Forecasts</h2>
  ${briefing.forecasts.slice(0, 3).map(f => `
    <div class="forecast">
      ${f.event} <span class="probability">(${f.probability}% probability)</span>
    </div>
  `).join('')}
  ` : ''}
  
  <div class="footer">
    <p>Powered by <a href="https://argus.vitalpoint.ai">Argus</a></p>
    <p>Strategic Intelligence Platform</p>
  </div>
</body>
</html>
  `.trim();

  // Plain text version
  const text = `
ARGUS ${typeLabel.toUpperCase()} BRIEFING
${date}

${briefing.summary.replace(/\*\*/g, '')}

${briefing.changes.length > 0 ? `
SIGNIFICANT CHANGES
${briefing.changes.slice(0, 5).map(c => `• ${c.description}`).join('\n')}
` : ''}

${briefing.forecasts.length > 0 ? `
FORECASTS
${briefing.forecasts.slice(0, 3).map(f => `• ${f.event} (${f.probability}% probability)`).join('\n')}
` : ''}

---
Powered by Argus
https://argus.vitalpoint.ai
  `.trim();

  return { html, text, subject };
}

/**
 * Send email via Resend API
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, email not sent');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to send email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}
