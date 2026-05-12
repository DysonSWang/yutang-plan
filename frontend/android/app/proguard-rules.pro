# 追AI ProGuard 规则
# 保留类名和行号便于调试，混淆后通过 retrace 反解

# ========== React / Vite ==========
-keep class react.** { *; }
-keep class vite.** { *; }

# ========== Chakra UI ==========
-keep class chakra-ui.** { *; }
-dontwarn chakra-ui.**

# ========== Framer Motion ==========
-keep class framer.** { *; }
-dontwarn framer.**

# ========== Socket.IO ==========
-keep class io.socket.** { *; }
-dontwarn io.socket.**
-keep class org.socketio.** { *; }

# ========== Capacitor ==========
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# ========== LocalBroadcastManager ==========
-keep class androidx.localbroadcastmanager.** { *; }
-dontwarn androidx.localbroadcastmanager.**

# ========== FullCalendar ==========
-keep class fullcalendar.** { *; }
-dontwarn fullcalendar.**

# ========== Socket.IO Client ==========
-keep class io.socket.client.** { *; }
-keep class io.socket.engineio.** { *; }

# ========== React Router ==========
-keep class reactrouter.** { *; }
-dontwarn reactrouter.**

# ========== 其他库 ==========
-keep class com.emotion.** { *; }
-keep class org.fullcalendar.** { *; }
-keep class com.tanstack.** { *; }
-dontwarn com.tanstack.**

# ========== 通用保留项 ==========
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# 避免移除 native 方法
-keepclasseswithmembernames class * {
    native <methods>;
}

# 避免移除 view 构造函数
-keepclasseswithmembers class * {
    public <init>(android.content.Context, android.util.AttributeSet);
}
-keepclasseswithmembers class * {
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

# 枚举保留
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Parcelable
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}