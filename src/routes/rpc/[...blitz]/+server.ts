import type {RequestHandler} from "./$types"
import superjson from "superjson"

export async function GET({params}) {
    console.log(params, __blitzHandlers)
    console.log((await __blitzHandlers[params.blitz]).default())
    return new Response("hello " + params.blitz)
}
export async function POST({params}) {
    console.log(params, __blitzHandlers)
    console.log((await __blitzHandlers[params.blitz]).default())
    return new Response(JSON.stringify(superjson.serialize(await (await __blitzHandlers[params.blitz]).default())))
}
