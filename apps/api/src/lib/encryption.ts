import { encrypt, decrypt, deriveKey, type EncryptedPayload } from '@highway/shared'
import { env } from './env'

const key = deriveKey(env.ENCRYPTION_KEY)

export function encryptValue(plaintext: string): EncryptedPayload {
  return encrypt(plaintext, key)
}

export function decryptValue(payload: EncryptedPayload): string {
  return decrypt(payload, key)
}
