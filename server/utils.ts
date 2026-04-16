import crypto from 'node:crypto'

export function toFloat(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function ratioFromPercentText(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.replace('%', '').trim()
  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed / 100 : null
}

export function ratioFromPercentNumber(value: unknown) {
  const parsed = toFloat(value)

  if (parsed == null) {
    return null
  }

  return parsed / 100
}

export function ratioFromMaybePercent(value: unknown) {
  const parsed = toFloat(value)

  if (parsed == null) {
    return null
  }

  return parsed > 1 ? parsed / 100 : parsed
}

export function hmacHex(secret: string, payload: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export function hmacBase64(secret: string, payload: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64')
}

export function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function daysFromPeriod(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const match = value.match(/(\d+)/)

  return match ? Number(match[1]) : null
}

export function minutesToHumanInterval(value: number | null | undefined) {
  if (!value) {
    return null
  }

  if (value % 1440 === 0) {
    const days = value / 1440
    return days === 1 ? 'daily' : `every ${days} days`
  }

  if (value % 60 === 0) {
    const hours = value / 60
    return hours === 1 ? 'hourly' : `every ${hours} hours`
  }

  return `every ${value} minutes`
}

export function isoNow() {
  return new Date().toISOString()
}
