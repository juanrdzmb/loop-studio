# Assets locales (no se suben a git)

Coloca aquí tus overlays y sonidos. Los nombres deben coincidir con `companion/catalog.py`.

```
assets/
├── overlays/            # bucles de video sobre negro (blend screen)
│   ├── fog.mp4
│   ├── smoke.mp4
│   ├── rain.mp4
│   ├── particles.mp4
│   ├── particles2.mp4
│   ├── particulas 3.mp4
│   └── Fire.mp4
└── audio_ambience/      # ambiente + SFX (audio_sfx/ está vacío)
    ├── night_ambience.mp3
    ├── Cold_night.mp3
    ├── sea.mp3
    ├── wind.mp3
    ├── rain.mp3
    ├── camp_fire.mp3
    ├── paceful.mp3
    ├── bamboo.mp3
    ├── drop cave .mp3
    ├── farm_relax.mp3
    ├── thunder.mp3      # SFX
    ├── sword.mp3
    └── katana.mp3
```

Los `*.mp4` / `*.mp3` están en `.gitignore`. El companion los lee en local.
