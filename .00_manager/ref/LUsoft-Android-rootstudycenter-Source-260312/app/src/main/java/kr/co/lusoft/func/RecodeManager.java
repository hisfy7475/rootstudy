package kr.co.lusoft.func;


import android.annotation.SuppressLint;
import android.content.Context;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.os.Environment;
import android.os.Handler;
import android.os.SystemClock;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONArray;

import java.io.File;
import java.io.IOException;
import java.io.Serializable;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import kr.co.lusoft.ui.MainActivity;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.core.Lusoft;
import kr.co.lusoft.util.StackManager;


public class RecodeManager {

    @SuppressLint("StaticFieldLeak")
    private static RecodeManager instance = null;
    @SuppressLint("StaticFieldLeak")
    private static Context m_context = null;
    @SuppressLint("StaticFieldLeak")
    private static MainActivity m_activity = null;

    private MediaRecorder mRecorder;
    private long mStartTime = 0;
    private int[] amplitudes = new int[100];
    private int i = 0;

    private MediaPlayer mPlayer;

    public interface PlayAudioCallback extends Serializable
    {
        void playComplete();
        void saveComplete();
    }


    public static RecodeManager share() {
        if(instance == null) {
            instance = new RecodeManager();
        }
        return instance;
    }

    public void Init(Context context) {
        m_context = context;
        m_activity = (MainActivity) StackManager.rootActivity();
    }

    private RecodeManager() {
    }


    private Handler mHandler = new Handler();
    private Runnable mTickExecutor = new Runnable() {
        @Override
        public void run() {
            tick();
            mHandler.postDelayed(mTickExecutor,100);
        }
    };
    private File mOutputFile;

    public void startRecording() {
        mRecorder = new MediaRecorder();
        mRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        mRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        mRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        mRecorder.setAudioEncodingBitRate(64000);
        mRecorder.setAudioSamplingRate(16000);
        mOutputFile = getOutputFile();
        mOutputFile.getParentFile().mkdirs();
        mRecorder.setOutputFile(mOutputFile.getAbsolutePath());

        try {
            mRecorder.prepare();
            mRecorder.start();

            Date from = new Date();
            @SuppressLint("SimpleDateFormat") SimpleDateFormat transFormat = new SimpleDateFormat("yyyyMMddHHmmss");
            String to = transFormat.format(from);

            String strFunc = String.format(Locale.KOREA, "javascript:result_app_get_recode_start('%s')", to);
            m_activity.doCallFuncOnJSP(strFunc);

            mStartTime = SystemClock.elapsedRealtime();
            mHandler.postDelayed(mTickExecutor, 100);
        } catch (IOException e) {
            e.getStackTrace();
        }
    }

    public void stopRecording() {
        if(mRecorder != null) {
            mRecorder.stop();
            mRecorder.release();
            mRecorder = null;
            mStartTime = 0;
            mHandler.removeCallbacks(mTickExecutor);
        }
    }

    public void saveRecording(boolean isSave, final PlayAudioCallback callback) {
        stopRecording();

        if(isSave) {
            Date from = new Date();
            @SuppressLint("SimpleDateFormat") SimpleDateFormat transFormat = new SimpleDateFormat("yyyyMMddHHmmss");
            String to = transFormat.format(from);
            String strFunc = String.format(Locale.KOREA, "javascript:result_app_get_recode_end('%s')", to);
            m_activity.doCallFuncOnJSP(strFunc);

            if(mOutputFile.exists()) {
                Lusoft.doFileUpload(mOutputFile.getAbsolutePath(), new Lusoft.LusoftCallback() {
                    @Override
                    public void fileUpload(String query) {
                        if (mOutputFile != null) {
                            mOutputFile.delete();
                        }

                        m_activity.doCallFuncOnJSP(query);
                        callback.saveComplete();
                    }

                    @Override
                    public void fileMultiUpload(JSONArray result) {
                    }
                });
            } else {
                Toast.makeText(m_context, "녹음이 되지 않았습니다.", Toast.LENGTH_SHORT).show();
            }
        }
    }

    public void removeRecode() {
        if(mOutputFile.exists()) {
            if (mOutputFile != null) {
                mOutputFile.delete();
            }
        }
    }

    private File getOutputFile() {
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMdd_HHmmssSSS", Locale.KOREA);
        return new File(Environment.getExternalStorageDirectory().getAbsolutePath()
                + "/Voice Recorder/RECORDING_"
                + dateFormat.format(new Date())
                + ".m4a");
    }

    private void tick() {
        long time = (mStartTime < 0) ? 0 : (SystemClock.elapsedRealtime() - mStartTime);
        int minutes = (int) (time / 60000);
        int seconds = (int) (time / 1000) % 60;
        int milliseconds = (int) (time / 100) % 10;
        Log.d("tick", minutes+":"+(seconds < 10 ? "0"+seconds : seconds)+"."+milliseconds);
        if (mRecorder != null) {
            amplitudes[i] = mRecorder.getMaxAmplitude();
            //Log.d("Voice Recorder","amplitude: "+(amplitudes[i] * 100 / 32767));
            if (i >= amplitudes.length -1) {
                i = 0;
            } else {
                ++i;
            }
        }
    }

    public void playAudio(final PlayAudioCallback callback) {
        if(mPlayer != null) {
            mPlayer.stop();
            mPlayer.release();
            mPlayer = null;
        }

        try {
            mPlayer = new MediaPlayer();
            mPlayer.setDataSource(mOutputFile.getAbsolutePath());
            mPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    callback.playComplete();
                }
            });
            mPlayer.prepare();
            mPlayer.start();
        } catch (Exception e) {
            e.getStackTrace();
        }
    }

    public void stopAudio() {
        if(mPlayer != null) {
            mPlayer.stop();
            mPlayer.release();
            mPlayer = null;
        }
    }
}
