package net.phanmemmottrieu.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class RegistrationRequest {
    private String fullName;
    private String email;
    private String password;
    private String userAddress;
    private String username; // THÊM TRƯỜNG NÀY
    private String phoneNumber; // THÊM TRƯỜNG NÀY
    @JsonProperty("app_token")
    private String appToken;

    // Constructors
    public RegistrationRequest() {
    }

    public RegistrationRequest(String fullName, String email, String password, String userAddress, String username, String phoneNumber, String appToken) { // CẬP NHẬT CONSTRUCTOR
        this.fullName = fullName;
        this.email = email;
        this.password = password;
        this.userAddress = userAddress;
        this.username = username; // THÊM TRƯỜNG NÀY
        this.phoneNumber = phoneNumber; // THÊM TRƯỜNG NÀY
        this.appToken = appToken;
    }

    // Getters
    public String getFullName() {
        return fullName;
    }

    public String getEmail() {
        return email;
    }

    public String getPassword() {
        return password;
    }

    public String getUserAddress() {
        return userAddress;
    }

    // THÊM GETTERS CHO username VÀ phoneNumber
    public String getUsername() {
        return username;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public String getAppToken() {
        return appToken;
    }

    // Setters
    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public void setUserAddress(String userAddress) {
        this.userAddress = userAddress;
    }

    // THÊM SETTERS CHO username VÀ phoneNumber
    public void setUsername(String username) {
        this.username = username;
    }

    public void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    public void setAppToken(String appToken) {
        this.appToken = appToken;
    }

    @Override
    public String toString() {
        return "RegistrationRequest{" +
               "fullName='" + fullName + '\'' +
               ", email='" + email + '\'' +
               ", password='[PROTECTED]'" +
               ", userAddress='" + userAddress + '\'' +
               ", username='" + username + '\'' + // CẬP NHẬT toString
               ", phoneNumber='" + phoneNumber + '\'' + // CẬP NHẬT toString
               ", appToken='" + appToken + '\'' +
               '}';
    }
}