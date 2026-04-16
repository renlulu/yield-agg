import type { PrivateApiCredentials } from '../config.js'
import type { EarnCampaign, ExchangeResult } from '../types.js'
import {
  daysFromPeriod,
  hmacBase64,
  isoNow,
  toFloat,
} from '../utils.js'

const BASE_URL = 'https://www.okx.com'
const BROWSER_HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Referer: 'https://www.okx.com/earn',
}

interface OkxOffer {
  ccy: string
  productId: string
  protocol: string
  protocolType: string
  term: string
  apy: string
  earlyRedeem: boolean
  state: string
  investData?: Array<{ maxAmt: string; minAmt: string }>
  earningData?: Array<{ ccy: string }>
  redeemPeriod?: string[]
}

interface OkxResponse {
  code: string
  msg: string
  data?: OkxOffer[]
}

interface SimpleEarnProduct {
  activityPeriodEndDate: string | null
  bonusCurrency: string | null
  bonusDescription: string | null
  campaignUid: string
  interestCurrency: { currencyId: number; currencyName: string }
  labels: number[]
  lockUpPeriod: number
  productsType: number
  purchaseStatus: number
  rate: {
    rateNum: { value: string[]; type: string }
    rateType: string
  }
  savingType: number
  term: { type: string; value: number }
  type: number
}

interface SimpleEarnCurrency {
  investCurrency: {
    currencyId: number
    currencyName: string
    currencyIcon: string
  }
  labels: number[]
  products: SimpleEarnProduct[]
}

interface SimpleEarnResponse {
  code: number
  data: {
    allProducts: { currencies: SimpleEarnCurrency[] }
    flexibleProducts: { currencies: SimpleEarnCurrency[] }
    fixedProducts: { currencies: SimpleEarnCurrency[] }
  }
}

interface OnchainEarnProduct {
  investCurrency: string
  unit: string
  productsType: number
  protocol: { category: string; name: string }
  rate: {
    rate: { value: string[]; type: string }
    rateType: string
  }
  bonusRate: { rate: { value: string[] } } | null
  isLimitedOffer: boolean
  startTime: string | null
  endTime: string | null
  labels: number[]
  subscribable: boolean
  term: { type: string; value: number }
  maxStakingAmount: string | null
  minStakingAmount: string | null
  redeemDays: number | null
  subsidyRewardCampaign: unknown
}

interface OnchainEarnCampaign {
  campaignName: string
  apy: string
  ccy: string
  endTime: string
  startTime: string
}

interface OnchainEarnResponse {
  code: number
  data: {
    all: OnchainEarnProduct[]
    earnCampaigns: OnchainEarnCampaign[]
    airdropCampaign: unknown
  }
}

function signOkx(
  credentials: PrivateApiCredentials,
  method: string,
  path: string,
  timestamp: string,
) {
  return hmacBase64(
    credentials.apiSecret,
    `${timestamp}${method.toUpperCase()}${path}`,
  )
}

function normalizeOffer(offer: OkxOffer): EarnCampaign {
  const firstInvest = offer.investData?.[0]
  const firstRedeemPeriod = offer.redeemPeriod?.[0]

  return {
    id: `okx:staking-defi:${offer.productId}`,
    protocol_uid: 'okx',
    is_cex: false,
    asset_symbol: offer.ccy,
    campaign_name: `${offer.protocol} ${offer.ccy}`,
    campaign_apy: toFloat(offer.apy),
    base_apy: toFloat(offer.apy),
    reward_apy: null,
    reward_type: 'fixed',
    reward_asset: offer.earningData?.[0]?.ccy ?? offer.ccy,
    lock_days: daysFromPeriod(offer.term),
    tier_1_threshold: null,
    tier_1_apy: null,
    tier_2_apy: null,
    tier_details: null,
    min_amount: toFloat(firstInvest?.minAmt),
    max_amount: toFloat(firstInvest?.maxAmt),
    reward_period_days: null,
    earn_url: 'https://www.okx.com/earn',
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: offer.protocol,
    reward_distribution_date: 'exchange defined',
    redemption_days: daysFromPeriod(firstRedeemPeriod),
    service_fee_pct: null,
    pool_status: offer.state,
    peg_mechanism: null,
    entry_point: 'exchange_api',
    product_type: 'onchain_earn',
    start_date: null,
    end_date: null,
    is_active: offer.state === 'purchasable',
    trending: false,
    is_new: false,
    is_new_user_only: false,
    notes: offer.earlyRedeem ? 'Supports early redeem' : null,
    updated_at: isoNow(),
  }
}

function parseApyPercent(value: string): number | null {
  const n = toFloat(value)
  return n != null ? n / 100 : null
}

