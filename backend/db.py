import os
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv

load_dotenv()

connection_pool = pool.SimpleConnectionPool(
    minconn=1,
    maxconn=5,
    host=os.getenv("DB_HOST"),
    port=os.getenv("DB_PORT", 5432),
    dbname=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    sslmode="require",
    connect_timeout=10
)


def get_connection():
    return connection_pool.getconn()


def release_connection(conn):
    connection_pool.putconn(conn)


def run_query(sql: str) -> list[dict]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return [dict(zip(columns, row)) for row in rows]
    finally:
        release_connection(conn)
