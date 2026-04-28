import os
import anthropic
from dotenv import load_dotenv
from db import run_query
from schema_context import SCHEMA_CONTEXT

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", "").strip())

def generate_sql(question: str) -> str:
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        system=SCHEMA_CONTEXT,
        messages=[
            {
                "role": "user",
                "content": f"Write a PostgreSQL query to answer this question: {question}\n\nReturn only the SQL query, no explanation, no markdown, no backticks."
            }
        ]
    )
    return message.content[0].text.strip()


def generate_summary(question: str, sql: str, results: list[dict]) -> str:
    if not results:
        return "The query returned no results."

    preview = results[:5]

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Question: {question}\n\n"
                    f"SQL used: {sql}\n\n"
                    f"First {len(preview)} of {len(results)} rows: {preview}\n\n"
                    "Write a 1-2 sentence plain English summary of what the data shows. "
                    "Be specific — include key numbers, names, or amounts from the results. "
                    "Do not explain the SQL. Do not use markdown."
                )
            }
        ]
    )
    return message.content[0].text.strip()


def run_nl_query(question: str) -> dict:
    sql = generate_sql(question)

    try:
        results = run_query(sql)
    except Exception as e:
        return {
            "sql": sql,
            "results": [],
            "summary": f"The query could not be executed: {str(e)}"
        }

    summary = generate_summary(question, sql, results)

    return {
        "sql": sql,
        "results": results,
        "summary": summary
    }
