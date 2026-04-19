import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import './App.css'
import { fetchCampaigns } from './lib/campaigns'
import type {
  EarnCampaign,
  ScopeFilter,
  SortMode,
  TierDetail,
} from './types'

const scopeOptions: Array<{ value: ScopeFilter; label: string }> = [
  { value: 'cex', label: 'CEX' },
  { value: 'defi', label: 'DeFi' },
  { value: 'all', label: '全部' },
]

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'apy', label: '按 APY' },
  { value: 'latest', label: '按更新时间' },
  { value: 'platform', label: '按平台' },
]

const protocolLabels: Record<string, string> = {
  binance: 'Binance',
  bitget: 'Bitget',
  bybit: 'Bybit',
  gate: 'Gate',
  htx: 'HTX',
  mexc: 'MEXC',
  okx: 'OKX',
  osl: 'OSL',
  edgeX: 'edgeX',
  pharos: 'Pharos',
  'world-liberty-financial': 'WLFI',
}

const protocolAccents: Record<string, string> = {
  binance: '#d79911',
  bitget: '#00a1c8',
  bybit: '#eeae43',
  gate: '#3256dd',
  htx: '#1b55cf',
  mexc: '#16744d',
  okx: '#1c2333',
  osl: '#87b820',
  edgeX: '#8148e5',
  pharos: '#8f54ff',
  'world-liberty-financial': '#914928',
}

const entryPointLabels: Record<string, string> = {
  exchange_api: '官方 API',
  main_site: '主站',
  wallet: '钱包',
  launchpool: 'Launchpool',
  dex: 'DEX',
}

const productTypeLabels: Record<string, string> = {
  balance_treasure: '余额宝',
  earn_campaign: '活动',
  flexible_earn: '活期',
  fixed_term: '定期',
  onchain_earn: '链上赚币',
  savings: 'Savings',
  simple_earn: '保本赚币',
  staking: '质押',
  defi_staking: 'DeFi 质押',
}

const rewardTypeLabels: Record<string, string> = {
  airdrop: '空投',
  fixed: '固定',
  hybrid: '混合',
  tiered: '阶梯',
  vip: 'VIP',
}

const stableKeywords = [
  'usd',
  'usdt',
  'usdc',
  'usde',
  'usdd',
  'usds',
  'fdusd',
  'dai',
  'frax',
  'pyusd',
  'gusd',
  'susd',
  'rlusd',
  'usd1',
  'usat',
  'usdgo',
  'eusd',
  'busd',
  'tusd',
  'lusd',
  'usdx',
]

function isEnabled(flag: number | boolean | null | undefined) {
  return flag === 1 || flag === true
}

function matchesScope(campaign: EarnCampaign, scope: ScopeFilter) {
  if (scope === 'all') {
    return true
  }

  return scope === 'cex' ? isEnabled(campaign.is_cex) : isOnchainProduct(campaign)
}

function isOnchainProduct(campaign: EarnCampaign) {
  return (
    campaign.product_type === 'onchain_earn' ||
    campaign.product_type === 'defi_staking'
  )
}

function parseCampaignDate(value: string | null) {
  if (!value) {
    return null
  }

  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const utcDate = new Date(`${iso}Z`)

  if (!Number.isNaN(utcDate.getTime())) {
    return utcDate
  }

  const localDate = new Date(iso)
  return Number.isNaN(localDate.getTime()) ? null : localDate
}

function formatPercent(value: number | null) {
  if (value == null) {
    return '—'
  }

  return `${(value * 100).toFixed(2)}%`
}

