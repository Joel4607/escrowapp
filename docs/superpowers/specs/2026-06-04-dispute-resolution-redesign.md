# Dispute Resolution Redesign Spec

## Overview

Redesign the dispute resolution workflow to handle physical goods returns. The current system can refund a buyer without requiring the product to be returned, creating a vulnerability. This spec introduces a structured return-and-dispute workflow that protects both parties through phased evidence collection, admin-gated returns, counter-disputes, and automatic deadline enforcement.

## Approach

**Approach B: Return Transaction (Separate but Linked)**

A dedicated `return_transactions` table linked to the original transaction. When the admin approves a return, a new return transaction is created with its own status machine, delivery token, evidence chain, and deadlines. The original transaction stays in `disputed` status until the return completes. Evidence is tagged by phase so the admin sees a clear timeline.

---

## 1. Dispute State Machine

### Original Transaction States (dispute path)

```
delivered / under_inspection
  -> disputed                    (buyer/seller raises dispute)
  -> admin_review                (admin begins review)
  -> return_approved             (admin approves return)
  -> return_in_progress          (buyer ships item back)
  -> return_delivered            (seller confirms receipt)
  -> return_inspection           (seller inspecting returned item)
  -> released / refunded / partially_refunded   (final resolution)
```

### New Transaction Statuses

Add to `transaction_status` enum:
- `return_approved`
- `return_in_progress`
- `return_delivered`
- `return_inspection`

### Return Transaction States (separate lifecycle)

```
created                         (admin approves return, return tx auto-created)
  -> awaiting_shipment           (buyer must package, upload evidence, generate token)
  -> in_transit                  (buyer generated token, item is being shipped)
  -> delivered                   (seller enters token, confirms receipt)
  -> inspection                  (seller inspecting the returned item)
  -> approved                    (seller approves -> triggers buyer refund)
  -> counter_disputed            (seller raises counter-dispute)
  -> resolved                    (admin resolves counter-dispute)
  -> expired                     (buyer didn't ship within deadline -> funds go to seller)
```

### Coordination Between Transaction and Return

| Return Transaction Event | Original Transaction Update |
|---|---|
| Return tx created | -> `return_approved` |
| Buyer generates return token | -> `return_in_progress` |
| Seller confirms receipt | -> `return_delivered` |
| Seller starts inspection | -> `return_inspection` |
| Seller approves return | -> `refunded` (funds back to buyer) |
| Seller counter-disputes | stays at `return_inspection` |
| Admin resolves counter-dispute | -> `refunded` / `partially_refunded` / `released` |
| Return deadline expires | -> `released` (funds go to seller) |

---

## 2. Data Model

### New Table: `return_transactions`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `original_transaction_id` | UUID (FK -> transactions) | |
| `dispute_id` | UUID (FK -> disputes) | |
| `return_deadline` | TIMESTAMPTZ | Set by admin |
| `buyer_location` | TEXT | City/area |
| `seller_location` | TEXT | City/area |
| `seller_return_conditions` | TEXT | Set when seller accepted original tx |
| `status` | return_status ENUM | |
| `shipped_at` | TIMESTAMPTZ | |
| `delivered_at` | TIMESTAMPTZ | |
| `inspection_deadline` | TIMESTAMPTZ | Auto-set on delivery |
| `resolved_at` | TIMESTAMPTZ | |
| `resolution` | TEXT | approved / counter_disputed / expired |
| `created_at` | TIMESTAMPTZ | |
| `created_by` | UUID | Admin who approved return |
| `admin_notes` | TEXT | Reason for approving return |

### New Enum: `return_status`

```
'created', 'awaiting_shipment', 'in_transit', 'delivered',
'inspection', 'approved', 'counter_disputed', 'resolved', 'expired'
```

### New Table: `counter_disputes`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `return_transaction_id` | UUID (FK -> return_transactions) | |
| `original_dispute_id` | UUID (FK -> disputes) | |
| `opened_by` | UUID (FK -> users) | The seller |
| `reason` | TEXT | |
| `description` | TEXT | |
| `status` | dispute_status ENUM | Reuse existing enum |
| `admin_decision` | TEXT | |
| `admin_notes` | TEXT | |
| `resolution_type` | TEXT | refund_buyer / release_to_seller / partial_refund |
| `refund_amount` | NUMERIC | |
| `created_at` | TIMESTAMPTZ | |
| `resolved_at` | TIMESTAMPTZ | |

