/* Supabase-backed sign-in and listing administration for the static site. */
(() => {
  const supa = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
  const adminHomes = [];
  let signedInAdmin = null;
  let activePropertyId = null;
  let publicDataAvailable = false;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const jsArg = (value) => esc(JSON.stringify(String(value ?? '')));
  const fromDb = (p) => ({
    id: p.id, title: p.title, area: p.area, address: p.address, price: Number(p.price),
    type: p.property_type, beds: Number(p.beds), baths: Number(p.baths), sqft: Number(p.sqft),
    status: p.status[0].toUpperCase() + p.status.slice(1),
    availability: p.availability[0].toUpperCase() + p.availability.slice(1),
    featured: p.featured, desc: p.description, amenities: p.amenities || [],
    image: p.image_url || '', images: p.image_urls || [],
    updatedAt: p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''
  });
  const toDb = (x) => ({
    title: x.title, area: x.area, address: x.address, price: Number(x.price),
    property_type: x.type, beds: Number(x.beds), baths: Number(x.baths), sqft: Number(x.sqft),
    status: String(x.status).toLowerCase(), availability: String(x.availability || 'Available').toLowerCase(),
    featured: Boolean(x.featured), description: x.desc, amenities: x.amenities || [],
    image_url: x.image || '', image_urls: x.images || [], updated_at: new Date().toISOString()
  });
  const safeImage = (src) => /^(https?:\/\/|data:image\/)/i.test(String(src || '')) ? esc(src) : '';

  // Keep the demo preview when the database is empty or unreachable.
  async function loadPublicListings() {
    const { data, error } = await supa.from('properties').select('*').eq('status', 'active').order('created_at', { ascending: false });
    if (error) {
      console.warn('Live listings are unavailable; showing the labeled demo properties.', error.message);
      publicDataAvailable = false;
      const banner = document.querySelector('.demo-banner');
      banner.childNodes[1].textContent = ' DEMO PREVIEW ';
      banner.lastElementChild.textContent = 'Sample listings only · Live listings and inquiries are unavailable right now';
      return;
    }
    publicDataAvailable = true;
    const banner = document.querySelector('.demo-banner');
    banner.childNodes[1].textContent = data?.length ? ' LIVE LISTINGS ' : ' DEMO PREVIEW ';
    banner.lastElementChild.textContent = data?.length ? 'Active listings from Shamim Wani Real Estate · Inquiries are sent securely' : 'Sample listings only · Live listings appear after admin publishing · Inquiries are sent securely';
    if (data?.length) {
      homes = data.map(fromDb);
      render();
    }
  }

  function prepareAdminUi() {
    const main = document.querySelector('.adminmain');
    main.hidden = true;
    const login = document.createElement('section');
    login.id = 'adminLogin';
    login.className = 'admin-login';
    login.innerHTML = `<form class="admin-login-card" id="adminLoginForm">
      <div class="eyebrow">Private workspace</div><h1>Admin sign in</h1>
      <p>Sign in with the email and password created for this Supabase project. Only approved admin accounts can continue.</p>
      <label for="adminEmail">Email</label><input id="adminEmail" name="email" type="email" autocomplete="username" required>
      <label for="adminPassword">Password</label><input id="adminPassword" name="password" type="password" autocomplete="current-password" required>
      <div id="adminLoginMessage" class="admin-login-message" role="status" aria-live="polite"></div>
      <button class="btn" id="adminLoginSubmit">Sign in securely</button>
      <button class="secondary" type="button" onclick="closeAdmin()">Back to site</button>
    </form>`;
    main.before(login);
    const bar = document.querySelector('.adminbar');
    const logout = document.createElement('button');
    logout.id = 'adminLogout'; logout.className = 'secondary'; logout.textContent = 'Sign out'; logout.hidden = true;
    logout.addEventListener('click', signOutAdmin);
    bar.insertBefore(logout, bar.lastElementChild);
    $('adminLoginForm').addEventListener('submit', signInAdmin);
    document.querySelector('.adminhead p').textContent = 'Secure workspace · Properties and inquiries are protected by Supabase access policies.';
  }

  function setLoginMessage(message, isError = true) {
    const box = $('adminLoginMessage');
    box.textContent = message;
    box.classList.toggle('error', isError);
  }

  async function signInAdmin(event) {
    event.preventDefault();
    const button = $('adminLoginSubmit');
    button.disabled = true; setLoginMessage('Checking your account…', false);
    try {
      const form = new FormData(event.currentTarget);
      const { data, error } = await supa.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
      if (error) throw error;
      const { data: membership, error: membershipError } = await supa.from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (membershipError || !membership) {
        await supa.auth.signOut();
        throw new Error('This account is not approved as an admin yet. Add its user ID to public.admin_users in Supabase, then sign in again.');
      }
      await enterAdmin(data.user);
    } catch (error) {
      $('adminPassword').value = '';
      setLoginMessage(error.message || 'Sign in failed. Check your email and password.');
    } finally { button.disabled = false; }
  }

  async function enterAdmin(user) {
    signedInAdmin = user;
    $('adminLoginForm').reset();
    $('adminLogin').hidden = true;
    document.querySelector('.adminmain').hidden = false;
    $('adminLogout').hidden = false;
    document.querySelector('.adminhead h1').textContent = 'Welcome to your workspace.';
    document.querySelector('.adminhead p').textContent = `Signed in as ${user.email}. Property and inquiry changes are saved to Supabase.`;
    try {
      await loadAdminData();
      showTab('properties');
    } catch (error) {
      await supa.auth.signOut();
      signedInAdmin = null;
      document.querySelector('.adminmain').hidden = true;
      $('adminLogin').hidden = false;
      $('adminLogout').hidden = true;
      setLoginMessage(`Your account is approved, but the admin data could not load: ${error.message}`);
    }
  }

  async function loadAdminData() {
    const [propertyResult, inquiryResult] = await Promise.all([
      supa.from('properties').select('*').order('created_at', { ascending: false }),
      supa.from('inquiries').select('*').order('created_at', { ascending: false })
    ]);
    if (propertyResult.error) throw propertyResult.error;
    if (inquiryResult.error) throw inquiryResult.error;
    adminHomes.splice(0, adminHomes.length, ...(propertyResult.data || []).map(fromDb));
    leads = (inquiryResult.data || []).map((l) => ({
      id: l.id, name: l.name, email: l.email, message: l.message,
      tourDate: l.tour_date, tourTime: l.tour_time,
      date: new Date(l.created_at).toLocaleDateString()
    }));
  }

  async function signOutAdmin() {
    await supa.auth.signOut();
    signedInAdmin = null;
    document.querySelector('.adminmain').hidden = true;
    $('adminLogin').hidden = false;
    $('adminLogout').hidden = true;
    $('adminLoginForm').reset();
    setLoginMessage('You have been signed out.', false);
    closeAdmin();
  }

  window.openAdmin = async function () {
    $('admin').classList.add('show');
    $('adminLogin').hidden = false;
    document.querySelector('.adminmain').hidden = true;
    $('adminLogout').hidden = true;
    setLoginMessage('Sign in with your approved admin account.', false);
    const { data: { session } } = await supa.auth.getSession();
    if (session?.user) {
      const { data: member, error } = await supa.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle();
      if (!error && member) await enterAdmin(session.user);
      else await supa.auth.signOut();
    }
  };
  window.closeAdmin = function () {
    $('admin').classList.remove('show');
    document.querySelector('.adminmain').hidden = true;
    $('adminLogin').hidden = false;
    $('adminLoginForm').reset();
    document.getElementById('siteNav').classList.remove('open');
  };

  window.render = function () {
    const ar = [...new Set(homes.map((x) => x.area))].sort();
    const sel = $('area'), old = sel.value;
    sel.innerHTML = '<option value="">All areas</option>' + ar.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    sel.value = ar.includes(old) ? old : '';
    $('chips').innerHTML = ['All areas', ...ar].map((a) => `<button class="chip ${(!activeArea && a === 'All areas') || activeArea === a ? 'active' : ''}" onclick="pickArea(${jsArg(a === 'All areas' ? '' : a)})">${esc(a)}</button>`).join('');
    filterHomes();
    $('guides').innerHTML = guides.map((g, i) => `<article class="guide"><span class="num">0${i + 1} / VIRGINIA &amp; MARYLAND</span><h3>${esc(g[0])}</h3><p>${esc(g[1])}</p><a href="${safeImage(g[2])}" target="_blank" rel="noopener">Explore local context ↗</a></article>`).join('');
  };
  window.filterHomes = function () {
    const min = Number($('minPrice').value) || 0, max = Number($('maxPrice').value) || Infinity;
    const area = $('area').value, type = $('type').value;
    filteredHomes = homes.filter((x) => (!area || x.area === area) && (!activeArea || x.area === activeArea) && x.price >= min && x.price <= max && (!type || x.type === type) && (!showingSaved || favorites.map(String).includes(String(x.id))));
    $('count').textContent = `${filteredHomes.length} ${filteredHomes.length === 1 ? 'home' : 'homes'}`;
    $('listings').innerHTML = filteredHomes.length ? filteredHomes.map((x) => `<article class="card" onclick="showDetail(${jsArg(x.id)})"><div class="photo">${x.image?`<img src="${safeImage(x.image)}" alt="${esc(x.title)}">`:`<div class="photo-placeholder">Photos coming soon</div>`}<span class="badge">${x.featured ? 'Featured' : esc(x.type)}</span><button class="heart ${favorites.map(String).includes(String(x.id)) ? 'saved' : ''}" aria-label="Save ${esc(x.title)}" onclick="event.stopPropagation();toggleFavorite(${jsArg(x.id)})">${favorites.map(String).includes(String(x.id)) ? '♥' : '♡'}</button><span class="availability">${esc(x.availability || 'Available')}</span></div><div class="cardbody"><div class="price">${money(x.price)} <small>· ${esc(x.type)}</small></div><div class="demo-tag">${publicDataAvailable && x.id && !starter.some((s) => String(s.id) === String(x.id)) ? 'Listing' : 'Demo listing'}</div><div class="address">${esc(x.address)}</div><div class="card-meta">${publicDataAvailable && x.updatedAt ? 'Updated ' + esc(x.updatedAt) : 'Sample property · demo only'}</div><div class="facts"><span><b>${esc(x.beds)}</b> beds</span><span><b>${esc(x.baths)}</b> baths</span><span><b>${Number(x.sqft).toLocaleString()}</b> sq ft</span><span>${esc(x.area)}</span></div></div></article>`).join('') : '<div class="empty">No homes match these filters. Try a wider price range or another neighborhood.</div>';
  };

  window.showDetail = function (id) {
    const x = homes.find((h) => String(h.id) === String(id)); if (!x) return;
    activePropertyId = /^[0-9a-f-]{36}$/i.test(String(x.id)) ? x.id : null;
    const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(x.address);
    $('detailBody').innerHTML = `<button class="close" onclick="closeOverlays()" aria-label="Close">×</button><div class="modalphoto">${x.image?`<img id="galleryMain" src="${safeImage(x.image)}" alt="${esc(x.title)}">`:`<div class="modal-placeholder">Photos coming soon</div>`}</div><div class="modalcontent"><div class="eyebrow">${esc(x.area)} · ${activePropertyId ? 'Listing' : 'Demo listing'}</div><h2>${esc(x.title)}</h2><div class="price">${money(x.price)} <small>· ${esc(x.type)}</small></div><p>${esc(x.address)}</p><div class="facts"><span><b>${esc(x.beds)}</b> beds</span><span><b>${esc(x.baths)}</b> baths</span><span><b>${Number(x.sqft).toLocaleString()}</b> sq ft</span></div><p>${esc(x.desc)}</p><div class="card-meta">${esc(x.availability || 'Available')} · ${activePropertyId && x.updatedAt ? 'Listing updated ' + esc(x.updatedAt) : 'Sample property · demo only'}</div><div class="gallery">${[x.image, ...(x.images || [])].filter(Boolean).map((src, i) => `<button onclick="document.getElementById('galleryMain').src=${jsArg(src)}"><img src="${safeImage(src)}" alt="${esc(x.title)} photo ${i + 1}"></button>`).join('')}</div><div class="amenities">${(x.amenities || []).map((a) => `<span>${esc(a)}</span>`).join('')}</div><a href="${esc(mapUrl)}" target="_blank" rel="noopener" class="btn" style="display:inline-block;text-decoration:none">View area map ↗</a> <button class="secondary" onclick="leadForm(${jsArg(x.title)})">Ask about this home</button></div>`;
    $('detail').classList.add('show');
  };

  const baseLeadForm = window.leadForm;
  window.leadForm = function (title = '') {
    if (!title) activePropertyId = null;
    baseLeadForm(title);
  };
  window.renderMap = function () {
    if (!window.L) { $('mapView').innerHTML = '<div class="map-fallback">Map tiles need an internet connection. <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap ↗</a></div>'; return; }
    if (!listingMap) {
      listingMap = L.map($('mapView')).setView([38.9072, -77.0369], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(listingMap);
    }
    listingMap.eachLayer((layer) => { if (layer instanceof L.Marker) listingMap.removeLayer(layer); });
    const centers = { 'Capitol Hill': [38.8855, -76.9967], 'Dupont Circle': [38.9096, -77.0434], Georgetown: [38.9097, -77.0654], Shaw: [38.9125, -77.0214], Brookland: [38.9344, -76.9947], 'Navy Yard': [38.8767, -77.0065], 'Columbia Heights': [38.928, -77.0325], 'Cleveland Park': [38.9347, -77.058] };
    const points = [];
    filteredHomes.forEach((x, i) => {
      const center = centers[x.area] || [38.9072, -77.0369], point = [center[0] + ((i % 3) - 1) * .002, center[1] + ((i % 2) - .5) * .003];
      points.push(point);
      L.marker(point).addTo(listingMap).bindPopup(`<b>${esc(x.title)}</b><br>${money(x.price)} · ${esc(x.area)}<br><small>Approximate location</small><br><a href="#" onclick="showDetail(${jsArg(x.id)});return false">View details</a>`);
    });
    if (points.length) listingMap.fitBounds(points, { padding: [35, 35], maxZoom: 13 });
  };

  window.toggleFavorite = function (id) {
    favorites = favorites.map(String).includes(String(id)) ? favorites.filter((x) => String(x) !== String(id)) : [...favorites, id];
    localStorage.setItem('dcFavorites', JSON.stringify(favorites)); filterHomes();
    $('savedCount').textContent = `${favorites.length} saved homes ♥ · All prices in USD`;
  };
  window.saveLead = async function (event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await supa.from('inquiries').insert({
      name: form.get('name'), email: form.get('email'), message: form.get('message') || '',
      tour_date: form.get('tourDate') || null, tour_time: form.get('tourTime') || null,
      property_id: activePropertyId
    });
    if (error) { toast('Your inquiry could not be sent. Please try again shortly.'); return; }
    closeOverlays(); event.currentTarget.reset(); activePropertyId = null;
    toast('Your inquiry was sent securely.');
  };

  window.stats = function () {
    const active = adminHomes.filter((x) => x.status === 'Active');
    $('stats').innerHTML = [['Active listings', active.length], ['Featured homes', active.filter((x) => x.featured).length], ['Inquiries', leads.length], ['Avg. asking price', active.length ? money(active.reduce((s, x) => s + x.price, 0) / active.length) : '—']].map((x) => `<div class="stat"><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('');
    $('leadCount').textContent = leads.length ? `(${leads.length})` : '';
  };
  window.showTab = function (tab, btn) {
    document.querySelectorAll('.admintabs button').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active'); else if (tab === 'properties') document.querySelector('.admintabs button').classList.add('active');
    stats(); const el = $('adminContent');
    if (tab === 'properties') {
      el.innerHTML = adminHomes.length ? `<div class="tablewrap"><table class="table"><thead><tr><th>Property</th><th>Area</th><th>Price</th><th>Status</th><th>Featured</th><th>Actions</th></tr></thead><tbody>${adminHomes.map((x) => `<tr><td><b>${esc(x.title)}</b><br><span style="color:#78857f">${esc(x.type)} · ${esc(x.beds)} bd · ${esc(x.baths)} ba</span></td><td>${esc(x.area)}</td><td>${money(x.price)}</td><td><span class="pill">${esc(x.status)}</span></td><td>${x.featured ? '✦ Yes' : '—'}</td><td><button onclick="editHome(${jsArg(x.id)})">Edit</button><button onclick="toggleFeatured(${jsArg(x.id)})">Feature</button><button onclick="toggleStatus(${jsArg(x.id)})">${x.status === 'Active' ? 'Archive' : 'Activate'}</button><button onclick="deleteHome(${jsArg(x.id)})">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No managed properties yet. Add your first listing to publish it to the site.</div>';
    } else if (tab === 'leads') {
      el.innerHTML = leads.length ? `<div class="leads">${leads.map((l) => `<div class="lead"><b>${esc(l.name)}</b> <span style="color:#75817c">· ${esc(l.date)}</span><p>${esc(l.email)}</p><p>${esc(l.message || 'No message provided.')}</p>${l.tourDate ? `<p><b>Tour request:</b> ${esc(l.tourDate)} · ${esc(l.tourTime || 'No time preference')}</p>` : ''}</div>`).join('')}</div>` : '<div class="empty">No inquiries yet.</div>';
    } else formHome();
  };

  window.formHome = function (x = {}) {
    $('adminContent').innerHTML = `<form onsubmit="saveHome(event,${jsArg(x.id || '')})"><div class="formgrid"><div class="field"><label>Listing title</label><input name="title" value="${esc(x.title)}" required maxlength="180"></div><div class="field"><label>Area</label><input name="area" value="${esc(x.area)}" list="areas" required maxlength="120"><datalist id="areas">${areas().map((a) => `<option value="${esc(a)}">`).join('')}</datalist></div><div class="field"><label>Street address</label><input name="address" value="${esc(x.address)}" required maxlength="240"></div><div class="field"><label>Price (USD)</label><input name="price" type="number" min="0" step="1" value="${esc(x.price ?? '')}" required></div><div class="field"><label>Property type</label><select name="type">${['Rowhouse', 'Condo', 'Detached', 'Townhouse'].map((t) => `<option ${x.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="field"><label>Status</label><select name="status">${['Active', 'Draft', 'Archived'].map((s) => `<option ${x.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="field"><label>Bedrooms</label><input name="beds" type="number" min="0" step="0.5" value="${esc(x.beds ?? 2)}"></div><div class="field"><label>Bathrooms</label><input name="baths" type="number" min="0" step="0.5" value="${esc(x.baths ?? 1)}"></div><div class="field"><label>Square feet</label><input name="sqft" type="number" min="0" step="1" value="${esc(x.sqft ?? 1000)}"></div><div class="field"><label>Cover image link</label><input name="image" type="url" value="${esc(x.image && /^https?:\/\//i.test(x.image) ? x.image : '')}" placeholder="https://…"></div><div class="field"><label>Or upload cover image</label><input name="coverFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif"></div><div class="field wide"><label>Gallery image links (comma-separated)</label><input name="images" value="${esc((x.images || []).filter((src) => /^https?:\/\//i.test(src)).join(', '))}" placeholder="https://… , https://…"></div><div class="field wide"><label>Or upload gallery images</label><input name="galleryFiles" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple><small class="upload-note">Choose up to 5 image files, max 3 MB each.</small></div><div class="field"><label>Availability</label><select name="availability">${['Available', 'Pending', 'Sold'].map((s) => `<option ${String(x.availability || 'Available') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="field wide"><label>Description</label><textarea name="desc" required maxlength="5000">${esc(x.desc)}</textarea></div><div class="field wide"><label>Amenities (comma-separated)</label><input name="amenities" value="${esc((x.amenities || []).join(', '))}" maxlength="1000" placeholder="Parking, garden, updated kitchen"></div><div class="field"><label><input name="featured" type="checkbox" ${x.featured ? 'checked' : ''} style="width:auto"> Feature this listing</label></div></div><div class="form-actions"><button type="button" class="secondary" onclick="showTab('properties')">Cancel</button><button class="btn">${x.id ? 'Save changes' : 'Add property'}</button></div></form>`;
  };

  async function uploadImage(file) {
    if (!file || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('Use a JPG, PNG, WebP, or AVIF image.');
    if (file.size > 3000000) throw new Error('Each image must be smaller than 3 MB.');
    const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100);
    const path = `${crypto.randomUUID()}/${Date.now()}-${name}`;
    const { error } = await supa.storage.from('property-images').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return supa.storage.from('property-images').getPublicUrl(path).data.publicUrl;
  }
  window.saveHome = async function (event, id) {
    event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"],button:not([type])'); button.disabled = true;
    const form = new FormData(event.currentTarget), old = adminHomes.find((x) => String(x.id) === String(id)) || {};
    const galleryFiles = form.getAll('galleryFiles').filter((file) => file?.size);
    if (galleryFiles.length > 5) { toast('Choose no more than 5 gallery files.'); button.disabled = false; return; }
    try {
      const coverFile = form.get('coverFile');
      const uploadedCover = coverFile?.size ? await uploadImage(coverFile) : '';
      const uploadedGallery = await Promise.all(galleryFiles.map(uploadImage));
      const linkedImages = String(form.get('images') || '').split(',').map((v) => v.trim()).filter((v) => /^https?:\/\//i.test(v));
      const linkedCover = String(form.get('image') || '').trim();
      const item = {
        ...old, title: form.get('title'), area: form.get('area'), address: form.get('address'), price: Number(form.get('price')),
        type: form.get('type'), status: form.get('status'), beds: Number(form.get('beds')), baths: Number(form.get('baths')),
        sqft: Number(form.get('sqft')), image: uploadedCover || linkedCover || old.image || '',
        images: [...linkedImages, ...(old.images || []).filter((src) => !/^https?:\/\//i.test(src)), ...uploadedGallery],
        availability: form.get('availability'), desc: form.get('desc'),
        amenities: String(form.get('amenities') || '').split(',').map((v) => v.trim()).filter(Boolean), featured: form.get('featured') === 'on'
      };
      const row = toDb(item); if (id) row.id = id;
      const { data, error } = await supa.from('properties').upsert(row).select('*').single();
      if (error) throw error;
      await loadAdminData();
      homes = homes.filter((x) => String(x.id) !== String(data.id));
      if (data.status === 'active') homes.unshift(fromDb(data));
      render(); toast(id ? 'Listing updated.' : 'Listing added to Supabase.'); showTab('properties');
    } catch (error) { toast(error.message || 'Could not save the listing.'); }
    finally { button.disabled = false; }
  };

  window.toggleFeatured = async function (id) {
    const x = adminHomes.find((p) => String(p.id) === String(id)); if (!x) return;
    const { error } = await supa.from('properties').update({ featured: !x.featured, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(error.message); return; }
    await loadAdminData(); homes = adminHomes.filter((p) => p.status === 'Active'); render(); showTab('properties');
  };
  window.toggleStatus = async function (id) {
    const x = adminHomes.find((p) => String(p.id) === String(id)); if (!x) return;
    const status = x.status === 'Active' ? 'archived' : 'active';
    const { error } = await supa.from('properties').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(error.message); return; }
    await loadAdminData(); homes = adminHomes.filter((p) => p.status === 'Active'); render(); showTab('properties');
  };
  window.deleteHome = async function (id) {
    if (!confirm('Permanently delete this property listing?')) return;
    const { error } = await supa.from('properties').delete().eq('id', id);
    if (error) { toast(error.message); return; }
    await loadAdminData(); homes = adminHomes.filter((p) => p.status === 'Active'); render(); showTab('properties'); toast('Listing deleted.');
  };
  window.editHome = function (id) { const home = adminHomes.find((x) => String(x.id) === String(id)); if (home) formHome(home); };

  prepareAdminUi();
  loadPublicListings();
})();

