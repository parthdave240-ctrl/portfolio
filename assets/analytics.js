/* PostHog (US cloud). Skips localhost unless ?ph_test=1 so previews don't pollute data. */
(function () {
  var h = location.hostname;
  if ((h === 'localhost' || h === '127.0.0.1') && location.search.indexOf('ph_test=1') < 0) return;

  var ph = window.posthog = window.posthog || [];
  if (!ph.__SV) {
    ph._i = [];
    ph.init = function (key, cfg, name) { ph._i.push([key, cfg, name]); };
    ph.capture = function () { ph.push(['capture'].concat([].slice.call(arguments))); };
    ph.__SV = 1;
    var s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://us-assets.i.posthog.com/static/array.js';
    document.head.appendChild(s);
  }
  ph.init('phc_vBShy5uB9jA2usYnNg4xmDGg9Et8mgGKtJbkvPL9cNeS', {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only'
  });

  // Conversion clicks: calls, WhatsApp, email, case studies, AI GTM systems, outbound profiles.
  function onClick(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '', ev = null;
    if (href.indexOf('cal.id') > -1 || href.indexOf('cal.com') > -1) ev = 'book_call_click';
    else if (href.indexOf('wa.me') > -1 || href.indexOf('whatsapp') > -1) ev = 'whatsapp_click';
    else if (href.indexOf('mailto:') === 0) ev = 'email_click';
    else if (href.indexOf('/case-studies/') > -1 && href.length > 15) ev = 'case_study_click';
    else if (href.indexOf('/ai-gtm-systems/') > -1) ev = 'ai_gtm_click';
    else if (href.indexOf('linkedin.com') > -1) ev = 'linkedin_click';
    if (ev) window.posthog.capture(ev, { href: href, label: (a.textContent || '').trim().slice(0, 60), page: location.pathname });
  }

  // The home page rewrites the document after load, which drops listeners; re-bind when that happens.
  function bind() {
    if (document.documentElement.__phBound) return;
    document.documentElement.__phBound = 1;
    document.removeEventListener('click', onClick, true);
    document.addEventListener('click', onClick, true);
  }
  bind();
  setInterval(bind, 1000);
})();
