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
      const query = {
        populate() {
          return this
        },
        lean() {
          return Promise.resolve(result)
        },
        then(resolve, reject) {
          if (result && typeof result.save !== 'function') {
            Object.defineProperty(result, 'save', {
              value: async function save() {
                this.updatedAt = new Date()
                return this
              },
              configurable: true,
            })
          }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return query
    }

    static async exists(query) {
      return records.some((record) =>
        Object.entries(query).every(([field, value]) => record[field] === value),
      )
        ? query
        : null
    }

    static async updateMany(query, update) {
      for (const record of records) {
        const matches = Object.entries(query).every(([field, value]) =>
          Array.isArray(record[field])
            ? record[field].includes(value)
            : record[field] === value,
        )
        if (matches && update.$pull) {
          for (const [field, value] of Object.entries(update.$pull)) {
            record[field] = record[field].filter((item) => item !== value)
          }
        }
      }
    }

    static async findByIdAndDelete(id) {
      const index = records.findIndex((record) => record._id === id)
      if (index === -1) return null
      return records.splice(index, 1)[0]
    }
  }

  MemoryModel.records = records
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

test('PUT endpoints update allowed fields and reject invalid or missing records', async (t) => {
  const recordId = '507f1f77bcf86cd799439011'
  const endpoints = [
    {
      path: '/api/households',
      record: { _id: recordId, name: 'Old name', householdCode: 'HH-001' },
      payload: { name: 'New name', unexpectedField: 'ignored' },
      updatedField: 'name',
      updatedValue: 'New name',
      error: 'Household not found.',
      invalidError: 'A valid household ID is required.',
    },
    {
      path: '/api/usage',
      record: { _id: recordId, consumptionLiters: 500, household: householdId },
      payload: { consumptionLiters: 750, unexpectedField: 'ignored' },
      updatedField: 'consumptionLiters',
      updatedValue: 750,
      error: 'Usage record not found.',
      invalidError: 'A valid usage ID is required.',
    },
    {
      path: '/api/programs',
      record: { _id: recordId, name: 'Old program' },
      payload: { name: 'New program', unexpectedField: 'ignored' },
      updatedField: 'name',
      updatedValue: 'New program',
      error: 'Program not found.',
      invalidError: 'A valid program ID is required.',
    },
  ]
  const app = createApp({
    HouseholdModel: createMemoryModel([
      { _id: recordId, name: 'Old name', householdCode: 'HH-001' },
      { _id: householdId, name: 'Water saving household' },
    ]),
    WaterUsageModel: createMemoryModel([endpoints[1].record]),
    ConservationProgramModel: createMemoryModel([endpoints[2].record]),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  for (const endpoint of endpoints) {
    const response = await fetch(`${baseUrl}${endpoint.path}/${recordId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(endpoint.payload),
    })
    const updatedRecord = await response.json()
    assert.equal(response.status, 200)
    assert.equal(updatedRecord[endpoint.updatedField], endpoint.updatedValue)
    assert.equal('unexpectedField' in updatedRecord, false)

    const invalidResponse = await fetch(`${baseUrl}${endpoint.path}/not-an-object-id`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(endpoint.payload),
    })
    assert.equal(invalidResponse.status, 400)
    assert.deepEqual(await invalidResponse.json(), { error: endpoint.invalidError })

    const missingResponse = await fetch(`${baseUrl}${endpoint.path}/507f1f77bcf86cd799439012`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(endpoint.payload),
    })
    assert.equal(missingResponse.status, 404)
    assert.deepEqual(await missingResponse.json(), { error: endpoint.error })
  }
})

test('PUT usage rejects invalid or missing household references', async (t) => {
  const app = createApp({
    HouseholdModel: createMemoryModel(),
    WaterUsageModel: createMemoryModel([
      { _id: '507f1f77bcf86cd799439011', consumptionLiters: 500 },
    ]),
    ConservationProgramModel: createMemoryModel(),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/usage/507f1f77bcf86cd799439011`
  const request = (household) =>
    fetch(baseUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ household }),
    })

  const invalidResponse = await request('not-an-object-id')
  assert.equal(invalidResponse.status, 400)
  assert.deepEqual(await invalidResponse.json(), { error: 'A valid household ID is required.' })

  const missingResponse = await request('507f1f77bcf86cd799439012')
  assert.equal(missingResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), { error: 'Household not found.' })
})

test('PUT endpoints reject non-object or empty supported updates', async (t) => {
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
    const invalidBodyResponse = await fetch(`${baseUrl}${endpoint}/507f1f77bcf86cd799439011`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    })
    assert.equal(invalidBodyResponse.status, 400)
    assert.deepEqual(await invalidBodyResponse.json(), { error: 'Request body must be a JSON object.' })

    const emptyUpdateResponse = await fetch(`${baseUrl}${endpoint}/507f1f77bcf86cd799439011`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unexpectedField: 'ignored' }),
    })
    assert.equal(emptyUpdateResponse.status, 400)
    assert.deepEqual(await emptyUpdateResponse.json(), { error: 'At least one supported field is required.' })
  }
})

test('DELETE household rejects invalid, missing, or referenced households', async (t) => {
  const recordId = '507f1f77bcf86cd799439011'
  const app = createApp({
    HouseholdModel: createMemoryModel([{ _id: recordId, name: 'Greenwood Apartments' }]),
    WaterUsageModel: createMemoryModel([{ _id: 'usage-1', household: recordId }]),
    ConservationProgramModel: createMemoryModel(),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/households`

  const invalidResponse = await fetch(`${baseUrl}/not-an-object-id`, { method: 'DELETE' })
  assert.equal(invalidResponse.status, 400)
  assert.deepEqual(await invalidResponse.json(), { error: 'A valid household ID is required.' })

  const referencedResponse = await fetch(`${baseUrl}/${recordId}`, { method: 'DELETE' })
  assert.equal(referencedResponse.status, 409)
  assert.deepEqual(await referencedResponse.json(), {
    error: 'Households with water usage records cannot be deleted.',
  })

  const missingResponse = await fetch(`${baseUrl}/507f1f77bcf86cd799439012`, {
    method: 'DELETE',
  })
  assert.equal(missingResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), { error: 'Household not found.' })
})

test('DELETE household removes the record and unlinks it from conservation programs', async (t) => {
  const recordId = '507f1f77bcf86cd799439011'
  const programs = createMemoryModel([
    { _id: 'program-1', participatingHouseholds: [recordId, 'another-household'] },
  ])
  const app = createApp({
    HouseholdModel: createMemoryModel([{ _id: recordId, name: 'Greenwood Apartments' }]),
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: programs,
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/households/${recordId}`

  const response = await fetch(baseUrl, { method: 'DELETE' })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { message: 'Household deleted successfully.' })

  const householdResponse = await fetch(
    `http://127.0.0.1:${server.address().port}/api/households/${recordId}`,
  )
  assert.equal(householdResponse.status, 404)
  assert.deepEqual(programs.records[0].participatingHouseholds, ['another-household'])
})
