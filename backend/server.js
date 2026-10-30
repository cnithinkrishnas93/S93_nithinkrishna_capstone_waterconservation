import 'dotenv/config'
import mongoose from 'mongoose'
import app from './app.js'

const port = Number(process.env.PORT || 5000)
const mongoUri = process.env.MONGODB_URI
const jwtSecret = process.env.JWT_SECRET

if (!mongoUri) {
  throw new Error('MONGODB_URI is required. Copy .env.example to .env and configure your MongoDB connection.')
}

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters. Set a private random secret in .env.')
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

try {
  await mongoose.connect(mongoUri)
  const server = app.listen(port, () => {
    console.info(`BlueDrop API listening on http://localhost:${port}`)
  })

  const shutdown = (signal) => {
    console.info(`${signal} received; closing API server.`)
    server.close(async (error) => {
      if (error) {
        console.error('Failed to close API server:', error)
        process.exitCode = 1
      }

      await mongoose.disconnect()
    })
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
} catch (error) {
  console.error('Failed to start BlueDrop API:', error)
  await mongoose.disconnect()
  process.exitCode = 1
}
