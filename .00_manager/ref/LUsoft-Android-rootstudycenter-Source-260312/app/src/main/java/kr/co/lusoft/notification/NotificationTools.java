package kr.co.lusoft.notification;


import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.RemoteMessage;

import kr.co.lusoft.BuildConfig;
import kr.co.lusoft.ui.MainActivity;
import kr.co.lusoft.util.Util;
import kr.co.lusoft.R;

public class NotificationTools {
    private static String TAG = "*[NotificationTools]";
    public NotificationTools() {
    }
    public static void channelReg(Context context) {
        Log.d(TAG, "channelReg");
        String CHANNEL_ID = context.getString(R.string.scheme);
        int importance = android.app.NotificationManager.IMPORTANCE_HIGH;
        Log.d(TAG, "channelID:"+CHANNEL_ID);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, context.getString(R.string.app_name), importance);
            channel.enableLights(true);
            channel.enableVibration(true);
            //context.getResources().openRawResource(R.raw.lu_youngdelivery)
            int sound_id = context.getResources().getIdentifier(BuildConfig.FLAVOR, "raw", context.getPackageName());
            if (sound_id > 0) {
                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                Log.d(TAG, "android.resource://" + Util.getPackageName(context) + "/raw/" +BuildConfig.FLAVOR);
                soundUri = Uri.parse("android.resource://" + Util.getPackageName(context) + "/raw/" +BuildConfig.FLAVOR);
                AudioAttributes notificationSoundUriAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();
                channel.setSound(soundUri, notificationSoundUriAttributes);
            }
            NotificationManager mNotificationManager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
            mNotificationManager.createNotificationChannel(channel);
        }
    }
    public static void addFcmItemOnBar(Context context, String messageTitle, String messageBody, String strTaskId, String strSound) {
        Log.d(TAG,"addFcmItemOnBar");
        // Only FCM
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("data_type", "push");
        intent.putExtra("task_id", strTaskId);
        PendingIntent pendingIntent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S){
            pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);
        }else{
            pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_ONE_SHOT);
        }
        String CHANNEL_ID = context.getString(R.string.scheme);
        int importance = android.app.NotificationManager.IMPORTANCE_HIGH;

        NotificationManager mNotificationManager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        assert mNotificationManager != null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, context.getString(R.string.app_name), importance);
            channel.enableLights(true);
            channel.enableVibration(true);
            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            if (strSound != null && !strSound.isEmpty() && strSound!="default") {
                //soundUri = Uri.parse("android.resource://" + Util.getPackageName(context) + "/raw/" + BuildConfig.FLAVOR);
            }
            /*
            //Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (strSound != null && !strSound.isEmpty() && strSound!="default") {
                strSound = strSound.replace(".wav", "");
                strSound = strSound.replace(".mp3", "");
                soundUri = Uri.parse("android.resource://" + Util.getPackageName(context) + "/raw/" + strSound);
                Log.d(TAG, "sound:"+soundUri.toString());
                AudioAttributes notificationSoundUriAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();
                channel.setSound(soundUri, notificationSoundUriAttributes);
            }
            */
            Log.d(TAG, "messageBody:" + messageBody);
            Log.d(TAG, "sound2:"+soundUri.toString());

            mNotificationManager.createNotificationChannel(channel);
            NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(context)
                             .setContentTitle(messageTitle)
                             .setContentText(messageBody)
                             .setSmallIcon(R.mipmap.ic_launcher)
                             .setAutoCancel(true)
                             .setSound(soundUri)
                             .setContentIntent(pendingIntent)
                             .setOnlyAlertOnce(true);
            notificationBuilder.setChannelId(CHANNEL_ID);
            notificationBuilder.setStyle(new NotificationCompat.BigTextStyle().bigText(messageBody));
            NotificationManagerCompat.from(context).notify(Util.getNextNotificationID() , notificationBuilder.build());
//            mNotificationManager.notify(Util.getNextNotificationID() , notificationBuilder.build());
        } else {
            importance = android.app.NotificationManager.IMPORTANCE_LOW;
            Notification notification = new Notification.Builder(context)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(messageTitle)
                    .setContentText(messageBody)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent).build();
            mNotificationManager.notify(Util.getNextNotificationID() , notification);
        }
    }

    public static void addNotificationItemOnBar(Context context, String messageTitle, String messageBody, PendingIntent pendingIntent) {
        Log.d(TAG, "addNotificationItemOnBar");
        Log.d(TAG, "title:" + messageTitle);
        Log.d(TAG, "desc:"+messageBody);
        // Local Notification
        String CHANNEL_ID = BuildConfig.APPLICATION_ID;
        int importance = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            importance = android.app.NotificationManager.IMPORTANCE_HIGH;
        }
        NotificationChannel channel = null;
        Notification notification = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            channel = new NotificationChannel(CHANNEL_ID,  context.getString(R.string.app_name), importance);
            notification = new Notification.Builder(context)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(messageTitle)
                    .setContentText(messageBody)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setChannelId(CHANNEL_ID).build();
        } else {
            notification = new Notification.Builder(context)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(messageTitle)
                    .setContentText(messageBody)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent).build();
        }

        android.app.NotificationManager mNotificationManager = (android.app.NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        assert mNotificationManager != null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            mNotificationManager.createNotificationChannel(channel);
        }
        mNotificationManager.notify(Util.getNextNotificationID() , notification);
    }

    public static void updateBadgeCount(Context context, RemoteMessage remoteMessage)
    {
        Log.d(TAG, "updateBadgeCount");
        String strBadge = "0";
        if(remoteMessage != null)
        {
            strBadge = remoteMessage.getData().get("badge");
            if(strBadge == null) {
                strBadge = "0";
            }
        }
        int nBadgeCount = Integer.parseInt(strBadge);
        if(nBadgeCount < 0) {
            nBadgeCount = 0;
        }
        updateBadgeCount(context,nBadgeCount);
    }

    public static void updateBadgeCount(Context context, int nBadgeCount)
    {
        Log.d(TAG, "updateBadgeCount");
        if(nBadgeCount < 0) {
            nBadgeCount = 0;
        }

        Intent intent = new Intent("android.intent.action.BADGE_COUNT_UPDATE");
        intent.putExtra("badge_count", nBadgeCount);
        intent.putExtra("badge_count_package_name", Util.getPackageName(context));
        intent.putExtra("badge_count_class_name", Util.getLauncherClassName(context));
        context.sendBroadcast(intent);
    }

    public static void playNotificationSound(Context context, String soundName) {
        Log.d(TAG, "playNotificationSound:"+soundName);
        //if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O){
            Uri notification = null;
                if (soundName != null) {
                    if (soundName.startsWith(BuildConfig.FLAVOR)) {
                        try {
                            notification = Uri.parse("android.resource://" + Util.getPackageName(context) + "/raw/" + soundName);
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    } else {
                        try {
                            notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                } else {
                    try {
                        notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }

            Ringtone ringtone = RingtoneManager.getRingtone(context, notification);
            ringtone.play();
        //}
    }
}
