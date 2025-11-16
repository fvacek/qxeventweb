import { UserManagerSettings } from "oidc-client-ts";

// Google OIDC config removed - Google auth now uses Google Identity Services
// See GoogleSignIn component in ~/components/GoogleSignIn.tsx

// Microsoft OIDC config for traditional OIDC flow (if needed)
// Note: The new MicrosoftSignIn component uses MSAL.js directly instead
// See MicrosoftSignIn component in ~/components/MicrosoftSignIn.tsx
export const microsoftOidcConfig: UserManagerSettings = {
  authority: "https://login.microsoftonline.com/common",
  client_id: "91558390-82a8-4607-8a39-29046dbe3a14", // Replace with your Azure AD app client ID
  redirect_uri: "http://localhost:3000/auth/callback/microsoft",
  scope: "openid profile email",
  response_type: "code",
};

// Microsoft MSAL configuration (used by microsoft-auth.ts service)
// To configure Microsoft auth, update the clientId in microsoft-auth.ts
// or use microsoftAuthService.updateConfig({ clientId: "your-client-id" })
