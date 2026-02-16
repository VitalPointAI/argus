pragma circom 2.0.0;

include "comparators.circom";
include "poseidon.circom";

/*
 * Location Attestation Circuit
 * 
 * Proves: "I was within `maxDistance` km of (`targetLat`, `targetLon`)"
 * Without revealing: Exact coordinates
 * 
 * Uses squared Euclidean distance to avoid sqrt (expensive in ZK)
 * Coordinates are scaled by 1e6 (microcoordinates) for integer math
 */

template LocationProof() {
    // Public inputs
    signal input targetLat;        // Target latitude * 1e6
    signal input targetLon;        // Target longitude * 1e6  
    signal input maxDistanceSquared; // Max distance squared (km^2 * 1e12)
    signal input commitmentHash;   // Poseidon hash of (actualLat, actualLon, salt)
    
    // Private inputs (hidden)
    signal input actualLat;        // Actual latitude * 1e6
    signal input actualLon;        // Actual longitude * 1e6
    signal input salt;             // Random salt for commitment
    
    // Output
    signal output valid;
    
    // Verify commitment
    component hasher = Poseidon(3);
    hasher.inputs[0] <== actualLat;
    hasher.inputs[1] <== actualLon;
    hasher.inputs[2] <== salt;
    
    commitmentHash === hasher.out;
    
    // Calculate squared distance
    signal latDiff;
    signal lonDiff;
    signal latDiffSquared;
    signal lonDiffSquared;
    signal distanceSquared;
    
    latDiff <== actualLat - targetLat;
    lonDiff <== actualLon - targetLon;
    latDiffSquared <== latDiff * latDiff;
    lonDiffSquared <== lonDiff * lonDiff;
    distanceSquared <== latDiffSquared + lonDiffSquared;
    
    // Check distance is within bounds
    component lt = LessThan(64);
    lt.in[0] <== distanceSquared;
    lt.in[1] <== maxDistanceSquared;
    
    valid <== lt.out;
}

component main {public [targetLat, targetLon, maxDistanceSquared, commitmentHash]} = LocationProof();
