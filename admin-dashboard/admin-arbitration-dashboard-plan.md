# Admin Arbitration Dashboard Development Plan

## Project Context

This document explains how to build the **Admin Arbitration Web Dashboard** for the escrow/vault mobile app.

The escrow app allows a buyer to lock payment in a vault until a seller delivers the item. If everything goes well, the buyer releases payment to the seller. If there is a problem, such as a fake product, wrong item, damaged product, or buyer refusing to release payment, the case goes to **admin arbitration**.

The admin dashboard is the control center where administrators review disputes, inspect evidence, check transaction history, view fraud flags, and make fair decisions.

---

## Main Goal of the Admin Dashboard

The dashboard should help the admin answer one main question:

> Based on the transaction details, evidence, delivery verification, audit logs, and user history, should the money be released to the seller, refunded to the buyer, partially refunded, or kept pending?

---

## Core Admin Responsibilities

The admin should be able to:

1. View all escrow transactions.
2. View disputed transactions.
3. Review buyer and seller evidence.
4. Inspect QR delivery verification records.
5. Check transaction timeline and audit logs.
6. View buyer and seller trust scores.
7. View fraud flags.
8. Make dispute decisions.
9. Release payment to seller.
10. Refund buyer.
11. Approve partial refund.
12. Request more evidence.
13. Mark suspicious users or transactions.
14. Suspend or restrict users when necessary.

---

# Recommended Tech Stack

## Frontend

Use:

- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query
- React Hook Form
- Zod
- Recharts
- Lucide React
- Axios

## Backend

Use:

- Node.js
- Express.js or NestJS
- MongoDB with Mongoose

Alternative:

- PostgreSQL with Prisma

## Authentication

Use:

- JWT access token
- Admin-only role guard
- Optional refresh token
- Password login for admin

## Storage

Use:

- Cloudinary, Firebase Storage, or Supabase Storage for evidence images.

---

# Dashboard Structure

## Main Pages

1. Login Page
2. Dashboard Overview
3. Transactions Page
4. Transaction Details Page
5. Disputes Page
6. Dispute Details Page
7. Evidence Review Page
8. Audit Logs Page
9. Fraud Flags Page
10. Users Page
11. User Details Page
12. Wallet / Ledger Page
13. Settings Page

---

# Sidebar Navigation

The admin dashboard should have a sidebar like this:

```text
Dashboard
Transactions
Disputes
Evidence
Fraud Flags
Users
Wallet Ledger
Audit Logs
Settings
Logout
```

Each page should be clean and focused.

---

# User Roles for the Web Dashboard

For the first version, use only one admin role.

Later, you can add different admin roles:

## Super Admin

Can do everything.

## Dispute Officer

Can review disputes and make decisions.

## Support Admin

Can view disputes and request more evidence, but cannot release/refund money.

## Finance Admin

Can review wallet ledger, releases, refunds, and transaction records.

---

# Important Admin Dashboard Principles

## 1. Admin actions must be careful

Any action that moves money should require confirmation.

Examples:

- Release payment to seller
- Refund buyer
- Partial refund
- Suspend user

The admin should see a confirmation modal before the action is completed.

## 2. Admin decisions must be logged

Every admin decision should create an audit log.

Example:

```json
{
  "action": "DISPUTE_RESOLVED_RELEASE_TO_SELLER",
  "adminId": "admin123",
  "transactionId": "txn456",
  "reason": "Buyer scanned delivery QR and did not provide valid evidence.",
  "createdAt": "2026-05-23T12:00:00Z"
}
```

## 3. Admin must not edit original evidence

Evidence should be read-only.

Admin can add notes or decisions, but should not modify buyer/seller uploads.

## 4. Dashboard should show timeline clearly

The admin should see the full transaction timeline:

1. Transaction created
2. Seller invited
3. Seller accepted
4. Buyer funded vault
5. Seller uploaded evidence
6. QR generated
7. QR scanned
8. Buyer opened dispute
9. Seller responded
10. Admin decision made

This helps the admin judge fairly.

---

# Recommended Data Models

These are the models the dashboard will depend on.

## User Model

