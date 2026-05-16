package com.zhuiai.app;

import android.app.Activity;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

@CapacitorPlugin(name = "ScreenshotToggle")
public class ScreenshotTogglePlugin extends Plugin {
    public static final String PREFS_NAME = "zhuiai_secure";
    public static final String KEY_SCREENSHOT_ENABLED = "screenshot_enabled";

    @PluginMethod
    public void toggle(PluginCall call) {
        try {
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("Activity is null");
                return;
            }
            SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
            boolean next = !prefs.getBoolean(KEY_SCREENSHOT_ENABLED, false);
            // 用 commit() 同步写入，确保立即可读
            prefs.edit().putBoolean(KEY_SCREENSHOT_ENABLED, next).commit();

            if (activity instanceof com.zhuiai.app.MainActivity) {
                ((com.zhuiai.app.MainActivity) activity).applyScreenshotProtection();
            }

            call.resolve();
        } catch (Exception e) {
            call.reject("Toggle failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        try {
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("Activity is null");
                return;
            }
            SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
            boolean enabled = prefs.getBoolean(KEY_SCREENSHOT_ENABLED, false);
            JSObject result = new JSObject();
            result.put("enabled", enabled);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("isEnabled failed: " + e.getMessage(), e);
        }
    }
}
