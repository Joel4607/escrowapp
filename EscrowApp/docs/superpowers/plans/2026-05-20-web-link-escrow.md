# Web-Link-First Escrow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let buyers generate secure invite links so sellers can accept, track, and complete escrow transactions from a web browser — no app install required.

**Architecture:** Supabase Edge Functions handle invite creation, OTP verification, and acceptance (server-authoritative). Two new DB tables (`transaction_invites`, `otp_challenges`) store invite tokens and OTP state. Expo web output (`expo start --web`) serves seller-facing pages at `/invite/[id]` using the same React components, styled with NativeWind/Tailwind. A `send-invite-email` Edge Function sends OTP codes via Supabase Auth's built-in email. The `release_escrow` RPC is extended to send a simulated-release email to the seller.

**Tech Stack:** Expo SDK 54 + expo-router v6 (web output), Supabase (Postgres, Edge Functions, Auth OTP), NativeWind/Tailwind, TypeScript, Zod

**Spec:** `docs/superpowers/specs/2026-05-20-web-link-escrow-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/010_invite_tables.sql` | `transaction_invites` + `otp_challenges` tables, RLS, indexes |
| `supabase/functions/create-invite/index.ts` | Edge Function: generate secure token, hash it, insert invite row, return link |
| `supabase/functions/verify-invite/index.ts` | Edge Function: exchange token → return invite details (pre-verification preview) |
| `supabase/functions/send-otp/index.ts` | Edge Function: generate OTP, hash+store in `otp_challenges`, send email via Supabase Auth/SMTP |
| `supabase/functions/verify-otp/index.ts` | Edge Function: verify OTP hash, mark invite as verified, create lightweight seller user |
| `supabase/functions/accept-invite/index.ts` | Edge Function: accept transaction (set seller_id, status→accepted), requires verified invite |
| `supabase/functions/reject-invite/index.ts` | Edge Function: reject transaction, mark invite claimed |
| `supabase/functions/send-release-email/index.ts` | Edge Function: send simulated release email to seller |
| `supabase/migrations/011_release_email_trigger.sql` | Trigger on `transactions` status→released to call send-release-email |
| `lib/database.types.ts` | Update: add `transaction_invites` + `otp_challenges` table types |
| `app/invite/[id].tsx` | Seller web invite page: preview → email entry → OTP → full details → accept/reject |
| `app/invite/_layout.tsx` | Minimal layout for invite routes (no auth required, no tab bar) |
| `app/invite/track.tsx` | Post-acceptance transaction tracker for seller (web) |

### Modified files

| File | Change |
|------|--------|
| `app/transaction/[id].tsx` | `InviteSellerPanel`: add "Generate Invite Link" button calling create-invite Edge Function |
| `app/transaction/create.tsx` | Add invite-mode toggle (web link vs code) to creation form |
| `app/_layout.tsx` | Register `invite` route group in Stack |
| `lib/format.ts` | Add `getInviteUrl()` helper |

---

## Task 1: Database — Invite and OTP Tables

**Files:**
- Create: `supabase/migrations/010_invite_tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================
-- Web-Link Escrow: Invite + OTP tables
-- Run this in the Supabase SQL Editor
-- ============================================

-- Invite status enum
CREATE TYPE invite_status AS ENUM (
  'pending',
  'viewed',
  'verified',
  'accepted',
  'rejected',
  'revoked',
  'expired'
);

-- OTP purpose enum
CREATE TYPE otp_purpose AS ENUM ('seller_verify');

-- Transaction Invites
CREATE TABLE transaction_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'seller',
  recipient_email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status invite_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  viewed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claimed_by_user_id UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invites_transaction ON transaction_invites(transaction_id);
CREATE INDEX idx_invites_token_hash ON transaction_invites(token_hash);
CREATE INDEX idx_invites_recipient ON transaction_invites(recipient_email);
CREATE INDEX idx_invites_status ON transaction_invites(status);

-- OTP Challenges
CREATE TABLE otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_invite_id UUID NOT NULL REFERENCES transaction_invites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  purpose otp_purpose NOT NULL DEFAULT 'seller_verify',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_invite ON otp_challenges(transaction_invite_id);

-- RLS
ALTER TABLE transaction_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;

-- Invites: buyer who created can read their invites
CREATE POLICY "Invite creators can read own invites"
  ON transaction_invites FOR SELECT
  USING (created_by = auth.uid());

-- Invites: buyer can insert invites for their transactions
CREATE POLICY "Buyers can create invites"
  ON transaction_invites FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Invites: admin can read all
CREATE POLICY "Admins can read all invites"
  ON transaction_invites FOR SELECT
  USING (is_admin());

-- OTP: no direct client access — Edge Functions use service_role_key
-- (no SELECT/INSERT policies for authenticated role)

-- Grant table access to authenticated role (for buyer invite reads)
GRANT SELECT, INSERT ON transaction_invites TO authenticated;
GRANT USAGE ON TYPE invite_status TO authenticated;
GRANT USAGE ON TYPE otp_purpose TO authenticated;

-- Service role needs full access (Edge Functions)
GRANT ALL ON transaction_invites TO service_role;
GRANT ALL ON otp_challenges TO service_role;

-- Enable realtime on invites so buyer sees status changes
ALTER PUBLICATION supabase_realtime ADD TABLE transaction_invites;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Open the Supabase dashboard → SQL Editor → paste the migration → run. Verify tables exist in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_invite_tables.sql
git commit -m "feat: add transaction_invites and otp_challenges tables for web-link escrow"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Add invite_status and otp_purpose types**

Add after the existing `FraudFlagStatus` type at the top of the file:

```typescript
export type InviteStatus =
  | "pending"
  | "viewed"
  | "verified"
  | "accepted"
  | "rejected"
  | "revoked"
  | "expired";

