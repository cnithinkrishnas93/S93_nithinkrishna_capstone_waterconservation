import assert from 'node:assert/strict'
import test from 'node:test'
import ConservationProgram from '../models/ConservationProgram.js'
import Household from '../models/Household.js'
import HouseholdAttachment from '../models/HouseholdAttachment.js'
import User from '../models/User.js'
import WaterUsage from '../models/WaterUsage.js'

test('User supports password and verified Google identities', () => {
  const passwordUser = new User({
    username: 'password_user',
    passwordHash: 'hashed-password',
  })
  const googleUser = new User({
    username: 'google_user',
    googleId: 'google-sub-123',
    email: 'google@example.com',
  })

  assert.equal(passwordUser.validateSync(), undefined)
  assert.equal(googleUser.validateSync(), undefined)
  assert.ok(new User({ username: 'missing_auth' }).validateSync())
  assert.equal(User.schema.path('googleId').options.unique, true)
  assert.equal(User.schema.path('googleId').options.sparse, true)
})

test('Household requires a unique code, location, and whole-number resident count', () => {
  const household = new Household({
    name: '  Greenwood Apartments ',
    householdCode: ' hh-001 ',
    location: { district: 'North', city: 'Blue City' },
    residents: 4,
    conservationGoalLitersPerPersonPerDay: 120,
  })

  assert.equal(household.name, 'Greenwood Apartments')
  assert.equal(household.householdCode, 'HH-001')
  assert.equal(household.status, 'active')
  assert.equal(household.validateSync(), undefined)
  assert.equal(Household.schema.path('householdCode').options.unique, true)

  const invalidHousehold = new Household({
    householdCode: 'HH-002',
    residents: 1.5,
  })
  assert.ok(invalidHousehold.validateSync())
})

test('WaterUsage references a household and indexes readings by date', () => {
  const usage = new WaterUsage({
    household: '507f1f77bcf86cd799439011',
    consumptionLiters: 2840,
  })

  assert.equal(usage.source, 'manual')
  assert.ok(usage.recordedAt instanceof Date)
  assert.equal(usage.validateSync(), undefined)
  assert.equal(WaterUsage.schema.path('household').options.ref, 'Household')
  assert.ok(
    WaterUsage.schema.indexes().some(
      ([index]) => index.household === 1 && index.recordedAt === -1,
    ),
  )

  usage.consumptionLiters = -1
  assert.ok(usage.validateSync())
})

test('ConservationProgram validates dates, reduction goals, and household references', () => {
  const program = new ConservationProgram({
    name: 'Water Wise Neighborhoods',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    targetReductionPercentage: 15,
    participatingHouseholds: ['507f1f77bcf86cd799439011'],
  })

  assert.equal(program.status, 'planned')
  assert.equal(program.validateSync(), undefined)
  assert.equal(
    ConservationProgram.schema.path('participatingHouseholds').caster.options
      .ref,
    'Household',
  )

  program.endDate = new Date('2025-12-31')
  assert.ok(program.validateSync())
})

test('User normalizes usernames before validating them', () => {
  const user = new User({
    username: '  Nithin_01  ',
    passwordHash: 'hashed-password',
  })

  assert.equal(user.username, 'nithin_01')
  assert.equal(user.validateSync(), undefined)
})

test('Household rejects negative conservation goals and incomplete locations', () => {
  const household = new Household({
    name: 'Greenwood Apartments',
    householdCode: 'HH-003',
    location: { district: 'North' },
    residents: 4,
    conservationGoalLitersPerPersonPerDay: -1,
  })

  const error = household.validateSync()
  assert.ok(error.errors['location.city'])
  assert.ok(error.errors.conservationGoalLitersPerPersonPerDay)
})

test('WaterUsage rejects unsupported sources and negative meter readings', () => {
  const usage = new WaterUsage({
    household: '507f1f77bcf86cd799439011',
    consumptionLiters: 120,
    meterReadingLiters: -1,
    source: 'sensor',
  })

  const error = usage.validateSync()
  assert.ok(error.errors.source)
  assert.ok(error.errors.meterReadingLiters)
})

test('ConservationProgram enforces reduction percentage and status bounds', () => {
  const program = new ConservationProgram({
    name: 'Water Wise Neighborhoods',
    startDate: '2026-01-01',
    targetReductionPercentage: 101,
    status: 'paused',
  })

  const error = program.validateSync()
  assert.ok(error.errors.targetReductionPercentage)
  assert.ok(error.errors.status)
})

test('HouseholdAttachment validates file metadata, type, and size', () => {
  const attachment = new HouseholdAttachment({
    household: '507f1f77bcf86cd799439011',
    originalName: 'proof.pdf',
    mimeType: 'application/pdf',
    size: 12,
    data: Buffer.from('%PDF-1.7 data'),
    uploadedBy: 'nithin',
  })

  assert.equal(attachment.validateSync(), undefined)
  attachment.mimeType = 'application/x-executable'
  attachment.size = 5 * 1024 * 1024 + 1
  const error = attachment.validateSync()
  assert.ok(error.errors.mimeType)
  assert.ok(error.errors.size)
})
