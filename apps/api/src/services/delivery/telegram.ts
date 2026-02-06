/**
 * Telegram Delivery Service
 * 
 * In production, this would integrate with a Telegram bot API.
 * For now, we format the briefing for Telegram and provide
 * a webhook endpoint that OpenClaw can call to deliver briefings.
 */

import { db, briefings, users } from '../../db';
import { eq } from 'drizzle-orm';

export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode: 'Markdown' | 'HTML';
}

/**
 * Format a briefing for Telegram
 */
export function formatBriefingForTelegram(briefing: {
  summary: string;
  changes: any[];
  forecasts: any[];
  type: string;
  generatedAt: Date;
}): string {
  const emoji = {
    morning: '🌅',
    evening: '🌙',
    alert: '🚨',
  }[briefing.type] || '📊';

  const parts: string[] = [];

  // Header
  parts.push(`${emoji} *ARGUS ${briefing.type.toUpperCase()} BRIEFING*`);
  parts.push(`_${briefing.generatedAt.toISOString().split('T')[0]}_`);
  parts.push('');

  // Summary - convert markdown to Telegram markdown
  const summary = briefing.summary
    .replace(/\*\*([^*]+)\*\*/g, '*$1*') // Bold
    .replace(/^• /gm, '• '); // Bullets are fine

  parts.push(summary);

  // Changes
  if (briefing.changes.length > 0) {
    parts.push('');
    parts.push('*🔄 SIGNIFICANT CHANGES*');
    for (const change of briefing.changes.slice(0, 5)) {
      const icon = change.significance === 'high' ? '🔴' : 
                   change.significance === 'medium' ? '🟡' : '🟢';
      parts.push(`${icon} ${change.description}`);
    }
  }

  // Forecasts
  if (briefing.forecasts.length > 0) {
    parts.push('');
    parts.push('*🔮 FORECASTS*');
    for (const forecast of briefing.forecasts.slice(0, 3)) {
      parts.push(`• ${forecast.event} (${forecast.probability}% probability)`);
    }
  }

  // Footer
  parts.push('');
  parts.push('_Powered by Argus_');

  return parts.join('\n');
}

/**
 * Mark briefing as delivered via Telegram
 */
export async function markDelivered(briefingId: string, channel: string = 'telegram'): Promise<void> {
  const [briefing] = await db.select().from(briefings).where(eq(briefings.id, briefingId));
  
  if (briefing) {
    const channels = Array.isArray(briefing.deliveryChannels) 
      ? briefing.deliveryChannels 
      : [];
    
    if (!channels.includes(channel)) {
      channels.push(channel);
    }

    await db.update(briefings)
      .set({ 
        deliveredAt: new Date(),
        deliveryChannels: channels,
      })
      .where(eq(briefings.id, briefingId));
  }
}

/**
 * Get pending briefings that need delivery
 */
export async function getPendingDeliveries(channel: string = 'telegram'): Promise<any[]> {
  // Get briefings that haven't been delivered yet
  const pending = await db
    .select({
      briefing: briefings,
      user: users,
    })
    .from(briefings)
    .leftJoin(users, eq(briefings.userId, users.id))
    .where(eq(briefings.deliveredAt, null as any))
    .limit(10);

  return pending.filter(p => {
    const prefs = p.user?.preferences as any;
    return prefs?.deliveryChannels?.includes(channel);
  });
}
