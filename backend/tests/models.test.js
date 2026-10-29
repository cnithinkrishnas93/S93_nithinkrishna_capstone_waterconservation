import assert from 'node:assert/strict'
import test from 'node:test'
import ConservationProgram from '../models/ConservationProgram.js'
import Household from '../models/Household.js'
import WaterUsage from '../models/WaterUsage.js'

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
