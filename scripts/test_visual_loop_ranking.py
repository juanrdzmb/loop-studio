#!/usr/bin/env python3
"""Tests for new Smart Forward Loop ranking — mirrors test_visual_loop_ranking.mjs"""

def coverage_bonus(cov: float) -> float:
    if cov >= 0.90: return 12.0
    if cov >= 0.80: return 8.0
    if cov >= 0.70: return 4.0
    if cov >= 0.60: return 0.0
    if cov >= 0.50: return -10.0
    if cov >= 0.40: return -8.0
    return -32.0

def duration_penalty(dur: float, src: float) -> float:
    if dur < 3.0: return -100.0
    if dur < 5.0:
        if src <= 9.0: return -2.0
        if src <= 13.0: return -22.0
        return -38.0
    if dur < 7.0:
        if src <= 9.0: return 0.0
        if src <= 13.0: return -14.0
        return -22.0
    if dur < 9.0:
        if src <= 9.0: return 0.0
        return -8.0
    if dur < 12.0:
        if src <= 12.0: return 0.0
        return -3.0
    return 0.0

def score(cand: dict, src: float) -> dict:
    cov = min(1.0, cand["duration"] / max(0.1, src))
    cb = coverage_bonus(cov)
    dp = duration_penalty(cand["duration"], src)
    ali = cand.get("alignment") or {}
    align_b = 0.0
    if isinstance(ali, dict) and ali.get("confidence") is not None:
        try:
            conf = float(ali["confidence"])
            if conf >= 0.30:
                align_b = min(2.0, conf*1.5)
        except: pass
    final = cand["score"]*0.62 + cov*26 + cb + dp + align_b
    return {**cand, "coverage": cov, "covBonus": cb, "durPenalty": dp, "alignBonus": align_b, "final": final}

def pick(cands, src):
    viable = [c for c in cands if c["duration"] >= 3 and c["score"] >= 40]
    if not viable: return None
    scored = [score(c, src) for c in viable]
    scored.sort(key=lambda x: x["final"], reverse=True)
    # hard reject micro
    best = None
    for b in scored:
        is_micro = b["duration"] <5 and b["coverage"] <0.45
        is_extreme = b["duration"] <3.5
        if b["kind"] != "full" and (is_micro or is_extreme):
            has_alt = any(o is not b and o["coverage"] >=0.50 and o["score"] >=60 for o in scored)
            if has_alt and b["score"] <90:
                continue
        best = b
        break
    return best or scored[0]

def assert_eq(a,b,msg):
    if a != b:
        print(f"FAIL {msg}: {a} != {b}")
        raise SystemExit(1)

def run():
    print("TEST A")
    src=18
    c1={"start":2,"end":6.5,"duration":4.5,"score":92,"kind":"detected","alignment":None}
    c2={"start":0,"end":16,"duration":16,"score":78,"kind":"detected","alignment":None}
    full={"start":0,"end":18,"duration":18,"score":55,"kind":"full","alignment":None}
    win=pick([c1,c2,full],src)
    print([(s["duration"], round(s["final"],1), s["kind"]) for s in sorted([score(c,src) for c in [c1,c2,full]], key=lambda x: x["final"], reverse=True)])
    assert win["duration"]==16, f"A expected 16 got {win}"
    print("PASS A")

    print("TEST B")
    src=18
    c1={"start":1,"end":16,"duration":15,"score":88,"kind":"detected","alignment":None}
    full={"start":0,"end":18,"duration":18,"score":48,"kind":"full","alignment":None}
    win=pick([c1,full],src)
    assert win["kind"]=="detected" and win["duration"]==15, f"B {win}"
    print("PASS B")

    print("TEST C")
    src=18
    c1={"start":0,"end":4.5,"duration":4.5,"score":72,"kind":"detected","alignment":None}
    c1b={"start":5,"end":9,"duration":4,"score":70,"kind":"detected","alignment":None}
    full={"start":0,"end":18,"duration":18,"score":55,"kind":"full","alignment":None}
    win=pick([c1,c1b,full],src)
    assert win["kind"]=="full", f"C {win}"
    print("PASS C")

    print("TEST D")
    src=18
    c1={"start":3,"end":6,"duration":3,"score":96,"kind":"detected","alignment":None}
    c2={"start":0,"end":16,"duration":16,"score":75,"kind":"detected","alignment":None}
    full={"start":0,"end":18,"duration":18,"score":58,"kind":"full","alignment":None}
    win=pick([c1,c2,full],src)
    assert win["duration"]!=3, f"D micro won {win}"
    assert win["duration"]>=12, f"D expected long {win}"
    print("PASS D")

    print("TEST E")
    src=20
    c1={"start":0,"end":10,"duration":10,"score":80,"kind":"detected","alignment":None}
    c2={"start":0,"end":19,"duration":19,"score":75,"kind":"detected","alignment":None}
    win=pick([c1,c2],src)
    assert win["duration"]==19, f"E {win}"
    print("PASS E")

    print("TEST F src8")
    src=8
    c1={"start":0,"end":4,"duration":4,"score":90,"kind":"detected","alignment":None}
    full={"start":0,"end":8,"duration":8,"score":47,"kind":"full","alignment":None}
    win=pick([c1,full],src)
    assert win["kind"]=="full", f"F {win}"
    print("PASS F")

    print("TEST G micro")
    src=6
    c1={"start":0,"end":0.5,"duration":0.5,"score":77.4,"kind":"detected","alignment":None}
    full={"start":0,"end":6,"duration":6,"score":47.7,"kind":"full","alignment":None}
    win=pick([c1,full],src)
    # viable filters <3, so 0.5 not viable => full wins
    assert win["kind"]=="full", f"G {win}"
    print("PASS G")

    print("All Python ranking tests PASS")

if __name__=="__main__":
    run()
