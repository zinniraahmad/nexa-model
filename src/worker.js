import { applicationSections, declarationFields, photoFields } from './applicationForm.js'
import { API_SECURITY_HEADERS, apiJson as json } from './apiResponse.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/
const UPLOAD_TOKEN_TTL_MS = 60 * 60 * 1000
const RECOVERY_TOKEN_TTL_MS = 60 * 60 * 1000
const MAX_JSON_BYTES = 100_000
const MAX_ACCESS_REQUEST_BYTES = 4 * 1024
const MAX_APPLY_REQUEST_BYTES = 120 * 1024
const MAX_FINALIZE_REQUEST_BYTES = 4 * 1024
const MAX_MULTIPART_REQUEST_BYTES = (10 * 1024 * 1024) + (64 * 1024)
const SPA_PATHS = new Set(['/', '/login', '/portal', '/apply', '/privacy'])
const APPLICATION_ACCESS_MESSAGE = 'If the address can continue, instructions have been sent to that email. Check the inbox and spam folder. / Jika alamat tersebut boleh diteruskan, arahan telah dihantar ke e-mel berkenaan. Semak peti masuk dan folder spam.'
const IMAGE_SIGNATURES = [
  { mime: 'image/png', test: (bytes) => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a },
  { mime: 'image/jpeg', test: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
]

const answerFields = [...applicationSections.flatMap((section) => section.fields), ...declarationFields]
const answerFieldMap = new Map(answerFields.map((field) => [field.key, field]))
const photoFieldMap = new Map(photoFields.map((field) => [field.key, field]))

function requestTooLarge() {
  return json({ success: false, error: 'Request is too large.' }, { status: 413 })
}

async function readRequestBody(request, maxBytes) {
  const declaredLength = request.headers.get('Content-Length')
  if (declaredLength !== null) {
    const length = Number(declaredLength)
    if (!Number.isFinite(length) || length < 0) return { response: json({ success: false, error: 'Invalid Content-Length header.' }, { status: 400 }) }
    if (length > maxBytes) return { response: requestTooLarge() }
  }

  if (!request.body) return { bytes: new Uint8Array() }
  const reader = request.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return { response: requestTooLarge() }
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes }
}

async function parseJsonRequest(request, maxBytes) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return { response: json({ success: false, error: 'Content-Type must be application/json.' }, { status: 415 }) }
  }
  const body = await readRequestBody(request, maxBytes)
  if (body.response) return body
  try {
    return { value: JSON.parse(new TextDecoder().decode(body.bytes)) }
  } catch {
    return { response: json({ success: false, error: 'Request body must contain valid JSON.' }, { status: 400 }) }
  }
}

async function parseMultipartRequest(request) {
  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    return { response: json({ success: false, error: 'Content-Type must be multipart/form-data.' }, { status: 415 }) }
  }
  const body = await readRequestBody(request, MAX_MULTIPART_REQUEST_BYTES)
  if (body.response) return body
  try {
    const bufferedRequest = new Request(request.url, { method: 'POST', headers: { 'Content-Type': contentType }, body: body.bytes })
    return { value: await bufferedRequest.formData() }
  } catch {
    return { response: json({ success: false, error: 'Request body must contain valid multipart form data.' }, { status: 400 }) }
  }
}

function applicationAccessAccepted() {
  return json({ success: true, message: APPLICATION_ACCESS_MESSAGE }, { status: 202 })
}

function notFoundPage() {
  return new Response('<!doctype html><html lang="en-MY"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Nexa Model</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0b0b0a;color:#f5f2ea;font:16px system-ui,sans-serif}main{max-width:560px}p{color:#b8b0a5;line-height:1.6}a{display:inline-block;margin-top:16px;color:#f5f2ea}</style></head><body><main><p>404</p><h1>Page not found.</h1><p>The page you requested does not exist or may have moved.</p><p>Halaman yang anda minta tidak wujud atau mungkin telah dipindahkan.</p><a href="/">Return to homepage</a></main></body></html>', { status: 404, headers: { ...API_SECURITY_HEADERS, 'Content-Type': 'text/html; charset=UTF-8', 'X-Robots-Tag': 'noindex' } })
}

