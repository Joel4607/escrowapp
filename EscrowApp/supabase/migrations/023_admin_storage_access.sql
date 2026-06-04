-- Allow admins to read all evidence images in storage
-- The existing policy only allows transaction parties (buyer/seller),
-- blocking admins from viewing evidence during dispute resolution.

DROP POLICY IF EXISTS "Transaction parties can read evidence images"
  ON storage.objects;

CREATE POLICY "Transaction parties and admins can read evidence images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'evidence'
    AND auth.uid() IS NOT NULL
    AND (
      -- Uploader can always read their own files
      (storage.foldername(name))[1] = auth.uid()::text
      -- Transaction parties can read evidence
      OR EXISTS (
        SELECT 1 FROM evidence e
          JOIN transactions t ON t.id = e.transaction_id
        WHERE e.image_url LIKE '%' || storage.filename(name)
          AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
      )
      -- Admins can read all evidence
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
    )
  );
