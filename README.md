# Grocery List Scanner App

A simple mobile-friendly web app (PWA-ready) that lets you take a photo of a handwritten grocery list, uses Tesseract.js for OCR, and stores the items in your Supabase database. Check items off on any device.

## Features
- Camera capture for handwritten lists
- Client-side OCR (no images uploaded unless you add Storage)
- Syncs checklist to Supabase (realtime updates)
- Works on phone browser; add to home screen for app-like feel

## Setup

### 1. Supabase Table
In your Supabase SQL Editor, run:

```sql
create table grocery_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  checked boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS
alter table grocery_items enable row level security;

-- Simple policies (adjust for your auth needs; for demo, allow anon)
create policy "Allow all for anon" on grocery_items
  for all using (true) with check (true);
```

For production, use authenticated users and tighter policies.

### 2. Get Credentials
- Project URL: Settings → API → Project URL
- anon public key: Settings → API → Project API keys → anon public

### 3. Run the App
- Open `index.html` in a browser (or host it on Vercel/Netlify/GitHub Pages)
- Enter URL and key once (stored in localStorage)
- Tap "Take Photo of List", capture your handwritten list
- Items appear as a checkable list

### Hosting for Phone
- Upload the folder to Vercel (drag & drop) or Netlify
- Open the URL on your phone
- Add to Home Screen (iOS Safari or Android Chrome)

### Notes
- OCR works best with clear handwriting, good lighting, high contrast
- Tesseract is client-side; for better handwritten recognition, consider upgrading to a cloud OCR or AI vision API later
- Realtime sync requires the channel subscription (included)
- Clear All deletes everything

Customize as needed!
