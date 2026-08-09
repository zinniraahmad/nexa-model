function integerHeader(response, name) {
  const value = response?.headers?.get(name)
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

async function safeProviderResult(response) {
  try {
    const result = await response.clone().json()
    return result && typeof result === 'object' ? result : {}
  } catch {
    return {}
  }
}

async function insertEmailMessage(env, values) {
  if (!env?.DB) return
  try {
    await env.DB.prepare(`
      INSERT INTO email_messages (
        resend_email_id, application_id, message_type, recipient_type, status,
        provider_http_status, failure_code, daily_quota_used, monthly_quota_used,
        rate_limit_remaining, rate_limit_reset_seconds, accepted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      values.resendEmailId || null,
      values.applicationId || null,
      values.messageType,
      values.recipientType,
      values.status,
      values.httpStatus || null,
      values.failureCode || null,
      values.dailyQuotaUsed,
      values.monthlyQuotaUsed,
      values.rateLimitRemaining,
      values.rateLimitResetSeconds,
      values.status === 'accepted' ? new Date().toISOString() : null,
    ).run()
  } catch (error) {
    // Analytics must never turn a successfully accepted email into an application failure.
    console.error('analytics.email_record_failed', { messageType: values.messageType, error })
  }
}

export async function trackResendResponse(env, response, context) {
  const result = await safeProviderResult(response)
  await insertEmailMessage(env, {
    ...context,
    status: response.ok ? 'accepted' : 'failed',
    httpStatus: response.status,
    resendEmailId: result.id || null,
    failureCode: response.ok ? null : String(result.name || result.code || result.type || 'provider_error').slice(0, 80),
    dailyQuotaUsed: integerHeader(response, 'x-resend-daily-quota'),
    monthlyQuotaUsed: integerHeader(response, 'x-resend-monthly-quota'),
    rateLimitRemaining: integerHeader(response, 'ratelimit-remaining'),
    rateLimitResetSeconds: integerHeader(response, 'ratelimit-reset'),
  })
  return { ok: response.ok, id: result.id || null }
}

export async function trackResendNetworkFailure(env, context) {
  await insertEmailMessage(env, {
    ...context,
    status: 'failed',
    httpStatus: null,
    failureCode: 'network_error',
    dailyQuotaUsed: null,
    monthlyQuotaUsed: null,
    rateLimitRemaining: null,
    rateLimitResetSeconds: null,
  })
}
