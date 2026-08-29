#!/usr/bin/env bash
# Rebuild one-shot SFX from the real recordings in public/sfx (katana, sword, thunder, bamboo, wind, cave).
set -euo pipefail
OUT="/home/juanda/Proyectos/loop-studio/public/sfx"
K="$OUT/katana.mp3"
S="$OUT/sword.mp3"
T="$OUT/thunder.mp3"
B="$OUT/bamboo.mp3"
W="$OUT/wind.mp3"
C="$OUT/drop cave .mp3"

mix() { ffmpeg -y -hide_banner -loglevel error "$@"; }

echo "Baking real-sample SFX into $OUT"

# Dragonslayer: heavy slowed katana + sword + thunder sub
mix -i "$K" -i "$S" -i "$T" -filter_complex \
"[0:a]atrim=0:2.5,asetpts=PTS-STARTPTS,asetrate=44100*0.66,aresample=44100,volume=1.4[k];\
[1:a]atrim=0:1.5,asetpts=PTS-STARTPTS,asetrate=44100*0.58,aresample=44100,volume=1.05[s];\
[2:a]atrim=0:2.4,asetpts=PTS-STARTPTS,lowpass=f=240,volume=1.7[t];\
[k][s][t]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.94,atrim=0:3.6,asetpts=PTS-STARTPTS" \
-ac 2 -ar 44100 "$OUT/dragonslayer_clang.wav"

# Dark bell: slowed katana ring + thunder tail (metallic temple hit)
mix -i "$K" -i "$T" -filter_complex \
"[0:a]atrim=0.15:2.8,asetpts=PTS-STARTPTS,asetrate=44100*0.42,aresample=44100,aecho=0.8:0.88:160:0.45,volume=1.15[k];\
[1:a]atrim=0:4.0,asetpts=PTS-STARTPTS,lowpass=f=160,volume=0.85[t];\
[k][t]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.93,atrim=0:4.5,asetpts=PTS-STARTPTS" \
-ac 2 -ar 44100 "$OUT/dark_bell.wav"

# Heartbeat: two thunder body hits
mix -i "$T" -filter_complex \
"[0:a]atrim=0:0.28,asetpts=PTS-STARTPTS,asetrate=44100*0.5,aresample=44100,lowpass=f=180,volume=1.8,afade=t=out:st=0.16:d=0.12[a];\
[0:a]atrim=0:0.32,asetpts=PTS-STARTPTS,asetrate=44100*0.45,aresample=44100,lowpass=f=160,volume=1.5,afade=t=out:st=0.18:d=0.14,adelay=220|220[b];\
[a][b]amix=inputs=2:duration=longest:normalize=0,apad=pad_dur=0.6" \
-ac 2 -ar 44100 "$OUT/heartbeat.wav"

# Heavy blade cleave: sword + wind slice
mix -i "$S" -i "$W" -filter_complex \
"[0:a]atrim=0:1.4,asetpts=PTS-STARTPTS,volume=1.25[s];\
[1:a]atrim=2:3.1,asetpts=PTS-STARTPTS,highpass=f=400,volume=0.7,afade=t=in:d=0.08,afade=t=out:st=0.7:d=0.35[w];\
[s][w]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95,atrim=0:1.6,asetpts=PTS-STARTPTS" \
-ac 2 -ar 44100 "$OUT/sword_whoosh.wav"

# Katana iaijutsu: the real katana recording
mix -i "$K" -af "atrim=0:2.4,asetpts=PTS-STARTPTS,volume=1.15,alimiter=limit=0.95" \
-ac 2 -ar 44100 "$OUT/katana_draw.wav"

# Armor clatter: chopped sword hits
mix -i "$S" -filter_complex \
"[0:a]atrim=0:0.18,asetpts=PTS-STARTPTS,asetrate=44100*1.15,aresample=44100,volume=0.9[a];\
[0:a]atrim=0.12:0.32,asetpts=PTS-STARTPTS,asetrate=44100*0.92,aresample=44100,adelay=70|70,volume=0.75[b];\
[0:a]atrim=0.4:0.58,asetpts=PTS-STARTPTS,asetrate=44100*1.08,aresample=44100,adelay=150|150,volume=0.7[c];\
[0:a]atrim=0.8:1.0,asetpts=PTS-STARTPTS,adelay=240|240,volume=0.65[d];\
[a][b][c][d]amix=inputs=4:duration=longest:normalize=0,alimiter=limit=0.94,apad=pad_dur=0.2" \
-ac 2 -ar 44100 "$OUT/armor_rattle.wav"

# Bamboo water drop: real bamboo grove, short
mix -i "$B" -af "atrim=0:1.6,asetpts=PTS-STARTPTS,volume=1.2,afade=t=out:st=1.2:d=0.4" \
-ac 2 -ar 44100 "$OUT/bamboo_drop.wav"

