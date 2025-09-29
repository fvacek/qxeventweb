import { createSignal } from 'solid-js';
import type { Component } from 'solid-js';
// import { Container, Form, Button, Alert } from 'solid-bootstrap';
import { WsClient } from 'libshv-js';
import { TextField, TextFieldInput, TextFieldLabel } from '~/components/ui/text-field';
import { Button } from '~/components/ui/button';
import { Alert, AlertTitle } from '~/components/ui/alert';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/components/ui/card';

export const Broker: Component = () => {
  const [username, setUsername] = createSignal('test');
  const [password, setPassword] = createSignal('test');
  const [brokerUrl, setBrokerUrl] = createSignal('ws://localhost:3777');
  const [connectionStatus, setConnectionStatus] = createSignal('');

  const handleLogin = (e: Event) => {
    e.preventDefault();
    setConnectionStatus('Connecting...');
  };


  return (
    <Card class="w-[380px]">
      <CardHeader>
        <CardTitle>Broker login</CardTitle>
      </CardHeader>
      <CardContent class="grid gap-4">
        <TextField class="grid w-full max-w-sm items-center gap-1.5">
          <TextFieldLabel for="url">Broker URL</TextFieldLabel>
          <TextFieldInput type="text" id="url" placeholder="Enter broker URL"
            value={brokerUrl()}
            onInput={(e) => setBrokerUrl(e.currentTarget.value)}
          />
        </TextField>
        <TextField class="grid w-full max-w-sm items-center gap-1.5">
          <TextFieldLabel for="user">User</TextFieldLabel>
          <TextFieldInput type="text" id="user" placeholder="User name"
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
          />
        </TextField>
        <TextField class="grid w-full max-w-sm items-center gap-1.5">
          <TextFieldLabel for="password">Password</TextFieldLabel>
          <TextFieldInput type="password" id="password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </TextField>
        <Button onClick={handleLogin}> Login </Button>
      </CardContent>
      <CardFooter>
        {connectionStatus() && (
          <Alert variant={connectionStatus() === 'Connected' ? 'default' : 'destructive'}>
            <AlertTitle>{connectionStatus()}</AlertTitle>
          </Alert>
        )}
      </CardFooter>
    </Card>
  );
};

export default Broker;
