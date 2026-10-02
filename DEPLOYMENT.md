# Time Tapestry Deployment Guide

This project is a Next.js 15 app that runs on the root domain.

## Domain

| Domain | Purpose |
|--------|---------|
| `timetapestry.app` | The application (landing, share, interview, keepsake, family, etc.) |

For the hackathon, the root domain is the app. A separate marketing site and `app.timetapestry.app` subdomain are not in use.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, create a new project and import the repository.
3. Keep the default framework preset (`Next.js`).
4. Deploy.

## Domain configuration in Vercel

1. Open the project settings in Vercel.
2. Go to **Domains**.
3. Add the production domain:
   - `timetapestry.app`
4. Vercel will prompt you to update DNS. Choose the Vercel nameservers option or add the required A/CNAME records at your registrar.

The `app.timetapestry.app` subdomain can be kept as an alias or removed; all user-facing pages live on `timetapestry.app`.

### Vercel DNS records

If you are using Vercel DNS, add:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Replace the A record with the value Vercel shows you if it differs. The exact records will be listed in the Vercel dashboard during domain setup.

## Environment variables

Set these in **Vercel Project Settings > Environment Variables**:

| Variable | Required | Notes |
|----------|----------|-------|
| `OPENAI_API_KEY` | No | Enables live speech-to-text and story generation. Mock mode works without it. |
| `GLOO_API_KEY` | No | Enables Gloo AI Studio model. Mock mode works without it. |
| `ELEVENLABS_API_KEY` | No | Enables AI voice interviewer audio. Browser TTS fallback works without it. |
| `LOB_API_KEY` | No | Enables real postcard mailing. Console logging works without it. |
| `RESEND_API_KEY` | No | Enables real email sending. Console logging works without it. Email domain verification already done in Resend. |
| `RESEND_FROM_EMAIL` | No | Default `from` address. `onboarding@resend.dev` can be used during testing. |
| `NEXT_PUBLIC_APP_URL` | Yes | Set to `https://timetapestry.app` in production. |

## Build settings

Use the default Next.js build command:

```bash
npm run build
```

`next.config.js` in this repository uses the default Next.js build output and does not force static export.

## Post-deploy checks

1. Visit `https://timetapestry.app` and confirm the landing page loads.
2. Visit `https://timetapestry.app/share` and start a live interview.
3. Visit `https://timetapestry.app/about`, `/pricing`, `/org`, and `/privacy`.
4. Confirm `https://timetapestry.app/contact` returns 404.
5. Send a test email from `/request` or `/share` if email is configured.

## Rollback

Vercel keeps the last several deployments. You can roll back instantly from the **Deployments** tab in the Vercel dashboard.
