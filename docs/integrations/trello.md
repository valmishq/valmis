# Trello

Lets agents manage Trello boards, lists, and cards through the REST API. Authenticates with an API Key + API Token pair, both generated from the Trello Power-Up Admin Portal.

[Trello REST API documentation](https://developer.atlassian.com/cloud/trello/rest/)

## What you need

| Field     | Required | Notes  |
| --------- | -------- | ------ |
| API Key   | Yes      | Secret |
| API Token | Yes      | Secret |

## Getting your key and token

1. Open the [Trello Power-Up Admin Portal](https://trello.com/power-ups/admin).
2. Create a new Power-Up (name and workspace are enough — it exists only to hold your API key).
3. On the Power-Up's API key page, click **Generate a new API Key** and copy it.
4. Next to the API key, click the **Token** link, grant the requested permissions with your Trello account, and copy the resulting token.
5. Enter both values in the credential form.

The token authorizes the key to act as your Trello user — together they grant access to the boards your account can see.
