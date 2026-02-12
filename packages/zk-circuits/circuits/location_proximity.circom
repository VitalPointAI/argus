pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/*
 * LocationProximity Circuit
 * 
 * Proves that a point (actualLat, actualLng) is within a given radius
 * of a target point (targetLat, targetLng) WITHOUT revealing the actual coordinates.
 * 
 * Uses integer math (coordinates * 1e6 for precision)
 * Haversine approximation using squared Euclidean distance for small distances
 * 
 * Public inputs: targetLat, targetLng, radiusMeters, withinRadius
 * Private inputs: actualLat, actualLng
 */

template LocationProximity() {
    // Private inputs (in microdegrees: degrees * 1e6)
    signal input actualLat;
    signal input actualLng;
    
    // Public inputs
    signal input targetLat;
    signal input targetLng;
    signal input radiusMeters; // in meters
    
    // Public output
    signal output withinRadius;
    signal output distanceSquared; // For verification (not exact distance)
    
    // Calculate difference (squared)
    signal latDiff;
    signal lngDiff;
    signal latDiffSquared;
    signal lngDiffSquared;
    
    latDiff <== actualLat - targetLat;
    lngDiff <== actualLng - targetLng;
    
    latDiffSquared <== latDiff * latDiff;
    lngDiffSquared <== lngDiff * lngDiff;
    
    // Sum of squares (proportional to distance squared)
    // Note: This is simplified - real haversine is more complex
    // For small distances (<100km), this approximation works
    signal sumSquared;
    sumSquared <== latDiffSquared + lngDiffSquared;
    
    // Convert radius to comparable unit
    // 1 degree ≈ 111,000 meters at equator
    // In microdegrees: radiusMeters * 1e6 / 111000 = radiusMicrodegrees
    // Squared: (radiusMeters * 9)^2 approximately (simplified)
    signal radiusThresholdSquared;
    radiusThresholdSquared <== radiusMeters * radiusMeters * 81; // (9^2 = 81, approximation factor)
    
    // Compare: is sumSquared <= radiusThresholdSquared?
    component lt = LessThan(64);
    lt.in[0] <== sumSquared;
    lt.in[1] <== radiusThresholdSquared + 1; // +1 for <= instead of <
    
    withinRadius <== lt.out;
    distanceSquared <== sumSquared;
}

component main {public [targetLat, targetLng, radiusMeters]} = LocationProximity();
