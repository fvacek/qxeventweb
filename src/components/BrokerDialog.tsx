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

export interface BrokerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BrokerDialog: Component<BrokerDialogProps> = (props) => {
  const [username, setUsername] = createSignal('test');
  const [password, setPassword] = createSignal('test');
  const [brokerUrl, setBrokerUrl] = createSignal('ws://localhost:3777');
  const [connectionStatus, setConnectionStatus] = createSignal('');

  const handleLogin = (e: Event) => {
    e.preventDefault();
    setConnectionStatus('Connecting...');


  };

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
              value={brokerUrl()}
              onInput={(e) => setBrokerUrl(e.currentTarget.value)}
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

          <Button onClick={handleLogin} class="w-full">
            Connect
          </Button>

          {connectionStatus() && (
            <Alert variant={connectionStatus() === 'Connected' ? 'default' : 'destructive'}>
              <AlertTitle>{connectionStatus()}</AlertTitle>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BrokerDialog;
