// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useOnboarding } from '../../src/pages/Onboarding/useOnboarding'
import StepAiSetup from '../../src/pages/Onboarding/steps/StepAiSetup'

afterEach(() => cleanup())

describe('useOnboarding — AI setup step', () => {
  it('exposes a 7-step flow (AI setup prepended before the original 6)', () => {
    const { result } = renderHook(() => useOnboarding())
    expect(result.current.totalSteps).toBe(7)
    expect(result.current.step).toBe(1)
  })

  it('apiKey defaults empty and is settable without touching profile data', () => {
    const { result } = renderHook(() => useOnboarding())
    expect(result.current.apiKey).toBe('')
    act(() => result.current.setApiKey('sk-ant-abc123'))
    expect(result.current.apiKey).toBe('sk-ant-abc123')
    // profile defaults untouched by the key
    expect(result.current.data.goal).toBe('cut')
  })
})

describe('StepAiSetup', () => {
  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = { openExternal: vi.fn() }
  })

  it('shows rule-based status when no key entered', () => {
    render(<StepAiSetup apiKey="" setApiKey={() => {}} />)
    expect(screen.getByText(/Rule-based plan generation/i)).toBeTruthy()
  })

  it('shows AI-tailored status once a key is present', () => {
    render(<StepAiSetup apiKey="sk-ant-xyz" setApiKey={() => {}} />)
    expect(screen.getByText(/AI-tailored plan generation/i)).toBeTruthy()
  })

  it('calls setApiKey as the user types', () => {
    const setApiKey = vi.fn()
    render(<StepAiSetup apiKey="" setApiKey={setApiKey} />)
    const input = screen.getByPlaceholderText(/sk-ant-/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'sk-ant-new' } })
    expect(setApiKey).toHaveBeenCalledWith('sk-ant-new')
  })
})
