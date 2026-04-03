
package net.phanmemmottrieu.service;

import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.RegistrationResponse;
import net.phanmemmottrieu.model.User;
import net.phanmemmottrieu.util.AppTokenHelper;
import net.phanmemmottrieu.util.PermissionBitfieldUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.util.*;
import java.lang.reflect.Type;

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

        Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, filter);
        if (subUserRecord != null && !subUserRecord.isEmpty()) {
            return mapSubUserRecordToUser(subUserRecord);
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
    private static final String MAIN_ACCOUNT_ROLE = "admin";
    private static final String SUB_USER_ROLE = "user";
    private static final Map<Integer, String> ACTION_BIT_TO_TOKEN = createActionBitToToken();
    private static final Map<Integer, String> MENU_BIT_TO_TOKEN = createMenuBitToToken();

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
            applyUserRecordUpdate(userRecord, key, value, updateFields);
        }
    }

    /**
     * Cập nhật user theo ID để tránh cập nhật nhầm bản ghi theo email/username/phone.
     */
    public void updateUserFieldById(String userId, Map<String, Object> updateFields) {
        if (userId == null || userId.isBlank()) return;
        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue(userId);
        Map<String, Object> userRecord = recordManager.find("csm", "csm_accounts", filter);
        if (userRecord != null && !userRecord.isEmpty()) {
            applyUserRecordUpdate(userRecord, "id", userId, updateFields);
        } else {
            logger.warn("[updateUserFieldById] User not found by id={}", userId);
        }
    }

    private void applyUserRecordUpdate(Map<String, Object> userRecord, String key, String value, Map<String, Object> updateFields) {
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
            logger.warn("[applyUserRecordUpdate] Không xác định được id cho userRecord: {}. Không update.", userRecord);
            return;
        }
        updateFields.put("id", id);
        userRecord.put("id", id);
        logger.info("[applyUserRecordUpdate] id xác định để update: {}", id);

        // Đồng bộ 2 trường refresh/refresh_token cả khi set null để tránh stale session alias.
        if (updateFields.containsKey("refresh_token")) {
            userRecord.put("refresh", updateFields.get("refresh_token"));
        }
        if (updateFields.containsKey("refresh")) {
            userRecord.put("refresh_token", updateFields.get("refresh"));
        }

        userRecord.putAll(updateFields);
        // Ghi bản ghi với customKey là app_token (mặc định)
        recordManager.createRecord("csm", "csm_accounts", userRecord, java.util.List.of("app_token"));

        // Chỉ ghi alias refresh khi còn token hợp lệ (tránh tạo alias rỗng/null).
        Object refreshVal = userRecord.get("refresh") != null ? userRecord.get("refresh") : userRecord.get("refresh_token");
        if (refreshVal != null && !String.valueOf(refreshVal).isBlank()) {
            recordManager.createRecord("csm", "csm_accounts", userRecord, java.util.List.of("refresh"));
        }
        logger.info("[applyUserRecordUpdate] Đã ghi bản ghi với app_token/refresh alias cho user: {}", userRecord.get("username"));
        recordManager.createRecord("csm", "csm_accounts", userRecord);
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

            // Re-fetch canonical record theo app_token để tránh dính stale refresh alias record.
            if (user.getAppToken() != null && !user.getAppToken().isBlank()) {
                Optional<User> canonicalOpt = findUserByAppToken(user.getAppToken());
                if (canonicalOpt.isPresent()) {
                    User canonical = canonicalOpt.get();
                    String canonicalRefresh = canonical.getRefreshToken();
                    if (canonicalRefresh == null || !refreshToken.equals(canonicalRefresh)) {
                        logger.warn("[findUserByRefreshToken] Reject stale refresh token for user {}", canonical.getEmail());
                        return null;
                    }
                    user = canonical;
                }
            }

            logger.info("[findUserByRefreshToken] Found user: {} (email: {})", user.getUsername(), user.getEmail());
            return user;
        }

        // Fallback for sub-user sessions stored in csm_group_members.
        SearchFilter subFilter = new SearchFilter();
        subFilter.setField("refresh_token");
        subFilter.setType("eq");
        subFilter.setValue(refreshToken);
        Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subFilter);

        if (subUserRecord == null || subUserRecord.isEmpty()) {
            subFilter.setField("refresh");
            subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subFilter);
        }

        if (subUserRecord != null && !subUserRecord.isEmpty()) {
            Object expiryObj = subUserRecord.get("refresh_token_expiry");
            long expiry = 0;
            if (expiryObj instanceof Number) {
                expiry = ((Number) expiryObj).longValue();
            } else if (expiryObj instanceof String) {
                try {
                    expiry = Long.parseLong((String) expiryObj);
                } catch (NumberFormatException e) {
                    logger.warn("[findUserByRefreshToken] Cannot parse sub-user refresh_token_expiry: {}", expiryObj);
                    return null;
                }
            }

            if (expiry > 0 && expiry <= System.currentTimeMillis()) {
                logger.warn("[findUserByRefreshToken] Sub-user refresh token expired for login_identifier={}", subUserRecord.get("login_identifier"));
                return null;
            }

            Optional<User> subUserOpt = mapSubUserRecordToUser(subUserRecord);
            if (subUserOpt.isPresent()) {
                User subUser = subUserOpt.get();
                if (subUser.getRefreshToken() == null || !refreshToken.equals(subUser.getRefreshToken())) {
                    logger.warn("[findUserByRefreshToken] Reject stale sub-user refresh token for login_identifier={}", subUserRecord.get("login_identifier"));
                    return null;
                }
                logger.info("[findUserByRefreshToken] Found sub-user by refresh token: {}", subUserRecord.get("login_identifier"));
                return subUser;
            }
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

        Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, filter);
        if (subUserRecord != null && !subUserRecord.isEmpty()) {
            return mapSubUserRecordToUser(subUserRecord);
        }

        return Optional.empty();
    }

    public boolean isSubUserByAppToken(String appToken) {
        if (appToken == null || appToken.isBlank()) {
            return false;
        }
        SearchFilter filter = new SearchFilter();
        filter.setField("app_token");
        filter.setType("eq");
        filter.setValue(appToken);
        Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, filter);
        return subUserRecord != null && !subUserRecord.isEmpty();
    }

    public void updateSessionToken(User user, String refreshToken, String ip, String ua, long expiry, int loginVersion) {
        if (user == null) {
            return;
        }

        Map<String, Object> updateFields = new HashMap<>();
        updateFields.put("refresh_token", refreshToken);
        updateFields.put("refresh", refreshToken);
        updateFields.put("refresh_token_ip", ip);
        updateFields.put("refresh_token_ua", ua);
        updateFields.put("refresh_token_expiry", expiry);
        updateFields.put("login_version", loginVersion);
        updateFields.put("loginVersion", loginVersion);

        String appToken = user.getAppToken();
        if (isSubUserByAppToken(appToken)) {
            SearchFilter filter = new SearchFilter();
            filter.setField("app_token");
            filter.setType("eq");
            filter.setValue(appToken);
            Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, filter);
            if (subUserRecord != null && !subUserRecord.isEmpty()) {
                subUserRecord.putAll(updateFields);
                recordManager.createRecord(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subUserRecord, Arrays.asList("id", "login_identifier"));
            }
            return;
        }

        if (appToken != null && !appToken.isBlank()) {
            SearchFilter filter = new SearchFilter();
            filter.setField("app_token");
            filter.setType("eq");
            filter.setValue(appToken);
            Map<String, Object> accountRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, filter);
            if (accountRecord != null && !accountRecord.isEmpty()) {
                accountRecord.putAll(updateFields);
                recordManager.createRecord(CSM_APP_ID, ACCOUNTS_TABLE, accountRecord, Arrays.asList("app_token"));
                return;
            }
        }

        updateUserFieldById(user.getId(), updateFields);
    }

    public void clearSessionToken(User user) {
        if (user == null) {
            return;
        }

        Map<String, Object> updateFields = new HashMap<>();
        updateFields.put("refresh_token", null);
        updateFields.put("refresh", null);
        updateFields.put("refresh_token_ip", null);
        updateFields.put("refresh_token_ua", null);
        updateFields.put("refresh_token_expiry", null);

        String appToken = user.getAppToken();
        if (isSubUserByAppToken(appToken)) {
            SearchFilter filter = new SearchFilter();
            filter.setField("app_token");
            filter.setType("eq");
            filter.setValue(appToken);
            Map<String, Object> subUserRecord = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, filter);
            if (subUserRecord != null && !subUserRecord.isEmpty()) {
                subUserRecord.putAll(updateFields);
                recordManager.createRecord(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subUserRecord, Arrays.asList("id", "login_identifier"));
            }
            return;
        }

        if (appToken != null && !appToken.isBlank()) {
            SearchFilter filter = new SearchFilter();
            filter.setField("app_token");
            filter.setType("eq");
            filter.setValue(appToken);
            Map<String, Object> accountRecord = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, filter);
            if (accountRecord != null && !accountRecord.isEmpty()) {
                accountRecord.putAll(updateFields);
                recordManager.createRecord(CSM_APP_ID, ACCOUNTS_TABLE, accountRecord, Arrays.asList("app_token"));
                return;
            }
        }

        updateUserFieldById(user.getId(), updateFields);
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

        subUserRecord = ensureSubUserCanonicalFields(subUserRecord, parentAccountRecord);

        User user = mapMainAccountToUser(parentAccountRecord, false);

        // Session and permission isolation: sub-user must keep its own identity,
        // never share the parent id in principal context.
        Object subUserIdObj = subUserRecord.get("id");
        if (subUserIdObj instanceof String subUserId && !subUserId.isBlank()) {
            user.setId(subUserId);
        }
        Object loginIdentifierObj = subUserRecord.get("login_identifier");
        if (loginIdentifierObj instanceof String loginIdentifier && !loginIdentifier.isBlank()) {
            user.setUsername(loginIdentifier);
            if (user.getEmail() == null || user.getEmail().isBlank()) {
                user.setEmail(loginIdentifier);
            }
        }

        Object subEmailObj = subUserRecord.get("email");
        if (subEmailObj instanceof String subEmail && !subEmail.isBlank()) {
            user.setEmail(subEmail);
        }

        Object subUsernameObj = subUserRecord.get("username");
        if (subUsernameObj instanceof String subUsername && !subUsername.isBlank()) {
            user.setUsername(subUsername);
        }

        Object subPhoneObj = subUserRecord.get("phoneNumber");
        if (subPhoneObj instanceof String) {
            user.setPhoneNumber((String) subPhoneObj);
        }

        Object subFullNameObj = subUserRecord.get("full_name");
        if (subFullNameObj instanceof String subFullName && !subFullName.isBlank()) {
            user.setFullName(subFullName);
        }

        Object subAvatarObj = subUserRecord.get("avatar");
        if (subAvatarObj instanceof String subAvatar) {
            user.setAvatar(subAvatar);
        }

        Object subAddressObj = subUserRecord.get("user_address");
        if (subAddressObj instanceof String) {
            user.setUserAddress((String) subAddressObj);
        } else if (subAddressObj instanceof List<?>) {
            user.setUserAddress(GSON.toJson(subAddressObj));
        }

        Object subActivedObj = subUserRecord.get("actived");
        if (subActivedObj instanceof Boolean) {
            user.setActived((Boolean) subActivedObj);
        }

        Object subPassObj = subUserRecord.get("pass");
        if (subPassObj instanceof String) {
            user.setPassword((String) subPassObj);
        }

        user.setGroupRights(toMapListFlexible(subUserRecord.get("group_rights")));

        // Sub-user permissions must be deterministic: bitfield -> (permissions, menus) is source of truth.
        // Add/deny fields are applied as final overlays so persisted rules are always enforced.
        List<String> directPermissions = toStringListFlexible(subUserRecord.get("permissions"));
        List<String> directMenus = toStringListFlexible(subUserRecord.get("menusPermissions"));
        List<String> permissionsAdd = toStringListFlexible(subUserRecord.get("permissionsAdd"));
        List<String> permissionsDeny = toStringListFlexible(subUserRecord.get("permissionsDeny"));
        List<String> menusAdd = toStringListFlexible(subUserRecord.get("menusPermissionsAdd"));
        List<String> menusDeny = toStringListFlexible(subUserRecord.get("menusPermissionsDeny"));

        // Ưu tiên dùng app_token của chính sub-user để phản ánh đúng principal/role trong token.
        Object subAppTokenObj = subUserRecord.get("app_token");
        if (subAppTokenObj instanceof String subAppToken && !subAppToken.isBlank()) {
            user.setAppToken(subAppToken);
            try {
                String[] tokenParts = recordManager.csm_decrypt(subAppToken).split("_____");
                if (tokenParts.length > 0 && tokenParts[0] != null && !tokenParts[0].isBlank()) {
                    user.setAppId(tokenParts[0]);
                }
            } catch (Exception e) {
                logger.warn("[mapSubUserRecordToUser] Cannot parse sub-user app_token for {}: {}", subUserRecord.get("login_identifier"), e.getMessage());
            }
        }

        Object subRefreshObj = subUserRecord.get("refresh");
        if (subRefreshObj instanceof String subRefresh && !subRefresh.isBlank()) {
            user.setRefreshToken(subRefresh);
        } else {
            Object subRefreshTokenObj = subUserRecord.get("refresh_token");
            if (subRefreshTokenObj instanceof String subRefreshToken && !subRefreshToken.isBlank()) {
                user.setRefreshToken(subRefreshToken);
            }
        }

        Object subRefreshIpObj = subUserRecord.get("refresh_token_ip");
        if (subRefreshIpObj instanceof String) {
            user.setRefreshTokenIp((String) subRefreshIpObj);
        }

        Object subRefreshUaObj = subUserRecord.get("refresh_token_ua");
        if (subRefreshUaObj instanceof String) {
            user.setRefreshTokenUa((String) subRefreshUaObj);
        }

        Object subRefreshExpiryObj = subUserRecord.get("refresh_token_expiry");
        if (subRefreshExpiryObj instanceof Number) {
            user.setRefreshTokenExpiry(((Number) subRefreshExpiryObj).longValue());
        } else if (subRefreshExpiryObj instanceof String) {
            try {
                user.setRefreshTokenExpiry(Long.parseLong((String) subRefreshExpiryObj));
            } catch (NumberFormatException ignore) {
                user.setRefreshTokenExpiry(null);
            }
        }

        Object subLoginVersionObj = subUserRecord.get("login_version");
        if (subLoginVersionObj == null) {
            subLoginVersionObj = subUserRecord.get("loginVersion");
        }
        if (subLoginVersionObj instanceof Number) {
            user.setLoginVersion(((Number) subLoginVersionObj).intValue());
        } else if (subLoginVersionObj instanceof String) {
            try {
                user.setLoginVersion(Integer.parseInt((String) subLoginVersionObj));
            } catch (NumberFormatException ignore) {
                user.setLoginVersion(0);
            }
        } else {
            // Never inherit parent loginVersion for sub-user sessions.
            user.setLoginVersion(0);
        }

        Object subPermissionBitfield = subUserRecord.get("permissionBitfield");
        Object subPermissionSchemaVersion = subUserRecord.get("permissionSchemaVersion");
        if (subPermissionSchemaVersion != null) {
            user.setPermissionSchemaVersion(String.valueOf(subPermissionSchemaVersion));
        }
        Object subDataScope = subUserRecord.get("dataScope");
        if (subDataScope != null) {
            user.setDataScope(String.valueOf(subDataScope));
        }
        Object subDeptId = subUserRecord.get("dept_id");
        if (subDeptId != null) {
            user.setDeptId(String.valueOf(subDeptId));
        }
        Object subBranchId = subUserRecord.get("branch_id");
        if (subBranchId != null) {
            user.setBranchId(String.valueOf(subBranchId));
        }
        
        // Resolve sub-user permissions from csm_roles first so system permission groups
        // are authoritative even when legacy parent group_rights is stale.
        String subUserGroupId = (String) subUserRecord.get("group_id");
        if (subUserGroupId != null && !subUserGroupId.isBlank()) {
            Map<String, Object> matchingRole = findRoleByCode(subUserGroupId);
            if (matchingRole != null && !matchingRole.isEmpty()) {
                List<String> rolePerms = toStringListFlexible(matchingRole.get("permissions"));
                if (!rolePerms.isEmpty()) directPermissions = rolePerms;
                List<String> roleMenuPerms = toStringListFlexible(matchingRole.get("menusPermissions"));
                if (!roleMenuPerms.isEmpty()) directMenus = roleMenuPerms;
                logger.info("[mapSubUserRecordToUser] Applied csm_roles permissions for sub-user {} group_id={}", subUserRecord.get("login_identifier"), subUserGroupId);
            }

            List<Map<String, Object>> parentGroupRights = toMapListFlexible(parentAccountRecord.get("group_rights"));
            Optional<Map<String, Object>> matchingGroup = parentGroupRights.stream()
                .filter(g -> subUserGroupId.equals(g.get("group_id")))
                .findFirst();

            if ((directMenus == null || directMenus.isEmpty() || directPermissions == null || directPermissions.isEmpty()) && matchingGroup.isPresent()) {
                List<String> groupPerms = toStringListFlexible(matchingGroup.get().get("permissions"));
                if (!groupPerms.isEmpty()) {
                    directPermissions = groupPerms;
                }
                List<String> groupMenuPerms = toStringListFlexible(matchingGroup.get().get("menusPermissions"));
                if (!groupMenuPerms.isEmpty()) {
                    directMenus = groupMenuPerms;
                }
            } else if (matchingRole == null || matchingRole.isEmpty()) {
                logger.warn("Sub-user belongs to group '{}' but group not found in parent account's group_rights. Using direct sub-user menusPermissions from record if available.", subUserGroupId);
            }
        }

        Long bitfieldFromRecord = parseBitfieldToLong(subPermissionBitfield);
        List<String> effectivePermissions;
        List<String> effectiveMenus;
        if (bitfieldFromRecord != null) {
            effectivePermissions = permissionsFromBitfield(bitfieldFromRecord);
            effectiveMenus = menusFromBitfield(bitfieldFromRecord);
        } else {
            effectivePermissions = new ArrayList<>(directPermissions == null ? Collections.emptyList() : directPermissions);
            effectiveMenus = new ArrayList<>(directMenus == null ? Collections.emptyList() : directMenus);
        }

        effectivePermissions = mergeUniqueCaseInsensitive(effectivePermissions, permissionsAdd);
        effectivePermissions = subtractCaseInsensitive(effectivePermissions, permissionsDeny);
        effectiveMenus = mergeUniqueCaseInsensitive(effectiveMenus, menusAdd);
        effectiveMenus = subtractCaseInsensitive(effectiveMenus, menusDeny);

        // Never elevate sub-user by role token.
        effectivePermissions = subtractCaseInsensitive(effectivePermissions, Arrays.asList("admin", "dev"));
        if (effectivePermissions.isEmpty()) {
            effectivePermissions.add("view");
            effectivePermissions.add("scope:owner");
        }

        user.setPermissions(effectivePermissions);
        user.setMenusPermissions(effectiveMenus);
        logger.info("[mapSubUserRecordToUser] Effective permissions for {} => perms={}, menus={}", subUserRecord.get("login_identifier"), effectivePermissions, effectiveMenus);

        long normalizedBitfield = PermissionBitfieldUtil.buildBitfield(user.getPermissions(), user.getMenusPermissions(), user.getDev());
        user.setPermissionBitfield(String.valueOf(normalizedBitfield));
        user.setPermissionSchemaVersion("v2");
        user.setDataScope(PermissionBitfieldUtil.resolveDataScope(normalizedBitfield));

        return Optional.of(user);
    }

    private Map<String, Object> ensureSubUserCanonicalFields(Map<String, Object> subUserRecord, Map<String, Object> parentAccountRecord) {
        if (subUserRecord == null || subUserRecord.isEmpty()) {
            return subUserRecord;
        }

        boolean changed = false;
        String loginIdentifier = String.valueOf(subUserRecord.getOrDefault("login_identifier", "")).trim();
        String appToken = String.valueOf(subUserRecord.getOrDefault("app_token", "")).trim();

        if (!subUserRecord.containsKey("username") || String.valueOf(subUserRecord.get("username")).isBlank()) {
            subUserRecord.put("username", loginIdentifier);
            changed = true;
        }
        if (!subUserRecord.containsKey("email") || String.valueOf(subUserRecord.get("email")).isBlank()) {
            subUserRecord.put("email", loginIdentifier);
            changed = true;
        }
        if (!subUserRecord.containsKey("phoneNumber")) {
            subUserRecord.put("phoneNumber", "");
            changed = true;
        }
        if (!subUserRecord.containsKey("full_name") || String.valueOf(subUserRecord.get("full_name")).isBlank()) {
            subUserRecord.put("full_name", loginIdentifier);
            changed = true;
        }
        if (!subUserRecord.containsKey("user_address")) {
            subUserRecord.put("user_address", "");
            changed = true;
        }
        if (!subUserRecord.containsKey("avatar")) {
            subUserRecord.put("avatar", "");
            changed = true;
        }
        if (!subUserRecord.containsKey("group_rights")) {
            subUserRecord.put("group_rights", new ArrayList<>());
            changed = true;
        }

        Object refreshTokenObj = subUserRecord.get("refresh_token");
        String refreshToken = refreshTokenObj == null ? "" : String.valueOf(refreshTokenObj).trim();
        Object refreshObj = subUserRecord.get("refresh");
        String refresh = refreshObj == null ? "" : String.valueOf(refreshObj).trim();
        if (refreshToken.isBlank()) {
            subUserRecord.put("refresh_token", !refresh.isBlank() ? refresh : appToken);
            changed = true;
        }
        if (refresh.isBlank()) {
            String normalizedRefreshToken = String.valueOf(subUserRecord.getOrDefault("refresh_token", "")).trim();
            subUserRecord.put("refresh", !normalizedRefreshToken.isBlank() ? normalizedRefreshToken : appToken);
            changed = true;
        }
        if (!subUserRecord.containsKey("refresh_token_ip")) {
            subUserRecord.put("refresh_token_ip", "");
            changed = true;
        }
        if (!subUserRecord.containsKey("refresh_token_ua")) {
            subUserRecord.put("refresh_token_ua", "");
            changed = true;
        }
        if (!subUserRecord.containsKey("refresh_token_expiry")) {
            subUserRecord.put("refresh_token_expiry", 0L);
            changed = true;
        }

        if (!subUserRecord.containsKey("login_version")) {
            Object legacyLoginVersion = subUserRecord.getOrDefault("loginVersion", 0);
            subUserRecord.put("login_version", legacyLoginVersion);
            changed = true;
        }
        if (!subUserRecord.containsKey("loginVersion")) {
            Object canonicalLoginVersion = subUserRecord.getOrDefault("login_version", 0);
            subUserRecord.put("loginVersion", canonicalLoginVersion);
            changed = true;
        }

        if (!subUserRecord.containsKey("source_app_token")) {
            String parentAppToken = String.valueOf(parentAccountRecord.getOrDefault("app_token", ""));
            subUserRecord.put("source_app_token", parentAppToken);
            changed = true;
        }
        if (!subUserRecord.containsKey("app_id") || String.valueOf(subUserRecord.get("app_id")).isBlank()) {
            String parentAppId = String.valueOf(parentAccountRecord.getOrDefault("app_id", ""));
            subUserRecord.put("app_id", parentAppId);
            changed = true;
        }

        if (changed) {
            recordManager.createRecord(CSM_APP_ID, SUB_ACCOUNTS_TABLE, subUserRecord, Arrays.asList("id", "login_identifier"));
        }

        return subUserRecord;
    }

    private Map<String, Object> findRoleByCode(String roleCode) {
        if (roleCode == null || roleCode.isBlank()) {
            return null;
        }

        SearchFilter roleCodeFilter = new SearchFilter();
        roleCodeFilter.setField("role_code");
        roleCodeFilter.setType("eq");
        roleCodeFilter.setValue(roleCode);
        Map<String, Object> roleRecord = recordManager.find(CSM_APP_ID, "csm_roles", roleCodeFilter);
        if (roleRecord != null && !roleRecord.isEmpty()) {
            return roleRecord;
        }

        SearchFilter roleIdFilter = new SearchFilter();
        roleIdFilter.setField("id");
        roleIdFilter.setType("eq");
        roleIdFilter.setValue(roleCode);
        return recordManager.find(CSM_APP_ID, "csm_roles", roleIdFilter);
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

        List<String> permissions = toStringListFlexible(userRecord.get("permissions"));
        user.setPermissions(permissions);

        List<String> menusPermissions = toStringListFlexible(userRecord.get("menusPermissions"));
        user.setMenusPermissions(menusPermissions);

        user.setPermissionBitfield(String.valueOf(userRecord.getOrDefault("permissionBitfield", "")));
        user.setPermissionSchemaVersion(String.valueOf(userRecord.getOrDefault("permissionSchemaVersion", "")));
        user.setDataScope(String.valueOf(userRecord.getOrDefault("dataScope", "")));
        user.setDeptId(String.valueOf(userRecord.getOrDefault("dept_id", "")));
        user.setBranchId(String.valueOf(userRecord.getOrDefault("branch_id", "")));

        user.setGroupRights(toMapListFlexible(userRecord.get("group_rights")));

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
        
        // Set roles based on user type
        if (isDev) {
            // Dev users: role="dev" (cao hơn admin)
            List<String> devRoles = new ArrayList<>();
            devRoles.add("dev");
            user.setPermissions(devRoles);
            // menusPermissions must come from record explicitly
            if (permissions.isEmpty()) {
                logger.warn("[mapMainAccountToUser] Dev user {} has empty permissions from record", user.getEmail());
            }
        } else if (isMainAccount) {
            // Main account users (csm_accounts): role="admin"
            List<String> adminRoles = new ArrayList<>();
            adminRoles.add("admin");
            user.setPermissions(adminRoles);
            // menusPermissions must come from record explicitly
            if (menusPermissions.isEmpty()) {
                logger.warn("[mapMainAccountToUser] Main account user {} has empty menusPermissions from record", user.getEmail());
            }
        }

        long permissionBitfield = PermissionBitfieldUtil.buildBitfield(user.getPermissions(), user.getMenusPermissions(), user.getDev());
        user.setPermissionBitfield(String.valueOf(permissionBitfield));
        user.setPermissionSchemaVersion("v2");
        user.setDataScope(PermissionBitfieldUtil.resolveDataScope(permissionBitfield));
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

        // Chặn trùng định danh với bảng tài khoản con.
        if (identifierExistsInSubAccounts(primaryLoginIdentifier)) {
            response.setErrorCode(2);
            response.setErrorErr("Định danh '" + primaryLoginIdentifier + "' đã tồn tại trong danh sách người dùng con.");
            logger.warn("Registration failed: Identifier already exists in sub accounts - {}", primaryLoginIdentifier);
            return response;
        }

        String newAppToken = UUID.randomUUID().toString();
        String appId = null;

        try {
            if (sourceAppToken != null && !sourceAppToken.isEmpty()) {
                String decryptedSourceAppToken = recordManager.csm_decrypt(sourceAppToken);
                String[] parts = decryptedSourceAppToken.split("_____");
                if (parts.length > 0) {
                    appId = parts[0] != null ? parts[0].trim() : "";
                }
            }

            // Fallback hợp lệ khi không có app_token: nhận app_id trực tiếp từ request.
            if (appId == null || appId.isBlank()) {
                Object appIdObj = userRequest.get("app_id");
                if (appIdObj != null) {
                    appId = String.valueOf(appIdObj).trim();
                }
            }

            if (appId == null || appId.isBlank()) {
                response.setErrorCode(4);
                response.setErrorErr("Thiếu app_id hợp lệ để tạo app_token.");
                logger.warn("Registration failed: missing valid app_id from app_token/app_id field.");
                return response;
            }

            String newUserAppTokenRawData = AppTokenHelper.buildRawToken(
                appId,
                primaryLoginIdentifier,
                MAIN_ACCOUNT_ROLE,
                AppTokenHelper.resolveAccessRight(MAIN_ACCOUNT_ROLE)
            );
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
        userData.put("permissions", Arrays.asList(MAIN_ACCOUNT_ROLE));
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

        // Chặn trùng định danh giữa tài khoản con và tài khoản chính.
        if (identifierExistsInMainAccounts(loginIdentifier)) {
            response.setSuccess(false);
            response.setMessage("Định danh đăng nhập '" + loginIdentifier + "' đã tồn tại trong danh sách người dùng chính.");
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

            Object parentAppTokenValue = parentUserRecord.get("app_token");
            String parentAppToken = parentAppTokenValue instanceof String ? ((String) parentAppTokenValue).trim() : "";
            Object parentAppIdValue = parentUserRecord.get("app_id");
            String parentAppId = parentAppIdValue instanceof String ? ((String) parentAppIdValue).trim() : "";
            if (!parentAppToken.isBlank()) {
                try {
                    String decryptedParentToken = recordManager.csm_decrypt(parentAppToken);
                    String[] tokenParts = decryptedParentToken.split("_____");
                    if (tokenParts.length > 0 && tokenParts[0] != null && !tokenParts[0].isBlank()) {
                        parentAppId = tokenParts[0].trim();
                    }
                } catch (Exception ex) {
                    logger.warn("[createSubUser] Cannot extract app_id from parent app_token: {}", ex.getMessage());
                }
            }

            String subUserAppTokenRawData = AppTokenHelper.buildRawToken(
                parentAppId,
                loginIdentifier,
                SUB_USER_ROLE,
                AppTokenHelper.resolveAccessRight(SUB_USER_ROLE)
            );
            String subUserAppToken = recordManager.csm_encrypt(subUserAppTokenRawData);
            subUserData.put("app_token", subUserAppToken);
            subUserData.put("source_app_token", parentAppToken);
            subUserData.put("refresh", subUserAppToken);
            subUserData.put("refresh_token", subUserAppToken);
            subUserData.put("refresh_token_ip", "");
            subUserData.put("refresh_token_ua", "");
            subUserData.put("refresh_token_expiry", 0L);
            subUserData.put("login_version", 0);
            subUserData.put("loginVersion", 0);
            subUserData.put("email", String.valueOf(subUserRequest.getOrDefault("email", loginIdentifier)));
            subUserData.put("username", String.valueOf(subUserRequest.getOrDefault("username", loginIdentifier)));
            subUserData.put("phoneNumber", String.valueOf(subUserRequest.getOrDefault("phoneNumber", "")));
            subUserData.put("full_name", String.valueOf(subUserRequest.getOrDefault("full_name", loginIdentifier)));
            subUserData.put("user_address", String.valueOf(subUserRequest.getOrDefault("user_address", "")));
            subUserData.put("avatar", String.valueOf(subUserRequest.getOrDefault("avatar", "")));
            subUserData.put("group_rights", new ArrayList<>());

            List<String> permissions = toStringListFlexible(subUserRequest.get("permissions"));
            List<String> menusPermissions = toStringListFlexible(subUserRequest.get("menusPermissions"));
            List<String> permissionsAdd = toStringListFlexible(subUserRequest.get("permissionsAdd"));
            List<String> permissionsDeny = toStringListFlexible(subUserRequest.get("permissionsDeny"));
            List<String> menusPermissionsAdd = toStringListFlexible(subUserRequest.get("menusPermissionsAdd"));
            List<String> menusPermissionsDeny = toStringListFlexible(subUserRequest.get("menusPermissionsDeny"));

            if ((permissions.isEmpty() || menusPermissions.isEmpty()) && subUserGroupId != null && !subUserGroupId.isBlank()) {
                Map<String, Object> roleRecord = findRoleByCode(subUserGroupId);
                if (roleRecord != null && !roleRecord.isEmpty()) {
                    if (permissions.isEmpty()) {
                        permissions = toStringListFlexible(roleRecord.get("permissions"));
                    }
                    if (menusPermissions.isEmpty()) {
                        menusPermissions = toStringListFlexible(roleRecord.get("menusPermissions"));
                    }
                }
            }

            Long providedBitfield = parseBitfieldToLong(subUserRequest.get("permissionBitfield"));
            List<String> effectivePermissions;
            List<String> effectiveMenus;
            if (providedBitfield != null) {
                effectivePermissions = permissionsFromBitfield(providedBitfield);
                effectiveMenus = menusFromBitfield(providedBitfield);
            } else {
                effectivePermissions = new ArrayList<>(permissions);
                effectiveMenus = new ArrayList<>(menusPermissions);
            }

            effectivePermissions = mergeUniqueCaseInsensitive(effectivePermissions, permissionsAdd);
            effectivePermissions = subtractCaseInsensitive(effectivePermissions, permissionsDeny);
            effectiveMenus = mergeUniqueCaseInsensitive(effectiveMenus, menusPermissionsAdd);
            effectiveMenus = subtractCaseInsensitive(effectiveMenus, menusPermissionsDeny);
            effectivePermissions = subtractCaseInsensitive(effectivePermissions, Arrays.asList("admin", "dev"));

            long normalizedBitfield = PermissionBitfieldUtil.buildBitfield(effectivePermissions, effectiveMenus, false);

            subUserData.put("permissions", effectivePermissions);
            subUserData.put("menusPermissions", effectiveMenus);
            subUserData.put("permissionsAdd", permissionsAdd);
            subUserData.put("permissionsDeny", permissionsDeny);
            subUserData.put("menusPermissionsAdd", menusPermissionsAdd);
            subUserData.put("menusPermissionsDeny", menusPermissionsDeny);
            subUserData.put("permissionBitfield", String.valueOf(normalizedBitfield));
            subUserData.put("permissionSchemaVersion", String.valueOf(subUserRequest.getOrDefault("permissionSchemaVersion", "v2")));
            subUserData.put("dataScope", PermissionBitfieldUtil.resolveDataScope(normalizedBitfield));
            subUserData.put("app_id", parentAppId);
            if (subUserRequest.containsKey("dept_id")) subUserData.put("dept_id", subUserRequest.get("dept_id"));
            if (subUserRequest.containsKey("branch_id")) subUserData.put("branch_id", subUserRequest.get("branch_id"));
            if (subUserRequest.containsKey("department_id")) subUserData.put("department_id", subUserRequest.get("department_id"));
            if (subUserRequest.containsKey("team_id")) subUserData.put("team_id", subUserRequest.get("team_id"));

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

    private List<String> toStringListFlexible(Object raw) {
        if (raw == null) {
            return new ArrayList<>();
        }
        if (raw instanceof List<?> rawList) {
            List<String> out = new ArrayList<>();
            for (Object item : rawList) {
                if (item == null) continue;
                String value = String.valueOf(item).trim();
                if (!value.isEmpty()) {
                    out.add(value);
                }
            }
            return out;
        }
        if (raw instanceof String rawStr) {
            String text = rawStr.trim();
            if (text.isEmpty()) {
                return new ArrayList<>();
            }
            try {
                Type type = new TypeToken<List<String>>() {}.getType();
                List<String> parsed = GSON.fromJson(text, type);
                if (parsed != null) {
                    List<String> out = new ArrayList<>();
                    for (String item : parsed) {
                        if (item == null) continue;
                        String value = item.trim();
                        if (!value.isEmpty()) {
                            out.add(value);
                        }
                    }
                    return out;
                }
            } catch (Exception ignore) {
                // fall through
            }
            List<String> out = new ArrayList<>();
            for (String part : text.split("[,;\\n]")) {
                String value = part.trim();
                if (!value.isEmpty()) {
                    out.add(value);
                }
            }
            return out;
        }
        return new ArrayList<>();
    }

    private static Map<Integer, String> createActionBitToToken() {
        Map<Integer, String> map = new HashMap<>();
        map.put(PermissionBitfieldUtil.ACTION_VIEW, "view");
        map.put(PermissionBitfieldUtil.ACTION_EDIT, "edit");
        map.put(PermissionBitfieldUtil.ACTION_CREATE, "create");
        map.put(PermissionBitfieldUtil.ACTION_DELETE, "delete");
        map.put(PermissionBitfieldUtil.ACTION_EXPORT, "export");
        return map;
    }

    private static Map<Integer, String> createMenuBitToToken() {
        Map<Integer, String> map = new HashMap<>();
        map.put(0, "/home");
        map.put(1, "/system/user");
        map.put(2, "/system/role");
        map.put(3, "/system/menu");
        map.put(4, "/system/dept");
        map.put(5, "/system/developer");
        map.put(6, "/system/broadcast");
        map.put(7, "/system/report");
        map.put(8, "/crm");
        return map;
    }

    private Long parseBitfieldToLong(Object raw) {
        if (raw == null) return null;
        try {
            String text = String.valueOf(raw).trim();
            if (text.isEmpty()) return null;
            return Long.parseLong(text);
        } catch (Exception ignore) {
            return null;
        }
    }

    private List<String> permissionsFromBitfield(long bitfield) {
        List<String> out = new ArrayList<>();
        ACTION_BIT_TO_TOKEN.forEach((bit, token) -> {
            if (PermissionBitfieldUtil.hasBit(bitfield, bit)) {
                out.add(token);
            }
        });
        String scope = PermissionBitfieldUtil.resolveDataScope(bitfield);
        switch (scope) {
            case "ALL" -> out.add("scope:all");
            case "BRANCH" -> out.add("scope:branch");
            case "DEPARTMENT" -> out.add("scope:department");
            case "OWNER" -> out.add("scope:owner");
            default -> {
            }
        }
        return out;
    }

    private List<String> menusFromBitfield(long bitfield) {
        List<String> out = new ArrayList<>();
        MENU_BIT_TO_TOKEN.forEach((bit, token) -> {
            if (PermissionBitfieldUtil.hasBit(bitfield, bit)) {
                out.add(token);
            }
        });
        return out;
    }

    private List<String> mergeUniqueCaseInsensitive(List<String> base, List<String> extra) {
        List<String> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (base != null) {
            for (String item : base) {
                if (item == null) continue;
                String value = item.trim();
                if (value.isEmpty()) continue;
                String key = value.toLowerCase(Locale.ROOT);
                if (seen.add(key)) result.add(value);
            }
        }
        if (extra != null) {
            for (String item : extra) {
                if (item == null) continue;
                String value = item.trim();
                if (value.isEmpty()) continue;
                String key = value.toLowerCase(Locale.ROOT);
                if (seen.add(key)) result.add(value);
            }
        }
        return result;
    }

    private List<String> subtractCaseInsensitive(List<String> source, List<String> deny) {
        if (source == null) return new ArrayList<>();
        if (deny == null || deny.isEmpty()) return new ArrayList<>(source);
        Set<String> denySet = new HashSet<>();
        for (String item : deny) {
            if (item == null) continue;
            String value = item.trim();
            if (!value.isEmpty()) {
                denySet.add(value.toLowerCase(Locale.ROOT));
            }
        }
        List<String> result = new ArrayList<>();
        for (String item : source) {
            if (item == null) continue;
            String value = item.trim();
            if (value.isEmpty()) continue;
            if (!denySet.contains(value.toLowerCase(Locale.ROOT))) {
                result.add(value);
            }
        }
        return result;
    }

    private List<Map<String, Object>> toMapListFlexible(Object raw) {
        if (raw == null) {
            return new ArrayList<>();
        }
        if (raw instanceof List<?> rawList) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object item : rawList) {
                if (item instanceof Map<?, ?> rawMap) {
                    Map<String, Object> casted = new HashMap<>();
                    for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                        if (entry.getKey() != null) {
                            casted.put(String.valueOf(entry.getKey()), entry.getValue());
                        }
                    }
                    out.add(casted);
                }
            }
            return out;
        }
        if (raw instanceof String rawStr) {
            String text = rawStr.trim();
            if (text.isEmpty()) {
                return new ArrayList<>();
            }
            try {
                Type type = new TypeToken<List<Map<String, Object>>>() {}.getType();
                List<Map<String, Object>> parsed = GSON.fromJson(text, type);
                return parsed != null ? parsed : new ArrayList<>();
            } catch (Exception ignore) {
                return new ArrayList<>();
            }
        }
        return new ArrayList<>();
    }

    private boolean identifierExistsInSubAccounts(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return false;
        }
        SearchFilter filter = new SearchFilter();
        filter.setField("login_identifier");
        filter.setType("eq");
        filter.setValue(identifier);
        Map<String, Object> row = recordManager.find(CSM_APP_ID, SUB_ACCOUNTS_TABLE, filter);
        return row != null && !row.isEmpty();
    }

    private boolean identifierExistsInMainAccounts(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return false;
        }
        String[] fields = new String[] {"username", "email", "phoneNumber"};
        for (String field : fields) {
            SearchFilter filter = new SearchFilter();
            filter.setField(field);
            filter.setType("eq");
            filter.setValue(identifier);
            Map<String, Object> row = recordManager.find(CSM_APP_ID, ACCOUNTS_TABLE, filter);
            if (row != null && !row.isEmpty()) {
                return true;
            }
        }
        return false;
    }
}