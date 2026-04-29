import os
import anthropic
from dotenv import load_dotenv
from db import run_query
from schema_context import SCHEMA_CONTEXT

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", "").strip())
MODEL = "claude-haiku-4-5-20251001"

COLUMN_RULES = """
Output column rules — you MUST follow these exactly:
1. Always return exactly these 6 columns in this order:
   - legal_name aliased as "organization"
   - primary metric for the question (the main thing being measured)
   - total_loops aliased as "funding_loops" (from cra.loop_universe)
   - total_circular_amt aliased as "circular_amt" (from cra.loop_universe)
   - score aliased as "accountability_risk" (from cra.loop_universe, 0-30)
   - pct_of_2024_total (only if primary metric is a dollar amount, else omit and use a 5th meaningful column)

2. NEVER include bn, id, or any internal key columns in SELECT output.

3. Special cases:
   - If primary metric IS total_circular_amt: replace circular_amt with total_revenue aliased as "revenue"
   - If primary metric is government funding: col 2 = govt_share_of_rev aliased as "govt_pct_of_revenue", col 4 = total_govt aliased as "total_govt_amt"

4. Always JOIN cra.loop_universe to get total_loops, total_circular_amt, score.
   Join key: lu.bn = <other_table>.bn
"""


def call_claude(system: str, user: str, max_tokens: int = 1000) -> str:
    message = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}]
    )
    return message.content[0].text.strip()


def generate_sql(question: str) -> str:
    return call_claude(
        system=SCHEMA_CONTEXT,
        user=(
            f"Write a PostgreSQL query to answer this question: {question}\n\n"
            f"{COLUMN_RULES}\n"
            "Use LIMIT 20.\n"
            "Return only the SQL query, no explanation, no markdown, no backticks."
        )
    )


def fetch_profile_data(bns: list[str]) -> dict:
    """Fetch full profile for each bn in the result set."""
    if not bns:
        return {}
    bn_list = ", ".join(f"'{bn}'" for bn in bns)
    try:
        rows = run_query(f"""
            SELECT
                lu.bn,
                lu.legal_name,
                lu.total_loops,
                lu.loops_2hop,
                lu.loops_3hop,
                lu.loops_4hop,
                lu.loops_5hop,
                lu.loops_6hop,
                lu.score,
                lu.total_circular_amt,
                lcf.circular_inflow,
                lcf.circular_outflow,
                lcf.revenue,
                lcf.total_expenditures,
                lcf.program_spending,
                lcf.admin_spending,
                o.broad_overhead_pct,
                o.outlier_flag,
                o.fiscal_year
            FROM cra.loop_universe lu
            LEFT JOIN cra.loop_charity_financials lcf ON lcf.bn = lu.bn
            LEFT JOIN cra.overhead_by_charity o ON o.bn = lu.bn
                AND o.fiscal_year = (
                    SELECT MAX(fiscal_year) FROM cra.overhead_by_charity
                    WHERE bn = lu.bn
                )
            WHERE lu.bn IN ({bn_list})
        """)
        return {r["bn"]: r for r in rows}
    except Exception:
        return {}


def generate_summary(question: str, results: list[dict]) -> str:
    if not results:
        return "The query returned no results."
    preview = results[:5]
    return call_claude(
        system=(
            "You write plain English summaries of charity accountability data. "
            "Rules: "
            "1. Always attribute numbers to their fiscal year. "
            "2. Be specific — include key names and amounts. "
            "3. No markdown. "
            "4. Maximum 2 sentences."
        ),
        user=(
            f"Question: {question}\n"
            f"Sample results (first {len(preview)} of {len(results)} rows): {preview}\n\n"
            "Summarize what the data shows, attributing all numbers to their fiscal year."
        ),
        max_tokens=200
    )


def run_nl_query(question: str) -> dict:
    sql = generate_sql(question)

    try:
        results = run_query(sql)
    except Exception as e:
        retry_sql = call_claude(
            system=SCHEMA_CONTEXT,
            user=(
                f"This SQL failed: {str(e)}\n\nSQL: {sql}\n\n"
                f"{COLUMN_RULES}\n"
                "Fix and return only the corrected SQL, no markdown, no backticks."
            )
        )
        try:
            results = run_query(retry_sql)
            sql = retry_sql
        except Exception as e2:
            return {
                "sql": sql,
                "results": [],
                "summary": f"Query could not be executed: {str(e2)}",
                "percentage_stat": None,
                "profile_data": {},
                "stats": {}
            }

    results = results[:20]

    # Compute percentage stat from pct column if present
    percentage_stat = None
    pct_col = next((k for k in (results[0].keys() if results else []) if "pct" in k.lower()), None)
    if pct_col and results:
        top_total = sum(float(r[pct_col]) for r in results if r.get(pct_col) is not None)
        percentage_stat = f"Top {len(results)} account for {round(top_total, 1)}% of 2024 total."

    # Extract bns from results for profile fetch
    # Try to find bn from results — not in SELECT but we need it for profiles
    # Fetch profiles using legal_name match against loop_universe
    org_names = [r.get("organization", "") for r in results if r.get("organization")]
    profile_data = {}
    if org_names:
        try:
            name_conditions = " OR ".join(
                f"lu.legal_name ILIKE '{name.replace(chr(39), chr(39)*2)}'"
                for name in org_names[:20]
            )
            rows = run_query(f"""
                SELECT
                    lu.bn, lu.legal_name, lu.total_loops,
                    lu.loops_2hop, lu.loops_3hop, lu.loops_4hop,
                    lu.loops_5hop, lu.loops_6hop,
                    lu.score, lu.total_circular_amt,
                    lcf.circular_inflow, lcf.circular_outflow,
                    lcf.revenue, lcf.total_expenditures,
                    lcf.program_spending, lcf.admin_spending,
                    o.broad_overhead_pct, o.outlier_flag, o.fiscal_year
                FROM cra.loop_universe lu
                LEFT JOIN cra.loop_charity_financials lcf ON lcf.bn = lu.bn
                LEFT JOIN cra.overhead_by_charity o ON o.bn = lu.bn
                    AND o.fiscal_year = (
                        SELECT MAX(fiscal_year) FROM cra.overhead_by_charity
                        WHERE bn = lu.bn
                    )
                WHERE {name_conditions}
            """)
            profile_data = {r["legal_name"]: r for r in rows}
        except Exception:
            pass

    # Dashboard stats
    stats = {}
    if results:
        risk_vals = [float(r.get("accountability_risk", 0)) for r in results if r.get("accountability_risk") is not None]
        circ_vals = [float(r.get("circular_amt", 0)) for r in results if r.get("circular_amt") is not None]
        loop_vals = [float(r.get("funding_loops", 0)) for r in results if r.get("funding_loops") is not None]
        stats = {
            "total_orgs": len(results),
            "total_circular_amt": sum(circ_vals),
            "avg_risk_score": round(sum(risk_vals) / len(risk_vals), 1) if risk_vals else 0,
            "total_loops": int(sum(loop_vals))
        }

    summary = generate_summary(question, results)

    return {
        "sql": sql,
        "results": results,
        "summary": summary,
        "percentage_stat": percentage_stat,
        "profile_data": profile_data,
        "stats": stats
    }
