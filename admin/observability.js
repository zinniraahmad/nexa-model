const ALERT_THRESHOLD = 3
const ALERT_WINDOW_MINUTES = 5
const ALERT_COOLDOWN_MINUTES = 15

function errorMetadata(error) {
  if (!error || typeof error !== 'object') return {}
  const metadata = { errorName: String(error.name || 'Error').slice(0, 80) }
  if (typeof error.code === 'string' || typeof error.code === 'number') metadata.errorCode = String(error.code).slice(0, 80)
  return metadata
}

function safeContext(context = {}) {
  const allowed = ['service', 'eventName', 'httpStatus', 'messageType', 'path', 'requestId', 'reasonCode']
  return Object.fromEntries(allowed
    .filter((key) => ['string', 'number', 'boolean'].includes(typeof context[key]))
    .map((key) => [key, typeof context[key] === 'string' ? context[key].slice(0, 160) : context[key]]))
}

function logError(eventName, context, error) {
  console.error(eventName, { ...safeContext(context), ...errorMetadata(error) })
}

async function sendOperationsAlert(env, { service, eventName, eventCount, fallback = false }) {
  const recipient = String(env.OPERATIONS_ALERT_EMAIL || env.ADMIN_NOTIFICATION_EMAIL || env.ADMIN_EMAILS || '')
    .split(',')[0].trim()
  if (!env.RESEND_API_KEY || !recipient) return { status: 'not_configured' }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'Nexa Model <applications@updates.nexa-model.com>',
        to: [recipient],
        subject: `[Nexa alert] Repeated ${service} failures`,
        text: fallback
          ? `The ${service} service failed and D1 was unavailable, so failure aggregation could not run. Event: ${eventName}. Check Cloudflare Observability immediately.`
          : `${eventCount} ${service} failures were recorded within ${ALERT_WINDOW_MINUTES} minutes. Latest event: ${eventName}. Check Cloudflare Observability and the provider dashboard.`,
      }),
    })
    return { status: response.ok ? 'sent' : 'failed' }
  } catch (error) {
    logError('operations.alert_delivery_failed', { service, eventName }, error)
    return { status: 'failed' }
  }
}

async function recordOperationalFailure(env, { service, eventName, httpStatus = null }) {
  try {
    await env.DB.prepare(`
      INSERT INTO admin_operational_failures (service, event_name, http_status)
      VALUES (?, ?, ?)
    `).bind(service, eventName, httpStatus).run()

    const window = await env.DB.prepare(`
      SELECT COUNT(*) AS event_count, MIN(occurred_at) AS window_started_at
      FROM admin_operational_failures
      WHERE service = ? AND occurred_at >= datetime('now', '-${ALERT_WINDOW_MINUTES} minutes')
    `).bind(service).first()
    const eventCount = Number(window?.event_count || 0)
    if (eventCount < ALERT_THRESHOLD) return { alerted: false, eventCount }

    const inserted = await env.DB.prepare(`
      INSERT INTO admin_operational_alerts (service, event_count, window_started_at)
      SELECT ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM admin_operational_alerts
        WHERE service = ? AND alerted_at >= datetime('now', '-${ALERT_COOLDOWN_MINUTES} minutes')
      )
    `).bind(service, eventCount, window.window_started_at, service).run()
    if (!Number(inserted.meta?.changes || 0)) return { alerted: false, eventCount }

    const alertId = inserted.meta?.last_row_id
    const delivery = await sendOperationsAlert(env, { service, eventName, eventCount })
    if (alertId) {
      await env.DB.prepare('UPDATE admin_operational_alerts SET delivery_status = ? WHERE id = ?')
        .bind(delivery.status, alertId).run()
    }
    console.warn('operations.repeated_failure_alert', { service, eventName, eventCount, deliveryStatus: delivery.status })
    return { alerted: true, eventCount, deliveryStatus: delivery.status }
  } catch (error) {
    logError('operations.failure_aggregation_failed', { service, eventName }, error)
    if (service === 'admin_api') await sendOperationsAlert(env, { service, eventName, eventCount: 1, fallback: true })
    return { alerted: false, aggregationFailed: true }
  }
}

export { ALERT_THRESHOLD, logError, recordOperationalFailure, safeContext }
