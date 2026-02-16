pragma circom 2.0.0;

include "comparators.circom";
include "poseidon.circom";

/*
 * Reputation Threshold Circuit
 * 
 * Proves: "My reputation score is >= threshold"
 * Without revealing: Exact reputation score
 * 
 * Uses a commitment to the source's identity to prevent
 * borrowing someone else's reputation.
 */

template ReputationThreshold() {
    // Public inputs
    signal input threshold;              // Minimum reputation required
    signal input sourceCommitment;       // Poseidon(publicKey, reputationScore)
    signal input publicKeyHash;          // Hash of source's public key (for binding)
    
    // Private inputs (hidden)
    signal input reputationScore;        // Actual reputation (0-100)
    signal input publicKey;              // Source's public key
    signal input salt;                   // Random salt
    
    // Output
    signal output meetsThreshold;
    
    // Verify source identity commitment
    component commitHasher = Poseidon(3);
    commitHasher.inputs[0] <== publicKey;
    commitHasher.inputs[1] <== reputationScore;
    commitHasher.inputs[2] <== salt;
    
    sourceCommitment === commitHasher.out;
    
    // Verify public key hash matches
    component keyHasher = Poseidon(1);
    keyHasher.inputs[0] <== publicKey;
    
    publicKeyHash === keyHasher.out;
    
    // Check reputation >= threshold
    component gte = GreaterEqThan(8); // 8 bits enough for 0-100
    gte.in[0] <== reputationScore;
    gte.in[1] <== threshold;
    
    meetsThreshold <== gte.out;
}

component main {public [threshold, sourceCommitment, publicKeyHash]} = ReputationThreshold();
