package net.phanmemmottrieu.data;

import org.rocksdb.*;

import net.phanmemmottrieu.util.Utils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Properties;

public class RocksDBBackupManager {
    private static final Properties properties;

    static {
        properties = Utils.loadProperties();
        RocksDB.loadLibrary();
    }

    private static final String bucketName = properties.getProperty("oss.bucketName");
    private static final String endpoint = properties.getProperty("oss.endpoint");
    private static final String accessKeyId = properties.getProperty("oss.accessKeyId");
    private static final String accessKeySecret = properties.getProperty("oss.accessKeySecret");

    private final String dbDir;
    private final String backupDir;
    private final String ossPrefix;

    public RocksDBBackupManager(String dbDir, String backupDir, String ossPrefix) {
        this.dbDir = dbDir;
        this.backupDir = backupDir;
        this.ossPrefix = ossPrefix;
    }

    // 🧪 Backup RocksDB to local backup directory
    public void backupToLocal(RocksDB db) throws RocksDBException, IOException {

        Files.createDirectories(Paths.get(backupDir));

        try (BackupEngine backupEngine = BackupEngine.open(Env.getDefault(), new BackupEngineOptions(backupDir))) {
            backupEngine.createNewBackup(db, false);
        }
    }



    // 🔄 Restore the latest backup from local backup directory
    public void restoreFromLocal() throws RocksDBException {
        try (RestoreOptions restoreOptions = new RestoreOptions(false);
             BackupEngine backupEngine = BackupEngine.open(Env.getDefault(), new BackupEngineOptions(backupDir))) {

            backupEngine.restoreDbFromLatestBackup(dbDir, dbDir, restoreOptions);
        }
    }

    // 🧹 Dọn backup cũ, giữ lại N bản mới nhất
    public void purgeOldBackups(int keepLastN) throws RocksDBException {
        try (BackupEngine backupEngine = BackupEngine.open(Env.getDefault(), new BackupEngineOptions(backupDir))) {
            backupEngine.purgeOldBackups(keepLastN);
        }
    }
}