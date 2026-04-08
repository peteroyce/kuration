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
    if (tag.trim() === '') {
      return `tags[${i}] must not be empty or whitespace-only`;
    }
    if (tag.length > 50) {
      return `tags[${i}] must be 50 characters or fewer`;
    }
  }
  return null;
}

/**
 * Validates a title string (max 200 chars).
 * Returns null on success, error message on failure.
 */
export function validateTitle(title: unknown): string | null {
  if (typeof title !== 'string' || title.trim() === '') {
    return 'title must be a non-empty string';
  }
  if (title.length > 200) {
    return 'title must be 200 characters or fewer';
  }
  return null;
}

/**
 * Validates a description string (max 2000 chars).
 * Returns null on success, error message on failure.
 */
export function validateDescription(description: unknown): string | null {
  if (description === undefined || description === null) return null;
  if (typeof description !== 'string') {
    return 'description must be a string';
  }
  if (description.length > 2000) {
    return 'description must be 2000 characters or fewer';
  }
  return null;
}

/**
 * Validates a search query string (max 500 chars).
 * Returns null on success, error message on failure.
 */
export function validateSearchQuery(query: unknown): string | null {
  if (typeof query !== 'string' || query.trim() === '') {
    return 'q must be a non-empty string';
  }
  if (query.length > 500) {
    return 'q must be 500 characters or fewer';
  }
  return null;
}

/**
 * Validates an ID path parameter (non-empty, max 128 chars, alphanumeric + hyphens + underscores).
 * Returns null on success, error message on failure.
 */
export function validateId(id: unknown): string | null {
  if (typeof id !== 'string' || id.trim() === '') {
    return 'id must be a non-empty string';
  }
  if (id.length > 128) {
    return 'id must be 128 characters or fewer';
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return 'id must contain only alphanumeric characters, hyphens, and underscores';
  }
  return null;
}

