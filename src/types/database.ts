export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MentoringType = 'mentoring' | 'clinic' | 'consult';

export type MentoringAttachment = {
  url: string;
  name: string;
  mime_type: string;
  size: number;
};

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
          is_super_admin: boolean;
          withdrawn_at: string | null;
          withdrawn_by: string | null;
          withdrawn_reason: string | null;
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
          is_super_admin?: boolean;
          withdrawn_at?: string | null;
          withdrawn_by?: string | null;
          withdrawn_reason?: string | null;
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
          is_super_admin?: boolean;
          withdrawn_at?: string | null;
          withdrawn_by?: string | null;
          withdrawn_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          platform: 'ios' | 'android';
          device_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          expo_push_token: string;
          platform: 'ios' | 'android';
          device_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          expo_push_token?: string;
          platform?: 'ios' | 'android';
          device_id?: string | null;
          is_active?: boolean;
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
          caps_id_set_at: string | null;
          created_at: string;
          withdrawal_review_at: string | null;
          withdrawal_review_reason: string | null;
          threshold_consumed_in_quarter_at: string | null;
          first_check_in_at: string | null;
          last_warned_at_10: string | null;
          last_warned_at_20: string | null;
          last_warned_at_25: string | null;
          policy_acknowledged_at: string | null;
        };
        Insert: {
          id: string;
          seat_number?: number | null;
          parent_code: string;
          birthday?: string | null;
          student_type_id?: string | null;
          caps_id?: string | null;
          caps_id_set_at?: string | null;
          created_at?: string;
          withdrawal_review_at?: string | null;
          withdrawal_review_reason?: string | null;
          threshold_consumed_in_quarter_at?: string | null;
          first_check_in_at?: string | null;
          last_warned_at_10?: string | null;
          last_warned_at_20?: string | null;
          last_warned_at_25?: string | null;
          policy_acknowledged_at?: string | null;
        };
        Update: {
          id?: string;
          seat_number?: number | null;
          parent_code?: string;
          birthday?: string | null;
          student_type_id?: string | null;
          caps_id?: string | null;
          caps_id_set_at?: string | null;
          created_at?: string;
          withdrawal_review_at?: string | null;
          withdrawal_review_reason?: string | null;
          threshold_consumed_in_quarter_at?: string | null;
          first_check_in_at?: string | null;
          last_warned_at_10?: string | null;
          last_warned_at_20?: string | null;
          last_warned_at_25?: string | null;
          policy_acknowledged_at?: string | null;
        };
      };
      student_types: {
        Row: {
          id: string;
          name: string;
          weekly_goal_hours: number;
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
          preset_id: string | null;
          preset_type: 'reward' | 'penalty' | null;
          event_kind:
            | 'manual'
            | 'manual_cancel'
            | 'auto_weekly'
            | 'auto_daily_focus'
            | 'auto_late'
            | 'auto_early'
            | 'reset_on_threshold'
            | 'reset_on_threshold_revert'
            | 'redeem';
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
          preset_id?: string | null;
          preset_type?: 'reward' | 'penalty' | null;
          event_kind?:
            | 'manual'
            | 'manual_cancel'
            | 'auto_weekly'
            | 'auto_daily_focus'
            | 'auto_late'
            | 'auto_early'
            | 'reset_on_threshold'
            | 'reset_on_threshold_revert'
            | 'redeem';
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
          preset_id?: string | null;
          preset_type?: 'reward' | 'penalty' | null;
          event_kind?:
            | 'manual'
            | 'manual_cancel'
            | 'auto_weekly'
            | 'auto_daily_focus'
            | 'auto_late'
            | 'auto_early'
            | 'reset_on_threshold'
            | 'reset_on_threshold_revert'
            | 'redeem';
        };
      };
      reward_redemptions: {
        Row: {
          id: string;
          student_id: string;
          status:
            | 'requested'
            | 'auto_pending'
            | 'issued'
            | 'rejected'
            | 'cancelled_by_revert'
            | 'cancelled_by_balance';
          points_used: number;
          voucher_amount: number | null;
          voucher_code: string | null;
          voucher_note: string | null;
          trigger: 'student_request' | 'threshold_auto' | 'auto_threshold_100';
          requested_at: string;
          issued_at: string | null;
          issued_by: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejected_reason: string | null;
        };
        Insert: {
          id?: string;
          student_id: string;
          status?:
            | 'requested'
            | 'auto_pending'
            | 'issued'
            | 'rejected'
            | 'cancelled_by_revert'
            | 'cancelled_by_balance';
          points_used?: number;
          voucher_amount?: number | null;
          voucher_code?: string | null;
          voucher_note?: string | null;
          trigger?: 'student_request' | 'threshold_auto' | 'auto_threshold_100';
          requested_at?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejected_reason?: string | null;
        };
        Update: {
          id?: string;
          student_id?: string;
          status?:
            | 'requested'
            | 'auto_pending'
            | 'issued'
            | 'rejected'
            | 'cancelled_by_revert'
            | 'cancelled_by_balance';
          points_used?: number;
          voucher_amount?: number | null;
          voucher_code?: string | null;
          voucher_note?: string | null;
          trigger?: 'student_request' | 'threshold_auto' | 'auto_threshold_100';
          requested_at?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejected_reason?: string | null;
        };
      };
      daily_focus_evaluations: {
        Row: {
          id: string;
          student_id: string;
          study_date: string;
          study_minutes: number;
          unclassified_minutes: number;
          is_weekday: boolean;
          granted: boolean;
          granted_reason: string | null;
          point_id: string | null;
          evaluated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          study_date: string;
          study_minutes?: number;
          unclassified_minutes?: number;
          is_weekday: boolean;
          granted?: boolean;
          granted_reason?: string | null;
          point_id?: string | null;
          evaluated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          study_date?: string;
          study_minutes?: number;
          unclassified_minutes?: number;
          is_weekday?: boolean;
          granted?: boolean;
          granted_reason?: string | null;
          point_id?: string | null;
          evaluated_at?: string;
        };
      };
      policy_acknowledgements: {
        Row: {
          id: string;
          user_id: string;
          policy_version: string;
          acknowledged_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          policy_version: string;
          acknowledged_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          policy_version?: string;
          acknowledged_at?: string;
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
          branch_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          branch_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          branch_id?: string;
          created_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          room_id: string;
          sender_id: string;
          branch_id: string;
          content: string;
          image_url: string | null;
          file_url: string | null;
          file_name: string | null;
          file_type: string | null;
          is_read_by_student: boolean;
          is_read_by_parent: boolean;
          is_read_by_admin: boolean;
          created_at: string;
          client_message_id: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          sender_id: string;
          branch_id?: string;
          content: string;
          image_url?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          is_read_by_student?: boolean;
          is_read_by_parent?: boolean;
          is_read_by_admin?: boolean;
          created_at?: string;
          client_message_id?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          sender_id?: string;
          branch_id?: string;
          content?: string;
          image_url?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          is_read_by_student?: boolean;
          is_read_by_parent?: boolean;
          is_read_by_admin?: boolean;
          created_at?: string;
          client_message_id?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
      };
      chat_message_templates: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          branch_id: string;
          parent_id: string | null;
          student_id: string | null;
          type: 'late' | 'absent' | 'point' | 'schedule' | 'system';
          message: string;
          sent_via: 'kakao';
          sent_at: string;
          is_sent: boolean;
        };
        Insert: {
          id?: string;
          branch_id: string;
          parent_id?: string | null;
          student_id?: string | null;
          type: 'late' | 'absent' | 'point' | 'schedule' | 'system';
          message: string;
          sent_via?: 'kakao';
          sent_at?: string;
          is_sent?: boolean;
        };
        Update: {
          id?: string;
          branch_id?: string;
          parent_id?: string | null;
          student_id?: string | null;
          type?: 'late' | 'absent' | 'point' | 'schedule' | 'system';
          message?: string;
          sent_via?: 'kakao';
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
      announcement_attachments: {
        Row: {
          id: string;
          announcement_id: string;
          file_url: string;
          file_name: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          announcement_id: string;
          file_url: string;
          file_name: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          announcement_id?: string;
          file_url?: string;
          file_name?: string;
          file_size?: number | null;
          mime_type?: string | null;
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
      counseling_reports: {
        Row: {
          id: string;
          student_id: string;
          admin_id: string;
          week_start: string;
          focus_avg: number | null;
          study_feedback: string | null;
          guidance_notes: string | null;
          mentoring_letter: string | null;
          admin_notes: string | null;
          parent_summary: string | null;
          branch_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          admin_id: string;
          week_start: string;
          focus_avg?: number | null;
          study_feedback?: string | null;
          guidance_notes?: string | null;
          mentoring_letter?: string | null;
          admin_notes?: string | null;
          parent_summary?: string | null;
          branch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          admin_id?: string;
          week_start?: string;
          focus_avg?: number | null;
          study_feedback?: string | null;
          guidance_notes?: string | null;
          mentoring_letter?: string | null;
          admin_notes?: string | null;
          parent_summary?: string | null;
          branch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      counseling_templates: {
        Row: {
          id: string;
          branch_id: string;
          score: number;
          label: string;
          short_text: string;
          full_text: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          score: number;
          label: string;
          short_text: string;
          full_text: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          score?: number;
          label?: string;
          short_text?: string;
          full_text?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      meal_products: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          category: 'meal' | 'exam';
          meal_type: 'lunch' | 'dinner' | null;
          status: 'active' | 'inactive' | 'sold_out';
          description: string | null;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          name: string;
          category?: 'meal' | 'exam';
          meal_type?: 'lunch' | 'dinner' | null;
          status?: 'active' | 'inactive' | 'sold_out';
          description?: string | null;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          name?: string;
          category?: 'meal' | 'exam';
          meal_type?: 'lunch' | 'dinner' | null;
          status?: 'active' | 'inactive' | 'sold_out';
          description?: string | null;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      meal_product_variants: {
        Row: {
          id: string;
          product_id: string;
          kind: 'one_time' | 'recurring';
          price: number;
          sale_start_date: string;
          sale_end_date: string;
          product_start_date: string;
          product_end_date: string;
          max_capacity: number | null;
          status: 'active' | 'inactive' | 'sold_out';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          kind: 'one_time' | 'recurring';
          price: number;
          sale_start_date: string;
          sale_end_date: string;
          product_start_date: string;
          product_end_date: string;
          max_capacity?: number | null;
          status?: 'active' | 'inactive' | 'sold_out';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          kind?: 'one_time' | 'recurring';
          price?: number;
          sale_start_date?: string;
          sale_end_date?: string;
          product_start_date?: string;
          product_end_date?: string;
          max_capacity?: number | null;
          status?: 'active' | 'inactive' | 'sold_out';
          created_at?: string;
          updated_at?: string;
        };
      };
      mock_exam_option_groups: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          sort_order: number;
          is_required: boolean;
          status: 'active' | 'inactive';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          sort_order?: number;
          is_required?: boolean;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: string;
          sort_order?: number;
          is_required?: boolean;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
      };
      mock_exam_options: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          sort_order: number;
          status: 'active' | 'inactive';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          sort_order?: number;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          name?: string;
          sort_order?: number;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
      };
      meal_menus: {
        Row: {
          id: string;
          product_id: string;
          date: string;
          menu_text: string;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          date: string;
          menu_text: string;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          date?: string;
          menu_text?: string;
          image_url?: string | null;
          created_at?: string;
        };
      };
      meal_orders: {
        Row: {
          id: string;
          user_id: string;
          student_id: string;
          variant_id: string;
          order_id: string;
          amount: number;
          status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'failed';
          tid: string | null;
          paid_at: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          seat_number_snapshot: number | null;
          option_selections: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          student_id: string;
          variant_id: string;
          order_id: string;
          amount: number;
          status?: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'failed';
          tid?: string | null;
          paid_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          seat_number_snapshot?: number | null;
          option_selections?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          student_id?: string;
          variant_id?: string;
          order_id?: string;
          amount?: number;
          status?: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'failed';
          tid?: string | null;
          paid_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          seat_number_snapshot?: number | null;
          option_selections?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_logs: {
        Row: {
          id: string;
          order_type: 'meal' | 'exam' | 'other';
          order_id: string;
          tid: string | null;
          action: 'auth' | 'approve' | 'cancel' | 'webhook' | 'netcancel';
          amount: number | null;
          status: string;
          result_code: string | null;
          result_msg: string | null;
          raw_request: Json | null;
          raw_response: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_type: 'meal' | 'exam' | 'other';
          order_id: string;
          tid?: string | null;
          action: 'auth' | 'approve' | 'cancel' | 'webhook' | 'netcancel';
          amount?: number | null;
          status: string;
          result_code?: string | null;
          result_msg?: string | null;
          raw_request?: Json | null;
          raw_response?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_type?: 'meal' | 'exam' | 'other';
          order_id?: string;
          tid?: string | null;
          action?: 'auth' | 'approve' | 'cancel' | 'webhook' | 'netcancel';
          amount?: number | null;
          status?: string;
          result_code?: string | null;
          result_msg?: string | null;
          raw_request?: Json | null;
          raw_response?: Json | null;
          created_at?: string;
        };
      };
      mentors: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          subject: string | null;
          subjects: string[];
          headline: string | null;
          bio: string | null;
          profile_image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          name: string;
          subject?: string | null;
          subjects?: string[];
          headline?: string | null;
          bio?: string | null;
          profile_image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          name?: string;
          subject?: string | null;
          subjects?: string[];
          headline?: string | null;
          bio?: string | null;
          profile_image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      mentoring_slots: {
        Row: {
          id: string;
          branch_id: string;
          mentor_id: string;
          date: string;
          start_time: string;
          end_time: string;
          type: 'mentoring' | 'clinic' | 'consult';
          subject: string | null;
          capacity: number;
          booked_count: number;
          location: string | null;
          note: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          mentor_id: string;
          date: string;
          start_time: string;
          end_time: string;
          type: 'mentoring' | 'clinic' | 'consult';
          subject?: string | null;
          capacity?: number;
          booked_count?: number;
          location?: string | null;
          note?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          mentor_id?: string;
          date?: string;
          start_time?: string;
          end_time?: string;
          type?: 'mentoring' | 'clinic' | 'consult';
          subject?: string | null;
          capacity?: number;
          booked_count?: number;
          location?: string | null;
          note?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      mentoring_applications: {
        Row: {
          id: string;
          slot_id: string;
          user_id: string;
          student_id: string;
          status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
          note: string | null;
          content: string;
          selected_subject: string | null;
          attachments: MentoringAttachment[];
          reject_reason: string | null;
          applied_at: string;
          confirmed_at: string | null;
          rejected_at: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          seat_number_snapshot: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slot_id: string;
          user_id: string;
          student_id: string;
          status?: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
          note?: string | null;
          content?: string;
          selected_subject?: string | null;
          attachments?: MentoringAttachment[];
          reject_reason?: string | null;
          applied_at?: string;
          confirmed_at?: string | null;
          rejected_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          seat_number_snapshot?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slot_id?: string;
          user_id?: string;
          student_id?: string;
          status?: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
          note?: string | null;
          content?: string;
          selected_subject?: string | null;
          attachments?: MentoringAttachment[];
          reject_reason?: string | null;
          applied_at?: string;
          confirmed_at?: string | null;
          rejected_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          seat_number_snapshot?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      count_attendance_status: {
        Args: { p_branch_id: string; p_target_date?: string };
        Returns: {
          checked_in: number;
          checked_out: number;
          on_break: number;
          not_yet_arrived: number;
          total: number;
        }[];
      };
      points_summary: {
        Args: { p_branch_id: string };
        Returns: {
          student_id: string;
          reward_total: number;
          penalty_total: number;
          net_total: number;
          reward_lifetime: number;
          reward_redeemed: number;
          reward_burnt: number;
          penalty_quarter: number;
        }[];
      };
      get_current_quarter_start_kst: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_quarter_start_for_kst: {
        Args: { p_at: string };
        Returns: string;
      };
      handle_penalty_threshold: {
        Args: { p_student_id: string };
        Returns: unknown;
      };
      give_penalty_with_threshold_check: {
        Args: {
          p_student_id: string;
          p_admin_id: string;
          p_amount: number;
          p_reason: string;
          p_preset_id?: string | null;
          p_event_kind?: string;
        };
        Returns: unknown;
      };
      cancel_withdrawal_review: {
        Args: { p_student_id: string; p_restore_reward?: boolean };
        Returns: unknown;
      };
      issue_redemption: {
        Args: {
          p_redemption_id: string;
          p_admin_id: string;
          p_voucher_amount: number;
          p_voucher_code: string;
          p_voucher_note?: string | null;
        };
        Returns: unknown;
      };
      request_redemption: {
        Args: { p_student_id: string };
        Returns: unknown;
      };
      preview_penalty: {
        Args: { p_student_id: string; p_amount: number };
        Returns: unknown;
      };
      ensure_redemption_slots: {
        Args: { p_student_id: string };
        Returns: unknown;
      };
      cleanup_redemption_slots: {
        Args: { p_student_id: string };
        Returns: unknown;
      };
      search_points_history: {
        Args: {
          p_q?: string | null;
          p_type?: string | null;
          p_student_id?: string | null;
          p_sort?: string;
          p_dir?: string;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: {
          id: string;
          student_id: string;
          admin_id: string | null;
          type: 'reward' | 'penalty';
          amount: number;
          reason: string;
          is_auto: boolean;
          created_at: string;
          student_name: string;
          student_seat_number: number | null;
          admin_name: string | null;
          total_count: number;
        }[];
      };
      focus_weekly_summary: {
        Args: { p_branch_id: string; p_week_start: string };
        Returns: {
          student_id: string;
          day_index: number;
          total_score: number;
          avg_score: number;
          count: number;
        }[];
      };
    };
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
export type StudentAbsenceSchedule =
  Database['public']['Tables']['student_absence_schedules']['Row'];
export type StudentNotification = Database['public']['Tables']['student_notifications']['Row'];
export type UserNotification = Database['public']['Tables']['user_notifications']['Row'];
export type CapsSyncLog = Database['public']['Tables']['caps_sync_log']['Row'];
export type Announcement = Database['public']['Tables']['announcements']['Row'];
export type AnnouncementAttachment =
  Database['public']['Tables']['announcement_attachments']['Row'];
export type AnnouncementRead = Database['public']['Tables']['announcement_reads']['Row'];
export type WeeklyGoalSetting = Database['public']['Tables']['weekly_goal_settings']['Row'];
export type WeeklyPointHistory = Database['public']['Tables']['weekly_point_history']['Row'];
export type CounselingReport = Database['public']['Tables']['counseling_reports']['Row'];
export type CounselingTemplate = Database['public']['Tables']['counseling_templates']['Row'];
export type MealProduct = Database['public']['Tables']['meal_products']['Row'];
export type MealProductVariant = Database['public']['Tables']['meal_product_variants']['Row'];
export type MealMenu = Database['public']['Tables']['meal_menus']['Row'];
export type MealOrder = Database['public']['Tables']['meal_orders']['Row'];
export type PaymentLog = Database['public']['Tables']['payment_logs']['Row'];
export type Mentor = Database['public']['Tables']['mentors']['Row'];
export type MentoringSlot = Database['public']['Tables']['mentoring_slots']['Row'];
export type MentoringApplication = Database['public']['Tables']['mentoring_applications']['Row'];
