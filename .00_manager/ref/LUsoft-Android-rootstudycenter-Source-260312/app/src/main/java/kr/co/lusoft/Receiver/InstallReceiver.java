package kr.co.lusoft.Receiver;


import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import kr.co.lusoft.util.Util;


public class InstallReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle extras = intent.getExtras();
        String referrerString = extras.getString("referrer");
        Log.i("[InstallReceiver]", "Referrer is: " + referrerString);
        Util.toast("Referrer is: " + referrerString);

//        Activity m_activity = (MainActivity) SharedData.shared().getActivity();
//        Toast.makeText(m_activity, referrerString, Toast.LENGTH_LONG).show();
    }
}
