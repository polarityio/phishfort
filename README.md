# PhishFort Integration for Polarity

Polarity integration for **PhishFort** — domain takedown and incident management. The integration lets analysts instantly see the PhishFort takedown status of a domain, URL, IP, or email directly in the Polarity overlay, and submit actions without leaving the interface.

## Supported Entity Types

| Entity Type | PhishFort `incidentType` |
|---|---|
| Domain | `domain` |
| URL | `url` |
| IPv4 | `ipv4` |
| Email | `email` |

## Features

- **Real-time incident lookup** — checks existing PhishFort incidents for the entity via `GET /v1/incident/subject/{subject}`
- **Status color-coding** — 8-status taxonomy with distinct colors (Pending, Action Required, In Progress, Success, Failed, Blocklisted, Closed)
- **Takedown submission** — smart routing: submits new incident if none exists, or requests takedown on existing incident
- **Monitoring** — same smart routing for monitoring workflow
- **Mark Safe** — marks existing incident as safe/removed
- **Add Comment** — adds a comment to an existing incident with modal confirmation
- **Incident timeline** — visual 4-step progress indicator (Reported → Case Building → Takedown Started → Complete)
- **Incident history** — collapsible chronological event history
- **5-minute local cache** with automatic invalidation after write operations

## Installation

1. Install the integration on your Polarity server:
   ```bash
   cd /app/polarity-server/integrations
   git clone https://github.com/polarityio/phishfort
   cd phishfort
   npm install
   ```

2. Restart the Polarity server:
   ```bash
   systemctl restart polarity
   ```

3. In the Polarity web interface, navigate to **Integrations → PhishFort** and configure your API key.

## Integration Options

| Option | Required | Description |
|---|---|---|
| **PhishFort API Key** | Yes | Your PhishFort CAPI key (`x-api-key` header). Obtain from PhishFort support. |
| **Max Concurrent Requests** | No | Maximum simultaneous API requests. Default: 5. |

## API Reference

- **Base URL**: `https://capi.phishfort.com`
- **Auth**: `x-api-key` header
- **Primary lookup**: `GET /v1/incident/subject/{subject}`

## Notes

- The `statusVerbose` field is deprecated as of April 30, 2026 — only `status` is used
- Attachments (`POST /v1/incident/{id}/attach`) are out of scope
- The integration uses subject-based lookup (`/v1/incident/subject/{subject}`) — never the `/v1/incidents` list endpoint

## Version

`1.0.0` — Initial release

## License

MIT © Polarity
