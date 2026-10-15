import { useEffect, useRef, useState } from "react";

// Reads an alert aloud with the browser's own voices (Web Speech API); nothing is sent over the network.
const TEXT = {
  en: { listen: "🔊 Listen", stop: "⏹ Stop", noTamil: "No Tamil voice on this phone; reading in English." },
  ta: { listen: "🔊 கேளுங்கள்", stop: "⏹ நிறுத்து", noTamil: "இந்தத் தொலைபேசியில் தமிழ்க் குரல் இல்லை; ஆங்கிலத்தில் வாசிக்கப்படுகிறது." },
};

const KIND_TA = { danger: "வெள்ள ஆபத்து எச்சரிக்கை", other: "வெள்ள எச்சரிக்கை" };
const AUTO_WINDOW_MS = 60_000;

// alerts already read aloud on this page load, so re-renders and remounts do not repeat them
const readAloud = new Set();

const VERIFY = /\s*Verify:\s*(UP-[0-9A-F]{8})\s*$/i;

function splitMessage(text) {
  const m = text.match(VERIFY);
  return m ? { body: text.slice(0, m.index), code: m[1] } : { body: text, code: null };
}

function byLang(voices, prefix) {
  return voices.find((v) => (v.lang || "").replace("_", "-").toLowerCase().startsWith(prefix.toLowerCase()));
}

// voices load asynchronously in some browsers, so wait for voiceschanged (or give up after a second)
function whenVoices(synth, fn) {
  if (synth.getVoices().length) return fn(synth.getVoices());
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    synth.removeEventListener("voiceschanged", go);
    fn(synth.getVoices());
  };
  synth.addEventListener("voiceschanged", go);
  setTimeout(go, 1000);
}

// Tamil requests get a Tamil preamble; the English alert text itself is read by an English voice
function tamilPreamble(alert) {
  const kind = KIND_TA[alert.severity === "danger" ? "danger" : "other"];
  return alert.zoneId === "all" ? `சென்னை முழுவதற்கும் ${kind}` : `${alert.zoneName} பகுதிக்கு ${kind}`;
}

export default function SpeakAlert({ text, lang = "en", alert, auto = false }) {
  const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState("");
  const speaking = useRef(false);
  const queue = useRef([]);

  const finish = () => {
    speaking.current = false;
    setPlaying(false);
  };

  const stop = () => {
    synth?.cancel();
    finish();
  };

  // a manual click replaces whatever is being read; an automatic read queues behind it so no alert is lost
  const speak = (queueOnly = false) => {
    if (!synth) return;
    const tamil = lang === "ta";
    const { body, code } = splitMessage(text);
    if (!queueOnly) synth.cancel();
    whenVoices(synth, (voices) => {
      const englishVoice = byLang(voices, "en-IN") ?? byLang(voices, "en");
      const tamilVoice = tamil ? byLang(voices, "ta") : null;
      const parts = [];
      if (tamil && tamilVoice && alert) parts.push([tamilPreamble(alert), tamilVoice, 1]);
      parts.push([body, englishVoice, 1]);
      if (code) parts.push([`Verification code U P, ${code.slice(3).split("").join(" ")}`, englishVoice, 0.7]);

      setNote(tamil && !tamilVoice ? TEXT[lang].noTamil : "");
      queue.current = parts.map(([s, voice, rate], i) => {
        const u = new SpeechSynthesisUtterance(s);
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        }
        u.rate = rate;
        if (i === parts.length - 1) u.onend = u.onerror = finish;
        return u;
      });
      queue.current.forEach((u) => synth.speak(u));
      speaking.current = true;
      setPlaying(true);
    });
  };

  // a danger alert that arrived while the citizen has read-aloud on is read once
  useEffect(() => {
    if (!auto || !alert || alert.severity !== "danger" || Date.now() - alert.ts > AUTO_WINDOW_MS) return;
    if (readAloud.has(alert.id)) return;
    readAloud.add(alert.id);
    try {
      speak(true);
    } catch {
      // speech refused (no user gesture yet, or unsupported): stay silent
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  // leaving the page should not leave a reading going on
  useEffect(() => () => { if (speaking.current) synth?.cancel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!synth) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" className="link-btn" onClick={playing ? stop : () => speak()}>{playing ? TEXT[lang].stop : TEXT[lang].listen}</button>
      {note && <span className="muted small" role="status" style={{ marginLeft: 10 }}>{note}</span>}
    </div>
  );
}
