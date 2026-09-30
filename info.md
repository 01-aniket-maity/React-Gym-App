# GymAI Planner — Project Guide

## Purpose

GymAI Planner is a full-stack web application that creates a personalised gym training plan from a short onboarding questionnaire. A signed-in user chooses their goal, experience, available training time, equipment, preferred split, and optional injuries or limitations. The application persists that profile, asks an AI model to generate a structured programme, stores versioned plans, and displays the latest plan.

The project is split into two independently run applications:

| Area | Location | Responsibility |
| --- | --- | --- |
| Front end | `src/` | User interface, routing, authentication state, questionnaire, and plan presentation. |
| API server | `server/src/` | Profile and plan endpoints, AI orchestration, and database access. |
| Database schema | `server/prisma/` | PostgreSQL models and Prisma migrations. |

## User workflow

```text
Home page
  → sign up / sign in (Neon Auth)
  → onboarding questionnaire
  → save profile (POST /api/profile)
  → generate plan (POST /api/plan/generate)
  → plan is stored with a version number
  → Profile page shows the newest saved plan
  → “Back to Form” returns to the questionnaire to submit new preferences
```

1. Unauthenticated visitors land on the marketing home page. Authenticated visitors are redirected to `/profile`.
2. The questionnaire at `/onboarding` requires a Neon Auth session. Its fields are goal, experience, days per week, session duration, equipment, split, and optional injuries/limitations.
3. Submitting the questionnaire upserts the user's profile, then requests a new AI plan.
4. The API retrieves the saved profile, determines the next plan version, generates a JSON plan, and inserts it into PostgreSQL.
5. The React auth context refreshes the current plan and the app navigates to `/profile`.
6. The Profile page displays summary cards, programme notes, the weekly schedule, and progression guidance. Its **Back to Form** button routes to `/onboarding`; submitting the form creates a newer plan version rather than overwriting a prior plan.

## Front-end architecture

### Application entry and routing

`src/main.tsx` mounts React in `StrictMode`. `src/App.tsx` composes the providers and routes:

| Route | Page | Description |
| --- | --- | --- |
| `/` | `Home` | Landing page; redirects signed-in users to their plan. |
| `/onboarding` | `Onboarding` | Protected questionnaire and plan-generation state. |
| `/profile` | `Profile` | Current saved training plan. Redirects users without a plan to onboarding. |
| `/auth/:pathname` | `Auth` | Neon Auth's sign-in/sign-up screens. |
| `/account/:pathname` | `Account` | Neon Auth account-management screens. |

The provider order is `NeonAuthUIProvider` → `AuthProvider` → `BrowserRouter`. `Navbar` is shared across all routes.

### State and API boundary

`AuthContext.tsx` is the central client-side state layer. On load, it reads the Neon Auth session and, for an authenticated user, fetches the latest stored plan. It exposes:

- `user`, `plan`, and `isLoading` for route/page decisions;
- `saveProfile(profile)` to persist questionnaire data;
- `generatePlan()` to request a new plan; and
- `refreshData()` to refetch the newest plan.

`src/lib/api.ts` keeps HTTP details outside UI components. It uses `VITE_API_URL` (default `http://localhost:3001`) and communicates with the API under `/api`.

### UI organisation

- `pages/` contains complete route-level views.
- `components/ui/` supplies reusable primitives: `Button`, `Card`, `Input`, `Select`, and `Textarea`.
- `components/plan/PlanDisplay.tsx` renders the weekly workout schedule.
- `components/layout/Navbar.tsx` renders global navigation and Neon Auth's user control.
- `src/types/index.ts` defines the browser-facing profile and plan shapes, which helps components agree on the expected data.

Styling uses Tailwind CSS v4 and CSS variables defined in `src/index.css`. Lucide React provides SVG icons.

## Back-end architecture

The Express server starts in `server/src/index.ts`, loads environment variables, accepts JSON request bodies, enables CORS, and mounts two routers:

| Endpoint | Handler | Behaviour |
| --- | --- | --- |
| `POST /api/profile` | `routes/profile.ts` | Validates required questionnaire fields and upserts a `user_profiles` record. |
| `POST /api/plan/generate` | `routes/plan.ts` | Loads the profile, generates an AI plan, assigns the next version, and saves it. |
| `GET /api/plan/current?userId=…` | `routes/plan.ts` | Returns the newest plan for that user. |

The server uses a Prisma client configured with the PostgreSQL adapter in `server/src/lib/prisma.ts`. Prisma keeps query code typed and migrations reproducible.

## Data model

### `user_profiles`

One profile per authenticated user (`user_id` is the primary key):

