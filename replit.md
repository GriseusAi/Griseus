# Griseus - Data Center Workforce Platform

## Overview
Griseus is a two-sided marketplace platform connecting blue-collar professionals (electricians, technicians, facility engineers, project managers) working in data center construction and maintenance. It provides:
- **Manager Dashboard** (desktop): Project management, work order tracking, team directory
- **Worker Mobile App** (/mobile): Job discovery map, digital passport with certifications, squad chat

## Recent Changes
- 2026-02-09: Added mobile worker screens (Job Discovery map, Digital Passport, My Squad chat)
- 2026-02-09: Added schema tables: jobApplications, projectAssignments, chatMessages
- 2026-02-09: Added lat/lng coordinates and tradesNeeded/hourlyRate to projects
- 2026-02-09: Initial MVP build with dashboard, projects, work orders, team directory
- Database seeded with realistic data center industry data

## Architecture
- **Frontend**: React + Vite + TanStack Query + wouter routing + shadcn/ui + Tailwind CSS
- **Backend**: Express.js API with PostgreSQL database via Drizzle ORM
- **Map**: Leaflet + react-leaflet with CartoDB dark tiles
- **Theme**: Dark/light mode with teal-navy industrial color scheme

## Key Files
- `shared/schema.ts` - Data models (workers, projects, workOrders, jobApplications, projectAssignments, chatMessages)
- `server/routes.ts` - API endpoints (GET/POST for all entities, PATCH for work order status)
- `server/storage.ts` - Database storage layer using Drizzle ORM
- `server/seed.ts` - Seed data for initial load
- `client/src/App.tsx` - Main app with desktop sidebar layout and mobile tab routing
- `client/src/pages/` - Desktop: Dashboard, Projects, ProjectDetail, WorkOrders, Team
- `client/src/pages/mobile-jobs.tsx` - Job Discovery with Leaflet map
- `client/src/pages/mobile-passport.tsx` - Digital Passport with verified certs
- `client/src/pages/mobile-squad.tsx` - My Squad with team and chat
- `client/src/components/mobile-layout.tsx` - Mobile bottom tab navigation
- `client/src/components/app-sidebar.tsx` - Desktop sidebar with "Worker App" link

## API Routes
- `GET/POST /api/projects` - List/create projects
- `GET /api/projects/:id` - Get project details
- `GET/POST /api/workers` - List/create team members
- `GET /api/workers/:id` - Get worker details
- `GET/POST /api/work-orders` - List/create work orders
- `PATCH /api/work-orders/:id` - Update work order status
- `GET /api/job-applications/:workerId` - Get worker's applications
- `POST /api/job-applications` - Apply for a project
- `GET /api/project-assignments/project/:projectId` - Get project team
- `GET /api/project-assignments/worker/:workerId` - Get worker's assignments
- `GET /api/chat-messages/:projectId` - Get project chat messages
- `POST /api/chat-messages` - Send chat message

## Routing
- Desktop manager view: `/`, `/projects`, `/projects/:id`, `/work-orders`, `/team`
- Mobile worker view: `/mobile` (Jobs), `/mobile/passport`, `/mobile/squad`
- Worker identity stored in localStorage (key: `griseus_current_worker_id`)

## Design Tokens
- Primary: teal (190 75% 42%)
- Sidebar: dark navy (220 30% 15% light / 220 30% 10% dark)
- Font: Inter (sans), Lora (serif), JetBrains Mono (mono)
