# Glance — Live Google Analytics Dashboard

Multi-website live GA4 dashboard. No demo/fake data — every number comes from the Google Analytics Data API.

## Features

- Switch between websites (GA4 properties)
- Live active users (refresh every 15s)
- Users, sessions, page views, bounce rate
- Traffic sources, top pages, countries, devices
- Mobile-friendly UI

## Add another website

1. In Google Analytics Admin → Property access management, add  
   `glance-reader@glance-dashboard-504511.iam.gserviceaccount.com` as **Viewer**
2. Add the property to `GA_PROPERTIES` in `.env.local` / Vercel env:

```json
[
  {"id":"547222815","name":"Monza SAL","url":"monza"},
  {"id":"123456789","name":"Second Site","url":"example.com"}
]
```

3. Restart / redeploy

## Local

```bash
npm install
npm run dev
```

## Deploy (Vercel)

Set these environment variables, then deploy:

- `GA_PROPERTIES`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

## Live data notes

- **Realtime panel** = true live (active users now)
- **Overview charts/metrics** = official GA4 reporting data (usually minutes behind, same as Google Analytics)
