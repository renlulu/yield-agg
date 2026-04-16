import type { PrivateApiCredentials } from '../config.js'
import type { EarnCampaign, ExchangeResult } from '../types.js'
import { hmacHex, isoNow, toFloat } from '../utils.js'

const BASE_URL = 'https://api.binance.com'
const SITE_BASE_URL = 'https://www.binance.com'
const ANNOUNCEMENT_CATALOG_ID = 93
const ANNOUNCEMENT_PAGES_TO_SCAN = 12
const ANNOUNCEMENT_CACHE_TTL_MS = 15 * 60 * 1000

let announcementCache:
  | {
      campaigns: EarnCampaign[]
      expiresAt: number
    }
  | null = null

interface BinanceFlexibleProduct {
  asset: string
  latestAnnualPercentageRate: string
  tierAnnualPercentageRate?: Record<string, number>
  airDropPercentageRate?: string
  canPurchase?: boolean
  canRedeem?: boolean
  isSoldOut?: boolean
  hot?: boolean
  minPurchaseAmount?: string
  productId: string
  subscriptionStartTime?: number
  status?: string
}

interface BinanceResponse {
  rows?: BinanceFlexibleProduct[]
}

interface BinanceAnnouncementListItem {
  code: string
  title: string | null
}

interface BinanceAnnouncementListResponse {
  code: string
  data?: {
    articles?: BinanceAnnouncementListItem[]
  }
}

interface BinanceAnnouncementDetail {
  code: string
  title: string
  body: string
  publishDate: number
  lastUpdateTime?: number
}

interface BinanceAnnouncementDetailResponse {
  code: string
  data?: BinanceAnnouncementDetail
}

function normalizeTimestamp(value: string | null) {
  if (!value) {
    return null
  }

  return value.replace(' ', 'T') + ':00.000Z'
}

function announcementDetailUrl(code: string) {
  return `${SITE_BASE_URL}/en/support/announcement/detail/${code}`
}

function extractRichText(node: unknown): string {
  if (Array.isArray(node)) {
    return node.map(extractRichText).join('')
  }

  if (node && typeof node === 'object') {
    const record = node as { node?: string; text?: string; child?: unknown[] }

    if (record.node === 'text') {
      return record.text ?? ''
    }

    return extractRichText(record.child ?? [])
  }

  return ''
}

function plainTextFromAnnouncementBody(body: string) {
  try {
    const parsed = JSON.parse(body)
    return extractRichText(parsed).replace(/\s+/g, ' ').trim()
  } catch {
    return body.replace(/\s+/g, ' ').trim()
  }
}

function parsePeriod(text: string) {
  const match = text.match(
    /(?:Promotion|Campaign) Period:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?::\d{2})?\s*\(UTC\)\s*(?:-|to)\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?::\d{2})?\s*\(UTC\)/i,
  )

  if (!match) {
    return { startDate: null, endDate: null }
  }

  return {
    startDate: normalizeTimestamp(match[1]),
    endDate: normalizeTimestamp(match[2]),
  }
}

function parseRewardAsset(title: string, text: string) {
  const wlfi = text.match(/\b(WLFI)\b/i)

  if (wlfi) {
    return wlfi[1].toUpperCase()
  }

  const shareToken = title.match(/Share .*?\b([A-Z0-9]{2,12})\b(?:\s+Token)?/i)

  return shareToken ? shareToken[1].toUpperCase() : null
}

function parseDistribution(text: string) {
  if (/every Friday/i.test(text)) {
    return '每周五'
  }

  if (/daily basis/i.test(text) || /on a daily basis/i.test(text)) {
    return '每日派息'
  }

  if (/every minute/i.test(text)) {
    return '每分钟累积'
  }

  if (/weekly airdrops/i.test(text) || /weekly rewards/i.test(text)) {
    return '每周派息'
  }

  return null
}

