package kr.co.lusoft.func;


import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.ArrayList;

import kr.co.lusoft.ui.MainActivity;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.StackManager;

public class PermissionManager {
    String TAG = "*[PermissionManager]";
    @SuppressLint("StaticFieldLeak")
    private static PermissionManager instance = null;
    private ArrayList<String> m_tasks = null;
    private Activity m_activity;
    private static Context m_context;


    public static PermissionManager share() {
        m_context = SharedData.shared().getApplicationContext();
        if(instance == null) {
            instance = new PermissionManager();
        }
        return instance;
    }
    public static PermissionManager share(Context context) {
        m_context = context;
        if(instance == null) {
            instance = new PermissionManager();
        }
        return instance;
    }

    private PermissionManager() {
        m_tasks = new ArrayList<>();
    }

    public void Init(Activity activity) {
        m_activity = activity;
        m_context = activity.getApplicationContext();
    }


    public void addRequest(String strTask) {
        if(!m_tasks.contains(strTask)) {
            m_tasks.add(strTask);
        }
    }

    public void runTask(int permissionId) {
        int taskCount = m_tasks.size();
        String[] requestList = m_tasks.toArray(new String[taskCount]);
        Log.d(TAG, "efefe:"+requestList.toString());
        ActivityCompat.requestPermissions(m_activity, requestList, permissionId);
    }

    private void removeRequest(String strTask) {
        int pos = m_tasks.indexOf(strTask);
        if(pos > -1) {
            m_tasks.remove(pos);
        }
    }

    public void removeAllRequest() {
        m_tasks.clear();
    }


