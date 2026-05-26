package expo.modules.intentlauncher

import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 안드로이드 intent:// URL을 OS 표준 방식(Intent.parseUri)으로 디스패치.
 *
 * NICEPay 공식 가이드(developers.nicepay.co.kr/manual-app.php)에 따른 권장 흐름:
 *   1. Intent.parseUri(URI_INTENT_SCHEME)
 *   2. resolveActivity → 있으면 startActivity
 *   3. 없으면 package 힌트로 Play Store
 *   4. 그래도 안 되면 S.browser_fallback_url 로 fallback
 */
class IntentLauncherModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IntentLauncher")

    AsyncFunction("dispatchAndroidIntent") { url: String, fallbackUrl: String? ->
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("handled" to false, "reason" to "no_resolver")
      val activity = appContext.currentActivity ?: context

      val intent: Intent = try {
        Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
      } catch (_: Exception) {
        return@AsyncFunction mapOf("handled" to false, "reason" to "parse_error")
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      // selector는 ACTION_VIEW로의 강제 분기를 일으킬 수 있어 제거.
      intent.selector = null

      val pm = context.packageManager
      val resolved = pm.resolveActivity(intent, 0)
      if (resolved != null) {
        return@AsyncFunction try {
          activity.startActivity(intent)
          mapOf("handled" to true, "reason" to "opened")
        } catch (_: Exception) {
          mapOf("handled" to false, "reason" to "start_failed")
        }
      }

      val intentFallback = intent.getStringExtra("browser_fallback_url")
      val effectiveFallback = intentFallback ?: fallbackUrl
      val pkg = intent.`package`

      if (!pkg.isNullOrEmpty()) {
        try {
          val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          activity.startActivity(market)
          return@AsyncFunction mapOf("handled" to true, "reason" to "store")
        } catch (_: Exception) {
          // Play Store도 없으면 fallback URL 로
        }
      }

      if (!effectiveFallback.isNullOrEmpty()) {
        try {
          val fb = Intent(Intent.ACTION_VIEW, Uri.parse(effectiveFallback))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          activity.startActivity(fb)
          return@AsyncFunction mapOf("handled" to true, "reason" to "fallback")
        } catch (_: Exception) {
          // 모두 실패
        }
      }

      mapOf("handled" to false, "reason" to "no_resolver")
    }
  }
}
