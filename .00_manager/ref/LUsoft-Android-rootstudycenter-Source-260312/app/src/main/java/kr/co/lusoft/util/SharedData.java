package kr.co.lusoft.util;


import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;
import android.util.Log;

import java.util.HashSet;
import java.util.Set;

import kr.co.lusoft.AppDelegate;


public class SharedData {
    // singleton
    @SuppressLint("StaticFieldLeak")
    private String TAG = "*[SharedData]";
    private static SharedData mShared = new SharedData();
    public static SharedData shared() {
        return mShared;
    }


    // member variables
    public Activity windowActivity = null;
    private Activity activity = null;
    private SharedPreferences preferences;

    private SharedData() {
        Log.d(TAG, "SharedData");
        preferences = AppDelegate.m_context.getSharedPreferences("settings", 0);
    }

    // functions
    public void init(Activity mainActivity) {
        activity = mainActivity;
        preferences = getApplicationContext().getSharedPreferences("settings", 0);
    }

    public Context getApplicationContext() {
        return AppDelegate.m_context;
    }

    public String getVersion() {
        try {
            return getApplicationContext().getPackageManager().getPackageInfo(getApplicationContext().getPackageName(), 0).versionName;
        } catch(Exception e) {
            return "";
        }
    }

    // sharedpreference
    public void saveData(String key, String val) {
        saveString(key, val);
    }
    public void saveString(String key, String val) {
        if(!TextUtils.isEmpty(key)) {
            if(preferences != null) {
                SharedPreferences.Editor editor = preferences.edit();
                editor.putString(key, val);
                editor.apply();
                editor.commit();
            }
        }
    }
    public void saveBoolean(String key, boolean val) {
        if(!TextUtils.isEmpty(key)) {
            if(preferences != null) {
                SharedPreferences.Editor editor = preferences.edit();
                editor.putBoolean(key, val);
                editor.apply();
                editor.commit();
            }
        }
    }
    public void saveInt(String key, int val) {
        if(!TextUtils.isEmpty(key)) {
            if(preferences != null) {
                SharedPreferences.Editor editor = preferences.edit();
                editor.putInt(key, val);
                editor.apply();
                editor.commit();
            }
        }
    }
    public String loadData(String key)
    {
        return preferences.getString(key, "");
    }
    public String loadString(String key) {
        return loadString(key, "");
    }
    public String loadString(String key, String dval) {
        return preferences.getString(key, dval);
    }
    public boolean loadBoolean(String key) {
        return loadBoolean(key, false);
    }
    public boolean loadBoolean(String key, boolean dval) {
        return preferences.getBoolean(key, dval);
    }
    public int loadInt(String key) {
        return loadInt(key, 0);
    }
    public int loadInt(String key, int dval) {
        return preferences.getInt(key, dval);
    }


    private final static String registedTopicKey = "registedTopicKey";
    public Set<String> getRegistedTopic()
    {
        return preferences.getStringSet(registedTopicKey, new HashSet<String>());
    }
    public void addTopic(String topic)
    {
        Set<String> set = getRegistedTopic();
        set.add(topic);

        SharedPreferences.Editor editor = preferences.edit();
        editor.putStringSet(registedTopicKey, set);
        editor.apply();
        editor.commit();
    }
    public void removeAtTopic(String topic)
    {
        Set<String> set = getRegistedTopic();
        set.remove(topic);

        SharedPreferences.Editor editor = preferences.edit();
        editor.putStringSet(registedTopicKey, set);
        editor.apply();
        editor.commit();
    }
    public void removeAllTopic()
    {
        SharedPreferences.Editor editor = preferences.edit();
        editor.clear();
        editor.apply();
        editor.commit();
    }


    public final static String PushcatID = "pushcatID";
    public final static String NotiID = "NotiID";
    public final static String FCMToken = "FCMToken";
}
