#!/usr/bin/env node
// Regression tests for Smart Forward Loop ranking (§14-15)
// Tests A-D from task + additional coverage

function coverageBonus(cov) {
  if (cov >= 0.90) return 12;
  if (cov >= 0.80) return 8;
  if (cov >= 0.70) return 4;
  if (cov >= 0.60) return 0;
  if (cov >= 0.50) return -10;
  if (cov >= 0.40) return -8;
  return -32;
}
function durationPenalty(dur, src) {
  if (dur < 3) return -100;
  if (dur < 5) {
    if (src <= 9) return -2;
    if (src <= 13) return -22;
    return -38;
  }
  if (dur < 7) {
    if (src <= 9) return 0;
    if (src <= 13) return -14;
    return -22;
  }
  if (dur < 9) {
    if (src <= 9) return 0;
    return -8;
  }
  if (dur < 12) {
    if (src <= 12) return 0;
    return -3;
  }
  return 0;
}
function scoreCandidate(c, srcDur) {
  const cov = Math.min(1, c.duration / Math.max(0.1, srcDur));
  const covB = coverageBonus(cov);
  const durP = durationPenalty(c.duration, srcDur);
  const alignB = c.alignment && c.alignment.confidence >= 0.30 ? Math.min(2, c.alignment.confidence * 1.5) : 0;
  const final = c.score * 0.62 + cov * 26 + covB + durP + alignB;
  return { ...c, coverage: cov, covBonus: covB, durPenalty: durP, alignBonus: alignB, final };
}

function pick(candidates, srcDur) {
  const viable = candidates.filter(c => c.duration >= 3 && c.score >= 40);
  if (!viable.length) return null;
  const breakdowns = viable.map(c => scoreCandidate(c, srcDur));
  breakdowns.sort((a,b)=> b.final - a.final);
  // hard reject micro
  let best = null;
  for (const b of breakdowns) {
    const isMicro = b.duration < 5 && b.coverage < 0.45;
    const isExtreme = b.duration < 3.5;
    if (b.kind !== "full" && (isMicro || isExtreme)) {
      const hasAlt = breakdowns.some(o => o !== b && o.coverage >= 0.50 && o.score >= 60);
      if (hasAlt && b.score < 90) continue;
    }
    best = b;
    break;
  }
  return best ?? breakdowns[0];
}

function assert(cond, msg){ if(!cond){ console.error("FAIL",msg); process.exit(1);} }

