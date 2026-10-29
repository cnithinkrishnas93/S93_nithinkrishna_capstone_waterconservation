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

## Database schemas

The Mongoose models are in `backend/models/`:

- `Household` stores a uniquely coded household, its location, resident count,
  daily conservation goal, and active status.
- `WaterUsage` stores a household's measured consumption, recording time,
  optional meter reading, and reading source. Each usage record references a
  household.
- `ConservationProgram` stores a program's schedule, reduction target, status,
  and participating households.

Schemas use MongoDB ObjectId references, validation, timestamps, and indexes
for unique household codes and common usage/program lookups.

To install the backend dependency and run the schema tests:

```bash
cd backend
npm install
npm test
```