### New Table: `evidence_requirements`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `phase` | TEXT | original, dispute, return_shipment, return_receipt, counter_dispute |
| `category` | TEXT | front, back, serial_number, seal, etc. |
| `label` | TEXT | "Front view", "Seal close-up", etc. |
| `description` | TEXT | "Take a clear photo of the front of the item" |
| `is_required` | BOOLEAN | |
| `sort_order` | INTEGER | |

### Modifications to Existing Tables

**`transactions` table -- add columns:**
- `buyer_location` TEXT (city/area, set at creation)
- `seller_location` TEXT (set when seller accepts)
- `seller_return_conditions` TEXT (set when seller accepts)

**`evidence` table -- add columns:**
- `phase` TEXT ('original', 'dispute', 'return_shipment', 'return_receipt', 'counter_dispute')
- `category` TEXT ('front', 'back', 'left', 'right', 'top', 'bottom', 'serial_number', 'seal', 'seal_condition', 'defect', 'packaging', 'accessories', 'unique_identifier', 'other')

### Evidence Phase Map

| Phase | Who uploads | Required categories | Optional categories |
|---|---|---|---|
| `original` | Seller (pre-delivery) | front, back | sides, serial_number, accessories, packaging, unique_identifier |
| `dispute` | Buyer | defect, front, back | serial_number, accessories, unique_identifier |
| `return_shipment` | Buyer (packing to return) | seal, front, back | sides, serial_number, accessories, packaging |
| `return_receipt` | Seller (receiving return) | seal_condition, front, back | defect, serial_number, accessories, unique_identifier |
| `counter_dispute` | Seller | defect, front, back | serial_number, unique_identifier, other |

---

## 3. Permissions & Business Rules

### Permissions Matrix

| Action | Buyer | Seller | Admin |
|---|---|---|---|
| Raise dispute | Yes (delivered/under_inspection) | Yes (delivered/under_inspection) | No |
| Upload dispute evidence | Yes | Yes | No |
| Approve return | No | No | Yes (sets deadline) |
| Set return conditions | No | Yes (at acceptance time) | No |
| Upload return shipment evidence | Yes | No | No |
| Generate return delivery token | Yes | No | No |
| Confirm return receipt | No | Yes (enters token) | No |
| Upload return receipt evidence | No | Yes | No |
| Approve return condition | No | Yes | No |
| Raise counter-dispute | No | Yes (during return inspection) | No |
| Upload counter-dispute evidence | No | Yes | No |
| Resolve dispute / counter-dispute | No | No | Yes |
| Request additional evidence | No | No | Yes |
| Delete own evidence | Yes (own, before admin_review) | Yes (own, before admin_review) | No |
| View all evidence | Yes (own tx) | Yes (own tx) | Yes (all) |
| Set return deadline | No | No | Yes |

### Business Rules

**Dispute raising:**
- Only allowed in `delivered` or `under_inspection` status
- Buyer must upload all required evidence photos (per phase config) before submitting
- Dispute reason is required, description is optional
- Only one active dispute per transaction

**Return deadline enforcement:**
- Admin sets the deadline when approving the return, informed by buyer/seller locations
- If the buyer does not generate a return delivery token before the deadline, the return transaction auto-expires
- On expiry: all locked funds released to seller, original transaction -> `released`, return transaction -> `expired`

**Location-based deadline guidelines (shown to admin):**

| Distance | Suggested deadline |
|---|---|
| Same area/neighborhood | 2 days |
| Same city | 3-5 days |
| Different city, same state | 5-7 days |
| Different state | 7-10 days |

**Return inspection period:**
- Seller gets the same inspection period as the original transaction's `inspection_period`
- If the seller does not approve or counter-dispute within the period, the return is auto-approved and buyer gets refunded

**Counter-dispute rules:**
- Seller can only counter-dispute during return inspection
- Seller must upload at least one evidence photo
- Once counter-disputed, only the admin can resolve

**Fund movements:**

| Event | Fund movement |
|---|---|
| Dispute raised | Funds stay locked in escrow |
| Admin approves return | Funds stay locked |
| Return deadline expires | Locked funds -> seller wallet |
| Seller approves return | Locked funds -> buyer wallet (refund) |
| Admin resolves: refund buyer | Locked funds -> buyer wallet |
| Admin resolves: release to seller | Locked funds -> seller wallet |
| Admin resolves: partial refund | Split: buyer gets refund amount, seller gets remainder |
| Inspection period expires (no action) | Locked funds -> buyer wallet (auto-approved) |

