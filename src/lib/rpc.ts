import { RpcMessage, RpcValue, WsClient } from "libshv-js";
import { useWsClient } from "~/context/WsClient";

export const callRpcMethod = async (
  client: WsClient | null,
  shvPath: string,
  method: string,
  params?: RpcValue,
): Promise<RpcValue> => {
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

export const sendRpcMessage = (
  client: WsClient | null,
  msg: RpcMessage
) => {
  if (!client) {
    throw new Error("WebSocket client is not available");
  }
  client.sendRpcMessage(msg);
};
