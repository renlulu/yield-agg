export interface PrivateApiCredentials {
  apiKey: string
  apiSecret: string
  passphrase?: string
}

export interface AppConfig {
  port: number
  feedSyncIntervalMs: number
  snapshotPath: string
  binance: PrivateApiCredentials | null
  bitget: PrivateApiCredentials | null
  okx: PrivateApiCredentials | null
}

function readPrivateCredentials(prefix: string, withPassphrase = false) {
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim()
  const apiSecret = process.env[`${prefix}_API_SECRET`]?.trim()
  const passphrase = process.env[`${prefix}_PASSPHRASE`]?.trim()

  if (!apiKey || !apiSecret) {
    return null
  }

  if (withPassphrase && !passphrase) {
    return null
  }

  return {
    apiKey,
    apiSecret,
    passphrase,
  }
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    feedSyncIntervalMs: Number(process.env.FEED_SYNC_INTERVAL_MS ?? 300000),
    snapshotPath: process.env.FEED_SNAPSHOT_PATH?.trim() || 'runtime/earn-feed.json',
    binance: readPrivateCredentials('BINANCE'),
    bitget: readPrivateCredentials('BITGET', true),
    okx: readPrivateCredentials('OKX', true),
  }
}