**Evidence integrity rules:**
- Phase `open`: evidence can be uploaded and deleted by uploader
- Phase `admin_review` or later: evidence can be uploaded but NOT deleted
- Phase `resolved`: no new evidence accepted, all evidence is read-only archive
- All evidence uploads are permanently logged in audit trail

---

## 4. Notifications & Timeline Events

### Notifications

| Trigger | Recipient | Message |
|---|---|---|
| Dispute raised | Other party | "A dispute has been raised on TXN-XXXXX" |
| Dispute raised | Admin | "New dispute on TXN-XXXXX requires review" |
| Admin requests evidence | Buyer & Seller | "Admin has requested additional evidence for TXN-XXXXX" |
| Return approved | Buyer | "Return approved for TXN-XXXXX. Ship the item back by [deadline]" |
| Return approved | Seller | "A return has been approved for TXN-XXXXX. Awaiting buyer's shipment" |
| Buyer ships return | Seller | "Buyer has shipped the return for TXN-XXXXX" |
| Return deadline warning (24h) | Buyer | "You have 24 hours to ship the return for TXN-XXXXX" |
| Return deadline expired | Buyer | "Return deadline expired. Funds released to seller" |
| Return deadline expired | Seller | "Buyer failed to return item. Funds have been released to you" |
| Seller receives return | Buyer | "Seller has received the returned item for TXN-XXXXX" |
| Seller approves return | Buyer | "Return approved. Refund of [amount] has been credited" |
| Counter-dispute raised | Buyer | "Seller has raised a counter-dispute on your return" |
| Counter-dispute raised | Admin | "Counter-dispute raised on TXN-XXXXX return" |
| Inspection period warning (24h) | Seller | "You have 24 hours to inspect the returned item for TXN-XXXXX" |
| Inspection auto-approved | Buyer | "Return auto-approved. Refund credited" |
| Inspection auto-approved | Seller | "Inspection period expired. Return was auto-approved" |
| Admin resolves | Buyer & Seller | "Admin has resolved the dispute on TXN-XXXXX" |

### Audit Log Events

All state transitions are logged in `audit_logs` with:
- `transaction_id`
- `user_id` and `user_role`
- `action` (e.g., `RETURN_APPROVED`, `COUNTER_DISPUTE_RAISED`, `RETURN_EXPIRED`)
- `description`
- `metadata` (JSON with relevant IDs, amounts, deadlines)
- `created_at` timestamp

---

## 5. Admin UI Flow

### Dispute Review Dashboard

Phase-tabbed evidence comparison with four tabs: Original, Dispute, Return, Counter-Dispute. Each tab shows evidence from the relevant phase with side-by-side comparison (uploader A vs uploader B).

**Admin actions on initial dispute:**
- Approve Return (prompts for deadline in days, admin notes)
- Refund Buyer
- Release to Seller
- Partial Refund (prompts for refund amount)
- Request Evidence
- Dismiss

**Admin sees when approving return:**
- Buyer and seller locations
- Suggested deadline based on distance
- Seller's return conditions
- All dispute evidence

**Return tracking tab:**
- Return timeline with status dots
- Deadline countdown
- Return evidence (buyer shipment vs seller receipt)

**Counter-dispute tab (when raised):**
- Seller's reason and description
- Side-by-side: buyer's return photos vs seller's receipt photos
- Seller's return conditions with violation flags
- Admin actions: Refund Buyer, Release to Seller, Partial Refund, Request Evidence

---

## 6. Mobile & Web User Experience

### Guided Evidence Capture

Evidence upload is guided per phase. The system presents a checklist of required and optional photo categories. Required photos must be completed before the user can proceed. Each category has a label and description explaining what to capture.

### Mobile -- Buyer Dispute Flow

1. Select dispute reason from predefined list
2. Enter optional description
3. Complete required evidence checklist (defect area, front, back)
4. Optionally add serial number, accessories, unique features
5. Submit button only enabled when all required photos are uploaded

### Mobile -- Buyer Return Flow

1. View seller's return conditions
2. Package item and create seal
3. Complete required evidence checklist (sealed package, front, back)
4. Generate return delivery token (only available after required photos)
5. Share token with dispatch rider
6. Track return progress

### Mobile -- Seller Return Inspection Flow

