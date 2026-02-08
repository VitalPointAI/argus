use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U64;
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault};

/// User data registry - maps NEAR accounts to their IPFS data CIDs
/// 
/// Each user controls their own data entry via their NEAR account.
/// The CID points to an encrypted UserDataStore on IPFS.
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct DataRegistry {
    /// Maps account_id -> DataEntry
    entries: LookupMap<AccountId, DataEntry>,
    /// Total number of registered users
    total_users: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct DataEntry {
    /// IPFS CID of the UserDataStore
    pub cid: String,
    /// Version number (increments on each update)
    pub version: u64,
    /// Block timestamp of last update
    pub updated_at: U64,
    /// Data hash for verification
    pub data_hash: String,
    /// Public key for encryption (base64 encoded)
    pub public_key: String,
}

#[near_bindgen]
impl DataRegistry {
    #[init]
    pub fn new() -> Self {
        Self {
            entries: LookupMap::new(b"e"),
            total_users: 0,
        }
    }

    /// Register or update user's data CID
    /// Only the account owner can update their entry
    pub fn set_data(
        &mut self,
        cid: String,
        data_hash: String,
        public_key: String,
    ) {
        let account_id = env::predecessor_account_id();
        
        let entry = if let Some(existing) = self.entries.get(&account_id) {
            DataEntry {
                cid,
                version: existing.version + 1,
                updated_at: U64(env::block_timestamp()),
                data_hash,
                public_key,
            }
        } else {
            self.total_users += 1;
            DataEntry {
                cid,
                version: 1,
                updated_at: U64(env::block_timestamp()),
                data_hash,
                public_key,
            }
        };
        
        self.entries.insert(&account_id, &entry);
        
        env::log_str(&format!(
            "Data updated for {} - CID: {}, Version: {}",
            account_id, entry.cid, entry.version
        ));
    }

    /// Get user's data entry
    pub fn get_data(&self, account_id: AccountId) -> Option<DataEntry> {
        self.entries.get(&account_id)
    }

    /// Get just the CID (convenience method)
    pub fn get_cid(&self, account_id: AccountId) -> Option<String> {
        self.entries.get(&account_id).map(|e| e.cid)
    }

    /// Get user's public key for encryption
    pub fn get_public_key(&self, account_id: AccountId) -> Option<String> {
        self.entries.get(&account_id).map(|e| e.public_key)
    }

    /// Delete user's data entry (revoke)
    /// Only the account owner can delete their entry
    pub fn delete_data(&mut self) -> bool {
        let account_id = env::predecessor_account_id();
        
        if self.entries.remove(&account_id).is_some() {
            self.total_users = self.total_users.saturating_sub(1);
            env::log_str(&format!("Data deleted for {}", account_id));
            true
        } else {
            false
        }
    }

    /// Check if user has registered data
    pub fn has_data(&self, account_id: AccountId) -> bool {
        self.entries.contains_key(&account_id)
    }

    /// Get total registered users
    pub fn get_total_users(&self) -> u64 {
        self.total_users
    }

    /// Get data version for an account
    pub fn get_version(&self, account_id: AccountId) -> u64 {
        self.entries.get(&account_id).map(|e| e.version).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_set_and_get_data() {
        let alice: AccountId = "alice.near".parse().unwrap();
        let context = get_context(alice.clone());
        testing_env!(context.build());

        let mut contract = DataRegistry::new();
        
        contract.set_data(
            "QmTest123".to_string(),
            "abc123hash".to_string(),
            "pubkey123".to_string(),
        );

        let entry = contract.get_data(alice.clone()).unwrap();
        assert_eq!(entry.cid, "QmTest123");
        assert_eq!(entry.version, 1);
        assert_eq!(entry.data_hash, "abc123hash");
        assert_eq!(contract.get_total_users(), 1);
    }

    #[test]
    fn test_update_increments_version() {
        let alice: AccountId = "alice.near".parse().unwrap();
        let context = get_context(alice.clone());
        testing_env!(context.build());

        let mut contract = DataRegistry::new();
        
        contract.set_data("QmFirst".to_string(), "hash1".to_string(), "pk1".to_string());
        contract.set_data("QmSecond".to_string(), "hash2".to_string(), "pk2".to_string());

        let entry = contract.get_data(alice).unwrap();
        assert_eq!(entry.cid, "QmSecond");
        assert_eq!(entry.version, 2);
    }

    #[test]
    fn test_delete_data() {
        let alice: AccountId = "alice.near".parse().unwrap();
        let context = get_context(alice.clone());
        testing_env!(context.build());

        let mut contract = DataRegistry::new();
        
        contract.set_data("QmTest".to_string(), "hash".to_string(), "pk".to_string());
        assert!(contract.has_data(alice.clone()));
        
        contract.delete_data();
        assert!(!contract.has_data(alice));
        assert_eq!(contract.get_total_users(), 0);
    }
}
