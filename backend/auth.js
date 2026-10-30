import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const usernamePattern = /^[a-z0-9_]{3,32}$/
const bcryptSaltRounds = 12

export function createAuthMiddleware(jwtSecret) {
  return (req, res, next) => {
    const authorization = req.get('authorization')
    const [scheme, token, ...extraParts] = authorization?.split(' ') || []
    if (scheme !== 'Bearer' || !token || extraParts.length > 0) {
      return res.status(401).json({ error: 'Authentication is required.' })
    }

    let claims
    try {
      claims = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
    } catch {
      return res.status(401).json({ error: 'Your session is invalid or has expired. Please sign in again.' })
    }

    if (
      typeof claims !== 'object'
      || typeof claims.sub !== 'string'
      || claims.sub.length === 0
      || typeof claims.username !== 'string'
      || !usernamePattern.test(claims.username)
    ) {
      return res.status(401).json({ error: 'Your session is invalid or has expired. Please sign in again.' })
    }

    req.auth = claims
    next()
  }
}

export async function registerUser({
  UserModel,
  jwtSecret,
  username,
  password,
  saltRounds = bcryptSaltRounds,
}) {
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : ''
  if (!usernamePattern.test(normalizedUsername)) {
    return { status: 400, body: { error: 'Username must be 3-32 characters using letters, numbers, or underscores.' } }
  }
  if (
    typeof password !== 'string'
    || password.length < 8
    || Buffer.byteLength(password, 'utf8') > 72
  ) {
    return { status: 400, body: { error: 'Password must be at least 8 characters and no more than 72 bytes.' } }
  }

  if (await UserModel.findOne({ username: normalizedUsername })) {
    return { status: 409, body: { error: 'That username is already registered.' } }
  }

  const user = new UserModel({
    username: normalizedUsername,
    passwordHash: await bcrypt.hash(password, saltRounds),
  })
  await user.save()
  return {
    status: 201,
    body: {
      token: jwt.sign({ sub: String(user._id), username: user.username }, jwtSecret, {
        algorithm: 'HS256',
        expiresIn: '1h',
      }),
      user: { username: user.username },
    },
  }
}

export async function authenticateUser({ UserModel, jwtSecret, username, password }) {
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : ''
  if (!usernamePattern.test(normalizedUsername) || typeof password !== 'string') {
    return { status: 401, body: { error: 'Invalid username or password.' } }
  }

  const userQuery = UserModel.findOne({ username: normalizedUsername })
  const user = typeof userQuery.select === 'function'
    ? await userQuery.select('+passwordHash')
    : await userQuery
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    return { status: 401, body: { error: 'Invalid username or password.' } }
  }

  return {
    status: 200,
    body: {
      token: jwt.sign({ sub: String(user._id), username: user.username }, jwtSecret, {
        algorithm: 'HS256',
        expiresIn: '1h',
      }),
      user: { username: user.username },
    },
  }
}

export async function authenticateGoogleUser({
  UserModel,
  jwtSecret,
  credential,
  googleAuthClient,
  googleClientId,
}) {
  if (typeof credential !== 'string' || credential.length === 0) {
    return { status: 400, body: { error: 'A Google credential is required.' } }
  }

  if (!googleClientId) {
    return { status: 503, body: { error: 'Google sign-in is not configured on this server.' } }
  }

  let claims
  try {
    const ticket = await googleAuthClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    })
    claims = ticket.getPayload()
  } catch (error) {
    if (error?.name === 'GaxiosError') throw error
    return { status: 401, body: { error: 'The Google sign-in credential is invalid or expired.' } }
  }

  if (
    !claims
    || typeof claims.sub !== 'string'
    || !claims.sub
    || typeof claims.email !== 'string'
    || !claims.email.includes('@')
    || claims.email_verified !== true
  ) {
    return { status: 401, body: { error: 'A verified Google account is required.' } }
  }

  let user = await UserModel.findOne({ googleId: claims.sub })
  if (!user) {
    const emailPrefix = claims.email.split('@')[0]
    const normalizedPrefix = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32)
    const baseUsername = normalizedPrefix.length >= 3 ? normalizedPrefix : 'googleuser'
    let username = baseUsername
    let suffix = 1
    while (await UserModel.findOne({ username })) {
      const suffixText = `_${suffix++}`
      username = `${baseUsername.slice(0, 32 - suffixText.length)}${suffixText}`
    }

    user = new UserModel({
      username,
      googleId: claims.sub,
      email: claims.email,
      displayName: typeof claims.name === 'string' ? claims.name : '',
    })
    await user.save()
  }

  return {
    status: 200,
    body: {
      token: jwt.sign({ sub: String(user._id), username: user.username }, jwtSecret, {
        algorithm: 'HS256',
        expiresIn: '1h',
      }),
      user: { username: user.username },
    },
  }
}
