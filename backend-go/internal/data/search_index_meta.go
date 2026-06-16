package data

func (rm *RecordManager) isSearchIndexComplete(appID, tableName string) bool {
	if rm.searchMeta == nil {
		return false
	}
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return false
	}
	return rm.searchMeta.isComplete(app, table)
}

func (rm *RecordManager) markSearchIndexComplete(appID, tableName string, pebbleRows, indexedKeys int) {
	if rm.searchMeta == nil {
		return
	}
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return
	}
	rm.searchMeta.markComplete(app, table, pebbleRows, indexedKeys)
}

func (rm *RecordManager) markSearchIndexIncomplete(appID, tableName string) {
	if rm.searchMeta == nil {
		return
	}
	app, table, err := rm.sanitizeTable(appID, tableName)
	if err != nil {
		return
	}
	rm.searchMeta.markIncomplete(app, table)
}

func (rm *RecordManager) syncSearchIndexCompleteIfAligned(appID, tableName string) {
	if rm.searchMeta == nil || rm.needsSearchReindex(appID, tableName) {
		return
	}
	rm.markSearchIndexComplete(appID, tableName, rm.countPebbleRows(appID, tableName), rm.countEqIndexPebbleKeys(appID, tableName))
}
