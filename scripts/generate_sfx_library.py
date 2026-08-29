import os
import numpy as np
import scipy.io.wavfile as wavfile

SR = 44100
OUT_DIR = "/home/juanda/Proyectos/loop-studio/public/sfx"
os.makedirs(OUT_DIR, exist_ok=True)

def save_wav(filename, samples):
    # Normalize to -1..1 and convert to 16-bit PCM
    samples = np.asarray(samples, dtype=np.float32)
    max_val = np.max(np.abs(samples))
    if max_val > 1e-6:
        samples = samples / max_val * 0.95
    pcm = (samples * 32767).astype(np.int16)
    path = os.path.join(OUT_DIR, filename)
    wavfile.write(path, SR, pcm)
    print(f"Generated: {filename} ({len(samples)/SR:.2f}s)")

# 1. Berserk Dragonslayer Clang (Massive heavy iron slab clang)
def gen_dragonslayer_clang():
    dur = 4.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Huge sub-bass impact
    sub = np.sin(2 * np.pi * 75 * t) * np.exp(-t * 8.0)
    # Dense inharmonic iron plate partials
    partials = [
        (135.0, 1.0, 3.2),
        (240.0, 0.85, 4.0),
        (380.0, 0.7, 4.8),
        (540.0, 0.65, 5.5),
        (820.0, 0.55, 6.0),
        (1280.0, 0.45, 7.5),
        (2150.0, 0.35, 9.0),
        (3400.0, 0.25, 12.0),
        (4800.0, 0.2, 16.0),
    ]
    iron = np.zeros_like(t)
    for freq, amp, decay in partials:
        # Slight frequency modulation for metallic beating
        mod = 1.0 + 0.003 * np.sin(2 * np.pi * 4.5 * t)
        iron += amp * np.sin(2 * np.pi * freq * mod * t) * np.exp(-t * decay)
    
    # Sharp initial anvil strike transient
    noise = np.random.uniform(-1, 1, len(t)) * np.exp(-t * 85.0) * 0.8
    sig = sub * 0.9 + iron * 1.0 + noise
    return sig

# 2. Dark Bell (Berserk Eclipse / Temple bell)
def gen_dark_bell():
    dur = 5.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Hum tone (sub), prime, tierce (minor third), quint, octave
    bell_partials = [
        (55.0, 0.8, 1.2),   # Hum
        (110.0, 1.0, 1.8),  # Prime
        (130.8, 0.7, 2.2),  # Minor 3rd (Tierce)
        (164.8, 0.5, 2.8),  # Quint
        (220.0, 0.4, 3.5),  # Nominal
        (330.0, 0.25, 4.5), # Superquint
        (440.0, 0.15, 6.0), # Octave
    ]
    sig = np.zeros_like(t)
    for f, a, d in bell_partials:
        sig += a * np.sin(2 * np.pi * f * t) * np.exp(-t * d)
    # Soft mallet strike transient
    mallet = np.sin(2 * np.pi * 90 * t) * np.exp(-t * 40.0) * 0.6
    return sig + mallet

# 3. Berserk Heartbeat Pulse (Deep lub-dub)
def gen_heartbeat():
    dur = 1.8
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    sig = np.zeros_like(t)
    
    # Thump 1 at t=0.1
    t1 = t - 0.1
    mask1 = t1 >= 0
    thump1 = np.where(mask1, np.sin(2 * np.pi * (52 - 15 * t1) * t1) * np.exp(-t1 * 14.0), 0)
    
    # Thump 2 at t=0.42
    t2 = t - 0.42
    mask2 = t2 >= 0
    thump2 = np.where(mask2, np.sin(2 * np.pi * (58 - 18 * t2) * t2) * np.exp(-t2 * 16.0) * 0.85, 0)
    
    return thump1 + thump2

# 4. Blade Cleave / Whoosh
def gen_blade_whoosh():
    dur = 0.85
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    noise = np.random.uniform(-1, 1, len(t))
    # Swelling envelope peaking at 0.35s
    env = np.exp(-((t - 0.32) ** 2) / 0.015)
    # Resonant frequency sweep
    f_center = 250.0 + 900.0 * np.exp(-((t - 0.3) ** 2) / 0.02)
    # High blade resonance
    blade_ring = np.sin(2 * np.pi * 2200 * t) * env * 0.25
    sig = noise * env * 0.8 + blade_ring
    return sig

