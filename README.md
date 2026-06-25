# NIRF Intel

> A full-stack web platform for extracting, analysing, and predicting Indian engineering college rankings from NIRF data.

**Tech Stack:** React (Vite) · FastAPI · Python · Tesseract OCR · pdfplumber · scikit-learn · Tailwind CSS

---

## Project Structure

```
nirf-intel/
├── frontend/                  # React + Vite app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ExtractPage.jsx
│   │   │   ├── DataPage.jsx
│   │   │   ├── PredictPage.jsx
│   │   │   └── AnalysePage.jsx
│   │   ├── components/        # Shared UI components
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/                   # FastAPI app
│   ├── main.py
│   ├── routers/
│   │   ├── extract.py
│   │   ├── data.py
│   │   ├── predict.py
│   │   └── analyse.py
│   ├── services/
│   │   ├── ocr_service.py
│   │   ├── extraction_service.py
│   │   ├── prediction_service.py
│   │   └── excel_service.py
│   ├── models/
│   │   └── schemas.py
│   └── requirements.txt
│
└── README.md
```

---

## Branch Structure

Each page of the frontend has its own dedicated Git branch. This lets collaborators work independently without interfering with each other.

| Branch | Owner | Page |
|---|---|---|
| `main` | Project Lead | Stable, merged code only |
| `feature/extract-page` | Collaborator A | Extract Page |
| `feature/data-page` | Collaborator B | Data Page |
| `feature/predict-page` | Collaborator C | Predict Page |
| `feature/analyse-page` | Collaborator D | Analyse Page |

---

## Pages — Features & Expected Behaviour

---

### 1. Extract Page (`/extract`)

**Purpose:** Upload NIRF PDF score cards and extract structured ranking data from them using OCR and PDF parsing.

**What it contains:**

- **Upload Zone** — A drag-and-drop area (or file browser) that accepts `.pdf` files. Supports uploading one or multiple PDFs at once.
- **College Selector** (optional) — A dropdown or text input to specify the college name if it cannot be auto-detected from the PDF.
- **Extract Button** — Triggers the backend extraction pipeline.
- **Progress Indicator** — A loading spinner or step-by-step status bar showing: `Uploading → Parsing PDF → Running OCR → Extracting Parameters → Done`.
- **Preview Table** — After extraction, shows the extracted data in a table with columns for each of the 17 NIRF sub-parameters (TLR, RPC, GO, OI, Perception, and their sub-scores).
- **Download / Save Button** — Lets the user download the extracted data as an Excel file or save it to the project's master dataset.
- **Error Panel** — Shows which fields failed to extract and why (e.g. scanned image quality, missing section in PDF).

**How it works (end-to-end):**

1. User uploads a NIRF PDF.
2. Frontend sends the file to `POST /api/extract` on the FastAPI backend.
3. Backend runs `pdfplumber` to parse text-based tables. For scanned pages, it uses `pytesseract` OCR with band-scanning.
4. Extracted values for all 17 sub-parameters are structured into a Pydantic model.
5. The structured result is returned as JSON and displayed in the preview table.
6. User can download the result as `.xlsx` or save to the master data store.

---

### 2. Data Page (`/data`)

**Purpose:** Browse, search, filter, and manage the full dataset of extracted NIRF records across multiple colleges and years.

**What it contains:**

- **Data Table** — A full, paginated table showing all stored records. Columns include: College Name, Year, NIRF Rank, TLR, RPC, GO, OI, Perception, Total Score.
- **Search Bar** — Filter records by college name in real time.
- **Filter Panel** — Dropdowns to filter by Year, State, Category (NIT / IIT / Private), and Rank range (e.g. Top 50, 51–100).
- **Sort Controls** — Click column headers to sort ascending/descending by any parameter.
- **Edit / Delete Row** — Inline editing for correcting extraction errors. Each row has an edit pencil icon and a delete trash icon.
- **Export Button** — Downloads the currently filtered/visible dataset as an Excel file.
- **Import Button** — Upload an Excel file to bulk-add or update records.
- **Stats Bar** — At the top, shows quick stats: total colleges, total records, latest year available, average score.

**How it works (end-to-end):**

