-- Final project-files access policy (applied directly to the live database; this file version-controls it).
-- Files whose first folder is a project id are reachable by the people who can see that project: anyone in the project's company
-- with the role director, admin or secretary (the same rule ProjectContext uses), or an active project member. The old
-- membership-only policies (project_members holds rows for almost no one) and the unrestricted "Allow authenticated uploads"
-- are removed, and "Public read" no longer covers project-files (company-assets, company-logos and project-photos stay public).
BEGIN;

DROP POLICY IF EXISTS "Users can delete files from projects they are members of" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload files to projects they are members of" ON storage.objects;
DROP POLICY IF EXISTS "Users can view files from projects they are members of" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;

DROP POLICY IF EXISTS "Project access for project-files select" ON storage.objects;
CREATE POLICY "Project access for project-files select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files' AND EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE p.id::text = (storage.foldername(objects.name))[1]
      AND p.company_id = up.company_id
      AND ( up.role IN ('director','admin','secretary')
            OR EXISTS (SELECT 1 FROM public.project_members pm
                       WHERE pm.project_id = p.id AND pm.user_id = auth.uid() AND pm.is_active) )
  )
);

DROP POLICY IF EXISTS "Project access for project-files insert" ON storage.objects;
CREATE POLICY "Project access for project-files insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files' AND EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE p.id::text = (storage.foldername(objects.name))[1]
      AND p.company_id = up.company_id
      AND ( up.role IN ('director','admin','secretary')
            OR EXISTS (SELECT 1 FROM public.project_members pm
                       WHERE pm.project_id = p.id AND pm.user_id = auth.uid() AND pm.is_active) )
  )
);

DROP POLICY IF EXISTS "Project access for project-files delete" ON storage.objects;
CREATE POLICY "Project access for project-files delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-files' AND EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE p.id::text = (storage.foldername(objects.name))[1]
      AND p.company_id = up.company_id
      AND ( up.role IN ('director','admin','secretary')
            OR EXISTS (SELECT 1 FROM public.project_members pm
                       WHERE pm.project_id = p.id AND pm.user_id = auth.uid() AND pm.is_active) )
  )
);

ALTER POLICY "Public read" ON storage.objects
USING (bucket_id = ANY (ARRAY['company-assets'::text, 'company-logos'::text, 'project-photos'::text]));

COMMIT;
