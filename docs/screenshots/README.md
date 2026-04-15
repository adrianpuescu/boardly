# Screenshots for the main README

Images are **PNG** files referenced from the root [`README.md`](../../README.md).

| File | Route | What to capture |
|------|--------|-----------------|
| `login.png` | `/login` | Magic link + Google CTA |
| `lobby.png` | `/lobby` | New game / time control / start flow |
| `dashboard.png` | `/dashboard` | Grid of active games |
| `game.png` | `/game/[id]` | Board + clocks + navbar |
| `profile.png` | `/profile` | Profile / settings |

**Tips:** Use a consistent window size (e.g. 1280×720 or 1440×900), light theme, and crop or hide personal data if needed. **Overwrite** the existing file with the same name so you don’t have to edit the README.

**Regenerate blank placeholders** (cream background + orange top bar, 960×540) after deleting or if you want a clean slate:

```bash
npm run docs:screenshots
```
