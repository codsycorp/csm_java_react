
package net.phanmemmottrieu.service;

import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.RegistrationResponse;
import net.phanmemmottrieu.model.User;
import net.phanmemmottrieu.model.SubUser; // Giả sử bạn có lớp SubUser mới
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;

import java.util.*;

@Service
public class UserService {

    /**
     * Tìm user theo userId (id trong DB)
     */
    public Optional<User> findUserById(String userId) {
        if (userId == null || userId.isEmpty()) return Optional.empty();
        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue(userId);
        Map<String, Object> userRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, filter);
        if (userRecord != null && !userRecord.isEmpty()) {
            return Optional.of(mapRecordToUser(userRecord));
        }
        return Optional.empty();
    }

    /**
     * Tìm kiếm người dùng (chính hoặc con) theo định danh đăng nhập và mật khẩu.
     * Phương pháp này tối ưu hóa việc tìm kiếm bằng cách tránh fullScan.
     *
     * @param loginIdentifier Chuỗi định danh đăng nhập (email, username, hoặc số điện thoại).
     * @param rawPassword Mật khẩu chưa mã hóa từ người dùng.
     * @return Optional chứa đối tượng User đã được populate đầy đủ nếu tìm thấy và khớp mật khẩu, ngược lại là Optional.empty().
     */
    public Optional<User> findUserByLoginIdentifierAndPassword(String loginIdentifier, String rawPassword) {
        // 1. Thử tìm kiếm tài khoản chính theo Email
        Optional<User> userByEmail = findUserByEmail(loginIdentifier);
        if (userByEmail.isPresent()) {
            User user = userByEmail.get();
            // Kiểm tra mật khẩu tài khoản chính
            String combinedPasswordInput = user.getEmail() + "_____" + rawPassword; // Sử dụng email của người dùng tìm thấy
            String encodedPasswordForComparison = recordManager.csm_encrypt(combinedPasswordInput);
            if (user.getActived() && encodedPasswordForComparison.equals(user.getPassword())) {
                logger.info("Đăng nhập thành công với tài khoản chính (Email): {}", loginIdentifier);
                user.setPermissions(null);
                return Optional.of(user);
            }
        }

        // 2. Nếu không phải Email, thử tìm kiếm tài khoản chính theo Username
        Optional<User> userByUsername = findUserByUsername(loginIdentifier);
        if (userByUsername.isPresent()) {
            User user = userByUsername.get();
            String combinedPasswordInput = user.getUsername() + "_____" + rawPassword; // Sử dụng username của người dùng tìm thấy
            String encodedPasswordForComparison = recordManager.csm_encrypt(combinedPasswordInput);
            if (user.getActived() && encodedPasswordForComparison.equals(user.getPassword())) {
                logger.info("Đăng nhập thành công với tài khoản chính (Username): {}", loginIdentifier);
                user.setPermissions(null);
                return Optional.of(user);
            }
        }

        // 3. Nếu không phải Username, thử tìm kiếm tài khoản chính theo PhoneNumber
        Optional<User> userByPhoneNumber = findUserByPhoneNumber(loginIdentifier);
        if (userByPhoneNumber.isPresent()) {
            User user = userByPhoneNumber.get();
            String combinedPasswordInput = user.getPhoneNumber() + "_____" + rawPassword; // Sử dụng phoneNumber của người dùng tìm thấy
            String encodedPasswordForComparison = recordManager.csm_encrypt(combinedPasswordInput);
            if (user.getActived() && encodedPasswordForComparison.equals(user.getPassword())) {
                logger.info("Đăng nhập thành công với tài khoản chính (Phone Number): {}", loginIdentifier);
                user.setPermissions(null);
                return Optional.of(user);
            }
        }

        // 4. Nếu không phải tài khoản chính, thử tìm kiếm tài khoản con
        SearchFilter subUserFilter = new SearchFilter();
        subUserFilter.setField("login_identifier");
        subUserFilter.setType("eq");
        subUserFilter.setValue(loginIdentifier);
        Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subUserFilter);
        if (subUserRecord != null && !subUserRecord.isEmpty()) {
            // Kiểm tra mật khẩu tài khoản con
            String combinedPasswordInput = loginIdentifier + "_____" + rawPassword;
            String encodedPasswordForComparison = recordManager.csm_encrypt(combinedPasswordInput);
            String subUserPass = (String) subUserRecord.get("pass");
            Boolean actived = (Boolean) subUserRecord.getOrDefault("actived", true);
            if (actived && encodedPasswordForComparison.equals(subUserPass)) {
                Optional<User> parentUserOpt = mapSubUserRecordToUser(subUserRecord);
                if (parentUserOpt.isPresent()) {
                    User user = parentUserOpt.get();
                    logger.info("Đăng nhập thành công với tài khoản con: {}", loginIdentifier);
                    return Optional.of(user);
                }
            }
        }

        logger.info("Đăng nhập thất bại cho định danh: {}", loginIdentifier);
        return Optional.empty();
    }

    private final RecordManager recordManager;
    private static final Logger logger = LoggerFactory.getLogger(UserService.class);
    private static final String CSM_APP_ID = "csm"; // Hằng số cho appId của hệ thống
    private static final String ACCOUNTS_TABLE = "csm_accounts";
    private static final String SUB_ACCOUNTS_TABLE = "csm_group_members"; 
    private static final Gson GSON = new Gson(); // Khởi tạo đối tượng Gson một lần

    @Autowired
    public UserService(RecordManager recordManager) {
        this.recordManager = recordManager;
    }

    /**
     * Cập nhật các trường cho user theo key (email/username/phoneNumber)
     */
    public void updateUserField(String key, String value, Map<String, Object> updateFields) {
        if (key == null || value == null) return;
        SearchFilter filter = new SearchFilter();
        filter.setField(key);
        filter.setType("eq");
        filter.setValue(value);
        // Find the record first
        Map<String, Object> userRecord = recordManager.find("csm", "csm_accounts", filter);
        org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(UserService.class);
        logger.info("[updateUserField] Filter: {}={}, userRecord: {}", key, value, userRecord);
        if (userRecord != null && !userRecord.isEmpty()) {
            // Lấy cấu trúc bảng để biết các trường PK
            SearchFilter tableFilter = new SearchFilter();
            tableFilter.setField("id");
            tableFilter.setType("eq");
            tableFilter.setValue("csm_accounts");
            Map<String, Object> tableStruct = recordManager.find("csm", "index", tableFilter);
            List<String> primaryKeys = null;
            if (tableStruct != null && tableStruct.get("struct") instanceof Map) {
                Map<String, Object> structMap = (Map<String, Object>) tableStruct.get("struct");
                primaryKeys = (List<String>) structMap.get("fieldsPK");
            }
            if (primaryKeys != null) {
                for (String pk : primaryKeys) {
                    // Nếu userRecord thiếu PK, lấy từ filter
                    if (!userRecord.containsKey(pk) || userRecord.get(pk) == null || userRecord.get(pk).toString().isEmpty()) {
                        if (key.equals(pk)) {
                            userRecord.put(pk, value);
                        } else if (updateFields.containsKey(pk)) {
                            userRecord.put(pk, updateFields.get(pk));
                        } else {
                            userRecord.put(pk, "");
                        }
                    }
                }
            }
            // Luôn lấy id từ userRecord (nếu có)
            Object id = userRecord.get("id");
            if (id == null && updateFields.get("id") != null) {
                id = updateFields.get("id");
            }
            if (id == null && userRecord.containsKey("username")) {
                Object userObj = updateFields.get("userObject");
                if (userObj instanceof net.phanmemmottrieu.model.User) {
                    id = ((net.phanmemmottrieu.model.User) userObj).getId();
                }
            }
            if (id == null) {
                logger.warn("[updateUserField] Không xác định được id cho userRecord: {}. Không update.", userRecord);
                return;
            }
            updateFields.put("id", id);
            userRecord.put("id", id);
            logger.info("[updateUserField] id xác định để update: {}", id);
            logger.info("[updateUserField] updateFields cuối cùng: {}", updateFields);
            // Đồng bộ trường refresh theo schema hiện tại ('refresh')
            if (updateFields.containsKey("refresh_token") && updateFields.get("refresh_token") != null) {
                userRecord.put("refresh", updateFields.get("refresh_token"));
            }
            userRecord.putAll(updateFields);
            // Ghi bản ghi với customKey là app_token (mặc định)
            recordManager.createRecord("csm", "csm_accounts", userRecord, java.util.List.of("app_token"));
            // Nếu có refresh (schema hiện tại) hoặc refresh_token, ghi thêm bản ghi alias với customKey là [refresh]
            Object refreshVal = userRecord.get("refresh") != null ? userRecord.get("refresh") : userRecord.get("refresh_token");
            if (refreshVal != null) {
                recordManager.createRecord("csm", "csm_accounts", userRecord, java.util.List.of("refresh"));
            }
            logger.info("[updateUserField] Đã ghi bản ghi với app_token và refresh làm customKey cho user: {}", userRecord.get("username"));
            recordManager.createRecord("csm", "csm_accounts", userRecord);
        }
    }

    /**
     * Tìm user theo refresh token
     */
    public User findUserByRefreshToken(String refreshToken) {
        if (refreshToken == null || refreshToken.isEmpty()) return null;
        SearchFilter filter = new SearchFilter();
        // Schema hiện tại dùng trường 'refresh' (hoặc 'refresh_token')
        filter.setField("refresh_token");
        filter.setType("eq");
        filter.setValue(refreshToken);
        Map<String, Object> userRecord = recordManager.find("csm", "csm_accounts", filter);
        
        // Nếu không tìm thấy với 'refresh_token', thử tìm với 'refresh'
        if (userRecord == null || userRecord.isEmpty()) {
            filter.setField("refresh");
            userRecord = recordManager.find("csm", "csm_accounts", filter);
        }
        
        if (userRecord != null && !userRecord.isEmpty()) {
            // Kiểm tra token chưa hết hạn
            Object expiryObj = userRecord.get("refresh_token_expiry");
            long expiry = 0;
            if (expiryObj instanceof Number) {
                expiry = ((Number) expiryObj).longValue();
            } else if (expiryObj instanceof String) {
                try {
                    expiry = Long.parseLong((String) expiryObj);
                } catch (NumberFormatException e) {
                    logger.warn("[findUserByRefreshToken] Cannot parse refresh_token_expiry: {}", expiryObj);
                    return null;
                }
            }
            
            // Token hết hạn
            if (expiry > 0 && expiry <= System.currentTimeMillis()) {
                logger.warn("[findUserByRefreshToken] Refresh token expired for user {}", userRecord.get("email"));
                return null;
            }
            
            User user = mapRecordToUser(userRecord);
            logger.info("[findUserByRefreshToken] Found user: {} (email: {})", user.getUsername(), user.getEmail());
            return user;
        }
        logger.warn("[findUserByRefreshToken] No user found with refreshToken");
        return null;
    }

    /**
    /**
     * Tìm kiếm người dùng theo app_token (direct key lookup – luôn trả về record mới nhất).
     * Dùng để lấy loginVersion chính xác, tránh stale records từ full scan.
     */
    public Optional<User> findUserByAppToken(String appToken) {
        if (appToken == null || appToken.isEmpty()) return Optional.empty();
        SearchFilter filter = new SearchFilter();
        filter.setField("app_token");
        filter.setType("eq");
        filter.setValue(appToken);
        Map<String, Object> userRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, filter);
        if (userRecord != null && !userRecord.isEmpty()) {
            return Optional.of(mapRecordToUser(userRecord));
        }
        return Optional.empty();
    }

    /**
     * Tìm kiếm người dùng theo email.
     * Kiểm tra cả tài khoản chính và tài khoản con.
     *
     * @param email Email của người dùng.
     * @return Optional chứa đối tượng User nếu tìm thấy, ngược lại là Optional.empty().
     */
    public Optional<User> findUserByEmail(String email) {
        if (email == null || email.isEmpty()) return Optional.empty();

        // 1. Tìm trong bảng tài khoản chính
        SearchFilter emailFilter = new SearchFilter();
        emailFilter.setField("email");
        emailFilter.setType("eq");
        emailFilter.setValue(email);
        Map<String, Object> userRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, emailFilter);
        if (userRecord != null && !userRecord.isEmpty()) {
            return Optional.of(mapRecordToUser(userRecord));
        }
        logger.info("Kiểm tra tài khoản email {} tìm thấy dữ liệu:{}",email,userRecord);
        // 2. Nếu không tìm thấy trong tài khoản chính, tìm trong bảng tài khoản con
        // Giả định email có thể được lưu làm login_identifier của tài khoản con
        SearchFilter subUserEmailFilter = new SearchFilter();
        subUserEmailFilter.setField("login_identifier"); // Định danh đăng nhập của tài khoản con
        subUserEmailFilter.setType("eq");
        subUserEmailFilter.setValue(email);
        Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subUserEmailFilter);

        if (subUserRecord != null && !subUserRecord.isEmpty()) {
            return mapSubUserRecordToUser(subUserRecord);
        }

        return Optional.empty();
    }

    /**
     * Tìm kiếm người dùng theo username.
     * Kiểm tra cả tài khoản chính và tài khoản con.
     *
     * @param username Username của người dùng.
     * @return Optional chứa đối tượng User nếu tìm thấy, ngược lại là Optional.empty().
     */
    public Optional<User> findUserByUsername(String username) {
        if (username == null || username.isEmpty()) return Optional.empty();

        // 1. Tìm trong bảng tài khoản chính
        SearchFilter usernameFilter = new SearchFilter();
        usernameFilter.setField("username");
        usernameFilter.setType("eq");
        usernameFilter.setValue(username);
        Map<String, Object> userRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, usernameFilter);
        logger.info("Kiểm tra tài khoản Username {} tìm thấy dữ liệu:{}",username,userRecord);
        if (userRecord != null && !userRecord.isEmpty()) {
            return Optional.of(mapRecordToUser(userRecord));
        }

        // 2. Nếu không tìm thấy trong tài khoản chính, tìm trong bảng tài khoản con
        // Giả định username có thể được lưu làm login_identifier của tài khoản con
        SearchFilter subUserUsernameFilter = new SearchFilter();
        subUserUsernameFilter.setField("login_identifier");
        subUserUsernameFilter.setType("eq");
        subUserUsernameFilter.setValue(username);
        Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subUserUsernameFilter);

        if (subUserRecord != null && !subUserRecord.isEmpty()) {
            return mapSubUserRecordToUser(subUserRecord);
        }

        return Optional.empty();
    }

    /**
     * Tìm kiếm người dùng theo số điện thoại.
     * Kiểm tra cả tài khoản chính và tài khoản con.
     *
     * @param phoneNumber Số điện thoại của người dùng.
     * @return Optional chứa đối tượng User nếu tìm thấy, ngược lại là Optional.empty().
     */
    public Optional<User> findUserByPhoneNumber(String phoneNumber) {
        if (phoneNumber == null || phoneNumber.isEmpty()) return Optional.empty();

        // 1. Tìm trong bảng tài khoản chính
        SearchFilter phoneFilter = new SearchFilter();
        phoneFilter.setField("phoneNumber");
        phoneFilter.setType("eq");
        phoneFilter.setValue(phoneNumber);
        Map<String, Object> userRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, phoneFilter);
        logger.info("Kiểm tra tài khoản Phone {} tìm thấy dữ liệu:{}",phoneNumber,userRecord);
        if (userRecord != null && !userRecord.isEmpty()) {
            return Optional.of(mapRecordToUser(userRecord));
        }

        // 2. Nếu không tìm thấy trong tài khoản chính, tìm trong bảng tài khoản con
        // Giả định phoneNumber có thể được lưu làm login_identifier của tài khoản con
        SearchFilter subUserPhoneFilter = new SearchFilter();
        subUserPhoneFilter.setField("login_identifier");
        subUserPhoneFilter.setType("eq");
        subUserPhoneFilter.setValue(phoneNumber);
        Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subUserPhoneFilter);

        if (subUserRecord != null && !subUserRecord.isEmpty()) {
            return mapSubUserRecordToUser(subUserRecord);
        }

        return Optional.empty();
    }

    /**
     * Ánh xạ một bản ghi tài khoản con thành đối tượng User.
     * Sẽ tìm tài khoản cha và gán quyền của tài khoản con cho đối tượng User được trả về.
     *
     * @param subUserRecord Bản ghi tài khoản con từ csm_group_members.
     * @return Optional chứa đối tượng User đã được ánh xạ, hoặc Optional.empty() nếu không tìm thấy tài khoản cha.
     */
    private Optional<User> mapSubUserRecordToUser(Map<String, Object> subUserRecord) {
        String parentAccountId = (String) subUserRecord.get("parent_account_id");
        if (parentAccountId == null || parentAccountId.isEmpty()) {
            logger.error("Sub-user record found but missing parent_account_id: {}", subUserRecord);
            return Optional.empty();
        }

        Map<String, Object> parentAccountRecord = null;

        SearchFilter parentAppIdFilter = new SearchFilter();
        parentAppIdFilter.setField("app_id");
        parentAppIdFilter.setType("eq");
        parentAppIdFilter.setValue(parentAccountId);
        parentAccountRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, parentAppIdFilter);
        
        if (parentAccountRecord == null) {
            SearchFilter parentEmailFilter = new SearchFilter();
            parentEmailFilter.setField("email");
            parentEmailFilter.setType("eq");
            parentEmailFilter.setValue(parentAccountId);
            parentAccountRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, parentEmailFilter);
        }
        if (parentAccountRecord == null) {
            SearchFilter parentUsernameFilter = new SearchFilter();
            parentUsernameFilter.setField("username");
            parentUsernameFilter.setType("eq");
            parentUsernameFilter.setValue(parentAccountId);
            parentAccountRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, parentUsernameFilter);
        }
        if (parentAccountRecord == null) {
            SearchFilter parentPhoneFilter = new SearchFilter();
            parentPhoneFilter.setField("phoneNumber");
            parentPhoneFilter.setType("eq");
            parentPhoneFilter.setValue(parentAccountId);
            parentAccountRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, parentPhoneFilter);
        }

        if (parentAccountRecord == null) {
            logger.error("Parent account with ID '{}' not found for sub-user record: {}. Data inconsistency.", parentAccountId, subUserRecord);
            return Optional.empty();
        }

        User user = mapMainAccountToUser(parentAccountRecord, false);

        // Sub-user: Override role to "user" and set menusPermissions from sub-user record
        List<String> subUserRoles = new ArrayList<>();
        subUserRoles.add("user");
        user.setPermissions(subUserRoles);

        // Set menusPermissions from sub-user record
        List<String> subUserMenus = new ArrayList<>();
        Object subUserMenusPermissions = subUserRecord.get("menusPermissions");
        if (subUserMenusPermissions instanceof List) {
            subUserMenus = (List<String>) subUserMenusPermissions;
        }
        
        // If no menus from record, auto-generate from app_id
        if (subUserMenus.isEmpty()) {
            String appId = user.getAppId();
            if (appId != null && !appId.isEmpty()) {
                subUserMenus.add(appId);
                logger.info("[mapSubUserRecordToUser] Auto-generated menusPermissions=[{}] for sub-user {}", appId, user.getEmail());
            }
        }
        
        user.setMenusPermissions(subUserMenus);
        logger.info("[mapSubUserRecordToUser] Sub-user {} assigned role=user with menusPermissions={}", user.getEmail(), subUserMenus);
        
        // Also can get permissions from group if subUserRecord has group_id
        String subUserGroupId = (String) subUserRecord.get("group_id");
        if (subUserGroupId != null) {
            List<Map<String, Object>> parentGroupRights = (List<Map<String, Object>>) parentAccountRecord.getOrDefault("group_rights", new ArrayList<>());
            Optional<Map<String, Object>> matchingGroup = parentGroupRights.stream()
                .filter(g -> subUserGroupId.equals(g.get("group_id")))
                .findFirst();

            if (matchingGroup.isPresent()) {
                Object groupMenuPerms = matchingGroup.get().get("menusPermissions");
                if (groupMenuPerms instanceof List) {
                    user.setMenusPermissions((List<String>) groupMenuPerms);
                }
            } else {
                logger.warn("Sub-user belongs to group '{}' but group not found in parent account's group_rights. Using direct sub-user menusPermissions from record if available.", subUserGroupId);
            }
        }

        return Optional.of(user);
    }

    public User mapRecordToUser(Map<String, Object> userRecord) {
        // Main account from csm_accounts table
        return mapMainAccountToUser(userRecord, true);
    }

    /**
     * Map record từ csm_accounts table thành User object
     * isMainAccount = true: tự động set role = "admin" nếu dev=false
     * isMainAccount = false: không set role (sẽ được set ở sub-user level)
     */
    private User mapMainAccountToUser(Map<String, Object> userRecord, boolean isMainAccount) {
        User user = new User();
        user.setId((String) userRecord.get("id"));
        user.setEmail((String) userRecord.get("email"));
        user.setPassword((String) userRecord.get("pass"));
        user.setUsername((String) userRecord.get("username"));
        user.setPhoneNumber((String) userRecord.get("phoneNumber"));
        user.setActived((Boolean) userRecord.getOrDefault("actived", false));
        user.setAppToken((String) userRecord.get("app_token"));
        
        // Bắt buộc lấy app_id từ app_token (decrypt và trích phần đầu)
        // Format: app_id_____user_id_____role_____access_right
        String appId = null;
        if (user.getAppToken() != null && !user.getAppToken().isEmpty()) {
            try {
                String decryptedToken = recordManager.csm_decrypt(user.getAppToken());
                String[] parts = decryptedToken.split("_____");
                if (parts.length > 0 && !parts[0].isEmpty()) {
                    appId = parts[0];
                    logger.info("[mapMainAccountToUser] Extracted app_id='{}' from app_token for user {}", appId, user.getEmail());
                }
            } catch (Exception e) {
                logger.warn("[mapMainAccountToUser] Error extracting app_id from app_token for user {}: {}", user.getEmail(), e.getMessage());
            }
        }
        user.setAppId(appId);
        
        user.setFullName((String) userRecord.get("full_name"));
        user.setAvatar((String) userRecord.get("avatar"));
        Object addressValue = userRecord.get("user_address");
        // Ánh xạ các trường refresh token
        Object refreshValue = userRecord.get("refresh");
        if (refreshValue == null) {
            refreshValue = userRecord.get("refresh_token");
        }
        user.setRefreshToken((String) refreshValue);
        user.setRefreshTokenIp((String) userRecord.get("refresh_token_ip"));
        user.setRefreshTokenUa((String) userRecord.get("refresh_token_ua"));
        Object expiryObj = userRecord.get("refresh_token_expiry");
        if (expiryObj instanceof Number) {
            user.setRefreshTokenExpiry(((Number) expiryObj).longValue());
        } else if (expiryObj instanceof String) {
            try {
                user.setRefreshTokenExpiry(Long.parseLong((String) expiryObj));
            } catch (Exception e) {
                user.setRefreshTokenExpiry(null);
            }
        } else {
            user.setRefreshTokenExpiry(null);
        }

        if (addressValue == null || (addressValue instanceof String && ((String) addressValue).isEmpty())) {
            // Trường hợp 1: addressValue là null HOẶC một chuỗi rỗng
            user.setUserAddress(""); // Lưu chuỗi rỗng
            logger.info("User address set to empty string (null or empty input).");
        } else if (addressValue instanceof String) {
            // Trường hợp 2: addressValue là một chuỗi (không rỗng)
            user.setUserAddress((String) addressValue);
            logger.info("User address input is a non-empty String.");
        } else if (addressValue instanceof List) {
            logger.info("User address input is a Java List.");
            try {
                // KHÔNG ép kiểu thành Map<String, Object> ở đây.
                // Truyền trực tiếp List vào GSON.toJson().
                // Gson sẽ biết cách chuyển đổi List chứa Map thành JSON Array string.
                String jsonString = GSON.toJson(addressValue);
                user.setUserAddress(jsonString); // Gán chuỗi JSON đã tạo vào userAddress
                logger.info("Converted List to JSON String successfully.");
            } catch (Exception e) { // Bắt Exception chung hơn cho các lỗi toJson()
                // Thông báo lỗi cần phản ánh đúng vấn đề: lỗi khi chuyển đổi List thành JSON.
                logger.error("Error converting List to JSON String: {}", e.getMessage());
                user.setUserAddress("[]"); // Gán một giá trị mặc định an toàn nếu chuyển đổi thất bại
            }
        }

        Object permissionsObj = userRecord.get("permissions");
        List<String> permissions = new ArrayList<>();
        if (permissionsObj instanceof List) {
            permissions = (List<String>) permissionsObj;
            user.setPermissions(permissions);
        } else {
            user.setPermissions(permissions);
        }

        Object menusPermissionsObj = userRecord.get("menusPermissions");
        List<String> menusPermissions = new ArrayList<>();
        if (menusPermissionsObj instanceof List) {
            menusPermissions = (List<String>) menusPermissionsObj;
            user.setMenusPermissions(menusPermissions);
        } else {
            user.setMenusPermissions(menusPermissions);
        }

        Object groupRightsObj = userRecord.get("group_rights");
        if (groupRightsObj instanceof List) {
            user.setGroupRights((List<Map<String, Object>>) groupRightsObj);
        } else {
            user.setGroupRights(new ArrayList<>());
        }

        Object loginVersionObj = userRecord.get("login_version");
        if (loginVersionObj == null) {
            loginVersionObj = userRecord.get("loginVersion");
        }
        if (loginVersionObj instanceof Number) {
            user.setLoginVersion(((Number) loginVersionObj).intValue());
        } else if (loginVersionObj instanceof String) {
            try {
                user.setLoginVersion(Integer.parseInt((String) loginVersionObj));
            } catch (NumberFormatException e) {
                user.setLoginVersion(0);
            }
        } else {
            user.setLoginVersion(0);
        }
        
        // Extract dev privilege from appToken
        boolean isDev = false;
        try {
            String appToken = user.getAppToken();
            if (appToken != null && !appToken.isEmpty()) {
                String decryptedToken = recordManager.csm_decrypt(appToken);
                String[] parts = decryptedToken.split("_____");
                if (parts.length > 0) {
                    String accessRightStr = parts[parts.length - 1];
                    try {
                        int accessRight = Integer.parseInt(accessRightStr);
                        isDev = accessRight > 0;
                    } catch (NumberFormatException e) {
                        logger.warn("[mapMainAccountToUser] Cannot parse accessRight from appToken: {}", accessRightStr);
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("[mapMainAccountToUser] Error decrypting appToken to extract dev flag: {}", e.getMessage());
        }
        user.setDev(isDev);
        
        // Auto-generate permissions and menusPermissions based on user type
        if (isDev) {
            // Dev users: role="dev" (cao hơn admin)
            List<String> devRoles = new ArrayList<>();
            devRoles.add("dev");
            user.setPermissions(devRoles);
            
            // Auto-generate menusPermissions from app_id if empty
            if (permissions.isEmpty()) {
                if (appId != null && !appId.isEmpty()) {
                    List<String> autoMenus = new ArrayList<>();
                    autoMenus.add(appId);
                    user.setMenusPermissions(autoMenus);
                    logger.info("[mapMainAccountToUser] Dev user {} assigned role=dev with auto-menusPermissions=[{}]", user.getEmail(), appId);
                }
            }
        } else if (isMainAccount) {
            // Main account users (csm_accounts): role="admin"
            List<String> adminRoles = new ArrayList<>();
            adminRoles.add("admin");
            user.setPermissions(adminRoles);
            
            // Auto-generate menusPermissions from app_id if empty
            if (menusPermissions.isEmpty()) {
                if (appId != null && !appId.isEmpty()) {
                    List<String> autoMenus = new ArrayList<>();
                    autoMenus.add(appId);
                    user.setMenusPermissions(autoMenus);
                    logger.info("[mapMainAccountToUser] Main account user {} assigned role=admin with auto-menusPermissions=[{}]", user.getEmail(), appId);
                }
            }
        }
        // Sub-users will have their roles set in mapSubUserRecordToUser
        
        return user;
    }

    public RegistrationResponse registerUser(Map<String, Object> userRequest) {
        RegistrationResponse response = new RegistrationResponse();
        response.setSuccess(false);

        String email = (String) userRequest.get("email");
        String username = (String) userRequest.get("username");
        String phone = (String) userRequest.get("phoneNumber");
        String rawPassword = (String) userRequest.get("password");
        String fullName = (String) userRequest.get("full_name");
        String userAddress = (String) userRequest.get("user_address");
        String sourceAppToken = (String) userRequest.get("app_token");

        if ((email == null || email.isEmpty()) && (username == null || username.isEmpty()) && (phone == null || phone.isEmpty())) {
            response.setErrorCode(4);
            response.setErrorErr("Vui lòng cung cấp Email, Tên đăng nhập hoặc Số điện thoại để đăng ký.");
            logger.warn("Registration failed: No identifier provided.");
            return response;
        }
        if (rawPassword == null || rawPassword.isEmpty()) {
            response.setErrorCode(4);
            response.setErrorErr("Mật khẩu không được để trống.");
            logger.warn("Registration failed: Password is empty.");
            return response;
        }

        String primaryLoginIdentifier = null;
        if (email != null && !email.isEmpty()) primaryLoginIdentifier = email;
        else if (username != null && !username.isEmpty()) primaryLoginIdentifier = username;
        else if (phone != null && !phone.isEmpty()) primaryLoginIdentifier = phone;

        if (primaryLoginIdentifier == null || primaryLoginIdentifier.isEmpty()) {
            response.setErrorCode(4);
            response.setErrorErr("Không thể xác định định danh đăng ký chính.");
            logger.error("Internal error: Primary login identifier could not be determined during registration.");
            return response;
        }

        if (email != null && !email.isEmpty() && findUserByEmail(email).isPresent()) {
            response.setErrorCode(2);
            response.setErrorErr("Email này đã được đăng ký.");
            logger.warn("Registration failed: Email already exists - {}", email);
            return response;
        }
        if (username != null && !username.isEmpty() && findUserByUsername(username).isPresent()) {
            response.setErrorCode(2);
            response.setErrorErr("Tên đăng nhập này đã được sử dụng.");
            logger.warn("Registration failed: Username already exists - {}", username);
            return response;
        }
        if (phone != null && !phone.isEmpty() && findUserByPhoneNumber(phone).isPresent()) {
            response.setErrorCode(2);
            response.setErrorErr("Số điện thoại này đã được đăng ký.");
            logger.warn("Registration failed: Phone number already exists - {}", phone);
            return response;
        }

        String newAppToken = UUID.randomUUID().toString();
        String appId = null;
        String commonAccessLevel = "STANDARD_USER";

        try {
            if (sourceAppToken != null && !sourceAppToken.isEmpty()) {
                String decryptedSourceAppToken = recordManager.csm_decrypt(sourceAppToken);
                appId = decryptedSourceAppToken.split("_____")[0];
            } else {
                appId = "ohno";
                logger.warn("No sourceAppToken provided or empty. Using default_app_id: {}", appId);
            }

            String newUserAppTokenRawData = appId + "_____" + primaryLoginIdentifier + "_____" + (email != null && !email.isEmpty() ? email : "no_email") + "_____" + commonAccessLevel;
            newAppToken = recordManager.csm_encrypt(newUserAppTokenRawData);
        } catch (Exception e) {
            logger.error("Error processing app_token for registration: " + e.getMessage());
            response.setErrorCode(3);
            response.setErrorErr("Lỗi xử lý App Token.");
            return response;
        }

        String combinedPasswordInput = primaryLoginIdentifier + "_____" + rawPassword;
        String encryptedPassword = null;
        try {
            encryptedPassword = recordManager.csm_encrypt(combinedPasswordInput);
        } catch (Exception e) {
            logger.error("Error encrypting password during registration: " + e.getMessage());
            response.setErrorCode(3);
            response.setErrorErr("Lỗi mã hóa mật khẩu.");
            return response;
        }

        Map<String, Object> userData = new HashMap<>();
        // Danh sách các trường PK chuẩn cho bảng csm_accounts
        List<String> allPKs = Arrays.asList("email", "username", "phoneNumber", "app_id", "app_token", "id");
        userData.put("email", email);
        userData.put("username", username);
        userData.put("phoneNumber", phone);
        userData.put("pass", encryptedPassword);
        userData.put("full_name", fullName);
        userData.put("user_address", userAddress);
        userData.put("actived", true);
        userData.put("app_token", newAppToken);
        userData.put("app_id", appId);
        userData.put("permissions", Arrays.asList("user"));
        userData.put("menusPermissions", Arrays.asList("home", "profile"));
        userData.put("group_rights", new ArrayList<>());
        userData.put("source_app_token", sourceAppToken);
        // Đảm bảo tất cả các trường PK đều có mặt, nếu thiếu thì set ""
        for (String pk : allPKs) {
            if (!userData.containsKey(pk) || userData.get(pk) == null) {
                userData.put(pk, "");
            }
        }

        try {
            // Nếu không có id rõ ràng, tạo UUID để nhất quán với InitHandler
            if (userData.get("id") == null || ((String) userData.get("id")).isEmpty()) {
                userData.put("id", UUID.randomUUID().toString());
            }

            // Đồng bộ refresh với app_token (giống InitHandler đã làm)
            userData.put("refresh", newAppToken);

            // Ghi alias theo app_token và theo refresh để các truy vấn/tìm kiếm nhanh hoạt động ổn định
            recordManager.createRecord(CSM_APP_ID, ACCOUNTS_TABLE, userData, java.util.List.of("app_token"));
            recordManager.createRecord(CSM_APP_ID, ACCOUNTS_TABLE, userData, java.util.List.of("refresh"));

            // Ghi bản ghi chính (canonical)
            recordManager.createRecord(CSM_APP_ID, ACCOUNTS_TABLE, userData);

            response.setSuccess(true);
            response.setMessage("Đăng ký thành công!");
            logger.info("User registered successfully via identifier: {}", primaryLoginIdentifier);
        } catch (Exception e) {
            logger.error("Error inserting user into database: " + e.getMessage(), e);
            response.setErrorCode(1);
            response.setErrorErr("Lỗi cơ sở dữ liệu trong quá trình đăng ký.");
        }
        return response;
    }

    /**
     * Tạo một tài khoản con mới.
     * Lưu tài khoản con vào bảng SUB_ACCOUNTS_TABLE (csm_group_members)
     * và cập nhật group_rights của tài khoản cha.
     *
     * @param subUserRequest Map chứa thông tin của tài khoản con:
     * - "parent_account_id": ID của tài khoản cha (có thể là app_id, email, username, phone). (BẮT BUỘC)
     * - "login_identifier": Định danh đăng nhập của tài khoản con (phải là duy nhất trong csm_group_members). (BẮT BUỘC)
     * - "raw_password": Mật khẩu thô của tài khoản con. (BẮT BUỘC)
     * - "actived": Trạng thái kích hoạt (true/false, mặc định true).
     * - "group_id": ID nhóm mà tài khoản con thuộc về trong tài khoản cha (tùy chọn).
     * - "permissions": Danh sách quyền hạn trực tiếp cho tài khoản con (tùy chọn, nếu không dùng group_id).
     * - "menusPermissions": Danh sách quyền menu trực tiếp cho tài khoản con (tùy chọn, nếu không dùng group_id).
     * @return RegistrationResponse cho biết thành công hay thất bại.
     */
    public RegistrationResponse createSubUser(Map<String, Object> subUserRequest) {
        RegistrationResponse response = new RegistrationResponse();

        // 1. Kiểm tra các trường bắt buộc
        if (!subUserRequest.containsKey("parent_account_id") ||
            !subUserRequest.containsKey("login_identifier") ||
            !subUserRequest.containsKey("raw_password")) {
            response.setSuccess(false);
            response.setMessage("Thiếu thông tin bắt buộc: parent_account_id, login_identifier, hoặc raw_password.");
            return response;
        }

        String parentAccountId = subUserRequest.get("parent_account_id").toString();
        String loginIdentifier = subUserRequest.get("login_identifier").toString();
        String rawPassword = subUserRequest.get("raw_password").toString();
        String subUserGroupId = (String) subUserRequest.get("group_id");

        // 2. Tìm kiếm tài khoản cha bằng nhiều cách (app_id, email, username, phoneNumber)
        Map<String, Object> parentUserRecord = null;
        
        SearchFilter parentAppIdFilter = new SearchFilter();
        parentAppIdFilter.setField("app_id");
        parentAppIdFilter.setType("eq");
        parentAppIdFilter.setValue(parentAccountId);
        parentUserRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, parentAppIdFilter);
        
        if (parentUserRecord == null) {
            SearchFilter parentEmailFilter = new SearchFilter();
            parentEmailFilter.setField("email");
            parentEmailFilter.setType("eq");
            parentEmailFilter.setValue(parentAccountId);
            parentUserRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, parentEmailFilter);
        }
        if (parentUserRecord == null) {
            SearchFilter parentUsernameFilter = new SearchFilter();
            parentUsernameFilter.setField("username");
            parentUsernameFilter.setType("eq");
            parentUsernameFilter.setValue(parentAccountId);
            parentUserRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, parentUsernameFilter);
        }
        if (parentUserRecord == null) {
            SearchFilter parentPhoneFilter = new SearchFilter();
            parentPhoneFilter.setField("phoneNumber");
            parentPhoneFilter.setType("eq");
            parentPhoneFilter.setValue(parentAccountId);
            parentUserRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, parentPhoneFilter);
        }

        if (parentUserRecord == null || parentUserRecord.isEmpty()) {
            response.setSuccess(false);
            response.setMessage("Tài khoản cha với ID '" + parentAccountId + "' không tồn tại.");
            return response;
        }

        // 3. Kiểm tra tính duy nhất của loginIdentifier cho tài khoản con trong bảng SUB_ACCOUNTS_TABLE
        SearchFilter identifierFilter = new SearchFilter();
        identifierFilter.setField("login_identifier");
        identifierFilter.setType("eq");
        identifierFilter.setValue(loginIdentifier);
        Map<String, Object> existingSubUser = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, identifierFilter);

        if (existingSubUser != null && !existingSubUser.isEmpty()) {
            response.setSuccess(false);
            response.setMessage("Định danh đăng nhập '" + loginIdentifier + "' đã tồn tại cho tài khoản con khác.");
            return response;
        }

        try {
            Map<String, Object> subUserData = new HashMap<>();
            String subUserId = UUID.randomUUID().toString();
            subUserData.put("id", subUserId);
            subUserData.put("parent_account_id", parentAccountId);
            subUserData.put("login_identifier", loginIdentifier);
            subUserData.put("pass", recordManager.csm_encrypt(loginIdentifier + "_____" + rawPassword)); // Mã hóa mật khẩu của tài khoản con
            subUserData.put("actived", subUserRequest.getOrDefault("actived", true)); // Mặc định là true
            subUserData.put("group_id", subUserGroupId); // Lưu group_id vào tài khoản con

            // Xử lý permissions và menusPermissions (nếu được cung cấp trực tiếp cho tài khoản con)
            Object permissionsObj = subUserRequest.get("permissions");
            if (permissionsObj instanceof List) {
                subUserData.put("permissions", permissionsObj);
            } else {
                subUserData.put("permissions", new ArrayList<>());
            }

            Object menusPermissionsObj = subUserRequest.get("menusPermissions");
            if (menusPermissionsObj instanceof List) {
                subUserData.put("menusPermissions", menusPermissionsObj);
            } else {
                subUserData.put("menusPermissions", new ArrayList<>());
            }

            // Các trường khóa chính cho bảng csm_group_members là "id" và "login_identifier"
            // "login_identifier" nên được lập chỉ mục duy nhất để đảm bảo truy vấn hiệu quả
            List<String> primaryKeysSubUser = Arrays.asList("id", "login_identifier");

            String createdId = recordManager.createRecord(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subUserData, primaryKeysSubUser);
            
            // Cập nhật group_rights của tài khoản chính (chỉ cập nhật nếu có group_id và nhóm chưa tồn tại)
            List<Map<String, Object>> groupRights = (List<Map<String, Object>>) parentUserRecord.getOrDefault("group_rights", new ArrayList<>());
            
            Map<String, Object> targetGroup = null;
            if (subUserGroupId != null) { // Chỉ xử lý nếu có group_id
                for (Map<String, Object> group : groupRights) {
                    if (subUserGroupId.equals(group.get("group_id"))) {
                        targetGroup = group;
                        break;
                    }
                }
                if (targetGroup == null) { // Nếu nhóm chưa tồn tại, tạo mới định nghĩa nhóm
                    targetGroup = new HashMap<>();
                    targetGroup.put("group_id", subUserGroupId);
                    targetGroup.put("group_name", "Group " + subUserGroupId); // Tên mặc định
                    targetGroup.put("users", new ArrayList<>()); // Khởi tạo danh sách user rỗng
                    // Thêm quyền mặc định cho nhóm nếu muốn
                    targetGroup.put("permissions", Arrays.asList("default_sub_group_perm"));
                    targetGroup.put("menusPermissions", Arrays.asList("default_sub_group_menu"));
                    groupRights.add(targetGroup);
                }
            }
            
            // LƯU Ý: Không còn thêm tham chiếu tài khoản con vào danh sách 'users' trong 'group_rights' của tài khoản cha.
            // Thông tin chi tiết của tài khoản con nằm hoàn toàn trong bảng csm_group_members.

            // Chỉ cập nhật group_rights của tài khoản cha nếu có thay đổi (ví dụ: một nhóm mới được thêm)
            // Hoặc nếu bạn muốn đảm bảo `group_rights` luôn được lưu lại sau thao tác này
            parentUserRecord.put("group_rights", groupRights);
            
            // Cập nhật bản ghi tài khoản chính trong DB
            List<String> primaryKeysParent = new ArrayList<>();
            if (parentUserRecord.containsKey("email") && parentUserRecord.get("email") != null) primaryKeysParent.add("email");
            else if (parentUserRecord.containsKey("username") && parentUserRecord.get("username") != null) primaryKeysParent.add("username");
            else if (parentUserRecord.containsKey("phoneNumber") && parentUserRecord.get("phoneNumber") != null) primaryKeysParent.add("phoneNumber");
            else if (parentUserRecord.containsKey("app_id") && parentUserRecord.get("app_id") != null) primaryKeysParent.add("app_id");
            else {
                logger.error("Could not determine primary key for parent account update: {}", parentUserRecord);
                response.setSuccess(false);
                response.setMessage("Lỗi nội bộ: Không thể xác định khóa chính tài khoản cha để cập nhật.");
                return response;
            }

            // Dùng updateRecord thay vì createRecord
            recordManager.createRecord(CSM_APP_ID, ACCOUNTS_TABLE, parentUserRecord, primaryKeysParent);

            response.setSuccess(true);
            response.setMessage("Tài khoản con đã được tạo thành công. ID: " + createdId);
        } catch (Exception e) {
            logger.error("Lỗi khi tạo tài khoản con: {}", e.getMessage(), e);
            response.setSuccess(false);
            response.setMessage("Đã xảy ra lỗi trong quá trình tạo tài khoản con: " + e.getMessage());
        }
        return response;
    }
}