export type OtpPurpose = "seller_verify";
```

- [ ] **Step 2: Add transaction_invites table type**

Add inside `Tables` (after `push_tokens`):

```typescript
transaction_invites: {
  Row: {
    id: string;
    transaction_id: string;
    role: UserRole;
    recipient_email: string;
    token_hash: string;
    status: InviteStatus;
    expires_at: string;
    viewed_at: string | null;
    verified_at: string | null;
    claimed_at: string | null;
    claimed_by_user_id: string | null;
    revoked_at: string | null;
    attempt_count: number;
    created_by: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    transaction_id: string;
    role?: UserRole;
    recipient_email: string;
    token_hash: string;
    status?: InviteStatus;
    expires_at: string;
    created_by: string;
  };
  Update: {
    status?: InviteStatus;
    viewed_at?: string | null;
    verified_at?: string | null;
    claimed_at?: string | null;
    claimed_by_user_id?: string | null;
    revoked_at?: string | null;
    attempt_count?: number;
  };
  Relationships: [
    {
      foreignKeyName: "transaction_invites_transaction_id_fkey";
      columns: ["transaction_id"];
      isOneToOne: false;
      referencedRelation: "transactions";
      referencedColumns: ["id"];
    },
  ];
};
```

- [ ] **Step 3: Add otp_challenges table type**

Add inside `Tables` (after `transaction_invites`):

```typescript
otp_challenges: {
  Row: {
    id: string;
    transaction_invite_id: string;
    email: string;
    otp_hash: string;
    purpose: OtpPurpose;
    expires_at: string;
    consumed_at: string | null;
    attempt_count: number;
    created_at: string;
  };
  Insert: {
    id?: string;
    transaction_invite_id: string;
    email: string;
    otp_hash: string;
    purpose?: OtpPurpose;
    expires_at: string;
  };
  Update: {
    consumed_at?: string | null;
    attempt_count?: number;
  };
  Relationships: [
    {
      foreignKeyName: "otp_challenges_transaction_invite_id_fkey";
      columns: ["transaction_invite_id"];
      isOneToOne: false;
      referencedRelation: "transaction_invites";
      referencedColumns: ["id"];
    },
  ];
};
```

- [ ] **Step 4: Add new enums to the Enums section**

```typescript
invite_status: InviteStatus;
otp_purpose: OtpPurpose;
```

- [ ] **Step 5: Commit**

```bash
git add lib/database.types.ts
git commit -m "feat: add TypeScript types for transaction_invites and otp_challenges"
```

---

## Task 3: Edge Function — Create Invite

**Files:**
- Create: `supabase/functions/create-invite/index.ts`

This function is called by the buyer's mobile app. It generates a 256-bit random token, stores only its SHA-256 hash, creates the invite row, and returns the full invite URL with the plaintext token.

- [ ] **Step 1: Write the Edge Function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { transaction_id } = await req.json();
    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: "transaction_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify the caller is the buyer of this transaction
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("id, buyer_id, seller_contact, status")
      .eq("id", transaction_id)
      .single();

    if (txError || !tx) {
      return new Response(
        JSON.stringify({ error: "Transaction not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (tx.buyer_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Only the buyer can create an invite" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!["created", "seller_invited"].includes(tx.status)) {
      return new Response(
        JSON.stringify({ error: "Transaction is not in a state that accepts invites" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Revoke any existing pending invites for this transaction
    await supabase
      .from("transaction_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("transaction_id", transaction_id)
      .eq("status", "pending");

    // Generate secure token
    const token = generateToken();
    const tokenHash = await hashToken(token);

    // Invite expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Insert invite
    const { data: invite, error: insertError } = await supabase
      .from("transaction_invites")
      .insert({
        transaction_id,
        role: "seller",
        recipient_email: tx.seller_contact,
        token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update transaction status to seller_invited
    await supabase
      .from("transactions")
      .update({ status: "seller_invited" })
      .eq("id", transaction_id);

    // Build invite URL
    const appUrl = Deno.env.get("APP_URL") || `${supabaseUrl.replace(".supabase.co", ".vercel.app")}`;
    const inviteUrl = `${appUrl}/invite/${invite.id}?token=${token}`;

    return new Response(
      JSON.stringify({
        invite_id: invite.id,
        invite_url: inviteUrl,
        expires_at: expiresAt,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("create-invite error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy the Edge Function**

```bash
supabase functions deploy create-invite --no-verify-jwt
```

Note: `--no-verify-jwt` because we do manual auth inside the function. The function checks the Bearer token itself via `supabase.auth.getUser()`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-invite/index.ts
git commit -m "feat: add create-invite Edge Function for secure invite link generation"
```

---

## Task 4: Edge Function — Verify Invite Token (Exchange)

