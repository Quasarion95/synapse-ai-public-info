package ru.synapseapp.app;

import android.app.Activity;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Сохранение резервной копии из WebView.
 *
 * Веб-версия делает копию так: собирает JSON, заворачивает в blob и жмёт на
 * невидимую ссылку с атрибутом download. В браузере это скачивание файла. В
 * WebView — ничего: он не умеет загрузок вовсе, пока приложение не поставит
 * DownloadListener, а blob-адрес и через него не прочитать — он живёт внутри
 * страницы, снаружи его не существует.
 *
 * Поэтому файл пишем здесь, получив от страницы уже готовый текст. Молчаливый
 * отказ тут дороже всего: человек жмёт «Сохранить копию» ради того, чтобы не
 * потерять свои записи, видит, что ничего не произошло, и решает, что копия
 * сделана. Именно на это и пожаловался пользователь.
 */
public class ФайлыBridge {

    private final Activity активность;

    public ФайлыBridge(Activity активность) {
        this.активность = активность;
    }

    /**
     * @return куда легло, или пустая строка, если не получилось.
     */
    @JavascriptInterface
    public String save(String имя, String содержимое) {
        if (имя == null || имя.isEmpty()) имя = "synapse.json";
        byte[] байты = (содержимое == null ? "" : содержимое).getBytes(StandardCharsets.UTF_8);

        /* С Android 10 в общую папку «Загрузки» пишут через MediaStore, и
           разрешения для этого не нужно: система сама заводит запись и отдаёт
           поток. Файл виден в «Файлах» и в любом менеджере — то есть его можно
           переслать себе, а это и есть смысл копии. */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                ContentValues значения = new ContentValues();
                значения.put(MediaStore.Downloads.DISPLAY_NAME, имя);
                значения.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                значения.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri куда = активность.getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, значения);
                if (куда == null) return "";

                OutputStream поток = активность.getContentResolver().openOutputStream(куда);
                if (поток == null) return "";
                try {
                    поток.write(байты);
                } finally {
                    поток.close();
                }

                значения.clear();
                значения.put(MediaStore.Downloads.IS_PENDING, 0);
                активность.getContentResolver().update(куда, значения, null, null);
                return "Загрузки";
            } catch (Exception e) {
                return "";
            }
        }

        /* До Android 10 запись в общие «Загрузки» требует разрешения на всё
           внешнее хранилище — просить его ради одной кнопки несоразмерно.
           Пишем в собственную папку приложения: разрешения не нужно, файл
           доступен из «Файлов», и путь мы называем вслух. */
        try {
            File папка = активность.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
            if (папка == null) return "";
            if (!папка.exists() && !папка.mkdirs()) return "";
            File файл = new File(папка, имя);
            FileOutputStream поток = new FileOutputStream(файл);
            try {
                поток.write(байты);
            } finally {
                поток.close();
            }
            return файл.getAbsolutePath();
        } catch (Exception e) {
            return "";
        }
    }
}
