package kr.co.lusoft.core;

import static android.app.Activity.RESULT_OK;
import static kr.co.lusoft.core.Constants.Permission.permission_camera_take;
import static kr.co.lusoft.core.Constants.Permission.permission_contact_read;
import static kr.co.lusoft.core.Constants.Permission.permission_contact_write;
import static kr.co.lusoft.core.Constants.Permission.permission_gps_info;
import static kr.co.lusoft.core.Constants.Permission.permission_recode_audio;
import static kr.co.lusoft.core.Constants.Permission.permission_telephony_call;
import static kr.co.lusoft.core.Constants.Permission.permission_telephony_number;
import static kr.co.lusoft.core.Constants.Permission.permission_total;
import static kr.co.lusoft.core.Constants.Task.file_upload;
import static kr.co.lusoft.core.Constants.Task.file_upload_image;
import static kr.co.lusoft.core.Constants.Task.file_upload_video;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.telephony.TelephonyManager;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;

import com.google.android.gms.auth.api.Auth;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInResult;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.zxing.integration.android.IntentIntegrator;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.Serializable;
import java.io.UnsupportedEncodingException;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import kr.co.lusoft.BuildConfig;
import kr.co.lusoft.R;
import kr.co.lusoft.module.AppUsageStats;
import kr.co.lusoft.module.GPSManager;
import kr.co.lusoft.func.HttpManager;
import kr.co.lusoft.func.PermissionManager;
import kr.co.lusoft.module.SnsLoginManager;
import kr.co.lusoft.notification.download.DownloadInfo;
import kr.co.lusoft.notification.download.DownloadMng;
import kr.co.lusoft.ui.MainActivity;
import kr.co.lusoft.ui.WindowActivity;
import kr.co.lusoft.util.FileUtils;
import kr.co.lusoft.util.MyContacts;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.StackManager;
import kr.co.lusoft.util.Util;

public class LusoftA {
    private static String TAG = "*[LusoftA]";

    @SuppressLint("StaticFieldLeak")
    private static Context m_context = null;
    @SuppressLint("StaticFieldLeak")
    private static Activity m_activity = null;
    @SuppressLint("StaticFieldLeak")
    private static AlertDialog m_dialog = null;

    public interface LusoftCallback extends Serializable {
        void fileUpload(String query);

        void fileMultiUpload(JSONArray result);
    }


    public LusoftA(Context c) {
        m_context = c;
        m_activity = (Activity) c;//(MainActivity) SharedData.shared().getActivity();
    }

