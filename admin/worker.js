import { requireAdmin } from './access.js'
import ImageKit from '@imagekit/nodejs'
import { apiJson } from '../src/apiResponse.js'
import { logError, recordOperationalFailure } from './observability.js'
import { trackResendNetworkFailure, trackResendResponse } from '../src/emailAnalytics.js'

const STATUSES = ['submitted', 'reviewing', 'shortlisted', 'contacted', 'rejected']
const SOFT_DELETE_DAYS = 30
const ADMIN_PAGE_SIZE = 50
const MAX_ADMIN_PAGE = 10000
const DEFAULT_IMAGEKIT_BANDWIDTH_LIMIT_BYTES = 20_000_000_000
const DEFAULT_IMAGEKIT_STORAGE_LIMIT_BYTES = 3_000_000_000
const SORT_COLUMNS = {
  submitted_at: 'd.submitted_at',
  age: "CAST(json_extract(d.responses_json, '$.age') AS INTEGER)",
  location: 'a.current_location COLLATE NOCASE',
  status: 'd.application_status COLLATE NOCASE',
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}

async function enforceAdminRateLimit(request, env) {
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  const limiter = mutation ? env.ADMIN_MUTATION_RATE_LIMITER : env.ADMIN_RATE_LIMITER
  if (!limiter?.limit) return true
  const result = await limiter.limit({ key: `${clientIp(request)}:${mutation ? 'mutation' : 'read'}` })
  return result.success
}

async function recordAdminRateLimit(request, env) {
  console.warn('security.admin_rate_limited', { method: request.method, path: new URL(request.url).pathname })
}

function parseResponses(value) {
  try {
    const responses = JSON.parse(value || '{}')
    if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return { marital_status: null }
    return { ...responses, marital_status: responses.marital_status ?? null }
  } catch {
    return { marital_status: null }
  }
}

function malaysiaDateParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

function imageKitUsageDateRange(now = new Date()) {
  const { year, month, day } = malaysiaDateParts(now)
  const tomorrow = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1))
  const nextMonth = new Date(Date.UTC(Number(year), Number(month), 1))
  return {
    startDate: `${year}-${month}-01`,
    endDate: tomorrow.toISOString().slice(0, 10),
    resetsOn: nextMonth.toISOString().slice(0, 10),
  }
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

