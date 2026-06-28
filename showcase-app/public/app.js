// ── Credential management ────────────────────────────────────
function getCredHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-cb-endpoint': document.getElementById('endpoint').value.trim(),
        'x-cb-username': document.getElementById('username').value.trim(),
        'x-cb-password': document.getElementById('password').value.trim()
    };
}

function credentialsSet() {
    return (
        document.getElementById('endpoint').value.trim() &&
        document.getElementById('username').value.trim() &&
        document.getElementById('password').value.trim()
    );
}

// Persist creds to sessionStorage on input
['endpoint', 'username', 'password'].forEach(id => {
    const el = document.getElementById(id);
    const stored = sessionStorage.getItem('cb_' + id);
    if (stored) el.value = stored;
    el.addEventListener('input', () => sessionStorage.setItem('cb_' + id, el.value));
});

// ── Test Connection ──────────────────────────────────────────
async function testConnection() {
    if (!credentialsSet()) { toast('Enter endpoint, username, and password first', 'err'); return; }
    setConnStatus('testing', 'Testing...');
    try {
        // Try fetching a known airport doc
        const res = await fetch('/api/airports/airport_1254', { headers: getCredHeaders() });
        const json = await res.json();
        if (json.data || res.ok) {
            setConnStatus('connected', 'Connected');
            toast('Connection successful!', 'ok');
        } else {
            setConnStatus('error', 'Auth error');
            toast('Connection failed — check credentials', 'err');
        }
    } catch (e) {
        setConnStatus('error', 'Failed');
        toast('Connection error: ' + e.message, 'err');
    }
}

function setConnStatus(state, label) {
    const el = document.getElementById('conn-status');
    el.className = 'conn-status ' + state;
    el.querySelector('.status-label').textContent = label;
}

// ── Navigation ───────────────────────────────────────────────
function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('section-' + name).classList.add('active');
    document.querySelector(`[data-section="${name}"]`).classList.add('active');
}

