import express from 'express'
import mongoose from 'mongoose'
import ConservationProgram from './models/ConservationProgram.js'
import Household from './models/Household.js'
import WaterUsage from './models/WaterUsage.js'

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const pick = (body, fields) =>
  Object.fromEntries(fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]))

const ensureBodyObject = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' })
  }

  next()
}

export function createApp({
  HouseholdModel = Household,
  WaterUsageModel = WaterUsage,
  ConservationProgramModel = ConservationProgram,
} = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '32kb' }))

  app.get(
    '/api/health',
    (_req, res) => {
      const connected = mongoose.connection.readyState === 1
      res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'database unavailable' })
    },
  )

  app.get(
    '/api/households',
    asyncHandler(async (_req, res) => {
      const households = await HouseholdModel.find().sort({ createdAt: -1 }).limit(100).lean()
      res.json(households)
    }),
  )

  app.get(
    '/api/households/:id',
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid household ID is required.' })
      }

      const household = await HouseholdModel.findById(req.params.id).lean()
      if (!household) {
        return res.status(404).json({ error: 'Household not found.' })
      }

      res.json(household)
    }),
  )

  app.post(
    '/api/households',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      const household = new HouseholdModel(
        pick(req.body, [
          'name',
          'householdCode',
          'location',
          'residents',
          'conservationGoalLitersPerPersonPerDay',
          'status',
        ]),
      )
      await household.save()
      res.status(201).json(household)
    }),
  )

  app.put(
    '/api/households/:id',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid household ID is required.' })
      }

      const fields = pick(req.body, [
        'name',
        'householdCode',
        'location',
        'residents',
        'conservationGoalLitersPerPersonPerDay',
        'status',
      ])
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'At least one supported field is required.' })
      }

      const household = await HouseholdModel.findById(req.params.id)
      if (!household) {
        return res.status(404).json({ error: 'Household not found.' })
      }

      Object.assign(household, fields)
      await household.save()
      res.json(household)
    }),
  )

  app.delete(
    '/api/households/:id',
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid household ID is required.' })
      }

      const household = await HouseholdModel.findById(req.params.id)
      if (!household) {
        return res.status(404).json({ error: 'Household not found.' })
      }

      const hasUsageRecords = await WaterUsageModel.exists({
        household: req.params.id,
      })
      if (hasUsageRecords) {
        return res.status(409).json({
          error: 'Households with water usage records cannot be deleted.',
        })
      }

      await ConservationProgramModel.updateMany(
        { participatingHouseholds: req.params.id },
        { $pull: { participatingHouseholds: req.params.id } },
      )
      await HouseholdModel.findByIdAndDelete(req.params.id)
      res.json({ message: 'Household deleted successfully.' })
    }),
  )

  app.get(
    '/api/usage',
    asyncHandler(async (_req, res) => {
      const readings = await WaterUsageModel.find()
        .sort({ recordedAt: -1 })
        .limit(100)
        .populate('household', 'name householdCode')
        .lean()
      res.json(readings)
    }),
  )

  app.get(
    '/api/usage/:id',
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid usage ID is required.' })
      }

      const reading = await WaterUsageModel.findById(req.params.id)
        .populate('household', 'name householdCode')
        .lean()
      if (!reading) {
        return res.status(404).json({ error: 'Usage record not found.' })
      }

      res.json(reading)
    }),
  )

  app.post(
    '/api/usage',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      const { household: householdId } = req.body
      if (!mongoose.Types.ObjectId.isValid(householdId)) {
        return res.status(400).json({ error: 'A valid household ID is required.' })
      }

      const household = await HouseholdModel.exists({ _id: householdId })
      if (!household) {
        return res.status(404).json({ error: 'Household not found.' })
      }

      const reading = new WaterUsageModel(
        pick(req.body, ['household', 'recordedAt', 'consumptionLiters', 'meterReadingLiters', 'source', 'notes']),
      )
      await reading.save()
      res.status(201).json(reading)
    }),
  )

  app.put(
    '/api/usage/:id',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid usage ID is required.' })
      }

      const fields = pick(req.body, [
        'household',
        'recordedAt',
        'consumptionLiters',
        'meterReadingLiters',
        'source',
        'notes',
      ])
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'At least one supported field is required.' })
      }

      if (fields.household !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(fields.household)) {
          return res.status(400).json({ error: 'A valid household ID is required.' })
        }

        const household = await HouseholdModel.exists({ _id: fields.household })
        if (!household) {
          return res.status(404).json({ error: 'Household not found.' })
        }
      }

      const reading = await WaterUsageModel.findById(req.params.id)
      if (!reading) {
        return res.status(404).json({ error: 'Usage record not found.' })
      }

      Object.assign(reading, fields)
      await reading.save()
      res.json(reading)
    }),
  )

  app.get(
    '/api/programs',
    asyncHandler(async (_req, res) => {
      const programs = await ConservationProgramModel.find()
        .sort({ startDate: -1 })
        .limit(100)
        .populate('participatingHouseholds', 'name householdCode')
        .lean()
      res.json(programs)
    }),
  )

  app.get(
    '/api/programs/:id',
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid program ID is required.' })
      }

      const program = await ConservationProgramModel.findById(req.params.id)
        .populate('participatingHouseholds', 'name householdCode')
        .lean()
      if (!program) {
        return res.status(404).json({ error: 'Program not found.' })
      }

      res.json(program)
    }),
  )

  app.post(
    '/api/programs',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      const program = new ConservationProgramModel(
        pick(req.body, [
          'name',
          'description',
          'startDate',
          'endDate',
          'targetReductionPercentage',
          'status',
          'participatingHouseholds',
        ]),
      )
      await program.save()
      res.status(201).json(program)
    }),
  )

  app.put(
    '/api/programs/:id',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid program ID is required.' })
      }

      const fields = pick(req.body, [
        'name',
        'description',
        'startDate',
        'endDate',
        'targetReductionPercentage',
        'status',
        'participatingHouseholds',
      ])
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'At least one supported field is required.' })
      }

      const program = await ConservationProgramModel.findById(req.params.id)
      if (!program) {
        return res.status(404).json({ error: 'Program not found.' })
      }

      Object.assign(program, fields)
      await program.save()
      res.json(program)
    }),
  )

  app.use((_req, res) => {
    res.status(404).json({ error: 'API route not found.' })
  })

  app.use((error, _req, res, _next) => {
    if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ error: error.message })
    }

    if (error.code === 11000) {
      return res.status(409).json({ error: 'A record with that unique value already exists.' })
    }

    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body contains invalid JSON.' })
    }

    console.error('Unhandled API error:', error)
    res.status(500).json({ error: 'An unexpected server error occurred.' })
  })

  return app
}

export default createApp()
