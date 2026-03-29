package kr.co.lusoft.util;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.Window;

public class StatusBarUtils {
    private static String TAG = "StatusBarUtils";
    public static void setStatusBarIconColor(Activity activity, int backgroundColor) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // 배경색의 밝기 계산
            double luminance = calculateLuminance(backgroundColor);

            Window window = activity.getWindow();
            View decorView = window.getDecorView();
            int flags = decorView.getSystemUiVisibility();
            Log.d(TAG, "luminance:"+luminance);

            if (luminance > 0.5) {
                // 밝은 배경일 경우 어두운 아이콘
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            } else {
                // 어두운 배경일 경우 밝은 아이콘
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            }

            decorView.setSystemUiVisibility(flags);
        }
    }

    // 색상의 밝기를 계산하는 메소드
    private static double calculateLuminance(int color) {
        double red = Color.red(color) / 255.0;
        double green = Color.green(color) / 255.0;
        double blue = Color.blue(color) / 255.0;

        red = (red < 0.03928) ? red / 12.92 : Math.pow((red + 0.055) / 1.055, 2.4);
        green = (green < 0.03928) ? green / 12.92 : Math.pow((green + 0.055) / 1.055, 2.4);
        blue = (blue < 0.03928) ? blue / 12.92 : Math.pow((blue + 0.055) / 1.055, 2.4);

        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }
}
