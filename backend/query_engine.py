import os
import anthropic
from dotenv import load_dotenv
from db import run_query
from schema_context import SCHEMA_CONTEXT

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", "").strip())
MODEL = "claude-haiku-4-5-20251001"

_LOWER_WORDS = {
    'a','an','and','at','but','by','for','from','in',
    'nor','of','on','or','the','to','with'
}

DATASET_AVERAGES = {
    "accountability_risk": 6.7,
    "broad_overhead_pct":  56.7,
    "govt_share_of_rev":   44.8,
    "govt_pct_revenue":    44.8,
}

METRIC_LABELS = {
    "total_circular_amt":  "circular funding",
    "circular_inflow":     "circular inflow",
    "circular_outflow":    "circular outflow",
    "revenue":             "total revenue",
    "total_expenditures":  "total expenditures",
    "total_govt_amt":      "government funding",
    "govt_pct_revenue":    "government share of revenue",
    "funding_loops":       "funding loop participation",
    "accountability_risk": "accountability risk score",
    "broad_overhead_pct":  "broad overhead percentage",
    "other":               "primary metric",
}

DENOMINATOR_SQL = {
    "total_circular_amt":  "SELECT SUM(total_circular_amt) AS total FROM cra.loop_universe",
    "circular_inflow":     "SELECT SUM(circular_inflow) AS total FROM cra.loop_charity_financials",
    "circular_outflow":    "SELECT SUM(circular_outflow) AS total FROM cra.loop_charity_financials",
    "revenue":             "SELECT SUM(total_revenue) AS total FROM cra.vw_charity_financials_by_year WHERE fiscal_year = 2024",
    "total_expenditures":  "SELECT SUM(total_expenditures) AS total FROM cra.vw_charity_financials_by_year WHERE fiscal_year = 2024",
    "total_govt_amt":      "SELECT SUM(total_govt) AS total FROM cra.govt_funding_by_charity WHERE fiscal_year = 2024",
    "funding_loops": """
        SELECT SUM(lu.total_loops) AS total
        FROM cra.loop_universe lu
        JOIN cra.overhead_by_charity o ON o.bn = lu.bn AND o.fiscal_year = 2024
    """,
}

AVG_METRIC_TYPES = {"accountability_risk", "broad_overhead_pct", "govt_pct_revenue", "govt_share_of_rev"}
PCT_METRIC_TYPES = set(DENOMINATOR_SQL.keys())


def to_title_case(name: str) -> str:
    if not name:
        return name
    return ' '.join(
        w.lower() if (i > 0 and w.lower() in _LOWER_WORDS) else w.capitalize()
        for i, w in enumerate(name.split())
    )


def metric_label(metric_type: str) -> str:
    return METRIC_LABELS.get(metric_type, metric_type.replace('_', ' '))


COLUMN_RULES = """
Output column rules — follow exactly:
1. Return exactly 5 columns in this order:
   a. legal_name aliased as "organization"
   b. primary metric for the question — alias does not matter
   c. total_loops aliased as "funding_loops" (from cra.loop_universe)
   d. total_circular_amt aliased as "circular_amt" (from cra.loop_universe)
   e. score aliased as "accountability_risk" (from cra.loop_universe, 0-30)

2. Special cases:
   - Primary metric IS circular_amt: replace col d with total_revenue aliased "revenue"
   - Primary metric is govt funding: col b = govt_share_of_rev as "govt_pct_revenue",
     col d = total_govt as "total_govt_amt"

3. Never include bn, id, pct, or internal key columns in output.
4. Always JOIN cra.loop_universe on bn to get cols c, d, e.
5. Do NOT add LIMIT — the calling code handles row limits.
"""

# Maps substrings in second SQL column to canonical metric types
_METRIC_SUBSTRING_MAP = [
    ("circular_inflow",    "circular_inflow"),
    ("circular_outflow",   "circular_outflow"),
    ("circular_amt",       "total_circular_amt"),
    ("total_circular",     "total_circular_amt"),
    ("total_revenue",      "revenue"),
    ("field_4700",         "revenue"),
    ("total_expenditure",  "total_expenditures"),
    ("field_5100",         "total_expenditures"),
    ("total_govt",         "total_govt_amt"),
    ("govt_share",         "govt_pct_revenue"),
    ("govt_pct",           "govt_pct_revenue"),
    ("total_loops",        "funding_loops"),
    ("funding_loops",      "funding_loops"),
    ("overhead_pct",       "broad_overhead_pct"),
    ("broad_overhead",     "broad_overhead_pct"),
    ("score",              "accountability_risk"),
    ("accountability",     "accountability_risk"),
]


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


def identify_metric_type(question: str, sql: str) -> tuple[str, str]:
    """
    Parse the second column from SELECT and map to canonical metric type.
    Uses substring matching on raw SQL — no Claude call needed.
    """
    try:
        match = re.search(r'SELECT\s+(.*?)\s+FROM', sql, re.IGNORECASE | re.DOTALL)
        if not match:
            return "other", "primary metric"
        cols = [c.strip() for c in match.group(1).split(",")]
        if len(cols) < 2:
            return "other", "primary metric"
        second_col = cols[1].lower()
        for substring, metric_type in _METRIC_SUBSTRING_MAP:
            if substring in second_col:
                return metric_type, METRIC_LABELS.get(metric_type, metric_type.replace("_", " "))
    except Exception:
        pass
    return "other", "primary metric"


