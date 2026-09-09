import { apiJson } from './apiResponse.js'
import { getPublicCandidateProgress } from './trainingProgress.js'

const publicMessages = {
  INVALID_LINK: 'This training progress link is not valid.',
  REVOKED_LINK: 'This training progress link is no longer available. Please contact Nexa if you need a new link.',
  EXPIRED_LINK: 'This training progress link has expired. Please contact Nexa if you need a new link.',
}

export async function handlePublicProgress(request, env, token) {
  if (env.PROGRESS_RATE_LIMITER?.limit) {
    const key = `${request.headers.get('CF-Connecting-IP') || 'unknown'}:progress`
    const limited = await env.PROGRESS_RATE_LIMITER.limit({ key })
    if (!limited.success) return apiJson({ error: 'Please wait before trying this link again.', code: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } })
  }
  try {
    const result = await getPublicCandidateProgress(env.DB, token)
    if (result.error) return apiJson({ error: publicMessages[result.error], code: result.error }, { status: result.error === 'INVALID_LINK' ? 404 : 410, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
    return apiJson(result, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
  } catch (error) {
    console.error('progress.public_load_failed', { error: String(error?.message || error) })
    return apiJson({ error: 'Training progress is temporarily unavailable. Please try again later.', code: 'PROGRESS_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
  }
}
