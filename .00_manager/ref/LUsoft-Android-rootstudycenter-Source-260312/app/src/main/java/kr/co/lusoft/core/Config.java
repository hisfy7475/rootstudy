package kr.co.lusoft.core;


import android.annotation.SuppressLint;
import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;


@SuppressWarnings("ALL")
public class Config {
    String TAG = "*[Config]";
    @SuppressLint("StaticFieldLeak")
    private static Config m_shared = null;
    private Context mContext = null;
    private JSONObject m_config = null;

    private Config(Context context) {
        mContext=context;
    }

    public static Config shared(Context context)
    {
        if(m_shared == null) {
            m_shared = new Config(context);
        }
        return m_shared;
    }

    public String getReadConfigFile(String fileName) {
        String str = null;
        try {
            InputStream is = mContext.getAssets().open(fileName);
            int size = is.available();
            byte[] buffer = new byte[size];
            is.read(buffer);
            is.close();
            str = new String(buffer, "UTF-8");
        } catch (IOException ex) {
            ex.printStackTrace();
        }
        return str;
    }

    public boolean isPermissionInfo() {
        boolean isPermission = false;
        try {
            String read = getReadConfigFile("permissionInfo.json");
            JSONObject obj = new JSONObject(read);
            int count = obj.length();
            if(count > 0) {
                isPermission = true;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return isPermission;
    }

    public JSONObject getPermissionFromAsset() {
        String read = getReadConfigFile("permissionInfo.json");
        JSONObject json = null;
        try {
            json = new JSONObject(read);
        } catch (JSONException e) {
            e.printStackTrace();
        }
        return json;
    }

    public boolean isExit(String currentUrl) {
        boolean isExit = false;

        String read = getReadConfigFile("config.json");
        JSONObject json = null;
        JSONArray list = null;
        try {
            json = new JSONObject(read);
            list = json.getJSONArray("exit_url");
        } catch (JSONException e) {
            e.printStackTrace();
        } finally {
            assert list != null;

            currentUrl = currentUrl
                    .replace("https", "")
                    .replace("http", "");
            for(int i = 0; i < list.length(); i++) {
                try {
                    String url = list.getString(i)
                            .replace("https", "")
                            .replace("http", "");
                    if(url.equals(currentUrl)) {
                        isExit = true;
                        break;
                    }
                } catch (JSONException e) {
                    e.printStackTrace();
                }
            }
        }

        return isExit;
    }
    public String getConfigString(String...str) {
        String rStr = "";
        Log.d(TAG, str.toString());
        if (m_config==null) {
            String read = getReadConfigFile("config.json");
            if (!read.equals("")) {
                try {
                    m_config = new JSONObject((read));
                } catch (JSONException e) {
                    e.printStackTrace();
                }
            }
        }
        Log.d(TAG, "efefe:"+str.length);
        if (m_config!=null) {
            try{
                JSONObject j = m_config;
                int k = -1;
                for(String v:str) {
                    k++;
                    Log.d(TAG, "a:"+v);
                    if (j.has(v)) {
                        if ((str.length-1) == k) {
                            return j.getString(v);
                        }else{
                            j = j.getJSONObject(v);
                        }
                    }else{
                        return "";
                    }
                }
            } catch (JSONException e) {
                e.printStackTrace();
            }
        }
        return rStr;
    }
    public boolean getConfigBool(String...str) {
        boolean rStr = false;
        if (m_config==null) {
            String read = getReadConfigFile("config.json");
            if (!read.equals("")) {
                try {
                    m_config = new JSONObject((read));
                } catch (JSONException e) {
                    e.printStackTrace();
                }
            }
        }
        if (m_config!=null) {
            try{
                JSONObject j = m_config;
                int k = -1;
                for(String v:str) {
                    k++;
                    if (j.has(v)) {
                        if ((str.length-1) == k) {
                            return j.getBoolean(v);
                        }else{
                            j = j.getJSONObject(v);
                        }
                    }else{
                        return false;
                    }
                }
            } catch (JSONException e) {
                e.printStackTrace();
            }
        }
        return rStr;
    }
    public int getConfigInt(String...str) {
        if (m_config==null) {
            String read = getReadConfigFile("config.json");
            if (!read.equals("")) {
                try {
                    m_config = new JSONObject((read));
                } catch (JSONException e) {
                    e.printStackTrace();
                }
            }
        }
        if (m_config!=null) {
            try{
                JSONObject j = m_config;
                int k = -1;
                for(String v:str) {
                    k++;
                    if (j.has(v)) {
                        if ((str.length-1) == k) {
                            return j.getInt(v);
                        }else{
                            j = j.getJSONObject(v);
                        }
                    }else{
                        return 0;
                    }
                }
            } catch (JSONException e) {
                e.printStackTrace();
            }
        }
        return 0;
    }
}
