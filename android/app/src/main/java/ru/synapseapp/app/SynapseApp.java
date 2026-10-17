package ru.synapseapp.app;

import android.app.Application;

import androidx.appcompat.app.AppCompatDelegate;

import com.my.tracker.MyTracker;

/**
 * Тему выбирает сама веб-версия, а не система.
 *
 * Внутри есть свой переключатель светлой и тёмной и десять палитр, и человек
 * уже сделал этот выбор там. Если системная тема будет перекрашивать окно
 * поверх, при тёмной системе и светлой теме приложения по краям экрана
 * останется чёрная рамка — та самая мелочь, из-за которой приложение выглядит
 * неаккуратно собранным.
 */
public class SynapseApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        запуститьАналитику();
    }

    /* MyTracker — откуда пришли и вернулись ли.

       Без ключа (отладка, сборка на чужом компьютере) не запускаем вовсе.
       Геолокацию не собираем: для вопроса «окупилась ли реклама» город
       человека не нужен, а разрешение на место у нас и не спрашивается. */
    private void запуститьАналитику() {
        if (BuildConfig.MYTRACKER_KEY.isEmpty()) return;
        try {
            MyTracker.getTrackerConfig()
                    .setTrackingLocationEnabled(false)
                    .setTrackingPreinstallEnabled(false);
            MyTracker.initTracker(BuildConfig.MYTRACKER_KEY, this);
        } catch (Throwable ignored) { }
    }
}
