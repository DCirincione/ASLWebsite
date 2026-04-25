export type SundayLeagueRuleSection = {
  heading: string;
  items: string[];
};

export type SundayLeagueSettings = {
  depositAmountCents: number;
  overviewParagraphs: string[];
  rules: SundayLeagueRuleSection[];
};

export const DEFAULT_OVERVIEW_PARAGRAPHS: string[] = [
  "Aldrich Sunday League is ASL's flagship 5v5 soccer league and the main hub for matchdays, standings, team pages, and player info. This is where the best matchups happen, storylines build week to week, and teams compete for legacy all summer. The season runs every Sunday from May 31st through August 2nd, excluding Father's Day.",
  "Use the Teams tab to browse current team slots. If you're a captain, click Create Team to reserve a spot and continue through the deposit flow. Once your team is created, you'll unlock your Team Portal where you can invite players, manage your roster, and view your schedule, stats, and standings.",
  "Don't have a team? Sign up as a Free Agent to get scouted by captains and placed on a roster.",
];

export const DEFAULT_RULES: SundayLeagueRuleSection[] = [
  {
    heading: "Format & Structure",
    items: [
      "5v5 format: 1 goalkeeper and 4 field players.",
      "Maximum roster size is 10 players.",
      "Maximum players per matchday is 10.",
      "Minimum of 4 players required to play. Teams with 3 or fewer players forfeit.",
      "Games are XX minutes with a running clock.",
      "Each team plays XXX games per Sunday (TBD).",
      "Two fields are in use each Sunday: Field 1 (Black Sheep) and Field 2 (Magic Fountain).",
      "Teams rotate fields throughout the day.",
      "Conference Format (Black Sheep Conference + Magic Fountain Conference)",
      "Teams will be randomly placed into one of two conferences.",
      "If each conference has 8 teams (16 total):",
      "Top 4 teams in each conference advance to the Championship Playoffs.",
      "Bottom 4 teams in each conference compete in a separate bracket for a secondary title/prize.",
      "If each conference has 10 teams (20 total):",
      "Top 4 teams in each conference advance to the Championship Playoffs.",
      "Bottom 6 teams in each conference compete in a separate bracket for a secondary title/prize.",
      "Playoff bracket format and exact scheduling will be posted before Week 1.",
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

export const DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS = 100;
export const SUNDAY_LEAGUE_DEPOSIT_CURRENCY = "USD";

export const formatSundayLeagueDepositAmount = (amountCents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: SUNDAY_LEAGUE_DEPOSIT_CURRENCY,
  }).format(amountCents / 100);
