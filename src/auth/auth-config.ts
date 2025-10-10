import { UserManagerSettings } from "oidc-client-ts";

// Google OIDC config removed - Google auth now uses Google Identity Services
// See GoogleSignIn component in ~/components/GoogleSignIn.tsx

export const microsoftOidcConfig: UserManagerSettings = {
  authority: "https://login.microsoftonline.com/common",
  client_id: "YOUR_MICROSOFT_CLIENT_ID",
  redirect_uri: "http://localhost:3000/auth/callback/microsoft",
  scope: "openid profile email",
  response_type: "code",
};
