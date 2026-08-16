package ru.synapseapp.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
    private VoiceBridge голос;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        /* Контент не заезжает под системные полосы.

           Первая попытка была нарисовать во весь экран и отбиться через
           env(safe-area-inset-*), как на айфоне. В WebView на андроиде эти
           значения приходят нулями, и шапка с логотипом легла прямо на часы.
           Вторая попытка — спросить отступы у системы и поставить их полем
           вьюхе — не сработала тоже: WebView отступ проигнорировал.

           Третья короче обеих: не залезать под полосы вовсе. Система сама
           уложит контент между ними, а полосы получат фон окна — который мы
           красим под выбранную тему. */
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        /* Обработчик подключён к корню, и это не небрежность.

           AssetsPathHandler отрезает префикс, под которым подключён, а остаток
           ищет от корня assets. Подключи мы его к «/app/», запрос
           /app/index.html превратился бы в assets/index.html — а файл лежит в
           assets/app/index.html, и WebView показывал бы ERR_INVALID_RESPONSE на
           пустом экране. Ровно это и случилось при первом запуске.

           От корня остаток совпадает с раскладкой один в один: /app/… идёт в
           assets/app/…, /fonts/… — в assets/fonts/…. Заодно одним обработчиком
           закрыты обе папки: шрифты лежат рядом с приложением, а не внутри, и
           иначе за ними пришлось бы ходить в настоящую сеть.

           Чужие адреса этого не касаются: api.synapseapp.ru — другой хост,
           loader его не трогает, а страницы сайта вроде /privacy/ перехватывает
           shouldOverrideUrlLoading и отдаёт браузеру. */
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        /* Отладка страницы — только в отладочной сборке.

           Без неё проверять приложение можно лишь тыкая в экран вслепую по
           координатам, и первая же такая проверка увела меня не туда. С ней
           страница видна с компьютера как обычная вкладка. В релиз это не
           попадает: включённая отладка в магазинном приложении — открытая
           дверь к чужим данным на устройстве. */
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

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
        /* Своего кэша WebView здесь не нужно.

           Файлы лежат внутри приложения — кэшировать локальное значит только
           хранить его дважды. Зато вред настоящий: кэш живёт в данных
           приложения и переживает переустановку, и после обновления WebView
           продолжал отдавать прежний app.js. Я на это уже попался, проверяя
           микрофон: код в apk новый, а страница показывала старый. */
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri адрес = request.getUrl();

                /* Чего нет внутри — того нет вовсе, в сеть за ним не ходим.

                   AssetsPathHandler на отсутствующий файл отвечает «не мой
                   запрос», и WebView идёт за ним в настоящую сеть. На sw.js это
                   выстрелило: файл из сборки исключён, и приложение притащило
                   service worker с живого сайта, а с ним кэш веб-версии поверх
                   собственных файлов.

                   Своё — только /app/ и /fonts/. Всё остальное на этом домене
                   (страницы сайта, оплата) уходит в браузер целой страницей,
                   а не подгружается кусками внутрь. */
                if (APP_HOST.equals(адрес.getHost())) {
                    WebResourceResponse ответ = loader.shouldInterceptRequest(адрес);
                    if (ответ != null) return ответ;
                    return new WebResourceResponse("text/plain", "utf-8", 404,
                            "Not Found", new java.util.HashMap<String, String>(),
                            new java.io.ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            /* Полоса статуса под цвет выбранной темы.

               Тем десять, у каждой светлый и тёмный вариант, и выбирает их
               человек внутри приложения — снаружи мы этого знать не можем.
               Поэтому после загрузки спрашиваем у самой страницы её цвет фона
               и красим окно им же. Иначе при тёмной теме сверху оставалась бы
               светлая полоса — мелочь, по которой сразу видно, что приложение
               собрано наспех. */
            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(
                        "getComputedStyle(document.body).backgroundColor", value -> {
                            Integer цвет = разобратьЦвет(value);
                            if (цвет == null) return;
                            getWindow().setBackgroundDrawable(new ColorDrawable(цвет));
                            /* Тем же цветом красим и саму вьюху.

                               У WebView свой фон, и он белый. Виден он в те
                               мгновения, когда страница не закрывает всю
                               площадь: при выезде клавиатуры высота меняется
                               раньше, чем перерисовывается вёрстка, и снизу
                               мелькает белая полоса. На светлой теме это
                               незаметно, на любой другой — белый прямоугольник
                               посреди окна, о котором и сказал тестировщик. */
                            view.setBackgroundColor(цвет);
                            new WindowInsetsControllerCompat(getWindow(), view)
                                    .setAppearanceLightStatusBars(светлыйЛи(цвет));
                        });
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

        /* Мост к системному распознаванию речи.

           Веб-версия зовёт браузерный SpeechRecognition, которого в WebView
           нет: объект объявлен, но отвечает «not-allowed» при любых
           разрешениях. Страница проверяет наличие AndroidVoice и, если он
           есть, слушает через систему. */
        голос = new VoiceBridge(this, web);
        web.addJavascriptInterface(голос, "AndroidVoice");

        setContentView(web);

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

    /** Из «"rgb(245, 241, 232)"» — в цвет. null, если строка не та. */
    private static Integer разобратьЦвет(String value) {
        if (value == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(\\d+)\\D+(\\d+)\\D+(\\d+)").matcher(value);
        if (!m.find()) return null;
        try {
            return Color.rgb(Integer.parseInt(m.group(1)),
                    Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Тёмные значки часов и батареи нужны на светлом фоне, и наоборот. */
    private static boolean светлыйЛи(int цвет) {
        return (0.299 * Color.red(цвет) + 0.587 * Color.green(цвет) + 0.114 * Color.blue(цвет)) > 150;
    }

    /* Разрешение спрашиваем по нажатию микрофона, а не на запуске.

       Человек, которого на первом же экране спрашивают про микрофон, обычно
       отказывает — непонятно зачем. Нажавший микрофон понимает, о чём его
       спрашивают, и после согласия слушание начинается сразу, без второго
       нажатия. */
    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != VoiceBridge.ЗАПРОС_МИКРОФОНА) return;
        boolean дали = results.length > 0
                && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
        if (дали && голос != null) голос.start();
    }

    @Override
    protected void onDestroy() {
        if (голос != null) голос.освободить();
        super.onDestroy();
    }

    /* Сворачивание — повод дописать записи на диск.

       WebView держит localStorage в своей базе и сбрасывает её на диск когда
       сочтёт нужным. Проверено на эмуляторе: свернул и убил процесс — записи
       целы, убил сразу без сворачивания — последняя пропала. Система почти
       всегда даёт паузу перед тем как убить приложение, но «почти» здесь
       лишнее: onPause у самой вьюхи как раз и говорит ей дописать. */
    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    /** Поворот экрана не должен начинать всё заново. */
    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}
