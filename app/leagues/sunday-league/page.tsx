"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { supabase } from "@/lib/supabase/client";

type SundayLeagueSection = "overview" | "rules" | "teams" | "leaderboards" | "schedule" | "inquiries";

const sectionOrder: Array<{ id: SundayLeagueSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rules", label: "Rules" },
  { id: "teams", label: "Teams" },
  { id: "leaderboards", label: "Leaderboards" },
  { id: "schedule", label: "Schedule" },
  { id: "inquiries", label: "Inquiries" },
];

const teams = [
  "Riverhead FC",
  "Purple Bombers",
  "Beer Bellyz",
  "Black Sheep",
  "Magic Fountain",
  "North Fork United",
  "Southold Select",
  "Open Slot",
];

const rules = [
  {
    heading: "Format & Structure",
    items: [
      "5v5 format: 1 goalkeeper and 4 field players.",
      "Maximum roster size is 15 players.",
      "Maximum players per matchday is 10.",
      "Minimum of 4 players required to play. Teams with 3 or fewer players forfeit.",
      "Games are XX minutes with a running clock.",
      "Each team plays XXX games per Sunday (TBD).",
      "Two fields are in use each Sunday: Field 1 (Black Sheep) and Field 2 (Magic Fountain).",
      "Teams rotate fields throughout the day.",
    ],
  },
  {
    heading: "Roster Rules",
    items: [
      "Rosters must be submitted by Sunday at 12:00 AM.",
      "Roster edits reopen Sunday at 6:00 PM.",
      "Only players on the submitted roster may play.",
      "No borrowing players from other teams.",
    ],
  },
  {
    heading: "Gameplay Rules",
    items: [
      "Kickoff is decided by coin flip, rock-paper-scissors, or mutual agreement.",
      "After a goal, possession goes to the team that was scored on.",
      "When the ball goes out of bounds, play restarts with a kick-in or goalkeeper possession. No throw-ins.",
      "Goal kicks are required from the end line. No kick-ins from the end line.",
      "The clock runs continuously unless stopped by the referee for injury or delay.",
      "Each team gets 1 timeout per game, with a maximum length of 1 minute 30 seconds.",
    ],
  },
  {
    heading: "Goalkeeper Rules",
    items: [
      "Goalkeepers may use their hands only inside the crease.",
      "The top of the crease acts as the penalty spot.",
      "Back passes are allowed, and the goalkeeper may pick up the ball.",
      "Goalkeepers have a maximum of 15 seconds of possession before releasing the ball.",
      "The goalkeeper cannot throw the ball past the half line, but may kick it anywhere.",
      "The goalkeeper may drop the ball and play with their feet.",
    ],
  },
  {
    heading: "Scoring & Mercy Rules",
    items: [
      "The game ends automatically at 7-0.",
      "Standard goals apply.",
      "Handball results in opposing-team possession awarded to the goalkeeper.",
      "A handball or foul inside the crease results in a penalty kick.",
      "The referee may award a penalty kick for any egregious foul.",
    ],
  },
  {
    heading: "Fouls & Discipline",
    items: [
      "Standard soccer foul rules apply.",
      "Slide tackles are not allowed. Sliding to intercept is allowed.",
      "First offense is a warning. Repeated offenses become fouls.",
      "Yellow and red cards are enforced.",
      "A red card removes the player for the entire day.",
      "A team plays down a player for the remainder of that game after a red card.",
      "The team may replace that player in the next game.",
      "Two red cards in a row, or 3 total red cards, results in removal from the league.",
    ],
  },
  {
    heading: "Fair Play & Authority",
    items: [
      "Referees have full authority and all decisions are final.",
      "Players must respect referees, opponents, and the flow of the game.",
      "ASL reserves the right to remove any player or team at any time.",
    ],
  },
  {
    heading: "Ball & Equipment Rules",
    items: [
      "Each field uses 2 to 3 balls.",
      "If a ball is kicked far out and no one retrieves it, the referee may stop play and issue a warning or penalty.",
      "Shin guards are encouraged but not required.",
    ],
  },
  {
    heading: "Forfeits & Attendance",
    items: [
      "Teams may play with 4 players.",
      "Teams with 3 or fewer players take an automatic forfeit.",
      "Teams may voluntarily forfeit by notifying the referee.",
      "Leaving mid-game may result in forfeits.",
    ],
  },
  {
    heading: "Liability & Requirements",
    items: [
      "All players must sign the required liability waivers, including ASL and/or parks department forms.",
    ],
  },
];

const scheduleColumns = [
  {
    field: "Black Sheep Field",
    games: ["Game 1: Riverhead FC vs Beer Bellyz", "Game 3: Purple Bombers vs Black Sheep", "Game 5: Open Slot vs Southold Select"],
  },
  {
    field: "Magic Fountain Field",
    games: ["Game 2: North Fork United vs Magic Fountain", "Game 4: Southold Select vs Riverhead FC", "Game 6: Beer Bellyz vs Purple Bombers"],
  },
];

const leaderboardRows = [
  { team: "Beer Bellyz FC", w: 23, d: 11, l: 5, gf: 50, ga: 16, gd: 34, pts: 80, gp: 39 },
  { team: "Riverhead FC", w: 22, d: 10, l: 6, gf: 52, ga: 13, gd: 39, pts: 76, gp: 38 },
  { team: "Purple Bombers", w: 13, d: 14, l: 11, gf: 32, ga: 27, gd: 5, pts: 53, gp: 38 },
  { team: "Black Sheep", w: 12, d: 9, l: 14, gf: 28, ga: 26, gd: 2, pts: 45, gp: 35 },
];

