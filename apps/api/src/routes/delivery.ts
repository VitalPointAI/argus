import { Hono } from 'hono';
import { db, briefings } from '../db';
import { eq } from 'drizzle-orm';
import { formatBriefingForTelegram, markDelivered } from '../services/delivery/telegram';
import { formatBriefingForEmail, sendEmail } from '../services/delivery/email';

export const deliveryRoutes = new Hono();

// Get briefing formatted for Telegram
deliveryRoutes.get('/telegram/:briefingId', async (c) => {
  const briefingId = c.req.param('briefingId');

  const [briefing] = await db.select().from(briefings).where(eq(briefings.id, briefingId));

  if (!briefing) {
    return c.json({ success: false, error: 'Briefing not found' }, 404);
  }

  const formatted = formatBriefingForTelegram({
    summary: briefing.summary,
    changes: briefing.changes as any[],
    forecasts: briefing.forecasts as any[],
    type: briefing.type,
    generatedAt: briefing.generatedAt,
  });

  return c.json({
    success: true,
    data: {
      briefingId,
      format: 'telegram',
      message: formatted,
    },
  });
});

// Mark briefing as delivered via Telegram (webhook for OpenClaw)
deliveryRoutes.post('/telegram/:briefingId/delivered', async (c) => {
  const briefingId = c.req.param('briefingId');

  try {
    await markDelivered(briefingId, 'telegram');
    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get briefing formatted for email
deliveryRoutes.get('/email/:briefingId', async (c) => {
  const briefingId = c.req.param('briefingId');

  const [briefing] = await db.select().from(briefings).where(eq(briefings.id, briefingId));

  if (!briefing) {
    return c.json({ success: false, error: 'Briefing not found' }, 404);
  }

  const formatted = formatBriefingForEmail({
    summary: briefing.summary,
    changes: briefing.changes as any[],
    forecasts: briefing.forecasts as any[],
    type: briefing.type,
    generatedAt: briefing.generatedAt,
  });

  return c.json({
    success: true,
    data: {
      briefingId,
      format: 'email',
      subject: formatted.subject,
      html: formatted.html,
      text: formatted.text,
    },
  });
});

// Send briefing via email
deliveryRoutes.post('/email/:briefingId/send', async (c) => {
  const briefingId = c.req.param('briefingId');
  const body = await c.req.json().catch(() => ({}));
  const { to } = body;

  if (!to) {
    return c.json({ success: false, error: 'Email address required' }, 400);
  }

  const [briefing] = await db.select().from(briefings).where(eq(briefings.id, briefingId));

  if (!briefing) {
    return c.json({ success: false, error: 'Briefing not found' }, 404);
  }

  const formatted = formatBriefingForEmail({
    summary: briefing.summary,
    changes: briefing.changes as any[],
    forecasts: briefing.forecasts as any[],
    type: briefing.type,
    generatedAt: briefing.generatedAt,
  });

  const sent = await sendEmail({
    to,
    subject: formatted.subject,
    html: formatted.html,
    text: formatted.text,
  });

  if (sent) {
    await markDelivered(briefingId, 'email');
    return c.json({ success: true, data: { sent: true } });
  } else {
    return c.json({
      success: false,
      error: 'Failed to send email. Check RESEND_API_KEY.',
    }, 500);
  }
});

// Webhook for OpenClaw to fetch and deliver briefings
deliveryRoutes.get('/webhook/pending', async (c) => {
  const channel = c.req.query('channel') || 'telegram';

  // Get undelivered briefings
  const pending = await db
    .select()
    .from(briefings)
    .where(eq(briefings.deliveredAt, null as any))
    .limit(5);

  const formatted = pending.map(b => ({
    id: b.id,
    type: b.type,
    generatedAt: b.generatedAt,
    message: channel === 'telegram' 
      ? formatBriefingForTelegram({
          summary: b.summary,
          changes: b.changes as any[],
          forecasts: b.forecasts as any[],
          type: b.type,
          generatedAt: b.generatedAt,
        })
      : formatBriefingForEmail({
          summary: b.summary,
          changes: b.changes as any[],
          forecasts: b.forecasts as any[],
          type: b.type,
          generatedAt: b.generatedAt,
        }),
  }));

  return c.json({ success: true, data: formatted });
});
