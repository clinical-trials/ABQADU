# Version 9 Final Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Version 9 final demo draft with visible Version 9 copy, a server-backed builder command center, and mobile-friendly real-demo workflows.

**Architecture:** Keep the existing static public site and Postgres production routes intact. Add a JSON-backed Express demo route for command-center persistence and a React `CommandCenter` page that uses it. Update tests to verify Version 9 copy and API registration.

**Tech Stack:** HTML/CSS/JS static site, React 18, Express, Node.js, Jest, local JSON persistence.

## Global Constraints

- Branch name: `Version-9`.
- Visible copy must say `Version 9`, not `Version 8`, for the final demo.
- Demo persistence must work without requiring Postgres.
- Builder UI must be usable on a normal phone without horizontal table dependency.
- Do not remove existing production API routes.
- Do not add live payment/SMS/auth claims unless clearly labeled as planned integration.

---

### Task 1: Add Server-Backed Demo Store

**Files:**
- Create: `platform/server/src/services/commandCenterStore.js`
- Create: `platform/server/src/routes/commandCenter.js`
- Modify: `platform/server/src/index.js`
- Test: `platform/server/tests/commandCenter.routes.test.js`

**Interfaces:**
- Produces: `loadCommandCenter(): Promise<object>`
- Produces: `saveCommandCenter(nextState: object): Promise<object>`
- Produces: `resetCommandCenter(): Promise<object>`
- Produces routes:
  - `GET /api/command-center`
  - `PUT /api/command-center`
  - `POST /api/command-center/reset`

- [x] **Step 1: Create JSON store with starter data**
- [x] **Step 2: Add Express routes**
- [x] **Step 3: Register route in server index**
- [x] **Step 4: Add static route tests**

### Task 2: Add React Builder Command Center

**Files:**
- Create: `platform/client/src/pages/CommandCenter.jsx`
- Modify: `platform/client/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/command-center`
- Consumes: `PUT /api/command-center`
- Produces: `/command-center` route

- [x] **Step 1: Create mobile-first dashboard**
- [x] **Step 2: Add editable project/supplier/receipt/mileage workflows**
- [x] **Step 3: Add text-ready builder message panel**
- [x] **Step 4: Add nav item and responsive nav wrapping**

### Task 3: Update Static Review Site Copy

**Files:**
- Modify: `index.html`
- Modify: `platform.html`
- Modify: `tests/platform-bid-app.test.js`

**Interfaces:**
- Produces visible Version 9 public review pages.

- [x] **Step 1: Replace Version 8 visible copy with Version 9**
- [x] **Step 2: Add builder command-center callout to `platform.html`**
- [x] **Step 3: Update static tests**

### Task 4: Verify And Push

**Files:**
- No new source files.

**Interfaces:**
- Produces pushed GitHub branch `Version-9`.

- [ ] **Step 1: Run static HTML/script checks**
- [ ] **Step 2: Run platform static tests**
- [ ] **Step 3: Run server tests**
- [ ] **Step 4: Run client build**
- [ ] **Step 5: Commit and push `Version-9`**
