/**
 * Scheduled Briefing Delivery Service
 * 
 * Checks user preferences and delivers briefings at their chosen times.
 * Supports both Email (SES) and Telegram delivery.
 */

import { db, users, briefings } from '../../db';
import { sql } from 'drizzle-orm';
import { generateExecutiveBriefing } from '../intelligence/executive-briefing';
import { sendBriefingEmail } from '../email/ses';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface UserWithPrefs {
  id: string;
  email: string;
  name: string;
  preferences: any;
}

/**
 * Send briefing via Telegram
 */
async function sendTelegramBriefing(
  chatId: string,
  briefing: { title: string; markdownContent: string; summary?: { totalStories: number } }
): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  try {
    // Format briefing for Telegram (truncate if too long)
    const maxLength = 4000; // Telegram message limit is 4096
    let content = briefing.markdownContent;
    
    // Convert markdown to Telegram-friendly format
    content = content
      .replace(/^# (.+)$/gm, '*$1*')  // H1 to bold
      .replace(/^## (.+)$/gm, '*$1*') // H2 to bold
      .replace(/^### (.+)$/gm, '_$1_') // H3 to italic
      .replace(/\*\*(.+?)\*\*/g, '*$1*') // Bold
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)'); // Links

    if (content.length > maxLength) {
      content = content.substring(0, maxLength - 100) + '\n\n... [truncated - view full briefing on web]';
    }

    const message = `📊 *${briefing.title}*\n\n${content}`;

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    const result = await response.json();
    
    if (!result.ok) {
      console.error('[Telegram] Send failed:', result);
      return { success: false, error: result.description || 'Send failed' };
    }

    return { success: true };
  } catch (error) {
    console.error('[Telegram] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get users who should receive briefings at the current hour
 */
export async function getUsersForCurrentDelivery(): Promise<UserWithPrefs[]> {
  const now = new Date();
  
  // Get all users with briefings enabled (email OR telegram)
  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    preferences: users.preferences,
  }).from(users);

  const matchingUsers: UserWithPrefs[] = [];

  for (const user of allUsers) {
    const prefs = user.preferences as any;
    
    // Check if user has ANY delivery method enabled
    const emailEnabled = prefs?.email?.enabled && prefs?.email?.briefings?.enabled;
    const telegramEnabled = prefs?.telegram?.enabled && prefs?.telegram?.briefings?.enabled && prefs?.telegram?.chatId;
    
    if (!emailEnabled && !telegramEnabled) {
      continue;
    }

    // Get delivery times - check both email and telegram settings
    const emailTimes = emailEnabled ? (prefs.email.briefings.deliveryTimes || ['06:00']) : [];
    const telegramTimes = telegramEnabled ? (prefs.telegram.briefings.deliveryTimes || ['06:00']) : [];
    const allDeliveryTimes = [...new Set([...emailTimes, ...telegramTimes])];
    
    const timezone = prefs?.email?.briefings?.timezone || prefs?.telegram?.briefings?.timezone || 'America/New_York';

    // Convert current UTC time to user's timezone and check if it matches
    for (const timeStr of allDeliveryTimes) {
      const [targetHour] = timeStr.split(':').map(Number);
      
      // Get user's current time
      const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      const userHour = userTime.getHours();
      const userMinute = userTime.getMinutes();

      // Match if within 30 minute window (for cron running every hour)
      if (userHour === targetHour && userMinute < 30) {
        matchingUsers.push(user);
        break; // Only add once per user
      }
    }
  }

  return matchingUsers;
}

/**
 * Generate and send briefings to users scheduled for current time
 */
export async function deliverScheduledBriefings(): Promise<{
  generated: number;
  delivered: { email: number; telegram: number };
  errors: string[];
}> {
  const result = {
    generated: 0,
    delivered: { email: 0, telegram: 0 },
    errors: [] as string[],
  };

  try {
    const usersToDeliver = await getUsersForCurrentDelivery();
    
    if (usersToDeliver.length === 0) {
      console.log('[Delivery] No users scheduled for briefing at this time');
      return result;
    }

    console.log(`[Delivery] Generating personalized briefings for ${usersToDeliver.length} users`);

    for (const user of usersToDeliver) {
      try {
        const prefs = user.preferences as any;
        const userDomains = prefs?.domains?.selected || [];
        
        console.log(`[Delivery] Generating briefing for ${user.name}`);

        // Generate user-specific briefing
        const briefing = await generateExecutiveBriefing({
          type: 'morning',
          hoursBack: 14,
          includeTTS: false,
          domainIds: userDomains.length > 0 ? userDomains : undefined,
        });

        result.generated++;

        // Determine which channels to use
        const channels: string[] = [];
        
        // Save briefing to database
        const [saved] = await db.insert(briefings).values({
          userId: user.id,
          type: 'morning',
          title: briefing.title,
          content: briefing.markdownContent,
          summary: briefing.markdownContent.substring(0, 500),
          changes: [],
          forecasts: [],
          contentIds: [],
          deliveryChannels: channels,
        }).returning();

        // Send via Email if enabled
        const emailEnabled = prefs?.email?.enabled && prefs?.email?.briefings?.enabled;
        if (emailEnabled) {
          const toEmail = prefs?.notificationEmails?.primary || prefs?.email?.address || user.email;
          
          const emailResult = await sendBriefingEmail({
            to: toEmail,
            briefingTitle: briefing.title,
            briefingContent: briefing.markdownContent,
            domain: briefing.sections?.[0]?.domain || 'Intelligence',
            generatedAt: briefing.generatedAt,
          });

          if (emailResult.success) {
            result.delivered.email++;
            channels.push('email');
            console.log(`[Delivery] Email sent to ${user.name} (${toEmail})`);
          } else {
            result.errors.push(`Email failed for ${user.email}: ${emailResult.error}`);
          }
        }

        // Send via Telegram if enabled
        const telegramEnabled = prefs?.telegram?.enabled && prefs?.telegram?.briefings?.enabled;
        const telegramChatId = prefs?.telegram?.chatId;
        
        if (telegramEnabled && telegramChatId) {
          const telegramResult = await sendTelegramBriefing(telegramChatId, briefing);
          
          if (telegramResult.success) {
            result.delivered.telegram++;
            channels.push('telegram');
            console.log(`[Delivery] Telegram sent to ${user.name} (${telegramChatId})`);
          } else {
            result.errors.push(`Telegram failed for ${user.email}: ${telegramResult.error}`);
          }
        }

        // Update saved briefing with actual channels used
        if (channels.length > 0) {
          await db.update(briefings)
            .set({ deliveryChannels: channels })
            .where(sql`${briefings.id} = ${saved.id}`);
        }

      } catch (error) {
        console.error(`[Delivery] Error for user ${user.email}:`, error);
        result.errors.push(`Error for ${user.email}: ${error}`);
      }
    }
  } catch (error) {
    console.error('[Delivery] Fatal error:', error);
    result.errors.push(`Briefing generation failed: ${error}`);
  }

  console.log(`[Delivery] Complete: ${result.generated} generated, ${result.delivered.email} emails, ${result.delivered.telegram} telegrams, ${result.errors.length} errors`);
  return result;
}

/**
 * Get delivery schedule summary for all users
 */
export async function getDeliverySchedule(): Promise<{
  users: { 
    id: string; 
    name: string; 
    email: string; 
    channels: { email: boolean; telegram: boolean };
    times: string[]; 
    timezone: string;
    telegramChatId?: string;
  }[];
}> {
  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    preferences: users.preferences,
  }).from(users);

  const schedule = [];

  for (const user of allUsers) {
    const prefs = user.preferences as any;
    
    const emailEnabled = prefs?.email?.enabled && prefs?.email?.briefings?.enabled;
    const telegramEnabled = prefs?.telegram?.enabled && prefs?.telegram?.briefings?.enabled && prefs?.telegram?.chatId;
    
    if (emailEnabled || telegramEnabled) {
      const emailTimes = emailEnabled ? (prefs.email.briefings.deliveryTimes || ['06:00']) : [];
      const telegramTimes = telegramEnabled ? (prefs.telegram.briefings.deliveryTimes || ['06:00']) : [];
      
      schedule.push({
        id: user.id,
        name: user.name,
        email: user.email,
        channels: { email: !!emailEnabled, telegram: !!telegramEnabled },
        times: [...new Set([...emailTimes, ...telegramTimes])],
        timezone: prefs?.email?.briefings?.timezone || prefs?.telegram?.briefings?.timezone || 'America/New_York',
        telegramChatId: prefs?.telegram?.chatId,
      });
    }
  }

  return { users: schedule };
}
