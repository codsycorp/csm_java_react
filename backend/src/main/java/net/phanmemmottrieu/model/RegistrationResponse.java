package net.phanmemmottrieu.model;

public class RegistrationResponse {
    private boolean success;
    private Integer errorCode; // 0: Insert error, 1: DB error, 2: User exists, 3: General catch error
    private String errorErr;
    private String message; // Optional: for success messages or specific errors

    // Constructor mặc định
    public RegistrationResponse() {
    }

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

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}