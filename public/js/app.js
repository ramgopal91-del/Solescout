const brands = ['Nike','Jordan','Adidas','New Balance','ASICS','Puma','Reebok','Vans','Converse','Salomon','HOKA','On','Saucony','Mizuno'];
const $ = selector => document.querySelector(selector);
const qInput = $('#q');
const grid = $('#grid');
const count = $('#count');
const dataNotice = $('#dataNotice');
let currentListings = [];
let requestNumber = 0;

for (const brand of brands) $('#brand').insertAdjacentHTML('beforeend', `<option>${brand}</option>`);

function money(amount, currency = 'INR') {
  if (!Number.isFinite(Number(amount))) return 'Not provided';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount}`; }
}

function params() {
  const query = new URLSearchParams({ q: qInput.value.trim(), sort: $('#sort').value });
  for (const [key, selector] of Object.entries({ size:'#size', brand:'#brand', country:'#country', type:'#type' })) {
    if ($(selector).value) query.set(key, $(selector).value);
  }
  return query;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function listingCard(item) {
  const sample = item.dataMode === 'development_fallback';
  const image = item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.productName || 'Sneaker listing')}" loading="lazy" onerror="this.parentElement.textContent='👟'">` : '👟';
  const price = item.price == null ? 'Price unavailable' : `${money(item.price, item.currency || 'USD')}${item.currency === 'INR' ? '' : ` <span class="subtle">${escapeHtml(item.currency || '')}</span>`}`;
  const landed = item.estimatedLandedInr == null ? 'Landed cost unavailable' : money(item.estimatedLandedInr);
  const available = Array.isArray(item.availableSizes) ? item.availableSizes.join(', ') : 'Size availability not provided';
  const detail = [item.brand, item.model, item.colorway, item.skuStyleCode].filter(Boolean).map(escapeHtml).join(' • ');
  const listingLink = item.listingUrl ? `<a href="${escapeHtml(item.listingUrl)}" target="_blank" rel="noopener noreferrer">View listing</a>` : '';
  return `<article class="card"><div class="shoe" data-image="${escapeHtml(item.imageUrl || '')}">${image}</div><div class="body"><div class="brandline">${escapeHtml(item.marketplace || 'Marketplace')}${sample ? ' • DEVELOPMENT SAMPLE' : ''}</div><div class="name">${escapeHtml(item.productName || 'Unnamed listing')}</div><div class="meta">${detail || 'Product details not supplied'}${item.country ? ` • ${escapeHtml(item.country)}` : ''}</div><div class="price">${price}</div><div class="landed">${landed}${item.estimatedLandedInr == null ? '' : ' estimated landed India cost'}</div><div class="rows"><div class="row"><span>Seller</span><b>${escapeHtml(item.seller || 'Not provided')}</b></div><div class="row"><span>Shipping</span><b>${item.shipping ? `${money(item.shipping.amount, item.shipping.currency || item.currency || 'USD')}${item.shipping.estimate ? ' (estimate)' : ''}` : 'Not provided'}</b></div><div class="row"><span>Delivery</span><b>${escapeHtml(item.deliveryEstimate || 'Not provided')}</b></div><div class="row"><span>Sizes</span><b>${escapeHtml(available)}</b></div><div class="row"><span>Availability</span><b>${escapeHtml(item.availability || 'unknown')}</b></div></div><div class="actions"><button data-details="${escapeHtml(item.id)}">Details</button>${listingLink ? `<a class="button primary" href="${escapeHtml(item.listingUrl)}" target="_blank" rel="noopener noreferrer">View listing</a>` : '<button class="primary" disabled>Listing link unavailable</button>'}</div></div></article>`;
}

