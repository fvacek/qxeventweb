import { ConnectionStatus } from '../components'

const Home = () => {
    return (
        <div class="flex w-full flex-col items-center justify-center space-y-6 p-6">
            <div class="text-center">
                <h2 class="text-3xl font-bold">Home</h2>
                <p class="text-lg">Welcome to the home page!</p>
                <p>Test the WebSocket connection status below!</p>
            </div>
            
            <ConnectionStatus />
        </div>
    )
}

export default Home
