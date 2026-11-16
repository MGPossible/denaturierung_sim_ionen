# Changelog

## 1.3.4
- Replaced the header monogram with a scalable SVG mark based on the supplied reference: thin MG letters and an open cyan-to-indigo frame.
- Increased the default molecular camera zoom by approximately 1.85x while preserving OrbitControls zoom and pan.
- Made native disulfide S–S links visibly luminous using a bright core, soft halo and emissive sulfur atoms.
- Removed the redundant INDEX badge from the structure analysis heading.
- Added a persistent lilac tint to the protein body after crossing the irreversible teaching-model boundary.
- Added a brief, one-time damped molecular shake when the irreversible boundary is first crossed; it respects reduced-motion preferences and resets with the experiment.

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


### Version 1.3.3 – 16. November 2026

- H-Brücken in der 3D-Ansicht mit gut sichtbaren emissiven Cyan-Segmenten; die Farbe entspricht der Legende.
- Ionen und H-Brücken separat ein- und ausschaltbar.
- „LIVE“-Kennzeichnung an der Übergangskurve entfernt.
- Footer auf „MG POSSIBLE LAB“ verkürzt.
- GitHub-Pages-Actions auf Node-24-kompatible Versionen aktualisiert: `configure-pages@v6`, `upload-pages-artifact@v5` (mit `include-hidden-files: true` für `.nojekyll`), `deploy-pages@v5.0.1`.
- Erklärtext zu den festen Modellbedingungen (pH 4,5 und 20 °C) ergänzt.
