package ru.synapseapp.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Показывает напоминание в назначенное время.
 *
 * Приёмник, а не работа внутри приложения: напоминание должно приходить, когда
 * приложение закрыто, — иначе оно не напоминание, а надпись на экране, который
 * и так открыт. Систему будит AlarmManager, сюда приходит только момент показа.
 */
public class ПоказатьНапоминание extends BroadcastReceiver {

    static final String КАНАЛ = "synapse.reminders";
    static final String КЛЮЧ_ЗАГОЛОВОК = "заголовок";
    static final String КЛЮЧ_ТЕКСТ = "текст";
    static final String КЛЮЧ_НОМЕР = "номер";
    /** Ежедневные — брифинг и отчёт: сами переставляют себя на завтра. */
    static final String КЛЮЧ_ЕЖЕДНЕВНО = "ежедневно";

    @Override
    public void onReceive(Context context, Intent intent) {
        String заголовок = intent.getStringExtra(КЛЮЧ_ЗАГОЛОВОК);
        String текст = intent.getStringExtra(КЛЮЧ_ТЕКСТ);
        int номер = intent.getIntExtra(КЛЮЧ_НОМЕР, 1);
        boolean ежедневно = intent.getBooleanExtra(КЛЮЧ_ЕЖЕДНЕВНО, false);

        Intent открыть = new Intent(context, MainActivity.class);
        открыть.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent нажатие = PendingIntent.getActivity(context, номер, открыть,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, КАНАЛ)
                .setSmallIcon(R.drawable.ic_stat_synapse)
                .setContentTitle(заголовок == null ? "Synapse" : заголовок)
                .setContentText(текст)
                // Длинный текст брифинга иначе обрежется в одну строку, а
                // весь его смысл — в перечислении дел.
                .setStyle(new NotificationCompat.BigTextStyle().bigText(текст))
                .setContentIntent(нажатие)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        try {
            NotificationManagerCompat.from(context).notify(номер, b.build());
        } catch (SecurityException e){
            // Разрешение отозвали между постановкой и показом — молча пропускаем.
        }

        if (ежедневно) переставитьНаЗавтра(context, intent, номер);
    }

    /**
     * Ежедневное напоминание переставляет само себя.
     *
     * Иначе брифинг пришёл бы один раз: страница переставляет будильники при
     * открытии приложения, а человек, которому нужен утренний план, как раз и
     * не открывает его до того, как план придёт.
     */
    private void переставитьНаЗавтра(Context context, Intent прежний, int номер) {
        AlarmManager будильник = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (будильник == null) return;

        Intent снова = new Intent(context, ПоказатьНапоминание.class);
        снова.putExtras(прежний);
        PendingIntent пи = PendingIntent.getBroadcast(context, номер, снова,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        long завтра = System.currentTimeMillis() + AlarmManager.INTERVAL_DAY;
        поставить(будильник, завтра, пи);
    }

    /**
     * Точный будильник там, где он разрешён, иначе окно в четверть часа.
     *
     * С Android 12 точные будильники требуют отдельного разрешения, и просить
     * его ради напоминания о задаче — перебор: магазины к таким запросам
     * относятся плохо, а человеку неважно, придёт напоминание в 9:00 или в
     * 9:07. Но если разрешение уже есть, пользуемся им.
     */
    static void поставить(AlarmManager будильник, long когда, PendingIntent пи) {
        boolean можноТочно = Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                || будильник.canScheduleExactAlarms();
        try {
            if (можноТочно) {
                будильник.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, когда, пи);
            } else {
                будильник.setWindow(AlarmManager.RTC_WAKEUP, когда, 15 * 60 * 1000L, пи);
            }
        } catch (SecurityException e){
            будильник.setWindow(AlarmManager.RTC_WAKEUP, когда, 15 * 60 * 1000L, пи);
        }
    }

    /** Канал создаётся один раз; без него на Android 8+ уведомление не покажется. */
    static void завестиКанал(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ContextCompat.getSystemService(context, NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(КАНАЛ) != null) return;
        android.app.NotificationChannel канал = new android.app.NotificationChannel(
                КАНАЛ, "Напоминания", NotificationManager.IMPORTANCE_DEFAULT);
        канал.setDescription("Задачи со временем, цели, утренний план и вечерний отчёт");
        nm.createNotificationChannel(канал);
    }
}
