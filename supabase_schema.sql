-- 1. Organizations (Multi-tenant Root)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'client' CHECK (type IN ('client', 'vendor', 'internal')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure type column exists (Migration patch for existing DBs)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='type') THEN
    ALTER TABLE companies ADD COLUMN type TEXT;
  END IF;
END $$;

-- 2. Agreements (MSA/NDA Tracking)
CREATE TABLE IF NOT EXISTS agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  type TEXT CHECK (type IN ('MSA', 'NDA')),
  file_url TEXT,
  status TEXT DEFAULT 'pending', -- pending, signed, expired
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Profiles (Users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  email TEXT,
  company_id UUID REFERENCES companies(id),
  role TEXT CHECK (role IN ('admin', 'client_manager', 'vendor_manager', 'recruiter', 'vendor', 'client')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix Profiles table: Rename legacy 'company' column if it exists to 'company_id' and ensure it's UUID
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='company') THEN
    -- Only rename if company_id doesn't already exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='company_id') THEN
      ALTER TABLE profiles RENAME COLUMN company TO company_id;
    END IF;
  END IF;

  -- Ensure company_id is UUID type for RLS reliability
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='company_id' AND data_type = 'text') THEN
    ALTER TABLE profiles ALTER COLUMN company_id TYPE UUID USING NULLIF(company_id, '')::UUID;
  END IF;
END $$;

-- 4. Clients (Extended)
CREATE TABLE IF NOT EXISTS client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  industry TEXT,
  client_tier TEXT DEFAULT 'standard', -- standard, silver, gold
  margin_preferred NUMERIC DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy Clients Table (to match existing code)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  industry TEXT,
  budget TEXT,
  contact_person TEXT,
  website TEXT,
  client_code TEXT,
  notes TEXT,
  user_id UUID, -- Added for simplified Dev RLS
  company_id UUID REFERENCES companies(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure website column exists for Clients
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='website') THEN
    ALTER TABLE clients ADD COLUMN website TEXT;
  END IF;
  -- Also ensure company_id exists on clients if not there
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='company_id') THEN
    ALTER TABLE clients ADD COLUMN company_id UUID REFERENCES companies(id);
  END IF;
END $$;

-- 4b. Vendors Table (Mirroring Clients for code compatibility)
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  type TEXT DEFAULT 'vendor',
  company TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  specialization TEXT[],
  is_recruiter BOOLEAN DEFAULT false,
  recruiter_company TEXT,
  vendor_code TEXT,
  user_id UUID,
  company_id UUID REFERENCES companies(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Jobs (Marketplace Ready)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id), -- The client's company
  user_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  type TEXT,
  skills TEXT[],
  budget NUMERIC, -- Gross budget from client
  adjusted_budget NUMERIC, -- Net budget after HireNest margin
  status TEXT DEFAULT 'open',
  broadcast_to_vendors BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Candidates (Vendor Owned)
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id), -- Direct link to the source vendor
  vendor_company_id UUID REFERENCES companies(id), -- Legacy company link
  user_id UUID,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  website TEXT,
  current_title TEXT,
  skills TEXT[],
  experience TEXT,
  resume_url TEXT,
  source TEXT DEFAULT 'vendor',
  stage TEXT DEFAULT 'sourced',
  ai_match_score NUMERIC DEFAULT 0,
  raw_text TEXT,
  parsed_data JSONB DEFAULT '{}',
  upload_batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Match Results Caching Layer
CREATE TABLE IF NOT EXISTS match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  score INT NOT NULL,
  matched_skills TEXT[] DEFAULT '{}',
  missing_skills TEXT[] DEFAULT '{}',
  explanation TEXT,
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_match_results_job_id ON match_results(job_id);
CREATE INDEX IF NOT EXISTS idx_match_results_candidate_id ON match_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_results_score ON match_results(score);

-- Ensure candidates columns exist for leads/automation
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='candidates' AND column_name='whatsapp') THEN
    ALTER TABLE candidates ADD COLUMN whatsapp TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='candidates' AND column_name='website') THEN
    ALTER TABLE candidates ADD COLUMN website TEXT;
  END IF;
END $$;

