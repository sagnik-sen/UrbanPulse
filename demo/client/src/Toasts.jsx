import { Link } from "react-router-dom";
import { useFloodData } from "./FloodDataContext";

export default function Toasts({ showLinks = true, kinds }) {
  const { toasts: all, dismissToast } = useFloodData();
  const toasts = kinds ? all.filter((t) => kinds.includes(t.kind)) : all;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            <div className="toast-text">{t.text}</div>
            {showLinks && t.link && <Link to={t.link} className="link" onClick={() => dismissToast(t.id)}>View →</Link>}
          </div>
          <button className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
