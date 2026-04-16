import type { AppConfig } from './config.js'
import type { ExchangeResult } from './types.js'
import { fetchBinanceCampaigns } from './exchanges/binance.js'
import { fetchBitgetCampaigns } from './exchanges/bitget.js'
import { fetchBybitCampaigns } from './exchanges/bybit.js'
import { fetchGateCampaigns } from './exchanges/gate.js'
import { fetchOkxCampaigns } from './exchanges/okx.js'
import { unsupportedExchange } from './exchanges/unsupported.js'

function asErrorResult(
  fallback: ExchangeResult,
  error: unknown,
): ExchangeResult {
  const message = error instanceof Error ? error.message : 'Unknown error'

  return {
    source: {
      ...fallback.source,
      state: 'error',
      message,
    },
    campaigns: [],
  }
}

export async function buildEarnFeed(config: AppConfig) {
  const tasks: Array<Promise<ExchangeResult>> = [
    fetchBybitCampaigns().catch((error: unknown) =>
      asErrorResult(
        unsupportedExchange('bybit', 'Bybit', 'Bybit adapter failed.'),
        error,
      ),
    ),
    fetchGateCampaigns().catch((error: unknown) =>
      asErrorResult(
        unsupportedExchange('gate', 'Gate', 'Gate adapter failed.'),
        error,
      ),
    ),
    fetchBinanceCampaigns(config.binance).catch((error: unknown) =>
      asErrorResult(
        unsupportedExchange('binance', 'Binance', 'Binance adapter failed.'),
        error,
      ),
    ),
    fetchBitgetCampaigns(config.bitget).catch((error: unknown) =>
      asErrorResult(
        unsupportedExchange('bitget', 'Bitget', 'Bitget adapter failed.'),
        error,
      ),
    ),
    fetchOkxCampaigns(config.okx).catch((error: unknown) =>
      asErrorResult(
        unsupportedExchange('okx', 'OKX', 'OKX adapter failed.'),
        error,
      ),
    ),
    Promise.resolve(
      unsupportedExchange(
        'mexc',
        'MEXC',
        '公开官方文档未提供可直接列 earn 产品的接口，当前未接入。',
      ),
    ),
    Promise.resolve(
      unsupportedExchange(
        'htx',
        'HTX',
        '公开官方文档未提供可直接列 earn 产品的接口，当前未接入。',
      ),
    ),
    Promise.resolve(
      unsupportedExchange(
        'osl',
        'OSL',
        '公开官方文档偏交易/经纪 API，未找到 earn 产品接口。',
      ),
    ),
  ]

  const results = await Promise.all(tasks)

  return {
    generatedAt: new Date().toISOString(),
    campaigns: results.flatMap((result: ExchangeResult) => result.campaigns),
    sources: results.map((result: ExchangeResult) => result.source),
  }
}
