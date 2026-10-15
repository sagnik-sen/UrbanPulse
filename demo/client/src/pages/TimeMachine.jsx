import { useEffect, useState } from "react";
import { useFloodData, formatIst } from "../FloodDataContext";

const SPEEDS = [10, 30, 60, 120]; // simulated minutes per 2-second tick
const TICK_SECONDS = 2;

// real time a full replay takes at a speed: simulated minutes of the event / simulated minutes per tick
const fullRunText = (hours, minutesPerTick) => `${((hours * 60) / minutesPerTick * TICK_SECONDS / 60).toFixed(1)} min`;

export default function TimeMachine() {
  const { timeMachine, broadcasts, fetchTimeMachine, startTimeMachine, stopTimeMachine } = useFloodData();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState("michaung-2023");
  const [speed, setSpeed] = useState(30);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // loaded once: the fetch function changes identity on every provider render
  useEffect(() => {
    fetchTimeMachine().then((d) => setEvents(d.events)).catch((err) => setError(err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const active = timeMachine.active;
  const shown = events.find((e) => e.id === (active ? timeMachine.event : eventId));
  const replayAlerts = broadcasts.filter((b) => b.source === "replay");

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Flood Time Machine</h2>
          <span className="muted small">Replays real past rainfall through the live alerts</span>
        </div>
        <p className="muted small" style={{ marginBottom: 12 }}>
          The replay feeds each hour of a past event's rainfall into the same zone model and alert rules as the live system. Its alerts are labelled [REPLAY] and sealed in the audit log like real ones. The rainfall is ERA5 reanalysis, which underestimates peak totals (see experiments/results/replay.md).
        </p>

        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="field">
              <span className="field-label">Event</span>
              <select className="input" value={active ? timeMachine.event : eventId} disabled={active} onChange={(e) => setEventId(e.target.value)}>
                {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Speed</span>
              <select className="input" value={speed} disabled={active} onChange={(e) => setSpeed(Number(e.target.value))}>
                {SPEEDS.map((s) => <option key={s} value={s}>{s} simulated min per 2 s</option>)}
              </select>
            </label>
            {shown && !active && <div className="muted small" style={{ marginBottom: 10 }}>A full replay takes about {fullRunText(shown.hours, speed)} at this speed.</div>}
            {error && <div className="form-error" role="alert">{error}</div>}
            {active ? (
              <button className="btn" disabled={busy} onClick={() => run(stopTimeMachine)}>{busy ? "Stopping…" : "Stop replay"}</button>
            ) : (
              <button className="btn" disabled={busy || !shown} onClick={() => run(() => startTimeMachine({ event: eventId, minutesPerTick: speed }))}>{busy ? "Starting…" : "Start replay"}</button>
            )}
          </div>

          <div>
            {shown && (
              <>
                <p className="small" style={{ marginBottom: 8 }}><strong>{shown.label}</strong>: flood day {shown.floodDay} IST; documented zones {shown.zones.join(", ")}.</p>
                <ul className="muted small" style={{ paddingLeft: 18 }}>
                  {shown.facts.map((f) => (
                    <li key={f.text} style={{ marginBottom: 4 }}>
                      {f.text}{f.source && <> <a href={f.source} target="_blank" rel="noreferrer">source</a></>}
                    </li>
                  ))}
                  {shown.release && <li>Documented release: {shown.release.cusecs.toLocaleString("en-IN")} cusecs from {shown.release.reservoir} at {shown.release.time.replace("T", " ")} IST; the replay issues it at that time.</li>}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>

      {active && (
        <section className="panel">
          <div className="panel-head">
            <h2>Replaying {timeMachine.name}</h2>
            <span className="muted small">{Math.round(timeMachine.progress * 100)}% · {timeMachine.minutesPerTick} simulated min per 2 s</span>
          </div>
          <div className="meter" role="meter" aria-valuenow={Math.round(timeMachine.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Replay progress">
            <div className="meter-fill" style={{ width: `${Math.round(timeMachine.progress * 100)}%`, background: "#b42318" }} />
          </div>
          <div style={{ marginTop: 10, fontWeight: 600 }}>{formatIst(timeMachine.currentTime)}</div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Replay Alerts</h2>
          <span className="muted small">Alerts issued during a replay, newest first</span>
        </div>
        {replayAlerts.length === 0 ? (
          <div className="empty">No replay alerts yet.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {replayAlerts.slice(0, 50).map((b) => (
              <li key={b.id} className="small" style={{ padding: "6px 0", borderBottom: "1px solid var(--border, #2c2c2a)" }}>
                <strong>{b.zoneName}</strong> · {b.severity} · <span className="mono">{b.code}</span>
                <div className="muted">{b.message}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
