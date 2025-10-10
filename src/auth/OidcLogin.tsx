import { Component, onMount } from "solid-js"
import { useAuth } from "~/context/AuthContext"
import { authService } from "./auth-service"
import { useSearchParams } from "@solidjs/router"
import { showToast } from "~/components/ui/toast"
import { convertOidcUserToAuthUser } from "./user-utils"

interface OidcLoginProps {
    provider: "microsoft"
}

const OidcLogin: Component<OidcLoginProps> = (props) => {
    const { setUser } = useAuth()
    const [searchParams] = useSearchParams()

    onMount(async () => {
        console.log("Login response:", searchParams)
        try {
            if (searchParams.code) {
                const oidcUser = await authService.handleCallback(props.provider)
                const authUser = convertOidcUserToAuthUser(oidcUser)
                setUser(authUser)
                showToast({
                    title: "Sign in successful",
                    description: `Welcome, ${authUser.name}!`,
                    variant: "success"
                })
                window.location.href = "/"
            }
        } catch (error) {
            console.error("Error handling login:", error)
            showToast({
                title: "Sign in failed",
                description: "Authentication failed. Please try again.",
                variant: "error"
            })
        }
    })

  return <div>Handling login...</div>;
}

export default OidcLogin
