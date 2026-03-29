package kr.co.lusoft.util;


import static android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.Signature;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Movie;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.text.method.ScrollingMovementMethod;
import android.util.Base64;
import android.util.Log;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.net.URLDecoder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.text.StringCharacterIterator;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import kr.co.lusoft.BuildConfig;
import kr.co.lusoft.R;
import kr.co.lusoft.core.Lusoft;
import kr.co.lusoft.core.WebClient;


public class Util
{
    // log
    private static String TAG = "*[Util]";
    public static void log(String str)
    {
        log(str, TAG);
    }
    public static void log(String str, String PTAG)
    {
        Log.d(PTAG, str);
    }

    // toast
    public static void toast(String str)
    {
        Toast.makeText(
                SharedData.shared().getApplicationContext(),
                str,
                Toast.LENGTH_LONG
        ).show();
    }


    // functions
    public static boolean isSDCARDMounted()
    {
        String status = Environment.getExternalStorageState();
        if (status.equals(Environment.MEDIA_MOUNTED))
        {
            return true;
        }

        return false;
    }

    // 사진의 Rotate 상황 확인
    public static int exifOrientationToDegrees(int exifOrientation)
    {
        if(exifOrientation == ExifInterface.ORIENTATION_ROTATE_90)
        {
            return 90;
        }
        else if (exifOrientation == ExifInterface.ORIENTATION_ROTATE_180)
        {
            return 180;
        }
        else if (exifOrientation == ExifInterface.ORIENTATION_ROTATE_270)
        {
            return 270;
        }
        return 0;
    }

    public static boolean isAppIsInBackground()
    {
        boolean isInBackground = true;
        Context context = SharedData.shared().getApplicationContext();
        ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        assert am != null;
        List<ActivityManager.RunningAppProcessInfo> runningProcesses = am.getRunningAppProcesses();
        for (ActivityManager.RunningAppProcessInfo processInfo : runningProcesses) {
            if (processInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                for (String activeProcess : processInfo.pkgList) {
                    if (activeProcess.equals(context.getPackageName())) {
                        isInBackground = false;
                    }
                }
            }
        }
        return isInBackground;
    }


    // 사진의 Rotate 변경
    public static Bitmap rotate(Bitmap bitmap, int degrees)
    {
        if(degrees != 0 && bitmap != null)
        {
            Matrix m = new Matrix();
            m.setRotate(degrees, (float) bitmap.getWidth() / 2,
                    (float) bitmap.getHeight() / 2);

            try
            {
                Bitmap converted = Bitmap.createBitmap(bitmap, 0, 0,
                        bitmap.getWidth(), bitmap.getHeight(), m, true);
                if(bitmap != converted)
                {
                    bitmap.recycle();
                    bitmap = converted;
                }
            }
            catch(OutOfMemoryError ex)
            {
                // 메모리가 부족하여 회전을 시키지 못할 경우 그냥 원본을 반환합니다.
            }
        }
        return bitmap;
    }

    // resize Image, return new FilePath
    public static File resizeImage(String imagePath) {
        File result = new File(imagePath);
        if (isGif(imagePath)) {
            return result;
        }
        // 이미지를 상황에 맞게 회전시킨다
        Bitmap srcBmp = BitmapFactory.decodeFile(imagePath);
        ExifInterface exif = null;
        try {
            exif = new ExifInterface(imagePath);
        } catch (IOException e) {
            e.printStackTrace();
        }
        if(exif != null){
            int exifDegree = 0;
            try {
                int exifOrientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                exifDegree = exifOrientationToDegrees(exifOrientation);
            }catch (Exception e){
                return new File(imagePath);
            }
            srcBmp = rotate(srcBmp, exifDegree);

            int     iWidth  = 1024;   // 최대 너비
            float   fWidth  = srcBmp.getWidth();
            float   fHeight = srcBmp.getHeight();
            if(fWidth > iWidth) {
                float mWidth = (fWidth / 100);
                float fScale = (iWidth / mWidth);
                fWidth *= (fScale / 100);
                fHeight *= (fScale / 100);
            }

            // 리사이징
            Date date = new Date();
            @SuppressLint("SimpleDateFormat") DateFormat dateFormat = new SimpleDateFormat("yyyymmddhhmmssSSS");
            String fileName = dateFormat.format(date) + ".jpg";

            String newImagePath = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES) + "/" + fileName;
            try {
                Bitmap resizedBmp = Bitmap.createScaledBitmap(srcBmp, (int)fWidth, (int)fHeight, true);
                ByteArrayOutputStream stream = new ByteArrayOutputStream();
                resizedBmp.compress(Bitmap.CompressFormat.JPEG, 100, stream);

                byte[] bytes = stream.toByteArray();
                FileOutputStream fos = new FileOutputStream(newImagePath);
                fos.write(bytes);
                fos.flush();
                fos.close();
            } catch (Exception ex) {
                Log.e(TAG, ex.getMessage());
            } finally {
                result = new File(newImagePath);
            }
        }