function productTypeName(t: number): string {
  switch (t) {
    case 1:
      return 'simple_earn_flexible'
    case 3:
    case 4:
    case 64:
    case 66:
      return 'simple_earn_fixed'
    case 28:
      return 'flash_deals'
    case 102:
      return 'earn_campaign'
    default:
      return 'simple_earn'
  }
}

function normalizeSimpleEarnProduct(
  ccy: SimpleEarnCurrency,
  product: SimpleEarnProduct,
): EarnCampaign {
  const symbol = ccy.investCurrency.currencyName
  const rateValues = product.rate.rateNum.value
  const maxRate = Math.max(...rateValues.map((v) => Number(v) || 0))
  const apy = parseApyPercent(String(maxRate))
  const isNewUserOnly = product.labels.includes(3)
  const termDays = product.term.value > 0 ? product.term.value : null
  const pType = productTypeName(product.productsType)

  let name = `OKX Simple Earn ${symbol}`
  if (termDays && termDays > 1) name += ` ${termDays}D`
  if (isNewUserOnly) name += ' (Bonus)'

  return {
    id: `okx:simple-earn:${symbol}:${product.productsType}:${product.type}`,
    protocol_uid: 'okx',
    is_cex: true,
    asset_symbol: symbol,
    campaign_name: name,
    campaign_apy: apy,
    base_apy: apy,
    reward_apy: null,
    reward_type: termDays ? 'fixed' : 'flexible',
    reward_asset: product.interestCurrency?.currencyName ?? symbol,
    lock_days: termDays,
    tier_1_threshold: null,
    tier_1_apy: null,
    tier_2_apy: null,
    tier_details: null,
    min_amount: null,
    max_amount: null,
    reward_period_days: null,
    earn_url: 'https://www.okx.com/earn',
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: 'okx',
    reward_distribution_date: 'daily',
    redemption_days: termDays ? termDays : 0,
    service_fee_pct: null,
    pool_status: product.purchaseStatus === 1 ? 'purchasable' : 'soldout',
    peg_mechanism: null,
    entry_point: 'public_api',
    product_type: pType,
    start_date: null,
    end_date: product.activityPeriodEndDate ?? null,
    is_active: product.purchaseStatus === 1,
    trending: false,
    is_new: false,
    is_new_user_only: isNewUserOnly,
    notes: product.bonusDescription ?? null,
    updated_at: isoNow(),
  }
}

function normalizeOnchainProduct(product: OnchainEarnProduct): EarnCampaign {
  const symbol = product.unit
  const rateValues = product.rate.rate.value
  const maxRate = Math.max(...rateValues.map((v) => Number(v) || 0))
  const apy = parseApyPercent(String(maxRate))
  const proto = product.protocol

  return {
    id: `okx:onchain:${symbol}:${product.productsType}:${proto.name}`,
    protocol_uid: 'okx',
    is_cex: false,
    asset_symbol: symbol,
    campaign_name: `${proto.name} ${symbol}`,
    campaign_apy: apy,
    base_apy: apy,
    reward_apy: null,
    reward_type: 'fixed',
    reward_asset: symbol,
    lock_days: product.term?.value > 0 ? product.term.value : null,
    tier_1_threshold: null,
    tier_1_apy: null,
    tier_2_apy: null,
    tier_details: null,
    min_amount: toFloat(product.minStakingAmount),
    max_amount: toFloat(product.maxStakingAmount),
    reward_period_days: null,
    earn_url: 'https://www.okx.com/earn',
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: proto.name,
    reward_distribution_date: 'exchange defined',
    redemption_days: product.redeemDays,
    service_fee_pct: null,
    pool_status: product.subscribable ? 'purchasable' : 'soldout',
    peg_mechanism: null,
    entry_point: 'public_api',
    product_type: product.isLimitedOffer ? 'earn_campaign' : 'onchain_earn',
    start_date: product.startTime
      ? new Date(Number(product.startTime)).toISOString()
      : null,
    end_date: product.endTime
      ? new Date(Number(product.endTime)).toISOString()
      : null,
    is_active: product.subscribable,
    trending: product.isLimitedOffer,
    is_new: false,
    is_new_user_only: false,
    notes: null,
    updated_at: isoNow(),
  }
}

