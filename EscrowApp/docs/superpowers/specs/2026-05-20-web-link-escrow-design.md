# Web Link Escrow Product Direction Design

Date: 2026-05-20
Status: Approved direction, pending implementation plan

## Summary

The product should move from a mobile-first escrow flow to a web-link-first escrow flow, while keeping the mobile app as the richer experience for registered and repeat users.

The core product promise is:

Create transaction link -> send link -> seller reviews and accepts in browser -> buyer funds -> seller delivers -> buyer confirms -> funds release or dispute starts.

The important change is that invited sellers and buyers should not be forced to download the mobile app before they can participate. A first-time seller should be able to open a secure transaction link in a browser, review the terms, verify their contact method, accept the transaction, track status, upload delivery evidence, and complete required verification only when the transaction risk requires it.

The current Expo/Supabase app already has much of the transaction lifecycle: transaction creation, seller join, funding, delivery token, inspection, release, disputes, evidence, audit logs, and notifications. The next product direction should add a secure browser invite layer and move sensitive state transitions to server-side functions.

## Academic Prototype Scope

For the final year project version, the product will not process real money. It will use simulated escrow balances and email-based participant verification.

In this prototype, seller verification means the seller proves control of the email address that the buyer invited. It does not prove the seller's full legal identity. This is acceptable for the academic prototype because the goal is to demonstrate the secure transaction-link workflow, escrow state management, activity tracking, and notification behavior without handling regulated money movement.

Prototype identity statement:

> Email OTP verification confirms that the person accepting the transaction controls the invited email address. A production version would require stronger checks such as phone verification, KYC, payout account verification, payment provider risk checks, and compliance review before real funds are released.

Prototype money statement:

> All wallet balances, escrow locks, releases, and refunds are simulated. No real money is collected, held, transferred, or paid out. Release events are demonstrated through internal ledger updates and email notifications.

## Recommendation

Build a hybrid system:

- Web/PWA first for transaction links, invited sellers, first-time users, and fast transaction participation.
- Mobile app for registered users, repeat buyers/sellers, push notifications, wallet/trust history, QR handoff, and richer account management.
- Shared backend for both web and mobile so transaction state, payments, disputes, and evidence are consistent.

This is better than mobile-only because seller friction can prevent buyers from completing purchases. It is better than web-only because a native app can still improve retention, notifications, and repeat usage after trust has been established.

## Product Principles

1. The first transaction should feel lightweight.
2. Money movement should never be lightweight internally.
3. Account creation should be progressive, not front-loaded.
4. Payment and release decisions must be server-authoritative.
5. Every material action should be auditable.
6. High-value or risky transactions should add verification at the point of risk.
7. The mobile app should be optional for participation and valuable for repeat use.

## User Roles

Buyer:

- Creates the transaction.
- Sends the transaction link.
- Funds escrow through the approved payment provider.
- Confirms receipt or opens a dispute.
- Can track from mobile app or web.

Seller:

- Receives a secure link.
- Opens it in browser.
- Reviews transaction terms.
- Verifies invited contact method.
- Accepts, rejects, delivers, uploads evidence, and sets up payout.
- Can later install/sign in to the mobile app for repeat usage.

Admin or operations reviewer:

- Reviews disputes and high-risk transactions.
- Can freeze, release, refund, partially refund, or require more evidence.
- Reviews audit logs, risk flags, user history, and payment state before decisions.

## Core Transaction Flow

1. Buyer creates transaction draft.
2. Buyer enters item details, price, seller contact, delivery deadline, inspection period, and terms.
3. Buyer verifies email or phone if not already verified.
4. System creates a secure seller invite link.
5. Buyer sends link to seller through SMS, WhatsApp, email, or copy/share.
6. Seller opens link in browser.
7. Seller sees limited safe preview before verification.
8. Seller enters their email address.
9. System checks that the entered email matches the seller email invited by the buyer.
10. System sends a one-time password to that email address.
11. Seller enters the OTP in the web app.
12. If the OTP is correct, the seller is marked as verified for that transaction.
13. Seller reviews full transaction details.
14. Seller accepts or rejects.
15. Buyer funds escrow with simulated wallet balance.
16. System locks the simulated amount in escrow and writes a ledger entry.
17. Seller ships or delivers item.
18. Seller adds tracking, delivery notes, photos, or handoff evidence.
19. Buyer confirms receipt.
20. Inspection timer starts.
21. Buyer approves release, or funds auto-release after the inspection deadline if there is no dispute.
22. System moves simulated funds from locked escrow to the seller's simulated balance.
23. Seller receives an email saying the simulated funds have been released.
24. If either party disputes before release, simulated funds are frozen for admin review.
25. Admin resolves by release, refund, partial refund, return required, or continued review.

