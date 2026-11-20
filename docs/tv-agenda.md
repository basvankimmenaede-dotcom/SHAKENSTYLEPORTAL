# TV-agenda

`/planning/tv` toont 30 kalenderdagen vanaf vandaag, inclusief vandaag. De normale planning blijft een aparte weergave. De TV-pagina en `GET /api/planning/tv` controleren eerst de bestaande planningtoegang; de API vereist een admin of minimaal `planning: view` en retourneert `private, no-store`.

## Onderdelen

| Bestand | Verantwoordelijkheid |
| --- | --- |
| `src/lib/rentman-planning-tv.ts` | Volledig ophalen, valideren en tijdelijk cachen van Rentman-gegevens |
| `src/lib/planning-tv.ts` | Statusselectie, gebruiksperiodes, datumgrenzen en unieke tellingen |
| `src/lib/planning-tv-display.ts` | Detailpagina's en behoud van de leespositie bij verversen of schermwijzigingen |
| `src/components/PlanningTvDashboard.tsx` | Kalender, roterende details, bediening en datacontroles |

De TV-bron is bewust gescheiden van de oudere planninghelpers. Die gebruiken onder meer projectperiodes met een terugval op planningsdatums, een beperkte projectlijst of de meest voorkomende materiaalgroepperiode. Dat is geen betrouwbare basis voor deze agenda. Rentman heeft bovendien gebruikstijden van materiaalgroepen naar afzonderlijke materiaalregels verplaatst. Hergebruik die heuristieken hier niet.

## Bron en selectie

De server leest uitsluitend de benodigde velden:

- `/projects`: `id`, `number`, `name`, `usageperiod_start`, `usageperiod_end`.
- `/subprojects`: `id`, `name`, `project`, `status`, `in_planning`, `is_template`, `usageperiod_start`, `usageperiod_end`.

De **subproject-gebruiksperiode** bepaalt de agendadagen. Hoofdprojectdatums kunnen alleen helpen om een datacontrole in de tijd te begrenzen; ze vullen nooit ontbrekende subprojectdatums aan. Plannings-, transport-, opbouw- en afbouwtijden zijn geen vervangende bronnen.

De goedgekeurde TV-selectie sluit status-ID's **1 (Optie), 2 (Geannuleerd) en 7 (Aanvraag)** uit. **8 (Concept) is zichtbaar en telt mee** in de dagtotalen en het unieke totaal, mits de gebruiksperiode geldig is. Deze keuze geldt voor de TV-weergave; de bestaande taakselectie heeft haar eigen statusfilter. De selectie gebeurt per subproject: een geannuleerd onderdeel mag een ander, toegestaan onderdeel van hetzelfde project niet verbergen.

Statusreferenties `/statuses/<id>` en `/projectstatuses/<id>`, numerieke referenties en uitgebreide objecten met `id` worden genormaliseerd. Alleen uitgesloten status-ID's worden weggefilterd; er is geen aanvullende status-allowlist. Een onleesbare status wordt gemeld. Een meetellend subproject vereist expliciet `in_planning === true` en `is_template === false`; ontbrekende flags worden ook gemeld. Expliciete templates en onderdelen buiten de planning worden overgeslagen.

## Periodes en telling

Alle kalendergrenzen gebruiken **Europe/Amsterdam**, ook bij zomer-/wintertijd. Het venster loopt van vandaag 00:00 tot 00:00 na de dertigste dag: `[vandaag, vandaag + 30 kalenderdagen)`.

Gebruiksperiodes zijn eveneens halfopen: `[begin, einde)`. Een periode die exact om 00:00 eindigt telt niet op de nieuwe dag; een periode die tot 00:30 doorloopt wel. Een interval telt op een dag wanneer `begin < volgende_middernacht && einde > dagbegin`. Reeds begonnen en nog doorlopende klussen blijven zo zichtbaar.

Identieke subprojectperiodes worden samengevoegd. Verschillende periodes blijven apart bewaard; de dagselectie gebruikt hun vereniging en vult geen gaten tussen periodes op. De telling gebruikt het **hoofdproject-ID**, niet de projectnaam, het zichtbare nummer, het aantal subprojecten of het aantal detailkaarten. Eén project telt maximaal eenmaal per dag en eenmaal in het venstertotaal.

## Datakwaliteit en meerdere subprojecten

Ontbrekende, ongeldige of lege gebruiksperiodes worden niet meegeteld. Datums moeten geldig zijn, een expliciete tijdzone hebben en een eindtijd na de begintijd. De UI toont controles voor ontbrekende periodes, onbekende planningstatussen en ontbrekende hoofdprojecten. Ondateerbare meldingen kunnen oudere projecten betreffen: presenteer hun aantal nooit als het aantal komende klussen.

