/**
 * Scheduled Briefing Delivery Service
 * 
 * Checks user preferences and delivers briefings at their chosen times.
 * Each user gets their own personalized briefing based on their domain interests.
 */

import { db, users, briefings } from '../../db';
import { sql } from 'drizzle-orm';
import { generateExecutiveBriefing } from '../intelligence/executive-briefing';
import { sendBriefingEmail } from '../email/ses';

interface UserWithPrefs {
  id: string;
  email: string;
  name: string;
  preferences: any;
}

/**
 * Get users who should receive briefings at the current hour
 */
export async function getUsersForCurrentDelivery(): Promise<UserWithPrefs[]> {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  
  // Round to nearest hour for matching
  const hourStr = currentHour.toString().padStart(2, '0');
  
  // Get all users with email briefings enabled
  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    preferences: users.preferences,
  }).from(users);

  const matchingUsers: UserWithPrefs[] = [];

  for (const user of allUsers) {
    const prefs = user.preferences as any;
    
    if (!prefs?.email?.enabled || !prefs?.email?.briefings?.enabled) {
      continue;
    }

    const deliveryTimes = prefs.email.briefings.deliveryTimes || ['06:00'];
    const timezone = prefs.email.briefings.timezone || 'America/New_York';

    // Convert current UTC time to user's timezone and check if it matches
    for (const timeStr of deliveryTimes) {
      const [targetHour, targetMinute] = timeStr.split(':').map(Number);
      
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
 * Each user gets their own personalized briefing based on their domain preferences
 */
export async function deliverScheduledBriefings(): Promise<{
  generated: number;
  delivered: number;
  errors: string[];
}> {
  const result = {
    generated: 0,
    delivered: 0,
    errors: [] as string[],
  };

  try {
    const usersToDeliver = await getUsersForCurrentDelivery();
    
    if (usersToDeliver.length === 0) {
      console.log('[Delivery] No users scheduled for briefing at this time');
      return result;
    }

    console.log(`[Delivery] Generating personalized briefings for ${usersToDeliver.length} users`);

    // Generate a personalized briefing for each user
    for (const user of usersToDeliver) {
      try {
        const prefs = user.preferences as any;
        
        // Get user's domain filter (if any)
        const userDomains = prefs?.domains?.selected || [];
        
        console.log(`[Delivery] Generating briefing for ${user.name} (domains: ${userDomains.length > 0 ? userDomains.join(', ') : 'all'})`);

        // Generate user-specific briefing
        const briefing = await generateExecutiveBriefing({
          type: 'morning',
          hoursBack: 14,
          includeTTS: false,
          domainIds: userDomains.length > 0 ? userDomains : undefined, // Filter by user's domains
        });

        result.generated++;

        // Save briefing to database for this user
        const [saved] = await db.insert(briefings).values({
          userId: user.id,
          type: 'morning',
          title: briefing.title,
          content: briefing.markdownContent,
          summary: briefing.markdownContent.substring(0, 500),
          changes: [],
          forecasts: [],
          contentIds: [],
          deliveryChannels: ['email'],
        }).returning();

        console.log(`[Delivery] Saved briefing ${saved.id} for user ${user.id}`);

        // Send email
        const toEmail = prefs?.notificationEmails?.primary || prefs?.email?.address || user.email;

        const emailResult = await sendBriefingEmail({
          to: toEmail,
          briefingTitle: briefing.title,
          briefingContent: briefing.markdownContent,
          domain: briefing.sections?.[0]?.domain || 'Intelligence',
          generatedAt: briefing.generatedAt,
        });

        if (emailResult.success) {
          result.delivered++;
          console.log(`[Delivery] Sent briefing to ${user.name} (${toEmail})`);
        } else {
          result.errors.push(`Failed to send to ${user.email}: ${emailResult.error}`);
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

  console.log(`[Delivery] Complete: ${result.generated} generated, ${result.delivered} delivered, ${result.errors.length} errors`);
  return result;
}

/**
 * Get delivery schedule summary for all users
 */
export async function getDeliverySchedule(): Promise<{
  users: { id: string; name: string; email: string; times: string[]; timezone: string }[];
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
    
    if (prefs?.email?.enabled && prefs?.email?.briefings?.enabled) {
      schedule.push({
        id: user.id,
        name: user.name,
        email: user.email,
        times: prefs.email.briefings.deliveryTimes || ['06:00'],
        timezone: prefs.email.briefings.timezone || 'America/New_York',
      });
    }
  }

  return { users: schedule };
}
