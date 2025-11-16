import { Component, createSignal, onMount } from "solid-js";

const RedirectUriHelper: Component = () => {
  const [currentUri, setCurrentUri] = createSignal("");
  const [suggestedUris, setSuggestedUris] = createSignal<string[]>([]);
  const [copied, setCopied] = createSignal("");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(""), 2000);
    });
  };

  const openAzurePortal = () => {
    window.open("https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", "_blank");
  };

  onMount(() => {
    const origin = window.location.origin;
    const href = window.location.href;
    setCurrentUri(origin);
    
    const suggestions = [
      origin,
      `${origin}/`,
      `${origin}/auth/callback`,
      `${origin}/auth/callback/microsoft`,
      `${origin}/login/callback`,
      href,
    ];
    
    setSuggestedUris([...new Set(suggestions)]); // Remove duplicates
  });

  return (
    <div class="max-w-4xl mx-auto p-6 bg-white shadow-lg rounded-lg">
      <div class="flex items-center mb-6">
        <svg class="h-8 w-8 text-orange-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h2 class="text-2xl font-bold text-gray-900">Redirect URI Setup Helper</h2>
      </div>

      <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <h3 class="text-lg font-semibold text-red-800 mb-2">
          🚫 Error: redirect_uri mismatch
        </h3>
        <p class="text-red-700">
          The redirect URI in your application doesn't match what's registered in Azure AD. 
          Follow the steps below to fix this issue.
        </p>
      </div>

      {/* Current Information */}
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 class="text-lg font-semibold text-blue-800 mb-3">Current Application URLs</h3>
        <div class="space-y-2">
          <div>
            <strong>Current Origin:</strong>
            <span class="ml-2 font-mono bg-blue-100 px-2 py-1 rounded">{currentUri()}</span>
            <button
              onClick={() => copyToClipboard(currentUri())}
              class="ml-2 text-sm bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
            >
              {copied() === currentUri() ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <div>
            <strong>Current Full URL:</strong>
            <span class="ml-2 font-mono bg-blue-100 px-2 py-1 rounded text-sm break-all">
              {typeof window !== 'undefined' ? window.location.href : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Step-by-Step Instructions */}
      <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <h3 class="text-lg font-semibold text-green-800 mb-3">
          📋 Step-by-Step Fix Instructions
        </h3>
        <ol class="list-decimal list-inside space-y-3 text-green-700">
          <li>
            <strong>Open Azure Portal:</strong>
            <button
              onClick={openAzurePortal}
              class="ml-2 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
            >
              Open Azure Portal →
            </button>
          </li>
          <li>Navigate to <strong>Azure Active Directory</strong> → <strong>App registrations</strong></li>
          <li>Find and click on your app registration</li>
          <li>In the left sidebar, click <strong>"Authentication"</strong></li>
          <li>Under <strong>"Single-page application"</strong> section, click <strong>"Add URI"</strong></li>
          <li>Add one of the suggested redirect URIs below</li>
          <li>Click <strong>"Save"</strong></li>
          <li>Try signing in again</li>
        </ol>
      </div>

      {/* Suggested Redirect URIs */}
      <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h3 class="text-lg font-semibold text-yellow-800 mb-3">
          🎯 Suggested Redirect URIs to Add
        </h3>
        <p class="text-yellow-700 mb-3">
          Add any of these URIs to your Azure AD app registration. We recommend starting with the first one:
        </p>
        <div class="space-y-2">
          {suggestedUris().map((uri, index) => (
            <div class="flex items-center justify-between bg-white border border-yellow-300 rounded p-3">
              <div class="flex items-center">
                <span class="bg-yellow-200 text-yellow-800 text-xs px-2 py-1 rounded mr-3">
                  {index === 0 ? "Recommended" : `Option ${index + 1}`}
                </span>
                <code class="font-mono text-sm">{uri}</code>
              </div>
              <button
                onClick={() => copyToClipboard(uri)}
                class="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
              >
                {copied() === uri ? "✓ Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Platform Configuration */}
      <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <h3 class="text-lg font-semibold text-purple-800 mb-3">
          ⚙️ Platform Configuration
        </h3>
        <div class="text-purple-700 space-y-2">
          <p><strong>Important:</strong> Make sure you're adding the redirect URI to the correct platform:</p>
          <ul class="list-disc list-inside ml-4 space-y-1">
            <li>✅ Use <strong>"Single-page application (SPA)"</strong> platform</li>
            <li>❌ Do NOT use "Web" platform for SPA apps</li>
            <li>✅ Enable <strong>"Access tokens"</strong> and <strong>"ID tokens"</strong></li>
            <li>✅ Set <strong>"Supported account types"</strong> correctly:
              <ul class="list-disc list-inside ml-6 mt-1">
                <li><strong>"Personal Microsoft accounts only"</strong> - for consumers</li>
                <li><strong>"Work/school accounts only"</strong> - for organizations</li>
                <li><strong>"Any Microsoft account"</strong> - for both</li>
              </ul>
            </li>
          </ul>
        </div>
      </div>

      {/* Testing */}
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-3">
          🧪 Testing Your Configuration
        </h3>
        <div class="text-gray-700 space-y-2">
          <p>After adding the redirect URI to Azure AD:</p>
          <ol class="list-decimal list-inside ml-4 space-y-1">
            <li>Wait 2-3 minutes for changes to propagate</li>
            <li>Clear your browser cache and cookies</li>
            <li>Try the Microsoft sign-in again</li>
            <li>If it still fails, try a different suggested URI</li>
          </ol>
        </div>
      </div>

      {/* Code Example */}
      <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-indigo-800 mb-3">
          💻 Code Configuration
        </h3>
        <p class="text-indigo-700 mb-3">
          You can also explicitly set the redirect URI in your component:
        </p>
        <pre class="bg-indigo-100 p-3 rounded text-sm overflow-x-auto">
{`<LocalMicrosoftSignIn 
  clientId="your-client-id"
  tenantType="consumers"
  redirectUri="${currentUri()}/"  // Matches what you add to Azure AD
/>`}
        </pre>
        <button
          onClick={() => copyToClipboard(`<LocalMicrosoftSignIn 
  clientId="your-client-id"
  tenantType="consumers"
  redirectUri="${currentUri()}/"
/>`)}
          class="mt-3 bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
        >
          Copy Code Example
        </button>
      </div>

      {/* Quick Links */}
      <div class="mt-6 pt-4 border-t border-gray-200">
        <h4 class="text-sm font-medium text-gray-900 mb-2">Quick Links</h4>
        <div class="flex flex-wrap gap-4 text-sm">
          <a 
            href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-blue-600 hover:text-blue-800"
          >
            🔗 Azure AD App Registrations
          </a>
          <a 
            href="https://learn.microsoft.com/en-us/entra/identity-platform/reply-url" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-blue-600 hover:text-blue-800"
          >
            📚 Microsoft Docs: Redirect URIs
          </a>
          <a 
            href="https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-registration" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-blue-600 hover:text-blue-800"
          >
            📚 SPA App Registration Guide
          </a>
        </div>
      </div>
    </div>
  );
};

export default RedirectUriHelper;