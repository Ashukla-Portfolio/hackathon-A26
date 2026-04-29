# Agency 26 — Funding Loop Explorer

Natural language querying interface over CRA T3010 charity data, scoped to Challenge 3: circular funding pattern detection.

**Live:** https://hackathon-a26.vercel.app  
**Backend:** https://hackathon-a26.onrender.com

---

## What it does

Ask a plain-English question about Canadian charity funding loops. The app generates SQL, queries a live CRA PostgreSQL database, and renders the results as interactive visualizations.

Example questions:
- *Which charities have the highest accountability risk scores?*
- *Show me government-funded charities involved in funding loops*
- *Which charities have the most reciprocal two-hop funding loops?*

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 19, Plotly.js |
| Backend | Python 3.14, FastAPI, uvicorn |
| AI | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) |
| Database | PostgreSQL (CRA T3010, hosted on Render) |
| Hosting | Vercel (frontend), Render (backend) |

---

## Architecture

```
User question
    → Angular frontend (Vercel)
    → FastAPI backend (Render)
        → Claude: classify metric type
        → Claude: generate PostgreSQL SQL
        → CRA database: execute query
        → Python: compute percentage/avg callout
        → Claude: generate plain-English summary
    → Dashboard renders bar chart, risk scatter, loop distribution
```

Profile cards and Sankey diagrams load on demand when an org is clicked.

---

## Project structure

```
agency26/
├── backend/
│   ├── main.py              # FastAPI app, endpoints
│   ├── query_engine.py      # NL → SQL pipeline
│   ├── schema_context.py    # Schema prompt for Claude
│   ├── db.py                # psycopg2 connection pool
│   ├── requirements.txt
│   └── .env                 # secrets — never commit
├── frontend/
│   └── src/app/
│       ├── dashboard.component.ts   # entire UI
│       ├── api.service.ts           # HTTP client
│       └── environments/
│           ├── environment.ts       # dev (localhost:8000)
│           └── environment.prod.ts  # prod (Render URL)
├── test_suite.py            # backend test suite
└── project.yaml             # machine-readable architecture docs
```

---

## Local setup

**Backend**
```bash
cd backend
pip install -r requirements.txt
# create .env with DB and Anthropic credentials (see .env.example)
python -m uvicorn main:app --port 8000 --reload
```

**Frontend**
```bash
cd frontend
npm install
ng serve --proxy-config proxy.conf.json
```

Open `http://localhost:4200`.

**Run tests**
```bash
cd backend
python test_suite.py
```

---

## Environment variables

Create `backend/.env`:

```
DB_HOST=<render postgres host>
DB_PORT=5432
DB_NAME=<db name>
DB_USER=<db user>
DB_PASSWORD=<db password>
ANTHROPIC_API_KEY=<sk-ant-...>
```

---

## Data

- Source: CRA T3010 annual filings, 2020–2024
- ~85,000 registered Canadian charities
- 1,501 organizations identified in circular funding patterns
- 5,808 unique funding loops
- $260M total circular flow
- Risk scores 0–30 computed by loop detection algorithm

All data is public record via the Canada Revenue Agency.

---

## Known issues & future fixes

### Active bugs

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | `identify_metric_type` returns `"other"` intermittently | Visual callout shows "primary metric" instead of readable label | `import re` missing on some deployments — add to top of `query_engine.py` |
| 2 | Sankey group-end navigation doesn't advance between hop groups | User can't progress from e.g. 4-hop to 5-hop loops | State management in `advanceHopGroup()` needs `loopGroups` sync fix |
| 3 | `_assert` helper not in scope for title case tests | 3 test suite failures | Move `_assert` definition above first `test()` call in `test_suite.py` |
| 4 | Summary occasionally omits fiscal year attribution | Claude doesn't always follow the year attribution rule | Strengthen system prompt rule, add year to user prompt context |
| 5 | Render cold start causes first request to fail with 400 | Site appears broken for ~10s after inactivity | Upgrade to paid Render tier, or add a keep-alive ping |

### Suggested improvements

**Query engine**
- Upgrade to `claude-sonnet-4-20250514` once API tier allows — better SQL accuracy
- Add conversation history so follow-up questions have context
- Cache repeated identical queries to reduce API costs

**Visualizations**
- Chord diagram for loops with fewer than 6 unique organizations
- Year-over-year trend overlay on the risk scatter
- Export results as CSV

**Infrastructure**
- Add authentication for non-public deployments
- Move DB credentials to AWS Secrets Manager or similar
- CI/CD pipeline to run test suite on every push

**Data**
- `loops_7plus` column is unpopulated — loop detection only goes to 6 hops
- `loop_charity_financials` is an all-years aggregate — no per-year breakdown available
- 2023 sector expenditure figure ($576B vs ~$334B revenue) likely reflects restatements — flag in UI

---

## Test results (as of last run)

25/33 passing. See `test_suite.py` for full suite.

Failed: `_assert` scope (3), metric identification (4), summary year attribution (1).
