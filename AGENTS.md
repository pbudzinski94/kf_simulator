# Zasady projektu

## Wersja wdrożenia

- Przed każdym pushem do repozytorium podbij `version` w `app.config.json`.
- Używaj formatu `RRRR.MM.DD.N`, gdzie `N` jest kolejnym numerem pushu danego dnia.
- Nie wpisuj numeru wersji na sztywno w HTML ani JavaScript — `app.config.json` jest jedynym źródłem wersji.
- Po zmianie wersji uruchom `npm run build`, aby `dist/client/app.config.json` trafił do wdrożenia.
