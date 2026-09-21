# Contractor bids, text replies, and weather holds

The contractor desk saves bid-request drafts, collects signed incoming text replies, and records weather holds explicitly confirmed by an approved workspace user. Creating a draft or hold does not send a message, accept a quote, cancel a job, or change a payment. Clerk sign-in and the existing staff allowlist protect the desk and its records.

## Request a contractor quote

Choose the project, trade, request title, scope, optional quote due date, and contact. US phone numbers can use ordinary punctuation; the server stores them in international format. Contacts outside the US need a `+` country code. A due date must be today or within the next year, using Albuquerque's local date.

Saving creates a `Draft` with a reference such as `BID-A1B2C3D4`. Review the prepared text before sending it from your phone. The reference belongs in the contractor's response so the app can match it to the correct request. Saving and opening a phone's compose window do not prove a message was sent or delivered.

**A text composed on your phone comes from your phone number.** An ordinary reply goes back to that phone, not to this app. When inbound Twilio is configured, the prepared request tells the contractor to send their quote to the workspace's Twilio number and include the request reference. Only texts received on that Twilio number reach the platform inbox. Automatic outbound Twilio messaging is not part of this workflow.

## Connect the incoming-message inbox

1. Use a Twilio account and SMS-capable number you control. Set these values privately in the server environment:

   | Variable | Value |
   | --- | --- |
   | `TWILIO_ACCOUNT_SID` | The `AC...` account owning the receiving number |
   | `TWILIO_AUTH_TOKEN` | That account's auth token; keep it on the server |
   | `TWILIO_FROM_NUMBER` | The receiving Twilio number in `+` international format |
   | `TWILIO_INBOUND_URL` | Exact public HTTPS address ending in `/api/contractor-desk/sms/inbound` |

2. In the Twilio number's incoming-message configuration, set **A message comes in** to a webhook, use that exact HTTPS URL, and select **POST**. If the URL includes a query, preserve it exactly in both places. Localhost alone is not reachable by Twilio; use the project's deployed HTTPS server or an explicitly configured development tunnel.
3. Restart the server. An approved staff session can read `/api/contractor-desk/status`; it exposes only whether inbound settings are valid, the receiving number, and missing variable names. “Configured” checks local settings and is not proof of a delivered provider message.
4. Create a sample request for your own test phone. From that phone, send the reference and a sample quote to the Twilio number. Confirm the inbox shows the request, project, sender, full text, and **Needs review**. Repeat provider delivery to verify a message appears only once.
5. Send a text without the reference or from a different contact phone. It should remain unassigned for staff review. A reference alone does not establish the sender's identity.

The server validates `X-Twilio-Signature` using Twilio's SDK, the exact configured URL, and every received form field. It also checks the account and destination number. Forwarded host headers are not used to construct the validation URL. This follows [Twilio's webhook security guidance](https://www.twilio.com/docs/usage/webhooks/webhooks-security).

Incoming text is retained as text; quoted prices are never automatically accepted or converted into invoices. Attachments are not downloaded; media-only messages retain their media count for review in Twilio. Multiple bid references, unknown references, deleted projects, and mismatched senders remain unassigned.

Approved staff can assign an inbox message to the selected job and mark it **Reviewed**. The original sender, message, reference, and provider identifier stay intact. Reassigning it to another job clears any bid link belonging to the previous job. Reviewing a message does not accept its quoted price or send a reply.

Twilio receives an empty XML response with no automatic reply. STOP/START and equivalent opt-out events update the stored contact preference. New bid drafts for an opted-out number are refused until a valid START/UNSTOP event is received. Twilio may separately apply its own opt-out handling; staff must respect contact preferences when using a personal phone too.

## Confirm a weather hold

On the mobile contractor screen, choose a trade, update the four-day forecast, select **Plan a day off**, and confirm the crew note. Stale or missing forecasts require a refresh before this screen will confirm a hold. The underlying staff API also accepts a manually supplied date from today through ten days ahead in Albuquerque, with a reason. Saving records a **Confirmed** hold and prepares a schedule-update message for staff review. This is a staff scheduling decision; it does not automatically cancel work, send texts, or infer an official warning from a forecast. The API can record a manual decision about observed site conditions independently of a provider connection; the forecast-based screen deliberately requires fresh forecast data.

Use **Remove day off** when the hold is no longer needed. It marks the hold **Cancelled** and retains its note, date, and cancellation timestamp. Repeating the action has no additional effect. It does not modify a master job schedule or notify the crew; confirm the revised plan separately.

## Storage and verification

Requests, incoming messages, opt-out preferences, and holds live in the existing command-center JSON store. Their dedicated endpoints serialize updates with other saves. Generic command-center updates cannot replace these owned collections. Twilio `MessageSid` deduplicates incoming retries; collections are retained rather than silently truncated. At 10,000 requests, holds, or incoming messages per collection, new records return an error so an operator can plan archival before proceeding. Any future archival must retain message identifiers needed for deduplication.

Supplier imports also operate on the latest saved state, preserving incoming texts and contractor records received while an import is pending. The existing explicit command-center **reset** remains destructive: it restores starter data and deletes these collections along with other workspace records. Do not use reset to refresh the inbox.

Run one server process against this JSON store. Multiple independent server instances need a shared transactional database before receiving production webhooks. Back up the private store and keep it outside Git.

Regression coverage uses temporary stores, ephemeral Clerk signing keys, and locally generated Twilio signatures. It covers staff authorization, input bounds, signature tampering, unknown senders, retries, concurrent saves, ownership guards, and STOP/START without contacting Twilio. Live inbound delivery still requires private account configuration and an actual provider acceptance check.

## Mobile workspace

Jobs, Bids, and Messages are the primary navigation. The current job, four weather cards, trade bid drafts, and job inbox appear first. Customer estimates, invoices and other office tools remain accessible through Menu and the expandable office section. Incoming messages without a reliable bid match remain unassigned until staff choose the job explicitly. Older bids and texts can be loaded with **Show more**. Confirmed holds remain visible on their actual day; past and cancelled decisions remain in history, without offering the outdated crew text as a current instruction.

Responsive verification used the actual React workspace with isolated sample data at 320, 375, 414, 768, 1024 and 1440 pixels. Private workspace access and live texts still require Clerk and Twilio configuration. [NWS weather](nws-weather-setup.md) is the default and needs no weather credentials; optional Apple Weather requires its separate setup. No real text was sent and no real job record changed during this check.
