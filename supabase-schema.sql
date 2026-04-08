-- ============================================================
-- CBO HubSpace — Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE 1: contacts
-- Source: Contact form on index.html
-- ============================================================
create table if not exists contacts (
  id                uuid default uuid_generate_v4() primary key,
  created_at        timestamptz default now() not null,
  church_name       text not null,
  city              text,
  state             text,
  denomination      text,
  contact_name      text not null,
  email             text not null,
  phone             text,
  is_open           text,           -- 'Yes' | 'No'
  building_status   text,           -- 'Own' | 'Lease' | 'Other arrangement'
  annual_budget     text,           -- 'Under $15,000' | '$15,000 – $50,000' | '$50,000+'
  has_programs      text,           -- 'Yes' | 'No' | 'Planning to'
  source_page       text default 'index'
);

-- Row Level Security
alter table contacts enable row level security;

-- Anonymous users can INSERT only (public form submission)
create policy "Public can insert contacts"
  on contacts for insert
  to anon
  with check (true);

-- Only authenticated admin can read
create policy "Authenticated can read contacts"
  on contacts for select
  to authenticated
  using (true);

-- Only authenticated admin can update or delete
create policy "Authenticated can update contacts"
  on contacts for update
  to authenticated
  using (true);

create policy "Authenticated can delete contacts"
  on contacts for delete
  to authenticated
  using (true);

-- ============================================================
-- TABLE 2: scorecard_results
-- Source: Scorecard tool on scorecard.html
-- ============================================================
create table if not exists scorecard_results (
  id                    uuid default uuid_generate_v4() primary key,
  created_at            timestamptz default now() not null,
  church_name           text not null,
  contact_name          text,
  email                 text not null,
  denomination          text,
  assessment_date       date,
  total_score           integer check (total_score >= 0 and total_score <= 120),
  sustainability_band   text,       -- 'Strongly Sustainable' | 'Stable — Needs Attention' | 'At Risk — Intervention Needed' | 'Unsustainable Trajectory'
  financial_score       integer check (financial_score >= 0 and financial_score <= 25),
  attendance_score      integer check (attendance_score >= 0 and attendance_score <= 20),
  demographics_score    integer check (demographics_score >= 0 and demographics_score <= 15),
  leadership_score      integer check (leadership_score >= 0 and leadership_score <= 20),
  facilities_score      integer check (facilities_score >= 0 and facilities_score <= 15),
  mission_score         integer check (mission_score >= 0 and mission_score <= 15),
  digital_score         integer check (digital_score >= 0 and digital_score <= 10),
  raw_answers           jsonb       -- Full question-level responses
);

-- Row Level Security
alter table scorecard_results enable row level security;

create policy "Public can insert scorecard results"
  on scorecard_results for insert
  to anon
  with check (true);

create policy "Authenticated can read scorecard results"
  on scorecard_results for select
  to authenticated
  using (true);

create policy "Authenticated can update scorecard results"
  on scorecard_results for update
  to authenticated
  using (true);

create policy "Authenticated can delete scorecard results"
  on scorecard_results for delete
  to authenticated
  using (true);

-- ============================================================
-- TABLE 3: members
-- Source: Stripe webhook via Netlify function
-- ============================================================
create table if not exists members (
  id                  uuid default uuid_generate_v4() primary key,
  created_at          timestamptz default now() not null,
  church_name         text,
  email               text not null,
  membership_tier     text,         -- 'Tier 1' | 'Tier 2'
  annual_amount       integer,      -- 150 or 500
  stripe_session_id   text unique,  -- Stripe Checkout Session ID
  payment_status      text default 'pending', -- 'pending' | 'paid' | 'failed'
  membership_start    date,
  membership_end      date,
  promo_applied       boolean default false   -- Complementary year flag
);

-- Row Level Security
alter table members enable row level security;

create policy "Public can insert members"
  on members for insert
  to anon
  with check (true);

create policy "Authenticated can read members"
  on members for select
  to authenticated
  using (true);

create policy "Authenticated can update members"
  on members for update
  to authenticated
  using (true);

create policy "Authenticated can delete members"
  on members for delete
  to authenticated
  using (true);

-- ============================================================
-- USEFUL VIEWS FOR REPORTING
-- ============================================================

-- Contact summary view
create or replace view contact_summary as
select
  date_trunc('week', created_at) as week,
  count(*) as total_contacts,
  count(case when is_open = 'Yes' then 1 end) as currently_open,
  count(case when building_status = 'Own' then 1 end) as owns_building,
  count(case when annual_budget = 'Under $15,000' then 1 end) as budget_under_15k,
  count(case when annual_budget = '$15,000 – $50,000' then 1 end) as budget_15k_50k,
  count(case when annual_budget = '$50,000+' then 1 end) as budget_50k_plus,
  count(case when has_programs = 'Yes' then 1 end) as has_programs
from contacts
group by week
order by week desc;

-- Scorecard summary view
create or replace view scorecard_summary as
select
  date_trunc('week', created_at) as week,
  count(*) as total_assessments,
  round(avg(total_score), 1) as avg_total_score,
  round(avg(financial_score), 1) as avg_financial,
  round(avg(attendance_score), 1) as avg_attendance,
  round(avg(demographics_score), 1) as avg_demographics,
  round(avg(leadership_score), 1) as avg_leadership,
  round(avg(facilities_score), 1) as avg_facilities,
  round(avg(mission_score), 1) as avg_mission,
  round(avg(digital_score), 1) as avg_digital,
  count(case when sustainability_band = 'Strongly Sustainable' then 1 end) as strongly_sustainable,
  count(case when sustainability_band = 'Stable — Needs Attention' then 1 end) as stable,
  count(case when sustainability_band = 'At Risk — Intervention Needed' then 1 end) as at_risk,
  count(case when sustainability_band = 'Unsustainable Trajectory' then 1 end) as unsustainable
from scorecard_results
group by week
order by week desc;

-- Membership summary view
create or replace view membership_summary as
select
  date_trunc('month', created_at) as month,
  count(*) as total_members,
  count(case when membership_tier = 'Tier 1' then 1 end) as tier_1_count,
  count(case when membership_tier = 'Tier 2' then 1 end) as tier_2_count,
  sum(case when payment_status = 'paid' then annual_amount else 0 end) as total_revenue,
  count(case when payment_status = 'paid' then 1 end) as paid_members,
  count(case when promo_applied = true then 1 end) as promo_members
from members
group by month
order by month desc;

-- ============================================================
-- SETUP COMPLETE
-- Next steps:
-- 1. Go to Project Settings → API
-- 2. Copy your Project URL and anon public key
-- 3. Add both to Netlify environment variables:
--    SUPABASE_URL = https://xxxx.supabase.co
--    SUPABASE_ANON_KEY = eyJhbGci...
-- ============================================================
