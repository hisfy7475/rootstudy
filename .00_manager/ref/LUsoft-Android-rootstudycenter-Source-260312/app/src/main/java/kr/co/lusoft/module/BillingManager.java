package kr.co.lusoft.module;

import android.app.Activity;
import android.util.Log;

import org.json.JSONObject;

import kr.co.lusoft.func.ReflectManager;

public class BillingManager {
    String TAG = "*[BillingManager]";
    Activity mActivity;
    protected YesNoCallback mListener;

    ReflectManager mReflect;

    public interface YesNoCallback {
        void onSuccess(JSONObject rJson);

        void onFailure( int errNo, String message);
    }

    public BillingManager (Activity _activity, String subs, YesNoCallback listener) {
        mActivity = _activity ;
        this.mListener = listener;
        init(subs);
    }
    private void init(String subs){
        mReflect = new ReflectManager();
        String className = "googleBilling";
        mReflect.getClass(className);
        mReflect.runMethodCallback(new ReflectManager.YesNoCallback() {
            @Override
            public void onSuccess(String methodName, JSONObject rJson) {
                Log.d(TAG, "success:"+methodName+"/"+rJson.toString());
                mListener.onSuccess( rJson);
            }

            @Override
            public void onFailure(String methodName, int errNo, String message) {
                mListener.onFailure( errNo, message);
            }
        }, "kr.co.lusoft.payment.googlebilling.YesNoCallback","init", mActivity, subs);
    }

    public void getSkuDetailList(String productID, String subs){
        Log.d(TAG, "productID:"+productID+"/subs:"+subs);
        mReflect.runMethod("getSkuDetailList", productID, subs);
    }
}