# Steel blade clash: katana + sword together
mix -i "$K" -i "$S" -filter_complex \
"[0:a]atrim=0:1.6,asetpts=PTS-STARTPTS,volume=1.2[k];\
[1:a]atrim=0:1.2,asetpts=PTS-STARTPTS,volume=1.05[s];\
[k][s]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.94,atrim=0:1.8,asetpts=PTS-STARTPTS" \
-ac 2 -ar 44100 "$OUT/sword_parry.wav"

# Deep samurai exhale: wind, band-limited
mix -i "$W" -af "atrim=8:10.1,asetpts=PTS-STARTPTS,lowpass=f=1200,highpass=f=120,volume=1.35,afade=t=in:d=0.15,afade=t=out:st=1.5:d=0.5" \
-ac 2 -ar 44100 "$OUT/zen_breath.wav"

# Ice axe: bright sword tick + cave stone
mix -i "$S" -i "$C" -filter_complex \
"[0:a]atrim=0:0.45,asetpts=PTS-STARTPTS,highpass=f=800,volume=1.3[s];\
[1:a]atrim=1.2:2.4,asetpts=PTS-STARTPTS,volume=1.1[c];\
[s][c]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95,atrim=0:1.3,asetpts=PTS-STARTPTS" \
-ac 2 -ar 44100 "$OUT/ice_axe.wav"

# High altitude blizzard: real wind
mix -i "$W" -af "atrim=20:24.2,asetpts=PTS-STARTPTS,volume=1.25,afade=t=in:d=0.4,afade=t=out:st=3.5:d=0.7" \
-ac 2 -ar 44100 "$OUT/blizzard.wav"

# Thin air exhausted breath: two wind pushes
mix -i "$W" -filter_complex \
"[0:a]atrim=12:13.0,asetpts=PTS-STARTPTS,lowpass=f=900,volume=1.2,afade=t=in:d=0.12,afade=t=out:st=0.7:d=0.25[in];\
[0:a]atrim=30:31.2,asetpts=PTS-STARTPTS,lowpass=f=700,volume=1.35,adelay=750|750,afade=t=out:st=0.9:d=0.3[ex];\
[in][ex]amix=inputs=2:duration=longest:normalize=0" \
-ac 2 -ar 44100 "$OUT/heavy_breath.wav"

# Rock debris: cave drops / stone
mix -i "$C" -af "atrim=4:6.0,asetpts=PTS-STARTPTS,volume=1.25,afade=t=out:st=1.6:d=0.35" \
-ac 2 -ar 44100 "$OUT/rock_crumble.wav"

# Viking lur: thunder body pitched down (war drone) + katana overtone
mix -i "$T" -i "$K" -filter_complex \
"[0:a]atrim=0:3.8,asetpts=PTS-STARTPTS,asetrate=44100*0.55,aresample=44100,lowpass=f=400,volume=1.55,afade=t=in:d=0.35,afade=t=out:st=2.8:d=0.9[t];\
[1:a]atrim=0.3:2.2,asetpts=PTS-STARTPTS,asetrate=44100*0.5,aresample=44100,volume=0.45[k];\
[t][k]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.93,atrim=0:3.6,asetpts=PTS-STARTPTS" \
-ac 2 -ar 44100 "$OUT/war_horn.wav"

# Wooden shield bash: sword body + bamboo knock
mix -i "$S" -i "$B" -filter_complex \
"[0:a]atrim=0:0.7,asetpts=PTS-STARTPTS,asetrate=44100*0.78,aresample=44100,volume=1.3[s];\
[1:a]atrim=0.4:1.2,asetpts=PTS-STARTPTS,volume=1.1[b];\
[s][b]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.94,atrim=0:1.2,asetpts=PTS-STARTPTS" \
-ac 2 -ar 44100 "$OUT/shield_bash.wav"

# Manga DON: thunder slam + sword
mix -i "$T" -i "$S" -filter_complex \
"[0:a]atrim=0:2.2,asetpts=PTS-STARTPTS,asetrate=44100*0.7,aresample=44100,lowpass=f=280,volume=1.8[t];\
[1:a]atrim=0:0.5,asetpts=PTS-STARTPTS,volume=1.1[s];\
[t][s]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.93,atrim=0:2.4,asetpts=PTS-STARTPTS" \
-ac 2 -ar 44100 "$OUT/manga_don.wav"

# Manga page wipe: bamboo rustle, short and bright
mix -i "$B" -af "atrim=2.2:2.85,asetpts=PTS-STARTPTS,highpass=f=600,volume=1.4,afade=t=out:st=0.4:d=0.2" \
-ac 2 -ar 44100 "$OUT/manga_page.wav"

echo "Done."
ls -l "$OUT"/{dragonslayer_clang,dark_bell,heartbeat,sword_whoosh,katana_draw,armor_rattle,bamboo_drop,sword_parry,zen_breath,ice_axe,blizzard,heavy_breath,rock_crumble,war_horn,shield_bash,manga_don,manga_page}.wav