async function handleStaticRequest(request, env, url) {
  const asset = await env.ASSETS.fetch(request)
  if (asset.status !== 404 || !['GET', 'HEAD'].includes(request.method)) return asset
  if (!SPA_PATHS.has(url.pathname)) return notFoundPage()
  return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request))
}

function applicationCredentialRequired() {
  return json({ success: false, error: 'A valid secure email link or existing upload session is required. Request a new link from the first section of the form.', access_required: true }, { status: 403 })
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}

async function enforceRateLimit(binding, key) {
  if (!binding) return true
  const result = await binding.limit({ key })
  return result.success
}

function rateLimited(route) {
  console.warn('security.rate_limited', { route })
  return json({ success: false, error: 'Too many attempts. Please wait a minute and try again.' }, {
    status: 429,
    headers: { 'Retry-After': '60' },
  })
}

function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createUploadToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

function databaseChanged(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0) > 0
}

function bearerToken(request) {
  const authorization = request.headers.get('Authorization') || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

async function requireUploadAccess(request, env, applicationId, includeSubmitted = false) {
  const token = bearerToken(request)
  if (!token || token.length > 200) return null
  const tokenHash = await sha256(token)
  return env.DB.prepare(`
    SELECT a.application_id, a.full_name, a.email, d.application_status, d.confirmation_sent_at
    FROM applicants a
    JOIN applicant_details d ON d.application_id = a.application_id
    WHERE a.application_id = ?
      AND ${includeSubmitted ? "d.application_status IN ('pending_upload', 'submitted')" : "d.application_status = 'pending_upload'"}
      AND d.upload_token_hash = ?
      AND d.upload_token_expires_at > CURRENT_TIMESTAMP
  `).bind(applicationId, tokenHash).first()
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

async function sendConfirmationEmail(env, applicant) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false
  const replyTo = env.EMAIL_REPLY_TO || 'itszinniraahmad@gmail.com'
  const subject = `Nexa Model application received — ${applicant.application_id}`
  const text = `Hi ${applicant.full_name},\n\nYour Nexa Model application and photographs have been received. Your reference is ${applicant.application_id}. Submission does not guarantee shortlisting, training completion or an assignment. If shortlisted, Nexa Model will contact you through WhatsApp.\n\nPermohonan dan gambar anda telah diterima. Rujukan anda ialah ${applicant.application_id}. Penghantaran tidak menjamin pemilihan, tamat latihan atau tugasan. Jika disenarai pendek, Nexa Model akan menghubungi anda melalui WhatsApp.\n\nPrivacy enquiries / Pertanyaan privasi: ${replyTo}`
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [applicant.email],
      reply_to: replyTo,
      subject,
      text,
      html: `<p>Hi ${escapeHtml(applicant.full_name)},</p><p>Your Nexa Model application and photographs have been received.</p><p><strong>Reference: ${escapeHtml(applicant.application_id)}</strong></p><p>Submission does not guarantee shortlisting, training completion or an assignment. If shortlisted, Nexa Model will contact you through WhatsApp.</p><hr><p>Permohonan dan gambar anda telah diterima.</p><p><strong>Rujukan: ${escapeHtml(applicant.application_id)}</strong></p><p>Penghantaran tidak menjamin pemilihan, tamat latihan atau tugasan. Jika disenarai pendek, Nexa Model akan menghubungi anda melalui WhatsApp.</p><p><small>Privacy enquiries / Pertanyaan privasi: ${escapeHtml(replyTo)}</small></p>`,
    }),
  })
  return response.ok
}

