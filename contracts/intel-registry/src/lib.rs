use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap, Vector};
use near_sdk::json_types::U64;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, BorshStorageKey};

/// Intel Registry - On-chain verification for HUMINT intelligence proofs
/// 
/// Hybrid verification model:
/// - ZK proofs generated client-side (private data stays local)
/// - Only commitments stored on-chain (cheap, immutable)
/// - Third-party attestations for additional trust
/// - Immutable timestamp via block height
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct IntelRegistry {
    /// All proof commitments by ID
    proofs: UnorderedMap<String, ProofCommitment>,
    /// Attestations for each proof
    attestations: LookupMap<String, Vector<Attestation>>,
    /// Source statistics (by source_hash)
    source_stats: LookupMap<String, SourceStats>,
    /// Intel hash -> proof IDs (multiple proofs can verify same intel)
    intel_proofs: LookupMap<String, Vector<String>>,
    /// Total proofs registered
    total_proofs: u64,
    /// Total attestations
    total_attestations: u64,
    /// Contract owner (for admin functions)
    owner: AccountId,
}

#[derive(BorshStorageKey, BorshSerialize)]
enum StorageKey {
    Proofs,
    Attestations,
    AttestationVector { proof_id: String },
    SourceStats,
    IntelProofs,
    IntelProofVector { intel_hash: String },
}

/// Proof types supported by the system
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub enum ProofType {
    /// Proves location within radius of coordinates
    LocationProximity,
    /// Proves timestamp within a range
    TimestampRange,
    /// Proves document contains keywords
    DocumentContains,
    /// Proves image metadata (EXIF)
    ImageMetadata,
    /// Multiple sources corroborate
    MultiSourceCorroboration,
    /// Verifiable credential (e.g., press pass)
    VerifiableCredential,
    /// Satellite imagery match
    SatelliteImagery,
    /// Network membership proof
    NetworkMembership,
    /// Financial threshold proof
    FinancialThreshold,
    /// Generic commitment (fallback)
    GenericCommitment,
}

/// A proof commitment stored on-chain
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct ProofCommitment {
    /// Unique proof ID (UUID or hash)
    pub proof_id: String,
    /// SHA-256 commitment = hash(proof || publicInputs || sourceId)
    pub commitment: String,
    /// Type of proof
    pub proof_type: ProofType,
    /// Hash of source codename (privacy-preserving)
    pub source_hash: String,
    /// Hash of intel submission this proves
    pub intel_hash: String,
    /// Hash of public inputs (for verification)
    pub public_inputs_hash: String,
    /// Block height when registered (immutable timestamp)
    pub block_height: U64,
    /// Block timestamp in nanoseconds
    pub timestamp_ns: U64,
    /// Optional metadata (JSON string, max 500 chars)
    pub metadata: Option<String>,
    /// Verification status
    pub status: VerificationStatus,
    /// Number of attestations received
    pub attestation_count: u32,
    /// Average attestation confidence (0-100)
    pub avg_confidence: u8,
}

/// Verification status of a proof
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub enum VerificationStatus {
    /// Just registered, no attestations
    Pending,
    /// Has attestations, confidence >= 70
    Verified,
    /// Has attestations, confidence < 70
    Contested,
    /// Proven false by counter-evidence
    Refuted,
}

/// Third-party attestation
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Attestation {
    /// NEAR account of attestor
    pub attestor: AccountId,
    /// Confidence level 1-100
    pub confidence: u8,
    /// Block height when attested
    pub block_height: U64,
    /// Optional note (max 200 chars)
    pub note: Option<String>,
}

/// Aggregated statistics for a source
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Default)]
#[serde(crate = "near_sdk::serde")]
pub struct SourceStats {
    /// Total proofs submitted
    pub total_proofs: u64,
    /// Total attestations received across all proofs
    pub total_attestations: u64,
    /// Sum of all confidence scores (for averaging)
    pub confidence_sum: u64,
    /// Number of verified proofs (status = Verified)
    pub verified_count: u64,
    /// Number of refuted proofs
    pub refuted_count: u64,
    /// First proof block height
    pub first_proof_height: U64,
    /// Most recent proof block height
    pub last_proof_height: U64,
}

/// View response for proof with attestations
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ProofWithAttestations {
    pub proof: ProofCommitment,
    pub attestations: Vec<Attestation>,
}

