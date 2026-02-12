pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Multi-Source Corroboration Proof
 * 
 * Proves that N independent sources agree on a claim without revealing source identities.
 * Use cases:
 * - Multiple witnesses to an event
 * - Cross-referencing intelligence from different sources
 * - Consensus verification without revealing contributors
 * 
 * Each source provides their own commitment to the claim.
 * Circuit verifies they all commit to the same claim hash.
 */

template MultiSourceCorroboration(maxSources) {
    // ============ Private Inputs ============
    signal input sourceSecrets[maxSources];     // Each source's secret
    signal input claimContents[maxSources];     // Claim data from each source
    signal input sourceActive[maxSources];      // 1 if source participated, 0 otherwise
    signal input sourceTimestamps[maxSources];  // When each source submitted
    
    // ============ Public Inputs ============
    signal input minSources;                    // Minimum required corroborating sources
    signal input claimHash;                     // Expected claim hash (all must match)
    signal input maxTimeDelta;                  // Max time between first and last submission
    signal input verificationTime;              // Current time for window check
    
    // ============ Public Outputs ============
    signal output sufficientSources;            // 1 if >= minSources
    signal output allAgree;                     // 1 if all active sources agree on claim
    signal output withinTimeWindow;             // 1 if submissions within allowed window
    signal output sourceCount;                  // Number of active sources
    signal output aggregateCommitment;          // Commitment to all source contributions
    
    // ============ Count Active Sources ============
    signal activeCounts[maxSources + 1];
    activeCounts[0] <== 0;
    
    for (var i = 0; i < maxSources; i++) {
        activeCounts[i + 1] <== activeCounts[i] + sourceActive[i];
    }
    sourceCount <== activeCounts[maxSources];
    
    // ============ Check Minimum Sources ============
    component minCheck = GreaterEqThan(8);
    minCheck.in[0] <== sourceCount;
    minCheck.in[1] <== minSources;
    sufficientSources <== minCheck.out;
    
    // ============ Verify All Claims Match ============
    signal claimMatches[maxSources];
    component claimHashers[maxSources];
    component claimEq[maxSources];
    
    for (var i = 0; i < maxSources; i++) {
        // Hash each source's claim content
        claimHashers[i] = Poseidon(2);
        claimHashers[i].inputs[0] <== claimContents[i];
        claimHashers[i].inputs[1] <== 0; // Padding
        
        // Check if matches expected claim hash
        claimEq[i] = IsEqual();
        claimEq[i].in[0] <== claimHashers[i].out;
        claimEq[i].in[1] <== claimHash;
        
        // Match if: not active OR (active AND matches)
        claimMatches[i] <== (1 - sourceActive[i]) + sourceActive[i] * claimEq[i].out;
    }
    
    // All must match
    signal matchProducts[maxSources];
    matchProducts[0] <== claimMatches[0];
    for (var i = 1; i < maxSources; i++) {
        matchProducts[i] <== matchProducts[i-1] * claimMatches[i];
    }
    allAgree <== matchProducts[maxSources - 1];
    
    // ============ Check Time Window ============
    // Find min and max timestamps among active sources
    signal minTimestamp[maxSources + 1];
    signal maxTimestamp[maxSources + 1];
    
    minTimestamp[0] <== verificationTime; // Start with current time
    maxTimestamp[0] <== 0;
    
    for (var i = 0; i < maxSources; i++) {
        // Update min: if active and smaller
        component isSmaller = LessThan(64);
        isSmaller.in[0] <== sourceTimestamps[i];
        isSmaller.in[1] <== minTimestamp[i];
        
        signal useThisMin;
        useThisMin <== sourceActive[i] * isSmaller.out;
        minTimestamp[i + 1] <== useThisMin * sourceTimestamps[i] + (1 - useThisMin) * minTimestamp[i];
        
        // Update max: if active and larger
        component isLarger = GreaterThan(64);
        isLarger.in[0] <== sourceTimestamps[i];
        isLarger.in[1] <== maxTimestamp[i];
        
        signal useThisMax;
        useThisMax <== sourceActive[i] * isLarger.out;
        maxTimestamp[i + 1] <== useThisMax * sourceTimestamps[i] + (1 - useThisMax) * maxTimestamp[i];
    }
    
    // Check delta
    signal timeDelta;
    timeDelta <== maxTimestamp[maxSources] - minTimestamp[maxSources];
    
    component deltaCheck = LessEqThan(64);
    deltaCheck.in[0] <== timeDelta;
    deltaCheck.in[1] <== maxTimeDelta;
    withinTimeWindow <== deltaCheck.out;
    
    // ============ Aggregate Commitment ============
    // Commit to all source secrets (proves which sources contributed)
    component aggCommit = Poseidon(maxSources);
    for (var i = 0; i < maxSources; i++) {
        aggCommit.inputs[i] <== sourceActive[i] * sourceSecrets[i];
    }
    aggregateCommitment <== aggCommit.out;
}

// Support up to 10 sources
component main {public [
    minSources, claimHash, maxTimeDelta, verificationTime
]} = MultiSourceCorroboration(10);
