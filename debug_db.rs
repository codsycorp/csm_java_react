use rocksdb::DB;
use std::path::Path;

fn main() {
    // Mở database để kiểm tra
    let db_paths = [
        "/Volumes/Datas/CSM/csm_server/RustBackend/csm_datas/database/csm_sys_autos",
        "/Volumes/Datas/CSM/csm_server/RustBackend/csm_datas/database/csm_index",
        "/Volumes/Datas/CSM/csm_server/RustBackend/csm_datas/database/default_sys_autos",
    ];
    
    for db_path in &db_paths {
        if Path::new(db_path).exists() {
            println!("Checking database at: {}", db_path);
            
            match DB::open_default(db_path) {
                Ok(db) => {
                    let iter = db.iterator(rocksdb::IteratorMode::Start);
                    let mut count = 0;
                    
                    for item in iter {
                        if let Ok((key, _value)) = item {
                            let key_str = String::from_utf8_lossy(&key);
                            println!("Key: {}", key_str);
                            count += 1;
                            
                            if count > 10 {
                                println!("... (showing first 10 keys)");
                                break;
                            }
                        }
                    }
                    
                    if count == 0 {
                        println!("No data found in this database");
                    } else {
                        println!("Total keys shown: {}", count);
                    }
                }
                Err(e) => {
                    println!("Error opening database {}: {}", db_path, e);
                }
            }
            println!("---");
        } else {
            println!("Database not found: {}", db_path);
        }
    }
}