    //javascript callback
    public static void doCallFuncOnJSP(final String strFunc) {
        Log.d(TAG, "LusoftA.doCallFuncOnJSP: " + strFunc);

        StackManager.currentWebView().post(new Runnable() {
            @Override
            public void run() {
                new Handler().postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        final String strFunc1 = strFunc;
                        //m_mainWebview.loadUrl(strFunc1);
                        StackManager.currentWebView().loadUrl(strFunc1);
                    }
                }, 100);
            }
        });
    }
    public static void doJsCallback(String cb) {
        doJsCallback(cb, "Error", "error", new JSONObject());
    }
    public static void doJsCallback(String cb, String desc) {
        doJsCallback(cb, desc, "error", new JSONObject());
    }
    public static void doJsCallback(String cb, String desc, String result) {
        doJsCallback(cb, desc, result, new JSONObject());
    }
    public static void doJsCallback(String cb, String desc, String result, JSONObject dt) {
        String strFunc = String.format("javascript:%s('%s','%s','%s')", cb, result, desc, dt.toString());
        doCallFuncOnJSP(strFunc);
    }

    //
    // JavascriptInterface ---------- ---------- ---------- ---------- ----------
    //

    /*****************************************************************************************************************************
     * #1 APP
     *****************************************************************************************************************************/
    /**
     * #1-1 어플 종료
     */
    @JavascriptInterface
    public static void exitApp() {
        removeDialog();
        StackManager.mainActivity().exitApp(true);
//        m_dialog = new AlertDialog.Builder(m_context).create();
//        m_dialog.setTitle("알림");
//        m_dialog.setMessage("종료 하시겠습니까?");
//        m_dialog.setButton(AlertDialog.BUTTON_POSITIVE, "종료", new DialogInterface.OnClickListener() {
//            @Override
//            public void onClick(DialogInterface dialog, int which) {
//                m_activity.finish();
//            }
//        });
//        m_dialog.setButton(AlertDialog.BUTTON_NEGATIVE, "취소", new DialogInterface.OnClickListener() {
//            @Override
//            public void onClick(DialogInterface dialog, int which) {
//            }
//        });
//        m_dialog.show();
    }

    /**
     * #1-2 새창 띄우기
     * @param url
     */
    @JavascriptInterface
    public static void window_open(String url) {
        Log.d(TAG, "window_open");
        if (url != null && !url.isEmpty()) {
            Intent i = new Intent(m_context, WindowActivity.class);
            i.putExtra("url", url);
            StackManager.currentActivity().startActivity(i);
        }
    }

    /**
     * #1-3 현재창 닫기
     */
    @JavascriptInterface
    public static void window_finish() {
        StackManager.currentActivity().onBackPressed();
    }

    /**
     * #1-4 외부 브라우저 열기
     * @param url
     */
    @JavascriptInterface
    public static void window_open_browser(String url) {
        if (url != null && !url.isEmpty()) {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setData(Uri.parse(url));
            StackManager.currentActivity().startActivity(i);
        }
    }
    /**
     * #1-5 가로세로 모드 변경
     * @param val
     */
    @JavascriptInterface
    public static void rotate_page(String val) {
        switch (val) {
            case "width":
                StackManager.currentActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
                break;
            case "height":
                StackManager.currentActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                break;
            case "rotation":
                StackManager.currentActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER);
                break;
        }
    }

    /**
     * #1-6 wifi check
     */
    @JavascriptInterface
    public static void check_wifi() {
        ConnectivityManager cManager = (ConnectivityManager) m_activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        assert cManager != null;
        //NetworkInfo mobile = cManager.getNetworkInfo(ConnectivityManager.TYPE_MOBILE);
        NetworkInfo wifi = cManager.getNetworkInfo(ConnectivityManager.TYPE_WIFI);

        String strQuery;
        if (wifi.isConnected()) {
            strQuery = "javascript:check_wifi_result('success')";
        } else {
            strQuery = "javascript:check_wifi_result('error')";
        }
        doCallFuncOnJSP(strQuery);
    }

    /**
     * #1-7 app version check
     */
    @JavascriptInterface
    public static void appVersion() {

        int nVersion = Util.getVersionCode();
        String nVersionName = Util.getVersionName();
        String strFunc = String.format(Locale.KOREA, "javascript:result_app_version('%d', '%s')", nVersion, nVersionName);
        doCallFuncOnJSP(strFunc);
    }
    /**
     * #1-8 설치된 앱 목록
     */
    @JavascriptInterface
    public static void getInstalledPackages() {
        String strInstalled = Util.getInstalledApps();
        String strFunc = String.format(Locale.KOREA, "javascript:getInstallApps('%s')", strInstalled);
        doCallFuncOnJSP(strFunc);
    }

    /**
     * #1-9 QR 코드 스캔
     */
    @JavascriptInterface
    public static void get_qrcode() {
        ((MainActivity)m_activity).codeType = "qrcode";
        IntentIntegrator integrator = new IntentIntegrator(m_activity);
//        integrator.setDesiredBarcodeFormats(IntentIntegrator.ALL_CODE_TYPES);
        //integrator.setOrientationLocked(true);
        integrator.setPrompt("QR Code "+SharedData.shared().getApplicationContext().getString(R.string.common_catch));
        integrator.initiateScan();

    }

    /**
     * #1-10 barcode 스캔
     */
    @JavascriptInterface
    public static void get_bacode() {
        ((MainActivity)m_activity).codeType = "bacode";
        IntentIntegrator integrator = new IntentIntegrator(m_activity);
        integrator.setDesiredBarcodeFormats(IntentIntegrator.ONE_D_CODE_TYPES);
        integrator.setBeepEnabled(false);
        integrator.setCameraId(0);
        integrator.initiateScan();
    }

    /**
     * #1-11 음성 녹음
     */
    @JavascriptInterface
    public static void recode_start_audio() {
        if (!PermissionManager.share().isRecodePermission()) {
            PermissionManager.share().getRecodeAudioPermission();
            PermissionManager.share().runTask(permission_recode_audio);
            return;
        }

        ((MainActivity)m_activity).doRecodeAudio();
    }

    /**
     * #1-12 기기 정보
     */
    @JavascriptInterface
    public static void getDeviceInfo() {
        String resultCode = "error";
        String resultMessage = "";
        String deviceName = "anonymous";
        String deviceId = "unknown";

        try {
            deviceId = Settings.Secure.getString(m_context.getContentResolver(), Settings.Secure.ANDROID_ID);
            deviceName = getDeviceName();
            resultCode = "success";
        } catch (Exception e) {
            e.printStackTrace();
            resultMessage = e.getMessage();
            resultCode = "error";
        }
        String strFunc = String.format(Locale.KOREA, "javascript:getDeviceInfo_result('%s', '%s', '%s', '%s', '%s')", resultCode, deviceName, deviceId, resultMessage,SharedData.shared().loadData(SharedData.FCMToken));

        doCallFuncOnJSP(strFunc);
    }

    private static String getDeviceName() {
        final String manufacturer = Build.MANUFACTURER, model = Build.MODEL;
        return model.startsWith(manufacturer) ? capitalizePhrase(model) : capitalizePhrase(manufacturer) + " " + model;
    }

    private static String capitalizePhrase(String s) {
        if (s == null || s.length() == 0)
            return s;
        else {
            StringBuilder phrase = new StringBuilder();
            boolean next = true;
            for (char c : s.toCharArray()) {
                if (next && Character.isLetter(c) || Character.isWhitespace(c))
                    next = Character.isWhitespace(c = Character.toUpperCase(c));
                phrase.append(c);
            }
            return phrase.toString();
        }
    }
    /**
     * #1-13 백키 설정
     * @param back_state
     */
    @JavascriptInterface
    public static void set_back_key(int back_state) {
        Log.d(TAG, "set_back_key:"+back_state);
        StackManager.mainActivity().back_state = back_state;
    }

    /**
     * #1-14 백버튼 "<" 생성
     * @param state
     */
    @JavascriptInterface
    public static void navigation_hidden(int state) {
        Log.d(TAG, "navigation_hidden:"+state);
        StackManager.mainActivity().back_state = state;
        if (state == 1) {
            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    StackManager.mainActivity().runOnUiThread(new Runnable() {
                        public void run() {
                            StackManager.mainActivity().buttonBack.setVisibility(View.VISIBLE);
                        }
                    });
                }
            }, 1000);
        }else {
            StackManager.mainActivity().runOnUiThread(new Runnable() {
                public void run() {
                    StackManager.mainActivity().buttonBack.setVisibility(View.GONE);
                }
            });
        }
    }

    /**
     * #1-15 Deep link info 확인
     * @param txt
     */
    @JavascriptInterface
    public static void deeplink_info(String txt) {
        Log.d(TAG, "deeplink_info:"+txt);
        String cb = "result_deeplink_info";
        try {
            JSONObject Json = new JSONObject(txt);
            Log.d(TAG, "json: "+Json.toString());
            String mode = Util.JsonString(Json, "mode");
            cb = Util.JsonString(Json, "cb");
            boolean delete = Util.JsonBool(Json, "delete");

            String dtxt = SharedData.shared().loadString("deeplink");
            Log.d(TAG, "dTxt: "+ dtxt + "/");
            JSONObject DeepLink = new JSONObject();
            if (!dtxt.equals("")) {
                DeepLink = new JSONObject(dtxt);
            }else{
                doJsCallback(cb, "deeplink info not found", "error", new JSONObject());
            }
            Log.d(TAG, "deeplink: " + DeepLink.toString());
            if (DeepLink.length() > 0) {
                Iterator<String> keys = DeepLink.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    if (key.equals(mode)) {
                        JSONObject value = DeepLink.getJSONObject(key);
                        long limit_tm = Util.JsonLong(value, "limit_tm");
                        long timestampSeconds = System.currentTimeMillis() / 1000;
                        if (limit_tm >= timestampSeconds) {
                            doJsCallback(cb, "success", "success", value);
                            if (delete) {
                                DeepLink.remove(key);
                            }
                        } else {
                            DeepLink.remove(key);
                        }
                        Log.d(TAG, "key=>" + key + " => " + value.toString());
                    }
                }
                SharedData.shared().saveData("deeplink", DeepLink.toString());
            }else{
                doJsCallback(cb, "deeplink info not found(2)", "error", new JSONObject());
            }
        } catch (JSONException e) {
            //throw new RuntimeException(e);
            Log.d(TAG, "deeplink_info exception: " + e.getMessage());
            doJsCallback(cb, e.getMessage());
        }
    }
    /**
     * #1-16 update check
     * @param jtxt
     */
    @JavascriptInterface
    public static void update_check(String jtxt) {
        Log.d(TAG, "update_check:"+jtxt);
        try {
            JSONObject Json = new JSONObject(jtxt);
            Log.d(TAG, "json: "+Json.toString());
            int state = Util.JsonInt(Json, "state");
            boolean toast_view = Util.JsonBool(Json, "toast");
            versionCheck(state, toast_view);
        } catch (JSONException e) {
            //throw new RuntimeException(e);
            Log.d(TAG, "update_check exception: " + e.getMessage());
        }
    }
    private static void versionCheck(final int state, final boolean toast_view){

        AppUpdateManager appUpdateManager = AppUpdateManagerFactory.create(StackManager.currentActivity());

        appUpdateManager.getAppUpdateInfo().addOnSuccessListener(appUpdateInfo -> {
            int availableVersionCode = appUpdateInfo.availableVersionCode();
            int currentVersionCode = Util.getVersionCode();
            int updateAvailability = appUpdateInfo.updateAvailability();

            Log.d(TAG, "currentVersionCode: " + currentVersionCode);
            Log.d(TAG, "availableVersionCode: " + availableVersionCode);
            Log.d(TAG, "updateAvailability: " + updateAvailability);

            // UpdateAvailability 상수 확인n
            // 0 = UNKNOWN
            // 1 = UPDATE_NOT_AVAILABLE
            // 2 = UPDATE_AVAILABLE
            // 3 = DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS

            if (updateAvailability == 2) { // UPDATE_AVAILABLE
                if (currentVersionCode < availableVersionCode) {
                    Log.d(TAG, "업데이트 필요: 현재=" + currentVersionCode + ", 스토어=" + availableVersionCode);
                    // 업데이트 다이얼로그 표시
                    //showUpdateDialog(availableVersionCode);
                    String desc = StackManager.currentActivity().getString(R.string.common_app_update_desc);

                    if (state == 1) { //강제 업데이트
                        Log.d(TAG, "강제 업데이트");
                        desc += "\n" + StackManager.currentActivity().getString(R.string.common_app_update_force);
                        Util.dialog(StackManager.currentActivity(),
                                desc,
                                StackManager.currentActivity().getString(R.string.common_app_update_title),
                                null, StackManager.currentActivity().getString(R.string.common_app_update_ok),
                                new View.OnClickListener() {
                                    @Override
                                    public void onClick(View v) {
                                        removeDialog();
                                        openPlayStore();
                                        exitApp();
                                    }
                                }, StackManager.currentActivity().getString(R.string.common_app_update_ok));
                    }else{
                        Log.d(TAG, "업데이트알림");
                        Util.dialog(StackManager.currentActivity(),
                                desc,
                                StackManager.currentActivity().getString(R.string.common_app_update_title),
                                new View.OnClickListener() {
                                    @Override
                                    public void onClick(View v) {
                                        removeDialog();
                                        openPlayStore();
                                        exitApp();
                                    }
                                }, StackManager.currentActivity().getString(R.string.common_app_update_ok));
                    }
                }
            } else if (updateAvailability == 1) {
                Log.d(TAG, "최신 버전입니다");
                if (toast_view) Util.toast(StackManager.currentActivity().getString(R.string.common_app_update_comment1));
            } else {
                Log.d(TAG, "업데이트 상태 확인 불가: " + updateAvailability);
                if (toast_view) Util.toast(StackManager.currentActivity().getString(R.string.common_app_update_comment2));
            }
        }).addOnFailureListener(e -> {
            Log.e(TAG, "버전 확인 실패", e);
            if (toast_view) Util.toast(StackManager.currentActivity().getString(R.string.common_app_update_comment2));
        });
    }

    /**
     * 플레이스토어 열기
     */
    private static void openPlayStore() {
        try {
            // Play Store 앱으로 열기
            Intent intent = new Intent(Intent.ACTION_VIEW);
            Log.d(TAG, "getPackageName:" + getPackageName());
            intent.setData(Uri.parse("market://details?id=" + getPackageName()));
            StackManager.mainActivity().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // Play Store 앱이 없으면 웹으로 열기
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(Uri.parse("https://play.google.com/store/apps/details?id=" + getPackageName()));
            StackManager.mainActivity().startActivity(intent);
        }
    }
    /*****************************************************************************************************************************
     * #2 User
     *****************************************************************************************************************************/
    /**
     * #2-1 푸시 토큰 등록
     * @param mb_id
     */
    @JavascriptInterface
    public static void hybridGetMbid(String mb_id) {
        Log.d(TAG, "hybridGetMbid:"+mb_id);
        if (mb_id == null || mb_id.isEmpty()) {
            return;
        }
        Log.d(TAG, "url:"+BuildConfig.HostUrl + "/api/api_savePushInfo2.php");
        HttpManager api = new HttpManager(BuildConfig.HostUrl + "/api/api_savePushInfo2.php", HttpManager.Method.POST);
        api.add("return_type", "json");
        api.add("app_os", "Android");
        api.add("app_version", SharedData.shared().getVersion());
        api.add("access_type", "session");
        api.add("mb_os", "5");
        api.add("mb_regnum", SharedData.shared().loadData(SharedData.FCMToken));
        api.add("mb_id", mb_id);
        api.add("sv_code", BuildConfig.FLAVOR);
        Log.d(TAG, "fcm_token:"+SharedData.shared().loadData(SharedData.FCMToken));

        api.run(new HttpManager.HttpCallbackObject() {
            @Override
            public void callback(JSONObject obj) {
                Log.d(TAG, "api_savePushInfo2 callback:"+obj.toString());
                try {
                    if (obj.getString("result").equals("ok")) {
                        Log.d(TAG, "member_id:" + obj.optString("member_id"));
                        SharedData.shared().saveData(SharedData.PushcatID, obj.optString("member_id"));
                        SharedData.shared().saveData("mb_id", mb_id);
                        Util.log("login token seccess ");
                    } else {
                        try {
                            Util.log("Login error : " + URLDecoder.decode(obj.getString("result_text"), "UTF-8"));
                        } catch (UnsupportedEncodingException e) {
                            e.printStackTrace();
                        }
                    }
                } catch (JSONException e) {
                    Log.d(TAG, "errrorrr");
                    e.printStackTrace();
                }
            }
        });
    }

    /**
     * #2-2 FCM 토픽관리
     * @param mode
     * @param topic_names
     */
    @JavascriptInterface
    public void fcm_topic_edit(String mode, String topic_names) {
        try {
            // topic 등록
            switch (mode) {
                case "1": {
                    // 일단 삭제
                    Set<String> set = SharedData.shared().getRegistedTopic();
                    if (!set.isEmpty()) {
                        for (String topic : set) {
                            FirebaseMessaging.getInstance().unsubscribeFromTopic(topic);
                            SharedData.shared().removeAllTopic();
                        }
                    }

                    // 추가
                    String[] list = topic_names.split("&");
                    for (String str : list) {
                        if (str.length() > 0) {
                            FirebaseMessaging.getInstance().subscribeToTopic(str);
                            SharedData.shared().addTopic(str);
                        }
                    }
                    break;
                }
                case "2": {
                    String[] list = topic_names.split("&");
                    for (String str : list) {
                        if (str.length() > 0) {
                            String[] subList = str.split("->");
                            if (subList.length == 2) {
                                FirebaseMessaging.getInstance().unsubscribeFromTopic(subList[0]);
                                FirebaseMessaging.getInstance().subscribeToTopic(subList[1]);

                                SharedData.shared().removeAtTopic(subList[0]);
                                SharedData.shared().addTopic(subList[1]);
                            }
                        }
                    }
                    break;
                }
                case "3": {
                    String[] list = topic_names.split("&");
                    for (String str : list) {
                        if (str.length() > 0) {
                            FirebaseMessaging.getInstance().unsubscribeFromTopic(str);
                            SharedData.shared().removeAtTopic(str);
                        }
                    }
                    break;
                }
                case "4": {
                    Set<String> set = SharedData.shared().getRegistedTopic();
                    if (!set.isEmpty()) {
                        for (String topic : set) {
                            FirebaseMessaging.getInstance().unsubscribeFromTopic(topic);
                            SharedData.shared().removeAllTopic();
                        }
                    }
                    break;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    /**
     * #2-3 app storate 저장
     * @param strkey
     * @param strValue
     */
    @JavascriptInterface
    public static void setUserInfo(String strkey, String strValue) {
        if (strkey == null || strkey.isEmpty()) {
            return;
        }

        SharedData.shared().saveData(strkey, strValue);
    }
    /**
     * #2-4 app storage 불러오기
     * @param strkey
     */
    @JavascriptInterface
    public static void getUserInfo(String strkey) {
        if (strkey == null || strkey.isEmpty()) {
            return;
        }
        String strValue = SharedData.shared().loadData(strkey);
        String strFunc = String.format(Locale.KOREA, "javascript:getUserInfo('%s')", strValue);
        ((MainActivity)m_activity).doCallFuncOnJSP(strFunc);
    }

    /**
     * #2-5 전화번호 가져오기
     */
    @JavascriptInterface
    public static void get_tel_number() {
        if (!PermissionManager.share().isTelephonyPermission()) {
            PermissionManager.share().getTelephonyInfoPermission();
            PermissionManager.share().runTask(permission_telephony_number);
            return;
        }
        String result = null;
        TelephonyManager phoneMgr = (TelephonyManager) m_activity.getSystemService(Context.TELEPHONY_SERVICE);
        assert phoneMgr != null;
        @SuppressLint({"MissingPermission", "HardwareIds"}) String phoneNumber = phoneMgr.getLine1Number();
        if (phoneNumber != null && !phoneNumber.isEmpty()) {
            result = phoneNumber.replace("+82", "0");
        }

        String strQuery = String.format("javascript:result_app_get_tel_number('%s')", result);
        ((MainActivity)m_activity).doCallFuncOnJSP(strQuery);
    }

    private static String m_callNumbrer = null;

    /**
     * #2-6 전화걸기
     * @param number
     */
    @JavascriptInterface
    public static void make_phonecall(final String number) {
        if (number == null || TextUtils.isEmpty(number)) {
            return;
        }

        m_callNumbrer = number;

        if (!PermissionManager.share().isTelephonyPermission()) {
            PermissionManager.share().getTelephonyCallPermission();
            PermissionManager.share().runTask(permission_telephony_call);
            return;
        }

        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                String tel = String.format("tel:%s", m_callNumbrer);
                Intent intent = new Intent(Intent.ACTION_DIAL, Uri.parse(tel));
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                StackManager.currentActivity().startActivity(intent);
                m_callNumbrer = null;
            }
        }, 1000);
    }
    /**
     * 2-7 sns 로그인
     * @param loginType login, logout, signout
     * @param snsType naver
     */
    SnsLoginManager snsLogin;
    @JavascriptInterface
    public void sns_login(String loginType, String snsType) {
        Log.d(TAG, "sns_login:" + loginType + "/" + snsType);
        ((MainActivity)m_activity).snsLogin(loginType, snsType);
    }
    /**
     * #2-8 구글 로그인 - sns_login 으로 대체
     */
    @JavascriptInterface
    public void send_google() {
        Util.toast("deprecated API:sns_login API를 이용하세요.");
    }

    /**
     * #2-9 전체 연락처 가져오기
     * @param state
     */
    @JavascriptInterface
    public void get_contacts(String state) {
        if (!PermissionManager.share().isContactPermission()) {
            PermissionManager.share().getContactPermission();
            PermissionManager.share().runTask(permission_contact_read);
            PermissionManager.share().runTask(permission_contact_write);
            return;
        }
        Log.d(TAG, "getContacts");
        ArrayList<MyContacts> contacts = new ArrayList<MyContacts>();

        Cursor cursor = m_context.getContentResolver().query(
                ContactsContract.Contacts.CONTENT_URI, null, null, null, null);
        if (cursor != null) {
            while (cursor.moveToNext()) {
                MyContacts temp = new MyContacts();
                @SuppressLint("Range") String contactId = cursor.getString(cursor.getColumnIndex(ContactsContract.Contacts._ID));
                @SuppressLint("Range") String name = cursor.getString(cursor.getColumnIndex(ContactsContract.Contacts.DISPLAY_NAME));
                temp.name = name;
                Cursor phoneCursor = m_context.getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                        null, ContactsContract.CommonDataKinds.Phone.CONTACT_ID + "=" + contactId, null, null);
                while (phoneCursor.moveToNext()) {
                    @SuppressLint("Range") String phone = phoneCursor.getString(phoneCursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER));
                    phone = phone.replace("-", "");
                    phone = phone.replace(" ", "");
                    temp.setPhone(temp.phone + "," + phone);
                }
                Cursor noteCursor = m_context.getContentResolver().query(
                        ContactsContract.Data.CONTENT_URI,
                        new String[]{ContactsContract.Data._ID, ContactsContract.CommonDataKinds.Nickname.NAME},
                        ContactsContract.Data.CONTACT_ID + "=?" + " AND " + ContactsContract.Data.MIMETYPE + "='"
                                + ContactsContract.CommonDataKinds.Nickname.CONTENT_ITEM_TYPE + "'",
                        new String[]{contactId}, null);
                if (noteCursor.moveToFirst()) {
                    do {
                        @SuppressLint("Range") String note = noteCursor.getString(noteCursor.getColumnIndex(ContactsContract.CommonDataKinds.Nickname.NAME));
                        temp.note = note;
                        //Log.d(TAG, note);
                    } while (noteCursor.moveToNext());
                }
                noteCursor.close();
                contacts.add(temp);
                phoneCursor.close();
            }
        }else{
            Log.d(TAG, "cursor null");
        }
        cursor.close();
        String strFunc = String.format("javascript:getContactsInfo('success','%s')", contacts.toString());
        Log.d(TAG, "strFunc:"+strFunc);
        doCallFuncOnJSP(strFunc);
    }
    /**
     * #2-10 설치된 앱 사용 시간
     * @param mb_id
     * @param check_time
     * @param start_time
     * @param end_time
     * @param callback_type
     */
    @JavascriptInterface
    public static void app_usage_stats(String mb_id, long check_time, long start_time, long end_time, String callback_type) {
        Log.d(TAG, "app_usage_stats:"+mb_id);
        try {
            AppUsageStats appUsageStats = new AppUsageStats();
            if (appUsageStats.permission) {
                JSONObject dt = appUsageStats.getUsageTime(start_time, end_time);

                String androidId = Settings.Secure.getString(m_context.getContentResolver(), Settings.Secure.ANDROID_ID);
                JSONObject ret = new JSONObject();
                ret.put("mb_id", mb_id);
                ret.put("uuid", androidId);
                ret.put("check_time", check_time);
                ret.put("start_time", start_time);
                ret.put("end_time", end_time);
                ret.put("usage", dt);
                if (callback_type.equals("") || callback_type.equals("js")) {
                    String strFunc = String.format("javascript:result_app_usage_stats('success', '', '%s');", ret.toString());
                    doCallFuncOnJSP(strFunc);
                }else{
                    String hostUrl = BuildConfig.HostUrl;
                    try {
                        URL url = new URL(BuildConfig.HostUrl);
                        hostUrl = url.getProtocol()+"://"+url.getHost()+(url.getPort()>0 ? ":"+url.getPort() : "");
                        Log.d(TAG, "port:"+url.getPort());
                    } catch (MalformedURLException e) {
                        throw new RuntimeException(e);
                    }
                    Log.d(TAG, "d:"+hostUrl);

                    String serverUrl = callback_type;
                    if (serverUrl.equals("server")) serverUrl = hostUrl +"/api/result_app_usage_stats.php";
                    HttpManager api = new HttpManager(serverUrl, HttpManager.Method.POST);
                    api.add("result", "success");
                    api.add("message", "");
                    api.add("data", ret.toString());
                    api.run(new HttpManager.HttpCallbackObject() {
                        @Override
                        public void callback(JSONObject obj) {
                            try {
                                Log.d(TAG, obj.toString());
                                String strFunc = String.format("javascript:result_app_usage_stats('success', '', '%s');", obj.toString());
                                doCallFuncOnJSP(strFunc);
                            } catch (Exception e) {
                                e.printStackTrace();
                            }
                        }
                    });
                }
            }else{
                String strFunc = String.format("javascript:result_app_usage_stats('error', '"+StackManager.currentActivity().getString(R.string.permission_alert)+"', '');");
                doCallFuncOnJSP(strFunc);
            }

        } catch (JSONException e) {
            Log.d(TAG, "appUsageStats:JSONException: "+e.getMessage());
            e.printStackTrace();
        }
    }
    /**
     * #2-11 권한 설정 및 상태
     * @param name [push, location, storage, camera, contact]
     * @param show
     */
    @SuppressWarnings("unused")
    @JavascriptInterface
    public static void permission(String name, String show) {
        Log.d(TAG, "permission:"+name+"/"+show);
        ((MainActivity) m_activity).permission(name, show);
    }

    /*****************************************************************************************************************************
     * #3 Share
     *****************************************************************************************************************************/
    /**
     * #3-1 공유하기
     * @param title
     * @param url
     * @param Description
     */
    @JavascriptInterface
    public void send_share(String title, String url, String Description) {
        if (title == null || title.isEmpty()) {
            Util.toast("title "+SharedData.shared().getApplicationContext().getString(R.string.webview_bad_parameter));
            return;
        }

        if (url == null || url.isEmpty()) {
            Util.toast("url "+SharedData.shared().getApplicationContext().getString(R.string.webview_bad_parameter));
            return;
        }

        if (Description == null || Description.isEmpty()) {
            Util.toast("Description "+SharedData.shared().getApplicationContext().getString(R.string.webview_bad_parameter));
            return;
        }
        Log.d(TAG, "URL:"+url);
        share("{\"cb\":\"result_send_share\", \"title\":\""+title+"\", \"url\":\""+url+"\", \"desc\":\""+Description+"\"}");
    }

    /**
     * #3-2 share
     * @param jdata
     */
    @JavascriptInterface
    public static void share(String jdata) {
        Log.d(TAG, "share:"+jdata);
        String cb = "result_share";
        String title = "";
        String desc = "";
        String url = "";
        try {
            JSONObject Json = new JSONObject(jdata);
            cb = Util.JsonString(Json, "cb", "result_share");
            title = Util.JsonString(Json,  "title");
            desc = Util.JsonString(Json, "desc");
            url = Util.JsonString(Json, "url");
            if (title.isEmpty()) {
                doJsCallback(cb, "The title parameter is missing.");
                return;
            }
        } catch (JSONException e) {
            //throw new RuntimeException(e);
            doJsCallback(cb, e.getMessage());
        }
        //StackManager.rootActivity().convertBase64StringToFileAndStoreIt(base64Data,mimeType);
        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType("text/plain");

        // 공유할 내용 설정
        String shareMessage = "\n" + (desc!="" ? desc + "\n":"") + url;
        Log.d(TAG, "shareMessage: "+title + " / " + shareMessage);

        shareIntent.putExtra(Intent.EXTRA_SUBJECT, title); // 공유 제목
        shareIntent.putExtra(Intent.EXTRA_TEXT, shareMessage); // 공유 본문
        shareIntent.putExtra(Intent.EXTRA_TITLE, title);

        // 공유 다이얼로그 띄우기
        // 새 태스크에서 실행될 경우를 대비해 FLAG_ACTIVITY_NEW_TASK를 추가하는 것이 좋습니다.
        m_activity.startActivity(Intent.createChooser(shareIntent, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        doJsCallback(cb, "success", "success");
    }

    /**
     * #3-3 트위터 공유
     * @param title
     * @param url
     */
    @JavascriptInterface
    public void send_twitter(String title, String url) {
        Util.toast("Deprecated API");
        /*
        try {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            PackageManager pm = StackManager.currentActivity().getPackageManager();
            List<ResolveInfo> activityList = pm.queryIntentActivities(intent, 0);
            String sterLink = null;
            try {
                sterLink = String.format("http://twitter.com/intent/tweet?text=%s&url=%s", URLEncoder.encode(title, "utf-8"), URLEncoder.encode(url, "utf-8"));

                Intent twitter = new Intent(Intent.ACTION_VIEW, Uri.parse(sterLink));
                StackManager.currentActivity().startActivity(twitter);

            } catch (UnsupportedEncodingException ex) {
                ex.printStackTrace();
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
         */
    }

    /**
     * #3-4 페이스북 공유
     * @param title
     * @param url
     */
    @JavascriptInterface
    public void send_facebook(String title, String url) {
        Util.toast("Deprecated API");
        /*
        try {
            // 페이스북
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            PackageManager pm = StackManager.currentActivity().getPackageManager();
            List<ResolveInfo> activityList = pm.queryIntentActivities(intent, 0);
            boolean bFacebook = false;
            for (final ResolveInfo app : activityList) {
                if ((app.activityInfo.name).equals("com.facebook.composer.shareintent.ImplicitShareIntentHandlerDefaultAlias")) {
                    bFacebook = true;

                    final ActivityInfo activity = app.activityInfo;
                    final ComponentName name = new ComponentName(activity.applicationInfo.packageName, activity.name);
                    intent.addCategory(Intent.CATEGORY_LAUNCHER);
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                    intent.setComponent(name);
                    intent.putExtra(Intent.EXTRA_SUBJECT, title);
                    intent.putExtra(Intent.EXTRA_TEXT, url);
                    StackManager.currentActivity().startActivity(intent);
                    break;
                }
            }

            if (!bFacebook) {
                Util.toast("Facebook "+SharedData.shared().getApplicationContext().getString(R.string.webview_app_not_install));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
         */
    }

    /**
     * #3-5 카카오 스토리 공유
     * @param title
     * @param url
     * @param title2
     */
    @JavascriptInterface
    public void send_kakaostory(String title, String url, String title2) {
        Util.toast("Deprecated API");
        /*
        try {
            // 카카오스토리
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            PackageManager pm = StackManager.currentActivity().getPackageManager();
            List<ResolveInfo> activityList = pm.queryIntentActivities(intent, 0);
            boolean bFacebook = false;
            for (final ResolveInfo app : activityList) {
                if ((app.activityInfo.name).contains("kakao.story")) {
                    bFacebook = true;

                    final ActivityInfo activity = app.activityInfo;
                    final ComponentName name = new ComponentName(activity.applicationInfo.packageName, activity.name);
                    intent.addCategory(Intent.CATEGORY_LAUNCHER);
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                    intent.setComponent(name);
                    intent.putExtra(Intent.EXTRA_SUBJECT, title);
                    intent.putExtra(Intent.EXTRA_TEXT, title2 + "\n" + url);
                    StackManager.currentActivity().startActivity(intent);
                    break;
                }
            }

            if (!bFacebook) {
                Util.toast("카카오스토리 "+SharedData.shared().getApplicationContext().getString(R.string.webview_app_not_install));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

         */
    }

    /**
     * #3-6 카카오톡 공유
     * @param title
     * @param url
     * @param title2
     */
    @JavascriptInterface
    public void send_kakaotalk(String title, String url, String title2) {
        Util.toast("Deprecated API");
        /*
        try {
            // 카카오톡
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            PackageManager pm = StackManager.currentActivity().getPackageManager();
            List<ResolveInfo> activityList = pm.queryIntentActivities(intent, 0);
            boolean bFacebook = false;
            for (final ResolveInfo app : activityList) {
                if ((app.activityInfo.name).contains("kakao.talk")) {
                    bFacebook = true;

                    final ActivityInfo activity = app.activityInfo;
                    final ComponentName name = new ComponentName(activity.applicationInfo.packageName, activity.name);
                    intent.addCategory(Intent.CATEGORY_LAUNCHER);
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                    intent.setComponent(name);
                    intent.putExtra(Intent.EXTRA_SUBJECT, title);
                    intent.putExtra(Intent.EXTRA_TEXT, title2 + "\n" + url);
                    StackManager.currentActivity().startActivity(intent);
                    break;
                }
            }
            if (!bFacebook) {
                Util.toast("카카오톡 "+SharedData.shared().getApplicationContext().getString(R.string.webview_app_not_install));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
         */
    }

    /*****************************************************************************************************************************
     * #4 File
     *****************************************************************************************************************************/
    /**
     * #4-1 파일 업로드
     */
    @JavascriptInterface
    public static void file_upload_process() {
        Log.d(TAG, "file_upload_process");
        // 파일 업로드는 이미지 업로드를 포함하며,
        // 이미지 리사이징 작업을 위하여 쓰기 권한도 필요로 한다.
        if (!PermissionManager.share().isStorageReadPermission()) {
            PermissionManager.share().getStorageReadPermission();
            PermissionManager.share().getStorageWritePermission();
            PermissionManager.share().runTask(permission_total);
            return;
        }
        fileUploadFromChooser();
    }
    public static String m_camFilePath;

    /**
     * #4-2 카메라 업로드
     */
    @JavascriptInterface
    public static void file_cam_upload_process() {
        removeDialog();

        if (!Util.isSDCARDMounted()) {
            Util.toast(SharedData.shared().getApplicationContext().getString(R.string.webview_bad_sdcard));
            return;
        }

        if (!PermissionManager.share().isCamearaPermission()) {
            PermissionManager.share().getCamearaPermission();
            PermissionManager.share().runTask(permission_camera_take);
            return;
        }
        cameraImageUpload();
    }

    /**
     * $4-3 동영상 촬영
     */
    @JavascriptInterface
    public static void file_video_upload_process() {
        removeDialog();

        if (!Util.isSDCARDMounted()) {
            Util.toast(SharedData.shared().getApplicationContext().getString(R.string.webview_bad_sdcard));
            return;
        }

        if (!PermissionManager.share().isCamearaPermission()) {
            PermissionManager.share().getCamearaPermission();
            PermissionManager.share().runTask( permission_camera_take);
            return;
        }

        takeVedioApp();
    }

    public static void fileUploadFromChooser() {
        if (PermissionManager.share().isStorageReadPermission()) {
            Intent target = new Intent(Intent.ACTION_GET_CONTENT);
            target.setType("*/*");
            target.addCategory(Intent.CATEGORY_OPENABLE);
            target.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

            Intent intent = Intent.createChooser(target, SharedData.shared().getApplicationContext().getString(R.string.webview_file_chooser));
            try {
                StackManager.mainActivity().startActivityForResult(intent, file_upload);
            } catch (ActivityNotFoundException e) {
                e.printStackTrace();
            }
        }
    }
    public static void doFileUpload(String filePath, final LusoftCallback lusoftCallback) {
        // 파일 업로드
        if (filePath == null) {
            Toast.makeText(m_context, SharedData.shared().getApplicationContext().getString(R.string.webview_bad_upload_path), Toast.LENGTH_SHORT).show();
            return;
        }

        StackManager.mainActivity().showProgressDlg();

        File file = new File(filePath);
        String fileExt = FileUtils.getExtension(filePath).toLowerCase();
        if (fileExt.contains("jpg") || fileExt.contains("jpeg")) { // 위 파일 포멧만 리사이즈
            file = Util.resizeImage(filePath);
        }
        String encodeFilename = file.getName();
//        try {
//            byte[] utf8StringBuffer = fileName.getBytes("utf-8");
//            encodeFilename = new String(utf8StringBuffer, "utf-8");
//            encodeFilename = URLEncoder.encode(fileName, "UTF-8");
//              Log.e(TAG, encodeFilename);
//           } catch (UnsupportedEncodingException e) {
//              e.printStackTrace();
//          }

        HttpManager api = new HttpManager(BuildConfig.HostUrl + "/api/api_fileupload.php", HttpManager.Method.POST, true);
        api.add("app_version", SharedData.shared().getVersion());
        api.add("upFile", file, encodeFilename);
        api.run(new HttpManager.HttpCallbackObject() {
            @Override
            public void callback(JSONObject obj) {
                final String result_code;
                final String org_filename = obj.optString("org_filename");
                final String filename = obj.optString("filename");
                final String type = obj.optString("type");

                if (obj.optString("result").equals("ok")) {
                    result_code = "success";
                } else {
                    result_code = "error";
                    String message;
                    try {
                        String result_text = obj.optString("result_text");
                        message = URLDecoder.decode(result_text, "UTF-8");
                        Log.e(TAG, message);
                    } catch (UnsupportedEncodingException e1) {
                        e1.printStackTrace();
                    }
                }

                String strQuery = "javascript:file_upload_process_result('" + result_code + "','" + org_filename + "','" + filename + "','" + type + "')";
                if (lusoftCallback != null) {
                    lusoftCallback.fileUpload(strQuery);
                } else {
                    doCallFuncOnJSP(strQuery);
                }
                StackManager.mainActivity().dissmissProgressDlg();
            }
        });
    }

    @SuppressWarnings("unused")
    public static void doFileMultiUpload(ArrayList<String> strFilePaths, final LusoftCallback lusoftCallback) {
        final int nCount = strFilePaths.size();
        final JSONArray results = new JSONArray();
        for (int i = 0; i < nCount; i++) {
            String filePath = strFilePaths.get(i);

            File file = new File(filePath);
            String fileName = file.getName();
            String fileExt = FileUtils.getExtension(filePath).toLowerCase();
            if (fileExt.contains("jpg") || fileExt.contains("jpeg")) { // 위 파일 포멧만 리사이즈
                file = Util.resizeImage(filePath);
            }

            HttpManager api = new HttpManager(BuildConfig.HostUrl + "/api/api_fileupload.php", HttpManager.Method.POST, true);
            api.add("app_version", SharedData.shared().getVersion());
            api.add("upFile", file, fileName);
            api.run(new HttpManager.HttpCallbackObject() {
                @Override
                public void callback(JSONObject obj) {
                    results.put(obj);
                    if (results.length() == nCount) {
                        String strQuery = String.format("javascript:image_multiple_process_result('success', '%s')", results.toString());
                        doCallFuncOnJSP(strQuery);
                        if (lusoftCallback != null) {
                            lusoftCallback.fileMultiUpload(results);
                        }
                    }
                }
            });

            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }

    /**
     * #4-4 파일 다운로드
     * @param url
     * @param mode
     * @param file_name
     * @param file_name_org
     */
    @JavascriptInterface
    public static void download_file(String url, final String mode, final String file_name, String file_name_org) {
        Log.d(TAG, "download_file:"+url);
        if (url == null || url.isEmpty()) {
            Util.toast("url "+SharedData.shared().getApplicationContext().getString(R.string.webview_bad_parameter));
            return;
        }

        if (mode == null || mode.isEmpty()) {
            Util.toast("mode "+SharedData.shared().getApplicationContext().getString(R.string.webview_bad_parameter));
            return;
        }

        if (file_name == null || file_name.isEmpty()) {
            Util.toast("file_name "+SharedData.shared().getApplicationContext().getString(R.string.webview_bad_parameter));
            return;
        }

        if (file_name_org == null || file_name_org.isEmpty()) {
            Util.toast("file_name_org "+SharedData.shared().getApplicationContext().getString(R.string.webview_bad_parameter));
            return;
        }
        DownloadInfo info = new DownloadInfo();
        info.setDownload_url(url);
        info.setDownload_mode(mode);
        info.setDownload_file_name(file_name);
        info.setDownload_file_name_org(file_name_org);
        DownloadMng.manage().addInfo(info);
        if (!PermissionManager.share().isStorageReadPermission()) {
            //Util.toast("Storage Write 권한이 없습니다.");
            //return;
        }
        Lusoft.downloadFile();
    }

    public static void downloadFile() {
        Log.d(TAG, "downloadFile");
        if (DownloadMng.manage().getCount() == 0) {
            Util.toast(SharedData.shared().getApplicationContext().getString(R.string.webview_bad_downloadfile));
            return;
        }

        if (!PermissionManager.share().isStorageWritePermission()) {
            //Util.toast("Storage Write 권한이 없습니다..");
            //return;
        }

        DownloadInfo lastTask = DownloadMng.manage().getLastObject();

        final String downloadTitle = m_context.getString(R.string.app_name);
        final String description = lastTask.getDownload_file_name_org();
        final String dirPathMain = Environment.DIRECTORY_DOWNLOADS;
        final String dirPathSub = "/" + downloadTitle + "/" + description;
        final String makePath = dirPathMain + dirPathSub;
        final String fullPath = Environment.getExternalStoragePublicDirectory(makePath).getAbsolutePath();
        final Uri downloadURI = Uri.parse(lastTask.getDownload_url());

        //Download/{프로젝트명} 폴더가 없고 파일명로 존재하는 경우 toast
        String dirDownloadPath = dirPathMain+"/"+downloadTitle;
        File dirDownload = Environment.getExternalStoragePublicDirectory(dirDownloadPath);
        Log.d(TAG, "dirDownload:"+dirDownload.getAbsolutePath());
        if (!dirDownload.isDirectory() && dirDownload.isFile()) {
            Util.toast(String.format(Locale.KOREA, SharedData.shared().getApplicationContext().getString(R.string.webview_bad_savepath), dirDownloadPath));
            return;
        }
        /*
        File findFile = new File(fullPath);
        boolean isExist = findFile.exists();
        Log.d(TAG, "isExist:"+isExist);
        if (isExist) {
            String message = String.format("이미 존재하는 파일입니다.\n경로:%s", fullPath);
            Toast.makeText(m_context, message, Toast.LENGTH_SHORT).show();
            return;
        }
         */
        Log.d(TAG, "downloadURI:"+downloadURI.toString());
        DownloadManager.Request request = new DownloadManager.Request(downloadURI);
        request.setTitle(downloadTitle);
        request.setDescription(description);
        request.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI | DownloadManager.Request.NETWORK_MOBILE);
        request.setVisibleInDownloadsUi(false);
        request.setAllowedOverRoaming(true);
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        request.allowScanningByMediaScanner();
        request.setDestinationInExternalPublicDir(dirPathMain, dirPathSub);

        final DownloadManager manager = (DownloadManager) m_context.getSystemService(Context.DOWNLOAD_SERVICE);
        assert manager != null;
        String cookieString = CookieManager.getInstance().getCookie(downloadURI.toString());
        request.addRequestHeader("cookie", cookieString);

        long queueID = manager.enqueue(request);

        lastTask.setDownload_id(queueID);
        lastTask.setDownload_file_fullpath(fullPath);
        lastTask.setDownload_title(downloadTitle);
        DownloadMng.manage().replaceObject(lastTask);
    }

    //
    // camera upload ---------- ---------- ---------- ---------- ----------
    //

    /**
     * #4-5 이미지 다중 업로드
     * @param count
     */
    @JavascriptInterface
    public static void image_gallery_upload_multiple(String count) {
        image_gallery_upload_multiple(count, "");
    }

    @SuppressWarnings("unused")
    @JavascriptInterface
    public static void image_gallery_upload_multiple(String count,String type) {
        removeDialog();
        try {
            //包名
            String pkName = getPackageName();
            if (!Util.isSDCARDMounted()) {
                Util.toast(SharedData.shared().getApplicationContext().getString(R.string.webview_bad_sdcard));
                return;
            }

            if (!PermissionManager.share().isCamearaPermission()) {
                PermissionManager.share().getCamearaPermission();
                PermissionManager.share().runTask(permission_camera_take);
                return;
            }

            ((MainActivity)m_activity).doMultiSelectonGallary(count,type);
        } catch (Exception e) {
        }
    }
    /**
     * #4-7 base64 blob data     *
     * @param base64Data
     * @param mimeType
     * @throws IOException
     */
    @JavascriptInterface
    public static void getBase64FromBlobData(String base64Data, String mimeType) throws IOException {
        Log.d(TAG, "getBase64FromBlobData:"+mimeType +"/"+ base64Data);
        StackManager.mainActivity().convertBase64StringToFileAndStoreIt(base64Data,mimeType);
    }

    /*****************************************************************************************************************************
     * #5 GPS
     *****************************************************************************************************************************/
    /**
     * 5-1 GPS정보
     */
    @JavascriptInterface
    public void get_gps() {
        get_gps("");
    }
    @SuppressWarnings("unused")
    @JavascriptInterface
    public void get_gps(String r) {
        Log.d(TAG, "get_gps:"+PermissionManager.share().isGPSPermission());
        if (!PermissionManager.share().isGPSPermission()) {
            PermissionManager.share().getGPSPermission();
            PermissionManager.share().runTask(permission_gps_info);
            return;
        }
        gpsAccessed(r);
    }
    private static GPSManager m_gps = null;
    @SuppressWarnings("unused")
    public static void gpsAccessed(String r) {
        if (m_gps == null) {
            m_gps = new GPSManager(locationChange, r);
        }

        if (!m_gps.IsAvail()) {
            m_gps.showGPSAlert();
        } else {
            m_gps.doRun();
        }
    }

    @SuppressWarnings("unused")
    private static GPSManager.OnEventLocationChange locationChange = new GPSManager.OnEventLocationChange() {
        @Override
        public void callback(final String result, final double latitude, final double longitude, final String provider, final String usercode) {
            Log.d(TAG, "result:"+result);
            new Handler().post(new Runnable() {
                @Override
                public void run() {
                    @SuppressLint("DefaultLocale") String strQuery = String.format("javascript:get_gps_result('%s', '%f', '%f', '%s', '%s')", result, latitude, longitude, provider, usercode);
                    doCallFuncOnJSP(strQuery);
                    m_gps.stop();
                }
            });
        }
    };
    /**
     * 지도 경로 탐색
     * @param strType
     * @param strStartLat
     * @param strStartLon
     * @param strEndLat
     * @param strEndLon
     * @param strEndName
     * @param strEndAddress
     */
    @JavascriptInterface
    public void routeShare(String strType, String strStartLat, String strStartLon, String strEndLat, String strEndLon, String strEndName, String strEndAddress) {
        try {
            if (TextUtils.isEmpty(strType)) {
                strType = "all";
            }
            switch (strType.trim()) {
                case "kakao": {
                    String uri = "daummaps://route?sp="+ strStartLat + "," + strStartLon +"&ep=" + strEndLat + "," + strEndLon + "&by=CAR";
                    Intent intent = new Intent(android.content.Intent.ACTION_VIEW, Uri.parse(uri));

                    PackageManager packageManager = m_context.getPackageManager();
                    List<ResolveInfo> activities = packageManager.queryIntentActivities(intent,
                            PackageManager.MATCH_DEFAULT_ONLY);
                    boolean isIntentSafe = activities.size() > 0;

                    if (!isIntentSafe) {
                        Util.toast("카카오맵 "+SharedData.shared().getApplicationContext().getString(R.string.webview_install_try));
                        StackManager.currentActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("http://play.google.com/store/apps/details?id=net.daum.android.map")));
                        return;
                    }
                    StackManager.currentActivity().startActivity(intent);
                    break;
                }
                case "naver": {
                    String uri = "navermaps://?menu=route&routeType=4&elat=" + strEndLat + "&elng=" + strEndLon + "&etitle=" + strEndName;
                    Intent intent = new Intent(android.content.Intent.ACTION_VIEW, Uri.parse(uri));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    PackageManager packageManager = m_context.getPackageManager();
                    List<ResolveInfo> activities = packageManager.queryIntentActivities(intent,
                            PackageManager.MATCH_DEFAULT_ONLY);
                    boolean isIntentSafe = activities.size() > 0;
                    if (!isIntentSafe) {
                        Util.toast("네이버맵 "+SharedData.shared().getApplicationContext().getString(R.string.webview_install_try));
                        StackManager.currentActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("http://play.google.com/store/apps/details?id=com.nhn.android.nmap")));
                        return;
                    }
                    StackManager.currentActivity().startActivity(intent);
                    break;
                }
                case "tmap": {
                    String uri = "tmap://route?goalname=" + strEndName + "&goalx="+strEndLon+"&goaly="+strEndLat;
                    Intent intent = new Intent(android.content.Intent.ACTION_VIEW, Uri.parse(uri));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    PackageManager packageManager = m_context.getPackageManager();
                    List<ResolveInfo> activities = packageManager.queryIntentActivities(intent,
                            PackageManager.MATCH_DEFAULT_ONLY);
                    boolean isIntentSafe = activities.size() > 0;
                    if (!isIntentSafe) {
                        Util.toast("TMap "+SharedData.shared().getApplicationContext().getString(R.string.webview_install_try));
                        StackManager.currentActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("http://play.google.com/store/apps/details?id=com.skt.tmap.ku")));
                        return;
                    }
                    StackManager.currentActivity().startActivity(intent);
                    break;
                }
                case "google": {
                    String uri = null;
                    if (!TextUtils.isEmpty(strEndAddress)) {
                        uri = "http://maps.google.com/maps?daddr=" + strEndAddress;
                    } else {
                        if (!TextUtils.isEmpty(strEndLat) && !TextUtils.isEmpty(strEndLon)) {
                            uri = "http://maps.google.com/maps?daddr=" + strEndLat + "," + strEndLon;
                        }
                    }

                    if (uri != null) {
                        Intent intent = new Intent(android.content.Intent.ACTION_VIEW, Uri.parse(uri));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        StackManager.currentActivity().startActivity(intent);
                    } else {
                        Util.toast(SharedData.shared().getApplicationContext().getString(R.string.webview_bad_target));
                    }
                    break;
                }
                case "all": {
                    String strURI = String.format("geo:0,0?q=%s", strEndAddress);
                    Intent intent = new Intent(android.content.Intent.ACTION_VIEW, Uri.parse(strURI));
                    //
                    //intent.setPackage("");
                    //
                    String title = "";
                    Intent chooser = Intent.createChooser(intent, title);
                    if (intent.resolveActivity(m_activity.getPackageManager()) != null) {
                        StackManager.currentActivity().startActivity(chooser);
                    } else {
                        Util.toast(SharedData.shared().getApplicationContext().getString(R.string.webview_bad_app));
                    }
                    break;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /*****************************************************************************************************************************
     * #6 admob
     *****************************************************************************************************************************/
    /**
     * #6-1 google admob
     * @param type
     * @param view
     */
    @JavascriptInterface
    public static void AdMob(final String type, final String view) {
        StackManager.mainActivity().adMob(type, view);
    }

    /**
     * #6-4 google admob full banner
     * @param url
     */
    @JavascriptInterface
    public static void showFullBanner(final String url) {
        StackManager.mainActivity().adMob("full", "show");
    }

    /*****************************************************************************************************************************
     * #7 payment
     *****************************************************************************************************************************/
    /**
     * 7-1 인앱 구매
     * @param strIndex
     */
    @JavascriptInterface
    public static void payment_iap_item(final String strIndex) {
        payment_iap_item(strIndex, "S");
    }
    /**
     * 인앱구매
     * @param strIndex
     * @param subs
     */
    @SuppressWarnings("unused")
    @JavascriptInterface
    public static void payment_iap_item(final String strIndex, String subs) {
        Log.d(TAG,"payment_iap_item:"+strIndex);
        if (strIndex != null && !strIndex.isEmpty()) {
            new Handler().post(new Runnable() {
                @Override
                public void run() {
                    ((MainActivity)m_activity).setM_sku(strIndex.trim(), subs);
                }
            });
        }
    }

    /*****************************************************************************************************************************
     * #8 Child View
     *****************************************************************************************************************************/
    /**
     * #8-1 웹뷰, 차일드뷰  추가
     * @param url
     */
    @SuppressWarnings("unused")
    @JavascriptInterface
    public static void addChildView(String url) {
        Util.toast("Deprecated API");
    }
    @SuppressWarnings("unused")
    @JavascriptInterface
    public static void doHistoryBack(String reload) {
        Util.toast("Deprecated API");
    }
    @SuppressWarnings("unused")
    @JavascriptInterface
    public static void removeChildAllView() {
        Util.toast("Deprecated API");
    }

    @SuppressWarnings("unused")
    private static void removeDialog() {
        if (m_dialog != null && m_dialog.isShowing()) {
            m_dialog.dismiss();
            m_dialog = null;
        }
    }

    /*****************************************************************************************************************************
     * #9 Util
     *****************************************************************************************************************************/
    /**
     * #9-1 웹뷰 디버그
     * @param yn : Y,N
     */
    @SuppressWarnings("unused")
    @JavascriptInterface
    public static void webviewDebug(String yn) {
        Log.d(TAG, "webviewDebug:"+yn);
        StackManager.currentWebView().setWebContentsDebuggingEnabled(yn.equals("Y")?true:false);
    }









    /*****************************************************************************************************************************
     * #Z 기타 공용 함수
     *****************************************************************************************************************************/
    /**
     * @return PackageName
     */
    @SuppressWarnings("unused")
    public static synchronized String getPackageName() {
        try {
            return Util.getPackageName(StackManager.rootActivity());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    @SuppressWarnings("unused")
    public static void takeCameraApp() {
        m_dialog = new AlertDialog.Builder(m_activity).create();
        m_dialog.setTitle(SharedData.shared().getApplicationContext().getString(R.string.webview_camera_capture));
        m_dialog.setMessage("");
        m_dialog.setButton(AlertDialog.BUTTON_POSITIVE, SharedData.shared().getApplicationContext().getString(R.string.webview_picture_capture), new DialogInterface.OnClickListener() {
            public void onClick(final DialogInterface dialog, int id) {
                new Handler().postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        cameraImageUpload();
                    }
                }, 1000);
            }
        });
        m_dialog.setButton(AlertDialog.BUTTON_NEUTRAL, SharedData.shared().getApplicationContext().getString(R.string.common_cancel), new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
            }
        });
        m_dialog.show();
    }

    public static void cameraImageUpload() {
        if (PermissionManager.share().isCamearaPermission()) {
            File imageRoot = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), BuildConfig.FLAVOR);
            if (!imageRoot.exists()) {
                imageRoot.mkdirs();
            }

            File upload_file = new File(imageRoot, System.currentTimeMillis() + ".png");
            m_camFilePath = upload_file.getAbsolutePath();
            Uri camFileUri = FileProvider.getUriForFile(m_activity, BuildConfig.APPLICATION_ID + ".provider", new File(m_camFilePath));

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, camFileUri);
            intent.putExtra("return-data", true);
            ((MainActivity)m_activity).startActivityForResult(intent, file_upload_image);
        }
    }

    public static void takeVedioApp() {
        m_dialog = new AlertDialog.Builder(m_activity).create();
        m_dialog.setTitle(SharedData.shared().getApplicationContext().getString(R.string.webview_camera_capture));
        m_dialog.setMessage("");
        m_dialog.setButton(AlertDialog.BUTTON_POSITIVE, SharedData.shared().getApplicationContext().getString(R.string.webview_movie_capture), new DialogInterface.OnClickListener() {
            public void onClick(final DialogInterface dialog, int id) {
                new Handler().postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        cameraVideoUpload();
                    }
                }, 1000);
            }
        });
        m_dialog.setButton(AlertDialog.BUTTON_NEUTRAL, SharedData.shared().getApplicationContext().getString(R.string.common_cancel), new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
            }
        });
        m_dialog.show();
    }

    @SuppressWarnings("unused")
    @JavascriptInterface
    public static void cameraVideoUpload() {
        if (PermissionManager.share().isCamearaPermission()) {
            File file = m_activity.getExternalFilesDir(null);
            assert file != null;
            m_camFilePath = file.getAbsolutePath() + "/lusoft_temp_" + System.currentTimeMillis() + ".mp4";
            Uri camFileUri = FileProvider.getUriForFile(m_activity, BuildConfig.APPLICATION_ID + ".provider", new File(m_camFilePath));

            Intent intent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, camFileUri);
            intent.putExtra("return-data", true);
            m_activity.startActivityForResult(intent, file_upload_video);
        }
    }







}
