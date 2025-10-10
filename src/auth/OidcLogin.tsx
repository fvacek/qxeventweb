import { Component, onMount } from "solid-js"
import { useAuth } from "~/context/AuthContext"
import { authService } from "./auth-service"
import { useSearchParams } from "@solidjs/router"
import { showToast } from "~/components/ui/toast"

interface OidcLoginProps {
    provider: "google" | "microsoft"
}

const OidcLogin: Component<OidcLoginProps> = (props) => {
    const { setUser } = useAuth()
    const [searchParams] = useSearchParams()

    onMount(async () => {
        console.log("Login response:", searchParams)
        try {
            if (searchParams.code) {
                const user = await authService.handleCallback(props.provider)
                setUser(user)
                window.location.href = "/"
            }
        } catch (error) {
            console.error("Error handling login:", error)
        }
    })

  return <div>Handling login...</div>;
}

export default OidcLogin
