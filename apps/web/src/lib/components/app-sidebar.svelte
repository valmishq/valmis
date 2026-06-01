<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.store.js';
	import { themeStore } from '$lib/stores/theme.store.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import HouseIcon from '@lucide/svelte/icons/house';
	import KeyIcon from '@lucide/svelte/icons/key';
	import BotIcon from '@lucide/svelte/icons/bot';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import type { User } from '@repo/types';

	let { user }: { user: User } = $props();

	let isDark = $derived($themeStore === 'dark');

	const sidebar = useSidebar();
	let isExpanded = $derived(sidebar.state === 'expanded');

	/** Navigation items for the main menu */
	const navItems = [
		{ title: 'Home', url: '/app', icon: HouseIcon },
		{ title: 'Agents', url: '/app/agents', icon: BotIcon },
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

	<!-- Footer: dark mode toggle + user info + sign out -->
	<Sidebar.Footer>
		<Sidebar.Menu>
			<!-- Dark mode toggle: full row when expanded, switch-only when collapsed -->
			<Sidebar.MenuItem>
				{#if isExpanded}
					<div class="flex items-center gap-3 px-2 py-1.5">
						<MoonIcon class="size-4 shrink-0 text-muted-foreground" />
						<Label for="dark-mode-switch" class="flex-1 cursor-pointer text-sm">Dark Mode</Label>
						<Switch
							id="dark-mode-switch"
							class="data-unchecked:bg-foreground"
							checked={isDark}
							onCheckedChange={(checked) => themeStore.setTheme(checked ? 'dark' : 'light')}
						/>
					</div>
				{:else}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<div class="flex items-center justify-center px-2 py-1.5" {...props}>
									<Switch
										id="dark-mode-switch-collapsed"
										class="data-unchecked:bg-foreground"
										checked={isDark}
										onCheckedChange={(checked) => themeStore.setTheme(checked ? 'dark' : 'light')}
									/>
								</div>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="right" align="center">Dark Mode</Tooltip.Content>
					</Tooltip.Root>
				{/if}
			</Sidebar.MenuItem>

			<!-- Sign out -->
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
