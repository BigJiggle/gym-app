import { describe, it, expect } from 'vitest'
import { ratingTone, ratingTextClass, ratingBgClass } from '../../src/utils/ratingColor'

describe('ratingColor — shared good/medium/bad scale', () => {
  describe('lower-is-better (stress)', () => {
    it('treats low values as good, high as bad', () => {
      expect(ratingTone(1, 'lower')).toBe('good')
      expect(ratingTone(2, 'lower')).toBe('good')
      expect(ratingTone(3, 'lower')).toBe('medium')
      expect(ratingTone(4, 'lower')).toBe('bad')
      expect(ratingTone(5, 'lower')).toBe('bad')
    })
  })

  describe('higher-is-better (sleep, energy)', () => {
    it('treats high values as good, low as bad', () => {
      expect(ratingTone(1, 'higher')).toBe('bad')
      expect(ratingTone(2, 'higher')).toBe('bad')
      expect(ratingTone(3, 'higher')).toBe('medium')
      expect(ratingTone(4, 'higher')).toBe('good')
      expect(ratingTone(5, 'higher')).toBe('good')
    })
  })

  it('maps each tone to a consistent green/yellow/red text class', () => {
    expect(ratingTextClass(5, 'higher')).toBe('text-green-400') // good sleep/energy
    expect(ratingTextClass(1, 'lower')).toBe('text-green-400')  // good stress
    expect(ratingTextClass(3, 'higher')).toBe('text-yellow-400')
    expect(ratingTextClass(3, 'lower')).toBe('text-yellow-400')
    expect(ratingTextClass(1, 'higher')).toBe('text-red-400')   // bad sleep/energy
    expect(ratingTextClass(5, 'lower')).toBe('text-red-400')    // bad stress
  })

  it('sleep and energy read the same as stress for the same goodness', () => {
    // "good" is green for all three regardless of direction
    expect(ratingTextClass(5, 'higher')).toBe(ratingTextClass(1, 'lower'))
    // "bad" is red for all three
    expect(ratingTextClass(1, 'higher')).toBe(ratingTextClass(5, 'lower'))
  })

  it('background classes follow the same scale', () => {
    expect(ratingBgClass(4, 'higher')).toBe('bg-green-600 text-white')
    expect(ratingBgClass(3, 'higher')).toBe('bg-yellow-600 text-white')
    expect(ratingBgClass(1, 'higher')).toBe('bg-red-600 text-white')
    expect(ratingBgClass(2, 'lower')).toBe('bg-green-600 text-white')
  })
})
