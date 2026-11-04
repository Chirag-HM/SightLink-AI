# Nearby Volunteer Assistance System
### Smart Blind Stick Assistive System

A privacy-first, real-time nearby volunteer assistance module integrated into the Smart Blind Stick project.

---

## 🌟 Key Features

1. **Role-Based Access Control**:
   - **Blind User**: Accessible, high-contrast dashboard with giant tactile "REQUEST HELP" button and Web Speech API audio announcements.
   - **Volunteer**: Radar dashboard with availability switch, live proximity meter, and incoming assistance cards.
2. **Geospatial Proximity Matching**:
   - Calculates distance using the pure Python **Haversine formula**.
   - Filters registered volunteers who have explicitly turned on availability and are within **1.0 km**.
3. **Atomic Claiming (Race Condition Prevention)**:
   - Uses an asynchronous concurrency lock (`claim_lock`) to serialize concurrent volunteer acceptance attempts.
   - If two volunteers click "Accept" simultaneously, exactly one is granted the request; the other receives an HTTP `409 Conflict`.
4. **Real-Time WebSockets & Background Push**:
   - Instant live dispatch through WebSockets (`/ws/{user_id}/{role}`).
   - Ready for Firebase Cloud Messaging (FCM) web push notifications when backgrounded.
5. **Location Privacy Protection**:
   - Prior to mutual acceptance, blind user coordinates are fuzzed by ~80 meters so exact home or street addresses are not leaked.
   - Precise coordinates are only shared with the assigned volunteer after claiming.
6. **Hardware Preservation**:
   - The existing ESP8266 firmware remains 100% untouched.
   - GPS coordinates are fetched directly from the stick's `/gps` or `/status` endpoint, with browser Geolocation fallback.

---

## 📂 Project Structure

```
volunteer_assistance/
├── backend/
│   ├── config.py             # Environment variables and system thresholds
│   ├── database.py           # SQLite engine and session factory
│   ├── models.py             # SQLAlchemy models (User, VolunteerProfile, AssistanceRequest)
│   ├── schemas.py            # Pydantic v2 schemas for request validation
│   ├── geospatial.py         # Haversine distance, radius checks, coordinate fuzzing
│   ├── auth.py               # PBKDF2 password hashing and JWT token handlers
│   ├── atomic_claim.py       # Concurrency lock for single-volunteer claim guarantees
│   ├── websockets.py         # NotificationHub for active WebSocket connections
│   ├── fcm.py                # Firebase Cloud Messaging web push helper
│   ├── main.py               # FastAPI entrypoint, lifespan expiration worker, SPA static host
│   ├── routes/
│   │   ├── auth_routes.py    # /api/auth/register, /login, /me
│   │   ├── volunteer_routes.py # /api/volunteer/availability, /location, /pending-requests
│   │   ├── assistance_routes.py# /api/assistance/request, /accept, /cancel, /expand-radius
│   │   └── stick_routes.py   # /api/stick/gps (ESP8266 stick proxy and sync)
│   └── tests/
│       ├── test_geospatial.py   # Haversine and radius unit tests
│       ├── test_atomic_claim.py # Concurrent claim race condition tests
│       └── test_full_flow.py    # Complete end-to-end integration test
└── frontend/
    ├── package.json          # React 19 + Vite dependencies
    ├── vite.config.js        # Vite dev server with proxy to backend
    ├── src/
    │   ├── main.jsx          # React DOM entrypoint
    │   ├── App.jsx           # Main App container & role switcher
    │   ├── api.js            # API client with automatic JWT token management
    │   ├── useWebSocket.js   # Auto-reconnecting WebSocket hook
    │   ├── BlindUserDashboard.jsx # High-contrast accessible blind user interface
    │   ├── VolunteerDashboard.jsx # Volunteer radar interface with accept/decline
    │   └── index.css         # WCAG AAA accessible high-contrast design
    └── dist/                 # Production-built bundle served by FastAPI
```

---

## 🚀 How to Run

### Option 1 — Start the Full Stack (Single Command)

FastAPI automatically serves both the REST API, WebSockets, and the built React frontend:

```bash
cd "/Users/preethammp/bmtc blind/ESP32_CAM_Test"
python3 -m uvicorn volunteer_assistance.backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open your browser at:
👉 **`http://localhost:8000`**

---

### Option 2 — Start Frontend in Vite Development Mode

For rapid frontend editing with Hot Module Replacement (HMR):

1. **Terminal 1 (Backend)**:
   ```bash
   cd "/Users/preethammp/bmtc blind/ESP32_CAM_Test"
   python3 -m uvicorn volunteer_assistance.backend.main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Terminal 2 (Frontend)**:
   ```bash
   cd "/Users/preethammp/bmtc blind/ESP32_CAM_Test/volunteer_assistance/frontend"
   npm run dev
   ```
   Open: **`http://localhost:5173`**

---

## 🧪 Running Automated Tests

Run the full unit and integration test suite:

```bash
cd "/Users/preethammp/bmtc blind/ESP32_CAM_Test"
python3 -m unittest discover -s volunteer_assistance/backend/tests
```

All 7 test suites will execute and verify:
- Haversine math & 1.0 km radius checks
- Coordinate privacy fuzzing
- Atomic acceptance concurrency
- End-to-end registration, request, broadcast, acceptance, and completion

---

## ⚙️ Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET_KEY` | *(generated for the current process if unset)* | Set a strong secret in the backend environment for stable JWT signing |
| `DEFAULT_SEARCH_RADIUS_KM` | `1.0` | Default initial radius for volunteer matching |
| `REQUEST_TIMEOUT_SECONDS` | `300` | Expiration window (5 min) for unanswered requests |
| `ESP8266_IP` | `10.173.66.89` | Local IP address of the ESP8266 Smart Blind Stick |
| `FCM_SERVER_KEY` | *(None)* | Firebase Cloud Messaging server key for background web push |

Set `VITE_DEMO_PASSWORD` in the frontend environment before starting the Vite development server. The demo UI uses it to register or sign in its demo accounts; the same value must be used on later runs. Keep real credentials in local environment files, not source control. Example backend and frontend variable names are listed in [`.env.example`](./.env.example) and [`frontend/.env.example`](./frontend/.env.example).

---

## 🔒 Privacy & Security Features

- **No Public Broadcast of Coordinates**: Requests are only sent to authenticated volunteers who have explicitly toggled availability to `ON` and are within the radius.
- **Pre-Acceptance Fuzzing**: Unclaimed assistance broadcasts randomize coordinates within an 80m jitter buffer so exact street addresses are never exposed to unassigned parties.
- **Consent-Driven Sharing**: Volunteers must explicitly grant consent to transmit their location.
- **Request-Scoped Access**: Precise GPS coordinates are only shared between the specific blind user and the single volunteer who successfully accepted the request.
