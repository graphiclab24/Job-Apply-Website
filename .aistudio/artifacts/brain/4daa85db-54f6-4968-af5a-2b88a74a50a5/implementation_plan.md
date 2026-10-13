# 0-Cost 1M+ Scale Architecture: Cloudflare R2 CDN + Google Sheets Webhook Migration

A comprehensive architectural migration plan to decouple BD Job Apply from Firestore database read/write limits, restricting Firebase **exclusively to User Authentication**, and routing all public circulars through **Cloudflare R2 Global CDN** and applicant submissions through **Google Sheets via Google Apps Script Webhook** for 100% zero-cost operation capable of handling 1,000,000+ users.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Based on your answers:
> 1. **Public Job Circulars Speed**: Stored in Cloudflare R2 (`jobs.json`, `feed.json`) and cached in server RAM + browser edge memory. This gives **sub-20ms global load speeds** with unlimited free bandwidth and 0 read limits.
> 2. **Candidate Job Applications & Submissions**: Handled via Google Sheets + Google Apps Script Webhook. Submissions write directly to your Google Spreadsheet with zero Firestore reads/writes and 0 cost.
> 3. **Firebase Role**: **Strictly User Authentication only** (Google Sign-In, User Profile, Session management). All Firestore queries for jobs, feed, and applications will be completely removed.
> 4. **Immediate Admin Post Visibility**: Fixed with instant optimistic state injection and cache-busting sync so newly posted circulars appear immediately on `/admin/jobs` and the homepage.

---

## 1. Overview & Core Concept

* **The Problem**: Firestore free tier limits daily reads to 50,000. When that quota is reached, the website fails to load circulars and admin cannot post or view jobs.
* **The Solution**: 
  * Restrict **Firebase to Authentication only** (Google Auth & Email Login have no database read quotas).
  * Serve **all public jobs, categories, and homepage feeds** from Cloudflare R2 CDN + RAM cache (unlimited reads, 0 bandwidth cost, 100% uptime).
  * Record **all job applications and applicant CV/payment data** to a Google Sheet via Google Apps Script Webhook (unlimited rows, instant spreadsheet access, 0 cost).
  * Fix the admin form submission flow so newly created circulars **immediately reflect in the admin list** without caching delays.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BD JOB APPLY ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

       [ CLIENT BROWSER (1,000,000+ Users) ]
            │                  │                     │
            │ (Auth Only)      │ (0ms Public Feed)   │ (Submit Application)
            ▼                  ▼                     ▼
    ┌───────────────┐  ┌───────────────┐     ┌───────────────────────┐
    │ Firebase Auth │  │ Cloudflare R2 │     │   Google Apps Script  │
    │  (Google/Mail)│  │   Global CDN  │     │   Webhook Endpoint    │
    │  Zero DB Reads│  │  (Unlimited)  │     │   (Zero-Cost Proxy)   │
    └───────────────┘  └───────┬───────┘     └───────────┬───────────┘
                               │                         │
                               ▼                         ▼
                       ┌───────────────┐     ┌───────────────────────┐
                       │   jobs.json   │     │     Google Sheets     │
                       │   feed.json   │     │  (Unlimited Applicants│
                       │ Images / PDFs │     │   & Payment Records)  │
                       └───────────────┘     └───────────────────────┘
```

---

## 2. Technical Architecture & Migration Strategy

### Component 1: Zero-Firestore Public Jobs Delivery (Ultra-Fast)
1. **Cloudflare R2 as Single Source of Truth for Jobs**:
   - `jobs.json`: Full catalog of all published jobs and their HTML circulars.
   - `feed.json`: Lightweight summary (top 50 active circulars with deadline, category, and slug).
2. **Multi-Tier Edge Caching**:
   - Tier 1: Client Memory Cache (0ms)
   - Tier 2: Server RAM Cache with stale-while-revalidate (2ms)
   - Tier 3: Cloudflare R2 Edge CDN (`https://pub-1c4d2bddd5d943c38d6824eeb890c6f0.r2.dev/feed.json`)
   - **Firestore Read Calls**: 100% eliminated from HomePage, JobsPage, and JobDetailsPage.

### Component 2: Instant Admin Job Form & List Fix
1. **Fix Newly Posted Job Visibility**:
   - In `AdminJobFormPage.tsx`: When admin clicks submit, post to `/api/admin/jobs/save`.
   - Update in-memory server cache and push to Cloudflare R2 immediately.
   - Update local `admin_jobs` cache optimistically before routing to `/admin/jobs`.
   - In `AdminJobsListPage.tsx`: Fetch with `?t=${Date.now()}` cache-buster and merge any newly added jobs immediately so the list never shows empty.

### Component 3: Google Sheets Webhook Integration for Applications
1. **Google Apps Script Bridge**:
   - A lightweight Google Apps Script deployed as a Web App (`doPost(e)`).
   - Writes new candidate submissions into Google Sheet tabs:
     - `Applications`: Candidate name, mobile, job title, fee, transaction ID, status, date.
     - `Contact/Support`: Inquiries from candidates.
2. **Admin & User View**:
   - Admin can view applications inside the Admin Portal via `/api/applications` (proxied from Google Sheets) or directly in Google Sheets.
   - Users view their submitted applications stored in their authenticated profile/session without Firestore reads.

### Component 4: Storage & Assets (Cloudflare R2)
- All circular image scans, PDF attachments, and candidate photos continue to upload directly to Cloudflare R2 bucket `bdjob-files` via the existing S3 client integration.

---

## 3. Step-by-Step Implementation Flow

1. **Step 1: Admin Save & Immediate List Reflection Fix**
   - Enhance `/api/admin/jobs/save` to immediately update memory, write disk backup, and sync to Cloudflare R2.
   - Add cache-busting timestamping to `/api/jobs` and `/api/feed/latest`.
   - Update `AdminJobFormPage.tsx` and `AdminJobsListPage.tsx` to optimistically append the new job into state.

2. **Step 2: Remove All Firestore Reads from Public Pages**
   - Update `HomePage.tsx`, `JobsPage.tsx`, and `JobDetailsPage.tsx` to read exclusively from Cloudflare R2 / Server API with zero Firestore fallback.
   - Remove background Firestore read queries that trigger quota exhaustion.

3. **Step 3: Google Sheets Apps Script Webhook Setup**
   - Provide the Google Apps Script template for the user.
   - Add endpoint `/api/applications/submit` that forwards applicant data to the Google Sheets Webhook.
   - Enable applicant list display for the admin panel backed by the Sheets API / local cache.

4. **Step 4: Verification & Live Test**
   - Verify posting a new circular appears immediately in the admin list.
   - Verify public website loads the new circular from Cloudflare R2 at ultra-fast speed.
   - Verify Firestore database shows 0 read operations.
