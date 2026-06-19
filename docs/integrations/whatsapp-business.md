# WhatsApp Business Cloud

Lets agents use the **WhatsApp Business Cloud API** (Meta) — **send messages and templates, and read your business phone numbers**. Authenticates with a long-lived access token sent as a Bearer token.

[WhatsApp Business Cloud API documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)

## What you need

| Field                       | Required | Notes                                                                |
| --------------------------- | -------- | -------------------------------------------------------------------- |
| Access Token                | Yes      | Secret — a System User (or permanent) token                          |
| Phone Number ID             | Yes      | The node id used to send messages (not the phone number itself)      |
| WhatsApp Business Account ID | Yes     | Your WABA id — used for templates and listing phone numbers          |
| Graph API Version           | Yes      | e.g. `v23.0` — bump as Meta releases new versions                    |

## Getting your credentials

1. In [Meta for Developers](https://developers.facebook.com/), open your app's **WhatsApp → API Setup**.
2. Copy the **Phone number ID** and **WhatsApp Business Account ID** shown there.
3. For a permanent token, create a **System User** in [Meta Business Settings](https://business.facebook.com/settings) with the **whatsapp_business_messaging** and **whatsapp_business_management** permissions, assign your app, and generate a token. Copy it into the credential form.
4. Set **Graph API Version** (e.g. `v23.0`).

::: warning Use a long-lived token
The temporary token on the API Setup page expires in about 24 hours. For an agent, generate a **System User** token (permanent) instead so the credential keeps working.
:::

::: tip Sending requires an approved template (for new conversations)
WhatsApp only allows free-form messages within a 24-hour customer-service window. To start a conversation, the agent must send an approved **message template**. Create templates in WhatsApp Manager first.
:::

## Example prompts

Once the credential is attached to an agent, you can ask:

- "What's the display name and quality rating of our WhatsApp number?"
- "Send the 'order_confirmation' template to +1 555 010 1234 with their order number."
- "List the message templates approved on our WhatsApp Business Account."
