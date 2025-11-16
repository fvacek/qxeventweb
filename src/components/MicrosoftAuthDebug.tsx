import { Component, createSignal, onMount } from "solid-js";
import { microsoftAuthService } from "~/auth/microsoft-auth";

const MicrosoftAuthDebug: Component = () => {
  const [status, setStatus] = createSignal<any>(null);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [manualScriptLoaded, setManualScriptLoaded] = createSignal(false);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  const checkStatus = () => {
    const currentStatus = microsoftAuthService.getInitializationStatus();
    setStatus(currentStatus);
    addLog(`Status check: ${JSON.stringify(currentStatus)}`);
  };

  const testConfiguration = () => {
    const config = microsoftAuthService.validateConfiguration();
    addLog(`Configuration validation: ${JSON.stringify(config)}`);
    setStatus(prev => ({ ...prev, configValidation: config }));
  };

  const forceReinitialize = async () => {
    setIsLoading(true);
    addLog("Starting force reinitialization...");
    
    try {
      await microsoftAuthService.forceReinitialize();
      addLog("Force reinitialization completed successfully");
      checkStatus();
    } catch (error: any) {
      addLog(`Force reinitialization failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testManualInit = async () => {
    setIsLoading(true);
    addLog("Testing manual initialization...");
    
    try {
      // Test if we can load the MSAL script manually
      const script = document.createElement('script');
      script.src = 'https://alcdn.msauth.net/browser/2.38.4/js/msal-browser.min.js';
      
      script.onload = () => {
        addLog("MSAL script loaded successfully");
        addLog(`PublicClientApplication available: ${!!window.PublicClientApplication}`);
        checkStatus();
        setIsLoading(false);
      };
      
      script.onerror = () => {
        addLog("Failed to load MSAL script");
        setIsLoading(false);
      };
      
      document.head.appendChild(script);
    } catch (error: any) {
      addLog(`Manual init error: ${error.message}`);
      setIsLoading(false);
    }
  };

  const updateClientId = () => {
    const newClientId = prompt("Enter your Azure AD Client ID:");
    if (newClientId) {
      microsoftAuthService.updateConfig({ clientId: newClientId });
      addLog(`Updated client ID to: ${newClientId}`);
      checkStatus();
    }
  };

  const setTenantType = (tenantType: 'consumers' | 'organizations' | 'common') => {
    microsoftAuthService.setTenantType(tenantType);
    addLog(`Set tenant type to: ${tenantType}`);
    checkStatus();
  };

  onMount(() => {
    checkStatus();
    testConfiguration();
  });

  const loadManualScript = () => {
    setIsLoading(true);
    addLog("Loading MSAL manually...");
    
    // Remove any existing scripts first
    const existingScripts = document.querySelectorAll('script[src*="msal-browser"]');
    existingScripts.forEach(script => script.remove());
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@azure/msal-browser@2.38.4/lib/msal-browser.min.js';
    script.async = true;
    
    script.onload = () => {
      addLog("Manual MSAL script loaded successfully");
      setManualScriptLoaded(true);
      checkStatus();
      setIsLoading(false);
    };
    
    script.onerror = () => {
      addLog("Manual MSAL script loading failed - try npm install");
      setIsLoading(false);
    };
    
    document.head.appendChild(script);
  };

  const showInstallInstructions = () => {
    const instructions = `
NPM Installation Alternative:

1. Install MSAL via npm:
   npm install @azure/msal-browser

2. Import in your component:
   import { PublicClientApplication } from '@azure/msal-browser';

3. Set it globally:
   window.PublicClientApplication = PublicClientApplication;

This avoids CDN loading issues completely.
    `;
    
    addLog(instructions);
    navigator.clipboard?.writeText("npm install @azure/msal-browser");
    addLog("NPM command copied to clipboard");
  };

  return (
    <div class="max-w-4xl mx-auto p-6 bg-white shadow-lg rounded-lg">
      <h2 class="text-2xl font-bold mb-6 text-gray-900">Microsoft Auth Debug Console</h2>
      
      {/* Current Status */}
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-3">Current Status</h3>
        <div class="bg-gray-50 border rounded-lg p-4">
          <pre class="text-sm text-gray-800 whitespace-pre-wrap">
            {status() ? JSON.stringify(status(), null, 2) : 'Loading...'}
          </pre>
        </div>
      </div>

      {/* Action Buttons */}
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-3">Actions</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={checkStatus}
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Check Status
          </button>
          
          <button
            onClick={testConfiguration}
            class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Test Config
          </button>
          
          <button
            onClick={forceReinitialize}
            disabled={isLoading()}
            class="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
          >
            {isLoading() ? "Working..." : "Force Reinit"}
          </button>
          
          <button
            onClick={testManualInit}
            disabled={isLoading()}
            class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            Manual Init
          </button>
          
          <button
            onClick={updateClientId}
            class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Set Client ID
          </button>
          
          <button
            onClick={() => setTenantType('consumers')}
            class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Consumers
          </button>
          
          <button
            onClick={() => setTenantType('organizations')}
            class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Organizations
          </button>
          
          <button
            onClick={() => setTenantType('common')}
            class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Common
          </button>

          <button
            onClick={loadManualScript}
            disabled={isLoading()}
            class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading() ? "Loading..." : "Manual Load"}
          </button>

          <button
            onClick={showInstallInstructions}
            class="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
          >
            NPM Install
          </button>
        </div>
      </div>

      {/* Quick Fixes */}
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-3">Quick Fixes</h3>
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 class="font-medium text-yellow-800 mb-2">CDN Loading Failed Solutions:</h4>
          <ul class="text-sm text-yellow-700 space-y-1">
            <li>1. Click "Manual Load" to try alternative CDN</li>
            <li>2. Click "NPM Install" for local installation instructions</li>
            <li>3. Check your internet connection and firewall</li>
            <li>4. Try disabling browser extensions that block scripts</li>
            <li>5. Use a different network or VPN</li>
          </ul>
        </div>
        
        {manualScriptLoaded() && (
          <div class="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 class="font-medium text-green-800 mb-2">✅ Manual Script Loaded</h4>
            <p class="text-sm text-green-700">MSAL script loaded successfully. Now try setting your Client ID and tenant type.</p>
          </div>
        )}
      </div>

      {/* Environment Check */}
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-3">Environment Check</h3>
        <div class="bg-gray-50 border rounded-lg p-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>User Agent:</strong>
              <div class="text-gray-600">{navigator.userAgent}</div>
            </div>
            <div>
              <strong>Current URL:</strong>
              <div class="text-gray-600">{window.location.href}</div>
            </div>
            <div>
              <strong>Local Storage Available:</strong>
              <div class="text-gray-600">{typeof Storage !== "undefined" ? "Yes" : "No"}</div>
            </div>
            <div>
              <strong>Network Status:</strong>
              <div class="text-gray-600">{navigator.onLine ? "Online" : "Offline"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Logs */}
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-3">Debug Logs</h3>
        <div class="bg-black text-green-400 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
          {logs().length === 0 ? (
            <div class="text-gray-500">No logs yet...</div>
          ) : (
            logs().map((log, index) => (
              <div class="mb-1">{log}</div>
            ))
          )}
        </div>
        <button
          onClick={() => setLogs([])}
          class="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          Clear Logs
        </button>
      </div>

      {/* Instructions */}
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 class="font-medium text-blue-800 mb-2">Instructions:</h4>
        <div class="text-sm text-blue-700 space-y-2">
          <p><strong>For CDN Loading Errors:</strong></p>
          <p>1. Click "Manual Load" to try alternative CDN sources</p>
          <p>2. Click "NPM Install" for local installation instructions</p>
          <p>3. Check browser network tab for blocked requests</p>
          <p><strong>For Configuration Issues:</strong></p>
          <p>4. If you see "Client ID is not set", click "Set Client ID"</p>
          <p>5. Choose correct tenant type: "Consumers" for personal accounts, "Organizations" for work accounts</p>
          <p>6. Ensure your Azure AD app is configured as a Single Page Application (SPA)</p>
        </div>
      </div>
    </div>
  );
};

export default MicrosoftAuthDebug;