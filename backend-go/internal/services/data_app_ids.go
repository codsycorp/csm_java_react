package services

import (
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/util"
)

// ResolveEffectiveDataAppIds mirrors Java UserService.resolveEffectiveDataAppIds.
func ResolveEffectiveDataAppIds(record map[string]any, menuAppID string) []string {
	explicit := model.StringListFromRecord(record, "data_app_ids", "dataAppIds")
	return util.ExcludeMenuAppFromDataAppIDs(explicit, menuAppID)
}
