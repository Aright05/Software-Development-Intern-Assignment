import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derives a consistent 32-byte encryption key from the configured key string
 */
const getKey = (): Buffer => {
  return crypto.createHash('sha256').update(config.security.encryptionKey).digest();
};

/**
 * Encrypts a sensitive string (e.g. OAuth access token) using AES-256-GCM
 */
export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (hex encoded)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypts an AES-256-GCM encrypted string and verifies integrity
 */
export const decrypt = (encryptedText: string): string => {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(cipherHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

/**
 * Generates a signed, tamper-proof OAuth state token with timestamp and provider
 */
export const generateOAuthState = (provider: 'google' | 'slack', userId?: string): string => {
  const payload = JSON.stringify({
    provider,
    userId: userId || null,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex'),
  });

  const hmac = crypto.createHmac('sha256', config.session.secret).update(payload).digest('hex');
  const encodedPayload = Buffer.from(payload).toString('base64url');

  return `${encodedPayload}.${hmac}`;
};

/**
 * Validates the OAuth state token and checks for expiration (15 minutes)
 */
export const verifyOAuthState = (state: string): { valid: boolean; provider?: string; userId?: string | null } => {
  try {
    const [encodedPayload, receivedHmac] = state.split('.');
    if (!encodedPayload || !receivedHmac) {
      return { valid: false };
    }

    const payloadStr = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const expectedHmac = crypto.createHmac('sha256', config.session.secret).update(payloadStr).digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac))) {
      return { valid: false };
    }

    const payload = JSON.parse(payloadStr);

    // State expires after 15 minutes
    if (Date.now() - payload.timestamp > 15 * 60 * 1000) {
      return { valid: false };
    }

    return {
      valid: true,
      provider: payload.provider,
      userId: payload.userId,
    };
  } catch {
    return { valid: false };
  }
};
