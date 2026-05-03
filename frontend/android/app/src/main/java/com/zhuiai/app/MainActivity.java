package com.zhuiai.app;

import android.Manifest;
import android.annotation.TargetApi;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 禁止截图，应用内截屏显示黑屏
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // WebView 性能优化
        configWebView();

        // 权限在用户首次使用时通过 JS 触发，不在启动时申请
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
