package ru.synapseapp.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;

/**
 * Распознавание речи через системный движок Android.
 *
 * Веб-версия говорит с микрофоном через SpeechRecognition — это стандарт, он
 * работает в Safari и в Chrome. В WebView его нет: объект объявлен, но при
 * запуске отдаёт «not-allowed» независимо от выданных разрешений. Тестировщик
 * увидел ровно это — «браузер не дал доступ к микрофону», хотя доступ был ни
 * при чём.
 *
 * Поэтому speech здесь свой. Страница зовёт AndroidVoice.start(), результаты
 * приходят обратно тем же событием, что рисует браузерное распознавание, —
 * веб-версии не нужно знать, кто именно её слушает.
 */
public class VoiceBridge {

    /** Код запроса разрешения; значение произвольное, важно лишь совпадение. */
    static final int ЗАПРОС_МИКРОФОНА = 4711;

    private final Activity activity;
    private final WebView web;
    private SpeechRecognizer recognizer;

    VoiceBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    /** Есть ли на устройстве распознавание вообще. */
    @JavascriptInterface
    public boolean available() {
        return SpeechRecognizer.isRecognitionAvailable(activity);
    }

    @JavascriptInterface
    public void start() {
        activity.runOnUiThread(this::начать);
    }

    @JavascriptInterface
    public void stop() {
        activity.runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
        });
    }

    private void начать() {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            // Разрешение спрашиваем в момент, когда человек сам нажал микрофон:
            // окно системы в этот момент понятно, а на запуске — нет.
            ActivityCompat.requestPermissions(activity,
                    new String[]{Manifest.permission.RECORD_AUDIO}, ЗАПРОС_МИКРОФОНА);
            return;
        }

        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            событие("error", "На этом телефоне нет распознавания речи.");
            return;
        }

        if (recognizer != null) recognizer.destroy();
        recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { событие("start", ""); }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rms) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int type, Bundle params) { }

            /** Промежуточный текст — чтобы человек видел, что его слышат. */
            @Override
            public void onPartialResults(Bundle partial) {
                событие("partial", первый(partial));
            }

            @Override
            public void onResults(Bundle results) {
                событие("final", первый(results));
            }

            @Override
            public void onError(int code) {
                // Молчание — не ошибка, а обычный конец фразы: человек нажал
                // микрофон и передумал. Ругаться на это незачем.
                if (code == SpeechRecognizer.ERROR_NO_MATCH
                        || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    событие("final", "");
                    return;
                }
                событие("error", code == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                        ? "Нет доступа к микрофону."
                        : "Распознавание не сработало.");
            }
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.getPackageName());
        recognizer.startListening(intent);
    }

    private static String первый(Bundle bundle) {
        ArrayList<String> список = bundle == null
                ? null : bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return (список == null || список.isEmpty()) ? "" : список.get(0);
    }

    /** Передаём в страницу обычным событием — без своих глобальных функций. */
    private void событие(String вид, String текст) {
        String js = "window.dispatchEvent(new CustomEvent('android-voice',{detail:{"
                + "kind:" + строка(вид) + ",text:" + строка(текст) + "}}))";
        activity.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    /** Кавычки и переводы строк в тексте не должны ломать выражение. */
    private static String строка(String s) {
        return org.json.JSONObject.quote(s == null ? "" : s);
    }

    void освободить() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
    }
}