```ts
type User = {
  id: string;
  fullName?: string;
  phone?: string;
  email?: string;
  role: "buyer" | "seller" | "admin";
  isVerified: boolean;
  trustScore: number;
  walletBalance: number;
  lockedBalance: number;
  status: "active" | "restricted" | "suspended";
  createdAt: string;
  updatedAt: string;
};
```

## Transaction Model

```ts
type Transaction = {
  id: string;
  transactionCode: string;
  buyerId: string;
  sellerId?: string;
  sellerContact: string;
  itemName: string;
  itemDescription: string;
  itemCondition: "new" | "used" | "refurbished";
  itemCategory?: string;
  quantity: number;
  price: number;
  deliveryDeadline: string;
  inspectionPeriodHours: number;
  status:
    | "created"
    | "seller_invited"
    | "accepted"
    | "rejected"
    | "funded"
    | "in_delivery"
    | "delivered"
    | "under_inspection"
    | "released"
    | "disputed"
    | "refunded"
    | "partially_refunded"
    | "cancelled"
    | "expired"
    | "admin_review";
  createdAt: string;
  updatedAt: string;
};
```

## Dispute Model

```ts
type Dispute = {
  id: string;
  transactionId: string;
  openedBy: string;
  openedByRole: "buyer" | "seller";
  reason:
    | "fake_product"
    | "wrong_item"
    | "damaged_product"
    | "empty_package"
    | "not_delivered"
    | "buyer_refusing_release"
    | "seller_changed_terms"
    | "delivery_delay"
    | "other";
  description: string;
  status: "open" | "under_review" | "awaiting_evidence" | "resolved";
  adminDecision?: "release_to_seller" | "refund_buyer" | "partial_refund" | "return_required" | "dismissed";
  adminNotes?: string;
  createdAt: string;
  resolvedAt?: string;
};
```

## Evidence Model

```ts
type Evidence = {
  id: string;
  transactionId: string;
  disputeId?: string;
  uploadedBy: string;
  uploadedByRole: "buyer" | "seller" | "admin";
  evidenceType:
    | "product_before_delivery"
    | "package_before_delivery"
    | "delivery_proof"
    | "received_item"
    | "damaged_item"
    | "receipt"
    | "serial_number"
    | "chat_screenshot"
    | "other";
  imageUrl?: string;
  fileUrl?: string;
  notes?: string;
  imageHash?: string;
  metadata?: {
    timestamp?: string;
    location?: {
      lat: number;
      lng: number;
    };
    deviceInfo?: string;
  };
  createdAt: string;
};
```

## Audit Log Model

```ts
type AuditLog = {
  id: string;
  transactionId?: string;
  userId?: string;
  adminId?: string;
  userRole?: "buyer" | "seller" | "admin";
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
```

## Fraud Flag Model

```ts
type FraudFlag = {
  id: string;
  transactionId?: string;
  userId?: string;
  flagType:
    | "too_many_disputes"
    | "high_value_new_user"
    | "serial_number_mismatch"
    | "image_mismatch"
    | "qr_location_mismatch"
    | "buyer_release_delay"
    | "seller_late_delivery"
    | "multiple_accounts"
    | "suspicious_activity";
  riskLevel: "low" | "medium" | "high";
  reason: string;
  status: "active" | "dismissed" | "confirmed";
  createdAt: string;
};
```

## Ledger Model

```ts
type LedgerEntry = {
  id: string;
  transactionId: string;
  fromUserId?: string;
  toUserId?: string;
  amount: number;
  type: "fund" | "release" | "refund" | "partial_refund";
  status: "pending" | "locked" | "completed" | "failed";
  createdAt: string;
};
```

---

# Phase 1: Set Up the Admin Web Project

## Goal

Create the basic web dashboard project structure.

## Tasks

1. Create React + Vite + TypeScript project.
2. Install Tailwind CSS.
3. Install shadcn/ui.
4. Set up React Router.
5. Set up TanStack Query.
6. Set up Axios API client.
7. Create layout components:
   - Sidebar
   - Topbar
   - Page container
   - Table wrapper
   - Loading state
   - Empty state
8. Create environment variables:
   - `VITE_API_BASE_URL`

## Suggested Folder Structure

