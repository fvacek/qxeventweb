import { Component, createSignal, For } from "solid-js";
import { microsoftAuthService } from "~/auth/microsoft-auth";

interface TenantOption {
  id: string;
  name: string;
  description: string;
  value: 'consumers' | 'organizations' | 'common';
}

const MicrosoftAuthTroubleshoot: Component = () => {
  const [isLoading, setIsLoading] = createSignal(false);
  const [result, setResult] = createSignal<string>("");
  const [error, setError] = createSignal<string>("");
  const [currentConfig, setCurrentConfig] = createSignal<any>(null);

  const tenantOptions: TenantOption[] = [
    {
      id: "consumers",
      name: "Personal Accounts",
      description: "Hotmail, Outlook.com, Xbox Live accounts",
      value: "consumers"
    },
    {
      id: "organizations", 
      name: "Work/School Accounts",
      description: "Azure AD work or school accounts",
      value: "organizations"
    },
    {
      id: "common",
      name: "Both Personal & Work/School",
      description: "Any Microsoft account (requires special setup)",
      value: "common"
    }
  ];

  const testTenantConfiguration = async (tenantType: 'consumers' | 'organizations' | 'common') => {
    setIsLoading(true);
    setError("");
    setResult("");

    try {
      // Configure the tenant type
      microsoftAuthService.setTenantType(tenantType);
      setResult(`✅ Successfully configured for ${tenantType} tenant type`);
      
      // Test sign-in
      const user = await microsoftAuthService.signInWithPopup();
      if (user) {
        setResult(prev => prev + `\n✅ Sign-in successful for user: ${user.name} (${user.email})`);
      }
    } catch (error: any) {
      console.error("Test failed:", error);
      
      if (error.message?.includes("AADSTS90019")) {
        setError("❌ AADSTS90019: Still getting tenant error. Try a different tenant type or check your app registration.");
      } else if (error.message?.includes("AADSTS50011")) {
        setError("❌ AADSTS50011: Redirect URI mismatch. Check your Azure AD app registration redirect URIs.");
      } else if (error.message?.includes("AADSTS700016")) {
        setError("❌ AADSTS700016: Application not found. Check your client ID.");
      } else if (error.message?.includes("user_cancelled")) {
        setResult("ℹ️ User cancelled the sign-in process");
      } else {
        setError(`❌ Error: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentConfiguration = () => {
    const user = microsoftAuthService.getCurrentUser();
    setCurrentConfig({
      hasCurrentUser: !!user,
      currentUser: user,
      timestamp: new Date().toISOString()
    });
  };

  const copyConfiguration = () => {
    const config = `
// Microsoft Authentication Configuration
import { microsoftAuthService } from "~/auth/microsoft-auth";

// Update client ID (replace with your actual client ID)
microsoftAuthService.updateConfig({
  clientId: "YOUR_ACTUAL_CLIENT_ID"
});

// Set tenant type based on your Azure AD app registration
microsoftAuthService.setTenantType('consumers'); // or 'organizations' or 'common'
`;
    navigator.clipboard.writeText(config.trim());
    setResult("📋 Configuration code copied to clipboard!");
  };

  return (
    <div class="max-w-4xl mx-auto p-6 space-y-6">
      <div class="bg-white shadow-lg rounded-lg p-6">
        <h2 class="text-2xl font-bold mb-4 text-gray-900">
          Microsoft Authentication Troubleshoot
        </h2>
        
        <div class="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <div class="flex">
            <div class="shrink-0">
              <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-yellow-800">
                Common Issue: AADSTS90019 Error
              </h3>
              <div class="mt-2 text-sm text-yellow-700">
                <p>This error means no tenant information was found. Use the buttons below to test different tenant configurations.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-lg font-medium text-gray-900">Test Tenant Configurations</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <For each={tenantOptions}>
              {(option) => (
                <div class="border border-gray-200 rounded-lg p-4">
                  <h4 class="font-medium text-gray-900 mb-2">{option.name}</h4>
                  <p class="text-sm text-gray-600 mb-3">{option.description}</p>
                  <button
                    onClick={() => testTenantConfiguration(option.value)}
                    disabled={isLoading()}
                    class="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading() ? "Testing..." : `Test ${option.name}`}
                  </button>
                </div>
              )}
            </For>
          </div>

          <div class="border-t pt-4">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Diagnostic Tools</h3>
            
            <div class="flex space-x-4">
              <button
                onClick={getCurrentConfiguration}
                class="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
              >
                Check Current Config
              </button>
              
              <button
                onClick={copyConfiguration}
                class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                Copy Config Code
              </button>
            </div>
          </div>

          {/* Results Display */}
          {result() && (
            <div class="bg-green-50 border border-green-200 rounded-md p-4">
              <pre class="text-sm text-green-800 whitespace-pre-wrap">{result()}</pre>
            </div>
          )}

          {/* Error Display */}
          {error() && (
            <div class="bg-red-50 border border-red-200 rounded-md p-4">
              <pre class="text-sm text-red-800 whitespace-pre-wrap">{error()}</pre>
            </div>
          )}

          {/* Current Config Display */}
          {currentConfig() && (
            <div class="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h4 class="font-medium text-blue-900 mb-2">Current Configuration</h4>
              <pre class="text-sm text-blue-800 whitespace-pre-wrap">
                {JSON.stringify(currentConfig(), null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Setup Instructions */}
        <div class="mt-8 border-t pt-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Setup Checklist</h3>
          
          <div class="space-y-3">
            <div class="flex items-start">
              <div class="shrink-0 mt-1">
                <div class="h-2 w-2 bg-blue-600 rounded-full"></div>
              </div>
              <div class="ml-3">
                <p class="text-sm text-gray-700">
                  <strong>Azure AD App Registration:</strong> Create a Single Page Application (SPA) in Azure Portal
                </p>
              </div>
            </div>
            
            <div class="flex items-start">
              <div class="shrink-0 mt-1">
                <div class="h-2 w-2 bg-blue-600 rounded-full"></div>
              </div>
              <div class="ml-3">
                <p class="text-sm text-gray-700">
                  <strong>Redirect URI:</strong> Add <code class="bg-gray-100 px-2 py-1 rounded text-xs">{window.location.origin}</code> as SPA redirect URI
                </p>
              </div>
            </div>
            
            <div class="flex items-start">
              <div class="shrink-0 mt-1">
                <div class="h-2 w-2 bg-blue-600 rounded-full"></div>
              </div>
              <div class="ml-3">
                <p class="text-sm text-gray-700">
                  <strong>Client ID:</strong> Copy Application (client) ID from Azure AD and update in microsoft-auth.ts
                </p>
              </div>
            </div>
            
            <div class="flex items-start">
              <div class="shrink-0 mt-1">
                <div class="h-2 w-2 bg-blue-600 rounded-full"></div>
              </div>
              <div class="ml-3">
                <p class="text-sm text-gray-700">
                  <strong>Account Types:</strong> Choose the correct "Supported account types" based on your needs
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div class="mt-6 pt-4 border-t">
          <h4 class="text-sm font-medium text-gray-900 mb-2">Quick Links</h4>
          <div class="flex space-x-4 text-sm">
            <a 
              href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" 
              target="_blank" 
              rel="noopener noreferrer"
              class="text-blue-600 hover:text-blue-800"
            >
              Azure AD App Registrations →
            </a>
            <a 
              href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app" 
              target="_blank" 
              rel="noopener noreferrer"
              class="text-blue-600 hover:text-blue-800"
            >
              Microsoft Docs →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MicrosoftAuthTroubleshoot;