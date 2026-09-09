export function whatsappUrl(phone, message = '') {
  const raw = String(phone ?? '').trim()
  if (!raw) return null

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)

  // Application phone numbers without a country code are Malaysian numbers.
  if (digits.startsWith('60')) digits = `60${digits.slice(2).replace(/^0/, '')}`
  else if (digits.startsWith('0')) digits = `60${digits.slice(1)}`

  if (!digits) return null
  const query = String(message || '').trim() ? `?text=${encodeURIComponent(String(message).trim())}` : ''
  return `https://wa.me/${digits}${query}`
}
