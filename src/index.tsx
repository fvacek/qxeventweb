import "virtual:uno.css"
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

const Home = lazy(() => import("./routes/Home"))
const TableDemo = lazy(() => import("./routes/TableDemo"))
const Events = lazy(() => import("./routes/Events"))
const Event = lazy(() => import("./routes/OpenedEvent"))
const NotFound = lazy(() => import("./routes/NotFound"))

const app = document.getElementById("app")
if (app) {
    render(
        () => (
            <Router root={App}>
                <Route path="/" component={Home} />
                <Route path="/table-demo" component={TableDemo} />
                <Route path="/events" component={Events} />
                <Route path="/event/:id" component={(props) => <Event event_id_str={props.params.id!} />} />
                {/*<Route path="/late-entries" component={LateEntries} />*/}
                {/* Google auth now uses Identity Services - no callback route needed */}

                <Route path="*" component={NotFound} />
            </Router>
        ),
        app,
    )
}
