declare module "*.svg" {
    const content: string
}

declare module "libshv-js" {
    // RpcValue represents any JSON-serializable value that can be sent over RPC
    export type RpcValue = 
        | null
        | boolean
        | number
        | string
        | RpcValue[]
        | { [key: string]: RpcValue };

    export class WsClient {
        callRpcMethod(path: string, method: string, params?: RpcValue): Promise<RpcValue | Error>;
    }
}
