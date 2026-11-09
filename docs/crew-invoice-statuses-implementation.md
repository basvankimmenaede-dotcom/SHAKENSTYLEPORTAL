# SHAKENSTYLE Crew factuurstatussen

Featurebranch op de productiecode van 9 november 2026.

De mobiele crewpagina toont de diensten, dagbriefing, shiftrapporten en onder Profiel de inkomende facturen. In de agenda kan iemand meerdere diensten op dezelfde dag bekijken.

De factuurstatussen zijn Ontvangen, In behandeling, Correctie nodig en Goedgekeurd. Correctie nodig toont exact de reden uit kantoor. Goedgekeurd is alleen mogelijk als twee afzonderlijke accounts akkoord zijn en de factuur naar de boekhouding is doorgestuurd.

Kantoor: /planning/crew-invoices. Recht billing.manage om een correctieverzoek per e-mail te versturen via CREW_SMTP_*. Het versturen is een expliciete kantooractie, nooit automatisch op basis van alleen PDF-herkenning.

Voordat de module werkt: SQL uit docs/crew-invoice-statuses-migration.sql toepassen. De e-mailontvangst, PDF-extractie, matching en dubbele goedkeuringsacties zijn nog niet aangesloten. Daardoor zijn er voorlopig nog geen echte factuurrecords. Deze feature verzint geen gegevens en verzendt geen facturen automatisch.

Test eerst de preview, authenticatie, rapportverwerking, schemabeveiliging en een gecontroleerde correctiemail met een testaccount. Controleer de producerende branch voordat er naar productie wordt gepromoveerd.
