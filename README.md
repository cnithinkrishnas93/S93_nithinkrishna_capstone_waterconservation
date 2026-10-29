# Water Conservation Monitoring System

## Project Description
This project aims to help organizations monitor household water consumption and understand the effectiveness of water conservation programs.

## Problem Statement
Organizations struggle to measure changes in household water usage after conducting water conservation programs.

## Project Goals
- Monitor household water consumption.
- Analyze water usage patterns.
- Identify water wastage.
- Provide conservation insights.

## Day-by-Day Plan
- Day 1: Set up GitHub repository and README.
- Day 2: Identify user requirements.
- Day 3: Design user flow and wireframes.
- Day 4: Design the dashboard.
- Day 5: Plan the data structure.
- Day 6: Develop the user interface.
- Day 7: Plan water usage visualizations.
- Day 8: Test the application.
- Day 9: Fix issues and improve the design.
- Day 10: Review and document the project.

## Expected Outcome
A user-friendly application concept that helps organizations understand water usage and conservation behavior.

## Future Enhancements
- Real-time water meter integration.
- Water usage alerts.
- Historical usage reports.
Project Status: Initial planning and GitHub setup completed.

## Database and API

The Mongoose models in `backend/models/` define households, water usage
readings, and conservation programs. The Express API reads and writes these
records in MongoDB, and the dashboard loads household and usage data from the
API. It also provides forms to create households and save water readings.

### Run the application

1. Install and start MongoDB locally, or create a MongoDB Atlas database.
2. In `backend/`, copy `.env.example` to `.env` and set `MONGODB_URI` to your
   connection string. Keep `.env` private; it is ignored by Git.
3. Install and start the backend:

   ```bash
   cd backend
   npm install
   npm start
   ```

4. In another terminal, install and start the frontend:

   ```bash
   cd client
   npm install
   npm run dev
   ```

Vite proxies `/api` requests to the backend on port `5000`. The dashboard
shows records saved in MongoDB rather than sample data.

### API endpoints

| Method | Endpoint | Database operation |
| --- | --- | --- |
| `GET` | `/api/households` | Read the latest 100 households |
| `GET` | `/api/households/:id` | Read a household by ID |
| `POST` | `/api/households` | Validate and save a household |
| `GET` | `/api/usage` | Read the latest 100 readings with household details |
| `GET` | `/api/usage/:id` | Read a usage record by ID with household details |
| `POST` | `/api/usage` | Validate and save a reading for an existing household |
| `GET` | `/api/programs` | Read the latest 100 conservation programs |
| `GET` | `/api/programs/:id` | Read a conservation program by ID with participating households |
| `POST` | `/api/programs` | Validate and save a conservation program |
| `GET` | `/api/health` | Check API and MongoDB availability |

Run the backend tests with `cd backend; npm test`.
