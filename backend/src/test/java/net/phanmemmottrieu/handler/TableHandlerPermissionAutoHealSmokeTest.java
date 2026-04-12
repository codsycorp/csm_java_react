package net.phanmemmottrieu.handler;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.corundumstudio.socketio.SocketIOServer;
import net.phanmemmottrieu.data.RecordManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

class TableHandlerPermissionAutoHealSmokeTest {

    private RecordManager recordManager;
    private TableHandler tableHandler;

    @BeforeEach
    void setUp() {
        recordManager = Mockito.mock(RecordManager.class);
        SocketIOServer socketIOServer = Mockito.mock(SocketIOServer.class);
        tableHandler = new TableHandler(recordManager, socketIOServer);

        when(recordManager.createRecord(anyString(), anyString(), anyMap(), any())).thenReturn("ok");
    }

    @Test
    void autoFillAccounts_shouldPopulatePermissionSchemaAndPersist() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("id", "u-1");
        row.put("permissions", List.of("add", "edit"));
        row.put("menusPermissions", List.of("/system/user"));
        row.put("dept_id", "dept-1");

        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row);

        invokePrivate(
                "autoFillPermissionSchemaValues",
                new Class<?>[]{String.class, String.class, List.class, boolean.class},
                "csm",
                "csm_accounts",
                rows,
                true
        );

        assertEquals("v2", row.get("permissionSchemaVersion"));
        assertTrue(row.containsKey("permissionBitfield"));
        assertFalse(String.valueOf(row.get("permissionBitfield")).isBlank());
        assertTrue(row.containsKey("dataScope"));
        assertFalse(String.valueOf(row.get("dataScope")).isBlank());
        assertEquals("dept-1", row.get("department_id"));
        assertEquals("dept-1", row.get("team_id"));

        verify(recordManager, times(1)).batchUpdateRecords(eq("csm"), eq("csm_accounts"), eq(rows), eq(List.of("id")));
    }

    @Test
    void ensureSchema_shouldAppendMissingPermissionFieldsAndPersistIndexStruct() throws Exception {
        Map<String, Object> structMap = new HashMap<>();
        structMap.put("fields", new ArrayList<>(List.of("id", "username")));

        Map<String, Object> structRecord = new HashMap<>();
        structRecord.put("id", "csm_accounts");
        structRecord.put("struct", structMap);

        invokePrivate(
                "ensureAutoPermissionSchemaForTable",
                new Class<?>[]{String.class, String.class, Map.class, Map.class},
                "csm",
                "csm_accounts",
                structRecord,
                structMap
        );

        Object fieldsObj = structMap.get("fields");
        assertTrue(fieldsObj instanceof List<?>);
        List<?> fields = (List<?>) fieldsObj;
        assertTrue(fields.contains("permissionBitfield"));
        assertTrue(fields.contains("permissionSchemaVersion"));
        assertTrue(fields.contains("dataScope"));

        verify(recordManager, times(1)).createRecord(eq("csm"), eq("index"), eq(structRecord), any());
    }

    @Test
    void ensureTableStructReadyForOperation_shouldAutoInitWhenStructMissing() throws Exception {
        Map<String, Object> objUpdate = new HashMap<>();
        objUpdate.put("id", "role-1");
        objUpdate.put("role_code", "TEST");
        objUpdate.put("role_name", "TEST");

        Object result = invokePrivateWithResult(
                "ensureTableStructReadyForOperation",
                new Class<?>[]{String.class, String.class, Map.class, Map.class},
                "csm",
                "csm_roles",
                null,
                objUpdate
        );

        assertNotNull(result);
        assertTrue(result instanceof Map);

        @SuppressWarnings("unchecked")
        Map<String, Object> structMap = (Map<String, Object>) result;

        Object fieldsPkObj = structMap.get("fieldsPK");
        assertTrue(fieldsPkObj instanceof List<?>);
        List<?> fieldsPk = (List<?>) fieldsPkObj;
        assertTrue(fieldsPk.contains("id"));
        assertTrue(fieldsPk.contains("role_code"));

        Object fieldsObj = structMap.get("fields");
        assertTrue(fieldsObj instanceof List<?>);
        List<?> fields = (List<?>) fieldsObj;
        assertTrue(fields.contains("role_name"));
        assertTrue(fields.contains("permissionBitfield"));

        verify(recordManager, times(1)).createRecord(eq("csm"), eq("index"), anyMap(), any());
    }

    private void invokePrivate(String methodName, Class<?>[] parameterTypes, Object... args) throws Exception {
        Method method = TableHandler.class.getDeclaredMethod(methodName, parameterTypes);
        method.setAccessible(true);
        method.invoke(tableHandler, args);
    }

    private Object invokePrivateWithResult(String methodName, Class<?>[] parameterTypes, Object... args) throws Exception {
        Method method = TableHandler.class.getDeclaredMethod(methodName, parameterTypes);
        method.setAccessible(true);
        return method.invoke(tableHandler, args);
    }
}
