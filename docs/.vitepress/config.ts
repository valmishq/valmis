import { defineConfig } from 'vitepress';

export default defineConfig({
	title: 'Agent-Int',
	description:
		'Self-hosted AI agent platform — create LLM-powered agents that talk to your apps via chat, messaging channels, and automated workflows.',
	lang: 'en-US',
	lastUpdated: true,
	themeConfig: {
		nav: [
			{ text: 'Guide', link: '/guide/what-is-agent-int' },
			{ text: 'Integrations', link: '/integrations/' },
		],
		search: {
			provider: 'local',
		},
		socialLinks: [{ icon: 'github', link: 'https://github.com/wayneshn/agent-int' }],
		sidebar: {
			'/guide/': [
				{
					text: 'Introduction',
					items: [
						{ text: 'What is Agent-Int?', link: '/guide/what-is-agent-int' },
						{ text: 'Security Overview', link: '/guide/security' },
						{ text: 'Getting Started', link: '/guide/getting-started' },
					],
				},
				{
					text: 'Installation',
					items: [
						{ text: 'Install with Docker Compose', link: '/guide/installation' },
						{ text: 'Install from Source', link: '/guide/installation-from-source' },
						{ text: 'Configuration Reference', link: '/guide/configuration' },
					],
				},
				{
					text: 'Features',
					items: [
						{ text: 'Agents', link: '/guide/agents' },
						{ text: 'Chat', link: '/guide/chat' },
						{ text: 'Built-in Tools', link: '/guide/tools' },
						{ text: 'LLM Providers', link: '/guide/llm-providers' },
						{ text: 'Credentials', link: '/guide/credentials' },
						{ text: 'Skills', link: '/guide/skills' },
						{ text: 'Knowledge Base', link: '/guide/knowledge-base' },
						{ text: 'Agent Memory', link: '/guide/memory' },
						{ text: 'Workflows', link: '/guide/workflows' },
						{ text: 'Messaging Channels', link: '/guide/channels' },
						{ text: 'API Keys', link: '/guide/api-keys' },
					],
				},
			],
			'/integrations/': [
				{
					text: 'Integrations',
					items: [{ text: 'Overview', link: '/integrations/' }],
				},
				{
					text: 'Communication & Bots',
					items: [
						{ text: 'Discord Bot', link: '/integrations/discord-bot' },
						{ text: 'Microsoft Outlook', link: '/integrations/microsoft-outlook' },
						{ text: 'Pushover', link: '/integrations/pushover' },
						{ text: 'Slack', link: '/integrations/slack' },
						{ text: 'Telegram Bot', link: '/integrations/telegram-bot' },
					],
				},
				{
					text: 'Productivity & Docs',
					items: [
						{ text: 'Airtable', link: '/integrations/airtable' },
						{ text: 'Asana', link: '/integrations/asana' },
						{ text: 'Cal.com', link: '/integrations/cal-com' },
						{ text: 'Calendly', link: '/integrations/calendly' },
						{ text: 'Canva', link: '/integrations/canva' },
						{ text: 'Dropbox', link: '/integrations/dropbox' },
						{ text: 'Google (Gmail, Calendar, Docs, Sheets, Drive)', link: '/integrations/google' },
						{ text: 'Jira', link: '/integrations/jira' },
						{ text: 'Microsoft OneDrive', link: '/integrations/microsoft-onedrive' },
						{ text: 'Notion', link: '/integrations/notion' },
						{ text: 'Tally', link: '/integrations/tally' },
						{ text: 'Trello', link: '/integrations/trello' },
					],
				},
				{
					text: 'Business & Commerce',
					items: [
						{ text: 'HubSpot', link: '/integrations/hubspot' },
						{ text: 'Shopify', link: '/integrations/shopify' },
						{ text: 'Stripe', link: '/integrations/stripe' },
					],
				},
				{
					text: 'Developer & Data',
					items: [
						{ text: 'Alpha Vantage', link: '/integrations/alpha-vantage' },
						{ text: 'Cloudflare', link: '/integrations/cloudflare' },
						{ text: 'GitHub', link: '/integrations/github' },
						{ text: 'Google Maps', link: '/integrations/google-maps' },
						{ text: 'Pinecone', link: '/integrations/pinecone' },
						{ text: 'SEMrush', link: '/integrations/semrush' },
						{ text: 'SerpApi', link: '/integrations/serpapi' },
						{ text: 'Supabase', link: '/integrations/supabase' },
					],
				},
				{
					text: 'Social & Web',
					items: [
						{ text: 'Buffer', link: '/integrations/buffer' },
						{ text: 'OpenWeatherMap', link: '/integrations/openweathermap' },
						{ text: 'Reddit', link: '/integrations/reddit' },
					],
				},
				{
					text: 'Smart Home & Generic',
					items: [
						{ text: 'Home Assistant', link: '/integrations/home-assistant' },
						{ text: 'Generic HTTP Auth', link: '/integrations/http' },
					],
				},
			],
		},
		outline: { level: [2, 3] },
		footer: {
			message: 'Agent-Int — the AI agent that talks to your apps.',
		},
	},
});
