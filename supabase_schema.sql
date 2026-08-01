# Supabase Postgres Schema & Row Level Security (RLS) Setup for Cargo LR & Billing System

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE (Stores User Role: 'staff' or 'admin')
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text not null check (role in ('staff', 'admin')) default 'staff',
  full_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on Profiles
alter table public.profiles enable row level security;

-- Profiles Policies
create policy "Users can view their own profile." on public.profiles
  for select using (auth.uid() = id);

create policy "Admins can view all profiles." on public.profiles
  for select using (
    exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- Trigger to automatically create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'staff'),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. SEQUENTIAL DOCKET NUMBER GENERATOR
create sequence if not exists public.docket_number_seq start with 1001 increment by 1;

create or replace function generate_docket_number()
returns text as $$
declare
  seq_num bigint;
begin
  select nextval('public.docket_number_seq') into seq_num;
  return 'LR-' || to_char(now(), 'YYYY') || '-' || lpad(seq_num::text, 5, '0');
end;
$$ language plpgsql;


-- 3. CARGO DOCKETS TABLE (Main LR & GST Invoice Records)
create table if not exists public.cargo_dockets (
  id uuid default uuid_generate_v4() primary key,
  docket_no text not null unique default generate_docket_number(),
  created_by uuid references auth.users(id) not null default auth.uid(),
  status text not null check (status in ('issued', 'voided')) default 'issued',
  void_reason text,
  voided_at timestamp with time zone,
  voided_by uuid references auth.users(id),
  
  -- Header info
  booking_date date not null default current_date,
  transport_mode text not null default 'Road',
  is_international boolean default false,
  from_city text not null,
  to_city text not null,
  
  -- Consignor (Sender)
  consignor_name text not null,
  consignor_address text,
  consignor_pin text,
  consignor_phone text,
  consignor_gstin text,
  
  -- Consignee (Receiver)
  consignee_name text not null,
  consignee_address text,
  consignee_pin text,
  consignee_phone text,
  consignee_gstin text,
  
  -- Shipment specs
  package_count integer not null default 1,
  packing_method text,
  invoice_no text,
  invoice_value numeric(12,2),
  actual_weight_kg numeric(10,2),
  charged_weight_kg numeric(10,2),
  dimensions_lhb text,
  goods_description text,
  
  -- Charges Table (INR)
  freight_amount numeric(10,2) not null default 0.00,
  risk_charge numeric(10,2) default 0.00,
  handling_charge numeric(10,2) default 0.00,
  docket_charge numeric(10,2) default 0.00,
  pickup_delivery_charge numeric(10,2) default 0.00,
  other_charge numeric(10,2) default 0.00,
  subtotal numeric(10,2) not null default 0.00,
  gst_percentage numeric(5,2) not null default 18.00,
  gst_amount numeric(10,2) not null default 0.00,
  grand_total numeric(10,2) not null default 0.00,
  
  -- Payment
  payment_mode text not null check (payment_mode in ('Paid', 'To Pay', 'Credit')) default 'To Pay',
  customer_code text,
  
  -- Audit & Metadata
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on Cargo Dockets
alter table public.cargo_dockets enable row level security;

-- 1. SELECT POLICY: All authenticated users (admins) can view all dockets
create policy "Authenticated users can read all dockets" on public.cargo_dockets
  for select using (
    auth.role() = 'authenticated'
  );

-- 2. INSERT POLICY: Authenticated users can create new dockets
create policy "Authenticated users can insert cargo dockets" on public.cargo_dockets
  for insert with check (
    auth.uid() = created_by
  );

-- 3. UPDATE POLICY: Permanent records cannot be edited, ONLY voided with reason
create policy "Authenticated users can void dockets" on public.cargo_dockets
  for update using (
    auth.role() = 'authenticated'
  )
  with check (
    status = 'voided' and void_reason is not null
  );

-- 4. DELETE POLICY: HARD BAN — Permanent records are NEVER deleted from the DB
-- No DELETE policy is defined, ensuring Postgres rejects any DELETE query by default.

