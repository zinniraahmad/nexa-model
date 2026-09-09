import test from 'node:test'
import assert from 'node:assert/strict'
import { whatsappUrl } from '../admin/src/whatsapp.js'

test('creates WhatsApp links for Malaysian local phone numbers', () => {
  assert.equal(whatsappUrl('012-345 6789'), 'https://wa.me/60123456789')
  assert.equal(whatsappUrl('011 2345 6789'), 'https://wa.me/601123456789')
})

test('keeps international numbers and removes an optional Malaysian trunk zero', () => {
  assert.equal(whatsappUrl('+60 12-345 6789'), 'https://wa.me/60123456789')
  assert.equal(whatsappUrl('+60 (0)12-345 6789'), 'https://wa.me/60123456789')
  assert.equal(whatsappUrl('0060 12-345 6789'), 'https://wa.me/60123456789')
  assert.equal(whatsappUrl('+65 8123 4567'), 'https://wa.me/6581234567')
})

test('does not create a link when the phone number is empty', () => {
  assert.equal(whatsappUrl(''), null)
  assert.equal(whatsappUrl(null), null)
})

test('adds an optional reviewable message without sending it', () => {
  assert.equal(whatsappUrl('012-345 6789', 'Training at 2:00 PM'), 'https://wa.me/60123456789?text=Training%20at%202%3A00%20PM')
})
