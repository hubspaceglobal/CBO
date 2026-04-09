/**
 * CBO HubSpace — Stripe Webhook Handler
 * Cloudflare Worker · stripe-webhook.js
 *
 * Receives Stripe events, verifies the signature, and writes
 * membership records to Supabase.
 *
 * Required Worker Secrets (set via: wrangler secret put <NAME>):
 *   STRIPE_WEBHOOK_SECRET   — from Stripe → Developers → Webhooks → Signing secret
 *   SUPABASE_SERVICE_KEY    — from Supabase → Project Settings → API → service_role key
 *
 * Required Worker Vars (set in wrangler.toml [vars]):
 *   SUPABASE_URL            — e.g. https://abcdefgh.supabase.co
 */

export default {
  async fetch(request, env) {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    // ── Verify Stripe webhook signature ─────────────────────
    let event;
    try {
      event = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Signature verification failed:', err.message);
      return new Response(`Webhook signature error: ${err.message}`, { status: 400 });
    }

    // ── Route to event handler ───────────────────────────────
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object, env);
          break;

        case 'payment_intent.succeeded':
          await handlePaymentSucceeded(event.data.object, env);
          break;

        default:
          // Log unhandled events but return 200 so Stripe doesn't retry
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      console.error(`Error handling event ${event.type}:`, err.message);
      // Return 500 so Stripe will retry
      return new Response('Internal error', { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

// ── Handler: checkout.session.completed ─────────────────────
async function handleCheckoutCompleted(session, env) {
  const {
    id: stripe_session_id,
    customer_email,
    customer_details,
    amount_total,
    currency,
    payment_status,
    metadata,
  } = session;

  // Determine membership tier from amount
  const amountDollars = amount_total / 100;
  let membership_tier = 'unknown';
  if (amountDollars <= 150) membership_tier = 'tier_1';
  else if (amountDollars <= 500) membership_tier = 'tier_2';

  const record = {
    stripe_session_id,
    email:            customer_email || customer_details?.email || null,
    customer_name:    customer_details?.name || null,
    amount_cents:     amount_total,
    currency:         currency?.toUpperCase() || 'USD',
    payment_status,
    membership_tier,
    church_name:      metadata?.church_name || null,
    source_page:      metadata?.source_page || 'stripe',
    created_at:       new Date().toISOString(),
  };

  await supabaseInsert(env, 'memberships', record);
  console.log(`Membership created for ${record.email} — ${membership_tier}`);
}

// ── Handler: payment_intent.succeeded ───────────────────────
async function handlePaymentSucceeded(paymentIntent, env) {
  const {
    id: stripe_payment_intent_id,
    amount,
    currency,
    receipt_email,
    metadata,
  } = paymentIntent;

  // Update membership record if it exists, or log the event
  const record = {
    stripe_payment_intent_id,
    email:        receipt_email || null,
    amount_cents: amount,
    currency:     currency?.toUpperCase() || 'USD',
    status:       'succeeded',
    metadata:     JSON.stringify(metadata || {}),
    created_at:   new Date().toISOString(),
  };

  await supabaseInsert(env, 'payment_events', record);
  console.log(`Payment succeeded: ${stripe_payment_intent_id}`);
}

// ── Supabase insert helper ───────────────────────────────────
async function supabaseInsert(env, table, record) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase insert to '${table}' failed: ${error}`);
  }

  return response;
}

// ── Stripe signature verification (Web Crypto API) ──────────
// Implements HMAC-SHA256 verification without the Stripe Node SDK,
// which is not available in the Cloudflare Workers runtime.
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader) throw new Error('Missing stripe-signature header');
  if (!secret)    throw new Error('Missing STRIPE_WEBHOOK_SECRET');

  // Parse the signature header: t=timestamp,v1=sig1,v1=sig2,...
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key === 't')  acc.timestamp = value;
    if (key === 'v1') acc.signatures.push(value);
    return acc;
  }, { timestamp: null, signatures: [] });

  if (!parts.timestamp) throw new Error('No timestamp in stripe-signature');
  if (!parts.signatures.length) throw new Error('No v1 signature in stripe-signature');

  // Reject events older than 5 minutes (replay attack protection)
  const tolerance = 300; // seconds
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(parts.timestamp)) > tolerance) {
    throw new Error('Timestamp outside tolerance window — possible replay attack');
  }

  // Compute expected signature
  const signedPayload = `${parts.timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  const expectedSig = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison to prevent timing attacks
  const match = parts.signatures.some(sig => constantTimeEqual(sig, expectedSig));
  if (!match) throw new Error('Signature mismatch — request may not be from Stripe');

  // Return parsed event object
  return JSON.parse(payload);
}

// Constant-time string comparison
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
