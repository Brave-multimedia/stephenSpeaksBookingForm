export const editableFields = [
  'full_name', 'position', 'company', 'country', 'city', 'phone', 'email', 'website',
  'organization_type', 'communication[]', 'event_name', 'event_date', 'event_start_time',
  'venue', 'event_location', 'expected_audience', 'venue_capacity', 'event_type',
  'event_description', 'production_handler', 'technical_production', 'stage_details',
  'accommodation', 'transportation', 'hospitality_requirements', 'budget_allocated',
  'budget', 'payment_responsible', 'currency', 'commercial_information',
  'preferred_meeting_date', 'preferred_meeting_time', 'meeting_timezone',
  'meeting_platform', 'meeting_purpose[]', 'meeting_notes'
];

export const requiredFields = [
  'full_name', 'position', 'company', 'country', 'city', 'phone', 'email',
  'organization_type', 'event_name', 'event_date', 'venue', 'event_location',
  'event_type', 'event_description', 'production_handler', 'budget_allocated',
  'payment_responsible', 'currency'
];

export function normalizePayload(input: Record<string, unknown>): Record<string, string | string[]> {
  const payload: Record<string, string | string[]> = {};
  for (const field of editableFields) {
    const value = input[field];
    if (Array.isArray(value)) {
      payload[field] = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
    } else if (value !== undefined && value !== null) {
      payload[field] = String(value).trim().slice(0, 4000);
    }
  }
  if (input.nda_agreement === 'Agreed') payload.nda_agreement = 'Agreed';
  if (input.final_declaration === 'Confirmed') payload.final_declaration = 'Confirmed';
  return payload;
}

export function validatePayload(payload: Record<string, string | string[]>): string | null {
  for (const field of requiredFields) {
    if (!String(payload[field] ?? '').trim()) return 'Please complete all required fields.';
  }
  if (payload.nda_agreement !== 'Agreed' || payload.final_declaration !== 'Confirmed') {
    return 'Required declarations are missing.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email))) {
    return 'Please enter a valid email address.';
  }
  return null;
}
