package kr.co.lusoft.notification.download;


import java.util.ArrayList;


public class DownloadMng {

    private static DownloadMng manage = null;

    private ArrayList<DownloadInfo> infos = new ArrayList<>();


    public DownloadMng() {
    }

    public static DownloadMng manage()
    {
        if(manage == null) {
            manage = new DownloadMng();
        }
        return manage;
    }

    public int getCount() {
        return infos.size();
    }

    public int getIndexAtObject(DownloadInfo info) {
        return infos.indexOf(info);
    }

    public int getIndexAtUrl(String url) {
        for(int i = 0; i < infos.size(); i++)
        {
            DownloadInfo info = infos.get(i);
            String find = info.getDownload_url();
            if(url.equals(find)) {
                return i;
            }
        }
        return -1;
    }

    public void addInfo(DownloadInfo info) {
        boolean isAdd = true;

        String target = info.getDownload_url();
        for(int i = 0; i < infos.size(); i++)
        {
            DownloadInfo old = infos.get(i);
            String find = old.getDownload_url();
            if(target.equals(find)) {
                isAdd = false;
                break;
            }
        }

        if(isAdd) {
            infos.add(info);
        }
    }

    public void replaceObject(DownloadInfo info) {
        String target = info.getDownload_url();
        for(int i = 0; i < infos.size(); i++)
        {
            DownloadInfo item = infos.get(i);
            String find = info.getDownload_url();
            if(target.equals(find)) {
                infos.set(i, info);
            }
        }
    }

    public void removeAtIndex(int index) {
        if(infos.size() > index) {
            infos.remove(index);
        }
    }

    public void removeAtObject(DownloadInfo info) {
        infos.remove(info);
    }

    public void removeAllInfos() {
        infos.clear();
    }

    public DownloadInfo getLastObject() {
        if(infos.size() > 0) {
            return infos.get(infos.size() - 1);
        }
        return null;
    }

    public DownloadInfo getObjectAtDownloadId(long id) {
        for(int i = 0; i < infos.size(); i++)
        {
            DownloadInfo item = infos.get(i);
            long find = item.getDownload_id();
            if(find == id) {
                return item;
            }
        }
        return null;
    }
}
