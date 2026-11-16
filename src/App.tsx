import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ProteinViewer } from './components/ProteinViewer';
import { getConcentrationCurve, getIndicators, getIrreversibleThresholdConcentration, getStructureState, hasCrossedIrreversibleThreshold } from './lib/model';
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

function ConcentrationChart({ concentration, unfoldedIndex, irreversible, onConcentrationChange }: { concentration: number; unfoldedIndex: number; irreversible: boolean; onConcentrationChange: (value: number) => void }) {
  const curve = useMemo(() => getConcentrationCurve(), []);
  const activePointer = useRef<number | null>(null);
  const width = 520;
  const height = 170;
  const left = 54;
  const right = 12;
  const top = 14;
  const bottom = 29;
  const x = (c: number) => left + (c / 8) * (width - left - right);
  const y = (v: number) => top + (1 - v) * (height - top - bottom);
  const path = curve.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.concentration).toFixed(1)} ${y(point.index).toFixed(1)}`).join(' ');
  const threshold = getIrreversibleThresholdConcentration();
  const updateFromPointer = (event: ReactPointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    const fraction = Math.max(0, Math.min(1, (svgX - left) / (width - left - right)));
    onConcentrationChange(Number((fraction * 8).toFixed(2)));
  };
  const handlePointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };
  const handlePointerMove = (event: ReactPointerEvent<SVGRectElement>) => {
    if (activePointer.current === event.pointerId) updateFromPointer(event);
  };
  const handlePointerEnd = (event: ReactPointerEvent<SVGRectElement>) => {
    if (activePointer.current === event.pointerId) activePointer.current = null;
  };
  const handleSliderKeyDown = (event: ReactKeyboardEvent<SVGRectElement>) => {
    const step = event.shiftKey ? 0.5 : 0.1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onConcentrationChange(Math.max(0, Number((concentration - step).toFixed(2))));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onConcentrationChange(Math.min(8, Number((concentration + step).toFixed(2))));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onConcentrationChange(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onConcentrationChange(8);
    }
  };
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Interaktive Modellkurve: Ziehe den gelben Marker, um die Guanidiniumchlorid-Konzentration zu ändern.">
        <rect x={x(threshold)} y={top} width={width - right - x(threshold)} height={height - top - bottom} className="chart-threshold-zone" />
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
        <rect
          x={left} y={top} width={width - left - right} height={height - top - bottom}
          className="chart-hit-area"
          role="slider" tabIndex={0} focusable="true"
          aria-label="Guanidiniumchlorid-Konzentration über die Übergangskurve einstellen"
          aria-valuemin={0} aria-valuemax={8} aria-valuenow={concentration}
          aria-valuetext={`${concentration.toFixed(2).replace('.', ',')} mol pro Liter`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
          onKeyDown={handleSliderKeyDown}
        />
        <line x1={x(threshold)} x2={x(threshold)} y1={top} y2={height - bottom} className="chart-threshold chart-overlay" />
        <line x1={x(concentration)} x2={x(concentration)} y1={top} y2={height - bottom} className="chart-cursor" />
        <circle cx={x(concentration)} cy={y(unfoldedIndex)} r="11" className={`chart-dot-halo${irreversible ? ' chart-dot-halo-irreversible' : ''}`} />
        <circle cx={x(concentration)} cy={y(unfoldedIndex)} r="6" className={`chart-dot${irreversible ? ' chart-dot-irreversible' : ''}`} pointerEvents="none" />
        <text x="13" y={(top + height - bottom) / 2} textAnchor="middle" transform={`rotate(-90 13 ${(top + height - bottom) / 2})`} className="chart-axis-title">Entfaltungsindex</text>
        <text x={(left + width - right) / 2} y={height - 1} textAnchor="middle" className="chart-axis-title">GdmCl (mol/L)</text>
      </svg>
      <div className="chart-footnote"><span>{irreversible ? 'Lila Marker · irreversible Schwelle überschritten' : 'Gelben Marker ziehen'}</span><span>Modellgrenze bei {threshold.toFixed(1).replace(".", ",")} M</span></div>
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
  const [showIons, setShowIons] = useState(true);
  const [showHydrogenBonds, setShowHydrogenBonds] = useState(true);
  const [peakConcentration, setPeakConcentration] = useState(0);
  const [model, setModel] = useState<ProteinModel | null>(null);
  const [structureError, setStructureError] = useState('');
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const indicators = useMemo(() => getIndicators(concentration, peakConcentration), [concentration, peakConcentration]);
  const structureState = getStructureState(concentration, indicators.unfolded, direction, indicators.trapped);

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
    setPeakConcentration((peak) => Math.max(peak, concentration));
  }, [concentration]);

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

  function updateConcentration(value: number) {
    setPlaying(false);
    setConcentration(Math.max(0, Math.min(8, Number(value.toFixed(2)))));
  }

  function reset() {
    setPlaying(false);
    setConcentration(0);
    setPeakConcentration(0);
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

  const statusClass = indicators.trapped > 0.06 || indicators.unfolded > 0.72 ? 'status-warm' : indicators.unfolded > 0.13 ? 'status-mid' : 'status-cool';
  const statusLabel = indicators.trapped > 0.06 && concentration < getIrreversibleThresholdConcentration()
    ? 'KINETISCH GEFANGEN'
    : indicators.unfolded > 0.72 ? 'UNGEORDNET' : indicators.unfolded > 0.13 ? 'IM ÜBERGANG' : 'GEORDNET';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-label="MG Possible Lab">
            <svg className="brand-logo" viewBox="0 0 100 100" role="img" aria-label="MG">
              <defs>
                <linearGradient id="mg-logo-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#11e5d2" />
                  <stop offset="48%" stopColor="#32bfe0" />
                  <stop offset="100%" stopColor="#6577ee" />
                </linearGradient>
              </defs>
              <path className="brand-logo-frame" d="M10 10 H90 V90 H51 M10 10 V50" />
              <text className="brand-logo-letters" x="50" y="63" textAnchor="middle">MG</text>
            </svg>
          </div>
          <div><div className="brand-name">MG Possible Lab</div><div className="brand-subtitle">Proteindynamik</div></div>
        </div>
        <div className="topbar-right">
          <span className="topbar-chip"><i /> Interaktives Experiment</span>
        </div>
      </header>

      <main className="page-content">
        <section className="intro-row">
          <div>
            <h1>Wenn Proteine<br /><em>ihre Form verlieren.</em></h1>
            <p className="intro-copy">Erkunde, am Beispiel von Guanidiniumchlorid wie Salze die räumliche Struktur von Proteinen (hier: Hühnereiweiß-Lysozym) dauerhaft oder reversibel verändern können – und wie sie sich die Proteinkette beim Verdünnen unter Umständen (um-)ordnen können.</p>
          </div>
          <div className="conditions-card">
            <div className="conditions-heading">VERSUCHSBEDINGUNGEN</div>
            <div className="conditions-grid">
              {/* Platzhalter-Links: href später mit den passenden Versuchsquellen befüllen. */}
              <a className="condition-link" href="#" onClick={(event) => event.preventDefault()} title="Referenzlink Temperatur – Ziel später ergänzen"><span>Temperatur</span><strong>20 °C</strong></a>
              <a className="condition-link" href="#" onClick={(event) => event.preventDefault()} title="Referenzlink pH-Wert – Ziel später ergänzen"><span>pH-Wert</span><strong>4,5</strong></a>
              <a className="condition-link" href="#" onClick={(event) => event.preventDefault()} title="Referenzlink Protein – Ziel später ergänzen"><span>Protein</span><strong>HEWL · 129 AS</strong></a>
            </div>
          </div>
        </section>

        <section className="experiment-grid">
          <article className="viewer-card panel">
            <div className="panel-heading">
              <div><div className="panel-kicker">MOLEKÜLANSICHT</div><h2>Lysozym · 3D-Struktur</h2></div>
            </div>
            <ProteinViewer
              model={model}
              onReset={reset}
              unfolded={indicators.reversible}
              trapped={indicators.trapped}
              irreversible={hasCrossedIrreversibleThreshold(peakConcentration)}
              concentration={concentration}
              compare={compare}
              showHelices={showHelices}
              showSheets={showSheets}
              showDisulfides={showDisulfides}
              showIons={showIons}
              showHydrogenBonds={showHydrogenBonds}
            />
            <div className="legend-row">
              <span><i className="legend-dot helix" /> α-Helix</span>
              <span><i className="legend-dot sheet" /> β-Faltblatt</span>
              <span><i className="legend-dot loop" /> Schleife</span>
              <span><i className="legend-dot disulfide" /> Disulfidbrücken</span>
              <span><i className="legend-dot ion-gdm" /> Gdm⁺</span>
              <span><i className="legend-dot ion-cl" /> Cl⁻</span>
              <span><i className="legend-line hbond" /> H-Brücken</span>
            </div>
            <div className="viewer-options" aria-label="Einblendungen der Proteinstruktur">
              <label className="switch-label"><input type="checkbox" checked={showHelices} onChange={(event) => setShowHelices(event.target.checked)} /> Helices</label>
              <label className="switch-label"><input type="checkbox" checked={showSheets} onChange={(event) => setShowSheets(event.target.checked)} /> β-Faltblätter</label>
              <label className="switch-label"><input type="checkbox" checked={showDisulfides} onChange={(event) => setShowDisulfides(event.target.checked)} /> Disulfidbrücken</label>
              <label className="switch-label"><input type="checkbox" checked={showIons} onChange={(event) => setShowIons(event.target.checked)} /> Ionen</label>
              <label className="switch-label"><input type="checkbox" checked={showHydrogenBonds} onChange={(event) => setShowHydrogenBonds(event.target.checked)} /> H-Brücken</label>
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
              <div className="state-title-row"><h2>{structureState}</h2><span className={`status-pill ${statusClass}`}>{statusLabel}</span></div>
              <p className="state-explanation">
                {indicators.trapped > 0.06 && concentration < getIrreversibleThresholdConcentration()
                  ? 'Die Konzentration wurde wieder gesenkt, aber ein kinetisch gefangener Anteil bleibt fehlgefaltet. Die native Ausgangsform wird in diesem Modell nicht vollständig erreicht.'
                  : indicators.unfolded < 0.13
                    ? 'Die native Faltung ist im Modell weitgehend erhalten. Helices, Faltblätter und Tertiärstruktur sind geordnet.'
                    : direction === 'down'
                      ? 'Die Konzentration sinkt. Der reversible Anteil bewegt sich zurück in Richtung der nativen Struktur.'
                      : 'Mit zunehmender GdmCl-Konzentration verliert die Kette schrittweise ihre kompakte räumliche Organisation.'}
              </p>
              <div className="state-stat"><span>Modellierter Entfaltungsindex</span><strong>{percent(indicators.unfolded)}</strong></div>
              <div className="state-track"><span style={{ width: `${indicators.unfolded * 100}%` }} /></div>
              <div className="state-track-labels"><span>nativ</span><span>entfaltet</span></div>
            </article>

            <article className="metrics-card panel">
              <div className="panel-heading compact"><div><div className="panel-kicker">STRUKTUR-ANALYSE</div><h2>Modellindikatoren</h2></div></div>
              <MetricBar label="Index nativer Struktur" value={indicators.native} color="#61cfc9" />
              <MetricBar label="Index entfalteter Struktur" value={indicators.unfolded} color="#db8c65" />
              <MetricBar label="Erhalt der α-Helixstruktur" value={indicators.helixRetention} color="#55c9d3" />
              <MetricBar label="Erhalt der β-Faltblattstruktur" value={indicators.sheetRetention} color="#eab95f" />
              <MetricBar label="Gesamtindex struktureller Ordnung" value={indicators.order} color="#9aaec2" />
              <MetricBar label="Kinetisch gefangener Anteil" value={indicators.trapped} color="#b48cff" />
              <div className="metrics-note">Alle Balken sind normalisierte didaktische Modellindizes (0–100), keine experimentell gemessenen Prozentanteile. Beim Überschreiten der markierten Modellgrenze bleibt ein Teil der Kette in einer alternativen, kinetisch gefangenen Konformation.</div>
            </article>

            <article className="chart-card panel">
              <div className="panel-heading compact"><div><div className="panel-kicker">KONZENTRATION · STRUKTUR</div><h2>Übergangskurve</h2></div></div>
              <ConcentrationChart concentration={concentration} unfoldedIndex={indicators.unfolded} irreversible={hasCrossedIrreversibleThreshold(peakConcentration)} onConcentrationChange={updateConcentration} />
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
              onChange={(event) => updateConcentration(Number(event.target.value))}
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
          <div className="direction-hint"><span className={direction === 'down' ? 'direction-arrow down' : 'direction-arrow'}>{direction === 'down' ? '↶' : '↗'}</span>{indicators.trapped > 0.06 && concentration < getIrreversibleThresholdConcentration() ? 'Die Modellgrenze wurde überschritten: Ein Teil bleibt kinetisch gefangen und erreicht den nativen Zustand nicht mehr. Reset startet ein neues Experiment.' : playing ? (playbackDirection === 'down' ? 'Renaturierung läuft: Die Konzentration sinkt.' : 'Denaturierung läuft: Die Konzentration steigt.') : (direction === 'down' ? 'Die Konzentration wurde gesenkt – der reversible Anteil faltet sich zurück.' : 'Erhöhe die Konzentration oder starte die Renaturierung mit der zweiten Schaltfläche.')}</div>
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
                <p>Guanidiniumchlorid (GdmCl bzw. GdnHCl) zerfällt in Guanidinium-Kationen (Gdm⁺) und Chlorid-Anionen (Cl⁻). Gdm⁺ kann sich an der Proteinoberfläche anreichern, besonders in der Nähe negativ geladener oder planarer Seitenketten. Außerdem kann es mit Peptid-Carbonylgruppen wechselwirken und dadurch die Wasserstoffbrücken-Balance des Rückgrats verändern.</p>
                <p>Cl⁻ ist das Gegenion und bleibt in GdmCl-Lösungen überwiegend in der Lösung; es wird daher hier nicht als gleichwertig stark proteinbindender Partner dargestellt. Die Ansicht zeigt Cl⁻-Ionen im Lösungsmittelbereich und Gdm⁺-Ionen schematisch nahe ausgewählter Protein-Kontaktstellen. Die dargestellten Teilchen sind keine zeitaufgelöste Ionendynamik.</p>
                <p>GdmCl ist nicht mit Natriumchlorid (NaCl) gleichzusetzen. Es kann native Wasserstoffbrücken und elektrostatische Kontakte destabilisieren. Aktivitätsverlust und vollständige strukturelle Entfaltung sind dabei nicht dasselbe.</p>
              </InfoSection>
              <InfoSection title="Renaturierung – der Rückweg">
                <p>Wird GdmCl entfernt oder verdünnt, kann ein Protein unter geeigneten Bedingungen seine native Faltung zurückgewinnen. Die Rückfaltung konkurriert jedoch mit kinetischen Zwischenzuständen und intermolekularer Aggregation. Deshalb muss eine Verringerung der Salzkonzentration nicht automatisch zur ursprünglichen Struktur führen.</p>
                <p>In diesem Lehrmodell beginnt oberhalb der markierten Übergangsgrenze ein kinetisch gefangener Anteil anzuwachsen. Beim Verdünnen faltet sich nur der reversible Anteil zurück; der gefangene Anteil bleibt in einer alternativen Konformation. Die Grenze ist eine didaktische Modellannahme und keine universelle oder experimentell bestimmte Denaturierungsschwelle von Lysozym.</p>
                <p>Eine publizierte Renaturierungsstudie mit GdmCl untersuchte reduziertes Lysozym. Ihre Ausbeuten sind nicht direkt auf dieses nicht reduzierte Modell übertragbar.</p>
              </InfoSection>
              <InfoSection title="Was zeigt das Modell – und was nicht?">
                <p>Die native Startkonformation stammt aus der experimentellen Röntgenstruktur 1LYZ. Aus den PDB-Atomkoordinaten werden ausgewählte Backbone-Wasserstoffbrücken zwischen Carbonyl-O und Amid-N sowie die vier nativen Disulfidverknüpfungen an ihren tatsächlichen Cystein-Positionen abgeleitet. Die Wasserstoffbrücken-Kontakte verblassen mit zunehmender GdmCl-Konzentration; die kovalenten Disulfidbrücken bleiben im nicht reduzierten Modell erhalten. Gdm⁺-Teilchen erscheinen schematisch nahe ausgewählter saurer Seitenketten und Carbonylgruppen; Cl⁻-Teilchen werden im umgebenden Lösungsmittelbereich gezeigt.</p>
                <p><strong>Warum pH 4,5 und 20 °C?</strong> Das sind feste Referenzbedingungen dieses Lehrmodells, nicht aus dem PDB-Eintrag 1LYZ abgelesene Messbedingungen. 20 °C dient als moderate Raumtemperatur, damit in der Simulation vor allem der Einfluss von GdmCl und nicht eine zusätzliche Wärmeentfaltung betrachtet wird. pH 4,5 legt ein leicht saures Milieu fest und beeinflusst die Protonierung und damit die Ladung einzelner Seitenketten. Der Wert liegt nahe pH 5,0, bei dem für hoch konzentriertes Hühnereiweiß-Lysozym eine hohe thermische Stabilität berichtet wurde; diese Beobachtung ist jedoch an die dortigen Versuchsbedingungen gebunden. Andere pH-Werte und Temperaturen können das Verhalten verändern.</p>
                <p>Die Ionenteilchen sind keine zeitaufgelöste Ionenverteilung. Der Kontaktverlust, die Entfaltungs-Zwischenzustände und die kinetische Trappung sind didaktische Modellierungen; es wird keine Molekulardynamik berechnet und keine atomare Kraftfeld-Minimierung durchgeführt. Die native Sekundärstruktur stammt aus 1LYZ, alle Balken sind normalisierte Modellindizes und keine experimentell gemessenen Prozentwerte.</p>
              </InfoSection>
            </div>
          </div>
          <aside className="source-card panel">
            <div className="panel-kicker">WISSENSCHAFTLICHE BASIS</div>
            <h3>Quellen & Referenzen</h3>
            <ol>
              <li><a href="https://www.rcsb.org/structure/1LYZ" target="_blank" rel="noreferrer">RCSB Protein Data Bank · 1LYZ</a><span>Native Kristallstruktur · 2,00 Å</span></li>
              <li><a href="https://www.rcsb.org/sequence/1LYZ" target="_blank" rel="noreferrer">RCSB · 1LYZ Sequenz und Annotationen</a><span>Kette A · 129 Aminosäuren</span></li>
              <li><a href="https://pubmed.ncbi.nlm.nih.gov/11034323/" target="_blank" rel="noreferrer">Native Disulfid-Konnektivität von Hühnereiweiß-Lysozym</a><span>FEBS Letters · 2000 · Cys 6–127, 30–115, 64–80 und 76–94</span></li>
              <li><a href="https://pubs.acs.org/doi/10.1021/acsomega.8b01911" target="_blank" rel="noreferrer">Contrasting Effects of Guanidinium Chloride and Urea on the Activity and Unfolding of Lysozyme</a><span>ACS Omega · 2018</span></li>
              <li><a href="https://doi.org/10.1021/ct3002267" target="_blank" rel="noreferrer">Counterion Effects on the Denaturing Activity of Guanidinium Cation to Protein</a><span>J. Chem. Theory Comput. · 2012 · Mechanistische Einordnung, nicht 1LYZ-spezifisch</span></li>
              <li><a href="https://pubmed.ncbi.nlm.nih.gov/12040421/" target="_blank" rel="noreferrer">Effect of Guanidinium Chloride Concentration on the Renaturation of Denatured Lysozyme</a><span>Acta Biochim. Biophys. Sin. · 2001</span></li>
              <li><a href="https://pubmed.ncbi.nlm.nih.gov/9312083/" target="_blank" rel="noreferrer">Kinetics of secondary structure recovery during refolding of reduced lysozyme</a><span>J. Biol. Chem. · 1997</span></li>
            </ol>
            <div className="source-caution">Achte auf unterschiedliche Versuchsbedingungen: insbesondere reduziertes vs. nicht reduziertes Lysozym.</div>
          </aside>
        </section>

        <footer className="footer"><span>MG POSSIBLE LAB</span></footer>
      </main>
    </div>
  );
}
