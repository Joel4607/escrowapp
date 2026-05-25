-- Allow buyers to delete own transactions where funds are NOT actively locked
CREATE POLICY "Buyers can delete settled transactions"
  ON transactions FOR DELETE
  USING (
    buyer_id = auth.uid()
    AND status NOT IN ('funded', 'in_delivery', 'delivered', 'under_inspection', 'disputed', 'admin_review')
  );

-- Allow cascade cleanup of invites when deleting a transaction
CREATE POLICY "Buyers can delete invites for own transactions"
  ON transaction_invites FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM transactions
      WHERE transactions.id = transaction_invites.transaction_id
      AND transactions.buyer_id = auth.uid()
    )
  );
