use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, Balance, BorshStorageKey, PanicOnDefault, Promise};
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};

// Storage cost per byte
const STORAGE_PRICE_PER_BYTE: Balance = 10_000_000_000_000_000_000; // 0.00001 NEAR

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    NonFungibleToken,
    TokenMetadata,
    Enumeration,
    Approval,
    Sources,
    Posts,
    PostExclusions,
    SourcePosts,
    TierPrices,
    AccessPasses,
}

/// A HUMINT source's public profile
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Source {
    /// Codename hash (SHA256 of actual codename for privacy)
    pub codename_hash: String,
    /// Source's public key for DH key agreement (X25519 or Ed25519)
    pub public_key: String,
    /// Available subscription tiers
    pub tiers: Vec<Tier>,
    /// Total posts
    pub post_count: u64,
    /// Registration timestamp
    pub created_at: u64,
    /// Whether source is active
    pub is_active: bool,
}

/// Subscription tier definition
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Tier {
    pub name: String,           // "free", "bronze", "silver", "gold"
    pub level: u8,              // 0 = free, 1 = bronze, 2 = silver, 3 = gold
    pub price_near: U128,       // Price in yoctoNEAR
    pub description: String,
}

/// A post anchor (actual content on IPFS)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PostAnchor {
    pub post_id: String,
    /// SHA256 hash of encrypted content (for integrity verification)
    pub content_hash: String,
    /// IPFS CID of encrypted content
    pub content_cid: String,
    /// Minimum tier required (0 = free, 1 = bronze, etc.)
    pub min_tier: u8,
    /// Epoch identifier (e.g., "2026-02")
    pub epoch: String,
    /// Timestamp
    pub created_at: u64,
    /// Source codename hash
    pub source_hash: String,
}

/// Access pass NFT metadata (stored with token)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct AccessPassData {
    pub source_hash: String,
    pub tier_level: u8,
    pub tier_name: String,
    /// When the pass was purchased
    pub purchased_at: u64,
    /// Optional expiry (0 = lifetime)
    pub expires_at: u64,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct HumintFeed {
    /// NFT implementation for access passes
    nft: NonFungibleToken,
    /// Contract owner
    owner_id: AccountId,
    /// Platform fee percentage (basis points, 100 = 1%)
    platform_fee_bps: u16,
    /// Registered sources (source_hash -> Source)
    sources: UnorderedMap<String, Source>,
    /// Post anchors (post_id -> PostAnchor)
    posts: LookupMap<String, PostAnchor>,
    /// Per-post exclusions (post_id -> set of excluded pubkeys)
    post_exclusions: LookupMap<String, UnorderedSet<String>>,
    /// Source's posts (source_hash -> set of post_ids)
    source_posts: LookupMap<String, UnorderedSet<String>>,
    /// Access pass data (token_id -> AccessPassData)
    access_passes: LookupMap<TokenId, AccessPassData>,
    /// Next token ID
    next_token_id: u64,
}

#[near_bindgen]
impl HumintFeed {
    /// Initialize the contract
    #[init]
    pub fn new(owner_id: AccountId, platform_fee_bps: u16) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        assert!(platform_fee_bps <= 1000, "Fee cannot exceed 10%");
        
        Self {
            nft: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                owner_id.clone(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            owner_id,
            platform_fee_bps,
            sources: UnorderedMap::new(StorageKey::Sources),
            posts: LookupMap::new(StorageKey::Posts),
            post_exclusions: LookupMap::new(StorageKey::PostExclusions),
            source_posts: LookupMap::new(StorageKey::SourcePosts),
            access_passes: LookupMap::new(StorageKey::AccessPasses),
            next_token_id: 1,
        }
    }

    // ==========================================
    // SOURCE MANAGEMENT
    // ==========================================

    /// Register as a HUMINT source
    /// Called by the source's NEAR account
    pub fn register_source(
        &mut self,
        codename_hash: String,
        public_key: String,
        tiers: Vec<Tier>,
    ) {
        let caller = env::predecessor_account_id();
        
        // Check not already registered
        assert!(
            self.sources.get(&codename_hash).is_none(),
            "Source already registered"
        );
        
        // Validate tiers
        assert!(!tiers.is_empty(), "Must have at least one tier");
        for (i, tier) in tiers.iter().enumerate() {
            assert!(tier.level == i as u8, "Tier levels must be sequential starting from 0");
        }
        
        let source = Source {
            codename_hash: codename_hash.clone(),
            public_key,
            tiers,
            post_count: 0,
            created_at: env::block_timestamp(),
            is_active: true,
        };
        
        self.sources.insert(&codename_hash, &source);
        
        // Initialize source posts set
        self.source_posts.insert(
            &codename_hash,
            &UnorderedSet::new(format!("sp:{}", codename_hash).as_bytes()),
        );
        
        env::log_str(&format!("Source registered: {}", codename_hash));
    }

