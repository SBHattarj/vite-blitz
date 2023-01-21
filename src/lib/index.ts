import type { Plugin } from "vite"
import superjson from "superjson"

export function viteBlitz({rpcPathRegex = /\/\[\.\.\.blitz\]\/\+server.[tj]s/, extensions = ["ts", "js"], invokables = ["queries", "mutations"]}: {rpcPathRegex?: RegExp, extensions?: string[], invokables: string[]} = {}): Plugin {
   return {
        name: "vite-blitz",
	async load(id, env) {
            if(invokables.every(invokable => !id.includes(invokable)) || env.ssr) return
	    console.log(`// @no-check\nimport {internalFetch} from "${__filename}"/nexport default internalFetch("${new RegExp(`^.*\\/(${invokables.join("|")})\\/|\\.(${extensions.join("|")})$`, "g")}")`
)
	    return `// @no-check\nimport {internalFetch} from "${__filename}"\nexport default internalFetch("${id.replace(new RegExp(`^.*\\/(${invokables.join("|")})\\/|\\.(${extensions.join("|")})$`, "g"), "")}")`
	},
	async transform(code, id, env) {
	    console.log(id, rpcPathRegex.test(id))
            if(!rpcPathRegex.test(id) || !env.ssr) return
	    const {default: glob} = await import("glob")
	    
	    const newCode = `${code}\nglobalThis.__blitzHandlers = {\n${glob.sync(`*/**/@(${invokables.join("|")})/**/*.@(${extensions.join("|")})`).map(file => [file.replace(new RegExp(`^.*\\/(${invokables.join("|")})\\/|\\.(${extensions.join("|")})$`, "g"), ""), `${process.cwd()}/${file}`]).reduce((keyValueString, [key, value]) => `${keyValueString}    '${key}': import("${value}"),\n`, "")}\n}`
	    console.log(newCode)
	    return newCode
	}
   }
}

export interface ViteBlitzCtx {
    cookies: Cookies,
    headers: Headers
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
	    try {
                const result = handler(superjson.deserialize(await Request.json()), ctx)
	        return {cookies: ctx.cookies, headers: ctx.headers, ctx, result}
	    } catch(error) {
		return {cookies, headers: ctx.headers, ctx, error}
	    }
	    
	}
    }
    
}

export function internalFetch(blitzParam) {
    return async (param: any) => {
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
