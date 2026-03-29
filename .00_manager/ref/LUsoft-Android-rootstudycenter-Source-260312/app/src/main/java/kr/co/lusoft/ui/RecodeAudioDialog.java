package kr.co.lusoft.ui;


import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.graphics.drawable.ColorDrawable;
import android.os.Handler;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;

import java.io.Serializable;
import java.util.Objects;

import kr.co.lusoft.R;
import kr.co.lusoft.func.RecodeManager;
import android.widget.Chronometer;
import android.widget.TextView;


public class RecodeAudioDialog extends Dialog implements View.OnClickListener {

    private static RecodeDialogCallback m_callback = null;

    private final int RECODE_STATUS_WAIT = 0;
    private final int RECODE_STATUS_START_RECODING = 1;
    private final int RECODE_STATUS_STOP_RECODING = 2;
    private final int RECODE_STATUS_START_PALY = 3;
    private final int RECODE_STATUS_PAUSE_PALY = 4;
    private final int RECODE_STATUS_COMPLETE_PALY = 5;
    private int RECODE_STATUS = RECODE_STATUS_WAIT;

    private Chronometer chronometer;
    private long stopTime = 0;


    public interface RecodeDialogCallback extends Serializable
    {
        void dissmiss();
        void startRecode();
        void stopRecode();
        void playAudio();
        void pauseAudio();
        void saveRecode();
    }


    public RecodeAudioDialog(Context context, Activity activity) {
        super(context);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.dialog_recode_audio);

        RecodeManager.share().Init(context);

        findViewById(R.id.btn_dissmiss).setOnClickListener(this);
        findViewById(R.id.btn_recode).setOnClickListener(this);
        findViewById(R.id.tv_re).setOnClickListener(this);
        findViewById(R.id.tv_save).setOnClickListener(this);
        chronometer = findViewById(R.id.chronometer);
    }

    @Override
    public void onClick(View v) {
        switch (v.getId()) {
            case R.id.btn_dissmiss: {
                RECODE_STATUS = RECODE_STATUS_WAIT;
                RecodeManager.share().stopAudio();
                RecodeManager.share().stopRecording();
                RecodeManager.share().removeRecode();
                m_callback.dissmiss();
                super.dismiss();
                break;
            }
            case R.id.btn_recode: {
                switch (RECODE_STATUS)
                {
                    case RECODE_STATUS_WAIT: {
                        RECODE_STATUS = RECODE_STATUS_START_RECODING;
                        RecodeManager.share().startRecording();

                        m_callback.startRecode();

                        chronometer.setVisibility(View.VISIBLE);
                        chronometer.setBase(SystemClock.elapsedRealtime() + stopTime);
                        chronometer.start();

                        findViewById(R.id.btn_recode).setBackgroundResource(R.drawable.icon_pause);
                        findViewById(R.id.ll_bottom).setVisibility(View.GONE);
                        break;
                    }
                    case RECODE_STATUS_START_RECODING: {
                        RECODE_STATUS = RECODE_STATUS_STOP_RECODING;
                        RecodeManager.share().stopRecording();

                        m_callback.stopRecode();

                        stopTime = chronometer.getBase() - SystemClock.elapsedRealtime();
                        chronometer.stop();

                        findViewById(R.id.btn_recode).setBackgroundResource(R.drawable.icon_play);
                        findViewById(R.id.ll_bottom).setVisibility(View.VISIBLE);
                        break;
                    }
                    case RECODE_STATUS_STOP_RECODING: {
                        playRecodedAudio();
                        break;
                    }
                    case RECODE_STATUS_START_PALY: {
//                        RECODE_STATUS = RECODE_STATUS_PAUSE_PALY;
//                        m_callback.pauseAudio();
                        break;
                    }
                    case RECODE_STATUS_COMPLETE_PALY: {
                        playRecodedAudio();
                        break;
                    }
                }
                break;
            }
            case R.id.tv_re: {
                RecodeManager.share().stopAudio();
                RecodeManager.share().stopRecording();
                RecodeManager.share().removeRecode();

                RECODE_STATUS = RECODE_STATUS_WAIT;

                chronometer.setBase(SystemClock.elapsedRealtime());
                stopTime = 0;
                chronometer.stop();
                chronometer.setVisibility(View.VISIBLE);

                findViewById(R.id.btn_recode).setBackgroundResource(R.drawable.icon_record);
                findViewById(R.id.ll_bottom).setVisibility(View.GONE);
                findViewById(R.id.tv_status).setVisibility(View.GONE);
                break;
            }
            case R.id.tv_save:
                RecodeManager.share().saveRecording(true, new RecodeManager.PlayAudioCallback() {
                    @Override
                    public void playComplete() {
                    }

                    @Override
                    public void saveComplete() {
                        m_callback.saveRecode();
                    }
                });
                break;
        }
    }

    @Override
    public void show() {
        Objects.requireNonNull(getWindow()).setBackgroundDrawable(new ColorDrawable(android.graphics.Color.TRANSPARENT));
        this.setCancelable(false);
        this.setCanceledOnTouchOutside(false);
        super.show();
    }

    private void playRecodedAudio() {
        RECODE_STATUS = RECODE_STATUS_START_PALY;

        chronometer.setVisibility(View.GONE);
        findViewById(R.id.tv_status).setVisibility(View.VISIBLE);
        ((TextView)findViewById(R.id.tv_status)).setText("재생중입니다...");

        RecodeManager.share().playAudio(new RecodeManager.PlayAudioCallback() {
            @Override
            public void playComplete() {
                chronometer.setBase(SystemClock.elapsedRealtime());
                stopTime = 0;
                chronometer.stop();

                RECODE_STATUS = RECODE_STATUS_COMPLETE_PALY;
                findViewById(R.id.tv_status).setVisibility(View.VISIBLE);
                ((TextView)findViewById(R.id.tv_status)).setText("재생이 완료 되었습니다.");
            }

            @Override
            public void saveComplete() {
            }
        });
        m_callback.playAudio();
    }

    public void showRecodeDialog(final RecodeDialogCallback callback) {
        m_callback = callback;

        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                show();
            }
        }, 0);
    }
}
