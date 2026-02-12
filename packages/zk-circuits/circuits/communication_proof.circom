pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/eddsaposeidon.circom";

/**
 * Communication Receipt Proof
 * 
 * Proves receipt of a signed message from a specific sender
 * without revealing message content or exact timing.
 * 
 * Use cases:
 * - Prove received tip from known insider
 * - Prove communication with verified official
 * - Prove chain of information flow
 * - Whistleblower protection (prove source without revealing)
 */

template CommunicationProof() {
    // ============ Private Inputs ============
    signal input messageContent;            // Hash of message content
    signal input receivedAt;                // Unix timestamp of receipt
    signal input senderSecret;              // Sender's secret (for commitment)
    signal input recipientSecret;           // Recipient's secret
    
    // Sender's signature on message
    signal input senderPubKeyX;
    signal input senderPubKeyY;
    signal input signatureR8X;
    signal input signatureR8Y;
    signal input signatureS;
    
    // ============ Public Inputs ============
    signal input expectedSenderCommitment;  // Expected sender identity (0 = any)
    signal input messageHashPrefix;         // First N bits of message hash (partial reveal)
    signal input timeWindowStart;           // Earliest allowed receipt time
    signal input timeWindowEnd;             // Latest allowed receipt time
    signal input channelTypeHash;           // Hash of communication channel type
    
    // ============ Public Outputs ============
    signal output validSignature;           // 1 if sender signed this message
    signal output senderMatches;            // 1 if sender is expected one
    signal output inTimeWindow;             // 1 if received within window
    signal output messageCommitment;        // Commitment to message (for linking)
    signal output communicationCommitment;  // Commitment to full exchange
    
    // ============ Verify Sender Signature ============
    // Signed data: hash(messageContent, channelTypeHash)
    component signedData = Poseidon(2);
    signedData.inputs[0] <== messageContent;
    signedData.inputs[1] <== channelTypeHash;
    
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax <== senderPubKeyX;
    sigVerify.Ay <== senderPubKeyY;
    sigVerify.R8x <== signatureR8X;
    sigVerify.R8y <== signatureR8Y;
    sigVerify.S <== signatureS;
    sigVerify.M <== signedData.out;
    
    validSignature <== 1; // EdDSA throws on invalid
    
    // ============ Check Sender Identity ============
    // Compute sender commitment from public key
    component senderCommit = Poseidon(3);
    senderCommit.inputs[0] <== senderPubKeyX;
    senderCommit.inputs[1] <== senderPubKeyY;
    senderCommit.inputs[2] <== senderSecret;
    
    // Check if expectedSenderCommitment is 0 (any sender OK)
    component expectZero = IsZero();
    expectZero.in <== expectedSenderCommitment;
    
    component senderMatch = IsEqual();
    senderMatch.in[0] <== senderCommit.out;
    senderMatch.in[1] <== expectedSenderCommitment;
    
    // Pass if no expected sender OR matches
    senderMatches <== expectZero.out + senderMatch.out - expectZero.out * senderMatch.out;
    
    // ============ Check Time Window ============
    component afterStart = GreaterEqThan(64);
    afterStart.in[0] <== receivedAt;
    afterStart.in[1] <== timeWindowStart;
    
    component beforeEnd = LessEqThan(64);
    beforeEnd.in[0] <== receivedAt;
    beforeEnd.in[1] <== timeWindowEnd;
    
    inTimeWindow <== afterStart.out * beforeEnd.out;
    
    // ============ Message Commitment ============
    // Partial reveal: check prefix matches
    // (In real impl would use bit extraction, simplified here)
    component msgCommit = Poseidon(2);
    msgCommit.inputs[0] <== messageContent;
    msgCommit.inputs[1] <== messageHashPrefix;
    messageCommitment <== msgCommit.out;
    
    // ============ Full Communication Commitment ============
    component fullCommit = Poseidon(5);
    fullCommit.inputs[0] <== messageContent;
    fullCommit.inputs[1] <== senderCommit.out;
    fullCommit.inputs[2] <== recipientSecret;
    fullCommit.inputs[3] <== receivedAt;
    fullCommit.inputs[4] <== channelTypeHash;
    communicationCommitment <== fullCommit.out;
}

component main {public [
    expectedSenderCommitment, messageHashPrefix, 
    timeWindowStart, timeWindowEnd, channelTypeHash
]} = CommunicationProof();
