package bricks.cap.plugins.download;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CapDownloader")
public class CapDownloaderPlugin extends Plugin {

    private final CapDownloader implementation = new CapDownloader();
    private BroadcastReceiver downloadReceiver;

    @PluginMethod
    public void download(PluginCall call) {
        final JSObject optionsJ = call.getData();
        final String title = optionsJ.getString("title");
        final String url = optionsJ.getString("url");
        final String filename = optionsJ.getString("filename");
        final String mimeType = optionsJ.getString("mimetype");

        final DownloadOptions options = new DownloadOptions(title, Uri.parse(url), filename, mimeType);

        try {
            JSObject ret = new JSObject();
            final long id = implementation.download(getContext(), options);
            ret.put("id", id);
            call.resolve(ret);
        } catch (NotImplementedError e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final JSObject optionsJ = call.getData();
        final String title = optionsJ.getString("title");
        final String url = optionsJ.getString("url");
        final String filename = optionsJ.getString("filename");
        final String mimeType = optionsJ.getString("mimetype");

        final DownloadOptions options = new DownloadOptions(title, Uri.parse(url), filename, mimeType);

        try {
            final long downloadId = implementation.download(getContext(), options);

            // Unregister previous receiver if any
            if (downloadReceiver != null) {
                try { getContext().unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
            }

            downloadReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id != downloadId) return;

                    // Unregister receiver
                    try { getContext().unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
                    downloadReceiver = null;

                    // Check download status
                    DownloadManager dm = context.getSystemService(DownloadManager.class);
                    DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                    Cursor cursor = dm.query(query);

                    if (cursor != null && cursor.moveToFirst()) {
                        int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                        int status = cursor.getInt(statusIdx);
                        cursor.close();

                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            // Use FileProvider for reliable content URI (dm.getUriForDownloadedFile fails on Huawei)
                            java.io.File apkFile = new java.io.File(
                                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                                filename);
                            Uri contentUri = FileProvider.getUriForFile(
                                context,
                                context.getPackageName() + ".fileprovider",
                                apkFile);

                            // Open APK for installation
                            Intent installIntent = new Intent(Intent.ACTION_VIEW);
                            installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
                            installIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                            try {
                                getContext().startActivity(installIntent);
                                JSObject ret = new JSObject();
                                ret.put("id", downloadId);
                                ret.put("status", "completed");
                                call.resolve(ret);
                            } catch (Exception e) {
                                call.reject("Failed to open APK: " + e.getMessage(), e);
                            }
                        } else {
                            call.reject("Download failed with status: " + status);
                        }
                    } else {
                        if (cursor != null) cursor.close();
                        call.reject("Download not found");
                    }
                }
            };

            // Register receiver
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(downloadReceiver,
                    new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(downloadReceiver,
                    new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            }

            // Don't resolve yet — will resolve in BroadcastReceiver
        } catch (NotImplementedError e) {
            call.reject(e.getMessage(), e);
        }
    }
}
