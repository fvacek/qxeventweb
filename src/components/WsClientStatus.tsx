import { createSignal, lazy } from "solid-js";
import { useWsClient } from "~/context/WsClient";
import { Badge } from "./ui/badge";

const BrokerDialog = import.meta.env.DEV
  ? lazy(() => import("./BrokerDialog"))
  : undefined;

export default function WsClientStatus() {
  const { status } = useWsClient();
  const [isDialogOpen, setIsDialogOpen] = createSignal(false);

  const getVariant = () => {
    return status() === "Connected" ? undefined : "error";
  };

  const handleClick = () => {
    if (import.meta.env.DEV) {
      setIsDialogOpen(true);
    }
  };

  const statusLabel = () => {
    switch (status()) {
      case "Connected":
        return "C";
      case "Disconnected":
        return "D";
      case "Connecting":
        return "…";
      case "AuthError":
        return "A";
      case "Error":
        return "E";
    }
  };

  return (
    <>
      <Badge
        variant={getVariant()}
        class={
          import.meta.env.DEV
            ? "cursor-pointer hover:opacity-80 transition-opacity"
            : undefined
        }
        onClick={import.meta.env.DEV ? handleClick : undefined}
        title={status()}
        aria-label={`WebSocket status: ${status()}`}
      >
        {statusLabel()}
      </Badge>
      {BrokerDialog && (
        <BrokerDialog
          open={isDialogOpen()}
          onOpenChange={setIsDialogOpen}
        />
      )}
    </>
  );
}
