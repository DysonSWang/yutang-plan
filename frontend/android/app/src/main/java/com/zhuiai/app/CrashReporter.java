package com.zhuiai.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 原生 crash 上报：捕获未处理异常，同步 POST 到后端，再交给系统默认 handler。
 * 网络失败时本地缓存，下次启动补发。
 */
public class CrashReporter {
    private static final String TAG = "CrashReporter";
    private static final String API_URL = "https://zhuiai.club/api/logs/native-crash";
    private static final String PREFS_NAME = "zhuiai_crash_reporter";
    private static final String KEY_LAST_REPORT_TIME = "last_report_time";
    private static final String CACHE_FILENAME = "native_crash_cache.json";
    private static final long RATE_LIMIT_MS = 60_000; // 1 分钟内最多报 1 次

    private static Context appContext;
    private static Thread.UncaughtExceptionHandler defaultHandler;

    public static void init(Context context) {
        appContext = context.getApplicationContext();
        defaultHandler = Thread.getDefaultUncaughtExceptionHandler();

        // 安装自定义 handler
        Thread.setDefaultUncaughtExceptionHandler(CrashReporter::handleUncaughtException);

        // 补发上次缓存的 crash 日志（异步，不阻塞启动）
        new Thread(CrashReporter::flushCachedCrashes).start();
    }

    private static void handleUncaughtException(Thread thread, Throwable throwable) {
        try {
            // 限流：1 分钟内只报 1 次，避免循环崩溃
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            long lastTime = prefs.getLong(KEY_LAST_REPORT_TIME, 0);
            long now = System.currentTimeMillis();
            if (now - lastTime < RATE_LIMIT_MS) {
                Log.w(TAG, "Rate limited, skipping crash report");
            } else {
                prefs.edit().putLong(KEY_LAST_REPORT_TIME, now).apply();

                String stackTrace = Log.getStackTraceString(throwable);
                String message = throwable.getMessage();
                String exceptionClass = throwable.getClass().getName();

                JSONObject payload = new JSONObject();
                payload.put("message", message != null ? message : "");
                payload.put("stack", stackTrace);
                payload.put("exceptionClass", exceptionClass);
                payload.put("thread", thread.getName());
                payload.put("type", "nativeCrash");
                payload.put("device", Build.MODEL);
                payload.put("manufacturer", Build.MANUFACTURER);
                payload.put("osVersion", Build.VERSION.RELEASE);
                payload.put("sdkVersion", Build.VERSION.SDK_INT);

                // 尝试读取 app version
                try {
                    var pInfo = appContext.getPackageManager().getPackageInfo(appContext.getPackageName(), 0);
                    payload.put("appVersion", pInfo.versionName);
                    payload.put("appVersionCode", pInfo.versionCode);
                } catch (Exception ignored) {}

                boolean sent = sendSync(payload);
                if (!sent) {
                    // 网络失败，缓存到本地
                    cacheCrash(payload);
                }

                Log.i(TAG, "Crash report " + (sent ? "sent" : "cached"));
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to report crash", e);
        }

        // 交给系统默认 handler（弹"应用已停止"对话框）
        if (defaultHandler != null) {
            defaultHandler.uncaughtException(thread, throwable);
        }
    }

    /**
     * 同步 POST crash 数据到后端。APP 即将死亡，必须同步。
     */
    private static boolean sendSync(JSONObject payload) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(API_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setDoOutput(true);

            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
            }

            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.w(TAG, "sendSync failed: " + e.getMessage());
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * 缓存 crash 日志到本地文件（JSON 数组格式）
     */
    private static void cacheCrash(JSONObject payload) {
        try {
            File cacheFile = new File(appContext.getFilesDir(), CACHE_FILENAME);
            JSONArray arr;

            if (cacheFile.exists()) {
                StringBuilder sb = new StringBuilder();
                try (BufferedReader br = new BufferedReader(new FileReader(cacheFile))) {
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                }
                arr = new JSONArray(sb.toString());
            } else {
                arr = new JSONArray();
            }

            arr.put(payload);

            // 最多保留 10 条
            while (arr.length() > 10) arr.remove(0);

            try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                fos.write(arr.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception e) {
            Log.w(TAG, "cacheCrash failed: " + e.getMessage());
        }
    }

    /**
     * 补发缓存的 crash 日志（启动时调用）
     */
    private static void flushCachedCrashes() {
        try {
            File cacheFile = new File(appContext.getFilesDir(), CACHE_FILENAME);
            if (!cacheFile.exists()) return;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new FileReader(cacheFile))) {
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
            }

            JSONArray arr = new JSONArray(sb.toString());
            if (arr.length() == 0) {
                cacheFile.delete();
                return;
            }

            // 逐条发送
            boolean allSent = true;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.getJSONObject(i);
                item.put("type", "nativeCrashCached"); // 标记为缓存补发
                if (!sendSync(item)) {
                    allSent = false;
                    break; // 网络不通，停止重试
                }
            }

            if (allSent) {
                cacheFile.delete();
                Log.i(TAG, "Flushed " + arr.length() + " cached crash reports");
            }
        } catch (Exception e) {
            Log.w(TAG, "flushCachedCrashes failed: " + e.getMessage());
        }
    }
}
