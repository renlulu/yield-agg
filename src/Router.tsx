import { useEffect, useState } from 'react'
import App from './App'
import CampaignsPage from './CampaignsPage'

export default function Router() {
  const [page, setPage] = useState(location.hash)

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
          <a
            href="#campaigns"
            className={page === '#campaigns' ? 'nav-active' : ''}
          >
            活动猎手
          </a>
          <a href="#" className={!page || page === '#' ? 'nav-active' : ''}>
            全景扫描
          </a>
        </nav>

        <div className="site-header-meta" />
      </header>
      {page === '#campaigns' ? <CampaignsPage /> : <App />}
    </>
  )
}
