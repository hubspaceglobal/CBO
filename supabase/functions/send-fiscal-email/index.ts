// ============================================================
// CBO HubSpace — Fiscal Application Email Notifications
// Supabase Edge Function (Deno) · send-fiscal-email
//
// Sends two emails on each fiscal/grant application:
//   1. Confirmation email to the applicant
//   2. Notification email to hubspace@theartisanhub.space
//
// Email is delivered via Resend (https://resend.com).
//
// Required secrets (set via the Supabase CLI):
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//   supabase secrets set FROM_EMAIL="CBO HubSpace <noreply@theartisanhub.space>"
//
// Deploy:
//   supabase functions deploy send-fiscal-email --no-verify-jwt
// ============================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "CBO HubSpace <onboarding@resend.dev>";
const NOTIFY_EMAIL = "hubspace@theartisanhub.space";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Application {
  applicant_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  has_website?: string;
  company_website?: string;
  company_address?: string;
  is_501c3?: string;
  annual_income?: string;
  funder_name?: string;
  grant_name?: string;
  grant_deadline?: string;
  grant_link?: string;
  mission_statement?: string;
  programs?: string[] | null;
  interested_in_membership?: string;
  service_type?: string;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function row(label: string, value?: string | string[] | null): string {
  if (value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0)) return "";
  const v = Array.isArray(value) ? value.join(", ") : value;
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:#3B0764;width:42%;vertical-align:top;">${esc(label)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#3D3D3D;">${esc(v)}</td>
  </tr>`;
}

function applicantEmailHtml(a: Application): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#F8F8F8;font-family:Arial,Helvetica,sans-serif;color:#0A0A0A;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:#3B0764;padding:28px 32px;border-bottom:4px solid #A31621;">
      <h1 style="margin:0;color:#fff;font-size:20px;letter-spacing:.04em;">CBO <span style="color:#D4B8F0;">HUBSPACE</span></h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:12px;letter-spacing:.1em;">FISCAL SPONSORSHIP &amp; GRANT SERVICES</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#3B0764;font-size:22px;margin:0 0 16px;">Thank you for applying, ${esc(a.applicant_name || "")}.</h2>
      <p style="font-size:15px;line-height:1.7;color:#3D3D3D;margin:0 0 16px;">
        We've received your application for <strong>${esc(a.service_type || "our services")}</strong>. Our team is reviewing your submission now and will be in touch to confirm your service track and the proposal support level needed.
      </p>
      <div style="background:#F3EEFF;border-left:4px solid #3B0764;padding:14px 18px;border-radius:6px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#3B0764;font-weight:600;line-height:1.6;">
          Once your application is approved, a secure payment link will be sent to you manually within 24–48 hours. You only pay after approval.
        </p>
      </div>
      <p style="font-size:14px;line-height:1.7;color:#3D3D3D;margin:0 0 6px;"><strong>Summary of your application:</strong></p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${row("Service", a.service_type)}
        ${row("Organization", a.company_name)}
        ${row("Funder", a.funder_name)}
        ${row("Grant", a.grant_name)}
        ${row("Grant Deadline", a.grant_deadline)}
        ${row("Programs", a.programs ?? null)}
        ${row("Interested in Membership", a.interested_in_membership)}
      </table>
      <p style="font-size:14px;line-height:1.7;color:#3D3D3D;margin:24px 0 0;">
        Questions? Reply to this email or reach us at <a href="mailto:hubspace@theartisanhub.space" style="color:#A31621;">hubspace@theartisanhub.space</a>.
      </p>
    </div>
    <div style="background:#1c0233;padding:20px 32px;text-align:center;">
      <p style="margin:0;color:rgba(255,255,255,.55);font-size:12px;">CBO HubSpace · Where Faith Communities and Neighborhood Need Meet</p>
    </div>
  </div></body></html>`;
}

function notifyEmailHtml(a: Application): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#F8F8F8;font-family:Arial,Helvetica,sans-serif;color:#0A0A0A;">
  <div style="max-width:640px;margin:0 auto;background:#fff;">
    <div style="background:#3B0764;padding:22px 28px;border-bottom:4px solid #A31621;">
      <h1 style="margin:0;color:#fff;font-size:18px;">New Application — ${esc(a.service_type || "Fiscal/Grant Service")}</h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="font-size:14px;color:#3D3D3D;margin:0 0 14px;">A new application was submitted on cbohub.theartisanhub.space.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${row("Service Type", a.service_type)}
        ${row("Applicant Name", a.applicant_name)}
        ${row("Email", a.email)}
        ${row("Phone", a.phone)}
        ${row("Company Name", a.company_name)}
        ${row("Has Website", a.has_website)}
        ${row("Website", a.company_website)}
        ${row("Company Address", a.company_address)}
        ${row("501(c)(3)", a.is_501c3)}
        ${row("Annual Income", a.annual_income)}
        ${row("Funder", a.funder_name)}
        ${row("Grant", a.grant_name)}
        ${row("Grant Deadline", a.grant_deadline)}
        ${row("Grant Link", a.grant_link)}
        ${row("Mission Statement", a.mission_statement)}
        ${row("Programs", a.programs ?? null)}
        ${row("Interested in Membership", a.interested_in_membership)}
      </table>
      <p style="font-size:13px;color:#6B6B6B;margin:18px 0 0;">Reminder: send the payment link manually within 24–48 hours after approval.</p>
    </div>
  </div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email to", to);
    return { skipped: true };
  }
  const payload: Record<string, unknown> = { from: FROM_EMAIL, to: [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Resend error to", to, res.status, txt);
    return { ok: false, status: res.status, error: txt };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  try {
    const a: Application = await req.json();

    const results: Record<string, unknown> = {};

    // 1) Notification to CBO HubSpace
    results.notify = await sendEmail(
      NOTIFY_EMAIL,
      `New ${a.service_type || "Fiscal/Grant"} Application — ${a.applicant_name || a.email || "Unknown"}`,
      notifyEmailHtml(a),
      a.email,
    );

    // 2) Confirmation to applicant
    if (a.email) {
      results.confirmation = await sendEmail(
        a.email,
        "We received your CBO HubSpace application",
        applicantEmailHtml(a),
        NOTIFY_EMAIL,
      );
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-fiscal-email error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
