// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWaterLog } from '../../src/components/widgets/useWaterLog'

const TODAY = new Date().toLocaleDateString('en-CA')

describe('useWaterLog', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 0 ml and the metric target', () => {
    const { result } = renderHook(() => useWaterLog('metric'))
    expect(result.current.waterMl).toBe(0)
    expect(result.current.waterTargetMl).toBe(3000)
  })

  it('addWater accumulates and persists per-day', () => {
    const { result } = renderHook(() => useWaterLog('metric'))
    act(() => result.current.addWater(500))
    expect(result.current.waterMl).toBe(500)
    expect(localStorage.getItem(`water_ml_${TODAY}`)).toBe('500')
  })

  it('addWater never goes below zero', () => {
    const { result } = renderHook(() => useWaterLog('metric'))
    act(() => result.current.addWater(-999))
    expect(result.current.waterMl).toBe(0)
  })

  it('setTarget persists the global target', () => {
    const { result } = renderHook(() => useWaterLog('metric'))
    act(() => result.current.setTarget(3500))
    expect(result.current.waterTargetMl).toBe(3500)
    expect(localStorage.getItem('water_target_ml')).toBe('3500')
  })
})
