import { Component } from 'solid-js';
import { useWsClient } from '~/context/WsClient';
import { useAppConfig } from '~/context/AppConfig';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Alert, AlertTitle } from '~/components/ui/alert';

/**
 * Connection status component that displays current WebSocket connection status
 * and provides controls for testing the automatic reconnection functionality
 */
export const ConnectionStatus: Component = () => {
    const { status, reconnect } = useWsClient();
    const [appConfig, setAppConfig] = useAppConfig();

    const handleUrlChange = () => {
        // Change the broker URL to test automatic reconnection
        const currentUrl = new URL(appConfig.brokerUrl);
        const newPort = currentUrl.port === '3777' ? '3778' : '3777';
        currentUrl.port = newPort;
        
        setAppConfig({
            ...appConfig,
            brokerUrl: currentUrl.toString()
        });
    };

    const handleDebugToggle = () => {
        setAppConfig({
            ...appConfig,
            debug: !appConfig.debug
        });
    };

    const getStatusColor = () => {
        switch (status()) {
            case 'Connected': return 'text-green-600';
            case 'Connecting': return 'text-yellow-600';
            case 'Disconnected': return 'text-gray-600';
            case 'Error': return 'text-red-600';
            case 'AuthError': return 'text-orange-600';
            default: return 'text-gray-600';
        }
    };

    const getStatusIcon = () => {
        switch (status()) {
            case 'Connected': return '✅';
            case 'Connecting': return '🔄';
            case 'Disconnected': return '❌';
            case 'Error': return '⚠️';
            case 'AuthError': return '🔐';
            default: return '❓';
        }
    };

    const getStatusMessage = () => {
        switch (status()) {
            case 'Connected': return 'Connected';
            case 'Connecting': return 'Connecting...';
            case 'Disconnected': return 'Disconnected';
            case 'Error': return 'Connection Error';
            case 'AuthError': return 'Authentication Failed';
            default: return 'Unknown';
        }
    };

    return (
        <Card class="w-full max-w-md">
            <CardHeader>
                <CardTitle>WebSocket Connection Status</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
                {/* Current Status */}
                <Alert variant={status() === 'Connected' ? 'default' : 'destructive'}>
                    <AlertTitle class={`flex items-center gap-2 ${getStatusColor()}`}>
                        <span class="text-lg">{getStatusIcon()}</span>
                        <span class="font-semibold">{getStatusMessage()}</span>
                    </AlertTitle>
                    {status() === 'AuthError' && (
                        <div class="text-sm mt-2 text-orange-700">
                            Check your username and password in the broker configuration.
                        </div>
                    )}
                    {status() === 'Error' && (
                        <div class="text-sm mt-2 text-red-700">
                            Network connection failed. Use "Manual Reconnect" to retry.
                        </div>
                    )}
                </Alert>

                {/* Current Config */}
                <div class="space-y-2">
                    <div class="text-sm font-medium text-gray-700">Current Configuration:</div>
                    <div class="bg-gray-50 p-3 rounded text-xs font-mono break-all">
                        <div><strong>URL:</strong> {appConfig.brokerUrl}</div>
                        <div><strong>Theme:</strong> {appConfig.theme}</div>
                        <div><strong>Debug:</strong> {appConfig.debug ? 'On' : 'Off'}</div>
                    </div>
                </div>

                {/* Control Buttons */}
                <div class="space-y-2">
                    <div class="text-sm font-medium text-gray-700">Test Actions:</div>
                    <div class="grid grid-cols-2 gap-2">
                        <Button 
                            onClick={reconnect} 
                            variant="outline"
                            size="sm"
                            disabled={status() === 'Connecting'}
                        >
                            {status() === 'Connecting' ? '⏳ Connecting...' : '🔄 Manual Reconnect'}
                        </Button>
                        <Button 
                            onClick={handleUrlChange} 
                            variant="outline"
                            size="sm"
                        >
                            Change Port
                        </Button>
                        <Button 
                            onClick={handleDebugToggle} 
                            variant="outline"
                            size="sm"
                        >
                            Toggle Debug
                        </Button>
                        <Button 
                            onClick={() => setAppConfig({
                                ...appConfig,
                                brokerUrl: 'ws://localhost:3777?user=test&password=test'
                            })} 
                            variant="outline"
                            size="sm"
                        >
                            Reset URL
                        </Button>
                    </div>
                </div>

                {/* Instructions */}
                <div class="text-xs text-gray-500 bg-blue-50 p-2 rounded">
                    <strong>Auto-reconnection:</strong> Connection automatically updates when broker URL changes. 
                    Theme and debug changes don't affect connection. All errors require manual reconnect.
                </div>
            </CardContent>
        </Card>
    );
};

export default ConnectionStatus;