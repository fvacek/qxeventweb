import { useWsClient } from "~/context/WsClientContext";

export default function WsClientStatusIndicator() {
  const { status } = useWsClient();

  return (
    <div>
      <p>Broker: <strong>{status()}</strong></p>
    </div>
  );
}
