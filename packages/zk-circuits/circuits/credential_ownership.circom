pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/eddsaposeidon.circom";

/**
 * Verifiable Credential Ownership Proof
 * 
 * Proves possession of a credential without revealing holder identity.
 * Use cases:
 * - Prove journalist press pass without revealing name
 * - Prove professional certification
 * - Prove government clearance level
 * - Prove membership in organization
 * 
 * Based on W3C Verifiable Credentials model with ZK presentation.
 */

template CredentialOwnership() {
    // ============ Private Inputs ============
    signal input holderSecret;           // Holder's secret key for commitment
    signal input credentialId;           // Unique credential identifier
    signal input issuedAt;               // Unix timestamp of issuance
    signal input expiresAt;              // Unix timestamp of expiration
    signal input credentialDataHash;     // Hash of full credential data
    
    // ============ Issuer Signature (EdDSA) ============
    signal input issuerPubKeyX;          // Issuer's public key X
    signal input issuerPubKeyY;          // Issuer's public key Y
    signal input signatureR8X;           // Signature R8.x
    signal input signatureR8Y;           // Signature R8.y
    signal input signatureS;             // Signature S
    
    // ============ Public Inputs ============
    signal input credentialTypeHash;     // Hash of credential type (e.g., "press_pass")
    signal input issuerIdHash;           // Hash of expected issuer (0 = any)
    signal input currentTime;            // Current unix timestamp
    signal input minIssuanceAge;         // Credential must be at least X seconds old
    
    // ============ Public Outputs ============
    signal output validCredential;       // 1 if valid and not expired
    signal output validSignature;        // 1 if issuer signature valid
    signal output notExpired;            // 1 if not expired
    signal output holderCommitment;      // Commitment to holder (anonymous)
    signal output credentialCommitment;  // Commitment to credential
    
    // ============ Check Expiration ============
    component expCheck = LessThan(64);
    expCheck.in[0] <== currentTime;
    expCheck.in[1] <== expiresAt;
    notExpired <== expCheck.out;
    
    // ============ Check Minimum Age ============
    component ageCheck = GreaterEqThan(64);
    ageCheck.in[0] <== currentTime - issuedAt;
    ageCheck.in[1] <== minIssuanceAge;
    signal meetsAgeReq;
    meetsAgeReq <== ageCheck.out;
    
    // ============ Verify Issuer Signature ============
    // Hash the credential data that was signed
    component signedDataHash = Poseidon(5);
    signedDataHash.inputs[0] <== credentialTypeHash;
    signedDataHash.inputs[1] <== credentialId;
    signedDataHash.inputs[2] <== issuedAt;
    signedDataHash.inputs[3] <== expiresAt;
    signedDataHash.inputs[4] <== credentialDataHash;
    
    // EdDSA verification
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax <== issuerPubKeyX;
    sigVerify.Ay <== issuerPubKeyY;
    sigVerify.R8x <== signatureR8X;
    sigVerify.R8y <== signatureR8Y;
    sigVerify.S <== signatureS;
    sigVerify.M <== signedDataHash.out;
    
    validSignature <== 1; // If we reach here, signature is valid (EdDSA throws on invalid)
    
    // ============ Check Issuer (if required) ============
    component issuerZero = IsZero();
    issuerZero.in <== issuerIdHash;
    
    // Compute issuer hash from public key
    component issuerComputed = Poseidon(2);
    issuerComputed.inputs[0] <== issuerPubKeyX;
    issuerComputed.inputs[1] <== issuerPubKeyY;
    
    component issuerMatch = IsEqual();
    issuerMatch.in[0] <== issuerComputed.out;
    issuerMatch.in[1] <== issuerIdHash;
    
    // Pass if no issuer required OR issuer matches
    signal issuerValid;
    issuerValid <== issuerZero.out + issuerMatch.out - issuerZero.out * issuerMatch.out;
    
    // ============ Overall Validity ============
    validCredential <== notExpired * meetsAgeReq * issuerValid;
    
    // ============ Commitments ============
    component holderCommit = Poseidon(2);
    holderCommit.inputs[0] <== holderSecret;
    holderCommit.inputs[1] <== credentialId;
    holderCommitment <== holderCommit.out;
    
    component credCommit = Poseidon(4);
    credCommit.inputs[0] <== credentialTypeHash;
    credCommit.inputs[1] <== credentialId;
    credCommit.inputs[2] <== issuedAt;
    credCommit.inputs[3] <== expiresAt;
    credentialCommitment <== credCommit.out;
}

component main {public [
    credentialTypeHash, issuerIdHash, currentTime, minIssuanceAge
]} = CredentialOwnership();
