// See https://svelte.dev/docs/kit/types#app.d.ts
import type { User } from '@repo/types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: Omit<User, 'password'> | null;
			accessToken: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
