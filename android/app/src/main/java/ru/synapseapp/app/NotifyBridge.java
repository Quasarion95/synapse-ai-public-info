package ru.synapseapp.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Напоминания для страницы: она решает, о чём и когда, система — как показать.
 *
 * Своих правил здесь нет намеренно. Что напомнить о задаче со временем, что
 * собрать в утренний план, когда задача «требует внимания» — знает веб-версия,
 * у неё все записи. Дублировать эти правила на Java значило бы завести вторую
 * копию логики, которая разойдётся с первой в первый же вечер.
 *
 * Поэтому мост принимает готовый список: номер, время, заголовок, текст. Всё,
 * что он умеет сам, — снять прежние будильники и поставить новые.
 */
public class NotifyBridge {

    static final int ЗАПРОС_УВЕДОМЛЕНИЙ = 4712;
    /** Сколько номеров держим за собой: с запасом на задачи, цели и ежедневные. */
    private static final int ПРЕДЕЛ = 64;

    private final Activity activity;

    NotifyBridge(Activity activity) {
        this.activity = activity;
    }

    /** Разрешение выдано и уведомления не выключены в системе. */
    @JavascriptInterface
    public boolean permitted() {
        if (!NotificationManagerCompat.from(activity).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Спрашиваем разрешение в момент, когда человек включил напоминания.
     *
     * До Android 13 разрешения не существует, и просить нечего: там уведомления
     * разрешены по умолчанию, а выключаются в настройках системы.
     */
    @JavascriptInterface
    public boolean ask() {
        /* false — системного окна не будет, и ответа ждать бесполезно.

           Так бывает до Android 13 (разрешения нет, уведомления выключают в
           настройках системы) и когда разрешение выдано, но уведомления
           приложения всё равно отключены в настройках. Раньше в этих случаях
           нажатие на переключатель не делало ничего; теперь страница знает,
           что надо отправить человека в настройки. */
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false;
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return false;
        activity.runOnUiThread(() -> ActivityCompat.requestPermissions(activity,
                new String[]{Manifest.permission.POST_NOTIFICATIONS}, ЗАПРОС_УВЕДОМЛЕНИЙ));
        return true;
    }

    /**
     * Заменить весь набор напоминаний разом.
     *
     * Именно заменить, а не добавить: страница присылает полную картину после
     * каждой правки, и разбираться, что изменилось, проще всего не разбираясь —
     * снять всё и поставить заново. Задач в дне десятки, не тысячи.
     *
     * Ждём массив объектов: {"номер":1,"когда":1723800000000,
     * "заголовок":"…","текст":"…","ежедневно":false}.
     */
    @JavascriptInterface
    public void reschedule(String json) {
        if (!permitted()) json = null;
        поставитьВсе(activity, json);
    }

    /** Где лежит последний список: его заново ставит ПослеЗагрузки. */
    private static final String ХРАНИЛИЩЕ = "synapse.reminders";
    private static final String КЛЮЧ_СПИСОК = "список";

    /**
     * Снять прежние будильники и поставить список заново.
     *
     * Список заодно ложится в настройки приложения. После перезагрузки
     * система забывает все будильники, а страница переставит их только когда
     * человека откроет приложение — то есть утренний план после ночной
     * перезагрузки не пришёл бы вовсе. Сохранённый список ставит обратно
     * ПослеЗагрузки, без страницы.
     */
    static void поставитьВсе(Context context, String json) {
        AlarmManager будильник = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (будильник == null) return;

        for (int i = 0; i < ПРЕДЕЛ; i++) снять(context, будильник, i);

        context.getSharedPreferences(ХРАНИЛИЩЕ, Context.MODE_PRIVATE).edit()
                .putString(КЛЮЧ_СПИСОК, json == null ? "" : json).apply();

        if (json == null || json.isEmpty()) return;

        try {
            JSONArray список = new JSONArray(json);
            long сейчас = System.currentTimeMillis();
            for (int i = 0; i < список.length() && i < ПРЕДЕЛ; i++) {
                JSONObject о = список.getJSONObject(i);
                long когда = о.optLong("когда", 0);
                boolean ежедневно = о.optBoolean("ежедневно", false);
                String текст = о.optString("текст", "");
                String потом = о.optString("потом", текст);

                /* Прошедшее разовое не ставим: система выстрелила бы сразу, и
                   человек получил бы напоминание о вчерашнем при первом входе.
                   Прошедшее ежедневное — двигаем на ближайший такой же час, но
                   уже со словами без цифр: цифры считались в тот день. */
                if (когда <= сейчас) {
                    if (!ежедневно || когда <= 0) continue;
                    когда = ПоказатьНапоминание.следующийРаз(когда, сейчас);
                    текст = потом;
                }

                Intent намерение = new Intent(context, ПоказатьНапоминание.class);
                намерение.putExtra(ПоказатьНапоминание.КЛЮЧ_НОМЕР, i);
                намерение.putExtra(ПоказатьНапоминание.КЛЮЧ_ЗАГОЛОВОК, о.optString("заголовок", "Synapse"));
                намерение.putExtra(ПоказатьНапоминание.КЛЮЧ_ТЕКСТ, текст);
                намерение.putExtra(ПоказатьНапоминание.КЛЮЧ_ПОТОМ, потом);
                намерение.putExtra(ПоказатьНапоминание.КЛЮЧ_КОГДА, когда);
                намерение.putExtra(ПоказатьНапоминание.КЛЮЧ_ЕЖЕДНЕВНО, ежедневно);

                PendingIntent пи = PendingIntent.getBroadcast(context, i, намерение,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                ПоказатьНапоминание.поставить(будильник, когда, пи);
            }
        } catch (Exception e){
            // Битый список — не повод ронять приложение: останемся без
            // напоминаний до следующей перестановки.
        }
    }

    /** Последний список, который присылала страница; пустая строка, если не было. */
    static String сохранённый(Context context) {
        return context.getSharedPreferences(ХРАНИЛИЩЕ, Context.MODE_PRIVATE)
                .getString(КЛЮЧ_СПИСОК, "");
    }

    private static void снять(Context context, AlarmManager будильник, int номер) {
        Intent намерение = new Intent(context, ПоказатьНапоминание.class);
        PendingIntent пи = PendingIntent.getBroadcast(context, номер, намерение,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (пи != null){ будильник.cancel(пи); пи.cancel(); }
    }
}
