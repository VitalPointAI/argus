use near_sdk::store::{LookupMap, UnorderedMap, UnorderedSet, LazyOption};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

/// HUMINT Feed Contract
/// 
/// Manages:
/// - Source registration (anonymous HUMINT sources)
/// - Post anchoring (encrypted content on IPFS, hash on-chain)
/// - Access Pass NFTs (subscription-based access to source content)
/// - Package management (custom pricing by sources)

pub type TokenId = String;

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    Sources,
    Posts,
    SourcePosts,
    SourcePostsInner { source_hash: Vec<u8> },
    // NFT storage
    TokensPerOwner,
    TokenPerOwnerInner { account_id_hash: Vec<u8> },
    TokensById,
    TokenMetadataById,
    AccessPassData,
    NFTContractMetadata,
    // Exclusions
    PostExclusions,
    PostExclusionsInner { post_id_hash: Vec<u8> },
}

/// NFT Contract Metadata (NEP-177)
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct NFTContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// Token Metadata (NEP-177)
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub copies: Option<u64>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// Token structure
#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Token {
    pub owner_id: AccountId,
}

/// A HUMINT source's public profile
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Source {
    /// SHA256 of codename (privacy - never store actual codename)
    pub codename_hash: String,
    /// X25519 public key for DH key derivation
    pub public_key: String,
    /// Custom subscription packages
    pub packages: Vec<Package>,
    /// Total posts
    pub post_count: u64,
    /// Total subscribers
    pub subscriber_count: u64,
    /// Registration timestamp
    pub created_at: U64,
    /// Whether source is accepting new subscribers
    pub is_active: bool,
}

/// Subscription package definition (source-defined, USDC pricing)
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Package {
    pub id: String,
    pub name: String,
    /// Price in USDC cents (e.g., 500 = $5.00)
    pub price_usdc_cents: u32,
    /// Duration in days
    pub duration_days: u32,
    pub description: String,
}

/// Post anchor (actual content encrypted on IPFS)
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct PostAnchor {
    pub post_id: String,
    /// SHA256 of plaintext content (integrity verification)
    pub content_hash: String,
    /// IPFS CID of encrypted content
    pub content_cid: String,
    /// Whether content requires subscription
    pub is_premium: bool,
    /// Epoch for key derivation (e.g., "2026-02")
    pub epoch: String,
    /// Creation timestamp
    pub created_at: U64,
    /// Source codename hash
    pub source_hash: String,
    /// ZK proof types attached
    pub zk_proofs: Vec<String>,
}

