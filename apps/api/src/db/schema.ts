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
  preferences: jsonb('preferences').notNull().default('{}'),
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
