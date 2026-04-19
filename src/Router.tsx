import { useEffect, useState } from 'react'
import App from './App'
import CampaignsPage from './CampaignsPage'

export default function Router() {
  const [page, setPage] = useState(location.hash)
  const isCampaignsPage = page === '#campaigns'
  const isOnchainPage = page === '#onchain'

  useEffect(() => {
    const onHash = () => setPage(location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <>
      <header className="site-header">
        <a className="site-brand" href="#">
          <span className="site-brand-mark">YD</span>
          <span className="site-brand-copy">
            <strong>Yield Desk</strong>
            <em>Stablecoin Income Intelligence</em>
          </span>
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a href="#" className={!page || page === '#' ? 'nav-active' : ''}>
            产品总览
          </a>
          <a
            href="#campaigns"
            className={isCampaignsPage ? 'nav-active' : ''}
          >
            限时活动
          </a>
          <a href="#onchain" className={isOnchainPage ? 'nav-active' : ''}>
            DeFi
          </a>
        </nav>

        <div className="site-header-meta" />
      </header>
      {isCampaignsPage ? (
        <CampaignsPage />
      ) : isOnchainPage ? (
        <App key="onchain" variant="onchain" />
      ) : (
        <App key="overview" variant="overview" />
      )}
    </>
  )
}
