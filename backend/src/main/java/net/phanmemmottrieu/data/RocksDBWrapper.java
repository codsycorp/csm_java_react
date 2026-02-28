package net.phanmemmottrieu.data;

import org.rocksdb.BlockBasedTableConfig;
import org.rocksdb.BloomFilter;
import org.rocksdb.Options;
import org.rocksdb.RocksDB;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RocksDBWrapper {
    private static final Logger logger = LoggerFactory.getLogger(RocksDBWrapper.class);

    public final RocksDB db;
    public final Options options;
    public final BlockBasedTableConfig tableConfig;
    public final BloomFilter bloomFilter;

    public RocksDBWrapper(RocksDB db, Options options, BlockBasedTableConfig tableConfig, BloomFilter bloomFilter) {
        this.db = db;
        this.options = options;
        this.tableConfig = tableConfig;
        this.bloomFilter = bloomFilter;
    }

    /**
     * Đóng tất cả các tài nguyên native liên quan đến RocksDB.
     * Thứ tự đóng quan trọng: RocksDB trước, sau đó là các tùy chọn cấu hình.
     */
    public void close() {
        try {
            if (db != null) {
                db.close();
                logger.info("RocksDB instance closed successfully.");
            }
        } catch (Exception e) {
            logger.warn("Error closing RocksDB instance: {}", e.getMessage());
        } finally {
            // Đảm bảo đóng tất cả các tài nguyên native liên quan khác,
            // kể cả khi có lỗi khi đóng DB.
            try {
                if (bloomFilter != null) {
                    bloomFilter.close();
                    logger.debug("BloomFilter closed.");
                }
            } catch (Exception e) {
                logger.warn("Error closing BloomFilter: {}", e.getMessage());
            }
            try {
                if (options != null) {
                    options.close();
                    logger.debug("Options closed.");
                }
            } catch (Exception e) {
                logger.warn("Error closing Options: {}", e.getMessage());
            }
        }
    }
}