/// Access Pass NFT data (stored with token)
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AccessPassData {
    /// Source this pass grants access to
    pub source_hash: String,
    /// Package ID purchased
    pub package_id: String,
    /// When subscription started
    pub started_at: U64,
    /// When subscription expires (0 = lifetime)
    pub expires_at: U64,
    /// Amount paid in USDC cents
    pub amount_paid_usdc_cents: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct HumintFeed {
    /// Contract owner
    owner_id: AccountId,
    /// Platform fee in basis points (100 = 1%)
    platform_fee_bps: u16,
    /// Registered sources
    sources: UnorderedMap<String, Source>,
    /// Post anchors
    posts: LookupMap<String, PostAnchor>,
    /// Posts by source
    source_posts: LookupMap<String, UnorderedSet<String>>,
    /// Per-post exclusions (revoked access)
    post_exclusions: LookupMap<String, UnorderedSet<AccountId>>,
    // NFT storage
    tokens_per_owner: LookupMap<AccountId, UnorderedSet<TokenId>>,
    tokens_by_id: UnorderedMap<TokenId, Token>,
    token_metadata_by_id: UnorderedMap<TokenId, TokenMetadata>,
    access_pass_data: UnorderedMap<TokenId, AccessPassData>,
    metadata: LazyOption<NFTContractMetadata>,
    next_token_id: u64,
}

#[near]
impl HumintFeed {
    /// Initialize contract
    #[init]
    pub fn new(owner_id: AccountId, platform_fee_bps: u16) -> Self {
        require!(platform_fee_bps <= 1000, "Fee cannot exceed 10%");
        
        let metadata = NFTContractMetadata {
            spec: "nft-1.0.0".to_string(),
            name: "Argus HUMINT Access Pass".to_string(),
            symbol: "HUMINT".to_string(),
            icon: Some("https://argus.vitalpoint.ai/humint-icon.png".to_string()),
            base_uri: Some("https://argus.vitalpoint.ai/api/humint/nft".to_string()),
            reference: None,
            reference_hash: None,
        };

        Self {
            owner_id,
            platform_fee_bps,
            sources: UnorderedMap::new(StorageKey::Sources),
            posts: LookupMap::new(StorageKey::Posts),
            source_posts: LookupMap::new(StorageKey::SourcePosts),
            post_exclusions: LookupMap::new(StorageKey::PostExclusions),
            tokens_per_owner: LookupMap::new(StorageKey::TokensPerOwner),
            tokens_by_id: UnorderedMap::new(StorageKey::TokensById),
            token_metadata_by_id: UnorderedMap::new(StorageKey::TokenMetadataById),
            access_pass_data: UnorderedMap::new(StorageKey::AccessPassData),
            metadata: LazyOption::new(StorageKey::NFTContractMetadata, Some(metadata)),
            next_token_id: 1,
        }
    }

    // ==========================================
    // SOURCE MANAGEMENT
    // ==========================================

    /// Register as a HUMINT source
    pub fn register_source(
        &mut self,
        codename_hash: String,
        public_key: String,
        packages: Vec<Package>,
    ) {
        require!(
            self.sources.get(&codename_hash).is_none(),
            "Source already registered"
        );
        
        // Validate codename hash format (64 char hex)
        require!(
            codename_hash.len() == 64 && codename_hash.chars().all(|c| c.is_ascii_hexdigit()),
            "Invalid codename hash format"
        );
        
        // Validate packages
        for pkg in &packages {
            require!(pkg.duration_days > 0, "Package duration must be > 0");
            require!(pkg.name.len() <= 50, "Package name too long");
        }
        
        let source = Source {
            codename_hash: codename_hash.clone(),
            public_key,
            packages,
            post_count: 0,
            subscriber_count: 0,
            created_at: U64(env::block_timestamp()),
            is_active: true,
        };
        
        self.sources.insert(codename_hash.clone(), source);
        self.source_posts.insert(
            codename_hash.clone(),
            UnorderedSet::new(StorageKey::SourcePostsInner { 
                source_hash: env::sha256(codename_hash.as_bytes()).to_vec() 
            }),
        );
        
        env::log_str(&format!("Source registered: {}", &codename_hash[..12]));
    }

    /// Update source packages
    pub fn update_packages(&mut self, codename_hash: String, packages: Vec<Package>) {
        let mut source = self.sources.get(&codename_hash)
            .expect("Source not found")
            .clone();
        
        // Validate packages
        for pkg in &packages {
            require!(pkg.duration_days > 0, "Package duration must be > 0");
        }
        
        source.packages = packages;
        self.sources.insert(codename_hash, source);
    }

    /// Get source info
    pub fn get_source(&self, codename_hash: String) -> Option<Source> {
        self.sources.get(&codename_hash).cloned()
    }

    /// List active sources
    pub fn list_sources(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Source> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        
        self.sources
            .iter()
            .filter(|(_, s)| s.is_active)
            .skip(from as usize)
            .take(limit as usize)
            .map(|(_, s)| s.clone())
            .collect()
    }

    // ==========================================
    // POST ANCHORING
    // ==========================================

    /// Anchor a post on-chain
    pub fn anchor_post(
        &mut self,
        post_id: String,
        codename_hash: String,
        content_hash: String,
        content_cid: String,
        is_premium: bool,
        epoch: String,
        zk_proofs: Vec<String>,
    ) {
        let mut source = self.sources.get(&codename_hash)
            .expect("Source not found")
            .clone();
        require!(source.is_active, "Source is not active");
        require!(self.posts.get(&post_id).is_none(), "Post already anchored");
        
        // Validate content hash (64 char hex SHA256)
        require!(
            content_hash.len() == 64 && content_hash.chars().all(|c| c.is_ascii_hexdigit()),
            "Invalid content hash"
        );
        
        let anchor = PostAnchor {
            post_id: post_id.clone(),
            content_hash,
            content_cid,
            is_premium,
            epoch,
            created_at: U64(env::block_timestamp()),
            source_hash: codename_hash.clone(),
            zk_proofs,
        };
        
        self.posts.insert(post_id.clone(), anchor);
        
        // Add to source's posts
        if let Some(posts) = self.source_posts.get_mut(&codename_hash) {
            posts.insert(post_id.clone());
        }
        
        source.post_count += 1;
        self.sources.insert(codename_hash.clone(), source);
        
        env::log_str(&format!("Post anchored: {}", &post_id[..16.min(post_id.len())]));
    }

    /// Get post anchor
    pub fn get_post(&self, post_id: String) -> Option<PostAnchor> {
        self.posts.get(&post_id).cloned()
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
                .filter_map(|id| self.posts.get(id).cloned())
                .collect(),
            None => vec![],
        }
    }

    // ==========================================
    // ACCESS PASS NFT
    // ==========================================

    /// Mint an access pass NFT (called after payment verification)
    /// Only callable by contract owner (relayer)
    #[payable]
    pub fn mint_access_pass(
        &mut self,
        receiver_id: AccountId,
        source_hash: String,
        package_id: String,
        amount_paid_usdc_cents: u32,
    ) -> TokenId {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can mint access passes"
        );
        
        let mut source = self.sources.get(&source_hash)
            .expect("Source not found")
            .clone();
        
        // Find package
        let package = source.packages.iter()
            .find(|p| p.id == package_id)
            .expect("Package not found")
            .clone();
        
        let token_id = format!("ap-{}", self.next_token_id);
        self.next_token_id += 1;
        
        let now = env::block_timestamp();
        let duration_ns = package.duration_days as u64 * 24 * 60 * 60 * 1_000_000_000;
        let expires_at = if package.duration_days == 0 { 0 } else { now + duration_ns };
        
        // Create token
        let token = Token {
            owner_id: receiver_id.clone(),
        };
        
        // Standard NFT metadata
        let token_metadata = TokenMetadata {
            title: Some(format!("{} - {}", source_hash[..8].to_string(), package.name)),
            description: Some(format!("Access pass for {} content", package.name)),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(now.to_string()),
            expires_at: if expires_at > 0 { Some(expires_at.to_string()) } else { None },
            starts_at: Some(now.to_string()),
            updated_at: Some(now.to_string()),
            extra: None,
            reference: None,
            reference_hash: None,
        };
        
        // Access pass specific data
        let pass_data = AccessPassData {
            source_hash: source_hash.clone(),
            package_id,
            started_at: U64(now),
            expires_at: U64(expires_at),
            amount_paid_usdc_cents,
        };
        
        // Store token
        self.tokens_by_id.insert(token_id.clone(), token);
        self.token_metadata_by_id.insert(token_id.clone(), token_metadata);
        self.access_pass_data.insert(token_id.clone(), pass_data);
        
        // Add to owner's tokens
        if let Some(tokens) = self.tokens_per_owner.get_mut(&receiver_id) {
            tokens.insert(token_id.clone());
        } else {
            let mut new_set = UnorderedSet::new(StorageKey::TokenPerOwnerInner {
                account_id_hash: env::sha256(receiver_id.as_bytes()).to_vec(),
            });
            new_set.insert(token_id.clone());
            self.tokens_per_owner.insert(receiver_id.clone(), new_set);
        }
        
        // Update source subscriber count
        source.subscriber_count += 1;
        self.sources.insert(source_hash, source);
        
        env::log_str(&format!("Access pass minted: {} for {}", token_id, receiver_id));
        
        token_id
    }

    /// Check if account has valid access to a source
    pub fn has_access(&self, account_id: AccountId, source_hash: String) -> bool {
        let now = env::block_timestamp();
        
        // Get all tokens owned by account
        if let Some(tokens) = self.tokens_per_owner.get(&account_id) {
            for token_id in tokens.iter() {
                if let Some(pass_data) = self.access_pass_data.get(token_id) {
                    // Check source match
                    if pass_data.source_hash != source_hash {
                        continue;
                    }
                    // Check expiry (0 = lifetime)
                    if pass_data.expires_at.0 > 0 && pass_data.expires_at.0 < now {
                        continue;
                    }
                    // Valid access!
                    return true;
                }
            }
        }
        
        false
    }

    /// Check if account has access to a specific post (considers exclusions)
    pub fn has_post_access(&self, account_id: AccountId, post_id: String) -> bool {
        let post = match self.posts.get(&post_id) {
            Some(p) => p,
            None => return false,
        };
        
        // Free posts always accessible
        if !post.is_premium {
            return true;
        }
        
        // Check exclusions
        if let Some(exclusions) = self.post_exclusions.get(&post_id) {
            if exclusions.contains(&account_id) {
                return false; // Explicitly excluded
            }
        }
        
        // Check subscription
        self.has_access(account_id, post.source_hash.clone())
    }

    /// Get access pass data for a token
    pub fn get_access_pass(&self, token_id: TokenId) -> Option<AccessPassData> {
        self.access_pass_data.get(&token_id).cloned()
    }

    /// Get all access passes owned by an account
    pub fn get_access_passes(&self, account_id: AccountId) -> Vec<(TokenId, AccessPassData)> {
        match self.tokens_per_owner.get(&account_id) {
            Some(tokens) => tokens
                .iter()
                .filter_map(|token_id| {
                    self.access_pass_data
                        .get(token_id)
                        .map(|data| (token_id.clone(), data.clone()))
                })
                .collect(),
            None => vec![],
        }
    }

    // ==========================================
    // EXCLUSIONS (per-post access revocation)
    // ==========================================

    /// Add exclusion to a post (source only)
    pub fn add_exclusion(&mut self, post_id: String, excluded_account: AccountId) {
        // Verify post exists
        require!(self.posts.get(&post_id).is_some(), "Post not found");
        
        // TODO: Verify caller is the source (would need source -> account mapping)
        // For now, only owner can add exclusions
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can add exclusions"
        );
        
        if let Some(exclusions) = self.post_exclusions.get_mut(&post_id) {
            exclusions.insert(excluded_account.clone());
        } else {
            let mut exclusions = UnorderedSet::new(StorageKey::PostExclusionsInner {
                post_id_hash: env::sha256(post_id.as_bytes()).to_vec(),
            });
            exclusions.insert(excluded_account.clone());
            self.post_exclusions.insert(post_id.clone(), exclusions);
        }
        
        env::log_str(&format!("Exclusion added: {} from {}", excluded_account, post_id));
    }

    /// Remove exclusion from a post
    pub fn remove_exclusion(&mut self, post_id: String, excluded_account: AccountId) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can remove exclusions"
        );
        
        if let Some(exclusions) = self.post_exclusions.get_mut(&post_id) {
            exclusions.remove(&excluded_account);
        }
    }

    /// Check if account is excluded from a post
    pub fn is_excluded(&self, post_id: String, account_id: AccountId) -> bool {
        match self.post_exclusions.get(&post_id) {
            Some(exclusions) => exclusions.contains(&account_id),
            None => false,
        }
    }

    // ==========================================
    // NFT STANDARD (NEP-171 Core)
    // ==========================================

    /// Transfer NFT (NEP-171)
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        memo: Option<String>,
    ) {
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "Requires 1 yoctoNEAR"
        );
        
        let sender_id = env::predecessor_account_id();
        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        
        require!(token.owner_id == sender_id, "Not token owner");
        
        // Remove from sender
        if let Some(sender_tokens) = self.tokens_per_owner.get_mut(&sender_id) {
            sender_tokens.remove(&token_id);
        }
        
        // Add to receiver
        if let Some(receiver_tokens) = self.tokens_per_owner.get_mut(&receiver_id) {
            receiver_tokens.insert(token_id.clone());
        } else {
            let mut new_set = UnorderedSet::new(StorageKey::TokenPerOwnerInner {
                account_id_hash: env::sha256(receiver_id.as_bytes()).to_vec(),
            });
            new_set.insert(token_id.clone());
            self.tokens_per_owner.insert(receiver_id.clone(), new_set);
        }
        
        // Update token owner
        let new_token = Token { owner_id: receiver_id.clone() };
        self.tokens_by_id.insert(token_id.clone(), new_token);
        
        if let Some(m) = memo {
            env::log_str(&format!("Transfer {} to {}: {}", token_id, receiver_id, m));
        }
    }

    /// Get token info (NEP-171)
    pub fn nft_token(&self, token_id: TokenId) -> Option<serde_json::Value> {
        let token = self.tokens_by_id.get(&token_id)?;
        let metadata = self.token_metadata_by_id.get(&token_id)?;
        
        Some(serde_json::json!({
            "token_id": token_id,
            "owner_id": token.owner_id.to_string(),
            "metadata": {
                "title": metadata.title,
                "description": metadata.description,
                "issued_at": metadata.issued_at,
                "expires_at": metadata.expires_at,
            }
        }))
    }

    // ==========================================
    // NFT ENUMERATION (NEP-181)
    // ==========================================

    /// Get total supply
    pub fn nft_total_supply(&self) -> U128 {
        U128(self.tokens_by_id.len() as u128)
    }

    /// Get tokens for owner
    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<serde_json::Value> {
        let from = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50) as usize;
        
        match self.tokens_per_owner.get(&account_id) {
            Some(tokens) => tokens
                .iter()
                .skip(from)
                .take(limit)
                .filter_map(|token_id| self.nft_token(token_id.clone()))
                .collect(),
            None => vec![],
        }
    }

    // ==========================================
    // NFT METADATA (NEP-177)
    // ==========================================

    /// Get contract metadata
    pub fn nft_metadata(&self) -> Option<NFTContractMetadata> {
        self.metadata.get().as_ref().cloned()
    }

    // ==========================================
    // ADMIN
    // ==========================================

    /// Update platform fee
    pub fn set_platform_fee(&mut self, new_fee_bps: u16) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner"
        );
        require!(new_fee_bps <= 1000, "Fee cannot exceed 10%");
        self.platform_fee_bps = new_fee_bps;
    }

    /// Get contract stats
    pub fn get_stats(&self) -> serde_json::Value {
        serde_json::json!({
            "sources": self.sources.len(),
            "access_passes": self.tokens_by_id.len(),
            "platform_fee_bps": self.platform_fee_bps,
        })
    }
}
