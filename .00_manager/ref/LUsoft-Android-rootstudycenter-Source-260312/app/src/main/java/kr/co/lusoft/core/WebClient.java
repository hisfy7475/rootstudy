package kr.co.lusoft.core;


import static kr.co.lusoft.core.Constants.NOTIFICATION_SHOW_INTERVAL;
import static kr.co.lusoft.core.Constants.Permission.permission_storage_write;
import static kr.co.lusoft.core.Constants.Task.file_chooser_camera_image;
import static kr.co.lusoft.core.Constants.Task.file_chooser_camera_video;
import static kr.co.lusoft.core.Constants.Task.file_chooser_lollipop;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Parcelable;
import android.provider.Browser;
import android.provider.MediaStore;
import android.text.TextUtils;
import android.util.Base64;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.CookieSyncManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URISyntaxException;
import java.util.ArrayList;

import kr.co.kcp.util.PackageState;
import kr.co.lusoft.BuildConfig;
import kr.co.lusoft.R;
import kr.co.lusoft.func.PermissionManager;
import kr.co.lusoft.notification.NotificationTools;
import kr.co.lusoft.notification.download.DownloadInfo;
import kr.co.lusoft.notification.download.DownloadMng;
import kr.co.lusoft.ui.MainActivity;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.StackManager;
import kr.co.lusoft.util.Util;


public class WebClient
{
    static String TAG = "*[WebClient]";
    private static final Handler handler = new Handler();



