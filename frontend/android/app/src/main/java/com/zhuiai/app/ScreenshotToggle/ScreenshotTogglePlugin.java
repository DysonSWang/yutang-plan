package com.zhuiai.app.ScreenshotToggle;

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
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is null");
            return;
        }
        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
        boolean next = !prefs.getBoolean(KEY_SCREENSHOT_ENABLED, false);
        prefs.edit().putBoolean(KEY_SCREENSHOT_ENABLED, next).apply();

        // 直接调用 Activity 方法应用截屏保护
        if (activity instanceof com.zhuiai.app.MainActivity) {
            ((com.zhuiai.app.MainActivity) activity).applyScreenshotProtection();
        }

        call.resolve();
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(KEY_SCREENSHOT_ENABLED, false);
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }
}
