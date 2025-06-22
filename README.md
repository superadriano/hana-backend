# Hana Backend API

This is the backend API for the Hana iOS app, providing authentication, user management, and person card functionality.

## Quick Deploy to Railway

### 1. Deploy to Railway (Recommended)

1. **Fork/Clone this repository**
2. **Go to [railway.app](https://railway.app)**
3. **Sign up with GitHub**
4. **Create new project → Deploy from GitHub repo**
5. **Add PostgreSQL database:**
   - Go to your project
   - Click "New" → "Database" → "PostgreSQL"
   - Railway will automatically set `DATABASE_URL` environment variable

### 2. Set Environment Variables

In Railway dashboard, add these environment variables:

```bash
# Required
DATABASE_URL=postgresql://... (auto-set by Railway)
JWT_SECRET=your-super-secret-jwt-key-here
NODE_ENV=production

# Optional (for SMS)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### 3. Initialize Database

After deployment, the database tables will be created automatically on first run.

## Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Set up Environment
Create `.env` file:
```bash
DATABASE_URL=postgresql://username:password@localhost:5432/hana_db
JWT_SECRET=your-secret-key
NODE_ENV=development
```

### 3. Run Development Server
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/send-code` - Send SMS verification code
- `POST /api/auth/verify-code` - Verify SMS code
- `POST /api/auth/refresh` - Refresh access token

### Users
- `POST /api/users/profile` - Create user profile
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile

### Person Cards
- `POST /api/person-cards` - Create person card
- `GET /api/person-cards` - Get user's person cards
- `PUT /api/person-cards/:id` - Update person card
- `DELETE /api/person-cards/:id` - Delete person card
- `POST /api/person-cards/:id/discoverable` - Toggle discoverability

## Testing

Test the API with curl:

```bash
# Health check
curl https://your-railway-app.railway.app/health

# Send verification code
curl -X POST https://your-railway-app.railway.app/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "platform": "ios"}'
```

## SMS Configuration

For real SMS delivery, set up Twilio:

1. **Sign up at [twilio.com](https://twilio.com)**
2. **Get Account SID and Auth Token**
3. **Buy a phone number**
4. **Set environment variables in Railway**

For development/testing, SMS codes are logged to console.

## Production Checklist

- [ ] Deploy to Railway/Heroku
- [ ] Set up PostgreSQL database
- [ ] Configure environment variables
- [ ] Set up Twilio for SMS (optional)
- [ ] Test all endpoints
- [ ] Update iOS app with production API URL 