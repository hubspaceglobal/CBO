// netlify/functions/stripe-webhook.js
//
// ── SETUP INSTRUCTIONS ──────────────────────────────────────────────────────
//
// 1. Create this file at: netlify/functions/stripe-webhook.js
//    in the root of your project folder (same level as index.html)
//
// 2. Add these environment variables in Netlify:
//    Dashboard → Site → Environment Variables → Add variable
//
//    SUPABASE_URL          = https://xxxx.supabase.co
//    SUPABASE_SERVICE_KEY  = your service role key (NOT the anon key)
//                           Supabase → Settings → API → service_role key
//    STRIPE_WEBHOOK_SECRET = whsec_xxxx
//                           Stripe → Developers → Webhooks → signing secret
//
// 3. In Stripe Dashboard → Developers → Webhooks → Add endpoint:
//    URL: https://your-site.netlify.app/.netlify/functions/stripe-webhook
//    Events to listen for: checkout.session.completed
//
// 4. Deploy — Netlify auto-detects files in /netlify/functions/
//
// ────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Verify Stripe webhook signature ─────────────────────────
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // ── Handle checkout.session.completed ───────────────────────
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    // Pull metadata set when creating the Stripe Checkout session
    const {
      church_name    = null,
      membership_tier = null,
    } = session.metadata || {};

    const email          = session.customer_details?.email || null;
    const amount         = session.amount_total ? session.amount_total / 100 : null;
    const sessionId      = session.id;
    const paymentStatus  = session.payment_status === 'paid' ? 'paid' : 'pending';

    // Determine promo — complementary year if before April 1 2025
    const now = new Date();
    const promoDeadline = new Date('2025-04-01');
    const promoApplied = now < promoDeadline;

    // Membership dates
    const start = new Date();
    const end = new Date();
    end.setFullYear(end.getFullYear() + (promoApplied ? 2 : 1)); // 2 years if promo

    // ── Write to Supabase using service role key ─────────────────
    const db = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY  // service key bypasses RLS for server-side writes
    );

    const { error } = await db.from('members').insert({
      church_name,
      email,
      membership_tier,
      annual_amount:     amount,
      stripe_session_id: sessionId,
      payment_status:    paymentStatus,
      membership_start:  start.toISOString().slice(0, 10),
      membership_end:    end.toISOString().slice(0, 10),
      promo_applied:     promoApplied,
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return { statusCode: 500, body: 'Database error' };
    }

    console.log(`Member saved: ${email} — ${membership_tier} — Promo: ${promoApplied}`);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
