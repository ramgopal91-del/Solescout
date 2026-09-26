export function loadConfig(env = process.env) {
  const environment = env.EBAY_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';
  return {
    port: Number(env.PORT) || 3000,
    nodeEnv: env.NODE_ENV || 'development',
    demoFallback: env.DEMO_FALLBACK === 'true' && (env.NODE_ENV || 'development') !== 'production',
    ebay: {
      clientId: env.EBAY_CLIENT_ID || '',
      clientSecret: env.EBAY_CLIENT_SECRET || '',
      environment,
      marketplaceId: env.EBAY_MARKETPLACE_ID || 'EBAY_US'
    }
  };
}
