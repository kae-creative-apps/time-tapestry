# Time Tapestry Deployment Guide

This project is a Next.js 15 app that runs on two domains: a marketing site and an application.

## Domains

| Domain | Purpose |
|--------|---------|
| `timetapestry.app` | Marketing site (landing, about, pricing, privacy, contact, nonprofit info) |
| `app.timetapestry.app` | The actual application (request, share, interview, keepsake, family, etc.) |

Both domains point to the same Vercel project. The code uses route groups for organization; deployment configuration handles subdomain routing.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, create a new project and import the repository.
3. Keep the default framework preset (`Next.js`).
4. Deploy.

## Domain configuration in Vercel

1. Open the project settings in Vercel.
2. Go to **Domains**.
3. Add the production domains:
   - `timetapestry.app`
   - `app.timetapestry.app`
4. Vercel will prompt you to update DNS. Choose the Vercel nameservers option or add the required A/CNAME records at your registrar.

### Vercel DNS records

If you are using Vercel DNS, add:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |
| CNAME | `app` | `cname.vercel-dns.com` |

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

## Build settings

Use the default Next.js build command:

```bash
npm run build
```

`next.config.js` in this repository uses the default Next.js build output and does not force static export.

## Subdomain routing

The application separates marketing and app pages using a Next.js route group:

- `src/app/(marketing)/` — marketing pages
- `src/app/` — application pages outside the route group

For deployment, configure the domains as described above. Vercel will route requests automatically:

- Anything sent to `timetapestry.app/*` serves the marketing pages.
- Anything sent to `app.timetapestry.app/*` serves the application pages.

If you need hostname-based logic later (`hostname === 'app.timetapestry.app'`), use `headers()` in a server component or `next/headers` middleware.

## Resend domain verification

Resend domain verification is already complete for the production domain. If you send from a different `from` address, verify that domain in the Resend dashboard before using it.

## Post-deploy checks

1. Visit `https://timetapestry.app` and confirm the landing page loads.
2. Visit `https://timetapestry.app/about`, `/pricing`, `/contact`, and `/privacy`.
3. Visit `https://app.timetapestry.app/demo` and confirm the app demo loads.
4. Submit the contact form on `/contact` and check the Vercel function logs.
5. Send a test email from `/request` or `/share` if email is configured.

## Rollback

Vercel keeps the last several deployments. You can roll back instantly from the **Deployments** tab in the Vercel dashboard.
