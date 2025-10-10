import { Accessor, createContext, createEffect, createSignal, useContext } from "solid-js"
import { createStore } from "solid-js/store"
import { useAppConfig } from "./AppConfig"
import { useWsClient } from "./WsClient"

export class StageConfig {
    stageStart: string = ""
}

export class EventConfig {
    eventName: string = ""
    stages: StageConfig[] = []
}

interface EventConfigContextType {
    eventConfig: EventConfig
    setEventConfig: (eventConfig: EventConfig) => void
    eventOpen: Accessor<boolean>;
}

const EventConfigContext = createContext<EventConfigContextType>()

export function EventConfigProvider(props: { children: any }) {
    const appConfig = useAppConfig();
    const { wsClient, status } = useWsClient()

    const [eventConfig, setEventConfig] = createStore(new EventConfig())
    const [eventOpen, setEventOpen] = createSignal(false)

    createEffect(() => {
        if (status() === "Connected") {
            loadEventConfig()
        }
    })

    const loadEventConfig = async () => {
        if (appConfig.debug) {
            console.log("Loading event config")
        }
        try {
            const client = wsClient()
            if (!client) {
                throw new Error("WebSocket client not initialized")
            }
            const result = await client.callRpcMethod(
                appConfig.eventPath,
                "select",
                ["SELECT * FROM config"],
            )
            if (result instanceof Error) {
                console.error("RPC error:", result)
                throw new Error(result.message)
            }
            const event_config = new EventConfig()
            event_config.eventName = "foo-bar"
            setEventConfig(event_config)
            setEventOpen(true)
        } catch (error) {
            console.error("Failed to load event config:", error)
        }
    }

    const value = {
        eventConfig,
        setEventConfig,
        eventOpen,
    }

    return (
        <EventConfigContext.Provider value={value}>
            {props.children}
        </EventConfigContext.Provider>
    )
}

export function useEventConfig() {
    const context = useContext(EventConfigContext)
    if (!context) {
        throw new Error(
            "useEventConfig must be used within an EventConfigProvider",
        )
    }
    return context
}
