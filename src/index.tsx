import "./index.css"

import { App } from "./App"

import { Route, Router } from "@solidjs/router"
import { render } from "solid-js/web"
import { lazy } from "solid-js"

declare global {
    interface Navigator {
        connection?: {
            // Currently this feature is only available Chrome/Opera/Edge
            // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Save-Data
            saveData?: boolean
        }
    }
}

// const Home = lazy(() => import("./routes/Home"))
// const About = lazy(() => import("./routes/About"))
// const TableDemo = lazy(() => import("./routes/TableDemo"))
// const LateEntries = lazy(() => import("./routes/LateEntries"))
// const NotFound = lazy(() => import("./routes/NotFound"))
// const OidcLogin = lazy(() => import("./auth/OidcLogin"))

import { AuthProvider } from "./context/AuthContext"
import Events from "./routes/Events"
import Home from "./routes/Home"
import About from "./routes/About"
import TableDemo from "./routes/TableDemo"
import LateEntries from "./routes/LateEntries"
import OidcLogin from "./auth/OidcLogin"
import NotFound from "./routes/NotFound"

const app = document.getElementById("app")
if (app) {
    render(
        () => (
            <Router root={App}>
                <Route path="/" component={Home} />
                <Route path="/about" component={About} />
                <Route path="/table-demo" component={TableDemo} />
                <Route path="/events" component={Events} />
                <Route path="/late-entries" component={LateEntries} />
                {/* Google auth now uses Identity Services - no callback route needed */}
                <Route
                    path="/auth/callback/microsoft"
                    component={() => <OidcLogin provider="microsoft" />}
                />
                <Route path="*" component={NotFound} />
            </Router>
        ),
        app,
    )
}