-- 7. Collaborations (The Marketplace Meet-point)
CREATE TABLE IF NOT EXISTS collaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  candidate_id UUID REFERENCES candidates(id),
  vendor_id UUID REFERENCES companies(id),
  client_id UUID REFERENCES companies(id),
  status TEXT DEFAULT 'proposed', -- proposed, collaborated, interviewing, rejected, placed
  match_score INT,
  client_feedback TEXT,
  vendor_notes TEXT,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Messaging (Group Chat)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id UUID REFERENCES collaborations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  sender_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  is_ai_assisted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Agent Infrastructure (Updated)
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  type TEXT,
  payload JSONB,
  status TEXT DEFAULT 'pending',
  priority INT DEFAULT 1,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  retries INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  type TEXT,
  message TEXT,
  level TEXT DEFAULT 'info',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'info')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Financials (The Deals / Revenue Layer)
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  candidate_id UUID REFERENCES candidates(id),
  client_name TEXT,
  job_title TEXT,
  candidate_name TEXT,
  vendor_name TEXT,
  vendor_id UUID REFERENCES companies(id),
  revenue_amount NUMERIC DEFAULT 0,
  payout_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pipeline', -- pipeline, placed, lost
  payment_received BOOLEAN DEFAULT false,
  msa_signed BOOLEAN DEFAULT false,
  nda_signed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Resumes
CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  url TEXT,
  source TEXT DEFAULT 'direct',
  status TEXT DEFAULT 'pending',
  extracted_text TEXT,
  extracted_skills TEXT[],
  parsed_data JSONB DEFAULT '{}',
  raw_text TEXT,
  parse_status TEXT DEFAULT 'pending',
  processed BOOLEAN DEFAULT FALSE,
  company_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11b. Shortlist Pipeline (Decision Intelligence Layer)
CREATE TABLE IF NOT EXISTS shortlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  candidate_id TEXT, -- Can be UUID (Candidate) or TEXT (Resume Reference)
  score INT,
  interview_score INT,
  hiring_probability INT,
  offer_success_score INT,
  stage TEXT DEFAULT 'shortlisted', -- shortlisted, interview, selected, rejected
  reason TEXT,
  prediction_summary TEXT,
  matched_skills TEXT[],
  missing_skills TEXT[],
  source TEXT, -- 'crm' | 'resume'
  ai_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_job_candidate UNIQUE (job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_shortlist_job_id ON shortlist(job_id);
CREATE INDEX IF NOT EXISTS idx_shortlist_stage ON shortlist(stage);
CREATE INDEX IF NOT EXISTS idx_shortlist_score ON shortlist(score);

-- 12. Talent Graph (Unified Talent Intelligence)
CREATE TABLE IF NOT EXISTS talent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  
  -- Identity
  primary_email TEXT UNIQUE,
  primary_phone TEXT,
  full_name TEXT,
  
  -- Normalized Attributes
  skills TEXT[] DEFAULT '{}',
  experience_years INT DEFAULT 0,
  titles TEXT[] DEFAULT '{}',
  location TEXT,
  
  -- Sources & Provenance
  sources JSONB DEFAULT '[]', -- [{type: 'resume'|'crm', source_id, confidence}]
  
  -- Unified Intelligence
  raw_text TEXT,
  parsed_data JSONB DEFAULT '{}',
  
  -- Quality & State
  data_quality FLOAT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Linking legacy tables to Talent Graph
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resumes' AND column_name='talent_id') THEN
    ALTER TABLE resumes ADD COLUMN talent_id UUID REFERENCES talent_profiles(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='candidates' AND column_name='talent_id') THEN
    ALTER TABLE candidates ADD COLUMN talent_id UUID REFERENCES talent_profiles(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='talent_id') THEN
    ALTER TABLE shortlist ADD COLUMN talent_id UUID REFERENCES talent_profiles(id);
  END IF;
  
  -- Enable RLS on talent_profiles
  ALTER TABLE talent_profiles ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Allow all on talent_profiles" ON talent_profiles;
  CREATE POLICY "Allow all on talent_profiles" ON talent_profiles FOR ALL USING (true);
END $$;

-- Final patches for existing tables
DO $$ 
BEGIN 
  -- Skills must be TEXT[] for neural matching
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='candidates' AND column_name='skills' AND data_type = 'text') THEN
    ALTER TABLE candidates ALTER COLUMN skills TYPE TEXT[] USING string_to_array(skills, ',');
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='skills' AND data_type = 'text') THEN
    ALTER TABLE jobs ALTER COLUMN skills TYPE TEXT[] USING string_to_array(skills, ',');
  END IF;

  -- Ensure resumes columns exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resumes' AND column_name='extracted_skills') THEN
    ALTER TABLE resumes ADD COLUMN extracted_skills TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resumes' AND column_name='processed') THEN
    ALTER TABLE resumes ADD COLUMN processed BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Shortlist columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='shortlist') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='interview_score') THEN
      ALTER TABLE shortlist ADD COLUMN interview_score INT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='hiring_probability') THEN
      ALTER TABLE shortlist ADD COLUMN hiring_probability INT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='offer_success_score') THEN
      ALTER TABLE shortlist ADD COLUMN offer_success_score INT;
    END IF;
    -- Adding Decision Engine Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='decision') THEN
      ALTER TABLE shortlist ADD COLUMN decision TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='risk') THEN
      ALTER TABLE shortlist ADD COLUMN risk INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='confidence') THEN
      ALTER TABLE shortlist ADD COLUMN confidence FLOAT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='reasons') THEN
      ALTER TABLE shortlist ADD COLUMN reasons TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shortlist' AND column_name='prediction_summary') THEN
      ALTER TABLE shortlist ADD COLUMN prediction_summary TEXT;
    END IF;
  END IF;
