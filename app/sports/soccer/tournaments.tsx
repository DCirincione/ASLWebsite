"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import type { Soccer } from "@/lib/supabase/types";

type SoccerCard = Soccer & { image?: string };

const fallbackTournaments: SoccerCard[] = [
  {
    id: "t1",
    title: "Summer Cup",
    type: "tournament",
    start_date: "2026-07-12",
    time_info: "Group stage",
    location: "Aldrich Complex",
    description: "Weekend tournament with pool play into knockouts.",
    cta_label: "View details",
    cta_url: "/events",
    level: "Open / Coed",
    image_url: "/forever5/newman5.png",
  },
];

const imageFallbacks = ["/forever5/newman5.png", "/PickleTourneyCourt6.png"];

export function SoccerTournaments() {
  const [items, setItems] = useState<SoccerCard[]>(fallbackTournaments);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("soccer")
        .select("id,title,type,start_date,end_date,time_info,location,description,cta_label,cta_url,image_url,level")
        .eq("type", "tournament")
        .order("start_date", { ascending: true, nullsFirst: false });
      if (!error && data) {
        const mapped = (data as Soccer[]).map((row, idx) => ({
          ...row,
          image: row.image_url || imageFallbacks[idx % imageFallbacks.length],
        }));
        setItems(mapped.length > 0 ? mapped : fallbackTournaments);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <p className="muted">Loading tournaments...</p>;
  if (!items || items.length === 0) return <p className="muted">No tournaments posted yet.</p>;

  return (
    <div className="list list--grid">
      {items.map((item, idx) => (
        <article key={item.id ?? idx} className="soccer-card">
          <div className="soccer-card__media">
            <img src={item.image || imageFallbacks[idx % imageFallbacks.length]} alt="" />
          </div>
          <div className="soccer-card__body">
            <p className="list__title">{item.title}</p>
            <p className="muted">
              {[item.time_info, item.location, item.level].filter(Boolean).join(" • ")}
            </p>
            <p className="muted">{item.description}</p>
            <div className="cta-row">
              {item.cta_url ? (
                <Link className="button primary" href={item.cta_url}>
                  {item.cta_label ?? "Details"}
                </Link>
              ) : null}
              <Link className="button ghost" href="/community">
                Find teammates
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
