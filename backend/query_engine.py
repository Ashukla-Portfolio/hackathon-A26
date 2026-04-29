import os
import re
import anthropic
from dotenv import load_dotenv
from db import run_query
from schema_context import SCHEMA_CONTEXT

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", "").strip())
MODEL = "claude-haiku-4-5-20251001"

# Conjunctions excluded from title case
_LOWER_WORDS = {
    'a','an','and','at','but','by','for','from','in',
    'nor','of','on','or','the','to','with'
}

def to_title_case(name: str) -> str:
    if not name:
        return name
    words = name.split()
    result = []
    for i, word in enumerate(words):
        w = word.lower()
        if i == 0 or w not in _LOWER_WORDS:
            result.append(word.capitalize())
        else:
            result.append(w)
    return ' '.join(result)


COLUMN_RULES = """
Output column rules — follow exactly:
1. Return exactly 6 columns in this order:
   a. legal_name aliased as "organization"
   b. primary metric for the question
   c. total_loops aliased as "funding_loops" (from cra.loop_universe)
   d. total_circular_amt aliased as "circular_amt" (from cra.loop_universe)
   e. score aliased as "accountability_risk" (from cra.loop_universe, 0-30)
   f. If primary metric is dollars: include pct_of_2024_total as inline subquery
      ROUND(metric * 100.0 / (SELECT SUM(metric) FROM table WHERE fiscal_year=2024), 2) AS pct_of_2024_total
      If primary metric is a count: replace col f with one other meaningful numeric column

2. Special cases:
   - Primary metric IS circular_amt: replace col d with total_revenue aliased "revenue"
   - Primary metric is govt funding: col b = govt_share_of_rev as "govt_pct_revenue", col d = total_govt as "total_govt_amt"

3. Never include bn, id, or internal key columns in output.
4. Always JOIN cra.loop_universe on bn to get cols c, d, e.
5. Do NOT add LIMIT — the calling code handles row limits.
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
            "Return only the SQL query, no explanation, no markdown, no backticks."
        )
    )


def fetch_profile_data(org_names: list[str]) -> dict:
    if not org_names:
        return {}
    conditions = " OR ".join(
        f"lu.legal_name ILIKE '{n.replace(chr(39), chr(39)*2)}'"
        for n in org_names[:20]
    )
    try:
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
                    SELECT MAX(fiscal_year) FROM cra.overhead_by_charity WHERE bn = lu.bn
                )
            WHERE {conditions}
        """)
        return {to_title_case(r["legal_name"]): r for r in rows}
    except Exception:
        return {}


def fetch_loop_data(bn: str) -> list[dict]:
    """Fetch all loops and their participants for a given org bn."""
    try:
        return run_query(f"""
            SELECT
                l.id as loop_id,
                l.hops,
                l.path_display,
                l.total_flow,
                l.bottleneck_amt,
                l.min_year,
                l.max_year,
                lp.position_in_loop,
                lp.sends_to,
                lp.receives_from,
                lu_src.legal_name as src_name,
                lu_dst.legal_name as dst_name
            FROM cra.loop_participants lp
            JOIN cra.loops l ON l.id = lp.loop_id
            LEFT JOIN cra.loop_universe lu_src ON lu_src.bn = lp.sends_to
            LEFT JOIN cra.loop_universe lu_dst ON lu_dst.bn = lp.receives_from
            WHERE lp.bn = '{bn}'
            ORDER BY l.total_flow DESC
            LIMIT 50
        """)
    except Exception:
        return []


def generate_summary(question: str, results: list[dict], total_rows: int) -> str:
    if not results:
        return "The query returned no results."
    preview = results[:5]
    return call_claude(
        system=(
            "You write plain English summaries of charity accountability data. "
            "Rules: "
            "1. Always attribute numbers to their fiscal year. "
            "2. Be specific — include key names and amounts from the data. "
            "3. Reference the total result count, not just the sample. "
            "4. No markdown. Maximum 2 sentences."
        ),
        user=(
            f"Question: {question}\n"
            f"Total rows in full result: {total_rows}\n"
            f"Sample (first {len(preview)} rows): {preview}\n\n"
            "Summarize what the data shows across the full result set."
        ),
        max_tokens=200
    )


def run_nl_query(question: str) -> dict:
    sql = generate_sql(question)

    try:
        all_results = run_query(sql)
    except Exception as e:
        retry_sql = call_claude(
            system=SCHEMA_CONTEXT,
            user=(
                f"This SQL failed: {str(e)}\n\nSQL: {sql}\n\n"
                f"{COLUMN_RULES}\n"
                "Fix and return only corrected SQL, no markdown, no backticks."
            )
        )
        try:
            all_results = run_query(retry_sql)
            sql = retry_sql
        except Exception as e2:
            return {
                "sql": sql,
                "results": [],
                "all_results_count": 0,
                "summary": f"Query could not be executed: {str(e2)}",
                "percentage_stat": None,
                "visual_callout": None,
                "profile_data": {},
                "stats": {}
            }

    # Apply title case to organization column
    for r in all_results:
        if "organization" in r and r["organization"]:
            r["organization"] = to_title_case(str(r["organization"]))

    total_rows   = len(all_results)
    top20        = all_results[:20]

    # Visual callout — top 20 as % of full result metric
    visual_callout = None
    pct_col = next((k for k in (top20[0].keys() if top20 else []) if "pct" in k.lower()), None)
    if pct_col and top20:
        top_pct = round(sum(float(r[pct_col]) for r in top20 if r.get(pct_col) is not None), 1)
        visual_callout = f"Visualizing top 20 of {total_rows} results, representing {top_pct}% of the 2024 total."
    elif total_rows > 20:
        visual_callout = f"Visualizing top 20 of {total_rows} matching organizations."

    # Percentage stat callout
    percentage_stat = None
    if pct_col and top20:
        top_pct = round(sum(float(r[pct_col]) for r in top20 if r.get(pct_col) is not None), 1)
        percentage_stat = f"Top 20 account for {top_pct}% of 2024 total."

    # Profile data for top 20
    org_names   = [r.get("organization", "") for r in top20 if r.get("organization")]
    profile_data = fetch_profile_data(org_names)

    # Dashboard stats (scoped to result set)
    stats = {}
    if top20:
        risk_vals = [float(r.get("accountability_risk", 0)) for r in top20 if r.get("accountability_risk") is not None]
        circ_vals = [float(r.get("circular_amt", 0))        for r in top20 if r.get("circular_amt") is not None]
        loop_vals = [float(r.get("funding_loops", 0))       for r in top20 if r.get("funding_loops") is not None]
        stats = {
            "total_orgs":     total_rows,
            "total_circular_amt": sum(circ_vals),
            "avg_risk_score": round(sum(risk_vals) / len(risk_vals), 1) if risk_vals else 0,
            "total_loops":    int(sum(loop_vals))
        }

    summary = generate_summary(question, top20, total_rows)

    return {
        "sql":               sql,
        "results":           top20,
        "all_results_count": total_rows,
        "summary":           summary,
        "percentage_stat":   percentage_stat,
        "visual_callout":    visual_callout,
        "profile_data":      profile_data,
        "stats":             stats
    }
