import { normalizePayload, validatePayload } from './_inquiry';

interface Env {
  BOOKINGS_DB: D1Database;
  RATE_LIMIT_SECRET: string;
  RESEND_API_KEY?: string;
  BOOKING_EMAIL_FROM?: string;
}

const EDIT_LINK_LIFETIME_DAYS = 30;
const CONNECT_EMAIL = 'connect@bravemultimedia.com';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]!);
}

async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.BOOKING_EMAIL_FROM) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.BOOKING_EMAIL_FROM,
        to: [to],
        reply_to: CONNECT_EMAIL,
        subject,
        html
      })
    });
    if (!response.ok) console.error('Transactional email provider returned status:', response.status);
    return response.ok;
  } catch (error) {
    console.error('Could not send transactional email:', error);
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Request not allowed.' }, { status: 403 });
  }

  try {
    const body = await request.text();
    if (body.length > 32_000) return Response.json({ error: 'Submission is too large.' }, { status: 413 });
    const input = JSON.parse(body);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json({ error: 'Invalid submission.' }, { status: 400 });
    }
    if (input.website_address) return Response.json({ ok: true });

    const payload = normalizePayload(input);
    const validationError = validatePayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.RATE_LIMIT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(clientIp));
    const ipHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const hourBucket = Math.floor(Date.now() / 3_600_000);
    const count = await env.BOOKINGS_DB.prepare(`
      INSERT INTO inquiry_rate_limits (ip_hash, hour_bucket, request_count)
      VALUES (?, ?, 1)
      ON CONFLICT (ip_hash, hour_bucket)
      DO UPDATE SET request_count = inquiry_rate_limits.request_count + 1
      RETURNING request_count
    `).bind(ipHash, hourBucket).first<{ request_count: number }>();
    if (!count || count.request_count > 5) {
      return Response.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const id = crypto.randomUUID();
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const editToken = base64Url(tokenBytes);
    const editTokenHash = await sha256(editToken);
    const expiresAt = new Date(Date.now() + EDIT_LINK_LIFETIME_DAYS * 86_400_000).toISOString();
    await env.BOOKINGS_DB.prepare(`
      INSERT INTO booking_inquiries (id, status, payload, edit_token_hash, edit_token_expires_at)
      VALUES (?, 'New', ?, ?, ?)
    `).bind(id, JSON.stringify(payload), editTokenHash, expiresAt).run();

    const editUrl = new URL('/edit-inquiry.html', request.url);
    editUrl.searchParams.set('token', editToken);
    const customerEmail = sendEmail(
      env,
      String(payload.email),
      'We received your Stephen Speaks booking inquiry',
      `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18233a;max-width:640px;margin:auto"><h1 style="color:#08152f">Inquiry received</h1><p>Hello ${escapeHtml(payload.full_name)},</p><p>Thank you for your booking inquiry for <strong>${escapeHtml(payload.event_name)}</strong>. The Brave Multimedia team has received it and will review your request.</p><p>You can view or update your responses for the next ${EDIT_LINK_LIFETIME_DAYS} days using this private link:</p><p><a href="${escapeHtml(editUrl.toString())}" style="display:inline-block;background:#caa451;color:#08152f;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold">View or edit my responses</a></p><p>If the button does not work, copy this address into your browser:<br><a href="${escapeHtml(editUrl.toString())}">${escapeHtml(editUrl.toString())}</a></p><p>Keep this link private. Anyone with it can view and edit this inquiry.</p><p>Regards,<br>Brave Multimedia</p></div>`
    );
    const confirmationEmailSent = await customerEmail;

    return Response.json({ ok: true, confirmationEmailSent }, { status: 201 });
  } catch (error) {
    console.error('Could not store booking inquiry:', error);
    return Response.json({ error: 'Inquiry storage is temporarily unavailable.' }, { status: 503 });
  }
};
