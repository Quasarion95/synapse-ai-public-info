package ru.synapseapp.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * Приложение — это веб-версия Synapse, лежащая внутри apk.
 *
 * Не окно браузера, открывающее synapseapp.ru: такое приложение и работать без
 * сети не будет, и на модерации RuStore считается «калькой с сайта». Здесь все
 * файлы лежат в assets, приложение открывается офлайн и ведёт себя как
 * самостоятельный продукт, которым веб-версия и является.
 */
public class MainActivity extends AppCompatActivity {

    /**
     * Под каким именем WebView отдаёт локальные файлы.
     *
     * Это не обман и не запрос в сеть: WebViewAssetLoader обслуживает адрес сам,
     * наружу ничего не уходит. Но домен здесь выбран не произвольно, и вот
     * почему.
     *
     * Во-первых, сессию ассистента бэкенд выдаёт только источнику
     * https://synapseapp.ru, всё остальное получает 403. Отдавай мы файлы как
     * file:// или с localhost — Syn молча перестал бы отвечать, и искали бы мы
     * это долго.
     *
     * Во-вторых, https-источник — защищённый контекст. От него зависят
     * service worker, crypto и часть хранилищ; на file:// половина браузерных
     * возможностей просто выключена.
     */
    private static final String APP_HOST = "synapseapp.ru";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Рисуем под системными панелями: веб-версия сама разбирается с
        // безопасными отступами через env(safe-area-inset-*).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        /* Обслуживаем и /app/, и /fonts/.

           Приложение просит шрифты как ../fonts/fonts.css — это соседняя папка,
           а не подпапка /app/. Обслуживай мы только /app/, запрос ушёл бы в
           настоящую сеть: офлайн начертания «Rounded» и «Clean» отвалились бы
           обратно в системный шрифт, а онлайн приложение молча ходило бы наружу
           за файлами, которые лежат у него внутри. */
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/app/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/fonts/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        // Записи лежат в localStorage — без этого приложение теряло бы всё при
        // закрытии, а это единственное хранилище задач у пользователя.
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // Размер шрифта человек выбирает внутри приложения; системный масштаб
        // поверх нашего давал бы двойное увеличение.
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            /**
             * Внутри приложения остаётся только само приложение.
             *
             * Оплата, поддержка и Telegram — это чужие страницы: показывать их в
             * том же окне без адресной строки и кнопки «назад» значит запирать
             * человека там, откуда он не выйдет. Отдаём системе, она откроет
             * браузер или нужное приложение.
             */
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                boolean наше = APP_HOST.equals(url.getHost())
                        && url.getPath() != null && url.getPath().startsWith("/app/");
                if (наше) return false;

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) {
                    // Открыть нечем — молча остаёмся на месте. Падать из-за
                    // ссылки на приложение, которого нет на телефоне, нельзя.
                }
                return true;
            }
        });

        setContentView(web);
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> insets);

        /* Кнопка «назад» ходит по разделам, а не закрывает приложение.

           Веб-версия переключает экраны через историю браузера, поэтому системная
           кнопка обязана вести себя как в любом приложении: назад по шагам, и
           только с первого экрана — выход. Иначе первое же нажатие выбрасывает
           человека из приложения посреди работы. */
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl("https://" + APP_HOST + "/app/index.html");
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    /** Поворот экрана не должен начинать всё заново. */
    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}