```text
src/
  api/
    axios.ts
    auth.api.ts
    transactions.api.ts
    disputes.api.ts
    users.api.ts
    evidence.api.ts
    fraud.api.ts
    ledger.api.ts
    audit.api.ts

  components/
    layout/
      AdminLayout.tsx
      Sidebar.tsx
      Topbar.tsx
    common/
      DataTable.tsx
      StatusBadge.tsx
      ConfirmDialog.tsx
      EmptyState.tsx
      LoadingState.tsx
      ErrorState.tsx

  features/
    auth/
    dashboard/
    transactions/
    disputes/
    evidence/
    fraud/
    users/
    ledger/
    audit/

  hooks/
    useAuth.ts
    useDebounce.ts

  lib/
    utils.ts
    formatters.ts

  routes/
    AppRoutes.tsx
    ProtectedRoute.tsx

  types/
    index.ts
```

## Deliverables

At the end of this phase:

- Admin app runs successfully.
- Sidebar and dashboard layout are visible.
- Routing works.
- API client is ready.

---

# Phase 2: Admin Authentication

## Goal

Allow only admins to access the dashboard.

## Pages

1. `/login`
2. `/dashboard`

## Tasks

1. Build admin login form.
2. Validate email and password.
3. Call backend login endpoint.
4. Store JWT token.
5. Fetch current admin profile.
6. Protect all dashboard routes.
7. Add logout.

## Backend Endpoints

```http
POST /api/admin/auth/login
GET /api/admin/auth/me
POST /api/admin/auth/logout
```

## Login Form Fields

- Email
- Password

## Security Rules

- Only users with role `admin` can access dashboard.
- If token expires, redirect to login.
- Admin password should be hashed in backend.
- Do not expose admin-only APIs to normal users.

## Deliverables

At the end of this phase:

- Admin can log in.
- Admin can log out.
- Dashboard is protected.
- Non-admin users cannot access admin dashboard.

---

# Phase 3: Dashboard Overview

## Goal

Create a summary page showing system activity.

## Page

`/dashboard`

## Dashboard Cards

Show:

1. Total transactions
2. Active escrow transactions
3. Disputed transactions
4. Pending admin review
5. Released payments
6. Refunded payments
7. Total users
8. High-risk fraud flags

## Charts

Use Recharts for:

1. Transaction status distribution
2. Disputes by reason
3. Payments released vs refunded
4. Transactions over time

## Backend Endpoint

```http
GET /api/admin/dashboard/stats
```

## Example Response

```json
{
  "totalTransactions": 200,
  "activeEscrows": 42,
  "disputedTransactions": 9,
  "pendingReview": 4,
  "releasedPayments": 120,
  "refundedPayments": 18,
  "totalUsers": 87,
  "highRiskFlags": 3,
  "transactionStatusChart": [],
  "disputesByReasonChart": [],
  "paymentsChart": [],
  "transactionsOverTimeChart": []
}
```

## Deliverables

At the end of this phase:

- Admin can see system summary.
- Dashboard cards work.
- Basic charts are visible.

---

# Phase 4: Transactions Management

## Goal

Allow admin to view and inspect all escrow transactions.

## Pages

1. `/transactions`
2. `/transactions/:transactionId`

## Transactions Table Columns

- Transaction Code
- Buyer
- Seller
- Item
- Amount
- Status
- Created Date
- Risk Level
- Action

## Filters

Add filters for:

- Status
- Date range
- Amount range
- Buyer
- Seller
- Risk level
- Search by transaction code

## Backend Endpoints

```http
GET /api/admin/transactions
GET /api/admin/transactions/:transactionId
```

## Transaction Detail Sections

The detail page should show:

1. Transaction summary
2. Buyer information
3. Seller information
4. Item details
5. Delivery details
6. Escrow/payment status
7. QR delivery verification
8. Evidence
9. Dispute info if any
10. Fraud flags
11. Audit logs
12. Admin notes

## Deliverables

At the end of this phase:

- Admin can view all transactions.
- Admin can filter/search transactions.
- Admin can open transaction details.
- Admin can see the full transaction context.

---

# Phase 5: Dispute Management

## Goal

Allow admin to review and resolve disputes.

## Pages

1. `/disputes`
2. `/disputes/:disputeId`

## Disputes Table Columns

