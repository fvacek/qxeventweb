import { createSignal } from "solid-js";
import { useWsClient } from "~/context/WsClient";
import { Badge } from "./ui/badge";
import BrokerDialog from "./BrokerDialog";

export default function WsClientStatus() {
  const { status } = useWsClient();
  const [isDialogOpen, setIsDialogOpen] = createSignal(false);

  const getVariant = () => {
    return status() === "Connected" ? undefined : "error";
  };

  const handleClick = () => {
    setIsDialogOpen(true);
  };

  return (
    <>
      <Badge
        variant={getVariant()}
        class="cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleClick}
      >
        {status()}
      </Badge>
      <BrokerDialog
        open={isDialogOpen()}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}
