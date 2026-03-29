package kr.co.lusoft.notification.fcm;


import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import java.util.List;
import kr.co.lusoft.notification.NotificationTools;


/**
 * FCM 클래스에서 모든것이 처리되어야 정상이지만, 백그라운드 환경에서 데이터가 들어오지 않는 문제가 있어서,
 * 방어 코드의 목적으로 생성함.
 *
 * 회사 정책상, 'notification'과 'data을 동시에 사용해서 발생하는 문제.
 *
 * 백그라운드 환경에서 메세지 수신시, 에러 로그 출력됨
 * 노티바에는 등록이 됨.
 * 데이터가 들어오지 않기 때문에 뱃지 넘버를 처리할 수 없음.
 *
 * 이 클래스에서 백그라운드만 처리함
 **/


public class FCMReceiver extends BroadcastReceiver {
    String TAG = "*[FCMReceiver]";
    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "onReceive");
        Bundle extras = intent.getExtras();
        assert extras != null;

        ActivityManager manager = (ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
        assert manager != null;

        List<ActivityManager.RunningTaskInfo> info = manager.getRunningTasks(1);
        ActivityManager.RunningTaskInfo runningTaskInfo = null;

        if(info.size() == 1)runningTaskInfo = info.get(0);
        if(runningTaskInfo != null)
        {
            String strBadge = extras.getString("badge");
            String strTitle = extras.getString("title");
            if(strBadge == null) {
                strBadge = "0";
            }
            int nBadgeCount = Integer.parseInt(strBadge);
            NotificationTools.updateBadgeCount(context, nBadgeCount);
        }
    }
}
