import { useState } from 'react'
import './App.css'
import { DropIcon, HouseholdTable, MetricCard, UsageChart } from './components/DashboardComponents.jsx'

const usageByPeriod = {
  week: [
    { label: 'Mon', value: 68 },
    { label: 'Tue', value: 82 },
    { label: 'Wed', value: 58 },
    { label: 'Thu', value: 92 },
    { label: 'Fri', value: 74 },
    { label: 'Sat', value: 48 },
    { label: 'Sun', value: 63 },
  ],
  month: [
    { label: 'Week 1', value: 72 },
    { label: 'Week 2', value: 61 },
    { label: 'Week 3', value: 84 },
    { label: 'Week 4', value: 54 },
  ],
}

const households = [
  { name: 'Greenwood Apartments', location: 'North district', usage: '2,840 L', change: '-12%', status: 'On track' },
  { name: 'Riverbend Community', location: 'West district', usage: '3,190 L', change: '-8%', status: 'On track' },
  { name: 'Maple Street Homes', location: 'East district', usage: '4,620 L', change: '+4%', status: 'Needs attention' },
]

function App() {
  const [period, setPeriod] = useState('week')
  const [activeSection, setActiveSection] = useState('overview')
  const chartData = usageByPeriod[period]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="BlueDrop home">
          <span className="brand-mark"><DropIcon /></span>
          <span>Blue<span className="brand-accent">Drop</span></span>
        </a>

        <p className="sidebar-label">WORKSPACE</p>
        <nav className="navigation" aria-label="Main navigation">
          <a className={`nav-link ${activeSection === 'overview' ? 'active' : ''}`} href="#overview" onClick={() => setActiveSection('overview')}>
            <span className="nav-icon" aria-hidden="true">⌂</span> Overview
          </a>
          <a className={`nav-link ${activeSection === 'usage' ? 'active' : ''}`} href="#usage" onClick={() => setActiveSection('usage')}>
            <span className="nav-icon" aria-hidden="true">◷</span> Usage insights
          </a>
          <a className={`nav-link ${activeSection === 'households' ? 'active' : ''}`} href="#households" onClick={() => setActiveSection('households')}>
            <span className="nav-icon" aria-hidden="true">▦</span> Households
          </a>
        </nav>

        <div className="sidebar-tip">
          <span className="tip-icon" aria-hidden="true">✦</span>
          <p className="tip-eyebrow">TODAY'S TIP</p>
          <p className="tip-title">Small changes add up.</p>
          <p className="tip-copy">Fixing a dripping tap can save up to 20 litres of water every day.</p>
        </div>

        <div className="sidebar-profile">
          <div className="avatar" aria-hidden="true">NK</div>
          <div><strong>Project admin</strong><span>Water team</span></div>
          <span className="profile-menu" aria-hidden="true">···</span>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="page-header">
          <div>
            <p className="eyebrow">WATER CONSERVATION / OVERVIEW</p>
            <h1>Good morning, team <span aria-hidden="true">☀</span></h1>
            <p className="page-subtitle">Here’s how your community is doing with water this week.</p>
          </div>
          <div className="header-actions">
            <span className="demo-badge"><span /> Demo data</span>
            <button className="date-button" type="button" aria-label="Current reporting period: October 2026">
              <span aria-hidden="true">▦</span> October 2026
            </button>
          </div>
        </header>

        <section className="metrics-grid" aria-label="Community water statistics">
          <MetricCard icon={<DropIcon />} iconColor="blue" trend="↓ 8.2%" label="Total water usage" value="12,480" unit="L" note="Compared to last week" />
          <MetricCard icon={<span aria-hidden="true">⌂</span>} iconColor="green" trend="Active" trendColor="neutral" label="Households monitored" value="1,284" note="Across 12 neighborhoods" />
          <MetricCard icon={<span aria-hidden="true">✦</span>} iconColor="amber" trend="On target" label="Water saved" value="18.4" unit="%" note="Against your conservation goal" />
          <MetricCard icon={<span aria-hidden="true">⌁</span>} iconColor="violet" trend="↑ 12 this week" label="Conservation score" value="76" unit="/ 100" note="Community-wide score" />
        </section>

        <UsageChart period={period} onPeriodChange={setPeriod} data={chartData} />
        <HouseholdTable households={households} />
        <footer className="page-footer">BlueDrop Water Conservation <span>·</span> Helping communities make every drop count.</footer>
      </main>
    </div>
  )
}

export default App
