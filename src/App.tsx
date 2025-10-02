import { ParentProps } from "solid-js"
import { Footer } from "./components/Footer"
import NavHeader from "./components/NavHeader"
import { WsClientProvider } from "./context/WsClient"
import AppConfigContext, { config } from "./context/AppConfig";

export const App = (props: ParentProps) => {
    return (
    <AppConfigContext.Provider value={config}>
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
