import type { TransactionStatus } from "@/lib/database.types";

const PROTECTED_STATUSES: TransactionStatus[] = [
  "funded",
  "in_delivery",
  "delivered",
  "under_inspection",
  "disputed",
  "admin_review",
];

const SELLER_ARCHIVABLE_STATUSES: TransactionStatus[] = [
  "released",
  "refunded",
  "partially_refunded",
  "cancelled",
  "rejected",
  "expired",
];

type TransactionVisibilitySummary = {
  buyer_id: string;
  seller_id: string | null;
  status: TransactionStatus;
};

export function canDeleteTransaction(status: TransactionStatus): boolean {
  return !PROTECTED_STATUSES.includes(status);
}

export function canDeleteTransactionForUser(
  transaction: Pick<TransactionVisibilitySummary, "buyer_id" | "status">,
  userId: string | undefined,
): boolean {
  return transaction.buyer_id === userId && canDeleteTransaction(transaction.status);
}

export function canArchiveTransactionForUser(
  transaction: TransactionVisibilitySummary,
  userId: string | undefined,
): boolean {
  return (
    transaction.seller_id === userId
    && SELLER_ARCHIVABLE_STATUSES.includes(transaction.status)
  );
}
