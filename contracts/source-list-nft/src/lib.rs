use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LazyOption, LookupMap, UnorderedMap, UnorderedSet};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near_bindgen, require, AccountId, Balance, BorshStorageKey, 
    PanicOnDefault, Promise, PromiseOrValue,
};

/// NEP-171 compliant NFT for Source Lists
/// 
/// Each NFT represents ownership of a curated source list.
/// The list data is stored encrypted on IPFS, referenced by CID.
/// Owners can monetize their lists by selling the NFT.

pub type TokenId = String;

#[derive(BorshSerialize, BorshStorageKey)]
pub enum StorageKey {
    TokensPerOwner,
    TokenPerOwnerInner { account_id_hash: Vec<u8> },
    TokensById,
    TokenMetadataById,
    NFTContractMetadata,
    ListMetadata,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct NFTContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
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
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct SourceListMetadata {
    /// IPFS CID of the encrypted source list data
    pub cid: String,
    /// Number of sources in the list
    pub source_count: u32,
    /// Domain/category of the list
    pub domain: String,
    /// Creator of the list
    pub creator: AccountId,
    /// Whether the list is actively maintained
    pub is_active: bool,
    /// Last update timestamp
    pub updated_at: U64,
    /// Price for access (if selling)
    pub price: Option<U128>,
    /// Royalty percentage for creator (0-100)
    pub royalty_percent: u8,
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct Token {
    pub owner_id: AccountId,
    pub approved_account_ids: LookupMap<AccountId, u64>,
    pub next_approval_id: u64,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct SourceListNFT {
    pub owner_id: AccountId,
    pub tokens_per_owner: LookupMap<AccountId, UnorderedSet<TokenId>>,
    pub tokens_by_id: UnorderedMap<TokenId, Token>,
    pub token_metadata_by_id: UnorderedMap<TokenId, TokenMetadata>,
    pub list_metadata_by_id: UnorderedMap<TokenId, SourceListMetadata>,
    pub metadata: LazyOption<NFTContractMetadata>,
    pub next_token_id: u64,
}

#[near_bindgen]
impl SourceListNFT {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        let metadata = NFTContractMetadata {
            spec: "nft-1.0.0".to_string(),
            name: "Argus Source Lists".to_string(),
            symbol: "ASRC".to_string(),
            icon: None,
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
            metadata: LazyOption::new(StorageKey::NFTContractMetadata, Some(&metadata)),
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
        royalty_percent: u8,
    ) -> TokenId {
        let owner_id = env::predecessor_account_id();
        let token_id = format!("srclist-{}", self.next_token_id);
        self.next_token_id += 1;

        require!(royalty_percent <= 100, "Royalty cannot exceed 100%");

        // Create token
        let token = Token {
            owner_id: owner_id.clone(),
            approved_account_ids: LookupMap::new(
                StorageKey::TokenPerOwnerInner {
                    account_id_hash: env::sha256(owner_id.as_bytes()),
                },
            ),
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
            extra: None,
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
            royalty_percent,
        };

        // Store everything
        self.tokens_by_id.insert(&token_id, &token);
        self.token_metadata_by_id.insert(&token_id, &token_metadata);
        self.list_metadata_by_id.insert(&token_id, &list_metadata);

        // Add to owner's set
        let mut tokens_set = self
            .tokens_per_owner
            .get(&owner_id)
            .unwrap_or_else(|| UnorderedSet::new(
                StorageKey::TokenPerOwnerInner {
                    account_id_hash: env::sha256(owner_id.as_bytes()),
                },
            ));
        tokens_set.insert(&token_id);
        self.tokens_per_owner.insert(&owner_id, &tokens_set);

        env::log_str(&format!(
            "Minted source list NFT {} for {} - {} sources in {}",
            token_id, owner_id, source_count, list_metadata.domain
        ));

        token_id
    }

    /// Update the source list CID (only owner)
    pub fn update_list(&mut self, token_id: TokenId, new_cid: String, new_source_count: u32) {
        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        require!(
            token.owner_id == env::predecessor_account_id(),
            "Only owner can update"
        );

        let mut list_metadata = self.list_metadata_by_id.get(&token_id).expect("Metadata not found");
        list_metadata.cid = new_cid;
        list_metadata.source_count = new_source_count;
        list_metadata.updated_at = U64(env::block_timestamp());
        self.list_metadata_by_id.insert(&token_id, &list_metadata);

        env::log_str(&format!("Updated source list {}", token_id));
    }

    /// Set price for the NFT
    pub fn set_price(&mut self, token_id: TokenId, price: Option<U128>) {
        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        require!(
            token.owner_id == env::predecessor_account_id(),
            "Only owner can set price"
        );

        let mut list_metadata = self.list_metadata_by_id.get(&token_id).expect("Metadata not found");
        list_metadata.price = price;
        self.list_metadata_by_id.insert(&token_id, &list_metadata);
    }

    /// Purchase a source list NFT
    #[payable]
    pub fn purchase(&mut self, token_id: TokenId) -> Promise {
        let buyer = env::predecessor_account_id();
        let deposit = env::attached_deposit();

        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        let list_metadata = self.list_metadata_by_id.get(&token_id).expect("Metadata not found");
        
        let price = list_metadata.price.expect("NFT not for sale");
        require!(deposit >= price.0, "Insufficient deposit");

        let seller = token.owner_id.clone();
        require!(seller != buyer, "Cannot buy your own NFT");

        // Calculate royalty
        let royalty_amount = (price.0 * list_metadata.royalty_percent as u128) / 100;
        let seller_amount = price.0 - royalty_amount;

        // Transfer NFT
        self.internal_transfer(&seller, &buyer, &token_id);

        // Pay seller and creator
        let mut promises = Promise::new(seller).transfer(seller_amount);
        
        if royalty_amount > 0 && list_metadata.creator != seller {
            promises = promises.and(Promise::new(list_metadata.creator).transfer(royalty_amount));
        }

        promises
    }

    /// Get source list metadata
    pub fn get_list_metadata(&self, token_id: TokenId) -> Option<SourceListMetadata> {
        self.list_metadata_by_id.get(&token_id)
    }

    /// Check if account owns a specific list (for access control)
    pub fn has_access(&self, account_id: AccountId, token_id: TokenId) -> bool {
        if let Some(token) = self.tokens_by_id.get(&token_id) {
            token.owner_id == account_id
        } else {
            false
        }
    }

    /// Get all lists owned by an account
    pub fn get_lists_for_owner(&self, account_id: AccountId) -> Vec<TokenId> {
        self.tokens_per_owner
            .get(&account_id)
            .map(|set| set.to_vec())
            .unwrap_or_default()
    }

    // Internal transfer helper
    fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, token_id: &TokenId) {
        // Remove from old owner
        let mut from_tokens = self.tokens_per_owner.get(from).expect("Owner not found");
        from_tokens.remove(token_id);
        self.tokens_per_owner.insert(from, &from_tokens);

        // Add to new owner
        let mut to_tokens = self.tokens_per_owner.get(to).unwrap_or_else(|| {
            UnorderedSet::new(StorageKey::TokenPerOwnerInner {
                account_id_hash: env::sha256(to.as_bytes()),
            })
        });
        to_tokens.insert(token_id);
        self.tokens_per_owner.insert(to, &to_tokens);

        // Update token owner
        let mut token = self.tokens_by_id.get(token_id).expect("Token not found");
        token.owner_id = to.clone();
        self.tokens_by_id.insert(token_id, &token);
    }

    // === NEP-171 Standard Methods ===

    pub fn nft_token(&self, token_id: TokenId) -> Option<JsonToken> {
        let token = self.tokens_by_id.get(&token_id)?;
        let metadata = self.token_metadata_by_id.get(&token_id)?;
        
        Some(JsonToken {
            token_id,
            owner_id: token.owner_id,
            metadata,
        })
    }

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
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
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct JsonToken {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub metadata: TokenMetadata,
}
