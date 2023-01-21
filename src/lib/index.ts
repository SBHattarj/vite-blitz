import type { Plugin } from "vite"
import superjson from "superjson"
import type { Cookies } from "@sveltejs/kit"
export function viteBlitz({rpcPathRegex = /\/\[\.\.\.blitz\]\/\+server.[tj]s/, extensions = ["ts", "js"], invokables = ["queries", "mutations"]}: {rpcPathRegex?: RegExp, extensions?: string[], invokables?: string[]} = {}): Plugin {
   return {
        name: "vite-blitz",
	async load(id, env) {
            if(invokables.every(invokable => !id.includes(invokable)) || env?.ssr) return
        return `// @no-check\nimport {internalFetch} from "${__filename}"\nexport default internalFetch("${id.replace(new RegExp(`^.*\\/(${invokables.join("|")})\\/|\\.(${extensions.join("|")})$`, "g"), "")}")`
	},
	async transform(code, id, env) {
            if(!rpcPathRegex.test(id) || !env?.ssr) return
        const {default: glob} = await import("glob")
        
        const newCode = `${code}\nglobalThis.__blitzHandlers = {\n${glob.sync(`*/**/@(${invokables.join("|")})/**/*.@(${extensions.join("|")})`).map(file => [file.replace(new RegExp(`^.*\\/(${invokables.join("|")})\\/|\\.(${extensions.join("|")})$`, "g"), ""), `${process.cwd()}/${file}`]).reduce((keyValueString, [key, value]) => `${keyValueString}    '${key}': import("${value}"),\n`, "")}\n}`
        return newCode
	}
   }
}

export interface ViteBlitzCtx {
    cookies: Cookies,
    headers: Headers,
	$token: string | null
    $publicData: unknown
    $signupSession: (userId: number) => Promise<void>
	$loginSession: (userId: number) => Promise<void>
    $revoke: () => Promise<void>
    $getPrivateData: () => Promise<Record<any, any>>
    $setPrivateData: (data: Record<any, any>) => Promise<void>
    $setPublicData: (data: Record<any, any>) => Promise<void>
}

export type ViteServerBlitzPlugin = {
    load(request: Request, cookies: Cookies, ctx: ViteBlitzCtx): Promise<{cookies?: {[key: string]: string}, ctx?: ViteBlitzCtx}>
}

export function createServer({plugins = []}: {plugins: ViteServerBlitzPlugin[]}) {
    return {
        async handler(request: Request, cookies: Cookies, blitzParam: string) {
            let ctx = {cookies, headers: request.headers} as ViteBlitzCtx
                await plugins.reduce(async (prevPromise, plugin) => {
            await prevPromise
                    const {cookies: cookiesObj = {}, ctx: ctxObj = ctx} = await plugin.load(request, cookies, ctx)
                Object.entries(cookiesObj).forEach(([key, value]) => cookies.set(key, value))
                ctx = {...ctx, ...ctxObj, cookies}
                return null
                }, Promise.resolve(null))
                
            const {default: handler} = await (globalThis as any).__blitzHandlers[blitzParam]
            ctx.headers.set("Content-Type", "application/json")
            try {
                    const result = handler(superjson.deserialize(await request.json()), ctx)
                return {cookies: ctx.cookies, headers: ctx.headers, ctx, result}
            } catch(error) {
                return {cookies: ctx.cookies, headers: ctx.headers, ctx, error}
            }
        }
    }
    
}

export type ClientCreator<args extends any[], Return = any> = (...args: args) => Return

export type ClientPlugin = (() => Promise<{headers: {[key: string]: string}}>)

export function initiateClientPlugin<T extends ClientPlugin[]>(plugins: T) {
    if(import.meta.env.SSR) return
    (globalThis as any).__clientPlugin = async () => {
        return (await Promise.all(plugins.map(plugin => plugin()))).reduce((prev, {headers}) => ({...prev, ...headers}), {} as {[key: string]: string})
    }
}

export type Invoke = <Func extends (parameter: any, ctx: ViteBlitzCtx) => any>(func: Func, parameter: Parameters<Func>[0]) => Promise<Awaited<ReturnType<Func>>>
export const invoke: Invoke = async (func, parameter) => {
    if(import.meta.env.SSR) throw new Error("SSR is not supported, please wrap this code with if(!import.meta.env.SSR) {} block or use it where it may only ran on client")
    return await func(parameter, {} as ViteBlitzCtx)
}
export function internalFetch(blitzParam: string) {
    return async (param: any) => {
        const {headers} = (await (globalThis as any).__clientPlugin?.()) ?? {headers: {}}
        console.log(headers)
        const response = await fetch(`/rpc/${blitzParam}`, {
                method: "POST",
            headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    ...headers
                },
            body: JSON.stringify(superjson.serialize(param))
        })
        if(!response.ok) throw new Error(await response.json())
        const res = await response.json()

        return superjson.deserialize(res)
    }
}
