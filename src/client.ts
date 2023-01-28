import { authClientPlugin } from "$lib/auth";
import { createClient } from "$lib/svelte";
import { svelteAuthPlugin } from "$lib/svelte-auth";

export const {loadWithBlitz, loadServerWithBlitz} = createClient({plugins: [authClientPlugin], serverPlugins: [svelteAuthPlugin({async getDB() {
    return (await import("./db")).db
}})]})