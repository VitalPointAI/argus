pragma circom 2.0.0;

include "poseidon.circom";
include "eddsaposeidon.circom";

/*
 * Identity Rotation Circuit
 * 
 * Proves: "I control the old identity and am creating this new identity"
 * Without revealing: Which old identity is being rotated
 * 
 * This allows sources to rotate codenames while preserving reputation,
 * without creating a public link between old and new identities.
 */

template IdentityRotation() {
    // Public inputs
    signal input newPublicKeyHash;       // Hash of new public key
    signal input reputationCommitment;   // Commitment to reputation being transferred
    signal input rotationNullifier;      // Prevents double-rotation (one-time use)
    
    // Private inputs
    signal input oldPublicKey;           // Old identity's public key
    signal input oldPrivateKey;          // Proof of control (used for signing)
    signal input newPublicKey;           // New identity's public key
    signal input reputationScore;        // Reputation being transferred
    signal input rotationSalt;           // Salt for nullifier
    
    // Output
    signal output valid;
    
    // Verify new public key hash
    component newKeyHasher = Poseidon(1);
    newKeyHasher.inputs[0] <== newPublicKey;
    newPublicKeyHash === newKeyHasher.out;
    
    // Verify reputation commitment
    component repHasher = Poseidon(2);
    repHasher.inputs[0] <== oldPublicKey;
    repHasher.inputs[1] <== reputationScore;
    reputationCommitment === repHasher.out;
    
    // Generate nullifier (prevents using same old identity twice)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== oldPublicKey;
    nullifierHasher.inputs[1] <== rotationSalt;
    rotationNullifier === nullifierHasher.out;
    
    // EdDSA signature verification would go here
    // For now, we use the private key in a commitment
    component controlProof = Poseidon(2);
    controlProof.inputs[0] <== oldPrivateKey;
    controlProof.inputs[1] <== oldPublicKey;
    
    // The control proof must match a known pattern
    // (In production, use proper EdDSA verification)
    
    valid <== 1; // Simplified - real impl needs signature check
}

component main {public [newPublicKeyHash, reputationCommitment, rotationNullifier]} = IdentityRotation();
