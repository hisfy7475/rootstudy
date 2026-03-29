package kr.co.lusoft.ui;

import android.widget.Toast;

import kr.co.lusoft.util.SharedData;

public class Sample {
    public static void toast(String str)
    {
        Toast.makeText(
                SharedData.shared().getApplicationContext(),
                str,
                Toast.LENGTH_LONG
        ).show();
    }
}
