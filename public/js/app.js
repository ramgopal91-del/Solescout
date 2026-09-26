const $ = selector => document.querySelector(selector);
const qInput = $('#q');
const grid = $('#grid');
const count = $('#count');
const dataNotice = $('#dataNotice');
const detailsModal = $('#detailsModal');
const detailsContent = $('#detailsContent');
const commonSizeFilters = ['UK 7','UK 8','UK 9','UK 10','UK 11','UK 12'];
const PAGE_SIZE = 12;
const filterSelectors = ['#size','#brand','#country','#type','#marketplace'];
let currentListings = [];
let facetListings = [];
let requestNumber = 0;
let currentPage = 1;
let currentMode = null;
let sourcePage = 0;
let sourceHasMore = false;

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
    const confirmedSizes = Array.isArray(item.availableSizes) ? item.availableSizes : [];
    const reportedSizes = Array.isArray(item.reportedSizes) ? item.reportedSizes : Array.isArray(item.sizes) ? item.sizes : [];
    const sizeLabels = [...confirmedSizes, ...reportedSizes.map(value => typeof value === 'object' ? value.label : value)];
    if (size && !sizeLabels.some(value => normalize(value) === size)) return false;
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

function updateFilterOptions(listings, providerNames = []) {
  const definitions = [
    ['brand', 'All brands', listings.map(item => item.brand)],
    ['size', 'Any size', [...commonSizeFilters, ...listings.flatMap(item => [
      ...(Array.isArray(item.availableSizes) ? item.availableSizes : []),
      ...(Array.isArray(item.reportedSizes) ? item.reportedSizes : Array.isArray(item.sizes) ? item.sizes : []).map(size => typeof size === 'object' ? size.label : size)
    ])]],
    ['country', 'Any source country', listings.map(item => item.country)],
    ['type', 'All source types', listings.map(item => item.sourceType)],
    ['marketplace', 'Any marketplace/provider', [...listings.map(item => item.marketplace), ...providerNames]]
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
  const reportedSizes = listings.some(item => (Array.isArray(item.availableSizes) && item.availableSizes.length > 0)
    || (Array.isArray(item.reportedSizes) && item.reportedSizes.length > 0)
    || (Array.isArray(item.sizes) && item.sizes.length > 0));
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
  const liveRetailer = item.dataMode === 'live' && item.sourceType === 'Retail';
  const price = item.price == null ? 'Price unavailable' : money(item.price, item.currency || 'USD');
  const currencyNote = item.currencySource === 'inferred' ? ' • INR inferred from India merchant context' : '';
  const landed = item.estimatedLandedInr == null ? '' : `${money(item.estimatedLandedInr)} estimated landed India cost`;
  const confirmedSizes = Array.isArray(item.availableSizes) ? item.availableSizes : [];
  const reportedSizes = Array.isArray(item.reportedSizes) ? item.reportedSizes : Array.isArray(item.sizes) ? item.sizes : [];
  const available = [
    ...confirmedSizes.map(size => typeof size === 'object' ? size.label : size),
    ...reportedSizes.map(size => typeof size === 'object' ? size.label : size)
  ].filter(Boolean).join(', ') || 'Not provided';
  const sizeSummary = liveRetailer && reportedSizes.length
    ? `<div class="reported-sizes"><span>Reported sizes (availability unknown)</span><strong>${escapeHtml(available)}</strong></div>`
    : Array.isArray(item.availableSizes) && item.availableSizes.length
      ? `<div class="reported-sizes"><span>Available sizes</span><strong>${escapeHtml(available)}</strong></div>`
      : '';
  const detail = [item.brand, item.model, item.colorway, item.skuStyleCode].filter(Boolean).map(escapeHtml).join(' • ');
  const listingLink = item.listingUrl ? `<a class="button primary" href="${escapeHtml(item.listingUrl)}" target="_blank" rel="noopener noreferrer">View listing</a>` : '<button class="primary" disabled>Listing link unavailable</button>';
  const stockNote = liveRetailer ? '<span class="stock-note">Stock status not provided by retailer</span>' : '';
  const secondaryOfferInfo = [
    item.shipping ? `<span>Shipping ${escapeHtml(money(item.shipping.amount, item.shipping.currency || item.currency || 'USD'))}${item.shipping.estimate ? ' estimated' : ''}</span>` : '',
    item.deliveryEstimate ? `<span>Delivery ${escapeHtml(item.deliveryEstimate)}</span>` : '',
    landed ? `<span>${escapeHtml(landed)}</span>` : ''
  ].filter(Boolean).join('');
  return `<article class="card"><div class="shoe${item.imageUrl ? '' : ' no-image'}" data-image="${escapeHtml(item.imageUrl || '')}">${listingImage(item)}</div><div class="body"><div class="card-source">${sample ? '<strong class="source-badge demo-badge">DEMO</strong>' : liveRetailer ? '<strong class="source-badge retailer-badge">LIVE RETAILER</strong>' : `<strong class="source-badge provider-badge">${escapeHtml(item.sourceType || 'LISTING')}</strong>`}<span class="brandline">${escapeHtml(item.merchant || item.marketplace || 'Retailer')}</span></div><h2 class="name">${escapeHtml(item.productName || 'Unnamed listing')}</h2><div class="meta">${detail || 'Product details not provided'}${item.country ? ` <span aria-hidden="true">·</span> ${escapeHtml(item.country)}` : ''}</div><div class="price">${escapeHtml(price)}</div>${currencyNote ? `<div class="currency-note">${escapeHtml(currencyNote.replace(/^ • /, ''))}</div>` : ''}${sizeSummary}${stockNote}${secondaryOfferInfo ? `<div class="secondary-offer-info">${secondaryOfferInfo}</div>` : ''}<div class="actions"><button class="details-action" data-details="${escapeHtml(item.id)}">Details</button>${listingLink}</div></div></article>`;
}

function renderListings() {
  const filteredListings = applyFiltersAndSort();
  const listings = $('#showDemo').checked
    ? filteredListings
    : filteredListings.filter(item => item.dataMode !== 'development_fallback');
  count.textContent = `${listings.length} listing${listings.length === 1 ? '' : 's'}`;
  const pageCount = Math.max(1, Math.ceil(listings.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount);
  grid.innerHTML = listings.length
    ? listings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(listingCard).join('')
    : currentMode === 'development_fallback' && !$('#showDemo').checked
      ? qInput.value.trim()
        ? '<div class="empty"><span class="empty-mark" aria-hidden="true">⌕</span><h2>No live listings in these results</h2><p>Try a broader product search, or include DEMO samples to preview the interface.</p><small>No match in our current retailer sources doesn’t mean the product is unavailable elsewhere.</small></div>'
        : '<div class="empty"><span class="empty-mark" aria-hidden="true">⌕</span><h2>Search live retailer products</h2><p>Choose a popular search to see current results from connected retailers.</p><div class="quick-searches"><button type="button" data-search-query="Nike Air Force 1">Nike Air Force 1</button><button type="button" data-search-query="adidas Samba">adidas Samba</button><button type="button" data-search-query="New Balance 9060">New Balance 9060</button><button type="button" data-search-query="Nike Dunk Low">Nike Dunk Low</button></div><small>Searches with no live match won’t be replaced by demo products unless you opt in.</small></div>'
      : '<div class="empty"><span class="empty-mark" aria-hidden="true">⌕</span><h2>No matching sneakers found</h2><p>Try a broader model or brand name, or adjust your filters.</p><small>No match in our current retailer sources doesn’t mean the product is unavailable elsewhere.</small></div>';
  const pagination = $('#pagination');
  const livePages = currentMode === 'live';
  pagination.hidden = livePages ? sourcePage === 0 && !sourceHasMore : pageCount <= 1;
  $('#pageInfo').textContent = livePages ? `Page ${sourcePage + 1}` : `Page ${currentPage} of ${pageCount}`;
  $('#previousPage').disabled = livePages ? sourcePage <= 0 : currentPage <= 1;
  $('#nextPage').disabled = livePages ? !sourceHasMore : currentPage >= pageCount;
  $('#clearFilters').hidden = !qInput.value.trim() && !filterSelectors.some(selector => $(selector).value);
}

async function loadListings(page = 0) {
  const thisRequest = ++requestNumber;
  const query = qInput.value.trim();
  sourcePage = Math.max(0, page);
  currentPage = 1;
  count.textContent = 'Searching…';
  try {
    const params = new URLSearchParams({
      q: query, page: sourcePage, brand: $('#brand').value, size: $('#size').value,
      country: $('#country').value, type: $('#type').value, marketplace: $('#marketplace').value,
      sort: $('#sort').value
    });
    const response = await fetch(`/api/search?${params}`);
    const data = await response.json();
    if (thisRequest !== requestNumber) return;
    if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
    currentListings = Array.isArray(data.listings) ? data.listings : [];
    currentMode = data.mode || null;
    sourceHasMore = Boolean(data.hasMore);
    // Keep filter choices based on the full browse catalog so entering a narrow
    // search does not make the other filters appear to have no available values.
    if (!query && currentListings.length) {
      facetListings = [...new Map([...facetListings, ...currentListings].map(item => [item.id, item])).values()];
    }
    const providerNames = (data.providers || []).filter(provider => ['live', 'not_searched'].includes(provider.status)).map(provider => provider.provider);
    updateFilterOptions([...facetListings, ...currentListings], providerNames);
    if (data.mode === 'development_fallback') {
      dataNotice.textContent = $('#showDemo').checked
        ? 'DEMO samples are shown. These generated offers are not live listings, do not represent current availability, and must not be used to make purchases.'
        : query
          ? 'No live listings matched this search. DEMO samples are hidden; include them only if you want to preview the interface.'
          : 'Search for a product to load live retailer listings. DEMO samples are hidden unless you choose to include them.';
      dataNotice.classList.add('show');
    } else {
      const hasRetailerListings = currentListings.some(item => item.dataMode === 'live' && item.sourceType === 'Retail');
      const hasOtherLiveListings = currentListings.some(item => item.dataMode === 'live');
      if (hasRetailerListings) {
        dataNotice.textContent = 'Live retailer products are shown below. Confirm size availability and final price on the retailer product page.';
        dataNotice.classList.add('show');
      } else if (hasOtherLiveListings) {
        dataNotice.textContent = 'Live listings from connected sources are shown below. Confirm final details with the seller.';
        dataNotice.classList.add('show');
      } else {
        dataNotice.textContent = '';
        dataNotice.classList.remove('show');
      }
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
  const confirmedSizes = Array.isArray(item.availableSizes) ? item.availableSizes : [];
  const reportedSizes = Array.isArray(item.reportedSizes) ? item.reportedSizes : Array.isArray(item.sizes) ? item.sizes : [];
  const sizes = confirmedSizes.length
    ? confirmedSizes.join(', ')
    : reportedSizes.length
      ? `${reportedSizes.map(size => `${size.label}${size.price == null ? '' : ` (${money(size.price, size.currency || item.currency || 'INR')}${size.currencySource === 'inferred' ? ' — currency inferred' : ''})`}`).join(', ')} — reported by merchant; availability unknown`
      : 'Not provided by source';
  const shipping = item.shipping
    ? `${money(item.shipping.amount, item.shipping.currency || item.currency || 'USD')}${item.shipping.estimate ? ' (estimate)' : ''}`
    : 'Not provided';
  const productImage = item.imageUrl
    ? `<img class="details-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.productName || 'Sneaker listing')}">`
    : `<div class="details-image image-placeholder"><span aria-hidden="true">◇</span><strong>Image unavailable</strong><small>No representative product image</small></div>`;
  const url = item.listingUrl ? `<a class="detail-buy" href="${escapeHtml(item.listingUrl)}" target="_blank" rel="noopener noreferrer">View listing at ${escapeHtml(item.merchant || item.marketplace || 'retailer')} <span aria-hidden="true">↗</span></a>` : 'No source listing link';
  const sample = item.dataMode === 'development_fallback' ? '<span class="details-sample">DEMO — development sample, not a live listing</span>' : '';
  const liveRetailer = item.dataMode === 'live' && item.sourceType === 'Retail' ? `<span class="details-sample retailer-detail-badge">LIVE RETAILER — ${escapeHtml(item.merchant || item.marketplace || 'Merchant')}</span>` : '';
  const currencyLabel = item.currencySource === 'inferred' ? `${item.currency || 'INR'} (inferred from India merchant context)` : item.currency || 'Not provided';
  const priceDisplay = item.price == null ? null : `${money(item.price, item.currency || 'INR')} — currency ${currencyLabel}`;
  return `${sample}${liveRetailer}<div class="details-layout">${productImage}<div class="details-main"><h2 id="detailsTitle">${escapeHtml(item.productName || 'Listing details')}</h2><p class="details-merchant">${escapeHtml(item.merchant || item.marketplace || 'Source')}</p><div class="details-price">${escapeHtml(priceDisplay || 'Price not provided')}</div>${item.currencySource === 'inferred' ? '<p class="currency-note">Currency inferred from India merchant context</p>' : ''}<section class="detail-section"><h3>Reported sizes</h3><p class="details-size-copy">${escapeHtml(sizes)}</p>${!confirmedSizes.length && reportedSizes.length ? '<p class="stock-note">Stock status not provided by retailer. Confirm size availability on the product page.</p>' : ''}</section><section class="detail-section"><h3>Product information</h3><dl>${factRows(productFacts)}</dl></section><section class="detail-section"><h3>Listing and source</h3><dl>${factRows([['Source type', item.sourceType], ['Seller', item.seller], ['Source country', item.country], ['Availability', liveRetailer && !item.availability ? 'Not provided by retailer' : item.availability]])}</dl></section><section class="detail-section"><h3>Price, shipping and delivery</h3><dl>${factRows([['Shipping', shipping], ['Estimated duties and taxes', item.estimatedDutiesTaxesInr == null ? null : money(item.estimatedDutiesTaxesInr)], ['Estimated landed cost in INR', item.estimatedLandedInr == null ? null : money(item.estimatedLandedInr)], ['Delivery estimate', item.deliveryEstimate]])}</dl></section>${url !== 'No source listing link' ? `<div class="detail-cta">${url}</div>` : ''}</div></div>`;
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
for (const selector of [...filterSelectors, '#sort']) {
  $(selector).addEventListener('change', () => {
    currentPage = 1;
    if (currentMode === 'live') loadListings(0);
    else renderListings();
  });
}
$('#clearFilters').addEventListener('click', () => {
  qInput.value = '';
  for (const selector of filterSelectors) $(selector).value = '';
  currentPage = 1;
  loadListings(0);
});
$('#showDemo').addEventListener('change', () => { currentPage = 1; renderListings();
  if (currentMode === 'development_fallback') {
    dataNotice.textContent = $('#showDemo').checked
      ? 'DEMO samples are shown. These generated offers are not live listings, do not represent current availability, and must not be used to make purchases.'
      : qInput.value.trim()
        ? 'No live listings matched this search. DEMO samples are hidden; include them only if you want to preview the interface.'
        : 'Search for a product to load live retailer listings. DEMO samples are hidden unless you choose to include them.';
  }
});
$('#previousPage').addEventListener('click', () => {
  if (currentMode === 'live') { if (sourcePage > 0) loadListings(sourcePage - 1); }
  else if (currentPage > 1) { currentPage--; renderListings(); }
});
$('#nextPage').addEventListener('click', () => {
  if (currentMode === 'live') { if (sourceHasMore) loadListings(sourcePage + 1); }
  else {
    const pageCount = Math.ceil(applyFiltersAndSort().length / PAGE_SIZE);
    if (currentPage < pageCount) { currentPage++; renderListings(); }
  }
});
grid.addEventListener('click', event => {
  const quickSearch = event.target.closest('[data-search-query]');
  if (quickSearch) {
    qInput.value = quickSearch.dataset.searchQuery;
    loadListings();
    return;
  }
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
