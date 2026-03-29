package kr.co.lusoft.ui;

import static com.google.zxing.integration.android.IntentIntegrator.REQUEST_CODE;
import static kr.co.lusoft.core.Constants.NOTIFICATION_SHOW_INTERVAL;
import static kr.co.lusoft.core.Constants.Permission.permission_body_sensor;
import static kr.co.lusoft.core.Constants.Permission.permission_calendar_read;
import static kr.co.lusoft.core.Constants.Permission.permission_calendar_write;
import static kr.co.lusoft.core.Constants.Permission.permission_camera_take;
import static kr.co.lusoft.core.Constants.Permission.permission_contact_read;
import static kr.co.lusoft.core.Constants.Permission.permission_contact_write;
import static kr.co.lusoft.core.Constants.Permission.permission_gps_info;
import static kr.co.lusoft.core.Constants.Permission.permission_push;
import static kr.co.lusoft.core.Constants.Permission.permission_recode_audio;
import static kr.co.lusoft.core.Constants.Permission.permission_sms_read;
import static kr.co.lusoft.core.Constants.Permission.permission_sms_write;
import static kr.co.lusoft.core.Constants.Permission.permission_storage_read;
import static kr.co.lusoft.core.Constants.Permission.permission_storage_write;
import static kr.co.lusoft.core.Constants.Permission.permission_telephony_call;
import static kr.co.lusoft.core.Constants.Permission.permission_telephony_number;
import static kr.co.lusoft.core.Constants.Permission.permission_total;
import static kr.co.lusoft.core.Constants.Task.file_chooser_camera_image;
import static kr.co.lusoft.core.Constants.Task.file_chooser_camera_video;
import static kr.co.lusoft.core.Constants.Task.file_chooser_lollipop;
import static kr.co.lusoft.core.Constants.Task.file_gallery_multi;
import static kr.co.lusoft.core.Constants.Task.file_gallery_single;
import static kr.co.lusoft.core.Constants.Task.file_upload;
import static kr.co.lusoft.core.Constants.Task.file_upload_chrome;
import static kr.co.lusoft.core.Constants.Task.file_upload_image;
import static kr.co.lusoft.core.Constants.Task.file_upload_lollipop;
import static kr.co.lusoft.core.Constants.Task.file_upload_video;

import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.firebase.appindexing.FirebaseAppIndex;
import com.google.firebase.appindexing.Action;
import com.google.firebase.appindexing.Indexable;
import com.google.firebase.appindexing.builders.Actions;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.ProgressDialog;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.RemoteException;
import android.os.StrictMode;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Base64;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.MimeTypeMap;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.TaskStackBuilder;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.bumptech.glide.Glide;
import com.google.android.gms.auth.api.Auth;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInResult;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.android.gms.tasks.Task;
import com.google.firebase.appindexing.builders.Indexables;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;


import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLDecoder;
import java.text.DateFormat;
import java.util.Date;
import java.util.Hashtable;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.Timer;
import java.util.TimerTask;
import java.lang.Object;

import kr.co.lusoft.BuildConfig;
import kr.co.lusoft.R;
import kr.co.lusoft.core.Config;
import kr.co.lusoft.core.Constants;
import kr.co.lusoft.core.Lusoft;
import kr.co.lusoft.core.WebClient;
import kr.co.lusoft.databinding.ActivityMainBinding;
import kr.co.lusoft.func.HttpManager;
import kr.co.lusoft.func.PermissionManager;
import kr.co.lusoft.func.ReflectManager;
import kr.co.lusoft.module.AdMobManager;
import kr.co.lusoft.module.AppUsageStats;
import kr.co.lusoft.module.BillingManager;
import kr.co.lusoft.module.SnsLoginManager;
import kr.co.lusoft.notification.NotificationTools;
import kr.co.lusoft.notification.download.DownloadInfo;
import kr.co.lusoft.notification.download.DownloadItem;
import kr.co.lusoft.notification.download.DownloadMng;
import kr.co.lusoft.notification.fcm.FCM;
import kr.co.lusoft.notification.fcm.FCMItem;
import kr.co.lusoft.util.FileUtils;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.StackManager;
import kr.co.lusoft.util.StatusBarUtils;
import kr.co.lusoft.util.Util;



public class MainActivityA extends AppCompatActivity implements View.OnTouchListener{

    private String TAG = "*[MainActivityA]";
    @SuppressLint("StaticFieldLeak")
    public static Context m_context = null;
    public static Activity m_activity = null;

    @SuppressLint("StaticFieldLeak")
    public static WebView m_mainWebview = null;
    @SuppressLint("StaticFieldLeak")
    public static FrameLayout m_container;

    private ImageView m_loading = null;
    private ProgressDialog m_progressDlg = null;

    @SuppressLint("StaticFieldLeak")
    private static RelativeLayout m_notificationAlert = null;
    @SuppressLint("StaticFieldLeak")
    private static TextView m_notiTitle = null;
    @SuppressLint("StaticFieldLeak")
    private static TextView m_notiDescription = null;

    public static final int DIALOG_ISP = 2;
    public static final int DIALOG_CARDAPP = 3;
    public static String DIALOG_CARDNM;
    public static AlertDialog m_alertIsp = null;

    //    private BillingManager mInApp = null;
    public String m_sku = null;
    public String codeType = "qrcode";
    private long m_nBackKeyExitTime = 0L;
    private BroadcastReceiver downloadComplete = null;
    public int back_state = 0;
    public TextView buttonBack;

    private String jumpUrl;

    public ActivityMainBinding binding;
    private boolean splashView = true;

    //install referrer
    private InstallReferrerClient referrerClient;

    //퍼미션 activity 종료 리턴 받기
    private ActivityResultLauncher<Intent> permissionActivityLauncher;


    @Override
    @SuppressLint("SourceLockedOrientationActivity")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(TAG, "onCreate");
        StackManager.addActivity(this);
        m_context = this;
        m_activity = this;
        // "앱의 콘텐츠 뷰(DecorView)가 시스템 윈도우(상태 표시줄, 네비게이션 바 등)에 맞춰 자동으로 크기를 조절할 것인가?" 를 설정합니다.
        // •true (현재 코드): 비활성화 상태입니다. 앱의 콘텐츠가 상태 표시줄(status bar)과 네비게이션 바(navigation bar) 아래에만 그려지도록 합니다.
        // 즉, 시스템 UI 영역을 침범하지 않고 그 안쪽에만 앱 화면이 표시됩니다. 이것은 전통적인 방식입니다.
        // •false: 활성화 상태입니다. 앱의 콘텐츠가 화면 전체, 즉 상태 표시줄과 네비게이션 바 영역까지 확장되어 그려지게 됩니다. 이를 '엣지 투 엣지'라고 부릅니다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
        }

        //퍼미션 activity callback
        permissionActivityLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    Log.d(TAG, "PermissionActivity가 종료되었습니다.");
                    //splash 표시
                    splashCheck(false);
                }
        );

        //Log.d(TAG, "first:"+ Util.checkFirstRun());
        if (Util.checkFirstRun()) { //첫실행 - 퍼미션 activity에서 확인을 누르면 false가 됨
            Log.d(TAG, "첫실행");
            //권한 activity
            if(Config.shared(this).isPermissionInfo()) {
                new Handler().postDelayed(new Runnable() {
                    @Override
                    public void run() {

                        Intent intent = new Intent(getApplicationContext(), PermissionActivity.class);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
                        permissionActivityLauncher.launch(intent);
                    }
                },10);
            }
            //install referrer 첵
            checkInstallReferrer();
        }else{//두번째 실행부터
            //splash 표시
            splashCheck();
        }


        //StrictMode의 가상 머신(VM) 관련 정책 검사를 모두 비활성화하여, 메모리 누수나 파일 URI 노출과 같은 잠재적인 오류를 감지하지 않도록 만드는 역할을 합니다.
        StrictMode.VmPolicy.Builder builder = new StrictMode.VmPolicy.Builder();
        StrictMode.setVmPolicy(builder.build());

        //스샷 불가 체크
        JSONObject permissionInfo = Config.shared(this).getPermissionFromAsset();
        if (permissionInfo.has("capture")) {
            try {
                Log.d(TAG, "capture:" + permissionInfo.getBoolean("capture"));
                if (permissionInfo.getBoolean("capture") == false) {
                    Log.d(TAG, "캡처 불가");
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);//갭처 불가
                }
            } catch (JSONException e) {
                throw new RuntimeException(e);
            }
        }

        //mainactivity layout binding
        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        //setContentView(R.layout.activity_main);


        // 배경색을 기준으로 상태바 아이콘 색상 설정
        int backgroundColor = ContextCompat.getColor(this, R.color.colorStatusBar);
        String hexColor = String.format("#%08X", (0xFFFFFFFF & backgroundColor));
        StatusBarUtils.setStatusBarIconColor(this, backgroundColor);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            Log.d(TAG,"----------------:"+R.color.colorStatusBar);
            getWindow().setStatusBarColor(ContextCompat.getColor(this, R.color.colorStatusBar));
        }

        // Support orientation
        if(!BuildConfig.LandScape) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }

        Log.d(TAG, "hashKey: " +Util.getHashKey());
        // 스토리지 클래스 초기화
        SharedData.shared().init(this);
        Log.d(TAG, "fcm-token:"+SharedData.shared().loadData(SharedData.FCMToken));
        //
        // Webview setting
        //
        initMainActivity();
        //
        // 외부 데이터(외부 링크)가 들어올 경우, 인트로에서 부터 타고 들어옴.
        //
        if (getIntent() != null) {
            String action = getIntent().getAction();
            Log.d(TAG, "action:"+action);
            // From, external link
            if (getIntent().getData() != null) {
                taskFromExternal();
            }
            // From, notibar click, deeplink
            if (getIntent().getExtras() != null) {
                String taskID = getIntent().getStringExtra(Constants.NotificationExtraData.eTaskID.getValue());
                if (!TextUtils.isEmpty(taskID)) {
                    Log.d(TAG, "task_id:"+taskID);
                    taskNotification(taskID);
                }else if (getIntent().hasExtra("download_file_filePath")){
                    //Log.d(TAG, getIntent().ha
                    Log.d(TAG, getIntent().getStringExtra("download_file_filePath"));

                    File file = new File(getIntent().getStringExtra("download_file_filePath"));
                    Uri attachmentUri = FileProvider.getUriForFile(getApplicationContext(), getApplicationContext().getPackageName()+".provider", file);
                    Intent openAttachmentIntent = new Intent(Intent.ACTION_VIEW);
                    openAttachmentIntent.setDataAndType(attachmentUri, FileUtils.getMimeType(file));
                    openAttachmentIntent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(openAttachmentIntent);

                    return;
                }
            }
        }
        //
        // FCM setting
        //
        Log.d(TAG, "BuildConfig.Notification:"+BuildConfig.Notification);
        if (BuildConfig.Notification) {
            FCM.registTopic(); // test Topic
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(new OnSuccessListener<String>() {
                @Override
                public void onSuccess(String token) {
                    if (!TextUtils.isEmpty(token)) {
                        SharedData.shared().saveData(SharedData.FCMToken, token);
                        Util.log("fcm token = " + SharedData.shared().loadData(SharedData.FCMToken), TAG);
                    }
                }
            });
        }
        initNotiAlert();
        // IAP Setting InitializeApp
