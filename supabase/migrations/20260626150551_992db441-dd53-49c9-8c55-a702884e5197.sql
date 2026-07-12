CREATE TABLE IF NOT EXISTS public.ai_generated_content (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_type                TEXT NOT NULL
                             CHECK (tool_type IN ('ad_copy','buy_assistant','banner_text')),
  input_data               JSONB NOT NULL DEFAULT '{}',
  generated_variations     JSONB NOT NULL DEFAULT '[]',
  selected_variation_index INTEGER,
  edited_content           TEXT,
  created_by               UUID NOT NULL REFERENCES public.profiles(id),
  approved_at              TIMESTAMPTZ,
  approved_by              UUID REFERENCES public.profiles(id),
  used_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_generated_content TO authenticated;
GRANT ALL ON public.ai_generated_content TO service_role;
ALTER TABLE public.ai_generated_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_content_own" ON public.ai_generated_content
  FOR SELECT TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "ai_content_insert" ON public.ai_generated_content
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE INDEX IF NOT EXISTS idx_ai_generated_content_created_by ON public.ai_generated_content(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_generated_content_tool_type ON public.ai_generated_content(tool_type);