/* Shared rendering and Supabase data access for the static multi-page site. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (value) => /^https?:\/\//i.test(String(value || '')) ? esc(value) : '';
  const formatMoney = (value) => '$' + Number(value || 0).toLocaleString('en-US');
  const demoHomes = window.DC_DEMO_HOMES || [];
  const demoAreas = window.DC_NEIGHBORHOODS || [];
  const supa = window.supabase && window.SUPABASE_URL && window.SUPABASE_PUBLISHABLE_KEY
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY)
    : null;
  const mapRow = (p) => ({
    id: p.id, uuid: p.id, title: p.title, area: p.area, address: p.address, price: Number(p.price),
    type: p.property_type, beds: Number(p.beds), baths: Number(p.baths), sqft: Number(p.sqft),
    status: String(p.status || 'active').replace(/^./, (c) => c.toUpperCase()),
    availability: String(p.availability || 'available').replace(/^./, (c) => c.toUpperCase()),
    featured: Boolean(p.featured), desc: p.description || '', amenities: p.amenities || [],
    image: p.image_url || '', images: p.image_urls || [], demo: false
  });
  const markDemo = (p) => ({ ...p, demo: true });

  function renderShell() {
    const current = document.body.dataset.page || '';
    const header = $('siteHeader');
    if (header) header.innerHTML = `<div class="site-shell"><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="site-brand" href="index.html" aria-label="Shamim Wani Real Estate home"><span class="site-brandmark">SW</span><span class="site-brandname">SHAMIM WANI<small>SERVING VIRGINIA &amp; MARYLAND</small></span></a><button class="site-menu-button" id="siteMenuButton" type="button" aria-expanded="false" aria-label="Open navigation">☰</button><nav class="site-nav" id="siteNav">${[['home','index.html','Home'],['properties','properties.html','Homes'],['neighborhoods','neighborhoods.html','Neighborhoods'],['about','about.html','About']].map(([key,url,label]) => `<a href="${url}" ${current===key?'aria-current="page"':''}>${label}</a>`).join('')}<a href="index.html?admin=1">Admin</a><a class="site-nav-cta" href="properties.html">Explore homes ↗</a></nav></header></div>`;
    const footer = $('siteFooter');
    if (footer) footer.innerHTML = `<footer class="site-footer"><div class="site-shell footer-inner"><span>© 2026 Shamim Wani Real Estate</span><span class="footer-credit">Developed by Abdul Sammi</span><span class="footer-location">Virginia &amp; Maryland<br><a href="tel:+12022570485">202-257-0485</a> · <a href="mailto:wanirealtor@gmail.com">wanirealtor@gmail.com</a></span></div></footer>`;
    const menuButton = $('siteMenuButton');
    menuButton?.addEventListener('click', () => {
      const nav = $('siteNav'), open = nav.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      menuButton.textContent = open ? '×' : '☰';
    });
  }

  async function getHomes() {
    if (supa) {
      const { data, error } = await supa.from('properties').select('*').eq('status', 'active').order('created_at', { ascending: false });
      if (!error) return data?.length ? data.map(mapRow) : demoHomes.map(markDemo);
    }
    return demoHomes.map(markDemo);
  }

  function cardMarkup(home) {
    const id = encodeURIComponent(String(home.id));
    const image = safeUrl(home.image);
    return `<article class="property-card"><a href="property.html?id=${id}" aria-label="View ${esc(home.title)}"><div class="property-photo">${image ? `<img src="${image}" alt="${esc(home.title)}" loading="lazy">` : '<div class="page-empty">Photo coming soon</div>'}<span class="property-badge">${home.featured ? '✦ Featured' : esc(home.type)}</span></div><div class="property-card-body"><span class="demo-label">${home.demo ? 'Demo listing' : 'For sale'}</span><p class="property-price">${formatMoney(home.price)}</p><h2 class="property-title">${esc(home.title)}</h2><p class="property-address">${esc(home.address)} · ${esc(home.area)}</p><div class="property-facts"><span><b>${esc(home.beds)}</b> beds</span><span><b>${esc(home.baths)}</b> baths</span><span><b>${Number(home.sqft).toLocaleString()}</b> sq ft</span><span>${esc(home.availability || 'Available')}</span></div></div></a><button class="property-favorite" type="button" data-favorite="${esc(home.id)}" aria-label="Save ${esc(home.title)}" aria-pressed="false">♡</button></article>`;
  }

  function initProperties() {
    const grid = $('propertyGrid');
    if (!grid) return;
    let homes = [];
    const params = new URLSearchParams(location.search);
    const savedIds = () => { try { return (JSON.parse(localStorage.getItem('dcFavorites') || '[]')).map(String); } catch { return []; } };
    const areaSelect = $('filterArea'), typeSelect = $('filterType');
    const render = () => {
      const min = Number($('filterMin').value) || 0;
      const maxInput = Number($('filterMax').value);
      const max = $('filterMax').value === '' ? Infinity : maxInput;
      const area = areaSelect.value, type = typeSelect.value;
      const onlySaved = $('savedOnly').getAttribute('aria-pressed') === 'true';
      const saved = savedIds();
      const filtered = homes.filter((h) => h.price >= min && h.price <= max && (!area || h.area === area) && (!type || h.type === type) && (!onlySaved || saved.includes(String(h.id))));
      grid.innerHTML = filtered.length ? filtered.map(cardMarkup).join('') : '<div class="page-empty">No homes match those filters. Try a wider price range or another neighborhood.</div>';
      $('listingCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'home' : 'homes'}${homes.some((h) => !h.demo) ? ' available' : ' in this demo collection'}`;
      grid.querySelectorAll('[data-favorite]').forEach((button) => {
        const selected = saved.includes(button.dataset.favorite);
        button.textContent = selected ? '♥' : '♡';
        button.classList.toggle('is-saved', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.addEventListener('click', () => {
          const next = savedIds();
          const id = button.dataset.favorite;
          localStorage.setItem('dcFavorites', JSON.stringify(next.includes(id) ? next.filter((v) => v !== id) : [...next, id]));
          render();
        });
      });
    };
    getHomes().then((items) => {
      homes = items;
      const areas = [...new Set(items.map((h) => h.area))].sort();
      areaSelect.innerHTML = '<option value="">All areas</option>' + areas.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
      const requestedArea = params.get('area');
      if (areas.includes(requestedArea)) areaSelect.value = requestedArea;
      render();
    });
    [areaSelect, typeSelect, $('filterMin'), $('filterMax')].forEach((el) => el.addEventListener('input', render));
    $('savedOnly').addEventListener('click', (event) => {
      const button = event.currentTarget, active = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(active)); button.textContent = active ? '♥ Showing saved' : '♡ Saved homes'; render();
    });
    $('resetFilters').addEventListener('click', () => {
      areaSelect.value = ''; typeSelect.value = ''; $('filterMin').value = ''; $('filterMax').value = '';
      $('savedOnly').setAttribute('aria-pressed', 'false'); $('savedOnly').textContent = '♡ Saved homes'; render();
    });
  }

  function initNeighborhoods() {
    const grid = $('neighborhoodGrid');
    if (!grid) return;
    grid.innerHTML = demoAreas.map(([name, summary, source], index) => `<article class="neighborhood-card"><span class="card-number">0${index + 1} / VIRGINIA &amp; MARYLAND</span><h2>${esc(name)}</h2><p>${esc(summary)}</p><div class="neighborhood-links"><a href="properties.html?area=${encodeURIComponent(name)}">View homes ↗</a><a href="${safeUrl(source)}" target="_blank" rel="noopener">Area source ↗</a></div></article>`).join('');
  }

  function feedback(form, message, isError = false) {
    const node = form.querySelector('.form-feedback');
    node.textContent = message; node.classList.toggle('error', isError);
  }
  function attachInquiryForm(form, propertyId = null) {
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!supa) { feedback(form, 'The inquiry service is unavailable. Call 202-257-0485 or email wanirealtor@gmail.com.', true); return; }
      const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      const values = new FormData(form);
      const { error } = await supa.from('inquiries').insert({
        name: String(values.get('name') || '').trim(), email: String(values.get('email') || '').trim(),
        message: String(values.get('message') || '').trim(), property_id: propertyId
      });
      button.disabled = false;
      if (error) { feedback(form, 'We couldn’t send your message just now. Please try again shortly.', true); return; }
      form.reset(); feedback(form, 'Thanks—your message has been sent to Shamim Wani Real Estate.');
    });
  }

  async function initPropertyDetail() {
    const container = $('propertyContent');
    if (!container) return;
    const id = new URLSearchParams(location.search).get('id');
    let home = demoHomes.find((x) => String(x.id) === String(id));
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
    if (isUuid && supa) {
      const { data } = await supa.from('properties').select('*').eq('id', id).eq('status', 'active').maybeSingle();
      if (data) home = mapRow(data);
    }
    if (!home) { container.innerHTML = '<div class="page-empty">We couldn’t find that listing. It may have been removed or is no longer active. <a class="page-home-link" href="properties.html">Browse available homes</a>.</div>'; return; }
    const photos = [home.image, ...(home.images || [])].map(safeUrl).filter(Boolean);
    const propertyId = home.demo ? null : home.uuid;
    const mapLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(home.address);
    container.innerHTML = `<div class="detail-layout"><div class="detail-gallery"><div class="detail-cover">${photos[0] ? `<img id="detailMainImage" src="${photos[0]}" alt="${esc(home.title)}">` : '<div class="page-empty">Photos coming soon</div>'}</div><div class="detail-thumbs">${photos.map((url, i) => `<button type="button" data-photo="${url}" aria-label="Show photo ${i + 1}"><img src="${url}" alt=""></button>`).join('')}</div></div><div class="detail-copy"><p class="page-eyebrow">${esc(home.area)} · ${home.demo ? 'Demo listing' : 'For sale'}</p><h1 class="detail-title">${esc(home.title)}</h1><p class="property-price">${formatMoney(home.price)}</p><p>${esc(home.address)}</p><div class="property-facts"><span><b>${esc(home.beds)}</b> beds</span><span><b>${esc(home.baths)}</b> baths</span><span><b>${Number(home.sqft).toLocaleString()}</b> sq ft</span><span>${esc(home.type)}</span></div><p>${esc(home.desc)}</p><div class="detail-amenities">${(home.amenities || []).map((a) => `<span>${esc(a)}</span>`).join('')}</div><a class="page-button" href="${esc(mapLink)}" target="_blank" rel="noopener">View area map ↗</a><section class="detail-inquiry"><h2>Ask about this home</h2><form class="contact-form" id="propertyInquiry"><label>Your name<input name="name" autocomplete="name" maxlength="120" required></label><label>Email address<input name="email" type="email" autocomplete="email" maxlength="320" required></label><label class="wide">Message<textarea name="message" maxlength="5000" placeholder="I’d like to learn more about this home."></textarea></label><p class="form-feedback" role="status" aria-live="polite"></p><button class="page-button" type="submit">Send inquiry</button></form></section></div></div>`;
    container.querySelectorAll('[data-photo]').forEach((button) => button.addEventListener('click', () => { $('detailMainImage').src = button.dataset.photo; }));
    attachInquiryForm($('propertyInquiry'), propertyId);
  }

  function initContact() { attachInquiryForm($('contactForm')); }
  renderShell();
  initProperties();
  initNeighborhoods();
  initPropertyDetail();
  initContact();
})();

