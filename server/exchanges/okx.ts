import type { PrivateApiCredentials } from '../config.js'
import type { EarnCampaign, ExchangeResult } from '../types.js'
import {
  daysFromPeriod,
  hmacBase64,
  isoNow,
  toFloat,
} from '../utils.js'

const BASE_URL = 'https://www.okx.com'

interface OkxOffer {
  ccy: string
  productId: string
  protocol: string
  protocolType: string
  term: string
  apy: string
  earlyRedeem: boolean
  state: string
  investData?: Array<{
    maxAmt: string
    minAmt: string
  }>
  earningData?: Array<{
    ccy: string
  }>
  redeemPeriod?: string[]
}

interface OkxResponse {
  code: string
  msg: string
  data?: OkxOffer[]
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

export async function fetchOkxCampaigns(
  credentials: PrivateApiCredentials | null,
): Promise<ExchangeResult> {
  if (!credentials?.passphrase) {
    return {
      source: {
        id: 'okx',
        label: 'OKX',
        state: 'needs_credentials',
        auth: 'private',
        message: '官方 On-chain Earn 接口需要 OKX API Key / Secret / Passphrase。',
        itemCount: 0,
      },
      campaigns: [],
    }
  }

  const path = '/api/v5/finance/staking-defi/offers'
  const timestamp = new Date().toISOString()
  const signature = signOkx(credentials, 'GET', path, timestamp)

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'OK-ACCESS-KEY': credentials.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': credentials.passphrase,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = (await response.json()) as OkxResponse

  if (payload.code !== '0') {
    throw new Error(payload.msg || 'Unexpected OKX response')
  }

  const campaigns = (payload.data ?? []).map(normalizeOffer)

  return {
    source: {
      id: 'okx',
      label: 'OKX',
      state: 'live',
      auth: 'private',
      message: '官方 On-chain Earn 私有接口。',
      itemCount: campaigns.length,
    },
    campaigns,
  }
}
