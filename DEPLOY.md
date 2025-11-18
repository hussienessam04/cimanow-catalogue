# 🚀 Deploy CimaNow Addon to Railway

## Prerequisites
- GitHub account
- Railway.app account (free, no credit card needed)

## Deployment Steps

### 1. Push to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - CimaNow Stremio Addon"

# Create GitHub repo and push
git remote add origin https://github.com/YOUR_USERNAME/cimanow-addon.git
git branch -M main
git push -u origin main
```

### 2. Deploy to Railway

1. **Go to Railway**: https://railway.app
2. **Sign up** with GitHub (no credit card needed!)
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Choose your repository**: `cimanow-addon`
6. Railway will:
   - ✅ Detect Dockerfile
   - ✅ Build container with Puppeteer
   - ✅ Deploy automatically
   - ✅ Assign public URL

### 3. Get Your Public URL

After deployment (2-3 minutes):
1. Go to your project in Railway
2. Click "Settings" → "Networking"
3. Click "Generate Domain"
4. Your URL: `https://cimanow-addon.up.railway.app`

### 4. Install in Stremio

Use your Railway URL:
```
https://cimanow-addon.up.railway.app/manifest.json
```

## 📊 Railway Free Tier Limits

- ✅ 500 execution hours/month
- ✅ $5 credit/month
- ✅ 1GB RAM
- ✅ Automatic deployments
- ✅ **NO credit card required!**

## 🔧 Environment Variables (Optional)

In Railway dashboard:
1. Go to "Variables" tab
2. Add variables if needed:
   - `PORT` (auto-set by Railway)
   - `NODE_ENV=production`

## 📝 Logs

View logs in Railway dashboard:
- Click your project → "Deployments" → View logs
- See Puppeteer browser launches
- Check cache hits/misses

## 🎉 Done!

Your addon is now running 24/7 on Railway!

Access it from anywhere:
```
https://your-addon.up.railway.app/manifest.json
```
