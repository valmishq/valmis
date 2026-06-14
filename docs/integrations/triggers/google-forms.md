# Google Forms App Trigger

Fire a [workflow](/guide/workflows) when a new response is submitted to a Google Form. Google Forms is **polled** for new responses, so there is no webhook to register — just a credential and the form id.

| | |
| --------------- | ------------------------------------------------------------------ |
| **Event**       | New form response                                                  |
| **Delivery**    | Polling (default every 60s, configurable in the builder)           |
| **Credential**  | [Google Forms](/integrations/google) (OAuth2) — `forms.responses.readonly` |
| **Payload**     | `{ formId, responseId, submittedAt, answers, raw }`                |

## Prerequisites

A [Google Forms credential](/integrations/google). Create it exactly like the other Google integrations (same OAuth client), and **enable the Google Forms API** in the Cloud project. It reads responses only (`forms.responses.readonly`).

## Add the trigger

1. In the workflow builder, add a **Google Forms** app trigger and choose **New form response**.
2. Pick the credential.
3. Set the **Form ID** — the value in the form's edit URL: `docs.google.com/forms/d/<FORM_ID>/edit`.
4. Optionally adjust the **poll interval** (seconds; default 60).

On activation the trigger records a baseline, so it only fires for responses submitted **after** you enable it — turning it on does not replay every past response.

## Payload

Each response is delivered as <code v-pre>{{trigger.payload}}</code>:

```json
{
  "formId": "1FAIpQL…",
  "responseId": "ACYDB…",
  "submittedAt": "2026-06-14T10:32:00.000Z",
  "answers": { "What is your name?": "Alice", "Rating": "5" },
  "raw": { "…": "the original Forms response resource" }
}
```

See also: the [Google integration page](/integrations/google) for creating the credential, and the [App Triggers overview](/integrations/triggers/) for the shared lifecycle and security model.
