import type { PrivateApiCredentials } from '../config.js'
import type { EarnCampaign, ExchangeResult, TierDetail } from '../types.js'
import {
  hmacBase64,
  isoNow,
  ratioFromMaybePercent,
  toFloat,
} from '../utils.js'

const BASE_URL = 'https://api.bitget.com'

interface BitgetProduct {
  productId?: string
  id?: string
  coin?: string
  productName?: string
  periodType?: string
  period?: string | number
  status?: string
  minAmount?: string | number
  minSubscribeAmount?: string | number
  maxAmount?: string | number
  maxSubscribeAmount?: string | number
  apy?: string | number
  rate?: string | number
  currentApy?: string | number
  apyList?: Array<Record<string, unknown>>
  redeemType?: string
  supportRedeemType?: string
  redeemPeriod?: string | number
  interestType?: string
}

interface BitgetResponse {
  code: string
  msg: string
  data?: {
    productInfoList?: BitgetProduct[]
    list?: BitgetProduct[]
  }
}

function signBitget(
  credentials: PrivateApiCredentials,
  method: string,
  path: string,
  queryString: string,
  timestamp: string,
) {
  const requestPath = queryString ? `${path}?${queryString}` : path
  return hmacBase64(
    credentials.apiSecret,
    `${timestamp}${method.toUpperCase()}${requestPath}`,
  )
}

function normalizeTier(tier: Record<string, unknown>): TierDetail {
  return {
    apy: ratioFromMaybePercent(
      tier.apy ?? tier.rate ?? tier.currentApy ?? tier.annualRate,
    ),
    min: toFloat(tier.minAmount ?? tier.min ?? tier.lowerLimit),
    max: toFloat(tier.maxAmount ?? tier.max ?? tier.upperLimit),
  }
}

function normalizeProduct(product: BitgetProduct): EarnCampaign {
  const tiers = Array.isArray(product.apyList)
    ? product.apyList.map(normalizeTier)
    : null

  const campaignApy = ratioFromMaybePercent(
    product.apy ?? product.currentApy ?? product.rate,
  )

  return {
    id: `bitget:savings:${product.productId ?? product.id ?? product.coin ?? 'unknown'}`,
    protocol_uid: 'bitget',
    is_cex: true,
    asset_symbol: product.coin ?? 'UNKNOWN',
    campaign_name: product.productName ?? product.coin ?? 'Savings',
    campaign_apy: campaignApy,
    base_apy: campaignApy,
    reward_apy: null,
    reward_type: tiers?.length ? 'tiered' : 'fixed',
    reward_asset: product.coin ?? null,
    lock_days: toFloat(product.period),
    tier_1_threshold: tiers?.[0]?.max ?? null,
    tier_1_apy: tiers?.[0]?.apy ?? null,
    tier_2_apy: tiers?.[1]?.apy ?? null,
    tier_details: tiers,
    min_amount: toFloat(product.minAmount ?? product.minSubscribeAmount),
    max_amount: toFloat(product.maxAmount ?? product.maxSubscribeAmount),
    reward_period_days: null,
    earn_url: 'https://www.bitget.com/earning/savings',
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: null,
    reward_distribution_date: product.interestType ?? null,
    redemption_days: toFloat(product.redeemPeriod),
    service_fee_pct: null,
    pool_status: product.status ?? null,
    peg_mechanism: null,
    entry_point: 'exchange_api',
    product_type:
      product.periodType === 'flexible' ? 'flexible_earn' : 'savings',
    start_date: null,
    end_date: null,
    is_active: product.status === 'available' || product.status === 'in_progress',
    trending: false,
    is_new: false,
    is_new_user_only: false,
    notes: product.supportRedeemType ?? product.redeemType ?? null,
    updated_at: isoNow(),
  }
}

export async function fetchBitgetCampaigns(
  credentials: PrivateApiCredentials | null,
): Promise<ExchangeResult> {
  if (!credentials?.passphrase) {
    return {
      source: {
        id: 'bitget',
        label: 'Bitget',
        state: 'needs_credentials',
        auth: 'private',
        message: '官方 Savings 接口需要 ACCESS-KEY / SECRET / PASSPHRASE。',
        itemCount: 0,
      },
      campaigns: [],
    }
  }

  const path = '/api/v2/earn/savings/product'
  const params = new URLSearchParams({
    filter: 'available_and_held',
    pageNo: '1',
    pageSize: '100',
  })
  const timestamp = String(Date.now())
  const signature = signBitget(
    credentials,
    'GET',
    path,
    params.toString(),
    timestamp,
  )

  const response = await fetch(`${BASE_URL}${path}?${params.toString()}`, {
    headers: {
      'ACCESS-KEY': credentials.apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-PASSPHRASE': credentials.passphrase,
      'ACCESS-TIMESTAMP': timestamp,
      locale: 'en-US',
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = (await response.json()) as BitgetResponse

  if (payload.code !== '00000') {
    throw new Error(payload.msg || 'Unexpected Bitget response')
  }

  const list = payload.data?.productInfoList ?? payload.data?.list ?? []
  const campaigns = list.map(normalizeProduct)

  return {
    source: {
      id: 'bitget',
      label: 'Bitget',
      state: 'live',
      auth: 'private',
      message: '官方 Savings 私有接口。',
      itemCount: campaigns.length,
    },
    campaigns,
  }
}
