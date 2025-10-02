import { createSignal, Component, createMemo } from 'solid-js';
import { WsClient } from 'libshv-js';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import { Button } from '~/components/ui/button';
import { Alert, AlertTitle } from '~/components/ui/alert';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '~/components/ui/dialog';
import { useAppConfig, config } from "~/context/AppConfig";
import { useWsClient } from '~/context/WsClient';

export interface BrokerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BrokerDialog: Component<BrokerDialogProps> = (props) => {
    const appConfig = useAppConfig();

    const broker_url = URL.parse(appConfig.brokerUrl) ?? (() => { throw new Error("Invalid broker URL"); })();
    // console.log("aaa", broker_url);

    const [host, setHost] = createSignal(broker_url.hostname);
    const [port, setPort] = createSignal(broker_url.port || '3777');
    const [username, setUsername] = createSignal(broker_url.searchParams.get('user') || '');
    const [password, setPassword] = createSignal(broker_url.searchParams.get('password') || '');
    
    // Validation and URL preview
    const isValidInput = createMemo(() => {
        const hostValue = host()?.trim();
        const portValue = port()?.trim();
        const userValue = username()?.trim();
        const passwordValue = password()?.trim();
        
        return hostValue && portValue && userValue && passwordValue;
    });
    
    const previewUrl = createMemo(() => {
        const hostValue = host()?.trim() || 'localhost';
        const portValue = port()?.trim() || '3777';
        const userValue = username()?.trim() || '';
        const passwordValue = password()?.trim() || '';
        
        return `ws://${hostValue}:${portValue}?user=${userValue}&password=${'*'.repeat(passwordValue.length)}`;
    });
    
    const handleConnect = (e: Event) => {
        e.preventDefault();
        
        // Build complete broker URL
        const protocol = 'ws';
        const hostValue = host() || 'localhost';
        const portValue = port() || '3777';
        const userValue = username() || '';
        const passwordValue = password() || '';
        
        const newBrokerUrl = `${protocol}://${hostValue}:${portValue}?user=${encodeURIComponent(userValue)}&password=${encodeURIComponent(passwordValue)}`;
        
        // Update config and manually trigger reconnection
        config.brokerUrl = newBrokerUrl;
        
        // Manually trigger reconnection with new URL
        reconnectWithNewUrl(newBrokerUrl);
    };

    const { status, reconnectWithNewUrl } = useWsClient();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="w-[400px]">
        <DialogHeader>
          <DialogTitle>Broker Connection</DialogTitle>
        </DialogHeader>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-2">
            <TextField class="space-y-1.5">
              <TextFieldLabel for="host">Host</TextFieldLabel>
              <TextFieldInput
                id="host"
                type="text"
                placeholder="localhost"
                value={host()}
                onInput={(e) => setHost(e.currentTarget.value)}
              />
            </TextField>
            <TextField class="space-y-1.5">
              <TextFieldLabel for="port">Port</TextFieldLabel>
              <TextFieldInput
                id="port"
                type="text"
                placeholder="3777"
                value={port()}
                onInput={(e) => setPort(e.currentTarget.value)}
              />
            </TextField>
          </div>

          <TextField class="space-y-1.5">
            <TextFieldLabel for="username">Username</TextFieldLabel>
            <TextFieldInput
              id="username"
              type="text"
              placeholder="Enter username"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
            />
          </TextField>

          <TextField class="space-y-1.5">
            <TextFieldLabel for="password">Password</TextFieldLabel>
            <TextFieldInput
              id="password"
              type="password"
              placeholder="Enter password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </TextField>

          {/* URL Preview */}
          <div class="space-y-1">
            <div class="text-sm font-medium text-gray-700">Connection URL:</div>
            <div class="bg-gray-50 p-2 rounded text-xs font-mono text-gray-600 break-all">
              {previewUrl()}
            </div>
          </div>

          <Button 
            onClick={handleConnect} 
            class="w-full"
            disabled={status() === 'Connecting' || !isValidInput()}
          >
            {status() === 'Connecting' 
              ? '⏳ Connecting...' 
              : !isValidInput() 
                ? '⚠️ Fill all fields' 
                : '🔌 Connect'
            }
          </Button>

          <Alert variant={status() === 'Connected' ? 'default' : status() === 'Connecting' ? 'default' : 'destructive'}>
            <AlertTitle>
              {status() === 'Connected' && '✅ Connected'}
              {status() === 'Connecting' && '🔄 Connecting...'}
              {status() === 'Disconnected' && '❌ Disconnected'}
              {status() === 'Error' && '⚠️ Connection Error'}
              {status() === 'AuthError' && '🔐 Authentication Failed'}
            </AlertTitle>
            {status() === 'AuthError' && (
              <div class="text-sm mt-2 text-orange-700">
                Please check your username and password and try again.
              </div>
            )}
            {status() === 'Error' && (
              <div class="text-sm mt-2 text-red-700">
                Connection failed. Please check your host and port settings.
              </div>
            )}
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BrokerDialog;
