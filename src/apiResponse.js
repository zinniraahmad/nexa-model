export const API_SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
})

export function apiJson(data, init = {}) {
  const headers = new Headers(init.headers)
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) headers.set(name, value)
  return Response.json(data, { ...init, headers })
}
