"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const transaction_visibility_rules_1 = require("../lib/transaction-visibility-rules");
const buyerId = "buyer-user";
const sellerId = "seller-user";
strict_1.default.equal((0, transaction_visibility_rules_1.canArchiveTransactionForUser)({ buyer_id: buyerId, seller_id: sellerId, status: "released" }, sellerId), true, "seller can archive a released transaction");
strict_1.default.equal((0, transaction_visibility_rules_1.canArchiveTransactionForUser)({ buyer_id: buyerId, seller_id: sellerId, status: "cancelled" }, sellerId), true, "seller can archive a cancelled transaction");
strict_1.default.equal((0, transaction_visibility_rules_1.canArchiveTransactionForUser)({ buyer_id: buyerId, seller_id: sellerId, status: "funded" }, sellerId), false, "seller cannot archive an active locked-funds transaction");
strict_1.default.equal((0, transaction_visibility_rules_1.canArchiveTransactionForUser)({ buyer_id: buyerId, seller_id: sellerId, status: "accepted" }, sellerId), false, "seller cannot archive an accepted transaction that still needs buyer funding");
strict_1.default.equal((0, transaction_visibility_rules_1.canArchiveTransactionForUser)({ buyer_id: buyerId, seller_id: sellerId, status: "released" }, buyerId), false, "buyer should use delete, not seller archive");
console.log("transaction visibility rule tests passed");
