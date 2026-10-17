package ru.synapseapp.app;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import ru.rustore.sdk.appupdate.listener.InstallStateUpdateListener;
import ru.rustore.sdk.appupdate.manager.RuStoreAppUpdateManager;
import ru.rustore.sdk.appupdate.manager.factory.RuStoreAppUpdateManagerFactory;
import ru.rustore.sdk.appupdate.model.AppUpdateInfo;
import ru.rustore.sdk.appupdate.model.AppUpdateOptions;
import ru.rustore.sdk.appupdate.model.AppUpdateType;
import ru.rustore.sdk.appupdate.model.InstallStatus;
import ru.rustore.sdk.appupdate.model.UpdateAvailability;
import ru.rustore.sdk.review.RuStoreReviewManager;
import ru.rustore.sdk.review.RuStoreReviewManagerFactory;

/**
 * Оценка и обновление через RuStore.
 *
 * Оценка: страница сама решает, когда момент удачный (закрыл пятую задачу,
 * приложением пользуются не первый день), и зовёт review(). Окно оценки
 * показывает RuStore поверх приложения — звёзды ставятся в один тап, без
 * перехода в магазин. Как часто можно показывать, решает и сам RuStore: не
 * чаще раза в сутки, а уже оценившим — никогда. Отказ ничем не грозит.
 *
 * Обновление: при запуске спрашиваем RuStore, нет ли новой версии. Если есть,
 * страница показывает плашку «Обновить»; загрузка идёт в фоне, а когда файл
 * скачан — «Перезапустить» ставит его. Без RuStore на телефоне (поставили
 * apk вручную) обе части молча ничего не делают.
 */
public class StoreBridge {

    private final Activity activity;
    private final WebView web;
    private RuStoreReviewManager отзывы;
    private RuStoreAppUpdateManager обновления;
    private AppUpdateInfo свежая;
    private InstallStateUpdateListener слушатель;

    StoreBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    /** Попросить оценку. Результат странице не важен — она лишь запоминает, что спрашивала. */
    @JavascriptInterface
    public void review() {
        activity.runOnUiThread(() -> {
            try {
                if (отзывы == null) отзывы = RuStoreReviewManagerFactory.INSTANCE.create(activity);
                отзывы.requestReviewFlow()
                        .addOnSuccessListener(info -> отзывы.launchReviewFlow(info)
                                .addOnSuccessListener(u -> событие("store-review", "shown"))
                                .addOnFailureListener(e -> событие("store-review", "closed")))
                        .addOnFailureListener(e -> событие("store-review", "skip"));
            } catch (Throwable e) {
                событие("store-review", "skip");
            }
        });
    }

    /** Проверить, нет ли новой версии. Зовётся при запуске. */
    void проверить() {
        activity.runOnUiThread(() -> {
            try {
                if (обновления == null) обновления = RuStoreAppUpdateManagerFactory.INSTANCE.create(activity);
                обновления.getAppUpdateInfo()
                        .addOnSuccessListener(info -> {
                            if (info.getUpdateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
                                свежая = info;
                                событие("store-update", info.getAvailableVersionName());
                            } else if (info.getInstallStatus() == InstallStatus.DOWNLOADED) {
                                событие("store-update-ready", info.getAvailableVersionName());
                            }
                        })
                        .addOnFailureListener(e -> { });
            } catch (Throwable ignored) { }
        });
    }

    /** Человек нажал «Обновить»: качаем в фоне. */
    @JavascriptInterface
    public void update() {
        activity.runOnUiThread(() -> {
            if (обновления == null || свежая == null) return;
            if (слушатель == null) {
                слушатель = state -> {
                    int s = state.getInstallStatus();
                    if (s == InstallStatus.DOWNLOADED) событие("store-update-ready", "");
                    else if (s == InstallStatus.FAILED) событие("store-update-failed", "");
                    else if (s == InstallStatus.DOWNLOADING && state.getTotalBytesToDownload() > 0) {
                        long p = state.getBytesDownloaded() * 100 / state.getTotalBytesToDownload();
                        событие("store-update-progress", String.valueOf(p));
                    }
                };
                обновления.registerListener(слушатель);
            }
            AppUpdateInfo info = свежая;
            свежая = null;   // объект одноразовый: повторный запуск — через новую проверку
            try {
                обновления.startUpdateFlow(info, new AppUpdateOptions.Builder()
                                .appUpdateType(AppUpdateType.FLEXIBLE).build())
                        .addOnSuccessListener(code -> {
                            if (code == Activity.RESULT_CANCELED) событие("store-update-cancel", "");
                        })
                        .addOnFailureListener(e -> событие("store-update-failed", ""));
            } catch (Throwable e) {
                событие("store-update-failed", "");
            }
        });
    }

    /** Скачано — ставим. Приложение перезапустится само. */
    @JavascriptInterface
    public void install() {
        activity.runOnUiThread(() -> {
            if (обновления == null) return;
            try {
                обновления.completeUpdate(new AppUpdateOptions.Builder()
                        .appUpdateType(AppUpdateType.FLEXIBLE).build())
                        .addOnFailureListener(e -> событие("store-update-failed", ""));
            } catch (Throwable e) {
                событие("store-update-failed", "");
            }
        });
    }

    void освободить() {
        if (обновления != null && слушатель != null) {
            try { обновления.unregisterListener(слушатель); } catch (Throwable ignored) { }
        }
    }

    private void событие(String вид, String значение) {
        String js = "window.dispatchEvent(new CustomEvent(" + org.json.JSONObject.quote(вид)
                + ",{detail:" + org.json.JSONObject.quote(значение == null ? "" : значение) + "}))";
        activity.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }
}
