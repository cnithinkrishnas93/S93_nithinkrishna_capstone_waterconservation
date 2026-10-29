# BlueDrop Water Conservation Dashboard

A React dashboard for exploring household water usage and conservation progress. The current UI uses demo data and supports weekly and monthly usage views.

## React components

The dashboard is composed of reusable components in `src/components/DashboardComponents.jsx`:

- `MetricCard` displays a community statistic and its trend.
- `UsageChart` visualizes usage and lets users switch between weekly and monthly data.
- `HouseholdTable` renders household usage and conservation status.
- `DropIcon` provides the shared water-drop icon.

## Getting started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite to view the dashboard.

## Available scripts

- `npm run dev` starts the Vite development server.
- `npm run build` creates a production build in `dist`.
- `npm run preview` serves the production build locally.
- `npm run lint` checks the source with Oxlint.
