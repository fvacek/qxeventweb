import { ParentProps } from "solid-js"
import { Footer } from "./components/Footer"
import NavHeader from "./components/NavHeader"
import { WsClientProvider } from "./context/WsClient"
import AppConfigContext, { AppConfig } from "./context/AppConfig";
import { createStore } from "solid-js/store";

export const App = (props: ParentProps) => {
    const [config, setConfig] = createStore<AppConfig>({
        brokerUrl: import.meta.env.QXEVENT_BROKER_URL || "ws://localhost:3777?user=test&password=test",
        theme: "dark",
        debug: true,
    });

    return (
    <AppConfigContext.Provider value={[config, setConfig]}>
        <WsClientProvider>
            <div class="mx-auto flex h-full w-full max-w-[1200px] flex-col justify-center bg-[var(--background)] text-[var(--secondary)] transition">
                <NavHeader />

                <main class="flex w-full grow flex-col items-center">
                    {props.children}
                </main>

                <Footer />
            </div>
        </WsClientProvider>
    </AppConfigContext.Provider>
)
}
