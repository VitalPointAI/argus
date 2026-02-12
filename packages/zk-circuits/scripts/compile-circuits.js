#!/usr/bin/env node

/**
 * Compile Circom circuits to R1CS and generate WASM
 * 
 * Prerequisites:
 * - circom installed: npm install -g circom
 * - snarkjs installed: npm install snarkjs
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CIRCUITS_DIR = path.join(__dirname, '../circuits');
const BUILD_DIR = path.join(__dirname, '../build');
const PTAU_PATH = path.join(__dirname, '../ptau/pot12_final.ptau');

// Circuits to compile
const CIRCUITS = [
  'location_proximity',
  'timestamp_range',
  'document_keywords',
];

async function main() {
  console.log('🔧 Compiling ZK circuits...\n');

  // Create build directory
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  // Check for circom
  try {
    execSync('circom --version', { stdio: 'pipe' });
  } catch (e) {
    console.error('❌ Circom not found. Install with: npm install -g circom');
    console.log('\nAlternatively, download from: https://docs.circom.io/getting-started/installation/');
    process.exit(1);
  }

  for (const circuit of CIRCUITS) {
    const circuitPath = path.join(CIRCUITS_DIR, `${circuit}.circom`);
    const outputDir = path.join(BUILD_DIR, circuit);

    if (!fs.existsSync(circuitPath)) {
      console.log(`⚠️ Skipping ${circuit} - file not found`);
      continue;
    }

    console.log(`📦 Compiling ${circuit}...`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      // Compile circuit to R1CS + WASM
      execSync(
        `circom ${circuitPath} --r1cs --wasm --sym --c -o ${outputDir}`,
        { stdio: 'inherit' }
      );

      console.log(`   ✅ R1CS and WASM generated`);

      // Check outputs
      const r1csPath = path.join(outputDir, `${circuit}.r1cs`);
      const wasmPath = path.join(outputDir, `${circuit}_js/${circuit}.wasm`);

      if (fs.existsSync(r1csPath)) {
        const stats = fs.statSync(r1csPath);
        console.log(`   📄 R1CS: ${(stats.size / 1024).toFixed(1)} KB`);
      }

      if (fs.existsSync(wasmPath)) {
        const stats = fs.statSync(wasmPath);
        console.log(`   📄 WASM: ${(stats.size / 1024).toFixed(1)} KB`);
      }

    } catch (error) {
      console.error(`   ❌ Failed to compile ${circuit}`);
      console.error(error.message);
    }

    console.log('');
  }

  console.log('✨ Circuit compilation complete!\n');
  console.log('Next step: Run trusted setup with `npm run setup`');
}

main().catch(console.error);
