import { UserManagerSettings } from "oidc-client-ts";

export const googleOidcConfig: UserManagerSettings = {
  authority: "https://accounts.google.com",
  client_id: "921803215801-igjbc90peabavthblhsmo1da37bo9r4l.apps.googleusercontent.com",
  redirect_uri: "http://localhost:3000/auth/callback/google",
  scope: "openid profile email",
  response_type: "code",
  loadUserInfo: false,
  // Force PKCE and disable client authentication
  disablePKCE: false,
  // client_authentication: "none",
  // Explicitly use Google's well-known endpoints with proper client authentication
  // metadata: {
  //   issuer: "https://accounts.google.com",
  //   authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  //   token_endpoint: "https://oauth2.googleapis.com/token",
  //   userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
  //   jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
  //   revocation_endpoint: "https://oauth2.googleapis.com/revoke",
  //   end_session_endpoint: "https://accounts.google.com/logout",
  //   token_endpoint_auth_methods_supported: ["none"],
  // },
  // Remove client_id from token params since we're using PKCE
  // Disable automatic silent renewal for simplicity
  automaticSilentRenew: false,
  // userStore: new WebStorageStateStore({ store: window.localStorage }),
};

export const microsoftOidcConfig: UserManagerSettings = {
  authority: "https://login.microsoftonline.com/common",
  client_id: "YOUR_MICROSOFT_CLIENT_ID",
  redirect_uri: "http://localhost:3000/auth/callback/microsoft",
  scope: "openid profile email",
  response_type: "code",
};
