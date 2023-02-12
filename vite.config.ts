import { sveltekit } from '@sveltejs/kit/vite';
import {viteBlitz} from 'vite-blitz'
import type { UserConfig } from 'vite';

const config: UserConfig = {
	plugins: [
		sveltekit(),
        viteBlitz(),
		{
			name: "",
			enforce: "pre",
			resolveId: (id: string) => console.log(id),
		}
	]
};

export default config;
