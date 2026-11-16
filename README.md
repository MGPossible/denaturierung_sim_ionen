# MG Possible Lab – Proteindynamik mit Guanidiniumchlorid

Version 1.3.2 · Interaktive 3D-Websimulation für den naturwissenschaftlichen Unterricht.

## Wissenschaftliche Ausgangsbasis

- **Protein:** nicht reduziertes Hühnereiweiß-Lysozym (HEWL), RCSB PDB **1LYZ**, Kette A, 129 Aminosäuren.
- **Native Referenz:** experimentelle Röntgenstruktur, Auflösung 2,00 Å.
- **Modellbedingungen:** 20 °C und pH 4,5; die vier nativen Disulfidbrücken werden im Strukturmodell erhalten.
- **Denaturierungsmittel:** Guanidiniumchlorid (GdmCl/GdnHCl), nicht Natriumchlorid (NaCl).

Die PDB-Startstruktur ist experimentell. Die Zwischenkonformationen, Konzentrationskurve, Ionendarstellung und die Modellgrenze für kinetische Trappung sind didaktische Modelle, keine experimentellen Messdaten und keine Molekulardynamik.

**Validierung der Disulfidbrücken (Hotfix 1.3.1):** Die Prüfung vergleicht die berechnete Sγ–Sγ-Distanz mit der Distanz, die im jeweiligen offiziellen `SSBOND`-Datensatz eingetragen ist. Es wird kein pauschaler idealisierter Maximalwert von 2,30 Å erzwungen. Der offizielle 1LYZ-Datensatz enthält unter anderem für Cys 30–115 eine Distanz von 2,42 Å. Die echten experimentellen Koordinaten bleiben unverändert; inkonsistente Koordinaten/Annotationen werden weiterhin abgewiesen.

**Validierung der Disulfidbrücken:** Die vier Verknüpfungen werden anhand der `SSBOND`-Einträge und der experimentellen Sγ-Koordinaten geprüft. Es wird bewusst kein pauschaler idealer Sγ–Sγ-Grenzwert (z. B. maximal 2,3 Å) erzwungen: Der offizielle historische 1LYZ-Datensatz weist für Cys 30–115 eine annotierte Distanz von 2,42 Å aus. Stattdessen muss die aus den Koordinaten berechnete Distanz mit der im selben PDB-Eintrag deklarierten `SSBOND`-Distanz übereinstimmen. So wird die echte experimentelle Struktur validiert, nicht gegen eine idealisierte Geometrie ausgetauscht.

## Was die Simulation zeigt

1. Ein stufenloser Regler steuert GdmCl zwischen 0 und 8 mol/L.
2. Das native Cα-Rückgrat wird kontinuierlich in Richtung einer reproduzierbar erzeugten ungeordneten Polymerkonformation verformt.
3. α-Helix- und β-Faltblatt-Geometrien verlieren schrittweise ihre lokale Ordnung. Die Strukturindikatoren verwenden dieselben Retentionsfunktionen wie die Visualisierung.
4. Aus den experimentellen PDB-Atomkoordinaten werden geometrisch gefilterte Backbone-H-Brücken zwischen Carbonyl-O und Amid-N abgeleitet. Ihre Endpunkte sind zusätzlich mit dem jeweiligen Cα-Rückgrat verbunden; die Kontaktlinien verblassen mit steigender Entfaltung.
5. Bis zu 30 Guanidinium-Kationen (Gdm⁺) werden schematisch an ausgewählten sauren Seitenketten und Carbonylgruppen eingeblendet. Sie nähern sich bei steigender Konzentration schrittweise entlang der lokalen Seitenketten-/Carbonylrichtung. Chlorid-Anionen (Cl⁻) erscheinen im umgebenden Lösungsmittelbereich. Die Ionenpositionen sind eine didaktische Veranschaulichung, keine berechnete Verteilung.
6. Die PDB-basierten Backbone-H-Brücken sind geometrisch abgeleitete Kontakt-Hinweise zwischen experimentell positionierten O- und N-Atomen. Sie ersetzen keine DSSP-/Kraftfeld-Auswertung und berücksichtigen keine expliziten Wasserstoffatome. Die vier nativen Disulfidbrücken werden anhand der PDB-SG- und CB-Koordinaten an ihren Cystein-Resten dargestellt (Cys 6–127, 30–115, 64–80 und 76–94).

