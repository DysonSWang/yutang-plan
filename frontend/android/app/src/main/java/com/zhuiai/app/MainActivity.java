package com.zhuiai.app;

import android.Manifest;
import android.annotation.TargetApi;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String PREFS_NAME = "zhuiai_secure";
    private static final String KEY_SCREENSHOT_ENABLED = "screenshot_enabled";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 注册截屏切换插件
        registerPlugin(com.zhuiai.app.ScreenshotTogglePlugin.class);
        // 根据 SharedPreferences 决定是否启用截屏限制
        applyScreenshotProtection();

        // WebView 性能优化
        configWebView();

        // 处理 App Link（安装后打开）
        handleIntent(getIntent());
    }

    public void applyScreenshotProtection() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        boolean screenshotEnabled = prefs.getBoolean(KEY_SCREENSHOT_ENABLED, false);
        if (!screenshotEnabled) {
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // 从外部链接唤醒 App 时处理
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri data = intent.getData();
        if (Intent.ACTION_VIEW.equals(action) && data != null) {
            String url = data.toString();
            // 将 deep link URL 传给 WebView
            // Capacitor 会通过 App plugin 事件分发
            this.bridge.getWebView().loadUrl("javascript:window.__DEEP_LINK_URL__='" + url + "';window.dispatchEvent(new CustomEvent('deep-link', {detail: '" + url + "'}));");
        }
    }

    @TargetApi(21)
    private void configWebView() {
        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();

        // 启用硬件加速
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);

        // 允许访问本地文件（Capacitor 需要）
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // 启用 DOM 存储
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // 支持 viewport 和自适应
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        // 允许混合内容（HTTP 资源在 HTTPS 页面加载）
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // 提升渲染优先级
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH);

        // 字体相关性能优化
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
    }
}
