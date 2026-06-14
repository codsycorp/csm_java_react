package security

import (
	"fmt"
	"strings"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/util"
)

// NormalizeDataAppIdsField mirrors Java TableHandler.normalizeDataAppIdsField for csm_accounts writes.
func NormalizeDataAppIdsField(objUpdate map[string]any, access *UserAccessContext) {
	if objUpdate == nil || access == nil {
		return
	}
	menuAppID := stringField(objUpdate["app_id"])
	if menuAppID == "" {
		menuAppID = strings.TrimSpace(access.AppID)
	}

	requested := util.ExcludeMenuAppFromDataAppIDs(
		model.StringListFromRecord(objUpdate, "data_app_ids", "dataAppIds"),
		menuAppID,
	)

	if access.IsDev || strings.EqualFold(access.AppID, "csm") {
		objUpdate["data_app_ids"] = requested
		delete(objUpdate, "dataAppIds")
		return
	}

	parentAllowed := util.ExcludeMenuAppFromDataAppIDs(access.DataAppIDs, access.AppID)
	var resolved []string
	if len(requested) == 0 {
		resolved = append([]string{}, parentAllowed...)
	} else {
		resolved = util.IntersectPreserveOrder(requested, parentAllowed)
	}
	objUpdate["data_app_ids"] = util.ExcludeMenuAppFromDataAppIDs(resolved, menuAppID)
	delete(objUpdate, "dataAppIds")
}

func stringField(v any) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(v))
}
