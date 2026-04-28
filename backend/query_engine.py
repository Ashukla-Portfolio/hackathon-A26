import os
import anthropic
from dotenv import load_dotenv
from db import run_query
from schema_context import SCHEMA_CONTEXT

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", "").strip())
MODEL = "claude-haiku-4-5-20251001"


def call_claude(system: str, user: str, max_tokens: int = 1000) -> str:
    message = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}]
    )
    return message.content[0].text.strip()


def classify_question(question: str) -> str:
    """Returns 'ranking' or 'profile'."""
    result = call_claude(
        system="You classify charity data questions. Reply with exactly one word: 'ranking' if the question asks for a list, top N, or comparison across many charities. Reply with 'profile' if the question asks about a specific named charity or single organization.",
        user=question,
        max_tokens=5
    )
    return "profile" if "profile" in result.lower() else "ranking"


def generate_sql(question: str, response_type: str) -> str:
    if response_type == "profile":
        return call_claude(
            system=SCHEMA_CONTEXT,
            user=(
                f"Question: {question}\n\n"
                "Write a PostgreSQL query that returns a charity profile including: "
                "legal_name, bn, fiscal_year, revenue, total_expenditures, "
                "program_spending, admin_spending, broad_overhead_pct, "
                "total_loops, loops_2hop, loops_3hop, loops_4hop, loops_5hop, loops_6hop, "
                "score, total_circular_amt, circular_inflow, circular_outflow. "
                "Join cra.loop_universe, cra.loop_charity_financials, and cra.overhead_by_charity. "
                "Use the most recent fiscal_year available for that charity in cra.overhead_by_charity. "
                "Return only the SQL query, no explanation, no markdown, no backticks."
            )
        )
    else:
        return call_claude(
            system=SCHEMA_CONTEXT,
            user=(
                f"Write a PostgreSQL query to answer this question: {question}\n\n"
                "Rules:\n"
                "1. Use LIMIT 20.\n"
                "2. If the primary metric being ranked is a dollar amount (revenue, circular funding, expenditures, gifts, etc.), "
                "include an extra column called pct_of_2024_total computed as:\n"
                "   ROUND(metric_column * 100.0 / (SELECT SUM(metric_column) FROM relevant_table WHERE fiscal_year = 2024 OR EXTRACT(YEAR FROM fpe) = 2024), 2) AS pct_of_2024_total\n"
                "   Use the correct table and year filter for that metric. "
                "   If the metric comes from a table that uses fpe, filter with EXTRACT(YEAR FROM fpe) = 2024. "
                "   If it uses fiscal_year, filter with fiscal_year = 2024.\n"
                "3. If the primary metric is a count (loops, hops, directors, etc.), do NOT include pct_of_2024_total.\n"
                "4. Always alias dollar amount columns clearly.\n"
                "Return only the SQL query, no explanation, no markdown, no backticks."
            )
        )


def generate_summary(question: str, sql: str, results: list[dict], response_type: str) -> str:
    if not results:
        return "The query returned no results."

    preview = results[:5]

    return call_claude(
        system=(
            "You write plain English summaries of charity data query results. "
            "Rules: "
            "1. Always attribute numbers to their year — never state an amount without specifying the fiscal year it comes from. "
            "2. Be specific — include key numbers, names, or amounts from the results. "
            "3. Do not explain the SQL. "
            "4. Do not use markdown. "
            "5. Write 2-3 sentences maximum."
        ),
        user=(
            f"Question: {question}\n"
            f"Response type: {response_type}\n"
            f"First {len(preview)} of {len(results)} rows: {preview}\n\n"
            "Write a summary of what the data shows, attributing all numbers to their fiscal year."
        ),
        max_tokens=300
    )


def run_nl_query(question: str) -> dict:
    response_type = classify_question(question)

    sql = generate_sql(question, response_type)

    try:
        results = run_query(sql)
    except Exception as e:
        retry_sql = call_claude(
            system=SCHEMA_CONTEXT,
            user=(
                f"This SQL failed with error: {str(e)}\n\n"
                f"SQL: {sql}\n\n"
                "Fix the SQL and return only the corrected query, no explanation, no markdown, no backticks."
            )
        )
        try:
            results = run_query(retry_sql)
            sql = retry_sql
        except Exception as e2:
            return {
                "sql": retry_sql,
                "results": [],
                "summary": f"Query could not be executed: {str(e2)}",
                "response_type": response_type,
                "percentage_stat": None,
                "profile": None
            }

    # Build percentage_stat callout for ranking queries from pct column if present
    percentage_stat = None
    if response_type == "ranking" and results:
        pct_col = next((k for k in results[0].keys() if "pct" in k.lower()), None)
        if pct_col:
            top_total = sum(float(r[pct_col]) for r in results if r[pct_col] is not None)
            percentage_stat = f"The top {len(results)} results account for {round(top_total, 1)}% of the 2024 total."

    profile = results[0] if response_type == "profile" and results else None

    summary = generate_summary(question, sql, results, response_type)

    return {
        "sql": sql,
        "results": results,
        "summary": summary,
        "response_type": response_type,
        "percentage_stat": percentage_stat,
        "profile": profile
    }