        return result;
    }

    public static boolean isGif(String imagePath)
    {
        try
        {
            File file = new File(imagePath);
            FileInputStream fileInputStream = new FileInputStream(file);
            ByteArrayOutputStream outStream = new ByteArrayOutputStream();

            byte[] buffer = new byte[1024];
            int len = 0;

            while ((len = fileInputStream.read(buffer)) != -1)
            {
                outStream.write(buffer, 0, len);
            }

            fileInputStream.close();
            byte[] bytes = outStream.toByteArray();

            Movie gif = Movie.decodeByteArray(bytes, 0, bytes.length);
            if (gif != null)
            {
                return true;
            }
        }
        catch (IOException ie)
        {
            ie.printStackTrace();
        }

        return false;
    }

    // notification id
    public static int getNextNotificationID() {
        int notiID = 1000;
        try {
            String notiIDStr = SharedData.shared().loadData(SharedData.NotiID);
            if (notiIDStr == null || notiIDStr.equals("")) {
                notiIDStr = "1000";
            }

            notiID = Integer.parseInt(notiIDStr);
            if (notiID > 1100) {
                notiID = 1000;
            }
            notiID += 1;
            SharedData.shared().saveData(SharedData.NotiID, String.valueOf(notiID));
        }catch (Exception e){

        }
        return notiID;
    }

    public static int getVersionCode()
    {
        int nVersionCode = 1;

        PackageInfo info = null;
        try {
            Activity context = StackManager.rootActivity();
            info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            nVersionCode = info.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            e.printStackTrace();
        }

        return nVersionCode;
    }
    public static boolean isPackageInstalled(String pkgName) {
        try {
            Activity context = StackManager.rootActivity();
            context.getPackageManager().getPackageInfo(pkgName, PackageManager.GET_ACTIVITIES);
        } catch (PackageManager.NameNotFoundException e) {
            e.printStackTrace();
            return false;
        }
        return true;
    }
    public static String getVersionName()
    {
        String strVersionName = "";

        PackageInfo info = null;
        try {
            Activity context = StackManager.rootActivity();
            info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            strVersionName = info.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            e.printStackTrace();
        }

        return strVersionName;
    }

    public static String getViewerType(String strExtention)
    {
        String strResult = "";
        switch (strExtention)
        {
            /**
             * Cad 관련
             **/
            case "dwg":
                // AutoCAD drawing files
                strResult = "application/acad";
                break;
            case "ccad":
                // ClarisCAD files
                strResult = "application/clariscad";
                break;
            case "dxf":
                // DXF (AutoCAD)
                strResult = "application/dxf";
                break;

            /**
             * MS 관련
             **/
            case "mdb":
                strResult = "application/msaccess";
                break;
            case "doc":
            case "docx":
                strResult = "application/msword";
                break;
            case "xls":
            case "xlsx":
                strResult = "application/vnd.ms-excel";
                break;
            case "ppt":
            case "pptx":
                strResult = "application/vnd.ms-powerpoint";
                break;
            case "avi":
                strResult = "video/x-msvideo";
                break;

            /**
             * Adobe 관련
             **/
            case "pdf":
                strResult = "application/pdf";
                break;
            case "ai":
            case "ps":
            case "eps":
                // Postscript, encapsulated Postscript, Adobe Illustrator
                strResult = "application/postscript";
                break;

            /**
             * Image 관련
             **/
            case "jpeg":
            case "jpg":
            case "jpe":
            case "tiff":
            case "tif":
            case "gif":
            case "png":
            case "bmp":
                strResult = "image/*";
                break;

            /**
             * Text 관련
             **/
            case "txt":
                strResult = "text/plain";
                break;
            case "rar":
            case "egg":
            case "tar":
            case "gzip":
            case "7z":
            case "zip":
                strResult = "application/zip";
                break;
        }

        return strResult;
    }

    public static String getPackageName(Context context)
    {
        String strPackageName = "";
        strPackageName = context.getPackageName();
        return strPackageName;
    }

    public static String getLauncherClassName(Context context) {

        PackageManager pm = context.getPackageManager();

        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);

        List<ResolveInfo> resolveInfos = pm.queryIntentActivities(intent, 0);
        for (ResolveInfo resolveInfo : resolveInfos) {
            String pkgName = resolveInfo.activityInfo.applicationInfo.packageName;
            if (pkgName.equalsIgnoreCase(context.getPackageName())) {
                String className = resolveInfo.activityInfo.name;
                return className;
            }
        }
        return null;
    }

    public static String getRealPathFromURI(Uri contentUri) {
        int column_index=0;
        String[] proj = {MediaStore.Images.Media.DATA};
        Activity context = StackManager.rootActivity();
        Cursor cursor = context.getContentResolver().query(contentUri, proj, null, null, null);
        if(cursor.moveToFirst()){
            column_index = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA);
        }

        return cursor.getString(column_index);
    }

    public static String getInstalledApps() {
        JSONArray jArray = new JSONArray();

        Activity context = StackManager.rootActivity();
        PackageManager pkgm = context.getPackageManager();
        Intent intent = new Intent(Intent.ACTION_MAIN, null);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> AppInfos = pkgm.queryIntentActivities(intent, 0);
        int nIndex = 0;
        for (ResolveInfo info : AppInfos)
        {
            ActivityInfo ai = info.activityInfo;
            Intent isAvail = context.getPackageManager().getLaunchIntentForPackage(ai.packageName);
            if (isAvail != null)
            {
                JSONObject item = new JSONObject();
                JSONObject contents = new JSONObject();

                try
                {
                    contents.put("app_nm", ai.loadLabel(pkgm).toString());
                    contents.put("package_nm", ai.packageName);
                    item.put("index", String.valueOf(nIndex));
                    item.put("list", contents);
                    jArray.put(item);
                    nIndex++;

                    Log.i("TITLE", ai.loadLabel(pkgm).toString());
                    Log.i("NAME", ai.packageName);

                } catch (JSONException e) {
                    e.printStackTrace();
                }
            }
        }

        return jArray.toString();
    }

    public static byte[] inputStreamToByteArray(InputStream is) {

        byte[] resBytes = null;
        ByteArrayOutputStream bos = new ByteArrayOutputStream();

        byte[] buffer = new byte[1024];
        int read = -1;
        try {
            while ( (read = is.read(buffer)) != -1 ) {
                bos.write(buffer, 0, read);
            }

            resBytes = bos.toByteArray();
            bos.close();
        }
        catch (IOException e) {
            e.printStackTrace();
        }

        return resBytes;
    }

    @SuppressLint("Range")
    public static Uri convertContentToFileUri(Context ctx, Uri uri) throws Exception {
        Cursor cursor = null;
        try {
            cursor = ctx.getContentResolver().query(uri, null, null, null, null);
            cursor.moveToNext();
            return Uri.fromFile(new File(cursor.getString(cursor.getColumnIndex(MediaStore.MediaColumns.DATA))));
        } finally {
            if(cursor != null)
                cursor.close();
        }
    }

    public static boolean isAppPreventSecurityVulnerabilities() {
        final String[] AppIdList = {
                "lu_househelper",
                "lu_jjangtok",
                "lu_sapjil",
                "lu_bonos",
                "lu_ilbangbang"
        };
        return Arrays.asList(AppIdList).contains(BuildConfig.FLAVOR);
    }

    public static String toDate(long timeStamp) {
        return toDate(timeStamp, "");
    }
    public static String toDate(long timeStamp, String format){
        String returnDate = "";
        try {
            if (timeStamp > 0){
                Date date = new Date(timeStamp);
                if (format=="") format = "yyyy-MM-dd HH:mm:ss";
                SimpleDateFormat sdf = new SimpleDateFormat (format);
                returnDate = String.valueOf(sdf.format(date));
            }
        }
        catch (Exception e){
            //e.printStackTrace();
            Log.d(TAG,"toDate Error");
            Log.i(TAG,"[catch [에러] :: "+String.valueOf(e.getMessage())+"]");
        }
        return returnDate;
    }
    public static String toDay(){
        return toDay("yyyy-MM-dd");
    }
    public static String toDay(String format){
        SimpleDateFormat sdf = new SimpleDateFormat(format, Locale.getDefault());
        String today = sdf.format(new Date());
        return today;
    }
    public static String addSlashes(String text) {
        final StringBuffer sb = new StringBuffer(text.length() * 2);
        final StringCharacterIterator iterator = new StringCharacterIterator(text);

        char character = iterator.current();

        while (character != StringCharacterIterator.DONE) {
            if (character == '"')
                sb.append("\\\"");
            else if (character == '\'')
                sb.append("\\\'");
            else if (character == '\\')
                sb.append("\\\\");
            else if (character == '\n')
                sb.append("\\n");
            else if (character == '{')
                sb.append("\\{");
            else if (character == '}')
                sb.append("\\}");
            else/*from www  . ja  v a2 s.  c  o m*/
                sb.append(character);

            character = iterator.next();
        }

        return sb.toString();
    }
    public static boolean checkFirstRun() {
        boolean isFirstRun = SharedData.shared().loadBoolean("isFirstRun", true);
        if(isFirstRun) {
            //SharedData.shared().saveBoolean("isFirstRun", false);
        }
        return isFirstRun;
    }
    public static int pixelToDp(float pixel) {
        try {
            int i = (int) TypedValue.applyDimension(
                    TypedValue.COMPLEX_UNIT_DIP,
                    48f, // 원하는 dp 값
                    SharedData.shared().getApplicationContext().getResources().getDisplayMetrics()
            );
            return i;
        }catch(Exception e){

        }
        return 0;
    }
    @SuppressLint("JavascriptInterface")
    public static WebView weviewSetting(WebView wb){
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            if (0 != (SharedData.shared().getApplicationContext().getApplicationInfo().flags &= ApplicationInfo.FLAG_DEBUGGABLE)) {
                WebView.setWebContentsDebuggingEnabled(true);
            }
        }
        WebView.setWebContentsDebuggingEnabled(true);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(wb, true);

        WebSettings settings = wb.getSettings();

        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        //settings.setAppCacheEnabled(true); sdk 32에서 33으로 올리면서 아래것으로 변경
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        //        settings.setPluginsEnabled(true);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        if (Util.isAppPreventSecurityVulnerabilities()) {//TODO 임시로, store 에 올릴때, security vulnerabilities 이슈 선별적으로 수정.
            settings.setAllowFileAccess(false);
        } else { // 추후 이상 없으면 보안상 삭제되어야 함.
            settings.setAllowFileAccess(true);
            settings.setAllowFileAccessFromFileURLs(true); //Maybe you don't need this rule
            settings.setAllowUniversalAccessFromFileURLs(true);
        }
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setTextZoom(100);
        settings.setGeolocationEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setSupportMultipleWindows(true);
        try {
            Method m = WebSettings.class.getMethod("setMixedContentMode", int.class);
            m.invoke(wb.getSettings(), MIXED_CONTENT_COMPATIBILITY_MODE);
        } catch (Exception ex) {
            Log.e(TAG, "Error calling setMixedContentMode: " + ex.getMessage(), ex);
        }

        //user agent setting
        String userAgent = settings.getUserAgentString();
        Locale systemLocale;
        systemLocale = SharedData.shared().getApplicationContext().getResources().getConfiguration().getLocales().get(0);
        userAgent += " ANDROID lusoft/"+BuildConfig.FLAVOR;
        userAgent += " aVer/"+BuildConfig.VERSION_NAME;
        userAgent += " cVer/"+SharedData.shared().getApplicationContext().getString(R.string.core_version);
        userAgent += " lang/"+systemLocale.getLanguage();
        settings.setUserAgentString(userAgent);
        Log.d(TAG, "userAgent:"+userAgent);

        // 커맨드 설정
        wb.addJavascriptInterface(new Lusoft(wb.getContext()), "lusoft");
        wb.addJavascriptInterface(new WebClient.KCPPayBridge(), "KCPPayApp");
        wb.addJavascriptInterface(new WebClient.KCPPayPinInfoBridge(), "KCPPayPinInfo");
        wb.addJavascriptInterface(new WebClient.KCPPayPinReturn(), "KCPPayPinRet");
        wb.setDownloadListener(new WebClient.WebviewDownload());
        return wb;
    }
    public static void dialog(Activity activity, String content){
        dialog(activity, content, "", null, "", null, "", null, "");
    }
    public static void dialog(Activity activity, String content, String title){
        dialog(activity, content, title, null, "", null, "", null, "");
    }
    public static void dialog(Activity activity, String content, String title, View.OnClickListener okClick){
        dialog(activity, content, title, okClick, "", null,"", null, "");
    }
    public static void dialog(Activity activity, String content, String title, View.OnClickListener okClick, String okText){
        dialog(activity, content, title, okClick, okText, null, "", null, "");
    }
    public static void dialog(Activity activity, String content, String title, View.OnClickListener okClick, String okText, View.OnClickListener noClick){
        dialog(activity, content, title, okClick, okText, noClick, "", null, "");
    }
    public static void dialog(Activity activity, String content, String title, View.OnClickListener okClick, String okText, View.OnClickListener noClick, String noText ){
        dialog(activity, content, title, okClick, okText, noClick, noText, null, "");
    }
    public static void dialog(Activity activity, String content, String title, View.OnClickListener okClick, String okText, View.OnClickListener noClick, String noText, View.OnClickListener miClick){
        dialog(activity, content, title, okClick, okText, noClick, noText, miClick, "");
    }
    public static void dialog(Activity activity, String content, String title, View.OnClickListener okClick, String okText, View.OnClickListener noClick, String noText, View.OnClickListener miClick, String miText) {
        //Activity m = (Activity)SharedData.shared().getApplicationContext();
        Context context = (Context)activity;
        Handler mainHandler = new Handler(Looper.getMainLooper());

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
//                String strCurrentURL = m_mainWebview.getUrl();
//                if (!strCurrentURL.contains("chat") && !strCurrentURL.contains("talk")) {
                AlertDialog.Builder builder = new AlertDialog.Builder(context, R.style.RoundedDialog);
                // 커스텀 레이아웃 인플레이트
                LayoutInflater inflater = activity.getLayoutInflater();
                View dialogView = inflater.inflate(R.layout.custom_dialog, null);

                // 커스텀 뷰 설정
                TextView titleView = dialogView.findViewById(R.id.dialog_title);
                TextView messageView = dialogView.findViewById(R.id.dialog_content);
                Button btnOk = dialogView.findViewById(R.id.btn_confirm);
                Button btnCancel = dialogView.findViewById(R.id.btn_cancel);
                Button btnMiddle = dialogView.findViewById(R.id.btn_middle);
                LinearLayout btns = dialogView.findViewById(R.id.btns);
                Space space1 = dialogView.findViewById(R.id.btn_space1);
                Space space2 = dialogView.findViewById(R.id.btn_space2);

                titleView.setText(title.equals("") ? context.getString(R.string.app_name) : title);
                messageView.setText(content);
                messageView.setMovementMethod(new ScrollingMovementMethod());
                if (!okText.equals("")) btnOk.setText(okText);
                if (!noText.equals("")) btnCancel.setText(noText);
                if (!miText.equals("")) btnMiddle.setText(miText);

                // 다이얼로그 설정
                builder.setView(dialogView);
                // 다이얼로그 생성 및 표시
                AlertDialog dialog = builder.create();
                int btnCnt = 0;
                if (okClick!=null) btnCnt++;
                if (noClick!=null) btnCnt++;
                if (miClick!=null) btnCnt++;
                if (btnCnt == 3) {
                    btns.setOrientation(LinearLayout.VERTICAL);
                }

                // 확인 버튼 클릭 리스너
                if (okClick!=null) {
                    btnOk.setOnClickListener(new View.OnClickListener() {
                        @Override
                        public void onClick(View v) {
                            // 확인 버튼 동작 구현
                            okClick.onClick(v);
                            //Toast.makeText(MainActivity.this, "확인 클릭!", Toast.LENGTH_SHORT).show();
                            dialog.dismiss();
                        }
                    });
                    btnOk.setVisibility(View.VISIBLE);
                    space1.setVisibility(View.VISIBLE);
                }else{
                    btnOk.setVisibility(View.GONE);
                    space1.setVisibility(View.GONE);
                }
                // 중간 버튼 클릭 리스너
                if (miClick!=null) {
                    btnMiddle.setOnClickListener(new View.OnClickListener() {
                        @Override
                        public void onClick(View v) {
                            // 확인 버튼 동작 구현
                            miClick.onClick(v);
                            //Toast.makeText(MainActivity.this, "확인 클릭!", Toast.LENGTH_SHORT).show();
                            dialog.dismiss();
                        }
                    });
                    btnMiddle.setVisibility(View.VISIBLE);
                    space2.setVisibility(View.VISIBLE);
                }else{
                    btnMiddle.setVisibility(View.GONE);
                    space2.setVisibility(View.GONE);
                }

                // 취소 버튼 클릭 리스너 - 무조건 보임
                btnCancel.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        if (noClick!=null) noClick.onClick(v);
                        // 취소 버튼 동작 구현
                        dialog.dismiss();
                    }
                });
                dialog.show();
                if (dialog.getWindow() != null) {
                    // 화면 양쪽에 16dp 여백 주기
                    int margin = (int) (26 * context.getResources().getDisplayMetrics().density);
                    int width = context.getResources().getDisplayMetrics().widthPixels - (margin * 2);
                    dialog.getWindow().setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
                }
            }
        });
    }
    public static String getMimeType(String url) {
        String type = null;
        String extension = MimeTypeMap.getFileExtensionFromUrl(url);
        if (extension != null) {
            type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        }
        return type;
    }
    public static String bytesToHex(byte[] bytes) {
        char[] HEX_ARRAY = "0123456789ABCDEF".toCharArray();
        char[] hexChars = new char[bytes.length * 2];
        for (int j = 0; j < bytes.length; j++) {
            int v = bytes[j] & 0xFF;
            hexChars[j * 2] = HEX_ARRAY[v >>> 4];
            hexChars[j * 2 + 1] = HEX_ARRAY[v & 0x0F];
        }
        return new String(hexChars);
    }

    //query string 에서 가져오기
    public static String getQueryParameter(Uri uri, String key) {
        String Ret = "";
        Ret = uri.getQueryParameter(key);
        if (Ret == null) Ret = "";
        return Ret;
    }
    public static int toInt(String no) {
        try {
            return Integer.parseInt(no);
        }catch (Exception e){
            return 0;
        }
    }
    public static String JsonString(JSONObject obj, String key) {
        return JsonString(obj, key, "");
    }
    public static String JsonString(JSONObject obj, String key, String dvalue) {
        String ret = dvalue;
        try {
            if (obj.has(key)) {
                ret = obj.getString(key);
            }
        } catch (JSONException e) {}
        return ret;
    }
    public static int JsonInt(JSONObject obj, String key) {
        int ret = 0;
        try {
            ret = obj.getInt(key);
        } catch (JSONException e) {}
        return ret;
    }
    public static Long JsonLong(JSONObject obj, String key) {
        Long ret = 0L;
        try {
            ret = obj.getLong(key);
        } catch (JSONException e) {}
        return ret;
    }
    public static boolean JsonBool(JSONObject obj, String key) {
        boolean ret = false;
        try {
            ret = obj.getBoolean(key);
        } catch (JSONException e) {}
        return ret;
    }
    public static JSONObject queryStringToJson(String queryString) {
        JSONObject json = new JSONObject();

        if (queryString == null || queryString.isEmpty()) {
            return json;
        }

        try {
            String[] pairs = queryString.split("&");

            for (String pair : pairs) {
                String[] keyValue = pair.split("=", 2);

                if (keyValue.length == 2) {
                    String key = URLDecoder.decode(keyValue[0], "UTF-8");
                    String value = URLDecoder.decode(keyValue[1], "UTF-8");
                    json.put(key, value);
                } else if (keyValue.length == 1) {
                    // 값이 없는 경우 (예: "key=")
                    String key = URLDecoder.decode(keyValue[0], "UTF-8");
                    json.put(key, "");
                }
            }
        } catch (Exception e) {
            Log.e("JSON", "Error parsing query string", e);
        }

        return json;
    }
    public static String getHashKey(){
        String hkey = "";
        PackageInfo packageInfo = null;
        try {
            packageInfo = StackManager.mainActivity().getPackageManager().getPackageInfo(StackManager.mainActivity().getPackageName(), PackageManager.GET_SIGNATURES);
        } catch (PackageManager.NameNotFoundException e) {
            e.printStackTrace();
        }
        if (packageInfo == null)
            Log.d(TAG, "HashKey Error: HashKey:null");

        for (Signature signature : packageInfo.signatures) {
            try {
                MessageDigest md = MessageDigest.getInstance("SHA");
                md.update(signature.toByteArray());
                hkey =  Base64.encodeToString(md.digest(), Base64.DEFAULT);
            } catch (NoSuchAlgorithmException e) {
                Log.e(TAG, "HashKey Exception: signature=" + signature, e);
            }
        }
        return hkey;
    }
}

