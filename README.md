# Fleet Pre-Trip Inspection System

Enterprise mobile-first pre-trip vehicle inspection, driver authorization, QR scanner, and dispatcher audit management system with real-time GPS photo capture and bulk fleet updates.

## Features

- **Mobile-First Driver Inspection**: 10-point vehicle checklist with quick statutory checks (lights, indicators, APAD emergency equipment, brake tests, tyre pressure/tread, dashboard warning checks).
- **APAD / Regulatory Compliance**: Pre-trip inspection audits with tamper-proof certificate generation and QR verification.
- **Admin Portal & Dispatcher Dashboard**: Fleet management, driver management, inspection audits, filterable vehicle rosters, and bulk operations.
- **Offline / Camera / Geolocation Integration**: Real-time GPS location tagging and photo proof for inspection checkpoints.
- **Automated Verification**: Real-time verification of vehicle roadworthiness and instant pass/fail status updates.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide React
- **Backend**: Node.js, Express, tsx
- **Storage**: Local JSON database with backup & export capabilities

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or bun

### Installation

```bash
# Clone the repository
git clone <your-github-repo-url>
cd fleet-pre-trip-inspection

# Install dependencies
npm install
```

### Environment Variables

Copy `.env.example` to `.env` if needed:

```bash
cp .env.example .env
```

### Running the Application

```bash
# Start development server (runs full-stack Express + Vite)
npm run dev

# Or build for production
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
