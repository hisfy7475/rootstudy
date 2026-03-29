package kr.co.lusoft.notification.download;


import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;

public class DownloadInfo {
    private int index = -1;
    private long download_id = -1;
    private String download_title = null;
    private String download_url = null;
    private String download_mode = null;
    private String download_file_name = null;
    private String download_file_name_org = null;
    private String download_file_fullpath = null;


    public DownloadInfo() {
        removeAllData();
    }

    public int getIndex() {
        return index;
    }

    public void setIndex(int index) {
        this.index = index;
    }

    public long getDownload_id() {
        return download_id;
    }

    public void setDownload_id(long download_id) {
        this.download_id = download_id;
    }

    public String getDownload_title() {
        return download_title;
    }

    public void setDownload_title(String download_title) {
        this.download_title = download_title;
    }

    public String getDownload_url() {
        return download_url;
    }

    public void setDownload_url(String download_url) {
        try {
            this.download_url = URLDecoder.decode(download_url, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            e.printStackTrace();
        }
    }

    public String getDownload_mode() {
        return download_mode;
    }

    public void setDownload_mode(String download_mode) {
        this.download_mode = download_mode;
    }

    public String getDownload_file_name() {
        return download_file_name;
    }

    public void setDownload_file_name(String download_file_name) {
        try {
            this.download_file_name = URLDecoder.decode(download_file_name, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            e.printStackTrace();
        }
    }

    public String getDownload_file_name_org() {
        return download_file_name_org;
    }

    public void setDownload_file_name_org(String download_file_name_org) {
        try {
            this.download_file_name_org = URLDecoder.decode(download_file_name_org, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            e.printStackTrace();
        }
    }

    public String getDownload_file_fullpath() {
        return download_file_fullpath;
    }

    public void setDownload_file_fullpath(String download_file_fullpath) {
        this.download_file_fullpath = download_file_fullpath;
    }

    public void removeAllData() {
        index = -1;
        download_id = -1;
        download_title = null;
        download_url = null;
        download_mode = null;
        download_file_name = null;
        download_file_name_org = null;
        download_file_fullpath = null;
    }
}
