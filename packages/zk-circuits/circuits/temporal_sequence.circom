pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Temporal Sequence Proof
 * 
 * Proves that events occurred in a specific order without revealing exact times.
 * Use cases:
 * - Prove event A happened before event B
 * - Prove causal chain: A → B → C
 * - Prove time gap between events (min/max)
 * - Chain of custody with timestamps
 * 
 * Private: actual timestamps
 * Public: ordering requirements, time gap constraints
 */

template TemporalSequence(numEvents) {
    // ============ Private Inputs ============
    signal input timestamps[numEvents];         // Actual timestamps of events
    signal input eventHashes[numEvents];        // Hashes of event content
    signal input salt;                          // Salt for commitment
    
    // ============ Public Inputs ============
    signal input minGaps[numEvents - 1];        // Min time between consecutive events
    signal input maxGaps[numEvents - 1];        // Max time between consecutive events (0 = no max)
    signal input expectedEventHashes[numEvents]; // Expected event hashes (0 = don't check)
    signal input mustBeOrdered;                 // 1 = strict ordering required
    
    // ============ Public Outputs ============
    signal output isOrdered;                    // 1 if all events in order
    signal output gapsValid;                    // 1 if all gaps within bounds
    signal output eventsMatch;                  // 1 if events match expected
    signal output sequenceCommitment;           // Commitment to the sequence
    signal output firstEventHash;               // Hash of first event (for linking)
    signal output lastEventHash;                // Hash of last event (for linking)
    
    // ============ Check Ordering ============
    signal orderedChecks[numEvents - 1];
    component orderComps[numEvents - 1];
    
    for (var i = 0; i < numEvents - 1; i++) {
        orderComps[i] = LessThan(64);
        orderComps[i].in[0] <== timestamps[i];
        orderComps[i].in[1] <== timestamps[i + 1];
        orderedChecks[i] <== orderComps[i].out;
    }
    
    // Multiply all ordering checks
    signal orderedProducts[numEvents - 1];
    orderedProducts[0] <== orderedChecks[0];
    for (var i = 1; i < numEvents - 1; i++) {
        orderedProducts[i] <== orderedProducts[i - 1] * orderedChecks[i];
    }
    
    // If mustBeOrdered=0, auto-pass; else use check result
    isOrdered <== (1 - mustBeOrdered) + mustBeOrdered * orderedProducts[numEvents - 2];
    
    // ============ Check Gap Constraints ============
    signal gapChecks[numEvents - 1];
    
    for (var i = 0; i < numEvents - 1; i++) {
        signal gap;
        gap <== timestamps[i + 1] - timestamps[i];
        
        // Check min gap
        component minGapCheck = GreaterEqThan(64);
        minGapCheck.in[0] <== gap;
        minGapCheck.in[1] <== minGaps[i];
        
        // Check max gap (if maxGaps[i] > 0)
        component maxGapZero = IsZero();
        maxGapZero.in <== maxGaps[i];
        
        component maxGapCheck = LessEqThan(64);
        maxGapCheck.in[0] <== gap;
        maxGapCheck.in[1] <== maxGaps[i];
        
        // Pass if no max (maxZero=1) OR gap <= max
        signal maxOk;
        maxOk <== maxGapZero.out + maxGapCheck.out - maxGapZero.out * maxGapCheck.out;
        
        gapChecks[i] <== minGapCheck.out * maxOk;
    }
    
    // Multiply all gap checks
    signal gapProducts[numEvents - 1];
    gapProducts[0] <== gapChecks[0];
    for (var i = 1; i < numEvents - 1; i++) {
        gapProducts[i] <== gapProducts[i - 1] * gapChecks[i];
    }
    gapsValid <== gapProducts[numEvents - 2];
    
    // ============ Check Event Hashes ============
    signal eventChecks[numEvents];
    
    for (var i = 0; i < numEvents; i++) {
        component hashZero = IsZero();
        hashZero.in <== expectedEventHashes[i];
        
        component hashMatch = IsEqual();
        hashMatch.in[0] <== eventHashes[i];
        hashMatch.in[1] <== expectedEventHashes[i];
        
        // Pass if no expected hash (hashZero=1) OR matches
        eventChecks[i] <== hashZero.out + hashMatch.out - hashZero.out * hashMatch.out;
    }
    
    signal eventProducts[numEvents];
    eventProducts[0] <== eventChecks[0];
    for (var i = 1; i < numEvents; i++) {
        eventProducts[i] <== eventProducts[i - 1] * eventChecks[i];
    }
    eventsMatch <== eventProducts[numEvents - 1];
    
    // ============ Outputs ============
    firstEventHash <== eventHashes[0];
    lastEventHash <== eventHashes[numEvents - 1];
    
    // Sequence commitment
    component seqCommit = Poseidon(numEvents + 1);
    for (var i = 0; i < numEvents; i++) {
        seqCommit.inputs[i] <== eventHashes[i];
    }
    seqCommit.inputs[numEvents] <== salt;
    sequenceCommitment <== seqCommit.out;
}

// Support sequences of up to 5 events
component main {public [
    minGaps, maxGaps, expectedEventHashes, mustBeOrdered
]} = TemporalSequence(5);
