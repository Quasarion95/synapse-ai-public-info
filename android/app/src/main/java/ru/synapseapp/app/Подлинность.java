package ru.synapseapp.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;

import java.security.MessageDigest;

/**
 * Своей ли подписью подписано приложение.
 *
 * Зачем это вообще. Вскрыть apk нельзя запретить: файл лежит у человека на
 * телефоне, и всё, что там исполняется, он может переписать. Тем более у нас —
 * приложение это веб-версия в коробке, и app.js лежит открытым текстом. Любая
 * защита здесь замедляет, а не запрещает, и обещать иное было бы враньём.
 *
 * Но у пересборки есть неустранимое свойство: подписать чужим ключом её не
 * получится — ключ только у владельца. Значит, перезалитая копия всегда
 * подписана другим сертификатом, и это видно изнутри.
 *
 * Что делаем с этим знанием: не падаем и не ругаемся (тот, кто пересобирал,
 * просто вырежет проверку), а перестаём отдавать ассистента. Syn — самое
 * дорогое в продукте, за него платим мы, и подделке он доставаться не должен.
 * Остальное приложение пиратской копии достанется, и с этим ничего не поделать.
 *
 * Отсекает это ленивых: тех, кто взял чужую сборку и перезалил. Человека,
 * который вскроет и вырежет саму проверку, не отсекает ничто.
 */
final class Подлинность {

    /** SHA-256 сертификата, которым подписаны наши релизы. */
    private static final String НАШ =
            "d23f701a42bc5ad93f0ca0d7447d551b9db71a131486231f45b60fbafa398813";

    private static Boolean помним;

    private Подлинность() {}

    static boolean своя(Context context) {
        if (помним != null) return помним;
        помним = посчитать(context);
        return помним;
    }

    private static boolean посчитать(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            String имя = context.getPackageName();
            Signature[] подписи;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = pm.getPackageInfo(имя, PackageManager.GET_SIGNING_CERTIFICATES);
                SigningInfo si = info.signingInfo;
                if (si == null) return false;
                подписи = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
            } else {
                @SuppressWarnings("deprecation")
                PackageInfo info = pm.getPackageInfo(имя, PackageManager.GET_SIGNATURES);
                @SuppressWarnings("deprecation")
                Signature[] старые = info.signatures;
                подписи = старые;
            }
            if (подписи == null) return false;

            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (Signature подпись : подписи) {
                if (НАШ.equalsIgnoreCase(вШестнадцатеричный(md.digest(подпись.toByteArray())))) return true;
            }
            return false;
        } catch (Exception e) {
            /* Не смогли проверить — считаем своей.

               Отказ по неизвестной причине наказал бы честного человека на
               незнакомой прошивке, а подделку не остановил бы: тот, кто
               пересобирает, эту ветку и выберет. Защита, которая ломает
               работу законным покупателям, хуже её отсутствия. */
            return true;
        }
    }

    private static String вШестнадцатеричный(byte[] байты) {
        StringBuilder sb = new StringBuilder(байты.length * 2);
        for (byte б : байты) sb.append(String.format("%02x", б));
        return sb.toString();
    }
}
