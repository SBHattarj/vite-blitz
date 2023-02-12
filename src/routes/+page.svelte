<script>
    import a from "../queries/a"
    import "vite-blitz/auth"
    import { invoke } from "vite-blitz";
    if(!(typeof window === 'undefined')) (async () => console.log(await invoke(a, undefined)))()
</script>
<button on:click={async () => console.log(await a())}>button</button>
<h1>Welcome to your library project</h1>
<p>Create your package using @sveltejs/package and preview/showcase your work with SvelteKit</p>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
