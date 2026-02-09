# Flux - Data Center Workforce Platform

## Overview
Flux is a platform connecting blue-collar professionals (electricians, technicians, facility engineers, project managers) working in data center construction and maintenance. It provides project management, work order tracking, and a team directory.

## Recent Changes
- 2026-02-09: Initial MVP build with dashboard, projects, work orders, team directory
- Database seeded with realistic data center industry data

## Architecture
- **Frontend**: React + Vite + TanStack Query + wouter routing + shadcn/ui + Tailwind CSS
- **Backend**: Express.js API with PostgreSQL database via Drizzle ORM
- **Theme**: Dark/light mode with teal-navy industrial color scheme

## Key Files
- `shared/schema.ts` - Data models (workers, projects, workOrders)
- `server/routes.ts` - API endpoints (GET/POST for all entities, PATCH for work order status)
- `server/storage.ts` - Database storage layer using Drizzle ORM
- `server/seed.ts` - Seed data for initial load
- `client/src/App.tsx` - Main app with sidebar layout and routing
- `client/src/pages/` - Dashboard, Projects, ProjectDetail, WorkOrders, Team

## API Routes
- `GET/POST /api/projects` - List/create projects
- `GET /api/projects/:id` - Get project details
- `GET/POST /api/workers` - List/create team members
- `GET/POST /api/work-orders` - List/create work orders
- `PATCH /api/work-orders/:id` - Update work order status

## Design Tokens
- Primary: teal (190 75% 42%)
- Sidebar: dark navy (220 30% 15% light / 220 30% 10% dark)
- Font: Inter (sans), Lora (serif), JetBrains Mono (mono)
