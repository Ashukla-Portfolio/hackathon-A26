"""
Agency 26 — Backend Test Suite
Run from: backend/
Command:  python test_suite.py
"""

import sys
import traceback

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
HEAD = "\033[94m──\033[0m"

results = []

def test(name, fn):
    try:
        result = fn()
        msg = result if isinstance(result, str) else "ok"
        print(f"  {PASS} {name}: {msg}")
        results.append((name, True, None))
    except Exception as e:
        print(f"  {FAIL} {name}: {e}")
        results.append((name, False, str(e)))

# ── 1. DATABASE ─────────────────────────────────────────────────
print(f"\n{HEAD} 1. Database connection")

from db import run_query

test("cra.loops row count", lambda:
    f"{run_query('SELECT COUNT(*) AS n FROM cra.loops')[0]['n']} loops")

test("cra.loop_universe row count", lambda:
    f"{run_query('SELECT COUNT(*) AS n FROM cra.loop_universe')[0]['n']} orgs")

test("vw_charity_profiles accessible", lambda:
    f"{run_query('SELECT COUNT(*) AS n FROM cra.vw_charity_profiles WHERE fiscal_year=2024')[0]['n']} profiles in 2024")

test("overhead_by_charity accessible", lambda:
    f"{run_query('SELECT COUNT(*) AS n FROM cra.overhead_by_charity WHERE fiscal_year=2024')[0]['n']} rows in 2024")

# ── 2. TITLE CASE ───────────────────────────────────────────────
print(f"\n{HEAD} 2. Title case formatter")

from query_engine import to_title_case

test("all caps org name", lambda:
    _assert(to_title_case("CANADAHELPS CANADON") == "Canadahelps Canadon",
            to_title_case("CANADAHELPS CANADON")))

test("conjunction not capitalised", lambda:
    _assert(to_title_case("JEWISH COMMUNITY FOUNDATION OF MONTREAL") ==
            "Jewish Community Foundation of Montreal",
            to_title_case("JEWISH COMMUNITY FOUNDATION OF MONTREAL")))

test("first word always capitalised", lambda:
    _assert(to_title_case("OF MICE AND MEN") == "Of Mice and Men",
            to_title_case("OF MICE AND MEN")))

def _assert(condition, value):
    if not condition:
        raise AssertionError(f"got: {value}")
    return str(value)

# ── 3. SQL GENERATION ───────────────────────────────────────────
print(f"\n{HEAD} 3. SQL generation")

from query_engine import generate_sql

def check_sql(question, required_tables=[], forbidden=[]):
    sql = generate_sql(question).lower()
    for t in required_tables:
        if t.lower() not in sql:
            raise AssertionError(f"missing table: {t}")
    for f in forbidden:
        if f.lower() in sql:
            raise AssertionError(f"forbidden token found: {f}")
    return sql[:80].replace('\n',' ') + '...'

test("risk score query uses loop_universe", lambda:
    check_sql("Which charities have the highest risk scores?",
              required_tables=["loop_universe"],
              forbidden=["INSERT","UPDATE","DELETE"]))

test("circular funding query — no LIMIT in SQL", lambda:
    check_sql("Which charities have the highest circular funding?",
              forbidden=["LIMIT"]))

test("govt funding query uses govt_funding_by_charity", lambda:
    check_sql("Which charities receive the most government funding?",
              required_tables=["govt_funding_by_charity"]))

test("overhead query uses overhead_by_charity", lambda:
    check_sql("Which loop participants have the highest overhead ratios?",
              required_tables=["overhead_by_charity"]))

test("no raw T3010 tables used", lambda:
    check_sql("Top charities by circular funding",
              forbidden=["cra_financial_details","cra_identification"]))

# ── 4. METRIC TYPE IDENTIFICATION ───────────────────────────────
print(f"\n{HEAD} 4. Metric type identification")

import re
from query_engine import identify_metric_type, _METRIC_SUBSTRING_MAP

def check_metric(sql, expected_type):
    mt, ml = identify_metric_type("", sql)
    if mt != expected_type:
        raise AssertionError(f"expected {expected_type}, got {mt}")
    return f"{mt} → {ml}"

test("circular amt identified", lambda:
    check_metric("SELECT legal_name AS organization, lu.total_circular_amt, lu.total_loops AS funding_loops, lu.score AS accountability_risk FROM cra.loop_universe lu",
                 "total_circular_amt"))

test("risk score identified", lambda:
    check_metric("SELECT legal_name AS organization, lu.score, lu.total_loops AS funding_loops, lu.total_circular_amt AS circular_amt FROM cra.loop_universe lu",
                 "accountability_risk"))

test("govt funding identified", lambda:
    check_metric("SELECT legal_name AS organization, g.total_govt, lu.total_loops AS funding_loops, lu.total_circular_amt AS circular_amt FROM cra.govt_funding_by_charity g",
                 "total_govt_amt"))

test("overhead pct identified", lambda:
    check_metric("SELECT legal_name AS organization, o.broad_overhead_pct, lu.total_loops AS funding_loops FROM cra.overhead_by_charity o",
                 "broad_overhead_pct"))

# ── 5. VISUAL CALLOUT ───────────────────────────────────────────
print(f"\n{HEAD} 5. Visual callout logic")

from query_engine import build_visual_callout

# Mock top20 rows
mock_circular = [{"circular_amt": 500000, "funding_loops": 10, "accountability_risk": 15}] * 20
mock_risk     = [{"accountability_risk": 19.0, "funding_loops": 10, "circular_amt": 100000}] * 20
mock_overhead = [{"broad_overhead_pct": 80.0, "funding_loops": 5, "circular_amt": 50000}] * 20

