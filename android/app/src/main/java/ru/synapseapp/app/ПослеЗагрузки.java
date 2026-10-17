package ru.synapseapp.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Возвращает напоминания после перезагрузки телефона.
 *
 * Будильники AlarmManager живут до выключения: после перезагрузки их нет.
 * Страница переставила бы их при открытии приложения, но утренний план нужен
 * как раз тому, кто приложение утром ещё не открывал. Поэтому последний
 * список, присланный страницей, ставим заново отсюда.
 */
public class ПослеЗагрузки extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        NotifyBridge.поставитьВсе(context, NotifyBridge.сохранённый(context));
    }
}