//        if(BillingManager.isIAB(this)) {
//            mInApp = new BillingManager(this);
//            mInApp.setOnResultListener(resultListener);
//        }
        //
        // Permission manager Loading
        //
        //PermissionManager.share().Init(this);
        //
        // Gif Start
        //
        if(BuildConfig.ShowLoading) {
            m_loading = findViewById(R.id.iv_gif);
            Glide.with(this).load(R.drawable.loading).centerCrop().into(m_loading);
            setShowLoading(true);
        }
        FirebaseAuth.getInstance();
        buttonBack = findViewById(R.id.button_player);
//        buttonBack.setAlpha(0);
        buttonBack.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (v.getAlpha() > 0){
                    backPressed();
                }
            }
        });

        //google admob banner load
        adMobLoad("banner");
        adMobLoad("fullFirst");

        //fcm channel reg
        NotificationTools.channelReg(this);

        //유효한 install referrer check
        runInstallReferrer();

        //onBackPressed() 메서드가 deprecated되어 대체
        backPressed();
        Log.d(TAG, "onCreate end");

    }

    /**
     * 스플래시 표시
     */
    private void splashCheck(){
        splashCheck(true);
    }
    private void splashCheck(boolean delay){

        int splash = Config.shared(this).getConfigInt("splash");
        Log.d(TAG, "splash:"+splash);
        if (Build.VERSION.SDK_INT < 31 || splash == 1) {
            Intent intent = new Intent(getApplicationContext(), IntroActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
            startActivity(intent);

        }else{
            //스플래시 닫기
            //3초나 웹페이지 finish 이벤트 중 빠른거에 닫기
            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    Log.d(TAG, "splashView:" + splashView);
                    if (splashView) {
                        splashView = false;
                    }
                }
            }, delay ? 3000: 1);
            final View content = findViewById(android.R.id.content);
            content.getViewTreeObserver().addOnPreDrawListener(
                    new ViewTreeObserver.OnPreDrawListener() {
                        @Override
                        public boolean onPreDraw() {
                            // Check whether the initial data is ready.
                            //Log.d(TAG, "onPreDraw");
                            if (splashView) {
                                return false;
                            } else {
                                content.getViewTreeObserver().removeOnPreDrawListener(this);
                                return true;
                            }
                        }
                    });

        }

    }


    public static BillingManager billing = null;
    public void setM_sku(final String m_sku, String subs) {
        this.m_sku = m_sku;
        Log.d(TAG, "setM_sku:"+m_sku + "/subs:"+subs);
        Log.d(TAG, "billing:" + (billing == null));
        if (billing == null) {
            billing = new BillingManager(m_activity, subs, new BillingManager.YesNoCallback() {
                @Override
                public void onSuccess(JSONObject rJson) {
                    Log.d(TAG, "setM_sku:onSuccess:" + rJson.toString());
                    String strFunc = null;
                    try {
                        String productID = rJson.getString("productID");
                        String result = rJson.getString("result");
                        String orderID = rJson.getString("orderID");
                        strFunc = String.format("javascript:app_purchase_result('%s','%s','%s')", productID, result, orderID);
                    } catch (JSONException e) {
                        throw new RuntimeException(e);
                    }
                    doCallFuncOnJSP(strFunc);
                    //billing = null;
                }

                @Override
                public void onFailure(int errNo, String message) {
                    Log.d(TAG, "setM_sku:onFailure:" + message);
                    String strFunc = String.format("javascript:app_purchase_result('%s','%s','%s')", m_sku, "fail", "");
                    doCallFuncOnJSP(strFunc);
                    //billing = null;
                }
            });
        }
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                billing.getSkuDetailList(m_sku, subs);
            }
        }, 500);
    }

    @Override
    public void onStart() {
        super.onStart();
        try {
            String url = m_mainWebview.getUrl();
            String title = m_mainWebview.getTitle();

            // URL과 제목이 유효할 때만 인덱싱을 업데이트합니다.
            if (url != null && !url.isEmpty() && title != null && !title.isEmpty()) {
                // 1. 색인할 객체(Indexable)를 만듭니다.
                Indexable pageToIndex = Indexables.newSimple(title, url);

                // 2. update() 메서드를 사용하여 구글에 이 콘텐츠 정보를 업데이트(등록)합니다.
                FirebaseAppIndex.getInstance(this).update(pageToIndex)
                        .addOnSuccessListener(aVoid -> Log.d(TAG, "App Indexing: update successful for " + url))
                        .addOnFailureListener(e -> Log.e(TAG, "App Indexing: update failed for " + url, e));
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in App Indexing onStart", e);
        }
    }

    @Override
    public void onStop() {
        super.onStop();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
//        if(this.mInApp != null) {
//            this.mInApp.clearIAB();
//        }
        try {
            if (downloadComplete != null) {
                this.unregisterReceiver(downloadComplete);
            }
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Log.d(TAG, "onResume");
        // FCM Badge count change : '0'
        NotificationTools.updateBadgeCount(getBaseContext(), null);
        registerDownloadReceiver();
//        if (WXEntryActivity.resp !=null) {
//            if (WXEntryActivity.resp.getType() == 1) {
//                String code = ((SendAuth.Resp) WXEntryActivity.resp).code;
//                getAccess_token(code);
//            }
//        }
//        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
//            CookieSyncManager.getInstance().startSync();
//        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        unregisterDownloadReceiver();
//        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
//            CookieSyncManager.getInstance().stopSync();
//        }
    }

    public void backPressed() {
        // 1. 새로운 뒤로 가기 콜백을 생성합니다.
        OnBackPressedCallback callback = new OnBackPressedCallback(true /* enabled by default */) {
            @Override
            public void handleOnBackPressed() {
                Log.d(TAG, "OnBackPressedCallback: handleOnBackPressed: back_state:" +back_state);

                if (back_state == 1) {
                    back_state = 0;
                    buttonBack.setVisibility(View.GONE);
                    while (m_mainWebview.canGoBack()) {
                        m_mainWebview.goBack();
                    }
                    return;
                }

                Log.d(TAG, "m_mainWebview.canGoBack():" + m_mainWebview.canGoBack());
                if (m_mainWebview.canGoBack() && !Config.shared(m_context).isExit(m_mainWebview.getUrl())) {
                    if (back_state == 2) {
                        m_mainWebview.loadUrl("javascript:" + "actHistoryBack()");
                    } else {
                        m_mainWebview.goBack();
                    }
                    return;
                }

                exitApp();
            }
        };

        // 2. 생성한 콜백을 디스패처에 추가합니다.
        this.getOnBackPressedDispatcher().addCallback(this, callback);

    }

    /**
     * 앱 종료
     */
    public void exitApp() {
        exitApp(false);
    }
    public void exitApp(boolean nowExit) {
        long tempTime = System.currentTimeMillis();
        long intervalTime = tempTime - m_nBackKeyExitTime;

        long FINISH_INTERVAL_TIME = 2000L;
        if ((0 <= intervalTime && FINISH_INTERVAL_TIME >= intervalTime) || nowExit ) {
            finish();
//            AlertDialog.Builder d = new AlertDialog.Builder(this);
//            d.setTitle("알림");
//            d.setMessage("종료 하시겠습니까?");
//            d.setPositiveButton("확인", new DialogInterface.OnClickListener() {
//                @Override
//                public void onClick(DialogInterface dialog, int which) {
//
//                }
//            });
//            d.setNegativeButton("취소", new DialogInterface.OnClickListener() {
//                @Override
//                public void onClick(DialogInterface dialog, int which) {
//                }
//            });
//            d.show();
        } else {
//            if (BuildConfig.StartUrl.indexOf(m_mainWebview.getUrl()) == -1){
//                m_mainWebview.loadUrl(BuildConfig.StartUrl);
//            }else{
            m_nBackKeyExitTime = tempTime;
            Toast.makeText(getApplicationContext(), getString(R.string.common_back_text), Toast.LENGTH_SHORT).show();
            adMobLoad("fullEnd");
//            }
        }
    }
    @Override
    protected void onUserLeaveHint() {
        // HOME Key > backgound
        super.onUserLeaveHint();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
    }
    /*
    LusoftA로 이동
    public void getContacts(){
        Log.d(TAG, "getContacts");
        showProgressDlg();
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
//        m_mainWebview.loadUrl(strFunc);
        doCallFuncOnJSP(strFunc);
        dissmissProgressDlg();
    }
     */

    SnsLoginManager snsLogin;
    public void snsLogin(String loginType, String snsType) {
        Log.d(TAG, "SNSLOGIN:"+loginType+"/"+snsType);
        snsLogin = new SnsLoginManager(m_context);
        if (loginType.equals("login")) {
            snsLogin.login(snsType, new SnsLoginManager.YesNoCallback() {
                @Override
                public void onSuccess(String methodName, JSONObject rJson) {
                    JSONObject r = new JSONObject();
                    try {
                        r.put("login_type", loginType);
                        r.put("sns_type", snsType);
                        r.put("token", rJson.getString("token"));
                        r.put("id", rJson.getString("id"));
                        r.put("name", rJson.has("name")?rJson.getString("name"):"");
                        r.put("nick", rJson.has("nick")?rJson.getString("nick"):"");
                        r.put("hp", rJson.has("hp")?rJson.getString("hp"):"");
                        r.put("email", rJson.has("email")?rJson.getString("email"):"");
                        r.put("photo", rJson.has("photo")?rJson.getString("photo"):"");
                        String strFunc = String.format("javascript:result_sns_login('success', '', '%s');", r.toString());
                        doCallFuncOnJSP(strFunc);
                    } catch (JSONException e) {
                        Log.d(TAG, "JSONException:"+e.getMessage());
                        String strFunc = String.format("javascript:result_sns_login('error', '%s');", "JSONException:"+e.getMessage());
                        doCallFuncOnJSP(strFunc);
                    }
                }

                @Override
                public void onFailure(String methodName, int errNo, String message) {
                    if (snsType.equals("kakao")) {
                        message += "\nhashkey: "+Util.getHashKey();
                    }
                    Log.d(TAG, "snsLoginFailure:"+message);
                    String strFunc = String.format("javascript:result_sns_login('error', '%s');", ("["+errNo+"] "+message).replace("'","\\\'"));
                    doCallFuncOnJSP(strFunc);

                }
            }, googleLoginCallback);
        }
        if (loginType.equals("logout")) {
            snsLogin.logout(snsType, new SnsLoginManager.YesNoCallback() {
                @Override
                public void onSuccess(String methodName, JSONObject rJson) {
                    String strFunc = String.format("javascript:result_sns_login('success', '', '%s');", "");
                    doCallFuncOnJSP(strFunc);
                }

                @Override
                public void onFailure(String methodName, int errNo, String message) {
                    String strFunc = String.format("javascript:result_sns_login('error', '%s');", "["+errNo+"] "+message);
                    doCallFuncOnJSP(strFunc);

                }
            });
        }
        if (loginType.equals("signout")) {
            snsLogin.signout(snsType, new SnsLoginManager.YesNoCallback() {
                @Override
                public void onSuccess(String methodName, JSONObject rJson) {
                    Log.d(TAG, "---------");
                    String strFunc = String.format("javascript:result_sns_login('success', '', '%s');", "");
                    doCallFuncOnJSP(strFunc);
                }

                @Override
                public void onFailure(String methodName, int errNo, String message) {
                    String strFunc = String.format("javascript:result_sns_login('error', '%s');", "["+errNo+"] "+message);
                    doCallFuncOnJSP(strFunc);

                }
            });
        }
    }

    public void appUsageStats(String mb_id, long check_time, long start_time, long end_time, String callback_type) {
        Log.d(TAG, "appUsageStats:"+mb_id);
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
                String strFunc = String.format("javascript:result_app_usage_stats('error', '"+getString(R.string.permission_alert)+"', '');");
                doCallFuncOnJSP(strFunc);
            }

        } catch (JSONException e) {
            Log.d(TAG, "appUsageStats:JSONException: "+e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        super.onActivityResult(requestCode, resultCode, intent);
        switch (requestCode) {
            case file_upload_chrome:
                if (WebClient.Chrome.CALLBACK != null) {
                    Uri result = null;
                    try {
                        result = ((intent == null) ? null : intent.getData());
                    } catch (Exception ex) {
                        Log.e(TAG, ex.getLocalizedMessage());
                    } finally {
                        WebClient.Chrome.CALLBACK.onReceiveValue(result);
                        WebClient.Chrome.CALLBACK = null;
                    }
                }
                break;
            case file_upload_lollipop:
                if (WebClient.Chrome.FILEPATHCALLBACK != null) {
                    Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, intent);
                    WebClient.Chrome.FILEPATHCALLBACK.onReceiveValue(result);
                    WebClient.Chrome.FILEPATHCALLBACK = null;
                }
                break;
            case file_upload:
                if (resultCode == RESULT_OK) {
                    Uri uri = intent.getData();
                    String filePath = FileUtils.getPath(this, uri);
                    Lusoft.doFileUpload(filePath, null);
                }
                break;
            case file_upload_image:
            case file_upload_video:
                if (resultCode == RESULT_OK) {
                    File f = new File(Lusoft.m_camFilePath);
                    if (f.exists()) {
                        Lusoft.doFileUpload(f.getAbsolutePath(), null);
                    }
                }
                break;
            case file_chooser_lollipop:
                Log.d(TAG, "file_chooser_lollipop:"+resultCode);
                if (WebClient.Chrome.FILEPATHCALLBACK != null) {
                    ClipData clipData;
                    String stringData;
                    try {
                        clipData = intent.getClipData();
                        stringData = intent.getDataString();
                    }catch (Exception e){
                        clipData = null;
                        stringData = null;
                    }
                    Uri[] results = {};
                    File path = m_activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
                    File camera_image = new File(path, "temp.jpg");
                    path = m_activity.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
                    File camera_video = new File(path, "temp.mp4");

                    if (clipData == null && stringData == null && camera_image.length()>0) {
                        Log.d(TAG, "image camera");
                        results = new Uri[]{Uri.parse("file:" + camera_image.getAbsolutePath())};
                    }else if (clipData == null && stringData == null && camera_video.length()>0) {
                        Log.d(TAG, "camera_video camera");
                        results = new Uri[]{Uri.parse("file:"+camera_video.getAbsolutePath())};
                    }else{
                        if (clipData != null) { // checking if multiple files selected or not
                            final int numSelectedFiles = clipData.getItemCount();
                            results = new Uri[numSelectedFiles];
                            for (int i = 0; i < clipData.getItemCount(); i++) {
                                results[i] = clipData.getItemAt(i).getUri();
                            }
                        } else {
                            try {
                                results = new Uri[]{Uri.parse(stringData)};//This part is causing sdk 30 to crash after camera image upload as stringData is null
                            }catch(Exception e){
                            }
                        }
                    }
                    WebClient.Chrome.FILEPATHCALLBACK.onReceiveValue(results);
                    WebClient.Chrome.FILEPATHCALLBACK = null;
                }
                break;
            case file_chooser_camera_image://카메라 이미지 촬영
                Log.d(TAG, "file_chooser_camera_image:"+resultCode);
                if (resultCode == RESULT_OK) {
                    //File path = Environment.getExternalStorageDirectory();
                    File path = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
                    File file = new File(path, "temp.jpg");
                    Uri cameraImageUri = FileProvider.getUriForFile(m_context, BuildConfig.APPLICATION_ID+".provider", file);
                    Uri[] result = {cameraImageUri};
                    WebClient.Chrome.FILEPATHCALLBACK.onReceiveValue(result);
                }else{
                    WebClient.Chrome.FILEPATHCALLBACK.onReceiveValue(null);
                }
                WebClient.Chrome.FILEPATHCALLBACK = null;
                break;
            case file_chooser_camera_video://카메라 동영상 촬영
                Log.d(TAG, "file_chooser_camera_video:"+resultCode);
                if (resultCode == RESULT_OK) {
                    //File path = Environment.getExternalStorageDirectory();
                    File path = getExternalFilesDir(Environment.DIRECTORY_MOVIES);
                    File file = new File(path, "temp.mp4");
                    Uri cameraImageUri = FileProvider.getUriForFile(m_context, BuildConfig.APPLICATION_ID+".provider", file);
                    Uri[] result = {cameraImageUri};
                    WebClient.Chrome.FILEPATHCALLBACK.onReceiveValue(result);
                }else{
                    WebClient.Chrome.FILEPATHCALLBACK.onReceiveValue(null);
                }
                WebClient.Chrome.FILEPATHCALLBACK = null;
                break;
            case file_gallery_single:
                if (resultCode == RESULT_OK) {
                    final Uri uri = intent.getData();
                    String filePath = FileUtils.getPath(this, uri);
                    Lusoft.doFileUpload(filePath, null);
                }
                break;
            case file_gallery_multi:
                if (intent != null){
//                boolean isCameraImage = intent.getBooleanExtra(ImageSelector.IS_CAMERA_IMAGE, false)
//                    ArrayList<String> images = intent.getStringArrayListExtra(ImageSelector.SELECT_RESULT);
//                    if(images.size() > 0) {
//                        showProgressDlg();
//                        Lusoft.doFileMultiUpload(images, new Lusoft.LusoftCallback() {
//                            @Override
//                            public void fileUpload(String query) {
//                            }
//                            @Override
//                            public void fileMultiUpload(JSONArray result) {
//                                dissmissProgressDlg();
//                            }
//                        });
//                    }
                };
                break;
        }

        if (requestCode == REQUEST_CODE) {
            IntentResult result = IntentIntegrator.parseActivityResult(requestCode, resultCode, intent);
            String strFunc = "";
            if (result == null) {
                strFunc = String.format(Locale.KOREA, "javascript:result_app_get_%s('error', '')", codeType);
            } else {
                String code = result.getContents() == null ? "''" : result.getContents();
                String status = result.getContents() == null ? "error" : "success";
                strFunc = String.format(Locale.KOREA, "javascript:result_app_get_%s('%s', '%s')",codeType, status, code);
            }
            doCallFuncOnJSP(strFunc);
        }

    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String permissions[], @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        switch (requestCode) {
            case permission_calendar_read:
            case permission_calendar_write: {
                PermissionManager.share().removeCalendarRequest();
                break;
            }
            case permission_camera_take:
                PermissionManager.share().removeCameraRequest();
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Lusoft.cameraImageUpload();
                }
                break;
            case permission_contact_read:
            case permission_contact_write:
                PermissionManager.share().removeContactRequest();
                break;
            case permission_gps_info:
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Lusoft.gpsAccessed("");
                }
                PermissionManager.share().removeGPSRequest();
                break;
            case permission_recode_audio:
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Lusoft.recode_start_audio();
                }
                PermissionManager.share().removeRecodeAudoRequest();
                break;
            case permission_telephony_number:
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Lusoft.get_tel_number();
                }
                PermissionManager.share().removeTelephonyInfoRequest();
                break;
            case permission_telephony_call:
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Lusoft.make_phonecall(null);
                }
                PermissionManager.share().removeTelephonyCallRequest();
                break;
            case permission_body_sensor:
                PermissionManager.share().removeSensorRequest();
                break;
            case permission_sms_read:
            case permission_sms_write:
                PermissionManager.share().removeSMSRequest();
                break;
            case permission_storage_read:
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Lusoft.fileUploadFromChooser();
                }
                PermissionManager.share().removeStorageReadRequest();
                break;
            case permission_storage_write:
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Log.d(TAG, "abcdddd");
                    Lusoft.downloadFile();
                }
                PermissionManager.share().removeStorageWriteRequest();
                break;
            case permission_total:
                PermissionManager.share().removeAllRequest();
                break;
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    @Override
    public boolean onTouch(View v, MotionEvent event) {
        if(v.getId() == R.id.rl_notification) {
            float startY = m_notificationAlert.getY();
            float moveY;
            boolean bool = true;
            switch(event.getAction()) {
                case MotionEvent.ACTION_DOWN :
                    bool = false;
                    break;
                case MotionEvent.ACTION_MOVE :
                    moveY = event.getY();
                    if(startY > moveY) {
                        if(startY - moveY > 30) {
                            notificationTimer = null;
                            m_notificationAlert.setX(0.0f);
                            m_notificationAlert.setY(event.getY() * 2);
                        }
                    }
                    break;
                case MotionEvent.ACTION_UP :
                    Animation anim = AnimationUtils.loadAnimation(m_context, R.anim.riseup);
                    m_notificationAlert.startAnimation(anim);
                    m_notificationAlert.setVisibility(View.GONE);
                    bool = false;
                    break;
            }
            return bool;
        }
        return true;
    }

    public void doMultiSelectonGallary(String count,String type){
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {//photo picker 사용 가능
            Log.d(TAG, "doMultiSelectonGallary" + count);
            Intent intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
            intent.setType("image/*, video/*, autio/*");
            intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 100);
            m_activity.startActivityForResult(intent, file_chooser_lollipop);
        }else {
            Util.toast("지원하지 않는 버전입니다.");
            /*
            implementation 'io.github.lucksiege:pictureselector:v3.11.1'
            PictureSelector.create(m_context)
                    .openGallery(type.equals("2") ? SelectMimeType.ofVideo() : type.equals("3") ? SelectMimeType.ofAll() : SelectMimeType.ofImage())
                    .setImageEngine(GlideEngine.createGlideEngine())
                    .setSelectionMode(SelectModeConfig.MULTIPLE)
                    .forResult(new OnResultCallbackListener<LocalMedia>() {
                        @Override
                        public void onResult(ArrayList<LocalMedia> result) {
                            Log.d(TAG, "onresult");
                            Log.d(TAG, result.toString());
                            ArrayList<String> images = new ArrayList<>();
                            for (LocalMedia media : result) {
                                images.add(media.getRealPath());
                            }
                            if (images.size() > 0) {
                                showProgressDlg();
                                Lusoft.doFileMultiUpload(images, new Lusoft.LusoftCallback() {
                                    @Override
                                    public void fileUpload(String query) {
                                    }

                                    @Override
                                    public void fileMultiUpload(JSONArray result) {
                                        dissmissProgressDlg();
                                    }
                                });
                            }
                        }

                        @Override
                        public void onCancel() {
                            Log.d(TAG, "oncancel");
                        }
                    });
             */
        }
    }

    private void initMainActivity() {
        Log.d(TAG, "initMainActivity");
        m_mainWebview = findViewById(R.id.wb_main);
        //webview setting
        webviewSetting(m_mainWebview);
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                final String StartUrl = BuildConfig.StartUrl;
                m_mainWebview.loadUrl(StartUrl);
            }
        }, 1);

        m_container = findViewById(R.id.fl_container);
        StackManager.addWebView(m_activity, m_mainWebview);
    }



    //
    // take notification
    //
    private void taskNotification(String taskID) {
        Log.d(TAG, "taskNotification:"+taskID);
        if (!TextUtils.isEmpty(taskID)) {
            handlePushTaskID(taskID);
        } else {
            String command = null;
            try {
                command = getIntent().getStringExtra(Constants.NotificationExtraData.eCommand.getValue());
            } catch (Exception ex) {
                ex.printStackTrace();
            } finally {
                if (!TextUtils.isEmpty(command)) {
                    if (command.equals(Constants.NotificationExtraData.eDownloadFile.getValue())) {

                        String filePath = getIntent().getStringExtra(Constants.NotificationExtraData.eDownloadFile_filePath.getValue());
                        String fileName = getIntent().getStringExtra(Constants.NotificationExtraData.eDownloadFile_fileName.getValue());

                        String extension = "";
                        int i = fileName.lastIndexOf('.');
                        int p = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
                        if (i > p) {
                            extension = fileName.substring(i + 1);
                        }

                        File file = new File(filePath);
                        if(file.exists()) {
                            Uri fileUri = FileProvider.getUriForFile(this, BuildConfig.APPLICATION_ID + ".provider", file);
                            Intent target = new Intent(Intent.ACTION_VIEW);
                            target.setDataAndType(fileUri, Util.getViewerType(extension));

                            target.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            Intent intentChooser = Intent.createChooser(target, "Choose Pdf Application");

                            try {
                                startActivity(intentChooser);
                            } catch (ActivityNotFoundException e) {
                                e.getStackTrace();
                            }
                        }
                    } else if (command.equals(Constants.NotificationExtraData.eFCM.getValue())) {
                        String url = getIntent().getStringExtra(Constants.NotificationExtraData.eFCMURL.getValue());
                        if (url != null) {
                            Log.d(TAG, "taskNotification: moveWebview");
                            doCallFuncOnJSP(url);
                        }
                    }
                }
            }
        }
    }

    //
    // take external data
    //
    private void taskFromExternal() {
        Log.d(TAG, "taskFromExternal");
        Uri uri = getIntent().getData();
        try {
            JSONObject param = new JSONObject();
            Set<String> paramNames = uri.getQueryParameterNames();
            if (paramNames != null && !paramNames.isEmpty()) {
                // Query parameter가 하나 이상 있음
                for (String paramName : paramNames) {
                    String value = uri.getQueryParameter(paramName);
                    param.put(paramName, value);
                }
            }
            Log.d(TAG, "param: " + param.toString());
            appLink(param);
        } catch (JSONException e) {

        }
    }
    private void appLink(JSONObject param) {
        Log.d(TAG, "appLink: " + param.toString());
        String url = Util.JsonString(param, "url");
        int popup = Util.JsonInt(param, "popup");
        String subject = Util.JsonString(param, "subject");
        String mode = Util.JsonString(param, "mode");
        if (mode.isEmpty()) return;

        String txt = SharedData.shared().loadString("deeplink");
        try {
            JSONObject DeepLink = new JSONObject();
            if (!txt.equals("")) {
                DeepLink = new JSONObject(txt);
            }
            DeepLink.put(mode, param);
            SharedData.shared().saveData("deeplink", DeepLink.toString());
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }

        SharedData.shared().saveData(mode, param.toString());

        if(url.isEmpty()) return;
        if (url.substring(0,1).equals("/"))  url = BuildConfig.HostUrl + url;
        final String start_url = url;
        Log.d(TAG, "popup: "+ popup + " => " + start_url);
        if (popup >= 1 && !subject.isEmpty()) { //팝업으로
            String todayStorage = SharedData.shared().loadData("today_"+mode);
            Log.d(TAG, "todayStorage:"+todayStorage +"/"+Util.toDay());
            if (!todayStorage.equals(Util.toDay())) {
                Util.dialog(m_activity, subject, "", new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        m_mainWebview.loadUrl(start_url);
                    }
                }, getString(R.string.common_move), new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {

                    }
                }, getString(R.string.common_close), new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        SharedData.shared().saveData("today_" + mode, Util.toDay()+"1");
                    }
                }, getString(R.string.common_today));
            }else{
                new Handler().postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        m_mainWebview.loadUrl(start_url);
                    }
                }, 2000);

            }
        }else{ //그냥 이동
            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    m_mainWebview.loadUrl(start_url);
                }
            }, 2000);
        }

    }
    //앱 시작시 유효한 referrer 체크
    private void runInstallReferrer(){
        Log.d(TAG, "runInstallReferrer: " + Util.checkFirstRun());
        String txt = SharedData.shared().loadString("deeplink");
        try {
            JSONObject DeepLink = new JSONObject();
            if (!txt.equals("")) {
                DeepLink = new JSONObject(txt);
            }
            Log.d(TAG, "runInstallReferrer-deeplink: " + DeepLink.toString());
            Iterator<String> keys = DeepLink.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                JSONObject value = DeepLink.getJSONObject(key);
                Log.d(TAG, "key=>" + value.toString());
                String today = SharedData.shared().loadData("today_"+key);
                int popup = Util.JsonInt(value, "popup");
                long limit_tm = Util.JsonLong(value, "limit_tm");
                long timestampSeconds = System.currentTimeMillis() / 1000;
                if (limit_tm > timestampSeconds) {
                    Log.d(TAG, "11");
                    if (!today.equals(Util.toDay()) && popup == 2) {
                        Log.d(TAG, "22");
                        appLink(value);
                    }
                }else{
                    Log.d(TAG, "333");
                    DeepLink.remove(key);
                }
            }
            SharedData.shared().saveData("deeplink", DeepLink.toString());
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }

    }
    private void checkInstallReferrer(){
        Log.d(TAG, "checkInstallReferrer");
        // 1. InstallReferrerClient 인스턴스 생성
        referrerClient = InstallReferrerClient.newBuilder(this).build();

        // 2. Play 스토어 서비스에 연결 시작
        referrerClient.startConnection(new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int responseCode) {
                // 연결 결과 처리
                switch (responseCode) {
                    case InstallReferrerClient.InstallReferrerResponse.OK:
                        // 연결 성공
                        Log.d(TAG, "InstallReferrer: 연결에 성공했습니다.");
                        getReferrerData();
                        break;
                    case InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED:
                        // API를 지원하지 않는 경우
                        Log.w(TAG, "InstallReferrer: API를 지원하지 않습니다.");
                        break;
                    case InstallReferrerClient.InstallReferrerResponse.SERVICE_UNAVAILABLE:
                        // Play 스토어 서비스에 연결할 수 없는 경우
                        Log.w(TAG, "InstallReferre: 서비스에 연결할 수 없습니다.");
                        break;
                }
            }

            @Override
            public void onInstallReferrerServiceDisconnected() {
                // 서비스 연결이 끊어진 경우 (재시도 로직을 구현할 수 있음)
                Log.d(TAG, "InstallReferre: 서비스 연결이 끊어졌습니다.");
            }
        });

    }
    private void getReferrerData() {
        Log.d(TAG, "getReferrerData");
        try {
            if (referrerClient.isReady()) {
                // 3. Referrer 정보 가져오기
                ReferrerDetails response = referrerClient.getInstallReferrer();

                // 설치 추천인 URL (예: utm_source=google&utm_medium=cpc&...)
                String installReferrer = response.getInstallReferrer();
                JSONObject param = Util.queryStringToJson(installReferrer);
                Log.d(TAG, "param: " + param.toString());
                appLink(param);

                // 4. 리소스 정리를 위해 클라이언트 연결 종료
                referrerClient.endConnection();
            }
        } catch (RemoteException e) {
            Log.e("InstallReferrer", "Referrer 정보를 가져오는 중 오류 발생", e);
        }
    }
    public void deeplink_info(String mode, String cb, boolean delete) {
        Log.d(TAG, "deeplink_info: " + mode + " / " + cb + " / " + delete);
        String txt = SharedData.shared().loadString("deeplink");
        if (cb.isEmpty()) cb = "result_deeplink_info";

        try {
            JSONObject DeepLink = new JSONObject();
            if (!txt.equals("")) {
                DeepLink = new JSONObject(txt);
            }else{
                doJsCallback(cb, "deeplink info not found", "error", new JSONObject());
            }
            Log.d(TAG, "deeplink: " + DeepLink.toString());
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
                    }else{
                        DeepLink.remove(key);
                    }
                    Log.d(TAG, "key=>" + key + " => " + value.toString());
                }
            }
            SharedData.shared().saveData("deeplink", DeepLink.toString());
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }

    }

    //webview 세팅
    private void webviewSetting(WebView wb) {
        Util.weviewSetting(wb);
        wb.setWebViewClient(new WebClient.Normal());
        wb.setWebChromeClient(new WebClient.Chrome(MainActivityA.this));
        if (BuildConfig.DEBUG) {
            getWebviewVersionInfo();
        }
    }

    //webview 버전 정보
    private void getWebviewVersionInfo() {
        PackageManager pm = getPackageManager();
        try {
            PackageInfo pi = pm.getPackageInfo("com.google.android.webview", 0);
            Log.i(TAG, "version name: " + pi.versionName);
            Log.i(TAG, "version code: " + pi.versionCode);
        } catch (PackageManager.NameNotFoundException e) {
            Log.e(TAG, "Android System WebView is not found");
        }
    }

    //javascript callback
    public void doCallFuncOnJSP(final String strFunc) {
        Log.d(TAG, "doCallFuncOnJSP: " + strFunc);
        m_mainWebview.post(new Runnable() {
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
    public void doJsCallback(String cb) {
        doJsCallback(cb, "Error", "error", new JSONObject());
    }
    public void doJsCallback(String cb, String desc) {
        doJsCallback(cb, desc, "error", new JSONObject());
    }
    public void doJsCallback(String cb, String desc, String result) {
        doJsCallback(cb, desc, result, new JSONObject());
    }
    public void doJsCallback(String cb, String desc, String result, JSONObject dt) {
        String strFunc = String.format("javascript:%s('%s','%s','%s')", cb, result, desc, dt.toString());
        doCallFuncOnJSP(strFunc);
    }
    //
    // recode --------- --------- --------- --------- ---------
    //
    RecodeAudioDialog m_dialogAudioRecode = null;
    public void doRecodeAudio() {
        if(m_dialogAudioRecode == null) {
            m_dialogAudioRecode = new RecodeAudioDialog(this, this);
            m_dialogAudioRecode.showRecodeDialog(new RecodeAudioDialog.RecodeDialogCallback() {
                @Override
                public void dissmiss() {
                    m_dialogAudioRecode = null;
                }

                @Override
                public void startRecode() {
                }

                @Override
                public void stopRecode() {
                }

                @Override
                public void playAudio() {
                }

                @Override
                public void pauseAudio() {
                }

                @Override
                public void saveRecode() {
                    m_dialogAudioRecode.dismiss();
                    Toast.makeText(m_context, getString(R.string.common_mic_upload), Toast.LENGTH_SHORT).show();
                    m_dialogAudioRecode = null;
                }
            });
        }
    }
    //
    // notification --------- --------- --------- --------- ---------
    //
    private static Timer notificationTimer = null;
    private static FCMItem SELECTED_FCM_ITEM = null;
    private static DownloadItem SELECTED_DOWNLOAD_ITEM = null;
    private void initNotiAlert() {
        m_notiTitle = findViewById(R.id.notificaion_title);
        m_notiDescription = findViewById(R.id.notificaion_description);
        m_notificationAlert = findViewById(R.id.rl_notification);
        ImageView icon = findViewById(R.id.iv_app_icon);
        icon.setImageResource(R.mipmap.ic_launcher);
//        m_notificationAlert.setOnTouchListener(this);
        m_notificationAlert.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if(SELECTED_FCM_ITEM != null) {
                    String strTaskId = SELECTED_FCM_ITEM.getTaskid();
                    handlePushTaskID(strTaskId);
                    //SELECTED_FCM_ITEM = null;
                }
                if(SELECTED_DOWNLOAD_ITEM != null) {
                    Intent intent = SELECTED_DOWNLOAD_ITEM.getResultIntent();
                    startActivity(intent);
                    //SELECTED_DOWNLOAD_ITEM = null;
                }
            }
        });
    }

    public static void hideNotificationAlert()
    {
        Log.d("Main", "hideNotificationAlert");
        Message message = new Message();
        message.what = 0;
        notificationHandler.sendMessageAtFrontOfQueue(message);

        if(SELECTED_FCM_ITEM != null)
        {
            String strMessageTitle = SELECTED_FCM_ITEM.getTitle();
            String strMessageDescription = SELECTED_FCM_ITEM.getDescription();
            String strFcmTaskID = SELECTED_FCM_ITEM.getTaskid();
            NotificationTools.addFcmItemOnBar(m_context, strMessageTitle, strMessageDescription, strFcmTaskID,SELECTED_FCM_ITEM.getSound());
            SELECTED_FCM_ITEM = null;
        }

        if(SELECTED_DOWNLOAD_ITEM != null)
        {
            String strMessageTitle = SELECTED_DOWNLOAD_ITEM.getTitle();
            String strMessageDescription = SELECTED_DOWNLOAD_ITEM.getDescription();
            PendingIntent pendingIntent = SELECTED_DOWNLOAD_ITEM.getPendingIntent();
            NotificationTools.addNotificationItemOnBar(m_context, strMessageTitle, strMessageDescription, pendingIntent);
            SELECTED_DOWNLOAD_ITEM = null;
        }
    }

    public static void showNotificationAlert(Object item)
    {
        Log.d("*main", "showNotificationAlert");
        Message message = new Message();
        message.what = item.getClass().equals(DownloadItem.class) ? 2 : 1;
        message.obj = item;
        notificationHandler.sendMessageAtFrontOfQueue(message);
    }

    @SuppressLint("HandlerLeak")
    private static Handler notificationHandler = new Handler() {
        @Override
        public void handleMessage(Message msg) {
            Log.d("*main", "notificationHandler:"+msg.what);
            switch (msg.what) {
                case 0: {
                    if(notificationTimer != null) {
                        Animation anim = AnimationUtils.loadAnimation(m_context, R.anim.riseup);
                        m_notificationAlert.startAnimation(anim);

                        notificationTimer = null;
                        m_notificationAlert.setVisibility(View.GONE);
                    }
                    break;
                }
                case 1: {
                    // FCM
//                    SELECTED_FCM_ITEM = (FCMItem) msg.obj;
//                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
//                        if(SELECTED_FCM_ITEM != null)
//                        {
//                            hideNotificationAlert();
//                        }
//                    } else {
                    m_notificationAlert.setY(0.0f);
                    m_notificationAlert.setVisibility(View.VISIBLE);

                    SELECTED_FCM_ITEM = (FCMItem) msg.obj;
                    if (SELECTED_FCM_ITEM != null) {
                        m_notiTitle.setText(SELECTED_FCM_ITEM.getTitle());
                        m_notiDescription.setText(SELECTED_FCM_ITEM.getDescription());
                        Animation anim = AnimationUtils.loadAnimation(m_context, R.anim.dropdown);
                        m_notificationAlert.startAnimation(anim);
                        if (notificationTimer == null) {
                            TimerTask notificationTask = new TimerTask() {
                                @Override
                                public void run() {
                                    hideNotificationAlert();
                                }
                            };
                            notificationTimer = new Timer();
                            notificationTimer.schedule(notificationTask, NOTIFICATION_SHOW_INTERVAL);
                        }
                    }
//                    }
                    break;
                }
                case 2: {
                    // LOCAL
                    SELECTED_DOWNLOAD_ITEM = (DownloadItem) msg.obj;

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        if(SELECTED_DOWNLOAD_ITEM != null)
                        {
                            hideNotificationAlert();
                        }
                    } else {
                        m_notificationAlert.setVisibility(View.VISIBLE);

                        SELECTED_DOWNLOAD_ITEM = (DownloadItem) msg.obj;
                        if (SELECTED_DOWNLOAD_ITEM != null) {
                            NotificationTools.playNotificationSound(m_context, SELECTED_DOWNLOAD_ITEM.getSound());
                            m_notiTitle.setText(SELECTED_DOWNLOAD_ITEM.getTitle());
                            m_notiDescription.setText(SELECTED_DOWNLOAD_ITEM.getDescription());
                            Animation anim = AnimationUtils.loadAnimation(m_context, R.anim.dropdown);
                            m_notificationAlert.startAnimation(anim);

                            if (notificationTimer == null) {
                                TimerTask notificationTask = new TimerTask() {
                                    @Override
                                    public void run() {
                                        hideNotificationAlert();
                                    }
                                };
                                notificationTimer = new Timer();
                                notificationTimer.schedule(notificationTask, NOTIFICATION_SHOW_INTERVAL);
                            }
                        }
                    }
                    break;
                }
            }
        }
    };

    public void handlePushTaskID(String taskID) {
        Util.log("handlePushTaskID = " + taskID, TAG);
        Util.log("member_id = " + SharedData.shared().loadData(SharedData.PushcatID));
        HttpManager api = new HttpManager(BuildConfig.PushcatUrl, HttpManager.Method.POST);
        api.add("member_id", SharedData.shared().loadData(SharedData.PushcatID));
        api.add("task_id", taskID);
        api.run(new HttpManager.HttpCallbackObject() {
            @Override
            public void callback(JSONObject httpObj) {
                Util.log("pushcat json result : " + httpObj.toString());
                if (httpObj.optInt("mResultCode") == 0) {
                    String content = httpObj.optString("mContent");
                    try {
                        JSONObject contentObj = new JSONObject(content);

                        String mode = contentObj.optString("mode");
                        String popup = contentObj.optString("popup", "Y");
                        if (mode != null) {
                            String msg = contentObj.optString("msg");
                            try {
                                msg = URLDecoder.decode(msg, "utf-8");
                            } catch (UnsupportedEncodingException e) {
                                e.printStackTrace();
                            }

                            String url = "";
                            if ("process_coupon_use".equals(mode)) {
                                url = BuildConfig.HostUrl + "/member/coupon_list.php";
                            } else if ("memo".equals(mode)) {
                                String me_idx = contentObj.optString("me_idx");
                                url = BuildConfig.HostUrl + "/member/memo_view.php?gubun=receive&me_idx=" + me_idx;
                            } else if ("board".equals(mode)) {
                                String bc_code = contentObj.optString("bc_code");
                                String bd_idx = contentObj.optString("bd_idx");
                                if (!TextUtils.isEmpty(bd_idx)) {
                                    url = BuildConfig.HostUrl + "/board/board_view.php?bc_code=" + bc_code + "&bd_idx=" + bd_idx;
                                } else {
                                    url = BuildConfig.HostUrl + "/board/board_view.php?bc_code=" + bc_code;
                                }
                            } else if ("page".equals(mode)) {
                                String pg_idx = contentObj.optString("pg_idx");
                                url = BuildConfig.HostUrl + "/page/page.php?pg_idx=" + pg_idx;
                            } else if ("shop_order".equals(mode)) {
                                String od_num = contentObj.optString("od_num");
                                url = BuildConfig.HostUrl + "/shop/order_view.php?od_num=" + od_num;
                            } else if ("shop_list".equals(mode)) {
                                String cate_code = contentObj.optString("cate_code");
                                url = BuildConfig.HostUrl + "/shop/product_list.php?cate_code=" + cate_code;
                            } else if ("shop".equals(mode)) {
                                String pd_num = contentObj.optString("pd_num");
                                url = BuildConfig.HostUrl + "/shop/product_view.php?pd_num=" + pd_num;
                            } else if ("reservation".equals(mode)) {
                                String re_idx = contentObj.optString("re_idx");
                                url = BuildConfig.HostUrl + "/reservation/reservation_view.php?re_idx=" + re_idx;
                            } else if ("room".equals(mode)) {
                                String rr_idx = contentObj.optString("rr_idx");
                                url = BuildConfig.HostUrl + "/reservation/room_view.php?rr_idx=" + rr_idx;
                            } else if ("goto".equals(mode) || "move".equals(mode)) {
                                String urlStr = contentObj.optString("url");
                                url = BuildConfig.HostUrl + "/" + urlStr;
                            } else {
                            }
                            if (Util.getPackageName(m_context).startsWith("equipmentcall")){
//                                String strFunc = String.format("javascript:push_popup('%s','%s','%s')", SharedData.shared().loadData(SharedData.PushcatID),msg,url);
//                                doCallFuncOnJSP(strFunc);
                                SharedData.shared().saveData("msg",msg);
                                SharedData.shared().saveData("url",url);
                            }else{
                                Log.d(TAG, "popup:" + popup);
                                if (popup.equals("N")) {
                                    // 2초 뒤에 실행하고 싶은 코드가 있는 메소드 안에서
                                    String finalUrl = url;
                                    new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                                        @Override
                                        public void run() {
                                            m_mainWebview.loadUrl(finalUrl);
                                        }
                                    }, 2000); // 2000 밀리초 = 2초
                                }else{
                                    showPushAlert(msg, url);
                                }
                            }
                        }
                    } catch (JSONException e) {
                        e.printStackTrace();
                    }
                } else {
                    Util.log("PushCat RecvContent Error : " + httpObj.optString("mResultDesc"));
                }
            }
        });
    }

    public void showPushAlert(final String title, final String moveUrl) {
        this.runOnUiThread(new Runnable() {
            public void run() {
//                String strCurrentURL = m_mainWebview.getUrl();
//                if (!strCurrentURL.contains("chat") && !strCurrentURL.contains("talk")) {
                AlertDialog.Builder d = new AlertDialog.Builder(m_mainWebview.getContext());
                d.setMessage(title);
                d.setPositiveButton(getString(R.string.common_ok), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        if (moveUrl != null && moveUrl.length() > 0) {
                            final String moveUrl1 = moveUrl;
                            m_mainWebview.loadUrl(moveUrl1);
                        }
                    }
                });
                d.setNegativeButton(getString(R.string.common_cancel), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                    }
                });
                d.show();
            }
