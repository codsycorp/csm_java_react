package net.phanmemmottrieu.config;

import org.rocksdb.Options;
import org.rocksdb.Statistics;
import org.rocksdb.StatsLevel;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * RocksDB Performance Optimization Configuration
 * Tuned for high concurrency read/write workloads
 */
@Configuration
public class RocksDBConfig {

    /**
     * Optimized RocksDB options for high performance
     */
    @Bean
    public Options rocksDBOptions() {
        Options options = new Options();
        
        // Create database if missing
        options.setCreateIfMissing(true);
        options.setCreateMissingColumnFamilies(true);
        
        // 🚀 WRITE PERFORMANCE
        options.setMaxWriteBufferNumber(4);              // More memtables for better write throughput
        options.setWriteBufferSize(64 * 1024 * 1024);    // 64MB per memtable
        options.setMinWriteBufferNumberToMerge(2);       // Merge 2 memtables before flush
        
        // 🚀 READ PERFORMANCE
        options.setMaxOpenFiles(1000);                   // Keep more files open
        options.setTableFormatConfig(
            new org.rocksdb.BlockBasedTableConfig()
                .setBlockCache(new org.rocksdb.LRUCache(256 * 1024 * 1024)) // 256MB block cache
                .setBlockSize(16 * 1024)                 // 16KB blocks
                .setCacheIndexAndFilterBlocks(true)      // Cache index/filter in block cache
                .setPinL0FilterAndIndexBlocksInCache(true)
                .setFilterPolicy(new org.rocksdb.BloomFilter(10, false))
        );
        
        // 🚀 COMPACTION
        options.setMaxBackgroundJobs(4);                 // Parallel compaction/flush
        options.setLevel0FileNumCompactionTrigger(4);    // Trigger compaction earlier
        options.setLevel0SlowdownWritesTrigger(20);
        options.setLevel0StopWritesTrigger(36);
        
        // Compression
        options.setCompressionType(org.rocksdb.CompressionType.LZ4_COMPRESSION);
        options.setBottommostCompressionType(org.rocksdb.CompressionType.ZSTD_COMPRESSION);
        
        // 🚀 CONCURRENCY
        options.setIncreaseParallelism(Runtime.getRuntime().availableProcessors());
        options.setAllowConcurrentMemtableWrite(true);
        options.setEnableWriteThreadAdaptiveYield(true);
        
        // Statistics for monitoring
        Statistics stats = new Statistics();
        stats.setStatsLevel(StatsLevel.EXCEPT_DETAILED_TIMERS);
        options.setStatistics(stats);
        
        // WAL optimization
        options.setMaxTotalWalSize(128 * 1024 * 1024);   // 128MB WAL
        options.setWalSizeLimitMB(64);
        
        return options;
    }
}
