import { createApi } from "vite-blitz/svelte";
import { handler } from "../../../server.js";

export const POST = createApi(handler)