import { useState } from "react";

// Plain-language "Why this alert?" from the machine-readable reason stored with each alert.
// Numbers and codes are never translated; only the wording around them is.
const STRINGS = {
  en: { why: "Why this alert?", sealed: "This explanation is sealed on the blockchain with the alert." },
  ta: { why: "இந்த எச்சரிக்கை ஏன்?", sealed: "இந்த விளக்கமும் எச்சரிக்கையுடன் பிளாக்செயினில் பதிவு செய்யப்பட்டுள்ளது." },
};

const RAIN_WORD = {
  en: { heavy: "heavy rain", veryHeavy: "very heavy rain", extremelyHeavy: "extremely heavy rain" },
  ta: { heavy: "கனமழை", veryHeavy: "மிக கனமழை", extremelyHeavy: "அதி கனமழை" },
};
const ROLE_NAME = {
  en: { admin: "administrator", officer: "officer" },
  ta: { admin: "நிர்வாகி", officer: "அதிகாரி" },
};

const cusecs = (n) => Number(n).toLocaleString("en-US");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// one entry per rule; each returns the sentences shown for that alert
const RULES = {
  level: {
    en: (r) => [
      `The water-level sensor in ${r.zone} read ${r.level}%, above the danger line of ${r.danger}%.`,
      ...(r.rain24hMm != null ? [`${Math.round(r.rain24hMm)} mm of rain fell here in the last 24 hours.`] : []),
      ...(r.forecastHours > 0 ? [`Forecast: the level reaches the danger line in about ${plural(r.forecastHours, "hour", "hours")}.`] : []),
    ],
    ta: (r) => [
      `${r.zone} பகுதியின் நீர்மட்ட உணரி ${r.level}% காட்டியது; இது அபாய எல்லையான ${r.danger}%-க்கு மேல்.`,
      ...(r.rain24hMm != null ? [`இந்தப் பகுதியில் கடந்த 24 மணி நேரத்தில் ${Math.round(r.rain24hMm)} மிமீ மழை பெய்துள்ளது.`] : []),
      ...(r.forecastHours > 0 ? [`முன்னறிவிப்பு: அபாய எல்லையை சுமார் ${r.forecastHours} மணி நேரத்தில் அடையும்.`] : []),
    ],
  },
  "imd-observed": {
    en: (r) => [`${Math.round(r.mm)} mm of rain fell here in the last 24 hours. The India Meteorological Department calls ${r.threshold} mm or more '${RAIN_WORD.en[r.category]}'.`],
    ta: (r) => [`இங்கு கடந்த 24 மணி நேரத்தில் ${Math.round(r.mm)} மிமீ மழை பெய்துள்ளது. இந்திய வானிலை ஆய்வு மையம் ${r.threshold} மிமீ அல்லது அதற்கு மேல் மழையை '${RAIN_WORD.ta[r.category]}' என்கிறது.`],
  },
  "imd-forecast": {
    en: (r) => [`Rain forecast here for the next 24 hours: ${Math.round(r.mm)} mm. The India Meteorological Department calls ${r.threshold} mm or more '${RAIN_WORD.en[r.category]}'.`],
    ta: (r) => [`அடுத்த 24 மணி நேரத்தில் இங்கு ${Math.round(r.mm)} மிமீ மழை கணிக்கப்பட்டுள்ளது. இந்திய வானிலை ஆய்வு மையம் ${r.threshold} மிமீ அல்லது அதற்கு மேல் மழையை '${RAIN_WORD.ta[r.category]}' என்கிறது.`],
  },
  manual: {
    en: (r) => [`Issued by a control-room ${ROLE_NAME.en[r.role] ?? "operator"}.`],
    ta: (r) => [`கட்டுப்பாட்டு அறை ${ROLE_NAME.ta[r.role] ?? "ஊழியர்"} ஒருவரால் வெளியிடப்பட்டது.`],
  },
  "evacuation-order": {
    en: (r) => [`Ordered by the control room. ${plural(r.people, "person", "people")} from this area are assigned to ${r.shelters.join(" and ")}.`],
    ta: (r) => [`கட்டுப்பாட்டு அறையால் வெளியேற்ற உத்தரவு பிறப்பிக்கப்பட்டது. இப்பகுதியிலிருந்து ${r.people} பேர் தங்குமிடங்களுக்கு ஒதுக்கப்பட்டுள்ளனர்: ${r.shelters.join(" மற்றும் ")}.`],
  },
  "reservoir-release": {
    en: (r) => [`${cusecs(r.cusecs)} cusecs is being released from ${r.reservoir} for ${plural(r.durationHours, "hour", "hours")}. The ${r.river} river will rise.`],
    ta: (r) => [`${r.reservoir}-இலிருந்து வினாடிக்கு ${cusecs(r.cusecs)} கனஅடி நீர் ${r.durationHours} மணி நேரத்திற்கு திறந்துவிடப்படுகிறது. ${r.river} ஆற்றின் நீர்மட்டம் உயரும்.`],
  },
};

// the sentences for an alert's reason, in one language; [] when there is no reason to explain.
// sealed adds the blockchain line, for the verified check result only.
export function explainReason(reason, lang, sealed = false) {
  const rule = reason && RULES[reason.rule];
  if (!rule) return [];
  const l = lang === "ta" ? "ta" : "en";
  const lines = rule[l](reason);
  return sealed ? [...lines, STRINGS[l].sealed] : lines;
}

export default function AlertReason({ reason, lang, sealed = false }) {
  const [open, setOpen] = useState(false);
  const l = lang === "ta" ? "ta" : "en";
  const lines = explainReason(reason, l, sealed);
  if (lines.length === 0) return null;
  return (
    <div className="muted small" style={{ marginTop: 6 }}>
      <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{STRINGS[l].why}</button>
      {open && lines.map((line, i) => <p key={i} style={{ margin: "6px 0 0" }}>{line}</p>)}
    </div>
  );
}
