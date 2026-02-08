#!/bin/bash
# Build NEAR contracts for Argus

set -e

echo "🔨 Building NEAR contracts..."

# Ensure we have the WASM target
rustup target add wasm32-unknown-unknown 2>/dev/null || true

# Build data-registry
echo "📦 Building data-registry..."
cd data-registry
cargo build --target wasm32-unknown-unknown --release
mkdir -p ../out
cp target/wasm32-unknown-unknown/release/data_registry.wasm ../out/
cd ..

# Build source-list-nft
echo "📦 Building source-list-nft..."
cd source-list-nft
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/source_list_nft.wasm ../out/
cd ..

echo "✅ Contracts built successfully!"
echo ""
echo "Output files:"
ls -lh out/*.wasm

echo ""
echo "To deploy to testnet:"
echo "  near deploy --accountId your-contract.testnet --wasmFile out/data_registry.wasm"
echo "  near deploy --accountId your-nft.testnet --wasmFile out/source_list_nft.wasm"
