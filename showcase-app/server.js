import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const BUCKET = 'travel-sample';
const SCOPE = 'inventory';
const COLLECTION = 'airport';

function getCredentials(req) {
    const endpoint = req.headers['x-cb-endpoint'];
    const username = req.headers['x-cb-username'];
    const password = req.headers['x-cb-password'];
    if (!endpoint || !username || !password) return null;
    return { endpoint: endpoint.replace(/\/$/, ''), username, password };
}

function buildAuth(username, password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function docUrl(endpoint, docId) {
    return `${endpoint}/v1/buckets/${BUCKET}/scopes/${SCOPE}/collections/${COLLECTION}/documents/${encodeURIComponent(docId)}`;
}

function queryUrl(endpoint) {
    return `${endpoint}/_p/query/query/service`;
}

function ftsUrl(endpoint, indexName) {
    return `${endpoint}/_p/fts/api/bucket/${BUCKET}/scope/${SCOPE}/index/${encodeURIComponent(indexName)}/query`;
}

function missingCreds(res) {
    return res.status(400).json({ error: 'Missing credentials. Set X-CB-Endpoint, X-CB-Username, X-CB-Password headers.' });
}

async function proxyRequest(url, options) {
    const start = Date.now();
    const fetchRes = await fetch(url, options);
    const duration = Date.now() - start;
    const text = await fetchRes.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: fetchRes.status, ok: fetchRes.ok, body, duration };
}

