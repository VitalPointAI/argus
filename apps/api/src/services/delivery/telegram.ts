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
  executiveSummary?: string;
  keyThemes?: string[];
  changes: any[];
  forecasts: any[];
  sources?: any[];
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

  // Executive Summary (new!)
  if (briefing.executiveSummary) {
    parts.push('*📋 EXECUTIVE SUMMARY*');
    parts.push(briefing.executiveSummary);
    parts.push('');
  }

  // Key Themes (new!)
  if (briefing.keyThemes && briefing.keyThemes.length > 0) {
    parts.push('*🎯 KEY THEMES*');
    parts.push(briefing.keyThemes.join(' • '));
    parts.push('');
  }

  // Summary - convert markdown to Telegram markdown
  const summary = briefing.summary
    .replace(/\*\*([^*]+)\*\*/g, '*$1*') // Bold
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)') // Convert markdown links
    .replace(/^• /gm, '• '); // Bullets are fine

  parts.push(summary);

  // Changes with links
  if (briefing.changes.length > 0) {
    parts.push('');
    parts.push('*🔄 SIGNIFICANT CHANGES*');
    for (const change of briefing.changes.slice(0, 5)) {
      const icon = change.significance === 'high' ? '🔴' : 
                   change.significance === 'medium' ? '🟡' : '🟢';
      const sourceInfo = change.source ? ` (${change.source})` : '';
      const urlInfo = change.url ? `\n   📎 ${change.url}` : '';
      parts.push(`${icon} ${change.description}${sourceInfo}${urlInfo}`);
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

  // Source Links (new!)
  if (briefing.sources && briefing.sources.length > 0) {
    parts.push('');
    parts.push('*📰 SOURCES*');
    for (const source of briefing.sources.slice(0, 5)) {
      parts.push(`• [${source.title}](${source.url})`);
    }
    if (briefing.sources.length > 5) {
      parts.push(`_...and ${briefing.sources.length - 5} more sources_`);
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
