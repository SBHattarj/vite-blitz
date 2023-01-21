import type { Load, RequestHandler } from "@sveltejs/kit"
import SuperJSON from "superjson"
import type { createServer } from "."
import {initiateClientPlugin, type ClientCreator, type ClientPlugin, type Invoke, type ViteServerBlitzPlugin} from "."

export const createClient: ClientCreator<[{plugins?: ClientPlugin[]}], {loadWithBlitz(load: Load): Load }> = ({plugins = []} = {}) => {
    initiateClientPlugin(plugins)
    return {
        loadWithBlitz(load) {
            return async event => {
                globalThis.fetch = event.fetch
                return await load(event)
            }
        }
    }
}

export const createApi = (handler: ReturnType<typeof createServer>["handler"]): RequestHandler<{blitz: string}> => {
    return async ({request, cookies: cookiesArg, params}) => {
        const {error, result} = await handler(request, cookiesArg, params.blitz)
        return new Response(JSON.stringify(SuperJSON.serialize(result ?? error)), {status: error == null ? 200 : 500})
    }
}