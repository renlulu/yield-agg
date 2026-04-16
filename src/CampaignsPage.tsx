import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react'
import type { CSSProperties } from 'react'
import './campaigns.css'
import { fetchCampaigns } from './lib/campaigns'
import type { EarnCampaign } from './types'

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

const protocolColors: Record<string, string> = {
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
  'rlusd',
  'usd1',
  'usat',
  'usdgo',
  'busd',
  'tusd',
  'lusd',
  'usdx',
]

function isStablecoinRelated(campaign: EarnCampaign) {
  const text = [
    campaign.asset_symbol,
    campaign.campaign_name,
    campaign.reward_asset,
    campaign.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return stableKeywords.some((keyword) => text.includes(keyword))
}

function compactAssetMark(assetSymbol: string) {
  const base = (assetSymbol.split(/[_-]/)[0] || assetSymbol).replace(/[^a-zA-Z]/g, '')
  return (base || assetSymbol).slice(0, 2).toUpperCase()
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

function parseDateUTC(value: string | null) {
  if (!value) {
    return null
  }

  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)

  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getDaysLeft(endDate: string | null) {
  const parsed = parseDateUTC(endDate)

  if (!parsed) {
    return null
  }

  return Math.ceil((parsed.getTime() - Date.now()) / 86_400_000)
}

function formatPct(value: number | null) {
  if (value == null) {
    return '—'
  }

  return `${(value * 100).toFixed(2)}%`
}

function formatDate(value: string | null) {
  const parsed = parseDateUTC(value)

  if (!parsed) {
    return null
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function projectedEarnings(campaign: EarnCampaign, principal = 10_000) {
  if (campaign.campaign_apy == null) {
    return null
  }

  const daysLeft = getDaysLeft(campaign.end_date)
  const period = daysLeft != null && daysLeft > 0 ? daysLeft : 30
  return principal * campaign.campaign_apy * (period / 365)
}

function timelineProgress(campaign: EarnCampaign) {
  const end = parseDateUTC(campaign.end_date)

  if (!end) {
    return null
  }

  const start = parseDateUTC(campaign.start_date)
  const now = Date.now()

  if (start && end.getTime() > start.getTime()) {
    const progress = (now - start.getTime()) / (end.getTime() - start.getTime())
    return Math.min(1, Math.max(0, progress))
  }

  const daysLeft = getDaysLeft(campaign.end_date)

  if (daysLeft == null) {
    return null
  }

  return Math.min(1, Math.max(0.05, 1 - daysLeft / 30))
}

function expiryTone(daysLeft: number | null) {
  if (daysLeft == null) {
    return ''
  }

  if (daysLeft <= 1) {
    return 'expiry-urgent'
  }

  if (daysLeft <= 3) {
    return 'expiry-soon'
  }

  return 'expiry-normal'
}

function formatCurrencyAmount(value: number | null) {
  if (value == null) {
    return null
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`
  }

  return `$${value.toFixed(value < 10 ? 2 : 0)}`
}

type SortKey = 'apy' | 'expiry'

function CampaignsPage() {
  const [all, setAll] = useState<EarnCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [venue, setVenue] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('apy')
  const [stableOnly, setStableOnly] = useState(true)
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    fetchCampaigns()
      .then((feed) => {
        setAll(feed.campaigns.filter(isCampaignType))
        setLoading(false)
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '加载失败')
        setLoading(false)
      })
  }, [])

  const activeCampaigns = all.filter((campaign) => {
    if (!campaign.is_active) {
      return false
    }

    const daysLeft = getDaysLeft(campaign.end_date)

    if (daysLeft != null && daysLeft < 0) {
      return false
    }

    return true
  })

  const venues = [...new Set(activeCampaigns.map((campaign) => campaign.protocol_uid))].sort()
  const normalizedQuery = deferredSearch.trim().toLowerCase()

  const filtered = activeCampaigns.filter((campaign) => {
    if (stableOnly && !isStablecoinRelated(campaign)) {
      return false
    }

    if (venue !== 'all' && campaign.protocol_uid !== venue) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    const text = [
      campaign.asset_symbol,
      campaign.campaign_name,
      campaign.protocol_uid,
      campaign.notes,
      campaign.reward_asset,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(normalizedQuery)
  })

  const sorted = [...filtered].sort((left, right) => {
    if (sort === 'apy') {
      return (right.campaign_apy ?? -1) - (left.campaign_apy ?? -1)
    }

    const leftDays = getDaysLeft(left.end_date)
    const rightDays = getDaysLeft(right.end_date)

    if (leftDays == null && rightDays == null) {
      return 0
    }

    if (leftDays == null) {
      return 1
    }

    if (rightDays == null) {
      return -1
    }

    return leftDays - rightDays
  })

  const highest = [...filtered].sort(
    (left, right) => (right.campaign_apy ?? -1) - (left.campaign_apy ?? -1),
  )[0]
  const soonCount = filtered.filter((campaign) => {
    const daysLeft = getDaysLeft(campaign.end_date)
    return daysLeft != null && daysLeft >= 0 && daysLeft <= 7
  }).length

  return (
    <div className="cp-page">
      <header className="cp-header">
        <div className="cp-header-copy">
          <h1>发现限时高息机会</h1>
          <p className="cp-subtitle">
            只看有截止日期的活动，按年化排序，到期前不错过。
          </p>
        </div>

        <div className="cp-summary">
          <div className="cp-stat cp-stat-primary">
            <span>最高年化</span>
            <strong>{highest ? formatPct(highest.campaign_apy) : '—'}</strong>
            <em>
              {highest
                ? `${protocolLabels[highest.protocol_uid] ?? highest.protocol_uid} · ${highest.asset_symbol}`
                : '暂无数据'}
            </em>
          </div>

          <div className="cp-stat">
            <span>进行中</span>
            <strong>{filtered.length}</strong>
            <em>
              {filtered.length > 0
                ? `覆盖 ${new Set(filtered.map((c) => c.protocol_uid)).size} 个平台`
                : '暂无活动'}
            </em>
          </div>

          <div className="cp-stat">
            <span>即将到期</span>
            <strong>{soonCount}</strong>
            <em>{soonCount > 0 ? '7 天内截止' : '暂无紧迫'}</em>
          </div>
        </div>
      </header>

      <section className="cp-toolbar">
        <div className="cp-toolbar-group">
          <label className="cp-toggle">
            <input
              checked={stableOnly}
              onChange={(event) =>
                startTransition(() => setStableOnly(event.target.checked))
              }
              type="checkbox"
            />
            <span>仅看稳定币</span>
          </label>
        </div>

        <div className="cp-toolbar-group cp-toolbar-controls">
          <select
            className="cp-select"
            onChange={(event) => startTransition(() => setVenue(event.target.value))}
            value={venue}
          >
            <option value="all">全部交易所</option>
            {venues.map((currentVenue) => (
              <option key={currentVenue} value={currentVenue}>
                {protocolLabels[currentVenue] ?? currentVenue}
              </option>
            ))}
          </select>

          <input
            className="cp-search"
            onChange={(event) => startTransition(() => setSearch(event.target.value))}
            placeholder="搜稳定币、交易所或奖励币…"
            type="search"
            value={search}
          />
        </div>
      </section>

      <section className="cp-board">
        <div className="cp-table-head" aria-hidden="true">
          <span>活动</span>
          <button
            className={`cp-th-sortable ${sort === 'apy' ? 'cp-th-active' : ''}`}
            onClick={() => setSort('apy')}
            type="button"
          >
            年化 {sort === 'apy' ? '↓' : '⇅'}
          </button>
          <span>标签</span>
          <button
            className={`cp-th-sortable ${sort === 'expiry' ? 'cp-th-active' : ''}`}
            onClick={() => setSort('expiry')}
            type="button"
          >
            到期时间 {sort === 'expiry' ? '↑' : '⇅'}
          </button>
          <span>操作</span>
        </div>

        {loading ? (
          <div className="cp-loading">
            {[0, 1, 2].map((item) => (
              <div className="cp-skeleton" key={item} />
            ))}
          </div>
        ) : null}

        {error ? <div className="cp-error">{error}</div> : null}

        {!loading && !error && !sorted.length ? (
          <div className="cp-empty">暂无符合条件的限时活动</div>
        ) : null}

        <div className="cp-list">
          {sorted.map((campaign) => {
            const daysLeft = getDaysLeft(campaign.end_date)
            const progress = timelineProgress(campaign)
            const earnings = projectedEarnings(campaign)
            const tone = expiryTone(daysLeft)
            const color = protocolColors[campaign.protocol_uid] ?? '#3456dc'
            const tags: string[] = []

            if (campaign.reward_type === 'airdrop') {
              tags.push('空投')
            }

            if (campaign.reward_distribution_date) {
              tags.push(campaign.reward_distribution_date)
            }

            if (
              campaign.reward_asset &&
              campaign.reward_asset !== campaign.asset_symbol
            ) {
              tags.push(`奖励 ${campaign.reward_asset}`)
            }

            const amount = formatCurrencyAmount(campaign.max_amount)
            if (amount) {
              tags.push(`额度 ${amount}`)
            }

            if (campaign.lock_days != null && campaign.lock_days > 0) {
              tags.push(`锁仓 ${campaign.lock_days} 天`)
            }

            if (campaign.redemption_days != null && campaign.redemption_days > 0) {
              tags.push(`赎回 ${campaign.redemption_days} 天`)
            }

            if (campaign.trending) {
              tags.push('热门')
            }

            return (
              <article
                className="cp-row"
                key={campaign.id}
                style={
                  {
                    '--row-accent': color,
                  } as CSSProperties
                }
              >
                <div className="cp-cell cp-cell-activity">
                  <div className="cp-token-mark" title={campaign.asset_symbol}>
                    {compactAssetMark(campaign.asset_symbol)}
                  </div>
                  <div className="cp-activity-copy">
                    <div className="cp-asset-row">
                      <strong className="cp-asset-name">{campaign.asset_symbol}</strong>
                      {campaign.is_new ? <span className="cp-badge">新</span> : null}
                    </div>
                    <p className="cp-venue-line">
                      {protocolLabels[campaign.protocol_uid] ?? campaign.protocol_uid}
                      {' · '}
                      {entryPointLabels[campaign.entry_point ?? ''] ??
                        campaign.entry_point ??
                        '入口未标注'}
                    </p>
                    <p className="cp-activity-note">
                      {campaign.campaign_name}
                    </p>
                  </div>
                </div>

                <div className="cp-cell cp-cell-apy">
                  <strong className="cp-apy">{formatPct(campaign.campaign_apy)}</strong>
                  {earnings != null ? (
                    <p className="cp-earnings">
                      $10,000 预计收益 <strong>${earnings.toFixed(2)}</strong>
                    </p>
                  ) : (
                    <p className="cp-earnings">收益待补充</p>
                  )}
                </div>

                <div className="cp-cell cp-cell-tags">
                  {tags.length ? (
                    tags.map((tag) => (
                      <span className="cp-tag" key={tag}>
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="cp-tag">规则待补充</span>
                  )}
                </div>

                <div className="cp-cell cp-cell-expiry">
                  {daysLeft != null ? (
                    <>
                      <strong className={`cp-days-left ${tone}`}>
                        还剩 {daysLeft} 天
                      </strong>
                      <p className="cp-end-date">{formatDate(campaign.end_date)}</p>
                      {progress != null ? (
                        <div className="cp-progress">
                          <div
                            className={`cp-progress-fill ${tone}`}
                            style={{ width: `${Math.max(6, progress * 100)}%` }}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <strong className="cp-days-left">长期</strong>
                      <p className="cp-end-date">无明确截止时间</p>
                    </>
                  )}
                </div>

                <div className="cp-cell cp-cell-actions">
                  {campaign.earn_url ? (
                    <a
                      className="cp-link cp-link-primary"
                      href={campaign.earn_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      前往
                    </a>
                  ) : null}
                  {campaign.announcement_url ? (
                    <a
                      className="cp-link cp-link-secondary"
                      href={campaign.announcement_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      公告
                    </a>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default CampaignsPage
