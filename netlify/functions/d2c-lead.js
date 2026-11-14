// Receives the audit forms and adds the lead to Brevo: "D2C Leads" (list 4) from the D2C page,
// "GTM Leads" (list 5) from the home page. Needs BREVO_API_KEY in Netlify.
// Optional: BREVO_D2C_LIST_ID (default 4), BREVO_GTM_LIST_ID (default 5).
// Every lead also sends an alert email through Brevo to LEAD_NOTIFY_EMAIL (default parthdave240@gmail.com),
// from LEAD_NOTIFY_SENDER (a sender verified in Brevo, default parthdave240@gmail.com). Alert failures never block the lead.
const API = 'https://api.brevo.com/v3';
const REVENUE = ['Under $1M', '$1M to $5M', '$5M to $10M', '$10M to $25M', '$25M to $50M', '$50M+'];
const AUDIT_TYPES = ['Free 1-day audit', '2-week growth audit', 'GTM audit sprint', 'Full GTM audit'];
const INDUSTRIES = ['B2B SaaS', 'D2C', 'E-learning', 'B2C', 'Other'];

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

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function notify(key, lead) {
  const to = process.env.LEAD_NOTIFY_EMAIL || 'parthdave240@gmail.com';
  const sender = process.env.LEAD_NOTIFY_SENDER || 'parthdave240@gmail.com';
  const rows = [
    ['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone], ['Company', lead.company],
    ['Revenue', lead.revenue], ['Website', lead.website], ['Request', lead.auditType],
    ['Came from', lead.home ? 'Home page (GTM Leads)' : 'D2C page (D2C Leads)'], ['Page', lead.page || 'unknown'],
  ];
  if (lead.extras) rows.push(['Landing page and creatives', lead.extras]);
  const html = '<div style="font-family:Arial,sans-serif;color:#0F172A;max-width:560px">' +
    '<h2 style="margin:0 0 4px">New lead: ' + esc(lead.name) + '</h2>' +
    '<p style="margin:0 0 16px;color:#64748B">' + esc(lead.auditType) + ' request from ' + esc(lead.company) + '</p>' +
    '<table style="border-collapse:collapse;width:100%">' +
    rows.map((r) => '<tr><td style="padding:8px 12px;border:1px solid #E2E8F0;background:#F8FAFC;font-weight:bold;white-space:nowrap">' + esc(r[0]) +
      '</td><td style="padding:8px 12px;border:1px solid #E2E8F0">' + esc(r[1]).replace(/\n/g, '<br>') + '</td></tr>').join('') +
    '</table><p style="margin-top:16px;color:#64748B">Reply to this email to answer ' + esc(lead.name) + ' directly. The lead is also saved in Brevo.</p></div>';
  const r = await brevo(key, 'POST', '/smtp/email', {
    sender: { name: 'Lead alerts', email: sender },
    to: [{ email: to }],
    replyTo: { email: lead.email, name: lead.name },
    subject: 'New lead: ' + lead.name + ', ' + lead.company + ' (' + lead.auditType + ')',
    htmlContent: html,
    tags: ['lead-alert'],
  });
  if (r.status >= 300) console.error('Brevo alert email error', r.status, JSON.stringify(r.data).slice(0, 300));
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
  const home = clean(p.source, 10) === 'home';
  const listId = home ? Number(process.env.BREVO_GTM_LIST_ID || 5) : Number(process.env.BREVO_D2C_LIST_ID || 4);
  const industry = home ? (INDUSTRIES.includes(clean(p.industry, 20)) ? clean(p.industry, 20) : '') : 'D2C';

  const attributes = { FIRSTNAME: name, COMPANY: company, REVENUE: revenue, WEBSITE: website, SMS: phone };
  if (industry) attributes.INDUSTRY = industry;
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

  try { await notify(key, { name, email, phone, company, revenue, website, auditType, extras, page, home }); } catch (e) { console.error('Lead alert failed', e && e.message); }

  return json(200, { ok: true });
};