test("circular amt → percentage callout", lambda: (
    callout := build_visual_callout("total_circular_amt", "circular funding", "circular_amt", mock_circular, 100),
    _assert("%" in callout, callout)
)[1])

test("risk score → avg comparison callout", lambda: (
    callout := build_visual_callout("accountability_risk", "accountability risk score", "accountability_risk", mock_risk, 100),
    _assert("vs dataset avg" in callout, callout)
)[1])

test("overhead → avg comparison callout", lambda: (
    callout := build_visual_callout("broad_overhead_pct", "broad overhead percentage", "broad_overhead_pct", mock_overhead, 100),
    _assert("vs dataset avg" in callout, callout)
)[1])

test("percentage is ≤ 100", lambda: (
    callout := build_visual_callout("total_circular_amt", "circular funding", "circular_amt", mock_circular, 1501),
    pct := float(callout.split("%")[0].split()[-1]),
    _assert(pct <= 100, f"{pct}%")
)[2])

# ── 6. PROFILE DATA FETCH ───────────────────────────────────────
print(f"\n{HEAD} 6. Profile data fetch")

from query_engine import fetch_profile_data

test("fetch by org name returns data", lambda: (
    data := fetch_profile_data(["CANADAHELPS CANADON"]),
    _assert(len(data) > 0, f"{len(data)} profiles returned")
)[1])

test("profile contains required fields", lambda: (
    data := fetch_profile_data(["CANADAHELPS CANADON"]),
    profile := list(data.values())[0],
    _assert(all(k in profile for k in ["bn","legal_name","score","total_loops","broad_overhead_pct"]),
            list(profile.keys()))
)[2])

test("title case applied to profile keys", lambda: (
    data := fetch_profile_data(["CANADAHELPS CANADON"]),
    key := list(data.keys())[0],
    _assert(key[0].isupper() and key != key.upper(), key)
)[2])

# ── 7. LOOP DATA FETCH ──────────────────────────────────────────
print(f"\n{HEAD} 7. Loop data fetch")

from query_engine import fetch_loop_data

CANADAHELPS_BN = "896568417RR0001"

test("fetch returns rows", lambda: (
    rows := fetch_loop_data(CANADAHELPS_BN),
    _assert(len(rows) > 0, f"{len(rows)} rows")
)[1])

test("all 5 hop groups present", lambda: (
    rows := fetch_loop_data(CANADAHELPS_BN),
    hops := set(r["hops"] for r in rows),
    _assert(hops == {2,3,4,5,6}, f"hops found: {sorted(hops)}")
)[2])

test("rows have required fields", lambda: (
    rows := fetch_loop_data(CANADAHELPS_BN),
    row := rows[0],
    _assert(all(k in row for k in ["loop_id","hops","path_display","total_flow","src_name","dst_name","hop_flow","position_in_loop"]),
            list(row.keys()))
)[2])

test("max 20 loops per hop group", lambda: (
    rows := fetch_loop_data(CANADAHELPS_BN),
    hop_counts := {},
    [hop_counts.update({r["hops"]: hop_counts.get(r["hops"], set()) | {r["loop_id"]}}) for r in rows],
    _assert(all(len(v) <= 20 for v in hop_counts.values()),
            {k: len(v) for k,v in hop_counts.items()})
)[3])

# ── 8. FULL PIPELINE ────────────────────────────────────────────
print(f"\n{HEAD} 8. Full NL query pipeline")

from query_engine import run_nl_query

def run_and_check(question, check_fn):
    result = run_nl_query(question)
    return check_fn(result)

test("risk query returns 20 results", lambda:
    run_and_check("Which charities have the highest accountability risk scores?",
                  lambda r: _assert(len(r["results"]) <= 20,
                                    f"{len(r['results'])} rows")))

test("response has all required keys", lambda:
    run_and_check("Top charities by circular funding",
                  lambda r: _assert(
                      all(k in r for k in ["sql","results","summary","visual_callout","profile_data","stats"]),
                      list(r.keys()))))

test("profile_data populated for results", lambda:
    run_and_check("Which charities have the highest accountability risk scores?",
                  lambda r: _assert(len(r["profile_data"]) > 0,
                                    f"{len(r['profile_data'])} profiles")))

test("visual_callout is not None", lambda:
    run_and_check("Which charities have the highest accountability risk scores?",
                  lambda r: _assert(r["visual_callout"] is not None,
                                    r["visual_callout"])))

test("summary attributes a year", lambda:
    run_and_check("Which charities have the highest circular funding?",
                  lambda r: _assert(
                      any(str(y) in r["summary"] for y in range(2020, 2025)),
                      r["summary"])))

test("no SQL in results (read-only check)", lambda:
    run_and_check("Top charities by risk score",
                  lambda r: _assert(
                      not any(kw in r["sql"].upper() for kw in ["INSERT","UPDATE","DELETE","DROP"]),
                      "read-only confirmed")))

# ── SUMMARY ─────────────────────────────────────────────────────
total  = len(results)
passed = sum(1 for _, ok, _ in results if ok)
failed = total - passed

print(f"\n{'─'*50}")
print(f"  {passed}/{total} tests passed", end="")
if failed:
    print(f"  ({failed} failed)")
    print("\n  Failed tests:")
    for name, ok, err in results:
        if not ok:
            print(f"    {FAIL} {name}: {err}")
else:
    print("  — all green")
print()

sys.exit(0 if failed == 0 else 1)
