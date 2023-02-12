import type { MaybePromise } from "$app/forms"
import type { Load, RequestHandler, ServerLoad, Cookies } from "@sveltejs/kit"
import SuperJSON from "superjson"
import CookieBrowser from "js-cookie"
import type { createServer, ViteBlitzCtx, ViteBlitzModifier } from "./index.js"
import {initiateClientPlugin, type ClientCreator, type ClientPlugin, type Invoke, type ViteServerBlitzPlugin} from "./index.js"

export type SvelteServerLoadPlugin = (...args: Parameters<ViteServerBlitzPlugin['load']>) => MaybePromise<Awaited<ReturnType<ViteServerBlitzPlugin['load']>> & {neededCookies?: string[]}>

export const createClient: ClientCreator<[{plugins?: ClientPlugin<any>[], serverPlugins?: SvelteServerLoadPlugin[]}], {loadWithBlitz(load: (event: Parameters<Load>[0] & {invoke: Invoke}) => ReturnType<Load>): Load, loadServerWithBlitz(load: (event: Parameters<ServerLoad>[0] & {invoke: Invoke}) => ReturnType<ServerLoad>): ServerLoad }> = ({plugins = [], serverPlugins = []} = {}) => {
    return {
        loadServerWithBlitz(load) {
            return async event => {
                
                const {cookies, request} = event
                let ctx = {cookies, headers: new Headers()} as ViteBlitzCtx
                let neededCookies: string[] = []
                await serverPlugins.reduce(async (prevPromise, plugin) => {
                    await prevPromise
                    
                    const {cookies: cookiesObj = {}, ctx: ctxObj = ctx, neededCookies: neededCookiesCurrent = []} = await plugin(request, cookies, ctx)
                    Object.entries(cookiesObj).forEach(([key, value]) => cookies.set(key, value))
                    ctx = {...ctx, ...ctxObj, cookies}
                    neededCookies = [...neededCookiesCurrent, ...neededCookies]
                    return null
                }, Promise.resolve(null))
                const invoke= (async (func: (...args: any) => any, parameter: any) => {
                    return await func(parameter, ctx)
                }) as Invoke
                const acquiredCookies = neededCookies.map((cookie) => [cookie, cookies.get(cookie)!])
                
                return {
                    ...(await load({...event, invoke})),
                    __acquired_cookies__: acquiredCookies,
                    __URL__: request.url
                }
            }
        },
        loadWithBlitz(load) {
            return async event => {
                if(!(typeof window === 'undefined')) {
                    initiateClientPlugin(Promise.all(plugins.map(plugin => plugin(Object.fromEntries(event.data?.__acquired_cookies__)))));
                    // window.fetch = event.fetch;
                    (event.data?. __acquired_cookies__ as [string, string][])?.forEach(([name, cookie]) => {
                        CookieBrowser.set(name, cookie)
                    })
                }
                const {__acquired_cookies__= []} = event.data as {__acquired_cookies__: [string, string][]}
                const cookies = new Map(__acquired_cookies__) as unknown as Cookies
                const invoke = (async <Func extends (parameter?: any, ctx?: ViteBlitzCtx) => any>(func: Func, parameter: Parameters<Func>) => {
                    if(!(typeof window === 'undefined')) return await func(parameter, event.fetch as any)
                    let ctx = {cookies, headers: new Headers()} as ViteBlitzCtx
                    await serverPlugins.reduce(async (prevPromise, plugin) => {
                        await prevPromise
                        const {cookies: cookiesObj = {}, ctx: ctxObj = ctx} = await plugin(new Request(new URL(event.data?.__URL__)), cookies, ctx)
                        Object.entries(cookiesObj).forEach(([key, value]) => cookies.set(key, value))
                        ctx = {...ctx, ...ctxObj, cookies}
                        return null
                    }, Promise.resolve(null))
                    return await func(parameter, ctx)
                }) as Invoke
                return {...(await load({...event, invoke}))}
            }
        }
    }
}

export const createApi = (handler: ReturnType<typeof createServer>["handler"]): RequestHandler<{blitz: string}> => {
    return async ({request, cookies: cookiesArg, params}) => {
        const {error, result, headers} = await handler(request, cookiesArg, params.blitz)
        return new Response(JSON.stringify(SuperJSON.serialize(result ?? error)), {status: error == null ? 200 : 500, headers})
    }
}

