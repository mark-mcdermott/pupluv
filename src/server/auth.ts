import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'
import { SignJWT, jwtVerify } from 'jose'
import { requireEnv } from './env'

// promisify resolves to scrypt's three-argument overload, losing the options.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>

// A PIN is low-entropy by nature, so the work factor is the defence: ~0.25s per
// guess puts a six-digit brute force in the order of days rather than minutes.
// A longer passphrase works here too and is strictly better.
const KEY_LENGTH = 64
const SCRYPT_OPTIONS: ScryptOptions = { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }

export const MIN_PIN_LENGTH = 6

async function derive(pin: string, salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(pin.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT_OPTIONS)) as Buffer
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${(await derive(pin, salt)).toString('hex')}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHex] = stored.split(':')
  if (!saltHex || !expectedHex) return false
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = await derive(pin, Buffer.from(saltHex, 'hex'))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function signingKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv('AUTH_SECRET'))
}

/**
 * A bearer token rather than a cookie: the Capacitor webview serves the bundle
 * from `capacitor://localhost` and calls the API cross-origin, where cookies are
 * a fight. One code path covers web and native.
 */
export async function issueToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('owner')
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(signingKey())
}

export async function isAuthed(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return false
  try {
    await jwtVerify(header.slice(7), signingKey(), { subject: 'owner' })
    return true
  } catch {
    return false
  }
}

export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 })
}
