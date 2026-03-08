import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32

/**
 * Derive a 32-byte key from the ENCRYPTION_KEY env var.
 * Uses scrypt so even a low-entropy key is stretched to full strength.
 */
export function deriveKey(rawKey: string): Buffer {
  const salt = Buffer.from('highway-encryption-salt-v1', 'utf8')
  return scryptSync(rawKey, salt, KEY_LENGTH)
}

export interface EncryptedPayload {
  encrypted: string
  iv: string
  authTag: string
}

export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  }
}

export function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'))
  let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
