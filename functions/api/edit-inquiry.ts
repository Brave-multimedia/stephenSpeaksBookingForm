import { normalizePayload, validatePayload } from './_inquiry';

interface Env {
  BOOKINGS_DB: D1Database;
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    if (!validToken(token)) return json({ error: 'This edit link is invalid.' }, 400);
    const row = await env.BOOKINGS_DB.prepare(`
      SELECT payload, edit_token_expires_at
      FROM booking_inquiries
      WHERE edit_token_hash = ?
      LIMIT 1
    `).bind(await hashToken(token)).first<{ payload: string; edit_token_expires_at: string | null }>();

    if (!row) return json({ error: 'This edit link is invalid or has been replaced.' }, 404);
    if (!row.edit_token_expires_at || row.edit_token_expires_at <= new Date().toISOString()) {
      return json({ error: 'This edit link has expired. Please contact connect@bravemultimedia.com for help.' }, 410);
    }
    return json({ payload: JSON.parse(row.payload), expiresAt: row.edit_token_expires_at });
  } catch (error) {
    console.error('Could not load customer inquiry:', error);
    return json({ error: 'The inquiry could not be loaded. Please try again later.' }, 503);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ error: 'Request not allowed.' }, 403);
  }
  try {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!validToken(token)) return json({ error: 'This edit link is invalid.' }, 400);
    const incoming = await request.json() as Record<string, unknown>;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return json({ error: 'Invalid responses.' }, 400);
    }
    const editTokenHash = await hashToken(token);
    const existing = await env.BOOKINGS_DB.prepare(`
      SELECT payload, edit_token_expires_at
      FROM booking_inquiries
      WHERE edit_token_hash = ?
      LIMIT 1
    `).bind(editTokenHash).first<{ payload: string; edit_token_expires_at: string | null }>();
    if (!existing) return json({ error: 'This edit link is invalid or has been replaced.' }, 404);
    if (!existing.edit_token_expires_at || existing.edit_token_expires_at <= new Date().toISOString()) {
      return json({ error: 'This edit link has expired. Please contact connect@bravemultimedia.com for help.' }, 410);
    }

    const previousPayload = JSON.parse(existing.payload) as Record<string, unknown>;
    const payload = normalizePayload({
      ...previousPayload,
      ...incoming,
      nda_agreement: previousPayload.nda_agreement,
      final_declaration: previousPayload.final_declaration
    });
    const validationError = validatePayload(payload);
    if (validationError) return json({ error: validationError }, 400);
    if (JSON.stringify(payload).length > 32_000) return json({ error: 'Responses are too large.' }, 413);

    const updated = await env.BOOKINGS_DB.prepare(`
      UPDATE booking_inquiries
      SET payload = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE edit_token_hash = ? AND edit_token_expires_at > ?
    `).bind(JSON.stringify(payload), editTokenHash, new Date().toISOString()).run();
    if (!updated.meta.changes) return json({ error: 'This edit link has expired.' }, 410);
    return json({ ok: true });
  } catch (error) {
    console.error('Could not update customer inquiry:', error);
    return json({ error: 'Changes could not be saved. Please try again later.' }, 503);
  }
};
