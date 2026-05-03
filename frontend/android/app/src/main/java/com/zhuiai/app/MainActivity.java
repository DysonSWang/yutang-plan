package com.zhuiai.app;

import android.Manifest;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private ActivityResultLauncher<String[]> permissionLauncher;
    private static final String[] REQUIRED_PERMISSIONS = {
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 禁止截图，应用内截屏显示黑屏
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // 运行时权限请求：相机和麦克风
        permissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            results -> {
                boolean cameraGranted = Boolean.TRUE.equals(results.get(Manifest.permission.CAMERA));
                boolean micGranted = Boolean.TRUE.equals(results.get(Manifest.permission.RECORD_AUDIO));
                if (!cameraGranted || !micGranted) {
                    // 用户拒绝权限，可在设置中重新授权
                    android.util.Log.w("MainActivity", "Permissions denied: camera=" + cameraGranted + ", mic=" + micGranted);
                }
            }
        );
        permissionLauncher.launch(REQUIRED_PERMISSIONS);
    }
}