async function authorizePendingReplacement(request, env, applicationId, nextUploadTokenHash, nextUploadExpiresAt) {
  const token = bearerToken(request)
  if (!token || token.length > 200) return null
  const tokenHash = await sha256(token)

  const recovered = await env.DB.prepare(`
    UPDATE applicant_details
    SET upload_token_hash = ?, upload_token_expires_at = ?, recovery_token_hash = NULL, recovery_token_expires_at = NULL
    WHERE application_id = ?
      AND application_status = 'pending_upload'
      AND recovery_token_hash = ?
      AND recovery_token_expires_at > CURRENT_TIMESTAMP
  `).bind(nextUploadTokenHash, nextUploadExpiresAt, applicationId, tokenHash).run()
  if (databaseChanged(recovered)) return 'recovery_token'

  const resumed = await env.DB.prepare(`
    UPDATE applicant_details
    SET upload_token_hash = ?, upload_token_expires_at = ?, recovery_token_hash = NULL, recovery_token_expires_at = NULL
    WHERE application_id = ?
      AND application_status = 'pending_upload'
      AND upload_token_hash = ?
  `).bind(nextUploadTokenHash, nextUploadExpiresAt, applicationId, tokenHash).run()
  return databaseChanged(resumed) ? 'upload_token' : null
}

async function ensurePendingRecoveryEmail(request, env, applicant) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false
  const recoveryToken = createUploadToken()
  const recoveryTokenHash = await sha256(recoveryToken)
  const recoveryExpiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MS).toISOString().replace('T', ' ').replace('Z', '')
  const claimed = await env.DB.prepare(`
    UPDATE applicant_details
    SET recovery_token_hash = ?, recovery_token_expires_at = ?
    WHERE application_id = ?
      AND application_status = 'pending_upload'
      AND (recovery_token_expires_at IS NULL OR recovery_token_expires_at <= CURRENT_TIMESTAMP)
  `).bind(recoveryTokenHash, recoveryExpiresAt, applicant.application_id).run()

  // A still-valid recovery link is already available; do not invalidate or resend it.
  if (!databaseChanged(claimed)) return true

  const replyTo = env.EMAIL_REPLY_TO || 'itszinniraahmad@gmail.com'
  const recoveryUrl = new URL('/apply', env.PUBLIC_SITE_URL || request.url)
  recoveryUrl.searchParams.set('recovery', recoveryToken)
  const subject = 'Continue your Nexa Model application'
  const text = `Hi ${applicant.full_name},\n\nWe received a request to replace an unfinished Nexa Model application. Open this single-use link within 60 minutes:\n\n${recoveryUrl}\n\nOpening the link and submitting a new application will replace the unfinished answers and uploaded photos. If you did not request this, ignore this email.\n\nKami menerima permintaan untuk menggantikan permohonan Nexa Model yang belum selesai. Buka pautan sekali guna ini dalam masa 60 minit. Jika anda tidak membuat permintaan ini, abaikan e-mel ini.\n\nPrivacy enquiries / Pertanyaan privasi: ${replyTo}`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [applicant.email],
        reply_to: replyTo,
        subject,
        text,
        html: `<p>Hi ${escapeHtml(applicant.full_name)},</p><p>We received a request to replace an unfinished Nexa Model application.</p><p><a href="${escapeHtml(recoveryUrl.toString())}">Continue your application</a></p><p>This single-use link expires in 60 minutes. Opening it and submitting a new application will replace the unfinished answers and uploaded photos. If you did not request this, ignore this email.</p><hr><p>Kami menerima permintaan untuk menggantikan permohonan Nexa Model yang belum selesai.</p><p><a href="${escapeHtml(recoveryUrl.toString())}">Teruskan permohonan anda</a></p><p>Pautan sekali guna ini tamat tempoh dalam masa 60 minit. Jika anda tidak membuat permintaan ini, abaikan e-mel ini.</p><p><small>Privacy enquiries / Pertanyaan privasi: ${escapeHtml(replyTo)}</small></p>`,
      }),
    })
    if (response.ok) return true
    console.error('Recovery email provider rejected request', { applicationId: applicant.application_id, status: response.status })
  } catch (error) {
    console.error('Recovery email failed', { applicationId: applicant.application_id, error })
  }

  await env.DB.prepare(`
    UPDATE applicant_details SET recovery_token_hash = NULL, recovery_token_expires_at = NULL
    WHERE application_id = ? AND recovery_token_hash = ?
  `).bind(applicant.application_id, recoveryTokenHash).run().catch(() => {})
  return false
}

