import { requireAdmin } from './access.js'

const STATUSES = ['submitted', 'reviewing', 'shortlisted', 'rejected']

function parseResponses(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

async function handleApi(request, env, url) {
  const auth = await requireAdmin(request, env)
  if (auth.error) return auth.error

  if (url.pathname === '/api/admin/session' && request.method === 'GET') {
    return Response.json({ email: auth.email })
  }

  if (url.pathname === '/api/admin/applications' && request.method === 'GET') {
    const search = url.searchParams.get('search')?.trim() || ''
    const status = url.searchParams.get('status')?.trim() || ''
    const conditions = []
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
             d.application_status, d.submitted_at, COUNT(p.file_id) AS photo_count
      FROM applicants a
      JOIN applicant_details d ON d.application_id = a.application_id
      LEFT JOIN applicant_photos p ON p.application_id = a.application_id
      ${where}
      GROUP BY a.application_id, a.full_name, a.email, a.phone, a.current_location,
               d.application_status, d.submitted_at
      ORDER BY d.submitted_at DESC
      LIMIT 500
    `
    const result = await env.DB.prepare(query).bind(...bindings).all()
    return Response.json({ applications: result.results })
  }

  const match = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)$/)
  if (match && request.method === 'GET') {
    const applicationId = decodeURIComponent(match[1])
    const application = await env.DB.prepare(`
      SELECT a.application_id, a.full_name, a.email, a.phone, a.current_location,
             d.responses_json, d.application_status, d.submitted_at,
             d.admin_notes, d.reviewed_at, d.reviewed_by
      FROM applicants a
      JOIN applicant_details d ON d.application_id = a.application_id
      WHERE a.application_id = ?
    `).bind(applicationId).first()
    if (!application) return Response.json({ error: 'Application not found.' }, { status: 404 })

    const photos = await env.DB.prepare(`
      SELECT file_id, file_name, file_url, photo_type
      FROM applicant_photos
      WHERE application_id = ?
      ORDER BY photo_type, file_name
    `).bind(applicationId).all()

    const { responses_json: responsesJson, ...summary } = application
    return Response.json({ application: { ...summary, responses: parseResponses(responsesJson), photos: photos.results } })
  }

  if (match && request.method === 'PATCH') {
    const applicationId = decodeURIComponent(match[1])
    const body = await request.json()
    const status = String(body.status || '')
    const notes = String(body.notes || '').trim()
    if (!STATUSES.includes(status) || notes.length > 10000) {
      return Response.json({ error: 'Invalid review update.' }, { status: 400 })
    }
    const result = await env.DB.prepare(`
      UPDATE applicant_details
      SET application_status = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
      WHERE application_id = ?
    `).bind(status, notes, auth.email, applicationId).run()
    if (!result.meta.changes) return Response.json({ error: 'Application not found.' }, { status: 404 })
    return Response.json({ success: true })
  }

  if (match && request.method === 'DELETE') {
    const applicationId = decodeURIComponent(match[1])
    const existing = await env.DB.prepare('SELECT application_id FROM applicants WHERE application_id = ?')
      .bind(applicationId)
      .first()
    if (!existing) return Response.json({ error: 'Application not found.' }, { status: 404 })

    await env.DB.batch([
      env.DB.prepare('DELETE FROM applicant_photos WHERE application_id = ?').bind(applicationId),
      env.DB.prepare('DELETE FROM applicant_details WHERE application_id = ?').bind(applicationId),
      env.DB.prepare('DELETE FROM applicants WHERE application_id = ?').bind(applicationId),
    ])
    return Response.json({ success: true })
  }

  return Response.json({ error: 'Not found.' }, { status: 404 })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/admin/')) return handleApi(request, env, url)
    return env.ASSETS.fetch(request)
  },
}
