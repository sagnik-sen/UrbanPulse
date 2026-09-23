import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import { useFloodData } from "../FloodDataContext";
import { STATUS, ZONE_COLOR } from "../constants";

export default function Analytics() {
  const { locations, trend } = useFloodData();

  const ranked = useMemo(
    () => [...locations].sort((a, b) => b.level - a.level),
    [locations]
  );

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Current Water Level by Zone</h2>
          <span className="muted small">Ranked, colored by risk status</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={ranked} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 0 }}>
            <CartesianGrid stroke="#2c2c2a" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} stroke="#898781" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" stroke="#898781" tick={{ fontSize: 11 }} width={140} />
            <Tooltip contentStyle={{ background: "#1a1a19", border: "1px solid #2c2c2a", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="level" radius={[0, 4, 4, 0]}>
              {ranked.map((loc) => <Cell key={loc.id} fill={STATUS[loc.risk].color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="legend-row">
          {Object.entries(STATUS).map(([key, s]) => (
            <span key={key} className="legend-chip"><span className="badge-dot" style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>City-Wide Water Level Trend — Extended</h2>
          <span className="muted small">Last {trend.length} readings, all zones</span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={trend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#2c2c2a" vertical={false} />
            <XAxis dataKey="time" stroke="#898781" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis domain={[0, 100]} stroke="#898781" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1a1a19", border: "1px solid #2c2c2a", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#c3c2b7" }} />
            {locations.map((loc) => (
              <Line key={loc.id} type="monotone" dataKey={loc.id} name={loc.name} stroke={ZONE_COLOR[loc.id]} dot={false} strokeWidth={2} />
            ))}
            <Line type="monotone" dataKey="avg" name="City Average" stroke="#ffffff" strokeDasharray="5 3" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </>
  );
}
