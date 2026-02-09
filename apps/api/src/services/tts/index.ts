/**
 * TTS Service - Unified Interface
 * 
 * Uses self-hosted XTTS when available, falls back to ElevenLabs.
 * Configure with:
 *   - XTTS_URL, XTTS_API_KEY, XTTS_DEFAULT_SPEAKER for XTTS
 *   - ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID for ElevenLabs fallback
 */

import * as xtts from './xtts.js';
import * as elevenlabs from './elevenlabs.js';

const USE_XTTS = process.env.XTTS_URL || process.env.XTTS_API_KEY;
const PREFER_XTTS = process.env.TTS_PROVIDER !== 'elevenlabs';

interface TTSOptions {
  // XTTS options
  speaker?: string;
  language?: string;
  // ElevenLabs options
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  modelId?: string;
}

/**
 * Convert text to speech
 */
export async function textToSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<{ audioBase64: string; contentType: string } | null> {
  // Try XTTS first if configured and preferred
  if (USE_XTTS && PREFER_XTTS) {
    const xttsAvailable = await xtts.isAvailable();
    if (xttsAvailable) {
      const result = await xtts.textToSpeech(text, {
        speaker: options.speaker,
        language: options.language,
      });
      if (result) return result;
    }
  }

  // Fall back to ElevenLabs
  return elevenlabs.textToSpeech(text, {
    voiceId: options.voiceId,
    stability: options.stability,
    similarityBoost: options.similarityBoost,
    style: options.style,
    modelId: options.modelId,
  });
}

/**
 * Generate briefing audio (handles long content)
 */
export async function generateBriefingAudio(
  script: string,
  options: TTSOptions = {}
): Promise<{ audioBase64: string; contentType: string; durationEstimate: number } | null> {
  // Try XTTS first if configured and preferred
  if (USE_XTTS && PREFER_XTTS) {
    const xttsAvailable = await xtts.isAvailable();
    if (xttsAvailable) {
      const result = await xtts.generateBriefingAudio(script, {
        speaker: options.speaker,
        language: options.language,
      });
      if (result) return result;
    }
  }

  // Fall back to ElevenLabs
  return elevenlabs.generateBriefingAudio(script, {
    voiceId: options.voiceId,
    stability: options.stability,
    similarityBoost: options.similarityBoost,
    style: options.style,
    modelId: options.modelId,
  });
}

/**
 * Get available voices
 */
export async function getVoices(): Promise<{ provider: string; voices: string[] }[]> {
  const result: { provider: string; voices: string[] }[] = [];

  // Get XTTS voices
  if (USE_XTTS) {
    const xttsVoices = await xtts.getVoices();
    if (xttsVoices) {
      result.push({ provider: 'xtts', voices: xttsVoices });
    }
  }

  // Get ElevenLabs voices
  const elevenVoices = await elevenlabs.getVoices();
  if (elevenVoices) {
    result.push({ 
      provider: 'elevenlabs', 
      voices: elevenVoices.map((v: any) => v.name) 
    });
  }

  return result;
}

/**
 * Get current TTS provider status
 */
export async function getStatus(): Promise<{
  xtts: { available: boolean; url?: string };
  elevenlabs: { available: boolean };
  activeProvider: string;
}> {
  const xttsAvailable = USE_XTTS ? await xtts.isAvailable() : false;
  const elevenAvailable = !!process.env.ELEVENLABS_API_KEY;

  return {
    xtts: {
      available: xttsAvailable,
      url: USE_XTTS ? process.env.XTTS_URL : undefined,
    },
    elevenlabs: {
      available: elevenAvailable,
    },
    activeProvider: xttsAvailable && PREFER_XTTS ? 'xtts' : elevenAvailable ? 'elevenlabs' : 'none',
  };
}

export type { TTSOptions };
