import { requireAdmin, type AccessEnv } from './_auth';

interface Env extends AccessEnv {
  BOOKINGS_DB: D1Database;
}

const statuses = ['New', 'In Review', 'Follow-up', 'Approved', 'Declined'];

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const staff = await requireAdmin(request, env);
  if (!staff) return Response.json({ error: 'Admin access required.' }, { status: 401 });

  try {
    const result = await env.BOOKINGS_DB.prepare(`
      SELECT id, status, staff_notes, payload, created_at, updated_at
      FROM booking_inquiries
      ORDER BY created_at DESC
      LIMIT 500
    `).all();
    return Response.json({ inquiries: result.results });
  } catch (error) {
    console.error('Could not load booking inquiries:', error);
    return Response.json({ error: 'Inquiry database is unavailable.' }, { status: 503 });
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const staff = await requireAdmin(request, env);
  if (!staff) return Response.json({ error: 'Admin access required.' }, { status: 401 });
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Request not allowed.' }, { status: 403 });
  }

  try {
    const { id, status, staff_notes: staffNotes } = await request.json() as {
      id: string;
      status: string;
      staff_notes: string;
    };
    if (!id || !statuses.includes(status) || typeof staffNotes !== 'string' || staffNotes.length > 10_000) {
      return Response.json({ error: 'Invalid update.' }, { status: 400 });
    }
    const result = await env.BOOKINGS_DB.prepare(`
      UPDATE booking_inquiries
      SET status = ?, staff_notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `).bind(status, staffNotes, id).run();
    if (!result.meta.changes) return Response.json({ error: 'Inquiry not found.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Could not update booking inquiry:', error);
    return Response.json({ error: 'Could not save inquiry changes.' }, { status: 503 });
  }
};
