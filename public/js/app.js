const $ = selector => document.querySelector(selector);
const qInput = $('#q');
const grid = $('#grid');
const count = $('#count');
const dataNotice = $('#dataNotice');
const detailsModal = $('#detailsModal');
const detailsContent = $('#detailsContent');
const commonSizeFilters = ['UK 7','UK 8','UK 9','UK 10','UK 11','UK 12'];
const PAGE_SIZE = 48;
let currentListings = [];
let facetListings = [];
let requestNumber = 0;
let visibleLimit = PAGE_SIZE;

function money(amount, currency = 'INR') {
  if (amount == null || amount === '' || !Number.isFinite(Number(amount))) return 'Not provided';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount)); }
  catch { return `${currency} ${amount}`; }
}

function safeNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function searchableText(item) {
  return [item.productName, item.brand, item.model, item.skuStyleCode, item.colorway]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

function matchesQuery(item, query) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const text = searchableText(item);
  return terms.every(term => text.includes(term));
}

function normalize(value) { return String(value ?? '').trim().toLocaleLowerCase(); }
function normalizeCountry(value) {
  const country = normalize(value);
  if (['us','usa','united states'].includes(country)) return 'usa';
  if (['gb','uk','united kingdom'].includes(country)) return 'uk';
  if (['in','india'].includes(country)) return 'india';
  if (['eu','europe'].includes(country)) return 'eu';
  return country;
}

