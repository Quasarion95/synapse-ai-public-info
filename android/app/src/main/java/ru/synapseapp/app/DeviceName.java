package ru.synapseapp.app;

import java.util.Locale;

/**
 * Имя телефона для «Моих устройств» — без имени владельца.
 *
 * Системное имя телефона (Settings.Global device_name) человек узнаёт лучше
 * заводского кода: «A51», а не «SM-A515F». Но в нём часто стоит имя
 * владельца — Samsung по-русски называет телефон «A51 пользователя …», на
 * других языках «…'s Galaxy A51», «A51 von …», а человек может назвать
 * телефон и просто своим именем. Список устройств хранится на сервере
 * открытым текстом, тогда как записи шифруются. Владелец: «без имени
 * человека».
 *
 * Поэтому из системного имени не берётся ни одно слово целиком — только
 * кусок, который сам входит в заводскую модель из Build.MODEL: «A51» из
 * «SM-A515F». Наружу уходит не больше, чем уходит и так — модель, просто в
 * том виде, в каком её знает человек. Нет такого куска — марка и модель как
 * есть: «Samsung SM-A515F».
 */
final class DeviceName {

    private DeviceName() { }

    static String of(String системное, String марка, String модель) {
        марка = марка == null ? "" : марка.trim();
        модель = модель == null ? "" : модель.trim();
        String код = модель.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        String лучшее = "";
        if (системное != null && !код.isEmpty()) {
            for (String слово : системное.toUpperCase(Locale.ROOT).split("[^A-Z0-9]+")) {
                if (слово.length() >= 2 && слово.matches(".*\\d.*") && код.contains(слово)
                        && слово.length() > лучшее.length()) лучшее = слово;
            }
        }
        return сМаркой(марка, лучшее.isEmpty() ? модель : лучшее);
    }

    /** «Samsung A51»: марку спереди, если её там ещё нет. */
    private static String сМаркой(String марка, String имя) {
        if (марка.isEmpty() || имя.toLowerCase(Locale.ROOT).startsWith(марка.toLowerCase(Locale.ROOT))) return имя;
        String красиво = марка.substring(0, 1).toUpperCase(Locale.ROOT) + марка.substring(1).toLowerCase(Locale.ROOT);
        return имя.isEmpty() ? красиво : красиво + " " + имя;
    }
}
