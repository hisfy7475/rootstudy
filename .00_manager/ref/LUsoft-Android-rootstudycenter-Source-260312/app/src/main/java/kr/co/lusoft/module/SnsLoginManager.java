package kr.co.lusoft.module;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.NonNull;
import androidx.credentials.CredentialManager;

import com.google.android.gms.auth.api.identity.GetSignInIntentRequest;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.tasks.OnCompleteListener;
import com.google.android.gms.tasks.Task;
import com.google.firebase.auth.FirebaseAuth;

import org.json.JSONException;
import org.json.JSONObject;

import kr.co.lusoft.R;
import kr.co.lusoft.core.Config;
import kr.co.lusoft.func.ReflectManager;
import kr.co.lusoft.ui.MainActivity;

public class SnsLoginManager {
    String TAG = "*[SnsLoginManager]";
    Context pContext = null;
    ReflectManager mReflect = null;
    JSONObject mLoginData = null;
    GoogleSignInClient mGoogleSignInClient;

    private FirebaseAuth mAuth;
    public YesNoCallback mLoginCallback;
    public interface YesNoCallback {
        void onSuccess(String methodName, JSONObject rJson);

        void onFailure(String methodName, int errNo, String message);
    }
    /*
    구글 로그인은 별도의 aar 파일을 사용하지 않고 직접 이용
    implementation 도 상시로 넣음
     */
    public SnsLoginManager(Context context){
        Log.d(TAG, "SnsLogin");
        pContext = context;
        mReflect = new ReflectManager();
        String className = "snsLogin";
        mReflect.getClass(className);

        String r = Config.shared(pContext).getReadConfigFile("config.json");
        try {
            JSONObject t = new JSONObject(r);
            if (t.has("snsLogin")) {
                mLoginData = t.getJSONObject("snsLogin");
                if (mLoginData.has("google") && mLoginData.getJSONObject("google").has("use") && mLoginData.getJSONObject("google").getBoolean("use")) {
                    initGoogle();
                }
                //네이버는 앱 명을 직접 넣어줘야 함
                if (mLoginData.has("naver") && mLoginData.getJSONObject("naver").has("use") && mLoginData.getJSONObject("naver").getBoolean("use")) {
                    mLoginData.getJSONObject("naver").put("name", pContext.getString(R.string.app_name));
                }
                mReflect.runMethod("init", pContext, mLoginData);
            }
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
    }
    public void login(String snsType, YesNoCallback callback) {
        login(snsType, callback, null);
    }
    public void login(String snsType, YesNoCallback callback, ActivityResultLauncher<Intent> googleCallback){
        Log.d(TAG, "login:"+snsType);
        mLoginCallback=callback;
        if (snsType.equals("google")) {
            try {
                Log.d(TAG, mLoginData.toString());
                if (mLoginData.has("google") && mLoginData.getJSONObject("google").has("use") && mLoginData.getJSONObject("google").getBoolean("use")) {
                    loginGoogle(googleCallback);
                }else{
                    callback.onFailure("login", 1001, "google login 사용안함(config.json)");
                }
            } catch (JSONException e) {
                callback.onFailure("login", 1001, e.getMessage());
            }
        }else{
            mReflect.runMethodCallback(new ReflectManager.YesNoCallback() {
                @Override
                public void onSuccess(String methodName, JSONObject rJson) {
                    Log.d(TAG, "success:"+methodName+"/"+rJson.toString());
                    callback.onSuccess(methodName, rJson);
                }

                @Override
                public void onFailure(String methodName, int errNo, String message) {
                    Log.d(TAG, "loginFailure:"+message);
                    callback.onFailure(methodName, errNo, message);
                }
            }, "kr.co.lusoft.snslogin.YesNoCallback","login", snsType);
        }
    }
    public void initGoogle(){
        Log.d(TAG, "initGoogle");


        /*
        BeginSignInRequest.builder()
                .setGoogleIdTokenRequestOptions(BeginSignInRequest.GoogleIdTokenRequestOptions.builder()
                        .setSupported(true)
                        // Your server's client ID, not your Android client ID.
                        .setServerClientId(((MainActivity) pContext).getString(R.string.default_web_client_id))
                        // Only show accounts previously used to sign in.
                        .setFilterByAuthorizedAccounts(true)
                        .build())
                .build();

         */
        try {

            int client_id = pContext.getResources().getIdentifier("default_web_client_id", "string", pContext.getPackageName());
            String default_web_client_id = ((MainActivity) pContext).getString(client_id);
            Log.d(TAG, "default_web_client_id:" + default_web_client_id);

            if (!default_web_client_id.isEmpty()) {

                GoogleSignInOptions googleSignInOptions = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                        .requestIdToken(default_web_client_id)
                        //.requestServerAuthCode(default_web_client_id)
                        //.requestScopes(new Scope(Scopes.OPEN_ID))
                        .requestEmail()
                        .requestId()
                        .requestProfile()
                        .build();
                mGoogleSignInClient = GoogleSignIn.getClient(pContext, googleSignInOptions);
                mAuth = FirebaseAuth.getInstance();
            }
        }catch(Exception e) {
            Log.d(TAG, "initGoogle Exception: "+e.getMessage());
        }


    }
    /**
     * 구글 로그인
     * @param callback
     */
    public void loginGoogle(ActivityResultLauncher<Intent> callback){
        Log.d(TAG, "loginGoogle");

        Intent signInIntent = mGoogleSignInClient.getSignInIntent();
        callback.launch(signInIntent);
    }

    public void logout(String snsType, YesNoCallback callback){
        if (snsType.equals("google")) {
            if (mGoogleSignInClient==null) initGoogle();
            mGoogleSignInClient.signOut()
                    .addOnCompleteListener(new OnCompleteListener<Void>() {
                        @Override
                        public void onComplete(@NonNull Task<Void> task) {
                            Log.d(TAG, "google logout");
                            callback.onSuccess("logout", new JSONObject());
                        }
                    });
        }else{
            mReflect.runMethod("logout", snsType);
            callback.onSuccess("logout", new JSONObject());
        }
    }
    public void signout(String snsType, YesNoCallback callback){
        if (snsType.equals("google")) {
            if (mGoogleSignInClient==null) initGoogle();
            mGoogleSignInClient.revokeAccess()
                    .addOnCompleteListener(new OnCompleteListener<Void>() {
                        @Override
                        public void onComplete(@NonNull Task<Void> task) {
                            Log.d(TAG, "google signout");
                            callback.onSuccess("signout", new JSONObject());
                        }
                    });

        }else{
            mReflect.runMethodCallback(new ReflectManager.YesNoCallback() {
                @Override
                public void onSuccess(String methodName, JSONObject rJson) {
                    Log.d(TAG, "success-123:"+methodName+"/"+rJson.toString());
                    callback.onSuccess(methodName, rJson);
                }

                @Override
                public void onFailure(String methodName, int errNo, String message) {
                    callback.onFailure(methodName, errNo, message);
                }
            }, "kr.co.lusoft.snslogin.YesNoCallback","signout", snsType);
        }
    }
}
