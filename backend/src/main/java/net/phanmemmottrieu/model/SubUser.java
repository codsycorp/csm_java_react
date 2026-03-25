package net.phanmemmottrieu.model;

import java.util.ArrayList;
import java.util.List;

public class SubUser {
    private String id; // ID duy nhất cho tài khoản con
    private String parentAccountId; // ID của tài khoản cha trong csm_accounts
    private String loginIdentifier; // email, username hoặc phoneNumber của tài khoản con
    private String password; // Mật khẩu đã mã hóa của tài khoản con
    private Boolean actived; // Trạng thái kích hoạt của tài khoản con
    private String groupId; // Có thể có nếu bạn có cấu trúc nhóm rõ ràng
    private List<String> permissions; // Quyền hạn cụ thể của tài khoản con
    private List<String> menusPermissions; // Quyền truy cập menu của tài khoản con
    private String permissionBitfield;
    private String permissionSchemaVersion;
    private String dataScope;
    private String deptId;
    private String branchId;

    public SubUser() {
        this.permissions = new ArrayList<>();
        this.menusPermissions = new ArrayList<>();
    }

    // Getters and Setters

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getParentAccountId() {
        return parentAccountId;
    }

    public void setParentAccountId(String parentAccountId) {
        this.parentAccountId = parentAccountId;
    }

    public String getLoginIdentifier() {
        return loginIdentifier;
    }

    public void setLoginIdentifier(String loginIdentifier) {
        this.loginIdentifier = loginIdentifier;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public Boolean getActived() {
        return actived;
    }

    public void setActived(Boolean actived) {
        this.actived = actived;
    }

    public String getGroupId() {
        return groupId;
    }

    public void setGroupId(String groupId) {
        this.groupId = groupId;
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

    @Override
    public String toString() {
        return "SubUser{" +
               "id='" + id + '\'' +
               ", parentAccountId='" + parentAccountId + '\'' +
               ", loginIdentifier='" + loginIdentifier + '\'' +
               ", actived=" + actived +
               ", groupId='" + groupId + '\'' +
               ", permissions=" + permissions +
               ", menusPermissions=" + menusPermissions +
               ", permissionBitfield='" + permissionBitfield + '\'' +
               ", permissionSchemaVersion='" + permissionSchemaVersion + '\'' +
               ", dataScope='" + dataScope + '\'' +
               ", deptId='" + deptId + '\'' +
               ", branchId='" + branchId + '\'' +
               '}';
    }
}