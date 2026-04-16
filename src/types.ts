export interface TierDetail {
  apy: number | null
  min: number | null
  max: number | null
}

export interface EarnCampaign {
  id: string
  protocol_uid: string
  is_cex: boolean
  asset_symbol: string
  campaign_name: string
  campaign_apy: number | null
  base_apy: number | null
  reward_apy: number | null
  reward_type: string | null
  reward_asset: string | null
  lock_days: number | null
  tier_1_threshold: number | null
  tier_1_apy: number | null
  tier_2_apy: number | null
  tier_details: TierDetail[] | null
  min_amount: number | null
  max_amount: number | null
  reward_period_days: number | null
  earn_url: string | null
  announcement_url: string | null
  tutorial_url: string | null
  reward_provider_protocol_uid: string | null
  reward_distribution_date: string | null
  redemption_days: number | null
  service_fee_pct: number | null
  pool_status: string | null
  peg_mechanism: string | null
  entry_point: string | null
  product_type: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  trending: boolean
  is_new: boolean
  is_new_user_only: boolean
  notes: string | null
  updated_at: string | null
}

export type ScopeFilter = 'all' | 'cex' | 'defi'

export type SortMode = 'apy' | 'latest' | 'platform'

export type SourceState =
  | 'live'
  | 'needs_credentials'
  | 'unsupported'
  | 'error'

export interface SourceStatus {
  id: string
  label: string
  state: SourceState
  auth: 'public' | 'private' | 'unsupported'
  message: string
  itemCount: number
}

export interface EarnFeed {
  generatedAt: string
  campaigns: EarnCampaign[]
  sources: SourceStatus[]
}
