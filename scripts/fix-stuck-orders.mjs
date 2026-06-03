/**
 * Fix orders stuck in "pendente" that were already paid in Mercado Pago.
 *
 * This script:
 * 1. Finds all orders with status "pendente" that have a mp_preference_id
 * 2. Queries the MP API for payments by external_reference (order ID)
 * 3. If the payment is approved, updates the order to "pago" with correct payment info
 *
 * Usage:
 *   node scripts/fix-stuck-orders.mjs          # dry-run (preview only)
 *   node scripts/fix-stuck-orders.mjs --fix     # actually update orders
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !MP_ACCESS_TOKEN) {
  console.error("Missing required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MP_ACCESS_TOKEN");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const DRY_RUN = !process.argv.includes("--fix");

/** Map MP payment_type_id to our internal values */
function mapPaymentType(mpType) {
  switch (mpType) {
    case "credit_card": return "credit_card";
    case "debit_card": return "debit_card";
    case "bank_transfer": return "pix";
    case "ticket": return "pix";
    case "prepaid_card": return "credit_card";
    default: return undefined;
  }
}

/** Map MP payment status to our status */
function mapStatus(status) {
  switch (status) {
    case "approved": return "pago";
    case "in_process":
    case "in_mediation": return "pendente";
    case "cancelled":
    case "rejected": return "cancelado";
    case "refunded":
    case "charged_back": return "reembolsado";
    default: return "pendente";
  }
}

async function searchPaymentsByExternalRef(orderId) {
  const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP Payments API ${res.status}: ${text}`);
  }
  return res.json();
}

async function searchMerchantOrderByPreference(preferenceId) {
  const url = `https://api.mercadopago.com/merchant_orders/search?preference_id=${encodeURIComponent(preferenceId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP Merchant Orders API ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(DRY_RUN ? "🔍 DRY RUN — no changes will be made" : "✏️  FIX MODE — orders WILL be updated");
  console.log(`${"=".repeat(60)}\n`);

  // Find all pending orders with a preference ID
  const { data: orders, error } = await supabase
    .from("pedidos")
    .select("id, status, mp_preference_id, mp_payment_id, payment_method, total")
    .eq("status", "pendente")
    .not("mp_preference_id", "is", null);

  if (error) {
    console.error("Error fetching orders:", error);
    process.exit(1);
  }

  if (!orders || orders.length === 0) {
    console.log("No pending orders with mp_preference_id found. All good!\n");
    return;
  }

  console.log(`Found ${orders.length} pending order(s) with mp_preference_id:\n`);

  let fixed = 0;
  let stillPending = 0;
  let errors = 0;

  for (const order of orders) {
    console.log(`\n--- Order ${order.id} ---`);
    console.log(`  Status: ${order.status}`);
    console.log(`  Preference: ${order.mp_preference_id}`);
    console.log(`  Payment ID: ${order.mp_payment_id || "(none)"}`);
    console.log(`  Payment Method: ${order.payment_method || "(none)"}`);
    console.log(`  Total: R$${order.total}`);

    try {
      // Strategy 1: Search payments by external_reference (order ID)
      let payment = null;
      const paymentResult = await searchPaymentsByExternalRef(order.id);
      const payments = paymentResult.results || [];

      if (payments.length > 0) {
        // Get the latest payment (most recent first — API returns sorted by date_created desc)
        payment = payments[0];
        console.log(`  MP Payment (by external_ref): id=${payment.id}, status=${payment.status}, type=${payment.payment_type_id}, method=${payment.payment_method_id}`);
      } else {
        // Strategy 2: Search merchant order by preference_id, then get payments
        console.log(`  No payments found by external_reference, trying merchant_orders API...`);
        const merchantResult = await searchMerchantOrderByPreference(order.mp_preference_id);
        const merchantOrders = merchantResult.elements || [];

        if (merchantOrders.length > 0) {
          const mo = merchantOrders[0];
          const moPayments = mo.payments || [];
          if (moPayments.length > 0) {
            // Get the latest payment from the merchant order
            payment = moPayments.sort((a, b) => b.id - a.id)[0];
            console.log(`  MP Payment (by merchant_order): id=${payment.id}, status=${payment.status}`);
          } else {
            console.log(`  → Merchant order found but no payments yet. Order may not have been paid.`);
            stillPending++;
            continue;
          }
        } else {
          console.log(`  → No payments found for this order. It may not have been paid yet.`);
          stillPending++;
          continue;
        }
      }

      if (!payment) {
        console.log(`  → No payment found. Skipping.`);
        stillPending++;
        continue;
      }

      const newStatus = mapStatus(payment.status);
      const newPaymentMethod = mapPaymentType(payment.payment_type_id);

      if (newStatus === "pendente") {
        console.log(`  → Payment status is "${payment.status}" (still pending/in_process). Skipping.`);
        stillPending++;
        continue;
      }

      const updateData = {
        status: newStatus,
        mp_payment_id: String(payment.id),
      };
      if (newPaymentMethod) {
        updateData.payment_method = newPaymentMethod;
      }

      console.log(`  → Will update: status=${newStatus}, mp_payment_id=${payment.id}${newPaymentMethod ? `, payment_method=${newPaymentMethod}` : ""}`);

      if (DRY_RUN) {
        console.log(`  → [DRY RUN] Skipping update. Use --fix to apply.`);
        fixed++;
      } else {
        const { error: updateError } = await supabase
          .from("pedidos")
          .update(updateData)
          .eq("id", order.id);

        if (updateError) {
          console.error(`  → ERROR updating order:`, updateError.message);
          errors++;
        } else {
          console.log(`  → ✅ Updated successfully!`);
          fixed++;
        }
      }
    } catch (err) {
      console.error(`  → Error checking payment:`, err.message);
      errors++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Summary: ${fixed} order(s) to fix, ${stillPending} still pending, ${errors} error(s)`);
  if (DRY_RUN) {
    console.log("\nRun with --fix to apply changes.");
  }
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(console.error);