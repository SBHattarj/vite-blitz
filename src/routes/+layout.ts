import { loadWithBlitz } from "../client";
import a from "../queries/a";

export const load = loadWithBlitz(async event => {
    console.log("load", await event.invoke(a))
    return {}
})