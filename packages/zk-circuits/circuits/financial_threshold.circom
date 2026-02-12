pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Financial Threshold Proof
 * 
 * Proves a value meets a threshold without revealing the exact amount.
 * Use cases:
 * - Prove wallet balance > X without revealing actual balance
 * - Prove transaction value in range [min, max]
 * - Prove net worth / assets meet minimum
 * 
 * Private: actual value, account identifiers
 * Public: threshold, comparison type, commitment
 */

template FinancialThreshold() {
    // ============ Private Inputs ============
    signal input actualValue;           // Actual value (scaled to integer)
    signal input accountHash;           // Hash of account identifier
    signal input salt;                  // Random salt for commitment
    signal input signedStatementHash;   // Hash of bank/exchange signed statement
    
    // ============ Public Inputs ============
    signal input minValue;              // Minimum threshold (0 if no min)
    signal input maxValue;              // Maximum threshold (0 if no max)
    signal input checkMin;              // 1 = check >= minValue
    signal input checkMax;              // 1 = check <= maxValue
    signal input requiredStatementHash; // Required statement hash (0 = any)
    
    // ============ Public Outputs ============
    signal output meetsThreshold;       // 1 if all checks pass
    signal output minMet;               // 1 if >= minValue
    signal output maxMet;               // 1 if <= maxValue
    signal output valueCommitment;      // Commitment to actual value
    signal output accountCommitment;    // Commitment to account
    
    // ============ Min Value Check ============
    component minCheck = GreaterEqThan(128);
    minCheck.in[0] <== actualValue;
    minCheck.in[1] <== minValue;
    
    // If checkMin=0, auto-pass; else use comparison result
    signal minResult;
    minResult <== checkMin * minCheck.out + (1 - checkMin);
    minMet <== minResult;
    
    // ============ Max Value Check ============
    component maxCheck = LessEqThan(128);
    maxCheck.in[0] <== actualValue;
    maxCheck.in[1] <== maxValue;
    
    // If checkMax=0, auto-pass
    signal maxResult;
    maxResult <== checkMax * maxCheck.out + (1 - checkMax);
    maxMet <== maxResult;
    
    // ============ Statement Verification ============
    // If requiredStatementHash != 0, must match
    component stmtZero = IsZero();
    stmtZero.in <== requiredStatementHash;
    
    component stmtMatch = IsEqual();
    stmtMatch.in[0] <== signedStatementHash;
    stmtMatch.in[1] <== requiredStatementHash;
    
    // Pass if no requirement (stmtZero.out=1) OR matches
    signal stmtValid;
    stmtValid <== stmtZero.out + stmtMatch.out - stmtZero.out * stmtMatch.out;
    
    // ============ Overall Result ============
    meetsThreshold <== minMet * maxMet * stmtValid;
    
    // ============ Commitments ============
    component valueCommit = Poseidon(3);
    valueCommit.inputs[0] <== actualValue;
    valueCommit.inputs[1] <== salt;
    valueCommit.inputs[2] <== accountHash;
    valueCommitment <== valueCommit.out;
    
    accountCommitment <== accountHash;
}

component main {public [
    minValue, maxValue, checkMin, checkMax, requiredStatementHash
]} = FinancialThreshold();
