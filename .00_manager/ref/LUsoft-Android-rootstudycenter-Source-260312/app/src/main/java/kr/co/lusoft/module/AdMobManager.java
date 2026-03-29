package kr.co.lusoft.module;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.util.Log;


import org.json.JSONException;
import org.json.JSONObject;

import kr.co.lusoft.core.Config;
import kr.co.lusoft.func.ReflectManager;

public class AdMobManager {
    private String TAG = "*[AdMobManager]";
    private Context m_context;
    private Activity m_activity;
    private static AdMobManager m_shared = null;
    private ReflectManager.YesNoCallback m_cb;

    public AdMobManager(Activity activity) {
        m_activity = activity;
        m_context = activity.getApplicationContext();
    }
    public static AdMobManager shared(Activity activity)
    {
        if(m_shared == null) {
            m_shared = new AdMobManager(activity);
        }
        return m_shared;
    }
    public void adMob(final String type, final String view, final ReflectManager.YesNoCallback cb) {
        m_cb = cb;
        Log.d(TAG, "klkkkkk:"+Config.shared(m_context).getConfigString("googleAdMob", "admobId"));

        if (Config.shared(m_context).getConfigBool("googleAdMob", "use")) {

            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    m_activity.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            String unitid_full = "ca-app-pub-3940256099942544/1033173712";// test id
                            String unitid_banner = "ca-app-pub-3940256099942544/6300978111";// test id
                            String r = Config.shared(m_context).getConfigString("googleAdMob", "admobUnitidFull");
                            if (!r.equals("")) unitid_full = r;
                            r = Config.shared(m_context).getConfigString("googleAdMob", "admobUnitidBanner");
                            if (!r.equals("")) unitid_banner = r;

                            ReflectManager ref = new ReflectManager();
                            if (ref.getClass("kr.co.lusoft.GoogleAdMob.GoogleAdMob")) {
                                ref.runMethod("init", m_activity);
                                if (type.toLowerCase().equals("full")) {

                                    ref.runMethodCallback(new ReflectManager.YesNoCallback() {
                                        @Override
                                        public void onSuccess(String methodName, JSONObject rJson) {
                                            Log.d(TAG, "Full-success:" + methodName + "/" + rJson.toString());
                                            cb.onSuccess(methodName, rJson);
                                        }

                                        @Override
                                        public void onFailure(String methodName, int errNo, String message) {
                                            Log.d(TAG, "Full-Failure:" + errNo + ":" + message);
                                            cb.onFailure(methodName, errNo, message);
                                        }
                                    }, "kr.co.lusoft.GoogleAdMob.YesNoCallback", "adMobFull", view.toLowerCase(), unitid_full);
                                }
                                if (type.toLowerCase().equals("banner")) {
                                    Object adView = null;
                                    adView = m_activity.findViewById(m_activity.getResources().getIdentifier("adView", "id", m_activity.getPackageName()));

                                    if (adView != null) {
                                        ref.runMethodCallback(new ReflectManager.YesNoCallback() {
                                            @Override
                                            public void onSuccess(String methodName, JSONObject rJson) {
                                                Log.d(TAG, "success111:" + methodName + "/" + rJson.toString());
                                                cb.onSuccess(methodName, rJson);
                                            }

                                            @Override
                                            public void onFailure(String methodName, int errNo, String message) {
                                                Log.d(TAG, "Failure:" + errNo + ":" + message);
                                                cb.onFailure(methodName, errNo, message);
                                            }
                                        }, "kr.co.lusoft.GoogleAdMob.YesNoCallback", "adMobBanner", adView, view.toLowerCase());
                                        //}, "kr.co.lusoft.GoogleAdMob.YesNoCallback", "adMobBanner", m_activity.findViewById(R.id.adView), view.toLowerCase());
                                    }
                                }
                            } else {
                                cb.onFailure(type, -1, "Google Ad Mob not found");
                            }
                        }
                    });
                }
            }, 1);
        }else{
            cb.onFailure(type, -1, "Google Ad Mob not use");
        }
    }
    public void banner(final ReflectManager.YesNoCallback cb) {
        m_cb = cb;
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                m_activity.runOnUiThread(new Runnable(){
                    @Override
                    public void run() {

                        ReflectManager ref = new ReflectManager();
                        if (ref.getClass("kr.co.lusoft.GoogleAdMob.GoogleAdMob")) {
                            ref.runMethod("init", m_activity);

                            Object adView = null;
                            adView = m_activity.findViewById(m_activity.getResources().getIdentifier("adView", "id", m_activity.getPackageName()));
                            if (adView!=null) {
                                Log.d(TAG, "sssssssss");
                                ref.runMethodCallback(new ReflectManager.YesNoCallback() {
                                    @Override
                                    public void onSuccess(String methodName, JSONObject rJson) {
                                        Log.d(TAG, "success222:" + methodName + "/" + rJson.toString());
                                        cb.onSuccess(methodName, rJson);
                                    }

                                    @Override
                                    public void onFailure(String methodName, int errNo, String message) {
                                        Log.d(TAG, "Failure:" + errNo + ":" + message);
                                        cb.onFailure(methodName, errNo, message);
                                    }
                                }, "kr.co.lusoft.GoogleAdMob.YesNoCallback", "adMobBanner", adView, "show");
                                //}, "kr.co.lusoft.GoogleAdMob.YesNoCallback", "adMobBanner", m_activity.findViewById(R.id.adView), view.toLowerCase());
                            }
                        }else{
                            cb.onFailure("banner", -1, "Google Ad Mob not found");
                        }
                    }
                });
            }
        },1);
    }
    public void full(final ReflectManager.YesNoCallback cb) {
        m_cb = cb;
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                m_activity.runOnUiThread(new Runnable(){
                    @Override
                    public void run() {
                        String unitid_full = "ca-app-pub-3940256099942544/1033173712";// test id
                        String r = Config.shared(m_context).getConfigString("googleAdMob", "admobUnitidFull");
                        if (!r.equals("")) unitid_full = r;

                        ReflectManager ref = new ReflectManager();
                        if (ref.getClass("kr.co.lusoft.GoogleAdMob.GoogleAdMob")) {
                            ref.runMethod("init", m_activity);

                            ref.runMethodCallback(new ReflectManager.YesNoCallback() {
                                @Override
                                public void onSuccess(String methodName, JSONObject rJson) {
                                    Log.d(TAG, "Full-success:" + methodName + "/" + rJson.toString());
                                    cb.onSuccess(methodName, rJson);
                                }

                                @Override
                                public void onFailure(String methodName, int errNo, String message) {
                                    Log.d(TAG, "Full-Failure:" + errNo + ":" + message);
                                    cb.onFailure(methodName, errNo, message);
                                }
                            }, "kr.co.lusoft.GoogleAdMob.YesNoCallback", "adMobFull", "show", unitid_full);

                        }else{
                            cb.onFailure("banner", -1, "Google Ad Mob not found");
                        }
                    }
                });
            }
        },1);
    }
}
