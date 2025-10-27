import { RpcMessage, RpcValue } from "libshv-js";
import { useWsClient } from "~/context/WsClient";

export const callRpcMethod = async (
  shvPath: string,
  method: string,
  params?: RpcValue,
): Promise<RpcValue> => {
  const { wsClient } = useWsClient();
  const client = wsClient();
  if (!client) {
    throw new Error("WebSocket client is not available");
  }
  const result = await client.callRpcMethod(shvPath, method, params);
  if (result instanceof Error) {
    console.error("RPC error:", result);
    throw new Error(result.message);
  }
  return result;
};

export const sendRpcMessage = (msg: RpcMessage) => {
  const { wsClient } = useWsClient();
  const client = wsClient();
  if (!client) {
    throw new Error("WebSocket client is not available");
  }
  client.sendRpcMessage(msg);
};
