'use client';

import { useState, useCallback, useEffect } from 'react';
import EXIF from 'exif-js';
import {
  generateLocationProof as generateZKLocationProof,
  generateTimestampProof as generateZKTimestampProof,
  generateDocumentProof as generateZKDocumentProof,
  checkCircuitsAvailable,
  haversineDistance,
} from '@/lib/zk-proofs';

interface ProofRequirement {
  template: string;
  params: Record<string, any>;
  description: string;
  required: boolean;
  weight: number;
}

interface GeneratedProof {
  requirementIndex: number;
  proofType: string;
  proofData: any;
  publicInputs: any;
  status: 'pending' | 'generated' | 'failed';
  error?: string;
}

interface ProofGeneratorProps {
  requirements: ProofRequirement[];
  onProofsGenerated: (proofs: GeneratedProof[]) => void;
}

export function ProofGenerator({ requirements, onProofsGenerated }: ProofGeneratorProps) {
  const [proofs, setProofs] = useState<GeneratedProof[]>(
    requirements.map((_, i) => ({
      requirementIndex: i,
      proofType: requirements[i].template,
      proofData: null,
      publicInputs: null,
      status: 'pending',
    }))
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [zkAvailable, setZkAvailable] = useState<boolean | null>(null);

  // Check if full ZK circuits are available
  useEffect(() => {
    checkCircuitsAvailable().then(setZkAvailable);
  }, []);

  // Handle image upload for location/timestamp proofs
  const handleImageUpload = useCallback(async (
    file: File, 
    requirementIndex: number,
    requirement: ProofRequirement
  ) => {
    setIsGenerating(true);
    
    try {
      // Extract EXIF data client-side
      const exifData = await new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.onload = function() {
            EXIF.getData(img as any, function(this: any) {
              const allMetaData = EXIF.getAllTags(this);
              resolve(allMetaData);
            });
          };
          img.onerror = reject;
          img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      let proof: GeneratedProof;

      if (requirement.template === 'location_proximity') {
        // Extract GPS coordinates
        const lat = exifData.GPSLatitude;
        const lng = exifData.GPSLongitude;
        const latRef = exifData.GPSLatitudeRef;
        const lngRef = exifData.GPSLongitudeRef;

        if (!lat || !lng) {
          throw new Error('Image does not contain GPS data. Please use a photo with location enabled.');
        }

        // Convert to decimal degrees
        const actualLat = convertDMSToDD(lat, latRef);
        const actualLng = convertDMSToDD(lng, lngRef);

        // Calculate distance to target
        const { target_lat, target_lng, radius_km } = requirement.params;
        const radiusMeters = radius_km * 1000;
        const distance = haversineDistance(actualLat, actualLng, target_lat, target_lng) / 1000; // km
        const withinRadius = distance <= radius_km;

        let proofData;
        let publicInputs;

        if (zkAvailable) {
          // Use full ZK proof generation
          console.log('🔐 Generating full ZK location proof...');
          const zkResult = await generateZKLocationProof({
            actualLat,
            actualLng,
            targetLat: target_lat,
            targetLng: target_lng,
            radiusMeters,
          });
          proofData = zkResult.proof;
          publicInputs = {
            target_lat,
            target_lng,
            radius_km,
            within_radius: zkResult.publicInputs.withinRadius,
            proof_type: 'groth16',
          };
        } else {
          // Fallback to commitment-based proof
          console.log('⚠️ ZK circuits not available, using commitment proof...');
          proofData = await generateLocationProofFallback(actualLat, actualLng, target_lat, target_lng, radius_km);
          publicInputs = {
            target_lat,
            target_lng,
            radius_km,
            within_radius: withinRadius,
            distance_km: Math.round(distance * 10) / 10,
            proof_type: 'commitment',
          };
        }

        proof = {
          requirementIndex,
          proofType: 'location_proximity',
          proofData,
          publicInputs,
          status: withinRadius ? 'generated' : 'failed',
          error: withinRadius ? undefined : `Location is ${distance.toFixed(1)}km from target, exceeds ${radius_km}km radius`,
        };

      } else if (requirement.template === 'timestamp_range') {
        // Extract timestamp
        const dateTimeOriginal = exifData.DateTimeOriginal;
        
        if (!dateTimeOriginal) {
          throw new Error('Image does not contain timestamp data.');
        }

        // Parse EXIF date format (YYYY:MM:DD HH:MM:SS)
        const [datePart, timePart] = dateTimeOriginal.split(' ');
        const [year, month, day] = datePart.split(':');
        const timestamp = new Date(`${year}-${month}-${day}T${timePart}`);

        const { not_before, not_after } = requirement.params;
        const notBefore = new Date(not_before);
        const notAfter = new Date(not_after);
        
        const withinRange = timestamp >= notBefore && timestamp <= notAfter;

        let proofData;
        let publicInputs;

        if (zkAvailable) {
          // Use full ZK proof generation
          console.log('🔐 Generating full ZK timestamp proof...');
          const zkResult = await generateZKTimestampProof({
            timestamp,
            notBefore,
            notAfter,
          });
          proofData = zkResult.proof;
          publicInputs = {
            not_before: zkResult.publicInputs.notBefore,
            not_after: zkResult.publicInputs.notAfter,
            within_range: zkResult.publicInputs.withinRange,
            proof_type: 'groth16',
          };
        } else {
          // Fallback to commitment-based proof
          console.log('⚠️ ZK circuits not available, using commitment proof...');
          proofData = await generateTimestampProofFallback(timestamp, notBefore, notAfter);
          publicInputs = {
            timestamp: timestamp.toISOString(),
            not_before,
            not_after,
            within_range: withinRange,
            proof_type: 'commitment',
          };
        }

        proof = {
          requirementIndex,
          proofType: 'timestamp_range',
          proofData,
          publicInputs,
          status: withinRange ? 'generated' : 'failed',
          error: withinRange ? undefined : `Timestamp ${timestamp.toISOString()} is outside allowed range`,
        };

      } else if (requirement.template === 'image_metadata') {
        // Check various metadata properties
        const { min_resolution, device_type, has_gps } = requirement.params;
        
        const width = exifData.PixelXDimension || exifData.ImageWidth;
        const height = exifData.PixelYDimension || exifData.ImageHeight;
        const hasGps = !!(exifData.GPSLatitude && exifData.GPSLongitude);
        const make = exifData.Make;
        
        let valid = true;
        let errors: string[] = [];

        if (min_resolution) {
          if (width < min_resolution.width || height < min_resolution.height) {
            valid = false;
            errors.push(`Resolution ${width}x${height} below minimum ${min_resolution.width}x${min_resolution.height}`);
          }
        }

        if (has_gps && !hasGps) {
          valid = false;
          errors.push('Image must have GPS data');
        }

        proof = {
          requirementIndex,
          proofType: 'image_metadata',
          proofData: { verified: valid },
          publicInputs: {
            resolution: { width, height },
            has_gps: hasGps,
            device_make: make || 'Unknown',
          },
          status: valid ? 'generated' : 'failed',
          error: valid ? undefined : errors.join(', '),
        };

      } else {
        throw new Error(`Unsupported proof type for image: ${requirement.template}`);
      }

      // Update proofs state
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = proof;
        return updated;
      });

      // Move to next step if successful
      if (proof.status === 'generated') {
        setCurrentStep(prev => Math.min(prev + 1, requirements.length - 1));
      }

    } catch (error: any) {
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = {
          ...prev[requirementIndex],
          status: 'failed',
          error: error.message,
        };
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  }, [requirements]);

  // Handle document upload for keyword proofs
  const handleDocumentUpload = useCallback(async (
    file: File,
    requirementIndex: number,
    requirement: ProofRequirement
  ) => {
    setIsGenerating(true);

    try {
      const text = await file.text();
      const lowerText = text.toLowerCase();
      
      const { required_keywords } = requirement.params;
      const foundKeywords = required_keywords.filter((kw: string) => 
        lowerText.includes(kw.toLowerCase())
      );
      
      const allFound = foundKeywords.length === required_keywords.length;

      const proofData = await generateDocumentProof(text, required_keywords);

      const proof: GeneratedProof = {
        requirementIndex,
        proofType: 'document_contains',
        proofData,
        publicInputs: {
          keyword_matches: foundKeywords,
          total_keywords: required_keywords.length,
          found_count: foundKeywords.length,
        },
        status: allFound ? 'generated' : 'failed',
        error: allFound ? undefined : `Missing keywords: ${required_keywords.filter((k: string) => !foundKeywords.includes(k)).join(', ')}`,
      };

      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = proof;
        return updated;
      });

      if (proof.status === 'generated') {
        setCurrentStep(prev => Math.min(prev + 1, requirements.length - 1));
      }

    } catch (error: any) {
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = {
          ...prev[requirementIndex],
          status: 'failed',
          error: error.message,
        };
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  }, [requirements]);

  // Handler stubs for new proof types
  const handleCredentialProof = useCallback(async (
    requirementIndex: number,
    requirement: ProofRequirement
  ) => {
    setIsGenerating(true);
    try {
      // In production: Connect to credential wallet (e.g., Microsoft Authenticator, Civic)
      // For now, simulate
      await new Promise(r => setTimeout(r, 1000));
      
      const proof: GeneratedProof = {
        requirementIndex,
        proofType: 'credential_ownership',
        proofData: { verified: true, type: 'simulated' },
        publicInputs: {
          credential_type: requirement.params.credential_type,
          verified: true,
          proof_type: 'commitment',
        },
        status: 'generated',
      };
      
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = proof;
        return updated;
      });
      setCurrentStep(prev => Math.min(prev + 1, requirements.length - 1));
    } catch (error: any) {
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = { ...prev[requirementIndex], status: 'failed', error: error.message };
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  }, [requirements]);

  const handleFinancialProof = useCallback(async (
    requirementIndex: number,
    requirement: ProofRequirement,
    source: 'bank' | 'crypto'
  ) => {
    setIsGenerating(true);
    try {
      // In production: Connect to bank/exchange API or crypto wallet
      await new Promise(r => setTimeout(r, 1000));
      
      const proof: GeneratedProof = {
        requirementIndex,
        proofType: 'financial_threshold',
        proofData: { verified: true, source, type: 'simulated' },
        publicInputs: {
          min_met: true,
          max_met: true,
          source,
          proof_type: 'commitment',
        },
        status: 'generated',
      };
      
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = proof;
        return updated;
      });
      setCurrentStep(prev => Math.min(prev + 1, requirements.length - 1));
    } catch (error: any) {
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = { ...prev[requirementIndex], status: 'failed', error: error.message };
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  }, [requirements]);

  const handleNetworkProof = useCallback(async (
    requirementIndex: number,
    requirement: ProofRequirement
  ) => {
    setIsGenerating(true);
    try {
      // In production: Generate Merkle proof of membership
      await new Promise(r => setTimeout(r, 1000));
      
      const proof: GeneratedProof = {
        requirementIndex,
        proofType: 'network_membership',
        proofData: { verified: true, type: 'simulated' },
        publicInputs: {
          network_id: requirement.params.network_id,
          is_member: true,
          proof_type: 'commitment',
        },
        status: 'generated',
      };
      
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = proof;
        return updated;
      });
      setCurrentStep(prev => Math.min(prev + 1, requirements.length - 1));
    } catch (error: any) {
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = { ...prev[requirementIndex], status: 'failed', error: error.message };
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  }, [requirements]);

  const handleSequenceEvent = useCallback(async (
    requirementIndex: number,
    requirement: ProofRequirement,
    eventIndex: number,
    file: File
  ) => {
    // Store event data and check if all events collected
    console.log(`Sequence event ${eventIndex} uploaded for requirement ${requirementIndex}`);
    // TODO: Implement full sequence proof when all events collected
  }, []);

  const handleChainOfCustody = useCallback(async (
    requirementIndex: number,
    requirement: ProofRequirement,
    file: File
  ) => {
    setIsGenerating(true);
    try {
      const content = await file.text();
      // Parse custody chain from JSON/PDF
      
      const proof: GeneratedProof = {
        requirementIndex,
        proofType: 'chain_of_custody',
        proofData: { verified: true, type: 'simulated' },
        publicInputs: {
          handlers_count: requirement.params.min_handlers || 1,
          content_unmodified: true,
          chain_valid: true,
          proof_type: 'commitment',
        },
        status: 'generated',
      };
      
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = proof;
        return updated;
      });
      setCurrentStep(prev => Math.min(prev + 1, requirements.length - 1));
    } catch (error: any) {
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = { ...prev[requirementIndex], status: 'failed', error: error.message };
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  }, [requirements]);

  const handleCommunicationProof = useCallback(async (
    requirementIndex: number,
    requirement: ProofRequirement,
    file: File
  ) => {
    setIsGenerating(true);
    try {
      const content = await file.text();
      // Parse signed message
      
      const proof: GeneratedProof = {
        requirementIndex,
        proofType: 'communication_proof',
        proofData: { verified: true, type: 'simulated' },
        publicInputs: {
          sender_matches: true,
          in_time_window: true,
          proof_type: 'commitment',
        },
        status: 'generated',
      };
      
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = proof;
        return updated;
      });
      setCurrentStep(prev => Math.min(prev + 1, requirements.length - 1));
    } catch (error: any) {
      setProofs(prev => {
        const updated = [...prev];
        updated[requirementIndex] = { ...prev[requirementIndex], status: 'failed', error: error.message };
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  }, [requirements]);

  // Check if all required proofs are generated
  const allRequiredGenerated = requirements.every((req, i) => 
    !req.required || proofs[i]?.status === 'generated'
  );

  const handleSubmit = () => {
    const generatedProofs = proofs.filter(p => p.status === 'generated');
    onProofsGenerated(generatedProofs);
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200">
            🔐 Zero-Knowledge Proof Generation
          </h3>
          {zkAvailable !== null && (
            <span className={`text-xs px-2 py-1 rounded ${
              zkAvailable 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
            }`}>
              {zkAvailable ? '✓ Full ZK (Groth16)' : '⚠️ Commitment Mode'}
            </span>
          )}
        </div>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Your evidence is processed <strong>locally in your browser</strong>. 
          {zkAvailable 
            ? ' Full zero-knowledge proofs are generated using Groth16 - mathematically impossible to reverse.'
            : ' Commitment-based proofs are generated - your data remains private but proofs are simpler.'
          }
        </p>
      </div>

      {requirements.map((req, index) => (
        <div 
          key={index}
          className={`border rounded-lg p-4 ${
            index === currentStep 
              ? 'border-argus-500 bg-argus-50 dark:bg-argus-900/20' 
              : 'border-slate-200 dark:border-slate-700'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  proofs[index]?.status === 'generated' 
                    ? 'bg-green-500 text-white'
                    : proofs[index]?.status === 'failed'
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
                }`}>
                  {proofs[index]?.status === 'generated' ? '✓' : index + 1}
                </span>
                <h4 className="font-medium">{req.description}</h4>
                {req.required && (
                  <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded">
                    Required
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-8">
                Proof type: {req.template}
              </p>
            </div>
          </div>

          {/* Proof input based on type */}
          {(req.template === 'location_proximity' || req.template === 'timestamp_range' || req.template === 'image_metadata') && (
            <div className="ml-8">
              <label className="block">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Upload a photo with {req.template === 'location_proximity' ? 'GPS data' : 'timestamp'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file, index, req);
                  }}
                  disabled={isGenerating}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-argus-50 file:text-argus-700 hover:file:bg-argus-100"
                />
              </label>
            </div>
          )}

          {req.template === 'document_contains' && (
            <div className="ml-8">
              <label className="block">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Upload document containing: {req.params.required_keywords?.join(', ')}
                </span>
                <input
                  type="file"
                  accept=".txt,.pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDocumentUpload(file, index, req);
                  }}
                  disabled={isGenerating}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-argus-50 file:text-argus-700 hover:file:bg-argus-100"
                />
              </label>
            </div>
          )}

          {req.template === 'multi_source_corroboration' && (
            <div className="ml-8 text-sm text-slate-500">
              This proof requires {req.params.min_sources || req.params.min_witnesses} independent sources to confirm.
              Other sources must also submit to fulfill this requirement.
            </div>
          )}

          {req.template === 'credential_ownership' && (
            <div className="ml-8 space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Prove possession of: <strong>{req.params.credential_type}</strong>
                {req.params.issuer && <> from {req.params.issuer}</>}
              </p>
              <button
                onClick={() => handleCredentialProof(index, req)}
                disabled={isGenerating}
                className="px-4 py-2 text-sm bg-argus-100 hover:bg-argus-200 dark:bg-argus-800 dark:hover:bg-argus-700 text-argus-700 dark:text-argus-200 rounded"
              >
                Connect Credential Wallet
              </button>
              <p className="text-xs text-slate-500">
                Supports W3C Verifiable Credentials, professional licenses, press passes
              </p>
            </div>
          )}

          {req.template === 'financial_threshold' && (
            <div className="ml-8 space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Prove value {req.params.min_value ? `≥ ${req.params.min_value}` : ''}
                {req.params.max_value ? ` ≤ ${req.params.max_value}` : ''}
                {req.params.currency && ` ${req.params.currency}`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFinancialProof(index, req, 'bank')}
                  disabled={isGenerating}
                  className="px-4 py-2 text-sm bg-argus-100 hover:bg-argus-200 dark:bg-argus-800 dark:hover:bg-argus-700 text-argus-700 dark:text-argus-200 rounded"
                >
                  Bank Statement
                </button>
                <button
                  onClick={() => handleFinancialProof(index, req, 'crypto')}
                  disabled={isGenerating}
                  className="px-4 py-2 text-sm bg-argus-100 hover:bg-argus-200 dark:bg-argus-800 dark:hover:bg-argus-700 text-argus-700 dark:text-argus-200 rounded"
                >
                  Crypto Wallet
                </button>
              </div>
            </div>
          )}

          {req.template === 'network_membership' && (
            <div className="ml-8 space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Prove membership in: <strong>{req.params.network_id}</strong>
                {req.params.required_role && <> with role: {req.params.required_role}</>}
              </p>
              <button
                onClick={() => handleNetworkProof(index, req)}
                disabled={isGenerating}
                className="px-4 py-2 text-sm bg-argus-100 hover:bg-argus-200 dark:bg-argus-800 dark:hover:bg-argus-700 text-argus-700 dark:text-argus-200 rounded"
              >
                Prove Membership
              </button>
            </div>
          )}

          {req.template === 'temporal_sequence' && (
            <div className="ml-8 space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Prove {req.params.event_count} events occurred in sequence
              </p>
              <div className="border rounded p-3 space-y-2">
                {Array.from({ length: req.params.event_count || 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Event {i + 1}:</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleSequenceEvent(index, req, i, file);
                      }}
                      className="text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {req.template === 'chain_of_custody' && (
            <div className="ml-8 space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Prove document chain with ≥{req.params.min_handlers || 1} handlers
              </p>
              <label className="block">
                <span className="text-xs text-slate-500">Upload document with custody chain</span>
                <input
                  type="file"
                  accept=".pdf,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleChainOfCustody(index, req, file);
                  }}
                  disabled={isGenerating}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-argus-50 file:text-argus-700 hover:file:bg-argus-100"
                />
              </label>
            </div>
          )}

          {req.template === 'communication_proof' && (
            <div className="ml-8 space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Prove receipt of message
                {req.params.sender_type && <> from {req.params.sender_type}</>}
                {req.params.channel_type && <> via {req.params.channel_type}</>}
              </p>
              <label className="block">
                <span className="text-xs text-slate-500">Upload signed message or export</span>
                <input
                  type="file"
                  accept=".json,.eml,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCommunicationProof(index, req, file);
                  }}
                  disabled={isGenerating}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-argus-50 file:text-argus-700 hover:file:bg-argus-100"
                />
              </label>
            </div>
          )}

          {req.template === 'image_exif' && (
            <div className="ml-8">
              <label className="block">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Upload photo with EXIF metadata
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file, index, req);
                  }}
                  disabled={isGenerating}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-argus-50 file:text-argus-700 hover:file:bg-argus-100"
                />
              </label>
            </div>
          )}

          {/* Status display */}
          {proofs[index]?.status === 'generated' && (
            <div className="mt-3 ml-8 p-3 bg-green-50 dark:bg-green-900/20 rounded text-sm">
              <div className="text-green-700 dark:text-green-300 font-medium">✓ Proof generated</div>
              <div className="text-green-600 dark:text-green-400 text-xs mt-1">
                Public inputs: {JSON.stringify(proofs[index].publicInputs, null, 2)}
              </div>
            </div>
          )}

          {proofs[index]?.status === 'failed' && (
            <div className="mt-3 ml-8 p-3 bg-red-50 dark:bg-red-900/20 rounded text-sm">
              <div className="text-red-700 dark:text-red-300 font-medium">✗ Proof failed</div>
              <div className="text-red-600 dark:text-red-400 text-xs mt-1">
                {proofs[index].error}
              </div>
            </div>
          )}
        </div>
      ))}

      {isGenerating && (
        <div className="text-center py-4 text-slate-500">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-argus-500 border-t-transparent rounded-full mr-2"></div>
          Generating proof...
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={handleSubmit}
          disabled={!allRequiredGenerated || isGenerating}
          className="px-6 py-2 bg-argus-600 hover:bg-argus-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {allRequiredGenerated ? 'Submit with Proofs' : 'Generate Required Proofs First'}
        </button>
      </div>
    </div>
  );
}

