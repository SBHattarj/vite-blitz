import { sveltekit } from '@sveltejs/kit/vite';
import {viteBlitz} from './src/lib'
import type { UserConfig } from 'vite';

const config: UserConfig = {
	plugins: [
		sveltekit(),
	    viteBlitz({modifiers: []}),
	],
	
};

export default config;
