# Forlorn Forge

Statyczny kalkulator, komparator i symulator broni do *Kingdoms Forlorn*.

## Uruchomienie

Otwórz `index.html` w przeglądarce. Aplikacja nie wymaga instalowania zależności ani połączenia z serwerem.

## Zakres obliczeń

- dokładny rozkład trafień z kości ataku k10,
- dokładny rozkład niestandardowych kości Power,
- jeden wspólny Knight Pool dla porównywanych broni,
- Break, Power i Opening oraz Hope, które najpierw zamienia symbole Hope, a następnie pozostałe symbole Break,
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

Numer widoczny w stopce jest przechowywany w `app.config.json` i pobierany bez cache, aby łatwo potwierdzić aktualne wdrożenie. Przed każdym pushem podbij wersję w formacie `RRRR.MM.DD.N`, a następnie uruchom `npm run build`.

## Cloudflare Workers Builds

Repozytorium zawiera `wrangler.jsonc` dla osobnego Workera `forlorn-forge-github`. W Cloudflare połącz repozytorium `pbudzinski94/kf_simulator` i ustaw:

- branch produkcyjny: `master`,
- root directory: `/`,
- build command: `npm run build`,
- deploy command: `npx wrangler deploy`,
- non-production deploy command: `npx wrangler versions upload`.

Bezpośrednie wdrożenie Cloudflare jest niezależne od istniejącej publikacji Sites pod adresem `chatgpt.site`.

## Odzyskane wdrożenie Cloudflare

Kod interfejsu i Workera odtworzono z wersji produkcyjnej 2026.09.04.1. Worker obsługuje API /api/weapons i korzysta z istniejącej bazy D1 przez binding DB. Plik database/schema.sql zawiera zrzut schematu do inicjalizacji pustej bazy lokalnej; nie uruchamiaj go na istniejącej bazie produkcyjnej.

Lokalnie: wrangler d1 execute DB --local --file database/schema.sql, następnie wrangler dev. Produkcyjne dane pozostają w Cloudflare.

## Zbrojownia: dodawanie, edycja i usuwanie

Zbrojownia udostępnia wyszukiwanie, formularz dodawania i edycji oraz usuwanie z potwierdzeniem. Karty porównania pozwalają wczytać zapisany oręż albo dodać własny wariant. Zmiana parametrów w karcie pozostaje lokalnym wariantem, dopóki nie zostanie dodana do biblioteki.

API: GET/POST /api/weapons, PUT/DELETE /api/weapons/:id. POST nie nadpisuje istniejącego wpisu. Konflikt nazwy zwraca 409. Nazwy są normalizowane przez NFKC, usunięcie skrajnych spacji, połączenie wielokrotnych białych znaków i zamianę liter na małe na potrzeby klucza. Unikalny indeks name_key chroni również przed równoczesnym zapisem.

Dla istniejącej bazy: zastosuj jednorazowo migrations/0002_weapon_name_keys.sql, wyeksportuj SELECT id, name FROM weapons przez wrangler d1 execute DB --remote --json, wygeneruj SQL poleceniem node scripts/weapon-name-keys.cjs rows.json backfill.sql i wykonaj go na tej samej bazie. Generator przerwie pracę przy zduplikowanych nazwach. Nową lokalną bazę inicjalizuj wyłącznie przez database/schema.sql (zawiera już nową kolumnę i indeks). Nie wykonuj obu ścieżek na tej samej bazie.

Testy wymagają Node.js >=22.13 i obejmują rzeczywiste ograniczenia SQLite, CRUD, walidację, duplikaty polskich nazw oraz równoczesne zapisy.
