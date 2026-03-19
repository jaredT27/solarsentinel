/**
 * Stripe Checkout — Risk Radar Payments
 *
 * Creates Stripe Checkout Sessions for:
 *   - $499    Pro (Single Report)
 *   - $1,999  Pipeline Monthly (up to 10/mo)
 *   - Partners tier is "Contact Sales" — no Stripe checkout needed
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET   — whsec_... (for payment confirmation)
 *   NEXT_PUBLIC_BASE_URL    — https://sentinel-alerts.vercel.app
 *
 * To set up:
 *   1. Create products + prices in Stripe Dashboard (or use the IDs below)
 *   2. Set up webhook endpoint: /api/stripe-webhook
 *   3. Add env vars to Vercel project settings
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://sentinel-alerts.vercel.app";

// ── Price IDs ───────────────────────────────────────────────────
// Replace these with your actual Stripe Price IDs after creating them.
// You can create them via:
//   stripe prices create --product prod_xxx --unit-amount 49900 --currency usd
//
// Or use the Stripe Dashboard > Products > Add Product

const PRICE_IDS: Record<string, string> = {
  // $499 one-time — Pro single-report diligence
  pro: process.env.STRIPE_PRICE_PRO ?? "price_REPLACE_WITH_PRO_499",

  // $1,999/mo recurring — Pipeline (up to 10 reports/month)
  pipeline: process.env.STRIPE_PRICE_PIPELINE ?? "price_REPLACE_WITH_PIPELINE_1999",
};

export type PricingTier = keyof typeof PRICE_IDS;

interface CheckoutOptions {
  tier: PricingTier;
  customerEmail: string;
  reportId: string;
  projectId?: string;
  dataCenterMode?: boolean;
}

/**
 * Create a Stripe Checkout Session.
 * Returns the checkout URL to redirect the user to.
 */
export async function createCheckoutSession(opts: CheckoutOptions): Promise<{
  checkoutUrl: string;
  sessionId: string;
}> {
  const priceId = PRICE_IDS[opts.tier];
  if (!priceId || priceId.startsWith("price_REPLACE")) {
    throw new Error(
      `Stripe Price ID not configured for tier "${opts.tier}". ` +
      `Set STRIPE_PRICE_${opts.tier.toUpperCase()} in your .env or Vercel environment variables.`
    );
  }

  const isRecurring = opts.tier === "pipeline";

  const session = await getStripe().checkout.sessions.create({
    mode: isRecurring ? "subscription" : "payment",
    payment_method_types: ["card"],
    customer_email: opts.customerEmail,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      report_id: opts.reportId,
      project_id: opts.projectId ?? "",
      tier: opts.tier,
      data_center_mode: String(opts.dataCenterMode ?? true),
      source: "risk-radar",
    },
    success_url: `${BASE_URL}/risk-radar?session_id={CHECKOUT_SESSION_ID}&report=${opts.reportId}`,
    cancel_url: `${BASE_URL}/risk-radar?canceled=true`,
  });

  return {
    checkoutUrl: session.url!,
    sessionId: session.id,
  };
}

/**
 * Verify a completed checkout session.
 * Call this from your webhook handler or after redirect.
 */
export async function verifyCheckoutSession(sessionId: string): Promise<{
  paid: boolean;
  tier: PricingTier | null;
  reportId: string | null;
  customerEmail: string | null;
}> {
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return {
      paid: session.payment_status === "paid",
      tier: (session.metadata?.tier as PricingTier) ?? null,
      reportId: session.metadata?.report_id ?? null,
      customerEmail: session.customer_email ?? null,
    };
  } catch {
    return { paid: false, tier: null, reportId: null, customerEmail: null };
  }
}
