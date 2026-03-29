package kr.co.lusoft.util;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import java.util.Stack;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

import kr.co.lusoft.ui.MainActivity;

/**
 * Activity와 WebView 스택을 관리하는 매니저
 * - Activity 스택: Stack<Activity> - 현재 활성화된 Activity는 스택 최상단
 * - WebView 스택: Map<Activity, Stack<WebView>> - 각 Activity의 WebView 스택, 현재 활성화된 WebView는 스택 최상단
 */
public class StackManager {
    private static final String TAG = "*[StackManager]";
    
    // Activity 스택 (최상단이 현재 활성화된 Activity)
    private static final Stack<Activity> s_activityStack = new Stack<>();
    
    // Activity별 WebView 스택 (각 Activity의 WebView 스택, 최상단이 현재 활성화된 WebView)
    private static final Map<Activity, Stack<WebView>> s_webViewStackMap = new ConcurrentHashMap<>();
    
    /**
     * Activity 등록 및 스택 최상단으로 이동
     * Activity가 생성될 때 또는 재개될 때 호출
     * 
     * @param activity 등록할 Activity
     */
    public static void addActivity(Activity activity) {
        if (activity == null) {
            Log.w(TAG, "Activity 또는 WebView가 null입니다");
            return;
        }
        if (currentActivity() != activity) {
            // Activity를 스택 최상단으로 이동
            while (s_activityStack.contains(activity)) {
                s_activityStack.remove(activity);
            }
        }
        s_activityStack.push(activity);
    }
    
    /**
     * Activity 해제 및 스택에서 제거
     * Activity가 종료될 때 호출
     */
    public static void removeActivity(Activity activity) {
        if (activity == null) {
            return;
        }
        
        // Activity 스택에서 제거
        s_activityStack.remove(activity);
        
        // WebView 스택 제거
        Stack<WebView> webViewStack = s_webViewStackMap.remove(activity);
        if (webViewStack != null) {
            webViewStack.clear();
        }
        
        Log.d(TAG, "Activity 해제: " + activity.getClass().getSimpleName() + 
            " (남은 Activity: " + s_activityStack.size() + "개)");
    }
    
    /**
     * 현재 활성화된 Activity 가져오기 (스택 최상단)
     */
    public static Activity currentActivity() {
        // 유효하지 않은 Activity 정리
        // 스택을 아래에서부터 확인하며 유효하지 않은 Activity만 제거
        for (int i = s_activityStack.size() - 1; i >= 0; i--) {
            Activity activity = s_activityStack.get(i);
            if (activity == null || activity.isFinishing() || !s_webViewStackMap.containsKey(activity)) {
                s_activityStack.remove(i);
            }
        }
        
        // 스택 최상단 반환
        if (!s_activityStack.isEmpty()) {
            return s_activityStack.peek();
        }
        return null;
    }
    /**
     * Activity 스택에서 맨 처음 등록한 Activity 가져오기 (스택 최하단)
     */
    public static Activity rootActivity() {
        if (s_activityStack.isEmpty()) {
            return null;
        }
        // 스택 최하단 (인덱스 0)이 맨 처음 등록한 Activity
        return s_activityStack.get(0);
    }
    public static MainActivity mainActivity() {
        if (s_activityStack.isEmpty()) {
            return null;
        }
        // 스택 최하단 (인덱스 0)이 맨 처음 등록한 Activity
        return (MainActivity)s_activityStack.get(0);
    }
    
    /**
     * 팝업 WebView 등록 및 스택에 추가
     * 팝업이 열릴 때 호출
     */
    public static void addWebView(Activity activity, WebView webView) {
        if (activity == null || webView == null) {
            Log.w(TAG, "Activity 또는 팝업 WebView가 null입니다");
            return;
        }

        Stack<WebView> webViewStack = s_webViewStackMap.get(activity);
        if (webViewStack != null) {
            webViewStack.push(webView);
            addActivity(activity);
            Log.d(TAG, "팝업 WebView 추가: " + activity.getClass().getSimpleName() + " (WebView 스택: " + webViewStack.size() + "개)");
        } else {
            addActivity(activity);
            webViewStack = new Stack<>();
            webViewStack.push(webView);
            s_webViewStackMap.put(activity, webViewStack);
        }
    }
    
    /**
     * 팝업 WebView 해제 및 스택에서 제거
     * 팝업이 닫힐 때 호출
     */
    public static void removeWebView(Activity activity, WebView webView) {
        if (activity == null || webView == null) {
            return;
        }
        
        Stack<WebView> webViewStack = s_webViewStackMap.get(activity);
        if (webViewStack != null) {
            webViewStack.remove(webView);
            Log.d(TAG, "팝업 WebView 제거: " + activity.getClass().getSimpleName() +
                " (남은 WebView: " + webViewStack.size() + "개)");
        }
    }

    
    /**
     * 현재 활성화된 WebView 가져오기
     * Activity 스택 최상단 Activity의 WebView 스택 최상단
     */
    public static WebView currentWebView() {
        // Activity 스택 최상단 (가장 최근에 활성화된 Activity)
        if (s_activityStack.isEmpty()) {
            return null;
        }
        
        Activity lastActivity = s_activityStack.peek();
        if (lastActivity == null || lastActivity.isFinishing()) {
            return null;
        }
        
        // 그 Activity의 WebView 스택 최상단 (마지막 WebView)
        Stack<WebView> webViewStack = s_webViewStackMap.get(lastActivity);
        if (webViewStack == null || webViewStack.isEmpty()) {
            return null;
        }
        WebView webView = webViewStack.peek();
        return webView;
    }
    public static WebView rootWebview() {
        Activity activity = rootActivity();
        Stack<WebView> webViewStack = s_webViewStackMap.get(activity);
        if (webViewStack == null || webViewStack.isEmpty()) {
            return null;
        }
        WebView webView = webViewStack.get(0);
        return webView;
    }
}
