/**
 * AWS SES Email Service for Argus
 * 
 * Sends briefings and notifications via Amazon SES.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'ca-central-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  } : undefined,
});

const DEFAULT_FROM = process.env.SES_FROM_EMAIL || 'argus@vitalpoint.ai';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, subject, html, text, from = DEFAULT_FROM, replyTo } = options;
  
  const toAddresses = Array.isArray(to) ? to : [to];
  
  try {
    const command = new SendEmailCommand({
      Source: from,
      Destination: {
        ToAddresses: toAddresses,
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          ...(html && {
            Html: {
              Data: html,
              Charset: 'UTF-8',
            },
          }),
          ...(text && {
            Text: {
              Data: text,
              Charset: 'UTF-8',
            },
          }),
        },
      },
      ...(replyTo && {
        ReplyToAddresses: [replyTo],
      }),
    });

    const response = await sesClient.send(command);
    
    return {
      success: true,
      messageId: response.MessageId,
    };
  } catch (error) {
    console.error('SES send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send a briefing email with formatted content
 */
export async function sendBriefingEmail(options: {
  to: string | string[];
  briefingTitle: string;
  briefingContent: string;
  domain?: string;
  generatedAt: Date;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, briefingTitle, briefingContent, domain, generatedAt } = options;
  
  const subject = `🦚 Argus Briefing: ${briefingTitle}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 680px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 2px solid #0d9488;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #0d9488;
    }
    .domain-tag {
      display: inline-block;
      background: #0d9488;
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      text-transform: uppercase;
      margin-left: 12px;
    }
    h1 {
      color: #1a1a1a;
      font-size: 22px;
      margin: 0 0 8px 0;
    }
    .timestamp {
      color: #666;
      font-size: 14px;
    }
    .content {
      white-space: pre-wrap;
      font-size: 15px;
    }
    .content h2, .content h3 {
      color: #0d9488;
      margin-top: 24px;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      color: #666;
      font-size: 13px;
      text-align: center;
    }
    .footer a {
      color: #0d9488;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="logo">🦚 Argus</span>
      ${domain ? `<span class="domain-tag">${domain}</span>` : ''}
    </div>
    
    <h1>${briefingTitle}</h1>
    <p class="timestamp">Generated ${generatedAt.toLocaleString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    })}</p>
    
    <div class="content">
${briefingContent}
    </div>
    
    <div class="footer">
      <p>
        <a href="https://argus.vitalpoint.ai">View on Argus</a> · 
        <a href="https://docs.argus.vitalpoint.ai">Documentation</a>
      </p>
      <p>Strategic Intelligence Platform by VitalPoint AI</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  // Plain text version
  const text = `
🦚 ARGUS BRIEFING${domain ? ` [${domain.toUpperCase()}]` : ''}

${briefingTitle}
Generated: ${generatedAt.toISOString()}

${briefingContent}

---
View on Argus: https://argus.vitalpoint.ai
Documentation: https://docs.argus.vitalpoint.ai
  `.trim();
  
  return sendEmail({ to, subject, html, text });
}

/**
 * Send a test email to verify SES configuration
 */
export async function sendTestEmail(to: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return sendEmail({
    to,
    subject: '🦚 Argus Email Test',
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h1 style="color: #0d9488;">✅ Email delivery is working!</h1>
        <p>Your Argus instance is correctly configured to send emails via AWS SES.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      </div>
    `,
    text: 'Argus email test successful! Sent at: ' + new Date().toISOString(),
  });
}
