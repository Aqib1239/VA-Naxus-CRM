# VA Nexus — API Reference
> **Venture Automation Nexus — AI-Powered Customer & Business Operations Platform**  
> **Tagline:** Connect. Automate. Accelerate.  
> **Base URL:** `http://localhost:5000/api`  
> **Content-Type:** `application/json` (unless uploading files)  
> **Auth:** Bearer token in `Authorization` header **or** `vibhanu_auth_token` HttpOnly cookie

---

## Authentication

### POST `/api/auth/login`
Authenticate a user and receive a JWT.

**Request body:**
```json
{
  "email": "admin@vibhanu.com",
  "password": "Password@123"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "name": "Arjun Sharma",
      "email": "admin@vibhanu.com",
      "role": "ADMIN"
    },
    "token": "<jwt>"
  }
}
```

**Errors:** `400` (validation), `401` (wrong password), `403` (account inactive)

---

### GET `/api/auth/me`
Return the currently authenticated user.

**Auth required:** ✅

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "name": "...", "email": "...", "role": "..." }
  }
}
```

---

### POST `/api/auth/logout`
Invalidate the HttpOnly cookie.

**Auth required:** ✅  
**Response 200:** `{ "success": true, "message": "Logged out" }`

---

## Leads

### GET `/api/leads`
List leads with pagination, search, and filters.

**Auth required:** ✅  
**RBAC:** Results filtered by role (ADMIN sees all; each role sees their department)

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page (max 100) |
| `search` | string | — | Full-text search on name, code, contact |
| `department` | string | — | Filter by department |
| `status` | string | — | Filter by status |
| `sortBy` | string | `createdAt` | Sort field |
| `sortOrder` | `asc`/`desc` | `desc` | Sort direction |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "leads": [ { ...lead } ],
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

---

### POST `/api/leads`
Create a new lead (Marketing only).

**Auth required:** ✅  
**Roles:** `MARKETING`, `ADMIN`

**Request body:**
```json
{
  "name": "Ravi Kumar",
  "contactNumber": "9876543210",
  "city": "Mumbai",
  "state": "Maharashtra",
  "remark": "Inbound inquiry via website."
}
```

**Response 201:**
```json
{
  "success": true,
  "data": { "lead": { ...lead } }
}
```

---

### GET `/api/leads/:id`
Fetch a single lead by ID or lead code.

**Auth required:** ✅  
**Response 200:**
```json
{
  "success": true,
  "data": { "lead": { ...lead } }
}
```

---

### POST `/api/leads/:id/meeting`
Schedule a meeting and move lead `Communication → Vigilance`.

**Auth required:** ✅  
**Roles:** `COMMUNICATION`, `ADMIN`

**Request body:**
```json
{
  "name": "Ravi Kumar",
  "postalAddress": "123 Main St",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "date": "2026-10-15",
  "time": "11:00 AM",
  "remark": "Interested in premium plan."
}
```

> **Note:** `contactNumber` is **locked** at this stage and cannot be changed.

---

### POST `/api/leads/:id/audio`
Upload mandatory call recording for a Vigilance lead.

**Auth required:** ✅  
**Roles:** `VIGILANCE`, `ADMIN`  
**Content-Type:** `multipart/form-data`  
**Body field:** `audio` (file)

**Allowed MIME types:** `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/webm`, `audio/mp4`  
**Max size:** 50 MB

**Response 200:**
```json
{
  "success": true,
  "data": {
    "audio": {
      "url": "/api/leads/VA-2026-1234/audio",
      "filename": "audio_1234567890.mp3",
      "originalName": "call-recording.mp3",
      "mimeType": "audio/mpeg",
      "size": 3400000,
      "duration": null,
      "uploadedAt": "2026-10-01T12:00:00.000Z"
    }
  }
}
```

---

### GET `/api/leads/:id/audio`
Stream the audio file (HTTP 206 range-request support).

**Auth required:** ✅  
**Roles:** `VIGILANCE`, `SUPPORT`, `SALES`, `ADMIN`

**Headers returned:**
- `Content-Type: audio/mpeg` (or actual MIME)
- `Accept-Ranges: bytes`
- `Content-Range: bytes 0-1023/3400000`

---

### POST `/api/leads/:id/verify`
Verify lead details and move `Vigilance → Support`.

**Auth required:** ✅  
**Roles:** `VIGILANCE`, `ADMIN`

> Audio must be uploaded first via `POST /api/leads/:id/audio`.

**Request body:**
```json
{
  "name": "Ravi Kumar",
  "postalAddress": "123 Main St",
  "city": "Mumbai",
  "state": "Maharashtra",
  "date": "2026-10-15",
  "time": "11:00 AM",
  "remark": "Verification passed."
}
```

---

### POST `/api/leads/:id/allocate`
3-point verification and move lead `Support → Sales`.

**Auth required:** ✅  
**Roles:** `SUPPORT`, `ADMIN`

**Request body:**
```json
{
  "isDateVerified": true,
  "isTimeVerified": true,
  "isAddressVerified": true,
  "allocatedTo": "Neha Kapoor",
  "allocationNotes": "High value lead. Priority follow-up."
}
```

---

### POST `/api/leads/:id/claim`
Claim lead after mandatory audio listen. `Sales → Claimed`.

**Auth required:** ✅  
**Roles:** `SALES`, `ADMIN`

**Request body:**
```json
{
  "dealValue": 350000,
  "closingRemarks": "Client confirmed onboarding."
}
```

**Concurrency protection:** Uses atomic `findOneAndUpdate` with `status ≠ CLAIMED` to prevent double-claim race conditions. Returns `409 Conflict` if already claimed.

---

## Dashboard

### GET `/api/dashboard`
Aggregated pipeline metrics.

**Auth required:** ✅

**Response 200:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalLeads": 42,
      "marketingCount": 5,
      "communicationCount": 8,
      "vigilanceCount": 6,
      "supportCount": 9,
      "salesCount": 7,
      "claimedCount": 7,
      "conversionRate": 17,
      "recentActivityCount": 24,
      "leadsGrowthPercentage": 18.4
    }
  }
}
```

