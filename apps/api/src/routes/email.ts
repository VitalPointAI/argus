import { Hono } from 'hono';
import { sendEmail, sendTestEmail, sendBriefingEmail } from '../services/email/ses';
import { db } from '../db';
import { briefings, users } from '../db/schema';
import { eq } from 'drizzle-orm';

export const emailRoutes = new Hono();

// Send a test email
emailRoutes.post('/test', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { to } = body;

  if (!to) {
    return c.json({ success: false, error: 'Recipient email required' }, 400);
  }

  const result = await sendTestEmail(to);
  return c.json(result, result.success ? 200 : 500);
});

// Send a custom email
emailRoutes.post('/send', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { to, subject, html, text } = body;

  if (!to || !subject || (!html && !text)) {
    return c.json({ 
      success: false, 
      error: 'Required: to, subject, and either html or text' 
    }, 400);
  }

  const result = await sendEmail({ to, subject, html, text });
  return c.json(result, result.success ? 200 : 500);
});

// Send a briefing by ID to specified email(s)
emailRoutes.post('/briefing/:briefingId', async (c) => {
  const briefingId = c.req.param('briefingId');
  const body = await c.req.json().catch(() => ({}));
  const { to } = body;

  if (!to) {
    return c.json({ success: false, error: 'Recipient email required' }, 400);
  }

  try {
    // Get the briefing
    const [briefing] = await db.select().from(briefings).where(eq(briefings.id, briefingId));
    
    if (!briefing) {
      return c.json({ success: false, error: 'Briefing not found' }, 404);
    }

    const result = await sendBriefingEmail({
      to,
      briefingTitle: briefing.title,
      briefingContent: briefing.content,
      domain: briefing.domain || undefined,
      generatedAt: briefing.createdAt,
    });

    return c.json(result, result.success ? 200 : 500);
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

// Get email configuration status
emailRoutes.get('/status', async (c) => {
  const configured = !!(
    process.env.AWS_ACCESS_KEY_ID && 
    process.env.AWS_SECRET_ACCESS_KEY
  );

  return c.json({
    success: true,
    data: {
      configured,
      region: process.env.AWS_REGION || 'ca-central-1',
      fromEmail: process.env.SES_FROM_EMAIL || 'argus@vitalpoint.ai',
    }
  });
});
