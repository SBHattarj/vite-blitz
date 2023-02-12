import { createServer } from "vite-blitz"
import { authPlugin } from "vite-blitz/auth"
import { db } from "./db/index.js"

export const {handler} = createServer({plugins: [authPlugin({db})]})