// POST /api/airports — create airport
app.post('/api/airports', async (req, res) => {
    const creds = getCredentials(req);
    if (!creds) return missingCreds(res);

    const airportData = { ...req.body };
    const airportId = airportData.id;
    if (!airportId) return res.status(400).json({ error: 'Request body must include an "id" field' });
    delete airportData.id;

    const url = docUrl(creds.endpoint, airportId);
    const requestBody = JSON.stringify(airportData);
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': buildAuth(creds.username, creds.password)
    };

    try {
        const result = await proxyRequest(url, { method: 'POST', headers, body: requestBody });

        res.status(result.ok ? 201 : result.status).json({
            data: result.ok ? { id: airportId, ...airportData } : null,
            error: result.ok ? null : result.body,
            api_call: {
                method: 'POST', url,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', Authorization: 'Basic ***' },
                body: airportData,
                response_status: result.status,
                response_body: result.body,
                duration_ms: result.duration
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/airports/:id — get airport
app.get('/api/airports/:id', async (req, res) => {
    const creds = getCredentials(req);
    if (!creds) return missingCreds(res);

    const url = docUrl(creds.endpoint, req.params.id);
    const headers = { 'Accept': 'application/json', 'Authorization': buildAuth(creds.username, creds.password) };

    try {
        const result = await proxyRequest(url, { method: 'GET', headers });

        res.status(result.ok ? 200 : result.status).json({
            data: result.ok ? result.body : null,
            error: result.ok ? null : result.body,
            api_call: {
                method: 'GET', url,
                headers: { 'Accept': 'application/json', Authorization: 'Basic ***' },
                body: null,
                response_status: result.status,
                response_body: result.body,
                duration_ms: result.duration
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/airports/:id — update airport
app.put('/api/airports/:id', async (req, res) => {
    const creds = getCredentials(req);
    if (!creds) return missingCreds(res);

    const url = docUrl(creds.endpoint, req.params.id);
    const requestBody = JSON.stringify(req.body);
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': buildAuth(creds.username, creds.password)
    };

    try {
        const result = await proxyRequest(url, { method: 'PUT', headers, body: requestBody });

        res.status(result.ok ? 200 : result.status).json({
            data: result.ok ? { id: req.params.id, ...req.body } : null,
            error: result.ok ? null : result.body,
            api_call: {
                method: 'PUT', url,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', Authorization: 'Basic ***' },
                body: req.body,
                response_status: result.status,
                response_body: result.body,
                duration_ms: result.duration
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/airports/:id — delete airport
app.delete('/api/airports/:id', async (req, res) => {
    const creds = getCredentials(req);
    if (!creds) return missingCreds(res);

    const url = docUrl(creds.endpoint, req.params.id);
    const headers = { 'Accept': 'application/json', 'Authorization': buildAuth(creds.username, creds.password) };

    try {
        const result = await proxyRequest(url, { method: 'DELETE', headers });

        res.status(result.ok ? 200 : result.status).json({
            data: result.ok ? { deleted: true, id: req.params.id } : null,
            error: result.ok ? null : result.body,
            api_call: {
                method: 'DELETE', url,
                headers: { 'Accept': 'application/json', Authorization: 'Basic ***' },
                body: null,
                response_status: result.status,
                response_body: result.body,
                duration_ms: result.duration
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/airports/:code/routes
app.get('/api/airports/:code/routes', async (req, res) => {
    const creds = getCredentials(req);
    if (!creds) return missingCreds(res);

    const airportCode = req.params.code;
    const limit = parseInt(req.query.limit) || 10;
    const url = queryUrl(creds.endpoint);
    const statement = `SELECT r.* FROM \`${BUCKET}\`.\`${SCOPE}\`.route r WHERE r.sourceairport = $code OR r.destinationairport = $code ORDER BY r.sourceairport, r.destinationairport LIMIT ${limit}`;
    const requestBody = JSON.stringify({ statement, args: [airportCode, airportCode] });
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': buildAuth(creds.username, creds.password)
    };

    try {
        const result = await proxyRequest(url, { method: 'POST', headers, body: requestBody });

        res.status(result.ok ? 200 : result.status).json({
            data: result.ok ? { routes: result.body.results, metrics: result.body.metrics } : null,
            error: result.ok ? null : result.body,
            api_call: {
                method: 'POST', url,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', Authorization: 'Basic ***' },
                body: { statement, args: [airportCode, airportCode] },
                response_status: result.status,
                response_body: result.body,
                duration_ms: result.duration
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/airports/:code/airlines
app.get('/api/airports/:code/airlines', async (req, res) => {
    const creds = getCredentials(req);
    if (!creds) return missingCreds(res);

    const airportCode = req.params.code;
    const url = queryUrl(creds.endpoint);
    const statement = `SELECT DISTINCT al.name, al.iata, al.icao, al.country FROM \`${BUCKET}\`.\`${SCOPE}\`.route r JOIN \`${BUCKET}\`.\`${SCOPE}\`.airline al ON r.airlineid = META(al).id WHERE r.sourceairport = $code OR r.destinationairport = $code ORDER BY al.name LIMIT 20`;
    const requestBody = JSON.stringify({ statement, args: [airportCode, airportCode] });
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': buildAuth(creds.username, creds.password)
    };

    try {
        const result = await proxyRequest(url, { method: 'POST', headers, body: requestBody });

        res.status(result.ok ? 200 : result.status).json({
            data: result.ok ? { airlines: result.body.results, metrics: result.body.metrics } : null,
            error: result.ok ? null : result.body,
            api_call: {
                method: 'POST', url,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', Authorization: 'Basic ***' },
                body: { statement, args: [airportCode, airportCode] },
                response_status: result.status,
                response_body: result.body,
                duration_ms: result.duration
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/airports/:id/hotels/nearby/:distance
app.get('/api/airports/:id/hotels/nearby/:distance', async (req, res) => {
    const creds = getCredentials(req);
    if (!creds) return missingCreds(res);

    const { id: airportId, distance } = req.params;
    const headers = { 'Accept': 'application/json', 'Authorization': buildAuth(creds.username, creds.password) };

    try {
        // Step 1: fetch airport coordinates
        const airportResult = await proxyRequest(docUrl(creds.endpoint, airportId), { method: 'GET', headers });
        if (!airportResult.ok) {
            return res.status(airportResult.status).json({
                error: `Airport not found: ${airportId}`,
                api_call: { method: 'GET', url: docUrl(creds.endpoint, airportId), response_status: airportResult.status }
            });
        }

        const { lat, lon } = airportResult.body.geo;

        // Step 2: FTS geo query
        const ftsQuery = {
            from: 0, size: 20,
            query: { location: { lon, lat }, distance, field: 'geo' },
            sort: [{ by: 'geo_distance', field: 'geo', unit: 'km', location: { lon, lat } }],
            fields: ['*'],
            includeLocations: false
        };

        const ftsReqUrl = ftsUrl(creds.endpoint, 'hotel-geo-index');
        const ftsRequestBody = JSON.stringify(ftsQuery);
        const ftsHeaders = { ...headers, 'Content-Type': 'application/json' };
        const ftsResult = await proxyRequest(ftsReqUrl, { method: 'POST', headers: ftsHeaders, body: ftsRequestBody });

        const hotels = ftsResult.ok
            ? (ftsResult.body.hits || []).map(h => ({ ...h.fields, score: h.score }))
            : [];

        res.status(ftsResult.ok ? 200 : ftsResult.status).json({
            data: ftsResult.ok ? {
                airport: {
                    id: airportId,
                    name: airportResult.body.airportname,
                    city: airportResult.body.city,
                    country: airportResult.body.country,
                    coordinates: { lat, lon }
                },
                search_criteria: { distance },
                total_hotels_found: ftsResult.body.total_hits || 0,
                hotels
            } : null,
            error: ftsResult.ok ? null : ftsResult.body,
            api_call: {
                step1: {
                    label: 'Get airport coordinates (Document API)',
                    method: 'GET',
                    url: docUrl(creds.endpoint, airportId),
                    headers: { 'Accept': 'application/json', Authorization: 'Basic ***' },
                    body: null,
                    response_status: airportResult.status,
                    duration_ms: airportResult.duration
                },
                step2: {
                    label: 'Geo-distance search (Full-Text Search API)',
                    method: 'POST',
                    url: ftsReqUrl,
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', Authorization: 'Basic ***' },
                    body: ftsQuery,
                    response_status: ftsResult.status,
                    response_body: ftsResult.body,
                    duration_ms: ftsResult.duration
                }
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Couchbase Data API Showcase running at http://localhost:${PORT}`);
});