# 5. Vagabond Katana Iaijutsu Draw (Scrape and steel shimmer)
def gen_katana_draw():
    dur = 1.8
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Metallic scrape friction (accelerating)
    scrape_env = np.where(t < 0.6, (t / 0.6) ** 1.5, np.exp(-(t - 0.6) * 4.0))
    scrape = np.random.uniform(-1, 1, len(t)) * scrape_env * 0.4
    # Ringing steel resonance at unsheathe exit (0.55s)
    t_ring = np.maximum(0, t - 0.55)
    ring1 = np.sin(2 * np.pi * 3250 * t_ring) * np.exp(-t_ring * 2.8) * 0.7
    ring2 = np.sin(2 * np.pi * 5100 * t_ring) * np.exp(-t_ring * 4.5) * 0.4
    return scrape + ring1 + ring2

# 6. Vagabond Sword Parry / Clash (Steel spark)
def gen_sword_parry():
    dur = 1.6
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Instant sharp transient
    snap = np.random.uniform(-1, 1, len(t)) * np.exp(-t * 90.0) * 0.9
    # High steel clashing tones
    p1 = np.sin(2 * np.pi * 2850 * t) * np.exp(-t * 3.8) * 0.8
    p2 = np.sin(2 * np.pi * 4400 * t) * np.exp(-t * 6.0) * 0.5
    p3 = np.sin(2 * np.pi * 1450 * t) * np.exp(-t * 4.0) * 0.6
    return snap + p1 + p2 + p3

# 7. Vagabond Bamboo Water Drop
def gen_bamboo_drop():
    dur = 1.5
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Hollow woody knock at t=0
    knock = (np.sin(2 * np.pi * 280 * t) + 0.5 * np.sin(2 * np.pi * 620 * t)) * np.exp(-t * 22.0)
    # Water drop chirp at t=0.45
    t_d = np.maximum(0, t - 0.45)
    f_drop = 1600.0 + 800.0 * np.exp(-t_d * 40.0)
    drop = np.where(t >= 0.45, np.sin(2 * np.pi * f_drop * t_d) * np.exp(-t_d * 18.0) * 0.7, 0)
    return knock + drop

# 8. Climber Ice Axe Strike (Sharp ice crunch & fracture)
def gen_ice_axe():
    dur = 1.4
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # High-frequency crunch and shatter
    crunch = np.random.uniform(-1, 1, len(t)) * np.exp(-t * 45.0) * 0.9
    # Hard steel pick ring
    pick_ring = np.sin(2 * np.pi * 3800 * t) * np.exp(-t * 7.5) * 0.5
    # Dense crackles
    crackle = np.zeros_like(t)
    for dt in [0.02, 0.05, 0.09, 0.14, 0.22]:
        tc = np.maximum(0, t - dt)
        crackle += np.where(t >= dt, np.random.uniform(-0.5, 0.5, len(t)) * np.exp(-tc * 60.0), 0)
    return crunch + pick_ring + crackle * 0.6

# 9. Climber Blizzard Gale (Howling mountain wind)
def gen_blizzard():
    dur = 4.5
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    noise = np.random.uniform(-1, 1, len(t))
    # Wind howl modulations
    howl1 = np.sin(2 * np.pi * (340 + 60 * np.sin(2 * np.pi * 0.35 * t)) * t) * 0.35
    howl2 = np.sin(2 * np.pi * (520 + 90 * np.sin(2 * np.pi * 0.22 * t)) * t) * 0.25
    # Fade in / out
    env = np.sin(np.pi * t / dur) ** 0.8
    return (noise * 0.4 + howl1 + howl2) * env

# 10. Vinland War Horn (Nordic Lur Horn)
def gen_war_horn():
    dur = 4.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    f0 = 146.83 # D3
    # Brass harmonics with slight flutter
    flutter = 1.0 + 0.006 * np.sin(2 * np.pi * 5.8 * t)
    h1 = np.sin(2 * np.pi * f0 * flutter * t) * 0.9
    h2 = np.sin(2 * np.pi * f0 * 2 * flutter * t) * 0.7
    h3 = np.sin(2 * np.pi * f0 * 3 * flutter * t) * 0.5
    h4 = np.sin(2 * np.pi * f0 * 4 * flutter * t) * 0.35
    h5 = np.sin(2 * np.pi * f0 * 5 * flutter * t) * 0.2
    
    # Swelling brass attack and release
    env = np.where(t < 0.8, (t / 0.8) ** 1.5, np.exp(-(t - 0.8) * 0.7))
    breath = np.random.uniform(-0.15, 0.15, len(t)) * env
    return (h1 + h2 + h3 + h4 + h5 + breath) * env

