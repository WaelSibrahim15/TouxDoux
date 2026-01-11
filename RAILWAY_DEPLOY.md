# Railway Deployment Guide

## Quick Setup

1. **Connect Repository to Railway**
   - Go to [Railway](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `TouxDoux` repository

2. **Configure Environment Variables**
   
   In Railway dashboard, add these environment variables:
   
   ```
   NODE_ENV=production
   PORT=3000 (Railway sets this automatically, but you can override)
   SESSION_SECRET=your-secret-key-here (generate a strong random string)
   ```
   
   Optional (for custom storage paths):
   ```
   UPLOADS_DIR=/path/to/uploads
   DB_PATH=/path/to/database.db
   ```

3. **Build Settings**
   - Railway will automatically detect the build command from `package.json`
   - Build command: `npm run build` (builds the frontend)
   - Start command: `npm start` (runs the Express server)

4. **Deploy**
   - Railway will automatically deploy when you push to the main branch
   - Or click "Deploy" in the Railway dashboard

## Important Notes

- **Database**: SQLite database will be created in the Railway filesystem (ephemeral storage)
  - For persistent storage, consider using Railway's PostgreSQL plugin or external storage
  - Files uploaded will be stored in the uploads directory (also ephemeral)

- **Sessions**: Make sure to set a strong `SESSION_SECRET` environment variable

- **CORS**: The app will automatically allow requests from Railway's public domain

- **Static Files**: The Express server serves the built frontend files in production

## Troubleshooting

- If the app doesn't load, check Railway logs for errors
- Ensure `NODE_ENV=production` is set
- Verify the build completed successfully
- Check that the PORT environment variable is set (Railway sets this automatically)

