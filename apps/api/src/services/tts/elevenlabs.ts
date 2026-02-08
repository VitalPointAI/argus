/**
 * ElevenLabs TTS Service
 * 
 * Converts briefing scripts to audio using ElevenLabs API.
 */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah - news presenter style

interface TTSOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  modelId?: string;
}

/**
 * Convert text to speech using ElevenLabs
 * Returns base64 encoded audio
 */
export async function textToSpeech(
  text: string, 
  options: TTSOptions = {}
): Promise<{ audioBase64: string; contentType: string } | null> {
  if (!ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY not configured');
    return null;
  }

  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: options.modelId || 'eleven_turbo_v2_5',
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
          style: options.style ?? 0.3, // Slight style for news delivery
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API error:', response.status, error);
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    return {
      audioBase64,
      contentType: 'audio/mpeg',
    };
  } catch (error) {
    console.error('TTS error:', error);
    return null;
  }
}

/**
 * Generate briefing audio in chunks (for long content)
 * ElevenLabs has a character limit per request
 */
export async function generateBriefingAudio(
  script: string,
  options: TTSOptions = {}
): Promise<{ audioBase64: string; contentType: string; durationEstimate: number } | null> {
  // ElevenLabs limit is ~5000 chars, we'll chunk at 4000 to be safe
  const CHUNK_SIZE = 4000;
  
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

  // Concatenate audio chunks
  const combined = Buffer.concat(audioChunks);
  
  return {
    audioBase64: combined.toString('base64'),
    contentType: 'audio/mpeg',
    durationEstimate: Math.round(script.split(' ').length / 150 * 60),
  };
}

/**
 * Get available voices
 */
export async function getVoices(): Promise<any[] | null> {
  if (!ELEVENLABS_API_KEY) return null;

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.voices || [];
  } catch {
    return null;
  }
}

export { TTSOptions };