function formatCurrencyAmount(value: number | null) {
  if (value == null) {
    return '无上限'
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`
  }

  return `$${value.toFixed(value < 10 ? 2 : 0)}`
}

function formatDateTime(value: string | null) {
  const parsed = parseCampaignDate(value)

  if (!parsed) {
    return '长期开放'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function formatMoney(value: number | null) {
  if (value == null) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value)
}

function getDaysRemaining(value: string | null) {
  const parsed = parseCampaignDate(value)

  if (!parsed) {
    return null
  }

  return Math.ceil((parsed.getTime() - Date.now()) / 86_400_000)
}

function comparisonDays(campaign: EarnCampaign) {
  if (campaign.lock_days != null && campaign.lock_days > 0) {
    return campaign.lock_days
  }

  const daysRemaining = getDaysRemaining(campaign.end_date)

  if (daysRemaining != null && daysRemaining > 0) {
    return daysRemaining
  }

  return 30
}

function projectedEarnings(campaign: EarnCampaign, principal = 10_000) {
  if (campaign.campaign_apy == null) {
    return null
  }

  return principal * campaign.campaign_apy * (comparisonDays(campaign) / 365)
}

function projectionLabel(campaign: EarnCampaign) {
  const days = comparisonDays(campaign)

  return days === 30 ? '1wU 30天估算' : `1wU ${days}天估算`
}

function humanizeProtocol(protocol: string) {
  if (protocolLabels[protocol]) {
    return protocolLabels[protocol]
  }

  return protocol
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function humanizeEntryPoint(entryPoint: string | null) {
  if (!entryPoint) {
    return '直达'
  }

  return entryPointLabels[entryPoint] ?? entryPoint
}

function humanizeProductType(productType: string | null) {
  if (!productType) {
    return null
  }

  return productTypeLabels[productType] ?? productType.replaceAll('_', ' ')
}

function humanizeRewardType(rewardType: string | null) {
  if (!rewardType) {
    return null
  }

  return rewardTypeLabels[rewardType] ?? rewardType.replaceAll('_', ' ')
}

function compactAssetMark(assetSymbol: string) {
  const base = (assetSymbol.split(/[_-]/)[0] || assetSymbol).replace(/[^a-zA-Z]/g, '')
  return (base || assetSymbol).slice(0, 2).toUpperCase()
}

function isStablecoinRelated(campaign: EarnCampaign) {
  const text = [
    campaign.asset_symbol,
    campaign.campaign_name,
    campaign.reward_asset,
    campaign.peg_mechanism,
    campaign.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return stableKeywords.some((keyword) => text.includes(keyword))
}

function isCampaignType(campaign: EarnCampaign) {
  if (campaign.end_date) {
    return true
  }

  if (campaign.product_type === 'earn_campaign') {
    return true
  }

  if (campaign.pool_status === 'announcement') {
    return true
  }

  if (campaign.reward_type === 'airdrop') {
    return true
  }

  return false
}

function tierRangeLabel(tier: TierDetail) {
  const lower = tier.min ?? 0

  if (tier.max == null) {
    return `${formatCurrencyAmount(lower)}+`
  }

  return `${formatCurrencyAmount(lower)}-${formatCurrencyAmount(tier.max)}`
}

function tierSummary(tiers: TierDetail[] | null) {
  if (!tiers?.length) {
    return null
  }

  return tiers
    .slice(0, 2)
    .map((tier) => `${formatPercent(tier.apy)} / ${tierRangeLabel(tier)}`)
    .join(' · ')
}

function latestUpdatedAt(campaigns: EarnCampaign[]) {
  let latestTimestamp = 0

  for (const campaign of campaigns) {
    const parsed = parseCampaignDate(campaign.updated_at)

    if (parsed && parsed.getTime() > latestTimestamp) {
      latestTimestamp = parsed.getTime()
    }
  }

  return latestTimestamp ? new Date(latestTimestamp) : null
}

function campaignTheme(protocol: string) {
  const accent = protocolAccents[protocol] ?? '#3158d6'

  return {
    '--protocol-accent': accent,
    '--protocol-accent-soft': `${accent}15`,
    '--protocol-accent-line': `${accent}38`,
  } as CSSProperties
}

function searchText(campaign: EarnCampaign) {
  return [
    campaign.asset_symbol,
    campaign.campaign_name,
    campaign.protocol_uid,
    campaign.product_type,
    campaign.reward_type,
    campaign.notes,
    campaign.reward_distribution_date,
    campaign.peg_mechanism,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function productTerm(campaign: EarnCampaign) {
  if (campaign.lock_days != null) {
    return campaign.lock_days === 0 ? '活期' : `${campaign.lock_days} 天锁定`
  }

  if (campaign.reward_period_days != null) {
    return `${campaign.reward_period_days} 天周期`
  }

  if (campaign.end_date) {
    return '限时窗口'
  }

  return '长期'
}

function sortCampaigns(campaigns: EarnCampaign[], sortMode: SortMode) {
  const next = [...campaigns]

  next.sort((left, right) => {
    const activeDelta = Number(isEnabled(right.is_active)) - Number(isEnabled(left.is_active))

    if (activeDelta !== 0) {
      return activeDelta
    }

    if (sortMode === 'apy') {
      return (right.campaign_apy ?? -1) - (left.campaign_apy ?? -1)
    }

    if (sortMode === 'latest') {
      return (
        (parseCampaignDate(right.updated_at)?.getTime() ?? 0) -
        (parseCampaignDate(left.updated_at)?.getTime() ?? 0)
      )
    }

    return humanizeProtocol(left.protocol_uid).localeCompare(
      humanizeProtocol(right.protocol_uid),
      'zh-CN',
    )
  })

  return next
}

type AppVariant = 'overview' | 'onchain'

interface AppProps {
  variant?: AppVariant
}

function App({ variant = 'overview' }: AppProps) {
  const isOnchainView = variant === 'onchain'
  const [campaigns, setCampaigns] = useState<EarnCampaign[]>([])
  const [scope, setScope] = useState<ScopeFilter>(isOnchainView ? 'defi' : 'cex')
  const [sortMode, setSortMode] = useState<SortMode>('apy')
  const [venue, setVenue] = useState('all')
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [stableOnly, setStableOnly] = useState(!isOnchainView)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)

  const deferredSearch = useDeferredValue(search)

  async function loadCampaigns() {
    setLoading(true)
    setError(null)

    try {
      const feed = await fetchCampaigns()
      setCampaigns(feed.campaigns)
      setFetchedAt(new Date(feed.generatedAt))
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : '未知错误，请稍后重试',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCampaigns()
  }, [])

  const activeScope: ScopeFilter = isOnchainView ? 'defi' : scope
  const comparableCampaigns = campaigns.filter((campaign) => !isCampaignType(campaign))

  const scopedCampaigns = comparableCampaigns.filter((campaign) =>
    matchesScope(campaign, activeScope),
  )
  const venueOptions = [...new Set(scopedCampaigns.map((campaign) => campaign.protocol_uid))]
  const safeVenue = venue !== 'all' && !venueOptions.includes(venue) ? 'all' : venue
  const normalizedQuery = deferredSearch.trim().toLowerCase()

  const filteredCampaigns = scopedCampaigns.filter((campaign) => {
    if (activeOnly && !isEnabled(campaign.is_active)) {
      return false
    }

    if (stableOnly && !isStablecoinRelated(campaign)) {
      return false
    }

    if (safeVenue !== 'all' && campaign.protocol_uid !== safeVenue) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    return searchText(campaign).includes(normalizedQuery)
  })

  const visibleCampaigns = sortCampaigns(filteredCampaigns, sortMode)
  const activeScopedCampaigns = scopedCampaigns.filter((campaign) =>
    isEnabled(campaign.is_active),
  )
  const strongestCampaign = sortCampaigns(activeScopedCampaigns, 'apy')[0] ?? null
  const snapshotAt = latestUpdatedAt(campaigns) ?? fetchedAt
  const endingSoonCount = activeScopedCampaigns.filter((campaign) => {
    const daysRemaining = getDaysRemaining(campaign.end_date)
    return daysRemaining != null && daysRemaining >= 0 && daysRemaining <= 7
  }).length
  const pageTitle = isOnchainView ? 'DeFi 产品' : '全部 Earn 产品'
  const heroLede = isOnchainView
    ? `当前收录 ${scopedCampaigns.length} 个由交易所标记为链上或 DeFi 的产品，覆盖 ${venueOptions.length} 个平台，单独查看收益、期限和规则。`
    : `当前收录 ${scopedCampaigns.length} 个 earn 产品，覆盖 ${venueOptions.length} 个平台，可按年化、期限和平台横向比较。`
  const listTitle = isOnchainView ? 'DeFi 产品' : '产品清单'
  const emptyTitle = isOnchainView ? '没有符合条件的 DeFi 产品' : '没有符合条件的产品'
  const emptyCopy = isOnchainView
    ? '试试放宽稳定币筛选，或者搜索协议名、币种和奖励币。'
    : '试试切换范围、放宽平台筛选，或者搜索更短的关键词。'
  const searchPlaceholder = isOnchainView
    ? '搜协议、币种、备注、奖励规则…'
    : '搜币种、平台、备注、派息规则…'

  return (
    <main className="page-shell">
      <header className="masthead">
        <div className="masthead-topline">
          <h1>{pageTitle}</h1>
          <button
            className="refresh-button"
            onClick={() => {
              void (async () => {
                setLoading(true)
                setError(null)
                try {
                  const feed = await fetchCampaigns({ refresh: true })
                  setCampaigns(feed.campaigns)
                  setFetchedAt(new Date(feed.generatedAt))
                } catch (loadError) {
                  setError(
                    loadError instanceof Error ? loadError.message : '未知错误，请稍后重试',
                  )
                } finally {
                  setLoading(false)
                }
              })()
            }}
            disabled={loading}
            type="button"
          >
            {loading ? '刷新中…' : '刷新数据'}
          </button>
        </div>

        <div className="hero-copy">
          <p className="hero-lede">{heroLede}</p>
        </div>

        <div className="summary-strip">
          <article className="summary-chip summary-chip-primary">
            <span>最高 APY</span>
            <strong>
              {strongestCampaign ? formatPercent(strongestCampaign.campaign_apy) : '—'}
            </strong>
            <em>
              {strongestCampaign
                ? `${humanizeProtocol(strongestCampaign.protocol_uid)} · ${strongestCampaign.asset_symbol}`
                : '等待数据'}
            </em>
          </article>

          <article className="summary-chip">
            <span>产品总数</span>
            <strong>{scopedCampaigns.length}</strong>
            <em>覆盖 {venueOptions.length} 个平台</em>
          </article>

          <article className="summary-chip">
            <span>7 天内到期</span>
            <strong>{endingSoonCount}</strong>
            <em>{endingSoonCount > 0 ? '需要关注' : '暂无紧迫'}</em>
          </article>
        </div>

      </header>

      <section className="toolbar">
        <div className="toolbar-row">
          {!isOnchainView ? (
            <div className="segmented-control" aria-label="范围筛选">
              {scopeOptions.map((option) => (
                <button
                  key={option.value}
                  className={option.value === activeScope ? 'is-active' : undefined}
                  onClick={() => {
                    startTransition(() => {
                      setScope(option.value)
                    })
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          <label className="toggle-line">
            <input
              checked={activeOnly}
              onChange={(event) => {
                startTransition(() => {
                  setActiveOnly(event.target.checked)
                })
              }}
              type="checkbox"
            />
            <span>仅看进行中</span>
          </label>

          <label className="toggle-line">
            <input
              checked={stableOnly}
              onChange={(event) => {
                startTransition(() => {
                  setStableOnly(event.target.checked)
                })
              }}
              type="checkbox"
            />
            <span>仅看稳定币相关</span>
          </label>
        </div>

        <div className="toolbar-grid">
          <label className="field">
            <span>平台</span>
            <select
              onChange={(event) => {
                startTransition(() => {
                  setVenue(event.target.value)
                })
              }}
              value={safeVenue}
            >
              <option value="all">全部平台</option>
              {venueOptions
                .sort((left, right) =>
                  humanizeProtocol(left).localeCompare(humanizeProtocol(right), 'zh-CN'),
                )
                .map((option) => (
                  <option key={option} value={option}>
                    {humanizeProtocol(option)}
                  </option>
                ))}
            </select>
          </label>

          <label className="field">
            <span>排序</span>
            <select
              onChange={(event) => {
                startTransition(() => {
                  setSortMode(event.target.value as SortMode)
                })
              }}
              value={sortMode}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field search-field">
            <span>搜索</span>
            <input
              onChange={(event) => {
                startTransition(() => {
                  setSearch(event.target.value)
                })
              }}
              placeholder={searchPlaceholder}
              type="search"
              value={search}
            />
          </label>
        </div>
      </section>

      <section className="list-shell">
        <div className="list-header">
          <div>
            <p className="list-title">{listTitle}</p>
            <p className="list-subtitle">
              显示 {visibleCampaigns.length} 条，
              {stableOnly ? '默认稳定币相关' : '包含全部资产'}，
              {activeOnly ? '已过滤已结束活动' : '包含历史结束活动'}
            </p>
          </div>

          <div className="feed-meta">
            <span>数据快照</span>
            <strong>{snapshotAt ? formatDateTime(snapshotAt.toISOString()) : '尚未拉取'}</strong>
          </div>
        </div>

        <div className="table-head" aria-hidden="true">
          <span>产品</span>
          <span>实时年化</span>
          <span>标签与规则</span>
          <span>操作</span>
        </div>

        {error && !campaigns.length ? (
          <div className="empty-state">
            <p className="empty-title">接口暂时不可用</p>
            <p className="empty-copy">{error}</p>
            <button
              className="refresh-button"
              onClick={() => {
                void loadCampaigns()
              }}
              type="button"
            >
              重试
            </button>
          </div>
        ) : null}

        {loading && !campaigns.length ? (
          <div className="campaign-list">
            {[0, 1, 2].map((item) => (
              <div className="skeleton-card" key={item}>
                <div className="skeleton-strip" />
                <div className="skeleton-body">
                  <div className="skeleton-line short" />
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line long" />
                </div>
                <div className="skeleton-side">
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && !error && !visibleCampaigns.length ? (
          <div className="empty-state">
            <p className="empty-title">{emptyTitle}</p>
            <p className="empty-copy">{emptyCopy}</p>
          </div>
        ) : null}

        {visibleCampaigns.length ? (
          <div className="campaign-list">
            {visibleCampaigns.map((campaign) => {
              const tags = [
                isEnabled(campaign.trending) ? '热门' : null,
                isEnabled(campaign.is_new) ? '新上' : null,
                humanizeProductType(campaign.product_type),
                humanizeRewardType(campaign.reward_type),
                campaign.redemption_days != null && campaign.redemption_days > 0
                  ? `${campaign.redemption_days} 天赎回`
                  : null,
                campaign.reward_asset ? `奖励 ${campaign.reward_asset}` : null,
              ].filter(Boolean)
              const metaFacts = [
                campaign.max_amount != null
                  ? `额度 ${formatCurrencyAmount(campaign.max_amount)}`
                  : null,
                campaign.reward_distribution_date
                  ? `派息 ${campaign.reward_distribution_date}`
                  : null,
                campaign.updated_at
                  ? `更新 ${formatDateTime(campaign.updated_at)}`
                  : null,
              ].filter(Boolean)

              return (
                <article
                  className="campaign-card"
                  key={`${campaign.id}-${campaign.protocol_uid}-${campaign.asset_symbol}`}
                  style={campaignTheme(campaign.protocol_uid)}
                >
                  <div className="campaign-column activity-column">
                    <div className="activity-lockup">
                      <div className="asset-chip" title={campaign.asset_symbol}>
                        {compactAssetMark(campaign.asset_symbol)}
                      </div>

                      <div className="activity-copy">
                        <h2>{campaign.campaign_name}</h2>
                        <p className="card-subtitle">
                          {humanizeProtocol(campaign.protocol_uid)} · {humanizeEntryPoint(campaign.entry_point)}
                        </p>
                        <p className="activity-support">
                          {campaign.peg_mechanism ?? humanizeProductType(campaign.product_type) ?? '未标注产品类型'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="campaign-column apy-column">
                    <strong className="apy-value">{formatPercent(campaign.campaign_apy)}</strong>
                    <p className="apy-support">
                      {projectionLabel(campaign)} {formatMoney(projectedEarnings(campaign))}
                    </p>
                    <p className="apy-support">
                      期限 {productTerm(campaign)} · 最低 {formatCurrencyAmount(campaign.min_amount)}
                    </p>
                  </div>

                  <div className="campaign-column tags-column">
                    {tags.length ? (
                      <div className="card-tags">
                        {tags.map((tag) => (
                          <span className="tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {metaFacts.length ? (
                      <div className="fact-inline">
                        {metaFacts.map((fact) => (
                          <span className="fact-chip" key={fact}>
                            {fact}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {tierSummary(campaign.tier_details) ? (
                      <p className="fact-note">阶梯 {tierSummary(campaign.tier_details)}</p>
                    ) : null}
                    {campaign.notes ? (
                      <p className="fact-note">{campaign.notes}</p>
                    ) : null}
                  </div>

                  <div className="campaign-column action-column">
                    <div className="link-row">
                      {campaign.earn_url ? (
                        <a
                          className="inline-link"
                          href={campaign.earn_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          官方 Earn
                        </a>
                      ) : null}

                      {campaign.announcement_url ? (
                        <a
                          className="inline-link"
                          href={campaign.announcement_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          公告
                        </a>
                      ) : null}

                      {campaign.tutorial_url ? (
                        <a
                          className="inline-link"
                          href={campaign.tutorial_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          教程
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