- Dispute ID
- Transaction Code
- Opened By
- Reason
- Amount
- Status
- Risk Level
- Created Date
- Action

## Dispute Statuses

Use:

- Open
- Under Review
- Awaiting Evidence
- Resolved

## Backend Endpoints

```http
GET /api/admin/disputes
GET /api/admin/disputes/:disputeId
PATCH /api/admin/disputes/:disputeId/status
POST /api/admin/disputes/:disputeId/request-evidence
POST /api/admin/disputes/:disputeId/resolve
```

## Dispute Detail Sections

Show:

1. Dispute summary
2. Buyer claim
3. Seller response
4. Transaction terms
5. Buyer evidence
6. Seller evidence
7. Delivery QR verification
8. Serial number/barcode comparison
9. Audit timeline
10. Fraud flags
11. Admin decision panel

## Admin Decision Options

Admin can choose:

1. Release payment to seller
2. Refund buyer
3. Partial refund
4. Request return before refund
5. Request more evidence
6. Dismiss dispute
7. Mark transaction suspicious

## Decision Form Fields

- Decision type
- Amount, if partial refund
- Admin notes
- Reason for decision
- Confirmation checkbox

## Important Rule

Resolving a dispute must also update:

- Transaction status
- Wallet/ledger balances
- Trust scores
- Fraud flags
- Audit logs

## Deliverables

At the end of this phase:

- Admin can view disputes.
- Admin can review details.
- Admin can make a decision.
- Money movement logic is triggered safely.

---

# Phase 6: Evidence Review System

## Goal

Allow admin to inspect all evidence submitted by buyer and seller.

## Pages

1. Evidence section inside transaction details
2. Evidence section inside dispute details
3. Optional `/evidence` page for all evidence uploads

## Evidence Viewer Should Show

- Image/file preview
- Uploaded by
- Role: buyer/seller
- Evidence type
- Upload time
- Notes
- Metadata
- Image hash
- Location if available
- Related transaction
- Related dispute

## Useful Features

1. Side-by-side comparison
   - Seller product photo before delivery
   - Buyer received product photo

2. Serial number comparison
   - Seller submitted serial number
   - Buyer submitted serial number

3. Timeline evidence view
   - Show evidence in order of upload time

## Backend Endpoints

```http
GET /api/admin/evidence
GET /api/admin/transactions/:transactionId/evidence
GET /api/admin/disputes/:disputeId/evidence
```

## Deliverables

At the end of this phase:

- Admin can view buyer evidence.
- Admin can view seller evidence.
- Admin can compare evidence side by side.
- Admin can use evidence to make dispute decisions.

---

# Phase 7: Audit Timeline

## Goal

Show the full history of actions for each transaction/dispute.

## Pages

- Transaction Details
- Dispute Details
- Optional `/audit-logs`

## Audit Timeline Example

```text
10:00 AM - Buyer created transaction.
10:05 AM - Buyer funded escrow.
10:12 AM - Seller accepted terms.
11:00 AM - Seller uploaded product evidence.
12:25 PM - Delivery QR was scanned.
12:30 PM - Buyer opened dispute.
12:45 PM - Seller responded to dispute.
01:10 PM - Admin released payment to seller.
```

## Backend Endpoints

```http
GET /api/admin/audit-logs
GET /api/admin/transactions/:transactionId/audit-logs
```

## Audit Log Table Columns

- Time
- User
- Role
- Action
- Description
- Related Transaction
- Metadata

## Deliverables

At the end of this phase:

- Admin can see complete transaction history.
- Admin can trace what happened before making a decision.
- Admin actions are recorded.

---

# Phase 8: Fraud Flags and Risk Review

## Goal

Help admin identify suspicious activity.

## Pages

1. `/fraud-flags`
2. Fraud section inside transaction details
3. Fraud section inside user details

## Fraud Flag Table Columns

- Flag Type
- Risk Level
- User
- Transaction
- Reason
- Status
- Created Date
- Action

## Risk Levels

Use:

- Low
- Medium
- High

## Example Fraud Rules

Flag a case when:

