# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /Users/yeongseongseo/Library/Android/sdk/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}
#카카오
-keep class com.kakao.sdk.**.model.* { <fields>; }
-keep class * extends com.google.gson.TypeAdapter

# https://github.com/square/okhttp/pull/6792
-dontwarn org.bouncycastle.jsse.**
-dontwarn org.conscrypt.*
-dontwarn org.openjsse.**

# GoogleBilling AAR 내부의 클래스들을 삭제하거나 난독화하지 않도록 유지
-keep class kr.co.lusoft.payment.googlebilling.** { *; }

# 추가로 SNS 로그인이나 AdMob 모듈도 리플렉션을 사용한다면 함께 추가해주세요
-keep class kr.co.lusoft.snslogin.** { *; }
-keep class kr.co.lusoft.admob.** { *; }
-dontwarn kr.co.lusoft.snslogin.**
