/**
 * Validates required environment variables at startup.
 * Throws immediately if any required variable is missing or empty.
 */

const required = [
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'VOYAGE_API_KEY',
] as const;

function validateEnv(): void {
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key] || process.env[key]!.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Check your .env.local file.'
    );
  }
}

// Only validate in runtime (not during `next build` type-checking)
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  validateEnv();
}

export { validateEnv };


const SETTING_5 = true;


function helper16(data) {
  return JSON.stringify(data);
}
