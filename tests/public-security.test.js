import test from 'node:test'
import assert from 'node:assert/strict'
import { applicationSections, declarationFields } from '../src/applicationForm.js'
import { detectImageMime, parsePhotoSlot, validateAnswers } from '../src/worker.js'

function validValue(field) {
  if (field.type === 'checkbox') return [field.options[0]]
  if (field.type === 'radio' || field.type === 'select') return field.options[0]
  if (field.type === 'scale' || field.type === 'number') return field.min
  if (field.type === 'email') return 'candidate@example.com'
  if (field.type === 'url') return 'https://example.com/profile'
  if (field.key === 'phone') return '+60123456789'
  return `${field.key} value`
}

function validAnswers() {
  const fields = [...applicationSections.flatMap((section) => section.fields), ...declarationFields]
  return Object.fromEntries(fields.map((field) => [field.key, validValue(field)]))
}

test('accepts a complete application and rejects missing or unknown fields', () => {
  const answers = validAnswers()
  assert.equal(validateAnswers(answers), null)
  delete answers.full_name
  assert.match(validateAnswers(answers), /required/i)
  answers.full_name = 'Candidate'
  answers.injected = 'unexpected'
  assert.match(validateAnswers(answers), /unknown field/i)
})

test('requires explicit acceptance of the privacy notice', () => {
  const answers = validAnswers()
  answers.privacy_notice_consent = []
  assert.match(validateAnswers(answers), /required/i)
  answers.privacy_notice_consent = ['I understand and agree.']
  assert.equal(validateAnswers(answers), null)
})

test('rejects values outside the server-side schema', () => {
  const answers = validAnswers()
  answers.age = 17
  assert.match(validateAnswers(answers), /allowed range/i)
  answers.age = 18
  answers.gender = 'Invalid'
  assert.match(validateAnswers(answers), /invalid selection/i)
  answers.gender = 'Female'
  answers.age_gate = 'No'
  assert.match(validateAnswers(answers), /eligibility/i)
  answers.age_gate = 'Yes'
  answers.full_name = '   '
  assert.match(validateAnswers(answers), /required/i)
})

test('only accepts declared photo slots within category limits', () => {
  assert.equal(parsePhotoSlot('front_facing_1')?.type, 'front_facing_1')
  assert.equal(parsePhotoSlot('front_facing_2'), null)
  assert.equal(parsePhotoSlot('unknown_1'), null)
  assert.equal(parsePhotoSlot('../front_facing_1'), null)
})

test('detects PNG and JPEG signatures instead of trusting filenames', async () => {
  const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'fake.txt')
  const jpeg = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], 'fake.bin')
  const executable = new File([Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])], 'malware.jpg')
  assert.equal(await detectImageMime(png), 'image/png')
  assert.equal(await detectImageMime(jpeg), 'image/jpeg')
  assert.equal(await detectImageMime(executable), null)
})