END $$;

-- 12. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  company_id UUID REFERENCES companies(id),
  title TEXT,
  message TEXT,
  type TEXT DEFAULT 'info', -- info, success, warning, error
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Resumes access" ON resumes
  FOR ALL USING (true); -- Simplified for now

ALTER TABLE shortlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shortlist access" ON shortlist
  FOR ALL USING (true); -- Simplified for now

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- 13. Security Policies (The Fortress)
-- Allow users to see their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile (except role/company_id)
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Company Data Isolation: The "Master Gate"
-- Users can only see data belonging to their company
CREATE POLICY "Company wide data access" ON companies
  FOR SELECT USING (id IN (SELECT company_id::UUID FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Agreement access" ON agreements
  FOR SELECT USING (company_id IN (SELECT company_id::UUID FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Job access" ON jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Candidate access" ON candidates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Client access" ON clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Vendor access" ON vendors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Collaboration access" ON collaborations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Message access" ON messages
  FOR ALL USING (
    sender_id = auth.uid() OR
    conversation_id IN (
      SELECT conv.id FROM conversations conv
      JOIN collaborations col ON conv.collaboration_id = col.id
      WHERE col.vendor_id IN (SELECT company_id::UUID FROM profiles WHERE id = auth.uid())
      OR col.client_id IN (SELECT company_id::UUID FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Agent task access" ON agent_tasks
  FOR ALL USING (company_id IN (SELECT company_id::UUID FROM profiles WHERE id = auth.uid()));
  
CREATE POLICY "Client data access" ON clients
  FOR ALL USING (true); -- Simplified for now, in prod should link to company_id

CREATE POLICY "Deal access" ON deals
  FOR ALL USING (
    job_id IN (SELECT id FROM jobs WHERE company_id IN (SELECT company_id::UUID FROM profiles WHERE id = auth.uid()))
  );

-- 15. Emails (Unified Communication Engine)
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT UNIQUE, 
  thread_id TEXT,
  from_email TEXT NOT NULL,
  to_email TEXT,
  subject TEXT,
  body TEXT, -- Legacy body
  body_html TEXT,
  body_text TEXT,
  snippet TEXT,
  direction TEXT DEFAULT 'inbound', -- 'inbound' or 'outbound'
  status TEXT DEFAULT 'received',   -- 'received', 'sent', 'draft'
  is_ai BOOLEAN DEFAULT FALSE,
  labels TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'general', -- 'general', 'recruitment', 'client', 'vendor'
  ai_priority INT DEFAULT 0,
  ai_metadata JSONB DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id),
  company_id UUID REFERENCES companies(id),
  job_id UUID REFERENCES jobs(id),
  talent_id UUID REFERENCES talent_profiles(id),
  message_header_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure necessary columns exist in case of partial schema updates
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emails' AND column_name='body_html') THEN
    ALTER TABLE emails ADD COLUMN body_html TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='body_text') THEN
    ALTER TABLE emails ADD COLUMN body_text TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='labels') THEN
    ALTER TABLE emails ADD COLUMN labels TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='category') THEN
    ALTER TABLE emails ADD COLUMN category TEXT DEFAULT 'general';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_priority') THEN
    ALTER TABLE emails ADD COLUMN ai_priority INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_id') THEN
    ALTER TABLE emails ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_id') THEN
    ALTER TABLE emails ADD COLUMN company_id UUID REFERENCES companies(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Emails access" ON emails;
CREATE POLICY "Emails access" ON emails FOR ALL USING (true); 

-- 16. Leads Table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  signal_type TEXT,
  intent_score INT,
  decision_makers JSONB DEFAULT '[]',
  tool_stack TEXT[],
  recent_events TEXT[],
  status TEXT DEFAULT 'warm',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leads access" ON leads FOR ALL USING (true);

-- 17. Inbound Leads / Extraction Cache (To avoid double processing)
CREATE TABLE IF NOT EXISTS processing_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT UNIQUE, -- e.g. gmail message id
  type TEXT, -- 'resume', 'lead'
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE processing_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cache access" ON processing_cache FOR ALL USING (true);

-- 17. WhatsApp Business Integration
CREATE TABLE IF NOT EXISTS whatsapp_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  last_message TEXT,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  ai_engagement_mode TEXT DEFAULT 'active', -- passive, active, paused
  status TEXT DEFAULT 'lead', -- lead, interviewing, placed, noise
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES whatsapp_chats(id),
  sender_type TEXT CHECK (sender_type IN ('contact', 'ai', 'user')),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'sent', -- sent, delivered, read, failed
  ai_intent TEXT, -- 'greeting', 'scheduling', 'rejection', 'resume_submission'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chats access" ON whatsapp_chats FOR ALL USING (true);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages access" ON whatsapp_messages FOR ALL USING (true);

-- Ensure agent_logs has all autonomous agency columns
DO $$ 
BEGIN 
  -- Ensure agent_logs has proper RLS
  ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Allow all inserts on agent_logs" ON agent_logs;
  CREATE POLICY "Allow all inserts on agent_logs" ON agent_logs FOR INSERT WITH CHECK (true);
  DROP POLICY IF EXISTS "Allow select on agent_logs" ON agent_logs;
  CREATE POLICY "Allow select on agent_logs" ON agent_logs FOR SELECT USING (true);

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_logs' AND column_name='agent_name') THEN
    ALTER TABLE agent_logs ADD COLUMN agent_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_logs' AND column_name='status') THEN
    ALTER TABLE agent_logs ADD COLUMN status TEXT DEFAULT 'pending';
  END IF;

  -- Ensure status check constraint exists and is up to date
  ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_status_check;
  ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_status_check 
    CHECK (status IN ('pending', 'success', 'failed', 'info', 'warning', 'error', 'warn'));
  
  -- Flexible level check
  ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_level_check;
  ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_level_check
    CHECK (level IN ('info', 'success', 'warn', 'warning', 'error', 'critical'));
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_logs' AND column_name='execution_time_ms') THEN
    ALTER TABLE agent_logs ADD COLUMN execution_time_ms INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_logs' AND column_name='input') THEN
    ALTER TABLE agent_logs ADD COLUMN input JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_logs' AND column_name='decision') THEN
    ALTER TABLE agent_logs ADD COLUMN decision JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_logs' AND column_name='action') THEN
    ALTER TABLE agent_logs ADD COLUMN action TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_logs' AND column_name='result') THEN
    ALTER TABLE agent_logs ADD COLUMN result JSONB;
  END IF;
END $$;

-- -------------------------------------------------------------
-- AUTH & PROFILE AUTOMATION (Triggers)
-- -------------------------------------------------------------

-- Create a function to handle new user profiles automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'recruiter'),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function every time a user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 18. Usage & Revenue Logs
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action_type TEXT, -- 'ai_process', 'email_sync', 'lead_gen'
  units INT DEFAULT 1,
  estimated_cost NUMERIC(10,4) DEFAULT 0,
  revenue_delta NUMERIC(10,2) DEFAULT 0, -- Estimated value generated
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usage access" ON usage_logs FOR ALL USING (true);

-- 20. Monetization & Billing Engine (The Revenue Layer)
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID,
  agent_type TEXT, -- 'scout', 'engager', 'closer'
  action_type TEXT,
  value_generated NUMERIC(10,2),
  is_billable BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending', -- 'pending', 'invoiced', 'paid'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing access" ON billing_events FOR ALL USING (true);


-- -------------------------------------------------------------
-- SAAS MULTI-PORTAL MIGRATION
-- -------------------------------------------------------------

-- Profiles update
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'recruiter';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

-- Drop role constraints completely if exists (to avoid collision)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS role_check;

ALTER TABLE profiles ADD CONSTRAINT role_check CHECK (role IN ('admin', 'recruiter', 'vendor', 'client', 'client_manager', 'vendor_manager'));

-- Candidates update
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS external_candidate_id TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id); -- Link to root company

-- Jobs update
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

-- Vendor performance & Marketplace
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS performance_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_match_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS placements INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS submissions INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS response_time_ms INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_ranked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'standard';

ALTER TABLE shortlist
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'shortlisted'; 

-- Vendor Jobs Bids
CREATE TABLE IF NOT EXISTS vendor_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  proposed_fee_percent NUMERIC,
  proposed_guarantee_days INT,
  estimated_time_to_submit_days INT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bids policies
ALTER TABLE vendor_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_bids_access" ON vendor_bids FOR ALL USING (true); -- Simplified for dev

-- Commission Tracking
CREATE TABLE IF NOT EXISTS commission_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  candidate_id UUID REFERENCES candidates(id),
  vendor_id UUID REFERENCES vendors(id),
  placed_at TIMESTAMPTZ DEFAULT now(),
  base_salary NUMERIC,
  fee_percent NUMERIC,
  commission_amount NUMERIC,
  status TEXT DEFAULT 'pending_invoice',
  guarantee_end_date TIMESTAMPTZ
);
ALTER TABLE commission_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_tracking_access" ON commission_tracking FOR ALL USING (true);


-- Emails update
ALTER TABLE emails ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS talent_id UUID REFERENCES talent_profiles(id);

-- RLS Helper Functions (Make sure profiles references auth.uid() properly. 'profiles.id' is auth.users(id))
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_my_vendor_id()
RETURNS UUID AS $$
  SELECT vendor_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_my_client_id()
RETURNS UUID AS $$
  SELECT client_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- Candidates RLS
DROP POLICY IF EXISTS "Candidates access" ON candidates;
DROP POLICY IF EXISTS "role_candidates_access" ON candidates;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_candidates_access"
ON candidates
FOR ALL
USING (
  (company_id IS NULL OR company_id = get_my_company_id())
  AND (
    get_my_role() IN ('admin','recruiter')
    OR (get_my_role() = 'vendor' AND vendor_id = get_my_vendor_id())
    OR (get_my_role() = 'client') -- read via joins in UI
  )
)
WITH CHECK (
  (company_id IS NULL OR company_id = get_my_company_id())
  AND (
    get_my_role() IN ('admin','recruiter')
    OR (get_my_role() = 'vendor' AND vendor_id = get_my_vendor_id())
  )
);

-- Jobs RLS
DROP POLICY IF EXISTS "Jobs access" ON jobs;
DROP POLICY IF EXISTS "role_jobs_access" ON jobs;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_jobs_access"
ON jobs
FOR ALL
USING (
  (company_id IS NULL OR company_id = get_my_company_id())
)
WITH CHECK (
  (company_id IS NULL OR company_id = get_my_company_id())
  AND (
    get_my_role() IN ('admin','recruiter')
    OR (get_my_role() = 'client' AND client_id = get_my_client_id())
  )
);

-- Talent Profiles RLS
DROP POLICY IF EXISTS "Talent profiles access" ON talent_profiles;
DROP POLICY IF EXISTS "role_talent_access" ON talent_profiles;
DROP POLICY IF EXISTS "role_talent_write" ON talent_profiles;
DROP POLICY IF EXISTS "role_talent_update" ON talent_profiles;
ALTER TABLE talent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_talent_access"
ON talent_profiles
FOR SELECT
USING (company_id IS NULL OR company_id = get_my_company_id());

CREATE POLICY "role_talent_write"
ON talent_profiles
FOR INSERT
WITH CHECK (
  (company_id IS NULL OR company_id = get_my_company_id())
  AND get_my_role() IN ('admin','recruiter','vendor')
);

CREATE POLICY "role_talent_update"
ON talent_profiles
FOR UPDATE
USING (
  (company_id IS NULL OR company_id = get_my_company_id())
  AND get_my_role() IN ('admin','recruiter','vendor')
)
WITH CHECK (
  (company_id IS NULL OR company_id = get_my_company_id())
  AND get_my_role() IN ('admin','recruiter','vendor')
);

-- Shortlist RLS
DROP POLICY IF EXISTS "Shortlist access" ON shortlist;
DROP POLICY IF EXISTS "role_shortlist_access" ON shortlist;
ALTER TABLE shortlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_shortlist_access"
ON shortlist
FOR ALL
USING (
  (company_id IS NULL OR company_id = get_my_company_id())
  AND get_my_role() IN ('admin','recruiter','client')
)
WITH CHECK (
  (company_id IS NULL OR company_id = get_my_company_id())
  AND get_my_role() IN ('admin','recruiter')
);
