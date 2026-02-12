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
  title: text('title'),  // Executive briefing title
  content: text('content'), // Full markdown content
  summary: text('summary').notNull(),
  changes: jsonb('changes').notNull().default('[]'),
  forecasts: jsonb('forecasts').notNull().default('[]'),
  contentIds: jsonb('content_ids').notNull().default('[]'),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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

// ============ API Keys ============
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull(), // SHA-256 hash of the API key
  keyPrefix: varchar('key_prefix', { length: 8 }).notNull(), // First 8 chars for identification
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// API key rate limiting
export const apiKeyRateLimits = pgTable('api_key_rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  windowStart: timestamp('window_start').notNull(),
  requestCount: integer('request_count').notNull().default(0),
});

// ============ HUMINT (Human Intelligence) ============

// Anonymous HUMINT sources
export const humintSources = pgTable('humint_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  codename: text('codename').notNull().unique(),
  publicKey: text('public_key').notNull().unique(),
  nearAccountId: text('near_account_id').unique(), // NEAR account from Phantom Auth MPC
  
  // Profile
  bio: text('bio'),
  domains: text('domains').array().notNull().default([]),
  regions: text('regions').array().notNull().default([]),
  eventTypes: text('event_types').array().notNull().default([]),
  
  // Reputation (crowd-sourced)
  reputationScore: integer('reputation_score').notNull().default(50),
  totalSubmissions: integer('total_submissions').notNull().default(0),
  verifiedCount: integer('verified_count').notNull().default(0),
  contradictedCount: integer('contradicted_count').notNull().default(0),
  
  // Monetization
  subscriptionPriceUsdc: real('subscription_price_usdc'),
  isAcceptingSubscribers: boolean('is_accepting_subscribers').notNull().default(false),
  totalEarningsUsdc: real('total_earnings_usdc').notNull().default(0),
  subscriberCount: integer('subscriber_count').notNull().default(0),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at'),
});

// Payment addresses (unlinkable to codename externally)
// Supports any chain via NEAR Intents 1Click
export const sourcePaymentAddresses = pgTable('source_payment_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => humintSources.id, { onDelete: 'cascade' }),
  address: text('address').notNull(),
  // Chain info for 1Click cross-chain payments
  chain: text('chain').notNull().default('near'), // 'near', 'eth', 'arb', 'sol', 'btc', etc.
  tokenId: text('token_id'), // NEAR Intents token ID e.g. 'nep141:sol-5ce3bf...'
  isPrimary: boolean('is_primary').notNull().default(false),
  addedAt: timestamp('added_at').notNull().defaultNow(),
});

// Payment records for 1Click cross-chain payouts
export const humintPayments = pgTable('humint_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => humintSources.id, { onDelete: 'cascade' }),
  
  // Payment details
  amountUsdc: real('amount_usdc').notNull(),
  reason: text('reason').notNull(), // 'subscription', 'bounty', 'tip'
  referenceId: uuid('reference_id'), // subscription or bounty ID
  
  // 1Click details
  depositAddress: text('deposit_address'), // 1Click temp deposit address
  recipientAddress: text('recipient_address').notNull(),
  recipientChain: text('recipient_chain').notNull(),
  recipientTokenId: text('recipient_token_id'),
  
  // Status tracking
  status: text('status').notNull().default('pending'), // pending, deposited, processing, success, failed, refunded
  oneClickQuoteId: text('one_click_quote_id'),
  depositTxHash: text('deposit_tx_hash'),
  settlementTxHash: text('settlement_tx_hash'),
  errorMessage: text('error_message'),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

// HUMINT Submissions
export const humintSubmissions = pgTable('humint_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => humintSources.id, { onDelete: 'cascade' }),
  
  // Content
  title: text('title').notNull(),
  body: text('body').notNull(),
  mediaUrls: text('media_urls').array().notNull().default([]),
  
  // Context
  locationRegion: text('location_region'),
  locationCountry: text('location_country'),
  eventTag: text('event_tag'),
  occurredAt: timestamp('occurred_at'),
  isTimeSensitive: boolean('is_time_sensitive').notNull().default(false),
  
  // Cryptographic proof
  contentHash: text('content_hash').notNull(),
  signature: text('signature').notNull(),
  
  // Verification (crowd-sourced)
  verificationStatus: text('verification_status').notNull().default('unverified'),
  verifiedCount: integer('verified_count').notNull().default(0),
  contradictedCount: integer('contradicted_count').notNull().default(0),
  neutralCount: integer('neutral_count').notNull().default(0),
  
  // Metadata
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
});

