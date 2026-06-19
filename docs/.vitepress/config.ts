import { defineConfig } from 'vitepress';

export default defineConfig({
	title: 'Valmis Docs',
	description:
		'Self-hosted AI agent platform — create LLM-powered agents that talk to your apps via chat, messaging channels, and automated workflows.',
	lang: 'en-US',
	// Served as a GitHub Pages project site at https://docs.valm.is,
	// so every asset/link must be prefixed with the repo name.
	base: '/',
	lastUpdated: true,
	themeConfig: {
		nav: [
			{ text: 'Guide', link: '/guide/what-is-valmis' },
			{ text: 'Integrations', link: '/integrations/' },
		],
		search: {
			provider: 'local',
		},
		socialLinks: [{ icon: 'github', link: 'https://github.com/valmishq/valmis' }],
		sidebar: {
			'/guide/': [
				{
					text: 'Introduction',
					items: [
						{ text: 'What is Valmis?', link: '/guide/what-is-valmis' },
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
						{ text: 'Web Browser', link: '/guide/browser' },
						{ text: 'LLM Providers', link: '/guide/llm-providers' },
						{ text: 'Credentials', link: '/guide/credentials' },
						{ text: 'Skills', link: '/guide/skills' },
						{ text: 'Knowledge Base', link: '/guide/knowledge-base' },
						{ text: 'Agent Memory', link: '/guide/memory' },
						{
							text: 'Workflows',
							collapsed: true,
							items: [
								{ text: 'Overview', link: '/guide/workflows/' },
								{ text: 'The visual builder', link: '/guide/workflows/builder' },
								{ text: 'Triggers', link: '/guide/workflows/triggers' },
								{ text: 'Agent steps', link: '/guide/workflows/steps' },
								{ text: 'Conditions', link: '/guide/workflows/conditions' },
								{ text: 'Loops', link: '/guide/workflows/loops' },
								{ text: 'Data flow & variables', link: '/guide/workflows/data-flow' },
								{ text: 'Runs & observability', link: '/guide/workflows/runs' },
								{ text: 'Managing from chat', link: '/guide/workflows/agent-chat' },
							],
						},
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
					text: 'Triggers (app events)',
					items: [
						{ text: 'Overview', link: '/integrations/triggers/' },
						{ text: 'Gmail', link: '/integrations/triggers/gmail' },
						{ text: 'Google Forms', link: '/integrations/triggers/google-forms' },
						{ text: 'Notion', link: '/integrations/triggers/notion' },
						{ text: 'Slack', link: '/integrations/triggers/slack' },
					],
				},
				{
					text: 'Communication & Bots',
					items: [
						{ text: 'Discord Bot', link: '/integrations/discord-bot' },
						{ text: 'Microsoft Outlook', link: '/integrations/microsoft-outlook' },
						{ text: 'Pushover', link: '/integrations/pushover' },
						{ text: 'Slack', link: '/integrations/slack' },
						{ text: 'Telegram Bot', link: '/integrations/telegram-bot' },
						{ text: 'Twilio', link: '/integrations/twilio' },
					],
				},
				{
					text: 'Customer Support & CRM',
					items: [
						{ text: 'ActiveCampaign', link: '/integrations/activecampaign' },
						{ text: 'Freshdesk', link: '/integrations/freshdesk' },
						{ text: 'Front', link: '/integrations/front' },
						{ text: 'Intercom', link: '/integrations/intercom' },
						{ text: 'Pipedrive', link: '/integrations/pipedrive' },
						{ text: 'Zendesk', link: '/integrations/zendesk' },
					],
				},
				{
					text: 'Email & Marketing',
					items: [
						{ text: 'Brevo', link: '/integrations/brevo' },
						{ text: 'Klaviyo', link: '/integrations/klaviyo' },
						{ text: 'Mailchimp', link: '/integrations/mailchimp' },
						{ text: 'Mailgun', link: '/integrations/mailgun' },
						{ text: 'Postmark', link: '/integrations/postmark' },
						{ text: 'Resend', link: '/integrations/resend' },
						{ text: 'SendGrid', link: '/integrations/sendgrid' },
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
						{ text: 'ClickUp', link: '/integrations/clickup' },
						{ text: 'Coda', link: '/integrations/coda' },
						{ text: 'Confluence', link: '/integrations/confluence' },
						{ text: 'Dropbox', link: '/integrations/dropbox' },
						{
							text: 'Google (Gmail, Calendar, Docs, Sheets, Drive, Forms)',
							link: '/integrations/google',
						},
						{ text: 'Jira', link: '/integrations/jira' },
						{ text: 'Linear', link: '/integrations/linear' },
						{ text: 'Microsoft OneDrive', link: '/integrations/microsoft-onedrive' },
						{ text: 'monday.com', link: '/integrations/monday' },
						{ text: 'Notion', link: '/integrations/notion' },
						{ text: 'Smartsheet', link: '/integrations/smartsheet' },
						{ text: 'Tally', link: '/integrations/tally' },
						{ text: 'Todoist', link: '/integrations/todoist' },
						{ text: 'Toggl Track', link: '/integrations/toggl' },
						{ text: 'Trello', link: '/integrations/trello' },
					],
				},
				{
					text: 'Content, CMS & Forms',
					items: [
						{ text: 'Contentful', link: '/integrations/contentful' },
						{ text: 'Ghost', link: '/integrations/ghost' },
						{ text: 'Typeform', link: '/integrations/typeform' },
						{ text: 'Webflow', link: '/integrations/webflow' },
						{ text: 'WordPress', link: '/integrations/wordpress' },
					],
				},
				{
					text: 'Design & Collaboration',
					items: [
						{ text: 'Figma', link: '/integrations/figma' },
						{ text: 'Miro', link: '/integrations/miro' },
					],
				},
				{
					text: 'Business & Commerce',
					items: [
						{ text: 'HubSpot', link: '/integrations/hubspot' },
						{ text: 'Shopify', link: '/integrations/shopify' },
						{ text: 'Square', link: '/integrations/square' },
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
			message: 'Valmis — the AI agent that talks to your apps.',
		},
	},
});
