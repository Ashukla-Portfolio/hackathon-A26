from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from query_engine import run_nl_query, fetch_loop_data

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "https://hackathon-a26.vercel.app", "https://*.vercel.app"]
    allow_methods=["POST", "GET"],
    allow_headers=["*"]
)

DB_STATS = {
    "total_orgs":     1501,
    "total_loops":    5808,
    "total_circular": 260221334.00,
    "avg_score":      6.7
}

class QueryRequest(BaseModel):
    question: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/stats")
def stats():
    return DB_STATS

@app.get("/loops/{bn}")
def loops(bn: str):
    return fetch_loop_data(bn)

@app.post("/query")
def query(body: QueryRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    return run_nl_query(body.question)
