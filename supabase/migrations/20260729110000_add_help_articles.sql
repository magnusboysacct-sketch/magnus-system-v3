-- Help Center: director-editable training guides, seeded client-side from
-- src/pages/HelpCenterPage.tsx on first load if the table is empty.
-- company_id is nullable — NULL rows are shared defaults visible to every
-- company; a company can still add its own private articles later.
CREATE TABLE IF NOT EXISTS help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  module text NOT NULL,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  content text,
  video_url text,
  roles text[] DEFAULT ARRAY['director','admin','project_manager','site_supervisor','estimator','procurement','accounts','viewer'],
  sort_order integer DEFAULT 0,
  is_published boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_help_articles" ON help_articles FOR ALL
USING (
  company_id IS NULL OR
  company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1)
);