async function loadListings() {
  const thisRequest = ++requestNumber;
  const query = params();
  if (!query.get('q')) { grid.innerHTML = '<div class="empty">Enter a sneaker name, model or style code to search.</div>'; count.textContent = ''; return; }
  count.textContent = 'Searching…';
  try {
    const response = await fetch(`/api/search?${query}`);
    const data = await response.json();
    if (thisRequest !== requestNumber) return;
    if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
    currentListings = data.listings || [];
    count.textContent = `${data.count} listing${data.count === 1 ? '' : 's'}`;
    if (data.mode === 'development_fallback') {
      dataNotice.textContent = 'Development fallback catalog active. These generated sample offers are not live listings, do not represent current availability, and must not be used to make purchases.';
      dataNotice.classList.add('show');
    } else {
      const providerStatuses = (data.providers || []).map(provider => `${provider.provider}: ${provider.status}`).join(' • ');
      dataNotice.textContent = providerStatuses || 'Live marketplace data';
      dataNotice.classList.add('show');
    }
    grid.innerHTML = currentListings.length ? currentListings.map(listingCard).join('') : `<div class="empty">No listings returned. ${data.status === 'not_configured' ? 'No marketplace providers are configured yet.' : 'Try a different search or remove filters.'}</div>`;
  } catch (error) {
    if (thisRequest !== requestNumber) return;
    currentListings = [];
    count.textContent = 'Search unavailable';
    grid.innerHTML = `<div class="empty">${escapeHtml(error.message)}. Check that the SoleScout server is running.</div>`;
  }
}

async function showDetails(id) {
  const panel = $('#details');
  const listing = currentListings.find(item => item.id === id);
  if (!listing) return;
  panel.classList.add('show');
  panel.innerHTML = '<p>Loading listing details…</p>';
  panel.scrollIntoView({ behavior: 'smooth' });
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(id)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.status || result.error || 'Unable to load details');
    const item = result.listing || listing;
    panel.innerHTML = `<h2>${escapeHtml(item.productName || 'Listing details')}</h2><p>${escapeHtml([item.brand,item.model,item.colorway,item.skuStyleCode].filter(Boolean).join(' • ') || 'Additional product details were not supplied by the provider.')}</p><div class="row"><span>Marketplace / seller</span><b>${escapeHtml(item.marketplace || 'Unknown')} / ${escapeHtml(item.seller || 'Not provided')}</b></div><div class="row"><span>Price</span><b>${item.price == null ? 'Not provided' : money(item.price, item.currency || 'USD')}</b></div><div class="row"><span>Delivery estimate</span><b>${escapeHtml(item.deliveryEstimate || 'Not provided')}</b></div><div class="row"><span>Estimated duties/taxes</span><b>${item.estimatedDutiesTaxesInr == null ? 'Not provided' : money(item.estimatedDutiesTaxesInr)}</b></div><div class="row"><span>Estimated landed cost</span><b>${item.estimatedLandedInr == null ? 'Not provided' : money(item.estimatedLandedInr)}</b></div><div class="row"><span>Available sizes</span><b>${escapeHtml(Array.isArray(item.availableSizes) ? item.availableSizes.join(', ') : 'Not provided')}</b></div><p class="notice">Values marked unavailable are not supplied or calculated from verified provider data.</p>`;
  } catch (error) { panel.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

function openImage(url) {
  if (!url) return;
  $('#modalImg').src = url;
  $('#imageModal').classList.add('show');
  $('#imageModal').setAttribute('aria-hidden', 'false');
}
function closeImage() { $('#imageModal').classList.remove('show'); $('#imageModal').setAttribute('aria-hidden', 'true'); }

$('#searchForm').addEventListener('submit', event => { event.preventDefault(); loadListings(); });
for (const selector of ['#size','#brand','#country','#type','#sort']) $(selector).addEventListener('change', loadListings);
$('#grid').addEventListener('click', event => {
  const detailButton = event.target.closest('[data-details]');
  const image = event.target.closest('.shoe');
  if (detailButton) showDetails(detailButton.dataset.details);
  if (image) openImage(image.dataset.image);
});
$('#closeImage').addEventListener('click', closeImage);
$('#imageModal').addEventListener('click', event => { if (event.target.id === 'imageModal') closeImage(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeImage(); });
loadListings();
