import type { EarnFeed } from '../types'

export const CAMPAIGNS_ENDPOINT = '/api/earn'

export async function fetchCampaigns(options?: { refresh?: boolean }): Promise<EarnFeed> {
  const endpoint = new URL(CAMPAIGNS_ENDPOINT, window.location.origin)
  if (options?.refresh) {
    endpoint.searchParams.set('refresh', '1')
  }

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`接口请求失败：${response.status}`)
  }

  const payload = (await response.json()) as EarnFeed

  if (!Array.isArray(payload.campaigns) || !Array.isArray(payload.sources)) {
    throw new Error('接口返回格式不符合预期')
  }

  return payload
}