## State Model

Recommended transaction statuses:

- draft
- invite_created
- seller_viewed
- seller_verified
- seller_accepted
- seller_rejected
- awaiting_payment
- payment_pending
- funded
- in_delivery
- delivered
- under_inspection
- release_pending
- released
- disputed
- admin_review
- refunded
- partially_refunded
- cancelled
- expired

The existing statuses can be adapted instead of fully replaced. The key change is separating invite/auth/payment states clearly enough that the app does not confuse "seller has link" with "seller is verified" or "buyer tried to pay" with "funds are confirmed."

## Invite Link Design

Do not use the visible transaction code as the security credential. The current transaction code can remain as a human-readable reference, but the web link should use a high-entropy secret.

Recommended link shape:

`https://app.example.com/t/<publicInviteId>#<inviteSecret>`

or:

`https://app.example.com/invite/<publicInviteId>?token=<inviteSecret>`

Preferred security pattern:

- Generate at least 128 bits of cryptographic randomness.
- Store only a hash or HMAC of the secret.
- Make invite tokens single-use for claiming.
- Keep the display transaction code separate from the invite token.
- Expire standard seller invites after 3 to 7 days.
- Expire high-value invites after 24 to 48 hours.
- Allow buyer to revoke and regenerate invite links.
- Require email OTP to the invited seller email before accepting in the academic prototype.
- Rate-limit token exchange and OTP attempts.
- Log IP, user agent, device fingerprint when practical, and timestamp.

Before seller verification, show only safe information:

- Buyer display name or masked identity.
- Item title.
- Price range or exact price depending on risk policy.
- Expiry warning.
- Verification prompt.

After seller verification, show full transaction details:

- Item name, description, photos, condition, price, fees.
- Delivery deadline.
- Inspection period.
- Release rules.
- Dispute rules.
- Buyer identity/trust indicators allowed by policy.

## Authentication And Onboarding

Buyer account rules:

- Buyer can draft a transaction without a full account.
- Buyer must verify email or phone before sending an invite link.
- Buyer must create or claim an account before funding.
- Buyer must pass stronger verification for high-value transactions, repeated disputes, suspicious devices, chargeback risk, or regulated thresholds.

Seller account rules:

- Seller can open the link without an account.
- Seller can preview limited details without an account.
- Seller must verify the invited email address before accepting in the academic prototype.
- Seller can accept with a lightweight account created behind the scenes after OTP verification.
- Seller receives simulated release confirmation by email instead of real payout in the academic prototype.
- Seller must complete payout setup before receiving real funds in a production version.
- In production, seller must complete KYC before release if transaction value, payout method, risk score, or compliance policy requires it.

Academic prototype seller verification flow:

1. Buyer creates a transaction and enters the seller's email address.
2. System generates an invite link tied to that email address.
3. Seller opens the link and enters their email.
4. If the email does not match the invited seller email, the seller cannot continue.
5. If the email matches, the system sends a 6-digit OTP to the seller's email.
6. OTP expires after 5 to 15 minutes.
7. OTP attempts are limited to prevent guessing.
8. When OTP is correct, the seller is verified for that transaction.
9. Seller can accept, reject, track activity, and upload delivery evidence from the web app.

Progressive onboarding checkpoints:

- Draft: no account required.
- Send invite: buyer should be signed in or have a verified email.
- Accept invite: verified invited email required.
- Fund: buyer account and simulated wallet balance required for the academic prototype.
- Deliver: seller account session required.
- Payout/release: simulated release email sent to seller in the academic prototype.
- Real payout/release: seller payout verification and required KYC complete in production.
- High risk: admin or enhanced verification required.

## Payment Architecture

For the academic prototype, payment is simulated. The app can keep internal wallet and escrow balances to demonstrate the transaction lifecycle:

- Buyer has a simulated `wallet_balance`.
- Buyer has a simulated `locked_balance`.
- Funding deducts from the buyer's simulated wallet and increases their locked balance.
- Releasing escrow decreases the buyer's locked balance and increases the seller's simulated wallet balance.
- Refunds move simulated locked balance back to the buyer.
- Ledger entries record all simulated fund, release, and refund events.
- Seller receives an email notification when simulated funds are released.

The release email should clearly state that no real money was transferred. Example:

> Your escrow transaction TXN-12345 has been completed. Simulated funds of GHS 500.00 have been released to your seller balance. This is a project demonstration and no real money was transferred.

Production payment architecture:

The database wallet should not be treated as the actual holder of funds. It should be a ledger mirror of payment provider events.

Recommended payment approach:

