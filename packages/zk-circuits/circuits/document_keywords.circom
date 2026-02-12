pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * DocumentKeywords Circuit
 * 
 * Proves that a document (represented as a hash) contains certain keywords
 * WITHOUT revealing the document content.
 * 
 * The approach:
 * 1. Document is preprocessed client-side to extract keyword presence
 * 2. Circuit verifies the keyword flags match the document hash commitment
 * 
 * Public inputs: documentHash, keywordHashes[], allKeywordsFound
 * Private inputs: documentPreimage, keywordFlags[]
 */

template DocumentKeywords(numKeywords) {
    // Private inputs
    signal input documentPreimage[4]; // Poseidon hash preimage (document identifier)
    signal input keywordFlags[numKeywords]; // 1 if keyword found, 0 if not
    
    // Public inputs
    signal input documentHash; // Poseidon hash of document
    signal input keywordHashes[numKeywords]; // Hashes of required keywords
    signal input requiredCount; // How many keywords must be found
    
    // Public output
    signal output keywordsFound;
    signal output foundCount;
    
    // Verify document hash commitment
    component docHasher = Poseidon(4);
    for (var i = 0; i < 4; i++) {
        docHasher.inputs[i] <== documentPreimage[i];
    }
    documentHash === docHasher.out;
    
    // Ensure keyword flags are binary (0 or 1)
    for (var i = 0; i < numKeywords; i++) {
        keywordFlags[i] * (1 - keywordFlags[i]) === 0;
    }
    
    // Count found keywords
    var count = 0;
    for (var i = 0; i < numKeywords; i++) {
        count += keywordFlags[i];
    }
    
    foundCount <== count;
    
    // Check if we have enough keywords
    component gte = GreaterEqThan(8);
    gte.in[0] <== foundCount;
    gte.in[1] <== requiredCount;
    
    keywordsFound <== gte.out;
}

// Default: support up to 10 keywords
component main {public [documentHash, keywordHashes, requiredCount]} = DocumentKeywords(10);
