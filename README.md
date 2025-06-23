# Hana Backend API

A robust backend API for the Hana iOS app with real authentication, SMS verification, and user management.

## Features

- ✅ **Real Authentication System**
  - JWT-based access tokens
  - Refresh token rotation
  - Session management
  - Secure token storage

- ✅ **SMS Verification**
  - Twilio integration for real SMS
  - Rate limiting for verification codes
  - Code expiration and cleanup

- ✅ **User Management**
  - User registration and login
  - Profile management
  - Onboarding status tracking

- ✅ **Security Features**
  - Rate limiting
  - CORS protection
  - Helmet security headers
  - Token revocation

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/hana_db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# Twilio SMS Configuration (Optional for development)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Server Configuration
PORT=3000
NODE_ENV=development

# Security
CORS_ORIGIN=https://your-frontend-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Verification Code Settings
VERIFICATION_CODE_EXPIRES_IN=600000
MAX_VERIFICATION_ATTEMPTS=5
```

### 2. Database Setup

The app will automatically create the required tables on startup. Make sure your PostgreSQL database is running and accessible.

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/send-code` - Send verification code
- `POST /api/auth/verify-code` - Verify code and login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout (revoke token)
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/profile` - Update user profile

### Users

- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user

### Person Cards

- `GET /api/person-cards` - Get user's person cards
- `POST /api/person-cards` - Create new person card
- `PUT /api/person-cards/:id` - Update person card
- `DELETE /api/person-cards/:id` - Delete person card

## Authentication Flow

1. **Send Code**: User enters phone number → receives SMS with 6-digit code
2. **Verify Code**: User enters code → receives JWT access token + refresh token
3. **API Calls**: Include `Authorization: Bearer <access_token>` header
4. **Token Refresh**: When access token expires, use refresh token to get new tokens
5. **Logout**: Revoke refresh token to invalidate session

## SMS Configuration

### Development Mode
- Without Twilio: Codes are logged to console
- With Twilio: Real SMS sent to phone numbers

### Production Mode
- Requires Twilio account and configuration
- Real SMS sent to verified phone numbers

## Security Features

- **Rate Limiting**: Prevents abuse of verification endpoints
- **Token Rotation**: Refresh tokens are rotated on each use
- **Session Management**: Tracks active sessions and IP addresses
- **Automatic Cleanup**: Expired tokens and sessions are cleaned up hourly
- **CORS Protection**: Configurable origin restrictions

## Database Schema

### Users Table
- `id` (UUID) - Primary key
- `phone_number` (VARCHAR) - Unique phone number
- `full_name` (VARCHAR) - User's full name
- `hair_color` (VARCHAR) - User's hair color
- `is_onboarded` (BOOLEAN) - Onboarding completion status

### Verification Codes Table
- `id` (UUID) - Primary key
- `phone_number` (VARCHAR) - Phone number
- `code` (VARCHAR) - 6-digit verification code
- `expires_at` (TIMESTAMP) - Expiration time
- `used` (BOOLEAN) - Whether code has been used

### Refresh Tokens Table
- `id` (UUID) - Primary key
- `user_id` (UUID) - Foreign key to users
- `token` (VARCHAR) - Refresh token value
- `expires_at` (TIMESTAMP) - Expiration time
- `is_revoked` (BOOLEAN) - Whether token is revoked

### User Sessions Table
- `id` (UUID) - Primary key
- `user_id` (UUID) - Foreign key to users
- `access_token_hash` (VARCHAR) - Hashed access token
- `expires_at` (TIMESTAMP) - Expiration time
- `device_info` (TEXT) - Device information
- `ip_address` (VARCHAR) - IP address

## Deployment

### Railway (Recommended)
1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push to main branch

### Other Platforms
- **Heroku**: Add PostgreSQL addon and set environment variables
- **DigitalOcean**: Use App Platform with PostgreSQL database
- **AWS**: Use RDS for PostgreSQL and deploy to EC2 or ECS

## Development

### Running Tests
```bash
npm test
```

### Database Migrations
The app automatically creates tables on startup. For production, consider using a migration tool like `node-pg-migrate`.

### Local Development
1. Install PostgreSQL locally
2. Create database: `createdb hana_db`
3. Set `DATABASE_URL` in `.env`
4. Run `npm run dev`

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check `DATABASE_URL` format
   - Ensure PostgreSQL is running
   - Verify database exists

2. **SMS Not Sending**
   - Check Twilio credentials
   - Verify phone number format
   - Check Twilio account balance

3. **JWT Token Issues**
   - Verify `JWT_SECRET` is set
   - Check token expiration times
   - Ensure proper Authorization header format

### Logs
- Check console output for detailed error messages
- Database queries are logged in development mode
- SMS delivery status is logged

## Support

For issues and questions:
1. Check the logs for error messages
2. Verify environment variables are set correctly
3. Test database connectivity
4. Check Twilio account status (if using SMS) 