## Renaturierung und kinetische Trappung

Das Modell besitzt nun eine pfadabhängige Rückfaltung: Wird der normierte Entfaltungsindex beim Erhöhen der Konzentration über **0,82** geführt (in der aktuellen Modellkurve etwa 6,3 M), wächst ein kinetisch gefangener Anteil an. Beim anschließenden Absenken der GdmCl-Konzentration faltet sich nur der reversible Anteil zurück. Der gefangene Anteil bleibt in einer alternativen Konformation; der Zustand bei 0 M ist dann nicht identisch mit der nativen Startstruktur. **Reset** setzt die Versuchshistorie zurück.

Diese Grenze ist ausdrücklich eine didaktische Hysterese-/Trappungsannahme und keine experimentell bestimmte Schwelle, ab der nicht reduziertes Lysozym grundsätzlich nicht mehr renaturieren kann. In realen Systemen hängen Faltungsausbeute und Aggregation unter anderem von Proteinkonzentration, Temperatur, pH, Verdünnungsprotokoll, Redoxbedingungen und Zeit ab. Die publizierte Renaturierungsarbeit aus dem ursprünglichen Projekt untersuchte reduziertes Lysozym; ihre Ausbeuten werden nicht direkt auf das hier gezeigte nicht reduzierte Modell übertragen.

## Ionische Wechselwirkungen – fachliche Einordnung

GdmCl liegt in Wasser als Gdm⁺ und Cl⁻ vor. Eine publizierte Molekulardynamik-Studie an einem anderen Protein beschreibt eine bevorzugte Anreicherung von Gdm⁺ nahe negativ geladenen bzw. planaren Gruppen und Wechselwirkungen mit Backbone-Carbonylgruppen; Chlorid wurde in diesem GdmCl-System dagegen von der Proteinoberfläche eher ausgeschlossen. Daher zeigt die Anwendung Gdm⁺ an ausgewählten Protein-Kontaktstellen, Cl⁻ aber überwiegend im Lösungsmittelbereich. Die Quelle betrifft nicht direkt Lysozym 1LYZ; die Übertragung auf die Visualisierung ist eine vorsichtige didaktische Veranschaulichung.

Die dargestellten Kontakte sind statische PDB-basierte Geometrie-Hinweise. Protonierungszustände, Wasserstoffbrücken-Energien, Lösungsmittel, Ionendynamik und molekulare Kinetik werden nicht vollständig atomistisch berechnet.

## Technisches Setup

Voraussetzung: Node.js 22 oder neuer und npm.

```bash
npm install
npm run prepare:structure
npm run validate:structure
npm run test:model
npm run dev
```

`npm run dev` führt den Vorbereitungs- und Validierungsschritt automatisch aus.

### Originale PDB-Datei

