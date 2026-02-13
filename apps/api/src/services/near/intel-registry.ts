/**
 * NEAR Intel Registry Client
 * 
 * Hybrid verification model:
 * - ZK proofs generated client-side
 * - Commitments stored on-chain (cheap, immutable)
 * - Full verification on-demand
 * - Chain provides immutable timestamp + audit trail
 */

import { connect, keyStores, Contract, Near, Account } from 'near-api-js';
import { createHash } from 'crypto';

// Contract types
export type ProofType = 
  | 'LocationProximity'
  | 'TimestampRange'
  | 'DocumentContains'
  | 'ImageMetadata'
  | 'MultiSourceCorroboration'
  | 'VerifiableCredential'
  | 'SatelliteImagery'
  | 'NetworkMembership'
  | 'FinancialThreshold'
  | 'GenericCommitment';

export type VerificationStatus = 'Pending' | 'Verified' | 'Contested' | 'Refuted';

export interface ProofCommitment {
  proof_id: string;
  commitment: string;
  proof_type: ProofType;
  source_hash: string;
  intel_hash: string;
  public_inputs_hash: string;
  block_height: string;
  timestamp_ns: string;
  metadata: string | null;
  status: VerificationStatus;
  attestation_count: number;
  avg_confidence: number;
}

export interface Attestation {
  attestor: string;
  confidence: number;
  block_height: string;
  note: string | null;
}

export interface SourceStats {
  total_proofs: string;
  total_attestations: string;
  confidence_sum: string;
  verified_count: string;
  refuted_count: string;
  first_proof_height: string;
  last_proof_height: string;
}

export interface ProofWithAttestations {
  proof: ProofCommitment;
  attestations: Attestation[];
}

interface IntelRegistryContract extends Contract {
  // Change methods
  register_proof: (args: {
    proof_id: string;
    commitment: string;
    proof_type: ProofType;
    source_hash: string;
    intel_hash: string;
    public_inputs_hash: string;
    metadata?: string;
  }) => Promise<ProofCommitment>;
  
  attest: (args: {
    proof_id: string;
    confidence: number;
    note?: string;
  }) => Promise<void>;
  
  refute_proof: (args: {
    proof_id: string;
    reason: string;
  }) => Promise<void>;
  
  // View methods
  get_proof: (args: { proof_id: string }) => Promise<ProofCommitment | null>;
  get_proof_with_attestations: (args: { proof_id: string }) => Promise<ProofWithAttestations | null>;
  get_intel_proofs: (args: { intel_hash: string }) => Promise<ProofCommitment[]>;
  get_source_stats: (args: { source_hash: string }) => Promise<SourceStats | null>;
  get_source_reputation: (args: { source_hash: string }) => Promise<number>;
  verify_commitment: (args: { proof_id: string; computed_commitment: string }) => Promise<boolean>;
  get_stats: () => Promise<[string, string]>;
  get_recent_proofs: (args: { limit: number }) => Promise<ProofCommitment[]>;
}

export class IntelRegistryClient {
  private near: Near | null = null;
  private account: Account | null = null;
  private contract: IntelRegistryContract | null = null;
  
  private readonly networkId: string;
  private readonly contractId: string;
  private readonly keyPath: string;
  private readonly accountId: string;

  constructor(config?: {
    networkId?: string;
    contractId?: string;
    keyPath?: string;
    accountId?: string;
  }) {
    this.networkId = config?.networkId || process.env.NEAR_NETWORK_ID || 'mainnet';
    this.contractId = config?.contractId || process.env.NEAR_INTEL_REGISTRY_CONTRACT || 'intel-registry.argus.near';
    this.keyPath = config?.keyPath || process.env.NEAR_KEY_PATH || '~/.near-credentials';
    this.accountId = config?.accountId || process.env.NEAR_ACCOUNT_ID || 'argus.near';
  }

  /**
   * Initialize connection to NEAR
   */
  async connect(): Promise<void> {
    if (this.near) return;

    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(this.keyPath);
    
    const config = {
      networkId: this.networkId,
      keyStore,
      nodeUrl: this.networkId === 'mainnet' 
        ? 'https://rpc.mainnet.fastnear.com'
        : 'https://rpc.testnet.fastnear.com',
      walletUrl: this.networkId === 'mainnet'
        ? 'https://wallet.near.org'
        : 'https://wallet.testnet.near.org',
      helperUrl: this.networkId === 'mainnet'
        ? 'https://helper.mainnet.near.org'
        : 'https://helper.testnet.near.org',
    };

    this.near = await connect(config);
    this.account = await this.near.account(this.accountId);
    
    this.contract = new Contract(this.account, this.contractId, {
      viewMethods: [
        'get_proof',
        'get_proof_with_attestations',
        'get_intel_proofs',
        'get_source_stats',
        'get_source_reputation',
        'verify_commitment',
        'get_stats',
        'get_recent_proofs',
      ],
      changeMethods: [
        'register_proof',
        'attest',
        'refute_proof',
      ],
    }) as IntelRegistryContract;
  }