async function claimApplicationAccessToken(env, email, purpose) {
  const token = createUploadToken()
  const tokenHash = await sha256(token)
  const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MS).toISOString().replace('T', ' ').replace('Z', '')
  const result = await env.DB.prepare(`
    INSERT INTO application_access_tokens (email, purpose, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email, purpose) DO UPDATE SET
      token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      used_at = NULL,
      created_at = CURRENT_TIMESTAMP
    WHERE application_access_tokens.used_at IS NOT NULL
       OR application_access_tokens.expires_at <= CURRENT_TIMESTAMP
  `).bind(email, purpose, tokenHash, expiresAt).run()
  return databaseChanged(result) ? { token, tokenHash } : null
}

async function clearApplicationAccessToken(env, email, purpose, tokenHash) {
  await env.DB.prepare('DELETE FROM application_access_tokens WHERE email = ? COLLATE NOCASE AND purpose = ? AND token_hash = ?')
    .bind(email, purpose, tokenHash).run().catch(() => {})
}

async function ensureNewApplicationAccessEmail(request, env, email) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false
  const claimed = await claimApplicationAccessToken(env, email, 'new_application')
  if (!claimed) return true
  const replyTo = env.EMAIL_REPLY_TO || 'itszinniraahmad@gmail.com'
  const accessUrl = new URL('/apply', env.PUBLIC_SITE_URL || request.url)
  accessUrl.searchParams.set('access', claimed.token)
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email],
        reply_to: replyTo,
        subject: 'Continue your Nexa Model application',
        text: `Use this single-use link within 60 minutes to continue your Nexa Model application:\n\n${accessUrl}\n\nIf you did not request this, ignore this email.\n\nGunakan pautan sekali guna ini dalam masa 60 minit untuk meneruskan permohonan Nexa Model anda. Jika anda tidak membuat permintaan ini, abaikan e-mel ini.\n\nPrivacy enquiries / Pertanyaan privasi: ${replyTo}`,
        html: `<p>Use this single-use link within 60 minutes to continue your Nexa Model application:</p><p><a href="${escapeHtml(accessUrl.toString())}">Continue your application</a></p><p>If you did not request this, ignore this email.</p><hr><p>Gunakan pautan sekali guna ini dalam masa 60 minit untuk meneruskan permohonan Nexa Model anda.</p><p><a href="${escapeHtml(accessUrl.toString())}">Teruskan permohonan anda</a></p><p>Jika anda tidak membuat permintaan ini, abaikan e-mel ini.</p><p><small>Privacy enquiries / Pertanyaan privasi: ${escapeHtml(replyTo)}</small></p>`,
      }),
    })
    if (response.ok) return true
    console.error('Application access email provider rejected request', { status: response.status })
  } catch (error) {
    console.error('Application access email failed', { error })
  }
  await clearApplicationAccessToken(env, email, 'new_application', claimed.tokenHash)
  return false
}