function normalizeEarnCampaign(c: OnchainEarnCampaign): EarnCampaign {
  const apy = parseApyPercent(c.apy)

  return {
    id: `okx:campaign:${c.ccy}:${c.campaignName}`,
    protocol_uid: 'okx',
    is_cex: true,
    asset_symbol: c.ccy,
    campaign_name: c.campaignName,
    campaign_apy: apy,
    base_apy: apy,
    reward_apy: null,
    reward_type: 'fixed',
    reward_asset: c.ccy,
    lock_days: null,
    tier_1_threshold: null,
    tier_1_apy: null,
    tier_2_apy: null,
    tier_details: null,
    min_amount: null,
    max_amount: null,
    reward_period_days: null,
    earn_url: 'https://www.okx.com/earn',
    announcement_url: null,
    tutorial_url: null,
    reward_provider_protocol_uid: 'okx',
    reward_distribution_date: 'exchange defined',
    redemption_days: null,
    service_fee_pct: null,
    pool_status: 'purchasable',
    peg_mechanism: null,
    entry_point: 'public_api',
    product_type: 'earn_campaign',
    start_date: c.startTime
      ? new Date(Number(c.startTime)).toISOString()
      : null,
    end_date: c.endTime ? new Date(Number(c.endTime)).toISOString() : null,
    is_active: true,
    trending: true,
    is_new: true,
    is_new_user_only: false,
    notes: null,
    updated_at: isoNow(),
  }
}

async function fetchSimpleEarnProducts(): Promise<EarnCampaign[]> {
  const response = await fetch(
    `${BASE_URL}/priapi/v1/earn/simple-earn/all-products`,
    { headers: BROWSER_HEADERS },
  )

  if (!response.ok) return []

  const payload = (await response.json()) as SimpleEarnResponse
  if (payload.code !== 0) return []

  const campaigns: EarnCampaign[] = []
  const seen = new Set<string>()

  const currencies =
    payload.data?.flexibleProducts?.currencies ??
    payload.data?.allProducts?.currencies ??
    []

  for (const ccy of currencies) {
    for (const product of ccy.products ?? []) {
      const c = normalizeSimpleEarnProduct(ccy, product)
      if (!seen.has(c.id)) {
        seen.add(c.id)
        campaigns.push(c)
      }
    }
  }

  const fixedCurrencies = payload.data?.fixedProducts?.currencies ?? []
  for (const ccy of fixedCurrencies) {
    for (const product of ccy.products ?? []) {
      const c = normalizeSimpleEarnProduct(ccy, product)
      if (!seen.has(c.id)) {
        seen.add(c.id)
        campaigns.push(c)
      }
    }
  }

  return campaigns
}

async function fetchOnchainEarnProducts(): Promise<EarnCampaign[]> {
  const response = await fetch(
    `${BASE_URL}/priapi/v1/earn/onchain-earn/all-products`,
    { headers: BROWSER_HEADERS },
  )

  if (!response.ok) return []

  const payload = (await response.json()) as OnchainEarnResponse
  if (payload.code !== 0) return []

  const campaigns: EarnCampaign[] = []

  for (const product of payload.data?.all ?? []) {
    campaigns.push(normalizeOnchainProduct(product))
  }

  for (const ec of payload.data?.earnCampaigns ?? []) {
    campaigns.push(normalizeEarnCampaign(ec))
  }

  return campaigns
}

async function fetchAuthenticatedOffers(
  credentials: PrivateApiCredentials,
): Promise<EarnCampaign[]> {
  const path = '/api/v5/finance/staking-defi/offers'
  const timestamp = new Date().toISOString()
  const signature = signOkx(credentials, 'GET', path, timestamp)

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'OK-ACCESS-KEY': credentials.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': credentials.passphrase!,
      Accept: 'application/json',
    },
  })

  if (!response.ok) return []

  const payload = (await response.json()) as OkxResponse
  if (payload.code !== '0') return []

  return (payload.data ?? []).map(normalizeOffer)
}

export async function fetchOkxCampaigns(
  credentials: PrivateApiCredentials | null,
): Promise<ExchangeResult> {
  const [simpleEarn, onchainEarn] = await Promise.all([
    fetchSimpleEarnProducts().catch(() => [] as EarnCampaign[]),
    fetchOnchainEarnProducts().catch(() => [] as EarnCampaign[]),
  ])

  let authOffers: EarnCampaign[] = []
  if (credentials?.passphrase) {
    authOffers = await fetchAuthenticatedOffers(credentials).catch(() => [])
  }

  const allCampaigns = [...simpleEarn, ...onchainEarn, ...authOffers]

  if (allCampaigns.length === 0) {
    return {
      source: {
        id: 'okx',
        label: 'OKX',
        state: 'needs_credentials',
        auth: 'public',
        message: 'OKX 内部 Earn 接口不可用。',
        itemCount: 0,
      },
      campaigns: [],
    }
  }

  const authLabel = credentials?.passphrase
    ? '公开内部接口 + 官方私有接口'
    : '公开内部接口（无需 API Key）'

  return {
    source: {
      id: 'okx',
      label: 'OKX',
      state: 'live',
      auth: credentials?.passphrase ? 'private' : 'public',
      message: `Simple Earn + On-chain Earn，${authLabel}。`,
      itemCount: allCampaigns.length,
    },
    campaigns: allCampaigns,
  }
}
