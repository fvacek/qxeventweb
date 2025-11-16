import { Component } from "solid-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import GoogleSignIn from "~/components/GoogleSignIn";
import LocalMicrosoftSignIn from "~/components/LocalMicrosoftSignIn";
import type { AuthUser } from "~/context/AuthContext";
import { createSignal } from "solid-js";

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoginDialog: Component<LoginDialogProps> = (props) => {
  const [tenantType, setTenantType] = createSignal<'consumers' | 'organizations'>('consumers');
  const [showSetupHelp, setShowSetupHelp] = createSignal(false);

  const handleGoogleSuccess = (user: AuthUser) => {
    console.log('Login successful:', user);
    props.onClose();
  };

  const handleGoogleError = (error: Error) => {
    console.error('Login failed:', error);
  };

  const handleMicrosoftSuccess = (user: AuthUser) => {
    console.log('Microsoft login successful:', user);
    props.onClose();
  };

  const handleMicrosoftError = (error: Error) => {
    console.error('Microsoft login failed:', error);
    if (error.message.includes('unauthorized_client')) {
      setShowSetupHelp(true);
    }
  };
  return (
    <Dialog open={props.isOpen} onOpenChange={props.onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Login</DialogTitle>
          <DialogDescription>
            Choose a provider to log in with.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <GoogleSignIn
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            buttonText="signin_with"
            theme="outline"
            size="large"
          />

          {/* Tenant Type Switcher */}
          <div class="bg-gray-50 border border-gray-200 rounded-md p-3">
            <div class="text-sm text-gray-700 mb-2">
              <span class="font-medium">Account Type:</span>
            </div>
            <div class="flex space-x-3">
              <label class="flex items-center">
                <input
                  type="radio"
                  name="tenantType"
                  value="consumers"
                  checked={tenantType() === 'consumers'}
                  onChange={() => setTenantType('consumers')}
                  class="mr-2"
                />
                <span class="text-sm">Personal (Hotmail, Outlook.com)</span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  name="tenantType"
                  value="organizations"
                  checked={tenantType() === 'organizations'}
                  onChange={() => setTenantType('organizations')}
                  class="mr-2"
                />
                <span class="text-sm">Work/School</span>
              </label>
            </div>
          </div>

          <LocalMicrosoftSignIn
            onSuccess={handleMicrosoftSuccess}
            onError={handleMicrosoftError}
            buttonText={`Sign in with Microsoft ${tenantType() === 'consumers' ? '(Personal)' : '(Work/School)'}`}
            clientId="91558390-82a8-4607-8a39-29046dbe3a14"
            tenantType={tenantType()}
            redirectUri={typeof window !== 'undefined' ? `${window.location.origin}/` : undefined}
          />

          {/* Configuration Help */}
          {showSetupHelp() && (
            <div class="bg-red-50 border border-red-200 rounded-md p-4">
              <div class="flex">
                <svg class="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 class="text-sm font-medium text-red-800 mb-2">Azure AD Setup Required</h4>
                  <div class="text-sm text-red-700 space-y-2">
                    <p>Your Azure AD app needs to be configured for {tenantType() === 'consumers' ? 'personal Microsoft accounts' : 'work/school accounts'}:</p>
                    <ol class="list-decimal list-inside space-y-1">
                      <li>Go to <a href="https://portal.azure.com" target="_blank" class="underline">Azure Portal</a></li>
                      <li>Create a new App Registration with:</li>
                      <li class="ml-4">• Supported account types: "{tenantType() === 'consumers' ? 'Personal Microsoft accounts only' : 'Accounts in this organizational directory only'}"</li>
                      <li class="ml-4">• Platform: Single-page application (SPA)</li>
                      <li class="ml-4">• Redirect URI: <code class="bg-red-100 px-1 rounded">{typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/'}</code></li>
                      <li>Copy the Client ID and replace "YOUR_MICROSOFT_CLIENT_ID" in the code</li>
                    </ol>
                  </div>
                  <button
                    onClick={() => setShowSetupHelp(false)}
                    class="mt-2 text-xs text-red-600 hover:text-red-800"
                  >
                    × Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Setup Links */}
          <div class="text-center pt-2">
            <button
              onClick={() => setShowSetupHelp(!showSetupHelp())}
              class="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Need help setting up Azure AD?
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
