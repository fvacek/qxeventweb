import { createSignal, Component } from 'solid-js';
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
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from '~/context/WsClient';

export interface BrokerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BrokerDialog: Component<BrokerDialogProps> = (props) => {
    const [appConfig, setAppConfig] = useAppConfig();

    const broker_url = URL.parse(appConfig.brokerUrl) ?? (() => { throw new Error("Invalid broker URL"); })();
    // console.log("aaa", broker_url);

    const [host, setHost] = createSignal(broker_url.hostname);
    const [username, setUsername] = createSignal(broker_url.searchParams.get('user') || '');
    const [password, setPassword] = createSignal(broker_url.searchParams.get('password') || '');
    const handleLogin = (e: Event) => {
        let new_url = broker_url;
        new_url.searchParams.set('user', username());
        new_url.searchParams.set('password', password());
        setAppConfig({
            ...appConfig,
            brokerUrl: new_url.toString(),
        });
        e.preventDefault();
    };

    const { status, reconnect } = useWsClient();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="w-[400px]">
        <DialogHeader>
          <DialogTitle>Broker Connection</DialogTitle>
        </DialogHeader>

        <div class="space-y-4">
          <TextField class="space-y-1.5">
            <TextFieldLabel for="brokerUrl">Broker URL</TextFieldLabel>
            <TextFieldInput
              id="brokerUrl"
              type="text"
              placeholder="ws://localhost:3777"
              value={host()}
              onInput={(e) => setHost(e.currentTarget.value)}
            />
          </TextField>

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

          <div class="flex gap-2">
            <Button onClick={handleLogin} class="flex-1">
              Connect
            </Button>
            <Button onClick={() => reconnect()} variant="outline" class="flex-1">
              Reconnect
            </Button>
          </div>

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
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BrokerDialog;