function applyFiltersAndSort() {
  const query = qInput.value;
  const brand = normalize($('#brand').value);
  const size = normalize($('#size').value);
  const type = normalize($('#type').value);
  const country = normalizeCountry($('#country').value);
  const marketplace = normalize($('#marketplace').value);
  const filtered = currentListings.filter(item => {
    if (!matchesQuery(item, query)) return false;
    if (brand && normalize(item.brand) !== brand) return false;
    if (size && (!Array.isArray(item.availableSizes) || !item.availableSizes.some(value => normalize(value) === size))) return false;
    if (type && normalize(item.sourceType) !== type) return false;
    if (country && normalizeCountry(item.country) !== country) return false;
    if (marketplace && normalize(item.marketplace) !== marketplace) return false;
    return true;
  });

  const key = $('#sort').value;
  const queryTerms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const relevance = item => {
    const name = normalize(item.productName);
    const brandName = normalize(item.brand);
    const model = normalize(item.model);
    return queryTerms.reduce((score, term) => score
      + (name === term ? 100 : name.startsWith(term) ? 30 : name.includes(term) ? 20 : 0)
      + (model === term ? 15 : model.includes(term) ? 10 : 0)
      + (brandName === term ? 12 : brandName.includes(term) ? 8 : 0)
      + (normalize(item.skuStyleCode).includes(term) ? 5 : 0), 0);
  };
  if (key === 'name') {
    return filtered.map((item, index) => ({ item, index }))
      .sort((a, b) => (a.item.productName || '').localeCompare(b.item.productName || '', undefined, { sensitivity: 'base', numeric: true }) || a.index - b.index)
      .map(entry => entry.item);
  }
  if (key === 'relevance' && queryTerms.length) {
    return filtered.map((item, index) => ({ item, index, score: relevance(item) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(entry => entry.item);
  }
  const field = key === 'lowest_price' ? 'price' : key === 'fastest_delivery' ? 'deliveryDays' : 'estimatedLandedInr';
  return filtered.map((item, index) => ({ item, index, value: safeNumber(item[field]) }))
    .sort((a, b) => {
      if (a.value == null && b.value == null) return a.index - b.index;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return a.value - b.value || a.index - b.index;
    }).map(entry => entry.item);
}

function updateFilterOptions(listings) {
  const definitions = [
    ['brand', 'All brands', listings.map(item => item.brand)],
    ['size', 'Any size', [...commonSizeFilters, ...listings.flatMap(item => Array.isArray(item.availableSizes) ? item.availableSizes : [])]],
    ['country', 'Any source country', listings.map(item => item.country)],
    ['type', 'All source types', listings.map(item => item.sourceType)],
    ['marketplace', 'Any marketplace/provider', listings.map(item => item.marketplace)]
  ];
  for (const [id, placeholder, candidates] of definitions) {
    const select = $(`#${id}`);
    const previous = select.value;
    const options = [...new Map(candidates.filter(value => value != null && String(value).trim()).map(value => [normalize(value), String(value)])).values()]
      .sort((a, b) => {
        if (id !== 'size') return a.localeCompare(b);
        const aSize = Number(a.match(/[\d.]+/)?.[0]);
        const bSize = Number(b.match(/[\d.]+/)?.[0]);
        return Number.isFinite(aSize) && Number.isFinite(bSize) ? aSize - bSize : a.localeCompare(b);
      });
    select.innerHTML = `<option value="">${placeholder}</option>` + options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    select.value = options.find(value => normalize(value) === normalize(previous)) || '';
  }
  const reportedSizes = listings.some(item => Array.isArray(item.availableSizes) && item.availableSizes.length > 0);
  $('#filterNote').textContent = reportedSizes
    ? ''
    : 'No current listing reports sizes. Size choices are filters only; a listing appears only when a source reports the selected size.';
}

function imagePlaceholder() {
  return '<div class="image-placeholder"><span aria-hidden="true">◇</span><strong>Image unavailable</strong><small>No representative product image</small></div>';
}

function listingImage(item) {
  return item.imageUrl
    ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.productName || 'Sneaker listing')}" loading="lazy">`
    : imagePlaceholder();
}

function listingCard(item) {
  const sample = item.dataMode === 'development_fallback';
  const price = item.price == null ? 'Price unavailable' : money(item.price, item.currency || 'USD');
  const landed = item.estimatedLandedInr == null ? 'Landed cost unavailable' : `${money(item.estimatedLandedInr)} estimated landed India cost`;
  const available = Array.isArray(item.availableSizes) ? item.availableSizes.join(', ') : 'Not provided';
  const detail = [item.brand, item.model, item.colorway, item.skuStyleCode].filter(Boolean).map(escapeHtml).join(' • ');
  const listingLink = item.listingUrl ? `<a class="button primary" href="${escapeHtml(item.listingUrl)}" target="_blank" rel="noopener noreferrer">View listing</a>` : '<button class="primary" disabled>Listing link unavailable</button>';
  return `<article class="card"><div class="shoe${item.imageUrl ? '' : ' no-image'}" data-image="${escapeHtml(item.imageUrl || '')}">${listingImage(item)}</div><div class="body"><div class="brandline">${escapeHtml(item.marketplace || 'Marketplace')}${sample ? ' • DEVELOPMENT SAMPLE' : ''}</div><div class="name">${escapeHtml(item.productName || 'Unnamed listing')}</div><div class="meta">${detail || 'Product details not provided'}${item.country ? ` • ${escapeHtml(item.country)}` : ''}</div><div class="price">${escapeHtml(price)}</div><div class="landed">${escapeHtml(landed)}</div><div class="rows"><div class="row"><span>Seller</span><b>${escapeHtml(item.seller || 'Not provided')}</b></div><div class="row"><span>Shipping</span><b>${item.shipping ? `${escapeHtml(money(item.shipping.amount, item.shipping.currency || item.currency || 'USD'))}${item.shipping.estimate ? ' (estimate)' : ''}` : 'Not provided'}</b></div><div class="row"><span>Delivery</span><b>${escapeHtml(item.deliveryEstimate || 'Not provided')}</b></div><div class="row"><span>Sizes</span><b>${escapeHtml(available)}</b></div><div class="row"><span>Availability</span><b>${escapeHtml(item.availability || 'unknown')}</b></div></div><div class="actions"><button data-details="${escapeHtml(item.id)}">Details</button>${listingLink}</div></div></article>`;
}

function renderListings() {
  const listings = applyFiltersAndSort();
  count.textContent = `${listings.length} listing${listings.length === 1 ? '' : 's'}`;
  grid.innerHTML = listings.length
    ? listings.slice(0, visibleLimit).map(listingCard).join('')
    : '<div class="empty">No listings match all of the selected criteria. Remove a filter or try another search.</div>';
  const remaining = listings.length - visibleLimit;
  const showMore = $('#showMore');
  showMore.hidden = remaining <= 0;
  showMore.textContent = `Show more listings (${remaining} remaining)`;
}

async function loadListings() {
  const thisRequest = ++requestNumber;
  const query = qInput.value.trim();
  visibleLimit = PAGE_SIZE;
  count.textContent = 'Searching…';
  try {
    const response = await fetch(`/api/search?${new URLSearchParams({ q: query })}`);
    const data = await response.json();
    if (thisRequest !== requestNumber) return;
    if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
    currentListings = Array.isArray(data.listings) ? data.listings : [];
    // Keep filter choices based on the full browse catalog so entering a narrow
    // search does not make the other filters appear to have no available values.
    if (!query && currentListings.length) facetListings = currentListings;
    updateFilterOptions(facetListings.length ? facetListings : currentListings);
    if (data.mode === 'development_fallback') {
      dataNotice.textContent = 'Development fallback catalog active. These generated sample offers are not live listings, do not represent current availability, and must not be used to make purchases.';
      dataNotice.classList.add('show');
    } else {
      const providerStatuses = (data.providers || []).map(provider => `${provider.provider}: ${provider.status}`).join(' • ');
      dataNotice.textContent = providerStatuses || 'Live marketplace data';
      dataNotice.classList.add('show');
    }
    renderListings();
  } catch (error) {
    if (thisRequest !== requestNumber) return;
    currentListings = [];
    updateFilterOptions(facetListings);
    count.textContent = 'Search unavailable';
    grid.innerHTML = `<div class="empty">${escapeHtml(error.message)}. Check that the SoleScout server is running.</div>`;
  }
}

function productDetails(item) {
  const productFacts = [
    ['Brand', item.brand], ['Model', item.model], ['SKU / style code', item.skuStyleCode], ['Colorway', item.colorway]
  ];
  const sourceFacts = [
    ['Marketplace / provider', item.marketplace], ['Source type', item.sourceType], ['Seller', item.seller],
    ['Source country', item.country], ['Availability', item.availability]
  ];
  const factRows = facts => facts.map(([label, value]) => `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || 'Not provided')}</dd></div>`).join('');
  const sizes = Array.isArray(item.availableSizes) ? item.availableSizes.join(', ') || 'No sizes reported' : 'Not provided by source';
  const shipping = item.shipping
    ? `${money(item.shipping.amount, item.shipping.currency || item.currency || 'USD')}${item.shipping.estimate ? ' (estimate)' : ''}`
    : 'Not provided';
  const productImage = item.imageUrl
    ? `<img class="details-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.productName || 'Sneaker listing')}">`
    : `<div class="details-image image-placeholder"><span aria-hidden="true">◇</span><strong>Image unavailable</strong><small>No representative product image</small></div>`;
  const url = item.listingUrl ? `<a href="${escapeHtml(item.listingUrl)}" target="_blank" rel="noopener noreferrer">Open source listing</a>` : 'No source listing link';
  const sample = item.dataMode === 'development_fallback' ? '<span class="details-sample">Development sample — not a live listing</span>' : '';
  return `${sample}<div class="details-layout">${productImage}<div class="details-main"><h2 id="detailsTitle">${escapeHtml(item.productName || 'Listing details')}</h2><section class="detail-section"><h3>Product information</h3><dl>${factRows(productFacts)}</dl></section><section class="detail-section"><h3>Listing and source</h3><dl>${factRows(sourceFacts)}<div class="detail-row"><dt>Source link</dt><dd>${url}</dd></div></dl></section><section class="detail-section"><h3>Price, shipping and delivery</h3><dl>${factRows([['Price', item.price == null ? null : money(item.price, item.currency || 'USD')], ['Shipping', shipping], ['Estimated duties and taxes', item.estimatedDutiesTaxesInr == null ? null : money(item.estimatedDutiesTaxesInr)], ['Estimated landed cost in INR', item.estimatedLandedInr == null ? null : money(item.estimatedLandedInr)], ['Delivery estimate', item.deliveryEstimate], ['Available sizes', sizes]])}</dl></section></div></div>`;
}

async function showDetails(id) {
  const listing = currentListings.find(item => item.id === id);
  if (!listing) return;
  detailsModal.classList.add('show');
  detailsModal.setAttribute('aria-hidden', 'false');
  detailsContent.innerHTML = '<p class="details-loading">Loading listing details…</p>';
  $('#closeDetails').focus();
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(id)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.status || result.error || 'Unable to load details');
    detailsContent.innerHTML = productDetails(result.listing || listing);
  } catch (error) {
    detailsContent.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function closeDetails() {
  detailsModal.classList.remove('show');
  detailsModal.setAttribute('aria-hidden', 'true');
}

function openImage(url) {
  if (!url) return;
  $('#modalImg').src = url;
  $('#imageModal').classList.add('show');
  $('#imageModal').setAttribute('aria-hidden', 'false');
}
function closeImage() { $('#imageModal').classList.remove('show'); $('#imageModal').setAttribute('aria-hidden', 'true'); }

$('#searchForm').addEventListener('submit', event => { event.preventDefault(); loadListings(); });
for (const selector of ['#size','#brand','#country','#type','#marketplace','#sort']) {
  $(selector).addEventListener('change', () => { visibleLimit = PAGE_SIZE; renderListings(); });
}
$('#showMore').addEventListener('click', () => { visibleLimit += PAGE_SIZE; renderListings(); });
grid.addEventListener('click', event => {
  const detailButton = event.target.closest('[data-details]');
  const image = event.target.closest('.shoe');
  if (detailButton) showDetails(detailButton.dataset.details);
  if (image?.dataset.image) openImage(image.dataset.image);
});
grid.addEventListener('error', event => {
  if (!event.target.matches('.shoe img')) return;
  const placeholder = document.createElement('div');
  placeholder.className = 'image-placeholder';
  placeholder.innerHTML = '<span aria-hidden="true">◇</span><strong>Image unavailable</strong><small>No representative product image</small>';
  event.target.replaceWith(placeholder);
}, true);
$('#closeDetails').addEventListener('click', closeDetails);
detailsModal.addEventListener('click', event => { if (event.target === detailsModal) closeDetails(); });
$('#closeImage').addEventListener('click', closeImage);
$('#imageModal').addEventListener('click', event => { if (event.target.id === 'imageModal') closeImage(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeDetails(); closeImage(); }
});
loadListings();
