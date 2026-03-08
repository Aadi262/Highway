import jwt from 'jsonwebtoken'
import { env } from './env'

export interface JWTPayload {
  userId: string
  username: string
  githubId: string
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, env.JWT_SECRET) as JWTPayload
}
