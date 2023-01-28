import type { PrismaClient } from "@prisma/client";
import { authPlugin } from "./auth";
import type { SvelteServerLoadPlugin } from "./svelte";

export const svelteAuthPlugin: (arg: {getDB: () => Promise<PrismaClient>}) => SvelteServerLoadPlugin = ({getDB}) => {
    return async (request, cookies, ctx) => {
        const {load} = authPlugin({db: await getDB()})
        if(cookies.get("csrf-token") != null) request.headers.set("csrf-token", cookies.get("csrf-token")!)
        const result = await load(request, cookies, ctx)
        return {...result, neededCookies: ['token', 'csrf-token']}
    }
}