1. Buyer opens too many disputes.
2. Seller receives too many fake-product complaints.
3. Transaction is high-value and both users are new.
4. QR location is far from expected delivery location.
5. Buyer refuses to release payment after QR scan.
6. Seller is late repeatedly.
7. Serial number does not match.
8. Evidence image similarity is low.
9. Same device is used for many accounts.

## Backend Endpoints

```http
GET /api/admin/fraud-flags
PATCH /api/admin/fraud-flags/:flagId/status
```

## Admin Flag Actions

Admin can:

- Confirm flag
- Dismiss flag
- Mark user for monitoring
- Restrict user
- Suspend user

## Deliverables

At the end of this phase:

- Admin can view fraud flags.
- Admin can act on suspicious activity.
- Fraud review supports dispute resolution.

---

# Phase 9: User Management

## Goal

Allow admin to view buyer and seller history.

## Pages

1. `/users`
2. `/users/:userId`

## Users Table Columns

- Name/Phone/Email
- Role
- Trust Score
- Wallet Balance
- Status
- Transactions
- Disputes
- Created Date
- Action

## User Detail Sections

Show:

1. User profile
2. Trust score
3. Wallet summary
4. Transactions
5. Disputes
6. Fraud flags
7. Ratings
8. Audit history
9. Admin notes

## Backend Endpoints

```http
GET /api/admin/users
GET /api/admin/users/:userId
PATCH /api/admin/users/:userId/status
```

## Admin User Actions

Admin can:

- Restrict user
- Suspend user
- Reactivate user
- Add admin note
- View user transaction history

## Deliverables

At the end of this phase:

- Admin can inspect users.
- Admin can understand buyer/seller behavior.
- Admin can restrict suspicious accounts.

---

# Phase 10: Wallet and Ledger Review

## Goal

Allow admin to track money movement in the simulated escrow system.

## Pages

1. `/ledger`
2. Ledger section inside transaction details
3. Ledger section inside user details

## Ledger Table Columns

- Ledger ID
- Transaction Code
- From
- To
- Amount
- Type
- Status
- Created Date

## Ledger Types

- Fund
- Release
- Refund
- Partial Refund

## Backend Endpoints

```http
GET /api/admin/ledger
GET /api/admin/transactions/:transactionId/ledger
GET /api/admin/users/:userId/ledger
```

## Important Ledger Rules

1. Funding locks buyer funds.
2. Release transfers locked funds to seller.
3. Refund returns locked funds to buyer.
4. Partial refund splits funds.
5. Every money movement must create a ledger entry.
6. Every ledger action must create an audit log.

## Deliverables

At the end of this phase:

- Admin can see all money movements.
- Admin can verify dispute decisions affected balances correctly.
- Ledger supports financial accountability in the prototype.

---

# Phase 11: Admin Notes and Internal Case Management

## Goal

Allow admin to keep internal notes on disputes, transactions, and users.

## Features

Admin should be able to add notes to:

- Transaction
- Dispute
- User
- Fraud flag

## Note Fields

- Admin ID
- Related entity type
- Related entity ID
- Note body
- Created date

## Backend Endpoints

```http
POST /api/admin/notes
GET /api/admin/notes?entityType=dispute&entityId=123
```

## Deliverables

At the end of this phase:

- Admin can document reasoning.
- Multiple admins can understand previous decisions.
- Arbitration process becomes more transparent.

---

# Phase 12: Notifications and Status Updates

## Goal

Notify users when admin takes action.

## Events That Should Trigger Notifications

1. Dispute opened
2. More evidence requested
3. Seller responded to dispute
4. Admin decision made
5. Payment released
6. Refund processed
7. User restricted or suspended

## Backend Endpoints

```http
POST /api/notifications
GET /api/notifications/user/:userId
PATCH /api/notifications/:notificationId/read
```

## For Prototype

You can implement in-app notifications only.

Do not worry about push notifications first.

## Deliverables

At the end of this phase:

- Buyer/seller can know when admin acts.
- Dispute process feels complete.

---

# Phase 13: Polish, Testing, and Final Defense Preparation

## Goal

Make the dashboard stable, clean, and presentable.

## Testing Checklist

Test these workflows:

### Authentication

- Admin login works.
- Non-admin cannot access dashboard.
- Logout works.

### Transaction Review