- Use a licensed payment provider or escrow-capable partner for actual money movement.
- Create payment intents, checkout sessions, or mobile money payment requests from server-side functions.
- Treat webhooks as the source of truth for funding, settlement, refunds, chargebacks, and payout status.
- Keep internal ledger entries idempotent and linked to provider event IDs.
- Use manual release or delayed transfer only if allowed by provider policy and local regulation.

Core payment records:

- payment id
- transaction id
- provider
- provider payment reference
- amount
- currency
- status
- payer user id
- raw webhook event id
- idempotency key
- created at
- updated at

Core payout records:

- payout id
- transaction id
- seller user id
- provider payout reference
- amount
- currency
- status
- provider account/recipient id
- failure reason
- created at
- updated at

Funding states:

- payment_created
- payment_authorized
- payment_captured
- payment_settled
- payment_failed
- payment_refunded
- chargeback_opened
- chargeback_lost
- chargeback_won

The transaction should move to funded only when the chosen provider event proves funds are safely available under the product's risk policy.

## Security Requirements

Day-one requirements:

- Server-side functions for invite creation, invite acceptance, simulated funding, release, refund, and dispute creation.
- Production payment initiation and webhook handling should be added only when real payment integration is introduced.
- Row Level Security on all user-facing tables.
- No direct client updates for money-sensitive state.
- Idempotency keys for payment, refund, release, and payout operations.
- Audit log for every state change and sensitive action.
- Private storage for evidence with signed URLs.
- Rate limiting on invite, OTP, login, payment, and dispute endpoints.
- Strong token generation and hashed token storage.
- Transaction status transition validation.
- Admin-only dispute and manual override actions.
- Webhook signature verification.
- Device/IP/user-agent capture for risk review.
- Basic risk flags for suspicious behavior.
- Email OTP codes should be stored as hashes, expire quickly, be single-use, and have attempt limits.
- Prototype emails must label simulated money clearly so users do not think real funds moved.

Release checks:

- Transaction is funded.
- Simulated ledger confirms funds are locked in the academic prototype.
- Payment provider confirms required funding state in production.
- Seller accepted terms.
- Seller email was verified with OTP in the academic prototype.
- Seller payout method is verified in production.
- Required KYC is complete in production when policy requires it.
- Delivery was confirmed or inspection period expired.
- No active dispute.
- No unresolved high-risk flag.
- No open chargeback or payment reversal signal in production.
- Admin approval present when policy requires it.

## Abuse And Fraud Controls

Link sharing abuse:

- Invite is tied to the intended seller email.
- OTP verification is sent to that email.
- Invite can only be claimed once.
- Buyer can revoke/regenerate invite.
- Suspicious claim attempts create risk flags.

Fake buyer:

- Require verified buyer contact before inviting.
- Require simulated funding confirmation before seller ships in the academic prototype.
- Require real payment confirmation before seller ships in production.
- Show seller "funds confirmed" only after simulated ledger confirmation in the academic prototype or payment webhook confirmation in production.
- Flag buyer with failed payments, repeated cancellations, or disputes.

Fake seller:

- Require seller to verify invited contact.
- Require payout verification before release.
- Build reputation and transaction history.
- Flag mismatched names, risky payout methods, and repeated disputes.

Payment reversal fraud:

- Not applicable to the academic prototype because no real money moves.
- Do not release before provider risk window/policy allows for the payment method.
- Monitor chargeback and reversal webhooks.
- Use reserves or delayed release for risky payment types if provider supports it.
- Require stronger verification for high-value transactions.

Delivery disputes:

- Require item description, condition, price, deadline, and inspection terms before funding.
- Encourage photos before shipment/handoff.
- Track delivery events and evidence.
- Freeze release when dispute opens.
- Keep audit trail immutable.

## UX Pages

Buyer mobile/web:

- Create transaction
- Transaction detail/activity timeline
- Share invite link
- Fund escrow/payment
- Delivery status
- Inspection/release
- Open dispute
- Evidence viewer
- Transaction history

Seller web:

- Invite landing page
- Verify invited email with OTP
- Review transaction
- Accept/reject
- Create lightweight account/session
- Track transaction
- Add delivery/shipping proof
- Set up payout account
- Receive simulated release email
- Respond to dispute
- Continue in mobile app prompt after key action, not before

Admin:

- Transaction search
- Transaction detail with audit log
- Dispute queue
- Evidence review
- Risk flags
- Manual release/refund/partial refund tools
- User profile and history

## Existing App Impact

The existing Expo app should not be discarded. It should be adapted into a universal app where selected routes work well on web:

- `/transaction/create`
- `/transaction/[id]`
- `/transaction/join`
- new `/invite/[inviteId]`
- new `/pay/[transactionId]`
- new `/dispute/[transactionId]`

