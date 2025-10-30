import { ParentProps, createEffect } from "solid-js"
import { Footer } from "./components/Footer"
import NavHeader from "./components/NavHeader"
import { WsClientProvider, useWsClient } from "./context/WsClient"
import AppConfigContext, { config } from "./context/AppConfig"
import { Toaster } from "~/components/ui/toast"
import { StageProvider } from "./context/StageContext"
import {
    EventConfig,
    EventConfigProvider,
    useEventConfig,
} from "./context/EventConfig"
import { AuthProvider } from "./context/AuthContext"
import { RecChngProvider } from "./context/RecChngContext"

const AppContent = (props: ParentProps) => {
    return (
        <div class="mx-auto flex min-h-full w-full max-w-[1200px] flex-col bg-[var(--background)] text-[var(--secondary)] transition">
            <NavHeader />
            <main class="flex w-full flex-1 flex-col">{props.children}</main>
            <Footer />
            <Toaster />
        </div>
    )
}

export const App = (props: ParentProps) => {
    return (
        <AppConfigContext.Provider value={config}>
            <WsClientProvider>
                <AuthProvider>
                    <EventConfigProvider>
                        <StageProvider>
                            <RecChngProvider>
                                <AppContent>{props.children}</AppContent>
                            </RecChngProvider>
                        </StageProvider>
                    </EventConfigProvider>
                </AuthProvider>
            </WsClientProvider>
        </AppConfigContext.Provider>
    )
}
