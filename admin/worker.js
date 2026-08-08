import { requireAdmin } from './access.js'
import ImageKit from '@imagekit/nodejs'
import { apiJson } from '../src/apiResponse.js'

const STATUSES = ['submitted', 'reviewing', 'contacted', 'interview_scheduled', 'shortlisted', 'rejected']
const SORT_COLUMNS = {
  submitted_at: 'd.submitted_at',
  age: "CAST(json_extract(d.responses_json, '$.age') AS INTEGER)",
  location: 'a.current_location COLLATE NOCASE',
  status: 'd.application_status COLLATE NOCASE',
}

function parseResponses(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return null
  const tags = [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))]
  if (tags.length > 10 || tags.some((tag) => tag.length > 30)) return null
  return tags
}

function parseTags(value) {
  const tags = parseResponses(value)
  return Array.isArray(tags) ? tags : []
}

function signPhotoUrls(env, photos) {
  if (!env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) {
    throw new Error('Private image delivery is not configured for the admin Worker.')
  }
  const imagekit = new ImageKit({ privateKey: env.IMAGEKIT_PRIVATE_KEY })
  return photos.map(({ file_url: fileUrl, ...photo }) => ({
    ...photo,
    file_url: imagekit.helper.buildSrc({
      urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
      src: fileUrl,
      signed: true,
      expiresIn: 300,
    }),
  }))
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

async function handleApi(request, env, url) {
  const auth = await requireAdmin(request, env)
  if (auth.error) return auth.error

  if (url.pathname === '/api/admin/session' && request.method === 'GET') {
    return apiJson({ email: auth.email })
  }

  if (url.pathname === '/api/admin/applications' && request.method === 'GET') {
    const search = url.searchParams.get('search')?.trim() || ''
    const status = url.searchParams.get('status')?.trim() || ''
    const dateFrom = url.searchParams.get('date_from')?.trim() || ''
    const dateTo = url.searchParams.get('date_to')?.trim() || ''
    const retention = url.searchParams.get('retention')?.trim() || ''
    const sort = url.searchParams.get('sort')?.trim() || 'submitted_at'
    const direction = url.searchParams.get('direction') === 'asc' ? 'ASC' : 'DESC'
    const sortColumn = SORT_COLUMNS[sort] || SORT_COLUMNS.submitted_at
    const conditions = ["(d.application_status IS NULL OR d.application_status <> 'pending_upload')"]
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
    if (retention === 'warning') conditions.push("datetime(d.submitted_at, '+6 months') <= datetime('now', '+30 days')")
    if (retention === 'overdue') conditions.push("datetime(d.submitted_at, '+6 months') <= CURRENT_TIMESTAMP")
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const query = `
      SELECT a.application_id, a.full_name, a.email, a.phone, a.current_location,
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
               d.application_status, d.submitted_at, d.tags_json
      ORDER BY ${sortColumn} ${direction}, d.submitted_at DESC
      LIMIT 500
    `
    const summaryQuery = `
      SELECT
        SUM(CASE WHEN application_status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN application_status = 'reviewing' THEN 1 ELSE 0 END) AS reviewing,
        SUM(CASE WHEN application_status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
        SUM(CASE WHEN application_status = 'interview_scheduled' THEN 1 ELSE 0 END) AS interview_scheduled,
        SUM(CASE WHEN application_status = 'shortlisted' THEN 1 ELSE 0 END) AS shortlisted,
        SUM(CASE WHEN application_status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN datetime(submitted_at, '+6 months') <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS retention_overdue
      FROM applicants a
      LEFT JOIN applicant_details d ON d.application_id = a.application_id
      WHERE d.application_status IS NULL OR d.application_status <> 'pending_upload'
    `
    const [result, summary] = await Promise.all([
      env.DB.prepare(query).bind(...bindings).all(),
      env.DB.prepare(summaryQuery).first(),
    ])
    return apiJson({
      applications: result.results.map(({ tags_json: tagsJson, ...application }) => ({ ...application, tags: parseTags(tagsJson) })),
      summary: {
        submitted: Number(summary?.submitted || 0),
        reviewing: Number(summary?.reviewing || 0),
        contacted: Number(summary?.contacted || 0),
        interview_scheduled: Number(summary?.interview_scheduled || 0),
        shortlisted: Number(summary?.shortlisted || 0),
        rejected: Number(summary?.rejected || 0),
        retention_overdue: Number(summary?.retention_overdue || 0),
      },
    })
  }

  if (url.pathname === '/api/admin/applications/bulk' && request.method === 'PATCH') {
    const body = await request.json().catch(() => null)
    const applicationIds = Array.isArray(body?.application_ids)
      ? [...new Set(body.application_ids.map((id) => String(id).trim()).filter(Boolean))]
      : []
    const status = String(body?.status || '')
    if (!STATUSES.includes(status) || !applicationIds.length || applicationIds.length > 100) {
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
      `).bind(status, changedAt, auth.email, ...applicationIds, status),
      env.DB.prepare(`
        UPDATE applicant_details
        SET application_status = ?, reviewed_at = ?, reviewed_by = ?
        WHERE application_id IN (${placeholders})
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
             d.admin_notes, d.reviewed_at, d.reviewed_by,
             datetime(d.submitted_at, '+6 months') AS retention_due_at,
             CASE WHEN datetime(d.submitted_at, '+6 months') <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS retention_overdue
      FROM applicants a
      JOIN applicant_details d ON d.application_id = a.application_id
      WHERE a.application_id = ?
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
      console.error('provider.imagekit_signing_failed', { error, applicationId })
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
    if (!STATUSES.includes(status) || notes.length > 10000 || !tags) {
      return apiJson({ error: 'Invalid review update.', code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    const existing = await env.DB.prepare(`
      SELECT application_status, admin_notes, tags_json
      FROM applicant_details
      WHERE application_id = ?
    `).bind(applicationId).first()
    if (!existing) return apiJson({ error: 'Application not found.' }, { status: 404 })

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
        SET application_status = ?, admin_notes = ?, tags_json = ?, reviewed_at = ?, reviewed_by = ?
        WHERE application_id = ?
      `).bind(status, notes, tagsJson, changedAt, auth.email, applicationId),
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
    } })
  }

  if (match && request.method === 'DELETE') {
    const applicationId = decodeURIComponent(match[1])
    const existing = await env.DB.prepare('SELECT application_id FROM applicants WHERE application_id = ?')
      .bind(applicationId)
      .first()
    if (!existing) return apiJson({ error: 'Application not found.' }, { status: 404 })

    const photos = await env.DB.prepare('SELECT file_id FROM applicant_photos WHERE application_id = ?')
      .bind(applicationId).all()
    try {
      await deleteImageKitFiles(env, photos.results.map((photo) => photo.file_id))
    } catch (error) {
      console.error('provider.imagekit_deletion_failed', { error, applicationId })
      return apiJson({ error: 'Photos could not be removed from ImageKit. Database records were kept; please retry.', code: 'IMAGEKIT_ERROR' }, { status: 502 })
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM applicant_photos WHERE application_id = ?').bind(applicationId),
      env.DB.prepare('DELETE FROM applicant_details WHERE application_id = ?').bind(applicationId),
      env.DB.prepare('DELETE FROM applicants WHERE application_id = ?').bind(applicationId),
    ])
    return apiJson({ success: true })
  }

  return apiJson({ error: 'Not found.' }, { status: 404 })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/admin/')) {
      try {
        return await handleApi(request, env, url)
      } catch (error) {
        console.error('admin.database_request_failed', { error, path: url.pathname })
        return apiJson({ error: 'The application database is temporarily unavailable.', code: 'DATABASE_ERROR' }, { status: 503 })
      }
    }
    return env.ASSETS.fetch(request)
  },
}

export { normalizeTags }
