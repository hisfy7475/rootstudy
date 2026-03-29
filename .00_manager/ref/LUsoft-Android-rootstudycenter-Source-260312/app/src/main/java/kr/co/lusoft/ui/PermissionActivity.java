package kr.co.lusoft.ui;

import static kr.co.lusoft.core.Constants.Permission.permission_total;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.TypedArray;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.LocaleList;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.Locale;

import kr.co.lusoft.R;
import kr.co.lusoft.core.Config;
import kr.co.lusoft.func.PermissionManager;
import kr.co.lusoft.util.StatusBarUtils;


public class PermissionActivity extends AppCompatActivity {
    String TAG = "*[PermissionActivity]";
    private ArrayList<PermissionItem> m_items = new ArrayList<>();

    protected SharedPreferences prefs;

    @SuppressLint("ResourceType")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
        }
        setContentView(R.layout.activity_permission);
        // 배경색을 기준으로 상태바 아이콘 색상 설정
        int backgroundColor = ContextCompat.getColor(this, R.color.colorStatusBar);
        StatusBarUtils.setStatusBarIconColor(this, backgroundColor);

        prefs = this.getSharedPreferences("settings", 0);
        PermissionManager.share().Init(this);

        JSONObject permissionInfo = Config.shared(this).getPermissionFromAsset();
        if (permissionInfo == null) {
            Intent intent = new Intent(getApplicationContext(), MainActivity.class);
            startActivity(intent);
            finish();
            return;
        }
        Log.d(TAG, "permissionInfo:"+permissionInfo.toString());

        String[] titles;// = getResources().getStringArray(R.array.permission_en_title);
        String[] details;// = getResources().getStringArray(R.array.permission_en);
        String[] ess;// = getResources().getStringArray(R.array.permission_en);
        titles = getResources().getStringArray(R.array.permission_title);
        details = getResources().getStringArray(R.array.permission_detail);
        ess = getResources().getStringArray(R.array.permission_ess);

        /*
        Locale locale;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            locale = LocaleList.getDefault().get(0);
        } else {
            locale = Locale.getDefault();
        }
        if (locale.equals(Locale.KOREA)) {
            titles = getResources().getStringArray(R.array.permission_title);
            details = getResources().getStringArray(R.array.permission_detail);
        } else {
            titles = getResources().getStringArray(R.array.permission_title_en);
            details = getResources().getStringArray(R.array.permission_detail_en);
            String[] en = getResources().getStringArray(R.array.permission_titles);
            TextView title = findViewById(R.id.text_title);
            TextView sub = findViewById(R.id.text_sub);
            TextView button = findViewById(R.id.tv_confirm);
            title.setText(en[0]);
            sub.setText(en[1]);
            button.setText(en[2]);
        }

         */
        String[] keys = getResources().getStringArray(R.array.permission_keys);
        TypedArray icons = getResources().obtainTypedArray(R.array.permission_icon);
        JSONObject pers = new JSONObject();
        try {
            for (int i = 0; i < keys.length; i++){
                pers.put(keys[i], new JSONObject());
                pers.getJSONObject(keys[i]).put("title", titles[i]);
                pers.getJSONObject(keys[i]).put("detail", details[i]);
                pers.getJSONObject(keys[i]).put("ess", ess[i]);
                pers.getJSONObject(keys[i]).put("icon", icons.getResourceId(i,0));
            }
            Iterator<String> iter = pers.keys();
            while (iter.hasNext()) {
                String key = iter.next();
                JSONObject dt = pers.getJSONObject(key);
                boolean value = false;//표시여부
                if (permissionInfo.has(key)) {
                    try {
                        value = permissionInfo.getBoolean(key);
                    } catch (JSONException e) {
                    }
                }
                if(value) {
                    Log.d(TAG, "dd:"+key+"/"+dt.getString("title"));
                    //필수 표시여부
                    boolean vess = dt.getString("ess").equals("Y") ? true : false;
                    if (permissionInfo.has(key + "_rq")) {
                        try {
                            vess = permissionInfo.getBoolean(key + "_rq");
                        } catch (JSONException e) {
                        }
                    }
                    String title = dt.getString("title") + " ("+(vess?getString(R.string.permission_ess_y):getString(R.string.permission_ess_n))+")";
                    m_items.add(new PermissionItem(dt.getInt("icon"), title, dt.getString("detail")));
                    switch (key)
                    {
                        case "canlendar":
                            PermissionManager.share().getCalendarPermission();
                            break;
                        case "camera":
                            PermissionManager.share().getCamearaPermission();
                            break;
                        case "contact":
                            PermissionManager.share().getContactPermission();
                            break;
                        case "location":
                            PermissionManager.share().getGPSPermission();
                            break;
                        case "microphone":
                            PermissionManager.share().getRecodeAudioPermission();
                            break;
                        case "telephone":
                            PermissionManager.share().getTelephonyCallPermission();
                            PermissionManager.share().getTelephonyInfoPermission();
                            break;
                        case "sensor":
                            PermissionManager.share().getSensorPermission();
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                PermissionManager.share().addRequest(Manifest.permission.ACTIVITY_RECOGNITION);
                            }
                            break;
                        case "sms":
                            PermissionManager.share().getSMSReadPermission();
                            break;
                        case "storage":
                            PermissionManager.share().getStorageReadPermission();
                            PermissionManager.share().getStorageWritePermission();
                            break;
                        case "packUsageStats":
                            PermissionManager.share().getPackageUsageStatsPermission();
                            break;
                        case "notifications":
                            PermissionManager.share().getNotificationsPermission();
                            break;
                        case "ble":
                            PermissionManager.share().getBluetoothPermission();
                            break;

                    }
                }
            }
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }

        ListView listView = findViewById(R.id.lv_permission);
        PermissionAdapter adapter = new PermissionAdapter(this);
        listView.setAdapter(adapter);

        findViewById(R.id.tv_confirm).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Log.d(TAG, "click====");
                prefs.edit().putBoolean("isFirstRun", false).apply();
                PermissionManager.share().runTask(permission_total);
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String permissions[], @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        Log.d(TAG, "onRequestPermissionsResult:" + requestCode);
        if(requestCode == permission_total) {
            PermissionManager.share().removeAllRequest();
            Log.d(TAG, "종료하자");
            finish();
        }
    }
    @Override
    protected void onDestroy(){
        super.onDestroy();
        Log.d(TAG, "onDestroy");
    }

    public class PermissionItem {
        int icon;
        String title;
        String detail;

        PermissionItem(int icon, String title, String detail) {
            this.icon = icon;
            this.title = title;
            this.detail = detail;
        }

        public int getIcon() {
            return icon;
        }

        public String getTitle() {
            return title;
        }

        public String getDetail() {
            return detail;
        }
    }

    public class PermissionAdapter extends ArrayAdapter<PermissionItem> {

        private LayoutInflater inflater;

        PermissionAdapter(Context context) {
            super(context, R.layout.cell_permission);
            this.inflater = (LayoutInflater) context.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        }

        @Override
        public int getCount() {
            return m_items.size();
        }

        @NonNull
        @Override
        public View getView(int position, @Nullable View convertView, @NonNull ViewGroup parent) {
            if (convertView == null) {
                convertView = inflater.inflate(R.layout.cell_permission, parent, false);
            }

            PermissionItem item = (PermissionItem)m_items.get(position);
            if (item != null) {
                ImageView ivIcon = (ImageView)convertView.findViewById(R.id.iv_icon);
                TextView tvTitle = (TextView)convertView.findViewById(R.id.tv_title);
                TextView tvDetail = (TextView)convertView.findViewById(R.id.tv_detail);
                ivIcon.setImageResource(item.getIcon());
                tvTitle.setText(item.getTitle());
                tvDetail.setText(item.getDetail());
            }

            return convertView;
        }
    }
}
