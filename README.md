# Art Pipeline V2 Workbench Demo

This repo now hosts the first web-first slice of the art pipeline demo:

- `backend/` contains the FastAPI workspace API.
- `frontend/` contains the React workbench shell.
- `source-demo/` contains the demo source image used by later tasks.

## Backend

Install backend deps:

```powershell
cd backend
python -m pip install -e .[dev]
```

Run tests:

```powershell
python -m pytest tests -q
```

Serve the API:

```powershell
uvicorn art_pipeline.api:app --reload --app-dir backend
```

## Frontend

Install frontend deps:

```powershell
cd frontend
npm install
```

Run tests:

```powershell
npm test -- --run
```

Start the dev server:

```powershell
npm run dev
```

The current workbench supports PNG upload, stores the active source in `workspace/source/original.png`, initializes `workspace/state.json`, and displays the uploaded source inside the shell layout.
