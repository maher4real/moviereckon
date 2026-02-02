# MovieReckon - Vercel Deployment Guide

## Prerequisites

1. **Vercel Account**: https://vercel.com (free tier works)
2. **GitHub Repository**: Your project pushed to GitHub
3. **MongoDB Atlas Account**: https://www.mongodb.com/cloud/atlas (free tier works)
4. **MongoDB Connection String**: From your Atlas cluster

## Step 1: Prepare MongoDB

### 1.1 Create MongoDB Atlas Cluster
- Go to https://cloud.mongodb.com
- Create a cluster (free M0 tier)
- Create a database user with strong password
- Whitelist your IP (or use 0.0.0.0/0 for simplicity)
- Get connection string: `mongodb+srv://user:password@cluster.mongodb.net/`

### 1.2 Verify Connection String Format
```
mongodb+srv://vijapura79_db_user:4pWiCNML53tCAC5Z@cluster1.jojynov.mongodb.net/moviereckon
                                                                              ^^^^^^^^^^
                                                                    Database name required
```

## Step 2: Deploy to Vercel

### 2.1 Push to GitHub
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 2.2 Connect to Vercel
1. Go to https://vercel.com/new
2. Click "Import Project"
3. Select your GitHub repository
4. Click "Import"

### 2.3 Set Environment Variables
In Vercel dashboard, add these environment variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `MONGODB_URI` | `mongodb+srv://...` | Full connection string |
| `MONGODB_DB_NAME` | `moviereckon` | Database name |
| `JWT_SECRET` | Generate a random string | See below |
| `VITE_MONGODB_API_URL` | `https://your-app.vercel.app` | Your deployed URL (after first deploy) |

### Generate JWT_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste into Vercel dashboard.

### 2.4 Deploy
1. Click "Deploy"
2. Wait for deployment to complete
3. Copy your deployed URL (e.g., `https://moviereckon-xyz.vercel.app`)

### 2.5 Update VITE_MONGODB_API_URL
1. Go back to Vercel Project Settings
2. Edit Environment Variables
3. Update `VITE_MONGODB_API_URL` to your deployed URL
4. Redeploy

**To redeploy:**
```bash
git commit --allow-empty -m "Trigger redeploy"
git push origin main
```

## Step 3: Verify Deployment

### Test Health Check
```bash
curl https://your-app.vercel.app/api/health
```

Expected Response:
```json
{
  "status": "healthy",
  "database": "connected",
  "latency_ms": 45,
  "timestamp": "2026-02-02T08:56:30.761Z"
}
```

### Test Frontend
1. Visit https://your-app.vercel.app
2. Register a new account
3. Login
4. Test core features (like, watch, browse)

### Verify MongoDB Data
- Check MongoDB Atlas UI
- Should see documents in collections

## Troubleshooting

### API Returns 404
- Verify `vercel.json` is in root directory
- Check that `api/` folder exists with handlers
- Redeploy after changes

### MongoDB Connection Failed
- Verify `MONGODB_URI` in Vercel dashboard
- Check IP whitelist in MongoDB Atlas
- Ensure database name is correct
- Test connection string locally first

### Authentication Not Working
- Verify `JWT_SECRET` is set
- Check Auth headers being sent (`Authorization: Bearer ...`)
- Look at Vercel Function logs for errors

### Frontend Can't Reach API
- Verify `VITE_MONGODB_API_URL` matches your Vercel URL
- Check browser Network tab for CORS errors
- Ensure API server is responding to requests

## Environment Variables Checklist

Before deploying, ensure these are set in Vercel:

```bash
MONGODB_URI=mongodb+srv://[user]:[password]@[cluster].mongodb.net/[database]
MONGODB_DB_NAME=moviereckon
JWT_SECRET=[generate-a-random-string]
VITE_MONGODB_API_URL=https://[your-app].vercel.app
```

## Production Best Practices

1. **Strong JWT_SECRET**: Use cryptographically secure random string
2. **IP Whitelist**: Restrict MongoDB access to Vercel IPs
3. **HTTPS Only**: Vercel uses HTTPS by default
4. **Monitor Logs**: Check Vercel Function logs regularly
5. **Database Backups**: Enable automatic backups in MongoDB Atlas
6. **Rate Limiting**: Consider adding rate limiting for auth endpoints
7. **CORS**: Review CORS policy in vercel.json

## Rollback

If something breaks:
```bash
# Revert last commit
git revert HEAD

# Push to trigger redeploy
git push origin main

# Or use Vercel dashboard to rollback to previous deployment
```

## Monitoring

### Vercel Dashboard
- Function logs: See all API requests and errors
- Usage: Monitor bandwidth and function invocations
- Analytics: Track performance metrics

### MongoDB Atlas
- Activity Log: See all database operations
- Alerts: Configure alerts for unusual activity
- Metrics: Monitor CPU, memory, connections

## Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **MongoDB Docs**: https://docs.mongodb.com
- **Error Codes**: Check Vercel Function logs for specific errors

---

## Quick Deploy Checklist

- [ ] Code pushed to GitHub
- [ ] MongoDB connection string ready
- [ ] Vercel account created
- [ ] Repository connected to Vercel
- [ ] Environment variables set:
  - [ ] MONGODB_URI
  - [ ] MONGODB_DB_NAME
  - [ ] JWT_SECRET
- [ ] Initial deployment complete
- [ ] Update VITE_MONGODB_API_URL with deployed URL
- [ ] Redeploy after updating VITE_MONGODB_API_URL
- [ ] Test /api/health endpoint
- [ ] Test frontend at deployed URL
- [ ] Verify MongoDB data creation

**Deployment Status**: Ready to deploy 🚀
