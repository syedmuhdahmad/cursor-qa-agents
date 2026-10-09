import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from '../../../lib/validation'

describe('validateEmail', () => {
  it('accepts a well-formed address', () => {
    expect(validateEmail('ada@example.com')).toBeNull()
  })

  it('accepts an address with spaces around it', () => {
    expect(validateEmail('  ada@example.com  ')).toBeNull()
  })

  it('asks for an email when the value is empty', () => {
    expect(validateEmail('')).toBe('Enter your email')
  })

  it('asks for an email when the value is only spaces', () => {
    expect(validateEmail('   ')).toBe('Enter your email')
  })

  it('asks for an email when the value is not a string', () => {
    expect(validateEmail(undefined)).toBe('Enter your email')
    expect(validateEmail(42)).toBe('Enter your email')
  })

  it('rejects an address with no @', () => {
    expect(validateEmail('ada.example.com')).toBe('Enter a valid email address')
  })

  it('rejects an address with no domain dot', () => {
    expect(validateEmail('ada@example')).toBe('Enter a valid email address')
  })

  it('rejects an address with a space inside', () => {
    expect(validateEmail('ada lovelace@example.com')).toBe('Enter a valid email address')
  })
})

describe('validatePassword', () => {
  it('uses a minimum length of 8', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })

  it('accepts a password of exactly 8 characters', () => {
    expect(validatePassword('12345678')).toBeNull()
  })

  it('rejects a password of 7 characters', () => {
    expect(validatePassword('1234567')).toBe('Password must be at least 8 characters')
  })

  it('rejects an empty password', () => {
    expect(validatePassword('')).toBe('Password must be at least 8 characters')
  })

  it('rejects a value that is not a string', () => {
    expect(validatePassword(undefined)).toBe('Password must be at least 8 characters')
    expect(validatePassword(12345678)).toBe('Password must be at least 8 characters')
  })
})

describe('normalizeEmail', () => {
  it('trims spaces and lowercases', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  })
})
