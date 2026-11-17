/**
 * Explanations for Finanzen fields (shown by `InfoHinweis`). Central on purpose: the Finanzer:in
 * changes often and the knowledge must stay in the app. Every slice adds its texts here. Based on
 * docs/finanzen.md; keep them short and factual.
 */
export const HILFE = {
  konto: {
    art: 'Bargeld: Kasse, Safe und seine Fächer. Bank: Bankkonten. Durchlauf: Geld, das nur unterwegs ist, z. B. Geldtransit. Erlöse und Aufwand: Kategorien für Einnahmen und Ausgaben (Grundlage für die spätere G+V). Neutral: Konten ohne Ergebnis, z. B. Eröffnung oder Kassendifferenz.\nDie Art lässt sich nach der ersten Buchung nicht mehr ändern.',
    parent:
      'Macht dieses Konto zum Unterkonto einer Gruppe, z. B. ein Fach unter „Safe“. Auf ein Konto mit Unterkonten wird nicht gebucht, sondern auf seine Unterkonten; sein Saldo ist die Summe aller Unterkonten. Ein Konto, auf dem schon gebucht wurde, kann keine Unterkonten bekommen. Das übergeordnete Konto lässt sich nach der ersten Buchung nicht mehr ändern.',
    stueckelung:
      'Das Konto führt seinen Bestand je Münze und Schein (Stückelung). Das brauchst du für die Fächer des Safes und für Kassen. Bei jeder Buchung auf dieses Konto gibst du an, welche Münzen und Scheine es sind. Lässt sich nach der ersten Buchung nicht mehr ändern.',
    steuersatzStandard:
      'Nur ein Vorschlagswert für die spätere Belegerfassung bei Erlös- und Aufwandskonten. Die Buchungszeile trägt den tatsächlichen Satz. Bei Bargeld, Bank, Durchlauf und Neutral ist er ohne Bedeutung. Derzeit wird er noch nirgends vorbelegt.',
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
  kette: {
    ergebnis:
      'Die Prüfung liest alle Buchungen und kontrolliert lückenlose Nummern, den Verweis jeder Buchung auf die vorige, die Hashes (erkennen nachträglich veränderte Inhalte), dass jede Buchung aufgeht und den Zähler. „Kette intakt“ heißt: nichts wurde verändert. Geprüft wird derzeit nur gegen die Datenbank, nicht gegen das spätere Archiv.',
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
      'Liegt der Saldo unter dem erlaubten Überzug, ist die Seite überzogen. Das blockiert die Abrechnung nicht, du musst es aber bestätigen. Das Mitglied bekommt danach eine Benachrichtigung.',
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
} as const;