---

## Admin

### GET `/api/admin/users`
List all users.

**Auth required:** ✅  
**Roles:** `ADMIN` only

---

### POST `/api/admin/users`
Create a new user.

**Auth required:** ✅  
**Roles:** `ADMIN` only

**Request body:**
```json
{
  "name": "Priya Verma",
  "email": "priya@vibhanu.com",
  "password": "Password@123",
  "role": "COMMUNICATION"
}
```

---

### PATCH `/api/admin/users/:id/status`
Activate or deactivate a user.

**Auth required:** ✅  
**Roles:** `ADMIN` only

**Request body:**
```json
{ "isActive": false }
```

---

## Health

### GET `/api/health`
Service health check (no auth required).

**Response 200:**
```json
{
  "status": "ok",
  "uptime": 123.45,
  "timestamp": "2026-10-01T12:00:00.000Z",
  "database": "connected"
}
```

---

## Error Response Format

All error responses follow a consistent shape:

```json
{
  "success": false,
  "message": "Human-readable error description",
  "errors": { "field": "error detail" }
}
```

| Status | Meaning |
|--------|---------|
| `400` | Validation error |
| `401` | Unauthenticated (missing/invalid/expired JWT) |
| `403` | Forbidden (role not permitted) |
| `404` | Resource not found |
| `409` | Conflict (e.g. double-claim) |
| `413` | File too large |
| `415` | Unsupported media type |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Seed Users

All seed passwords: `Password@123`

| Role | Email |
|------|-------|
| ADMIN | `admin@vibhanu.com` |
| MARKETING | `marketing@vibhanu.com` |
| COMMUNICATION | `communication@vibhanu.com` |
| VIGILANCE | `vigilance@vibhanu.com` |
| SUPPORT | `support@vibhanu.com` |
| SALES | `sales@vibhanu.com` |

---

## Running the Servers

```bash
# 1. Backend (port 5000)
cd backend
npm install
npm run dev

# 2. Frontend (port 3000)
cd ..
npm install
npm run dev
```

Open `http://localhost:3000` — the frontend automatically connects to `http://localhost:5000/api`.

> If the backend is offline, the frontend silently falls back to localStorage mock data so you can still develop UI changes.
