export interface PrivateApiCredentials {
  apiKey: string
  apiSecret: string
  passphrase?: string
}

export interface AppConfig {
  port: number
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
    binance: readPrivateCredentials('BINANCE'),
    bitget: readPrivateCredentials('BITGET', true),
    okx: readPrivateCredentials('OKX', true),
  }
}