//            }
        });
    }

    public void setShowLoading(Boolean val) {
        String msg = SharedData.shared().loadData("msg");
        if (Util.getPackageName(m_context).startsWith("equipmentcall") && msg.length() > 0){
            String strFunc = String.format("javascript:push_popup('%s','%s','%s')", SharedData.shared().loadData("mb_id"),msg,SharedData.shared().loadData("url"));
            doCallFuncOnJSP(strFunc);
            SharedData.shared().saveData("msg","");
            SharedData.shared().saveData("url","");
        }
        if(m_loading == null)
            return;
        if (val && BuildConfig.ShowLoading) {
            m_loading.setVisibility(View.VISIBLE);
        } else {
            m_loading.setVisibility(View.INVISIBLE);
        }
    }

    public void showProgressDlg() {
        m_progressHandler.sendEmptyMessage(0);
    }

    public void dissmissProgressDlg() {
        m_progressHandler.sendEmptyMessage(1);
    }

    @SuppressLint("HandlerLeak")
    Handler m_progressHandler = new Handler() {
        public void handleMessage(Message msg) {
            switch (msg.what) {
                case 0:
                    if (m_progressDlg == null) {
                        m_progressDlg = new ProgressDialog(MainActivityA.this);
                        m_progressDlg.setCancelable(false);
                        m_progressDlg.setTitle(null);
                        m_progressDlg.setMessage(getString(R.string.loading));
                        m_progressDlg.show();
                    }
                    break;
                case 1:
                    if (m_progressDlg != null) {
                        m_progressDlg.dismiss();
                        m_progressDlg = null;
                    }
                    break;
            }
        }
    };


    //firbase app index
    public Action getIndexApiAction() {
        // 웹뷰의 제목과 URL이 유효할 때만 Action을 생성합니다.
        String title = m_mainWebview.getTitle();
        String url = m_mainWebview.getUrl();

        if (title == null || url == null) {
            return null;
        }

        // 최신 Actions 빌더를 사용합니다.
        return Actions.newView(title, url);
    }

    public void showMainDialog(int id) { //ShowDialog
        switch (id) {
            case DIALOG_ISP:
                m_alertIsp = new AlertDialog.Builder(this)
                        .setIcon(android.R.drawable.ic_dialog_alert)
                        .setTitle(getString(R.string.common_alarm))
                        .setMessage(getString(R.string.settlement_isp_error))
                        .setPositiveButton(getString(R.string.common_install), new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {

                                final String ispUrl = "http://mobile.vpay.co.kr/jsp/MISP/andown.jsp";
                                m_mainWebview.loadUrl(ispUrl);
                                finish();
                            }
                        })
                        .setNegativeButton(getString(R.string.common_cancel), new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {

                                Toast.makeText(MainActivityA.this, "(-1)" + getString(R.string.settlement_cancel_desc), Toast.LENGTH_SHORT).show();
                                finish();
                            }

                        })
                        .create();
                m_alertIsp.show();
                break;
            case DIALOG_CARDAPP:
                getCardInstallAlertDialog(DIALOG_CARDNM).show();
                break;
        }//end switch
    }

    public AlertDialog getCardInstallAlertDialog(final String coCardNm) {
        final Hashtable<String, String> cardNm = new Hashtable<>();
        cardNm.put("HYUNDAE", "현대 앱카드");
        cardNm.put("SAMSUNG", "삼성 앱카드");
        cardNm.put("LOTTE", "롯데 앱카드");
        cardNm.put("SHINHAN", "신한 앱카드");
        cardNm.put("KB", "국민 앱카드");
        cardNm.put("HANASK", "하나SK 통합안심클릭");
        //cardNm.put("SHINHAN_SMART",  "Smart 신한앱");

        final Hashtable<String, String> cardInstallUrl = new Hashtable<>();
        cardInstallUrl.put("HYUNDAE", "market://details?id=com.hyundaicard.appcard");
        cardInstallUrl.put("SAMSUNG", "market://details?id=kr.co.samsungcard.mpocket");
        cardInstallUrl.put("LOTTE", "market://details?id=com.lotte.lottesmartpay");
        cardInstallUrl.put("LOTTEAPPCARD", "market://details?id=com.lcacApp");
        cardInstallUrl.put("SHINHAN", "market://details?id=com.shcard.smartpay");
        cardInstallUrl.put("KB", "market://details?id=com.kbcard.cxh.appcard");
        cardInstallUrl.put("HANASK", "market://details?id=com.ilk.visa3d");
        //cardInstallUrl.put("SHINHAN_SMART",  "market://details?id=com.shcard.smartpay");//여기 수정 필요!!2014.04.01

        AlertDialog alertCardApp;
        alertCardApp = new AlertDialog.Builder(this)
                .setIcon(android.R.drawable.ic_dialog_alert)
                .setTitle(getString(R.string.common_alarm))
                .setMessage(cardNm.get(coCardNm) + " " + getString(R.string.settlement_not_install))
                .setPositiveButton(getString(R.string.common_install), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        String installUrl = cardInstallUrl.get(coCardNm);
                        Uri uri = Uri.parse(installUrl);
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        try {
                            startActivity(intent);
                        } catch (ActivityNotFoundException anfe) {
                            Toast.makeText(MainActivityA.this, cardNm.get(coCardNm) + getString(R.string.settlement_not_install_url), Toast.LENGTH_SHORT).show();
                        }
                        //finish();
                    }
                })
                .setNegativeButton(getString(R.string.common_cancel), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        Toast.makeText(MainActivityA.this, "(-1)"+getString(R.string.settlement_cancel_desc), Toast.LENGTH_SHORT).show();
                        finish();
                    }
                })
                .create();

        return alertCardApp;

    }//end getCardInstallAlertDialog

    private void registerDownloadReceiver() {
        if(downloadComplete != null) {
            return;
        }

        IntentFilter completeFilter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);

        this.downloadComplete = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                assert action != null;
                if (action.equals(DownloadManager.ACTION_DOWNLOAD_COMPLETE)) {
                    long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);

                    DownloadInfo info = DownloadMng.manage().getObjectAtDownloadId(downloadId);
                    String fullPath = info.getDownload_file_fullpath();
                    String fileName = info.getDownload_file_name();
                    String description = info.getDownload_file_name_org();
                    String mode = info.getDownload_mode();
                    String title = info.getDownload_title();

                    Log.d(TAG, "qid:"+downloadId);
                    final DownloadManager manager = (DownloadManager) m_context.getSystemService(Context.DOWNLOAD_SERVICE);
                    try {
                        manager.openDownloadedFile(downloadId);
                        Log.d(TAG, "오픈 성공");
                    } catch (FileNotFoundException e) {
                        Log.d(TAG, "오픈실패:"+e.getMessage());
                    }
                    /*
                    try {
                        manager.openDownloadedFile(downloadId);
                    } catch (FileNotFoundException e) {
                        Log.d(TAG, "오픈 에러:"+e.getMessage());
                    }*/

                    Log.d(TAG, "fullPath:"+fullPath);
                    Log.d(TAG, "fileName:"+fileName);
                    Log.d(TAG, "desc:"+description);

                    DownloadMng.manage().removeAtObject(info);


                    File fileWithinMyDir = new File(fullPath);
                    boolean checkExist = fileWithinMyDir.exists();
                    if (!checkExist) {
                        String message = String.format(getString(R.string.common_open_fail), fileName);
                        Toast.makeText(m_context, message, Toast.LENGTH_SHORT).show();
                        return;
                    }
                    Log.d(TAG, "mode:"+mode);
                    switch (mode)
                    {
                        case "1":
                        {
                            NotificationCompat.Builder builder = new NotificationCompat.Builder(context)
                                    .setSmallIcon(R.mipmap.ic_launcher)
                                    .setContentTitle(getString(R.string.common_download_complete))
                                    .setContentText(fileName)
                                    .setTicker(title)
                                    .setAutoCancel(true)
                                    .setDefaults(Notification.DEFAULT_VIBRATE);

                            Intent resultIntent = new Intent(context, MainActivity.class);
                            resultIntent.putExtra(Constants.NotificationExtraData.eCommand.getValue(), Constants.NotificationExtraData.eDownloadFile.getValue());
                            resultIntent.putExtra(Constants.NotificationExtraData.eDownloadFile_filePath.getValue(), fullPath);
                            resultIntent.putExtra(Constants.NotificationExtraData.eDownloadFile_fileName.getValue(), fileName);
                            Log.d(TAG, "filepath:"+Constants.NotificationExtraData.eDownloadFile_filePath.getValue());
                            Log.d(TAG, "filename:"+Constants.NotificationExtraData.eDownloadFile_fileName.getValue());
                            resultIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);


                            TaskStackBuilder stackBuilder = TaskStackBuilder.create(context);
                            stackBuilder.addParentStack(MainActivity.class);
                            stackBuilder.addNextIntent(resultIntent);

                            //android 12
                            PendingIntent resultPendingIntent;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                resultPendingIntent = stackBuilder.getPendingIntent(0, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                            }else {
                                resultPendingIntent = stackBuilder.getPendingIntent(0, PendingIntent.FLAG_UPDATE_CURRENT);
                            }

                            if (Util.isAppIsInBackground()) {
                                // background mode
                                builder.setContentIntent(resultPendingIntent);

                                NotificationManager mNotificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                                assert mNotificationManager != null;
                                mNotificationManager.notify(Util.getNextNotificationID(), builder.build());
                            }
                            else {
                                // foreground mode
                                DownloadItem item = new DownloadItem();
                                item.setId(downloadId);
                                item.setTitle(getString(R.string.common_download_complete)+"..");
                                item.setDescription(description);
                                item.setResultIntent(resultIntent);
                                item.setStackBuilder(stackBuilder);
                                item.setPendingIntent(resultPendingIntent);


                                MainActivity.showNotificationAlert(item);

                            }
                            break;
                        }
                        case "2": {
                            String extension = "";
                            int i = fileName.lastIndexOf('.');
                            if (i > -1) {
                                extension = fileName.substring(i + 1);
                            }

                            Intent intentShareFile = new Intent(Intent.ACTION_SEND);
                            intentShareFile.setType("application/" + extension);
                            intentShareFile.putExtra(Intent.EXTRA_STREAM, Uri.parse("file://" + fullPath));
                            intentShareFile.putExtra(Intent.EXTRA_SUBJECT, "Sharing File");
                            intentShareFile.putExtra(Intent.EXTRA_TEXT, "Sharing File");
                            m_context.startActivity(Intent.createChooser(intentShareFile, "Share File"));
                            break;
                        }
                    }
                }
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            registerReceiver(downloadComplete, completeFilter, RECEIVER_EXPORTED);
        }
    }

    private void unregisterDownloadReceiver() {
        if(downloadComplete != null){
            this.unregisterReceiver(downloadComplete);
            downloadComplete = null;
        }
    }

    /**
     * 구글 로그인 콜백
     */
    public ActivityResultLauncher<Intent> googleLoginCallback = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            new ActivityResultCallback<ActivityResult>() {
                @Override
                public void onActivityResult(ActivityResult result) {
                    Log.d(TAG,"googleLoginCallback-onActivityResult: "+result.getResultCode());
                    if (result.getResultCode() == RESULT_OK) {
                        Log.d(TAG, "googleLogin Callback");

                        JSONObject rJson = new JSONObject();
                        try {
                            Intent data = result.getData();
                            Log.d(TAG, "dd1:"+data.toString());
                            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
                            Log.d(TAG, "dd2:"+task.toString());
                            GoogleSignInAccount account = task.getResult(ApiException.class);
                            Log.d(TAG, "dd3:"+account.toString());
                            //Log.d(TAG, account.zad());

                            rJson.put("token", account.getIdToken());
                            rJson.put("id", account.getId());
                            rJson.put("name", account.getFamilyName() + " " + account.getGivenName());
                            rJson.put("nick", account.getDisplayName());
                            rJson.put("photo", account.getPhotoUrl());
                            rJson.put("email", account.getEmail());
                            rJson.put("hp", "");
                            Log.d(TAG, rJson.toString());
                            snsLogin.mLoginCallback.onSuccess("login", rJson);
                        }catch(JSONException e){
                            snsLogin.mLoginCallback.onFailure("login", 1002, e.getMessage());
                        }catch (ApiException e) {
                            Log.d(TAG, "api error:",e);
                            snsLogin.mLoginCallback.onFailure("login", 1003, e.getMessage());
                        }

                    }else{
                        Intent data = result.getData();
                        GoogleSignInResult result1 = Auth.GoogleSignInApi.getSignInResultFromIntent(data);
                        Log.e(TAG, "RESULT:"+ result1.getStatus().toString());
                        snsLogin.mLoginCallback.onFailure("login", 1001, "로그인 취소:"+result.getResultCode()+"/"+result1.getStatus().toString());
                    }
                }
            });
    /**
     * push 설정 변경 콜백
     */
    public interface LauncherResult{
        public void onResult(ActivityResult result);
    }
    LauncherResult mCb;
    private void launcher(String name,LauncherResult cb ) {
        mCb = cb;
        if (name.equals("push")){
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, m_activity.getPackageName());
            mLauncher.launch(intent);
        }
        if (name.equals("usageStats")){
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, m_activity.getPackageName());
            mLauncher.launch(intent);
        }
    }
    ActivityResultLauncher<Intent> mLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),
            new ActivityResultCallback<ActivityResult>()
            {
                @Override
                public void onActivityResult(ActivityResult result)
                {
                    mCb.onResult(result);
                }
            });
    /**
     * 권한 설정 및 상태
     * @param name [push, location, storage, camera, contact, usageStats]
     * @param show
     */
    public void permission(String name, String show) {
        Log.d(TAG, "permission: "+name+"/"+show);
        if (name.equals("push")) {
            permissionPush(show);
        }else if (name.equals("usageStats")) {
            permissionUsageStats(show);
        }else{
            permissionResult(false, name+" " + getString(R.string.common_not_support), "", false);
        }
    }
    private void permissionResult(boolean result, String msg, String name, boolean permit) {
        String strFunc = String.format("javascript:result_permission('error','%s','')", msg);
        if (result) {
            try {
                JSONObject dt = new JSONObject();
                dt.put("name", name);
                dt.put("permit", permit?"Y":"N");
                strFunc = String.format("javascript:result_permission('success','%s','%s')", msg, dt.toString());
            } catch (JSONException e) {
                throw new RuntimeException(e);
            }
        }else{
        }
        doCallFuncOnJSP(strFunc);
    }
    private void permissionUsageStats(String show) {
        boolean yn = PermissionManager.share().isPackageUsageStatsPermission();
        Log.d(TAG,"YN:"+yn);
        if (show.equals("Y") && yn == false) {
            launcher("usageStats", new LauncherResult() {
                @Override
                public void onResult(ActivityResult result) {
                    boolean ryn = PermissionManager.share().isPackageUsageStatsPermission();
                    Log.d(TAG, "usageStats-onresult:"+ryn);
                    permissionResult(true, "", "push", ryn);
                }
            });

        }else{
            permissionResult(true, "", "usageStats", yn);
        }
    }

    private void permissionPush(String show) {
        boolean yn = PermissionManager.share().isNotificationsPermission();
        Log.d(TAG, "YN:"+yn);
        if (show.equals("Y") && yn == false) {
            if (shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                // 왜 알림을 허용해야하는지 유저에게 알려주기를 권장
                ActivityCompat.requestPermissions(m_activity, new String[]{Manifest.permission.POST_NOTIFICATIONS}, permission_push);
            } else {
                permissionPushPopup(false);
            }
        } else {
            permissionResult(true, "", "push", yn);
        }

    }
    private void permissionPushPopup(boolean yn){
        if (yn) {
            permissionResult(true, "", "push", true);
        }else {
            launcher("push", new LauncherResult() {
                @Override
                public void onResult(ActivityResult result) {
                    boolean ryn = PermissionManager.share().isNotificationsPermission();
                    Log.d(TAG, "onresult:"+ryn);
                    permissionResult(true, "", "push", ryn);
                }
            });
        }
    }


    /**
     *
     * @param base64PDf
     * @throws IOException
     */
    public void convertBase64StringToFileAndStoreIt(String base64PDf, String mimeType) throws IOException {
        Log.d(TAG, "convertBase64StringToFileAndStoreIt:"+mimeType);

        String currentDateTime = DateFormat.getDateTimeInstance().format(new Date());
        MimeTypeMap mimeTypeMap = MimeTypeMap.getSingleton();
        String extension = mimeTypeMap.getExtensionFromMimeType(mimeType);
        String filename = System.currentTimeMillis() + "." + extension;
        File path = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS + "/" + m_context.getString(R.string.app_name));
        final File file = new File(path + "/" + filename);
        String regex = "^data:" + mimeType + ";base64,";
        byte[] pdfAsBytes = Base64.decode(base64PDf.replaceFirst(regex, ""), 0);
        try {
            if (!PermissionManager.share().isStorageWritePermission()) {
                PermissionManager.share().getStorageWritePermission();
                //Util.toast("Storage Write 권한이 없습니다.");
                //return;
            }
            if(!path.exists())
                path.mkdirs();
            if(!file.exists())
                file.createNewFile();
            FileOutputStream os = new FileOutputStream(file);
            os.write(pdfAsBytes);
            os.flush();
            os.close();

            //String mimetype = url.substring(url.indexOf(":") + 1, url.indexOf("/"));
            //Log.d(TAG, "mimetype:" + mimetype);
            Intent intent = new Intent();
            intent.setAction(android.content.Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.fromFile(file), mimeType);
            PendingIntent pIntent = PendingIntent.getActivity(m_context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationTools.addNotificationItemOnBar(m_context, getString(R.string.common_file) + " " + getString(R.string.common_download_complete), filename, pIntent);

        } catch (Exception e) {
            Toast.makeText(m_context, "FAILED TO DOWNLOAD THE FILE!", Toast.LENGTH_SHORT).show();
            e.printStackTrace();
        }

    }

    /**
     * google admob
     * @param type : banner, full
     * @param view : show,hide
     */
    public void adMob(String type, String view) {
        Log.d(TAG, "adMob:"+type+"/"+view);
        AdMobManager.shared(m_activity).adMob(type, view, new ReflectManager.YesNoCallback() {
            @Override
            public void onSuccess(String methodName, JSONObject rJson) {
                Log.d(TAG, "success-aaa: "+methodName+":"+rJson.toString());
                adMobResult(true, "");

                //main webview margin 을 adview height + 20 만큼 주기
                View adView = findViewById(getResources().getIdentifier("adView", "id", getPackageName()));
                // adView의 높이 측정
                adView.measure(View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
                int adViewHeight = adView.getMeasuredHeight() + 20;

                // m_mainWebview의 LayoutParams 가져오기
                ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) m_mainWebview.getLayoutParams();
                if (params != null) {
                    params.bottomMargin = adViewHeight;
                    m_mainWebview.setLayoutParams(params);
                }
            }

            @Override
            public void onFailure(String methodName, int errNo, String message) {
                Log.d(TAG, "failure: "+methodName+":"+errNo+":"+message);
                adMobResult(false, "["+errNo+"] "+message);
            }
        });
    }

    /**
     * admob callback
     * @param result
     * @param msg
     */
    private void adMobResult(boolean result, String msg) {
        String strFunc = String.format("javascript:result_AdMob('"+(result?"success":"error")+"','%s','')", msg);
        Log.d(TAG, "strFunc:"+strFunc);
        doCallFuncOnJSP(strFunc);
    }

    /**
     * admob 노출
     * @param t : [banner, fullFirst, fullEnd]
     */
    private void adMobLoad(String t){
        Log.d(TAG, "adMobLoadBanner11:"+t);
        //전면광고 first
        if ((t.equals("fullFirst") && Config.shared(m_context).getConfigBool("googleAdMob", "fullFirst"))
                || (t.equals("fullEnd") && Config.shared(m_context).getConfigBool("googleAdMob", "fullEnd"))) {
            AdMobManager.shared(m_activity).full(new ReflectManager.YesNoCallback() {
                @Override
                public void onSuccess(String methodName, JSONObject rJson) {
                    Log.d(TAG, "success: "+methodName+":"+rJson.toString());
                    adMobResult(true, "");
                }

                @Override
                public void onFailure(String methodName, int errNo, String message) {
                    Log.d(TAG, "failure: "+methodName+":"+errNo+":"+message);
                    adMobResult(false, "["+errNo+"] "+message);
                }
            });
        }
        //하단 배너
        Log.d(TAG, "efe:"+Config.shared(m_context).getConfigBool("googleAdMob", "bannerLoad"));
        if (t.equals("banner") && Config.shared(m_context).getConfigBool("googleAdMob", "bannerLoad")) {
            AdMobManager.shared(m_activity).banner(new ReflectManager.YesNoCallback() {
                @Override
                public void onSuccess(String methodName, JSONObject rJson) {
                    Log.d(TAG, "admob banner success: "+methodName+":"+rJson.toString());
                    adMobResult(true, "");
                }

                @Override
                public void onFailure(String methodName, int errNo, String message) {
                    Log.d(TAG, "failure: "+methodName+":"+errNo+":"+message);
                    adMobResult(false, "["+errNo+"] "+message);
                }
            });
        }

    }
}
