pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Image EXIF Metadata Proof
 * 
 * Proves properties about an image's metadata without revealing the image:
 * - Taken within time range
 * - Has GPS coordinates
 * - Meets resolution requirements
 * - Camera/device type matches
 * 
 * Private inputs: actual EXIF data
 * Public inputs: requirements, hashes, pass/fail flags
 */

template ImageExifProof(maxDeviceNameLen) {
    // ============ Private Inputs (from EXIF) ============
    signal input actualTimestamp;           // Unix timestamp from EXIF
    signal input actualLat;                 // GPS latitude * 1e7
    signal input actualLng;                 // GPS longitude * 1e7
    signal input actualWidth;               // Image width in pixels
    signal input actualHeight;              // Image height in pixels
    signal input actualDeviceHash;          // Hash of camera make+model
    signal input imageContentHash;          // Hash of image content
    
    // ============ Public Inputs (requirements) ============
    signal input minTimestamp;              // Earliest allowed time
    signal input maxTimestamp;              // Latest allowed time
    signal input requireGps;                // 1 = GPS required, 0 = optional
    signal input minWidth;                  // Minimum width
    signal input minHeight;                 // Minimum height
    signal input allowedDeviceHashes[4];    // Up to 4 allowed device hashes (0 = any)
    
    // ============ Public Outputs ============
    signal output timeValid;                // 1 if timestamp in range
    signal output gpsPresent;               // 1 if GPS coords present
    signal output resolutionValid;          // 1 if meets min resolution
    signal output deviceValid;              // 1 if device matches (or any allowed)
    signal output imageHash;                // Hash of image for linking
    signal output exifCommitment;           // Commitment to full EXIF data
    
    // ============ Timestamp Validation ============
    component timeAfterMin = GreaterEqThan(64);
    timeAfterMin.in[0] <== actualTimestamp;
    timeAfterMin.in[1] <== minTimestamp;
    
    component timeBeforeMax = LessEqThan(64);
    timeBeforeMax.in[0] <== actualTimestamp;
    timeBeforeMax.in[1] <== maxTimestamp;
    
    timeValid <== timeAfterMin.out * timeBeforeMax.out;
    
    // ============ GPS Presence ============
    // GPS present if lat != 0 OR lng != 0
    component latNonZero = IsZero();
    latNonZero.in <== actualLat;
    
    component lngNonZero = IsZero();
    lngNonZero.in <== actualLng;
    
    // gpsPresent = NOT(lat==0 AND lng==0)
    gpsPresent <== 1 - (latNonZero.out * lngNonZero.out);
    
    // If requireGps=1, must have GPS
    signal gpsCheck;
    gpsCheck <== requireGps * (1 - gpsPresent);
    gpsCheck === 0; // Fails if GPS required but not present
    
    // ============ Resolution Validation ============
    component widthCheck = GreaterEqThan(32);
    widthCheck.in[0] <== actualWidth;
    widthCheck.in[1] <== minWidth;
    
    component heightCheck = GreaterEqThan(32);
    heightCheck.in[0] <== actualHeight;
    heightCheck.in[1] <== minHeight;
    
    resolutionValid <== widthCheck.out * heightCheck.out;
    
    // ============ Device Validation ============
    // Check if device matches any allowed (or all zeros = any device OK)
    component deviceMatch[4];
    signal deviceMatchAny[4];
    signal allZero[4];
    
    for (var i = 0; i < 4; i++) {
        deviceMatch[i] = IsEqual();
        deviceMatch[i].in[0] <== actualDeviceHash;
        deviceMatch[i].in[1] <== allowedDeviceHashes[i];
        
        component zeroCheck = IsZero();
        zeroCheck.in <== allowedDeviceHashes[i];
        allZero[i] <== zeroCheck.out;
        
        deviceMatchAny[i] <== deviceMatch[i].out + allZero[i];
    }
    
    // Any match = valid
    signal anyMatch;
    anyMatch <== deviceMatchAny[0] + deviceMatchAny[1] + deviceMatchAny[2] + deviceMatchAny[3];
    
    component anyMatchCheck = GreaterThan(8);
    anyMatchCheck.in[0] <== anyMatch;
    anyMatchCheck.in[1] <== 0;
    deviceValid <== anyMatchCheck.out;
    
    // ============ Image Hash (for linking) ============
    imageHash <== imageContentHash;
    
    // ============ EXIF Commitment ============
    component commitHash = Poseidon(6);
    commitHash.inputs[0] <== actualTimestamp;
    commitHash.inputs[1] <== actualLat;
    commitHash.inputs[2] <== actualLng;
    commitHash.inputs[3] <== actualWidth;
    commitHash.inputs[4] <== actualHeight;
    commitHash.inputs[5] <== actualDeviceHash;
    exifCommitment <== commitHash.out;
}

component main {public [
    minTimestamp, maxTimestamp, requireGps,
    minWidth, minHeight, allowedDeviceHashes
]} = ImageExifProof(32);
