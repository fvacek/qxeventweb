import { Component, createSignal } from "solid-js";

const AzureAdSetupGuide: Component = () => {
  const [currentStep, setCurrentStep] = createSignal(0);
  const [copied, setCopied] = createSignal("");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(""), 2000);
    });
  };

  const steps = [
    {
      title: "Create New App Registration",
      description: "Register a new application in Azure AD",
      content: (
        <div class="space-y-4">
          <p class="text-gray-700">First, let's create a new app registration that supports personal Microsoft accounts:</p>
          <ol class="list-decimal list-inside space-y-2 text-gray-700">
            <li>Go to <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" class="text-blue-600 underline">Azure Portal - App Registrations</a></li>
            <li>Click <strong>"New registration"</strong></li>
            <li>Fill in the form:
              <ul class="list-disc list-inside ml-6 mt-2 space-y-1">
                <li><strong>Name:</strong> Your app name (e.g., "My SPA App")</li>
                <li><strong>Supported account types:</strong> Select <span class="bg-green-100 px-2 py-1 rounded font-medium">"Personal Microsoft accounts only"</span></li>
                <li><strong>Redirect URI:</strong> Select "Single-page application (SPA)" and enter:
                  <br/>
                  <code class="bg-gray-100 px-2 py-1 rounded text-sm ml-2">{typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/'}</code>
                  <button
                    onClick={() => copyToClipboard(typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/')}
                    class="ml-2 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                  >
                    {copied() === (typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/') ? "✓" : "Copy"}
                  </button>
                </li>
              </ul>
            </li>
            <li>Click <strong>"Register"</strong></li>
          </ol>
        </div>
      )
    },
    {
      title: "Copy Application (Client) ID",
      description: "Get your client ID from the app registration",
      content: (
        <div class="space-y-4">
          <p class="text-gray-700">After creating the app registration, you need to copy the client ID:</p>
          <ol class="list-decimal list-inside space-y-2 text-gray-700">
            <li>On the app registration overview page, find the <strong>"Application (client) ID"</strong></li>
            <li>Copy this ID - it looks like: <code class="bg-gray-100 px-2 py-1 rounded text-sm">12345678-1234-1234-1234-123456789012</code></li>
            <li>Replace <code class="bg-gray-100 px-1 rounded">"YOUR_MICROSOFT_CLIENT_ID"</code> in your code with this ID</li>
          </ol>
          <div class="bg-blue-50 border border-blue-200 rounded p-4">
            <p class="text-blue-800 font-medium mb-2">Update your component:</p>
            <pre class="bg-blue-100 p-3 rounded text-sm overflow-x-auto">
{`<LocalMicrosoftSignIn 
  clientId="12345678-1234-1234-1234-123456789012"  // Your actual client ID
  tenantType="consumers"
  redirectUri="${typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/'}"
/>`}
            </pre>
          </div>
        </div>
      )
    },
    {
      title: "Configure Authentication Platform",
      description: "Set up the SPA platform correctly",
      content: (
        <div class="space-y-4">
          <p class="text-gray-700">Configure the authentication platform for your Single Page Application:</p>
          <ol class="list-decimal list-inside space-y-2 text-gray-700">
            <li>In your app registration, click <strong>"Authentication"</strong> in the left sidebar</li>
            <li>Under <strong>"Platform configurations"</strong>, you should see your SPA platform</li>
            <li>If not, click <strong>"Add a platform"</strong> → <strong>"Single-page application"</strong></li>
            <li>Under <strong>"Single-page application"</strong>, make sure you have these redirect URIs:
              <div class="ml-6 mt-2">
                <div class="space-y-1">
                  <div class="flex items-center">
                    <code class="bg-gray-100 px-2 py-1 rounded text-sm">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}</code>
                    <button
                      onClick={() => copyToClipboard(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')}
                      class="ml-2 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                  <div class="flex items-center">
                    <code class="bg-gray-100 px-2 py-1 rounded text-sm">{typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/'}</code>
                    <button
                      onClick={() => copyToClipboard(typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/')}
                      class="ml-2 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </li>
            <li>Under <strong>"Implicit grant and hybrid flows"</strong>, make sure these are checked:
              <ul class="list-disc list-inside ml-6 mt-2">
                <li>✅ <strong>Access tokens</strong> (used for calling APIs)</li>
                <li>✅ <strong>ID tokens</strong> (used for user sign-in)</li>
              </ul>
            </li>
            <li>Click <strong>"Save"</strong></li>
          </ol>
        </div>
      )
    },
    {
      title: "Verify Account Types",
      description: "Ensure your app supports the right account types",
      content: (
        <div class="space-y-4">
          <p class="text-gray-700">Make sure your app registration supports the correct account types:</p>
          
          <div class="bg-green-50 border border-green-200 rounded p-4">
            <h4 class="font-medium text-green-800 mb-2">✅ For Personal Microsoft Accounts (Hotmail, Outlook.com, Xbox):</h4>
            <ul class="text-green-700 space-y-1">
              <li>• <strong>Supported account types:</strong> "Personal Microsoft accounts only"</li>
              <li>• <strong>tenantType:</strong> <code class="bg-green-100 px-1 rounded">"consumers"</code></li>
              <li>• <strong>Authority:</strong> <code class="bg-green-100 px-1 rounded">login.microsoftonline.com/consumers</code></li>
            </ul>
          </div>

          <div class="bg-blue-50 border border-blue-200 rounded p-4">
            <h4 class="font-medium text-blue-800 mb-2">🏢 For Work/School Accounts Only:</h4>
            <ul class="text-blue-700 space-y-1">
              <li>• <strong>Supported account types:</strong> "Accounts in this organizational directory only"</li>
              <li>• <strong>tenantType:</strong> <code class="bg-blue-100 px-1 rounded">"organizations"</code></li>
              <li>• <strong>Authority:</strong> <code class="bg-blue-100 px-1 rounded">login.microsoftonline.com/organizations</code></li>
            </ul>
          </div>

          <div class="bg-purple-50 border border-purple-200 rounded p-4">
            <h4 class="font-medium text-purple-800 mb-2">🌐 For Both Personal and Work/School Accounts:</h4>
            <ul class="text-purple-700 space-y-1">
              <li>• <strong>Supported account types:</strong> "Accounts in any organizational directory and personal Microsoft accounts"</li>
              <li>• <strong>tenantType:</strong> <code class="bg-purple-100 px-1 rounded">"common"</code></li>
              <li>• <strong>Authority:</strong> <code class="bg-purple-100 px-1 rounded">login.microsoftonline.com/common</code></li>
            </ul>
          </div>

          <p class="text-gray-700 text-sm">
            <strong>Note:</strong> If you get "unauthorized_client" error, your account type configuration doesn't match your tenantType setting.
          </p>
        </div>
      )
    },
    {
      title: "Test Your Configuration",
      description: "Verify everything is working correctly",
      content: (
        <div class="space-y-4">
          <p class="text-gray-700">Now let's test your Microsoft authentication setup:</p>
          
          <div class="bg-yellow-50 border border-yellow-200 rounded p-4">
            <h4 class="font-medium text-yellow-800 mb-2">Pre-flight Checklist:</h4>
            <ul class="text-yellow-700 space-y-1">
              <li>✅ App registration created with correct account types</li>
              <li>✅ Client ID copied and used in your code</li>
              <li>✅ SPA platform configured with redirect URIs</li>
              <li>✅ Access tokens and ID tokens enabled</li>
              <li>✅ tenantType matches your account type configuration</li>
            </ul>
          </div>

          <div class="bg-gray-50 border border-gray-200 rounded p-4">
            <h4 class="font-medium text-gray-800 mb-2">Testing Steps:</h4>
            <ol class="list-decimal list-inside text-gray-700 space-y-1">
              <li>Clear your browser cache and cookies</li>
              <li>Try the Microsoft sign-in button</li>
              <li>You should see the Microsoft login popup/redirect</li>
              <li>Sign in with the appropriate account type (personal or work)</li>
              <li>You should be redirected back successfully</li>
            </ol>
          </div>

          <div class="bg-red-50 border border-red-200 rounded p-4">
            <h4 class="font-medium text-red-800 mb-2">Common Errors and Solutions:</h4>
            <ul class="text-red-700 space-y-2">
              <li><strong>unauthorized_client:</strong> Account types mismatch - check step 4</li>
              <li><strong>redirect_uri mismatch:</strong> Add correct redirect URIs - check step 3</li>
              <li><strong>AADSTS700016:</strong> Wrong client ID - check step 2</li>
              <li><strong>AADSTS90019:</strong> Wrong tenant configuration - check step 4</li>
            </ul>
          </div>
        </div>
      )
    }
  ];

  return (
    <div class="max-w-6xl mx-auto p-6 bg-white shadow-lg rounded-lg">
      {/* Header */}
      <div class="flex items-center mb-8">
        <svg class="h-10 w-10 text-blue-600 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Azure AD Setup Guide</h1>
          <p class="text-gray-600">Complete step-by-step guide to fix Microsoft authentication</p>
        </div>
      </div>

      {/* Error Alert */}
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
        <div class="flex">
          <svg class="h-6 w-6 text-red-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 class="text-lg font-medium text-red-800">Current Error: unauthorized_client</h3>
            <p class="text-red-700">The client does not exist or is not enabled for consumers.</p>
            <p class="text-red-600 text-sm mt-1">This guide will help you fix this issue step by step.</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
          {steps.map((step, index) => (
            <div class="flex items-center">
              <div 
                class={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  index <= currentStep() 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {index + 1}
              </div>
              {index < steps.length - 1 && (
                <div 
                  class={`w-16 h-1 mx-2 ${
                    index < currentStep() ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div class="text-center text-sm text-gray-600">
          Step {currentStep() + 1} of {steps.length}: {steps[currentStep()].title}
        </div>
      </div>

      {/* Current Step Content */}
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">
          {steps[currentStep()].title}
        </h2>
        <p class="text-gray-600 mb-6">{steps[currentStep()].description}</p>
        {steps[currentStep()].content}
      </div>

      {/* Navigation */}
      <div class="flex justify-between">
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep() - 1))}
          disabled={currentStep() === 0}
          class="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Previous Step
        </button>
        
        <div class="flex space-x-4">
          {currentStep() < steps.length - 1 ? (
            <button
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep() + 1))}
              class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Next Step →
            </button>
          ) : (
            <div class="text-center">
              <div class="text-green-600 font-medium mb-2">🎉 Setup Complete!</div>
              <p class="text-sm text-gray-600">Your Microsoft authentication should now work properly.</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div class="mt-8 pt-6 border-t border-gray-200">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center px-4 py-3 border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-50"
          >
            🚀 Open Azure Portal
          </a>
          <button
            onClick={() => setCurrentStep(0)}
            class="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            🔄 Start Over
          </button>
          <button
            onClick={() => window.location.reload()}
            class="flex items-center justify-center px-4 py-3 border border-green-300 rounded-lg text-green-700 hover:bg-green-50"
          >
            🧪 Test Login
          </button>
        </div>
      </div>

      {/* Additional Resources */}
      <div class="mt-8 pt-6 border-t border-gray-200">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Additional Resources</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <a 
            href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-blue-600 hover:text-blue-800"
          >
            📚 Microsoft Docs: Register an application
          </a>
          <a 
            href="https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-registration" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-blue-600 hover:text-blue-800"
          >
            📚 Single-page application registration
          </a>
          <a 
            href="https://learn.microsoft.com/en-us/entra/identity-platform/supported-accounts-validation" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-blue-600 hover:text-blue-800"
          >
            📚 Supported account types
          </a>
          <a 
            href="https://learn.microsoft.com/en-us/entra/identity-platform/reply-url" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-blue-600 hover:text-blue-800"
          >
            📚 Redirect URI/reply URL restrictions
          </a>
        </div>
      </div>
    </div>
  );
};

export default AzureAdSetupGuide;