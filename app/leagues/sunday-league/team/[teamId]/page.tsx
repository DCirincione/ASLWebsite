"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { TeamLogoImage } from "@/components/team-logo-image";
import { createId } from "@/lib/create-id";
import { getSundayLeagueColor, getSundayLeagueDivisionLogoSrc, type SundayLeagueDivision } from "@/lib/sunday-league";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueScheduleWeek, SundayLeagueTeam } from "@/lib/supabase/types";

type AgreementKey =
  | "captain_confirmed"
  | "deposit_required"
  | "balance_due"
  | "approval_not_guaranteed"
  | "rules_accepted";

const agreementOptions: Array<{ key: AgreementKey; label: string }> = [
  { key: "captain_confirmed", label: "I confirm that I am the captain or authorized manager of this team." },
  { key: "deposit_required", label: "I understand a $100 deposit is required to reserve my team’s spot." },
  { key: "balance_due", label: "I understand the remaining balance is due on the first Sunday of the season." },
  {
    key: "approval_not_guaranteed",
    label: "I understand that creating a team does not guarantee final approval until payment and league requirements are completed.",
  },
  { key: "rules_accepted", label: "I agree to the Aldrich Sunday League rules, roster policies, and captain responsibilities." },
];

type TeamPortalFormState = {
  captain_name: string;
  team_name: string;
  captain_phone: string;
  captain_email: string;
  captain_is_playing: boolean;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  preferred_jersey_design: string;
  logo_description: string;
  jersey_numbers: string[];
  agreements: Record<AgreementKey, boolean>;
};

type TeamRosterPlayer = {
  id: string;
  name: string;
  position: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  jerseyNumber: string | null;
};

const createTeamPortalFormState = (team: SundayLeagueTeam): TeamPortalFormState => ({
  captain_name: team.captain_name ?? "",
  team_name: team.team_name ?? "",
  captain_phone: team.captain_phone ?? "",
  captain_email: team.captain_email ?? "",
  captain_is_playing: Boolean(team.captain_is_playing),
  primary_color: getSundayLeagueColor(team.preferred_jersey_colors, "primary"),
  secondary_color: getSundayLeagueColor(team.preferred_jersey_colors, "secondary"),
  accent_color: getSundayLeagueColor(team.preferred_jersey_colors, "accent"),
  preferred_jersey_design: team.preferred_jersey_design ?? "",
  logo_description: team.logo_description ?? "",
  jersey_numbers: Array.from({ length: 10 }, (_, index) => team.jersey_numbers?.[index] ?? ""),
  agreements: {
    captain_confirmed: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.captain_confirmed),
    deposit_required: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.deposit_required),
    balance_due: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.balance_due),
    approval_not_guaranteed: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.approval_not_guaranteed),
    rules_accepted: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.rules_accepted),
  },
});

const buildTeamHistory = (team: SundayLeagueTeam | null) => {
  if (!team) return [];

  return [
    `${team.division ?? "Division placement pending"} reserved for the upcoming season`,
    team.deposit_status === "paid" ? "Deposit received and team spot confirmed" : "Deposit pending before final approval",
    "Club history will expand after the first official league match",
  ];
};

const getEstablishedLabel = (team: SundayLeagueTeam | null) => {
  const raw = typeof team?.created_at === "string" ? team.created_at : "";
  const year = raw.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "2026";
};

const normalizeCountryCode = (value?: string | null) => {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;

  const callingCodeMap: Record<string, string> = {
    "+1": "US",
    "1": "US",
    "+44": "GB",
    "44": "GB",
    "+52": "MX",
    "52": "MX",
    "+61": "AU",
    "61": "AU",
  };

  return callingCodeMap[normalized] ?? null;
};

const countryCodeToFlag = (value?: string | null) => {
  const normalized = normalizeCountryCode(value);
  if (!normalized) return null;
  return String.fromCodePoint(...Array.from(normalized).map((char) => 127397 + char.charCodeAt(0)));
};

export default function SundayLeagueTeamPortalPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const [team, setTeam] = useState<SundayLeagueTeam | null>(null);
  const [scheduleWeeks, setScheduleWeeks] = useState<SundayLeagueScheduleWeek[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<TeamRosterPlayer[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });
  const [form, setForm] = useState<TeamPortalFormState | null>(null);
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null);

  useEffect(() => {
    const loadTeam = async () => {
      if (!supabase || !teamId) {
        setStatus("error");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setStatus("no-session");
        return;
      }

      const { data, error } = await supabase
        .from("sunday_league_teams")
        .select("*")
        .eq("id", teamId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) {
        setStatus("error");
        return;
      }

      const nextTeam = data as SundayLeagueTeam;
      setTeam(nextTeam);
      setForm(createTeamPortalFormState(nextTeam));

      if (!nextTeam.captain_is_playing) {
        setRosterPlayers([]);
        setStatus("ready");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id,name,avatar_url,country_code,positions")
        .eq("id", nextTeam.user_id)
        .maybeSingle();

      setRosterPlayers([
        {
          id: nextTeam.user_id,
          name: profileData?.name?.trim() || nextTeam.captain_name,
          position: Array.isArray(profileData?.positions) ? profileData.positions[0] ?? null : null,
          avatarUrl: profileData?.avatar_url ?? null,
          countryCode: profileData?.country_code?.trim()?.toUpperCase() ?? null,
          jerseyNumber: nextTeam.jersey_numbers?.[0]?.trim() || null,
        },
      ]);
      setStatus("ready");
    };

    void loadTeam();
  }, [teamId]);

  useEffect(() => {
    const loadScheduleWeeks = async () => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("sunday_league_schedule_weeks")
        .select("*")
        .order("week_number", { ascending: true });

      if (!error) {
        setScheduleWeeks((data ?? []) as SundayLeagueScheduleWeek[]);
      }
    };

    void loadScheduleWeeks();
  }, []);

  const historyRows = useMemo(() => buildTeamHistory(team), [team]);
  const establishedLabel = useMemo(() => getEstablishedLabel(team), [team]);

  const updateForm = <Key extends keyof TeamPortalFormState>(key: Key, value: TeamPortalFormState[Key]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateAgreement = (key: AgreementKey, value: boolean) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            agreements: {
              ...prev.agreements,
              [key]: value,
            },
          }
        : prev,
    );
  };

  const updateJerseyNumber = (index: number, value: string) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            jersey_numbers: prev.jersey_numbers.map((entry, entryIndex) => (entryIndex === index ? value : entry)),
          }
        : prev,
    );
  };

  const handleSave = async () => {
    if (!supabase || !team || !form) return;

    if (
      !form.captain_name.trim() ||
      !form.team_name.trim() ||
      !form.captain_phone.trim() ||
      !form.captain_email.trim() ||
      !form.primary_color.trim() ||
      !form.secondary_color.trim() ||
      !form.preferred_jersey_design.trim()
    ) {
      setSaveState({ type: "error", message: "Complete all required captain, team, and jersey fields before saving." });
      return;
    }

    if (form.jersey_numbers.some((value) => !value.trim())) {
      setSaveState({ type: "error", message: "Enter all 10 included jersey numbers." });
      return;
    }

    if (agreementOptions.some((agreement) => !form.agreements[agreement.key])) {
      setSaveState({ type: "error", message: "All captain agreements must remain accepted." });
      return;
    }

    setSaveState({ type: "loading" });

    let teamLogoUrl = team.team_logo_url ?? null;
    if (teamLogoFile) {
      const uploadPath = `sunday-league/${team.user_id}/${createId()}-${teamLogoFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from("signups").upload(uploadPath, teamLogoFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) {
        setSaveState({ type: "error", message: `Logo upload failed: ${uploadError.message}` });
        return;
      }

      teamLogoUrl = uploadData?.path ?? uploadPath;
    }

    const payload = {
      captain_name: form.captain_name.trim(),
      team_name: form.team_name.trim(),
      captain_phone: form.captain_phone.trim(),
      captain_email: form.captain_email.trim(),
      captain_is_playing: form.captain_is_playing,
      preferred_jersey_colors: {
        primary: form.primary_color.trim(),
        secondary: form.secondary_color.trim(),
        accent: form.accent_color.trim() || null,
      },
      preferred_jersey_design: form.preferred_jersey_design.trim(),
      team_logo_url: teamLogoUrl,
      logo_description: form.logo_description.trim() || null,
      jersey_numbers: form.jersey_numbers.map((value) => value.trim()),
      agreements: form.agreements,
    };

    const { data, error } = await supabase
      .from("sunday_league_teams")
      .update(payload)
      .eq("id", team.id)
      .eq("user_id", team.user_id)
      .select("*")
      .single();

    if (error || !data) {
      setSaveState({ type: "error", message: error?.message ?? "Could not save team changes." });
      return;
    }

    const nextTeam = data as SundayLeagueTeam;
    setTeam(nextTeam);
    setForm(createTeamPortalFormState(nextTeam));
    setTeamLogoFile(null);
    setIsEditing(false);
    setSaveState({ type: "success", message: "Team details updated." });
  };

  return (
    <PageShell>
      <div style={{ paddingTop: 16 }}>
        <HistoryBackButton label="← Back" fallbackHref="/leagues/sunday-league" />
      </div>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-team-page">
          {status === "loading" ? <p className="muted">Loading your team portal...</p> : null}
          {status === "no-session" ? <p className="form-help error">Sign in to view your team portal.</p> : null}
          {status === "error" ? <p className="form-help error">We could not load this team portal.</p> : null}

          {team ? (
            <>
              <div className="sunday-league-team-portal__heading">
                <p className="eyebrow">Your Sunday League Team</p>
                <p className="muted">Captain view for your club profile, roster board, schedule, and team history.</p>
              </div>

              <article className="sunday-league-team-board">
                <div className="sunday-league-team-board__hero">
                  <div className="sunday-league-team-board__identity">
                    <div className="sunday-league-team-board__title-row">
                      <h2>{team.team_name}</h2>
                    </div>
                    <p className="sunday-league-team-board__captain">Captain: {team.captain_name}</p>
                  </div>
                  <div className="sunday-league-team-board__logo">
                    <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="220px" />
                  </div>
                </div>

                <p className="sunday-league-team-board__established">Established {establishedLabel}</p>
                <div className="sunday-league-team-board__record">
                  <span>0</span>
                  <span>-</span>
                  <span>0</span>
                  <span>-</span>
                  <span>0</span>
                </div>

                <section className="sunday-league-team-board__section">
                  <h3>Roster</h3>
                  {rosterPlayers.length > 0 ? (
                    <div className="sunday-league-team-board__roster">
                      {rosterPlayers.map((player) => (
                        <article key={player.id} className="sunday-league-team-board__player-card">
                          <div className="sunday-league-team-board__player-avatar-wrap">
                            <div className="sunday-league-team-board__player-avatar">
                              <Image
                                src={player.avatarUrl ?? "/avatar-placeholder.svg"}
                                alt={player.name}
                                fill
                                sizes="180px"
                              />
                            </div>
                          </div>
                          <div className="sunday-league-team-board__player-panel">
                            <p className="sunday-league-team-board__player-name">
                              {player.name} - {player.position ?? "Player"}
                            </p>
                            <div className="sunday-league-team-board__player-row">
                              {countryCodeToFlag(player.countryCode) ? (
                                <p className="sunday-league-team-board__player-flag" aria-label={normalizeCountryCode(player.countryCode) ?? undefined}>
                                  {countryCodeToFlag(player.countryCode)}
                                </p>
                              ) : (
                                <span className="sunday-league-team-board__player-flag sunday-league-team-board__player-flag--empty" aria-hidden />
                              )}
                              <p className="sunday-league-team-board__player-number">#{player.jerseyNumber || "0"}</p>
                              <div className="sunday-league-team-board__player-badge">
                                <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="42px" />
                              </div>
                            </div>
                            <div className="sunday-league-team-board__player-division">
                              <Image
                                src={getSundayLeagueDivisionLogoSrc(team.division as SundayLeagueDivision)}
                                alt={`Division ${team.division}`}
                                width={144}
                                height={42}
                                className="sunday-league-team-board__player-division-image"
                              />
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No players have signed up for your roster yet.</p>
                  )}
                </section>

                <section className="sunday-league-team-board__section">
                  <h3>Schedule</h3>
                  {scheduleWeeks.length === 0 ? <p className="muted">No weekly schedule has been posted yet.</p> : null}
                  {scheduleWeeks.length > 0 ? (
                    <div className="sunday-league-schedule__weeks">
                      <div className="sunday-league-schedule__grid sunday-league-schedule__grid--header">
                        <div className="sunday-league-schedule__column">
                          <h3>Black Sheep Field</h3>
                        </div>
                        <div className="sunday-league-schedule__column">
                          <h3>Magic Fountain Field</h3>
                        </div>
                      </div>
                      {scheduleWeeks.map((week) => (
                        <article key={week.id} className="sunday-league-panel-box sunday-league-schedule__week">
                          <div className="sunday-league-stack">
                            <p className="eyebrow">Week {week.week_number}</p>
                            <div className="sunday-league-schedule__grid">
                              <div className="sunday-league-schedule__column">
                                <p className="sunday-league-schedule__body">{week.black_sheep_field_schedule}</p>
                              </div>
                              <div className="sunday-league-schedule__column">
                                <p className="sunday-league-schedule__body">{week.magic_fountain_field_schedule}</p>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="sunday-league-team-board__section">
                  <h3>History</h3>
                  <div className="sunday-league-team-board__list">
                    {historyRows.map((item) => (
                      <div key={item} className="sunday-league-team-board__list-row">
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </article>

              <div className="sunday-league-inline-actions sunday-league-team-portal__actions">
                {!isEditing ? (
                  <button className="button primary" type="button" onClick={() => setIsEditing(true)}>
                    Edit Team
                  </button>
                ) : (
                  <>
                    <button className="button primary" type="button" onClick={() => void handleSave()} disabled={saveState.type === "loading"}>
                      {saveState.type === "loading" ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => {
                        setForm(createTeamPortalFormState(team));
                        setIsEditing(false);
                        setSaveState({ type: "idle" });
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
              {saveState.message ? (
                <p className={`form-help ${saveState.type === "error" ? "error" : saveState.type === "success" ? "success" : ""}`}>
                  {saveState.message}
                </p>
              ) : null}

              {isEditing && form ? (
                <article className="sunday-league-flow-summary__card">
                  <h3>Edit Team</h3>
                  <div className="sunday-league-team-form">
                    <div className="sunday-league-form-grid">
                      <label className="form-control">
                        <span>Full Name</span>
                        <input value={form.captain_name} onChange={(event) => updateForm("captain_name", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Team Name</span>
                        <input value={form.team_name} onChange={(event) => updateForm("team_name", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Captain email</span>
                        <input type="email" value={form.captain_email} onChange={(event) => updateForm("captain_email", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Captain phone</span>
                        <input value={form.captain_phone} onChange={(event) => updateForm("captain_phone", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Primary jersey</span>
                        <input value={form.primary_color} onChange={(event) => updateForm("primary_color", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Secondary jersey</span>
                        <input value={form.secondary_color} onChange={(event) => updateForm("secondary_color", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Accent color</span>
                        <input value={form.accent_color} onChange={(event) => updateForm("accent_color", event.target.value)} />
                      </label>
                      <label className="form-control sunday-league-form-grid__full">
                        <span>Design/style</span>
                        <input
                          value={form.preferred_jersey_design}
                          onChange={(event) => updateForm("preferred_jersey_design", event.target.value)}
                        />
                      </label>
                      <label className="form-control">
                        <span>Upload Team Logo</span>
                        <input type="file" accept="image/*" onChange={(event) => setTeamLogoFile(event.target.files?.[0] ?? null)} />
                      </label>
                      <label className="form-control sunday-league-form-grid__full">
                        <span>Logo description</span>
                        <textarea value={form.logo_description} onChange={(event) => updateForm("logo_description", event.target.value)} rows={4} />
                      </label>
                    </div>
                    <div className="sunday-league-radio-row">
                      <button
                        type="button"
                        className={`chip${form.captain_is_playing ? "" : " chip--ghost"}`}
                        aria-pressed={form.captain_is_playing}
                        onClick={() => updateForm("captain_is_playing", true)}
                      >
                        Captain is playing
                      </button>
                      <button
                        type="button"
                        className={`chip${form.captain_is_playing ? " chip--ghost" : ""}`}
                        aria-pressed={!form.captain_is_playing}
                        onClick={() => updateForm("captain_is_playing", false)}
                      >
                        Captain is manager only
                      </button>
                    </div>
                    <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                      <h3>Jersey Information</h3>
                      <div className="sunday-league-jersey-grid">
                        {form.jersey_numbers.map((number, index) => (
                          <label key={`jersey-${index + 1}`} className="form-control">
                            <span>Number {index + 1}</span>
                            <input value={number} onChange={(event) => updateJerseyNumber(index, event.target.value)} />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                      <h3>Captain Agreements</h3>
                      <div className="sunday-league-checkbox-list">
                        {agreementOptions.map((agreement) => (
                          <label key={agreement.key} className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={form.agreements[agreement.key]}
                              onChange={(event) => updateAgreement(agreement.key, event.target.checked)}
                            />
                            <span>{agreement.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ) : null}
            </>
          ) : null}

          <div className="sunday-league-inline-actions">
            {team ? (
              <Link className="button primary" href={`/leagues/sunday-league/deposit?teamId=${team.id}`}>
                Deposit Page
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