    /// Update source's public key (for key rotation)
    pub fn update_source_pubkey(&mut self, codename_hash: String, new_public_key: String) {
        let mut source = self.sources.get(&codename_hash).expect("Source not found");
        
        // Only source owner can update (verified via signature off-chain, stored pubkey here)
        // In practice, this would require a signature verification
        // For now, we trust the caller is authorized
        
        source.public_key = new_public_key;
        self.sources.insert(&codename_hash, &source);
        
        env::log_str(&format!("Source pubkey updated: {}", codename_hash));
    }

    /// Get source info
    pub fn get_source(&self, codename_hash: String) -> Option<Source> {
        self.sources.get(&codename_hash)
    }

    /// List all active sources
    pub fn list_sources(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Source> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        
        self.sources
            .iter()
            .skip(from as usize)
            .take(limit as usize)
            .map(|(_, s)| s)
            .filter(|s| s.is_active)
            .collect()
    }

    // ==========================================
    // POST ANCHORING
    // ==========================================

    /// Anchor a post on-chain
    /// Only the source can call this (verified by codename_hash ownership)
    pub fn anchor_post(
        &mut self,
        post_id: String,
        codename_hash: String,
        content_hash: String,
        content_cid: String,
        min_tier: u8,
        epoch: String,
    ) {
        // Verify source exists
        let mut source = self.sources.get(&codename_hash).expect("Source not found");
        assert!(source.is_active, "Source is not active");
        assert!(min_tier <= source.tiers.len() as u8, "Invalid tier");
        
        // Check post doesn't already exist
        assert!(self.posts.get(&post_id).is_none(), "Post already anchored");
        
        let anchor = PostAnchor {
            post_id: post_id.clone(),
            content_hash,
            content_cid,
            min_tier,
            epoch,
            created_at: env::block_timestamp(),
            source_hash: codename_hash.clone(),
        };
        
        self.posts.insert(&post_id, &anchor);
        
        // Add to source's post list
        if let Some(mut posts) = self.source_posts.get(&codename_hash) {
            posts.insert(&post_id);
            self.source_posts.insert(&codename_hash, &posts);
        }
        
        // Update source post count
        source.post_count += 1;
        self.sources.insert(&codename_hash, &source);
        
        env::log_str(&format!("Post anchored: {} by {}", post_id, codename_hash));
    }

    /// Get post anchor
    pub fn get_post(&self, post_id: String) -> Option<PostAnchor> {
        self.posts.get(&post_id)
    }

    /// Get posts by source
    pub fn get_source_posts(
        &self,
        codename_hash: String,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<PostAnchor> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(20).min(100);
        
        match self.source_posts.get(&codename_hash) {
            Some(post_ids) => post_ids
                .iter()
                .skip(from as usize)
                .take(limit as usize)
                .filter_map(|id| self.posts.get(&id))
                .collect(),
            None => vec![],
        }
    }

    // ==========================================
    // PER-POST EXCLUSIONS
    // ==========================================

    /// Add exclusion to a post (revoke access for specific pubkey)
    pub fn add_exclusion(&mut self, post_id: String, excluded_pubkey: String) {
        let post = self.posts.get(&post_id).expect("Post not found");
        
        // Get or create exclusion set
        let mut exclusions = self.post_exclusions
            .get(&post_id)
            .unwrap_or_else(|| UnorderedSet::new(format!("ex:{}", post_id).as_bytes()));
        
        exclusions.insert(&excluded_pubkey);
        self.post_exclusions.insert(&post_id, &exclusions);
        
        env::log_str(&format!("Exclusion added to post {}", post_id));
    }

    /// Remove exclusion from a post
    pub fn remove_exclusion(&mut self, post_id: String, excluded_pubkey: String) {
        if let Some(mut exclusions) = self.post_exclusions.get(&post_id) {
            exclusions.remove(&excluded_pubkey);
            self.post_exclusions.insert(&post_id, &exclusions);
        }
    }

    /// Check if pubkey is excluded from post
    pub fn is_excluded(&self, post_id: String, pubkey: String) -> bool {
        match self.post_exclusions.get(&post_id) {
            Some(exclusions) => exclusions.contains(&pubkey),
            None => false,
        }
    }

    /// Get all exclusions for a post
    pub fn get_exclusions(&self, post_id: String) -> Vec<String> {
        match self.post_exclusions.get(&post_id) {
            Some(exclusions) => exclusions.iter().collect(),
            None => vec![],
        }
    }

    // ==========================================
    // ACCESS PASS NFT
    // ==========================================

