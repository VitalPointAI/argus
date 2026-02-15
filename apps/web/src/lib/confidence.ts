/**
 * Confidence Level Utilities
 * 
 * Converts numeric confidence scores (0-1 or 0-100) to human-readable labels.
 * Based on source trustworthiness, not detection accuracy.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceDisplay {
  level: ConfidenceLevel;
  label: string;
  emoji: string;
  color: string;
  bgClass: string;
  description: string;
}

/**
 * Convert a numeric confidence score to a display object
 * @param score - Confidence score (0-1 or 0-100)
 * @returns ConfidenceDisplay object with label, color, etc.
 */
export function getConfidenceDisplay(score: number): ConfidenceDisplay {
  // Normalize to 0-1 if passed as percentage
  const normalized = score > 1 ? score / 100 : score;
  
  if (normalized >= 0.7) {
    return {
      level: 'high',
      label: 'High',
      emoji: '🟢',
      color: 'text-green-600 dark:text-green-400',
      bgClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      description: 'Established source with strong track record'
    };
  } else if (normalized >= 0.4) {
    return {
      level: 'medium',
      label: 'Medium',
      emoji: '🟡',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      description: 'Generally reliable, verify key claims'
    };
  } else {
    return {
      level: 'low',
      label: 'Low',
      emoji: '🔴',
      color: 'text-red-600 dark:text-red-400',
      bgClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      description: 'Use with caution, cross-reference needed'
    };
  }
}

/**
 * Get a simple label with emoji for inline display
 */
export function getConfidenceLabel(score: number): string {
  const display = getConfidenceDisplay(score);
  return `${display.emoji} ${display.label}`;
}

/**
 * Get just the badge class for styling
 */
export function getConfidenceBadgeClass(score: number): string {
  return getConfidenceDisplay(score).bgClass;
}
