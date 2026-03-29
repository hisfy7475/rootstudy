package kr.co.lusoft.module;


import static kr.co.lusoft.core.Constants.GPS_MIN_DISTANCE;
import static kr.co.lusoft.core.Constants.GPS_MIN_TIME;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import java.io.Serializable;

import kr.co.lusoft.R;
import kr.co.lusoft.ui.MainActivity;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.StackManager;
import kr.co.lusoft.util.Util;


public class GPSManager implements LocationListener {
    String TAG = "*[GPSManager]";
    private LocationManager m_manager;

    private static Location m_location = null;
    private static double m_latitude = 0.0f;
    private static double m_longitude = 0.0f;

    private String mUserCode = "";
    private static OnEventLocationChange m_changeCallback = null;

    public interface OnEventLocationChange extends Serializable {
        void callback(String result, double latitude, double longitude, String provider, String userCode);
    }

    @SuppressLint("StaticFieldLeak")
    private static MainActivity m_activity = null;


    public GPSManager(OnEventLocationChange changeCallback) {
        m_activity = (MainActivity) StackManager.rootActivity();
        m_changeCallback = changeCallback;
        m_manager = (LocationManager) m_activity.getSystemService(Context.LOCATION_SERVICE);
    }
    public GPSManager(OnEventLocationChange changeCallback, String r) {
        mUserCode = r;
        m_activity = (MainActivity) StackManager.rootActivity();
        m_changeCallback = changeCallback;
        m_manager = (LocationManager) m_activity.getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public void onLocationChanged(Location location) {
        Log.d(TAG, "onLocationChanged:"+mUserCode);
        m_latitude = location.getLatitude();
        m_longitude = location.getLongitude();
        m_location = location;
        m_changeCallback.callback("success", m_latitude, m_longitude, location.getProvider(), mUserCode);
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {
        Log.d(TAG, "onStatusChanged");
    }

    @Override
    public void onProviderEnabled(String provider) {
        Log.d(TAG, "onProviderEnabled");
        Util.toast("알림: 단말기의 위치정보를 불러오는 중입니다...");
        doRun();
    }

    @Override
    public void onProviderDisabled(String provider) {
        Log.d(TAG, "onProviderDisabled");
        Util.toast("알림: 단말기의 위치정보 기능이 비활성 상태입니다.");
        m_latitude = 0;
        m_longitude = 0;
        m_location = null;
        m_changeCallback.callback("off", m_latitude, m_longitude, provider, mUserCode);
    }

    @SuppressWarnings("unused")
    public Location getLocation() {
        return m_location;
    }

    @SuppressWarnings("unused")
    public double getLatitude() {
        return m_latitude;
    }

    @SuppressWarnings("unused")
    public double getLongitude() {
        return m_longitude;
    }

    @SuppressWarnings("unused")
    public boolean IsAvail() {
        boolean isAvail = false;
        if (m_manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || m_manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            isAvail = true;
        }

        return isAvail;
    }

    @SuppressWarnings("unused")
    public void showGPSAlert(){
        AlertDialog.Builder alertDialog = new AlertDialog.Builder(m_activity);
        alertDialog.setTitle(R.string.gps_title);
        alertDialog.setMessage(R.string.gps_content);
        alertDialog.setPositiveButton(R.string.setting,
                new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog,int which) {
                        m_activity.startActivityForResult(new Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS), 0);
                        dialog.dismiss();
                    }
                });
        alertDialog.setNegativeButton(R.string.common_cancel,
                new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog, int which) {
                        m_changeCallback.callback("off", m_latitude, m_longitude, "", mUserCode);
                        dialog.dismiss();
                    }
                });
        alertDialog.show();
    }

    @SuppressWarnings("unused")
    public void doRun() {
        if (ActivityCompat.checkSelfPermission(m_activity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        boolean isGPS = m_manager.isProviderEnabled(LocationManager.GPS_PROVIDER);
        boolean isNetwork = m_manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);

        if (!isGPS && !isNetwork) {
            // GPS 와 네트워크사용이 가능하지 않을때 소스 구현
        } else {
            if (isGPS) {
                m_manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, GPS_MIN_TIME, GPS_MIN_DISTANCE, this);
                getLastLocation(LocationManager.GPS_PROVIDER);
            }
            if (isNetwork) {
                m_manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, GPS_MIN_TIME, GPS_MIN_DISTANCE, this);
                getLastLocation(LocationManager.NETWORK_PROVIDER);
            }
        }
    }

    @SuppressWarnings("unused")
    private void getLastLocation(String provider) {
        Log.d(TAG, "getLastLocation:"+provider);
        if (ActivityCompat.checkSelfPermission(m_activity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Location lastKnownLocation = m_manager.getLastKnownLocation(provider);
        if (lastKnownLocation != null) {
            m_latitude = lastKnownLocation.getLatitude();
            m_longitude = lastKnownLocation.getLongitude();
            m_location = lastKnownLocation;

            if(m_latitude > 0 && m_longitude > 0) {
                m_changeCallback.callback("success", m_latitude, m_longitude, m_location.getProvider(), mUserCode);
            } else {
//                Util.toast("알림: 단말기의 위치정보를 불러오는 중입니다...");
//                m_changeCallback.callback("no", 0, 0);
                doRun();
            }
        }
    }

    @SuppressWarnings("unused")
    public void stop()
    {
        if(m_manager != null) {
            m_manager.removeUpdates(this);
        }
    }
}
