package ru.synapseapp.app;

import android.app.Application;

import androidx.appcompat.app.AppCompatDelegate;

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
    }
}
