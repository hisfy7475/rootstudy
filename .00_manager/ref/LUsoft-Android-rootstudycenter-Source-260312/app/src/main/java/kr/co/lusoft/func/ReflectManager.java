package kr.co.lusoft.func;

import android.util.Log;

import org.json.JSONObject;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

public class ReflectManager {
    private String TAG = "*[ReflectManager]";

    public boolean isClass = false;
    public Class mTargetClass = null;
    public Object mNewTargetClass = null;
    private YesNoCallback mCallback = null;

    public interface YesNoCallback {
        void onSuccess(String methodName, JSONObject rJson);

        void onFailure(String methodName, int errNo, String message);
    }
    private String getClassName(String className){
        if (countChar(className, '.')==0){
            if (className.toLowerCase(Locale.ROOT).equals("snslogin")) className = "kr.co.lusoft.snslogin.SnsLogin";
            if (className.toLowerCase(Locale.ROOT).equals("googlebilling")) className = "kr.co.lusoft.payment.googlebilling.GoogleBilling";
        }
        return className;
    }
    public boolean getClass(String className) {

        try {
            className = getClassName(className);
            Log.d(TAG,"className:"+className);
            mTargetClass = Class.forName(className);
            mNewTargetClass = mTargetClass.newInstance();
            isClass = true;
            return true;
        } catch (ClassNotFoundException e) {
            Log.d(TAG, "getClass-ClassNotFoundException:"+e.getMessage());
        } catch (IllegalAccessException e) {
            Log.d(TAG, "getClass-IllegalAccessException:"+e.getMessage());
        } catch (InstantiationException e) {
            Log.d(TAG, "getClass-InstantiationException:"+e.getMessage());
        }
        return false;
    }
    public Object runMethod(String methodName, Object... v) {
        try {
            if (mTargetClass!=null) {
                Method methods[] = mTargetClass.getDeclaredMethods();
                //getDeclaredMethods()를 통해 해당 클래스의 메소드들을 찾음
                for (int i = 0; i < methods.length; i++) {
                    //Log.d(TAG, "mname:" + methods[i].getName());
                    if (methods[i].getName().equals(methodName)) {
                        Log.d(TAG, "mname:" + methods[i].getName());
                        //secondMethod를 찾아서 실행
                        Object r = methods[i].invoke(mNewTargetClass, v);
                        return r;
                    }
                }
            }
        } catch (IllegalAccessException e) {
            Log.d(TAG, "IllegalAccessException:"+e.getMessage());
        } catch (InvocationTargetException e) {
            Log.d(TAG, "InvocationTargetException1:"+e.getMessage());
        }
        return null;
    }
    public Object runMethodCallback(YesNoCallback callback, String callbackName, String methodName, Object... v) {
        try {
            Log.d(TAG, "callbackName:"+callbackName+"/methodName:"+methodName);
            mCallback = callback;
            if (mTargetClass!=null) {
                Object cb = setCallback(callbackName);
                Method methods[] = mTargetClass.getDeclaredMethods();
                //getDeclaredMethods()를 통해 해당 클래스의 메소드들을 찾음
                for (int i = 0; i < methods.length; i++) {
                    //Log.d(TAG, "mname:" + methods[i].getName());
                    if (methods[i].getName().equals(methodName)) {
                        //secondMethod를 찾아서 실행
                        Object r = methods[i].invoke(mNewTargetClass, addCallback(v, cb));
                        return r;
                    }
                }
            }else{
                callback.onFailure(methodName, 1001, "mTargetClass null");
            }
        } catch (IllegalAccessException e) {
            Log.d(TAG, "IllegalAccessException:"+e.getMessage());
            callback.onFailure(methodName, 1002, "IllegalAccessException:"+e.getMessage());
        } catch (InvocationTargetException e) {
            Log.d(TAG, "InvocationTargetException2:"+e.getMessage());
            callback.onFailure(methodName, 1003, "InvocationTargetException:"+e.getMessage());
        }
        return null;
    }
    private Object[] addCallback(Object[] ori, Object ad) {
        // 순서 1. 배열을 List로 변환
        List<Object> newList = new ArrayList<>(Arrays.asList(ori));

        // 순서 2. List의 Add() 메서드를 호출하여 새로운 값을 할당
        newList.add(ad);

        // 순서 3. List를 배열을 변환 후 반환
        return newList.toArray(new Object[0]);
    }
    private Object setCallback(String callbackName){
        Object param = null;
        try {
            Class cl = Class.forName(callbackName);
            param = Proxy.newProxyInstance(
                    //kr.co.lusoft.snslogin.YesNoCallback.class.getClassLoader(),
                    cl.getClassLoader(),
                    new Class[]{ cl },
                    new java.lang.reflect.InvocationHandler() {
                        @Override
                        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                            if (method.getName().equals("onSuccess")) {
                                Log.d(TAG, "onSuccess--:"+args[0].toString()+":"+args[1].toString());
                                Log.d(TAG, "dd:"+(mCallback==null));
                                if (mCallback!=null) {
                                    mCallback.onSuccess((String) args[0], (JSONObject) args[1]);
                                }
                            }
                            if (method.getName().equals("onFailure")) {
                                Log.d(TAG, "onFailure-:"+args[0].toString()+":"+args[1].toString()+"=>"+args[2].toString());
                                mCallback.onFailure((String)args[0], (int)args[1], (String)args[2]);
                            }
                            return null;
                        }
                    } );
        } catch (ClassNotFoundException e) {
            //throw new RuntimeException(e);
            e.printStackTrace();
        }
        return param;
    }
    public static int countChar(String str, char ch) {
        return str.length() - str.replace(String.valueOf(ch), "").length();
    }

}
