package kr.co.lusoft.ui;


import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.widget.ImageView;

import com.airbnb.lottie.LottieAnimationView;

import kr.co.lusoft.BuildConfig;
import kr.co.lusoft.core.Config;
import kr.co.lusoft.core.Constants;
import kr.co.lusoft.R;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.StatusBarUtils;


public class IntroActivity extends AppCompatActivity {
    private String TAG = "*[IntroActivity]";
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_intro);
        // 배경색을 기준으로 상태바 아이콘 색상 설정
        int backgroundColor = ContextCompat.getColor(this, R.color.colorStatusBar);
        StatusBarUtils.setStatusBarIconColor(this, backgroundColor);

        Log.d(TAG, "oncreate");
        int splash = Config.shared(this).getConfigInt("splash");
        ImageView v_img = findViewById(R.id.iv_intro);
        if (splash == 1) {
            LottieAnimationView v_ani = findViewById(R.id.animationView);
            @SuppressLint("DiscouragedApi") int resID = getResources().getIdentifier("animation", "raw", getPackageName());
            if (resID>0) {
                v_img.setVisibility(View.GONE);
                v_ani.setVisibility(View.VISIBLE);
                v_ani.setAnimation(resID);
            }
        }
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                finish();
            }
        }, 3000);
    }

}
