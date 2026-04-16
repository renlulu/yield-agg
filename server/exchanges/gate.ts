import type { EarnCampaign, ExchangeResult, TierDetail } from '../types.js'
import {
  isoNow,
  ratioFromMaybePercent,
  safeJsonParse,
  toFloat,
} from '../utils.js'

const BASE_URL = 'https://api.gateio.ws/api/v4'

interface GateUniCurrency {
  currency: string
  min_lend_amount: string
  max_lend_amount: string
}

interface GateUniRate {
  currency: string
  est_rate: string
}

interface GateFixedTermProduct {
  id: number
  name: string
  asset: string
  lock_up_period: number
  min_lend_amount: string
  user_max_lend_volume: string
  year_rate: string
  type: number
  status: number
  sale_status: number
  tag_info: string
  coupon_info: unknown
  bonus_info: unknown
  bonus_boost_info: unknown
  price: string
  update_time: string
}

interface GateFixedTermResponse {
  code: number
  message: string
  data?: {
    list?: GateFixedTermProduct[]
  }
}

interface GateStakingProduct {
  pid: number
  productType: number
  isDefi: number
  currency: string
  estimateApr: string
  minStakeAmount: string
  maxStakeAmount: number
  protocolName: string
  redeemPeriod: number
  currencyRewards?: Array<{
    apr: string
    reward_coin: string
  }>
  extraInterest?: Array<{
    reward_coin: string
    segment_interest?: Array<{
      money_min: string
      money_max: string
      money_rate: string
    }>
  }>
}

