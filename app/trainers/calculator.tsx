"use client";
import { useState } from "react";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export default function Calculator() {
  const [level, setLevel] = useState("Collegiate");
  const [rate, setRate] = useState(55);
  const [weeks, setWeeks] = useState(6);
  const [venue, setVenue] = useState("Free field");
  const cut = weeks >= 3 ? 12 : 15;
  const [sessions, setSessions] = useState(2);
  const [mix, setMix] = useState(50);
  const range = level === "Rising" ? [30, 45] : level === "Collegiate" ? [45, 75] : [75, 150];
  const fee = venue === "Free field" ? 0 : 175 / sessions * (venue === "Both" ? mix / 100 : 1);
  const keep = rate * (1 - cut / 100);
  return <><section className="alt" id="calc"><div className="wrap">
    <div className="sec-head"><div><div className="eyebrow">Earnings calculator</div><h2>See what you’d take home</h2></div><p>Move the sliders to see estimated earnings and what the client pays.</p></div>
    <div className="calc"><div className="calc-in">
      <div className="field"><span className="lbl">Your level</span><div className="seg">{["Rising", "Collegiate", "Elite"].map(l => <button key={l} aria-pressed={level === l} onClick={() => { setLevel(l); setRate(l === "Rising" ? 40 : l === "Collegiate" ? 55 : 95); }}>{l}</button>)}</div></div>
      <div className="field"><label htmlFor="calc-rate">Your session rate <output>{money(rate)}</output></label><input id="calc-rate" type="range" min={range[0]} max={range[1]} step="5" value={rate} onChange={e => setRate(+e.target.value)} /><span>{level} range: ${range[0]}–${range[1]}</span></div>
      <div className="field"><label htmlFor="calc-week">Sessions per week <output>{weeks}</output></label><input id="calc-week" type="range" min="1" max="25" value={weeks} onChange={e => setWeeks(+e.target.value)} /></div>
      <div className="field"><span className="lbl">Where you train</span><div className="seg">{["Free field", "Indoor / paid", "Both"].map(v => <button key={v} aria-pressed={venue === v} onClick={() => setVenue(v)}>{v}</button>)}</div></div>
      {venue !== "Free field" && <div className="field"><label htmlFor="calc-block">Sessions in a two-hour block <output>{sessions}</output></label><input id="calc-block" type="range" min="1" max="6" value={sessions} onChange={e => setSessions(+e.target.value)} /></div>}
      {venue === "Both" && <div className="field"><label htmlFor="calc-mix">Indoor sessions <output>{mix}%</output></label><input id="calc-mix" type="range" min="10" max="90" step="10" value={mix} onChange={e => setMix(+e.target.value)} /></div>}
    </div><div className="calc-out" aria-live="polite"><div><div className="eyebrow">You take home per month</div><div className="out-big">{money(keep * weeks * 52 / 12).replace(/\.00$/, "")}</div><p>{weeks} sessions a week at {money(rate)}, keeping {100 - cut}%</p></div><div className="split-bar" aria-hidden="true"><i style={{ width: `${keep / (rate + fee) * 100}%`, background: "#4cc38a" }} /><i style={{ width: `${(rate - keep) / (rate + fee) * 100}%`, background: "var(--accent)" }} /><i style={{ flex: 1, background: "#8fa2c4" }} /></div><div className="out-rows"><div><span>You keep per session</span><b>{money(keep)}</b></div><div><span>Aldrich per session</span><b>{money(rate - keep)}</b></div>{fee > 0 && <div><span>Estimated venue fee{venue === "Both" ? " (average)" : ""}</span><b>{money(fee)}</b></div>}<div><span>Client pays{venue === "Both" ? " on average" : " per session"}</span><b>{money(rate + fee)}</b></div></div></div></div>
    <p className="same-cut">Estimates, not a guarantee of bookings or income. Indoor examples use a $175 two-hour rental block; actual venue fees are set separately. The estimate automatically uses a 12% Aldrich fee at three or more sessions per week, and 15% below that.</p>
  </div></section><section><div className="wrap"><div className="sec-head"><div><div className="eyebrow">Paid facilities</div><h2>Fill your block, lower the fee</h2></div><p>Venue fees cover the rental and are added to the client’s price. They never come out of your session earnings.</p></div><div className="promise">{[1, 2, 3, 4].map(n => <div key={n}><span className="step-label">{n} session{n > 1 ? "s" : ""} in the block</span><h3>{money(175 / n)}</h3><p>Example venue fee per session</p></div>)}</div></div></section></>;
}
