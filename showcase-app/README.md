# Couchbase Data API Showcase

An interactive web application that demonstrates all three layers of the Couchbase Data API in a single UI — with a live API Inspector that shows every HTTP request as it happens.

## What It Demonstrates

| Section | API | Operations |
|---------|-----|------------|
| Document API | `v1/buckets/.../documents/{id}` | Create, Get, Update, Delete airports |
| Query API | `/_p/query/query/service` | SQL++ routes query, JOIN for airlines |
| Full-Text Search | `/_p/fts/api/.../index/{name}/query` | Geo-distance hotel search |

Every operation shows the exact URL, HTTP method, request body, response status, and response time in a right-hand API Inspector panel.

## Prerequisites

- Node.js 18+
- A Couchbase Capella cluster with the `travel-sample` bucket loaded
- The `hotel-geo-index` FTS index (for the nearby hotels feature — run `../scripts/create-fts-index.js` to create it)

## Getting Started

```bash
cd showcase-app
npm install
npm start
# Open http://localhost:3000
```

Set `PORT` to override the default port 3000.

## Usage

1. Enter your **Endpoint URL**, **Username**, and **Password** in the sidebar and click **Test Connection**.
2. Use the left sidebar to switch between **Document API**, **Query API**, and **Full-Text Search**.
3. Fill in the form and click the action button — the **API Inspector** on the right shows the live request and response.

### Quick test values (travel-sample)

| Field | Value |
|-------|-------|
| Airport document ID | `airport_1254` (San Francisco SFO) |
| Airport code (routes/airlines) | `SFO` |
| FTS airport ID | `airport_1254` |
| FTS search radius | `5km` |

## Architecture

```
browser  →  Express (server.js)  →  Couchbase Data API
              ↑
         Injects auth headers,
         returns both data and
         api_call metadata
```

The Express server accepts Couchbase credentials as request headers (`X-CB-Endpoint`, `X-CB-Username`, `X-CB-Password`), proxies each call to the Couchbase Data API, and returns a response envelope containing both the result data and a full description of the API call made — which the frontend renders in the Inspector panel.
