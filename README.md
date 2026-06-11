# Audio Sample Gallery

Static listening gallery for Input, AGMS-ILRMA, and AGMS-ILRMA + FW-RCSCME examples at 3, 5, 10, and 15 m. Each distance includes one female-voice and one male-voice case.

Run locally from the repository root:

```bash
python3 -m http.server 8132 --directory subjective-test/audio_sample_showcase_20260611
```

Then open <http://127.0.0.1:8132/>.

Regenerate the trimmed/normalised distance clips and `samples.json`:

```bash
/Users/jinxuanteh/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/build_audio_distance_showcase.py
```

The generated 24 clips are written to `distance_audio/` and normalised to `-32 dBFS(A)` A-weighted digital RMS with a `-1 dBFS` peak ceiling.
