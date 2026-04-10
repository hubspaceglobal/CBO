/**
 * CBO HubSpace — Stripe Webhook (Cloudflare Worker)
 *
 * Deploy with:
 *   wrangler secret put STRIPE_SECRET_KEY
 *   wrangler secret put STRIPE_WEBHOOK_SECRET
 *   wrangler secret put SUPABASE_SERVICE_KEY
 *   wrangler deploy
 *
 * Then register the Worker URL as a Stripe webhook endpoint:
 *   Stripe Dashboard → Developers → Webhooks → Add endpoint
 *   Event: checkout.session.completed
 */

export default {
  async fetch(request, env) {

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const rawBody  = await request.text();
    const sigHeader = request.headers.get('stripe-signature');

    // Verify Stripe signature using Web Crypto API (no Node.js needed)
    const verified = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!verified) {
      console.error('Stripe signature verification failed');
      return new Response('Invalid signature', { status: 400 });
    }

    let stripeEvent;
    try {
      stripeEvent = JSON.parse(rawBody);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;

      const { church_name = null, membership_tier = null } = session.metadata || {};
      const email         = session.customer_details?.email || null;
      const amount        = session.amount_total ? session.amount_total / 100 : null;
      const sessionId     = session.id;
      const paymentStatus = session.payment_status === 'paid' ? 'paid' : 'pending';

      // Promo: 2-year membership if purchased before April 30 2026
      const promoApplied = new Date() < new Date('2026-04-30');
      const start = new Date();
      const end   = new Date();
      end.setFullYear(end.getFullYear() + (promoApplied ? 2 : 1));

      const record = {
        church_name,
        email,
        membership_tier,
        annual_amount:     amount,
        stripe_session_id: sessionId,
        payment_status:    paymentStatus,
        membership_start:  start.toISOString().slice(0, 10),
        membership_end:    end.toISOString().slice(0, 10),
        promo_applied:     promoApplied,
      };

      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/members`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(record),
      });

      if (!res.ok) {
        console.error('Supabase insert failed:', await res.text());
        return new Response('Database error', { status: 500 });
      }

      console.log(`Saved member: ${email} — ${membership_tier} — promo: ${promoApplied}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

// HMAC-SHA256 verification using Web Crypto API
async function verifyStripeSignature(body, header, secret) {
  if (!header || !secret) return false;
  try {
    const parts     = header.split(',').map(p => p.split('='));
    const timestamp = parts.find(([k]) => k === 't')?.[1];
    const v1Sigs   = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
    if (!timestamp || !v1Sigs.length) return false;

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign(
      'HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)
    );
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    return v1Sigs.some(s => constantTimeEqual(computed, s));
  } catch (e) {
    console.error('Sig error:', e);
    return false;
  }
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
