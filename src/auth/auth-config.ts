import { UserManagerSettings } from "oidc-client-ts";

export const googleOidcConfig: UserManagerSettings = {
  authority: "https://accounts.google.com",
  client_id: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  redirect_uri: "http://localhost:3000/auth/callback/google",
  scope: "openid profile email",
  response_type: "code",
};

export const microsoftOidcConfig: UserManagerSettings = {
  authority: "https://login.microsoftonline.com/common",
  client_id: "YOUR_MICROSOFT_CLIENT_ID",
  redirect_uri: "http://localhost:3000/auth/callback/microsoft",
  scope: "openid profile email",
  response_type: "code",
};