    //
    // Permission, Calendar : Read/Write ---------- ---------- ---------- ---------- ----------
    //
    public boolean isCalendarPermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
            if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
                result = true;
            }
        }
        return result;
    }

    public void getCalendarPermission() {
        Log.d(TAG, "getCalendarPermission");
        addRequest(Manifest.permission.READ_CALENDAR);
        addRequest(Manifest.permission.WRITE_CALENDAR);
    }

    public void removeCalendarRequest() {
        removeRequest(Manifest.permission.READ_CALENDAR);
        removeRequest(Manifest.permission.WRITE_CALENDAR);
    }

    //
    // Permission, Camera : capture, video ---------- ---------- ---------- ---------- ----------
    //
    public boolean isCamearaPermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            result = true;
        }
        return result;
    }

    public void getCamearaPermission() {
        Log.d(TAG, "getCamearaPermission");
        addRequest(Manifest.permission.CAMERA);
        addRequest(Manifest.permission.READ_EXTERNAL_STORAGE);
        addRequest(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        //addRequest(Manifest.permission.READ_MEDIA_AUDIO);
        //addRequest(Manifest.permission.READ_MEDIA_IMAGES);
        //addRequest(Manifest.permission.READ_MEDIA_VIDEO);
    }

    public void removeCameraRequest() {
        removeRequest(Manifest.permission.CAMERA);
        removeRequest(Manifest.permission.READ_EXTERNAL_STORAGE);
        removeRequest(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        //removeRequest(Manifest.permission.READ_MEDIA_AUDIO);
        //removeRequest(Manifest.permission.READ_MEDIA_IMAGES);
        //removeRequest(Manifest.permission.READ_MEDIA_VIDEO);
    }

    //
    // Permission, Contact : Read ---------- ---------- ---------- ---------- ----------
    //
    public boolean isContactPermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            result = true;
        }
        return result;
    }

    public void getContactPermission() {
        Log.d(TAG, "getContactPermission");
        addRequest(Manifest.permission.READ_CONTACTS);
        addRequest(Manifest.permission.WRITE_CONTACTS);
    }

    public void removeContactRequest() {
        removeRequest(Manifest.permission.READ_CONTACTS);
        removeRequest(Manifest.permission.WRITE_CONTACTS);
    }

    //
    // Permission, GPS :  ---------- ---------- ---------- ---------- ----------
    //
    public boolean isGPSPermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED)
        {
            if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                result = true;
            }
        }
        return result;
    }

    public void getGPSPermission() {
        Log.d(TAG, "getGPSPermission");
        addRequest(Manifest.permission.ACCESS_FINE_LOCATION);
        addRequest(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    public void removeGPSRequest() {
        removeRequest(Manifest.permission.ACCESS_FINE_LOCATION);
        removeRequest(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    //
    // Permission, micro : write ---------- ---------- ---------- ---------- ----------
    //
    public boolean isRecodePermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            result = true;
        }
        return result;
    }

    public void getRecodeAudioPermission() {
        Log.d(TAG, "getRecodeAudioPermission");
        addRequest(Manifest.permission.RECORD_AUDIO);
        addRequest(Manifest.permission.READ_EXTERNAL_STORAGE);
        addRequest(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        addRequest(Manifest.permission.READ_MEDIA_AUDIO);
        addRequest(Manifest.permission.READ_MEDIA_IMAGES);
        addRequest(Manifest.permission.READ_MEDIA_VIDEO);
    }

    public void removeRecodeAudoRequest() {
        removeRequest(Manifest.permission.RECORD_AUDIO);
        removeRequest(Manifest.permission.READ_EXTERNAL_STORAGE);
        removeRequest(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        removeRequest(Manifest.permission.READ_MEDIA_AUDIO);
        removeRequest(Manifest.permission.READ_MEDIA_IMAGES);
        removeRequest(Manifest.permission.READ_MEDIA_VIDEO);
    }

    //
    // Permission, Phone : call, dial ---------- ---------- ---------- ---------- ----------
    //
    public boolean isTelephonyPermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
            result = true;
        }
        return result;
    }

    public void getTelephonyInfoPermission() {
        Log.d(TAG, "getTelephonyInfoPermission");
        addRequest(Manifest.permission.READ_PHONE_STATE);
    }

    public void removeTelephonyInfoRequest() {
        removeRequest(Manifest.permission.READ_PHONE_STATE);
    }

    public boolean isPhoneCallPermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
            result = true;
        }
        return result;
    }

    public void getTelephonyCallPermission() {
        Log.d(TAG, "getTelephonyCallPermission");
        addRequest(Manifest.permission.CALL_PHONE);
    }

    public void removeTelephonyCallRequest() {
        removeRequest(Manifest.permission.CALL_PHONE);
    }

    //
    // Permission, Sensor : Read ---------- ---------- ---------- ---------- ----------
    //
    public boolean isSensorPermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) {
            result = true;
        }
        return result;
    }

    public void getSensorPermission() {
        Log.d(TAG, "getSensorPermission");
        addRequest(Manifest.permission.BODY_SENSORS);
    }

    public void removeSensorRequest() {
        removeRequest(Manifest.permission.BODY_SENSORS);
    }

    //
    // Permission, SMS : Read ---------- ---------- ---------- ---------- ----------
    //
    public boolean isSMSReadPermission() {
        boolean result = false;
        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED) {
            result = true;
        }
        return result;
    }

    public void getSMSReadPermission() {
        Log.d(TAG, "getSMSReadPermission");
        addRequest(Manifest.permission.READ_SMS);
        addRequest(Manifest.permission.SEND_SMS);
    }

    public void removeSMSRequest() {
        removeRequest(Manifest.permission.READ_SMS);
        removeRequest(Manifest.permission.SEND_SMS);
    }

    //
    // Permission, Storage : Read ---------- ---------- ---------- ---------- ----------
    //
    public boolean isStorageReadPermission() {
        boolean result = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED) {
                result = true;
            }
        }else{
            if (ActivityCompat.checkSelfPermission(m_context, android.Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
                result = true;
            }
        }
        return result;
    }

    public void getStorageReadPermission() {
        Log.d(TAG, "getStorageReadPermission");
        addRequest(Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    public void removeStorageReadRequest() {
        removeRequest(Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    //
    // Permission, Storage : write ---------- ---------- ---------- ---------- ----------
    //
    public boolean isStorageWritePermission() {
        boolean result = false;
        Log.d(TAG, "sdk_int:"+Build.VERSION.SDK_INT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED) {
                result = true;
            }
        }else{
            if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
                result = true;
            }
        }
        Log.d(TAG, "result:"+result);
        return result;
    }

    public void getStorageWritePermission() {
        Log.d(TAG, "getStorageWritePermission");
        addRequest(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        addRequest(Manifest.permission.READ_MEDIA_AUDIO);
        addRequest(Manifest.permission.READ_MEDIA_IMAGES);
        addRequest(Manifest.permission.READ_MEDIA_VIDEO);
    }

    public void removeStorageWriteRequest() {
        removeRequest(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        removeRequest(Manifest.permission.READ_MEDIA_AUDIO);
        removeRequest(Manifest.permission.READ_MEDIA_IMAGES);
        removeRequest(Manifest.permission.READ_MEDIA_VIDEO);
    }

    //다른 앱 실행 기록
    public boolean isPackageUsageStatsPermission() {
        Log.d(TAG, "isSPackageUsageStatsPermission");
        boolean result = false;
        AppOpsManager appOps = (AppOpsManager) m_context.getApplicationContext()
                .getSystemService(Context.APP_OPS_SERVICE);

        int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(), m_context.getApplicationContext().getPackageName());

        if (mode == AppOpsManager.MODE_DEFAULT) {
            result = (m_context.getApplicationContext().checkCallingOrSelfPermission(
                    android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED);
        }
        else {
            result = (mode == AppOpsManager.MODE_ALLOWED);
        }

        if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED) {
            result = true;
        }
        return result;
    }

    public void getPackageUsageStatsPermission() {
        Log.d(TAG, "getPackageUsageStatsPermission");
        addRequest(Manifest.permission.PACKAGE_USAGE_STATS);
        //((MainActivity)MainActivity.m_context).startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
    }

    public void removePackageUsageStatsRequest() {
        removeRequest(Manifest.permission.PACKAGE_USAGE_STATS);
    }
    public boolean isNotificationsPermission() {
        Log.d(TAG, "isNotificationsPermission");
        boolean result = false;
        if (NotificationManagerCompat.from(m_context).areNotificationsEnabled()) {
            result = true;
        }

        return result;
    }
    public void getNotificationsPermission() {
        Log.d(TAG, "getNotificationsPermission");
        addRequest(Manifest.permission.POST_NOTIFICATIONS);
    }

    public void removeNotificationsRequest() {
        removeRequest(Manifest.permission.POST_NOTIFICATIONS);
    }
    public boolean isBluetoothPermission() {
        if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
                    && ActivityCompat.checkSelfPermission(m_context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
                    && ActivityCompat.checkSelfPermission(m_context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                return true;
            }
        }
        else {
            if (ActivityCompat.checkSelfPermission(m_context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ) {
                return true;
            }
        }
        return false;
    }
    public void checkBluetoothPermission() {
        Log.d(TAG, "checkBluetoothPermission:"+isBluetoothPermission());
        if (isBluetoothPermission()==false) {
            Intent intent = new Intent();
            intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            //intent.setAction(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);//다른 앱위에 표시
            Uri uri = Uri.fromParts("package",m_context.getPackageName(), null);
            intent.setData(uri);
            ((MainActivity) MainActivity.m_context).startActivity(intent);
        }
    }
    public void getBluetoothPermission() {
        Log.d(TAG, "getNotificationsPermission");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            addRequest(Manifest.permission.BLUETOOTH_CONNECT);
            addRequest(Manifest.permission.BLUETOOTH_SCAN);
            //addRequest(Manifest.permission.BLUETOOTH_ADVERTISE);
            //addRequest(Manifest.permission.ACCESS_BACKGROUND_LOCATION);
        }else{
            addRequest(Manifest.permission.ACCESS_FINE_LOCATION);
        }
    }

    public void removeBluetoothRequest() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            removeRequest(Manifest.permission.BLUETOOTH_CONNECT);
            removeRequest(Manifest.permission.BLUETOOTH_SCAN);
            removeRequest(Manifest.permission.ACCESS_BACKGROUND_LOCATION);
        }else{
            removeRequest(Manifest.permission.ACCESS_FINE_LOCATION);
        }
    }
}
