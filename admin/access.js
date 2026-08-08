import { apiJson } from '../src/apiResponse.js'

let cachedKeys
let cachedAt = 0

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)))
}

async function getPublicKey(teamDomain, keyId) {
  if (!cachedKeys || Date.now() - cachedAt > 60 * 60 * 1000) {
    const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
    if (!response.ok) throw new Error('Unable to load Cloudflare Access signing keys.')
    cachedKeys = (await response.json()).keys
    cachedAt = Date.now()
  }

  const jwk = cachedKeys.find((key) => key.kid === keyId)
  if (!jwk) {
    cachedKeys = undefined
    throw new Error('Cloudflare Access signing key was not found.')
  }

  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
}

export async function requireAdmin(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { error: apiJson({ error: 'Admin authentication is not configured.', code: 'AUTH_NOT_CONFIGURED' }, { status: 503 }) }
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) return { error: apiJson({ error: 'Your admin session has expired.', code: 'SESSION_EXPIRED' }, { status: 401 }) }

  try {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Malformed token')

    const header = decodeJson(parts[0])
    const claims = decodeJson(parts[1])
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported token')

    const key = await getPublicKey(env.ACCESS_TEAM_DOMAIN, header.kid)
    const validSignature = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )

    const now = Math.floor(Date.now() / 1000)
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`
    if (!validSignature || claims.iss !== issuer || !audience.includes(env.ACCESS_AUD) || claims.exp <= now) {
      throw new Error('Invalid token claims')
    }

    const email = String(claims.email || '').toLowerCase()
    const allowlist = String(env.ADMIN_EMAILS || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    if (!allowlist.length) {
      return { error: apiJson({ error: 'Admin allowlist is not configured.', code: 'AUTH_NOT_CONFIGURED' }, { status: 503 }) }
    }
    if (!email || !allowlist.includes(email)) {
      return { error: apiJson({ error: 'You do not have permission to review applications.', code: 'FORBIDDEN' }, { status: 403 }) }
    }

    return { email }
  } catch (error) {
    console.error('Admin authentication failed', error)
    return { error: apiJson({ error: 'Your admin session is invalid or has expired.', code: 'SESSION_EXPIRED' }, { status: 401 }) }
  }
}
