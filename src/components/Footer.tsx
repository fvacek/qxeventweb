import githubIcon from "../assets/github.svg"
import ExternalLink from "./ExternalLink"
import { theme } from "../stores/theme"
import { JSX } from "solid-js"

export const Footer = (): JSX.Element => {
    return (
        <footer class="flex w-full flex-col items-center gap-1 p-2">
            <span>
                <ExternalLink to="https://github.com/fvacek/qxevent">
                    <img
                        src={githubIcon}
                        alt="GitHub"
                        class="w-6 h-6"
                        classList={{
                            "invert-0": theme() === "light",
                            "invert": theme() === "dark",
                        }}
                    />
                </ExternalLink>
            </span>
            <span>&copy; {new Date().getFullYear()} QuickBox / QxEvent</span>
        </footer>
    )
}
