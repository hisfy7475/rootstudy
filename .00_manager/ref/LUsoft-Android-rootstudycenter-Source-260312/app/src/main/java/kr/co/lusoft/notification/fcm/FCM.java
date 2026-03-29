package kr.co.lusoft.notification.fcm;


import android.os.Build;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import kr.co.lusoft.BuildConfig;
import kr.co.lusoft.ui.MainActivity;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.Util;
import kr.co.lusoft.notification.NotificationTools;


/**
 * notification 키를 설정할 때 :
 *  FCM이 앱을 대신하여 백그라운드 상태일 때에만 메세지를 자동으로 표시합니다.
 *  포그라운드 상태일 때에는 FirebaseMessagingService 의 onMessageReceived 콜백이 호출됩니다.
 *
 * data 키를 설정할 때 :
 *  클라이언트 앱에서 직접 데이터 메세지를 처리토록 합니다.
 *  백그라운드/포그라운드 여부에 상관없이 FirebaseMessagingService 의 onMessageReceived 콜백이 호출됩니다.
 *  data 키만 설정하셔야 합니다.
 *  notification 키를 같이 설정하시면 콜백이 호출되지 않습니다.
 *
 * >> 현재 회사 템플릿은 아이폰을 고려하여 'notification'과 'data을 동시에 사용함.
 * >> 따라서 이 클래스는 토픽과 포그라운드만 처리하고
 * >> 백그라운드 코드는 실제 구동 되지 않음.
 **/


public class FCM
{
    private static String TAG = "*[FCM]";
    public static void registTopic()
    {
        FirebaseMessaging.getInstance().subscribeToTopic("news");
        FirebaseMessaging.getInstance().subscribeToTopic("and-user");

        if (BuildConfig.DEBUG)
        {
            String topic = "topic_test";
            Util.log("regist for debug topic : " + topic);
            FirebaseMessaging.getInstance().subscribeToTopic(topic);
        }
    }

    public static class MessagingService extends FirebaseMessagingService {
        @Override
        public void onNewToken(String token) {
            super.onNewToken(token);
            SharedData.shared().saveData(SharedData.FCMToken, token);
            Util.log("fcm token refreshed : " + token);
        }

        @Override
        public void onMessageReceived(RemoteMessage remoteMessage)
        {
            Log.d(TAG, "onMessageReceived");
            if (remoteMessage == null) {
                return;
            }
            Log.d(TAG, "remoteMessage:"+remoteMessage.getData().toString());
            String strMessageTitle = "";
            String strMessageDescription = "";
            String strMessageSound = "";
            String strFcmTaskID = remoteMessage.getData().get("task_id");
            RemoteMessage.Notification notification = remoteMessage.getNotification();
            if (notification != null) {
                Log.d(TAG, "1111");
                strMessageTitle = notification.getTitle();
                strMessageDescription = notification.getBody();
                strMessageSound = notification.getSound();
            }else{
                Log.d(TAG, "222");
                strMessageTitle = remoteMessage.getData().get("title");
                strMessageDescription = remoteMessage.getData().get("body");
                strMessageSound = remoteMessage.getData().get("sound");
            }
            Log.d(TAG, "strMessageTitle:"+strMessageTitle);
            Log.d(TAG, "strMessageDescription:"+strMessageDescription);
            Log.d(TAG, "strMessageSound:"+strMessageSound);
            Log.d(TAG, "strFcmTaskID:"+strFcmTaskID);

            NotificationTools.updateBadgeCount(this, remoteMessage);
            //NotificationTools.playNotificationSound(this, "lu_youngdelivery");
            NotificationTools.addFcmItemOnBar(getApplicationContext(), strMessageTitle, strMessageDescription, strFcmTaskID, strMessageSound);
            /*
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationTools.addFcmItemOnBar(getApplicationContext(), strMessageTitle, strMessageDescription, strFcmTaskID, strMessageSound);
            }
            if (remoteMessage.getNotification() != null) {
                sendFCMData(strMessageTitle, strMessageDescription, strMessageSound, strFcmTaskID);
            } else if (remoteMessage.getData().size() > 0) {
                ActivityManager manager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
                assert manager != null;
                List<ActivityManager.RunningTaskInfo> info = manager.getRunningTasks(1);
                ActivityManager.RunningTaskInfo runningTaskInfo = null;
                if(info.size() == 1)
                    runningTaskInfo = info.get(0);
                if(runningTaskInfo != null) {
                    String strMainClassName = runningTaskInfo.topActivity.getClassName();
                    if(strMainClassName.equals("kr.co.lusoft.ui.MainActivity")) {
                        // 활성화 상태
                        if(strFcmTaskID != null && strFcmTaskID.length() > 0) {
                            sendFCMData(strMessageTitle, strMessageDescription, strMessageSound, strFcmTaskID);
                        }
                    }else{
                    }
                }
            }

             */
        }

        private void sendFCMData(String messageTitle, String messageBody, String strMessageSound, String strTaskId) {
            Log.d(TAG, "sendFCMData");
            NotificationTools.playNotificationSound(this, strMessageSound);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                FCMItem fcmItem = new FCMItem();
                fcmItem.setFcmid(Util.getNextNotificationID());
                fcmItem.setTitle(messageTitle);
                fcmItem.setDescription(messageBody);
                fcmItem.setSound(strMessageSound);
                fcmItem.setTaskid(strTaskId);
                MainActivity.showNotificationAlert(fcmItem);
            }
        }
    }
}