export default function SundayLeaguePage() {
  const [activeSection, setActiveSection] = useState<SundayLeagueSection>("overview");
  const [overviewFlyer, setOverviewFlyer] = useState<string>("/sundayLeague/champs2025.jpeg");

  useEffect(() => {
    const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();
    const toFlyerCandidates = (slug?: string | null) => {
      const normalized = normalize(slug);
      if (!normalized) return [];

      const candidates = new Set<string>();
      candidates.add(normalized);
      candidates.add(`${normalized}-flyer`);

      const suffixes = ["-league", "-clinic", "-pickup", "-tournament", "-event"];
      for (const suffix of suffixes) {
        if (normalized.endsWith(suffix)) {
          const base = normalized.slice(0, -suffix.length);
          if (base) {
            candidates.add(base);
            candidates.add(`${base}-flyer`);
          }
        }
      }

      return Array.from(candidates);
    };

    const loadFlyer = async () => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("flyers")
        .select("*");

      if (error || !data || data.length === 0) return;

      const rows = data as Array<{
        flyer_name?: string | null;
        flyer_image_url?: string | null;
        image_url?: string | null;
      }>;
      const candidates = toFlyerCandidates("soccer-league");
      const flyer =
        rows.find((row) => candidates.includes(normalize(row.flyer_name))) ||
        rows.find((row) => normalize(row.flyer_name) === "soccer league") ||
        null;

      const flyerUrl = flyer?.flyer_image_url?.trim() || flyer?.image_url?.trim();
      if (flyerUrl) {
        setOverviewFlyer(flyerUrl);
      }
    };

    void loadFlyer();
  }, []);

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div className="sunday-league-content__grid">
            <div className="sunday-league-copy-block">
              <h2>Overview</h2>
              <p>
                Aldrich Sunday League is the regular ASL competition hub for standings, matchdays, team pages, and player info.
              </p>
              <p>
                Use the side menu to switch between the league overview, rules, teams, leaderboard, weekly schedule, and questions.
              </p>
              <p>
                This page is set up as one live hub, so the content swaps in place instead of sending people to separate pages or scrolling down.
              </p>
            </div>
            <div className="sunday-league-promo">
              <Image
                src={overviewFlyer}
                alt="Soccer league flyer"
                fill
                sizes="(max-width: 900px) 100vw, 420px"
              />
            </div>
          </div>
        );

      case "rules":
        return (
          <div className="sunday-league-rule-box">
            <h2>Rules</h2>
            {rules.map((ruleSection) => (
              <div key={ruleSection.heading} className="sunday-league-panel-box">
                <h3>{ruleSection.heading}</h3>
                {ruleSection.items.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ))}
          </div>
        );

      case "teams":
        return (
          <div className="sunday-league-team-section">
            <div className="sunday-league-team-header">
              <h2>Teams</h2>
              <div className="sunday-league-division-pill">Division 1</div>
            </div>
            <div className="sunday-league-team-grid">
              {teams.map((team) => (
                <article key={team} className="sunday-league-team-card">
                  <h3>{team}</h3>
                  <div className="sunday-league-team-card__logo">
                    <Image src="/team-placeholder.svg" alt="" fill sizes="120px" />
                  </div>
                </article>
              ))}
            </div>
          </div>
        );

      case "leaderboards":
        return (
          <div className="sunday-league-leaderboard">
            <h2>Leaderboard</h2>
            <div className="sunday-league-table-wrap">
              <table className="sunday-league-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>GD</th>
                    <th>PTS</th>
                    <th>GP</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardRows.map((row) => (
                    <tr key={row.team}>
                      <td>{row.team}</td>
                      <td>{row.w}</td>
                      <td>{row.d}</td>
                      <td>{row.l}</td>
                      <td>{row.gf}</td>
                      <td>{row.ga}</td>
                      <td>{row.gd}</td>
                      <td>{row.pts}</td>
                      <td>{row.gp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "schedule":
        return (
          <div className="sunday-league-schedule">
            <h2>Schedule</h2>
            <p className="sunday-league-schedule__date">Sunday, May 31st · 12:00pm - 2:00pm · Division 2</p>
            <div className="sunday-league-schedule__grid">
              {scheduleColumns.map((column) => (
                <div key={column.field} className="sunday-league-schedule__column">
                  <h3>{column.field}</h3>
                  {column.games.map((game) => (
                    <p key={game}>{game}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );

      case "inquiries":
        return (
          <div className="sunday-league-inquiries">
            <h2>Inquiries</h2>
            <p className="sunday-league-inquiries__prompt">Sunday League Questions?</p>
            <form className="sunday-league-inquiries__form">
              <textarea placeholder="Type here..." aria-label="Sunday League questions" />
              <div className="sunday-league-inquiries__actions">
                <button className="button primary" type="button">
                  Submit
                </button>
              </div>
            </form>
          </div>
        );
    }
  };

  return (
    <PageShell>
      <section className="section sunday-league-page">
        <div className="sunday-league-topbar">
          <div className="sunday-league-topbar__title">
            <h1>Aldrich Sunday League</h1>
            <div className="sunday-league-topbar__actions">
              <button className="button primary" type="button" onClick={() => setActiveSection("teams")}>
                Join a Team
              </button>
              <button className="button ghost" type="button" onClick={() => setActiveSection("overview")}>
                Create a Team
              </button>
              <button className="button ghost" type="button" onClick={() => setActiveSection("inquiries")}>
                Free Agent
              </button>
            </div>
          </div>
        </div>

        <div className="sunday-league-layout">
          <aside className="sunday-league-sidebar" aria-label="Sunday League sections">
            {sectionOrder.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`sunday-league-sidebar__item${activeSection === section.id ? " is-active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </aside>

          <div className="sunday-league-main">
            <div className="sunday-league-main__content">{renderContent()}</div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
