export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string;
          phone: string | null;
          user_type: 'student' | 'parent' | 'admin';
          branch_id: string | null;
          is_approved: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name: string;
          phone?: string | null;
          user_type: 'student' | 'parent' | 'admin';
          branch_id?: string | null;
          is_approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          phone?: string | null;
          user_type?: 'student' | 'parent' | 'admin';
          branch_id?: string | null;
          is_approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      student_profiles: {
        Row: {
          id: string;
          seat_number: number | null;
          parent_code: string;
          birthday: string | null;
          student_type_id: string | null;
          caps_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          seat_number?: number | null;
          parent_code: string;
          birthday?: string | null;
          student_type_id?: string | null;
          caps_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          seat_number?: number | null;
          parent_code?: string;
          birthday?: string | null;
          student_type_id?: string | null;
          caps_id?: string | null;
          created_at?: string;
        };
      };
      student_types: {
        Row: {
          id: string;
          name: string;
          weekly_goal_hours: number;
          vacation_weekly_hours: number;
          semester_weekly_hours: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          weekly_goal_hours: number;
          vacation_weekly_hours?: number;
          semester_weekly_hours?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          weekly_goal_hours?: number;
          vacation_weekly_hours?: number;
          semester_weekly_hours?: number;
          created_at?: string;
        };
      };
      student_type_subjects: {
        Row: {
          id: string;
          student_type_id: string;
          subject_name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_type_id: string;
          subject_name: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_type_id?: string;
          subject_name?: string;
          sort_order?: number;
          created_at?: string;
        };
      };
      student_absence_schedules: {
        Row: {
          id: string;
          student_id: string;
          title: string;
          description: string | null;
          is_recurring: boolean;
          recurrence_type: 'weekly' | 'one_time' | null;
          day_of_week: number[] | null;
          start_time: string;
          end_time: string;
          date_type: 'semester' | 'vacation' | 'all' | null;
          valid_from: string | null;
          valid_until: string | null;
          specific_date: string | null;
          buffer_minutes: number;
          is_active: boolean;
          status: 'pending' | 'approved' | 'rejected';
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          rejected_by: string | null;
          rejected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          title: string;
          description?: string | null;
          is_recurring?: boolean;
          recurrence_type?: 'weekly' | 'one_time' | null;
          day_of_week?: number[] | null;
          start_time: string;
          end_time: string;
          date_type?: 'semester' | 'vacation' | 'all' | null;
          valid_from?: string | null;
          valid_until?: string | null;
          specific_date?: string | null;
          buffer_minutes?: number;
          is_active?: boolean;
          status?: 'pending' | 'approved' | 'rejected';
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_by?: string | null;
          rejected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          title?: string;
          description?: string | null;
          is_recurring?: boolean;
          recurrence_type?: 'weekly' | 'one_time' | null;
          day_of_week?: number[] | null;
          start_time?: string;
          end_time?: string;
          date_type?: 'semester' | 'vacation' | 'all' | null;
          valid_from?: string | null;
          valid_until?: string | null;
          specific_date?: string | null;
          buffer_minutes?: number;
          is_active?: boolean;
          status?: 'pending' | 'approved' | 'rejected';
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_by?: string | null;
          rejected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      branches: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      date_type_definitions: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          default_start_time: string;
          default_end_time: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          name: string;
          default_start_time: string;
          default_end_time: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          name?: string;
          default_start_time?: string;
          default_end_time?: string;
          color?: string;
          created_at?: string;
        };
      };
      date_assignments: {
        Row: {
          id: string;
          branch_id: string;
          date: string;
          date_type_id: string;
          custom_start_time: string | null;
          custom_end_time: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          date: string;
          date_type_id: string;
          custom_start_time?: string | null;
          custom_end_time?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          date?: string;
          date_type_id?: string;
          custom_start_time?: string | null;
          custom_end_time?: string | null;
          note?: string | null;
          created_at?: string;
        };
      };
      period_definitions: {
        Row: {
          id: string;
          branch_id: string;
          date_type_id: string;
          period_number: number;
          name: string | null;
          start_time: string;
          end_time: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          date_type_id: string;
          period_number: number;
          name?: string | null;
          start_time: string;
          end_time: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          date_type_id?: string;
          period_number?: number;
          name?: string | null;
          start_time?: string;
          end_time?: string;
          created_at?: string;
        };
      };
      parent_profiles: {
        Row: {
          id: string;
          created_at: string;
        };
        Insert: {
          id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
        };
      };
      parent_student_links: {
        Row: {
          id: string;
          parent_id: string;
          student_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          student_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string;
          student_id?: string;
          created_at?: string;
        };
      };
      attendance: {
        Row: {
          id: string;
          student_id: string;
          type: 'check_in' | 'check_out' | 'break_start' | 'break_end';
          timestamp: string;
          source: 'caps' | 'manual';
        };
        Insert: {
          id?: string;
          student_id: string;
          type: 'check_in' | 'check_out' | 'break_start' | 'break_end';
          timestamp?: string;
          source?: 'caps' | 'manual';
        };
        Update: {
          id?: string;
          student_id?: string;
          type?: 'check_in' | 'check_out' | 'break_start' | 'break_end';
          timestamp?: string;
          source?: 'caps' | 'manual';
        };
      };
      study_goals: {
        Row: {
          id: string;
          student_id: string;
          target_time: string;
          date: string;
          achieved: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          target_time: string;
          date: string;
          achieved?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          target_time?: string;
          date?: string;
          achieved?: boolean;
          created_at?: string;
        };
      };
      subjects: {
        Row: {
          id: string;
          student_id: string;
          subject_name: string;
          started_at: string;
          ended_at: string | null;
          is_current: boolean;
        };
        Insert: {
          id?: string;
          student_id: string;
          subject_name: string;
          started_at?: string;
          ended_at?: string | null;
          is_current?: boolean;
        };
        Update: {
          id?: string;
          student_id?: string;
          subject_name?: string;
          started_at?: string;
          ended_at?: string | null;
          is_current?: boolean;
        };
      };
      focus_scores: {
        Row: {
          id: string;
          student_id: string;
          admin_id: string | null;
          period_id: string | null;
          score: number;
          note: string | null;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          admin_id?: string | null;
          period_id?: string | null;
          score: number;
          note?: string | null;
          recorded_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          admin_id?: string | null;
          period_id?: string | null;
          score?: number;
          note?: string | null;
          recorded_at?: string;
        };
      };
      points: {
        Row: {
          id: string;
          student_id: string;
          admin_id: string | null;
          type: 'reward' | 'penalty';
          amount: number;
          reason: string;
          is_auto: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          admin_id?: string | null;
          type: 'reward' | 'penalty';
          amount: number;
          reason: string;
          is_auto?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          admin_id?: string | null;
          type?: 'reward' | 'penalty';
          amount?: number;
          reason?: string;
          is_auto?: boolean;
          created_at?: string;
        };
      };
      schedules: {
        Row: {
          id: string;
          student_id: string;
          title: string;
          description: string | null;
          scheduled_date: string;
          status: 'pending' | 'approved' | 'rejected';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          title: string;
          description?: string | null;
          scheduled_date: string;
          status?: 'pending' | 'approved' | 'rejected';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          title?: string;
          description?: string | null;
          scheduled_date?: string;
          status?: 'pending' | 'approved' | 'rejected';
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_rooms: {
        Row: {
          id: string;
          student_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          created_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          room_id: string;
          sender_id: string;
          content: string;
          image_url: string | null;
          is_read_by_student: boolean;
          is_read_by_parent: boolean;
          is_read_by_admin: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          sender_id: string;
          content: string;
          image_url?: string | null;
          is_read_by_student?: boolean;
          is_read_by_parent?: boolean;
          is_read_by_admin?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          sender_id?: string;
          content?: string;
          image_url?: string | null;
          is_read_by_student?: boolean;
          is_read_by_parent?: boolean;
          is_read_by_admin?: boolean;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          parent_id: string | null;
          student_id: string | null;
          type: 'late' | 'absent' | 'point' | 'schedule';
          message: string;
          sent_via: 'kakao' | 'push';
          sent_at: string;
          is_sent: boolean;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          student_id?: string | null;
          type: 'late' | 'absent' | 'point' | 'schedule';
          message: string;
          sent_via?: 'kakao' | 'push';
          sent_at?: string;
          is_sent?: boolean;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          student_id?: string | null;
          type?: 'late' | 'absent' | 'point' | 'schedule';
          message?: string;
          sent_via?: 'kakao' | 'push';
          sent_at?: string;
          is_sent?: boolean;
        };
      };
      student_notifications: {
        Row: {
          id: string;
          student_id: string;
          type: 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';
          title: string;
          message: string;
          link: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          type: 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';
          title: string;
          message: string;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          type?: 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';
          title?: string;
          message?: string;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh_key: string;
          auth_key: string;
          user_agent: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh_key: string;
          auth_key: string;
          user_agent?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh_key?: string;
          auth_key?: string;
          user_agent?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      caps_sync_log: {
        Row: {
          id: string;
          synced_at: string;
          records_synced: number;
          last_caps_datetime: string | null;
          status: string;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          synced_at: string;
          records_synced?: number;
          last_caps_datetime?: string | null;
          status?: string;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          synced_at?: string;
          records_synced?: number;
          last_caps_datetime?: string | null;
          status?: string;
          error_message?: string | null;
          created_at?: string;
        };
      };
      user_notifications: {
        Row: {
          id: string;
          user_id: string;
          type: 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';
          title: string;
          message: string;
          link: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';
          title: string;
          message: string;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';
          title?: string;
          message?: string;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
      };
      focus_score_presets: {
        Row: {
          id: string;
          branch_id: string;
          score: number;
          label: string;
          color: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          score: number;
          label: string;
          color?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          score?: number;
          label?: string;
          color?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
      penalty_presets: {
        Row: {
          id: string;
          branch_id: string;
          amount: number;
          reason: string;
          color: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          amount: number;
          reason: string;
          color?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          amount?: number;
          reason?: string;
          color?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
      reward_presets: {
        Row: {
          id: string;
          branch_id: string;
          amount: number;
          reason: string;
          color: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          amount: number;
          reason: string;
          color?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          amount?: number;
          reason?: string;
          color?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
      announcements: {
        Row: {
          id: string;
          branch_id: string | null;
          title: string;
          content: string;
          is_important: boolean;
          target_audience: 'all' | 'student' | 'parent';
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id?: string | null;
          title: string;
          content: string;
          is_important?: boolean;
          target_audience?: 'all' | 'student' | 'parent';
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string | null;
          title?: string;
          content?: string;
          is_important?: boolean;
          target_audience?: 'all' | 'student' | 'parent';
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      announcement_reads: {
        Row: {
          id: string;
          announcement_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          id?: string;
          announcement_id: string;
          user_id: string;
          read_at?: string;
        };
        Update: {
          id?: string;
          announcement_id?: string;
          user_id?: string;
          read_at?: string;
        };
      };
      weekly_goal_settings: {
        Row: {
          id: string;
          student_type_id: string;
          date_type_id: string;
          weekly_goal_hours: number;
          reward_points: number;
          penalty_points: number;
          minimum_hours: number;
          minimum_penalty_points: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_type_id: string;
          date_type_id: string;
          weekly_goal_hours?: number;
          reward_points?: number;
          penalty_points?: number;
          minimum_hours?: number;
          minimum_penalty_points?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_type_id?: string;
          date_type_id?: string;
          weekly_goal_hours?: number;
          reward_points?: number;
          penalty_points?: number;
          minimum_hours?: number;
          minimum_penalty_points?: number;
          created_at?: string;
        };
      };
      weekly_point_history: {
        Row: {
          id: string;
          student_id: string;
          week_start: string;
          total_study_minutes: number;
          goal_minutes: number;
          is_achieved: boolean;
          point_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          week_start: string;
          total_study_minutes: number;
          goal_minutes: number;
          is_achieved: boolean;
          point_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          week_start?: string;
          total_study_minutes?: number;
          goal_minutes?: number;
          is_achieved?: boolean;
          point_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// 편의를 위한 타입 별칭
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type StudentProfile = Database['public']['Tables']['student_profiles']['Row'];
export type ParentProfile = Database['public']['Tables']['parent_profiles']['Row'];
export type ParentStudentLink = Database['public']['Tables']['parent_student_links']['Row'];
export type Attendance = Database['public']['Tables']['attendance']['Row'];
export type StudyGoal = Database['public']['Tables']['study_goals']['Row'];
export type Subject = Database['public']['Tables']['subjects']['Row'];
export type FocusScore = Database['public']['Tables']['focus_scores']['Row'];
export type Point = Database['public']['Tables']['points']['Row'];
export type Schedule = Database['public']['Tables']['schedules']['Row'];
export type ChatRoom = Database['public']['Tables']['chat_rooms']['Row'];
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type Branch = Database['public']['Tables']['branches']['Row'];
export type DateTypeDefinition = Database['public']['Tables']['date_type_definitions']['Row'];
export type DateAssignment = Database['public']['Tables']['date_assignments']['Row'];
export type StudentType = Database['public']['Tables']['student_types']['Row'];
export type StudentTypeSubject = Database['public']['Tables']['student_type_subjects']['Row'];
export type StudentAbsenceSchedule = Database['public']['Tables']['student_absence_schedules']['Row'];
export type StudentNotification = Database['public']['Tables']['student_notifications']['Row'];
export type UserNotification = Database['public']['Tables']['user_notifications']['Row'];
export type PushSubscription = Database['public']['Tables']['push_subscriptions']['Row'];
export type CapsSyncLog = Database['public']['Tables']['caps_sync_log']['Row'];
export type Announcement = Database['public']['Tables']['announcements']['Row'];
export type AnnouncementRead = Database['public']['Tables']['announcement_reads']['Row'];
export type WeeklyGoalSetting = Database['public']['Tables']['weekly_goal_settings']['Row'];
export type WeeklyPointHistory = Database['public']['Tables']['weekly_point_history']['Row'];
