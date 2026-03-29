package kr.co.lusoft;


import android.annotation.SuppressLint;
import android.app.Application;
import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.camera.camera2.Camera2Config;
import androidx.camera.core.CameraXConfig;

import java.io.File;

import kr.co.lusoft.util.StackManager;


public class AppDelegate extends Application
{
    private String TAG = "*[AppDelegate]";
    public static AppDelegate INSTANCE = null;
    public static boolean g_isNetwork = true;
    public static Context m_context;


    @SuppressLint("StaticFieldLeak")
    public AppDelegate() {
        Log.i("[LUSOFT]", "Start");
    }

    @Override
    public void onCreate() {
        super.onCreate();
        deleteCache(getApplicationContext());
        m_context = getApplicationContext();
    }
    /*
    @Override
    public Context getAppContext() {
        return this;
    }

    @Override
    public PictureSelectorEngine getPictureSelectorEngine() {
        return null;
    }

    @NonNull
    @Override
    public CameraXConfig getCameraXConfig() {
        return Camera2Config.defaultConfig();
    }
     */

    @Override
    public void onTerminate() {
        super.onTerminate();
    }

    public static void deleteCache(Context context) {
        try {
            File dir = context.getCacheDir();
            deleteDir(dir);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static boolean deleteDir(File dir) {
        if (dir != null && dir.isDirectory()) {
            String[] children = dir.list();
            for (int i = 0; i < children.length; i++) {
                boolean success = deleteDir(new File(dir, children[i]));
                if (!success) {
                    return false;
                }
            }
            return dir.delete();
        } else if(dir!= null && dir.isFile()) {
            return dir.delete();
        } else {
            return false;
        }
    }

}