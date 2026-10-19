# Spik — planowanie zapotrzebowania na gwoździe

Aplikacja dla produkcji palet: artykuły, stany, średnie zużycie, prognozy braków,
terminy zamówień i potwierdzone dostawy. Interfejs po szwedzku.

## Otwieranie przez GitHub Pages

Na darmowym planie GitHub repozytorium musi być publiczne.

1. W repozytorium wybierz **Settings → Pages**.
2. W sekcji **Build and deployment** wybierz **Source: Deploy from a branch**.
3. Wybierz gałąź **main**, katalog **/ (root)** i kliknij **Save**.
4. Zaczekaj na zakończenie publikacji. Adres strony pojawi się w **Settings → Pages**.

Standardowy adres to `https://stldynamic.github.io/Spik-R-knare/`.
Zacznie działać dopiero po włączeniu Pages i pomyślnej publikacji.
Nie trzeba instalować Node.js, aby korzystać z opublikowanej aplikacji.
Dane pozostają w przeglądarce, osobno dla danego adresu. Przy zmianie adresu
wyeksportuj kopię ze starej wersji i zaimportuj ją w nowej.

## Uruchomienie na swoim komputerze

Wymagany Node.js 22 lub nowszy. Brak zależności do instalacji.

```sh
npm start
```

Serwer działa na porcie 3000 (można zmienić zmienną `PORT`). Otwórz aplikację
w przeglądarce komputera, na którym działa serwer. Testy obliczeń: `npm test`.

## Korzystanie

1. Dodaj artykuł: masa sztuki w gramach, opakowanie i stan w kilogramach.
2. Wpisz średnie zużycie w kg lub sztukach, tygodniowo lub miesięcznie.
3. Ustaw czas dostawy, bufor i dodatkowy okres zapasu w dniach kalendarzowych.
4. Dodaj potwierdzone dostawy. Po dostawie kliknij „Ta emot” i zapisz artykuł.
5. Regularnie aktualizuj rzeczywisty stan i zużycie oraz eksportuj kopie JSON.

Możesz filtrować grupy i statusy, szukać nazw/dostawców i sortować pilność.
Dane demonstracyjne są opcjonalne. Import zastępuje magazyn po potwierdzeniu.

## Obliczenia

- Sztuki w opakowaniu = kg × 1000 / masa sztuki w gramach.
  800 kg i 1,8 g daje około 444 444 sztuki.
- Dzienne zużycie = tygodniowe / 7 lub miesięczne / (365,25 / 12).
- Zużycie jest równomierne; dostawy są dostępne na początku wskazanego dnia.
- Prognoza wskazuje pierwszy brak z uwzględnieniem potwierdzonych dostaw.
  Dostawa po wystąpieniu braku nie usuwa ostrzeżenia o przestoju.
- Termin zamówienia = pierwszy brak − czas dostawy − bufor.
- Zakup = zużycie na czas dostawy + bufor + dodatkowy okres, minus stan
  i dostawy w tym okresie, zaokrąglone w górę do opakowań.
  Zakup może wynosić zero przy ryzyku braku: trzeba przyspieszyć istniejącą dostawę.
- Przeterminowane dostawy nie zwiększają prognozowanego zapasu; przyjmij je
  lub zaktualizuj ich datę.

## Zakres pierwszej wersji

Dane zapisują się lokalnie w przeglądarce, osobno dla każdego adresu aplikacji.
Nie ma wspólnej bazy, kont ani synchronizacji między komputerami.
Usunięcie danych przeglądarki usuwa magazyn — regularnie eksportuj kopie.
Stan nie zmniejsza się automatycznie. Prognoza zakłada, że wpisany stan jest aktualny
na dzisiaj. Nie ma jeszcze historii ruchów ani harmonogramu produkcji.
Aplikacja nie wysyła zamówień ani wiadomości do dostawców.

## Pliki

- `src/model.js`: obliczenia i walidacja importu.
- `src/app.js`: interfejs i zapis lokalny.
- `src/style.css`: responsywny wygląd.
- `server.js`: serwer statyczny bez zewnętrznych zależności.
- `tests/model.test.js`: testy obliczeń.