async function ensureSubmittedApplicationNoticeEmail(env, email) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false
  const claimed = await claimApplicationAccessToken(env, email, 'submitted_notice')
  if (!claimed) return true
  const replyTo = env.EMAIL_REPLY_TO || 'itszinniraahmad@gmail.com'
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email],
        reply_to: replyTo,
        subject: 'Nexa Model application access request',
        text: `We received a request to continue a Nexa Model application using this email address. An application is already on file, so no new access link was issued. If you need help, contact Nexa Model through its official channel.\n\nKami menerima permintaan untuk meneruskan permohonan Nexa Model menggunakan alamat e-mel ini. Permohonan telah pun direkodkan, maka tiada pautan akses baharu dikeluarkan. Jika anda memerlukan bantuan, hubungi Nexa Model melalui saluran rasmi.\n\nPrivacy enquiries / Pertanyaan privasi: ${replyTo}`,
        html: `<p>We received a request to continue a Nexa Model application using this email address.</p><p>An application is already on file, so no new access link was issued. If you need help, contact Nexa Model through its official channel.</p><hr><p>Kami menerima permintaan untuk meneruskan permohonan Nexa Model menggunakan alamat e-mel ini.</p><p>Permohonan telah pun direkodkan, maka tiada pautan akses baharu dikeluarkan. Jika anda memerlukan bantuan, hubungi Nexa Model melalui saluran rasmi.</p><p><small>Privacy enquiries / Pertanyaan privasi: ${escapeHtml(replyTo)}</small></p>`,
      }),
    })
    if (response.ok) return true
    console.error('Submitted application notice email provider rejected request', { status: response.status })
  } catch (error) {
    console.error('Submitted application notice email failed', { error })
  }
  await clearApplicationAccessToken(env, email, 'submitted_notice', claimed.tokenHash)
  return false
}

async function consumeNewApplicationAccess(request, env, email) {
  const token = bearerToken(request)
  if (!token || token.length > 200) return false
  const tokenHash = await sha256(token)
  const result = await env.DB.prepare(`
    UPDATE application_access_tokens SET used_at = CURRENT_TIMESTAMP
    WHERE email = ? COLLATE NOCASE
      AND purpose = 'new_application'
      AND token_hash = ?
      AND used_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
  `).bind(email, tokenHash).run()
  return databaseChanged(result)
}

async function handleApplicationAccess(request, env) {
  if (!await enforceRateLimit(env.APPLY_RATE_LIMITER, `${clientIp(request)}:application-access`)) return rateLimited('application-access')
  const parsed = await parseJsonRequest(request, MAX_ACCESS_REQUEST_BYTES)
  if (parsed.response) return parsed.response
  const email = typeof parsed.value?.email === 'string' ? parsed.value.email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return json({ success: false, error: 'A valid email address is required.' }, { status: 400 })
  }
  if (!await verifyTurnstile(request, env, parsed.value.turnstile_token)) {
    return json({ success: false, error: 'Security verification failed. Please refresh the verification and try again.' }, { status: 400 })
  }

  try {
    const existing = await env.DB.prepare(`
      SELECT a.application_id, a.full_name, a.email, d.application_status
      FROM applicants a JOIN applicant_details d ON d.application_id = a.application_id
      WHERE a.email = ? COLLATE NOCASE LIMIT 1
    `).bind(email).first()
    if (!existing) await ensureNewApplicationAccessEmail(request, env, email)
    else if (existing.application_status === 'pending_upload') await ensurePendingRecoveryEmail(request, env, existing)
    else await ensureSubmittedApplicationNoticeEmail(env, existing.email)
  } catch (error) {
    // Keep the public response uniform; operational failures are visible only in logs.
    console.error('Application access request failed', { error })
  }
  return applicationAccessAccepted()
}

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY || !token || typeof token !== 'string' || token.length > 2048) return false
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') || undefined,
        idempotency_key: crypto.randomUUID(),
      }),
    })
    const result = await response.json()
    return response.ok && result.success === true
  } catch (error) {
    console.error('Turnstile validation failed', error)
    return false
  }
}

function validateAnswer(field, value) {
  if (field.required && (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length))) {
    return `${field.label} is required.`
  }
  if (value === undefined || value === null || value === '') return null

  if (field.type === 'checkbox') {
    if (!field.required && Array.isArray(value) && !value.length) return null
    if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== 'string' || !field.options.includes(item))) {
      return `${field.label} contains an invalid selection.`
    }
    return null
  }
  if (field.type === 'radio' || field.type === 'select') {
    if (typeof value !== 'string' || !field.options.includes(value)) return `${field.label} contains an invalid selection.`
    return null
  }
  if (field.type === 'scale' || field.type === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number) || number < field.min || number > field.max) return `${field.label} is outside the allowed range.`
    return null
  }
  if (typeof value !== 'string') return `${field.label} must be text.`
  if (field.required && !value.trim()) return `${field.label} is required.`
  const maxLength = field.maxLength || (field.type === 'textarea' ? 2000 : 500)
  if (value.trim().length > maxLength) return `${field.label} is too long.`
  if (field.type === 'email' && !EMAIL_PATTERN.test(value.trim())) return `${field.label} is invalid.`
  if (field.type === 'url' && value.trim()) {
    try {
      const url = new URL(value.trim())
      if (!['http:', 'https:'].includes(url.protocol)) return `${field.label} must use http or https.`
    } catch {
      return `${field.label} is invalid.`
    }
  }
  return null
}

function validateAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 'Application answers are invalid.'
  const unknown = Object.keys(answers).find((key) => !answerFieldMap.has(key))
  if (unknown) return 'Application contains an unknown field.'
  for (const field of answerFields) {
    const error = validateAnswer(field, answers[field.key])
    if (error) return error
  }
  if (answers.age_gate !== 'Yes' || answers.voluntary_application !== 'Yes') return 'Applicant eligibility requirements are not met.'
  return null
}

function parsePhotoSlot(photoType) {
  if (typeof photoType !== 'string') return null
  const match = photoType.match(/^([a-z0-9_]+)_(\d+)$/)
  if (!match) return null
  const field = photoFieldMap.get(match[1])
  const index = Number(match[2])
  if (!field || index < 1 || index > field.max) return null
  return { field, index, type: `${field.key}_${index}` }
}

async function detectImageMime(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  return IMAGE_SIGNATURES.find((signature) => signature.test(bytes))?.mime || null
}

async function deleteImageKitFiles(env, applicationId) {
  if (!env.IMAGEKIT_PRIVATE_KEY) return
  const photos = await env.DB.prepare('SELECT file_id FROM applicant_photos WHERE application_id = ?')
    .bind(applicationId).all()
  const authorization = `Basic ${btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)}`
  await Promise.allSettled(photos.results.map((photo) => fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(photo.file_id)}`, {
    method: 'DELETE',
    headers: { Authorization: authorization },
  })))
}

async function handleApply(request, env) {
  if (!await enforceRateLimit(env.APPLY_RATE_LIMITER, `${clientIp(request)}:apply`)) return rateLimited('apply')
  try {
    const parsed = await parseJsonRequest(request, MAX_APPLY_REQUEST_BYTES)
    if (parsed.response) return parsed.response
    const body = parsed.value
    const answers = body?.answers
    const validationError = validateAnswers(answers)
    if (validationError) return json({ success: false, error: validationError }, { status: 400 })
    const responsesJson = JSON.stringify(answers)
    if (new TextEncoder().encode(responsesJson).length > MAX_JSON_BYTES) return json({ success: false, error: 'Application is too large.' }, { status: 400 })

    const fullName = String(answers.full_name).trim()
    const email = String(answers.email).trim().toLowerCase()
    const phone = String(answers.phone).trim()
    const location = String(answers.current_location).trim()
    const existing = await env.DB.prepare(`
      SELECT a.application_id, a.full_name, a.email, d.application_status
      FROM applicants a JOIN applicant_details d ON d.application_id = a.application_id
      WHERE a.email = ? COLLATE NOCASE LIMIT 1
    `).bind(email).first()
    const uploadToken = createUploadToken()
    const uploadTokenHash = await sha256(uploadToken)
    const uploadExpiresAt = new Date(Date.now() + UPLOAD_TOKEN_TTL_MS).toISOString().replace('T', ' ').replace('Z', '')
    let applicationId = existing?.application_id

    if (existing) {
      if (existing.application_status !== 'pending_upload') return applicationCredentialRequired()
      const authorization = await authorizePendingReplacement(request, env, applicationId, uploadTokenHash, uploadExpiresAt)
      if (!authorization) return applicationCredentialRequired()
      await deleteImageKitFiles(env, applicationId)
      await env.DB.batch([
        env.DB.prepare('DELETE FROM applicant_photos WHERE application_id = ?').bind(applicationId),
        env.DB.prepare(`UPDATE applicants SET full_name = ?, phone = ?, current_location = ? WHERE application_id = ?`)
          .bind(fullName, phone, location, applicationId),
        env.DB.prepare(`UPDATE applicant_details SET responses_json = ?, application_status = 'pending_upload', submitted_at = CURRENT_TIMESTAMP, upload_token_hash = ?, upload_token_expires_at = ?, recovery_token_hash = NULL, recovery_token_expires_at = NULL WHERE application_id = ?`)
          .bind(responsesJson, uploadTokenHash, uploadExpiresAt, applicationId),
      ])
    } else {
      if (!await consumeNewApplicationAccess(request, env, email)) return applicationCredentialRequired()
      applicationId = crypto.randomUUID()
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO applicants (application_id, full_name, email, phone, current_location) VALUES (?, ?, ?, ?, ?)`)
          .bind(applicationId, fullName, email, phone, location),
        env.DB.prepare(`INSERT INTO applicant_details (application_id, responses_json, application_status, upload_token_hash, upload_token_expires_at) VALUES (?, ?, 'pending_upload', ?, ?)`)
          .bind(applicationId, responsesJson, uploadTokenHash, uploadExpiresAt),
      ])
    }

    console.log('application.pending_upload_created', { applicationId })
    return json({ success: true, application_id: applicationId, upload_token: uploadToken, upload_expires_at: `${uploadExpiresAt}Z` }, { status: 201 })
  } catch (error) {
    console.error('Application submission failed', error)
    return json({ success: false, error: 'Unable to save application.' }, { status: 500 })
  }
}

