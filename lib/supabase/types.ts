export type Profile = {
  id: string;
  name: string;
  age: string | null;
  role?: "player" | "partner" | "ref" | "admin" | "owner" | null;
  suspended?: boolean | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  avatar_url?: string | null;
  positions: string[] | null;
  skill_level: number | null;
  sports: string[] | null;
  about: string | null;
  instagram_url?: string | null;
  height_cm: number | null;
  weight_lbs: number | null;
  country_code?: string | null;
};

export type ProfileInsert = {
  id?: string;
  name: string;
  age?: string | null;
  role?: "player" | "partner" | "ref" | "admin" | "owner" | null;
  suspended?: boolean | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  avatar_url?: string | null;
  positions?: string[] | null;
  skill_level?: number | null;
  sports?: string[] | null;
  about?: string | null;
  instagram_url?: string | null;
  height_cm?: number | null;
  weight_lbs?: number | null;
  country_code?: string | null;
};

export type ProfileUpdate = {
  id?: string;
  name?: string;
  age?: string | null;
  role?: "player" | "partner" | "ref" | "admin" | "owner" | null;
  suspended?: boolean | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  avatar_url?: string | null;
  positions?: string[] | null;
  skill_level?: number | null;
  sports?: string[] | null;
  about?: string | null;
  instagram_url?: string | null;
  height_cm?: number | null;
  weight_lbs?: number | null;
  country_code?: string | null;
};

export type Friend = {
  id: string;
  name: string;
  sport: string | null;
  skill_level: number | null;
};

export type FriendInsert = {
  id?: string;
  name: string;
  sport?: string | null;
  skill_level?: number | null;
};

export type FriendUpdate = {
  id?: string;
  name?: string;
  sport?: string | null;
  skill_level?: number | null;
};

export type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined";
  created_at?: string | null;
};

export type FriendRequestInsert = {
  id?: string;
  sender_id: string;
  receiver_id: string;
  status?: "pending" | "accepted" | "declined";
  created_at?: string | null;
};

export type FriendRequestUpdate = {
  id?: string;
  sender_id?: string;
  receiver_id?: string;
  status?: "pending" | "accepted" | "declined";
  created_at?: string | null;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];

export type Event = {
  id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  status?: "scheduled" | "potential" | "tbd" | null;
  host_type?: "aldrich" | "featured" | "partner" | "other" | null;
  image_url?: string | null;
  signup_mode?: "registration" | "waitlist" | null;
  registration_program_slug?: string | null;
  sport_id?: string | null;
  sport_slug?: string | null;
  rules_url?: string | null;
  registration_enabled?: boolean | null;
  registration_schema?: JsonValue | null;
  waiver_url?: string | null;
  allow_multiple_registrations?: boolean | null;
  registration_limit?: number | null;
  payment_required?: boolean | null;
  payment_amount_cents?: number | null;
  created_by_user_id?: string | null;
  approved_by_user_id?: string | null;
  approval_status?: "approved" | "pending_approval" | "changes_requested" | null;
  approval_notes?: string | null;
  submitted_for_approval_at?: string | null;
  approved_at?: string | null;
};

export type EventInsert = {
  id?: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  status?: "scheduled" | "potential" | "tbd" | null;
  host_type?: "aldrich" | "featured" | "partner" | "other" | null;
  image_url?: string | null;
  signup_mode?: "registration" | "waitlist" | null;
  registration_program_slug?: string | null;
  sport_id?: string | null;
  sport_slug?: string | null;
  registration_enabled?: boolean | null;
  registration_schema?: JsonValue | null;
  waiver_url?: string | null;
  allow_multiple_registrations?: boolean | null;
  registration_limit?: number | null;
  payment_required?: boolean | null;
  payment_amount_cents?: number | null;
  created_by_user_id?: string | null;
  approved_by_user_id?: string | null;
  approval_status?: "approved" | "pending_approval" | "changes_requested" | null;
  approval_notes?: string | null;
  submitted_for_approval_at?: string | null;
  approved_at?: string | null;
};

