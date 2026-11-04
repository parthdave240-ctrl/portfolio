// Receives the D2C audit form and adds the lead to the "D2C Leads" list in Brevo.
// Needs the BREVO_API_KEY environment variable in Netlify. Optional: BREVO_D2C_LIST_ID (default 4).
const API = 'https://api.brevo.com/v3';
const REVENUE = ['Under $1M', '$1M to $5M', '$5M to $10M', '$10M to $25M', '$25M to $50M', '$50M+'];
const AUDIT_TYPES = ['Free 1-day audit', '2-week growth audit'];

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

async function brevo(key, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'api-key': key, accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { /* non-JSON body */ }
  return { status: res.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }

  // Honeypot: bots fill this hidden field. Pretend success.
  if (clean(p.company_url, 200)) return json(200, { ok: true });

  const name = clean(p.name, 100);
  const email = clean(p.email, 200).toLowerCase();
  const company = clean(p.company, 150);
  const revenue = clean(p.revenue, 40);
  const auditType = clean(p.audit_type, 40);
  const phone = '+' + clean(p.phone, 20).replace(/\D/g, '');
  let website = clean(p.website, 300);
  if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
  const extras = clean(p.extras, 1500);
  const page = clean(p.page, 300);

  if (!name || !company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'invalid' });
  if (!/^\+\d{7,15}$/.test(phone)) return json(400, { error: 'phone' });
  if (!REVENUE.includes(revenue) || !AUDIT_TYPES.includes(auditType)) return json(400, { error: 'invalid' });
  try { new URL(website); } catch (e) { return json(400, { error: 'website' }); }

  const key = process.env.BREVO_API_KEY;
  if (!key) { console.error('BREVO_API_KEY is not set'); return json(500, { error: 'config' }); }
  const listId = Number(process.env.BREVO_D2C_LIST_ID || 4);

  const attributes = { FIRSTNAME: name, COMPANY: company, REVENUE: revenue, WEBSITE: website, INDUSTRY: 'D2C', SMS: phone };
  let r = await brevo(key, 'POST', '/contacts', { email, attributes, listIds: [listId], updateEnabled: true });
  let phoneInNote = false;
  if (r.status >= 400 && r.status < 500) {
    // The phone attribute is strict (valid and unique). Retry without it and keep it in the note.
    const { SMS, ...rest } = attributes;
    r = await brevo(key, 'POST', '/contacts', { email, attributes: rest, listIds: [listId], updateEnabled: true });
    phoneInNote = true;
  }
  if (r.status >= 300) { console.error('Brevo contact error', r.status, JSON.stringify(r.data).slice(0, 300)); return json(502, { error: 'brevo' }); }

  let id = r.data && r.data.id;
  if (!id) {
    const g = await brevo(key, 'GET', '/contacts/' + encodeURIComponent(email));
    id = g.data && g.data.id;
  }

  if (id) {
    const lines = [`${auditType}`, `Source page: ${page || 'unknown'}`];
    if (phoneInNote) lines.push(`Phone: ${phone}`);
    if (extras) lines.push(`Landing page and creatives: ${extras}`);
    const n = await brevo(key, 'POST', '/crm/notes', { text: lines.join('\n'), contactIds: [id] });
    if (n.status >= 300) console.error('Brevo note error', n.status, JSON.stringify(n.data).slice(0, 300));
  }

  return json(200, { ok: true });
};
