-- Allow users to delete their own evidence uploads
CREATE POLICY "Users can delete own evidence"
  ON evidence FOR DELETE
  USING (uploaded_by = auth.uid());

-- Allow users to delete their own evidence files from storage
CREATE POLICY "Users can delete own evidence images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'evidence' AND auth.uid() IS NOT NULL);
