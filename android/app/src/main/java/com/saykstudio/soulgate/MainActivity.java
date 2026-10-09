/* ==========================================================================
 *  SOULGATE — Android kabuğu (MainActivity)
 *  Sorumluluk : Oyunu tam ekran bir WebView içinde, internetsiz çalıştırmak.
 *
 *  - Oyun dosyaları APK'nın içindedir (assets/www). WebView onları sahte ama
 *    güvenli bir https adresinden (appassets.androidplatform.net) ister; bu
 *    sınıf istekleri yakalayıp dosyaları doğrudan uygulamanın içinden verir.
 *    Böylece ES modülleri ve kayıtlar (localStorage) normal bir sitedeki gibi
 *    çalışır, adres hiç değişmediği için güncellemelerde kayıtlar korunur.
 *  - Geri tuşu oyunun kendi geri tuşu tuzağına (history) iletilir; ana
 *    menünün kökünde uygulamadan çıkılır.
 *  - Oyunun "ekran kararmasın" isteği (navigator.wakeLock) burada ekranı
 *    açık tutma bayrağına bağlanır.
 *  - Dış bağlantılar (varsa) telefonun tarayıcısında açılır.
 * ========================================================================== */
package com.saykstudio.soulgate;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {

    /** Oyunun "adresi". Değiştirilirse eski kayıtlar görünmez olur. */
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final String ASSET_ROOT = "www";

    /**
     * index.html'e en başta eklenir: ekranı açık tutma isteğini Android'e
     * bağlar ve uygulamada gereksiz olan service worker kaydını sessizce
     * atlar (dosyalar zaten telefonda).
     */
    private static final String BRIDGE_SCRIPT = "<script>(function(){"
            + "var b=window.SoulgateAndroid;if(!b)return;var held=null;"
            + "function S(){this.released=false;this.type='screen';this.l=[];}"
            + "S.prototype.addEventListener=function(t,f){if(t==='release')this.l.push(f);};"
            + "S.prototype.removeEventListener=function(t,f){this.l=this.l.filter(function(x){return x!==f;});};"
            + "S.prototype.release=function(){if(this.released)return Promise.resolve();this.released=true;"
            + "if(held===this){held=null;b.keepScreenOn(false);}"
            + "var l=this.l.slice();for(var i=0;i<l.length;i++){try{l[i]({type:'release'});}catch(e){}}"
            + "return Promise.resolve();};"
            + "var api={request:function(){if(held)held.release();var s=new S();held=s;b.keepScreenOn(true);return Promise.resolve(s);}};"
            + "try{Object.defineProperty(navigator,'wakeLock',{value:api,configurable:true});}catch(e){}"
            + "document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&held)held.release();});"
            + "try{if(navigator.serviceWorker)navigator.serviceWorker.register=function(){return Promise.resolve({});};}catch(e){}"
            + "})();</script>";

    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("ttf", "font/ttf");
        MIME.put("otf", "font/otf");
        MIME.put("txt", "text/plain");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("ogg", "audio/ogg");
        MIME.put("wav", "audio/wav");
    }

    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#050407"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100); // telefonun yazı büyütme ayarı oyunun düzenini bozmasın
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.addJavascriptInterface(new Bridge(), "SoulgateAndroid");
        web.setWebViewClient(new LocalClient());

        setContentView(web);
        hideSystemBars();
        web.loadUrl(START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onPause() {
        // sayfa "gizlendi" olayını alır: oyun duraklar ve kaydeder
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("SoulgateAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** Oyun geri tuşunu kendisi yönetir; yönetmiyorsa (ana menü kökü) çıkılır. */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /** Tam ekran: durum ve gezinme çubukları gizli, kaydırınca geçici görünür. */
    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** JavaScript'ten çağrılan küçük köprü (yalnızca bu uygulamanın sayfası yüklenir). */
    private class Bridge {
        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }

    /** Oyun adresine gelen istekleri uygulamanın içindeki dosyalardan karşılar. */
    private class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) return null;
            return serve(url.getPath());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (HOST.equals(url.getHost())) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ignored) {
                // bağlantıyı açacak uygulama yok: sessizce geç
            }
            return true;
        }
    }

    private WebResourceResponse serve(String path) {
        if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
        if (path.contains("..")) return notFound();
        String asset = ASSET_ROOT + path;
        String mime = mimeOf(path);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("Access-Control-Allow-Origin", "https://" + HOST);
        try {
            InputStream in = getAssets().open(asset);
            if (path.equals("/index.html")) in = withBridge(in);
            String encoding = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("xml") ? "utf-8" : null;
            return new WebResourceResponse(mime, encoding, 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeOf(String path) {
        int slash = path.lastIndexOf('/');
        String name = path.substring(slash + 1);
        int dot = name.lastIndexOf('.');
        if (dot < 0) return "text/plain"; // LICENSE gibi uzantısız metinler
        String type = MIME.get(name.substring(dot + 1).toLowerCase(Locale.ROOT));
        return type != null ? type : "application/octet-stream";
    }

    /**
     * Köprü betiğini index.html'e, karakter kümesi etiketinin hemen ardına
     * (yoksa <head>'in ardına) ekler; oyunun bütün betiklerinden önce çalışır.
     */
    private static InputStream withBridge(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        try {
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
        } finally {
            in.close();
        }
        String html = new String(out.toByteArray(), StandardCharsets.UTF_8);
        int at = -1;
        int meta = html.indexOf("<meta charset");
        if (meta >= 0) at = html.indexOf('>', meta) + 1;
        if (at <= 0) {
            int head = html.indexOf("<head>");
            if (head >= 0) at = head + "<head>".length();
        }
        html = at > 0 ? html.substring(0, at) + BRIDGE_SCRIPT + html.substring(at) : BRIDGE_SCRIPT + html;
        return new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
    }
}
