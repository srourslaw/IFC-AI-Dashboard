# IFC AI Dashboard - Erection Methodology Builder

An intelligent dashboard for analyzing IFC (Industry Foundation Classes) files and generating construction erection methodologies using AI/ML.

## Features

- **3D IFC Viewer**: Interactive Three.js-based viewer with storey visibility controls
- **Grid-Based Erection Methodology Builder**: Select grid areas and generate construction stages
- **AI-Powered Analysis**: Chat with AI about your construction model
- **Full Building Section View**: View complete building sections with erection sequence highlights
- **Export Capabilities**: Export to Excel, PDF, and generate takeoffs

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for development and building
- **Three.js** + **web-ifc** for 3D IFC rendering
- **TailwindCSS** for styling
- **React Query** for data fetching
- **Framer Motion** for animations

### Backend
- **FastAPI** (Python)
- **ifcopenshell** for IFC parsing
- **Anthropic Claude API** for AI features
- **ReportLab** for PDF generation

---

## Prerequisites

- **Node.js** v18+ (for frontend)
- **Python** 3.10+ (for backend)
- **Git**

---

## Quick Start (Local Development)

### 1. Clone the Repository

```bash
git clone https://github.com/WrongClone/T1.git
cd T1
```

### 2. Backend Setup

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
cd backend
pip install -r requirements.txt

# Create .env file (copy from example)
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start the backend server
python run.py
```

The backend will run at: `http://localhost:8000`

### 3. Frontend Setup

```bash
# Open a new terminal
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will run at: `http://localhost:5176`

### 4. Access the Dashboard

Open your browser and go to: `http://localhost:5176`

**Login credentials:**
- Email: `admin@bluewaveintelligence.com`
- Password: `BlueWave2024!`

---

## Environment Variables

### Backend (.env)

Create a `.env` file in the `backend` directory:

```env
# Required for AI features
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional
DEBUG=true
ALLOWED_ORIGINS=http://localhost:5176,http://localhost:5173
```

### Frontend

The frontend uses Vite's proxy to connect to the backend. No additional configuration needed for local development.

---

## Project Structure

```
ifc_ai_poc/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── ifc_service.py       # IFC file handling
│   │   ├── erection_service.py  # Erection methodology logic
│   │   ├── pdf_service.py       # PDF generation
│   │   └── routes/
│   │       ├── files.py         # File upload/management
│   │       ├── methodology.py   # Erection methodology API
│   │       └── chat.py          # AI chat API
│   ├── requirements.txt
│   └── run.py
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── IFCViewer.tsx    # 3D viewer component
│   │   │   └── ui/              # Reusable UI components
│   │   ├── pages/
│   │   │   ├── FilesPage.tsx
│   │   │   ├── ViewerPage.tsx
│   │   │   ├── ErectionSequenceBuilderPage.tsx
│   │   │   ├── ReviewPage.tsx
│   │   │   └── ExportPage.tsx
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/
│   │   │   └── api.ts           # API client
│   │   └── store/               # Zustand state management
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

## Key Features Guide

### 1. Upload IFC Files
- Go to **Files** page
- Drag and drop or click to upload `.ifc` files
- Files are stored locally in `backend/uploads/`

### 2. View 3D Model
- Select a file from the Files page
- Go to **Viewer** page to see the 3D model
- Use mouse to rotate, pan, and zoom
- Toggle storey visibility in the sidebar

### 3. Generate Erection Methodology
- Go to **Methodology** page
- Click and drag on the grid to select an area (e.g., Grid 1-8 / A-E)
- Click **Generate Stages**
- Use playback controls to view construction sequence:
  - Stage 1: Columns (highlighted in magenta)
  - Stage 2: Beams (columns turn grey, beams in magenta)

### 4. AI Chat (Review Page)
- Go to **Review** page
- Ask questions about your model
- AI analyzes the loaded IFC file and provides insights

### 5. Export
- Go to **Export** page
- Download Excel reports, PDF methodology documents, or takeoffs

---

## Deployment Options

### Option A: Vercel (Frontend) + Railway/Render (Backend)

#### Frontend on Vercel:
1. Push code to GitHub
2. Connect Vercel to your GitHub repo
3. Set build settings:
   - Build Command: `cd frontend && npm run build`
   - Output Directory: `frontend/dist`
4. Add environment variable:
   - `VITE_API_URL`: Your backend URL (e.g., `https://your-backend.railway.app`)

#### Backend on Railway:
1. Create new Railway project
2. Connect to GitHub repo
3. Set root directory: `backend`
4. Add environment variables:
   - `ANTHROPIC_API_KEY`
   - `ALLOWED_ORIGINS` (your Vercel frontend URL)

### Option B: Docker (Coming Soon)

Docker configuration files will be added for containerized deployment.

---

## API Documentation

When the backend is running, access the API docs at:
- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files/upload` | POST | Upload IFC file |
| `/api/files` | GET | List uploaded files |
| `/api/methodology/analyze` | GET | Auto-analyze model |
| `/api/methodology/grid` | GET | Get grid axes |
| `/api/methodology/generate-from-sequences` | POST | Generate stages from grid selection |
| `/api/chat` | POST | AI chat about model |

---

## Troubleshooting

### Backend won't start
- Ensure Python 3.10+ is installed
- Check if port 8000 is in use: `lsof -i :8000`
- Verify all dependencies: `pip install -r requirements.txt`

### Frontend won't connect to backend
- Check backend is running at `http://localhost:8000`
- Verify Vite proxy config in `vite.config.ts`
- Check browser console for CORS errors

### IFC file won't load
- Ensure file is valid IFC format (.ifc)
- Check backend logs for parsing errors
- Try a smaller/simpler IFC file first

### 3D viewer is slow
- Large IFC files may take time to load
- Consider splitting large models
- Check browser WebGL support

---

## Development Commands

### Backend
```bash
# Run with auto-reload
cd backend && python run.py

# Run tests (when available)
pytest
```

### Frontend
```bash
# Development server
npm run dev

# Type checking
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and commit: `git commit -m "Add your feature"`
3. Push to branch: `git push origin feature/your-feature`
4. Create a Pull Request

---

## Team

- BlueWave Intelligence

---

## License

Proprietary - All rights reserved
