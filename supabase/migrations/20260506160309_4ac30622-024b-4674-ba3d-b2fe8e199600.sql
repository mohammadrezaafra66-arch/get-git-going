
-- Create private bucket for feedback attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-attachments',
  'feedback-attachments',
  false,
  26214400, -- 25 MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/heic',
    'video/mp4','video/webm','video/quicktime',
    'audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/x-m4a'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Owners can upload into their own folder
CREATE POLICY "feedback_attachments_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'feedback-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Owners can read their own files
CREATE POLICY "feedback_attachments_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins/managers can read all
CREATE POLICY "feedback_attachments_select_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- Owners can delete their own files
CREATE POLICY "feedback_attachments_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins can delete any
CREATE POLICY "feedback_attachments_delete_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND public.has_role(auth.uid(), 'admin')
);
