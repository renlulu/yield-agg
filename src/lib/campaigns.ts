import type { EarnFeed } from '../types'

export const CAMPAIGNS_ENDPOINT = '/api/earn'

export async function fetchCampaigns(): Promise<EarnFeed> {
  const response = await fetch(CAMPAIGNS_ENDPOINT, {
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