function showOp(section, op, btn) {
    const prefix = section + '-op-';
    document.querySelectorAll(`[id^="${prefix}"]`).forEach(p => p.classList.remove('active'));
    document.getElementById(prefix + op).classList.add('active');
    btn.closest('.ops-tabs').querySelectorAll('.op-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// ── API helpers ──────────────────────────────────────────────
async function callAPI(method, path, body) {
    if (!credentialsSet()) { toast('Enter credentials first', 'err'); return null; }
    const opts = { method, headers: getCredHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
        const res = await fetch(path, opts);
        return await res.json();
    } catch (e) {
        toast('Network error: ' + e.message, 'err');
        return null;
    }
}

// ── Inspector rendering ──────────────────────────────────────
function renderInspector(containerId, result, opMeta) {
    const container = document.getElementById(containerId);
    if (!result) { container.innerHTML = '<div class="inspector-empty-state"><p style="color:#f87171">Request failed — check console</p></div>'; return; }

    const call = result.api_call;
    const isOk = result.data !== null && result.data !== undefined;
    const statusCode = call.step2 ? call.step2.response_status : call.response_status;
    const totalDuration = call.step1 ? (call.step1.duration_ms + call.step2.duration_ms) : call.duration_ms;

    let html = `
      <div class="inspector-toolbar">
        <span class="inspector-title">API Inspector</span>
        <span class="status-chip ${isOk ? 'ok' : 'err'}">
          HTTP ${statusCode}
          <span class="dur">${totalDuration}ms</span>
        </span>
      </div>
      <div class="inspector-body">
    `;

    // Multi-step (FTS)
    if (call.step1) {
        html += renderStep(call.step1, 1) + renderStep(call.step2, 2);
    } else {
        html += renderCallBlock(call);
    }

    // Result data
    if (result.data) {
        html += renderDataBlock(result.data, opMeta);
    } else if (result.error) {
        html += `<div class="block">
          <div class="block-header" onclick="toggleBlock(this)">
            <span class="block-title" style="color:#f87171">⚠ Error Response</span>
            <span class="block-toggle">▾</span>
          </div>
          <div class="block-content"><pre>${syntaxHighlight(result.error)}</pre></div>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

function renderStep(step, num) {
    return `
      <div class="step-label"><span>${num}</span> ${step.label}</div>
      ${renderCallBlock(step)}
    `;
}

function renderCallBlock(call) {
    const urlParts = parseUrl(call.url);
    const headersFiltered = { ...call.headers };
    delete headersFiltered.Authorization;
    headersFiltered.Authorization = 'Basic ***';

    return `
      <div class="url-display">
        <span class="url-method"><span class="method-badge method-${call.method.toLowerCase()}">${call.method}</span></span>
        <span class="url-text">
          <span class="url-scheme">${urlParts.scheme}://</span><span class="url-host">${urlParts.host}</span><span class="url-path">${urlParts.path}</span>
        </span>
      </div>
      ${call.body ? `
      <div class="block collapsed">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-title">Request Body</span>
          <span class="block-toggle">▾</span>
        </div>
        <div class="block-content"><pre>${syntaxHighlight(call.body)}</pre></div>
      </div>` : ''}
    `;
}

function renderDataBlock(data, opMeta) {
    if (opMeta && opMeta.type === 'routes') {
        return renderRoutesTable(data);
    }
    if (opMeta && opMeta.type === 'airlines') {
        return renderAirlinesTable(data);
    }
    if (opMeta && opMeta.type === 'hotels') {
        return renderHotelsResult(data);
    }
    return `
      <div class="block">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-title" style="color:var(--green)">✓ Response</span>
          <span class="block-toggle">▾</span>
        </div>
        <div class="block-content"><pre>${syntaxHighlight(data)}</pre></div>
      </div>
    `;
}

function renderRoutesTable(data) {
    const routes = data.routes || [];
    if (!routes.length) return '<div class="block-content" style="color:var(--text-muted);font-size:12px">No routes found.</div>';
    const cols = ['airline', 'sourceairport', 'destinationairport', 'stops', 'equipment'];
    return `
      <div class="block">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-title" style="color:var(--green)">✓ ${routes.length} Route${routes.length !== 1 ? 's' : ''} Found</span>
          <span class="block-toggle">▾</span>
        </div>
        <div class="block-content" style="padding:0;overflow-x:auto">
          <table class="results-table">
            <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${routes.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          ${renderMetrics(data.metrics)}
        </div>
      </div>`;
}

function renderAirlinesTable(data) {
    const airlines = data.airlines || [];
    if (!airlines.length) return '<div class="block-content" style="color:var(--text-muted);font-size:12px">No airlines found.</div>';
    const cols = ['name', 'iata', 'icao', 'country'];
    return `
      <div class="block">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-title" style="color:var(--green)">✓ ${airlines.length} Airline${airlines.length !== 1 ? 's' : ''} Found</span>
          <span class="block-toggle">▾</span>
        </div>
        <div class="block-content" style="padding:0;overflow-x:auto">
          <table class="results-table">
            <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${airlines.map(a => `<tr>${cols.map(c => `<td>${a[c] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          ${renderMetrics(data.metrics)}
        </div>
      </div>`;
}

function renderHotelsResult(data) {
    const hotels = data.hotels || [];
    const airport = data.airport || {};
    let html = `
      <div class="block">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-title" style="color:var(--purple)">Airport: ${airport.name || airport.id}</span>
          <span class="block-toggle">▾</span>
        </div>
        <div class="block-content"><pre>${syntaxHighlight(airport)}</pre></div>
      </div>
    `;
    if (!hotels.length) {
        html += '<div style="padding:12px;color:var(--text-muted);font-size:12px">No hotels found within search radius. Try increasing the distance or check the FTS index.</div>';
        return html;
    }
    const cols = ['name', 'city', 'country', 'score'];
    html += `
      <div class="block">
        <div class="block-header" onclick="toggleBlock(this)">
          <span class="block-title" style="color:var(--green)">✓ ${data.total_hotels_found} Hotel${data.total_hotels_found !== 1 ? 's' : ''} Found (${data.search_criteria.distance} radius)</span>
          <span class="block-toggle">▾</span>
        </div>
        <div class="block-content" style="padding:0;overflow-x:auto">
          <table class="results-table">
            <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${hotels.map(h => `<tr>${cols.map(c => `<td>${c === 'score' ? (h[c] !== undefined ? Number(h[c]).toFixed(4) : '—') : (h[c] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;
    return html;
}

function renderMetrics(metrics) {
    if (!metrics) return '';
    return `<div class="metrics">
      <div class="metric"><span class="metric-label">Results</span><span class="metric-value">${metrics.resultCount ?? '—'}</span></div>
      <div class="metric"><span class="metric-label">Execution</span><span class="metric-value">${metrics.executionTime ?? '—'}</span></div>
      <div class="metric"><span class="metric-label">Service</span><span class="metric-value">${metrics.serviceLoad ?? '—'}</span></div>
    </div>`;
}

function toggleBlock(header) {
    header.closest('.block').classList.toggle('collapsed');
}

function parseUrl(url) {
    try {
        const u = new URL(url);
        return { scheme: u.protocol.replace(':', ''), host: u.host, path: u.pathname + u.search };
    } catch {
        return { scheme: '', host: url, path: '' };
    }
}

function syntaxHighlight(obj) {
    const json = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            cls = /:$/.test(match) ? 'json-key' : 'json-string';
        } else if (/true|false/.test(match)) {
            cls = 'json-bool';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return `<span class="${cls}">${match}</span>`;
    });
}

function setLoading(inspectorId) {
    const el = document.getElementById(inspectorId);
    el.classList.remove('empty');
    el.innerHTML = `<div class="inspector-empty-state">
      <div class="spinner"></div>
      <p>Calling Couchbase Data API...</p>
    </div>`;
}

// ── Document API operations ───────────────────────────────────
async function runCreateAirport() {
    let body;
    try { body = JSON.parse(document.getElementById('create-body').value); }
    catch { toast('Invalid JSON in document body', 'err'); return; }
    setLoading('inspector-doc-create');
    const result = await callAPI('POST', '/api/airports', body);
    renderInspector('inspector-doc-create', result);
    if (result?.data) toast('Airport created successfully', 'ok');
    else if (result?.error) toast('Create failed', 'err');
}

async function runGetAirport() {
    const id = document.getElementById('get-id').value.trim();
    if (!id) { toast('Enter an airport document ID', 'err'); return; }
    setLoading('inspector-doc-get');
    const result = await callAPI('GET', `/api/airports/${encodeURIComponent(id)}`);
    renderInspector('inspector-doc-get', result);
    if (result?.data) toast('Document retrieved', 'ok');
    else if (result?.error) toast('Document not found', 'err');
}

async function runUpdateAirport() {
    const id = document.getElementById('update-id').value.trim();
    if (!id) { toast('Enter an airport document ID', 'err'); return; }
    let body;
    try { body = JSON.parse(document.getElementById('update-body').value); }
    catch { toast('Invalid JSON in document body', 'err'); return; }
    setLoading('inspector-doc-update');
    const result = await callAPI('PUT', `/api/airports/${encodeURIComponent(id)}`, body);
    renderInspector('inspector-doc-update', result);
    if (result?.data) toast('Airport updated', 'ok');
    else if (result?.error) toast('Update failed', 'err');
}

async function runDeleteAirport() {
    const id = document.getElementById('delete-id').value.trim();
    if (!id) { toast('Enter an airport document ID', 'err'); return; }
    setLoading('inspector-doc-delete');
    const result = await callAPI('DELETE', `/api/airports/${encodeURIComponent(id)}`);
    renderInspector('inspector-doc-delete', result);
    if (result?.data) toast('Airport deleted', 'ok');
    else if (result?.error) toast('Delete failed', 'err');
}

// ── Query API operations ─────────────────────────────────────
async function runGetRoutes() {
    const code = document.getElementById('routes-code').value.trim();
    const limit = document.getElementById('routes-limit').value || 10;
    if (!code) { toast('Enter an airport code', 'err'); return; }
    // Update preview
    document.getElementById('routes-query-preview').textContent =
        `SELECT r.*\nFROM \`travel-sample\`.\`inventory\`.route r\nWHERE r.sourceairport = $code\n   OR r.destinationairport = $code\nORDER BY r.sourceairport, r.destinationairport\nLIMIT ${limit}`;
    setLoading('inspector-query-routes');
    const result = await callAPI('GET', `/api/airports/${encodeURIComponent(code)}/routes?limit=${limit}`);
    renderInspector('inspector-query-routes', result, { type: 'routes' });
    if (result?.data) toast(`Found ${result.data.routes?.length || 0} routes`, 'ok');
    else if (result?.error) toast('Query failed', 'err');
}

async function runGetAirlines() {
    const code = document.getElementById('airlines-code').value.trim();
    if (!code) { toast('Enter an airport code', 'err'); return; }
    setLoading('inspector-query-airlines');
    const result = await callAPI('GET', `/api/airports/${encodeURIComponent(code)}/airlines`);
    renderInspector('inspector-query-airlines', result, { type: 'airlines' });
    if (result?.data) toast(`Found ${result.data.airlines?.length || 0} airlines`, 'ok');
    else if (result?.error) toast('Query failed', 'err');
}

// ── FTS operation ─────────────────────────────────────────────
async function runFTSSearch() {
    const id = document.getElementById('fts-airport-id').value.trim();
    const val = document.getElementById('fts-distance-val').value;
    const unit = document.getElementById('fts-distance-unit').value;
    if (!id) { toast('Enter an airport document ID', 'err'); return; }
    const distance = `${val}${unit}`;
    setLoading('inspector-fts');
    const result = await callAPI('GET', `/api/airports/${encodeURIComponent(id)}/hotels/nearby/${encodeURIComponent(distance)}`);
    renderInspector('inspector-fts', result, { type: 'hotels' });
    if (result?.data) toast(`Found ${result.data.total_hotels_found} hotels within ${distance}`, 'ok');
    else if (result?.error) toast('FTS search failed', 'err');
}

// ── Toast ────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show toast-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ── Enter key on inputs ──────────────────────────────────────
document.getElementById('get-id').addEventListener('keydown', e => { if (e.key === 'Enter') runGetAirport(); });
document.getElementById('delete-id').addEventListener('keydown', e => { if (e.key === 'Enter') runDeleteAirport(); });
document.getElementById('routes-code').addEventListener('keydown', e => { if (e.key === 'Enter') runGetRoutes(); });
document.getElementById('airlines-code').addEventListener('keydown', e => { if (e.key === 'Enter') runGetAirlines(); });
document.getElementById('fts-airport-id').addEventListener('keydown', e => { if (e.key === 'Enter') runFTSSearch(); });
