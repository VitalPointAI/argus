import { 
  pgTable, 
  text, 
  timestamp, 
  boolean, 
  integer, 
  jsonb,
  uuid,
  varchar,
  real,
  pgEnum
} from 'drizzle-orm/pg-core';

// ============ Enums ============
export const sourceTypeEnum = pgEnum('source_type', [
  'rss', 'web', 'twitter', 'telegram', 'youtube', 'podcast', 'government'
]);

export const briefingTypeEnum = pgEnum('briefing_type', [
  'morning', 'evening', 'alert'
]);

export const deliveryChannelEnum = pgEnum('delivery_channel', [
  'telegram', 'email', 'web'
]);

export const significanceEnum = pgEnum('significance', [
  'low', 'medium', 'high'
]);

export const timeframeEnum = pgEnum('timeframe', [
  'near', 'mid', 'long'
]);

export const verdictEnum = pgEnum('verdict', [
  'true', 'false', 'mixed', 'unverified'
]);

// ============ Users ============
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  preferences: jsonb('preferences').notNull().default('{}'),
  // Reputation system fields
  trustScore: real('trust_score').notNull().default(1.0),
  totalRatingsGiven: integer('total_ratings_given').notNull().default(0),
  accurateRatings: integer('accurate_ratings').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
});

// ============ Domains ============
export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description').notNull().default(''),
  isBuiltIn: boolean('is_built_in').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ============ Sources ============
export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  type: sourceTypeEnum('type').notNull(),
  url: text('url').notNull(),
  domainId: uuid('domain_id').references(() => domains.id),
  reliabilityScore: real('reliability_score').notNull().default(50),
  isActive: boolean('is_active').notNull().default(true),
  config: jsonb('config').notNull().default('{}'), // source-specific config
  lastFetchedAt: timestamp('last_fetched_at'),
  // Reputation system fields
  lastArticleAt: timestamp('last_article_at'),
  decayAppliedAt: timestamp('decay_applied_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Permission: null = admin/global source, userId = user-created source
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const sourceLists = pgTable('source_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull().default(''),
  isPublic: boolean('is_public').notNull().default(false),
  cloneCount: integer('clone_count').notNull().default(0),
  ratingSum: integer('rating_sum').notNull().default(0),
  ratingCount: integer('rating_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const sourceListItems = pgTable('source_list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceListId: uuid('source_list_id').notNull().references(() => sourceLists.id, { onDelete: 'cascade' }),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at').notNull().defaultNow(),
});

export const userDomains = pgTable('user_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at').notNull().defaultNow(),
});

// ============ Content ============
export const content = pgTable('content', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  url: text('url').notNull(),
  author: varchar('author', { length: 255 }),
  publishedAt: timestamp('published_at').notNull(),
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  confidenceScore: real('confidence_score'), // null until verified
  verificationId: uuid('verification_id'),
});

// ============ Verification ============
export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  confidenceScore: real('confidence_score').notNull(),
  crossReferenceCount: integer('cross_reference_count').notNull().default(0),
  misinfoMarkers: jsonb('misinfo_markers').notNull().default('[]'),
  factCheckResults: jsonb('fact_check_results').notNull().default('[]'),
  reasoning: text('reasoning').notNull(),
  verifiedAt: timestamp('verified_at').notNull().defaultNow(),
});

// ============ Article Claims (extracted facts for verification) ============
export const articleClaims = pgTable('article_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  claimText: text('claim_text').notNull(),
  confidence: real('confidence').notNull().default(50),
  verificationStatus: varchar('verification_status', { length: 50 }).notNull().default('unverified'), // verified, partially_verified, unverified, contradicted
  verificationMethod: text('verification_method'), // how it was verified (e.g., "cross-referenced with Reuters")
  verifiedBy: jsonb('verified_by').notNull().default('[]'), // array of source names/urls that corroborate
  contradictedBy: jsonb('contradicted_by').notNull().default('[]'), // sources that contradict
  extractedAt: timestamp('extracted_at').notNull().defaultNow(),
});

// ============ Briefings ============
export const briefings = pgTable('briefings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: briefingTypeEnum('type').notNull(),
  summary: text('summary').notNull(),
  changes: jsonb('changes').notNull().default('[]'),
  forecasts: jsonb('forecasts').notNull().default('[]'),
  contentIds: jsonb('content_ids').notNull().default('[]'),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at'),
  deliveryChannels: jsonb('delivery_channels').notNull().default('[]'),
});

// ============ Job Queue (pg-boss managed, but we track history) ============
export const jobHistory = pgTable('job_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: varchar('job_name', { length: 100 }).notNull(),
  jobId: text('job_id').notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  result: jsonb('result'),
  error: text('error'),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
});

// ============ Source Reputation System ============

// Reliability history - track score changes over time
export const reliabilityHistory = pgTable('reliability_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  oldScore: real('old_score').notNull(),
  newScore: real('new_score').notNull(),
  changeReason: text('change_reason').notNull(), // 'user_rating', 'decay', 'cross_reference', 'manual', 'anomaly_correction'
  changeMetadata: jsonb('change_metadata').notNull().default('{}'),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
});

// User ratings for sources (1-5 stars + optional comment)
export const sourceRatings = pgTable('source_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  weight: real('weight').notNull().default(1.0), // based on user trust score
  isFlagged: boolean('is_flagged').notNull().default(false),
  flagReason: text('flag_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Daily rating limits per user (anti-gaming)
export const userRatingLimits = pgTable('user_rating_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull().defaultNow(),
  ratingCount: integer('rating_count').notNull().default(0),
});

// Cross-reference accuracy tracking
export const crossReferenceResults = pgTable('cross_reference_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  claimId: uuid('claim_id').references(() => articleClaims.id, { onDelete: 'set null' }),
  wasAccurate: boolean('was_accurate').notNull(),
  verificationSource: text('verification_source'),
  confidence: real('confidence').notNull().default(0.5),
  verifiedAt: timestamp('verified_at').notNull().defaultNow(),
});

// Rating anomaly log
export const ratingAnomalies = pgTable('rating_anomalies', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  anomalyType: text('anomaly_type').notNull(), // 'spike', 'coordinated', 'bot_suspected'
  details: jsonb('details').notNull().default('{}'),
  affectedRatingIds: jsonb('affected_rating_ids').notNull().default('[]'),
  detectedAt: timestamp('detected_at').notNull().defaultNow(),
  resolved: boolean('resolved').notNull().default(false),
  resolutionAction: text('resolution_action'),
});
