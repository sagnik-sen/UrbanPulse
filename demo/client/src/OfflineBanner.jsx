import { useEffect, useState } from "react";
import { useFloodData } from "./FloodDataContext";

const STRINGS = {
  en: {
    banner: "Offline · showing information saved at {time} ({ago}). Shelter beds and alerts may have changed.",
    justNow: "just now",
    min: "{n} min ago",
    hours: "{n} h ago",
    matched: "This code matches an official alert this phone received earlier. It could not be re-checked on the blockchain while offline.",
    savedMessage: "Saved message:",
    unverified: "Cannot check while offline. Treat the message as unverified.",
  },
  ta: {
    banner: "இணைப்பு இல்லை · {time} மணிக்கு சேமிக்கப்பட்ட தகவல் காட்டப்படுகிறது ({ago}). முகாம் படுக்கைகளும் எச்சரிக்கைகளும் மாறியிருக்கலாம்.",
    justNow: "இப்போது",
    min: "{n} நிமிடங்களுக்கு முன்பு",
    hours: "{n} மணி நேரத்திற்கு முன்பு",
    matched: "இந்தக் குறியீடு இந்த தொலைபேசி முன்பு பெற்ற அதிகாரப்பூர்வ எச்சரிக்கையுடன் பொருந்துகிறது. ஆஃப்லைனில் இருப்பதால் பிளாக்செயினில் மீண்டும் சரிபார்க்க முடியவில்லை.",
    savedMessage: "சேமிக்கப்பட்ட செய்தி:",
    unverified: "ஆஃப்லைனில் சரிபார்க்க முடியவில்லை. இந்தச் செய்தியை உறுதிப்படுத்தப்படாததாகக் கருதுங்கள்.",
  },
};

const pick = (lang) => STRINGS[lang === "ta" ? "ta" : "en"];
const fill = (text, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, v), text);

// alert check text when the network is down; savedMessage is the matching alert saved on this phone
export function offlineCheckText(lang, savedMessage) {
  const s = pick(lang);
  return savedMessage ? `${s.matched} ${s.savedMessage} "${savedMessage}"` : s.unverified;
}

export default function OfflineBanner({ lang }) {
  const { offline, online, snapshotAt } = useFloodData();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  if (!snapshotAt || (!offline && online)) return null;

  const s = pick(lang);
  const mins = Math.round((now - snapshotAt) / 60000);
  const ago = mins < 1 ? s.justNow : mins < 60 ? fill(s.min, { n: mins }) : fill(s.hours, { n: Math.round(mins / 60) });
  const time = new Date(snapshotAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="c-status warning" role="status">
      <p className="small" style={{ margin: 0 }}>{fill(s.banner, { time, ago })}</p>
    </div>
  );
}