export type EventUpdate = {
  id?: string;
  title?: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  status?: "scheduled" | "potential" | "tbd" | null;
  host_type?: "aldrich" | "featured" | "partner" | "other" | null;
  image_url?: string | null;
  signup_mode?: "registration" | "waitlist" | null;
  registration_program_slug?: string | null;
  sport_id?: string | null;
  sport_slug?: string | null;
  registration_enabled?: boolean | null;
  registration_schema?: JsonValue | null;
  waiver_url?: string | null;
  allow_multiple_registrations?: boolean | null;
  registration_limit?: number | null;
  payment_required?: boolean | null;
  payment_amount_cents?: number | null;
  created_by_user_id?: string | null;
  approved_by_user_id?: string | null;
  approval_status?: "approved" | "pending_approval" | "changes_requested" | null;
  approval_notes?: string | null;
  submitted_for_approval_at?: string | null;
  approved_at?: string | null;
};

export type EventSubmission = {
  id: string;
  event_id: string;
  user_id: string;
  name: string;
  email: string;
  phone?: string | null;
  answers?: Record<string, JsonValue> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  waiver_accepted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EventSubmissionInsert = {
  id?: string;
  event_id: string;
  user_id: string;
  name: string;
  email: string;
  phone?: string | null;
  answers?: Record<string, JsonValue> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  waiver_accepted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EventSubmissionUpdate = {
  id?: string;
  event_id?: string;
  user_id?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  answers?: Record<string, JsonValue> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  waiver_accepted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EventCheckoutDraft = {
  id: string;
  user_id: string;
  event_id: string;
  status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
  amount_cents: number;
  currency: string;
  submission_payload?: JsonValue | null;
  square_payment_link_id?: string | null;
  square_checkout_url?: string | null;
  square_order_id?: string | null;
  square_payment_id?: string | null;
  submission_id?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

export type EventCheckoutDraftInsert = {
  id?: string;
  user_id: string;
  event_id: string;
  status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
  amount_cents: number;
  currency: string;
  submission_payload?: JsonValue | null;
  square_payment_link_id?: string | null;
  square_checkout_url?: string | null;
  square_order_id?: string | null;
  square_payment_id?: string | null;
  submission_id?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

export type EventCheckoutDraftUpdate = {
  id?: string;
  user_id?: string;
  event_id?: string;
  status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
  amount_cents?: number;
  currency?: string;
  submission_payload?: JsonValue | null;
  square_payment_link_id?: string | null;
  square_checkout_url?: string | null;
  square_order_id?: string | null;
  square_payment_id?: string | null;
  submission_id?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

export type PartnerPayoutRequestStatus = "requested" | "approved" | "paid" | "rejected";

export type PartnerPayoutRequest = {
  id: string;
  partner_user_id: string;
  amount_cents: number;
  status: PartnerPayoutRequestStatus;
  requested_at?: string | null;
  approved_by_user_id?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  rejected_at?: string | null;
  square_reference_id?: string | null;
  admin_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PartnerPayoutRequestInsert = {
  id?: string;
  partner_user_id: string;
  amount_cents: number;
  status?: PartnerPayoutRequestStatus;
  requested_at?: string | null;
  approved_by_user_id?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  rejected_at?: string | null;
  square_reference_id?: string | null;
  admin_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PartnerPayoutRequestUpdate = {
  id?: string;
  partner_user_id?: string;
  amount_cents?: number;
  status?: PartnerPayoutRequestStatus;
  requested_at?: string | null;
  approved_by_user_id?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  rejected_at?: string | null;
  square_reference_id?: string | null;
  admin_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueTeam = {
  id: string;
  user_id: string;
  division: 1 | 2;
  slot_number: number;
  captain_name: string;
  captain_phone: string;
  captain_email: string;
  captain_is_playing: boolean;
  team_name: string;
  preferred_jersey_colors?: JsonValue | null;
  preferred_jersey_design?: string | null;
  team_logo_url?: string | null;
  logo_description?: string | null;
  jersey_numbers?: string[] | null;
  agreements?: JsonValue | null;
  deposit_status?: "pending" | "paid" | null;
  team_status?: "pending" | "approved" | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueTeamInsert = {
  id?: string;
  user_id: string;
  division: 1 | 2;
  slot_number: number;
  captain_name: string;
  captain_phone: string;
  captain_email: string;
  captain_is_playing?: boolean;
  team_name: string;
  preferred_jersey_colors?: JsonValue | null;
  preferred_jersey_design?: string | null;
  team_logo_url?: string | null;
  logo_description?: string | null;
  jersey_numbers?: string[] | null;
  agreements?: JsonValue | null;
  deposit_status?: "pending" | "paid" | null;
  team_status?: "pending" | "approved" | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueTeamUpdate = {
  id?: string;
  user_id?: string;
  division?: 1 | 2;
  slot_number?: number;
  captain_name?: string;
  captain_phone?: string;
  captain_email?: string;
  captain_is_playing?: boolean;
  team_name?: string;
  preferred_jersey_colors?: JsonValue | null;
  preferred_jersey_design?: string | null;
  team_logo_url?: string | null;
  logo_description?: string | null;
  jersey_numbers?: string[] | null;
  agreements?: JsonValue | null;
  deposit_status?: "pending" | "paid" | null;
  team_status?: "pending" | "approved" | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueTeamCheckoutDraft = {
  id: string;
  user_id: string;
  division: 1 | 2;
  slot_number: number;
  status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
  amount_cents: number;
  currency: string;
  team_payload?: JsonValue | null;
  square_payment_link_id?: string | null;
  square_checkout_url?: string | null;
  square_order_id?: string | null;
  square_payment_id?: string | null;
  team_id?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

export type SundayLeagueTeamCheckoutDraftInsert = {
  id?: string;
  user_id: string;
  division: 1 | 2;
  slot_number: number;
  status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
  amount_cents: number;
  currency: string;
  team_payload?: JsonValue | null;
  square_payment_link_id?: string | null;
  square_checkout_url?: string | null;
  square_order_id?: string | null;
  square_payment_id?: string | null;
  team_id?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

export type SundayLeagueTeamCheckoutDraftUpdate = {
  id?: string;
  user_id?: string;
  division?: 1 | 2;
  slot_number?: number;
  status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
  amount_cents?: number;
  currency?: string;
  team_payload?: JsonValue | null;
  square_payment_link_id?: string | null;
  square_checkout_url?: string | null;
  square_order_id?: string | null;
  square_payment_id?: string | null;
  team_id?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

export type SundayLeagueLeaderboard = {
  id: string;
  team_id: string;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_distribution: string;
  points: number;
  games_played: number;
  forfeit_wins: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueLeaderboardInsert = {
  id?: string;
  team_id: string;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_for?: number;
  goals_against?: number;
  forfeit_wins?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueLeaderboardUpdate = {
  id?: string;
  team_id?: string;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_for?: number;
  goals_against?: number;
  forfeit_wins?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueTeamMember = {
  id: string;
  team_id?: string | null;
  player_user_id?: string | null;
  invite_email?: string | null;
  invite_name?: string | null;
  status: "free_agent" | "pending" | "accepted" | "declined";
  source: "free_agent" | "player_request" | "captain_invite";
  role: "player" | "co_captain";
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueTeamMemberInsert = {
  id?: string;
  team_id?: string | null;
  player_user_id?: string | null;
  invite_email?: string | null;
  invite_name?: string | null;
  status?: "free_agent" | "pending" | "accepted" | "declined";
  source: "free_agent" | "player_request" | "captain_invite";
  role?: "player" | "co_captain";
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueTeamMemberUpdate = {
  id?: string;
  team_id?: string | null;
  player_user_id?: string | null;
  invite_email?: string | null;
  invite_name?: string | null;
  status?: "free_agent" | "pending" | "accepted" | "declined";
  source?: "free_agent" | "player_request" | "captain_invite";
  role?: "player" | "co_captain";
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueScheduleWeek = {
  id: string;
  week_number: number;
  black_sheep_field_schedule: string;
  magic_fountain_field_schedule: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueScheduleWeekInsert = {
  id?: string;
  week_number: number;
  black_sheep_field_schedule: string;
  magic_fountain_field_schedule: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueScheduleWeekUpdate = {
  id?: string;
  week_number?: number;
  black_sheep_field_schedule?: string;
  magic_fountain_field_schedule?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueFieldName = "Black Sheep Field" | "Magic Fountain Field";

export type SundayLeagueMatchup = {
  id: string;
  week_id: string;
  field_name: SundayLeagueFieldName;
  start_time: string;
  team_1_id?: string | null;
  team_1_name?: string | null;
  team_1_score?: number | null;
  team_2_id?: string | null;
  team_2_name?: string | null;
  team_2_score?: number | null;
  forfeited_team_id?: string | null;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueMatchupInsert = {
  id?: string;
  week_id: string;
  field_name: SundayLeagueFieldName;
  start_time: string;
  team_1_id?: string | null;
  team_1_name?: string | null;
  team_1_score?: number | null;
  team_2_id?: string | null;
  team_2_name?: string | null;
  team_2_score?: number | null;
  forfeited_team_id?: string | null;
  sort_order?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueMatchupUpdate = {
  id?: string;
  week_id?: string;
  field_name?: SundayLeagueFieldName;
  start_time?: string;
  team_1_id?: string | null;
  team_1_name?: string | null;
  team_1_score?: number | null;
  team_2_id?: string | null;
  team_2_name?: string | null;
  team_2_score?: number | null;
  forfeited_team_id?: string | null;
  sort_order?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueMatchupGoal = {
  id: string;
  matchup_id: string;
  team_id: string;
  player_user_id?: string | null;
  player_name: string;
  goal_number: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueMatchupGoalInsert = {
  id?: string;
  matchup_id: string;
  team_id: string;
  player_user_id?: string | null;
  player_name: string;
  goal_number: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SundayLeagueMatchupGoalUpdate = {
  id?: string;
  matchup_id?: string;
  team_id?: string;
  player_user_id?: string | null;
  player_name?: string;
  goal_number?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Sport = {
  id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  players_per_team?: number | null;
  gender?: "men" | "women" | "coed" | "open" | null;
  short_description?: string | null;
  section_headers?: string[] | null;
  image_url?: string | null;
  created_at?: string | null;
};

export type SportInsert = {
  id?: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  players_per_team?: number | null;
  gender?: "men" | "women" | "coed" | "open" | null;
  short_description?: string | null;
  section_headers?: string[] | null;
  image_url?: string | null;
  created_at?: string | null;
};

export type SportUpdate = {
  id?: string;
  title?: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  players_per_team?: number | null;
  gender?: "men" | "women" | "coed" | "open" | null;
  short_description?: string | null;
  section_headers?: string[] | null;
  image_url?: string | null;
  created_at?: string | null;
};

export type Soccer = {
  id: string;
  title: string;
  type: "clinic" | "league" | "pickup" | "tournament" | null;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  image_url?: string | null;
  level?: string | null;
};

export type SoccerInsert = {
  id?: string;
  title: string;
  type?: "clinic" | "league" | "pickup" | "tournament" | null;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  image_url?: string | null;
  level?: string | null;
};

export type SoccerUpdate = {
  id?: string;
  title?: string;
  type?: "clinic" | "league" | "pickup" | "tournament" | null;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  image_url?: string | null;
  level?: string | null;
};

export type RegistrationProgram = {
  id: string;
  slug: string;
  name: string;
  sport_slug?: string | null;
  waiver_url?: string | null;
  active?: boolean | null;
  created_at?: string | null;
};

export type RegistrationProgramInsert = {
  id?: string;
  slug: string;
  name: string;
  sport_slug?: string | null;
  waiver_url?: string | null;
  active?: boolean | null;
  created_at?: string | null;
};

export type RegistrationProgramUpdate = {
  id?: string;
  slug?: string;
  name?: string;
  sport_slug?: string | null;
  waiver_url?: string | null;
  active?: boolean | null;
  created_at?: string | null;
};

export type RegistrationField = {
  id: string;
  program_id: string;
  label: string;
  name: string;
  type: "text" | "email" | "tel" | "number" | "select" | "textarea" | "checkbox" | "file";
  required: boolean;
  options?: string[] | null;
  placeholder?: string | null;
  help?: string | null;
  order?: number | null;
  created_at?: string | null;
};

export type RegistrationFieldInsert = {
  id?: string;
  program_id: string;
  label: string;
  name: string;
  type: "text" | "email" | "tel" | "number" | "select" | "textarea" | "checkbox" | "file";
  required?: boolean;
  options?: string[] | null;
  placeholder?: string | null;
  help?: string | null;
  order?: number | null;
  created_at?: string | null;
};

export type RegistrationFieldUpdate = {
  id?: string;
  program_id?: string;
  label?: string;
  name?: string;
  type?: "text" | "email" | "tel" | "number" | "select" | "textarea" | "checkbox" | "file";
  required?: boolean;
  options?: string[] | null;
  placeholder?: string | null;
  help?: string | null;
  order?: number | null;
  created_at?: string | null;
};

export type RegistrationSubmission = {
  id: string;
  program_id: string;
  sport_slug?: string | null;
  user_id: string;
  answers?: Record<string, unknown> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  referral_source?: string | null;
  created_at?: string | null;
};

export type RegistrationSubmissionInsert = {
  id?: string;
  program_id: string;
  sport_slug?: string | null;
  user_id: string;
  answers?: Record<string, unknown> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  referral_source?: string | null;
  created_at?: string | null;
};

export type RegistrationSubmissionUpdate = {
  id?: string;
  program_id?: string;
  sport_slug?: string | null;
  user_id?: string;
  answers?: Record<string, unknown> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  referral_source?: string | null;
  created_at?: string | null;
};

export type Flyer = {
  id: string;
  event_id?: string | null;
  flyer_name: string;
  flyer_image_url?: string | null;
  details?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FlyerInsert = {
  id?: string;
  event_id?: string | null;
  flyer_name: string;
  flyer_image_url?: string | null;
  details?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FlyerUpdate = {
  id?: string;
  event_id?: string | null;
  flyer_name?: string;
  flyer_image_url?: string | null;
  details?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type ContactMessageInsert = {
  id?: string;
  name: string;
  email: string;
  message: string;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type ContactMessageUpdate = {
  id?: string;
  name?: string;
  email?: string;
  message?: string;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type UserInboxMessage = {
  id: string;
  recipient_user_id: string;
  sender_user_id?: string | null;
  sender_name?: string | null;
  title: string;
  message: string;
  category?: "announcement" | null;
  audience?: "all_players" | "selected_players" | null;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type UserInboxMessageInsert = {
  id?: string;
  recipient_user_id: string;
  sender_user_id?: string | null;
  sender_name?: string | null;
  title: string;
  message: string;
  category?: "announcement" | null;
  audience?: "all_players" | "selected_players" | null;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type UserInboxMessageUpdate = {
  id?: string;
  recipient_user_id?: string;
  sender_user_id?: string | null;
  sender_name?: string | null;
  title?: string;
  message?: string;
  category?: "announcement" | null;
  audience?: "all_players" | "selected_players" | null;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type UserDirectMessage = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  message: string;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type UserDirectMessageInsert = {
  id?: string;
  sender_user_id: string;
  recipient_user_id: string;
  message: string;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type UserDirectMessageUpdate = {
  id?: string;
  sender_user_id?: string;
  recipient_user_id?: string;
  message?: string;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      friends: {
        Row: Friend;
        Insert: FriendInsert;
        Update: FriendUpdate;
        Relationships: [];
      };
      friend_requests: {
        Row: FriendRequest;
        Insert: FriendRequestInsert;
        Update: FriendRequestUpdate;
        Relationships: [];
      };
      events: {
        Row: Event;
        Insert: EventInsert;
        Update: EventUpdate;
        Relationships: [];
      };
      event_submissions: {
        Row: EventSubmission;
        Insert: EventSubmissionInsert;
        Update: EventSubmissionUpdate;
        Relationships: [];
      };
      event_checkout_drafts: {
        Row: EventCheckoutDraft;
        Insert: EventCheckoutDraftInsert;
        Update: EventCheckoutDraftUpdate;
        Relationships: [];
      };
      partner_payout_requests: {
        Row: PartnerPayoutRequest;
        Insert: PartnerPayoutRequestInsert;
        Update: PartnerPayoutRequestUpdate;
        Relationships: [];
      };
      sunday_league_teams: {
        Row: SundayLeagueTeam;
        Insert: SundayLeagueTeamInsert;
        Update: SundayLeagueTeamUpdate;
        Relationships: [];
      };
      sunday_league_team_checkout_drafts: {
        Row: SundayLeagueTeamCheckoutDraft;
        Insert: SundayLeagueTeamCheckoutDraftInsert;
        Update: SundayLeagueTeamCheckoutDraftUpdate;
        Relationships: [];
      };
      sunday_league_team_members: {
        Row: SundayLeagueTeamMember;
        Insert: SundayLeagueTeamMemberInsert;
        Update: SundayLeagueTeamMemberUpdate;
        Relationships: [];
      };
      sunday_league_leaderboard: {
        Row: SundayLeagueLeaderboard;
        Insert: SundayLeagueLeaderboardInsert;
        Update: SundayLeagueLeaderboardUpdate;
        Relationships: [];
      };
      sunday_league_schedule_weeks: {
        Row: SundayLeagueScheduleWeek;
        Insert: SundayLeagueScheduleWeekInsert;
        Update: SundayLeagueScheduleWeekUpdate;
        Relationships: [];
      };
      sunday_league_matchups: {
        Row: SundayLeagueMatchup;
        Insert: SundayLeagueMatchupInsert;
        Update: SundayLeagueMatchupUpdate;
        Relationships: [];
      };
      sunday_league_matchup_goals: {
        Row: SundayLeagueMatchupGoal;
        Insert: SundayLeagueMatchupGoalInsert;
        Update: SundayLeagueMatchupGoalUpdate;
        Relationships: [];
      };
      sports: {
        Row: Sport;
        Insert: SportInsert;
        Update: SportUpdate;
        Relationships: [];
      };
      soccer: {
        Row: Soccer;
        Insert: SoccerInsert;
        Update: SoccerUpdate;
        Relationships: [];
      };
      registration_programs: {
        Row: RegistrationProgram;
        Insert: RegistrationProgramInsert;
        Update: RegistrationProgramUpdate;
        Relationships: [];
      };
      registration_fields: {
        Row: RegistrationField;
        Insert: RegistrationFieldInsert;
        Update: RegistrationFieldUpdate;
        Relationships: [];
      };
      registration_submissions: {
        Row: RegistrationSubmission;
        Insert: RegistrationSubmissionInsert;
        Update: RegistrationSubmissionUpdate;
        Relationships: [];
      };
      flyers: {
        Row: Flyer;
        Insert: FlyerInsert;
        Update: FlyerUpdate;
        Relationships: [];
      };
      contact_messages: {
        Row: ContactMessage;
        Insert: ContactMessageInsert;
        Update: ContactMessageUpdate;
        Relationships: [];
      };
      user_inbox_messages: {
        Row: UserInboxMessage;
        Insert: UserInboxMessageInsert;
        Update: UserInboxMessageUpdate;
        Relationships: [];
      };
      user_direct_messages: {
        Row: UserDirectMessage;
        Insert: UserDirectMessageInsert;
        Update: UserDirectMessageUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