The current `transaction_code` can remain visible for support and manual lookup, but it should not grant access by itself. The current seller join flow should be replaced or supplemented by secure invite links.

The current wallet balance logic should be refactored behind server-side payment and ledger functions before production money movement.

## Suggested Database Additions

`transaction_invites`:

- id
- transaction_id
- role
- recipient_contact
- contact_type
- token_hash
- status
- expires_at
- viewed_at
- verified_at
- claimed_at
- claimed_by_user_id
- revoked_at
- attempt_count
- created_by
- created_at

`otp_challenges`:

- id
- transaction_invite_id
- email
- otp_hash
- purpose
- expires_at
- consumed_at
- attempt_count
- created_at

`payments`:

- id
- transaction_id
- buyer_id
- provider
- provider_reference
- amount
- currency
- status
- idempotency_key
- created_at
- updated_at

`payment_events`:

- id
- provider
- provider_event_id
- payment_id
- event_type
- payload
- received_at
- processed_at

`payout_accounts`:

- id
- user_id
- provider
- provider_recipient_id
- account_label
- verification_status
- created_at
- updated_at

`payouts`:

- id
- transaction_id
- seller_id
- payout_account_id
- provider_reference
- amount
- currency
- status
- failure_reason
- created_at
- updated_at

`transaction_events`:

- id
- transaction_id
- actor_user_id
- actor_role
- event_type
- metadata
- created_at

## Server Routes Or Edge Functions

- `create_transaction_draft`
- `finalize_transaction_terms`
- `create_transaction_invite`
- `exchange_invite_token`
- `send_invite_email_otp`
- `verify_invite_email_otp`
- `accept_transaction_invite`
- `reject_transaction_invite`
- `fund_simulated_escrow`
- `send_simulated_release_email`
- `create_payment_session` for production
- `handle_payment_webhook` for production
- `mark_delivery_started`
- `confirm_delivery`
- `upload_evidence_metadata`
- `release_escrow`
- `open_dispute`
- `resolve_dispute`
- `refund_transaction`
- `create_or_verify_payout_account`

These functions should validate the current transaction status, actor authorization, risk state, and idempotency before writing.

## Phased Development Plan

### Phase 1: MVP

- Add secure transaction invite links.
- Add seller web invite landing page.
- Add email OTP verification for the invited seller email.
- Let seller accept or reject from browser.
- Add browser transaction activity page for seller.
- Keep buyer tracking in the mobile app.
- Add server-side transaction state functions for invite and acceptance.
- Add audit logs for invite creation, viewing, verification, acceptance, and rejection.
- Use simulated wallet, locked balance, escrow ledger, release, refund, and email notifications instead of real money.
- Clearly label all balances and emails as simulated for the academic prototype.

### Phase 2: Security And Verification

- Harden OTP storage, expiry, attempt limits, and invite revocation.
- Add optional payment provider integration and webhook-based funding state if the project later moves beyond simulation.
- Add payout account setup and verification for sellers if real payouts are introduced.
- Add stricter RLS and remove direct client writes for money-sensitive actions.
- Add rate limiting and idempotency.
- Add hashed invite token storage.
- Add high-value transaction rules.
- Add private evidence storage and signed viewing links.
- Add admin dispute review tools.

### Phase 3: Mobile App Or PWA Expansion

- Polish PWA installation and responsive web UX.
- Add push/email/SMS notifications.
- Add app deep links from web transaction pages.
- Add QR or short-code handoff for in-person delivery.
- Add repeat-user dashboards, saved counterparties, and trust history.
- Encourage mobile app installation only after the user has completed or accepted a transaction.

### Phase 4: Advanced Fraud And Dispute Handling

- Add risk scoring.
- Add reputation and trust metrics.
- Add reserve or delayed release rules for risky transactions.
- Add chargeback monitoring and response workflow.
- Add structured dispute messaging.
- Add admin queues by severity and SLA.
- Add analytics for conversion, fraud, disputes, and release timing.

## Success Metrics

- Seller invite open rate.
- Seller verification completion rate.
- Seller acceptance rate.
- Buyer funding completion rate.
- Transactions completed without dispute.
- Time from invite sent to seller accepted.
- Time from funded to delivered.
- Dispute rate by transaction value/category.
- Fraud loss rate.
- Percentage of first-time sellers who create a reusable account after transaction completion.

## Decision Record

The approved direction is not to abandon the mobile app. The product should become link-first and web-accessible so first-time counterparties can participate immediately. The mobile app remains valuable for registered users, repeat usage, push notifications, identity/trust history, and richer account management.
