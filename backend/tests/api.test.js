import assert from 'node:assert/strict'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'
import test from 'node:test'
import { createApp } from '../app.js'

function createMemoryModel(initialRecords = []) {
  const records = [...initialRecords]
  let nextId = 1

  class MemoryModel {
    constructor(fields) {
      Object.assign(this, fields)
    }

    static findOne(query) {
      const result = records.find((record) =>
        Object.entries(query).every(([field, value]) => record[field] === value),
      ) || null
      return {
        select() {
          return Promise.resolve(result)
        },
        then(resolve, reject) {
          return Promise.resolve(result).then(resolve, reject)
        },
      }
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
const testJwtSecret = 'test-secret-with-at-least-thirty-two-characters'
const tokensByOrigin = new Map()

function createTestApp(options) {
  return createApp({
    ...options,
    UserModel: createMemoryModel(),
    jwtSecret: testJwtSecret,
    passwordHashRounds: 4,
  })
}

const fetch = async (input, options = {}) => {
  const url = new URL(input)
  let token = tokensByOrigin.get(url.origin)
  if (!token) {
    const response = await globalThis.fetch(`${url.origin}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'test_user', password: 'correct-horse-battery' }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to authenticate API test request.')
    token = result.token
    tokensByOrigin.set(url.origin, token)
  }

  const headers = new Headers(options.headers)
  headers.set('authorization', `Bearer ${token}`)
  return globalThis.fetch(input, { ...options, headers })
}

test('household API reads records and persists new household records', async (t) => {
  const HouseholdModel = createMemoryModel([
    { _id: householdId, name: 'Greenwood Apartments', householdCode: 'HH-001' },
  ])
  const app = createTestApp({
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

test('authentication registers users, signs in, and protects API routes', async (t) => {
  const app = createTestApp({
    HouseholdModel: createMemoryModel(),
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: createMemoryModel(),
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const unauthorizedResponse = await globalThis.fetch(`${baseUrl}/api/households`)
  assert.equal(unauthorizedResponse.status, 401)

  const invalidTokens = [
    jwt.sign({ sub: 'user-1', username: 'test_user' }, 'a-different-secret'),
    jwt.sign({ sub: 'user-1', username: 'test_user' }, testJwtSecret, { expiresIn: -1 }),
    jwt.sign({ username: 'test_user' }, testJwtSecret),
    jwt.sign({ sub: 'user-1', username: 'not valid' }, testJwtSecret),
  ]
  for (const token of invalidTokens) {
    const invalidTokenResponse = await globalThis.fetch(`${baseUrl}/api/households`, {
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(invalidTokenResponse.status, 401)
  }

  const invalidRegistration = await globalThis.fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'no', password: 'short' }),
  })
  assert.equal(invalidRegistration.status, 400)

  const registration = await globalThis.fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'River_User', password: 'strong-password-123' }),
  })
  const registeredUser = await registration.json()
  assert.equal(registration.status, 201)
  assert.equal(registeredUser.user.username, 'river_user')
  assert.ok(registeredUser.token)

  const duplicateRegistration = await globalThis.fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'river_user', password: 'another-password' }),
  })
  assert.equal(duplicateRegistration.status, 409)

  const failedLogin = await globalThis.fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'river_user', password: 'wrong-password' }),
  })
  assert.equal(failedLogin.status, 401)

  const login = await globalThis.fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'RIVER_USER', password: 'strong-password-123' }),
  })
  const signedInUser = await login.json()
  assert.equal(login.status, 200)
  assert.equal(signedInUser.user.username, 'river_user')

  const authorizedResponse = await globalThis.fetch(`${baseUrl}/api/households`, {
    headers: { authorization: `Bearer ${signedInUser.token}` },
  })
  assert.equal(authorizedResponse.status, 200)
})

test('Google authentication verifies accounts, reuses users, and issues API JWTs', async (t) => {
  const UserModel = createMemoryModel([
    { _id: 'existing-user', username: 'river', passwordHash: 'unrelated-hash' },
  ])
  const googleAuthClient = {
    async verifyIdToken({ idToken, audience }) {
      assert.equal(idToken, 'valid-google-credential')
      assert.equal(audience, 'test-google-client-id')
      return {
        getPayload: () => ({
          sub: 'google-sub-123',
          email: 'river@example.com',
          email_verified: true,
          name: 'River User',
        }),
      }
    },
  }
  const app = createApp({
    HouseholdModel: createMemoryModel(),
    UserModel,
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: createMemoryModel(),
    jwtSecret: testJwtSecret,
    googleClientId: 'test-google-client-id',
    googleAuthClient,
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const url = `http://127.0.0.1:${server.address().port}/api/auth/google`
  const request = () => globalThis.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential: 'valid-google-credential' }),
  })

  const firstLogin = await request()
  const firstResult = await firstLogin.json()
  assert.equal(firstLogin.status, 200)
  assert.equal(firstResult.user.username, 'river_1')
  assert.equal(jwt.verify(firstResult.token, testJwtSecret).sub, 'record-1')
  assert.equal(UserModel.records[1].googleId, 'google-sub-123')
  assert.equal(UserModel.records[1].email, 'river@example.com')

  const secondLogin = await request()
  const secondResult = await secondLogin.json()
  assert.equal(secondLogin.status, 200)
  assert.equal(secondResult.user.username, firstResult.user.username)
  assert.equal(UserModel.records.length, 2)
})

