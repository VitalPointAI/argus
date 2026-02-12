pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * TimestampRange Circuit
 * 
 * Proves that a timestamp falls within a specified range [notBefore, notAfter]
 * WITHOUT revealing the exact timestamp.
 * 
 * Public inputs: notBefore, notAfter, withinRange
 * Private inputs: timestamp
 * 
 * All timestamps in Unix seconds
 */

template TimestampRange() {
    // Private input: actual timestamp (Unix seconds)
    signal input timestamp;
    
    // Public inputs: range bounds (Unix seconds)
    signal input notBefore;
    signal input notAfter;
    
    // Public output
    signal output withinRange;
    
    // Check: timestamp >= notBefore
    component gte = GreaterEqThan(64);
    gte.in[0] <== timestamp;
    gte.in[1] <== notBefore;
    
    // Check: timestamp <= notAfter
    component lte = LessEqThan(64);
    lte.in[0] <== timestamp;
    lte.in[1] <== notAfter;
    
    // Both conditions must be true
    withinRange <== gte.out * lte.out;
}

component main {public [notBefore, notAfter]} = TimestampRange();
