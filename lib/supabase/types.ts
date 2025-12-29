export type Profile = {
  id: string;
  name: string;
  age: number | null;
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
  age?: number | null;
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
  age?: number | null;
  avatar_url?: string | null;
  positions?: string[] | null;
  skill_level?: number | null;
  sports?: string[] | null;
  about?: string | null;
  height_cm?: number | null;
  weight_lbs?: number | null;
};

export type TeamMembership = {
  id: string;
  team_name: string;
  role: string | null;
  logo_url?: string | null;
};

export type TeamMembershipInsert = {
  id?: string;
  team_name: string;
  role?: string | null;
  logo_url?: string | null;
};

export type TeamMembershipUpdate = {
  id?: string;
  team_name?: string;
  role?: string | null;
  logo_url?: string | null;
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

export type Event = {
  id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  status?: "scheduled" | "potential" | "tbd" | null;
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
      team_memberships: {
        Row: TeamMembership;
        Insert: TeamMembershipInsert;
        Update: TeamMembershipUpdate;
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
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
