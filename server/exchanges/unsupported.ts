import type { ExchangeResult } from '../types.js'

export function unsupportedExchange(
  id: string,
  label: string,
  message: string,
): ExchangeResult {
  return {
    source: {
      id,
      label,
      state: 'unsupported',
      auth: 'unsupported',
      message,
      itemCount: 0,
    },
    campaigns: [],
  }
}
