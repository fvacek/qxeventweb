import { ParentProps } from "solid-js"
import { Footer } from "./components/Footer"
import NavHeader from "./components/NavHeader"
import { WsClientProvider } from "./context/WsClient"
import AppConfigContext, { config } from "./context/AppConfig";
import { Toaster } from "~/components/ui/toast";

export const App = (props: ParentProps) => {
    return (
    <AppConfigContext.Provider value={config}>
        <WsClientProvider>
            <div class="mx-auto flex min-h-full w-full max-w-[1200px] flex-col bg-[var(--background)] text-[var(--secondary)] transition">
                <NavHeader />

                <main class="flex w-full flex-1 flex-col">
                    {props.children}
                </main>

                <Footer />
                <Toaster />
            </div>
        </WsClientProvider>
    </AppConfigContext.Provider>
)
}