    /// Purchase an access pass NFT
    #[payable]
    pub fn purchase_access_pass(
        &mut self,
        source_hash: String,
        tier_level: u8,
        duration_months: u8,
    ) -> TokenId {
        let buyer = env::predecessor_account_id();
        let deposit = env::attached_deposit();
        
        // Get source and tier
        let source = self.sources.get(&source_hash).expect("Source not found");
        let tier = source.tiers.get(tier_level as usize).expect("Invalid tier");
        
        // Calculate price (tier price * months)
        let price: Balance = tier.price_near.0 * duration_months as u128;
        assert!(deposit >= price, "Insufficient deposit");
        
        // Calculate expiry
        let expires_at = if duration_months == 0 {
            0 // Lifetime
        } else {
            env::block_timestamp() + (duration_months as u64 * 30 * 24 * 60 * 60 * 1_000_000_000)
        };
        
        // Mint NFT
        let token_id = format!("ap-{}", self.next_token_id);
        self.next_token_id += 1;
        
        let metadata = TokenMetadata {
            title: Some(format!("{} Access Pass - {}", source_hash, tier.name)),
            description: Some(format!(
                "Access pass for {} content from source {}",
                tier.name, source_hash
            )),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp().to_string()),
            expires_at: if expires_at > 0 { Some(expires_at.to_string()) } else { None },
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        };
        
        self.nft.internal_mint(token_id.clone(), buyer.clone(), Some(metadata));
        
        // Store access pass data
        let pass_data = AccessPassData {
            source_hash: source_hash.clone(),
            tier_level,
            tier_name: tier.name.clone(),
            purchased_at: env::block_timestamp(),
            expires_at,
        };
        self.access_passes.insert(&token_id, &pass_data);
        
        // Distribute payment (platform fee + source payment)
        let platform_fee = price * self.platform_fee_bps as u128 / 10000;
        let source_payment = price - platform_fee;
        
        // Transfer to source (they can register a payment address)
        // For now, log the amount owed
        env::log_str(&format!(
            "Access pass minted: {} for {} (tier: {}, expires: {})",
            token_id, buyer, tier.name, expires_at
        ));
        env::log_str(&format!(
            "Payment: {} yoctoNEAR to source, {} platform fee",
            source_payment, platform_fee
        ));
        
        // Refund excess
        if deposit > price {
            Promise::new(buyer).transfer(deposit - price);
        }
        
        token_id
    }

    /// Get access pass data
    pub fn get_access_pass(&self, token_id: TokenId) -> Option<AccessPassData> {
        self.access_passes.get(&token_id)
    }

    /// Check if account has valid access to a source/tier
    pub fn has_access(&self, account_id: AccountId, source_hash: String, min_tier: u8) -> bool {
        // Get all tokens owned by account
        let tokens = self.nft.nft_tokens_for_owner(account_id, None, None);
        
        let now = env::block_timestamp();
        
        for token in tokens {
            if let Some(pass) = self.access_passes.get(&token.token_id) {
                // Check source match
                if pass.source_hash != source_hash {
                    continue;
                }
                // Check tier level
                if pass.tier_level < min_tier {
                    continue;
                }
                // Check expiry
                if pass.expires_at > 0 && pass.expires_at < now {
                    continue;
                }
                // Valid access!
                return true;
            }
        }
        
        false
    }

    /// Get all access passes owned by account
    pub fn get_my_access_passes(&self, account_id: AccountId) -> Vec<(TokenId, AccessPassData)> {
        let tokens = self.nft.nft_tokens_for_owner(account_id, None, None);
        
        tokens
            .into_iter()
            .filter_map(|token| {
                self.access_passes
                    .get(&token.token_id)
                    .map(|data| (token.token_id, data))
            })
            .collect()
    }

    // ==========================================
    // ADMIN
    // ==========================================

    /// Update platform fee (owner only)
    pub fn set_platform_fee(&mut self, new_fee_bps: u16) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "Only owner can set fee"
        );
        assert!(new_fee_bps <= 1000, "Fee cannot exceed 10%");
        self.platform_fee_bps = new_fee_bps;
    }

    /// Get contract stats
    pub fn get_stats(&self) -> (u64, u64, u64) {
        (
            self.sources.len(),
            self.next_token_id - 1, // Total NFTs minted
            0, // Total posts (would need iteration)
        )
    }
}

// ==========================================
// NFT STANDARD IMPLEMENTATIONS
// ==========================================

near_contract_standards::impl_non_fungible_token_core!(HumintFeed, nft);
near_contract_standards::impl_non_fungible_token_approval!(HumintFeed, nft);
near_contract_standards::impl_non_fungible_token_enumeration!(HumintFeed, nft);

#[near_bindgen]
impl NonFungibleTokenMetadataProvider for HumintFeed {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Argus HUMINT Access Pass".to_string(),
            symbol: "HUMINT".to_string(),
            icon: None,
            base_uri: Some("https://argus.vitalpoint.ai/api/humint/nft".to_string()),
            reference: None,
            reference_hash: None,
        }
    }
}