- Admin can view all transactions.
- Admin can open transaction details.
- Filters work.

### Dispute Resolution

- Buyer opens dispute.
- Seller responds.
- Admin reviews evidence.
- Admin releases payment.
- Admin refunds buyer.
- Admin does partial refund.
- Audit logs are created.

### Evidence

- Evidence displays correctly.
- Buyer/seller evidence can be compared.
- Metadata is visible.

### Wallet/Ledger

- Funding locks buyer money.
- Release transfers money to seller.
- Refund returns money to buyer.
- Partial refund works.

### Fraud

- Fraud flags appear.
- Admin can confirm/dismiss flags.
- User status can be restricted/suspended.

## Final Defense Screens to Show

During your presentation, show:

1. Dashboard overview
2. Disputed transactions list
3. Dispute details page
4. Evidence comparison
5. QR delivery verification record
6. Audit timeline
7. Admin decision modal
8. Ledger update after decision
9. Trust score/fraud flag update

## Deliverables

At the end of this phase:

- Dashboard is ready for demo.
- Main workflows are tested.
- Screenshots can be added to project report.

---

# Suggested Build Order

Build in this exact order:

1. Admin authentication
2. Dashboard layout
3. Transactions list
4. Transaction detail page
5. Disputes list
6. Dispute detail page
7. Evidence viewer
8. Admin decision actions
9. Audit logs
10. Wallet/ledger review
11. Fraud flags
12. User management
13. Charts and analytics
14. Notifications
15. UI polish and testing

---

# MVP Version of Admin Arbitration Dashboard

If time is limited, build only this:

1. Admin login
2. Dashboard summary
3. Transactions list
4. Transaction detail page
5. Disputes list
6. Dispute detail page
7. Evidence viewer
8. Release/refund decision buttons
9. Audit logs
10. Ledger update after decision

That is enough to demonstrate admin arbitration properly.

---

# Admin Decision Logic

## Release Payment to Seller

Use when:

- Buyer scanned delivery QR.
- Seller has strong delivery evidence.
- Buyer has weak or no valid complaint.
- Inspection period expired.
- No convincing evidence of fake/wrong/damaged product.

System should:

1. Move locked escrow funds to seller wallet.
2. Mark transaction as `released`.
3. Mark dispute as `resolved`.
4. Add audit log.
5. Update trust scores.
6. Notify buyer and seller.

---

## Refund Buyer

Use when:

- Seller sent fake product.
- Seller sent wrong item.
- Seller failed to deliver.
- Seller evidence is weak.
- Buyer evidence is strong.

System should:

1. Move locked escrow funds back to buyer wallet.
2. Mark transaction as `refunded`.
3. Mark dispute as `resolved`.
4. Add audit log.
5. Update trust scores.
6. Notify buyer and seller.

---

## Partial Refund

Use when:

- Product arrived but has minor issue.
- Buyer and seller share responsibility.
- Admin decides seller should receive part of payment.

System should:

1. Split locked escrow funds.
2. Send part to seller.
3. Return part to buyer.
4. Mark transaction as `partially_refunded`.
5. Mark dispute as `resolved`.
6. Add audit log.
7. Notify both parties.

---

## Request More Evidence

Use when:

- Buyer evidence is unclear.
- Seller evidence is unclear.
- QR scan is missing.
- Product identity cannot be verified.

System should:

1. Mark dispute as `awaiting_evidence`.
2. Notify buyer/seller.
3. Keep funds locked.
4. Add audit log.

---

## Mark as Suspicious

Use when:

- Evidence looks fake.
- User has repeated disputes.
- QR/token activity is suspicious.
- Transaction behavior is unusual.

System should:

1. Add fraud flag.
2. Keep transaction under review.
3. Optionally restrict user.
4. Add audit log.

---

# UI Components to Build

## StatusBadge

Shows transaction/dispute status.

Examples:

- Funded
- Under Inspection
- Disputed
- Released
- Refunded
- Awaiting Evidence

## RiskBadge

Shows fraud risk.

Examples:

- Low Risk
- Medium Risk
- High Risk

## EvidenceCard

Shows evidence image, uploader, role, time, and notes.

## Timeline

Shows ordered audit logs.

## DecisionPanel

