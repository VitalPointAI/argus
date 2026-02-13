-- Source List Marketplace Schema
-- NFT-based subscriptions to encrypted source lists

-- Packages: subscription tiers for each source list
CREATE TABLE source_list_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_list_id UUID NOT NULL REFERENCES source_lists(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id),
    
    -- Package details
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_cid VARCHAR(100), -- IPFS CID for NFT image
    
    -- Pricing
    price_usdc DECIMAL(12,2) NOT NULL,
    duration_days INTEGER, -- NULL = lifetime
    
    -- Benefits (JSON array of strings)
    benefits JSONB DEFAULT '[]',
    
    -- Supply limits
    max_supply INTEGER, -- NULL = unlimited
    minted_count INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions: NFT access passes minted
CREATE TABLE source_list_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES source_list_packages(id),
    source_list_id UUID NOT NULL REFERENCES source_lists(id),
    subscriber_id UUID NOT NULL REFERENCES users(id),
    
    -- NFT details
    nft_token_id VARCHAR(100), -- On-chain token ID
    nft_contract VARCHAR(100) DEFAULT 'source-lists.argus-intel.near',
    
    -- Access period
    starts_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP, -- NULL = lifetime
    
    -- Payment
    price_paid_usdc DECIMAL(12,2) NOT NULL,
    payment_tx_hash VARCHAR(100),
    payment_token VARCHAR(50), -- Original token paid with
    
    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, expired, revoked
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Creator payout settings
CREATE TABLE creator_payout_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
    
    -- Payout wallet (defaults to implicit account)
    payout_wallet VARCHAR(100) NOT NULL,
    
    -- Platform fee override (for special deals)
    custom_fee_percent DECIMAL(4,2), -- NULL = use default 5%
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Earnings history (indexed from on-chain, for display)
CREATE TABLE creator_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id),
    subscription_id UUID REFERENCES source_list_subscriptions(id),
    
    -- Amounts
    gross_amount_usdc DECIMAL(12,2) NOT NULL,
    platform_fee_usdc DECIMAL(12,2) NOT NULL,
    net_amount_usdc DECIMAL(12,2) NOT NULL,
    
    -- On-chain reference
    tx_hash VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_packages_source_list ON source_list_packages(source_list_id);
CREATE INDEX idx_packages_creator ON source_list_packages(creator_id);
CREATE INDEX idx_packages_active ON source_list_packages(is_active) WHERE is_active = true;

CREATE INDEX idx_subscriptions_subscriber ON source_list_subscriptions(subscriber_id);
CREATE INDEX idx_subscriptions_source_list ON source_list_subscriptions(source_list_id);
CREATE INDEX idx_subscriptions_status ON source_list_subscriptions(status);
CREATE INDEX idx_subscriptions_expires ON source_list_subscriptions(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_earnings_creator ON creator_earnings(creator_id);
CREATE INDEX idx_earnings_created ON creator_earnings(created_at);

-- Source lists need additional marketplace fields
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS is_marketplace_listed BOOLEAN DEFAULT false;
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS marketplace_description TEXT;
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS marketplace_image_cid VARCHAR(100);
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS encrypted_content_cid VARCHAR(100);
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS encryption_key_wrapped TEXT; -- Wrapped with creator's key
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS total_subscribers INTEGER DEFAULT 0;
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS total_revenue_usdc DECIMAL(12,2) DEFAULT 0;
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS avg_rating DECIMAL(3,2);
ALTER TABLE source_lists ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;

-- Reviews for source lists
CREATE TABLE source_list_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_list_id UUID NOT NULL REFERENCES source_lists(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    subscription_id UUID REFERENCES source_list_subscriptions(id),
    
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(source_list_id, reviewer_id)
);

CREATE INDEX idx_reviews_source_list ON source_list_reviews(source_list_id);
CREATE INDEX idx_reviews_rating ON source_list_reviews(rating);
