# MovieReckon - Vercel Deployment Checklist

## Pre-Deployment Setup

### Local Environment

- [x] Code cleaned up (removed local dev files)
- [x] Dependencies updated for production
- [x] vercel.json configured correctly
- [x] API handlers in /api directory
- [x] MongoDB connection code in api/lib/mongodb.ts
- [x] .env.example updated with production variables

### Version Control

- [ ] All changes committed to git
- [ ] Code pushed to GitHub main branch
- [ ] GitHub repository linked to Vercel account

### MongoDB Atlas Setup

- [ ] MongoDB Atlas account created (https://www.mongodb.com/cloud/atlas)
- [ ] Free M0 cluster created
- [ ] Database user created with strong password
- [ ] IP whitelist configured (0.0.0.0/0 for simplicity)
- [ ] Connection string obtained from "Connect" button
- [ ] Tested connection string locally

## Vercel Deployment

### Account & Project

- [ ] Vercel account created (https://vercel.com)
- [ ] Repository imported into Vercel
- [ ] Project name set to "moviereckon" (or preferred name)

### Environment Variables in Vercel Dashboard

- [ ] `MONGODB_URI` = Full connection string from MongoDB Atlas
- [ ] `MONGODB_DB_NAME` = "moviereckon"
- [ ] `JWT_SECRET` = Generated random string (see below)
- [ ] `VITE_MONGODB_API_URL` = Will set after first deploy

**To generate JWT_SECRET:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Initial Deployment

- [ ] All environment variables set (except VITE_MONGODB_API_URL)
- [ ] Click "Deploy" in Vercel
- [ ] Deployment completes successfully
- [ ] Vercel provides deployment URL (e.g., https://moviereckon-xyz.vercel.app)

### Post-Deployment Configuration

- [ ] Update `VITE_MONGODB_API_URL` to your Vercel deployment URL
- [ ] Trigger redeploy:
  ```bash
  git commit --allow-empty -m "Update API URL"
  git push origin main
  ```
- [ ] Wait for redeploy to complete

## Verification

### API Endpoint Testing

- [ ] Health endpoint responds: `curl https://YOUR_URL/api/health`
  - Expected: `{"status":"healthy","database":"connected",...}`
- [ ] Register endpoint works (test with curl or Postman)
- [ ] Login endpoint works
- [ ] Me endpoint works with token

### Frontend Testing

- [ ] Visit `https://YOUR_URL` in browser
- [ ] Register a new account
- [ ] Receive confirmation
- [ ] Can login with credentials
- [ ] Can browse movies/TV shows
- [ ] Can like content
- [ ] Can mark as watched
- [ ] Recommendations display

### MongoDB Verification

- [ ] Login to MongoDB Atlas
- [ ] Check "moviereckon" database exists
- [ ] Collections created:
  - [ ] users
  - [ ] refresh_tokens
  - [ ] user_preferences
  - [ ] liked_items
  - [ ] watch_history
- [ ] User document created after registration
- [ ] Like document created after liking content
- [ ] Watch document created after watching content

### Monitoring

- [ ] Check Vercel Function logs for errors
- [ ] Check MongoDB Atlas metrics
- [ ] Monitor API response times
- [ ] Check error rates

## Troubleshooting Guide

### API Returns 404

- [ ] Check vercel.json is in root directory
- [ ] Verify api/ folder exists
- [ ] Check file extensions are .ts
- [ ] Review Vercel Function logs

### MongoDB Connection Error

- [ ] Verify MONGODB_URI is correct
- [ ] Check IP is whitelisted in MongoDB Atlas
- [ ] Test connection string locally first
- [ ] Ensure database name is included in URI

### Authentication Failed

- [ ] Verify JWT_SECRET is set in Vercel
- [ ] Check Authorization header in requests
- [ ] Review Vercel Function logs for errors
- [ ] Test /api/auth/login endpoint directly

### Frontend Can't Reach API

- [ ] Verify VITE_MONGODB_API_URL matches deployment URL
- [ ] Check browser console for CORS errors
- [ ] Verify API is responding to health check
- [ ] Check Network tab in browser DevTools

### Data Not Persisting

- [ ] Verify MONGODB_URI is correct
- [ ] Check MongoDB Atlas connection status
- [ ] Review MongoDB Atlas logs
- [ ] Ensure database collections exist

## Performance & Optimization

### Vercel Settings

- [ ] Configure regions for optimal latency
- [ ] Enable automatic rebuilds on git push
- [ ] Monitor function duration
- [ ] Check bandwidth usage

### MongoDB Optimization

- [ ] Consider database indexing for frequently queried fields
- [ ] Monitor database size and performance
- [ ] Set up alerts for unusual activity
- [ ] Enable automatic backups

### Optional Improvements

- [ ] Add rate limiting to auth endpoints
- [ ] Implement request logging/monitoring
- [ ] Add error tracking (Sentry, etc.)
- [ ] Set up CI/CD pipeline

## Production Safety

- [ ] Strong JWT_SECRET (32+ random characters)
- [ ] IP whitelist in MongoDB Atlas
- [ ] HTTPS enforced (Vercel default)
- [ ] Secrets not hardcoded
- [ ] Regular backups enabled
- [ ] Error logging enabled
- [ ] Monitoring active

## Post-Deployment

### Monitoring Checklist

- [ ] Check Vercel Analytics dashboard weekly
- [ ] Monitor MongoDB Atlas metrics
- [ ] Review error logs regularly
- [ ] Test critical user flows periodically

### Maintenance

- [ ] Update dependencies monthly
- [ ] Review MongoDB backups
- [ ] Monitor costs (Vercel + MongoDB)
- [ ] Keep JWT_SECRET secure

### Scaling (When Needed)

- [ ] Upgrade MongoDB tier from M0
- [ ] Enable database sharding for large datasets
- [ ] Add CDN for static assets
- [ ] Implement caching layers

## Rollback Plan

If deployment has critical issues:

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# OR use Vercel dashboard to rollback
# Vercel → Project → Deployments → Select previous → Rollback
```

## Final Verification Commands

```bash
# Test health endpoint
curl https://YOUR_APP_URL/api/health

# Test registration
curl -X POST https://YOUR_APP_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass123","username":"testuser"}'

# Test login
curl -X POST https://YOUR_APP_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass123"}'
```

## Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **MongoDB Docs**: https://docs.mongodb.com
- **See DEPLOYMENT.md** for detailed step-by-step guide
- **See README_DEPLOYMENT.md** for overview

---

**Deployment Status**: Ready ✅  
**All Systems**: Configured and tested  
**Ready to Deploy**: YES