1. Enter return delivery token to confirm receipt
2. Photograph seal condition BEFORE opening
3. Open and inspect item
4. Complete evidence checklist (front, back, optional serial number, defect area)
5. Choose: Approve Return or Raise Counter-Dispute
6. If counter-dispute: provide reason, description, and evidence

### Web Invite Page -- Seller Flow

Same flow as mobile, adapted for browser. Uses browser file picker for evidence upload. All actions go through the `seller-web-action` edge function extended with new actions:
- `get_return_details` -- fetch return transaction status and evidence
- `upload_return_evidence` -- upload return receipt evidence
- `confirm_return_receipt` -- enter return delivery token
- `approve_return` -- approve the return condition
- `raise_counter_dispute` -- raise counter-dispute with evidence

### Real-Time Evidence Feed

Both parties see a live evidence feed on the transaction detail screen showing uploads as they happen, tagged by phase and color-coded:
- Green: normal transaction evidence (original phase)
- Red: dispute and counter-dispute evidence
- Blue: return shipment and receipt evidence

Each entry shows: role, phase, category, and relative timestamp. Tappable to view full image.

---

## 7. Fraud Prevention & Edge Cases

### Abuse Vectors & Mitigations

**Frivolous disputes:** Admin-gated returns mean baseless disputes get dismissed. Return deadline creates consequences for raising disputes without intent to return.

**Buyer swaps product:** Serial number and unique identifier evidence across phases creates a traceable product fingerprint. Admin compares identifiers across all phases.

**Seller falsely claims return damage:** Buyer's sealed package photo proves condition at shipment. Seller must photograph intact seal before opening. Admin compares return photos against receipt photos.

**Buyer never ships return:** Hard deadline with auto-expiry. No token generated = funds go to seller automatically.

**Seller ignores inspection:** Inspection period auto-expires. No action = return auto-approved, buyer refunded.

**Evidence tampering:** Deletion blocked after `admin_review` state. All uploads permanently logged with timestamps in audit trail.

**Deadline manipulation:** Return deadline starts when admin approves, not when dispute is raised. Buyer gets the full period.

### Edge Cases

| Edge Case | Handling |
|---|---|
| Both parties try to dispute simultaneously | Only one active dispute per transaction allowed |
| Buyer's account suspended during return | Deadline still applies, expiry releases funds to seller |
| Refund fails due to insufficient escrow | Not possible, funds are locked from the start |
| Product destroyed in transit during return | Seller photographs damage, raises counter-dispute. Admin decides, likely partial refund |
| Buyer uploads evidence but never generates token | Same as not shipping, deadline expires, funds to seller |
| Both parties go silent after return approved | Deadline expires -> funds to seller. Inspection expires -> refund to buyer. System self-resolves |
| Admin needs to override auto-expiry | Admin can manually resolve via dispute panel at any time |

---

## 8. Implementation Scope

### Database Changes
- New enum: `return_status`
- New table: `return_transactions`
- New table: `counter_disputes`
- New table: `evidence_requirements`
- Add 4 values to `transaction_status` enum
- Add columns to `transactions`: `buyer_location`, `seller_location`, `seller_return_conditions`
- Add columns to `evidence`: `phase`, `category`

### RPC Functions
- `admin_approve_return(dispute_id, deadline_days, admin_notes)` -- creates return tx, updates statuses
- `generate_return_delivery_token(return_transaction_id)` -- buyer generates token
- `confirm_return_delivery(return_transaction_id, token)` -- seller enters token
- `approve_return(return_transaction_id)` -- seller approves, triggers refund
- `raise_counter_dispute(return_transaction_id, reason, description)` -- seller counter-disputes
- `admin_resolve_counter_dispute(counter_dispute_id, decision, admin_notes, refund_amount)` -- admin resolves
- `expire_overdue_returns()` -- background job for deadline enforcement

### Edge Functions
- Extend `seller-web-action` with return-related actions
- New notification triggers for return events

### Mobile App Changes
- Enhanced dispute screen with guided evidence capture
- New return shipment screen for buyer
- New return inspection screen for seller
- Evidence feed component with phase/color coding
- Updated transaction detail to show return status

### Web Changes
- Return tracking on web invite page
- Seller return receipt and inspection on web
- Counter-dispute UI on web

### Admin Dashboard Changes
- Phase-tabbed evidence comparison
- Return approval dialog with deadline picker
- Return tracking tab
- Counter-dispute review panel
