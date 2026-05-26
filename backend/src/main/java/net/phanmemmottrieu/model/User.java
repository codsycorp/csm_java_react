
package net.phanmemmottrieu.model;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonRawValue;

public class User {

        // Alias for roles to permissions for compatibility
        public List<String> getRoles() {
            return getPermissions();
        }

        public void setRoles(List<String> roles) {
            setPermissions(roles);
        }
    private String id; // Thêm trường id
    private String refreshToken;
    private String refreshTokenIp;
    private String refreshTokenUa;
    private Long refreshTokenExpiry;
    private String email;
    private String password; // Lưu mật khẩu đã mã hóa từ DB
    private String username;
    private String phoneNumber; // THÊM TRƯỜNG NÀY
    private Boolean actived;
    private String appToken; // Lưu app_token đã giải mã khi trả về cho client (hoặc mã hóa nếu không giải mã)
    private String appId; // THÊM TRƯỜNG NÀY: Dùng để lưu app_id (menu home — single app)
    /** Apps allowed for API data read/write; menu app_id is always included when resolved. */
    private List<String> dataAppIds;
    private String fullName; // THÊM TRƯỜNG NÀY: Dùng để lưu tên đầy đủ
    @JsonRawValue
    private String userAddress; // THÊM TRƯỜNG NÀY: Dùng để lưu địa chỉ người dùng
    private String avatar; // THÊM TRƯỜNG NÀY: Dùng để lưu đường dẫn ảnh đại diện
    private List<String> permissions;
    private List<String> menusPermissions;
    private String permissionBitfield;
    private String permissionSchemaVersion;
    private String dataScope;
    private String deptId;
    private String branchId;
    private List<Map<String, Object>> groupRights; // Thêm trường này để xử lý group_rights
    private Boolean dev; // Thêm trường để xác định user có quyền dev/admin không
    private Integer loginVersion; // Single-session version

    // Constructors (Bạn có thể thêm constructor với các trường mới nếu cần)
    public User() {
    }

    // Getter cho id
    public String getId() {
        return id;
    }

    // Setter cho id
    public void setId(String id) {
        this.id = id;
    }

    // Constructor với tất cả các trường (ví dụ)
    public User(String email, String password, String username, String phoneNumber, Boolean actived, String appToken, String appId, // CẬP NHẬT CONSTRUCTOR
                String fullName, String userAddress, String avatar, List<String> permissions, List<String> menusPermissions,
                List<Map<String, Object>> groupRights, String refreshToken, String refreshTokenIp, String refreshTokenUa, Long refreshTokenExpiry) {
        this.email = email;
        this.password = password;
        this.username = username;
        this.phoneNumber = phoneNumber; // THÊM TRƯỜNG NÀY
        this.actived = actived;
        this.appToken = appToken;
        this.appId = appId;
        this.fullName = fullName;
        this.userAddress = userAddress;
        this.avatar = avatar;
        this.permissions = permissions;
        this.menusPermissions = menusPermissions;
        this.groupRights = groupRights;
        this.refreshToken = refreshToken;
        this.refreshTokenIp = refreshTokenIp;
        this.refreshTokenUa = refreshTokenUa;
        this.refreshTokenExpiry = refreshTokenExpiry;
    }
    public String getRefreshToken() {
        return refreshToken;
    }
    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }
    public String getRefreshTokenIp() {
        return refreshTokenIp;
    }
    public void setRefreshTokenIp(String refreshTokenIp) {
        this.refreshTokenIp = refreshTokenIp;
    }
    public String getRefreshTokenUa() {
        return refreshTokenUa;
    }
    public void setRefreshTokenUa(String refreshTokenUa) {
        this.refreshTokenUa = refreshTokenUa;
    }
    public Long getRefreshTokenExpiry() {
        return refreshTokenExpiry;
    }
    public void setRefreshTokenExpiry(Long refreshTokenExpiry) {
        this.refreshTokenExpiry = refreshTokenExpiry;
    }

    // Getters và Setters hiện có...

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    // THÊM GETTER/SETTER CHO phoneNumber
    public String getPhoneNumber() {
        return phoneNumber;
    }

    public void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    public Boolean getActived() {
        return actived;
    }

    public void setActived(Boolean actived) {
        this.actived = actived;
    }

    public String getAppToken() {
        return appToken;
    }

    public void setAppToken(String appToken) {
        this.appToken = appToken;
    }

    public String getAppId() {
        return appId;
    }

    public void setAppId(String appId) {
        this.appId = appId;
    }

    public List<String> getDataAppIds() {
        return dataAppIds;
    }

    public void setDataAppIds(List<String> dataAppIds) {
        this.dataAppIds = dataAppIds;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getUserAddress() {
        return userAddress;
    }

    public void setUserAddress(String userAddress) {
        this.userAddress = userAddress;
    }

    public String getAvatar() {
        return avatar;
    }

    public void setAvatar(String avatar) {
        this.avatar = avatar;
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

    public String getPermissionBitfield() {
        return permissionBitfield;
    }

    public void setPermissionBitfield(String permissionBitfield) {
        this.permissionBitfield = permissionBitfield;
    }

    public String getPermissionSchemaVersion() {
        return permissionSchemaVersion;
    }

    public void setPermissionSchemaVersion(String permissionSchemaVersion) {
        this.permissionSchemaVersion = permissionSchemaVersion;
    }

    public String getDataScope() {
        return dataScope;
    }

    public void setDataScope(String dataScope) {
        this.dataScope = dataScope;
    }

    public String getDeptId() {
        return deptId;
    }

    public void setDeptId(String deptId) {
        this.deptId = deptId;
    }

    public String getBranchId() {
        return branchId;
    }

    public void setBranchId(String branchId) {
        this.branchId = branchId;
    }

    public List<Map<String, Object>> getGroupRights() {
        return groupRights;
    }

    public void setGroupRights(List<Map<String, Object>> groupRights) {
        this.groupRights = groupRights;
    }

    public Boolean getDev() {
        return dev;
    }

    public void setDev(Boolean dev) {
        this.dev = dev;
    }

    public Integer getLoginVersion() {
        return loginVersion;
    }

    public void setLoginVersion(Integer loginVersion) {
        this.loginVersion = loginVersion;
    }

    @Override
    public String toString() {
        return "User{" +
                "email='" + email + '\'' +
                ", password='[PROTECTED]'" +
                ", username='" + username + '\'' +
                ", phoneNumber='" + phoneNumber + '\'' +
                ", actived=" + actived +
                ", appToken='" + appToken + '\'' +
                ", appId='" + appId + '\'' +
                ", fullName='" + fullName + '\'' +
                ", userAddress='" + userAddress + '\'' +
                ", avatar='" + avatar + '\'' +
                ", permissions=" + permissions +
                ", menusPermissions=" + menusPermissions +
                ", permissionBitfield='" + permissionBitfield + '\'' +
                ", permissionSchemaVersion='" + permissionSchemaVersion + '\'' +
                ", dataScope='" + dataScope + '\'' +
                ", deptId='" + deptId + '\'' +
                ", branchId='" + branchId + '\'' +
                ", groupRights=" + groupRights +
                ", refreshToken='" + refreshToken + '\'' +
                ", refreshTokenIp='" + refreshTokenIp + '\'' +
                ", refreshTokenUa='" + refreshTokenUa + '\'' +
                ", refreshTokenExpiry=" + refreshTokenExpiry +
                ", loginVersion=" + loginVersion +
                '}';
    }
}