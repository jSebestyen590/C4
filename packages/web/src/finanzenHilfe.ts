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
      'Umbuchung: Geld geht von einem Konto auf ein anderes, mit einem Betrag. Frei: beliebig viele Zeilen mit Zugang und Abgang, z. B. für mehrere Konten in einer Buchung. Gebucht wird in beiden Fällen nach demselben Prinzip: Alle Zugänge zusammen sind so hoch wie alle Abgänge.',
    zugangAbgang:
      'Zugang erhöht den Kontostand, Abgang verringert ihn (statt „Soll“ und „Haben“). Die Buchung geht auf, wenn alle Zugänge zusammen so hoch sind wie alle Abgänge.',
    text: 'Beschreibt, worum es geht. Der Text steht im Journal und lässt sich später nicht mehr ändern.',
    datum:
      'Das Buchungsdatum, nicht der Tag der Eingabe. Liegt es in der Zukunft, warnst du dich selbst: Du musst es dann bestätigen.',
    warnungen:
      'Plausibilitätswarnungen (z. B. Datum in der Zukunft, ungewöhnlich hoher Betrag) blockieren nicht, müssen aber bestätigt werden. Gebuchtes lässt sich nicht mehr ändern, nur per Storno korrigieren.',
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
      'Hier geht das Geld ab. Mindestens eine Seite der Umbuchung muss ein Fach sein. Du kannst höchstens entnehmen, was im Fach ist (Bestand je Münze und Schein).',
    umbuchenNach:
      'Hier kommt das Geld an: ein anderes Fach oder ein anderes Konto, z. B. Bank. Die Münzen und Scheine trägst du nur einmal ein.',
    bestand:
      'Der Bestand ergibt sich aus den Buchungen: wie viele Stück je Münze und Schein im Fach liegen. Er darf nie unter 0 fallen.',
    wechselnRaus:
      'Was du aus dem Fach nimmst, höchstens bis zum Bestand. Raus und Rein müssen zusammen gleich viel Geld ergeben, sonst zeigt die Seite den Unterschied.',
    wechselnRein:
      'Was du dafür ins Fach legst. Der Betrag im Fach bleibt gleich, nur die Stückelung ändert sich.',
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
} as const;
