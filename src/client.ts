import { authClientPlugin } from "vite-blitz/auth";
import { createClient } from "vite-blitz/svelte";
import { svelteAuthPlugin } from "vite-blitz/svelte-auth";
console.log((typeof window === 'undefined'))
export const {loadWithBlitz, loadServerWithBlitz} = createClient({plugins: [authClientPlugin], serverPlugins: [svelteAuthPlugin({async getDB() {
    return (await import("./db/index.js")).db
}})]})