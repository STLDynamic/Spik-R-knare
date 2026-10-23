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

1. Dodaj artykuł: masa sztuki w gramach, opakowanie i stan w kilogramach
   **na początek wskazanego dnia**, przed zużyciem i dostawami z tego dnia.
2. Wpisz średnie zużycie w kg lub sztukach, tygodniowo lub miesięcznie.
3. Ustaw czas dostawy, bufor i dodatkowy okres zapasu w dniach kalendarzowych.
4. Dodaj potwierdzone przyszłe dostawy w „Redigera”. Po dostawie otwórz
   **„Lager & historik”**, kliknij „Ta emot”, sprawdź faktyczny dzień przyjęcia
   i zatwierdź przyciskiem „Registrera rörelse”. Dopiero zapis zwiększa saldo
   i usuwa tę dostawę z planu.
5. W „Lager & historik” zapisuj zużycie za okres, przyjęcia i inwentaryzacje.
   Regularnie eksportuj kopie JSON — obejmują także całą historię.

### Stany i historia

- **Senast inventerat**: ostatni fizycznie policzony stan i data na początek dnia.
- **Bokfört saldo**: ostatnia inwentaryzacja + przyjęcia − zapisane zużycie od tej daty.
- **Beräknat saldo idag**: saldo ewidencyjne pomniejszone o szacowane zużycie
  za zakończone dni bez zapisów. Jest podstawą prognozy zakupów.

Zużycie wpisujesz w kg lub sztukach za okres obejmujący oba wskazane dni.
Zapisane zużycie zastępuje szacunek dla tych dni — nie jest odejmowane drugi raz.
Okresy nie mogą się nakładać. Wpisz zero, aby odnotować okres bez produkcji.
Ilość rozkładana jest równomiernie między dni okresu. Jeżeli okres przecina datę
nowej inwentaryzacji, do nowego stanu wliczana jest tylko część od tej daty.

Nowa inwentaryzacja ustala stan na początek wybranego dnia. Nie dodaje się jej
do starego salda; zastępuje wcześniejszy punkt odniesienia. Przyjęcia i zużycie
z tego samego dnia są liczone po niej. Przy wielu inwentaryzacjach z tego samego
dnia obowiązuje ostatnio zapisana. Historia pozostaje zachowana.

„Ångra” wyłącza błędny wpis z obliczeń, zachowując go w historii jako anulowany.
Cofnięcie przyjęcia zaplanowanej dostawy przywraca ją także do planu dostaw.
Zużycie, przyjęcia i inwentaryzacje można datować wstecz, ale nie przed stanem
początkowym ani w przyszłość.

Program pokazuje rzeczywiste średnie zużycie na podstawie zapisanych dni
z ostatnich 30 dni. Brakujące dni nie są traktowane jako zerowe zużycie.
Przycisk „Använd som planeringssnitt” pozwala świadomie zastosować tę średnią.
Zmiana średniej przelicza również szacunki za niezapisane dni od ostatniej
inwentaryzacji. Zapisane rzeczywiste zużycie pozostaje bez zmian.

### Dotychczasowe dane i kopie

Wersja 2 odczytuje wcześniejsze artykuły i kopie JSON w wersji 1. Ponieważ stara
wersja nie zapisywała daty salda, trzeba potwierdzić ilość i datę w „Lager & historik”.
Do tego czasu artykuł nie ma aktywnej prognozy zakupów; nie jest pokazywany jako
zerowy zapas. Nie należy potwierdzać nieaktualnej ilości jako dzisiejszej.

Nowe dane trafiają do `spik.inventory.v2` w pamięci przeglądarki. Stary klucz
`spik.inventory.v1` nie jest nadpisywany ani usuwany podczas migracji. Kopie JSON
w wersji 2 zachowują daty, operacje, anulowane wpisy i powiązania z dostawami.
Nie można ich importować do starej wersji aplikacji — najpierw odśwież program.

Możesz filtrować grupy i statusy, szukać nazw/dostawców i sortować pilność.
Dane demonstracyjne są opcjonalne. Import zastępuje magazyn po potwierdzeniu.

## Obliczenia

- Sztuki w opakowaniu = kg × 1000 / masa sztuki w gramach.
  800 kg i 1,8 g daje około 444 444 sztuki.
- Dzienne zużycie = tygodniowe / 7 lub miesięczne / (365,25 / 12).
- Zużycie jest równomierne; dostawy są dostępne na początku wskazanego dnia.
- Stan na dzisiaj uwzględnia upływ dni od ostatniej inwentaryzacji, zapisane
  operacje i średnie zużycie na dni bez zapisów. Dzisiejsze faktyczne operacje
  są już wliczone; szacunki obejmują dni do wczoraj. Szacowany zapas nie spada
  poniżej zera; nadwyżka szacowanego zużycia jest sygnalizowana jako niedobór.
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
Szacowany stan zmniejsza się z upływem dni, ale nie zastępuje kontroli fizycznej.
Plan opiera się na średnim zużyciu; nie ma jeszcze harmonogramu produkcji.
Aplikacja nie wysyła zamówień ani wiadomości do dostawców.

## Pliki

- `src/model.js`: obliczenia i walidacja importu.
- `src/app.js`: interfejs i zapis lokalny.
- `src/style.css`: responsywny wygląd.
- `server.js`: serwer statyczny bez zewnętrznych zależności.
- `tests/model.test.js`: testy obliczeń.