function parseAnnouncementApy(title: string, text: string) {
  const upTo = title.match(/up to\s+(\d+(?:\.\d+)?)%\s*APR/i)

  if (upTo) {
    return Number(upTo[1]) / 100
  }

  const rewardRows = [
    ...text.matchAll(
      /Reward Period:\s*(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s+\(UTC\)\s+to\s+(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s+\(UTC\)\s*(\d+(?:\.\d+)?)%\s*(\d+(?:\.\d+)?)%/gi,
    ),
  ].map((match) => ({
    start: Date.parse(`${match[1]}T00:00:00Z`),
    end: Date.parse(`${match[2]}T00:00:00Z`),
    baseApr: Number(match[3]),
    boostedApr: Number(match[4]),
  }))

  const now = Date.now()
  const activeRow = rewardRows.find((row) => now >= row.start && now < row.end)

  if (activeRow) {
    return activeRow.boostedApr / 100
  }

  if (rewardRows.length) {
    return rewardRows[rewardRows.length - 1].boostedApr / 100
  }

  return null
}

function parseAnnouncementType(title: string, text: string) {
  if (/airdrop/i.test(text) || /share .* tokens?/i.test(title)) {
    return 'airdrop'
  }

  if (/bonus tiered apr/i.test(text)) {
    return 'tiered'
  }

  return 'fixed'
}

function parseAssetFromTitle(title: string) {
  const earnFlexible = title.match(/with\s+([A-Z0-9]{2,12})\s+Flexible Products/i)

  if (earnFlexible) {
    return earnFlexible[1].toUpperCase()
  }

  const holdAsset = title.match(/Hold\s+([A-Z0-9]{2,12})\s+in Binance/i)

  if (holdAsset) {
    return holdAsset[1].toUpperCase()
  }

  return null
}

function maybeAnnouncementCampaign(
  detail: BinanceAnnouncementDetail,
  productByAsset: Map<string, BinanceFlexibleProduct>,
): EarnCampaign | null {
  const plainText = plainTextFromAnnouncementBody(detail.body)
  const asset = parseAssetFromTitle(detail.title)

  if (!asset) {
    return null
  }

  const relatedProduct = productByAsset.get(asset)
  const { startDate, endDate } = parsePeriod(plainText)
  const rewardAsset = parseRewardAsset(detail.title, plainText)
  const now = Date.now()
  const endTime = endDate ? new Date(endDate).getTime() : null
  const apy = parseAnnouncementApy(detail.title, plainText)

  return {
    id: `binance:announcement:${detail.code}`,
    protocol_uid: 'binance',
    is_cex: true,
    asset_symbol: asset,
    campaign_name: asset,
    campaign_apy: apy,
    base_apy: relatedProduct
      ? toFloat(relatedProduct.latestAnnualPercentageRate)
      : null,
    reward_apy: null,
    reward_type: parseAnnouncementType(detail.title, plainText),
    reward_asset: rewardAsset,
    lock_days: null,
    tier_1_threshold: null,
    tier_1_apy: null,
    tier_2_apy: null,
    tier_details: null,
    min_amount: relatedProduct ? toFloat(relatedProduct.minPurchaseAmount) : null,
    max_amount: null,
    reward_period_days: null,
    earn_url: `${SITE_BASE_URL}/en/earn/${asset.toLowerCase()}`,
    announcement_url: announcementDetailUrl(detail.code),
    tutorial_url: null,
    reward_provider_protocol_uid: rewardAsset,
    reward_distribution_date: parseDistribution(plainText),
    redemption_days: null,
    service_fee_pct: null,
    pool_status: 'announcement',
    peg_mechanism: null,
    entry_point: 'main_site',
    product_type: 'earn_campaign',
    start_date: startDate,
    end_date: endDate,
    is_active: endTime ? endTime > now : true,
    trending: true,
    is_new: false,
    is_new_user_only: false,
    notes: detail.title,
    updated_at: new Date(detail.lastUpdateTime ?? detail.publishDate).toISOString(),
  }
}

async function fetchAnnouncementListPage(pageNo: number) {
  const url = new URL(
    '/bapi/composite/v1/public/cms/article/catalog/list/query',
    SITE_BASE_URL,
  )
  url.searchParams.set('catalogId', String(ANNOUNCEMENT_CATALOG_ID))
  url.searchParams.set('pageNo', String(pageNo))
  url.searchParams.set('pageSize', '20')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Announcement list HTTP ${response.status}`)
  }

  const payload = (await response.json()) as BinanceAnnouncementListResponse

  if (payload.code !== '000000') {
    throw new Error('Unexpected Binance announcement list response')
  }

  return payload.data?.articles ?? []
}

async function fetchAnnouncementDetail(articleCode: string) {
  const url = new URL(
    '/bapi/composite/v1/public/cms/article/detail/query',
    SITE_BASE_URL,
  )
  url.searchParams.set('articleCode', articleCode)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Announcement detail HTTP ${response.status}`)
  }

  const payload = (await response.json()) as BinanceAnnouncementDetailResponse

  if (payload.code !== '000000' || !payload.data) {
    throw new Error('Unexpected Binance announcement detail response')
  }

  return payload.data
}

