package com.smartbudget.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.EdgeToEdge;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.smartbudget.app.databinding.ActivityMainBinding;

/**
 * Главная Activity приложения SmartBudget.
 *
 * Отображает сайт https://firstvoid.github.io/SmartBudget/ внутри WebView.
 * Поддерживает:
 *   - Полноэкранный тёмный режим
 *   - Сохранение LocalStorage между сессиями
 *   - Pull-to-refresh для обновления страницы
 *   - Навигацию назад внутри WebView кнопкой "Back"
 *   - Открытие внешних ссылок в браузере
 *   - Перехват SMS через SmsReceiver с динамическим запросом runtime permissions
 */
public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "https://firstvoid.github.io/SmartBudget/";
    private static final int BACKGROUND_COLOR = 0xFF090D16;
    private static final int SMS_PERMISSION_REQUEST_CODE = 1001;

    private ActivityMainBinding binding;
    
    private final BroadcastReceiver smsBroadcastReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if ("com.smartbudget.app.SMS_RECEIVED".equals(intent.getAction())) {
                if (binding != null && binding.webView != null) {
                    binding.webView.post(() -> {
                        binding.webView.evaluateJavascript("if(window.checkPendingSms) { window.checkPendingSms(); }", null);
                    });
                }
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setupEdgeToEdge();

        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        applyWindowInsets();
        setupWebView();
        setupSwipeRefresh();

        if (savedInstanceState == null) {
            binding.webView.loadUrl(APP_URL);
        }

        requestSmsPermissionsIfNeeded();

        IntentFilter filter = new IntentFilter("com.smartbudget.app.SMS_RECEIVED");
        ContextCompat.registerReceiver(this, smsBroadcastReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void requestSmsPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            boolean hasReceiveSms = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
            boolean hasReadSms = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED;

            if (!hasReceiveSms || !hasReadSms) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS},
                    SMS_PERMISSION_REQUEST_CODE
                );
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == SMS_PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (binding != null && binding.webView != null) {
                    binding.webView.post(() -> {
                        binding.webView.evaluateJavascript("if(window.checkPendingSms) { window.checkPendingSms(); }", null);
                    });
                }
            }
        }
    }
    


    private void setupEdgeToEdge() {
        EdgeToEdge.enable(this);
        Window window = getWindow();
        window.setStatusBarColor(BACKGROUND_COLOR);
        window.setNavigationBarColor(BACKGROUND_COLOR);
        WindowCompat.getInsetsController(window, window.getDecorView())
                .setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(window, window.getDecorView())
                .setAppearanceLightNavigationBars(false);
    }

    private void applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            binding.webView.setPadding(0, 0, 0, systemBars.bottom);
            return insets;
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebView webView = binding.webView;
        webView.setBackgroundColor(BACKGROUND_COLOR);

        WebSettings settings = webView.getSettings();

        // JavaScript обязателен для работы приложения
        settings.setJavaScriptEnabled(true);

        // Разрешаем хранение данных (LocalStorage для профилей и операций)
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Масштабирование
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Кэширование для офлайн-работы
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Медиа
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Принудительный тёмный режим (API 29+)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false);
        }

        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidApp");

        webView.setWebViewClient(new SmartBudgetWebViewClient());
        webView.setWebChromeClient(new SmartBudgetWebChromeClient());
    }

    public static class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public String getPendingSms() {
            SharedPreferences prefs = mContext.getSharedPreferences("sms_queue", Context.MODE_PRIVATE);
            return prefs.getString("queue", "[]");
        }

        @JavascriptInterface
        public void clearPendingSms() {
            SharedPreferences prefs = mContext.getSharedPreferences("sms_queue", Context.MODE_PRIVATE);
            prefs.edit().putString("queue", "[]").apply();
        }
    }

    private void setupSwipeRefresh() {
        binding.swipeRefresh.setColorSchemeColors(0xFF6366F1, 0xFF8B5CF6, 0xFFD946EF);
        binding.swipeRefresh.setProgressBackgroundColorSchemeColor(0xFF0F172A);
        binding.swipeRefresh.setOnRefreshListener(() -> binding.webView.reload());
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && binding.webView.canGoBack()) {
            binding.webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        binding.webView.saveState(outState);
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        binding.webView.restoreState(savedInstanceState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        binding.webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        binding.webView.onResume();
    }

    @Override
    protected void onDestroy() {
        binding.webView.stopLoading();
        binding.webView.destroy();
        try {
            unregisterReceiver(smsBroadcastReceiver);
        } catch (Exception e) {
            e.printStackTrace();
        }
        super.onDestroy();
    }

    // -------------------------------------------------------------------------
    // WebViewClient: управление загрузкой страниц
    // -------------------------------------------------------------------------

    private class SmartBudgetWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();

            // Внутренние страницы сайта открываем в WebView
            if (url.startsWith("https://firstvoid.github.io/SmartBudget")) {
                return false;
            }

            // Внешние ссылки открываем в браузере
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            binding.swipeRefresh.setRefreshing(false);
            binding.progressBar.setVisibility(View.GONE);
            view.evaluateJavascript("if(window.checkPendingSms) { window.checkPendingSms(); }", null);
        }

        @Override
        public void onPageStarted(android.webkit.WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            binding.progressBar.setVisibility(View.VISIBLE);
        }
    }

    // -------------------------------------------------------------------------
    // WebChromeClient: прогресс загрузки
    // -------------------------------------------------------------------------

    private class SmartBudgetWebChromeClient extends WebChromeClient {

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            super.onProgressChanged(view, newProgress);
            binding.progressBar.setProgress(newProgress);
            if (newProgress == 100) {
                binding.progressBar.setVisibility(View.GONE);
            }
        }
    }
}
