import { createServer } from "$lib"
import { authPlugin } from "$lib/auth"
import { db } from "./db"

console.log(import.meta.url)

export const {handler} = createServer({plugins: [authPlugin({db})]})