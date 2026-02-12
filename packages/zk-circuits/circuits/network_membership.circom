pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Network Membership Proof
 * 
 * Proves membership in a network/group without revealing which member.
 * Uses Merkle tree membership proof.
 * 
 * Use cases:
 * - Prove membership in journalist association
 * - Prove access to secure facility
 * - Prove part of verified source network
 * - Prove membership tier/level
 */

template NetworkMembership(treeDepth) {
    // ============ Private Inputs ============
    signal input memberSecret;              // Member's secret identifier
    signal input memberMetadata;            // Additional member data (role, level, etc.)
    signal input membershipSince;           // Unix timestamp of joining
    signal input pathElements[treeDepth];   // Merkle proof path
    signal input pathIndices[treeDepth];    // 0 = left, 1 = right at each level
    
    // ============ Public Inputs ============
    signal input networkRoot;               // Merkle root of member set
    signal input minMembershipDuration;     // Min seconds of membership (0 = any)
    signal input currentTime;               // Current unix timestamp
    signal input requiredMetadataHash;      // Hash of required metadata (0 = any)
    
    // ============ Public Outputs ============
    signal output isMember;                 // 1 if valid Merkle proof
    signal output meetsDurationReq;         // 1 if membership long enough
    signal output meetsMetadataReq;         // 1 if metadata matches
    signal output memberCommitment;         // Commitment to member identity
    
    // ============ Compute Leaf ============
    component leafHash = Poseidon(3);
    leafHash.inputs[0] <== memberSecret;
    leafHash.inputs[1] <== memberMetadata;
    leafHash.inputs[2] <== membershipSince;
    
    signal leaf;
    leaf <== leafHash.out;
    
    // ============ Verify Merkle Path ============
    signal computedHashes[treeDepth + 1];
    computedHashes[0] <== leaf;
    
    component hashers[treeDepth];
    component selectors[treeDepth];
    
    for (var i = 0; i < treeDepth; i++) {
        hashers[i] = Poseidon(2);
        
        // Select order based on pathIndices
        // If pathIndices[i] = 0: hash(computedHashes[i], pathElements[i])
        // If pathIndices[i] = 1: hash(pathElements[i], computedHashes[i])
        
        signal left;
        signal right;
        
        left <== (1 - pathIndices[i]) * computedHashes[i] + pathIndices[i] * pathElements[i];
        right <== pathIndices[i] * computedHashes[i] + (1 - pathIndices[i]) * pathElements[i];
        
        hashers[i].inputs[0] <== left;
        hashers[i].inputs[1] <== right;
        
        computedHashes[i + 1] <== hashers[i].out;
    }
    
    // Check if computed root matches
    component rootMatch = IsEqual();
    rootMatch.in[0] <== computedHashes[treeDepth];
    rootMatch.in[1] <== networkRoot;
    isMember <== rootMatch.out;
    
    // ============ Check Membership Duration ============
    signal memberDuration;
    memberDuration <== currentTime - membershipSince;
    
    component durationCheck = GreaterEqThan(64);
    durationCheck.in[0] <== memberDuration;
    durationCheck.in[1] <== minMembershipDuration;
    
    // Check if minMembershipDuration = 0 (no requirement)
    component durationZero = IsZero();
    durationZero.in <== minMembershipDuration;
    
    // Pass if no requirement OR meets duration
    meetsDurationReq <== durationZero.out + durationCheck.out - durationZero.out * durationCheck.out;
    
    // ============ Check Metadata Requirement ============
    component metadataHash = Poseidon(1);
    metadataHash.inputs[0] <== memberMetadata;
    
    component metaReqZero = IsZero();
    metaReqZero.in <== requiredMetadataHash;
    
    component metaMatch = IsEqual();
    metaMatch.in[0] <== metadataHash.out;
    metaMatch.in[1] <== requiredMetadataHash;
    
    // Pass if no requirement OR matches
    meetsMetadataReq <== metaReqZero.out + metaMatch.out - metaReqZero.out * metaMatch.out;
    
    // ============ Member Commitment ============
    component commit = Poseidon(2);
    commit.inputs[0] <== memberSecret;
    commit.inputs[1] <== networkRoot;
    memberCommitment <== commit.out;
}

// Tree depth of 20 supports ~1M members
component main {public [
    networkRoot, minMembershipDuration, currentTime, requiredMetadataHash
]} = NetworkMembership(20);