Bij meerdere verschillende gebruiksperiodes blijven de echte geselecteerde periodes meetellen en verschijnt een controle met de subprojectnamen. Er is **geen geverifieerde event/logistiek-marker** in de gebruikte gegevens. `in_planning` en `in_financial` bewijzen dat onderscheid niet. De implementatie raadt daarom niet op basis van namen zoals “Event” of “Pickup”. Strikte uitsluiting van logistiek bedoelde subproject-gebruiksperiodes vereist een expliciet bevestigde inrichting; dat onderscheid is niet automatisch af te leiden.

## Ophalen, cache en tijdstempel

Beide collecties worden volledig opgehaald met `sort=+id`, pagina's van maximaal 1.500 regels en de door Rentman geretourneerde `next_page_url`. De gegenereerde gebruiksperiodevelden worden niet als API-filter gebruikt, zodat langlopende oudere projecten niet verdwijnen. Vervolgpagina's moeten dezelfde Rentman-origin en hetzelfde collectiepad houden. Ongeldige pagina's, herhaalde cursors, meer dan 100 pagina's of een bronfout laten de volledige verversing mislukken; gedeeltelijke resultaten worden niet als compleet gepubliceerd.

De bron heeft een totale timeout van 25 seconden. `fetchedAt` wordt pas na het succesvol ophalen van alle pagina's vastgesteld. Een complete snapshot wordt via `unstable_cache` met `revalidate: 30` gedeeld; authenticatie wordt niet gecachet. De browser controleert iedere 30 seconden terwijl het tabblad zichtbaar is, en direct bij openen, terugkeren naar het tabblad en dagwisseling. Een poll kan nog een gecachete snapshot krijgen: het getoonde tijdstip is de laatste geslaagde bronophaalactie, niet het tijdstip van de poll.

Bij fouten blijft de laatste complete client-snapshot met zijn oorspronkelijke tijdstempel zichtbaar. Oudere antwoorden vervangen geen nieuwere snapshot. Na twee minuten zonder nieuwe brontijd verschijnt een waarschuwing. Bij verlopen toegang stopt de automatische rotatie en vraagt de pagina om opnieuw in te loggen. Zonder eerste geslaagde snapshot staan er streepjes, geen misleidende nulstanden.

## Scherm en bediening

Het kalenderoverzicht blijft staan. Details wisselen automatisch iedere **20 seconden**, over vandaag en de overige dagen met klussen. Drukke dagen krijgen meerdere delen, met maximaal drie kaarten per deel en minder wanneer de gemeten hoogte dat vraagt. Lange namen krijgen vervolgkaarten; dit verandert nooit de telling. Vernieuwen of aanpassen van de schermgrootte behoudt waar mogelijk de zichtbare leespositie en start de leestimer niet opnieuw.

De bediening bevat **Pauze/Hervatten**, **Volgende**, **Schermvullend/Verkleinen** en terugkeer naar de planning. Bediening verschijnt bij interactie en verdwijnt na vijf seconden. Een kalenderdag kan handmatig worden geselecteerd. De rotatie pauzeert bij een verborgen tabblad of geopende datacontrole. Na middernacht schuift het venster automatisch mee en begint de detailweergave opnieuw bij vandaag.

## Verificatie en wijzigingen

```sh
npm run test:planning-tv
npx tsc --noEmit
npm run build
```

De TV-tests dekken onder meer tijdzones en zomer-/wintertijd, middernachtgrenzen, lopende klussen, ontdubbeling, gaten tussen periodes, statusselectie, ongeldige gegevens, bron- en detailpaginering en autorisatie. `npm run build` voert via `prebuild` ook de factuur- en TV-tests uit. Gebruik synthetische testgegevens; voeg geen persoonlijke Rentman-dumps toe aan deze repository.

Deze functie gebruikt de bestaande `RENTMAN_API_TOKEN` en bestaande authenticatie. Zij schrijft niets naar Rentman en vereist **geen databasewijziging of migratie**.

### Rentman-referenties

- [Subprojecten en hun eigen periodes](https://support.rentman.io/hc/en-us/articles/360013677019-Subprojects)
- [Gebruiksperiode in het projectoverzicht](https://support.rentman.io/hc/nl/articles/39016808810258-Hoe-geef-ik-de-gebruiksperiode-weer-in-mijn-projectoverzicht)
- [API-wijzigingen voor materiaalperiodes en projectstatussen](https://support.rentman.io/hc/en-us/articles/26707946497042-Rentman-API-Changelog)
