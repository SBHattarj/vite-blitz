import { authClientPlugin } from "$lib/auth";
import { createClient } from "$lib/svelte";

export const {loadWithBlitz} = createClient({plugins: [authClientPlugin]})