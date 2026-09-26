export function createStockxProvider() {
  return {
    name: 'StockX',
    status: 'not_configured',
    async search() { return { status: 'not_configured', listings: [] }; },
    async getProduct() { return { status: 'not_configured', listing: null }; }
  };
}
