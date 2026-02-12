#!/bin/bash
# Deploy intel-registry contract to NEAR
#
# Prerequisites:
# - near-cli installed (npm i -g near-cli)
# - Logged in: near login
# - Contract built: cd .. && ./build.sh

set -e

NETWORK=${1:-testnet}
CONTRACT_ACCOUNT=${2:-intel-registry.argus-test.testnet}
OWNER_ACCOUNT=${3:-argus-test.testnet}

echo "📦 Deploying intel-registry to ${NETWORK}..."
echo "   Contract: ${CONTRACT_ACCOUNT}"
echo "   Owner: ${OWNER_ACCOUNT}"

# Check if WASM exists
WASM_PATH="../out/intel_registry.wasm"
if [ ! -f "$WASM_PATH" ]; then
    echo "❌ WASM file not found. Run ./build.sh first."
    exit 1
fi

# Create account if needed (testnet only)
if [ "$NETWORK" = "testnet" ]; then
    echo "🔧 Creating contract account (if needed)..."
    near create-account $CONTRACT_ACCOUNT --masterAccount $OWNER_ACCOUNT --initialBalance 10 2>/dev/null || true
fi

# Deploy
echo "🚀 Deploying contract..."
near deploy --accountId $CONTRACT_ACCOUNT --wasmFile $WASM_PATH

# Initialize
echo "🔧 Initializing contract..."
near call $CONTRACT_ACCOUNT new "{\"owner\": \"$OWNER_ACCOUNT\"}" --accountId $OWNER_ACCOUNT

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Contract: $CONTRACT_ACCOUNT"
echo "Owner: $OWNER_ACCOUNT"
echo ""
echo "Test commands:"
echo "  # Get stats"
echo "  near view $CONTRACT_ACCOUNT get_stats"
echo ""
echo "  # Register a proof"
echo "  near call $CONTRACT_ACCOUNT register_proof '{\"proof_id\":\"test-001\",\"commitment\":\"'$(printf 'a%.0s' {1..64})'\",\"proof_type\":\"LocationProximity\",\"source_hash\":\"'$(printf 'b%.0s' {1..64})'\",\"intel_hash\":\"'$(printf 'c%.0s' {1..64})'\",\"public_inputs_hash\":\"'$(printf 'd%.0s' {1..64})'\"}' --accountId $OWNER_ACCOUNT"