1. On page load, frontend calls `GET /api/data` to fetch all records.
2. Filtering, searching, and sorting happen client-side for speed.
3. Editing a row sends a `PUT /api/data/{id}` request to update the backend store.
4. Deleting sends `DELETE /api/data/{id}`.
5. Export calls `GET /api/data/export` which returns a generated `.xlsx` file.
6. Import sends a `.xlsx` file to `POST /api/data/import` and the backend parses and upserts rows.

---

### 3. Predict Page (`/predict`)

**Purpose:** Use trained ML models to predict a college's NIRF score and estimated rank based on user-provided sub-parameter values.

**What it contains:**

- **Input Form** — A clean form with labelled numeric input fields for each of the 17 NIRF sub-parameters. Fields are grouped by main parameter category (TLR, RPC, GO, OI, Perception).
- **Parameter Info Tooltips** — Each input field has a ℹ️ icon that explains what that sub-parameter means and its typical range (0–100).
- **Predict Button** — Submits the form and calls the prediction API.
- **Result Card** — Displays the predicted total NIRF score prominently, along with a predicted rank range (e.g. "Estimated Rank: 45–55").
- **Breakdown Chart** — A horizontal bar chart showing how each main parameter contributes to the predicted score.
- **Confidence Indicator** — Shows model confidence or prediction interval (e.g. ±3.2 points).
- **Unpredictable Parameters Warning** — For the 6 parameters that could not be reliably modelled, shows a note explaining that those values were set to their historical averages.
- **Save Prediction Button** — Saves the input + result to history for comparison.

**How it works (end-to-end):**

1. User fills in sub-parameter values.
2. Frontend sends values to `POST /api/predict` as JSON.
3. Backend loads pre-trained scikit-learn models (GradientBoosting / RandomForest / Ridge per sub-parameter).
4. For the 6 unpredictable parameters, historical mean values are used as fallback.
5. Predicted sub-scores are summed to get total NIRF score.
6. Rank is estimated by comparing the predicted score to the historical distribution in the dataset.
7. Result JSON is returned and displayed on the result card and chart.

---

### 4. Analyse Page (`/analyse`)

**Purpose:** Visual analytics dashboard to explore trends, compare colleges, and understand what drives NIRF rankings.

**What it contains:**

- **College Comparison Tool** — A multi-select dropdown to pick 2–5 colleges. Shows a grouped bar chart comparing their scores across all main parameters side by side.
- **Year-on-Year Trend Chart** — A line chart showing how a selected college's total NIRF score and rank have changed from 2016 to the latest year.
- **Parameter Heatmap** — A heatmap grid (colleges × sub-parameters) coloured by score intensity, making it easy to spot strengths and weaknesses at a glance.
- **Top N Colleges Leaderboard** — A ranked table (configurable N: 10 / 25 / 50) for any selected year, with bar indicators.
- **Correlation Chart** — A scatter plot showing correlation between two user-selected parameters (e.g. Research Publications vs. Total Score) with a regression line.
- **State-wise Map** (optional) — A choropleth map of India shaded by average NIRF score per state.
- **Insight Cards** — Auto-generated text insights such as "IIT Hyderabad improved 12 ranks in 2024" or "Research score is the highest predictor of final rank".

**How it works (end-to-end):**

1. On page load, frontend calls `GET /api/analyse/summary` for aggregate stats.
2. College Comparison calls `GET /api/analyse/compare?colleges=X,Y,Z&year=2024`.
3. Trend chart calls `GET /api/analyse/trend?college=X`.
4. Heatmap and Leaderboard call `GET /api/analyse/heatmap?year=2024` and `GET /api/analyse/leaderboard?year=2024&top=25`.
5. Correlation chart calls `GET /api/analyse/correlation?x=RPC&y=total_score`.
6. All charts are rendered using Recharts (already in the frontend stack).
7. Insight cards are generated either server-side with rule-based logic or via a lightweight LLM call.

---

## Guide for New Collaborators — Step-by-Step

> If you are new to Git and GitHub, follow these exact steps. Do not skip any step.

---

### Step 0 — One-time Setup (do this once on your laptop)

