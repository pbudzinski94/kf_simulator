# Forlorn Forge

Statyczny kalkulator, komparator i symulator broni do *Kingdoms Forlorn*.

## Uruchomienie

Otwórz `index.html` w przeglądarce. Aplikacja nie wymaga instalowania zależności ani połączenia z serwerem.

## Zakres obliczeń

- dokładny rozkład trafień z kości ataku k10,
- dokładny rozkład niestandardowych kości Power,
- jeden wspólny Knight Pool dla porównywanych broni,
- Break, Hope, Power i Opening,
- ograniczone przerzuty kości ataku i kości Power,
- efekt Black: przerzut kości Power i zamiana najwyżej 1 Break z jej wyniku na bezpośrednie obrażenie,
- szansa rany, wartość oczekiwana, maksimum i rozkład obrażeń,
- losowy symulator pojedynczego ataku.

Kości ataku k10 oraz symbole Attack na kościach Power są celowo reprezentowane osobnymi pojęciami. W kodzie symbole z Power Dice występują jako `power`.

## Rozwój

Definicje ścianek znajdują się w `js/dice.js`, matematyka i strategia przerzutów w `js/engine.js`, a interfejs w `js/app.js`. Każda kość może być przerzucona najwyżej raz. Strategia maksymalizuje szansę rany, a przy remisie wartość oczekiwaną obrażeń.

Testy silnika można uruchomić poleceniem `node tests/engine.test.js`.

Niezależny test Monte Carlo w Pythonie wykonuje domyślnie 10 000 ataków na każdą broń i porównuje rezultat z dokładnym silnikiem: `python tests/monte_carlo.py --check`. Parametry `--trials`, `--seed` i `--config` pozwalają zmienić liczbę prób, powtarzalność oraz konfigurację JSON.

Statyczny pakiet wdrożeniowy tworzy `npm run build` na Windowsie, Linuksie i macOS. Dotychczasowy `build.ps1` pozostaje dostępny lokalnie na Windowsie.

## Cloudflare Workers Builds

Repozytorium zawiera `wrangler.jsonc` dla osobnego Workera `forlorn-forge-github`. W Cloudflare połącz repozytorium `pbudzinski94/kf_simulator` i ustaw:

- branch produkcyjny: `master`,
- root directory: `/`,
- build command: `npm run build`,
- deploy command: `npx wrangler deploy`,
- non-production deploy command: `npx wrangler versions upload`.

Bezpośrednie wdrożenie Cloudflare jest niezależne od istniejącej publikacji Sites pod adresem `chatgpt.site`.