Shows admin decision buttons and decision form.

## ConfirmDialog

Used before serious actions.

## UserTrustCard

Shows user trust score and dispute history.

## LedgerCard

Shows escrow money movement.

---

# Backend API Summary

## Auth

```http
POST /api/admin/auth/login
GET /api/admin/auth/me
POST /api/admin/auth/logout
```

## Dashboard

```http
GET /api/admin/dashboard/stats
```

## Transactions

```http
GET /api/admin/transactions
GET /api/admin/transactions/:transactionId
GET /api/admin/transactions/:transactionId/evidence
GET /api/admin/transactions/:transactionId/audit-logs
GET /api/admin/transactions/:transactionId/ledger
```

## Disputes

```http
GET /api/admin/disputes
GET /api/admin/disputes/:disputeId
PATCH /api/admin/disputes/:disputeId/status
POST /api/admin/disputes/:disputeId/request-evidence
POST /api/admin/disputes/:disputeId/resolve
```

## Evidence

```http
GET /api/admin/evidence
GET /api/admin/disputes/:disputeId/evidence
```

## Users

```http
GET /api/admin/users
GET /api/admin/users/:userId
PATCH /api/admin/users/:userId/status
```

## Fraud

```http
GET /api/admin/fraud-flags
PATCH /api/admin/fraud-flags/:flagId/status
```

## Ledger

```http
GET /api/admin/ledger
GET /api/admin/users/:userId/ledger
```

## Audit

```http
GET /api/admin/audit-logs
```

## Notes

```http
POST /api/admin/notes
GET /api/admin/notes
```

---

# Backend Safety Rules for Admin Actions

Before releasing or refunding funds, backend should check:

1. Admin is authenticated.
2. Admin has permission.
3. Transaction exists.
4. Transaction is disputed or under admin review.
5. Escrow funds are still locked.
6. Transaction has not already been released/refunded.
7. Decision reason is provided.
8. Ledger update succeeds.
9. Transaction status update succeeds.
10. Audit log is created.

Use database transactions if using PostgreSQL.

If using MongoDB, use sessions/transactions if available.

---

# Example Admin Resolve Dispute Request

```json
{
  "decision": "partial_refund",
  "refundAmount": 150,
  "sellerAmount": 350,
  "adminNotes": "Product was delivered but had a minor defect. Buyer evidence and seller evidence both support partial compensation.",
  "markSuspicious": false
}
```

---

# Example Admin Resolve Dispute Response

```json
{
  "message": "Dispute resolved successfully",
  "transaction": {
    "id": "txn_123",
    "status": "partially_refunded"
  },
  "dispute": {
    "id": "disp_456",
    "status": "resolved",
    "adminDecision": "partial_refund"
  },
  "ledgerEntries": [
    {
      "type": "partial_refund",
      "amount": 150,
      "to": "buyer"
    },
    {
      "type": "release",
      "amount": 350,
      "to": "seller"
    }
  ]
}
```

---

# Final Development Advice

Do not start by designing charts and analytics.

Start with the **dispute detail page**, because that is the heart of admin arbitration.

The most important screen is:

## Dispute Details Page

It should show:

1. Buyer claim
2. Seller response
3. Transaction terms
4. Evidence comparison
5. QR delivery record
6. Audit timeline
7. Fraud flags
8. Admin decision panel

If this page works well, the arbitration dashboard will make sense.

---

# Best MVP Flow to Demo

Use this scenario:

1. Buyer creates transaction for a phone.
2. Buyer funds escrow.
3. Seller accepts and uploads product photo.
4. Seller delivers item and shows QR.
5. Buyer scans QR.
6. Buyer opens dispute claiming fake product.
7. Buyer uploads evidence.
8. Seller uploads counter-evidence.
9. Admin opens dashboard.
10. Admin reviews transaction terms, evidence, QR scan, and audit logs.
11. Admin decides refund/release/partial refund.
12. System updates transaction, ledger, trust score, and audit log.

This is the strongest flow to demonstrate in your final project defense.

---

# End Goal

The admin arbitration dashboard should prove that the escrow app is not just a simple payment vault. It is a trust system that can fairly handle disputes, protect both buyers and sellers, record evidence, and support transparent decisions.
