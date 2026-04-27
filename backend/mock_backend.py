from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/query")
def query(body: dict):
    return {
        "sql": "SELECT * FROM cra.loops LIMIT 2",
        "summary": "Found 2 funding loops in the database.",
        "results": [
            {"id": 1, "hops": 2, "total_flow": 50000, "path_display": "Org A → Org B → Org A"},
            {"id": 2, "hops": 3, "total_flow": 120000, "path_display": "Org C → Org D → Org E → Org C"}
        ]
    }