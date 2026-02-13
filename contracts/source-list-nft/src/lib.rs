use near_sdk::store::{LookupMap, UnorderedMap, UnorderedSet, LazyOption};
use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

/// NEP-171 compliant NFT for Source Lists
/// 
/// Each NFT represents ownership of a curated source list.
/// The list data is stored encrypted on IPFS, referenced by CID.
/// Owners can monetize their lists by selling the NFT.

pub type TokenId = String;

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    TokensPerOwner,
    TokenPerOwnerInner { account_id_hash: Vec<u8> },
    TokensById,
    TokenMetadataById,
    NFTContractMetadata,
    ListMetadata,
    ApprovedAccounts { token_id_hash: Vec<u8> },
}

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

/// Source list specific metadata
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct SourceListMetadata {
    /// IPFS CID of the encrypted source list data
    pub cid: String,
    /// Number of sources in the list
    pub source_count: u32,
    /// Domain/category of the list
    pub domain: String,
    /// Creator of the list (for royalties)
    pub creator: AccountId,
    /// Whether the list is actively maintained
    pub is_active: bool,
    /// Last update timestamp
    pub updated_at: U64,
    /// Price for purchase (in yoctoNEAR, None = not for sale)
    pub price: Option<U128>,
    /// Royalty percentage for original creator (0-100)
    pub royalty_percent: u8,
    /// Total subscriptions/clones
    pub total_subscribers: u32,
    /// Average rating (0-500 for 0.0-5.0 stars)
    pub avg_rating: u16,
    /// Number of ratings
    pub rating_count: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Token {
    pub owner_id: AccountId,
    pub next_approval_id: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SourceListNFT {
    pub owner_id: AccountId,
    pub tokens_per_owner: LookupMap<AccountId, UnorderedSet<TokenId>>,
    pub tokens_by_id: UnorderedMap<TokenId, Token>,
    pub token_metadata_by_id: UnorderedMap<TokenId, TokenMetadata>,
    pub list_metadata_by_id: UnorderedMap<TokenId, SourceListMetadata>,
    pub approved_accounts: LookupMap<TokenId, LookupMap<AccountId, u64>>,
    pub metadata: LazyOption<NFTContractMetadata>,
    pub next_token_id: u64,
}

#[near]
impl SourceListNFT {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        let metadata = NFTContractMetadata {
            spec: "nft-1.0.0".to_string(),
            name: "Argus Source Lists".to_string(),
            symbol: "ASRC".to_string(),
            icon: Some("https://argus.vitalpoint.ai/icon.png".to_string()),
            base_uri: Some("https://argus.vitalpoint.ai/api/nft".to_string()),
            reference: None,
            reference_hash: None,
        };

        Self {
            owner_id,
            tokens_per_owner: LookupMap::new(StorageKey::TokensPerOwner),
            tokens_by_id: UnorderedMap::new(StorageKey::TokensById),
            token_metadata_by_id: UnorderedMap::new(StorageKey::TokenMetadataById),
            list_metadata_by_id: UnorderedMap::new(StorageKey::ListMetadata),
            approved_accounts: LookupMap::new(StorageKey::ApprovedAccounts { token_id_hash: vec![] }),
            metadata: LazyOption::new(StorageKey::NFTContractMetadata, Some(metadata)),
            next_token_id: 1,
        }
    }

    /// Mint a new source list NFT
    #[payable]
    pub fn mint(
        &mut self,
        name: String,
        description: String,
        cid: String,
        source_count: u32,
        domain: String,
        price: Option<U128>,
        royalty_percent: Option<u8>,
    ) -> TokenId {
        let owner_id = env::predecessor_account_id();
        let token_id = format!("srclist-{}", self.next_token_id);
        self.next_token_id += 1;

        let royalty = royalty_percent.unwrap_or(10); // Default 10% royalty
        require!(royalty <= 50, "Royalty cannot exceed 50%");

        // Create token
        let token = Token {
            owner_id: owner_id.clone(),
            next_approval_id: 0,
        };

        // Standard NFT metadata
        let token_metadata = TokenMetadata {
            title: Some(name.clone()),
            description: Some(description),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp().to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: Some(env::block_timestamp().to_string()),
            extra: Some(format!("{{\"domain\":\"{}\",\"sources\":{}}}", domain, source_count)),
            reference: Some(format!("ipfs://{}", cid)),
            reference_hash: None,
        };

        // Source list specific metadata
        let list_metadata = SourceListMetadata {
            cid,
            source_count,
            domain,
            creator: owner_id.clone(),
            is_active: true,
            updated_at: U64(env::block_timestamp()),
            price,
            royalty_percent: royalty,
            total_subscribers: 0,
            avg_rating: 0,
            rating_count: 0,
        };

        // Store everything
        self.tokens_by_id.insert(token_id.clone(), token);
        self.token_metadata_by_id.insert(token_id.clone(), token_metadata);
        self.list_metadata_by_id.insert(token_id.clone(), list_metadata);

        // Add to owner's set
        if let Some(tokens_set) = self.tokens_per_owner.get_mut(&owner_id) {
            tokens_set.insert(token_id.clone());
        } else {
            let mut new_set = UnorderedSet::new(StorageKey::TokenPerOwnerInner {
                account_id_hash: env::sha256(owner_id.as_bytes()).to_vec(),
            });
            new_set.insert(token_id.clone());
            self.tokens_per_owner.insert(owner_id.clone(), new_set);
        }

        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_mint\",\"data\":[{{\"owner_id\":\"{}\",\"token_ids\":[\"{}\"]}}]}}",
            owner_id, token_id
        ));

        token_id
    }

    /// Update the source list CID (only owner can update)
    pub fn update_list(&mut self, token_id: TokenId, new_cid: String, new_source_count: u32) {
        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        require!(
            token.owner_id == env::predecessor_account_id(),
            "Only owner can update"
        );

        let mut list_metadata = self.list_metadata_by_id.get(&token_id).expect("Metadata not found").clone();
        list_metadata.cid = new_cid;
        list_metadata.source_count = new_source_count;
        list_metadata.updated_at = U64(env::block_timestamp());
        self.list_metadata_by_id.insert(token_id.clone(), list_metadata);

        env::log_str(&format!("Updated source list {}", token_id));
    }

    /// Set price for the NFT (None = not for sale)
    pub fn set_price(&mut self, token_id: TokenId, price: Option<U128>) {
        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        require!(
            token.owner_id == env::predecessor_account_id(),
            "Only owner can set price"
        );

        let mut list_metadata = self.list_metadata_by_id.get(&token_id).expect("Metadata not found").clone();
        list_metadata.price = price;
        self.list_metadata_by_id.insert(token_id, list_metadata);
    }

    /// Rate a source list (1-5 stars, stored as 100-500)
    pub fn rate_list(&mut self, token_id: TokenId, rating: u8) {
        require!(rating >= 1 && rating <= 5, "Rating must be 1-5");
        
        let mut list_metadata = self.list_metadata_by_id.get(&token_id).expect("Token not found").clone();
        
        // Calculate new average (rating stored as 100-500)
        let new_rating = rating as u32 * 100;
        let total = (list_metadata.avg_rating as u32 * list_metadata.rating_count) + new_rating;
        list_metadata.rating_count += 1;
        list_metadata.avg_rating = (total / list_metadata.rating_count) as u16;
        
        self.list_metadata_by_id.insert(token_id, list_metadata);
    }

    /// Purchase a source list NFT
    #[payable]
    pub fn purchase(&mut self, token_id: TokenId) -> Promise {
        let buyer = env::predecessor_account_id();
        let deposit = env::attached_deposit();

        let token = self.tokens_by_id.get(&token_id).expect("Token not found").clone();
        let list_metadata = self.list_metadata_by_id.get(&token_id).expect("Metadata not found").clone();
        
        let price_u128 = list_metadata.price.expect("NFT not for sale");
        let price = NearToken::from_yoctonear(price_u128.0);
        require!(deposit >= price, "Insufficient deposit");

        let seller = token.owner_id.clone();
        require!(seller != buyer, "Cannot buy your own NFT");

        // Calculate royalty for original creator
        let royalty_amount = price.as_yoctonear() * list_metadata.royalty_percent as u128 / 100;
        let seller_amount = price.as_yoctonear() - royalty_amount;
        let creator = list_metadata.creator.clone();

        // Transfer NFT ownership
        self.internal_transfer(&seller, &buyer, &token_id);

        // Log transfer event
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_transfer\",\"data\":[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":[\"{}\"]}}]}}",
            seller, buyer, token_id
        ));

        // Pay seller
        let mut promise = Promise::new(seller.clone()).transfer(NearToken::from_yoctonear(seller_amount));
        
        // Pay royalty to creator if different from seller
        if royalty_amount > 0 && creator != seller {
            promise = promise.and(Promise::new(creator).transfer(NearToken::from_yoctonear(royalty_amount)));
        }

        promise
    }

    /// Get source list metadata
    pub fn get_list_metadata(&self, token_id: TokenId) -> Option<SourceListMetadata> {
        self.list_metadata_by_id.get(&token_id).cloned()
    }

    /// Get all lists (paginated)
    pub fn get_all_lists(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<(TokenId, SourceListMetadata)> {
        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        
        self.list_metadata_by_id
            .iter()
            .skip(start as usize)
            .take(limit as usize)
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    /// Get lists for sale
    pub fn get_lists_for_sale(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<(TokenId, SourceListMetadata)> {
        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        
        self.list_metadata_by_id
            .iter()
            .filter(|(_, v)| v.price.is_some())
            .skip(start as usize)
            .take(limit as usize)
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    /// Check if account owns a specific list (for access control)
    pub fn has_access(&self, account_id: AccountId, token_id: TokenId) -> bool {
        self.tokens_by_id
            .get(&token_id)
            .map(|t| t.owner_id == account_id)
            .unwrap_or(false)
    }

    /// Get all lists owned by an account
    pub fn get_lists_for_owner(&self, account_id: AccountId) -> Vec<TokenId> {
        self.tokens_per_owner
            .get(&account_id)
            .map(|set| set.iter().cloned().collect())
            .unwrap_or_default()
    }

    // Internal transfer helper
    fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, token_id: &TokenId) {
        // Remove from old owner using get_mut
        if let Some(from_tokens) = self.tokens_per_owner.get_mut(from) {
            from_tokens.remove(token_id);
        }

        // Add to new owner
        if let Some(to_tokens) = self.tokens_per_owner.get_mut(to) {
            to_tokens.insert(token_id.clone());
        } else {
            let mut new_set = UnorderedSet::new(StorageKey::TokenPerOwnerInner {
                account_id_hash: env::sha256(to.as_bytes()).to_vec(),
            });
            new_set.insert(token_id.clone());
            self.tokens_per_owner.insert(to.clone(), new_set);
        }

        // Update token owner using get_mut
        if let Some(token) = self.tokens_by_id.get_mut(token_id) {
            token.owner_id = to.clone();
        }
    }

    // === NEP-171 Standard Methods ===

    pub fn nft_token(&self, token_id: TokenId) -> Option<JsonToken> {
        let token = self.tokens_by_id.get(&token_id)?;
        let metadata = self.token_metadata_by_id.get(&token_id)?;
        
        Some(JsonToken {
            token_id,
            owner_id: token.owner_id.clone(),
            metadata: metadata.clone(),
        })
    }

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        match self.metadata.get() {
            Some(m) => m.clone(),
            None => panic!("Metadata not initialized"),
        }
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128(self.tokens_by_id.len() as u128)
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens_per_owner
            .get(&account_id)
            .map(|set| U128(set.len() as u128))
            .unwrap_or(U128(0))
    }

    /// NEP-171: Transfer token
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        _approval_id: Option<u64>,
        _memo: Option<String>,
    ) {
        let sender = env::predecessor_account_id();
        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        require!(token.owner_id == sender, "Not token owner");
        
        self.internal_transfer(&sender, &receiver_id, &token_id);
        
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_transfer\",\"data\":[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":[\"{}\"]}}]}}",
            sender, receiver_id, token_id
        ));
    }

    /// Get tokens for owner (paginated)
    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<JsonToken> {
        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.tokens_per_owner
            .get(&account_id)
            .map(|token_set| {
                token_set
                    .iter()
                    .skip(start)
                    .take(limit)
                    .filter_map(|token_id| self.nft_token(token_id.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }
}

#[near(serializers = [json])]
pub struct JsonToken {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub metadata: TokenMetadata,
}
