#!/bin/bash
# Build ZK circuits for Argus
# Compiles Circom circuits and generates proving/verification keys

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZK_DIR="$(dirname "$SCRIPT_DIR")"
CIRCUITS_DIR="$ZK_DIR/circuits"
BUILD_DIR="$ZK_DIR/build"
PTAU_FILE="$BUILD_DIR/pot14_final.ptau"

# Ensure circom is in PATH
export PATH="$HOME/.cargo/bin:$PATH"

# Check dependencies
if ! command -v circom &> /dev/null; then
    echo "❌ circom not found. Install from https://docs.circom.io/getting-started/installation/"
    exit 1
fi

if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Install Node.js"
    exit 1
fi

if [ ! -f "$PTAU_FILE" ]; then
    echo "❌ Powers of Tau file not found at $PTAU_FILE"
    echo "   Download from: https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau"
    exit 1
fi

echo "🔧 Building ZK circuits..."
echo "   Circuits: $CIRCUITS_DIR"
echo "   Output: $BUILD_DIR"

# Get circomlib path (check multiple locations)
PROJECT_ROOT="$(cd "$ZK_DIR/../../../../.." && pwd)"
CIRCOMLIB_PATH=""
for candidate in \
    "$PROJECT_ROOT/node_modules/circomlib/circuits" \
    "$ZK_DIR/../../../node_modules/circomlib/circuits" \
    "$ZK_DIR/../../node_modules/circomlib/circuits"; do
    if [ -d "$candidate" ]; then
        CIRCOMLIB_PATH="$candidate"
        break
    fi
done

if [ -z "$CIRCOMLIB_PATH" ]; then
    echo "❌ circomlib not found. Run: npm install circomlib"
    exit 1
fi

echo "   Circomlib: $CIRCOMLIB_PATH"

# Build each circuit
for circuit in reputation location identity-rotation; do
    CIRCUIT_FILE="$CIRCUITS_DIR/${circuit}.circom"
    
    if [ ! -f "$CIRCUIT_FILE" ]; then
        echo "⚠️  Skipping $circuit (file not found)"
        continue
    fi
    
    echo ""
    echo "📦 Building $circuit..."
    
    # Compile circuit
    echo "   [1/4] Compiling circuit..."
    circom "$CIRCUIT_FILE" \
        --r1cs \
        --wasm \
        --sym \
        -l "$CIRCOMLIB_PATH" \
        -o "$BUILD_DIR"
    
    # Circuit-specific setup (circom uses hyphens, not underscores)
    R1CS_FILE="$BUILD_DIR/${circuit}.r1cs"
    WASM_DIR="$BUILD_DIR/${circuit}_js"
    
    # Generate proving key (zkey)
    echo "   [2/4] Generating proving key..."
    npx snarkjs groth16 setup "$R1CS_FILE" "$PTAU_FILE" "$BUILD_DIR/${circuit}_0000.zkey"
    
    # Contribute to ceremony (add entropy)
    echo "   [3/4] Contributing to ceremony..."
    echo "argus-zk-$(date +%s)" | npx snarkjs zkey contribute \
        "$BUILD_DIR/${circuit}_0000.zkey" \
        "$BUILD_DIR/${circuit}_final.zkey" \
        --name="Argus Contribution" \
        -v
    
    # Export verification key
    echo "   [4/4] Exporting verification key..."
    npx snarkjs zkey export verificationkey \
        "$BUILD_DIR/${circuit}_final.zkey" \
        "$BUILD_DIR/${circuit}_verification_key.json"
    
    # Cleanup intermediate files
    rm -f "$BUILD_DIR/${circuit}_0000.zkey"
    
    echo "   ✅ $circuit built successfully"
done

echo ""
echo "✅ All circuits built!"
echo ""
echo "Generated files:"
ls -lh "$BUILD_DIR"/*.zkey "$BUILD_DIR"/*_verification_key.json 2>/dev/null || true
