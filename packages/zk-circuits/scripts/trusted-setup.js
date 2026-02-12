#!/usr/bin/env node

/**
 * Perform trusted setup for ZK circuits
 * 
 * Uses Powers of Tau ceremony + circuit-specific setup
 * For production, use Hermez or other audited ptau files
 */

const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '../build');
const PTAU_DIR = path.join(__dirname, '../ptau');
const KEYS_DIR = path.join(__dirname, '../keys');

// Circuits that need setup
const CIRCUITS = [
  'location_proximity',
  'timestamp_range',
  'document_keywords',
];

// Powers of Tau parameters
const PTAU_POWER = 12; // 2^12 = 4096 constraints max

async function downloadPtau() {
  const ptauPath = path.join(PTAU_DIR, `pot${PTAU_POWER}_final.ptau`);
  
  if (fs.existsSync(ptauPath)) {
    console.log(`✅ Powers of Tau file exists: pot${PTAU_POWER}_final.ptau`);
    return ptauPath;
  }

  console.log(`📥 Downloading Powers of Tau (2^${PTAU_POWER})...`);
  
  // Create directory
  if (!fs.existsSync(PTAU_DIR)) {
    fs.mkdirSync(PTAU_DIR, { recursive: true });
  }

  // Download from Hermez
  const url = `https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_${PTAU_POWER}.ptau`;
  
  const { execSync } = require('child_process');
  try {
    execSync(`curl -L -o ${ptauPath} ${url}`, { stdio: 'inherit' });
    console.log(`✅ Downloaded pot${PTAU_POWER}_final.ptau`);
  } catch (e) {
    console.error('❌ Failed to download Powers of Tau');
    console.log('\nManual download:');
    console.log(`  curl -L -o ${ptauPath} ${url}`);
    process.exit(1);
  }

  return ptauPath;
}

async function setupCircuit(circuitName, ptauPath) {
  console.log(`\n🔐 Setting up ${circuitName}...`);

  const circuitDir = path.join(BUILD_DIR, circuitName);
  const r1csPath = path.join(circuitDir, `${circuitName}.r1cs`);
  const keyDir = path.join(KEYS_DIR, circuitName);

  if (!fs.existsSync(r1csPath)) {
    console.log(`   ⚠️ R1CS not found - compile circuits first`);
    return;
  }

  // Create keys directory
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }

  const zkeyPath = path.join(keyDir, `${circuitName}.zkey`);
  const vkeyPath = path.join(keyDir, `${circuitName}_vkey.json`);

  try {
    // Phase 2: Circuit-specific setup
    console.log('   📝 Generating proving key...');
    await snarkjs.zKey.newZKey(r1csPath, ptauPath, zkeyPath);

    // Export verification key
    console.log('   📝 Exporting verification key...');
    const vkey = await snarkjs.zKey.exportVerificationKey(zkeyPath);
    fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));

    // Get circuit info
    const r1csInfo = await snarkjs.r1cs.info(r1csPath);
    console.log(`   📊 Constraints: ${r1csInfo.nConstraints}`);
    console.log(`   📊 Public inputs: ${r1csInfo.nPubInputs}`);
    console.log(`   📊 Private inputs: ${r1csInfo.nPrvInputs}`);

    const zkeyStats = fs.statSync(zkeyPath);
    console.log(`   📄 Proving key: ${(zkeyStats.size / 1024).toFixed(1)} KB`);
    
    console.log(`   ✅ Setup complete for ${circuitName}`);

  } catch (error) {
    console.error(`   ❌ Setup failed for ${circuitName}`);
    console.error(error.message);
  }
}

async function main() {
  console.log('🔐 ZK Circuit Trusted Setup\n');
  console.log('⚠️  For production, use an audited Powers of Tau ceremony!\n');

  // Download or verify Powers of Tau
  const ptauPath = await downloadPtau();

  // Create keys directory
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  // Setup each circuit
  for (const circuit of CIRCUITS) {
    await setupCircuit(circuit, ptauPath);
  }

  console.log('\n✨ Trusted setup complete!');
  console.log('\nProving keys are in: packages/zk-circuits/keys/');
  console.log('\nNext: Copy WASM + keys to web app for client-side proving');
}

main().catch(console.error);
