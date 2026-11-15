import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ProteinViewer } from './components/ProteinViewer';
import { getConcentrationCurve, getIndicators, getStructureState } from './lib/model';
import { parsePdb, type ProteinModel } from './lib/pdb';

function percent(value: number) {
  return `${Math.round(value * 100)} %`;
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="metric-row">
      <div className="metric-row-top"><span>{label}</span><strong>{percent(value)}</strong></div>
      <div className="metric-track"><span style={{ width: `${value * 100}%`, background: color }} /></div>
    </div>
  );
}

function ConcentrationChart({ concentration }: { concentration: number }) {
  const curve = useMemo(() => getConcentrationCurve(), []);
  const width = 520;
  const height = 160;
  const left = 34;
  const right = 12;
  const top = 12;
  const bottom = 28;
  const x = (c: number) => left + (c / 8) * (width - left - right);
  const y = (v: number) => top + (1 - v) * (height - top - bottom);
  const path = curve.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.concentration).toFixed(1)} ${y(point.index).toFixed(1)}`).join(' ');
  const current = getIndicators(concentration).unfolded;
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Modellkurve: normierter Entfaltungsindex in Abhängigkeit von der Guanidiniumchlorid-Konzentration">
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x={left - 9} y={y(tick) + 4} textAnchor="end" className="chart-label">{Math.round(tick * 100)}</text>
          </g>
        ))}
        {[0, 2, 4, 6, 8].map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={top} y2={height - bottom} className="chart-grid chart-grid-vertical" />
            <text x={x(tick)} y={height - 8} textAnchor="middle" className="chart-label">{tick}</text>
          </g>
        ))}
        <path d={path} className="chart-curve" />
        <line x1={x(concentration)} x2={x(concentration)} y1={top} y2={height - bottom} className="chart-cursor" />
        <circle cx={x(concentration)} cy={y(current)} r="6" className="chart-dot" />
        <text x={left} y={height - 1} className="chart-axis-title">GdmCl (mol/L)</text>
      </svg>
      <div className="chart-footnote"><span>Modellkurve</span><span>Entfaltungsindex (0–100)</span></div>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="info-section">
      <summary>{title}<span>+</span></summary>
      <div className="info-content">{children}</div>
    </details>
  );
}

export default function App() {
  const [concentration, setConcentration] = useState(0);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const previousConcentration = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [playbackDirection, setPlaybackDirection] = useState<'up' | 'down'>('up');
  const [speed, setSpeed] = useState(1);
  const [compare, setCompare] = useState(false);
  const [showHelices, setShowHelices] = useState(true);
  const [showSheets, setShowSheets] = useState(true);
  const [showDisulfides, setShowDisulfides] = useState(true);
  const [model, setModel] = useState<ProteinModel | null>(null);
  const [structureError, setStructureError] = useState('');
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const indicators = useMemo(() => getIndicators(concentration), [concentration]);
  const structureState = getStructureState(concentration, indicators.unfolded, direction);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/1LYZ.pdb`)
      .then((response) => {
        if (!response.ok) throw new Error('Die lokale Datei public/data/1LYZ.pdb fehlt noch.');
        return response.text();
      })
      .then((text) => {
        if (!cancelled) {
          const parsed = parsePdb(text);
          setModel(parsed);
          setStructureError('');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setStructureError(error instanceof Error ? error.message : 'Die PDB-Struktur konnte nicht geladen werden.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const previous = previousConcentration.current;
    if (concentration < previous - 0.001) setDirection('down');
    if (concentration > previous + 0.001) setDirection('up');
    previousConcentration.current = concentration;
  }, [concentration]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setConcentration((value) => playbackDirection === 'up'
        ? Math.min(8, value + 0.035 * speed)
        : Math.max(0, value - 0.035 * speed));
    }, 35);
    return () => window.clearInterval(timer);
  }, [playing, playbackDirection, speed]);

  useEffect(() => {
    if (playing && ((playbackDirection === 'up' && concentration >= 8) || (playbackDirection === 'down' && concentration <= 0))) {
      setPlaying(false);
    }
  }, [concentration, playbackDirection, playing]);

  function reset() {
    setPlaying(false);
    setConcentration(0);
    setDirection('up');
    setPlaybackDirection('up');
    previousConcentration.current = 0;
  }

  async function loadLocalPdb(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parsePdb(text);
      setModel(parsed);
      setStructureError('');
    } catch (error) {
      setModel(null);
      setStructureError(error instanceof Error ? error.message : 'Die Datei ist keine gültige 1LYZ-PDB-Datei.');
    }
  }

  const statusClass = indicators.unfolded > 0.72 ? 'status-warm' : indicators.unfolded > 0.13 ? 'status-mid' : 'status-cool';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>LY</span></div>
          <div><div className="brand-name">MOLECULAR LAB</div><div className="brand-subtitle">PROTEIN DYNAMICS / 01</div></div>
        </div>
        <div className="topbar-right">
          <span className="topbar-chip"><i /> Interaktives Experiment</span>
          <span className="topbar-model">PDB <strong>1LYZ</strong></span>
        </div>
      </header>

      <main className="page-content">
        <section className="intro-row">
          <div>
            <div className="eyebrow"><span>01</span> STRUKTURBIOLOGIE · DENATURIERUNG</div>
            <h1>Wenn Proteine<br /><em>ihre Form verlieren.</em></h1>
            <p className="intro-copy">Erkunde, wie Guanidiniumchlorid die räumliche Struktur von Hühnereiweiß-Lysozym verändert – und wie sie sich beim Verdünnen wieder ordnen kann.</p>
          </div>
          <div className="conditions-card">
            <div className="conditions-heading">VERSUCHSBEDINGUNGEN</div>
            <div className="conditions-grid">
              <div><span>Temperatur</span><strong>20 °C</strong></div>
              <div><span>pH-Wert</span><strong>4,5</strong></div>
              <div><span>Protein</span><strong>HEWL · 129 AS</strong></div>
              <div><span>Disulfide</span><strong>4 · erhalten</strong></div>
            </div>
            <div className="conditions-note">Nicht reduziertes Hühnereiweiß-Lysozym</div>
          </div>
        </section>

        <section className="experiment-grid">
          <article className="viewer-card panel">
            <div className="panel-heading">
              <div><div className="panel-kicker">MOLEKÜLANSICHT</div><h2>Lysozym · 3D-Struktur</h2></div>
              <div className="structure-id"><span className="live-dot" /> 1LYZ / CHAIN A</div>
            </div>
            <ProteinViewer
              model={model}
              unfolded={indicators.unfolded}
              compare={compare}
              showHelices={showHelices}
              showSheets={showSheets}
              showDisulfides={showDisulfides}
            />
            <div className="legend-row">
              <span><i className="legend-dot helix" /> α-Helix</span>
              <span><i className="legend-dot sheet" /> β-Faltblatt</span>
              <span><i className="legend-dot loop" /> Schleife</span>
              <span><i className="legend-dot disulfide" /> Disulfidbrücke</span>
            </div>
            <div className="viewer-options" aria-label="Einblendungen der Proteinstruktur">
              <label className="switch-label"><input type="checkbox" checked={showHelices} onChange={(event) => setShowHelices(event.target.checked)} /> Helices</label>
              <label className="switch-label"><input type="checkbox" checked={showSheets} onChange={(event) => setShowSheets(event.target.checked)} /> β-Faltblätter</label>
              <label className="switch-label"><input type="checkbox" checked={showDisulfides} onChange={(event) => setShowDisulfides(event.target.checked)} /> Disulfidbrücken</label>
              <button className={`compare-button ${compare ? 'active' : ''}`} type="button" aria-pressed={compare} onClick={() => setCompare((value) => !value)}>{compare ? 'Referenz ausblenden' : 'Native Referenz einblenden'}</button>
            </div>
            {(!model || structureError) && (
              <div className="structure-alert">
                <div className="alert-icon">i</div>
                <div><strong>{loading ? 'Strukturdatei wird gesucht' : 'Lokale PDB-Datei fehlt'}</strong><p>{structureError || 'Die Anwendung benötigt die originale 1LYZ-PDB-Datei.'} Die Koordinaten werden nicht durch eine erfundene Ersatzgrafik ersetzt.</p>
                  <div className="alert-actions">
                    <button type="button" onClick={() => fileRef.current?.click()}>1LYZ-PDB lokal auswählen</button>
                    <a href="https://www.rcsb.org/structure/1LYZ" target="_blank" rel="noreferrer">RCSB-Eintrag öffnen ↗</a>
                  </div>
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".pdb,.ent,.txt" hidden onChange={(event) => loadLocalPdb(event.target.files?.[0])} />
          </article>

          <aside className="analysis-column">
            <article className="state-card panel">
              <div className="panel-kicker">AKTUELLER STRUKTURZUSTAND</div>
              <div className="state-title-row"><h2>{structureState}</h2><span className={`status-pill ${statusClass}`}>{indicators.unfolded > 0.72 ? 'UNGEORDNET' : indicators.unfolded > 0.13 ? 'IM ÜBERGANG' : 'GEORDNET'}</span></div>
              <p className="state-explanation">
                {indicators.unfolded < 0.13
                  ? 'Die native Faltung ist im Modell weitgehend erhalten. Helices, Faltblätter und Tertiärstruktur sind geordnet.'
                  : direction === 'down'
                    ? 'Die Konzentration sinkt. Die didaktische Konformation bewegt sich zurück in Richtung der nativen Struktur.'
                    : 'Mit zunehmender GdmCl-Konzentration verliert die Kette schrittweise ihre kompakte räumliche Organisation.'}
              </p>
              <div className="state-stat"><span>Modellierter Entfaltungsindex</span><strong>{percent(indicators.unfolded)}</strong></div>
              <div className="state-track"><span style={{ width: `${indicators.unfolded * 100}%` }} /></div>
              <div className="state-track-labels"><span>nativ</span><span>entfaltet</span></div>
            </article>

            <article className="metrics-card panel">
              <div className="panel-heading compact"><div><div className="panel-kicker">STRUKTUR-ANALYSE</div><h2>Modellindikatoren</h2></div><span className="index-tag">INDEX</span></div>
              <MetricBar label="Index nativer Struktur" value={indicators.native} color="#61cfc9" />
              <MetricBar label="Index entfalteter Struktur" value={indicators.unfolded} color="#db8c65" />
              <MetricBar label="Erhalt der α-Helixstruktur" value={indicators.helixRetention} color="#55c9d3" />
              <MetricBar label="Erhalt der β-Faltblattstruktur" value={indicators.sheetRetention} color="#eab95f" />
              <MetricBar label="Gesamtindex struktureller Ordnung" value={indicators.order} color="#9aaec2" />
              <div className="metrics-note">Alle Balken sind normalisierte didaktische Modellindizes (0–100), keine experimentell gemessenen Prozentanteile. Dieselben klassenbezogenen Modellfunktionen steuern den sichtbaren Ordnungsverlust der Helix- und Faltblatt-Elemente.</div>
            </article>

            <article className="chart-card panel">
              <div className="panel-heading compact"><div><div className="panel-kicker">KONZENTRATION · STRUKTUR</div><h2>Übergangskurve</h2></div><span className="chart-live">LIVE</span></div>
              <ConcentrationChart concentration={concentration} />
              <p className="chart-note">Nichtlinearer sigmoidaler Modellverlauf. Die Kurve ist eine didaktische Annahme und keine an 1LYZ-Messdaten angepasste Faltungskurve.</p>
            </article>
          </aside>
        </section>

        <section className="control-panel panel">
          <div className="control-topline">
            <div><div className="panel-kicker">EXPERIMENT STEUERN</div><h2>Guanidiniumchlorid-Konzentration</h2></div>
            <div className="value-readout" aria-live="polite"><strong>{concentration.toFixed(2).replace('.', ',')}</strong><span>mol/L</span></div>
          </div>
          <div className="slider-wrap">
            <input
              className="concentration-slider"
              aria-label="Guanidiniumchlorid-Konzentration in mol pro Liter"
              type="range" min="0" max="8" step="0.01" value={concentration}
              onChange={(event) => { setPlaying(false); setConcentration(Number(event.target.value)); }}
              style={{ '--range-fill': `${(concentration / 8) * 100}%` } as CSSProperties & { '--range-fill': string }}
            />
            <div className="range-labels"><span>0,0 M · nativ</span><span>2,0 M</span><span>4,0 M</span><span>6,0 M</span><span>8,0 M · hoch</span></div>
          </div>
          <div className="control-bottom">
            <div className="playback-buttons">
              {playing ? (
                <button className="primary-action" type="button" onClick={() => setPlaying(false)}><span>Ⅱ</span>Pause</button>
              ) : (
                <>
                  <button className="primary-action" type="button" onClick={() => { setPlaybackDirection('up'); setPlaying(true); }} disabled={concentration >= 8}><span>▶</span>Denaturierung</button>
                  <button className="secondary-action" type="button" onClick={() => { setPlaybackDirection('down'); setPlaying(true); }} disabled={concentration <= 0}><span>↶</span>Renaturierung</button>
                </>
              )}
              <button className="secondary-action" type="button" onClick={reset}>↺ Reset</button>
            </div>
            <div className="speed-control"><label htmlFor="speed">Animationsgeschwindigkeit</label><select id="speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="0.5">0,5×</option><option value="1">1×</option><option value="2">2×</option></select></div>
          </div>
          <div className="direction-hint"><span className={direction === 'down' ? 'direction-arrow down' : 'direction-arrow'}>{direction === 'down' ? '↶' : '↗'}</span>{playing ? (playbackDirection === 'down' ? 'Renaturierung läuft: Die Konzentration sinkt.' : 'Denaturierung läuft: Die Konzentration steigt.') : (direction === 'down' ? 'Die Konzentration wurde gesenkt – die Rückfaltung wird modelliert.' : 'Erhöhe die Konzentration oder starte die Renaturierung mit der zweiten Schaltfläche.')}</div>
        </section>

        <section className="science-grid">
          <div className="science-main">
            <div className="section-heading"><div className="eyebrow"><span>02</span> HINTERGRUNDWISSEN</div><h2>Was passiert im Protein?</h2></div>
            <div className="info-grid">
              <InfoSection title="Die vier Strukturebenen">
                <p><strong>Primärstruktur:</strong> die Aminosäuresequenz. Sie bleibt bei der hier betrachteten nicht reduzierenden Behandlung grundsätzlich erhalten.</p>
                <p><strong>Sekundärstruktur:</strong> lokale Muster der Polypeptidkette. α-Helices bilden eine Spirale, β-Faltblätter entstehen aus nebeneinanderliegenden Strängen, die durch Wasserstoffbrücken stabilisiert werden.</p>
                <p><strong>Tertiärstruktur:</strong> die gesamte dreidimensionale Faltung einer Polypeptidkette. Sie wird unter anderem durch hydrophobe Effekte, Wasserstoffbrücken, elektrostatische Wechselwirkungen und Disulfidbrücken stabilisiert.</p>
                <p><strong>Quartärstruktur:</strong> die räumliche Anordnung mehrerer Polypeptidketten. Das hier gezeigte Lysozym ist ein einzelnes Proteinmolekül mit einer Kette.</p>
              </InfoSection>
              <InfoSection title="Warum Guanidiniumchlorid?">
                <p>Guanidiniumchlorid (GdmCl bzw. GdnHCl) ist ein chaotropes Salz. Guanidinium-Ionen wechselwirken mit der Proteinoberfläche und verändern die energetische Balance, die die native Faltung stabilisiert. Bei ausreichend hoher Konzentration wird die entfaltete Konformation begünstigt.</p>
                <p>GdmCl ist nicht mit Natriumchlorid (NaCl) gleichzusetzen. Eine Studie an Lysozym berichtet, dass GdmCl die Aktivität bereits bei Konzentrationen unter 4 M stark beeinflussen kann, obwohl die gefaltete Struktur dabei noch nicht signifikant gestört sein muss.</p>
              </InfoSection>
              <InfoSection title="Renaturierung – der Rückweg">
                <p>Wird das Denaturierungsmittel entfernt oder verdünnt, kann das Protein unter geeigneten Bedingungen wieder in Richtung der nativen Faltung gelangen. Ob dies gelingt, hängt unter anderem von Temperatur, pH, Konzentration, Redoxbedingungen und Faltungs-Kinetik ab.</p>
                <p>Fehlfaltung und Aggregation können den Rückweg behindern. Die hier verwendete Referenz bleibt nicht reduziert; die vier Disulfidbrücken werden daher im Modell erhalten. Es wird kein willkürlicher irreversibler Verlustanteil angenommen.</p>
                <p>Eine publizierte Renaturierungsstudie mit GdmCl untersuchte reduziertes Lysozym. Ihre Ausbeuten sind nicht direkt auf dieses nicht reduzierte Modell übertragbar.</p>
              </InfoSection>
              <InfoSection title="Was zeigt das Modell – und was nicht?">
                <p>Die native Startkonformation stammt aus der experimentellen Röntgenstruktur 1LYZ. Beim Übergang wird das Cα-Rückgrat kontinuierlich in Richtung einer reproduzierbar erzeugten, ungeordneten Polymerkonformation verformt. Lokale Helix- und Faltblatt-Geometrien verlieren dabei stufenweise ihre Ordnung. Abstände entlang der Kette sowie native Cα-Paar- und Sγ–Sγ-Bindungsabstände der vier Disulfid-verknüpften Cysteinpaare werden in einem geometrischen Relaxationsschritt näherungsweise erhalten. Die Zwischenzustände sind didaktisch erzeugt und nicht experimentell bestimmt.</p>
                <p>Es wird keine Molekulardynamik berechnet und keine atomare Kraftfeld-Minimierung durchgeführt. Wassermoleküle, Ionen, atomare Wechselwirkungen und reale Faltungskinetik werden nicht simuliert. Die Rückfaltung ist die Umkehrung desselben reversiblen Lehrmodells; Aggregation und irreversible Ausbeuteverluste werden mangels passender Messparameter nicht künstlich ergänzt. Die Balken sind normalisierte Indizes; sie sind keine Messwerte in Prozent.</p>
              </InfoSection>
            </div>
          </div>
          <aside className="source-card panel">
            <div className="panel-kicker">WISSENSCHAFTLICHE BASIS</div>
            <h3>Quellen & Referenzen</h3>
            <ol>
              <li><a href="https://www.rcsb.org/structure/1LYZ" target="_blank" rel="noreferrer">RCSB Protein Data Bank · 1LYZ</a><span>Native Kristallstruktur · 2,00 Å</span></li>
              <li><a href="https://pubs.acs.org/doi/10.1021/acsomega.8b01911" target="_blank" rel="noreferrer">Contrasting Effects of Guanidinium Chloride and Urea on the Activity and Unfolding of Lysozyme</a><span>ACS Omega · 2018</span></li>
              <li><a href="https://pubmed.ncbi.nlm.nih.gov/12040421/" target="_blank" rel="noreferrer">Effect of Guanidinium Chloride Concentration on the Renaturation of Denatured Lysozyme</a><span>Acta Biochim. Biophys. Sin. · 2001</span></li>
              <li><a href="https://pubmed.ncbi.nlm.nih.gov/9312083/" target="_blank" rel="noreferrer">Kinetics of secondary structure recovery during refolding of reduced lysozyme</a><span>J. Biol. Chem. · 1997</span></li>
            </ol>
            <div className="source-caution">Achte auf unterschiedliche Versuchsbedingungen: insbesondere reduziertes vs. nicht reduziertes Lysozym.</div>
          </aside>
        </section>

        <footer className="footer"><span>MOLECULAR LAB · LEHRMODELL</span><span>Experimentelle Referenzstruktur: RCSB PDB 1LYZ · 129 Aminosäuren</span></footer>
      </main>
    </div>
  );
}
