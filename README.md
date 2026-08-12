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
- efekt Black: przerzut kości Power i zamiana jej Break na bezpośrednie obrażenia,
- szansa rany, wartość oczekiwana, maksimum i rozkład obrażeń,
- losowy symulator pojedynczego ataku.

Kości ataku k10 oraz symbole Attack na kościach Power są celowo reprezentowane osobnymi pojęciami. W kodzie symbole z Power Dice występują jako `power`.

## Rozwój

Definicje ścianek znajdują się w `js/dice.js`, matematyka i strategia przerzutów w `js/engine.js`, a interfejs w `js/app.js`. Każda kość może być przerzucona najwyżej raz. Strategia maksymalizuje szansę rany, a przy remisie wartość oczekiwaną obrażeń.

Testy silnika można uruchomić poleceniem `node tests/engine.test.js`.

Statyczny pakiet wdrożeniowy tworzy `build.ps1`.
