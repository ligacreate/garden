-- Create events table
CREATE TABLE IF NOT EXISTS public.events (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  time TEXT NOT NULL,
  speaker TEXT NOT NULL,
  location TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT NOT NULL,
  image_gradient TEXT NOT NULL,
  image_url TEXT,
  registration_link TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create questions table
CREATE TABLE IF NOT EXISTS public.questions (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cities table
CREATE TABLE IF NOT EXISTS public.cities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notebooks table
CREATE TABLE IF NOT EXISTS public.notebooks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create journal_entries table
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public read access (for viewing)
CREATE POLICY "Allow public read access to events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Allow public read access to questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Allow public read access to cities" ON public.cities FOR SELECT USING (true);
CREATE POLICY "Allow public read access to notebooks" ON public.notebooks FOR SELECT USING (true);
CREATE POLICY "Allow public read access to journal_entries" ON public.journal_entries FOR SELECT USING (true);

-- Create policies to allow admin operations (insert, update, delete)
-- For now, allow all operations. Later you can implement proper authentication
CREATE POLICY "Allow insert events" ON public.events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update events" ON public.events FOR UPDATE USING (true);
CREATE POLICY "Allow delete events" ON public.events FOR DELETE USING (true);

CREATE POLICY "Allow insert questions" ON public.questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update questions" ON public.questions FOR UPDATE USING (true);
CREATE POLICY "Allow delete questions" ON public.questions FOR DELETE USING (true);

CREATE POLICY "Allow insert cities" ON public.cities FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update cities" ON public.cities FOR UPDATE USING (true);
CREATE POLICY "Allow delete cities" ON public.cities FOR DELETE USING (true);

CREATE POLICY "Allow insert notebooks" ON public.notebooks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update notebooks" ON public.notebooks FOR UPDATE USING (true);
CREATE POLICY "Allow delete notebooks" ON public.notebooks FOR DELETE USING (true);

CREATE POLICY "Allow insert journal_entries" ON public.journal_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update journal_entries" ON public.journal_entries FOR UPDATE USING (true);
CREATE POLICY "Allow delete journal_entries" ON public.journal_entries FOR DELETE USING (true);