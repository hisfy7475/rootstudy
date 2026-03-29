package kr.co.lusoft.notification.fcm;


public class FCMItem {

    private int fcmid;
    private String title;
    private String description;
    private String sound;
    private String taskid;


    public FCMItem() {
    }

    @Override
    protected void finalize() throws Throwable {
        super.finalize();
    }

    public int getFcmid() {
        return fcmid;
    }

    public void setFcmid(int fcmid) {
        this.fcmid = fcmid;
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

    public String getSound() {
        return sound;
    }

    public void setSound(String sound) {
        this.sound = sound;
    }

    public String getTaskid() {
        return taskid;
    }

    public void setTaskid(String taskid) {
        this.taskid = taskid;
    }
}

