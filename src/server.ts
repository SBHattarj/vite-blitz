import { createServer } from "$lib"
import { authPlugin } from "$lib/auth"
import { db } from "./db"

export const {handler} = createServer({plugins: [authPlugin({db})]})