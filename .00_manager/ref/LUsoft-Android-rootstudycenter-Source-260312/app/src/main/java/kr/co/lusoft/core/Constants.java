package kr.co.lusoft.core;


public class Constants
{
    public class Permission {
        public static final int permission_total = 9999;
        public static final int permission_calendar_read = 1000;
        public static final int permission_calendar_write = 1001;
        public static final int permission_contact_read = 1002;
        public static final int permission_contact_write = 1003;
        public static final int permission_gps_info = 1004;
        public static final int permission_recode_audio = 1005;
        public static final int permission_telephony_number = 1006;
        public static final int permission_telephony_call = 1007;
        public static final int permission_body_sensor = 1008;
        public static final int permission_sms_read = 1009;
        public static final int permission_sms_write = 1010;
        public static final int permission_storage_read = 1011;
        public static final int permission_storage_write = 1012;
        public static final int permission_camera_take = 1013;
        public static final int permission_push = 1014;
    }

     public class Task {
        public static final int file_upload_chrome = 1000;
        public static final int file_upload_lollipop = 1001;
        public static final int file_upload  = 1002;
        public static final int file_upload_image  = 1003;
        public static final int file_upload_video  = 1004;
        public static final int file_chooser_lollipop  = 1012;
        public static final int file_gallery_single  = 1013;
        public static final int file_gallery_multi  = 1014;
        public static final int file_chooser_camera_image  = 1015;
        public static final int file_chooser_camera_video  = 1016;
    }

    // noti request
    public enum NotificationExtraData
    {
        eCommand("command"),
        eFCM("fcm"),
        eFCMURL("fcm_url"),
        eDownloadFile("download_file"),
        eDownloadFile_filePath("download_file_filePath"),
        eDownloadFile_fileName("download_file_fileName"),
        eTaskID("task_id");

        private final String value;
        NotificationExtraData(String value)
        {
            this.value = value;
        }
        public String getValue()
        {
            return value;
        }
    }

    public final static int NOTIFICATION_SHOW_INTERVAL = 3000;

    public final static int GPS_MIN_TIME = 1000;
    public final static int GPS_MIN_DISTANCE = 1;

}
