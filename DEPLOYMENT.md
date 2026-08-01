# Production Deployment & Client Handover Guide

This guide walks you through setting up a clean production environment on **Supabase** and deploying the **Cargo LR & Billing Terminal** to **Vercel**.

---

## Step 1: Create Client Supabase Project

1. Log into [supabase.com](https://supabase.com) (under the client's account or team organization).
2. Click **New Project** and configure:
   - **Name**: `Cargo-Billing-Production`
   - **Database Password**: Generate a secure password.
   - **Region**: Choose the closest region to the client's office.
3. Once provisioned, open **SQL Editor** in the left sidebar.
4. Open the local [`supabase_schema.sql`](./supabase_schema.sql) file, copy its contents, paste them into the SQL Editor, and click **Run**.

---

## Step 2: Provision Admin Accounts

1. In your Supabase Dashboard, navigate to **Authentication** $\rightarrow$ **Users**.
2. Click **Add User** $\rightarrow$ **Create User**.
3. Create accounts for the 2–3 staff/admin members:
   - Enter their company email address.
   - Assign an initial password.
4. Share the credentials securely with the client staff members.

---

## Step 3: Deploy to Vercel

1. Push your codebase to a private GitHub/GitLab repository.
2. Sign in to [vercel.com](https://vercel.com) and click **Add New** $\rightarrow$ **Project**.
3. Import your cargo repository.
4. Under **Environment Variables**, add the following keys:

```env
# Supabase API Credentials (from Supabase -> Project Settings -> API)
NEXT_PUBLIC_SUPABASE_URL=https://your-client-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-client-anon-key

# Client Company Details for PDF Invoices (Optional overrides)
NEXT_PUBLIC_COMPANY_NAME=EXPRESS CARGO LOGISTICS
NEXT_PUBLIC_COMPANY_TAGLINE=NON-NEGOTIABLE CARGO DOCKET / GST TAX INVOICE
NEXT_PUBLIC_COMPANY_ADDRESS=Plot 12, Industrial Logistics Park, Sector 4
NEXT_PUBLIC_COMPANY_PHONE=+91 98000 11223
NEXT_PUBLIC_COMPANY_GSTIN=27AAACA12341ZV
```

5. Click **Deploy**. Vercel will build and publish your site in ~1 minute.

---

## Step 4: Verification Checklist

- [ ] Navigate to your Vercel URL (e.g. `https://cargo-billing.vercel.app`).
- [ ] Log in with one of the pre-created admin user accounts.
- [ ] Issue a test docket and click **PDF** to verify invoice styling & company header details.
- [ ] Test voiding a docket and ensure audit history status changes to `VOIDED`.