async function getImageKitUsage(env, now = new Date()) {
  const limits = {
    bandwidth_bytes: positiveNumber(env.IMAGEKIT_BANDWIDTH_LIMIT_BYTES, DEFAULT_IMAGEKIT_BANDWIDTH_LIMIT_BYTES),
    storage_bytes: positiveNumber(env.IMAGEKIT_STORAGE_LIMIT_BYTES, DEFAULT_IMAGEKIT_STORAGE_LIMIT_BYTES),
  }
  if (!env.IMAGEKIT_PRIVATE_KEY) return { available: false, reason: 'not_configured', limits }

  const { startDate, endDate, resetsOn } = imageKitUsageDateRange(now)
  const url = new URL('https://api.imagekit.io/v1/accounts/usage')
  url.searchParams.set('startDate', startDate)
  url.searchParams.set('endDate', endDate)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)}`,
      },
    })
    if (!response.ok) {
      logError('provider.imagekit_usage_failed', { service: 'imagekit', httpStatus: response.status })
      return { available: false, reason: 'provider_error', limits }
    }
    const usage = await response.json()
    return {
      available: true,
      bandwidth_bytes: Number(usage.bandwidthBytes || 0),
      storage_bytes: Number(usage.mediaLibraryStorageBytes || 0),
      video_processing_units: Number(usage.videoProcessingUnitsCount || 0),
      extension_units: Number(usage.extensionUnitsCount || 0),
      original_cache_storage_bytes: Number(usage.originalCacheStorageBytes || 0),
      period_start: startDate,
      period_end_exclusive: endDate,
      bandwidth_resets_on: resetsOn,
      fetched_at: now.toISOString(),
      limits,
    }
  } catch (error) {
    logError('provider.imagekit_usage_failed', { service: 'imagekit' }, error)
    return { available: false, reason: 'network_error', limits }
  }
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return null
  const tags = [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))]
  if (tags.length > 10 || tags.some((tag) => tag.length > 30)) return null
  return tags
}

function parseTags(value) {
  try {
    const tags = JSON.parse(value || '[]')
    return Array.isArray(tags) ? tags : []
  } catch {
    return []
  }
}

function matchesDeletionConfirmation(confirmation, applicant) {
  const normalized = String(confirmation || '').trim().toLocaleLowerCase()
  return normalized === String(applicant?.full_name || '').trim().toLocaleLowerCase()
    || normalized === String(applicant?.application_id || '').toLocaleLowerCase()
}

function recoveryPeriodEnded(deleteAfter, now = Date.now()) {
  const deadline = new Date(deleteAfter).getTime()
  return Number.isFinite(deadline) && deadline <= now
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

function buildShortlistedEmail(applicant) {
  const name = String(applicant.full_name || '').trim()
  const privacyEmail = 'itszinniraahmad@gmail.com'
  const subject = 'Nexa Model application shortlisted'
  const text = `Hi ${name},\n\nCongratulations!\n\nWe are pleased to inform you that your application with Nexa Model has been shortlisted. You have been selected to proceed to the training and assessment stage. Our team will contact you with further details about the next steps and schedule.\n\nThank you for your interest in Nexa Model.\n\n---\n\nHai ${name},\n\nTahniah!\n\nSukacita dimaklumkan bahawa permohonan anda bersama Nexa Model telah disenarai pendek. Anda telah dipilih untuk meneruskan ke peringkat latihan dan penilaian. Pihak kami akan menghubungi anda dengan maklumat lanjut mengenai langkah seterusnya dan jadual.\n\nTerima kasih atas minat anda terhadap Nexa Model.\n\nPrivacy enquiries / Pertanyaan privasi: ${privacyEmail}`
  const safeName = escapeHtml(name)
  const html = `<p>Hi ${safeName},</p><p><strong>Congratulations!</strong></p><p>We are pleased to inform you that your application with Nexa Model has been <strong>shortlisted</strong>. You have been selected to proceed to the training and assessment stage. Our team will contact you with further details about the next steps and schedule.</p><p>Thank you for your interest in Nexa Model.</p><hr><p>Hai ${safeName},</p><p><strong>Tahniah!</strong></p><p>Sukacita dimaklumkan bahawa permohonan anda bersama Nexa Model telah <strong>disenarai pendek</strong>. Anda telah dipilih untuk meneruskan ke peringkat latihan dan penilaian. Pihak kami akan menghubungi anda dengan maklumat lanjut mengenai langkah seterusnya dan jadual.</p><p>Terima kasih atas minat anda terhadap Nexa Model.</p><p><small>Privacy enquiries / Pertanyaan privasi: ${privacyEmail}</small></p>`
  return { subject, text, html }
}

async function sendShortlistedEmail(env, applicant) {
  if (!env.RESEND_API_KEY) return { ok: false, code: 'EMAIL_NOT_CONFIGURED', message: 'Resend is not configured for the admin service.' }
  const email = buildShortlistedEmail(applicant)
  let response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `application-shortlisted/${applicant.application_id}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'Nexa Model <applications@updates.nexa-model.com>',
        to: [applicant.email],
        reply_to: 'itszinniraahmad@gmail.com',
        ...email,
      }),
    })
  } catch (error) {
    await trackResendNetworkFailure(env, { applicationId: applicant.application_id, messageType: 'candidate_shortlisted', recipientType: 'candidate' })
    logError('provider.resend_network_failed', { messageType: 'candidate_shortlisted' }, error)
    await recordOperationalFailure(env, { service: 'admin_api', eventName: 'provider.resend_network_failed', httpStatus: 502 })
    return { ok: false, code: 'EMAIL_ERROR', message: 'The shortlist email service could not be reached. The candidate status was not changed.' }
  }
  const tracked = await trackResendResponse(env, response, { applicationId: applicant.application_id, messageType: 'candidate_shortlisted', recipientType: 'candidate' })
  if (!response.ok) {
    logError('provider.resend_request_failed', { messageType: 'candidate_shortlisted', httpStatus: response.status })
    await recordOperationalFailure(env, { service: 'admin_api', eventName: 'provider.resend_request_failed', httpStatus: response.status })
    return { ok: false, code: 'EMAIL_ERROR', message: 'The shortlist email could not be sent. The candidate status was not changed.' }
  }
  return { ok: true, id: tracked.id }
}

function signPhotoUrls(env, photos) {
  if (!env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) {
    throw new Error('Private image delivery is not configured for the admin Worker.')
  }
  const imagekit = new ImageKit({ privateKey: env.IMAGEKIT_PRIVATE_KEY })
  return photos.map(({ file_url: fileUrl, ...photo }) => {
    const source = {
      urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
      src: fileUrl,
      signed: true,
      expiresIn: 300,
    }
    return {
      ...photo,
      file_url: imagekit.helper.buildSrc(source),
      thumbnail_url: imagekit.helper.buildSrc({
        ...source,
        transformation: [{ width: 480, quality: 75, format: 'webp' }],
      }),
    }
  })
}