async function handleUpload(request, env) {
  if (!await enforceRateLimit(env.UPLOAD_RATE_LIMITER, `${clientIp(request)}:upload`)) return rateLimited('upload')
  try {
    const parsed = await parseMultipartRequest(request)
    if (parsed.response) return parsed.response
    const formData = parsed.value
    const file = formData.get('file')
    const applicationId = String(formData.get('application_id') || '')
    const slot = parsePhotoSlot(formData.get('photo_type'))
    if (!(file instanceof File) || !applicationId || !slot) {
      return json({ success: false, error: 'A valid file, application and photo category are required.' }, { status: 400 })
    }
    if (!await requireUploadAccess(request, env, applicationId)) {
      return json({ success: false, error: 'Upload session is invalid or expired.' }, { status: 403 })
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      return json({ success: false, error: 'Photo must be under 10 MB.' }, { status: 400 })
    }
    const detectedMime = await detectImageMime(file)
    if (!detectedMime) {
      return json({ success: false, error: 'Only genuine PNG and JPEG images are accepted.' }, { status: 400 })
    }
    const occupied = await env.DB.prepare('SELECT file_id FROM applicant_photos WHERE application_id = ? AND photo_type = ? LIMIT 1')
      .bind(applicationId, slot.type).first()
    if (occupied) return json({ success: true, application_id: applicationId, photo_type: slot.type, already_uploaded: true })
    if (!env.IMAGEKIT_PRIVATE_KEY) return json({ success: false, error: 'Photo service is not configured.' }, { status: 503 })

    const safeExtension = detectedMime === 'image/png' ? 'png' : 'jpg'
    const uploadForm = new FormData()
    uploadForm.append('file', new File([file], `${slot.type}.${safeExtension}`, { type: detectedMime }))
    uploadForm.append('fileName', `${slot.type}.${safeExtension}`)
    uploadForm.append('folder', `/nexa/applicants/${applicationId}`)
    uploadForm.append('useUniqueFileName', 'true')
    uploadForm.append('isPrivateFile', 'true')
    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)}` },
      body: uploadForm,
    })
    const result = await response.json()
    if (!response.ok) return json({ success: false, error: 'Image provider rejected the upload.' }, { status: 502 })

    try {
      await env.DB.prepare(`INSERT INTO applicant_photos (application_id, file_id, file_name, file_url, photo_type) VALUES (?, ?, ?, ?, ?)`)
        .bind(applicationId, result.fileId, result.name, result.url, slot.type).run()
    } catch (error) {
      await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(result.fileId)}`, {
        method: 'DELETE', headers: { Authorization: `Basic ${btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)}` },
      }).catch(() => {})
      throw error
    }
    return json({ success: true, application_id: applicationId, photo_type: slot.type })
  } catch (error) {
    console.error('Photo upload failed', error)
    return json({ success: false, error: 'Upload failed.' }, { status: 500 })
  }
}