test('Google authentication rejects unverified emails and missing credentials', async (t) => {
  const app = createApp({
    HouseholdModel: createMemoryModel(),
    UserModel: createMemoryModel(),
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: createMemoryModel(),
    jwtSecret: testJwtSecret,
    googleClientId: 'test-google-client-id',
    googleAuthClient: {
      async verifyIdToken() {
        return { getPayload: () => ({ sub: 'google-sub-123', email: 'user@example.com', email_verified: false }) }
      },
    },
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const url = `http://127.0.0.1:${server.address().port}/api/auth/google`
  const request = (body) => globalThis.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const missingCredential = await request({})
  assert.equal(missingCredential.status, 400)
  const unverifiedAccount = await request({ credential: 'unverified-google-credential' })
  assert.equal(unverifiedAccount.status, 401)
  assert.equal((await unverifiedAccount.json()).error, 'A verified Google account is required.')
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
  const app = createTestApp({
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
  const app = createTestApp({
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

test('program creation validates participating household references', async (t) => {
  const households = createMemoryModel([{ _id: householdId }])
  const programs = createMemoryModel()
  const app = createTestApp({
    HouseholdModel: households,
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: programs,
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/programs`
  const request = (participatingHouseholds) =>
    fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Water Wise Neighborhoods',
        startDate: '2026-11-01',
        targetReductionPercentage: 15,
        participatingHouseholds,
      }),
    })

  const validResponse = await request([householdId])
  assert.equal(validResponse.status, 201)
  assert.deepEqual((await validResponse.json()).participatingHouseholds, [householdId])

  const missingResponse = await request(['507f1f77bcf86cd799439012'])
  assert.equal(missingResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), {
    error: 'One or more participating households were not found.',
  })

  const invalidResponse = await request(['not-an-object-id'])
  assert.equal(invalidResponse.status, 400)
  assert.deepEqual(await invalidResponse.json(), {
    error: 'All participating household IDs must be valid.',
  })

  const nonArrayResponse = await request(householdId)
  assert.equal(nonArrayResponse.status, 400)
  assert.deepEqual(await nonArrayResponse.json(), {
    error: 'Participating households must be an array.',
  })

  assert.equal(programs.records.length, 1)
})

test('program updates validate participating household references', async (t) => {
  const programId = '507f1f77bcf86cd799439013'
  const households = createMemoryModel([{ _id: householdId }])
  const programs = createMemoryModel([
    { _id: programId, participatingHouseholds: [] },
  ])
  const app = createTestApp({
    HouseholdModel: households,
    WaterUsageModel: createMemoryModel(),
    ConservationProgramModel: programs,
  })
  const server = app.listen(0)
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/programs/${programId}`
  const request = (participatingHouseholds) =>
    fetch(baseUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ participatingHouseholds }),
    })

  const validResponse = await request([householdId])
  assert.equal(validResponse.status, 200)
  assert.deepEqual((await validResponse.json()).participatingHouseholds, [householdId])

  const missingResponse = await request(['507f1f77bcf86cd799439012'])
  assert.equal(missingResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), {
    error: 'One or more participating households were not found.',
  })

  const invalidResponse = await request(['not-an-object-id'])
  assert.equal(invalidResponse.status, 400)
  assert.deepEqual(await invalidResponse.json(), {
    error: 'All participating household IDs must be valid.',
  })

  assert.deepEqual(programs.records[0].participatingHouseholds, [householdId])
})

test('POST endpoints reject non-object request bodies', async (t) => {
  const app = createTestApp({
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
  const app = createTestApp({
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
  const app = createTestApp({
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
  const app = createTestApp({
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
  const app = createTestApp({
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
  const app = createTestApp({
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
  const app = createTestApp({
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
