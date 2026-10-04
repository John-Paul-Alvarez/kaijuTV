# Render Free backend setup

The backend is prepared for deployment; no service or account was created by this change.

Create a Node web service from the repository with:

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `npm ci` |
| Start command | `npm start` |
| Instance type | Free |
| Health check | `/api/health` |
| HOST | `0.0.0.0` |
| FRONTEND_ORIGINS | Your exact deployed frontend origin, without a trailing slash |

Render supplies `PORT`; do not force the local port on Render. The optional root `render.yaml` describes the backend service and asks for FRONTEND_ORIGINS. Render Blueprint use does not itself deploy the frontend.

Deploy the frontend separately as a static site: root `frontend`, build `npm ci && npm run build`, publish directory `dist`. Set `VITE_API_BASE_URL=https://your-backend.onrender.com` before building. Update backend FRONTEND_ORIGINS to match the frontend origin. Local development uses the Vite proxy and needs no API base URL.

Render Free web services sleep after 15 minutes without inbound traffic and can take about a minute to wake. The diagnostics UI allows 90 seconds for its API request. Shared monthly hours and outbound bandwidth limits still apply; this prototype uses bounded checks instead of continuous video delivery. Reports are in memory and disappear on restart. These are hosting limitations documented by [Render](https://render.com/docs/free).

For initial tests, leave TRUST_PROXY_HOPS unset. With an unconfigured proxy, rate limiting may group clients under the proxy IP. Set it only after verifying the deployment's trusted proxy hop count; guessing can let clients spoof their address. Concurrent check limits still apply globally.

After deployment, test `/api/health`, check a currently listed channel, download its report, and compare a conventional browser/VLC result. Hosting-region restrictions can differ from local results. This prototype has no automatic scans and no guarantees of 24/7 service.
