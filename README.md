# CRM

Webapp voor Ralph's contacten: wie ken ik bij welke partij, per partijtype (bedrijven, private equity, M&A-adviseurs, due diligence-adviseurs), en een actielijst met wie ik weer moet spreken.

Vormgeving: Moneybird-template (`04_Resources/methods/huisstijl-moneybird.md` in de vault).

## Hoe het werkt

- **Online:** GitHub Pages serveert `index.html` uit deze repository op https://crm.tulderconsultancy.nl (bestand `CNAME`). De pagina bevat geen contactgegevens.
- **Data:** Supabase (EU, Frankfurt). Tabellen `party_types`, `parties`, `contacts`, `interactions`, `settings`, elk met Row Level Security: alleen de ingelogde eigenaar ziet en wijzigt zijn eigen rijen. Schema: `crm-schema.sql`.
- **Inloggen:** e-mail en wachtwoord (Supabase Auth). De publishable key in `index.html` is bedoeld om openbaar te zijn; zonder inlog geeft hij geen toegang.
- **Indeling:** links *Relaties* (Actielijst, Contacten, Partijen) en *Sales pipeline*. De app opent op de actielijst.
- **Sales pipeline:** bord met fases Te benaderen, Benaderd, In gesprek, Voorstel, Gewonnen en Afgevallen. Een pipelinekaart is gewoon een partij (kolommen `pipeline_*` in `parties`), dus nieuwe partijen en hun contactpersonen staan ook bij Partijen en Contacten. Slepen of de fase kiezen via het menu op de kaart.
- **Focus en markten:** per partij focus (VC, MKB, Mid-cap, Large-cap; meerdere mogelijk) en vrije markten; filterbaar bij Partijen.
- **Migraties:** `crm-migratie-1-pipeline.sql` voegt de pipeline-, focus- en marktkolommen toe aan een bestaande database. `crm-schema.sql` bevat ze al voor een nieuwe installatie.
- **Actielijst:** contacten met "Herhaaldelijk spreken" aan. Volgende keer = laatste contactmoment + interval (standaard 3 maanden), of later als het contact is uitgesteld. Groepen: te laat, nog geen contactmoment, komende 7 dagen, komende 30 dagen, later. "Gesproken" legt een contactmoment vast en schuift het contact door.
- **Demo:** `index.html?demo` draait met verzonnen voorbeelddata in het geheugen, zonder database.
- **Import/export:** Instellingen → Exporteren (JSON-back-up) en Importeren (JSON met `parties` en `contacts`; bestaande namen worden overgeslagen).

## Bouwen

De bronbestanden staan in `src/`. `python3 build.py` voegt ze samen tot `index.html` (Supabase JS 2.119.0 zit erin, geen CDN). Het logo staat in `src/logo.svg` (en als symbool `i-logo` in `src/icons.svg` voor de bovenbalk en het inlogscherm); `build.py` schrijft het naar `icon.svg`, daarna maakt `node mkicons.js .` de PNG-iconen opnieuw.

Gebruik op de laptop: Edge-snelkoppeling met `--app=<GitHub Pages-URL>`. Op de telefoon: openen in de browser en "Zet op beginscherm".

## PE-lijst (Sales pipeline)

Onder Sales pipeline staat een tabblad PE-lijst: partijen die nog niet in het CRM staan (tabel `prospects`, gevuld vanuit de NVP-ledenlijst). Met Toevoegen worden partij en partners aangemaakt en komt de partij onder Te benaderen. Partijen hebben een veld AuM (`aum_mln`, in miljoenen euro's, plus `aum_note`). Vereist `crm-migratie-2-pe-lijst.sql` in Supabase. De gegevens zelf staan alleen in de database, niet in deze repo.
