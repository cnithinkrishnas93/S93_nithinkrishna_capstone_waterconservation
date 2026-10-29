import { useCallback, useEffect, useState } from 'react'
import './App.css'

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || `Request failed with status ${response.status}.`)
  }

  return result
}

function getChartData(readings, period, now) {
  if (period === 'week') {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now)
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - 6 + index)
      return {
        key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
        label: date.toLocaleDateString('en', { weekday: 'short' }),
        value: 0,
      }
    })

    readings.forEach((reading) => {
      const date = new Date(reading.recordedAt)
      const day = days.find(
        (item) =>
          item.key === `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      )
      if (day) day.value += reading.consumptionLiters
    })

    return days
  }

  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const weeks = Array.from(
    { length: Math.ceil(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() / 7) },
    (_, index) => ({ label: `Week ${index + 1}`, value: 0 }),
  )

  readings.forEach((reading) => {
    const date = new Date(reading.recordedAt)
    if (date >= firstDay && date.getMonth() === now.getMonth()) {
      weeks[Math.floor((date.getDate() - 1) / 7)].value += reading.consumptionLiters
    }
  })

  return weeks
}

function getHouseholdId(reading) {
  return typeof reading.household === 'string'
    ? reading.household
    : reading.household?._id
}

function formatLiters(value) {
  return `${Math.round(value).toLocaleString()} L`
}

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
  const [households, setHouseholds] = useState([])
  const [readings, setReadings] = useState([])
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const [loadedAt, setLoadedAt] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [apiAvailable, setApiAvailable] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadDashboard = useCallback(async () => {
    try {
      const [householdData, readingData] = await Promise.all([
        apiRequest('/households'),
        apiRequest('/usage'),
      ])
      setHouseholds(householdData)
      setReadings(readingData)
      setLoadedAt(new Date())
      setSelectedHousehold((current) =>
        householdData.some((household) => household._id === current)
          ? current
          : householdData[0]?._id || '',
      )
      setApiAvailable(true)
      setError('')
      return true
    } catch (loadError) {
      setApiAvailable(false)
      setError(loadError.message)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([apiRequest('/households'), apiRequest('/usage')])
      .then(([householdData, readingData]) => {
        if (!active) return
        setHouseholds(householdData)
        setReadings(readingData)
        setLoadedAt(new Date())
        setSelectedHousehold((current) =>
          householdData.some((household) => household._id === current)
            ? current
            : householdData[0]?._id || '',
        )
        setApiAvailable(true)
        setError('')
      })
      .catch((loadError) => {
        if (!active) return
        setApiAvailable(false)
        setError(loadError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function handleCreateHousehold(event) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    setError('')
    setNotice('')
    setIsSaving(true)

    try {
      await apiRequest('/households', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          householdCode: formData.get('householdCode'),
          location: {
            district: formData.get('district'),
            city: formData.get('city'),
          },
          residents: Number(formData.get('residents')),
          conservationGoalLitersPerPersonPerDay: Number(formData.get('dailyGoal')),
        }),
      })
      form.reset()
      setNotice('Household saved to the database.')
      await loadDashboard()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreateReading(event) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    setError('')
    setNotice('')
    setIsSaving(true)

    try {
      await apiRequest('/usage', {
        method: 'POST',
        body: JSON.stringify({
          household: selectedHousehold,
          consumptionLiters: Number(formData.get('consumptionLiters')),
        }),
      })
      form.reset()
      setNotice('Water reading saved to the database.')
      await loadDashboard()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const weekStart = loadedAt ? new Date(loadedAt) : null
  if (weekStart) weekStart.setDate(weekStart.getDate() - 7)
  const weeklyReadings = weekStart
    ? readings.filter((reading) => new Date(reading.recordedAt) >= weekStart)
    : []
  const weeklyTotal = weeklyReadings.reduce(
    (total, reading) => total + reading.consumptionLiters,
    0,
  )
  const activeHouseholds = households.filter(
    (household) => household.status === 'active',
  )
  const averageDailyUsage = activeHouseholds.length
    ? weeklyTotal / 7 / activeHouseholds.length
    : 0
  const chartData = loadedAt ? getChartData(readings, period, loadedAt) : []
  const chartMaximum = Math.max(...chartData.map((day) => day.value), 0)
  const chartTotal = chartData.reduce((total, day) => total + day.value, 0)
  const currentMonth = loadedAt
    ? loadedAt.toLocaleDateString('en', { month: 'long', year: 'numeric' })
    : 'Loading…'

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
            <span className={`demo-badge ${apiAvailable ? '' : 'unavailable'}`}>
              <span /> {apiAvailable ? 'Live database' : 'API unavailable'}
            </span>
            <button className="date-button" type="button" aria-label={`Current reporting period: ${currentMonth}`}>
              <span aria-hidden="true">▦</span> {currentMonth}
            </button>
          </div>
        </header>

        {error && <p className="form-message error-message" role="alert">{error}</p>}
        {notice && <p className="form-message success-message" role="status">{notice}</p>}

        <section className="metrics-grid" aria-label="Community water statistics">
          <article className="metric-card">
            <div className="metric-top"><span className="metric-icon blue"><DropIcon /></span><span className="metric-trend positive">7 days</span></div>
            <p className="metric-label">Recorded water usage</p>
            <p className="metric-value">{isLoading || !loadedAt ? '—' : Math.round(weeklyTotal).toLocaleString()} <span>L</span></p>
            <p className="metric-note">From database readings</p>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span className="metric-icon green"><span aria-hidden="true">⌂</span></span><span className="metric-trend neutral">Active</span></div>
            <p className="metric-label">Households monitored</p>
            <p className="metric-value">{isLoading || !loadedAt ? '—' : activeHouseholds.length.toLocaleString()}</p>
            <p className="metric-note">Registered in the database</p>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span className="metric-icon amber"><span aria-hidden="true">✦</span></span><span className="metric-trend neutral">7 days</span></div>
            <p className="metric-label">Water readings</p>
            <p className="metric-value">{isLoading || !loadedAt ? '—' : weeklyReadings.length.toLocaleString()}</p>
            <p className="metric-note">Saved measurement records</p>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span className="metric-icon violet"><span aria-hidden="true">⌁</span></span><span className="metric-trend neutral">Per household</span></div>
            <p className="metric-label">Average daily usage</p>
            <p className="metric-value">{isLoading || !loadedAt ? '—' : Math.round(averageDailyUsage).toLocaleString()} <span>L</span></p>
            <p className="metric-note">Across active households</p>
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
          <div className="chart-summary"><strong>{formatLiters(chartTotal)}</strong><span className="summary-caption">Recorded this {period}</span></div>
          <div className="chart" role="img" aria-label={`${period === 'week' ? 'Weekly' : 'Monthly'} water usage trend`} style={{ gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))` }}>
            {chartData.map((day) => (
              <div className="chart-column" key={day.label}>
                <div className="bar-track"><div className="bar" style={{ height: `${chartMaximum ? Math.max(5, (day.value / chartMaximum) * 100) : 0}%` }} /></div>
                <span className="chart-label">{day.label}</span>
              </div>
            ))}
          </div>
          <div className="chart-legend"><span /> Recorded usage <span className="legend-note">Based on saved readings</span></div>
        </section>

        <section className="content-card households-card" id="households" aria-labelledby="households-title">
          <div className="card-heading">
            <div>
              <h2 id="households-title">Household highlights</h2>
              <p className="section-subtitle">A quick look at usage across your community</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th scope="col">HOUSEHOLD</th><th scope="col">WEEKLY USAGE</th><th scope="col">LATEST READING</th><th scope="col">STATUS</th></tr></thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan="4">Loading database records…</td></tr>
                ) : households.length ? (
                  households.map((household) => {
                    const householdReadings = weeklyReadings.filter(
                      (reading) => getHouseholdId(reading) === household._id,
                    )
                    const householdTotal = householdReadings.reduce(
                      (total, reading) => total + reading.consumptionLiters,
                      0,
                    )
                    const latestReading = readings.find(
                      (reading) => getHouseholdId(reading) === household._id,
                    )
                    const onTrack =
                      householdTotal <=
                      household.conservationGoalLitersPerPersonPerDay *
                        household.residents *
                        7
                    const location = [
                      household.location?.neighborhood,
                      household.location?.district,
                      household.location?.city,
                    ]
                      .filter(Boolean)
                      .join(', ')

                    return (
                      <tr key={household._id}>
                        <th scope="row">
                          <span className="household-name">{household.name}</span>
                          <span className="household-location">{location || household.householdCode}</span>
                        </th>
                        <td>{formatLiters(householdTotal)}</td>
                        <td>
                          {latestReading
                            ? `${formatLiters(latestReading.consumptionLiters)} · ${new Date(latestReading.recordedAt).toLocaleDateString()}`
                            : 'No readings'}
                        </td>
                        <td>
                          <span className={`status-pill ${onTrack ? 'status-good' : 'status-warning'}`}>
                            {householdReadings.length
                              ? onTrack
                                ? 'On track'
                                : 'Needs attention'
                              : 'Needs reading'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr><td colSpan="4">No households yet. Add one below to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <details className="data-entry">
            <summary>Add a household</summary>
            <form className="entry-form household-entry" onSubmit={handleCreateHousehold}>
              <label>
                Household name
                <input className="text-field" name="name" required maxLength="120" />
              </label>
              <label>
                Household code
                <input className="text-field" name="householdCode" required maxLength="120" />
              </label>
              <label>
                District
                <input className="text-field" name="district" required maxLength="120" />
              </label>
              <label>
                City
                <input className="text-field" name="city" required maxLength="120" />
              </label>
              <label>
                Residents
                <input className="text-field" name="residents" type="number" min="1" step="1" required />
              </label>
              <label>
                Daily goal (L/person)
                <input className="text-field" name="dailyGoal" type="number" min="0" step="0.1" required />
              </label>
              <button className="submit-button" type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save household'}
              </button>
            </form>
          </details>

          <form className="entry-form usage-entry" onSubmit={handleCreateReading}>
            <h3>Record water usage</h3>
            <label>
              Household
              <select
                className="text-field"
                value={selectedHousehold}
                onChange={(event) => setSelectedHousehold(event.target.value)}
                required
                disabled={!households.length || isSaving}
              >
                <option value="" disabled>Select a household</option>
                {households.map((household) => (
                  <option key={household._id} value={household._id}>
                    {household.name} ({household.householdCode})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Consumption (liters)
              <input
                className="text-field"
                name="consumptionLiters"
                type="number"
                min="0"
                step="0.1"
                required
                disabled={!households.length || isSaving}
              />
            </label>
            <button className="submit-button" type="submit" disabled={!households.length || isSaving}>
              {isSaving ? 'Saving…' : 'Save reading'}
            </button>
          </form>
        </section>
        <footer className="page-footer">BlueDrop Water Conservation <span>·</span> Helping communities make every drop count.</footer>
      </main>
    </div>
  )
}

export default App
