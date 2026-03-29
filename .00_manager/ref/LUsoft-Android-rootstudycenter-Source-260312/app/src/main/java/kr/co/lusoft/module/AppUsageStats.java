package kr.co.lusoft.module;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Drawable;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.List;

import kr.co.lusoft.func.PermissionManager;
import kr.co.lusoft.ui.MainActivity;
import kr.co.lusoft.util.Util;

public class AppUsageStats {
    String TAG = "*[AppUsageStats]";
    public boolean permission = false;

    public AppUsageStats(){
        permission = PermissionManager.share().isPackageUsageStatsPermission();
        if (!permission){
            ((MainActivity)MainActivity.m_activity).startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        }
    }
    class AppUsageInfo {
        Drawable appIcon; // You may add get this usage data also, if you wish.
        String appName, packageName;
        long timeInForeground;
        int launchCount;

        AppUsageInfo(String pName) {
            this.packageName=pName;
        }
    }
    public JSONObject getUsageTime(long start_time, long end_time) {
        JSONObject ret = new JSONObject();
        // UsageStatsManager 선언
        //UsageStatsManager usageStatsManager = (UsageStatsManager) ((MainActivity)MainActivity.m_context).getSystemService(Context.USAGE_STATS_SERVICE);
        try {

            // 얼마만큼의 시간동안 수집한 앱의 이름을 가져오는지 정하기 (begin ~ end 까지의 앱 이름을 수집한다)
            final long end = end_time==0? System.currentTimeMillis() : end_time*1000;
            final long begin = start_time * 1000;
            Log.d(TAG, Util.toDate(begin));

            UsageEvents.Event currentEvent;
            HashMap<String, AppUsageInfo> map = new HashMap<>();
            HashMap<String, List<UsageEvents.Event>> sameEvents = new HashMap<>();

            UsageStatsManager mUsageStatsManager = (UsageStatsManager)
                    ((MainActivity)MainActivity.m_context).getSystemService(Context.USAGE_STATS_SERVICE);

            if (mUsageStatsManager != null) {
                // Get all apps data from starting time to end time
                UsageEvents usageEvents = mUsageStatsManager.queryEvents(begin, end);

                String pname = "";

                // Put these data into the map
                while (usageEvents.hasNextEvent()) {
                    currentEvent = new UsageEvents.Event();
                    usageEvents.getNextEvent(currentEvent);

                    /*
                        1 : ACTIVITY_RESUMED / 포그라운드로 이동
                        2 : ACTIVITY_PUASED / 백그라운드로 이동
                        23 : ACTIVITY_STOPPED / Activity.onStop()활동은 활동의 수명 주기 에 따라 UI에서 보이지 않게 됩니다 .
                     */
                    //if (currentEvent.getPackageName().equals("akasic.lusoft.android")) {

                    //Log.d(TAG, "pname:" + currentEvent.getPackageName() + "/eventType:" + currentEvent.getEventType() + "/tm:" + Util.toDate(currentEvent.getTimeStamp()));

                    if (currentEvent.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED
                            || currentEvent.getEventType() == UsageEvents.Event.ACTIVITY_PAUSED
                            || currentEvent.getEventType() == UsageEvents.Event.ACTIVITY_STOPPED) {
                        pname = currentEvent.getPackageName();
                        if (!ret.has(pname)) {
                            ret.put(pname, new JSONArray());
                        }
                        if (currentEvent.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED) {
                            ret.getJSONArray(pname).put(new JSONArray());
                            ret.getJSONArray(pname).getJSONArray(ret.getJSONArray(pname).length() - 1).put(currentEvent.getTimeStamp() / 1000);
                            ret.getJSONArray(pname).getJSONArray(ret.getJSONArray(pname).length() - 1).put(0);
                        } else if (ret.getJSONArray(pname).length() > 0
                                && (currentEvent.getEventType() == UsageEvents.Event.ACTIVITY_PAUSED
                                || currentEvent.getEventType() == UsageEvents.Event.ACTIVITY_STOPPED)) {
                            ret.getJSONArray(pname).getJSONArray(ret.getJSONArray(pname).length() - 1).put(1, Long.valueOf(currentEvent.getTimeStamp() / 1000));
                        }
                    }
                    //}
                }
            }
        } catch (JSONException e) {
            //throw new RuntimeException(e);
            Log.d(TAG, "Exception:"+e.getMessage());
            e.printStackTrace();
        }
        return ret;
    }
}
