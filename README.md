# Lysozym-Labor – Denaturierung und Renaturierung mit GdmCl

Interaktive, responsive 3D-Websimulation für den naturwissenschaftlichen Unterricht. Die Anwendung nutzt React, TypeScript, Vite und Three.js und ist für iPadOS Safari sowie aktuelle Windows-Browser ausgelegt.

## Wissenschaftliche Ausgangsbasis

- **Protein:** nicht reduziertes Hühnereiweiß-Lysozym (HEWL), RCSB PDB **1LYZ**, Kette A, 129 Aminosäuren.
- **Native Referenz:** experimentelle Röntgenstruktur, Auflösung 2,00 Å.
- **Feste Modellbedingungen:** 20 °C, pH 4,5; vier native Disulfidbrücken bleiben erhalten.
- **Denaturierungsmittel:** Guanidiniumchlorid (GdmCl/GdnHCl), nicht Natriumchlorid.

Die PDB-Startstruktur ist experimentell. Die Konzentrationskurve und sämtliche Zwischenkonformationen sind dagegen ein parametrisches Lehrmodell und keine experimentellen Messdaten oder Molekulardynamik.

## Was die Simulation modelliert

1. Der Konzentrationsregler verändert einen normierten, nichtlinearen Entfaltungsindex von 0 bis 1.
2. Das native Cα-Rückgrat wird kontinuierlich in Richtung einer deterministisch erzeugten ungeordneten Polymerkonformation überführt.
3. Die lokalen Geometrien von α-Helices und β-Faltblättern verlieren stufenweise ihre Ordnung. Die zugehörigen sichtbaren Strukturelemente werden zugleich weniger ausgeprägt und entsättigt.
4. Ein geometrischer Relaxationsschritt erhält näherungsweise die Cα-Abstände entlang der Kette sowie die nativen Cα-Paar- und Sγ–Sγ-Bindungsabstände der vier Disulfid-verknüpften Cysteinpaare.
5. Dieselben klassenbezogenen Funktionen steuern die angezeigten Helix- und Faltblatt-Erhaltungsindizes. Die Werte sind damit intern konsistent, aber ausdrücklich **keine gemessenen Prozentanteile**.
6. Bei sinkender Konzentration läuft dasselbe Lehrmodell reversibel zurück. Es wird keine willkürliche irreversible Ausbeute oder Aggregationsrate ergänzt, weil dafür keine passend belegten Parameter für genau dieses nicht reduzierte Lysozymsystem vorliegen.

Der geometrische Abstands-Relaxationsschritt ist eine Projektion, keine Kraftfeld-Minimierung. Es wird keine Molekulardynamik berechnet. Lösungsmittel, Ionen, atomare Wechselwirkungen, Faltungskinetik, Fehlfaltung und Aggregation werden nicht atomistisch simuliert.

Die sigmoidale Konzentrationsfunktion ist illustrativ und **nicht** an eine konkrete Lysozym-Messreihe angepasst. 0–8 mol/L ist der Bereich dieser Unterrichtssimulation und keine universelle Denaturierungsschwelle aller Proteine. Enzymaktivität und strukturelle Entfaltung sind nicht gleichzusetzen: eine Lysozym-Studie beschreibt Aktivitätsverluste bei GdmCl-Konzentrationen, bei denen die gefaltete Struktur noch weitgehend erhalten sein kann.

Die angeführte Renaturierungsarbeit an reduziertem Lysozym wird nicht als Ausbeute auf das nicht reduzierte Modell übertragen.

## Installation und lokaler Start

Voraussetzung: Node.js 22 (für den eingebauten Modelltest) oder neuer und npm.

```bash
npm install
npm run prepare:structure
npm run validate:structure
npm run dev
```

Der Entwicklungsstart führt `prepare:structure` und `validate:structure` automatisch aus.

### Originale PDB-Datei

Die originale Datei `public/data/1LYZ.pdb` wird beim Vorbereiten des Projekts von der RCSB PDB bezogen und dort lokal abgelegt. Das Skript prüft:

- PDB-Kennung 1LYZ,
- exakt 129 Cα-Positionen und 129 eindeutige Residuen in Kette A,
- vier `SSBOND`-Datensätze.

Es werden mehrere offizielle wwPDB/RCSB-Download-Endpunkte versucht. Die veröffentlichte Anwendung lädt die Struktur dann aus `dist/data/1LYZ.pdb` und kontaktiert RCSB **nicht** zur Laufzeit. Bei Build-Umgebungen ohne Zugriff auf die Downloadserver kann die PDB-Datei manuell von [RCSB 1LYZ](https://www.rcsb.org/structure/1LYZ) geladen und unter `public/data/1LYZ.pdb` abgelegt werden.

## Tests und Produktionsbuild

```bash
npm run test:model
npm run validate:structure
npm run build
npm run preview
```

`npm run test:model` prüft Randwerte und Monotonie der Modellkurve, die Kopplung der Sekundärstruktur-Indizes sowie die Erhaltung der Cα-Ketten- und Disulfid-Abstände im entfalteten Lehrmodell. `npm run build` führt durch den `prebuild`-Hook das Herunterladen und Validieren der Struktur vor dem Vite-Build aus.

## Bedienung

- Konzentrationsregler: 0,00–8,00 mol/L, stufenlos mit Maus oder Touch.
- Denaturierung und Renaturierung: automatische Konzentrationserhöhung bzw. -absenkung, jeweils mit Pause.
- 3D-Navigation: Ziehen zum Rotieren, Pinch/Mausrad zum Zoomen, Zwei-Finger-Geste bzw. rechte Maustaste zum Verschieben.
- Kamerasteuerung: zurücksetzen und Protein zentrieren.
- Native Referenz: transparente Überlagerung der nativen 1LYZ-Konformation.
- Sekundärstrukturelemente und Disulfidbrücken einzeln ein-/ausblenden.
- Geschwindigkeitsauswahl, Reset, dynamische Modellkurve und normalisierte Modellindikatoren.

## GitHub Pages

Das Repository enthält `.github/workflows/deploy.yml`. Bei Push auf `main`:

1. werden npm-Abhängigkeiten installiert,
2. wird das Modell getestet,
3. wird die offizielle lokale 1LYZ-Datei geladen und validiert,
4. wird die Anwendung gebaut und über GitHub Pages veröffentlicht.

Unter **Settings → Pages → Build and deployment** muss als Quelle **GitHub Actions** ausgewählt sein. Die Vite-Basispfadkonfiguration verwendet in Actions automatisch den Repository-Namen. Für dieses Repository ist das `/demosimu.github.io/`.

## Quellen

- RCSB PDB 1LYZ: <https://www.rcsb.org/structure/1LYZ>
- Contrasting Effects of Guanidinium Chloride and Urea on the Activity and Unfolding of Lysozyme, ACS Omega (2018): <https://doi.org/10.1021/acsomega.8b01911>
- Effect of Guanidinium Chloride Concentration on the Renaturation of Denatured Lysozyme (2001): <https://pubmed.ncbi.nlm.nih.gov/12040421/>
- Kinetics of secondary structure recovery during refolding of reduced hen egg white lysozyme (1997): <https://pubmed.ncbi.nlm.nih.gov/9312083/>
