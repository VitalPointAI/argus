/**
 * Near AI Helper
 * Simple wrapper for LLM calls used by AI services
 */

import { complete } from './intelligence/llm';

/**
 * Call Near AI with a prompt and get a response
 */
export async function callNearAI(params: {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const { system, prompt, model, maxTokens, temperature } = params;
  
  const messages = [];
  
  if (system) {
    messages.push({ role: 'system' as const, content: system });
  }
  
  messages.push({ role: 'user' as const, content: prompt });
  
  const response = await complete(messages, {
    model,
    maxTokens,
    temperature,
  });
  
  return response.content;
}