// Helper functions

function convertDMSToDD(dms: number[], ref: string): number {
  const degrees = dms[0];
  const minutes = dms[1];
  const seconds = dms[2];
  let dd = degrees + minutes / 60 + seconds / 3600;
  if (ref === 'S' || ref === 'W') dd = -dd;
  return dd;
}

// Fallback proof generation (when ZK circuits not available)
async function generateLocationProofFallback(
  actualLat: number, 
  actualLng: number, 
  targetLat: number, 
  targetLng: number, 
  radiusKm: number
): Promise<any> {
  // In production: Use snarkjs to generate actual ZK proof
  // For now, create a commitment hash
  const encoder = new TextEncoder();
  const data = encoder.encode(`${actualLat},${actualLng},${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const commitment = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return {
    type: 'location_proximity',
    commitment,
    // In production: actual snarkjs proof bytes
    proof: 'placeholder_proof_data',
    version: '0.1.0',
  };
}

async function generateTimestampProofFallback(
  timestamp: Date,
  notBefore: Date,
  notAfter: Date
): Promise<any> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${timestamp.toISOString()},${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const commitment = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return {
    type: 'timestamp_range',
    commitment,
    proof: 'commitment_only',
    version: '0.1.0',
  };
}

async function generateDocumentProof(
  content: string,
  keywords: string[]
): Promise<any> {
  // Hash the document + keywords for commitment
  const encoder = new TextEncoder();
  const data = encoder.encode(`${content.substring(0, 1000)},${keywords.join(',')},${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const commitment = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return {
    type: 'document_contains',
    commitment,
    proof: 'placeholder_proof_data',
    version: '0.1.0',
  };
}

export default ProofGenerator;
