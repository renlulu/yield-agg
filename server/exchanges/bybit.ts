import type { EarnCampaign, ExchangeResult } from '../types.js'
import {
  isoNow,
  minutesToHumanInterval,
  ratioFromPercentText,
  toFloat,
} from '../utils.js'

const BASE_URL = 'https://api.bybit.com'
const CATEGORIES = ['FlexibleSaving', 'OnChain'] as const

interface BybitProduct {
  category: string
  estimateApr: string
  coin: string
  minStakeAmount: string
  maxStakeAmount: string
  productId: string
  status: string
  minRedeemAmount: string
  maxRedeemAmount: string
  duration: string
  term: number
  swapCoin: string
  rewardDistributionType: string
  rewardIntervalMinute: number
  redeemProcessingMinute: number
  hasTieredApr: boolean
  tierAprDetails: Array<{
    min: string
    max: string
    estimateApr: string
  }>
  remainingPoolAmount: string
}

interface BybitResponse {
  retCode: number
  retMsg: string
  result?: {
    list?: BybitProduct[]
  }
}

async function fetchCategory(category: (typeof CATEGORIES)[number]) {
  const url = new URL('/v5/earn/product', BASE_URL)
  url.searchParams.set('category', category)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = (await response.json()) as BybitResponse

  if (payload.retCode !== 0 || !payload.result?.list) {
    throw new Error(payload.retMsg || 'Unexpected Bybit response')
  }

  return payload.result.list
}

function normalizeProduct(product: BybitProduct): EarnCampaign {
  const now = isoNow()
  const campaignApy = ratioFromPercentText(product.estimateApr)
  const tierDetails = product.tierAprDetails?.length
    ? product.tierAprDetails.map((tier) => ({
        apy: ratioFromPercentText(tier.estimateApr),
        min: toFloat(tier.min),
        max: tier.max === '-1' ? null : toFloat(tier.max),
      }))
    : null

  return {
    id: `bybit:${product.category}:${product.productId}:${product.coin}`,
    protocol_uid: 'bybit',
    is_cex: product.category !== 'OnChain',
    asset_symbol: product.coin,
    campaign_name:
      product.category === 'OnChain'
        ? `${product.coin} ${product.swapCoin || product.category}`
        : product.coin,
    campaign_apy: campaignApy,
    base_apy: campaignApy,
    reward_apy: null,
    reward_type: product.hasTieredApr ? 'tiered' : 'fixed',
    reward_asset: product.swapCoin || null,
    lock_days: product.term > 0 ? product.term : null,
    tier_1_threshold: tierDetails?.[0]?.max ?? null,
    tier_1_apy: tierDetails?.[0]?.apy ?? null,
    tier_2_apy: tierDetails?.[1]?.apy ?? null,
    tier_details: tierDetails,
    min_amount: toFloat(product.minStakeAmount),
    max_amount:
      product.maxStakeAmount === '-1' ? null : toFloat(product.maxStakeAmount),
    reward_period_days: null,
    earn_url: `https://www.bybit.com/en/earn/${product.coin}`,
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: product.swapCoin || null,
    reward_distribution_date:
      (minutesToHumanInterval(product.rewardIntervalMinute) ??
        product.rewardDistributionType) ||
      null,
    redemption_days:
      product.redeemProcessingMinute > 0
        ? Math.ceil(product.redeemProcessingMinute / 1440)
        : null,
    service_fee_pct: null,
    pool_status: product.status,
    peg_mechanism: product.swapCoin
      ? `${product.coin}:${product.swapCoin}`
      : null,
    entry_point: 'exchange_api',
    product_type:
      product.category === 'OnChain' ? 'onchain_earn' : 'flexible_earn',
    start_date: null,
    end_date: null,
    is_active: product.status === 'Available',
    trending: false,
    is_new: false,
    is_new_user_only: false,
    notes:
      product.hasTieredApr && tierDetails?.length
        ? `Tiered APR, redeem minimum ${product.minRedeemAmount || 'n/a'}`
        : product.duration || null,
    updated_at: now,
  }
}

export async function fetchBybitCampaigns(): Promise<ExchangeResult> {
  const [flexible, onChain] = await Promise.all(
    CATEGORIES.map((category) => fetchCategory(category)),
  )

  const campaigns = [...flexible, ...onChain].map(normalizeProduct)

  return {
    source: {
      id: 'bybit',
      label: 'Bybit',
      state: 'live',
      auth: 'public',
      message: '官方 Earn 产品接口，公开可读。',
      itemCount: campaigns.length,
    },
    campaigns,
  }
}