- goal and experience;
- days per week and session length;
- available equipment;
- optional injuries; and
- preferred training split plus the latest update timestamp.

### `training_plans`

Each generation creates a new record rather than replacing the old one:

- UUID plan ID and owning user ID;
- `plan_json`, the structured plan shown by the client;
- `plan_text`, a formatted JSON copy useful for inspection/export later;
- monotonically increasing per-user `version`; and
- creation timestamp.

The latest plan is determined by `created_at` descending. The database indexes `training_plans.user_id` for this lookup.

## AI plan generation

`server/src/lib/ai.ts` calls OpenRouter through the official OpenAI JavaScript SDK. The server provides a fitness-coach system instruction and a profile-derived prompt. It requests strict JSON-schema output with exactly these top-level fields:

```json
{
  "overview": { "goal": "", "frequency": "", "split": "", "notes": "" },
  "weeklySchedule": [],
  "progression": ""
}
```

Generation is deliberately constrained to make the display dependable:

- temperature is `0.2` to favour consistent structured output;
- the JSON schema constrains field names and value types;
- the prompt requires the selected number of workout days, 4–6 exercises per workout, time/equipment suitability, RPE guidance, alternatives, and injury-aware choices;
- response text is parsed and checked before storage; and
- the weekly schedule length must equal the requested number of days.

The implementation uses the OpenRouter `openrouter/free` route and requires `OPEN_ROUTER_KEY` on the server.

## Technology choices and rationale

| Technology | Why it fits this project |
| --- | --- |
| React 19 + TypeScript | Component-based user interface with compile-time checking for forms, plans, and API-facing data. |
| Vite | Fast local development, Hot Module Replacement, and a simple production build for the client. |
| React Router | Client-side route handling for home, onboarding, profile, auth, and account pages without full page loads. |
| Tailwind CSS | Rapid, consistent responsive styling using utility classes; CSS variables provide an app-wide visual theme. |
| Lucide React | Lightweight, consistent icon set without maintaining custom SVG files. |
| Neon Auth | Hosted authentication UI/session handling, reducing the amount of account and session infrastructure to build. |
| Express 5 | Small, explicit HTTP API suitable for the project's three operations. |
| PostgreSQL + Prisma | Durable relational persistence, migration history, typed query API, and JSON storage for flexible AI output. |
| OpenAI SDK + OpenRouter | A familiar SDK interface while allowing model-provider routing; the JSON-schema request supports reliable rendering. |

## Local development

### Prerequisites

- Node.js and npm
- A PostgreSQL database reachable by the API server
- A Neon Auth project
- An OpenRouter API key

### Environment variables

Keep credentials in ignored `.env` files; do not commit them.

Client (`.env` at project root):

```dotenv
VITE_NEON_AUTH_URL=<your Neon Auth URL>
VITE_API_URL=http://localhost:3001
```

Server (`server/.env`):

```dotenv
DATABASE_URL=<PostgreSQL connection string>
OPEN_ROUTER_KEY=<OpenRouter API key>
PORT=3001
BASE_URL=http://localhost:3001
```

### Commands

Run these in separate terminals:

```bash
# Client, from the repository root
npm install
npm run dev

# API, from server/
npm install
npm run dev:server
```

Useful client checks:

```bash
npm run build
npm run lint
```

Apply Prisma migrations from `server/` after configuring `DATABASE_URL`:

```bash
npx prisma migrate deploy
```

## Current limitations and recommended hardening

This reflects the code as it currently exists:

- The API accepts `userId` in the request body/query and does not validate the caller's Neon Auth session. Before deployment, verify Neon-issued tokens on the server and derive the user ID from the verified token. This prevents one user from reading or writing another user's profile or plans.
- CORS is currently unrestricted. Configure allowed production origins and credentials deliberately.
- The onboarding form starts with defaults when revisited; it does not currently load a saved profile into its fields.
- Client errors are captured in onboarding state but are not rendered to the user, so generation failures need visible feedback.
- There are no automated tests and the server package does not yet expose build, lint, or test scripts.
- The AI response receives basic structure validation, but deeper validation of every exercise field and safety constraints would improve resilience.
- Fitness plans generated by AI should be presented as general guidance, not medical advice; injury-related plans deserve especially careful review.

## Suggested next improvements

1. Add server-side authentication middleware and ownership checks.
2. Hydrate onboarding fields from the saved profile and display form/generation errors.
3. Add plan history so users can browse previous versions.
4. Validate AI output with a runtime schema (for example Zod) before persistence.
5. Add API, component, and end-to-end tests.
6. Add production configuration for CORS, logging, rate limiting, and monitoring.
