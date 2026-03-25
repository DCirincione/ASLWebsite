export type Profile = {
  id: string;
  name: string;
  age: string | null;
  role?: "player" | "admin" | "owner" | null;
  suspended?: boolean | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  avatar_url?: string | null;
  positions: string[] | null;
  skill_level: number | null;
  sports: string[] | null;
  about: string | null;
  height_cm: number | null;
  weight_lbs: number | null;
};

export type ProfileInsert = {
  id?: string;
  name: string;
  age?: string | null;
  role?: "player" | "admin" | "owner" | null;
  suspended?: boolean | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  avatar_url?: string | null;
  positions?: string[] | null;
  skill_level?: number | null;
  sports?: string[] | null;
  about?: string | null;
  height_cm?: number | null;
  weight_lbs?: number | null;
};

export type ProfileUpdate = {
  id?: string;
  name?: string;
  age?: string | null;
  role?: "player" | "admin" | "owner" | null;
  suspended?: boolean | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  avatar_url?: string | null;
  positions?: string[] | null;
  skill_level?: number | null;
  sports?: string[] | null;
  about?: string | null;
  height_cm?: number | null;
  weight_lbs?: number | null;
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
  sport_slug?: string | null;
  rules_url?: string | null;
  registration_enabled?: boolean | null;
  registration_schema?: JsonValue | null;
  waiver_url?: string | null;
  allow_multiple_registrations?: boolean | null;
  registration_limit?: number | null;
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
  sport_slug?: string | null;
  registration_enabled?: boolean | null;
  registration_schema?: JsonValue | null;
  waiver_url?: string | null;
  allow_multiple_registrations?: boolean | null;
  registration_limit?: number | null;
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
  sport_slug?: string | null;
  registration_enabled?: boolean | null;
  registration_schema?: JsonValue | null;
  waiver_url?: string | null;
  allow_multiple_registrations?: boolean | null;
  registration_limit?: number | null;
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
      sunday_league_teams: {
        Row: SundayLeagueTeam;
        Insert: SundayLeagueTeamInsert;
        Update: SundayLeagueTeamUpdate;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