async function getJson<T>(path: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

function normalizeUni(
  currency: GateUniCurrency,
  rateMap: Map<string, GateUniRate>,
): EarnCampaign {
  const rate = rateMap.get(currency.currency)
  const now = isoNow()

  return {
    id: `gate:uni:${currency.currency}`,
    protocol_uid: 'gate',
    is_cex: true,
    asset_symbol: currency.currency,
    campaign_name: currency.currency,
    campaign_apy: rate ? toFloat(rate.est_rate) : null,
    base_apy: rate ? toFloat(rate.est_rate) : null,
    reward_apy: null,
    reward_type: 'fixed',
    reward_asset: currency.currency,
    lock_days: null,
    tier_1_threshold: null,
    tier_1_apy: null,
    tier_2_apy: null,
    tier_details: null,
    min_amount: toFloat(currency.min_lend_amount),
    max_amount: toFloat(currency.max_lend_amount),
    reward_period_days: null,
    earn_url: 'https://www.gate.com/simple-earn',
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: null,
    reward_distribution_date: 'variable',
    redemption_days: null,
    service_fee_pct: null,
    pool_status: 'available',
    peg_mechanism: null,
    entry_point: 'exchange_api',
    product_type: 'flexible_earn',
    start_date: null,
    end_date: null,
    is_active: true,
    trending: false,
    is_new: false,
    is_new_user_only: false,
    notes: 'Gate Uni Lending',
    updated_at: now,
  }
}

function normalizeFixedTerm(product: GateFixedTermProduct): EarnCampaign {
  const tagInfo = safeJsonParse<{
    data?: {
      en?: {
        dialog_title?: string
        dialog_content?: string
      }
      zh?: {
        dialog_title?: string
        dialog_content?: string
      }
    }
  }>(product.tag_info)

  const note =
    tagInfo?.data?.en?.dialog_content ||
    tagInfo?.data?.zh?.dialog_content ||
    null

  return {
    id: `gate:fixed:${product.id}`,
    protocol_uid: 'gate',
    is_cex: true,
    asset_symbol: product.asset,
    campaign_name: product.name,
    campaign_apy: toFloat(product.year_rate),
    base_apy: toFloat(product.year_rate),
    reward_apy: null,
    reward_type: product.type === 2 ? 'vip' : 'fixed',
    reward_asset: product.asset,
    lock_days: product.lock_up_period,
    tier_1_threshold: null,
    tier_1_apy: null,
    tier_2_apy: null,
    tier_details: null,
    min_amount: toFloat(product.min_lend_amount),
    max_amount: toFloat(product.user_max_lend_volume),
    reward_period_days: product.lock_up_period,
    earn_url: 'https://www.gate.com/simple-earn',
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: null,
    reward_distribution_date: 'at maturity',
    redemption_days: product.lock_up_period,
    service_fee_pct: null,
    pool_status: `${product.status}/${product.sale_status}`,
    peg_mechanism: null,
    entry_point: 'exchange_api',
    product_type: 'fixed_term',
    start_date: null,
    end_date: null,
    is_active: product.sale_status === 1,
    trending: false,
    is_new: false,
    is_new_user_only: false,
    notes: note,
    updated_at: product.update_time || isoNow(),
  }
}

function extractExtraTiers(
  extraInterest: GateStakingProduct['extraInterest'],
): TierDetail[] | null {
  const segments = extraInterest?.flatMap((interest) =>
    (interest.segment_interest ?? []).map((segment) => ({
      apy: ratioFromMaybePercent(segment.money_rate),
      min: toFloat(segment.money_min),
      max: toFloat(segment.money_max),
    })),
  )

  return segments?.length ? segments : null
}

function normalizeStaking(product: GateStakingProduct): EarnCampaign {
  const rewardAsset =
    product.currencyRewards?.[0]?.reward_coin || product.currency || null

  return {
    id: `gate:staking:${product.pid}`,
    protocol_uid: 'gate',
    is_cex: false,
    asset_symbol: product.currency,
    campaign_name: `${product.protocolName} ${product.currency}`,
    campaign_apy: ratioFromPercentNumberString(product.estimateApr),
    base_apy: ratioFromPercentNumberString(product.currencyRewards?.[0]?.apr),
    reward_apy: null,
    reward_type: product.extraInterest?.length ? 'tiered' : 'fixed',
    reward_asset: rewardAsset,
    lock_days: null,
    tier_1_threshold: null,
    tier_1_apy: null,
    tier_2_apy: null,
    tier_details: extractExtraTiers(product.extraInterest),
    min_amount: toFloat(product.minStakeAmount),
    max_amount: product.maxStakeAmount === -1 ? null : toFloat(product.maxStakeAmount),
    reward_period_days: null,
    earn_url: `https://www.gate.com/staking/${product.currency}`,
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: product.protocolName,
    reward_distribution_date: 'daily',
    redemption_days: product.redeemPeriod || null,
    service_fee_pct: null,
    pool_status: 'available',
    peg_mechanism: null,
    entry_point: 'exchange_api',
    product_type: product.isDefi ? 'defi_staking' : 'staking',
    start_date: null,
    end_date: null,
    is_active: true,
    trending: false,
    is_new: false,
    is_new_user_only: false,
    notes: product.protocolName,
    updated_at: isoNow(),
  }
}

function ratioFromPercentNumberString(value: unknown) {
  const parsed = toFloat(value)

  if (parsed == null) {
    return null
  }

  return parsed / 100
}

export async function fetchGateCampaigns(): Promise<ExchangeResult> {
  const [currencies, rates, fixedTerm, staking] = await Promise.all([
    getJson<GateUniCurrency[]>('/earn/uni/currencies'),
    getJson<GateUniRate[]>('/earn/uni/rate'),
    getJson<GateFixedTermResponse>('/earn/fixed-term/product?page=1&limit=100'),
    getJson<GateStakingProduct[]>('/earn/staking/coins'),
  ])

  const rateMap = new Map(rates.map((entry) => [entry.currency, entry]))
  const campaigns = [
    ...currencies.map((entry) => normalizeUni(entry, rateMap)),
    ...(fixedTerm.data?.list ?? []).map(normalizeFixedTerm),
    ...staking.map(normalizeStaking),
  ]

  return {
    source: {
      id: 'gate',
      label: 'Gate',
      state: 'live',
      auth: 'public',
      message: '官方 Earn API，公开可读。',
      itemCount: campaigns.length,
    },
    campaigns,
  }
}
