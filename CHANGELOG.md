# Änderungen

## 1.3.1

- Fehler im PDB-Validierungsschritt behoben: Cys 30–115 besitzt im offiziellen 1LYZ-`SSBOND`-Datensatz eine Sγ–Sγ-Distanz von 2,42 Å. Der alte pauschale Grenzwert von 2,30 Å wies daher die unveränderte Originalstruktur fälschlich zurück.
- Der Validator vergleicht jetzt die aus den Sγ-Atomkoordinaten berechnete Distanz mit dem für dieselbe Bindung deklarierten Wert im `SSBOND`-Datensatz.
- Kettenzugehörigkeit, vier erwartete Disulfidpaare und vorhandene Cβ-/Sγ-Koordinaten werden weiterhin geprüft.
- Vier zusätzliche Tests prüfen das Einlesen der Originalwerte, die Akzeptanz von 2,42 Å und das Zurückweisen inkonsistenter Koordinaten.

## 1.3.2 – 16. November 2026

- Die Molekülansicht zeigt in der Legende jetzt die kurzen Bezeichnungen „Disulfidbrücken“ und „H-Brücken“.
- H-Brücken-Marker in der Übergangskurve und im Viewer sind besser kontrastiert (die 3D-Kontakte behalten ihre PDB-verankerten Positionen).
- Einleitungstext wie vom Auftraggeber formuliert aktualisiert.
- Molekülansicht erhielt einen Experiment-Reset, der denselben globalen Reset wie die Experimentsteuerung ausführt.
- Der gelbe Marker in der Übergangskurve ist mit Maus, Touch und Tastatur bedienbar und steuert synchron den Konzentrationsregler.