**Files:**
- Create: `supabase/functions/verify-invite/index.ts`

Called when the seller opens the invite link. Exchanges the plaintext token for invite details. Returns limited preview data before email verification.

- [ ] **Step 1: Write the Edge Function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { invite_id, token } = await req.json();
    if (!invite_id || !token) {
      return new Response(
        JSON.stringify({ error: "invite_id and token are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await hashToken(token);

    // Look up invite by id and verify token hash
    const { data: invite, error: inviteError } = await supabase
      .from("transaction_invites")
      .select("id, transaction_id, recipient_email, status, expires_at, token_hash, verified_at")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check token hash matches
    if (invite.token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ error: "Invalid invite link" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This invite has expired" }),
        { status: 410, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check status
    if (["revoked", "accepted", "rejected"].includes(invite.status)) {
      return new Response(
        JSON.stringify({ error: `This invite has been ${invite.status}` }),
        { status: 410, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark as viewed if first time
    if (invite.status === "pending") {
      await supabase
        .from("transaction_invites")
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", invite.id);
    }

    // Get transaction details
    const { data: tx } = await supabase
      .from("transactions")
      .select("id, item_name, price, delivery_deadline, inspection_period, status, transaction_code, buyer_id, item_description, item_condition")
      .eq("id", invite.transaction_id)
      .single();

    if (!tx) {
      return new Response(
        JSON.stringify({ error: "Transaction not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get buyer display name
    const { data: buyer } = await supabase
      .from("users")
      .select("name")
      .eq("id", tx.buyer_id)
      .single();

    const isVerified = invite.verified_at !== null;

    // Pre-verification: limited preview only
    // Post-verification: full details
    const response: Record<string, unknown> = {
      invite_id: invite.id,
      invite_status: invite.status === "pending" ? "viewed" : invite.status,
      is_verified: isVerified,
      transaction_id: tx.id,
      transaction_code: tx.transaction_code,
      item_name: tx.item_name,
      price: tx.price,
      buyer_name: buyer?.name || "Buyer",
      expires_at: invite.expires_at,
    };

    // Full details only after OTP verification
    if (isVerified) {
      response.item_description = tx.item_description;
      response.item_condition = tx.item_condition;
      response.delivery_deadline = tx.delivery_deadline;
      response.inspection_period = tx.inspection_period;
      response.transaction_status = tx.status;
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("verify-invite error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy verify-invite --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/verify-invite/index.ts
git commit -m "feat: add verify-invite Edge Function for token exchange and preview"
```

---

## Task 5: Edge Function — Send OTP

**Files:**
- Create: `supabase/functions/send-otp/index.ts`

Generates a 6-digit OTP, stores its SHA-256 hash in `otp_challenges`, and sends it to the seller's email using the Resend API (Supabase's built-in SMTP).

- [ ] **Step 1: Write the Edge Function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateOtp(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(num % 1000000).padStart(6, "0");
}

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { invite_id, email, token } = await req.json();
    if (!invite_id || !email || !token) {
      return new Response(
        JSON.stringify({ error: "invite_id, email, and token are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Re-verify invite token to prevent abuse
    async function hashToken(t: string): Promise<string> {
      const encoder = new TextEncoder();
      const data = encoder.encode(t);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer), (b) =>
        b.toString(16).padStart(2, "0")
      ).join("");
    }

    const tokenHash = await hashToken(token);

    const { data: invite, error: inviteError } = await supabase
      .from("transaction_invites")
      .select("id, recipient_email, token_hash, status, expires_at, attempt_count")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (invite.token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ error: "Invalid invite" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Invite has expired" }),
        { status: 410, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check email matches the invited seller
    if (email.toLowerCase().trim() !== invite.recipient_email.toLowerCase().trim()) {
      return new Response(
        JSON.stringify({ error: "This email does not match the invited seller" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limit: max 5 OTP attempts per invite
    if (invite.attempt_count >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please ask the buyer to generate a new invite." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Increment attempt count
    await supabase
      .from("transaction_invites")
      .update({ attempt_count: invite.attempt_count + 1 })
      .eq("id", invite.id);

    // Generate OTP
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store OTP challenge
    const { error: otpError } = await supabase
      .from("otp_challenges")
      .insert({
        transaction_invite_id: invite.id,
        email: email.toLowerCase().trim(),
        otp_hash: otpHash,
        purpose: "seller_verify",
        expires_at: expiresAt,
      });

    if (otpError) {
      return new Response(
        JSON.stringify({ error: "Failed to create OTP challenge" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Send OTP via email using Supabase Auth admin (generates a magic link style email)
    // For the academic prototype, we use a simple fetch to a mail service
    // or log the OTP to the function logs for testing.

    // Attempt to send via Resend if RESEND_API_KEY is set, otherwise log for testing
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (resendKey) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "EscrowApp <noreply@resend.dev>",
          to: [email],
          subject: "Your EscrowApp Verification Code",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1a7f37;">EscrowApp Verification</h2>
              <p>Your verification code is:</p>
              <div style="background: #f0f0f0; padding: 16px; border-radius: 8px; text-align: center; margin: 16px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${otp}</span>
              </div>
              <p>This code expires in 10 minutes.</p>
              <p style="color: #666; font-size: 12px;">If you did not request this code, please ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <p style="color: #999; font-size: 11px;">This is an academic prototype. No real money is involved.</p>
            </div>
          `,
        }),
      });

      if (!emailResponse.ok) {
        console.error("Resend error:", await emailResponse.text());
      }
    } else {
      // Fallback: log OTP for testing (check Supabase function logs)
      console.log(`[OTP] Email: ${email}, Code: ${otp}`);
    }

    return new Response(
      JSON.stringify({
        message: "Verification code sent",
        expires_at: expiresAt,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-otp error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy send-otp --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-otp/index.ts
git commit -m "feat: add send-otp Edge Function for seller email verification"
```

---

## Task 6: Edge Function — Verify OTP

**Files:**
- Create: `supabase/functions/verify-otp/index.ts`

Verifies the OTP, marks the invite as verified, and creates a lightweight Supabase auth user for the seller if they don't have an account.

- [ ] **Step 1: Write the Edge Function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { invite_id, token, otp } = await req.json();
    if (!invite_id || !token || !otp) {
      return new Response(
        JSON.stringify({ error: "invite_id, token, and otp are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify invite token
    const tokenHash = await hashToken(token);

    const { data: invite, error: inviteError } = await supabase
      .from("transaction_invites")
      .select("id, recipient_email, token_hash, status, expires_at, transaction_id")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (invite.token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ error: "Invalid invite" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find the latest unexpired, unconsumed OTP for this invite
    const { data: otpChallenge, error: otpError } = await supabase
      .from("otp_challenges")
      .select("id, otp_hash, expires_at, consumed_at, attempt_count")
      .eq("transaction_invite_id", invite.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpChallenge) {
      return new Response(
        JSON.stringify({ error: "No pending verification. Please request a new code." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (new Date(otpChallenge.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Verification code has expired. Please request a new one." }),
        { status: 410, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limit: max 5 verify attempts per OTP
    if (otpChallenge.attempt_count >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please request a new code." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Increment attempt count
    await supabase
      .from("otp_challenges")
      .update({ attempt_count: otpChallenge.attempt_count + 1 })
      .eq("id", otpChallenge.id);

    // Verify OTP hash
    const otpHash = await hashOtp(otp.trim());
    if (otpHash !== otpChallenge.otp_hash) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // OTP is correct — consume it
    await supabase
      .from("otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otpChallenge.id);

    // Mark invite as verified
    await supabase
      .from("transaction_invites")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", invite.id);

    // Create a lightweight session for the seller
    // Check if user already exists with this email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === invite.recipient_email.toLowerCase()
    );

    let sessionData = null;

    if (existingUser) {
      // Generate a magic link / session for existing user
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: invite.recipient_email,
      });
      if (linkData?.properties?.hashed_token) {
        const { data: verifyData } = await supabase.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: "magiclink",
        });
        sessionData = verifyData?.session;
      }
    } else {
      // Create new user with auto-generated password (seller can set one later)
      const tempPassword = crypto.randomUUID();
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: invite.recipient_email,
        password: tempPassword,
        email_confirm: true,
      });

      if (newUser?.user) {
        // Create user profile
        await supabase.from("users").insert({
          id: newUser.user.id,
          email: invite.recipient_email,
          phone: "",
          role: "seller",
          name: invite.recipient_email.split("@")[0],
        });

        // Sign them in
        const { data: signInData } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: invite.recipient_email,
        });
        if (signInData?.properties?.hashed_token) {
          const { data: verifyData } = await supabase.auth.verifyOtp({
            token_hash: signInData.properties.hashed_token,
            type: "magiclink",
          });
          sessionData = verifyData?.session;
        }
      }
    }

    // Return full transaction details now that seller is verified
    const { data: tx } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", invite.transaction_id)
      .single();

    const { data: buyer } = await supabase
      .from("users")
      .select("name")
      .eq("id", tx?.buyer_id)
      .single();

    return new Response(
      JSON.stringify({
        verified: true,
        session: sessionData ? {
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
        } : null,
        transaction: tx ? {
          id: tx.id,
          transaction_code: tx.transaction_code,
          item_name: tx.item_name,
          item_description: tx.item_description,
          item_condition: tx.item_condition,
          price: tx.price,
          delivery_deadline: tx.delivery_deadline,
          inspection_period: tx.inspection_period,
          status: tx.status,
          buyer_name: buyer?.name || "Buyer",
        } : null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("verify-otp error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy verify-otp --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/verify-otp/index.ts
git commit -m "feat: add verify-otp Edge Function for seller email verification and session creation"
```

---

## Task 7: Edge Functions — Accept and Reject Invite

**Files:**
- Create: `supabase/functions/accept-invite/index.ts`
- Create: `supabase/functions/reject-invite/index.ts`

These require a verified invite. Accept sets the seller_id on the transaction, advances status to `accepted`, and marks the invite as claimed.

- [ ] **Step 1: Write accept-invite Edge Function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { invite_id, token } = await req.json();
    if (!invite_id || !token) {
      return new Response(
        JSON.stringify({ error: "invite_id and token are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await hashToken(token);

    // Get invite
    const { data: invite, error: inviteError } = await supabase
      .from("transaction_invites")
      .select("id, transaction_id, token_hash, status, verified_at, recipient_email, claimed_by_user_id")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (invite.token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ error: "Invalid invite" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Must be verified first
    if (invite.status !== "verified") {
      return new Response(
        JSON.stringify({ error: "Email verification required before accepting" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find the seller user by email
    const { data: sellerUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", invite.recipient_email.toLowerCase().trim())
      .single();

    if (!sellerUser) {
      return new Response(
        JSON.stringify({ error: "Seller account not found. Please verify your email first." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update transaction: set seller_id, advance to accepted
    const { error: txError } = await supabase
      .from("transactions")
      .update({
        seller_id: sellerUser.id,
        status: "accepted",
        terms_accepted_by_seller: true,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.transaction_id);

    if (txError) {
      return new Response(
        JSON.stringify({ error: txError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark invite as accepted/claimed
    await supabase
      .from("transaction_invites")
      .update({
        status: "accepted",
        claimed_at: new Date().toISOString(),
        claimed_by_user_id: sellerUser.id,
      })
      .eq("id", invite.id);

    // Insert audit log
    await supabase.from("audit_logs").insert({
      transaction_id: invite.transaction_id,
      user_id: sellerUser.id,
      user_role: "seller",
      action: "invite_accepted",
      description: "Seller accepted transaction via web invite link",
    });

    return new Response(
      JSON.stringify({ accepted: true, transaction_id: invite.transaction_id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("accept-invite error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Write reject-invite Edge Function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { invite_id, token } = await req.json();
    if (!invite_id || !token) {
      return new Response(
        JSON.stringify({ error: "invite_id and token are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await hashToken(token);

    const { data: invite, error: inviteError } = await supabase
      .from("transaction_invites")
      .select("id, transaction_id, token_hash, status, recipient_email")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (invite.token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ error: "Invalid invite" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (invite.status !== "verified") {
      return new Response(
        JSON.stringify({ error: "Email verification required before rejecting" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update transaction status
    await supabase
      .from("transactions")
      .update({ status: "rejected" })
      .eq("id", invite.transaction_id);

    // Mark invite as rejected
    await supabase
      .from("transaction_invites")
      .update({ status: "rejected", claimed_at: new Date().toISOString() })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({ rejected: true, transaction_id: invite.transaction_id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("reject-invite error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 3: Deploy both**

```bash
supabase functions deploy accept-invite --no-verify-jwt
supabase functions deploy reject-invite --no-verify-jwt
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/accept-invite/index.ts supabase/functions/reject-invite/index.ts
git commit -m "feat: add accept-invite and reject-invite Edge Functions"
```

---

## Task 8: Edge Function — Send Simulated Release Email

**Files:**
- Create: `supabase/functions/send-release-email/index.ts`
- Create: `supabase/migrations/011_release_email_trigger.sql`

When transaction status changes to `released`, send a simulated-release email to the seller.

- [ ] **Step 1: Write the Edge Function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { transaction_id, seller_id, item_name, price, transaction_code } = await req.json();

    if (!transaction_id || !seller_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get seller email
    const { data: seller } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", seller_id)
      .single();

    if (!seller?.email) {
      return new Response(
        JSON.stringify({ message: "No seller email found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const formattedPrice = `₵${Number(price).toFixed(2)}`;
    const sellerName = seller.name || "Seller";

    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "EscrowApp <noreply@resend.dev>",
          to: [seller.email],
          subject: `Simulated Funds Released — ${transaction_code || transaction_id}`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1a7f37;">Escrow Funds Released</h2>
              <p>Hi ${sellerName},</p>
              <p>Your escrow transaction <strong>${transaction_code || "N/A"}</strong> has been completed.</p>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #1a7f37;">
                  Simulated ${formattedPrice} released to your balance
                </p>
              </div>
              <p>Item: <strong>${item_name}</strong></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 12px; border-radius: 8px;">
                <p style="margin: 0; color: #92400e; font-size: 13px;">
                  <strong>Academic Prototype Notice:</strong> This is a project demonstration. 
                  No real money was collected, held, transferred, or paid out. 
                  All wallet balances and escrow operations are simulated.
                </p>
              </div>
            </div>
          `,
        }),
      });
    } else {
      console.log(`[RELEASE EMAIL] To: ${seller.email}, Amount: ${formattedPrice}, TX: ${transaction_code}`);
    }

    return new Response(
      JSON.stringify({ message: "Release email sent" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-release-email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Write the DB trigger migration**

```sql
-- ============================================
-- Trigger: send simulated release email on status→released
-- ============================================

CREATE OR REPLACE FUNCTION notify_release_email()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'released' AND NEW.seller_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://ktyvdgwdnhgilstuvdtl.supabase.co/functions/v1/send-release-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'transaction_id', NEW.id,
        'seller_id', NEW.seller_id,
        'item_name', NEW.item_name,
        'price', NEW.price,
        'transaction_code', NEW.transaction_code
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_transaction_released
  AFTER UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_release_email();
```

- [ ] **Step 3: Run the migration in Supabase SQL Editor**

- [ ] **Step 4: Deploy the Edge Function**

```bash
supabase functions deploy send-release-email --no-verify-jwt
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-release-email/index.ts supabase/migrations/011_release_email_trigger.sql
git commit -m "feat: add simulated release email on escrow completion"
```

---

## Task 9: Add Invite URL Helper + Update Format Lib

**Files:**
- Modify: `lib/format.ts`

- [ ] **Step 1: Add getInviteUrl helper**

Add at the bottom of `lib/format.ts`:

```typescript
export function getSupabaseUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL!;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/format.ts
git commit -m "feat: add Supabase URL helper to format lib"
```

---

## Task 10: Mobile App — Generate Invite Link (Buyer Side)

**Files:**
- Modify: `app/transaction/[id].tsx`

Replace the existing `InviteSellerPanel` to add a "Generate Invite Link" button that calls the `create-invite` Edge Function, then lets the buyer share the link.

- [ ] **Step 1: Replace InviteSellerPanel**

Replace the existing `InviteSellerPanel` function in `app/transaction/[id].tsx` with:

```typescript
function InviteSellerPanel({
  transaction,
  onRefetch,
}: {
  transaction: Transaction;
  onRefetch: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert("Error", "Not authenticated");
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ transaction_id: transaction.id }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        Alert.alert("Error", data.error || "Failed to create invite");
        return;
      }

      setInviteUrl(data.invite_url);
      onRefetch();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleShareLink = () => {
    if (inviteUrl) {
      Share.share({
        message: `You've been invited to an escrow transaction on EscrowApp. Review and accept here: ${inviteUrl}`,
      });
    }
  };

  const handleShareCode = () => {
    Share.share({ message: transaction.transaction_code });
  };

  return (
    <View className="gap-3">
      {inviteUrl ? (
        <>
          <View className="bg-primary/10 rounded-xl p-4">
            <Text className="text-primary text-sm font-semibold mb-1">
              Invite Link Ready
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={2}>
              {inviteUrl}
            </Text>
          </View>
          <Button onPress={handleShareLink}>
            <Text className="text-primary-foreground font-semibold">
              Share Invite Link
            </Text>
          </Button>
        </>
      ) : (
        <>
          <Text className="text-muted-foreground text-sm text-center">
            Generate a secure link so the seller can accept from their browser — no app needed.
          </Text>
          <Button onPress={handleGenerateLink} disabled={loading}>
            <Text className="text-primary-foreground font-semibold">
              {loading ? "Generating..." : "Generate Invite Link"}
            </Text>
          </Button>
        </>
      )}

      {/* Fallback: share transaction code for mobile-to-mobile */}
      <View className="bg-secondary rounded-xl p-4 mt-1">
        <Text className="text-muted-foreground text-sm mb-1">
          Transaction Code (for app users)
        </Text>
        <Text className="text-foreground text-xl font-bold tracking-widest">
          {transaction.transaction_code}
        </Text>
      </View>
      <Button variant="outline" onPress={handleShareCode}>
        <Text className="text-foreground font-medium">Share Code</Text>
      </Button>
    </View>
  );
}
```

- [ ] **Step 2: Also update AwaitingSellerPanel to show invite URL if available**

Replace the existing `AwaitingSellerPanel` with:

```typescript
function AwaitingSellerPanel({ transaction }: { transaction: Transaction }) {
  const handleShareCode = () => {
    Share.share({ message: transaction.transaction_code });
  };

  return (
    <View className="gap-3">
      <View className="bg-secondary rounded-xl p-4">
        <Text className="text-muted-foreground text-sm mb-1">
          Transaction Code
        </Text>
        <Text className="text-foreground text-xl font-bold tracking-widest">
          {transaction.transaction_code}
        </Text>
      </View>
      <Text className="text-muted-foreground text-sm text-center">
        Waiting for the seller to accept the transaction via the invite link or app.
      </Text>
      <Button variant="outline" onPress={handleShareCode}>
        <Text className="text-foreground font-medium">Share Code</Text>
      </Button>
    </View>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/transaction/[id].tsx
git commit -m "feat: add invite link generation to buyer's transaction detail"
```

---

## Task 11: Seller Web Invite Page — Layout + Route

**Files:**
- Create: `app/invite/_layout.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Create invite layout**

The invite layout is minimal — no tab bar, no auth requirement. The seller sees this in a browser.

```typescript
import { Stack } from "expo-router";

export default function InviteLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: "EscrowApp",
        headerBackVisible: false,
        headerStyle: { backgroundColor: "#ffffff" },
        headerTitleStyle: { fontWeight: "bold" },
      }}
    />
  );
}
```

- [ ] **Step 2: Register invite route group in root layout**

In `app/_layout.tsx`, add the invite Screen inside AppContent's Stack:

```typescript
<Stack.Screen name="invite" />
```

Add it after the existing `<Stack.Screen name="transaction" />` line.

- [ ] **Step 3: Commit**

```bash
git add app/invite/_layout.tsx app/_layout.tsx
git commit -m "feat: add invite route layout for seller web pages"
```

---

## Task 12: Seller Web Invite Page — Main Screen

**Files:**
- Create: `app/invite/[id].tsx`

This is the core seller-facing page. It handles the full flow:
1. Exchange token → show preview
2. Email entry + send OTP
3. OTP verification
4. Full transaction details + accept/reject

- [ ] **Step 1: Write the invite page**

```typescript
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

type InviteState = "loading" | "preview" | "email_entry" | "otp_sent" | "verified" | "accepted" | "rejected" | "error";

type PreviewData = {
  invite_id: string;
  invite_status: string;
  is_verified: boolean;
  transaction_id: string;
  transaction_code: string;
  item_name: string;
  price: number;
  buyer_name: string;
  expires_at: string;
  item_description?: string | null;
  item_condition?: string | null;
  delivery_deadline?: string;
  inspection_period?: number;
  transaction_status?: string;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-1">
      <Text className="text-muted-foreground text-sm flex-1">{label}</Text>
      <Text className="text-foreground text-sm font-medium text-right flex-1">
        {value}
      </Text>
    </View>
  );
}

export default function InviteScreen() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();

  const [state, setState] = useState<InviteState>("loading");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1: Exchange token for preview
  useEffect(() => {
    if (!id || !token) {
      setError("Invalid invite link");
      setState("error");
      return;
    }

    async function exchangeToken() {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invite_id: id, token }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Invalid or expired invite");
          setState("error");
          return;
        }

        setPreview(data);
        setState(data.is_verified ? "verified" : "preview");
      } catch {
        setError("Failed to load invite. Please try again.");
        setState("error");
      }
    }

    exchangeToken();
  }, [id, token]);

  // Step 2: Send OTP
  const handleSendOtp = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, email: email.trim(), token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send verification code");
        return;
      }

      setState("otp_sent");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify OTP
  const handleVerifyOtp = async () => {
    if (!otp.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, token, otp: otp.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid code");
        return;
      }

      if (data.transaction) {
        setPreview((prev) => prev ? {
          ...prev,
          is_verified: true,
          item_description: data.transaction.item_description,
          item_condition: data.transaction.item_condition,
          delivery_deadline: data.transaction.delivery_deadline,
          inspection_period: data.transaction.inspection_period,
          transaction_status: data.transaction.status,
        } : prev);
      }

      setState("verified");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Accept
  const handleAccept = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to accept");
        return;
      }

      setState("accepted");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Reject
  const handleReject = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/reject-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to reject");
        return;
      }

      setState("rejected");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (state === "loading") {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">Loading invite...</Text>
      </SafeAreaView>
    );
  }

  if (state === "error") {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center px-6">
        <Text className="text-destructive text-lg font-semibold mb-2">
          Unable to load invite
        </Text>
        <Text className="text-muted-foreground text-center">{error}</Text>
      </SafeAreaView>
    );
  }

  if (state === "accepted") {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center px-6">
        <View className="bg-primary/10 rounded-2xl p-8 items-center gap-3 w-full max-w-md">
          <Text className="text-primary text-2xl font-bold">Accepted!</Text>
          <Text className="text-foreground text-center">
            You have accepted this escrow transaction. The buyer will be notified
            and can now lock funds in escrow.
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            You can track this transaction from the EscrowApp mobile app for a richer experience.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === "rejected") {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center px-6">
        <View className="bg-destructive/10 rounded-2xl p-8 items-center gap-3 w-full max-w-md">
          <Text className="text-destructive text-2xl font-bold">Rejected</Text>
          <Text className="text-foreground text-center">
            You have rejected this transaction. The buyer will be notified.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="bg-background flex-1" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-10 gap-6 items-center"
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-lg gap-6">
          {/* Header */}
          <View className="items-center gap-2">
            <Text className="text-foreground text-xl font-bold">
              Escrow Transaction Invite
            </Text>
            <Text className="text-muted-foreground text-sm text-center">
              {preview?.buyer_name} has invited you to review a transaction
            </Text>
          </View>

          {/* Preview card (always shown) */}
          {preview && (
            <Card className="p-4 gap-3">
              <DetailRow label="Item" value={preview.item_name} />
              <DetailRow label="Price" value={formatCurrency(preview.price)} />
              <DetailRow label="From" value={preview.buyer_name} />
              <DetailRow label="Code" value={preview.transaction_code} />

              {/* Full details after verification */}
              {preview.is_verified && (
                <>
                  {preview.item_description && (
                    <View>
                      <Text className="text-muted-foreground text-sm">Description</Text>
                      <Text className="text-foreground text-sm mt-1">
                        {preview.item_description}
                      </Text>
                    </View>
                  )}
                  {preview.item_condition && (
                    <DetailRow
                      label="Condition"
                      value={preview.item_condition.charAt(0).toUpperCase() + preview.item_condition.slice(1)}
                    />
                  )}
                  {preview.delivery_deadline && (
                    <DetailRow
                      label="Delivery by"
                      value={new Date(preview.delivery_deadline).toLocaleDateString()}
                    />
                  )}
                  {preview.inspection_period && (
                    <DetailRow
                      label="Inspection period"
                      value={`${preview.inspection_period / 24} day(s)`}
                    />
                  )}
                </>
              )}
            </Card>
          )}

          {/* Email entry (pre-verification) */}
          {state === "preview" && (
            <Card className="p-4 gap-4">
              <Text className="text-foreground font-semibold">
                Verify your email to continue
              </Text>
              <Text className="text-muted-foreground text-sm">
                Enter the email address the buyer used to invite you. We'll send a verification code.
              </Text>
              <Input
                className="h-14 rounded-xl"
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              {error && (
                <Text className="text-destructive text-sm">{error}</Text>
              )}
              <Button onPress={handleSendOtp} disabled={loading || !email.trim()}>
                <Text className="text-primary-foreground font-semibold">
                  {loading ? "Sending..." : "Send Verification Code"}
                </Text>
              </Button>
            </Card>
          )}

          {/* OTP entry */}
          {state === "otp_sent" && (
            <Card className="p-4 gap-4">
              <Text className="text-foreground font-semibold">
                Enter verification code
              </Text>
              <Text className="text-muted-foreground text-sm">
                We sent a 6-digit code to {email}. It expires in 10 minutes.
              </Text>
              <Input
                className="h-14 rounded-xl text-center text-2xl tracking-widest"
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
              />
              {error && (
                <Text className="text-destructive text-sm">{error}</Text>
              )}
              <Button onPress={handleVerifyOtp} disabled={loading || otp.length < 6}>
                <Text className="text-primary-foreground font-semibold">
                  {loading ? "Verifying..." : "Verify"}
                </Text>
              </Button>
              <Button variant="outline" onPress={() => { setOtp(""); setState("preview"); setError(null); }}>
                <Text className="text-foreground font-medium">Resend Code</Text>
              </Button>
            </Card>
          )}

          {/* Accept / Reject (post-verification) */}
          {state === "verified" && (
            <Card className="p-4 gap-4">
              <View className="bg-primary/10 rounded-xl p-3 items-center">
                <Text className="text-primary font-semibold">Email Verified</Text>
              </View>
              <Text className="text-foreground font-semibold text-center">
                Accept this transaction?
              </Text>
              <Text className="text-muted-foreground text-sm text-center">
                By accepting, you agree to deliver the item as described and within the deadline.
              </Text>
              {error && (
                <Text className="text-destructive text-sm text-center">{error}</Text>
              )}
              <Button onPress={handleAccept} disabled={loading}>
                <Text className="text-primary-foreground font-semibold">
                  {loading ? "Processing..." : "Accept Transaction"}
                </Text>
              </Button>
              <Button variant="outline" onPress={handleReject} disabled={loading}>
                <Text className="text-destructive font-semibold">Reject</Text>
              </Button>
            </Card>
          )}

          {/* Prototype disclaimer */}
          <View className="bg-secondary/50 rounded-xl p-3">
            <Text className="text-muted-foreground text-xs text-center">
              This is an academic prototype. All wallet balances and escrow operations are simulated. No real money is collected, held, or transferred.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/invite/[id].tsx
git commit -m "feat: add seller web invite page with OTP verification flow"
```

---

## Task 13: End-to-End Testing

- [ ] **Step 1: Start the web dev server**

```bash
cd EscrowApp
npx expo start --web
```

- [ ] **Step 2: Test buyer flow (mobile or web)**

1. Log in as buyer
2. Create a transaction with a seller email
3. Open the transaction detail
4. Tap "Generate Invite Link"
5. Verify the invite URL is returned and can be shared
6. Check `transaction_invites` table in Supabase — row should exist with `status: pending`

- [ ] **Step 3: Test seller flow (browser)**

1. Open the invite URL in a browser
2. Verify preview shows: item name, price, buyer name, transaction code
3. Enter the seller email → verify it matches
4. Check Supabase Edge Function logs for OTP (or email if Resend is configured)
5. Enter the OTP
6. Verify full transaction details appear
7. Accept the transaction
8. Verify transaction status changed to `accepted` in Supabase
9. Verify transaction_invites status changed to `accepted`

- [ ] **Step 4: Test rejection flow**

1. Create a new transaction + invite
2. Open invite in browser → verify email → reject
3. Verify transaction status = `rejected`

- [ ] **Step 5: Test security guardrails**

1. Try opening an invite with wrong token → should get "Invalid invite link"
2. Try entering wrong email → should get "does not match"
3. Try entering wrong OTP 5 times → should get rate limited
4. Try accepting without verifying email → should get "verification required"

- [ ] **Step 6: Test release email**

1. Complete a full transaction (accept → fund → deliver → release)
2. Check Supabase Edge Function logs for the release email call
3. If Resend is configured, verify the seller received the simulated release email

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "test: end-to-end verification of web-link escrow flow"
```

---

## Summary of New Edge Functions

| Function | Auth | Purpose |
|----------|------|---------|
| `create-invite` | Bearer token (buyer) | Generate invite link with hashed token |
| `verify-invite` | None (public, token-gated) | Exchange token for preview data |
| `send-otp` | None (public, token-gated) | Send 6-digit OTP to seller email |
| `verify-otp` | None (public, token-gated) | Verify OTP, create seller session |
| `accept-invite` | None (public, token-gated) | Accept transaction from web |
| `reject-invite` | None (public, token-gated) | Reject transaction from web |
| `send-release-email` | Service role (trigger) | Send simulated release email |

## Security Checklist

- [x] Invite tokens: 256-bit random, only SHA-256 hash stored
- [x] OTP: 6-digit, SHA-256 hash stored, 10-minute expiry, 5-attempt limit
- [x] Email match: seller email must match buyer-specified `seller_contact`
- [x] Token single-use: invite claimed on accept/reject, old invites revoked on regeneration
- [x] Server-authoritative: all state transitions via Edge Functions, not client-side updates
- [x] Audit logging: acceptance logged in audit_logs table
- [x] Simulated money: release email clearly labels "no real money transferred"
- [x] Invite expiry: 7 days default