#[near_bindgen]
impl IntelRegistry {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            proofs: UnorderedMap::new(StorageKey::Proofs),
            attestations: LookupMap::new(StorageKey::Attestations),
            source_stats: LookupMap::new(StorageKey::SourceStats),
            intel_proofs: LookupMap::new(StorageKey::IntelProofs),
            total_proofs: 0,
            total_attestations: 0,
            owner,
        }
    }

    /// Register a new proof commitment
    /// 
    /// # Arguments
    /// * `proof_id` - Unique identifier (UUID recommended)
    /// * `commitment` - SHA-256 hash of (proof || publicInputs || sourceId)
    /// * `proof_type` - Type of ZK proof
    /// * `source_hash` - Hash of source codename
    /// * `intel_hash` - Hash of intel submission
    /// * `public_inputs_hash` - Hash of public inputs
    /// * `metadata` - Optional JSON metadata (max 500 chars)
    #[payable]
    pub fn register_proof(
        &mut self,
        proof_id: String,
        commitment: String,
        proof_type: ProofType,
        source_hash: String,
        intel_hash: String,
        public_inputs_hash: String,
        metadata: Option<String>,
    ) -> ProofCommitment {
        // Validate inputs
        assert!(proof_id.len() <= 64, "proof_id too long");
        assert!(commitment.len() == 64, "commitment must be 64 hex chars (SHA-256)");
        assert!(source_hash.len() == 64, "source_hash must be 64 hex chars");
        assert!(intel_hash.len() == 64, "intel_hash must be 64 hex chars");
        assert!(public_inputs_hash.len() == 64, "public_inputs_hash must be 64 hex chars");
        assert!(!self.proofs.get(&proof_id).is_some(), "proof_id already exists");
        
        if let Some(ref m) = metadata {
            assert!(m.len() <= 500, "metadata too long (max 500 chars)");
        }

        let proof = ProofCommitment {
            proof_id: proof_id.clone(),
            commitment,
            proof_type,
            source_hash: source_hash.clone(),
            intel_hash: intel_hash.clone(),
            public_inputs_hash,
            block_height: U64(env::block_height()),
            timestamp_ns: U64(env::block_timestamp()),
            metadata,
            status: VerificationStatus::Pending,
            attestation_count: 0,
            avg_confidence: 0,
        };

        // Store proof
        self.proofs.insert(&proof_id, &proof);
        self.total_proofs += 1;

        // Initialize attestations vector
        self.attestations.insert(
            &proof_id,
            &Vector::new(StorageKey::AttestationVector { proof_id: proof_id.clone() }),
        );

        // Link intel to proof
        let mut intel_proof_ids = self.intel_proofs
            .get(&intel_hash)
            .unwrap_or_else(|| Vector::new(StorageKey::IntelProofVector { intel_hash: intel_hash.clone() }));
        intel_proof_ids.push(&proof_id);
        self.intel_proofs.insert(&intel_hash, &intel_proof_ids);

        // Update source stats
        let mut stats = self.source_stats.get(&source_hash).unwrap_or_default();
        if stats.total_proofs == 0 {
            stats.first_proof_height = U64(env::block_height());
        }
        stats.total_proofs += 1;
        stats.last_proof_height = U64(env::block_height());
        self.source_stats.insert(&source_hash, &stats);

        env::log_str(&format!(
            "Proof registered: {} by source {} for intel {}",
            proof_id, &source_hash[..8], &intel_hash[..8]
        ));

        proof
    }

    /// Add attestation to a proof
    /// 
    /// Any NEAR account can attest to verify or contest a proof.
    /// Multiple attestations from same account update the previous one.
    #[payable]
    pub fn attest(
        &mut self,
        proof_id: String,
        confidence: u8,
        note: Option<String>,
    ) {
        assert!(confidence >= 1 && confidence <= 100, "confidence must be 1-100");
        
        if let Some(ref n) = note {
            assert!(n.len() <= 200, "note too long (max 200 chars)");
        }

        let mut proof = self.proofs.get(&proof_id).expect("proof not found");
        let attestor = env::predecessor_account_id();

        let attestation = Attestation {
            attestor: attestor.clone(),
            confidence,
            block_height: U64(env::block_height()),
            note,
        };

        // Get attestations vector
        let mut attestations_vec = self.attestations.get(&proof_id).expect("attestations not found");
        
        // Check for existing attestation from same account (update if exists)
        let mut found = false;
        let len = attestations_vec.len();
        for i in 0..len {
            if let Some(existing) = attestations_vec.get(i) {
                if existing.attestor == attestor {
                    attestations_vec.replace(i, &attestation);
                    found = true;
                    break;
                }
            }
        }
        
        if !found {
            attestations_vec.push(&attestation);
            proof.attestation_count += 1;
            self.total_attestations += 1;
            
            // Update source stats
            let mut stats = self.source_stats.get(&proof.source_hash).unwrap_or_default();
            stats.total_attestations += 1;
            stats.confidence_sum += confidence as u64;
            self.source_stats.insert(&proof.source_hash, &stats);
        }

        // Recalculate average confidence
        let mut total_confidence: u64 = 0;
        let count = attestations_vec.len();
        for i in 0..count {
            if let Some(a) = attestations_vec.get(i) {
                total_confidence += a.confidence as u64;
            }
        }
        proof.avg_confidence = (total_confidence / count) as u8;

        // Update verification status
        proof.status = if proof.avg_confidence >= 70 {
            VerificationStatus::Verified
        } else if proof.attestation_count > 0 {
            VerificationStatus::Contested
        } else {
            VerificationStatus::Pending
        };

        // Update verified count if newly verified
        if proof.status == VerificationStatus::Verified {
            let mut stats = self.source_stats.get(&proof.source_hash).unwrap_or_default();
            stats.verified_count += 1;
            self.source_stats.insert(&proof.source_hash, &stats);
        }

        self.attestations.insert(&proof_id, &attestations_vec);
        self.proofs.insert(&proof_id, &proof);

        env::log_str(&format!(
            "Attestation added: {} attested {} confidence to proof {}",
            attestor, confidence, proof_id
        ));
    }

    /// Mark a proof as refuted (admin only or with sufficient counter-attestations)
    pub fn refute_proof(&mut self, proof_id: String, reason: String) {
        let caller = env::predecessor_account_id();
        let mut proof = self.proofs.get(&proof_id).expect("proof not found");
        
        // Only owner or if avg confidence < 30 with >= 3 attestations
        let can_refute = caller == self.owner || 
            (proof.attestation_count >= 3 && proof.avg_confidence < 30);
        
        assert!(can_refute, "not authorized to refute");
        assert!(reason.len() <= 500, "reason too long");

        proof.status = VerificationStatus::Refuted;
        self.proofs.insert(&proof_id, &proof);

        // Update source stats
        let mut stats = self.source_stats.get(&proof.source_hash).unwrap_or_default();
        stats.refuted_count += 1;
        self.source_stats.insert(&proof.source_hash, &stats);

        env::log_str(&format!("Proof {} refuted: {}", proof_id, reason));
    }

    // ============ VIEW METHODS ============

    /// Get a proof by ID
    pub fn get_proof(&self, proof_id: String) -> Option<ProofCommitment> {
        self.proofs.get(&proof_id)
    }

    /// Get proof with all attestations
    pub fn get_proof_with_attestations(&self, proof_id: String) -> Option<ProofWithAttestations> {
        let proof = self.proofs.get(&proof_id)?;
        let attestations_vec = self.attestations.get(&proof_id)?;
        
        let mut attestations = Vec::new();
        for i in 0..attestations_vec.len() {
            if let Some(a) = attestations_vec.get(i) {
                attestations.push(a);
            }
        }
        
        Some(ProofWithAttestations { proof, attestations })
    }

    /// Get all proofs for an intel hash
    pub fn get_intel_proofs(&self, intel_hash: String) -> Vec<ProofCommitment> {
        let proof_ids = match self.intel_proofs.get(&intel_hash) {
            Some(v) => v,
            None => return vec![],
        };
        
        let mut proofs = Vec::new();
        for i in 0..proof_ids.len() {
            if let Some(proof_id) = proof_ids.get(i) {
                if let Some(proof) = self.proofs.get(&proof_id) {
                    proofs.push(proof);
                }
            }
        }
        proofs
    }

    /// Get source statistics
    pub fn get_source_stats(&self, source_hash: String) -> Option<SourceStats> {
        self.source_stats.get(&source_hash)
    }

    /// Calculate source reputation score (0-100)
    pub fn get_source_reputation(&self, source_hash: String) -> u8 {
        let stats = match self.source_stats.get(&source_hash) {
            Some(s) => s,
            None => return 0,
        };

        if stats.total_proofs == 0 {
            return 0;
        }

        // Reputation formula:
        // Base: (verified / total) * 50
        // Attestation bonus: min(avg_confidence, 30)
        // Refuted penalty: -(refuted / total) * 30
        // Activity bonus: min(total_proofs, 10)
        
        let verified_ratio = (stats.verified_count as f64 / stats.total_proofs as f64) * 50.0;
        let avg_conf = if stats.total_attestations > 0 {
            (stats.confidence_sum as f64 / stats.total_attestations as f64).min(30.0)
        } else {
            0.0
        };
        let refuted_penalty = (stats.refuted_count as f64 / stats.total_proofs as f64) * 30.0;
        let activity_bonus = (stats.total_proofs as f64).min(10.0);

        let score = verified_ratio + avg_conf - refuted_penalty + activity_bonus;
        score.max(0.0).min(100.0) as u8
    }

    /// Verify a commitment matches provided data
    /// 
    /// Client computes: sha256(proof || publicInputs || sourceId)
    /// This checks if it matches the stored commitment.
    pub fn verify_commitment(&self, proof_id: String, computed_commitment: String) -> bool {
        match self.proofs.get(&proof_id) {
            Some(proof) => proof.commitment == computed_commitment,
            None => false,
        }
    }

    /// Get total statistics
    pub fn get_stats(&self) -> (u64, u64) {
        (self.total_proofs, self.total_attestations)
    }

    /// Get recent proofs (last N)
    pub fn get_recent_proofs(&self, limit: u64) -> Vec<ProofCommitment> {
        let mut proofs: Vec<ProofCommitment> = self.proofs.values().collect();
        proofs.sort_by(|a, b| b.block_height.0.cmp(&a.block_height.0));
        proofs.truncate(limit as usize);
        proofs
    }

    /// Get owner
    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
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
        builder.block_height(100);
        builder.block_timestamp(1_000_000_000);
        builder
    }

    fn test_commitment() -> String {
        "a".repeat(64) // Valid 64-char hex
    }

    #[test]
    fn test_register_proof() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let mut contract = IntelRegistry::new(owner);
        
        let proof = contract.register_proof(
            "proof-001".to_string(),
            test_commitment(),
            ProofType::LocationProximity,
            test_commitment(),
            test_commitment(),
            test_commitment(),
            Some("{\"radius_km\": 5}".to_string()),
        );

        assert_eq!(proof.proof_id, "proof-001");
        assert_eq!(proof.status, VerificationStatus::Pending);
        assert_eq!(contract.total_proofs, 1);
    }

    #[test]
    fn test_attestation() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let attestor: AccountId = "attestor.near".parse().unwrap();
        
        let mut context = get_context(owner.clone());
        testing_env!(context.build());

        let mut contract = IntelRegistry::new(owner);
        
        contract.register_proof(
            "proof-001".to_string(),
            test_commitment(),
            ProofType::LocationProximity,
            test_commitment(),
            test_commitment(),
            test_commitment(),
            None,
        );

        // Attest as different user
        context = get_context(attestor);
        testing_env!(context.build());

        contract.attest("proof-001".to_string(), 85, Some("Verified via satellite".to_string()));

        let proof = contract.get_proof("proof-001".to_string()).unwrap();
        assert_eq!(proof.attestation_count, 1);
        assert_eq!(proof.avg_confidence, 85);
        assert_eq!(proof.status, VerificationStatus::Verified);
    }

    #[test]
    fn test_source_reputation() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let attestor: AccountId = "attestor.near".parse().unwrap();
        let source_hash = test_commitment();
        
        let mut context = get_context(owner.clone());
        testing_env!(context.build());

        let mut contract = IntelRegistry::new(owner);
        
        // Register multiple proofs from same source
        for i in 0..5 {
            contract.register_proof(
                format!("proof-{:03}", i),
                test_commitment(),
                ProofType::TimestampRange,
                source_hash.clone(),
                format!("{:064}", i), // Different intel hashes
                test_commitment(),
                None,
            );
        }

        // Attest to some
        context = get_context(attestor);
        testing_env!(context.build());

        for i in 0..3 {
            contract.attest(format!("proof-{:03}", i), 80, None);
        }

        let stats = contract.get_source_stats(source_hash.clone()).unwrap();
        assert_eq!(stats.total_proofs, 5);
        assert_eq!(stats.total_attestations, 3);

        let reputation = contract.get_source_reputation(source_hash);
        assert!(reputation > 50); // Should have decent reputation
    }
}
