export function DropIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3.5C12.2 9.2 6.5 14.8 6.5 20.1a9.5 9.5 0 1 0 19 0C25.5 14.8 19.8 9.2 16 3.5Z" fill="currentColor" />
      <path d="M11 21.3a5.2 5.2 0 0 0 5.2 5.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function MetricCard({ icon, iconColor, trend, trendColor = 'positive', label, value, unit, note }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon ${iconColor}`}>{icon}</span>
        <span className={`metric-trend ${trendColor}`}>{trend}</span>
      </div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}{unit && <> <span>{unit}</span></>}</p>
      <p className="metric-note">{note}</p>
    </article>
  )
}

export function UsageChart({ period, onPeriodChange, data }) {
  return (
    <section className="content-card usage-card" id="usage" aria-labelledby="usage-title">
      <div className="card-heading">
        <div>
          <h2 id="usage-title">Water usage</h2>
          <p className="section-subtitle">Community consumption over time</p>
        </div>
        <div className="period-switch" role="group" aria-label="Chart period">
          <button type="button" className={period === 'week' ? 'selected' : ''} aria-pressed={period === 'week'} onClick={() => onPeriodChange('week')}>This week</button>
          <button type="button" className={period === 'month' ? 'selected' : ''} aria-pressed={period === 'month'} onClick={() => onPeriodChange('month')}>This month</button>
        </div>
      </div>
      <div className="chart-summary"><strong>{period === 'week' ? '12,480' : '48,920'} L</strong><span className="metric-trend positive">↓ 8.2%</span><span className="summary-caption">vs previous {period}</span></div>
      <div className="chart" role="img" aria-label={`${period === 'week' ? 'Weekly' : 'Monthly'} water usage trend`} style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((item) => (
          <div className="chart-column" key={item.label}>
            <div className="bar-track"><div className="bar" style={{ height: `${item.value}%` }} /></div>
            <span className="chart-label">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend"><span /> Daily usage <span className="legend-note">Lower usage is better</span></div>
    </section>
  )
}

export function HouseholdTable({ households }) {
  return (
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
  )
}