  /**
   * Compute SHA-256 hash (64 hex chars)
   */
  static sha256(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Compute commitment from proof data
   * commitment = sha256(proof || publicInputs || sourceId)
   */
  static computeCommitment(
    proof: string,
    publicInputs: string,
    sourceId: string
  ): string {
    const data = `${proof}${publicInputs}${sourceId}`;
    return this.sha256(data);
  }

  /**
   * Hash source codename for privacy
   */
  static hashSourceCodename(codename: string): string {
    return this.sha256(`argus:source:${codename.toLowerCase()}`);
  }

  /**
   * Hash intel content
   */
  static hashIntel(intelContent: string): string {
    return this.sha256(intelContent);
  }

  /**
   * Register a proof commitment on-chain
   */
  async registerProof(params: {
    proofId: string;
    proof: string;
    publicInputs: string;
    sourceCodename: string;
    intelContent: string;
    proofType: ProofType;
    metadata?: Record<string, unknown>;
  }): Promise<ProofCommitment> {
    await this.connect();
    
    const sourceHash = IntelRegistryClient.hashSourceCodename(params.sourceCodename);
    const intelHash = IntelRegistryClient.hashIntel(params.intelContent);
    const commitment = IntelRegistryClient.computeCommitment(
      params.proof,
      params.publicInputs,
      sourceHash
    );
    const publicInputsHash = IntelRegistryClient.sha256(params.publicInputs);

    return this.contract!.register_proof({
      proof_id: params.proofId,
      commitment,
      proof_type: params.proofType,
      source_hash: sourceHash,
      intel_hash: intelHash,
      public_inputs_hash: publicInputsHash,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    });
  }

  /**
   * Add attestation to a proof
   */
  async attest(proofId: string, confidence: number, note?: string): Promise<void> {
    await this.connect();
    return this.contract!.attest({ proof_id: proofId, confidence, note });
  }

  /**
   * Refute a proof (admin only)
   */
  async refuteProof(proofId: string, reason: string): Promise<void> {
    await this.connect();
    return this.contract!.refute_proof({ proof_id: proofId, reason });
  }

  /**
   * Get a proof by ID
   */
  async getProof(proofId: string): Promise<ProofCommitment | null> {
    await this.connect();
    return this.contract!.get_proof({ proof_id: proofId });
  }

  /**
   * Get proof with attestations
   */
  async getProofWithAttestations(proofId: string): Promise<ProofWithAttestations | null> {
    await this.connect();
    return this.contract!.get_proof_with_attestations({ proof_id: proofId });
  }

  /**
   * Get all proofs for intel
   */
  async getIntelProofs(intelContent: string): Promise<ProofCommitment[]> {
    await this.connect();
    const intelHash = IntelRegistryClient.hashIntel(intelContent);
    return this.contract!.get_intel_proofs({ intel_hash: intelHash });
  }

  /**
   * Get source statistics
   */
  async getSourceStats(codename: string): Promise<SourceStats | null> {
    await this.connect();
    const sourceHash = IntelRegistryClient.hashSourceCodename(codename);
    return this.contract!.get_source_stats({ source_hash: sourceHash });
  }

  /**
   * Get source reputation (0-100)
   */
  async getSourceReputation(codename: string): Promise<number> {
    await this.connect();
    const sourceHash = IntelRegistryClient.hashSourceCodename(codename);
    return this.contract!.get_source_reputation({ source_hash: sourceHash });
  }

  /**
   * Verify a commitment matches data
   */
  async verifyCommitment(
    proofId: string,
    proof: string,
    publicInputs: string,
    sourceCodename: string
  ): Promise<boolean> {
    await this.connect();
    const sourceHash = IntelRegistryClient.hashSourceCodename(sourceCodename);
    const commitment = IntelRegistryClient.computeCommitment(proof, publicInputs, sourceHash);
    return this.contract!.verify_commitment({ proof_id: proofId, computed_commitment: commitment });
  }

  /**
   * Get registry statistics
   */
  async getStats(): Promise<{ totalProofs: number; totalAttestations: number }> {
    await this.connect();
    const [proofs, attestations] = await this.contract!.get_stats();
    return {
      totalProofs: parseInt(proofs),
      totalAttestations: parseInt(attestations),
    };
  }

  /**
   * Get recent proofs
   */
  async getRecentProofs(limit: number = 10): Promise<ProofCommitment[]> {
    await this.connect();
    return this.contract!.get_recent_proofs({ limit });
  }
}

// Singleton instance
let registryClient: IntelRegistryClient | null = null;

export function getIntelRegistryClient(): IntelRegistryClient {
  if (!registryClient) {
    registryClient = new IntelRegistryClient();
  }
  return registryClient;
}
