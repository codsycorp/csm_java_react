package net.phanmemmottrieu.model;

import java.util.List;

public class LoginResponse {
    private boolean success;
    private Integer errorCode;
    private String errorErr;
    private String socketId;
    private String username; // Assuming 'username' is what you want to return
    private String userAddress;
    private String appToken; // Assuming 'app_token' is important for joining rooms
    private List<String> permissions; // Example for user permissions
    private List<String> menusPermissions; // Example for menu permissions

    // Getters and Setters
    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public Integer getErrorCode() {
        return errorCode;
    }

    public void setErrorCode(Integer errorCode) {
        this.errorCode = errorCode;
    }

    public String getErrorErr() {
        return errorErr;
    }

    public void setErrorErr(String errorErr) {
        this.errorErr = errorErr;
    }

    public String getSocketId() {
        return socketId;
    }

    public void setSocketId(String socketId) {
        this.socketId = socketId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getAppToken() {
        return appToken;
    }
    public String getUserAddress() {
        return userAddress;
    }

    public void setUserAddress(String userAddress) {
        this.userAddress = userAddress;
    }
    
    public void setAppToken(String appToken) {
        this.appToken = appToken;
    }

    public List<String> getPermissions() {
        return permissions;
    }

    public void setPermissions(List<String> permissions) {
        this.permissions = permissions;
    }

    public List<String> getMenusPermissions() {
        return menusPermissions;
    }

    public void setMenusPermissions(List<String> menusPermissions) {
        this.menusPermissions = menusPermissions;
    }
}