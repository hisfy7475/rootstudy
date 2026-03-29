package kr.co.lusoft.ui;


import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.os.StrictMode;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONException;
import org.json.JSONObject;

import kr.co.lusoft.BuildConfig;
import kr.co.lusoft.R;
import kr.co.lusoft.core.Config;
import kr.co.lusoft.core.Lusoft;
import kr.co.lusoft.core.WebClient;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.StackManager;
import kr.co.lusoft.util.StatusBarUtils;
import kr.co.lusoft.util.Util;


public class WindowActivity extends AppCompatActivity implements View.OnClickListener
{
    private String TAG = "*[WindowActivity]";

    private WebView webView;


    @Override
    protected void onCreate(Bundle savedInstanceState)
    {
        super.onCreate(savedInstanceState);
        StackManager.addActivity(this);

        StrictMode.VmPolicy.Builder builder = new StrictMode.VmPolicy.Builder();
        StrictMode.setVmPolicy(builder.build());

        //갭처 불가 체크
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

        setContentView(R.layout.activity_window);
        // 배경색을 기준으로 상태바 아이콘 색상 설정
        int backgroundColor = ContextCompat.getColor(this, R.color.colorStatusBar);
        StatusBarUtils.setStatusBarIconColor(this, backgroundColor);

        webView = (WebView) findViewById(R.id.webView2);

        Util.weviewSetting(webView);
        StackManager.addWebView(this, webView);
        webView.setWebViewClient(new WebClient.Normal());
        webView.setWebChromeClient(new WebClient.Chrome(this));

        final String command = getIntent().getStringExtra("url");
        webView.loadUrl(command);
        SharedData.shared().windowActivity = this;

//        webView.setOnClickListener(this);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
    }

    @Override
    protected void onResume() {
        super.onResume();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
    }

    public void onBackPressed() {
        finish();
    }

    @Override
    protected  void onDestroy(){
        super.onDestroy();
        StackManager.removeActivity(this);
    }

    @Override
    public void onClick(View v) {
        switch (v.getId()) {
            default:
                View decorView = getWindow().getDecorView();
                int uiOptions = View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN;
                decorView.setSystemUiVisibility(uiOptions);
        }
    }
}
