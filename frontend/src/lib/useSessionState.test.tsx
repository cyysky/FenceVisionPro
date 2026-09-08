import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSessionState } from './useSessionState';

describe('useSessionState', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('starts with the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useSessionState('wizard.yard', 'FRONT'));
    expect(result.current[0]).toBe('FRONT');
  });

  it('hydrates from sessionStorage when a value exists', () => {
    sessionStorage.setItem('wizard.yard', JSON.stringify('BACK'));
    const { result } = renderHook(() => useSessionState('wizard.yard', 'FRONT'));
    expect(result.current[0]).toBe('BACK');
  });

  it('falls back to the initial value when the stored JSON is corrupt', () => {
    sessionStorage.setItem('wizard.yard', '{not json');
    const { result } = renderHook(() => useSessionState('wizard.yard', 'FRONT'));
    expect(result.current[0]).toBe('FRONT');
  });

  it('persists updates to sessionStorage', () => {
    const { result } = renderHook(() => useSessionState<{ style: string }>('wizard.style', { style: 'Picket' }));
    act(() => result.current[1]({ style: 'Privacy' }));
    expect(JSON.parse(sessionStorage.getItem('wizard.style')!)).toEqual({ style: 'Privacy' });
    expect(result.current[0]).toEqual({ style: 'Privacy' });
  });

  it('clear resets the value and re-persists the initial state', () => {
    const { result } = renderHook(() => useSessionState('wizard.name', 'Ada'));
    act(() => result.current[1]('Bob'));
    expect(sessionStorage.getItem('wizard.name')).toBe(JSON.stringify('Bob'));
    act(() => result.current[2]());
    expect(result.current[0]).toBe('Ada');
    // The effect persists the initial value, so a fresh mount in the
    // same tab hydrates to the initial state too.
    expect(JSON.parse(sessionStorage.getItem('wizard.name')!)).toBe('Ada');
  });
});
