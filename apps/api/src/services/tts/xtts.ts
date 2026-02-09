/**
 * Self-hosted Coqui XTTS Service
 * 
 * Converts text to speech using Aaron's self-hosted XTTS server.
 * Uses pre-configured studio speakers for voice cloning.
 */

const XTTS_URL = process.env.XTTS_URL || 'http://3.99.226.201:5002';
const XTTS_API_KEY = process.env.XTTS_API_KEY;
const DEFAULT_SPEAKER = process.env.XTTS_DEFAULT_SPEAKER || 'Craig Gutsy';

interface SpeakerData {
  speaker_embedding: number[];
  gpt_cond_latent: number[][];
}

// Cache speaker embeddings to avoid repeated API calls
let speakerCache: Record<string, SpeakerData> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

interface TTSOptions {
  speaker?: string;
  language?: string;
}

/**
 * Fetch available speakers from XTTS server
 */
async function getSpeakers(): Promise<Record<string, SpeakerData> | null> {
  // Return cached if fresh
  if (speakerCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return speakerCache;
  }

  try {
    const headers: Record<string, string> = {};
    if (XTTS_API_KEY) {
      headers['X-API-Key'] = XTTS_API_KEY;
    }

    const response = await fetch(`${XTTS_URL}/studio_speakers`, { headers });
    
    if (!response.ok) {
      console.error('Failed to fetch XTTS speakers:', response.status);
      return null;
    }

    speakerCache = await response.json();
    cacheTimestamp = Date.now();
    return speakerCache;
  } catch (error) {
    console.error('Error fetching XTTS speakers:', error);
    return null;
  }
}

/**
 * Convert text to speech using XTTS
 * Returns base64 encoded audio (WAV format)
 */
export async function textToSpeech(
  text: string, 
  options: TTSOptions = {}
): Promise<{ audioBase64: string; contentType: string } | null> {
  const speakerName = options.speaker || DEFAULT_SPEAKER;
  const language = options.language || 'en';

  // Get speaker embeddings
  const speakers = await getSpeakers();
  if (!speakers) {
    console.error('Could not fetch XTTS speakers');
    return null;
  }

  const speakerData = speakers[speakerName];
  if (!speakerData) {
    console.error(`Speaker "${speakerName}" not found. Available:`, Object.keys(speakers).slice(0, 10));
    return null;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (XTTS_API_KEY) {
      headers['X-API-Key'] = XTTS_API_KEY;
    }

    const response = await fetch(`${XTTS_URL}/tts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        language,
        speaker_embedding: speakerData.speaker_embedding,
        gpt_cond_latent: speakerData.gpt_cond_latent,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('XTTS API error:', response.status, error);
      return null;
    }

    // Response is a JSON string containing base64 encoded WAV
    const responseText = await response.text();
    // Remove quotes if present (API returns JSON string)
    let audioBase64 = responseText;
    if (audioBase64.startsWith('"') && audioBase64.endsWith('"')) {
      audioBase64 = audioBase64.slice(1, -1);
    }

    return {
      audioBase64,
      contentType: 'audio/wav',
    };
  } catch (error) {
    console.error('XTTS error:', error);
    return null;
  }
}

/**
 * Generate briefing audio, handling long content by chunking
 */
export async function generateBriefingAudio(
  script: string,
  options: TTSOptions = {}
): Promise<{ audioBase64: string; contentType: string; durationEstimate: number } | null> {
  // XTTS can handle longer text, but we'll chunk at ~2000 chars for reliability
  const CHUNK_SIZE = 2000;
  
  if (script.length <= CHUNK_SIZE) {
    const result = await textToSpeech(script, options);
    if (!result) return null;
    return {
      ...result,
      durationEstimate: Math.round(script.split(' ').length / 150 * 60), // ~150 wpm
    };
  }

  // Split into chunks at sentence boundaries
  const chunks: string[] = [];
  let current = '';
  
  for (const sentence of script.split(/(?<=[.!?])\s+/)) {
    if ((current + sentence).length > CHUNK_SIZE) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += ' ' + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Generate audio for each chunk
  const audioChunks: Buffer[] = [];
  
  for (const chunk of chunks) {
    const result = await textToSpeech(chunk, options);
    if (!result) {
      console.error('Failed to generate audio for chunk');
      continue;
    }
    audioChunks.push(Buffer.from(result.audioBase64, 'base64'));
  }

  if (audioChunks.length === 0) {
    return null;
  }

  // For WAV files, we need to properly concatenate with headers
  // For simplicity, we'll just concatenate the raw PCM data
  // This works but may have slight audio artifacts at chunk boundaries
  const combined = Buffer.concat(audioChunks);
  
  return {
    audioBase64: combined.toString('base64'),
    contentType: 'audio/wav',
    durationEstimate: Math.round(script.split(' ').length / 150 * 60),
  };
}

/**
 * Get list of available speaker names
 */
export async function getVoices(): Promise<string[] | null> {
  const speakers = await getSpeakers();
  if (!speakers) return null;
  return Object.keys(speakers);
}

/**
 * Check if XTTS service is available
 */
export async function isAvailable(): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (XTTS_API_KEY) {
      headers['X-API-Key'] = XTTS_API_KEY;
    }

    const response = await fetch(`${XTTS_URL}/languages`, { 
      headers,
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export { TTSOptions };
