pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Chain of Custody Proof
 * 
 * Proves a document/file passed through a verifiable chain of handlers
 * without modification, without revealing intermediate handlers.
 * 
 * Use cases:
 * - Prove document authenticity from source to publication
 * - Verify evidence chain for legal purposes
 * - Track intel from collection to analysis
 * - Audit trail without exposing handler identities
 */

template ChainOfCustody(maxHandlers) {
    // ============ Private Inputs ============
    signal input handlerSecrets[maxHandlers];   // Each handler's secret
    signal input handlerActive[maxHandlers];    // 1 if this handler participated
    signal input handlerTimestamps[maxHandlers]; // When each handler received
    signal input contentHash;                    // Hash of actual content
    
    // ============ Public Inputs ============
    signal input originalContentHash;           // Expected original hash
    signal input originatorCommitment;          // Expected commitment from originator
    signal input minHandlers;                   // Minimum handlers in chain
    signal input maxChainDuration;              // Max seconds from first to last handler
    
    // ============ Public Outputs ============
    signal output contentUnmodified;            // 1 if content hash matches original
    signal output chainValid;                   // 1 if valid chain from originator
    signal output handlerCountMet;              // 1 if >= minHandlers
    signal output durationValid;                // 1 if chain completed in time
    signal output finalCustodyCommitment;       // Commitment to final state
    
    // ============ Check Content Integrity ============
    component contentMatch = IsEqual();
    contentMatch.in[0] <== contentHash;
    contentMatch.in[1] <== originalContentHash;
    contentUnmodified <== contentMatch.out;
    
    // ============ Count Active Handlers ============
    signal handlerCounts[maxHandlers + 1];
    handlerCounts[0] <== 0;
    
    for (var i = 0; i < maxHandlers; i++) {
        handlerCounts[i + 1] <== handlerCounts[i] + handlerActive[i];
    }
    
    signal totalHandlers;
    totalHandlers <== handlerCounts[maxHandlers];
    
    component countCheck = GreaterEqThan(8);
    countCheck.in[0] <== totalHandlers;
    countCheck.in[1] <== minHandlers;
    handlerCountMet <== countCheck.out;
    
    // ============ Verify Chain Linkage ============
    // Each handler creates commitment: hash(prevCommitment, handlerSecret, timestamp, contentHash)
    signal chainCommitments[maxHandlers + 1];
    chainCommitments[0] <== originatorCommitment;
    
    component chainHashers[maxHandlers];
    
    for (var i = 0; i < maxHandlers; i++) {
        chainHashers[i] = Poseidon(4);
        chainHashers[i].inputs[0] <== chainCommitments[i];
        chainHashers[i].inputs[1] <== handlerSecrets[i];
        chainHashers[i].inputs[2] <== handlerTimestamps[i];
        chainHashers[i].inputs[3] <== contentHash;
        
        // If handler is active, use new commitment; else pass through
        chainCommitments[i + 1] <== handlerActive[i] * chainHashers[i].out + 
                                    (1 - handlerActive[i]) * chainCommitments[i];
    }
    
    // Final commitment must be different from originator (at least one handler)
    component changedFromOrigin = IsEqual();
    changedFromOrigin.in[0] <== chainCommitments[maxHandlers];
    changedFromOrigin.in[1] <== originatorCommitment;
    
    // Chain valid if commitment changed (handlers participated)
    chainValid <== 1 - changedFromOrigin.out;
    
    // ============ Check Chain Duration ============
    // Find first and last active handler timestamps
    signal firstTimestamp[maxHandlers + 1];
    signal lastTimestamp[maxHandlers + 1];
    
    // Initialize with extreme values
    firstTimestamp[0] <== 9999999999; // Far future
    lastTimestamp[0] <== 0;
    
    for (var i = 0; i < maxHandlers; i++) {
        // Update first timestamp
        component isFirst = LessThan(64);
        isFirst.in[0] <== handlerTimestamps[i];
        isFirst.in[1] <== firstTimestamp[i];
        
        signal useAsFirst;
        useAsFirst <== handlerActive[i] * isFirst.out;
        firstTimestamp[i + 1] <== useAsFirst * handlerTimestamps[i] + 
                                  (1 - useAsFirst) * firstTimestamp[i];
        
        // Update last timestamp
        component isLast = GreaterThan(64);
        isLast.in[0] <== handlerTimestamps[i];
        isLast.in[1] <== lastTimestamp[i];
        
        signal useAsLast;
        useAsLast <== handlerActive[i] * isLast.out;
        lastTimestamp[i + 1] <== useAsLast * handlerTimestamps[i] + 
                                 (1 - useAsLast) * lastTimestamp[i];
    }
    
    signal chainDuration;
    chainDuration <== lastTimestamp[maxHandlers] - firstTimestamp[maxHandlers];
    
    component durationOk = LessEqThan(64);
    durationOk.in[0] <== chainDuration;
    durationOk.in[1] <== maxChainDuration;
    durationValid <== durationOk.out;
    
    // ============ Final Commitment ============
    finalCustodyCommitment <== chainCommitments[maxHandlers];
}

// Support up to 10 handlers in chain
component main {public [
    originalContentHash, originatorCommitment, minHandlers, maxChainDuration
]} = ChainOfCustody(10);
