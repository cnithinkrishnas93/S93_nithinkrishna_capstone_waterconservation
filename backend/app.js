import express from 'express'
import { OAuth2Client } from 'google-auth-library'
import multer from 'multer'
import mongoose from 'mongoose'
import ConservationProgram from './models/ConservationProgram.js'
import HouseholdAttachment from './models/HouseholdAttachment.js'
import Household from './models/Household.js'
import User from './models/User.js'
import WaterUsage from './models/WaterUsage.js'
import {
  authenticateGoogleUser,
  authenticateUser,
  createAuthMiddleware,
  registerUser,
} from './auth.js'

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const pick = (body, fields) =>
  Object.fromEntries(fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]))

async function validateParticipatingHouseholds(householdIds, HouseholdModel) {
  if (!Array.isArray(householdIds)) {
    return { status: 400, error: 'Participating households must be an array.' }
  }

  if (householdIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return { status: 400, error: 'All participating household IDs must be valid.' }
  }

  const uniqueIds = [...new Set(householdIds.map(String))]
  const existingHouseholds = await Promise.all(
    uniqueIds.map((id) => HouseholdModel.exists({ _id: id })),
  )
  if (existingHouseholds.some((household) => !household)) {
    return { status: 404, error: 'One or more participating households were not found.' }
  }

  return null
}

const ensureBodyObject = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' })
  }

  next()
}

const allowedAttachmentTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
])
const maxAttachmentSize = 5 * 1024 * 1024
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxAttachmentSize, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(null, allowedAttachmentTypes.has(file.mimetype))
  },
})

function hasValidFileSignature(file) {
  const { buffer, mimetype } = file
  if (mimetype === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  if (mimetype === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP'
  }
  if (mimetype === 'application/pdf') {
    return buffer.toString('ascii', 0, 5) === '%PDF-'
  }
  return false
}

export function createApp({
  HouseholdModel = Household,
  HouseholdAttachmentModel = HouseholdAttachment,
  UserModel = User,
  WaterUsageModel = WaterUsage,
  ConservationProgramModel = ConservationProgram,
  jwtSecret = process.env.JWT_SECRET,
  googleClientId = process.env.GOOGLE_CLIENT_ID,
  googleAuthClient = new OAuth2Client(),
  passwordHashRounds = 12,
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

  app.post(
    '/api/auth/register',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      const result = await registerUser({
        UserModel,
        jwtSecret,
        username: req.body.username,
        password: req.body.password,
        saltRounds: passwordHashRounds,
      })
      res.status(result.status).json(result.body)
    }),
  )

  app.post(
    '/api/auth/login',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      const result = await authenticateUser({
        UserModel,
        jwtSecret,
        username: req.body.username,
        password: req.body.password,
      })
      res.status(result.status).json(result.body)
    }),
  )

  app.post(
    '/api/auth/google',
    ensureBodyObject,
    asyncHandler(async (req, res) => {
      const result = await authenticateGoogleUser({
        UserModel,
        jwtSecret,
        credential: req.body.credential,
        googleAuthClient,
        googleClientId,
      })
      res.status(result.status).json(result.body)
    }),
  )

  app.use('/api', createAuthMiddleware(jwtSecret))

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

  app.get(
    '/api/households/:id/attachments',
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid household ID is required.' })
      }

      const household = await HouseholdModel.exists({ _id: req.params.id })
      if (!household) {
        return res.status(404).json({ error: 'Household not found.' })
      }

      const attachments = await HouseholdAttachmentModel.find({
        household: req.params.id,
      }).sort({ createdAt: -1 }).lean()
      res.json(attachments.map(({ _id, originalName, mimeType, size, createdAt }) => ({
        _id,
        originalName,
        mimeType,
        size,
        createdAt,
      })))
    }),
  )

  app.post(
    '/api/households/:id/attachments',
    (req, res, next) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid household ID is required.' })
      }

      attachmentUpload.single('file')(req, res, (error) => {
        if (error) return next(error)
        next()
      })
    },
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res.status(400).json({
          error: 'Choose a PNG, JPEG, WebP, or PDF file to upload.',
        })
      }
      if (!hasValidFileSignature(req.file)) {
        return res.status(400).json({
          error: 'The file contents do not match its supported file type.',
        })
      }

      const household = await HouseholdModel.exists({ _id: req.params.id })
      if (!household) {
        return res.status(404).json({ error: 'Household not found.' })
      }

      const attachment = new HouseholdAttachmentModel({
        household: req.params.id,
        originalName: req.file.originalname
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .slice(0, 120) || 'attachment',
        mimeType: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer,
        uploadedBy: req.auth.sub,
      })
      await attachment.save()
      res.status(201).json({
        _id: attachment._id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
      })
    }),
  )

  app.get(
    '/api/attachments/:id/download',
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'A valid attachment ID is required.' })
      }

      const attachment = await HouseholdAttachmentModel.findById(req.params.id).lean()
      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found.' })
      }

      const safeName = attachment.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
      res.set({
        'Content-Type': attachment.mimeType,
        'Content-Length': attachment.size,
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'X-Content-Type-Options': 'nosniff',
      })
      res.send(attachment.data)
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
      await HouseholdAttachmentModel.deleteMany({ household: req.params.id })
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
      if (req.body.participatingHouseholds !== undefined) {
        const relationshipError = await validateParticipatingHouseholds(
          req.body.participatingHouseholds,
          HouseholdModel,
        )
        if (relationshipError) {
          return res
            .status(relationshipError.status)
            .json({ error: relationshipError.error })
        }
      }

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

      if (fields.participatingHouseholds !== undefined) {
        const relationshipError = await validateParticipatingHouseholds(
          fields.participatingHouseholds,
          HouseholdModel,
        )
        if (relationshipError) {
          return res
            .status(relationshipError.status)
            .json({ error: relationshipError.error })
        }
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

    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Files must be 5 MB or smaller.'
        : 'Upload one file using the "file" field.'
      return res.status(status).json({ error: message })
    }

    console.error('Unhandled API error:', error)
    res.status(500).json({ error: 'An unexpected server error occurred.' })
  })

  return app
}

export default createApp()
