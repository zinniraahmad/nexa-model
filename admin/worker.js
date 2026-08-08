import { requireAdmin } from './access.js'
import ImageKit from '@imagekit/nodejs'
import { apiJson } from '../src/apiResponse.js'

const STATUSES = ['submitted', 'reviewing', 'shortlisted', 'rejected']

function parseResponses(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
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
    const conditions = ["(d.application_status IS NULL OR d.application_status <> 'pending_upload')"]
    const bindings = []
    if (search) {
      conditions.push('(a.full_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ? OR a.application_id LIKE ?)')
      const term = `%${search}%`
      bindings.push(term, term, term, term)
    }
    if (status && STATUSES.includes(status)) {
      conditions.push('d.application_status = ?')
      bindings.push(status)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const query = `
      SELECT a.application_id, a.full_name, a.email, a.phone, a.current_location,
             COALESCE(d.application_status, 'orphaned') AS application_status, d.submitted_at,
             datetime(d.submitted_at, '+6 months') AS retention_due_at,
             CASE WHEN datetime(d.submitted_at, '+6 months') <= datetime('now', '+30 days') THEN 1 ELSE 0 END AS retention_warning,
             CASE WHEN datetime(d.submitted_at, '+6 months') <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS retention_overdue,
             COUNT(p.file_id) AS photo_count
      FROM applicants a
      LEFT JOIN applicant_details d ON d.application_id = a.application_id
      LEFT JOIN applicant_photos p ON p.application_id = a.application_id
      ${where}
      GROUP BY a.application_id, a.full_name, a.email, a.phone, a.current_location,
               d.application_status, d.submitted_at
      ORDER BY d.submitted_at DESC
      LIMIT 500
    `
    const summaryQuery = `
      SELECT
        SUM(CASE WHEN application_status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN application_status = 'reviewing' THEN 1 ELSE 0 END) AS reviewing,
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
      applications: result.results,
      summary: {
        submitted: Number(summary?.submitted || 0),
        reviewing: Number(summary?.reviewing || 0),
        shortlisted: Number(summary?.shortlisted || 0),
        rejected: Number(summary?.rejected || 0),
        retention_overdue: Number(summary?.retention_overdue || 0),
      },
    })
  }

  const match = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)$/)
  if (match && request.method === 'GET') {
    const applicationId = decodeURIComponent(match[1])
    const application = await env.DB.prepare(`
      SELECT a.application_id, a.full_name, a.email, a.phone, a.current_location,
             d.responses_json, d.application_status, d.submitted_at,
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

    const { responses_json: responsesJson, ...summary } = application
    return apiJson({ application: { ...summary, responses: parseResponses(responsesJson), photos: signPhotoUrls(env, photos.results) } })
  }

  if (match && request.method === 'PATCH') {
    const applicationId = decodeURIComponent(match[1])
    const body = await request.json()
    const status = String(body.status || '')
    const notes = String(body.notes || '').trim()
    if (!STATUSES.includes(status) || notes.length > 10000) {
      return apiJson({ error: 'Invalid review update.' }, { status: 400 })
    }
    const result = await env.DB.prepare(`
      UPDATE applicant_details
      SET application_status = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
      WHERE application_id = ?
    `).bind(status, notes, auth.email, applicationId).run()
    if (!result.meta.changes) return apiJson({ error: 'Application not found.' }, { status: 404 })
    return apiJson({ success: true })
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
      return apiJson({ error: 'Photos could not be removed from storage. Database records were kept; please retry.' }, { status: 502 })
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
    if (url.pathname.startsWith('/api/admin/')) return handleApi(request, env, url)
    return env.ASSETS.fetch(request)
  },
}