async function deleteImageKitFiles(env, fileIds) {
  if (!fileIds.length) return
  if (!env.IMAGEKIT_PRIVATE_KEY) throw new Error('ImageKit deletion is not configured.')
  const authorization = `Basic ${btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)}`
  const results = await Promise.all(fileIds.map(async (fileId) => {
    const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE', headers: { Authorization: authorization },
    })
    return response.ok || response.status === 404
  }))
  if (results.some((deleted) => !deleted)) throw new Error('One or more ImageKit files could not be deleted.')
}

async function verifyApplicationPageState(env, applicationsClosed) {
  const publicSiteUrl = env.PUBLIC_SITE_URL || 'https://nexa-model.com'
  const checkUrl = new URL('/apply', publicSiteUrl)
  checkUrl.searchParams.set('control_check', crypto.randomUUID())
  const response = await fetch(checkUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'Cache-Control': 'no-cache' },
  })
  const location = response.headers.get('Location')
  const redirectedToClosed = response.status === 302
    && location
    && new URL(location, checkUrl).pathname === '/applications-closed'
  return {
    verified: applicationsClosed ? Boolean(redirectedToClosed) : response.ok && !redirectedToClosed,
    http_status: response.status,
    destination: location ? new URL(location, checkUrl).pathname : checkUrl.pathname,
  }
}

