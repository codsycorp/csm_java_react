package data

import "csm_server/backend-go/internal/model"

// isUnfilteredListQuery is true when the filter does not constrain rows (grid "list all").
func isUnfilteredListQuery(filter model.SearchFilter) bool {
	if filter.HasLike() {
		return false
	}
	return len(extractEqConditions(filter)) == 0
}
