import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "public" },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function generateDeliveryToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function getActiveDeliveryToken(supabase: ReturnType<typeof getSupabase>, transactionId: string) {
  const { data, error } = await supabase
    .from("delivery_tokens")
    .select("token_hash, expires_at")
    .eq("transaction_id", transactionId)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? { delivery_token: data.token_hash, delivery_token_expires_at: data.expires_at }
    : { delivery_token: null, delivery_token_expires_at: null };
}

async function createOrReuseDeliveryToken(
  supabase: ReturnType<typeof getSupabase>,
  tx: Record<string, any>
) {
  const existingToken = await getActiveDeliveryToken(supabase, tx.id);
  if (existingToken.delivery_token) {
    return existingToken;
  }

  if (!tx.seller_id) {
    throw new Error("No seller assigned to this transaction");
  }

  const token = generateDeliveryToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("delivery_tokens")
    .insert({
      transaction_id: tx.id,
      seller_id: tx.seller_id,
      buyer_id: tx.buyer_id,
      token_hash: token,
      expires_at: expiresAt,
    });

  if (error) {
    throw error;
  }

  return { delivery_token: token, delivery_token_expires_at: expiresAt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const supabase = getSupabase();
    const body = await req.json();
    const { invite_id, token, action, reason, description, image_base64, evidence_type, notes: evidenceNotes, evidence_id } = body;

    if (!invite_id || !token || !action) {
      return new Response(
        JSON.stringify({ error: "invite_id, token, and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await hashToken(token);

    // Verify invite is accepted
    const { data: invite, error: inviteError } = await supabase
      .from("transaction_invites")
      .select("id, transaction_id, token_hash, status, recipient_email")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ error: "Invalid invite" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["accepted", "verified"].includes(invite.status)) {
      return new Response(
        JSON.stringify({ error: "Invite must be accepted to perform actions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get transaction
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", invite.transaction_id)
      .single();

    if (txError || !tx) {
      return new Response(
        JSON.stringify({ error: "Transaction not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle actions
    if (action === "get_status") {
      const { data: buyer } = await supabase
        .from("users")
        .select("name")
        .eq("id", tx.buyer_id)
        .single();

      const activeDeliveryToken = await getActiveDeliveryToken(supabase, tx.id);

      // Get active dispute if any
      const { data: activeDispute } = await supabase
        .from("disputes")
        .select("id, reason, description, status, created_at, admin_decision, resolution_type, resolved_at")
        .eq("transaction_id", tx.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          transaction: {
            id: tx.id,
            transaction_code: tx.transaction_code,
            item_name: tx.item_name,
            item_description: tx.item_description,
            item_condition: tx.item_condition,
            price: tx.price,
            status: tx.status,
            delivery_deadline: tx.delivery_deadline,
            inspection_period: tx.inspection_period,
            funded_at: tx.funded_at,
            accepted_at: tx.accepted_at,
            delivered_at: tx.delivered_at,
            released_at: tx.released_at,
            disputed_at: tx.disputed_at,
            buyer_name: buyer?.name || "Buyer",
            delivery_token: activeDeliveryToken.delivery_token,
            delivery_token_expires_at: activeDeliveryToken.delivery_token_expires_at,
            dispute: activeDispute || null,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "mark_shipped") {
      if (!["funded", "in_delivery"].includes(tx.status)) {
        return new Response(
          JSON.stringify({ error: `Cannot mark as shipped. Current status: ${tx.status}. Buyer must fund first.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const deliveryToken = await createOrReuseDeliveryToken(supabase, tx);

      if (tx.status === "funded") {
        const { error: txUpdateError } = await supabase
          .from("transactions")
          .update({ status: "in_delivery" })
          .eq("id", tx.id);

        if (txUpdateError) {
          throw txUpdateError;
        }
      }

      await supabase.from("audit_logs").insert({
        transaction_id: tx.id,
        user_id: tx.seller_id,
        user_role: "seller",
        action: "marked_shipped",
        description: "Seller marked item as shipped via web",
      });

      return new Response(
        JSON.stringify({
          success: true,
          new_status: "in_delivery",
          delivery_token: deliveryToken.delivery_token,
          delivery_token_expires_at: deliveryToken.delivery_token_expires_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "mark_delivered") {
      return new Response(
        JSON.stringify({
          error: "The buyer must confirm delivery by entering the delivery token.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "raise_dispute") {
      // Validate reason
      const SELLER_REASONS = [
        "Buyer refusing to release payment",
        "Other",
      ];

      if (!reason || typeof reason !== "string" || reason.trim() === "") {
        return new Response(
          JSON.stringify({ error: "Reason is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!SELLER_REASONS.includes(reason)) {
        return new Response(
          JSON.stringify({
            error: "Invalid reason. Choose from: " + SELLER_REASONS.join(", "),
            valid_reasons: SELLER_REASONS,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only allow disputes during delivery or inspection
      if (!["delivered", "under_inspection"].includes(tx.status)) {
        return new Response(
          JSON.stringify({
            error: `Cannot raise dispute. Current status: ${tx.status}. Disputes can only be raised during delivery or inspection.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!tx.seller_id) {
        return new Response(
          JSON.stringify({ error: "No seller assigned to this transaction" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert dispute record
      const { error: disputeError } = await supabase
        .from("disputes")
        .insert({
          transaction_id: tx.id,
          opened_by: tx.seller_id,
          reason: reason.trim(),
          description: description ? description.trim() || null : null,
          status: "open",
        });

      if (disputeError) {
        throw disputeError;
      }

      // Update transaction status to disputed
      const { error: txUpdateError } = await supabase
        .from("transactions")
        .update({ status: "disputed", disputed_at: new Date().toISOString() })
        .eq("id", tx.id);

      if (txUpdateError) {
        throw txUpdateError;
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        transaction_id: tx.id,
        user_id: tx.seller_id,
        user_role: "seller",
        action: "raised_dispute",
        description: `Seller raised dispute via web: ${reason}`,
      });

      return new Response(
        JSON.stringify({
          success: true,
          new_status: "disputed",
          message: "Dispute raised successfully. An admin will review it shortly.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_dispute_reasons") {
      return new Response(
        JSON.stringify({
          reasons: [
            "Buyer refusing to release payment",
            "Other",
          ],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Evidence actions ──

    if (action === "get_evidence") {
      const { data: rows, error: evidenceError } = await supabase
        .from("evidence")
        .select("id, evidence_type, user_role, image_url, notes, created_at, uploaded_by")
        .eq("transaction_id", tx.id)
        .order("created_at", { ascending: true });

      if (evidenceError) throw evidenceError;

      // Generate signed URLs for each evidence item
      const items = await Promise.all(
        (rows ?? []).map(async (row) => {
          const { data: urlData } = await supabase.storage
            .from("evidence")
            .createSignedUrl(row.image_url, 3600);
          return {
            ...row,
            signed_url: urlData?.signedUrl ?? null,
            can_delete: row.uploaded_by === tx.seller_id,
          };
        })
      );

      return new Response(
        JSON.stringify({ evidence: items }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "upload_evidence") {
      if (!image_base64) {
        return new Response(
          JSON.stringify({ error: "image_base64 is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only allow upload in certain statuses
      if (!["accepted", "funded", "in_delivery", "disputed", "admin_review"].includes(tx.status)) {
        return new Response(
          JSON.stringify({ error: `Cannot upload evidence in status: ${tx.status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sellerId = tx.seller_id;
      if (!sellerId) {
        return new Response(
          JSON.stringify({ error: "No seller assigned" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Decode base64 to binary
      const binaryStr = atob(image_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const storagePath = `${sellerId}/${tx.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("evidence")
        .upload(storagePath, bytes, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        return new Response(
          JSON.stringify({ error: uploadError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: insertError } = await supabase.from("evidence").insert({
        transaction_id: tx.id,
        uploaded_by: sellerId,
        user_role: "seller",
        evidence_type: evidence_type || "pre_delivery",
        image_url: storagePath,
        notes: evidenceNotes ?? null,
        timestamp: new Date().toISOString(),
      });

      if (insertError) {
        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete_evidence") {
      if (!evidence_id) {
        return new Response(
          JSON.stringify({ error: "evidence_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch the evidence record and verify it belongs to the seller
      const { data: evidenceRow, error: fetchError } = await supabase
        .from("evidence")
        .select("id, image_url, uploaded_by")
        .eq("id", evidence_id)
        .eq("transaction_id", tx.id)
        .single();

      if (fetchError || !evidenceRow) {
        return new Response(
          JSON.stringify({ error: "Evidence not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (evidenceRow.uploaded_by !== tx.seller_id) {
        return new Response(
          JSON.stringify({ error: "You can only delete your own evidence" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete from storage
      await supabase.storage.from("evidence").remove([evidenceRow.image_url]);

      // Delete from database
      const { error: deleteError } = await supabase
        .from("evidence")
        .delete()
        .eq("id", evidence_id);

      if (deleteError) throw deleteError;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action: " + action }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("seller-web-action error:", error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
