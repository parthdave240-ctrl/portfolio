/* Home page offer section: deliverables pop-ups and the audit form. Uses event delegation because the page is rendered after load. */
(function () {
  var TYPES = {
    free: { eyebrow: 'Free 1-day audit', title: 'Apply for your free 1-day audit.', lede: 'The free audit is based on eligibility and your current revenue. Tell us about your brand and we will confirm if you qualify.', btn: 'Apply for Free 1-Day Audit', type: 'Free 1-day audit' },
    audit: { eyebrow: 'Full GTM audit', title: 'Request your full GTM audit.', lede: 'A two-week assessment and plan. $1,000 flat, 100% credited toward the retainer.', btn: 'Request a Full Audit', type: 'Full GTM audit' }
  };
  var BASE_NOTE = 'We reply from a personal inbox, usually within one working day.';

  function $(id) { return document.getElementById(id); }
  function closeAll() { document.querySelectorAll('dialog[open]').forEach(function (d) { d.close(); }); }

  function openAudit(kind) {
    var t = TYPES[kind] || TYPES.free, f = $('hdForm'), n = $('hdNote'), b = $('hdSubmit');
    $('hdAuditEyebrow').textContent = t.eyebrow;
    $('hdAuditT').textContent = t.title;
    $('hdAuditLede').textContent = t.lede;
    b.textContent = t.btn; b.disabled = false;
    $('hdType').value = t.type;
    n.textContent = BASE_NOTE; n.style.color = '';
    f.style.display = ''; $('hdThanks').style.display = 'none';
    closeAll(); var d = $('hdAudit'); d.showModal(); d.scrollTop = 0;
  }

  document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-open]');
    if (open) { e.preventDefault(); openAudit(open.getAttribute('data-open')); return; }
    var deal = e.target.closest('[data-deal]');
    if (deal) { var d = $(deal.getAttribute('data-deal')); if (d) { closeAll(); d.showModal(); d.scrollTop = 0; } return; }
    var close = e.target.closest('dialog.deal [data-close]');
    if (close) { close.closest('dialog').close(); return; }
    if (e.target.matches && e.target.matches('dialog.deal')) e.target.close();
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.id !== 'hdForm') return;
    e.preventDefault();
    if (!f.checkValidity()) { f.reportValidity(); return; }
    var fd = new FormData(f), b = $('hdSubmit'), n = $('hdNote'), label = b.textContent;
    var digits = String(fd.get('phone') || '').replace(/\D/g, '').replace(/^0+/, '');
    var payload = {
      name: fd.get('name'), email: fd.get('email'), phone: String(fd.get('country_code')) + digits,
      company: fd.get('company'), industry: fd.get('industry'), revenue: fd.get('revenue'),
      website: fd.get('website'), extras: fd.get('extras') || '', audit_type: fd.get('audit_type'),
      page: location.href, source: 'home', company_url: fd.get('company_url') || ''
    };
    b.disabled = true; b.textContent = 'Sending...'; n.style.color = '';
    fetch('/.netlify/functions/d2c-lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function () { f.style.display = 'none'; $('hdThanks').style.display = 'block'; $('hdAudit').scrollTop = 0; f.reset(); })
      .catch(function () {
        b.disabled = false; b.textContent = label; n.style.color = '#F87171';
        n.innerHTML = 'Sorry, that did not go through. Please try again, or <a href="https://cal.id/parth-dave" target="_blank" rel="noopener" style="text-decoration:underline">book a call</a> instead.';
      });
  });
})();