def build_visual_callout(metric_type: str, metric_label_str: str,
                         primary_col: str, top20: list[dict], total_rows: int) -> str:

    if metric_type in PCT_METRIC_TYPES:
        denom_sql = DENOMINATOR_SQL[metric_type]
        try:
            result    = run_query(denom_sql)
            total_2024 = float(result[0]["total"]) if result and result[0].get("total") else None
            if total_2024 and total_2024 > 0:
                top20_sum = sum(float(r[primary_col]) for r in top20 if r.get(primary_col) is not None)
                pct = round((top20_sum / total_2024) * 100, 1)
                return (
                    f"Top {len(top20)} of {total_rows} results — "
                    f"representing {pct}% of 2024 total {metric_label_str}."
                )
        except Exception:
            pass

    elif metric_type in AVG_METRIC_TYPES:
        dataset_avg = DATASET_AVERAGES.get(metric_type)
        if dataset_avg is not None:
            vals = [float(r[primary_col]) for r in top20 if r.get(primary_col) is not None]
            if vals:
                top20_avg = round(sum(vals) / len(vals), 1)
                return (
                    f"Top {len(top20)} of {total_rows} results — "
                    f"avg {metric_label_str}: {top20_avg} vs dataset avg: {dataset_avg}."
                )

    return f"Showing top {len(top20)} of {total_rows} organizations by {metric_label_str}."


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
    try:
        return run_query(f"""
            SELECT
                l.id                                        AS loop_id,
                l.hops,
                l.path_display,
                l.total_flow,
                l.bottleneck_amt,
                l.min_year,
                l.max_year,
                lp.position_in_loop,
                lp.bn                                       AS src_bn,
                lp.sends_to                                 AS dst_bn,
                COALESCE(src_lu.legal_name, lp.bn)          AS src_name,
                COALESCE(dst_lu.legal_name, lp.sends_to)    AS dst_name,
                COALESCE(le.total_amt, l.bottleneck_amt, 0) AS hop_flow
            FROM cra.loop_participants lp
            JOIN cra.loops l ON l.id = lp.loop_id
            LEFT JOIN cra.loop_universe src_lu ON src_lu.bn = lp.bn
            LEFT JOIN cra.loop_universe dst_lu ON dst_lu.bn = lp.sends_to
            LEFT JOIN cra.loop_edges le
                ON le.src = lp.bn AND le.dst = lp.sends_to
            WHERE lp.loop_id IN (
                SELECT DISTINCT loop_id FROM cra.loop_participants
                WHERE bn = '{bn}'
                ORDER BY loop_id LIMIT 50
            )
            ORDER BY l.total_flow DESC, l.id, lp.position_in_loop
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
                "sql": sql, "results": [], "all_results_count": 0,
                "summary": f"Query could not be executed: {str(e2)}",
                "visual_callout": None, "profile_data": {}, "stats": {}
            }

    for r in all_results:
        if "organization" in r and r["organization"]:
            r["organization"] = to_title_case(str(r["organization"]))

    total_rows = len(all_results)
    top20      = all_results[:20]

    # Primary metric column is always index 1
    primary_col = list(top20[0].keys())[1] if top20 and len(top20[0]) >= 2 else None

    # Identify metric type from SQL — Claude classifies it, not column name matching
    metric_type, metric_label_str = identify_metric_type(question, sql) if primary_col else ("other", "primary metric")

    visual_callout = build_visual_callout(metric_type, metric_label_str, primary_col, top20, total_rows) if primary_col else None

    org_names    = [r.get("organization", "") for r in top20 if r.get("organization")]
    profile_data = fetch_profile_data(org_names)

    stats = {}
    if top20:
        risk_vals = [float(r.get("accountability_risk", 0)) for r in top20 if r.get("accountability_risk") is not None]
        circ_vals = [float(r.get("circular_amt", 0))        for r in top20 if r.get("circular_amt") is not None]
        loop_vals = [float(r.get("funding_loops", 0))       for r in top20 if r.get("funding_loops") is not None]
        stats = {
            "total_orgs":         total_rows,
            "total_circular_amt": sum(circ_vals),
            "avg_risk_score":     round(sum(risk_vals) / len(risk_vals), 1) if risk_vals else 0,
            "total_loops":        int(sum(loop_vals))
        }

    summary = generate_summary(question, top20, total_rows)

    return {
        "sql":               sql,
        "results":           top20,
        "all_results_count": total_rows,
        "summary":           summary,
        "visual_callout":    visual_callout,
        "profile_data":      profile_data,
        "stats":             stats
    }

# TEST
if __name__ == "__main__":
    import re
    test_sql = "SELECT lu.legal_name AS organization, lu.total_circular_amt, lu.total_loops AS funding_loops, cf.total_revenue AS revenue, lu.score AS accountability_risk FROM cra.loop_universe lu JOIN cra.loop_charity_financials lcf ON lcf.bn = lu.bn ORDER BY lu.total_circular_amt DESC LIMIT 20"
    # Extract second column
    select_body = re.search(r'SELECT\s+(.*?)\s+FROM', test_sql, re.IGNORECASE | re.DOTALL)
    if select_body:
        cols = [c.strip() for c in select_body.group(1).split(',')]
        print("COLS:", cols)
        second = cols[1] if len(cols) > 1 else ""
        print("SECOND COL:", second)
