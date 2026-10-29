import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../app.js'

function createMemoryModel(initialRecords = []) {
  const records = [...initialRecords]
  let nextId = 1

  class MemoryModel {
    constructor(fields) {
      Object.assign(this, fields)
    }

    async save() {
      this._id = `record-${nextId++}`
      this.createdAt = new Date()
      records.push(this)
      return this
    }

    static find() {
      let result = [...records]
      const query = {
        sort() {
          return this
        },
        limit(count) {
          result = result.slice(0, count)
          return this
        },
        populate() {
          return this
        },
        lean() {
          return Promise.resolve(result)
        },
      }
      return query
    }

    static findById(id) {
      const result = records.find((record) => record._id === id) || null
      return {
        populate() {
          return this
        },
        lean() {
          return Promise.resolve(result)
        },
      }
    }

    static async exists({ _id }) {
      return records.some((record) => record._id === _id) ? { _id } : null
    }
  }

  return MemoryModel
}

const householdId = '507f1f77bcf86cd799439011'

test('household API reads records and persists new household records', async (t) => {
  const HouseholdModel = createMemoryModel([
    { _id: householdId, name: 'Greenwood Apartments', householdCode: 'HH-001' },
  ])
  const app = createApp({
    HouseholdModel,
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: createMemoryModel(),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const listResponse = await fetch(`${baseUrl}/api/households`)
  assert.equal(listResponse.status, 200)
  assert.equal((await listResponse.json())[0].householdCode, 'HH-001')

  const createResponse = await fetch(`${baseUrl}/api/households`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Riverbend Community',
      householdCode: 'HH-002',
      residents: 3,
      unexpectedField: 'must not be persisted',
    }),
  })
  const createdHousehold = await createResponse.json()
  assert.equal(createResponse.status, 201)
  assert.equal(createdHousehold.householdCode, 'HH-002')
  assert.equal('unexpectedField' in createdHousehold, false)
})

test('detail GET endpoints return records and handle invalid or missing IDs', async (t) => {
  const recordId = '507f1f77bcf86cd799439011'
  const endpoints = [
    {
      path: '/api/households',
      record: { _id: recordId, name: 'Greenwood Apartments' },
      error: 'Household not found.',
      invalidError: 'A valid household ID is required.',
    },
    {
      path: '/api/usage',
      record: { _id: recordId, consumptionLiters: 860 },
      error: 'Usage record not found.',
      invalidError: 'A valid usage ID is required.',
    },
    {
      path: '/api/programs',
      record: { _id: recordId, name: 'Water Wise Neighborhoods' },
      error: 'Program not found.',
      invalidError: 'A valid program ID is required.',
    },
  ]
  const app = createApp({
    HouseholdModel: createMemoryModel([endpoints[0].record]),
    WaterUsageModel: createMemoryModel([endpoints[1].record]),
    ConservationProgramModel: createMemoryModel([endpoints[2].record]),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  for (const endpoint of endpoints) {
    const response = await fetch(`${baseUrl}${endpoint.path}/${recordId}`)
    assert.equal(response.status, 200)
    assert.equal((await response.json())._id, recordId)

    const invalidResponse = await fetch(`${baseUrl}${endpoint.path}/not-an-object-id`)
    assert.equal(invalidResponse.status, 400)
    assert.deepEqual(await invalidResponse.json(), { error: endpoint.invalidError })

    const missingResponse = await fetch(`${baseUrl}${endpoint.path}/507f1f77bcf86cd799439012`)
    assert.equal(missingResponse.status, 404)
    assert.deepEqual(await missingResponse.json(), { error: endpoint.error })
  }
})

test('program API persists new conservation programs and filters unknown fields', async (t) => {
  const app = createApp({
    HouseholdModel: createMemoryModel(),
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: createMemoryModel(),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const response = await fetch(`${baseUrl}/api/programs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Water Wise Neighborhoods',
      description: 'Help households reduce water consumption.',
      startDate: '2026-11-01',
      endDate: '2026-12-01',
      targetReductionPercentage: 15,
      unexpectedField: 'must not be persisted',
    }),
  })

  const createdProgram = await response.json()
  assert.equal(response.status, 201)
  assert.equal(createdProgram.name, 'Water Wise Neighborhoods')
  assert.equal(createdProgram.targetReductionPercentage, 15)
  assert.equal('unexpectedField' in createdProgram, false)
})

test('POST endpoints reject non-object request bodies', async (t) => {
  const app = createApp({
    HouseholdModel: createMemoryModel(),
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: createMemoryModel(),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  for (const endpoint of ['/api/households', '/api/usage', '/api/programs']) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Request body must be a JSON object.' })
  }
})

test('usage API persists readings for existing households and rejects missing households', async (t) => {
  const HouseholdModel = createMemoryModel([{ _id: householdId }])
  const WaterUsageModel = createMemoryModel()
  const app = createApp({
    HouseholdModel,
    WaterUsageModel,
    ConservationProgramModel: createMemoryModel(),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const request = (household) =>
    fetch(`${baseUrl}/api/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ household, consumptionLiters: 860 }),
    })

  const createdResponse = await request(householdId)
  assert.equal(createdResponse.status, 201)
  assert.equal((await createdResponse.json()).consumptionLiters, 860)

  const missingResponse = await request('507f1f77bcf86cd799439012')
  assert.equal(missingResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), { error: 'Household not found.' })

  const invalidResponse = await request('not-an-object-id')
  assert.equal(invalidResponse.status, 400)
})
