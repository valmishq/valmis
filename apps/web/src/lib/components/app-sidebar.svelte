<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.store.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import HouseIcon from '@lucide/svelte/icons/house';
	import KeyIcon from '@lucide/svelte/icons/key';
	import BotIcon from '@lucide/svelte/icons/bot';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import type { User } from '@repo/types';

	let { user }: { user: User } = $props();

	/** Navigation items for the main menu */
	const navItems = [
		{ title: 'Home', url: '/app', icon: HouseIcon },
		{ title: 'LLM Providers', url: '/app/llm-providers', icon: CpuIcon },
		{ title: 'Credentials', url: '/app/credentials', icon: ShieldIcon },
		{ title: 'API Keys', url: '/app/api-keys', icon: KeyIcon }
	];

	function isActive(url: string): boolean {
		return page.url.pathname === url;
	}

	async function handleLogout() {
		authStore.logout();
		goto('/signin');
	}
</script>

<Sidebar.Root collapsible="icon">
	<!-- Header: app branding -->
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" class="pointer-events-none">
					<div
						class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
					>
						<BotIcon class="size-4" />
					</div>
					<div class="flex flex-col gap-0.5 leading-none">
						<span class="text-sm font-semibold">OpenAgent</span>
						<span class="text-xs text-muted-foreground">Integration Hub</span>
					</div>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<!-- Main navigation -->
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each navItems as item (item.title)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isActive(item.url)} tooltipContent={item.title}>
								{#snippet child({ props })}
									<a href={item.url} {...props}>
										<item.icon />
										<span>{item.title}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<!-- Footer: user info + sign out -->
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent="Sign out" onclick={handleLogout}>
					<LogOutIcon />
					<span class="truncate">{user.email}</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