function run(){
  console.log("=== TEST A: 18s source, 92/4.5s vs 78/16s => 16s debe ganar ===");
  let src=18;
  let c1={start:2,end:6.5,duration:4.5,score:92,kind:"detected", reason:"seam excelente corto", alignment:null};
  let c2={start:0,end:16,duration:16,score:78,kind:"detected", reason:"cobertura alta", alignment:null};
  let full={start:0,end:18,duration:18,score:55,kind:"full", reason:"full", alignment:null};
  let win = pick([c1,c2,full], src);
  console.log(" breakdowns:");
  for(let b of [c1,c2,full].map(c=>scoreCandidate(c,src)).sort((a,b)=>b.final-a.final)){
    console.log(`  ${b.kind} dur${b.duration} cov${(b.coverage*100).toFixed(0)}% seam${b.score} covB${b.covBonus} durP${b.durPenalty} final${b.final.toFixed(1)} ${b === win ? "→ WIN":""}`);
  }
  assert(win.duration===16, `TEST A expected 16s, got ${win.duration}`);
  console.log("PASS TEST A\n");

  console.log("=== TEST B: 18s, recorte 14-16s excepcional vs full peor => recorte debe ganar ===");
  src=18;
  c1={start:1,end:16,duration:15,score:88,kind:"detected", reason:"recorte largo bueno", alignment:null};
  let c2full={start:0,end:18,duration:18,score:48,kind:"full", reason:"full seam medio", alignment:null};
  win = pick([c1,c2full], src);
  for(let b of [c1,c2full].map(c=>scoreCandidate(c,src)).sort((a,b)=>b.final-a.final)){
    console.log(`  ${b.kind} dur${b.duration} cov${(b.coverage*100).toFixed(0)}% seam${b.score} covB${b.covBonus} durP${b.durPenalty} final${b.final.toFixed(1)} ${b===win?"→ WIN":""}`);
  }
  assert(win.kind==="detected" && win.duration===15, `TEST B expected detected 15s, got ${win.kind} ${win.duration}`);
  console.log("PASS TEST B\n");

  console.log("=== TEST C: ningún recorte bueno => full debe ganar ===");
  src=18;
  c1={start:0,end:4.5,duration:4.5,score:72,kind:"detected", reason:"corto medio", alignment:null};
  let c1b={start:5,end:9,duration:4,score:70,kind:"detected", reason:"corto medio 2", alignment:null};
  full={start:0,end:18,duration:18,score:55,kind:"full", reason:"full", alignment:null};
  win = pick([c1,c1b,full], src);
  for(let b of [c1,c1b,full].map(c=>scoreCandidate(c,src)).sort((a,b)=>b.final-a.final)){
    console.log(`  ${b.kind} dur${b.duration} cov${(b.coverage*100).toFixed(0)}% seam${b.score} covB${b.covBonus} durP${b.durPenalty} final${b.final.toFixed(1)} ${b===win?"→ WIN":""}`);
  }
  assert(win.kind==="full", `TEST C expected full, got ${win.kind} ${win.duration}`);
  console.log("PASS TEST C\n");

  console.log("=== TEST D: ningún micro-loop absurdamente corto debe ganar por seam ===");
  src=18;
  c1={start:3,end:6,duration:3,score:96,kind:"detected", reason:"micro perfecto", alignment:null};
  let c2L={start:0,end:16,duration:16,score:75,kind:"detected", reason:"largo decente", alignment:null};
  full={start:0,end:18,duration:18,score:58,kind:"full", reason:"full", alignment:null};
  win = pick([c1,c2L,full], src);
  for(let b of [c1,c2L,full].map(c=>scoreCandidate(c,src)).sort((a,b)=>b.final-a.final)){
    console.log(`  ${b.kind} dur${b.duration} cov${(b.coverage*100).toFixed(0)}% seam${b.score} covB${b.covBonus} durP${b.durPenalty} final${b.final.toFixed(1)} ${b===win?"→ WIN":""}`);
  }
  assert(win.duration!==3, `TEST D micro 3s no debe ganar, ganó ${win.duration}`);
  assert(win.duration>=12, `TEST D expected largo/full >=12, got ${win.duration}`);
  console.log("PASS TEST D\n");

  console.log("=== TEST E: cobertura preferida 90-100 vs 50-60 ===");
  src=20;
  c1={start:0,end:10,duration:10,score:80,kind:"detected", reason:"50% cov", alignment:null};
  c2={start:0,end:19,duration:19,score:75,kind:"detected", reason:"95% cov", alignment:null};
  win = pick([c1,c2], src);
  for(let b of [c1,c2].map(c=>scoreCandidate(c,src)).sort((a,b)=>b.final-a.final)){
    console.log(`  dur${b.duration} cov${(b.coverage*100).toFixed(0)}% seam${b.score} covB${b.covBonus} durP${b.durPenalty} final${b.final.toFixed(1)} ${b===win?"→ WIN":""}`);
  }
  assert(win.duration===19, `TEST E expected 19s (95% cov) gana pese a seam ligeramente menor`);
  console.log("PASS TEST E\n");

  console.log("=== TEST F: source 8s, 4s/50% vs full 8/100% con seam alto => con nueva filosofía full gana (cobertura 100% vs 50%) ===");
  src=8;
  c1={start:0,end:4,duration:4,score:90,kind:"detected", reason:"half perfect", alignment:null};
  full={start:0,end:8,duration:8,score:47,kind:"full", reason:"full low", alignment:null};
  win = pick([c1,full], src);
  for(let b of [c1,full].map(c=>scoreCandidate(c,src)).sort((a,b)=>b.final-a.final)){
    console.log(`  ${b.kind} dur${b.duration} cov${(b.coverage*100).toFixed(0)}% seam${b.score} covB${b.covBonus} durP${b.durPenalty} final${b.final.toFixed(1)} ${b===win?"→ WIN":""}`);
  }
  // Según nueva filosofía, cobertura pesa fuerte: 50% penalizado vs 100% excelente.
  // Aunque seam 90 es excepcional, 4s no debe ganar sobre full 8s si full tiene seam decente (47 es bajo pero no terrible).
  // Para sintético perfecto con seam 99 vs 83, full sigue ganando (ver log servidor). Este comportamiento es deseado:
  // preferir variedad temporal. El test sintético de companion sigue pasando porque ordena solo entre detected.
  assert(win.kind==="full", `TEST F expected full wins for src 8 under new philosophy, got ${win.duration} ${win.kind}`);
  console.log("PASS TEST F (full preferred) \n");

  console.log("=== TEST G: source 6s, micro 0.5s 77 vs full 6 47 => full debe ganar ===");
  src=6;
  c1={start:0,end:0.5,duration:0.5,score:77.4,kind:"detected", reason:"micro", alignment:null};
  full={start:0,end:6,duration:6,score:47.7,kind:"full", reason:"full", alignment:null};
  win = pick([c1,full], src);
  // viable filtra <3, así que 0.5 no viable => full gana
  console.log(`  viable pick => ${win ? win.duration : "null"} ${win ? win.kind : ""}`);
  assert(win && win.kind==="full", `TEST G expected full, got ${win?.duration}`);
  console.log("PASS TEST G\n");

  console.log("All ranking tests PASS");
}
run();
