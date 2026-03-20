# CAASPP & ELPAC Assessment Platform

## Overview

A full-stack POC for a California educational assessment platform supporting CAASPP (California Assessment of Student Performance and Progress) and ELPAC (English Language Proficiency Assessments for California) standards.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/caaspp-elpac)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: Gemini AI via Replit AI Integrations (no API key required)
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Charts**: Recharts
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── caaspp-elpac/       # React + Vite frontend (port 21293)
│   └── api-server/         # Express API server (port 8080)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── integrations-gemini-ai/  # Gemini AI client
│   └── db/                 # Drizzle ORM schema + DB connection
```

## User Roles

- **Student** (username: `student1`, password: `demo123`) — Takes CAASPP & ELPAC assessments, views their results
- **Teacher** (username: `teacher1`, password: `demo123`) — Views class analytics, uploads syllabus PDFs to generate AI questions
- **Admin** (username: `admin1`, password: `demo123`) — School-wide analytics dashboard, manages users/classes

## Key Features

1. **Assessment Taking** — Students take CAASPP (ELA, Math, Science) and ELPAC (Listening, Speaking, Reading, Writing) tests with timer, question navigation, and progress tracking
2. **AI Question Generation** — Teachers upload syllabus PDFs, select difficulty level (Easy/Medium/Hard/Mixed) and subject, and Gemini AI generates assessment questions
3. **Teacher Dashboard** — Class results, student progress tracking, analytics charts
4. **Admin Dashboard** — School-wide analytics, user management, class management
5. **Role-based Access** — Each role gets a completely different experience

## API Routes

- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Get current user
- `GET /api/assessments` — List assessments
- `GET /api/assessments/:id` — Get assessment with questions
- `POST /api/results` — Submit assessment result
- `GET /api/results` — List results
- `POST /api/syllabus/upload` — Upload syllabus text, generate AI questions
- `GET /api/analytics/overview` — School/class analytics
- `GET /api/analytics/student/:id` — Student analytics
- `GET /api/users` — List users
- `GET /api/classes` — List classes

## Database Tables

- `users` — Students, teachers, admins
- `classes` — Class groups
- `assessments` — Test definitions
- `questions` — Assessment questions with options/answers
- `results` — Submitted test results with answer arrays

## AI Integration

Uses Gemini AI (gemini-2.5-flash) via Replit AI Integrations proxy. No API key needed — billed to Replit credits. The syllabus upload endpoint extracts text from PDFs and sends it to Gemini to generate standards-aligned assessment questions.