```

### Step 1 — Clone the Repository

This downloads the entire project to your laptop.

```bash
git clone https://github.com/<owner-username>/nirf-intel.git
```

Then move into the project folder:

```bash
cd nirf-intel
```

---

### Step 2 — Switch to Your Assigned Branch

Each person works on their own branch. Replace `feature/data-page` with your actual branch name.

```bash
git checkout feature/data-page
```

Verify you are on the right branch:

```bash
git branch
```

The branch with a `*` in front is your current branch.

---

### Step 3 — Set Up the Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

The app will open at `http://localhost:5173`. You should see the existing pages.

---

### Step 4 — Set Up the Backend (FastAPI)

Open a **new terminal window** and from the project root:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The API will be running at `http://localhost:8000`. You can view the auto-generated API docs at `http://localhost:8000/docs`.

---

### Step 5 — Make Your Changes

Open the project in VS Code:

```bash
code .
```

Navigate to your page file inside `frontend/src/pages/`. Edit only your assigned page file. Do not touch other pages' files unless coordinated with the team.

---

### Step 6 — Save Your Work with Git (do this often, at least daily)

**Check what files you have changed:**

```bash
git status
```

**Stage your changes** (tell Git which files to include in this save):

```bash
git add .
```

Or to add a specific file only:

```bash
git add frontend/src/pages/DataPage.jsx
```

**Commit your changes** (save them with a message describing what you did):

```bash
git commit -m "feat: add search bar and filter panel to Data page"
```

> **Tip for commit messages:** Use a short, clear description. Examples:
> - `feat: add college comparison chart`
> - `fix: correct API endpoint for extraction`
> - `style: update table row hover colour`

---

### Step 7 — Get the Latest Changes from GitHub

Before pushing, always pull the latest changes first to avoid conflicts:

```bash
git pull origin feature/data-page
```

Replace `feature/data-page` with your own branch name.

---

### Step 8 — Push Your Changes to GitHub

```bash
git push origin feature/data-page
```

Replace `feature/data-page` with your own branch name.

---

### Step 9 — Create a Pull Request (PR)

Once your page is ready to be reviewed and merged into `main`:

1. Go to the repository on GitHub: `https://github.com/<owner-username>/nirf-intel`
2. Click the **"Compare & pull request"** button (GitHub usually shows this automatically after a push).
3. Set **base branch** to `main` and **compare branch** to your feature branch.
4. Write a title and short description of what you built.
5. Click **"Create Pull Request"**.
6. The project lead will review it and merge it.

---

### Golden Rules for the Team

| Rule | Why |
|---|---|
| Never push directly to `main` | `main` is the stable branch. All changes go through PRs. |
| Always pull before you push | Prevents merge conflicts with others' work. |
| Commit often, with clear messages | Makes it easy to undo mistakes and track progress. |
| Work only on your assigned page file | Prevents accidental overwrites of teammates' work. |
| Ask before editing shared files | `App.jsx`, `components/`, and `backend/main.py` are shared — coordinate first. |

---

### Common Problems and Fixes

**"I get a merge conflict when I pull"**

A merge conflict means Git found changes in the same file from two different people. Open the conflicting file — you will see markers like:

```
<<<<<<< HEAD
your code here
=======
their code here
>>>>>>> origin/feature/data-page
```

Delete the markers and keep whichever version (or a combination) is correct. Then:

```bash
git add .
git commit -m "resolve merge conflict in DataPage.jsx"
```

**"I accidentally edited the wrong file"**

To discard your changes to a file and reset it to the last commit:

```bash
git checkout -- frontend/src/pages/WrongFile.jsx
```

**"I forgot to switch branches before making changes"**

As long as you have not committed yet, you can switch branches and your uncommitted changes will come with you:

```bash
git checkout feature/my-correct-branch
```

Then stage and commit normally.

---

## Useful Links

- **Repository:** `https://github.com/<owner-username>/nirf-intel`
- **API Docs (local):** `http://localhost:8000/docs`
- **Frontend (local):** `http://localhost:5173`
- **NIRF Official Rankings:** https://www.nirfindia.org/Rankings/2024/EngineeringRanking.html
- **React Docs:** https://react.dev
- **FastAPI Docs:** https://fastapi.tiangolo.com
- **Recharts Docs:** https://recharts.org

---
