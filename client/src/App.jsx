import { useState } from 'react'
import './App.css'

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

function DropIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3.5C12.2 9.2 6.5 14.8 6.5 20.1a9.5 9.5 0 1 0 19 0C25.5 14.8 19.8 9.2 16 3.5Z" fill="currentColor" />
      <path d="M11 21.3a5.2 5.2 0 0 0 5.2 5.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

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
          <article className="metric-card">
            <div className="metric-top"><span className="metric-icon blue"><DropIcon /></span><span className="metric-trend positive">↓ 8.2%</span></div>
            <p className="metric-label">Total water usage</p>
            <p className="metric-value">12,480 <span>L</span></p>
            <p className="metric-note">Compared to last week</p>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span className="metric-icon green"><span aria-hidden="true">⌂</span></span><span className="metric-trend neutral">Active</span></div>
            <p className="metric-label">Households monitored</p>
            <p className="metric-value">1,284</p>
            <p className="metric-note">Across 12 neighborhoods</p>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span className="metric-icon amber"><span aria-hidden="true">✦</span></span><span className="metric-trend positive">On target</span></div>
            <p className="metric-label">Water saved</p>
            <p className="metric-value">18.4 <span>%</span></p>
            <p className="metric-note">Against your conservation goal</p>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span className="metric-icon violet"><span aria-hidden="true">⌁</span></span><span className="metric-trend positive">↑ 12 this week</span></div>
            <p className="metric-label">Conservation score</p>
            <p className="metric-value">76 <span>/ 100</span></p>
            <p className="metric-note">Community-wide score</p>
          </article>
        </section>

        <section className="content-card usage-card" id="usage" aria-labelledby="usage-title">
          <div className="card-heading">
            <div>
              <h2 id="usage-title">Water usage</h2>
              <p className="section-subtitle">Community consumption over time</p>
            </div>
            <div className="period-switch" role="group" aria-label="Chart period">
              <button type="button" className={period === 'week' ? 'selected' : ''} aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>This week</button>
              <button type="button" className={period === 'month' ? 'selected' : ''} aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>This month</button>
            </div>
          </div>
          <div className="chart-summary"><strong>{period === 'week' ? '12,480' : '48,920'} L</strong><span className="metric-trend positive">↓ 8.2%</span><span className="summary-caption">vs previous {period}</span></div>
          <div className="chart" role="img" aria-label={`${period === 'week' ? 'Weekly' : 'Monthly'} water usage trend`} style={{ gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))` }}>
            {chartData.map((day) => (
              <div className="chart-column" key={day.label}>
                <div className="bar-track"><div className="bar" style={{ height: `${day.value}%` }} /></div>
                <span className="chart-label">{day.label}</span>
              </div>
            ))}
          </div>
          <div className="chart-legend"><span /> Daily usage <span className="legend-note">Lower usage is better</span></div>
        </section>

        <section className="content-card households-card" id="households" aria-labelledby="households-title">
          <div className="card-heading">
            <div>
              <h2 id="households-title">Household highlights</h2>
              <p className="section-subtitle">A quick look at usage across your community</p>
            </div>
            <a className="text-link" href="#households">View all <span aria-hidden="true">→</span></a>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th scope="col">HOUSEHOLD</th><th scope="col">WEEKLY USAGE</th><th scope="col">VS LAST WEEK</th><th scope="col">STATUS</th></tr></thead>
              <tbody>
                {households.map((household) => (
                  <tr key={household.name}>
                    <th scope="row"><span className="household-name">{household.name}</span><span className="household-location">{household.location}</span></th>
                    <td>{household.usage}</td>
                    <td className={household.change.startsWith('+') ? 'change-up' : 'change-down'}>{household.change}</td>
                    <td><span className={`status-pill ${household.status === 'On track' ? 'status-good' : 'status-warning'}`}>{household.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <footer className="page-footer">BlueDrop Water Conservation <span>·</span> Helping communities make every drop count.</footer>
      </main>
    </div>
  )
}

export default App