async function handleFinalize(request, env) {
  if (!await enforceRateLimit(env.APPLY_RATE_LIMITER, `${clientIp(request)}:finalize`)) return rateLimited('finalize')
  try {
    const parsed = await parseJsonRequest(request, MAX_FINALIZE_REQUEST_BYTES)
    if (parsed.response) return parsed.response
    const body = parsed.value
    const applicationId = String(body?.application_id || '')
    const applicant = await requireUploadAccess(request, env, applicationId, true)
    if (!applicant) {
      return json({ success: false, error: 'Upload session is invalid or expired.' }, { status: 403 })
    }
    if (applicant.application_status === 'pending_upload') {
      const result = await env.DB.prepare(`SELECT photo_type, COUNT(*) AS count FROM applicant_photos WHERE application_id = ? GROUP BY photo_type`)
        .bind(applicationId).all()
      const uploadedTypes = new Set(result.results.map((row) => row.photo_type))
      for (const field of photoFields) {
        for (let index = 1; index <= field.min; index += 1) {
          if (!uploadedTypes.has(`${field.key}_${index}`)) {
            return json({ success: false, error: `${field.label} is incomplete.` }, { status: 400 })
          }
        }
      }
      const maxPhotos = photoFields.reduce((sum, field) => sum + field.max, 0)
      if (result.results.reduce((sum, row) => sum + Number(row.count), 0) > maxPhotos) {
        return json({ success: false, error: 'Application contains too many photos.' }, { status: 400 })
      }
      await env.DB.prepare(`UPDATE applicant_details SET application_status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE application_id = ? AND application_status = 'pending_upload'`)
        .bind(applicationId).run()
      console.log('application.submitted', { applicationId })
    }

    let emailSent = Boolean(applicant.confirmation_sent_at)
    if (!emailSent) {
      try {
        emailSent = await sendConfirmationEmail(env, applicant)
        if (emailSent) await env.DB.prepare('UPDATE applicant_details SET confirmation_sent_at = CURRENT_TIMESTAMP WHERE application_id = ?').bind(applicationId).run()
        else console.warn('application.confirmation_email_not_sent', { applicationId })
      } catch (error) {
        console.error('Confirmation email failed', error)
      }
    }
    return json({ success: true, application_id: applicationId, email_sent: emailSent })
  } catch (error) {
    console.error('Application finalization failed', error)
    return json({ success: false, error: 'Unable to finalize application.' }, { status: 500 })
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/config' && request.method === 'GET') {
      return json({ turnstile_site_key: env.TURNSTILE_SITE_KEY || '' })
    }
    if (url.pathname === '/api/application-access' && request.method === 'POST') return handleApplicationAccess(request, env)
    if (url.pathname === '/api/apply' && request.method === 'POST') return handleApply(request, env)
    if (url.pathname === '/api/upload' && request.method === 'POST') return handleUpload(request, env)
    if (url.pathname === '/api/finalize' && request.method === 'POST') return handleFinalize(request, env)
    if (url.pathname.startsWith('/api/')) return json({ success: false, error: 'Not found.' }, { status: 404 })
    return handleStaticRequest(request, env, url)
  },
}

export { applicationAccessAccepted, applicationCredentialRequired, authorizePendingReplacement, detectImageMime, handleApplicationAccess, handleStaticRequest, parseJsonRequest, parseMultipartRequest, parsePhotoSlot, readRequestBody, validateAnswers }
