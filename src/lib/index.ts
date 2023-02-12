import type { Plugin } from "vite"
import superjson from "superjson"
import type { Cookies } from "@sveltejs/kit"
import type { MaybePromise } from "$app/forms"
const indexFile = import.meta.url.replace(/^file\:\/\//, "")

export async function formatID(id: string, importer?: string) {
    const {default: path} = await import("path")
    if(id.startsWith(".")) {
        if(importer?.includes(process.cwd())) return path.resolve(importer?.replace(/\/[^\/]*$/, ""), id)
        return path.resolve(importer?.replace(/^\/|\/[^\/]*/g, "") ?? "", id)
    }
    if(id.includes(process.cwd())) return id
    return path.resolve(id.replace(/^\/\@fs\/|^\//, ""))
    
}

let metaMap = new Map<string, any>()

export type ViteBlitzModifier = ((arg: {rpcPathRegex: RegExp, extensions: string[], invokables: string[], id: string, env?: {ssr?: boolean}, type: "load" | "transform" | "resolve-id", code: string, indexFile: string, importer?: string, meta: any}) => {action?: "return" | "append" | "exchange" | null | undefined, code?: string, id?: string, meta?: object} | void)
export function viteBlitz({rpcPathRegex = /\/\[\.\.\.blitz\]\/\+server.[tj]s/, extensions = ["ts", "js"], invokables = ["queries", "mutations"], modifiers = []}: {rpcPathRegex?: RegExp, extensions?: string[], invokables?: string[], modifiers?: ViteBlitzModifier[]} = {}): Plugin {
    return {
        name: "vite-blitz",
        enforce: "pre",
        async resolveId(id, importer, env) {
            let metaObj = this.getModuleInfo(id)?.meta
            for(let modifier of modifiers) {
                const {id: newID, meta = {}} = modifier({rpcPathRegex, extensions, invokables, id, env, type: "resolve-id", code: "", indexFile, importer, meta: metaObj}) ?? {}
                metaObj = {...metaObj, ...meta, vite: {JS: "hello"}}
                if(newID) {
                    
                    const idMayWithoutExt = await formatID(newID, importer)
                    const {default: glob} = await import("glob")
                    const idNew = extensions.some(extension => idMayWithoutExt.includes(`.${extension}`)) ? idMayWithoutExt : (await import("path")).resolve(process.cwd(), glob.sync(`${idMayWithoutExt.replace(process.cwd() + "/", "")}.@(${extensions.join("|")})`)[0])
                    metaMap.set(idNew, metaObj)
                    const resolved = await this.resolve(id, importer, {skipSelf: true})
                    if(resolved == null) return
                    return {...resolved, meta: {...resolved.meta, ...meta}}
                }
            }
        },
        async load(id, env) {
            const info = this.getModuleInfo(id)
            const meta = info?.meta
            if(invokables.every(invokable => !id.includes(invokable))) return
            if(env?.ssr) {
                let newCode = ""
                for(let modifier of modifiers) {
                    const {action = "append", code = ""} = modifier({rpcPathRegex, extensions, invokables, id, env, type: "load", code: newCode, indexFile, meta}) ?? {}
                    if(action === "return") return code
                    if(action === "exchange") {
                        newCode = code
                        continue
                    }
                    newCode += code
                }
                if(newCode.length === 0) return
                return newCode
                return
            }
            let newCode = `// @no-check\nimport {internalFetch} from "${indexFile}"\nexport default internalFetch("${id.replace(new RegExp(`^.*\\/(${invokables.join("|")})\\/|\\.(${extensions.join("|")})$`, "g"), "")}")`
            for(let modifier of modifiers) {
                const {action = "append", code = ""} = modifier({rpcPathRegex, extensions, invokables, id, env, type: "load", code: newCode, indexFile, meta}) ?? {}
                if(action === "return") {
                    return code
                }
                if(action === "exchange") {
                    newCode = code
                    continue
                }
                newCode += code
            }
            return newCode
        },
        async transform(code, id, env) {
            const info = this.getModuleInfo(id)
            const meta = Object.keys(info?.meta ?? {}).length > 0 ? info?.meta : info?.id != null ? metaMap.get(info.id) : {}
            if(!rpcPathRegex.test(id) || !env?.ssr) return
            const {default: glob} = await import("glob")
            let newCode = `${code}\nglobalThis.__blitzHandlers = {\n${glob.sync(`*/**/@(${invokables.join("|")})/**/*.@(${extensions.join("|")})`).map(file => [file.replace(new RegExp(`^.*\\/(${invokables.join("|")})\\/|\\.(${extensions.join("|")})$`, "g"), ""), `${process.cwd()}/${file}`]).reduce((keyValueString, [key, value]) => `${keyValueString}    '${key}': import("${value}"),\n`, "")}\n}`
            for(let modifier of modifiers) {
                const {action = "append", code = ""} = modifier({rpcPathRegex, extensions, invokables, id, env, type: "transform", code: newCode, indexFile, meta}) ?? {}
                if(action === "return") return code
                if(action === "exchange") {
                    newCode = code
                    continue
                }
                newCode += code
            }
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
            let ctx = {cookies, headers: new Headers()} as ViteBlitzCtx
            try {
                await plugins.reduce(async (prevPromise, plugin) => {
                    await prevPromise
                    const {cookies: cookiesObj = {}, ctx: ctxObj = ctx} = await plugin.load(request, cookies, ctx)
                    Object.entries(cookiesObj).forEach(([key, value]) => cookies.set(key, value))
                    ctx = {...ctx, ...ctxObj, cookies}
                    return null
                }, Promise.resolve(null))
                    
                const {default: handler} = await (globalThis as any).__blitzHandlers[blitzParam]
                ctx.headers.set("Content-Type", "application/json")
                const result = await handler(superjson.deserialize(await request.json()), ctx)
                return {cookies: ctx.cookies, headers: ctx.headers, ctx, result}
            } catch(error) {
                return {cookies: ctx.cookies, headers: ctx.headers, ctx, error}
            }
        }
    }
    
}

export type ClientCreator<args extends any[], Return = any> = (...args: args) => Return

export type ClientPlugin<T extends any> = ((cookies: T) => MaybePromise<() => Promise<{headers: {[key: string]: string}}>>)

export function initiateClientPlugin<T extends Promise<Awaited<ReturnType<ClientPlugin<any>>>[]>>(plugins: T) {
    if((typeof window === 'undefined')) return
    (globalThis as any).__clientPlugin = async () => {
        return (await Promise.all((await plugins).map(plugin => plugin()))).reduce((prev, next) => ({...prev, ...next}), {header: {}} as {header: {[key: string]: string}})
    }
}

export type Invoke = {
    <Func extends () => any>(func: Func): Promise<Awaited<ReturnType<Func>>>,
    <Func extends (parameter: null | undefined) => any>(func: Func): Promise<Awaited<ReturnType<Func>>>,
    <Func extends (parameter: any, ctx?: ViteBlitzCtx) => any>(func: Func, parameter: Parameters<Func>[0]): Promise<Awaited<ReturnType<Func>>>
    <Func extends (parameter?: any, ctx?: ViteBlitzCtx) => any>(func: Func, parameter: Parameters<Func>[0]): Promise<Awaited<ReturnType<Func>>>,
}
export const invoke= (async (func: (...args: any) => any, parameter: any) => {
    if((typeof window === 'undefined')) throw new Error("SSR is not supported, please wrap this code with if(!(typeof window === 'undefined')) {} block or use it where it may only ran on client")
    return await func(parameter, fetch as unknown as ViteBlitzCtx)
}) as Invoke
export function internalFetch(blitzParam: string) {
    return async (param: any, fetcoh: typeof globalThis.fetch = globalThis.fetch) => {

        const {headers} = (await (globalThis as any).__clientPlugin?.()) ?? {headers: {}}
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