    public static class Normal extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Log.d(TAG, "shouldOverrideUrlLoading-N url = " + request.getUrl().toString());
            if (request.getUrl() != null) {
                String strURL           = request.getUrl().toString();
                String strIndexHost     = Uri.parse(BuildConfig.HostUrl).getHost();

                if (TextUtils.isEmpty(strURL)) return false;
                //if (isSameWithIndexHost(strURL, strIndexHost)) return false;
                if (strURL.equals("about:blank")) return false;
                Log.d(TAG, "strURL:" +strURL);
                try {
                    if (strURL.startsWith("http://") || strURL.startsWith("https://")) {
                        if (strURL.contains("market.android.com") || strURL.contains("m.ahnlab.com/kr/site/download") || strURL.contains(".apk")) {
                            return url_scheme_intent(view, strURL);
                        }else{
                            return false;
                        }
                    }else if( strURL.startsWith("intent:")
                            || strURL.contains("market://")
                            || strURL.contains("vguard")
                            || strURL.contains("droidxantivirus")
                            || strURL.contains("v3mobile")
                            || strURL.contains("mvaccine")
                            || strURL.contains("smartwall://")
                            || strURL.contains("nidlogin://")
                             ) {
                        Intent intent = null;
                        try {
                            intent = Intent.parseUri(strURL, Intent.URI_INTENT_SCHEME);
                        } catch (URISyntaxException ex) {
                            return false;
                        }
                        String pName = "";
                        pName = intent.getPackage();
                        String intentMarker = "#Intent;";
                        int intentIdx = strURL.indexOf(intentMarker);
                        if (intentIdx < 0) intentIdx = strURL.indexOf("%23Intent;"); // %23 = #
                        if (intentIdx >= 0) {
                            String intentParams = strURL.substring(intentIdx);
                            String[] params = intentParams.split(";");
                            String scheme = "";
                            for (String param : params) {
                                Log.d(TAG, "param:" + param);
                                if (param.startsWith("package=")) {
                                    pName = param.substring(8);
                                }
                                if (param.startsWith("scheme=")) {
                                    scheme = param.substring(7);
                                }
                            }
                            // scheme으로 package 매핑
                            if (pName == null || pName.equals("")) {
                                if (scheme.equals("kakaolink")) pName = "com.kakao.talk";
                                else if (scheme.equals("storylink")) pName = "com.kakao.story";
                            }
                        }
                        if (pName==null || pName.equals("")) {
                            if (strURL.contains("com.kakao.talk")) pName = "com.kakao.talk";//로그인
                            if (strURL.contains("intent:kakaolink://")) pName = "com.kakao.talk";//카톡링크
                            if (strURL.contains("intent:storylink://")) pName = "com.kakao.story";//카톡스토리
                            if (strURL.contains("kakaobizchat")) pName = "com.kakao.talk";//카톡상담
                            if (strURL.contains("plusfriend")) pName = "com.kakao.talk";//카톡상담
                            if (strURL.contains("nidlogin")) pName = "com.nhn.android.search";//네이버앱
                            if (strURL.contains("naverpay")) pName = "com.nhn.android.search";//네이버앱
                            if (strURL.contains("naversearchapp")) pName = "com.nhn.android.search";//네이버앱
                        }
                        Log.d(TAG, "pname:" + pName);
                        if (Util.isPackageInstalled(pName)){
                            view.getContext().startActivity(intent);
                            return true;
                        }

                        // Fallback URL이 있으면 현재 웹뷰에 로딩
                        String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                        if (fallbackUrl != null) {
                            view.loadUrl(fallbackUrl);
                        }else{
                            if (pName!=null && !pName.equals("")) {
                                Intent i = new Intent(Intent.ACTION_VIEW);
                                i.setData(Uri.parse("market://details?id=" + pName));
                                view.getContext().startActivity(i);
                            }else{
                                Toast.makeText(view.getContext(), "Invalid Intent URL", Toast.LENGTH_SHORT).show();
                            }
                        }
                    } else if (strURL.startsWith("ispmobile://")) {
                        boolean isatallFlag = Util.isPackageInstalled("kvp.jjy.MispAndroid320");
                        if (isatallFlag) {
                            boolean override = false;
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(strURL));
                            intent.addCategory(Intent.CATEGORY_BROWSABLE);
                            intent.putExtra(Browser.EXTRA_APPLICATION_ID, view.getContext().getPackageName());
                            try {
                                view.getContext().startActivity(intent);
                                override = true;
                            } catch (ActivityNotFoundException ex) {
                            }
                            return override;
                        } else {
                            Util.toast("ISP "+view.getContext().getString(R.string.settlement_install_need));
                            return true;
                        }
                    } else if (strURL.startsWith("paypin://")) {
                        boolean isatallFlag = Util.isPackageInstalled("com.skp.android.paypin");
                        if (isatallFlag) {
                            boolean override = false;
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(strURL));
                            intent.addCategory(Intent.CATEGORY_BROWSABLE);
                            intent.putExtra(Browser.EXTRA_APPLICATION_ID, view.getContext().getPackageName());
                            try {
                                view.getContext().startActivity(intent);
                                override = true;
                            } catch (ActivityNotFoundException ex) {
                            }
                            return override;
                        } else {
                            Util.toast("PAYPIN "+view.getContext().getString(R.string.settlement_install_need));
                            return true;
                        }
                    } else if (strURL.startsWith("kakaolink://")) {
                        boolean isatallFlag = Util.isPackageInstalled("com.kakao.talk");
                        if (isatallFlag) {
                            boolean override = false;
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(strURL));
                            intent.addCategory(Intent.CATEGORY_BROWSABLE);
                            intent.putExtra(Browser.EXTRA_APPLICATION_ID, view.getContext().getPackageName());
                            try {
                                view.getContext().startActivity(intent);
                                ((Activity) view.getContext()).overridePendingTransition(R.anim.slide_in_right, R.anim.scale_down);
                                override = true;
                            } catch (ActivityNotFoundException e) {
                            }
                            return override;
                        } else {
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.kakao.talk"));
                            view.getContext().startActivity(intent);
                            return true;
                        }
                    } else if (strURL.startsWith("storylink://")) {
                        boolean isatallFlag = Util.isPackageInstalled("com.kakao.story");
                        if (isatallFlag) {
                            boolean override = false;
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(strURL));
                            intent.addCategory(Intent.CATEGORY_BROWSABLE);
                            intent.putExtra(Browser.EXTRA_APPLICATION_ID, view.getContext().getPackageName());
                            try {
                                view.getContext().startActivity(intent);
                                ((Activity) view.getContext()).overridePendingTransition(R.anim.slide_in_right, R.anim.scale_down);
                                override = true;
                            } catch (ActivityNotFoundException ex) {
                            }
                            return override;
                        } else {
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.kakao.story"));
                            view.getContext().startActivity(intent);
                            return true;
                        }
                    }else if (strURL.startsWith("sms:") || strURL.startsWith("mailto:")) {
                        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse(strURL));
                        view.getContext().startActivity(i);
                    } else if (strURL.startsWith("tel:")) {
                        Intent i = new Intent(Intent.ACTION_DIAL, Uri.parse(strURL));
                        view.getContext().startActivity(i);
                    } else {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(strURL));
                            view.getContext().startActivity(intent);
                        } catch (ActivityNotFoundException ex) {
                            Util.toast(view.getContext().getString(R.string.webview_app_not_install));
                        }
                    }
                } catch (Exception e) {
                    Log.d(TAG, "Exception: "+e.getMessage());
                    e.printStackTrace();
                    return false;
                }
            }else{
                Util.toast(view.getContext().getString(R.string.webview_bad_url));
            }
            return true;
        }


        @Override
        public void onReceivedSslError(WebView view,final SslErrorHandler handler, SslError error) {
//            super.onReceivedSslError(view, handler, error);
            boolean ssltest = false;
            if (ssltest) {
                handler.proceed();
            }else{
                Activity mActivity = StackManager.currentActivity();
                AlertDialog.Builder builder = new AlertDialog.Builder(mActivity);
                builder.setMessage(view.getContext().getString(R.string.webview_ssl_error));
                builder.setPositiveButton(mActivity.getString(R.string.common_ok), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        handler.proceed();
                    }
                });
                builder.setNegativeButton(mActivity.getString(R.string.common_cancel), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        handler.cancel();
                    }
                });
                AlertDialog dialog = builder.create();
                dialog.show();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            Log.d(TAG, "onPageFinished:" + url);
            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    MainActivity activity = (MainActivity) StackManager.rootActivity();
                    activity.setShowLoading(false);
                }
            }, 0);

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
                CookieSyncManager.getInstance().sync();
            } else {
                CookieManager.getInstance().flush();
            }
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            Log.d(TAG, "onPageStarted:" + url);
            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    MainActivity activity = (MainActivity) StackManager.rootActivity();
                    activity.setShowLoading(false);
                }
            }, NOTIFICATION_SHOW_INTERVAL*3);
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            super.onReceivedError(view, errorCode, description, failingUrl);
            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    MainActivity activity = (MainActivity) StackManager.rootActivity();
                    activity.setShowLoading(false);
                }
            }, 0);
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            // 방문한 링크를 데이터베이스에 업데이트한다고 알립니다.
            // Util.log("doUpdateVisitedHistory! url = " + url);
            super.doUpdateVisitedHistory(view, url, isReload);
        }


        private boolean isSameWithIndexHost(String loadUrl, String indexHost) {
            boolean bResult = false;

            if (TextUtils.isEmpty(loadUrl))
            {
                return false;
            }

            Uri uri = Uri.parse(loadUrl);
            if(uri != null)
            {
                if(!TextUtils.isEmpty(uri.getHost()))
                {
                    bResult = uri.getHost().equalsIgnoreCase(indexHost);
                }
            }

            return bResult;
        }
    }

    public static class Chrome extends WebChromeClient
    {
        public static ValueCallback<Uri>    CALLBACK = null;
        public static ValueCallback<Uri[]>  FILEPATHCALLBACK = null;
        static ValueCallback<Uri>           m_uploadMessage;
        static {
            m_uploadMessage = null;
        }

        private View mCustomView;
        private WebChromeClient.CustomViewCallback mCustomViewCallback;
        private int mOriginalOrientation;
        private FrameLayout mFullscreenContainer;
        private static final FrameLayout.LayoutParams COVER_SCREEN_PARAMS = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);

        private Activity m_activity;
        private WebView myWebViewPop;
        public Chrome(Activity activity) {
            this.m_activity = activity;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean userGesture, android.os.Message resultMsg) {
            Log.d(TAG, "onCreateWindow: " + isDialog);

            //WebView.HitTestResult result = view.getHitTestResult();
            // url 획득
            //String url = result.getExtra();
            //Log.d(TAG, "url:" +url);
            myWebViewPop = Util.weviewSetting(new WebView(view.getContext()));
            StackManager.addWebView(m_activity, myWebViewPop);//현재 웹뷰 세팅
            myWebViewPop.setWebViewClient(new WebViewClient(){
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Log.d(TAG, "shouldOverrideUrlLoading-onCreateWindow url = " + request.getUrl().toString());
                    if (request.getUrl() != null) {
                        String strURL = request.getUrl().toString();
                        if (strURL.startsWith("intent:")) {
                            try {
                                Intent intent = Intent.parseUri(strURL, Intent.URI_INTENT_SCHEME);
                                if (intent != null) {
                                    if (intent.resolveActivity(m_activity.getPackageManager()) != null) {
                                        view.getContext().startActivity(intent);
                                    } else {
                                        // 카카오톡이 설치되어 있지 않은 경우 Play 스토어로 이동
                                        String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                                        if (fallbackUrl != null) {
                                            view.loadUrl(fallbackUrl);
                                        } else {
                                            // Play 스토어로 이동하거나 다른 처리
                                            Intent marketIntent = new Intent(Intent.ACTION_VIEW);
                                            marketIntent.setData(Uri.parse("market://details?id=com.kakao.talk"));
                                            view.getContext().startActivity(marketIntent);
                                        }
                                    }
                                }
                                return true;
                            } catch (Exception e) {
                                e.printStackTrace();
                            }
                        }
                    }
                    return false; // 기본 웹뷰 처리로 돌아가기
                }
            });

            //webview 세팅
            LinearLayout.LayoutParams pa = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT);
            pa.setMargins(0,Util.pixelToDp(48f),0,0);
            final Dialog dialog = new Dialog(view.getContext());
            dialog.setContentView(myWebViewPop, pa);

            //닫기 버튼 세팅
            ImageView img = new ImageView(view.getContext());
            LinearLayout.LayoutParams pa2 = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    Util.pixelToDp(48f)
            );
            pa2.setMargins(0,0,0,0);
            //img.setLayoutParams(pa2);
            img.setScaleType(ImageView.ScaleType.FIT_END);
            img.setBackgroundColor(Color.WHITE);
            img.setImageResource(R.drawable.icon_dialog_close);

            img.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    dialog.dismiss();
                    myWebViewPop.destroy();
                }
            });
            dialog.addContentView(img, pa2);

            ViewGroup.LayoutParams params = dialog.getWindow().getAttributes();
            params.width = ViewGroup.LayoutParams.MATCH_PARENT;
            params.height = ViewGroup.LayoutParams.MATCH_PARENT;
            dialog.getWindow().setAttributes((WindowManager.LayoutParams) params);
            dialog.getWindow().getDecorView().setPadding(0,0,0,0);
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            dialog.show();
            // 뒤로가기
            dialog.setOnKeyListener(new DialogInterface.OnKeyListener() {
                @Override
                public boolean onKey(DialogInterface dialogInterface, int keyCode, KeyEvent event) {
                    if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_DOWN) { // 뒤로가기 버튼 유무와 ACTION_DOWN일 경우
                        if (myWebViewPop.canGoBack()) {
                            myWebViewPop.goBack();
                        } else {
                            dialog.dismiss();
                            myWebViewPop.destroy();
                        }
                        return true;
                    } else {
                        return false;
                    }
                }
            });

            myWebViewPop.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView window) {
                    StackManager.removeWebView(m_activity, window);
                    dialog.dismiss();
                    window.destroy();
                }
            });

            ((WebView.WebViewTransport) resultMsg.obj).setWebView(myWebViewPop);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            super.onGeolocationPermissionsShowPrompt(origin, callback);
            callback.invoke(origin, true, false);
        }

        /**
         * 퍼미션  권한
         * @param request
         */
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.grant(request.getResources());
        }
        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(StackManager.currentActivity())
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok,
                            new AlertDialog.OnClickListener()
                            {
                                public void onClick(DialogInterface dialog, int which)
                                {
                                    result.confirm();
                                }
                            })
                    .setCancelable(false).create().show();

            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(StackManager.currentActivity())
                    .setMessage(message)
                    .setPositiveButton(m_activity.getString(R.string.common_ok), new AlertDialog.OnClickListener() {
                        public void onClick(DialogInterface dialog, int which) {
                            result.confirm();
                        }
                    })
                    .setNegativeButton(m_activity.getString(R.string.common_cancel), new AlertDialog.OnClickListener() {

                        public void onClick(DialogInterface dialog, int which) {
                            result.cancel();
                        }

                    })
                    .setCancelable(false).create().show();
            return true;
        }

        @SuppressWarnings("unused")
        public void openFileChooser(ValueCallback<Uri> uploadMsg, String acceptType) {
            Log.d(TAG, "openFileChooser");
            m_uploadMessage = uploadMsg;
            try {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(acceptType);

                Intent chooserIntent = Intent.createChooser(i, SharedData.shared().getApplicationContext().getString(R.string.webview_file_chooser));
                m_activity.startActivityForResult(chooserIntent, file_chooser_lollipop);
            } catch (Exception e) {
                Toast.makeText(m_activity, "Exception:" + e, Toast.LENGTH_LONG).show();
            }
        }

        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> _filePathCallback, FileChooserParams fileChooserParams) {
            Log.d(TAG, "onShowFileChooser");

            if (FILEPATHCALLBACK != null) {
                FILEPATHCALLBACK.onReceiveValue(null);
                FILEPATHCALLBACK=null;
            }
            FILEPATHCALLBACK = _filePathCallback;

            String accept = String.join(",", fileChooserParams.getAcceptTypes());
            boolean capture = fileChooserParams.isCaptureEnabled();
            boolean multiple = fileChooserParams.getMode()==0?false:true;
            Log.d(TAG, "fileChooserParams.getAcceptTypes():"+fileChooserParams.getAcceptTypes().toString());
            Log.d(TAG, "title:"+fileChooserParams.getMode());
            Log.d(TAG, "onShowFileChooser: accept: "+accept+" /capture: "+capture+" /multiple:"+multiple);

            //카메라 사진 캡처
            Intent intentCameraPic = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            //File path = Environment.getExternalStorageDirectory();
            File path_camera_image = m_activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            File file_camera_image = new File(path_camera_image, "temp.jpg");
            if (file_camera_image.exists()) file_camera_image.delete();
            file_camera_image = new File(path_camera_image, "temp.jpg");
            Uri cameraImageUri = FileProvider.getUriForFile(webView.getContext(), BuildConfig.APPLICATION_ID+".provider", file_camera_image);
            intentCameraPic.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);

            //카메라 동영상 캡처
            Intent intentCameraVideo = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
            //path = Environment.getExternalStorageDirectory();
            File path_camera_video = m_activity.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
            File file_camera_video = new File(path_camera_video, "temp.mp4");
            if (file_camera_video.exists()) file_camera_video.delete();
            file_camera_video = new File(path_camera_video, "temp.mp4");
            Uri cameraVideoUri = FileProvider.getUriForFile(webView.getContext(), BuildConfig.APPLICATION_ID+".provider", file_camera_video);
            intentCameraVideo.putExtra(MediaStore.EXTRA_OUTPUT, cameraVideoUri);

            //오디오 녹음기
            Intent intentAudioRecord = new Intent(MediaStore.Audio.Media.RECORD_SOUND_ACTION);

            //파일 선택창
            Intent actIntent = new Intent(Intent.ACTION_GET_CONTENT);
            actIntent.addCategory(Intent.CATEGORY_OPENABLE);
            actIntent.setType("*/*");
            actIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);

            Intent photoIntent;

            int fType = 0;

            if (accept.contains("image") || accept.contains("jpg") || accept.contains("jpeg") || accept.contains("gif") || accept.contains("png") || accept.contains("webp")
                    || accept.contains("tif")) {
                fType = 1;
                if (capture) {
                    m_activity.startActivityForResult(intentCameraPic, file_chooser_camera_image);
                    fType = -1;
                }
            }else if (accept.contains("video") || accept.contains("mp4") || accept.contains("webm") || accept.contains("m4v") || accept.contains("avi") || accept.contains("wmv") || accept.contains("mpg") || accept.contains("mpeg") || accept.contains("ts") || accept.contains("mkv") || accept.contains("mov") || accept.contains("3gp")) {
                fType = 2;
                if (capture) {
                    m_activity.startActivityForResult(intentCameraVideo, file_chooser_camera_video);
                    fType = -1;
                }
            }else if (accept.contains("audio") || accept.contains("mp3") || accept.contains("wav") || accept.contains("aac") || accept.contains("flac")) {
                fType = 3;
                if (capture) {
                    m_activity.startActivityForResult(intentAudioRecord, file_chooser_lollipop);
                    fType = -1;
                }
            }
            Log.d(TAG, "fType:"+fType);
            if (fType>-1) {
                /*
                if (capture) {
                    String pickTitle = SharedData.shared().getApplicationContext().getString(R.string.webview_capture_chooser);
                    Intent intent = Intent.createChooser(intentCameraPic, pickTitle);
                    intent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Parcelable[]{intentCameraVideo});
                    m_activity.startActivityForResult(intent, file_chooser_lollipop);
                }else{

                 */
                boolean file_picker = true;
                if (fType>0) {
                    Log.d(TAG,"image picker");
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {//photo picker 사용 가능
                        Log.d(TAG, "photo pikcer:"+multiple);
                        Log.d(TAG, "accept:"+accept);
                        Log.d(TAG, "length:"+fileChooserParams.getAcceptTypes().length);
                        file_picker = false;
                        //intent.setType("image/*");
                        ArrayList<String> acceptList = new ArrayList<>();
                        if (fileChooserParams.getAcceptTypes().length > 0) {
                            boolean image_chk = true;
                            for(int i=0; i<fileChooserParams.getAcceptTypes().length;i++) {
                                String b = fileChooserParams.getAcceptTypes()[i];
                                if (b.equals("image/*") || b.equals("video/*") || b.equals("audio/*")) {
                                    acceptList.add(b);
                                }else {
                                    b = Util.getMimeType(b.replace("image/", "a.").replace("video/", "a.").replace("audio/","a."));
                                    if (!b.startsWith("image") && !b.startsWith("video") && !b.startsWith("audio")) {
                                        image_chk = false;
                                    }
                                    acceptList.add(b);
                                }
                            }
                            if (!image_chk) file_picker = true;
                            Log.d(TAG, "accept:"+ accept);
                        }
                        Log.d(TAG, "file_picker:"+file_picker);
                        if (!file_picker) {
                            Log.d(TAG, "alkdjf;laksjdf;lasdkf");
                            photoIntent = new Intent(MediaStore.ACTION_PICK_IMAGES);
                            if (fType == 3) photoIntent = new Intent(Intent.ACTION_GET_CONTENT);
                            //accept = "image/"+String.join(",image/", fileChooserParams.getAcceptTypes());
                            if (fileChooserParams.getAcceptTypes().length==1) {
                                photoIntent.setType(fileChooserParams.getAcceptTypes()[0]);
                            }else{
                                photoIntent.setType("*/*");
                                String[] mimeTypes = acceptList.toArray(new String[0]);
                                photoIntent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
                            }
                            if (multiple) photoIntent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 100);
                            //m_activity.startActivityForResult(photoIntent, file_chooser_lollipop);
                            String pickTitle = SharedData.shared().getApplicationContext().getString(R.string.webview_file_chooser2);
                            Intent intent = Intent.createChooser(photoIntent, pickTitle);
                            intent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Parcelable[]{intentCameraPic, intentCameraVideo, intentAudioRecord});
                            m_activity.startActivityForResult(intent, file_chooser_lollipop);
                        }
                    }
                    /*
                    PictureSelector.create(webView.getContext())
                            .openGallery(fType)
                            .setImageEngine(GlideEngine.createGlideEngine())
                            .setSelectionMode(multiple ? SelectModeConfig.MULTIPLE : SelectModeConfig.SINGLE)
                            .forResult(new OnResultCallbackListener<LocalMedia>() {
                                @Override
                                public void onResult(ArrayList<LocalMedia> result) {
                                    Log.d(TAG, "onresult");
                                    Log.d(TAG, result.toString());
                                    Uri[] r = new Uri[result.size()];
                                    for (int i = 0; i < result.size(); i++) {
                                        File file = new File("", result.get(i).getRealPath());
                                        Uri cameraImageUri = FileProvider.getUriForFile(webView.getContext(), BuildConfig.APPLICATION_ID + ".provider", file);
                                        r[i] = cameraImageUri;
                                    }
                                    FILEPATHCALLBACK.onReceiveValue(r);
                                    FILEPATHCALLBACK = null;
                                }

                                @Override
                                public void onCancel() {
                                    Log.d(TAG, "oncancel");
                                    FILEPATHCALLBACK.onReceiveValue(null);
                                    FILEPATHCALLBACK = null;
                                }
                            });
                    */

                }
                if (file_picker) {
                    Log.d(TAG,"file picker");
                    String pickTitle = SharedData.shared().getApplicationContext().getString(R.string.webview_file_chooser2);
                    Intent intent = Intent.createChooser(actIntent, pickTitle);
                    intent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Parcelable[]{intentCameraPic, intentCameraVideo, intentAudioRecord});
                    m_activity.startActivityForResult(intent, file_chooser_lollipop);
                }

            }
            return true;
        }
        public boolean onConsoleMessage(ConsoleMessage cm) {
            onConsoleMessage(cm.message(), cm.lineNumber(), cm.sourceId());
            return true;
        }

        public void onConsoleMessage(String message, int lineNumber, String sourceID) {
            @SuppressLint("DefaultLocale") String strLog = String.format("%s | %d | %s", message, lineNumber, sourceID);
            Util.log(strLog);
        }

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
//            if (view instanceof FrameLayout){
//                FrameLayout frame = (FrameLayout) view;
//                if (frame.getFocusedChild() instanceof VideoView){
//                    VideoView videoView = (VideoView)frame.getFocusedChild();
//                    frame.removeView(videoView);
//                    videoView.setOnCompletionListener((MediaPlayer.OnCompletionListener) m_activity);
//                    videoView.setOnErrorListener((MediaPlayer.OnErrorListener) m_activity);
//                    videoView.start();
//                }
//            }else{
                if (mCustomView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                mOriginalOrientation = m_activity.getRequestedOrientation();
                FrameLayout decor = (FrameLayout) m_activity.getWindow().getDecorView();
                mFullscreenContainer = new FullscreenHolder(m_activity);
                mFullscreenContainer.addView(view, COVER_SCREEN_PARAMS);
                decor.addView(mFullscreenContainer, COVER_SCREEN_PARAMS);
                mCustomView = view;
                setFullscreen(true);
                mCustomViewCallback = callback;
//          mActivity.setRequestedOrientation(requestedOrientation);
//            }
            super.onShowCustomView(view, callback);
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onShowCustomView(View view, int requestedOrientation, WebChromeClient.CustomViewCallback callback) {
            this.onShowCustomView(view, callback);
        }

        @Override
        public void onHideCustomView() {
            if (mCustomView == null) {
                return;
            }

            setFullscreen(false);
            FrameLayout decor = (FrameLayout) m_activity.getWindow().getDecorView();
            decor.removeView(mFullscreenContainer);
            mFullscreenContainer = null;
            mCustomView = null;
            mCustomViewCallback.onCustomViewHidden();
            m_activity.setRequestedOrientation(mOriginalOrientation);
            View decorView = m_activity.getWindow().getDecorView();
            // Hide both the navigation bar and the status bar.
            // SYSTEM_UI_FLAG_FULLSCREEN is only available on Android 4.1 and higher, but as
            // a general rule, you should design your app to hide the status bar whenever you
            // hide the navigation bar.
            int uiOptions =  View.SYSTEM_UI_FLAG_FULLSCREEN;
            decorView.setSystemUiVisibility(uiOptions);
        }

        private void setFullscreen(boolean enabled) {
            Window win = m_activity.getWindow();
            WindowManager.LayoutParams winParams = win.getAttributes();
            final int bits = WindowManager.LayoutParams.FLAG_FULLSCREEN;
            if (enabled) {
                winParams.flags |= bits;
            } else {
                winParams.flags &= ~bits;
                if (mCustomView != null) {
                    mCustomView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                }
            }
            win.setAttributes(winParams);
            View decorView = m_activity.getWindow().getDecorView();
            int uiOptions = View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN;
            decorView.setSystemUiVisibility(uiOptions);
        }

        private static class FullscreenHolder extends FrameLayout {
            public FullscreenHolder(Context ctx) {
                super(ctx);
                setBackgroundColor(ContextCompat.getColor(ctx, android.R.color.black));
            }

            @SuppressLint("ClickableViewAccessibility")
            @Override
            public boolean onTouchEvent(MotionEvent evt) {
                return true;
            }
        }
    }

    public static class WebviewDownload extends WebViewClient implements DownloadListener {

        @Override
        public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
            Log.d(TAG, "downloadstart");
            Log.d(TAG,"***** onDownloadStart() - url : "+url);
            Log.d(TAG,"***** onDownloadStart() - userAgent : "+userAgent);
            Log.d(TAG,"***** onDownloadStart() - contentDisposition : "+contentDisposition);
            Log.d(TAG,"***** onDownloadStart() - mimeType : "+mimeType);
            if (url.startsWith("data:")) {  //when url is base64 encoded data
                String path = createAndSaveFileFromBase64Url(url);
                return;
            }
            if (url.startsWith("blob")) {  //when url is base64 encoded data
                String path = getBase64StringFromBlobUrl(url, mimeType);
                return;
            }
            Uri downloadurl = Uri.parse(url);
            //String filename = downloadurl.getLastPathSegment();
            String filename = contentDisposition.replace("attachment; filename=", "");
            if (filename.isEmpty()) {
                filename = downloadurl.getLastPathSegment();
            }else {
                filename = filename.replace("attachment;filename=", "");
                filename = filename.replace("\"", "");
            }
            Log.d(TAG, "filename:"+filename);
            DownloadInfo info = new DownloadInfo();
            info.setDownload_url(url);
            info.setDownload_mode("1");
            info.setDownload_file_name(filename);
            info.setDownload_file_name_org(filename);
            DownloadMng.manage().addInfo(info);
            if (!PermissionManager.share().isStorageWritePermission()) {
                //Util.toast("Storage Write 권한이 없습니다..");
                //return;
            }
            Lusoft.downloadFile();
            //blob:https://cgt.lusoft.co.kr/495ca6ca-608a-42aa-8261-e07cdac7f5e1
            //data:image/png;base64
        }

    }
    public static String getBase64StringFromBlobUrl(String blobUrl,String mimeType) {
        Log.d(TAG, "getBase64StringFromBlobUrl:"+blobUrl);
        if(blobUrl.startsWith("blob")){
            //String mimeType = "pdf";
            String strTxt =  "javascript: var xhr = new XMLHttpRequest();" +
                    "xhr.open('GET', '"+ blobUrl +"', true);" +
                    "xhr.setRequestHeader('Content-type','" + mimeType +";charset=UTF-8');" +
                    "xhr.responseType = 'blob';" +
                    "xhr.onload = function(e) {" +
                    "    if (this.status == 200) {" +
                    "        var blobFile = this.response;" +
                    "        var reader = new FileReader();" +
                    "        reader.readAsDataURL(blobFile);" +
                    "        reader.onloadend = function() {" +
                    "            base64data = reader.result;" +
                    "            console.log('base64data', base64data);window.lusoft.getBase64FromBlobData(base64data, '"+mimeType+"');" +
                    "        }" +
                    "    }" +
                    "};" +
                    "xhr.send();";
            ((MainActivity)MainActivity.m_context).doCallFuncOnJSP(strTxt);
        }
        return "javascript: console.log('It is not a Blob URL');";
    }


    /**
     * 이미지 blob 저장
     * @param url
     * @return
     */
    public static String createAndSaveFileFromBase64Url(String url) {

        Context context = SharedData.shared().getApplicationContext();
        File path = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS + "/" + context.getString(R.string.app_name));
        String filetype = url.substring(url.indexOf("/") + 1, url.indexOf(";"));
        String filename = System.currentTimeMillis() + "." + filetype;
        Log.d(TAG, "f:"+path + "=>" + filename);
        File file = new File(path, filename);
        try {
            if (!PermissionManager.share().isStorageWritePermission()) {
                PermissionManager.share().getStorageWritePermission();
                PermissionManager.share().runTask(permission_storage_write);
                Util.toast(SharedData.shared().getApplicationContext().getString(R.string.webview_storage_write_error));
                //return "";
            }
            Log.d(TAG, "fff:"+path.exists());
            if(!path.exists()) {
                boolean r = path.mkdirs();
                Log.d(TAG, "make:"+r);
            }
            if(!file.exists())
                file.createNewFile();

            String base64EncodedString = url.substring(url.indexOf(",") + 1);
            byte[] decodedBytes = Base64.decode(base64EncodedString, Base64.DEFAULT);
            OutputStream os = new FileOutputStream(file);
            os.write(decodedBytes);
            os.close();

            String mimetype = url.substring(url.indexOf(":") + 1, url.indexOf("/"));
            Log.d(TAG, "mimetype:" + mimetype);
            Intent intent = new Intent();
            intent.setAction(android.content.Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.fromFile(file), (mimetype + "/*"));
            PendingIntent pIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationTools.addNotificationItemOnBar(context, "File Download Complete", filename, pIntent);
        } catch (IOException e) {
            Log.w("ExternalStorage", "Error writing " + file, e);
            Util.toast("File Download Fail");
            //Toast.makeText(getApplicationContext(), R.string.error_downloading, Toast.LENGTH_LONG).show();
        }

        return file.toString();
    }
    /*****************************************************************
     * KCP 결제
     *****************************************************************/
    private static boolean url_scheme_intent(WebView view, String url)
    {
        Intent intent;
        MainActivity activity = (MainActivity) StackManager.rootActivity();
        if (url.startsWith("intent://"))
        {
            try {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            }
            catch (URISyntaxException ex) {
                return false;
            }

            // 앱설치 체크를 합니다.
            if (activity.getPackageManager().resolveActivity(intent, 0) == null) {
                String packagename = intent.getPackage();
                if (packagename != null) {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=pname:" + packagename)));
                    return true;
                }
            }

            String dataString = intent.getDataString();
            intent = new Intent(Intent.ACTION_VIEW, Uri.parse(dataString));
            try {
                activity.startActivity(intent);
            }
            catch (ActivityNotFoundException e) {
                return false;
            }
        }
        // 기존 방식
        else {
            // 삼성과 같은 경우 어플이 없을 경우 마켓으로 이동 할수 있도록 넣은 샘플 입니다.
            // 실제 구현시 업체 구현 여부에 따라 삭제 처리 하시는것이 좋습니다.
            if (url.startsWith("mpocket.online.ansimclick")) {
                if (!new PackageState(activity).getPackageDownloadInstallState("kr.co.samsungcard.mpocket")) {
                    Toast.makeText(activity, SharedData.shared().getApplicationContext().getString(R.string.webview_install_try), Toast.LENGTH_LONG).show();
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=kr.co.samsungcard.mpocket")));
                    return true;
                }
            }

            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            }
            catch (Exception e) {
                //ISP
                if( url.startsWith("ispmobile://"))
                {
                    view.loadData("<html><body></body></html>", "text/html", "euc-kr");
                    activity.showMainDialog(MainActivity.DIALOG_ISP);
                    return false;
                }
                //현대앱카드
                else if( url.contains("hdcardappcardansimclick://"))
                {
                    MainActivity.DIALOG_CARDNM = "HYUNDAE";
                    Log.e("INIPAYMOBILE", "INIPAYMOBILE, 현대앱카드설치 ");
                    view.loadData("<html><body></body></html>", "text/html", "euc-kr");
                    activity.showMainDialog(MainActivity.DIALOG_CARDAPP);
                    return false;
                }
                //신한앱카드
                else if( url.contains("shinhan-sr-ansimclick://"))
                {
                    MainActivity.DIALOG_CARDNM = "SHINHAN";
                    Log.e("INIPAYMOBILE", "INIPAYMOBILE, 신한카드앱설치 ");
                    view.loadData("<html><body></body></html>", "text/html", "euc-kr");
                    activity.showMainDialog(MainActivity.DIALOG_CARDAPP);
                    return false;
                }
                //삼성앱카드
                else if( url.contains("mpocket.online.ansimclick://"))
                {
                    MainActivity.DIALOG_CARDNM = "SAMSUNG";
                    Log.e("INIPAYMOBILE", "INIPAYMOBILE, 삼성카드앱설치 ");
                    view.loadData("<html><body></body></html>", "text/html", "euc-kr");
                    activity.showMainDialog(MainActivity.DIALOG_CARDAPP);
                    return false;
                }
                //롯데 모바일결제
                else if( url.contains("lottesmartpay://"))
                {
                    MainActivity.DIALOG_CARDNM = "LOTTE";
                    Log.e("INIPAYMOBILE", "INIPAYMOBILE, 롯데모바일결제 설치 ");
                    view.loadData("<html><body></body></html>", "text/html", "euc-kr");
                    activity.showMainDialog(MainActivity.DIALOG_CARDAPP);
                    return false;
                }
                //롯데앱카드(간편결제)
                else if(url.contains("lotteappcard://"))
                {
                    MainActivity.DIALOG_CARDNM = "LOTTEAPPCARD";
                    Log.e("INIPAYMOBILE", "INIPAYMOBILE, 롯데앱카드 설치 ");
                    view.loadData("<html><body></body></html>", "text/html", "euc-kr");
                    activity.showMainDialog(MainActivity.DIALOG_CARDAPP);
                    return false;
                }
                //KB앱카드
                else if(url.contains("kb-acp://"))
                {
                    MainActivity.DIALOG_CARDNM = "KB";
                    Log.e("INIPAYMOBILE", "INIPAYMOBILE, KB카드앱설치 ");
                    view.loadData("<html><body></body></html>", "text/html", "euc-kr");
                    activity.showMainDialog(MainActivity.DIALOG_CARDAPP);
                    return false;
                }
                //하나SK카드 통합안심클릭앱
                else if(url.contains("hanaansim://"))
                {
                    MainActivity.DIALOG_CARDNM = "HANASK";
                    Log.e("INIPAYMOBILE", "INIPAYMOBILE, 하나카드앱설치 ");
                    view.loadData("<html><body></body></html>", "text/html", "euc-kr");
                    activity.showMainDialog(MainActivity.DIALOG_CARDAPP);
                    return false;
                }
                //현대카드 백신앱
                else if(url.contains("droidxantivirusweb"))
                {
                    Intent hydVIntent = new Intent(Intent.ACTION_VIEW);
                    hydVIntent.setData(Uri.parse("market://search?q=net.nshc.droidxantivirus"));
                    activity.startActivity(hydVIntent);
                }
                //INTENT:// 인입될시 예외 처리
                else if( url.startsWith("intent://"))
                {
                    try {
                        Intent excepIntent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                        String packageNm = excepIntent.getPackage();
                        excepIntent = new Intent(Intent.ACTION_VIEW);
                        excepIntent.setData(Uri.parse("market://search?q="+packageNm));
                        activity.startActivity(excepIntent);
                    } catch (URISyntaxException e1) {
                        Log.e("<INIPAYMOBILE>", "INTENT:// 인입될시 예외 처리  오류 : " + e1 );
                    }

                }
            }
        }

        return true;
    }

    public static class KCPPayPinReturn {
        // 페이핀 어플 응답값을 확인하는 클레스
        @SuppressWarnings("unused")
        public String getConfirm() {
            return "true";
        }
    }

    public static class KCPPayPinInfoBridge {
        @SuppressWarnings("unused")
        public void getPaypinInfo(final String url) {
            handler.post(new Runnable() {
                public void run() {
                    MainActivity activity = (MainActivity) StackManager.rootActivity();
                    PackageState ps = new PackageState(activity);
                    if (!ps.getPackageAllInstallState("com.skp.android.paypin")) {
                        paypinConfim();
                    } else {
                        url_scheme_intent(null, url);
                    }
                }
            });
        }

        private void paypinConfim() {
            MainActivity activity = (MainActivity) StackManager.rootActivity();
            AlertDialog.Builder dlgBuilder = new AlertDialog.Builder(activity);
            AlertDialog alertDlg;

            dlgBuilder.setTitle("확인");
            dlgBuilder.setMessage("PayPin "+SharedData.shared().getApplicationContext().getString(R.string.settlement_not_install));
            dlgBuilder.setCancelable(false);
            dlgBuilder.setPositiveButton("설치",
                    new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            dialog.dismiss();

                            if (!url_scheme_intent(null, "tstore://PRODUCT_VIEW/0000284061/0")) {
                                url_scheme_intent(null, "market://details?id=com.skp.android.paypin&feature=search_result#?t=W251bGwsMSwxLDEsImNvbS5za3AuYW5kcm9pZC5wYXlwaW4iXQ.k");
                            }
                        }
                    }
            );
            dlgBuilder.setNegativeButton("취소",
                    new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            dialog.dismiss();
                            MainActivity activity = (MainActivity) StackManager.rootActivity();
                            Toast.makeText(activity, SharedData.shared().getApplicationContext().getString(R.string.settlement_cancel_desc), Toast.LENGTH_SHORT).show();
                        }
                    }
            );

            alertDlg = dlgBuilder.create();
            alertDlg.show();
        }
    }

    public static class KCPPayBridge {
        @SuppressWarnings("unused")
        public void launchMISP(final String arg) {
            handler.post(new Runnable() {
                public void run() {
                    String strUrl;
                    String argUrl;

                    MainActivity activity = (MainActivity) StackManager.rootActivity();
                    PackageState ps = new PackageState(activity);

                    argUrl = arg;

                    if (!arg.equals("Install")) {
                        if (!ps.getPackageDownloadInstallState("kvp.jjy.MispAndroid")) {
                            argUrl = "Install";
                        }
                    }

                    strUrl = (argUrl.equals("Install"))
                            ? "market://details?id=kvp.jjy.MispAndroid320" //"http://mobile.vpay.co.kr/jsp/MISP/andown.jsp"
                            : argUrl;

                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(strUrl));
                    activity.startActivity(intent);
                }
            });
        }
    }

}