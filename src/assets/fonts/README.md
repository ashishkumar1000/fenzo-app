# Inter font — setup

The Fenzit design system uses **Inter**. React Native can't load a variable .woff2 font, so download the
**static** `.ttf` files and drop them here, named exactly:

```
Inter-Regular.ttf    (400)
Inter-Medium.ttf     (500)
Inter-SemiBold.ttf   (600)
Inter-Bold.ttf       (700)
Inter-ExtraBold.ttf  (800)
```

Get them from https://fonts.google.com/specimen/Inter ("Get font" →
download → use the static instances), or from the Inter GitHub releases.

Then, from the project root:

```bash
npx react-native-asset      # links fonts into ios/ and android/
```

Rebuild the app (`bun ios` / `bun android`), then set `INTER_LINKED = true`
in `src/theme/fonts.ts`. Until then the app uses the system font.