// Ratings from consumers
export const submissionRatings = pgTable('submission_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').notNull().references(() => humintSubmissions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: text('rating').notNull(), // 'verified', 'contradicted', 'neutral'
  evidenceUrl: text('evidence_url'),
  comment: text('comment'),
  ratedAt: timestamp('rated_at').notNull().defaultNow(),
});

// Source subscriptions (direct to source)
export const sourceSubscriptions = pgTable('source_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => humintSources.id, { onDelete: 'cascade' }),
  subscriberId: uuid('subscriber_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  amountPaidUsdc: real('amount_paid_usdc'),
  paymentTxHash: text('payment_tx_hash'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Intel bounties
export const intelBounties = pgTable('intel_bounties', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'set null' }),
  
  title: text('title').notNull(),
  description: text('description').notNull(),
  domains: text('domains').array().notNull().default([]),
  regions: text('regions').array().notNull().default([]),
  
  rewardUsdc: real('reward_usdc').notNull(),
  minSourceReputation: integer('min_source_reputation').notNull().default(50),
  
  // Moderation & Legal (Option 2 safeguards)
  intendedUse: text('intended_use'), // Required: How they plan to use the intel
  legalAttestationAt: timestamp('legal_attestation_at'), // When they agreed to terms
  category: text('category').notNull().default('general'),
  reviewStatus: text('review_status').notNull().default('pending'), // pending, approved, rejected, auto_approved
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  
  status: text('status').notNull().default('open'), // open, claimed, paid, expired, cancelled
  expiresAt: timestamp('expires_at'),
  
  fulfilledBy: uuid('fulfilled_by').references(() => humintSources.id),
  fulfillmentSubmissionId: uuid('fulfillment_submission_id').references(() => humintSubmissions.id),
  paymentTxHash: text('payment_tx_hash'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Bounty category allowlist
export const bountyCategories = pgTable('bounty_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description'),
  autoApprove: boolean('auto_approve').notNull().default(false),
  requiresKyc: boolean('requires_kyc').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Blocked keywords for auto-rejection
export const bountyBlockedKeywords = pgTable('bounty_blocked_keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyword: text('keyword').notNull().unique(),
  reason: text('reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// HUMINT sources can also be added to regular source lists
export const sourceListHumintItems = pgTable('source_list_humint_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  listId: uuid('list_id').notNull().references(() => sourceLists.id, { onDelete: 'cascade' }),
  humintSourceId: uuid('humint_source_id').notNull().references(() => humintSources.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at').notNull().defaultNow(),
});

// ============ ZEC Escrow System ============

// Escrow balances (internal tracking before withdrawal)
export const humintEscrowBalances = pgTable('humint_escrow_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => humintSources.id, { onDelete: 'cascade' }).unique(),
  balanceZec: real('balance_zec').notNull().default(0),
  totalEarnedZec: real('total_earned_zec').notNull().default(0),
  totalWithdrawnZec: real('total_withdrawn_zec').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Withdrawal queue with time-delayed processing
export const humintWithdrawalQueue = pgTable('humint_withdrawal_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => humintSources.id, { onDelete: 'cascade' }),
  
  // Amount in fixed denominations
  amountZec: real('amount_zec').notNull(),
  denominations: jsonb('denominations').notNull().default([]), // e.g., [2.5, 2.5] for 5 ZEC
  
  // Recipient address (shielded z-address)
  recipientZAddress: text('recipient_z_address').notNull(),
  
  // Time-delayed processing
  queuedAt: timestamp('queued_at').notNull().defaultNow(),
  scheduledFor: timestamp('scheduled_for').notNull(), // Random time 1-48h from queuedAt
  
  // Status tracking
  status: text('status').notNull().default('pending'), // pending, processing, completed, failed
  
  // Transaction details (after processing)
  txIds: jsonb('tx_ids').default([]), // Array of tx IDs (one per denomination)
  errorMessage: text('error_message'),
  
  // Completion
  processedAt: timestamp('processed_at'),
  completedAt: timestamp('completed_at'),
});

// Escrow transactions (credits and debits)
export const humintEscrowTransactions = pgTable('humint_escrow_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => humintSources.id, { onDelete: 'cascade' }),
  
  // Transaction type
  type: text('type').notNull(), // 'credit' (bounty accepted) or 'debit' (withdrawal)
  amountZec: real('amount_zec').notNull(),
  
  // Reference
  referenceType: text('reference_type'), // 'bounty', 'tip', 'subscription', 'withdrawal'
  referenceId: uuid('reference_id'),
  
  // Balance after transaction
  balanceAfter: real('balance_after').notNull(),
  
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
