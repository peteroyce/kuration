/**
 * Shared validation helpers for bookmark fields.
 */

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates a URL string. Returns null on success, error message on failure.
 */
export function validateUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') {
    return 'url must be a non-empty string';
  }
  try {
    new URL(url);
    return null;
  } catch {
    return 'url must be a valid URL (e.g., https://example.com)';
  }
}

/**
 * Validates a tags array.
 * - Must be an array of strings
 * - Max 20 tags
 * - Each tag max 50 characters
 * Returns null on success, error message on failure.
 */
export function validateTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) {
    return 'tags must be an array';
  }
  if (tags.length > 20) {
    return 'tags must contain at most 20 items';
  }
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (typeof tag !== 'string') {
      return `tags[${i}] must be a string`;
    }
    if (tag.length > 50) {
      return `tags[${i}] must be 50 characters or fewer`;
    }
  }
  return null;
}
