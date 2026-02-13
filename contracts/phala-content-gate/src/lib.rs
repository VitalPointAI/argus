#![cfg_attr(not(feature = "std"), no_std, no_main)]

/// Argus Content Gate - Phala Phat Contract
/// 
/// Provides trustless content gating by:
/// 1. Storing AES decryption keys securely in TEE
/// 2. Verifying NEAR NFT ownership via RPC
/// 3. Decrypting content only for verified holders

#[pink::contract]
mod argus_content_gate {
    use pink::http_req;
    use pink::chain_extension::signing;
    use scale::{Decode, Encode};
    use alloc::string::String;
    use alloc::vec::Vec;
    use alloc::format;
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };

    #[ink(storage)]
    pub struct ArgusContentGate {
        /// Admin who can register new lists
        admin: AccountId,
        /// Map of listId -> AES-256 key (32 bytes)
        list_keys: ink::storage::Mapping<String, [u8; 32]>,
        /// NEAR RPC endpoint
        near_rpc: String,
        /// NFT contract on NEAR
        nft_contract: String,
    }

    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        /// Caller is not authorized
        Unauthorized,
        /// Signature verification failed
        InvalidSignature,
        /// User doesn't own required NFT
        NoAccess,
        /// List not found
        ListNotFound,
        /// Decryption failed
        DecryptionFailed,
        /// HTTP request failed
        HttpError,
        /// Invalid response from NEAR
        InvalidNearResponse,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    impl ArgusContentGate {
        /// Create a new content gate instance
        #[ink(constructor)]
        pub fn new() -> Self {
            let caller = Self::env().caller();
            Self {
                admin: caller,
                list_keys: Default::default(),
                near_rpc: String::from("https://rpc.mainnet.fastnear.com"),
                nft_contract: String::from("source-lists.argus-intel.near"),
            }
        }

        /// Register a new source list with its decryption key (admin only)
        /// The key is stored securely in TEE memory and never leaves
        #[ink(message)]
        pub fn register_list(&mut self, list_id: String, aes_key: [u8; 32]) -> Result<()> {
            let caller = self.env().caller();
            if caller != self.admin {
                return Err(Error::Unauthorized);
            }
            self.list_keys.insert(&list_id, &aes_key);
            Ok(())
        }

        /// Check if a list is registered
        #[ink(message)]
        pub fn has_list(&self, list_id: String) -> bool {
            self.list_keys.contains(&list_id)
        }

        /// Get decrypted content for a verified NFT holder
        /// 
        /// # Arguments
        /// * `list_id` - The source list ID
        /// * `near_account` - User's NEAR account ID
        /// * `signature` - ED25519 signature proving account ownership
        /// * `message` - The message that was signed (challenge)
        /// * `encrypted_content` - AES-256-GCM encrypted content (nonce || ciphertext || tag)
        #[ink(message)]
        pub fn decrypt_for_holder(
            &self,
            list_id: String,
            near_account: String,
            signature: Vec<u8>,
            message: Vec<u8>,
            encrypted_content: Vec<u8>,
        ) -> Result<Vec<u8>> {
            // 1. Verify the signature proves ownership of NEAR account
            // In production, we'd verify the ED25519 sig against the account's public key
            // For MVP, we trust the signature format
            if signature.len() != 64 {
                return Err(Error::InvalidSignature);
            }

            // 2. Check NFT ownership on NEAR
            if !self.check_near_nft_access(&list_id, &near_account)? {
                return Err(Error::NoAccess);
            }

            // 3. Get the decryption key from TEE storage
            let key = self.list_keys.get(&list_id)
                .ok_or(Error::ListNotFound)?;

            // 4. Decrypt the content
            self.decrypt_aes_gcm(&key, &encrypted_content)
        }

        /// Fetch and decrypt content from IPFS
        #[ink(message)]
        pub fn fetch_and_decrypt(
            &self,
            list_id: String,
            near_account: String,
            signature: Vec<u8>,
            message: Vec<u8>,
            ipfs_cid: String,
        ) -> Result<Vec<u8>> {
            // 1. Verify signature
            if signature.len() != 64 {
                return Err(Error::InvalidSignature);
            }

            // 2. Check NFT ownership
            if !self.check_near_nft_access(&list_id, &near_account)? {
                return Err(Error::NoAccess);
            }

            // 3. Fetch from IPFS
            let encrypted = self.fetch_ipfs(&ipfs_cid)?;

            // 4. Get key and decrypt
            let key = self.list_keys.get(&list_id)
                .ok_or(Error::ListNotFound)?;
            
            self.decrypt_aes_gcm(&key, &encrypted)
        }

        /// Check if account has access to a list via NEAR RPC
        fn check_near_nft_access(&self, list_id: &str, account: &str) -> Result<bool> {
            // Build the RPC request
            let args = format!(r#"{{"list_id":"{}","account_id":"{}"}}"#, list_id, account);
            let args_b64 = base64::encode(&args);
            
            let body = format!(r#"{{
                "jsonrpc": "2.0",
                "id": "1",
                "method": "query",
                "params": {{
                    "request_type": "call_function",
                    "finality": "final",
                    "account_id": "{}",
                    "method_name": "has_access",
                    "args_base64": "{}"
                }}
            }}"#, self.nft_contract, args_b64);

            // Make HTTP request to NEAR RPC
            let response = http_req!(
                "POST",
                &self.near_rpc,
                body.into_bytes(),
                vec![("Content-Type".into(), "application/json".into())]
            );

            if response.status_code != 200 {
                return Err(Error::HttpError);
            }

            // Parse response - look for "result" containing true
            let body_str = String::from_utf8_lossy(&response.body);
            
            // Simple check - in production use proper JSON parsing
            if body_str.contains("\"result\"") {
                // Decode the base64 result
                // If it contains "true" the user has access
                Ok(body_str.contains("dHJ1ZQ") || body_str.contains("true"))
            } else {
                Err(Error::InvalidNearResponse)
            }
        }

        /// Fetch content from IPFS gateway
        fn fetch_ipfs(&self, cid: &str) -> Result<Vec<u8>> {
            let url = format!("https://ipfs.io/ipfs/{}", cid);
            
            let response = http_req!(
                "GET",
                &url,
                vec![],
                vec![]
            );

            if response.status_code != 200 {
                return Err(Error::HttpError);
            }

            Ok(response.body)
        }

        /// Decrypt AES-256-GCM encrypted data
        /// Format: nonce (12 bytes) || ciphertext || tag (16 bytes)
        fn decrypt_aes_gcm(&self, key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
            if data.len() < 28 {
                return Err(Error::DecryptionFailed);
            }

            let cipher = Aes256Gcm::new_from_slice(key)
                .map_err(|_| Error::DecryptionFailed)?;
            
            let nonce = Nonce::from_slice(&data[..12]);
            let ciphertext = &data[12..];

            cipher.decrypt(nonce, ciphertext)
                .map_err(|_| Error::DecryptionFailed)
        }

        /// Update NEAR RPC endpoint (admin only)
        #[ink(message)]
        pub fn set_near_rpc(&mut self, rpc_url: String) -> Result<()> {
            if self.env().caller() != self.admin {
                return Err(Error::Unauthorized);
            }
            self.near_rpc = rpc_url;
            Ok(())
        }

        /// Update NFT contract address (admin only)
        #[ink(message)]
        pub fn set_nft_contract(&mut self, contract: String) -> Result<()> {
            if self.env().caller() != self.admin {
                return Err(Error::Unauthorized);
            }
            self.nft_contract = contract;
            Ok(())
        }

        /// Transfer admin role
        #[ink(message)]
        pub fn transfer_admin(&mut self, new_admin: AccountId) -> Result<()> {
            if self.env().caller() != self.admin {
                return Err(Error::Unauthorized);
            }
            self.admin = new_admin;
            Ok(())
        }

        /// Get current admin
        #[ink(message)]
        pub fn get_admin(&self) -> AccountId {
            self.admin
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[ink::test]
        fn new_works() {
            let contract = ArgusContentGate::new();
            assert_eq!(contract.has_list("test".into()), false);
        }

        #[ink::test]
        fn register_list_works() {
            let mut contract = ArgusContentGate::new();
            let key = [0u8; 32];
            assert!(contract.register_list("list1".into(), key).is_ok());
            assert!(contract.has_list("list1".into()));
        }

        #[ink::test]
        fn decrypt_works() {
            let contract = ArgusContentGate::new();
            
            // Test AES decryption with known values
            let key = [0u8; 32];
            let nonce = [1u8; 12];
            
            // Create test encrypted data
            use aes_gcm::aead::Aead;
            let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
            let plaintext = b"Hello, World!";
            let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce), plaintext.as_ref()).unwrap();
            
            let mut encrypted = Vec::new();
            encrypted.extend_from_slice(&nonce);
            encrypted.extend_from_slice(&ciphertext);
            
            let result = contract.decrypt_aes_gcm(&key, &encrypted);
            assert!(result.is_ok());
            assert_eq!(result.unwrap(), plaintext);
        }
    }
}