Die originale Datei `public/data/1LYZ.pdb` wird beim Vorbereiten von einem offiziellen RCSB/wwPDB-Endpunkt bezogen und lokal abgelegt. Der Validierungsschritt prüft die PDB-Kennung, 129 Cα-Positionen in Kette A und vier `SSBOND`-Datensätze. Der Produktivbuild verwendet ausschließlich diese lokale Datei; im Browser ist keine externe API erforderlich. Bei einer Build-Umgebung ohne Downloadzugriff kann die Originaldatei manuell von [RCSB PDB 1LYZ](https://www.rcsb.org/structure/1LYZ) unter `public/data/1LYZ.pdb` abgelegt werden.

## Tests und Produktionsbuild

```bash
npm run test:model
npm run validate:structure
npm run build
npm run preview
```

Die automatisierten Node-Tests prüfen unter anderem:

- monotone und begrenzte Konzentrationskurve,
- Kopplung von Sekundärstruktur-Indizes und Geometriemodell,
- Erhaltung der Cα-Kettenabstände sowie Disulfid-Cα-/Sγ-Abstände im Lehrmodell,
- pfadabhängige kinetische Trappung und eine nicht-native Rückfaltungsstruktur,
- Erkennung von Seitenketten-Ladungsgruppen, der vier nativen Disulfidverknüpfungen und geometrisch gefilterten Backbone-H-Brücken im PDB-Parser.
- Prüfung der 1LYZ-Disulfid-Paarung (Cys 6–127, 30–115, 64–80 und 76–94) sowie Darstellung über die experimentellen Cα-, Cβ- und Sγ-Koordinaten.
- Prüfung, dass die aus Sγ-Koordinaten berechneten Disulfidabstände mit den offiziellen `SSBOND`-Distanzangaben übereinstimmen; ein idealisierter Universal-Grenzwert wird nicht erzwungen.

## Bedienung

- Konzentrationsregler: 0,00–8,00 mol/L, stufenlos mit Maus oder Touch.
- Denaturierung und Renaturierung: automatische Konzentrationserhöhung bzw. -absenkung.
- Nach Überschreiten der Modellgrenze bleibt ein kinetisch gefangener Anteil zurück; **Reset** startet ein neues Experiment.
- 3D-Navigation: Ziehen zum Rotieren, Pinch/Mausrad zum Zoomen, Zwei-Finger-Geste bzw. rechte Maustaste zum Verschieben.
- Native Referenz: transparente Überlagerung der nativen 1LYZ-Konformation.
- Ein-/Ausblenden von Helices, β-Faltblättern, Disulfidbrücken sowie GdmCl-Ionen und Backbone-H-Brücken.
- Geschwindigkeitsauswahl, Kamera-Reset, dynamische Modellkurve und normalisierte Modellindikatoren.

## GitHub Pages

Das Repository enthält `.github/workflows/deploy.yml`. Bei Push auf `main` werden Abhängigkeiten installiert, Tests ausgeführt, die originale lokale 1LYZ-Datei geladen und validiert, anschließend wird die Anwendung gebaut und über GitHub Pages veröffentlicht.

Unter **Settings → Pages → Build and deployment** muss als Quelle **GitHub Actions** gewählt sein. Vite verwendet in GitHub Actions automatisch den Repository-Namen als Basispfad.

## Quellen

- RCSB PDB 1LYZ: <https://www.rcsb.org/structure/1LYZ>
- Native Disulfid-Konnektivität des Hühnereiweiß-Lysozyms: <https://pubmed.ncbi.nlm.nih.gov/11034323/>
- Contrasting Effects of Guanidinium Chloride and Urea on the Activity and Unfolding of Lysozyme, ACS Omega (2018): <https://doi.org/10.1021/acsomega.8b01911>
- Counterion Effects on the Denaturing Activity of Guanidinium Cation to Protein, J. Chem. Theory Comput. (2012): <https://doi.org/10.1021/ct3002267>
- Effect of Guanidinium Chloride Concentration on the Renaturation of Denatured Lysozyme (2001): <https://pubmed.ncbi.nlm.nih.gov/12040421/>
- Kinetics of secondary structure recovery during refolding of reduced hen egg white lysozyme (1997): <https://pubmed.ncbi.nlm.nih.gov/9312083/>


### Version 1.3.2

Die Legendenbezeichnungen sind verkürzt („Disulfidbrücken“, „H-Brücken“); die H-Brücken sind in der 3D-Ansicht kontrastreicher cyanfarben hervorgehoben. Der Einleitungstext wurde angepasst. In der Molekülansicht setzt eine zusätzliche Reset-Schaltfläche das gesamte Experiment zurück. Die Übergangskurve ist interaktiv: Der gelbe Marker kann mit Maus oder Touch entlang der Konzentrationsachse gezogen werden. Konzentrationsanzeige, Kurvenmarker und Hauptregler bleiben synchron. Der Marker ist außerdem per Tastatur (Pfeiltasten, Pos1/Ende) bedienbar.
