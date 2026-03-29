package kr.co.lusoft.ui

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.google.firebase.auth.AuthResult

class test {

    suspend fun requestGoogleLogin(
        activityContext : Context,
        failAction: (msg: String) -> Unit,
        successAction: (result: AuthResult) -> Unit
    ) {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId("INPUT_WEB_CLIENT_ID")
            .build()
        val credentialManager = CredentialManager.create(activityContext)
        val request: GetCredentialRequest = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        runCatching {
            credentialManager.getCredential(
                request = request,
                context = activityContext,
            )
        }.onSuccess {
            //성공시 액션
            val credential = it.credential
            when(credential) {
                is CustomCredential -> {
                    if (credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                        try {
                            // Use googleIdTokenCredential and extract id to validate and
                            // authenticate on your server.
                            val googleIdTokenCredential = GoogleIdTokenCredential
                                .createFrom(credential.data)
                            /*
                            registerToFirebase(
                                googleIdTokenCredential.idToken,
                                failAction,
                                successAction
                            )

                             */
                        } catch (e: GoogleIdTokenParsingException) {
                            Log.e("tttt", "Received an invalid google id token response", e)
                        }
                    }
                }
            }
        }.onFailure {
            //실패시 액션
            failAction(it.localizedMessage ?: "unknown error")
        }
}