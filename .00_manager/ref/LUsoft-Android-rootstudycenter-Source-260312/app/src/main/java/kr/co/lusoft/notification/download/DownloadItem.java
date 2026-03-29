package kr.co.lusoft.notification.download;


import android.app.PendingIntent;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.TaskStackBuilder;

public class DownloadItem {

    private long queueId;
    private String title;
    private String description;
    private String sound;
    private Intent resultIntent;
    private PendingIntent pendingIntent;
    private TaskStackBuilder stackBuilder;

    public DownloadItem() {
    }

    public long getId() {
        return queueId;
    }

    public void setId(long id) {
        this.queueId = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public long getQueueId() {
        return queueId;
    }

    public void setQueueId(long queueId) {
        this.queueId = queueId;
    }

    public String getSound() {
        return sound;
    }

    public void setSound(String sound) {
        this.sound = sound;
    }

    public Intent getResultIntent() {
        return resultIntent;
    }

    public void setResultIntent(Intent resultIntent) {
        this.resultIntent = resultIntent;
    }

    public PendingIntent getPendingIntent() {
        return pendingIntent;
    }

    public void setPendingIntent(PendingIntent pendingIntent) {
        this.pendingIntent = pendingIntent;
    }

    public TaskStackBuilder getStackBuilder() {
        return stackBuilder;
    }

    public void setStackBuilder(TaskStackBuilder stackBuilder) {
        this.stackBuilder = stackBuilder;
    }
}
