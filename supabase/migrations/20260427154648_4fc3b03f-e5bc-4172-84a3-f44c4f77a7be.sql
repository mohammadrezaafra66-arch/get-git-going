-- Knowledge documents table
CREATE TABLE public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sales_rules','purchase_rules','accounting','warehouse','product_training','circulars','general')),
  access_level TEXT NOT NULL DEFAULT 'all' CHECK (access_level IN ('all','manager_only','finance_only','admin_only')),
  version INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kd_category ON public.knowledge_documents(category);
CREATE INDEX idx_kd_access ON public.knowledge_documents(access_level);
CREATE INDEX idx_kd_published ON public.knowledge_documents(is_published);

-- Knowledge confirmations table
CREATE TABLE public.knowledge_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);

CREATE INDEX idx_kconf_doc_user ON public.knowledge_confirmations(document_id, user_id);

-- Helper: check if a role list satisfies an access_level value
CREATE OR REPLACE FUNCTION public.kd_role_can_view(_uid uuid, _access_level text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _access_level
    WHEN 'all' THEN true
    WHEN 'manager_only' THEN public.has_any_role(_uid, ARRAY['admin'::app_role,'manager'::app_role])
    WHEN 'finance_only' THEN public.has_any_role(_uid, ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
    WHEN 'admin_only' THEN public.has_role(_uid, 'admin'::app_role)
    ELSE false
  END
$$;

-- Auto-bump version on update
CREATE OR REPLACE FUNCTION public.kd_bump_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title)
     OR (NEW.content IS DISTINCT FROM OLD.content)
     OR (NEW.category IS DISTINCT FROM OLD.category)
     OR (NEW.access_level IS DISTINCT FROM OLD.access_level) THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kd_bump_version
BEFORE UPDATE ON public.knowledge_documents
FOR EACH ROW EXECUTE FUNCTION public.kd_bump_version();

-- Enable RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_confirmations ENABLE ROW LEVEL SECURITY;

-- knowledge_documents policies
CREATE POLICY kd_select_published_for_role
ON public.knowledge_documents
FOR SELECT
TO authenticated
USING (
  (is_published = true AND public.kd_role_can_view(auth.uid(), access_level))
  OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role])
);

CREATE POLICY kd_insert_admin_manager
ON public.knowledge_documents
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

CREATE POLICY kd_update_admin_manager
ON public.knowledge_documents
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

CREATE POLICY kd_delete_admin
ON public.knowledge_documents
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- knowledge_confirmations policies
CREATE POLICY kconf_select_own_or_admin
ON public.knowledge_confirmations
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY kconf_insert_own
ON public.knowledge_confirmations
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY kconf_delete_own_or_admin
ON public.knowledge_confirmations
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));