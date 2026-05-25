"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canDeleteTransaction = canDeleteTransaction;
exports.canDeleteTransactionForUser = canDeleteTransactionForUser;
exports.canArchiveTransactionForUser = canArchiveTransactionForUser;
const PROTECTED_STATUSES = [
    "funded",
    "in_delivery",
    "delivered",
    "under_inspection",
    "disputed",
    "admin_review",
];
const SELLER_ARCHIVABLE_STATUSES = [
    "released",
    "refunded",
    "partially_refunded",
    "cancelled",
    "rejected",
    "expired",
];
function canDeleteTransaction(status) {
    return !PROTECTED_STATUSES.includes(status);
}
function canDeleteTransactionForUser(transaction, userId) {
    return transaction.buyer_id === userId && canDeleteTransaction(transaction.status);
}
function canArchiveTransactionForUser(transaction, userId) {
    return (transaction.seller_id === userId
        && SELLER_ARCHIVABLE_STATUSES.includes(transaction.status));
}
