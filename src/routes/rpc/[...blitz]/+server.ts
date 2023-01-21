import { createApi } from "$lib/svelte";
import { handler } from "../../../server";

export const POST = createApi(handler)