// Test-only env shared by the mock Store API and the Next server under e2e. Not real credentials.
export const MOCK_PORT = 4010;
export const APP_PORT = 3100;
export const testEnv = {
  SHOPWARE_STORE_API_URL: `http://127.0.0.1:${MOCK_PORT}`,
  SHOPWARE_SW_ACCESS_KEY: "SWSCE2ETESTACCESSKEY",
  PERSONA_RETAIL_EMAIL: "retail.rider@example.com",
  PERSONA_RETAIL_PASSWORD: "e2e-retail-pw",
  PERSONA_DEALER_ADMIN_EMAIL: "dealer.admin@example.com",
  PERSONA_DEALER_ADMIN_PASSWORD: "e2e-admin-pw",
  PERSONA_DEALER_JUNIOR_EMAIL: "junior.buyer@example.com",
  PERSONA_DEALER_JUNIOR_PASSWORD: "e2e-junior-pw",
  DEMO_PASSWORD: "e2e-demo-password",
  DEMO_COOKIE_SECRET: "e2e-cookie-secret-0123456789abcdefghijklmnop",
  MOCK_STORE_API_PORT: String(MOCK_PORT),
};