# 11. Vinland Shield Bash (Wooden shield and iron boss thump)
def gen_shield_bash():
    dur = 1.5
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Heavy low wood body resonance
    wood = (np.sin(2 * np.pi * 95 * t) + 0.6 * np.sin(2 * np.pi * 210 * t)) * np.exp(-t * 14.0)
    # Iron rim slap
    rim = np.sin(2 * np.pi * 780 * t) * np.exp(-t * 35.0) * 0.5
    noise = np.random.uniform(-1, 1, len(t)) * np.exp(-t * 70.0) * 0.7
    return wood * 0.9 + rim + noise

# 12. Manga DON Impact Boom
def gen_manga_don():
    dur = 3.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Sub bass boom dropping 90Hz -> 38Hz
    f_drop = 38.0 + 52.0 * np.exp(-t * 6.0)
    sub = np.sin(2 * np.pi * f_drop * t) * np.exp(-t * 1.5)
    # Mid punch
    punch = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 18.0) * 0.8
    # Explosive transient
    burst = np.random.uniform(-1, 1, len(t)) * np.exp(-t * 40.0) * 0.8
    return sub * 1.1 + punch + burst

# 13. Manga Page Turn
def gen_manga_page():
    dur = 0.5
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    noise = np.random.uniform(-1, 1, len(t))
    env = np.exp(-((t - 0.18) ** 2) / 0.008)
    return noise * env * 0.8

# 14. Iron armor clatter (layered short metallic ticks)
def gen_armor_rattle():
    dur = 1.1
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    sig = np.zeros_like(t)
    for i, dt in enumerate([0.0, 0.05, 0.11, 0.18, 0.27, 0.36]):
        tc = np.maximum(0, t - dt)
        f = 900 + i * 220 + 80 * np.sin(20 * tc)
        tick = np.sin(2 * np.pi * f * tc) * np.exp(-tc * (18 + i * 3))
        grit = np.random.uniform(-1, 1, len(t)) * np.exp(-tc * 55) * 0.35
        sig += np.where(t >= dt, tick * 0.55 + grit, 0)
    return sig

# 15. Slow samurai exhale (filtered noise swell)
def gen_zen_breath():
    dur = 1.6
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    noise = np.random.uniform(-1, 1, len(t))
    env = np.where(t < 0.35, (t / 0.35) ** 1.4, np.exp(-(t - 0.35) * 2.2))
    tone = np.sin(2 * np.pi * (180 + 40 * np.sin(2 * np.pi * 0.7 * t)) * t) * 0.12
    return (noise * 0.55 + tone) * env

# 16. Thin-air double breath
def gen_heavy_breath():
    dur = 2.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    noise = np.random.uniform(-1, 1, len(t))
    inh = np.exp(-((t - 0.28) ** 2) / 0.04)
    exh = np.exp(-((t - 1.15) ** 2) / 0.07)
    air = np.sin(2 * np.pi * (140 + 30 * t) * t) * 0.1
    return (noise * 0.5 + air) * np.maximum(inh, exh * 0.9)

# 17. Rock / gravel crumble
def gen_rock_crumble():
    dur = 1.8
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    sig = np.zeros_like(t)
    for i, dt in enumerate(np.linspace(0, 0.9, 9)):
        tc = np.maximum(0, t - dt)
        burst = np.random.uniform(-1, 1, len(t)) * np.exp(-tc * (22 + i))
        thud = np.sin(2 * np.pi * (90 + i * 18) * tc) * np.exp(-tc * 10) * 0.4
        sig += np.where(t >= dt, burst * (0.55 - i * 0.04) + thud, 0)
    return sig

print("Generating Authentic Seinen SFX Library...")
save_wav("dragonslayer_clang.wav", gen_dragonslayer_clang())
save_wav("dark_bell.wav", gen_dark_bell())
save_wav("heartbeat.wav", gen_heartbeat())
save_wav("sword_whoosh.wav", gen_blade_whoosh())
save_wav("katana_draw.wav", gen_katana_draw())
save_wav("sword_parry.wav", gen_sword_parry())
save_wav("bamboo_drop.wav", gen_bamboo_drop())
save_wav("ice_axe.wav", gen_ice_axe())
save_wav("blizzard.wav", gen_blizzard())
save_wav("war_horn.wav", gen_war_horn())
save_wav("shield_bash.wav", gen_shield_bash())
save_wav("manga_don.wav", gen_manga_don())
save_wav("manga_page.wav", gen_manga_page())
save_wav("armor_rattle.wav", gen_armor_rattle())
save_wav("zen_breath.wav", gen_zen_breath())
save_wav("heavy_breath.wav", gen_heavy_breath())
save_wav("rock_crumble.wav", gen_rock_crumble())
print("All audio files generated successfully!")
