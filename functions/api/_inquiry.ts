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

function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.') && !url.username && !url.password) {
      return url.toString();
    }
  } catch {
    // Keep the original value so validation can return a useful error.
  }
  return trimmed;
}

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
  if (typeof payload.website === 'string') payload.website = normalizeWebsite(payload.website);
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
  const fullName = String(payload.full_name);
  if (!/^[\p{L}\p{M} .’'-]{2,120}$/u.test(fullName)) {
    return 'Enter a valid full name using letters, spaces, apostrophes, periods, or hyphens.';
  }
  const position = String(payload.position);
  if (position.length < 2 || position.length > 120 || !/\p{L}/u.test(position) || !/^[\p{L}\p{M}0-9 .,’'&/()+-]+$/u.test(position)) {
    return 'Enter a valid position or designation.';
  }
  const company = String(payload.company);
  if (company.length < 2 || company.length > 160 || !/\p{L}/u.test(company) || !/^[\p{L}\p{M}0-9 .,’'&/()+-]+$/u.test(company)) {
    return 'Enter a valid company or organization name.';
  }
  for (const field of ['country', 'city']) {
    const value = String(payload[field]);
    if (value.length < 2 || value.length > 100 || !/\p{L}/u.test(value) || !/^[\p{L}\p{M}0-9 .,’'()/-]+$/u.test(value)) {
      return `Enter a valid ${field}.`;
    }
  }
  const phone = String(payload.phone);
  const phoneDigits = phone.replace(/\D/g, '');
  if (!/^\+?[0-9][0-9\s().-]{5,23}$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    return 'Enter a valid phone number with 7 to 15 digits; include your country code when needed.';
  }
  const email = String(payload.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return 'Please enter a valid email address.';
  }
  const website = String(payload.website ?? '');
  if (website.length > 2048) return 'Company website must be 2,048 characters or fewer.';
  if (website) {
    try {
      const url = new URL(website);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
        return 'Enter a valid company website, such as www.example.com.';
      }
    } catch {
      return 'Enter a valid company website, such as www.example.com.';
    }
  }
  return null;
}
