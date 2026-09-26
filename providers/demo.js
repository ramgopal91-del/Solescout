const brands = {
  Nike: ['Air Max 90', 'Air Max 95', 'Air Max 97', 'Dunk Low', 'Air Force 1 Low', 'Vomero 5', 'Pegasus 41'],
  Jordan: ['Air Jordan 1 Retro High OG', 'Air Jordan 1 Low', 'Air Jordan 3 Retro', 'Air Jordan 4 Retro', 'Jordan 4 Military Black', 'Air Jordan 5 Retro', 'Air Jordan 11 Retro'],
  Adidas: ['Samba OG', 'Gazelle Indoor', 'Campus 00s', 'Handball Spezial', 'Ultraboost 5', 'Adizero Adios Pro 4'],
  'New Balance': ['9060', '550', '574', '2002R', '990v6', '1906R'],
  ASICS: ['Gel-Kayano 14', 'Gel-Nimbus 10.1', 'Gel-1130', 'Gel-NYC', 'GT-2160'],
  Puma: ['Speedcat OG', 'Suede Classic', 'Palermo', 'RS-X'], Reebok: ['Club C 85', 'Classic Leather', 'Question Mid'],
  Vans: ['Old Skool', 'Knu Skool', 'Authentic', 'Sk8-Hi'], Converse: ['Chuck 70', 'Run Star Hike', 'Weapon'],
  Salomon: ['XT-6', 'ACS Pro', 'XT-4'], HOKA: ['Clifton 10', 'Bondi 9', 'Speedgoat 6'],
  On: ['Cloud 5', 'Cloudmonster 2', 'Cloudsurfer'], Saucony: ['Shadow 6000', 'ProGrid Omni 9', 'Ride Millennium'],
  Mizuno: ['Wave Rider 28', 'Wave Prophecy LS']
};
const colors = ['Black/White', 'Triple White', 'Grey', 'Sail/Red', 'Navy', 'Green', 'Cream', 'Silver/Blue'];

function samples(q) {
  const terms = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  let id = 1;
  const results = [];
  for (const [brand, models] of Object.entries(brands)) for (const model of models) for (let variant = 0; variant < 2; variant++) {
    const current = id++;
    const colorway = colors[(current * 3) % colors.length];
    const skuStyleCode = `${brand.slice(0, 2).toUpperCase()}-${String(current).padStart(5, '0')}`;
    const productName = model.toLocaleLowerCase().includes(brand.toLocaleLowerCase()) ? model : `${brand} ${model}`;
    const searchFields = `${productName} ${brand} ${model} ${colorway} ${skuStyleCode}`.toLocaleLowerCase();
    if (!terms.every(term => searchFields.includes(term))) continue;
    const price = brand === 'Jordan' ? 150 + variant * 12 : ['HOKA', 'On'].includes(brand) ? 145 + variant * 10 : 105 + variant * 8;
    for (const [marketplace, country, mult, shipping, tax, delivery] of [
      ['Demo US Retailer', 'USA', 1, 25, .22, '8–14 days'], ['Demo UK Retailer', 'UK', 1.08, 20, .2, '8–13 days'],
      ['Demo EU Retailer', 'EU', 1.04, 24, .2, '10–16 days'], ['Demo Marketplace', 'USA', 1.18, 30, .23, '10–17 days'],
      ['Demo India Retailer', 'India', 1.55, 0, 0, '2–5 days']
    ]) {
      const sourcePrice = Math.round(price * mult);
      const estimatedLandedInr = Math.round((sourcePrice + shipping + (sourcePrice + shipping) * tax) * 84.5);
      const deliveryDays = delivery.match(/\d+/g).map(Number).reduce((sum, day) => sum + day, 0) / 2;
      results.push({
        id: `demo:${current}:${marketplace}`, productName, brand, model, skuStyleCode, colorway,
        imageUrl: null, listingUrl: null, marketplace, seller: null,
        country, sourceType: marketplace.includes('Marketplace') ? 'Marketplace' : 'Retail',
        currency: 'USD', price: sourcePrice, availableSizes: null,
        shipping: { amount: shipping, currency: 'USD', estimate: true },
        estimatedDutiesTaxesInr: Math.round((sourcePrice + shipping) * tax * 84.5), estimatedLandedInr,
        availability: 'sample', deliveryEstimate: delivery, deliveryDays, dataMode: 'development_fallback',
        sizeAvailabilitySource: null
      });
    }
  }
  return results;
}

export const demoProvider = {
  name: 'Development sample catalog', status: 'development_fallback',
  async search({ q }) { return { status: 'development_fallback', listings: samples(q) }; },
  async getProduct(id) {
    const listing = samples('').find(item => item.id === id);
    return { status: listing ? 'development_fallback' : 'not_found', listing: listing || null };
  }
};
