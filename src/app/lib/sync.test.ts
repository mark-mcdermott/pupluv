import { describe, expect, it } from 'vitest'
import { apiBase } from './sync'

describe('apiBase', () => {
  it('is empty when unset, so the web stays same-origin', () => {
    expect(apiBase(undefined)).toBe('')
    expect(apiBase('')).toBe('')
  })

  it('strips trailing slashes that would produce a redirecting //api path', () => {
    expect(apiBase('https://pupluv.vercel.app/')).toBe('https://pupluv.vercel.app')
    expect(apiBase('https://pupluv.vercel.app///')).toBe('https://pupluv.vercel.app')
  })

  it('leaves a clean origin alone', () => {
    expect(apiBase('https://pupluv.vercel.app')).toBe('https://pupluv.vercel.app')
    expect(apiBase('http://localhost:4321')).toBe('http://localhost:4321')
  })

  it('tolerates stray whitespace from a shell variable', () => {
    expect(apiBase('  https://pupluv.vercel.app/  ')).toBe('https://pupluv.vercel.app')
  })
})
