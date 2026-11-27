/**
 * Explanations for Finanzen fields (shown by `InfoHinweis`). Central on purpose: the Finanzer:in
 * changes often and the knowledge must stay in the app. Every slice adds its texts here. Based on
 * docs/finanzen.md; keep them short and factual.
 */
export const HILFE = {
  sumup: {
    guthaben:
      'Karten-Einnahmen liegen zuerst als SumUp-Guthaben, bis SumUp sie aufs Bankkonto auszahlt. Beim Buchen einer Gruppe steigt das Guthaben um den Bruttobetrag, die Kartenerlöse buchen den Betrag samt 19 % USt. Die Gebühren werden erst mit der Auszahlung gebucht.',
    event:
      'Die Zahlungen eines Tages werden zusammen gebucht. Liegen sie in der Zeit eines Events (bis 3 Stunden nach dessen Ende), ist es vorgewählt und die Buchung bekommt den Eventnamen. Du kannst ein anderes Event oder „Ohne Event“ wählen. Gebucht wird je Gruppe als eine Buchung.',
    auswahl:
      'Abgewählte Zahlungen bleiben offen und tauchen nach dem Buchen als eigene Gruppe wieder auf, z. B. um sie einem anderen Event zuzuordnen.',
    auszahlungen:
      'Auszahlungen von SumUp werden später mit dem Kontoauszug der Bank abgeglichen (Bank-Abgleich). Bis dahin stehen sie auf „offen“.',
  },
  konto: {
    art: 'Bargeld: Kasse, Safe und seine Fächer. Bank: Bankkonten. Durchlauf: Geld, das nur unterwegs ist, z. B. Geldtransit. Erlöse und Aufwand: Kategorien für Einnahmen und Ausgaben (Grundlage für die spätere G+V). Neutral: Konten ohne Ergebnis, z. B. Eröffnung oder Kassendifferenz.\nDie Art lässt sich nach der ersten Buchung nicht mehr ändern.',
    parent:
      'Macht dieses Konto zum Unterkonto einer Gruppe, z. B. ein Fach unter „Safe“. Auf ein Konto mit Unterkonten wird nicht gebucht, sondern auf seine Unterkonten; sein Saldo ist die Summe aller Unterkonten. Ein Konto, auf dem schon gebucht wurde, kann keine Unterkonten bekommen. Das übergeordnete Konto lässt sich nach der ersten Buchung nicht mehr ändern.',
    stueckelung:
      'Das Konto führt seinen Bestand je Münze und Schein (Stückelung). Das brauchst du für die Fächer des Safes und für Kassen. Bei jeder Buchung auf dieses Konto gibst du an, welche Münzen und Scheine es sind. Lässt sich nach der ersten Buchung nicht mehr ändern.',
    steuersatzStandard:
      'Nur ein Vorschlagswert bei Erlös- und Aufwandskonten: Wählst du das Konto als Kategorie eines Belegpostens, wird der Steuersatz damit vorbelegt (du kannst ihn ändern). Die Buchungszeile trägt den tatsächlichen Satz. Bei Bargeld, Bank, Durchlauf und Neutral ist er ohne Bedeutung.',
    archivieren:
      'Konten werden nie gelöscht, sondern archiviert. Ein archiviertes Konto nimmt keine neuen Buchungen mehr an, seine bisherigen Buchungszeilen bleiben erhalten. Du kannst es jederzeit wiederherstellen.',
  },
  buchen: {
    modus:
      'Umbuchung: Geld geht von einem Konto auf ein anderes, mit einem Betrag. Frei: beliebig viele Zeilen mit Zugang und Abgang, z. B. für mehrere Konten in einer Buchung. Alle Zugänge zusammen sind so hoch wie alle Abgänge. Konten mit Stückelung (Fächer des Safes) buchst du unter „Bargeld“ mit Münzen und Scheinen.',
    zugangAbgang:
      'Zugang erhöht den Kontostand, Abgang verringert ihn (statt „Soll“ und „Haben“). Die Buchung geht auf, wenn alle Zugänge zusammen so hoch sind wie alle Abgänge.',
    text: 'Beschreibt, worum es geht. Der Text steht im Journal und lässt sich später nicht mehr ändern.',
    datum:
      'Das Buchungsdatum, nicht der Tag der Eingabe. Liegt es in der Zukunft, warnst du dich selbst: Du musst es dann bestätigen.',
    warnungen:
      'Warnungen blockieren nicht, müssen aber bestätigt werden: Datum in der Zukunft, ungewöhnlich hoher Betrag und je Kontoart: Bank im Minus, Aufwandskonto mit Guthaben oder Erlöskonto im Minus nach der Buchung (das ist ungewöhnlich, kann aber richtig sein, z. B. bei einer Erstattung). Gebuchtes lässt sich nicht mehr ändern, nur per Storno korrigieren.',
  },
  storno: {
    begruendung:
      'Pflichtfeld. Die Begründung steht im Journal (Buchungstext „Storno von Nr. n: …“) und erklärt später, warum storniert wurde.',
    datum: 'Das Datum der Gegenbuchung. Die ursprüngliche Buchung behält ihr Datum.',
    einmal:
      'Eine Buchung lässt sich nur einmal stornieren, und ein Storno selbst kann nicht storniert werden. Zum Korrigieren buchst du neu.',
  },
  bargeld: {
    fach: 'Ein Fach ist ein Unterkonto des Safes mit Stückelung, z. B. Wechselgeld. Fächer legt die Finanzer:in im Kontenplan an. Gebucht wird nur auf Fächer, nie auf den Safe selbst.',
    umbuchenVon:
      'Hier geht das Geld ab: ein Fach oder ein anderes Konto. Mindestens eine Seite muss ein Fach sein, sonst ist es keine Bargeld-Umbuchung und du buchst sie unter „Buchen“. Aus einem Fach kannst du höchstens entnehmen, was da ist (Bestand je Münze und Schein).',
    umbuchenNach:
      'Hier kommt das Geld an: ein anderes Fach oder ein anderes Konto, z. B. Bank. Mindestens eine Seite muss ein Fach sein. Die Münzen und Scheine trägst du nur einmal ein.',
    umbuchenRueckgeld:
      'Negative Anzahlen sind Rückgeld: Zahlst du z. B. eine Rechnung über 4,99 € aus dem Fach „Kasse“ mit 1 × 5,00 € und bekommst 1 Cent zurück, trägst du 1 bei 5,00 € und −1 bei 0,01 € ein. Auf der Tastatur tippst du ein Minus, am Handy kehrt die Taste „±“ das Vorzeichen um. Der Betrag insgesamt darf auch 0 oder negativ sein (z. B. Tausch zwischen zwei Fächern: 1 × 50 € gegen 5 × 10 €); ohne Fach auf beiden Seiten braucht die Umbuchung aber einen Betrag. Negative Anzahlen sind nur möglich, wenn die Münze im „Nach“-Fach vorhanden ist (sie wird dort entnommen).',
    bestand:
      'Der Bestand ergibt sich aus den Buchungen: wie viele Stück je Münze und Schein im Fach liegen. Er darf nie unter 0 fallen.',
    wechselnTabelle:
      'Abgang ist, was du aus dem Fach nimmst (höchstens bis zum Bestand), Zugang, was du dafür hineinlegst. Beides muss zusammen gleich viel Geld ergeben, sonst zeigt die Seite den Unterschied. Der Betrag im Fach bleibt gleich, nur die Stückelung ändert sich; „Bestand danach“ zeigt das Ergebnis.',
    wechselnReihenfolge:
      'Aus: Tab und Enter springen zeilenweise (Abgang 1 ct, Zugang 1 ct, Abgang 2 ct …). An: erst alle Abgang-Felder von 1 ct bis 100 €, dann alle Zugang-Felder. Die Wahl wird in diesem Browser gespeichert.',
    zaehlenSoll:
      'Soll ist der Bestand laut Buchungen, Ist das, was du tatsächlich gezählt hast. Die Differenz ist Ist minus Soll je Münze und Schein. Felder, die du leer lässt, zählen als 0.',
    zaehlenDifferenz:
      'Weicht der Betrag ab, wird das Fach auf den gezählten Bestand korrigiert und die Gegenbuchung geht auf „Kassendifferenz“. Stimmt der Betrag, aber nicht die Mischung der Münzen und Scheine, wird nur die Stückelung umgebucht, ohne Kassendifferenz.',
    zaehlprotokoll:
      'Jede Zählung wird als Protokoll gespeichert, auch wenn alles stimmt. Eine gespeicherte Zählung lässt sich nicht ändern; Fehler korrigierst du mit einer neuen Zählung.',
  },
  kassen: {
    kasse:
      'Eine Kasse ist ein Fach des Safes (Bargeld mit Stückelung) mit Zusatzdaten: Grundbestand, Standard-Erlöskonto und Standard-Ziel-Fach. Den Namen und das Archivieren änderst du im Kontenplan.',
    grundbestand:
      'Das soll in der Kasse sein, wenn sie rausgeht: je Münze und Schein eine Anzahl. Die Abrechnung füllt die Kasse darauf auf und führt den Rest ab. Den Grundbestand kannst du jederzeit ändern.',
    erloeskonto:
      'Auf dieses Erlöskonto geht die gesamte Einnahme einer Abrechnung. Der Steuersatz kommt vom Erlöskonto. Gibt es Getränke und Essen mit verschiedenen Steuersätzen, nimm getrennte Kassen.',
    zielFach:
      'Der Überschuss der Kasse geht in dieses Fach, und fehlende Münzen und Scheine kommen von dort. In der Abrechnung kannst du es ändern.',
    standardKategorien:
      'Bei Events dieser Kategorien ist die Kasse automatisch vorgesehen und wartet am Event auf ihre Zählung. Das gilt für alle Events, auch für schon angelegte, solange die Finanzer:in die Kassen eines Events nicht selbst festlegt.',
    dienstZaehlung:
      'Wer Dienst hat, kann die Kasse am Event zählen. Das ist unverbindlich: Es dient nur der Übersicht und der Zuordnung der Einnahmen zu Events und löst keine Buchung aus. Zählst du eine Kasse mehrfach, zählt die neueste Zählung.',
    ist: 'Zähle die Kasse durch und trage ein, was wirklich drin ist. Felder, die du leer lässt, zählen als 0. Bestand ist, was laut Buchhaltung in der Kasse sein müsste. Einnahme ist Ist minus Bestand und darf auch negativ sein.',
    transfer:
      'Transfer ist, was zwischen Kasse und Ziel-Fach wandert: positiv = aus der Kasse ins Ziel-Fach (Überschuss), negativ = aus dem Ziel-Fach in die Kasse (Auffüllen). Vorgeschlagen wird, was die Kasse auf den Grundbestand bringt, du kannst es ändern. „Kasse danach“ zeigt, was in der Kasse bleibt.',
    fehlbestand:
      'Reichen die Münzen im Ziel-Fach nicht, um die Kasse aufzufüllen, fehlen sie. Du kannst Münzrollen aus einem anderen Fach ins Ziel-Fach holen (die Rolle wird dort geöffnet, der Rest bleibt im Ziel-Fach) oder die Kasse diesmal mit weniger Münzen rausgehen lassen. Der Grundbestand bleibt in beiden Fällen unverändert.',
    eventZuordnung:
      'Die Einnahme wird auf die Events verteilt, an denen die Kasse seit der letzten Abrechnung gezählt wurde: Vorschlag ist die Differenz der Dienst-Zählungen. Die Beträge kannst du ändern. Das ist nur eine Zuordnung für Auswertungen, gebucht wird die gesamte Einnahme als ein Erlös.',
    fehler:
      'Fehler ohne Event ist die Einnahme minus die Summe der Event-Einnahmen. Er steht nur in der Zuordnung und ändert die Buchung nicht. Beispiel: Du zählst 100 €, Event 1 hatte 50 € und Event 2 40 €, dann sind 10 € Fehler.',
    storno:
      'Eine Abrechnung lässt sich nicht ändern. Zum Korrigieren stornierst du die Buchung im Journal; die Dienst-Zählungen erscheinen dann in der nächsten Abrechnung wieder.',
  },
  festschreibung: {
    bis: 'Bis zu diesem Tag sind alle Monate festgeschrieben. Mit einem früheren Datum lässt sich nichts mehr buchen.',
    monat:
      'Monate werden der Reihe nach festgeschrieben, ab dem 10. des Folgemonats ist der Vormonat fällig. Die Festschreibung sichert den Stand des Journals im Archiv und lässt sich nicht rückgängig machen.',
    hinweise:
      'Das sind offene Vorgänge im Monat. Sie blockieren nicht, aber danach lassen sich Buchungen mit Datum in diesem Monat nicht mehr anlegen: Belege und Kassenabrechnungen werden dann mit dem ersten offenen Tag gebucht.',
    kopfHash:
      'Der Hash der letzten Buchung des Monats. Er hängt von allen früheren Buchungen ab und weist nach, dass sich nichts verändert hat.',
  },
  datenexport: {
    zeitraum:
      'Der Zeitraum der Buchungen, die exportiert werden (Buchungsdatum). Höchstens 10 Jahre. Vorgabe ist das Vorjahr.',
    export:
      'Der Export ist eine ZIP-Datei mit CSV-Dateien, einer index.xml (Beschreibungsstandard für die Datenträgerüberlassung) und einer Beschreibung. Er wird im Archiv abgelegt und bleibt dort erhalten. Mit Belegdateien liegen die Dateien der Belege zusätzlich im Ordner belege/; der Export wird dann im Hintergrund erstellt.',
  },
  kette: {
    ergebnis:
      'Die Prüfung liest alle Buchungen und kontrolliert lückenlose Nummern, den Verweis jeder Buchung auf die vorige, die Hashes (erkennen nachträglich veränderte Inhalte), dass jede Buchung aufgeht und den Zähler. „Kette intakt“ heißt: nichts wurde verändert. Außerdem vergleicht sie die Datenbank mit dem Archiv (Exporte, Anker, Festschreibungen, Belegdateien). Ist das Archiv nicht eingerichtet, wird nur die Datenbank geprüft.',
    archiv:
      'Das Archiv ist ein unveränderlicher Speicher außerhalb der Datenbank. „Nicht exportiert“ sind Buchungen, die noch nicht ins Archiv geschrieben wurden; das ist kein Fehler.',
  },
  buch: {
    nummer:
      'Die Nummer der Buchseite. Sie ist unter allen aktiven Seiten eindeutig; archivierst du eine Seite, wird ihre Nummer wieder frei.',
    inhaber:
      'Jedes Mitglied hat höchstens eine aktive Seite. Für Gäste legst du eine Seite mit externem Namen an; für sie gilt der Tarif „Extern“.',
    saldo:
      'Der Saldo ist die Summe aller Einträge einer Seite: Abzahlungen erhöhen ihn, Striche und Bar senken ihn. Ein negativer Saldo sind Schulden beim Verein.',
    striche:
      'Anzahl der Striche seit der letzten Abrechnung. Jeder Strich kostet den Strichwert, der am Tag des Eintragens für den Status der Seite gilt (Tarif). Ganze Zahl, 0 bei keinem Strich.',
    bar: 'Betrag in Euro, der aufs Buch geschrieben wird (angeschrieben, nicht bezahlt), z. B. für etwas, das keinen Strich hat. Er senkt den Saldo wie die Striche.',
    abzahlung:
      'Betrag in Euro, den das Mitglied einzahlt. Er erhöht den Saldo. Das Geld liegt in einer Barkasse und wird mit deren Abrechnung als Bareinnahme gebucht; das Buch selbst erzeugt keine Journalbuchung.',
    saldoDanach:
      'Der Saldo der Seite nach dieser Abrechnung: bisheriger Saldo plus Abzahlung minus Striche mal Strichwert minus Bar.',
    leereZeilen:
      'Zeilen ohne Striche, Bar und Abzahlung werden übersprungen und erzeugen keinen Eintrag.',
    seitenweise:
      'Das Buch ist ein Heft aus Papier: Du rechnest Seite für Seite ab. Trag Striche, Bar und Abzahlung einer Seite ein und schließ sie ab; sie wird sofort gespeichert und die Zeile gesperrt. Dann schreibst du den angezeigten neuen Saldo ins Buch und machst mit der nächsten Seite weiter. Mit Enter springst du zum nächsten Feld, Enter in „Abzahlung“ öffnet die Bestätigung der Seite. Korrekturen gehen nur per Storno auf der Seite.',
    ueberzug:
      'Der Saldo ist grün ab 0 €, gelb im Minus innerhalb des erlaubten Überzugs und rot darunter (ohne Tarif gilt der Überzug 0). Das ist nur eine Information: Das Buch hält fest, was im Papierbuch steht, und die Abrechnung wird nie blockiert. Mitglieder mit rotem Saldo bekommen nach der Abrechnung eine Benachrichtigung.',
    strichwert:
      'Preis eines Strichs in Euro für den gewählten Status. Er wird beim Eintragen im Eintrag gespeichert und ändert sich später nicht mehr, auch wenn es einen neuen Tarif gibt.',
    maxUeberzug:
      'Wie weit der Saldo ins Minus gehen darf, in Euro (ohne Vorzeichen). Erst darunter gilt die Seite als überzogen.',
    gueltigAb:
      'Ab diesem Tag gilt der Tarif. Für einen Eintrag zählt der Tarif mit dem spätesten „gültig ab“ bis zum Tag des Eintragens; ein neuer Tarif ändert vergangene Einträge nicht. Tarife lassen sich nicht ändern oder löschen, nur durch einen neueren ersetzen.',
    tarifStatus:
      'Der Tarif gilt für alle Seiten von Mitgliedern mit diesem Status. Seiten mit externem Namen verwenden den Tarif „Extern“. Gibt es für einen Status noch keinen Tarif, sind keine Striche möglich (Bar und Abzahlung schon).',
    nummerAendern:
      'Die Seite bekommt eine andere Nummer, die unter allen aktiven Seiten noch frei sein muss. Saldo und Einträge bleiben unverändert; die alte Nummer wird wieder frei. Alle Nummern, die die Seite je hatte, stehen im Nummern-Verlauf.',
    reaktivieren:
      'Eine archivierte Seite wird wieder aktiv und taucht in der Abrechnung wieder auf. Dafür wählst du eine Nummer; vorgeschlagen ist die letzte der Seite, falls sie noch frei ist. Ein Mitglied kann nur eine aktive Seite haben.',
    nummernVerlauf:
      'Hält fest, wann die Seite angelegt, umnummeriert, archiviert und reaktiviert wurde und von wem. Der Verlauf wird nie geändert.',
    archivieren:
      'Archivieren blendet die Seite aus der Abrechnung aus und gibt ihre Nummer frei. Der Verlauf bleibt erhalten. Steht noch ein Saldo auf der Seite, bleibt er offen: Kläre ihn vorher.',
    storno:
      'Ein Eintrag wird nie geändert oder gelöscht. Das Storno ist ein neuer Eintrag mit umgekehrten Werten und deiner Begründung. Jeder Eintrag lässt sich nur einmal stornieren, ein Storno nicht.',
    rangliste:
      'Die Rangliste sortiert nach Umsatz in Euro: Striche mal Strichwert plus Bar. Abzahlungen zählen nicht. Stornierte Einträge zählen nicht mit.',
  },
  belege: {
    nummer:
      'Die Belegnummer (B-Jahr-Nummer, z. B. B-2027-0001) wird beim Buchen vergeben, lückenlos je Jahr. Das Jahr ist das des Buchens, nicht das Belegdatum. Entwürfe haben noch keine Nummer.',
    datei:
      'Das Original wird unverändert archiviert (PDF, JPEG, PNG oder HEIC, höchstens 20 MB) und lässt sich danach nicht mehr ändern oder löschen. Auch ein verworfener Entwurf hinterlässt die Datei im Archiv. Die gleiche Datei erkennt die App an ihrem Fingerabdruck und warnt vor Dubletten.',
    eigenbeleg:
      'Gibt es keinen Beleg (z. B. Bon verloren), erfasst du einen Eigenbeleg ohne Datei. Dann ist die Begründung Pflicht; sie wird mit dem Beleg gespeichert. Ein Eigenbeleg wird ohne Vorsteuer gebucht: Der volle Betrag ist Aufwand.',
    kategorie:
      'Kategorien sind die Aufwandskonten im Kontenplan, auf die die Ausgabe gebucht wird.',
    preisRechnen:
      'Im Preisfeld darfst du rechnen mit + - * / und Klammern, z. B. (7,99 + 4,50)/12. Meist teilst du den Gesamtpreis durch die Anzahl. Das Feld zeigt das Ergebnis auf Cent gerundet; der Betrag der Zeile wird mit dem exakten Preis gerechnet (Preis mal Anzahl, gerundet).',
    serienerfassung:
      'Neuer Beleg: Nach dem Buchen öffnet sich gleich ein leerer Beleg. Eingereichter Beleg: Nach dem Buchen oder Verwerfen geht es mit der nächsten Einreichung weiter (älteste zuerst). Ausgeschaltet kommst du zur Beleg-Seite.',
    modus:
      'Brutto: Die Preise auf dem Beleg enthalten die Steuer; sie wird je Steuersatz herausgerechnet. Netto: Die Preise sind ohne Steuer; die Steuer kommt je Steuersatz obendrauf. Pfandrückgaben erfasst du als Leergut-Posten (Betrag negativ).',
    belegsumme:
      'Die Summe (brutto), die auf dem Beleg steht, auch negativ (z. B. reine Pfandrückgabe). Gebucht wird nur, wenn die Summe der Posten (inkl. Pfand, Leergut negativ) genau so hoch ist; die Differenz steht unter den Tabellen.',
    neueWare:
      'Steht die Ware nicht in der Liste, wähle ganz unten „Neue Ware anlegen“ (mit dem Recht „Waren verwalten“). Das Formular ist mit dem getippten Namen vorbelegt; danach steht die Ware in der Zeile.',
    steuersatz:
      'Der Steuersatz wird mit der Kategorie vorgeschlagen und gilt je Posten. Die Steuer wird je Steuersatz auf die Summe der Posten gerechnet (wie auf Kassenbons), nicht je Posten.',
    anzahl: 'Die Anzahl darf Dezimalstellen haben, mit Komma getippt, z. B. 1,5 für 1,5 kg.',
    korrektur:
      'Bei Netto-Belegen kann die gerechnete Steuer um Cent vom Beleg abweichen. Mit der Korrektur je Steuersatz gleichst du Netto und Steuer an den Beleg an, höchstens um 10 Cent je Wert. Mehr ist keine Rundung, dann stimmen die Posten nicht.',
    zahlweg:
      'Bar: Das Geld kommt aus einem Safe-Fach, du gibst die Münzen und Scheine an. Bank: Gebucht wird direkt gegen das Bankkonto zum Bezahldatum. Auslage: Ein Mitglied hat bezahlt; der Beleg bleibt offen, bis du die Auslagen erstattest.',
    bezahldatum:
      'Das Datum, an dem bezahlt wurde; bei Bar und Bank das Buchungsdatum. Bei einer Auslage buchst du zum Belegdatum, das Bezahldatum ist später das Datum der Erstattung und wird nicht eingegeben.',
    stueckelung:
      'Abgang ist, was du aus dem Fach hergibst, Wechselgeld, was du zurückbekommst. Abgang minus Wechselgeld muss genau die Summe des Belegs ergeben. Der Abgang ist auf den Bestand des Fachs begrenzt.',
    auslage:
      'Hat ein Mitglied etwas vorgestreckt, wird es als Auslage gebucht und steht auf „Offene Auslagen“, bis du es erstattest. Mehrere Belege eines Mitglieds erstattest du gemeinsam in einer Buchung, bar oder per Bank.',
    erstattung:
      'Die Erstattung bucht „Auslagen Mitglieder“ gegen das Fach oder die Bank, zu ihrem eigenen Datum. Storniert du die Erstattung im Journal, sind die Belege wieder offen.',
    erstattungEinlage:
      'Das ist eine Einlage: Bar zählst du die erhaltenen Münzen und Scheine ins Fach, per Bank erwartest du eine Überweisung an den Verein.',
    betragNegativ:
      'Ein negativer Betrag bedeutet, dass du Geld zurückbekommen hast (z. B. reine Pfandrückgabe). Die Finanzer:innen buchen das als Einlage, bis das Geld beim Verein ist.',
    leergutMitglied:
      'Leergut ist eine Rückgabe: „Anzahl zurück“ mal Pfand je Stück ergibt einen negativen Betrag.',
    kopieren:
      'Ein gebuchter Beleg ist unveränderlich. „Als Entwurf kopieren“ legt einen neuen Entwurf mit denselben Angaben und derselben Datei an, z. B. nach einem Storno über das Journal.',
    rechnungssteller:
      'Wer die Rechnung gestellt hat (Händler, Lieferant). Archivierte Rechnungssteller erscheinen nicht mehr in der Auswahl, bleiben aber an alten Belegen erhalten. Vorbelegt wird der zuletzt verwendete.',
    postenArt:
      'Kategorie: ein normaler Aufwandsposten. Ware (Lager): eine Ware aus dem Lager in einem Gebinde (Kasten, Flasche …), mit Anzahl Gebinde und Preis je Gebinde; sie kann beim Buchen eingelagert werden. Leergut: zurückgegebene Pfandflaschen oder -kästen (Anzahl = Rückgabe, Preis = Pfand je Stück).',
    pfand:
      'Das Pfand je Gebinde wird aus dem Gebinde der Ware vorbelegt (inkl. Untergebinde) und lässt sich überschreiben; leer heißt kein Pfand. Es steht nicht im Aufwand, sondern auf dem Konto „Pfand/Leergut“, trägt aber die Steuer der Ware. Der Saldo des Kontos ist das ausstehende Leergut. Zurückgegebenes Leergut erfasst du als Posten der Art „Leergut“: Anzahl = zurückgegebene Stück (größer als 0), Preis = Pfand je Stück; der Betrag wird negativ (Steuersatz wie beim Pfand).',
    lagerPosten:
      'Bei einem Posten der Art „Ware (Lager)“ wählst du Ware und Gebinde; der Preis gilt je Gebinde ohne Pfand. Die Kategorie wird aus der Warengruppe der Ware vorgeschlagen und lässt sich ändern. Ohne Zuordnung musst du sie selbst wählen.',
    artikelKategorie:
      'Bei einem Kategorie-Posten trägst du zuerst den Artikel ein (z. B. „Deko“). Wurde ein Artikel mit diesem Namen schon gebucht, stehen die Kategorien, in denen er gebucht wurde, oben als Vorschläge (die häufigste ist vorausgewählt, solange die Kategorie leer ist). Groß- und Kleinschreibung zählen nicht. Alle anderen Kategorien stehen darunter.',
    warengruppeKategorie:
      'Jede Warengruppe kann einer Kategorie (Aufwandskonto) zugeordnet werden. Untergruppen erben die Zuordnung der nächsten Obergruppe, solange sie keine eigene haben. Beim Erfassen eines Ware-Postens wird sie vorgeschlagen.',
    einreichen:
      'Mitglieder reichen Belege mit Foto, Datum und Betrag als Auslage ein. Sie erscheinen im Bereich „Eingereicht“. Du ergänzt Rechnungssteller, Kategorien und Posten und buchst sie; den Zahlweg darfst du ändern. Passt der genannte Betrag nicht zur Summe, warnt dich das Buchen. „Verwerfen“ braucht eine Begründung, die das Mitglied per Nachricht erhält; es kann den Beleg neu einreichen.',
  },
  steuersaetze: {
    zeitraeume:
      'Regelsatz und ermäßigter Satz gelten ab einem Datum, bis der nächste Zeitraum beginnt (z. B. 16 % und 5 % vom 1.7.2020 bis 31.12.2020). Für ein Belegdatum gilt der letzte Zeitraum, der an oder vor diesem Datum beginnt. Kategorien und Artikel merken sich nur „Regelsatz“, „Ermäßigt“ oder „Keine Steuer“; der Prozentwert ergibt sich aus dem Datum.',
    loeschen:
      'Ein Zeitraum lässt sich nur löschen, solange noch kein Beleg und keine Kassenabrechnung in ihm gebucht ist. Der Zeitraum davor gilt dann wieder bis zum nächsten.',
  },
  sortierung: {
    spalten:
      'Klick auf einen Spaltenkopf sortiert die Liste, ein zweiter Klick dreht die Richtung. Auf dem Handy wählst du Spalte und Richtung über „Sortieren nach“. Leere Werte stehen immer am Ende.',
  },
  artikel: {
    erklaerung:
      'Ein Artikel ist ein Name, der auf gebuchten Posten vorkommt (Kategorie-Posten). Seine Steuersatz-Vorgabe wird beim Erfassen eines Postens mit diesem Namen vorausgewählt; im Beleg kannst du sie weiter ändern. Gebuchte Belege bleiben unverändert.',
    steuersatz:
      'Standard-Steuersatz des Artikels: wird bei einem neuen Posten mit diesem Namen vorausgewählt.',
  },
  rechnungen: {
    istVersteuerung:
      'Der Verein versteuert nach vereinnahmten Entgelten (Ist-Versteuerung): Erlös und Umsatzsteuer entstehen erst, wenn bezahlt wird. Beim Stellen bucht die App deshalb nur die offene Forderung. Erst die Zahlung bucht den Erlös mit Umsatzsteuer, mit dem Datum der Zahlung.',
    nummer:
      'Die Rechnungsnummer (NNN-Jahr, z. B. 001-2027) wird beim Stellen vergeben, lückenlos je Jahr. Das Jahr ist das des Rechnungsdatums (heute). Entwürfe haben noch keine Nummer. Auch Stornorechnungen bekommen eine Nummer aus derselben Reihe.',
    leistungsdatum:
      'Der Tag der Lieferung oder Leistung, bei einem Zeitraum der erste Tag. Pflicht auf jeder Rechnung. Das Rechnungsdatum ist immer der Tag des Stellens und lässt sich nicht ändern.',
    zahlungsziel:
      'Tage ab dem Rechnungsdatum, bis die Rechnung fällig ist. Leer: der Standard aus den Rechnungs-Einstellungen. Danach gilt die Rechnung in der Liste als überfällig.',
    empfaenger:
      'Mitglieder bekommen die Rechnung mit Vor- und Nachname und der Adresse aus dem Profil; fehlt die Adresse, kann die Rechnung nicht gestellt werden. Externe Empfänger legst du hier oder unter „Empfänger“ an. Name und Anschrift werden beim Stellen in die Rechnung kopiert.',
    waren:
      'Waren stammen aus dem Lager. Der Preis gilt je Gebinde ohne Pfand und ist mit dem letzten Einkaufspreis vorbelegt (brutto). Das Pfand je Gebinde wird auf der Rechnung als eigene Zeile ausgewiesen.',
    anschrift:
      'Die Anschrift wird so auf die Rechnung gedruckt, Zeile für Zeile: z. B. Straße und Hausnummer, dann PLZ und Ort. Der Name steht schon darüber.',
    erloesKategorie:
      'Das Erlöskonto, auf das die Zahlung gebucht wird. Der Steuersatz wird mit dem Standard der Kategorie vorbelegt und lässt sich ändern.',
    modus:
      'Brutto: Die Preise enthalten die Steuer, sie wird je Steuersatz herausgerechnet. Netto: Die Preise sind ohne Steuer, die Steuer kommt je Steuersatz obendrauf.',
    storno:
      'Eine gestellte Rechnung wird nie geändert oder gelöscht. Die Stornorechnung ist eine neue Rechnung mit eigener Nummer und negativen Beträgen, die auf die Ursprungsrechnung verweist. Sie ist nur möglich, solange nicht bezahlt wurde: Storniere bei einer bezahlten Rechnung zuerst die Zahlungsbuchung im Journal.',
    zahlweg:
      'Bank: Überweisung aufs Vereinskonto. Bar: Das Geld kommt in ein Fach des Safes, du gibst die Münzen und Scheine an. Karte (SumUp): Das Geld liegt zunächst als SumUp-Guthaben, bis die Auszahlung mit dem Bankkonto abgeglichen wird. Eine Rechnung wird immer ganz bezahlt, Teilzahlungen gibt es nicht. Ins Buch lässt sich nicht zahlen.',
    einstellungen:
      'Diese Angaben erscheinen auf jeder Rechnung. Beim Stellen wird eine Kopie in die Rechnung geschrieben: Spätere Änderungen betreffen nur neue Rechnungen. Der „Text unter den Posten“ ersetzt den Zahlungssatz unter der Summe; Platzhalter wie {nummer} oder {faellig} werden beim PDF eingesetzt.',
  },
  waren: {
    standardGebinde:
      'Das Standard-Gebinde wird beim Erfassen eines Ware-Postens vorausgewählt (samt Pfand). Ohne Standard wird das Gebinde nur vorausgewählt, wenn die Ware genau eines hat. Pflichtfeld; es muss eines der gewählten Gebinde der Ware sein.',
  },
  lagerAbgleich: {
    erklaerung:
      'Der Abgleich prüft je Ware, ob Lager und Belege zusammenpassen, gezählt ab dem Stichtag. Lager (Ist): Was eingelagert wurde. Belege (Soll): Was auf gebuchten Belegen als Ware gekauft wurde. Korrektur: Eine Erklärung für eine Abweichung, z. B. Bruch. Diskrepanz = Lager − Belege − Korrekturen. 0 bedeutet: alles passt. Positiv: mehr eingelagert als gekauft; negativ: mehr gekauft als eingelagert (Ware fehlt oder wurde noch nicht eingelagert). Alle Mengen sind in Basiseinheiten (kleinstes Gebinde), z. B. Flaschen.',
    stichtag:
      'Erst Einlagerungen, Belege und Korrekturen ab diesem Tag zählen. Davor liegende Bestände bleiben außen vor.',
  },
} as const;