async function fetchBinanceAnnouncementCampaigns(
  products: BinanceFlexibleProduct[],
): Promise<EarnCampaign[]> {
  if (announcementCache && announcementCache.expiresAt > Date.now()) {
    return announcementCache.campaigns
  }

  const pages = await Promise.all(
    Array.from({ length: ANNOUNCEMENT_PAGES_TO_SCAN }, (_item, index) =>
      fetchAnnouncementListPage(index + 1),
    ),
  )

  const productAssets = new Set(products.map((product) => product.asset))
  const candidates = pages
    .flat()
    .filter((article) => {
      const title = article.title ?? ''

      if (!title) {
        return false
      }

      if (!/Binance Earn|Booster Program|Hold .* in Binance/i.test(title)) {
        return false
      }

      return [...productAssets].some((asset) => title.includes(asset))
    })
    .slice(0, 40)

  const productByAsset = new Map(products.map((product) => [product.asset, product]))
  const details = await Promise.all(
    candidates.map((article) => fetchAnnouncementDetail(article.code)),
  )

  const campaigns = details
    .map((detail) => maybeAnnouncementCampaign(detail, productByAsset))
    .filter((campaign): campaign is EarnCampaign => campaign !== null)

  announcementCache = {
    campaigns,
    expiresAt: Date.now() + ANNOUNCEMENT_CACHE_TTL_MS,
  }

  return campaigns
}

function normalizeRows(rows: BinanceFlexibleProduct[]): EarnCampaign[] {
  const now = isoNow()

  return rows.map((product) => {
    const tiers = product.tierAnnualPercentageRate
      ? Object.entries(product.tierAnnualPercentageRate).map(([range, apy]) => {
          const match = range.match(/([\d.]+)-([\d.]+)/)
          return {
            apy: toFloat(apy),
            min: match ? Number(match[1]) : null,
            max: match ? Number(match[2]) : null,
          }
        })
      : null

    return {
      id: `binance:flexible:${product.productId}`,
      protocol_uid: 'binance',
      is_cex: true,
      asset_symbol: product.asset,
      campaign_name: product.asset,
      campaign_apy: toFloat(product.latestAnnualPercentageRate),
      base_apy: toFloat(product.latestAnnualPercentageRate),
      reward_apy: toFloat(product.airDropPercentageRate),
      reward_type: tiers?.length ? 'tiered' : 'fixed',
      reward_asset: product.asset,
      lock_days: null,
      tier_1_threshold: tiers?.[0]?.max ?? null,
      tier_1_apy: tiers?.[0]?.apy ?? null,
      tier_2_apy: tiers?.[1]?.apy ?? null,
      tier_details: tiers,
      min_amount: toFloat(product.minPurchaseAmount),
      max_amount: null,
      reward_period_days: null,
      earn_url: `https://www.binance.com/en/earn/${product.asset.toLowerCase()}`,
      announcement_url: null,
      tutorial_url: null,
      reward_provider_protocol_uid: null,
      reward_distribution_date: 'exchange defined',
      redemption_days: null,
      service_fee_pct: null,
      pool_status: product.status ?? null,
      peg_mechanism: null,
      entry_point: 'exchange_api',
      product_type: 'simple_earn',
      start_date:
        product.subscriptionStartTime != null
          ? new Date(product.subscriptionStartTime).toISOString()
          : null,
      end_date: null,
      is_active: product.status === 'PURCHASING',
      trending: Boolean(product.hot),
      is_new: false,
      is_new_user_only: false,
      notes: product.isSoldOut ? 'Sold out' : null,
      updated_at: now,
    }
  })
}

export async function fetchBinanceCampaigns(
  credentials: PrivateApiCredentials | null,
): Promise<ExchangeResult> {
  if (!credentials) {
    return {
      source: {
        id: 'binance',
        label: 'Binance',
        state: 'needs_credentials',
        auth: 'private',
        message: '官方 Simple Earn 接口需要 API Key 和签名。',
        itemCount: 0,
      },
      campaigns: [],
    }
  }

  const timestamp = Date.now()
  const params = new URLSearchParams({
    current: '1',
    size: '100',
    timestamp: String(timestamp),
  })
  const signature = hmacHex(credentials.apiSecret, params.toString())
  params.set('signature', signature)

  const response = await fetch(
    `${BASE_URL}/sapi/v1/simple-earn/flexible/list?${params.toString()}`,
    {
      headers: {
        'X-MBX-APIKEY': credentials.apiKey,
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = (await response.json()) as BinanceResponse
  const rows = payload.rows ?? []
  const baseCampaigns = normalizeRows(rows)
  let announcementCampaigns: EarnCampaign[] = []
  let sourceMessage = '官方 Simple Earn 私有接口。'

  try {
    announcementCampaigns = await fetchBinanceAnnouncementCampaigns(rows)
    if (announcementCampaigns.length) {
      sourceMessage = '官方 Simple Earn 私有接口 + Binance 公告站官方活动接口。'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'announcement unavailable'
    sourceMessage = `官方 Simple Earn 私有接口；公告活动层暂不可用（${message}）。`
  }

  const campaigns = [...announcementCampaigns, ...baseCampaigns]

  return {
    source: {
      id: 'binance',
      label: 'Binance',
      state: 'live',
      auth: 'private',
      message: sourceMessage,
      itemCount: campaigns.length,
    },
    campaigns,
  }
}