async function handleApi(request, env, url, authenticate = requireAdmin) {
  const auth = await authenticate(request, env)
  if (auth.error) return auth.error

  if (url.pathname === '/api/admin/session' && request.method === 'GET') {
    return apiJson({ email: auth.email })
  }

  if (url.pathname === '/api/admin/website-control' && request.method === 'GET') {
    const control = await env.DB.prepare(`
      SELECT enabled, updated_at, updated_by
      FROM website_controls WHERE control_key = 'applications_closed'
    `).first()
    return apiJson({
      applications_closed: Number(control?.enabled || 0) === 1,
      updated_at: control?.updated_at || null,
      updated_by: control?.updated_by || null,
    })
  }

  if (url.pathname === '/api/admin/website-control' && request.method === 'PATCH') {
    const body = await request.json().catch(() => null)
    if (typeof body?.applications_closed !== 'boolean') {
      return apiJson({ error: 'Choose whether applications should be open or closed.', code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const existing = await env.DB.prepare(`
      SELECT enabled FROM website_controls WHERE control_key = 'applications_closed'
    `).first()
    const previousEnabled = Number(existing?.enabled || 0)
    const nextEnabled = body.applications_closed ? 1 : 0
    const updatedAt = new Date().toISOString()
    await env.DB.prepare(`
      INSERT INTO website_controls (control_key, enabled, updated_at, updated_by)
      VALUES ('applications_closed', ?, ?, ?)
      ON CONFLICT(control_key) DO UPDATE SET
        enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `).bind(nextEnabled, updatedAt, auth.email).run()

    let verification
    try {
      verification = await verifyApplicationPageState(env, body.applications_closed)
    } catch (error) {
      logError('website_control.verification_failed', { applicationsClosed: body.applications_closed }, error)
    }
    if (!verification?.verified) {
      await env.DB.prepare(`
        UPDATE website_controls SET enabled = ?, updated_at = ?, updated_by = ?
        WHERE control_key = 'applications_closed'
      `).bind(previousEnabled, new Date().toISOString(), auth.email).run()
      return apiJson({
        error: 'The website state could not be verified. The previous setting was restored.',
        code: 'WEBSITE_CONTROL_VERIFICATION_FAILED',
      }, { status: 502 })
    }
    return apiJson({
      success: true,
      applications_closed: body.applications_closed,
      updated_at: updatedAt,
      updated_by: auth.email,
      verification,
    })
  }

  if (url.pathname === '/api/admin/analytics' && request.method === 'GET') {
    const requestedDays = Number.parseInt(url.searchParams.get('days') || '30', 10)
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
    const startModifier = `-${days - 1} days`
    const applicationTrendQuery = `
      WITH RECURSIVE days(day) AS (
        SELECT date('now', '+8 hours', ?)
        UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date('now', '+8 hours')
      )
      SELECT days.day, COUNT(d.application_id) AS count
      FROM days
      LEFT JOIN applicant_details d
        ON date(d.submitted_at, '+8 hours') = days.day
       AND d.application_status <> 'pending_upload'
      GROUP BY days.day ORDER BY days.day
    `
    const emailTrendQuery = `
      WITH RECURSIVE days(day) AS (
        SELECT date('now', '+8 hours', ?)
        UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date('now', '+8 hours')
      )
      SELECT days.day,
             SUM(CASE WHEN e.status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
             SUM(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM days
      LEFT JOIN email_messages e ON date(e.attempted_at, '+8 hours') = days.day
      GROUP BY days.day ORDER BY days.day
    `
    const [applicationTrend, applicationSummary, emailTrend, emailSummary, emailTypes, latestQuota, recentFailures, tracking, imageKitUsage] = await Promise.all([
      env.DB.prepare(applicationTrendQuery).bind(startModifier).all(),
      env.DB.prepare(`
        SELECT
          SUM(CASE WHEN application_status <> 'pending_upload' THEN 1 ELSE 0 END) AS total,
          SUM(CASE WHEN application_status <> 'pending_upload' AND date(submitted_at, '+8 hours') >= date('now', '+8 hours', ?) THEN 1 ELSE 0 END) AS period_total,
          SUM(CASE WHEN application_status = 'pending_upload' THEN 1 ELSE 0 END) AS pending_upload
        FROM applicant_details
      `).bind(startModifier).first(),
      env.DB.prepare(emailTrendQuery).bind(startModifier).all(),
      env.DB.prepare(`
        SELECT COUNT(*) AS attempts,
               SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
               SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
        FROM email_messages
        WHERE date(attempted_at, '+8 hours') >= date('now', '+8 hours', ?)
      `).bind(startModifier).first(),
      env.DB.prepare(`
        SELECT message_type,
               SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
               SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
        FROM email_messages
        WHERE date(attempted_at, '+8 hours') >= date('now', '+8 hours', ?)
        GROUP BY message_type ORDER BY accepted DESC, message_type
      `).bind(startModifier).all(),
      env.DB.prepare(`
        SELECT daily_quota_used, monthly_quota_used, rate_limit_remaining,
               rate_limit_reset_seconds, attempted_at
        FROM email_messages
        WHERE daily_quota_used IS NOT NULL OR monthly_quota_used IS NOT NULL
        ORDER BY attempted_at DESC, id DESC LIMIT 1
      `).first(),
      env.DB.prepare(`
        SELECT application_id, message_type, provider_http_status, failure_code, attempted_at
        FROM email_messages WHERE status = 'failed'
        ORDER BY attempted_at DESC, id DESC LIMIT 8
      `).all(),
      env.DB.prepare('SELECT MIN(attempted_at) AS tracking_since, MAX(attempted_at) AS last_attempt_at FROM email_messages').first(),
      getImageKitUsage(env),
    ])
    return apiJson({
      range_days: days,
      application_summary: {
        total: Number(applicationSummary?.total || 0),
        period_total: Number(applicationSummary?.period_total || 0),
        pending_upload: Number(applicationSummary?.pending_upload || 0),
      },
      application_trend: applicationTrend.results.map((row) => ({ day: row.day, count: Number(row.count || 0) })),
      email_summary: {
        attempts: Number(emailSummary?.attempts || 0),
        accepted: Number(emailSummary?.accepted || 0),
        failed: Number(emailSummary?.failed || 0),
      },
      email_trend: emailTrend.results.map((row) => ({ day: row.day, accepted: Number(row.accepted || 0), failed: Number(row.failed || 0) })),
      email_types: emailTypes.results.map((row) => ({ message_type: row.message_type, accepted: Number(row.accepted || 0), failed: Number(row.failed || 0) })),
      quota: latestQuota || null,
      recent_failures: recentFailures.results,
      tracking_since: tracking?.tracking_since || null,
      last_attempt_at: tracking?.last_attempt_at || null,
      imagekit_usage: imageKitUsage,
    })
  }

  if (url.pathname === '/api/admin/applications' && request.method === 'GET') {
    const search = url.searchParams.get('search')?.trim() || ''
    const status = url.searchParams.get('status')?.trim() || ''
    const dateFrom = url.searchParams.get('date_from')?.trim() || ''
    const dateTo = url.searchParams.get('date_to')?.trim() || ''
    const deletedOnly = url.searchParams.get('deleted') === 'only'
    const sort = url.searchParams.get('sort')?.trim() || 'submitted_at'
    const direction = url.searchParams.get('direction') === 'asc' ? 'ASC' : 'DESC'
    const requestedPage = Number.parseInt(url.searchParams.get('page') || '1', 10)
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, MAX_ADMIN_PAGE) : 1
    const offset = (page - 1) * ADMIN_PAGE_SIZE
    const sortColumn = SORT_COLUMNS[sort] || SORT_COLUMNS.submitted_at
    const conditions = deletedOnly
      ? ['a.deleted_at IS NOT NULL']
      : ['a.deleted_at IS NULL', "(d.application_status IS NULL OR d.application_status <> 'pending_upload')"]
    const bindings = []
    if (search) {
      conditions.push('(a.full_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ? OR a.application_id LIKE ? OR d.tags_json LIKE ?)')
      const term = `%${search}%`
      bindings.push(term, term, term, term, term)
    }
    if (status && STATUSES.includes(status)) {
      conditions.push('d.application_status = ?')
      bindings.push(status)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      conditions.push("date(d.submitted_at, '+8 hours') >= ?")
      bindings.push(dateFrom)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      conditions.push("date(d.submitted_at, '+8 hours') <= ?")
      bindings.push(dateTo)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const query = `
      SELECT a.application_id, a.full_name, a.email, a.phone, a.current_location,
             a.deleted_at, a.delete_after, a.deleted_by, a.deletion_type,
             CAST(json_extract(d.responses_json, '$.age') AS INTEGER) AS age,
             COALESCE(d.application_status, 'orphaned') AS application_status, d.submitted_at, d.tags_json,
             datetime(d.submitted_at, '+6 months') AS retention_due_at,
             CASE WHEN datetime(d.submitted_at, '+6 months') <= datetime('now', '+30 days') THEN 1 ELSE 0 END AS retention_warning,
             CASE WHEN datetime(d.submitted_at, '+6 months') <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS retention_overdue,
             COUNT(p.file_id) AS photo_count
      FROM applicants a
      LEFT JOIN applicant_details d ON d.application_id = a.application_id
      LEFT JOIN applicant_photos p ON p.application_id = a.application_id
      ${where}
      GROUP BY a.application_id, a.full_name, a.email, a.phone, a.current_location,
               a.deleted_at, a.delete_after, a.deleted_by, a.deletion_type,
               d.application_status, d.submitted_at, d.tags_json
      ORDER BY ${sortColumn} ${direction}, d.submitted_at DESC
      LIMIT ? OFFSET ?
    `
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM applicants a
      LEFT JOIN applicant_details d ON d.application_id = a.application_id
      ${where}
    `
    const summaryQuery = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN application_status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN application_status = 'reviewing' THEN 1 ELSE 0 END) AS reviewing,
        SUM(CASE WHEN application_status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
        SUM(CASE WHEN application_status = 'shortlisted' THEN 1 ELSE 0 END) AS shortlisted,
        SUM(CASE WHEN application_status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN datetime(submitted_at, '+6 months') <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS retention_overdue
      FROM applicants a
      LEFT JOIN applicant_details d ON d.application_id = a.application_id
      WHERE a.deleted_at IS NULL
        AND (d.application_status IS NULL OR d.application_status <> 'pending_upload')
    `
    const [result, filteredCount, summary] = await Promise.all([
      env.DB.prepare(query).bind(...bindings, ADMIN_PAGE_SIZE, offset).all(),
      env.DB.prepare(countQuery).bind(...bindings).first(),
      env.DB.prepare(summaryQuery).first(),
    ])
    const filteredTotal = Number(filteredCount?.total || 0)
    const totalPages = Math.max(1, Math.ceil(filteredTotal / ADMIN_PAGE_SIZE))
    return apiJson({
      applications: result.results.map(({ tags_json: tagsJson, ...application }) => ({ ...application, tags: parseTags(tagsJson) })),
      summary: {
        total: Number(summary?.total || 0),
        submitted: Number(summary?.submitted || 0),
        reviewing: Number(summary?.reviewing || 0),
        contacted: Number(summary?.contacted || 0),
        shortlisted: Number(summary?.shortlisted || 0),
        rejected: Number(summary?.rejected || 0),
        retention_overdue: Number(summary?.retention_overdue || 0),
      },
      pagination: {
        page,
        page_size: ADMIN_PAGE_SIZE,
        total: filteredTotal,
        total_pages: totalPages,
        has_previous: page > 1,
        has_next: page < totalPages,
      },
    })
  }

  if (url.pathname === '/api/admin/applications/bulk' && request.method === 'PATCH') {
    const body = await request.json().catch(() => null)
    const applicationIds = Array.isArray(body?.application_ids)
      ? [...new Set(body.application_ids.map((id) => String(id).trim()).filter(Boolean))]
      : []
    const status = String(body?.status || '')
    if (!STATUSES.includes(status) || status === 'shortlisted' || !applicationIds.length || applicationIds.length > 100) {
      return apiJson({ error: 'Select between 1 and 100 applications and a valid status.', code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const placeholders = applicationIds.map(() => '?').join(', ')
    const changedAt = new Date().toISOString()
    const [, result] = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO application_review_history (
          application_id, previous_status, new_status, previous_notes, new_notes,
          previous_tags_json, new_tags_json, changed_at, changed_by
        )
        SELECT application_id, application_status, ?, admin_notes, admin_notes,
               tags_json, tags_json, ?, ?
        FROM applicant_details
        WHERE application_id IN (${placeholders}) AND application_status <> ?
          AND application_id IN (SELECT application_id FROM applicants WHERE deleted_at IS NULL)
      `).bind(status, changedAt, auth.email, ...applicationIds, status),
      env.DB.prepare(`
        UPDATE applicant_details
        SET application_status = ?, reviewed_at = ?, reviewed_by = ?
        WHERE application_id IN (${placeholders})
          AND application_id IN (SELECT application_id FROM applicants WHERE deleted_at IS NULL)
      `).bind(status, changedAt, auth.email, ...applicationIds),
    ])
    return apiJson({ success: true, updated: Number(result.meta.changes || 0) })
  }

  const match = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)$/)
  if (match && request.method === 'GET') {
    const applicationId = decodeURIComponent(match[1])
    const application = await env.DB.prepare(`
      SELECT a.application_id, a.full_name, a.email, a.phone, a.current_location,
             d.responses_json, d.application_status, d.submitted_at, d.tags_json,
             d.admin_notes, d.reviewed_at, d.reviewed_by, d.shortlisted_email_sent_at,
             datetime(d.submitted_at, '+6 months') AS retention_due_at,
             CASE WHEN datetime(d.submitted_at, '+6 months') <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS retention_overdue
      FROM applicants a
      JOIN applicant_details d ON d.application_id = a.application_id
      WHERE a.application_id = ? AND a.deleted_at IS NULL
    `).bind(applicationId).first()
    if (!application) return apiJson({ error: 'Application not found.' }, { status: 404 })

    const photos = await env.DB.prepare(`
      SELECT file_id, file_name, file_url, photo_type
      FROM applicant_photos
      WHERE application_id = ?
      ORDER BY photo_type, file_name
    `).bind(applicationId).all()

    const history = await env.DB.prepare(`
      SELECT id, previous_status, new_status, previous_notes, new_notes,
             previous_tags_json, new_tags_json, changed_at, changed_by
      FROM application_review_history
      WHERE application_id = ?
      ORDER BY changed_at ASC, id ASC
    `).bind(applicationId).all()

    const { responses_json: responsesJson, tags_json: tagsJson, ...summary } = application
    try {
      return apiJson({ application: {
        ...summary,
        responses: parseResponses(responsesJson),
        tags: parseTags(tagsJson),
        photos: signPhotoUrls(env, photos.results),
        history: history.results.map(({ previous_tags_json: previousTags, new_tags_json: newTags, ...entry }) => ({
          ...entry, previous_tags: parseTags(previousTags), new_tags: parseTags(newTags),
        })),
      } })
    } catch (error) {
      logError('provider.imagekit_signing_failed', {}, error)
      await recordOperationalFailure(env, { service: 'imagekit', eventName: 'provider.imagekit_signing_failed', httpStatus: 502 })
      return apiJson({ error: 'Applicant photos could not be loaded from ImageKit.', code: 'IMAGEKIT_ERROR' }, { status: 502 })
    }
  }

  if (match && request.method === 'PATCH') {
    const applicationId = decodeURIComponent(match[1])
    const body = await request.json().catch(() => null)
    if (!body) return apiJson({ error: 'Invalid request body.', code: 'VALIDATION_ERROR' }, { status: 400 })
    const status = String(body.status || '')
    const notes = String(body.notes || '').trim()
    const tags = normalizeTags(body.tags)
    const sendShortlistEmail = body.send_shortlisted_email === true
    if (!STATUSES.includes(status) || notes.length > 10000 || !tags) {
      return apiJson({ error: 'Invalid review update.', code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const existing = await env.DB.prepare(`
      SELECT d.application_status, d.admin_notes, d.tags_json, d.shortlisted_email_sent_at,
             a.application_id, a.full_name, a.email
      FROM applicant_details d
      JOIN applicants a ON a.application_id = d.application_id
      WHERE d.application_id = ? AND a.deleted_at IS NULL
    `).bind(applicationId).first()
    if (!existing) return apiJson({ error: 'Application not found.' }, { status: 404 })

    const isNewShortlist = status === 'shortlisted' && existing.application_status !== 'shortlisted'
    if (isNewShortlist && !sendShortlistEmail) {
      return apiJson({ error: 'Confirm the shortlist email before changing this candidate to Shortlisted.', code: 'SHORTLIST_CONFIRMATION_REQUIRED' }, { status: 400 })
    }

    let shortlistEmailSentAt = null
    if (isNewShortlist && !existing.shortlisted_email_sent_at) {
      const emailResult = await sendShortlistedEmail(env, existing)
      if (!emailResult.ok) return apiJson({ error: emailResult.message, code: emailResult.code }, { status: 502 })
      shortlistEmailSentAt = new Date().toISOString()
    }

    const changedAt = new Date().toISOString()
    const tagsJson = JSON.stringify(tags)
    const [, result] = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO application_review_history (
          application_id, previous_status, new_status, previous_notes, new_notes,
          previous_tags_json, new_tags_json, changed_at, changed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(applicationId, existing.application_status, status, existing.admin_notes || '', notes, existing.tags_json || '[]', tagsJson, changedAt, auth.email),
      env.DB.prepare(`
        UPDATE applicant_details
        SET application_status = ?, admin_notes = ?, tags_json = ?, reviewed_at = ?, reviewed_by = ?,
            shortlisted_email_sent_at = COALESCE(?, shortlisted_email_sent_at)
        WHERE application_id = ?
      `).bind(status, notes, tagsJson, changedAt, auth.email, shortlistEmailSentAt, applicationId),
    ])
    if (!result.meta.changes) return apiJson({ error: 'Application not found.' }, { status: 404 })
    return apiJson({ success: true, review: {
      previous_status: existing.application_status,
      new_status: status,
      previous_notes: existing.admin_notes || '',
      new_notes: notes,
      previous_tags: parseTags(existing.tags_json),
      new_tags: tags,
      changed_at: changedAt,
      changed_by: auth.email,
    }, shortlisted_email_sent_at: shortlistEmailSentAt || existing.shortlisted_email_sent_at || null })
  }

  const restoreMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)\/restore$/)
  if (restoreMatch && request.method === 'POST') {
    const applicationId = decodeURIComponent(restoreMatch[1])
    const existing = await env.DB.prepare(`
      SELECT application_id, full_name, deletion_type
      FROM applicants
      WHERE application_id = ? AND deleted_at IS NOT NULL
    `).bind(applicationId).first()
    if (!existing) return apiJson({ error: 'Deleted application not found.', code: 'NOT_FOUND' }, { status: 404 })
    const [, result] = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO application_deletion_audit (
          application_id, applicant_name, event_type, deletion_type, occurred_at, performed_by
        ) VALUES (?, ?, 'restored', ?, CURRENT_TIMESTAMP, ?)
      `).bind(existing.application_id, existing.full_name, existing.deletion_type, auth.email),
      env.DB.prepare(`
        UPDATE applicants
        SET deleted_at = NULL, delete_after = NULL, deleted_by = NULL, deletion_type = NULL
        WHERE application_id = ? AND deleted_at IS NOT NULL
      `).bind(applicationId),
    ])
    if (!result.meta.changes) return apiJson({ error: 'Deleted application not found.', code: 'NOT_FOUND' }, { status: 404 })
    return apiJson({ success: true })
  }

  const purgeMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)\/purge$/)
  if (purgeMatch && request.method === 'DELETE') {
    const applicationId = decodeURIComponent(purgeMatch[1])
    const body = await request.json().catch(() => null)
    const confirmation = String(body?.confirmation || '')
    const existing = await env.DB.prepare(`
      SELECT application_id, full_name, deletion_type, delete_after
      FROM applicants
      WHERE application_id = ? AND deleted_at IS NOT NULL
    `).bind(applicationId).first()
    if (!existing) return apiJson({ error: 'Deleted application not found.', code: 'NOT_FOUND' }, { status: 404 })
    if (!matchesDeletionConfirmation(confirmation, existing)) return apiJson({ error: 'Type the applicant name or reference exactly.', code: 'CONFIRMATION_MISMATCH' }, { status: 400 })
    if (!recoveryPeriodEnded(existing.delete_after)) {
      return apiJson({ error: 'The 30-day recovery period has not ended.', code: 'RECOVERY_PERIOD_ACTIVE' }, { status: 400 })
    }
    const photos = await env.DB.prepare('SELECT file_id FROM applicant_photos WHERE application_id = ?')
      .bind(applicationId).all()
    try {
      await deleteImageKitFiles(env, photos.results.map((photo) => photo.file_id))
    } catch (error) {
      logError('provider.imagekit_deletion_failed', {}, error)
      await recordOperationalFailure(env, { service: 'imagekit', eventName: 'provider.imagekit_deletion_failed', httpStatus: 502 })
      return apiJson({ error: 'Photos could not be removed from ImageKit. Database records were kept; please retry.', code: 'IMAGEKIT_ERROR' }, { status: 502 })
    }
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO application_deletion_audit (
          application_id, applicant_name, event_type, deletion_type, occurred_at, performed_by
        ) VALUES (?, ?, 'permanently_deleted', ?, CURRENT_TIMESTAMP, ?)
      `).bind(existing.application_id, existing.full_name, existing.deletion_type, auth.email),
      env.DB.prepare('DELETE FROM applicant_photos WHERE application_id = ?').bind(applicationId),
      env.DB.prepare('DELETE FROM applicant_details WHERE application_id = ?').bind(applicationId),
      env.DB.prepare('DELETE FROM applicants WHERE application_id = ? AND deleted_at IS NOT NULL').bind(applicationId),
    ])
    return apiJson({ success: true })
  }

  if (match && request.method === 'DELETE') {
    const applicationId = decodeURIComponent(match[1])
    const body = await request.json().catch(() => null)
    const confirmation = String(body?.confirmation || '').trim()
    const deletionType = String(body?.deletion_type || '')
    const existing = await env.DB.prepare(`
      SELECT a.application_id, a.full_name, a.deleted_at,
             CASE WHEN datetime(d.submitted_at, '+6 months') <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS retention_overdue
      FROM applicants a
      LEFT JOIN applicant_details d ON d.application_id = a.application_id
      WHERE a.application_id = ?
    `)
      .bind(applicationId)
      .first()
    if (!existing) return apiJson({ error: 'Application not found.' }, { status: 404 })
    if (existing.deleted_at) return apiJson({ error: 'Application is already in Recently Deleted.', code: 'ALREADY_DELETED' }, { status: 409 })
    if (!matchesDeletionConfirmation(confirmation, existing) || !['manual', 'retention_cleanup'].includes(deletionType)) {
      return apiJson({ error: 'Type the applicant name or reference exactly and choose a valid deletion action.', code: 'CONFIRMATION_MISMATCH' }, { status: 400 })
    }
    if (deletionType === 'retention_cleanup' && !existing.retention_overdue) {
      return apiJson({ error: 'This application has not reached its retention cleanup date.', code: 'RETENTION_NOT_DUE' }, { status: 400 })
    }
    const deletedAt = new Date().toISOString()
    const deleteAfter = new Date(Date.now() + SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const [, result] = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO application_deletion_audit (
          application_id, applicant_name, event_type, deletion_type, occurred_at, performed_by
        ) VALUES (?, ?, 'soft_deleted', ?, ?, ?)
      `).bind(existing.application_id, existing.full_name, deletionType, deletedAt, auth.email),
      env.DB.prepare(`
        UPDATE applicants
        SET deleted_at = ?, delete_after = ?, deleted_by = ?, deletion_type = ?
        WHERE application_id = ? AND deleted_at IS NULL
      `).bind(deletedAt, deleteAfter, auth.email, deletionType, applicationId),
    ])
    if (!result.meta.changes) return apiJson({ error: 'Application is already in Recently Deleted.', code: 'ALREADY_DELETED' }, { status: 409 })
    return apiJson({ success: true, delete_after: deleteAfter })
  }

  return apiJson({ error: 'Not found.' }, { status: 404 })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/admin/')) {
      try {
        if (!await enforceAdminRateLimit(request, env)) {
          await recordAdminRateLimit(request, env)
          return apiJson({ error: 'Too many admin requests. Please wait and try again.', code: 'RATE_LIMITED' }, {
            status: 429,
            headers: { 'Retry-After': '60' },
          })
        }
        return await handleApi(request, env, url)
      } catch (error) {
        logError('admin.database_request_failed', { path: url.pathname, httpStatus: 503 }, error)
        await recordOperationalFailure(env, { service: 'admin_api', eventName: 'admin.database_request_failed', httpStatus: 503 })
        return apiJson({ error: 'The application database is temporarily unavailable.', code: 'DATABASE_ERROR' }, { status: 503 })
      }
    }
    return env.ASSETS.fetch(request)
  },
}

export { ADMIN_PAGE_SIZE, buildShortlistedEmail, enforceAdminRateLimit, getImageKitUsage, handleApi, imageKitUsageDateRange, matchesDeletionConfirmation, normalizeTags, parseResponses, recoveryPeriodEnded, signPhotoUrls, verifyApplicationPageState }
